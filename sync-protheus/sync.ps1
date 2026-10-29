# ScanLog - copia os produtos do Protheus para o Supabase.
# Roda pela tarefa agendada "ScanLog Sync Protheus" (seg a sex, 4h).
# Manual: powershell -ExecutionPolicy Bypass -File sync.ps1 [-Teste]
# -Teste le so 3 paginas e nunca apaga nada.
# (Arquivo so com ASCII: o PowerShell 5.1 le .ps1 sem BOM como ANSI.)
param([switch]$Teste)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Dir = Join-Path $env:LOCALAPPDATA 'ScanLogSync'
$Protheus = 'http://10.10.10.3:8600/rest/MACWS009/consultar/produto'
$Supabase = 'https://pygedyytlcplfweibenv.supabase.co/rest/v1/rpc/'
$Chave = 'sb_publishable_Wo0BJpc1B3O8Feog9to3yQ_PcBZfNcQ'
$Tamanho = 100   # paginas de 500 ou mais o servidor devolve vazias
$Lote = 500      # itens por envio ao Supabase

$LogFile = Join-Path $Dir 'sync.log'
if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 2MB) { Move-Item $LogFile "$LogFile.old" -Force }
function Log([string]$m) {
  $l = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $m
  Add-Content -Path $LogFile -Value $l -Encoding UTF8
  Write-Host $l
}

$cred = Import-Clixml (Join-Path $Dir 'protheus.xml')
$token = (Import-Clixml (Join-Path $Dir 'token.xml')).GetNetworkCredential().Password
$basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($cred.UserName + ':' + $cred.GetNetworkCredential().Password))
$tmp = Join-Path $Dir 'pagina.json'

function Supabase([string]$funcao, $corpo) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($corpo | ConvertTo-Json -Depth 5 -Compress))
  for ($t = 1; ; $t++) {
    try {
      return Invoke-RestMethod -Method Post -Uri ($Supabase + $funcao) -Headers @{ apikey = $Chave } `
        -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 120
    } catch {
      if ($t -ge 4) { throw }
      Log "Supabase $funcao falhou ($($_.Exception.Message)), tentando de novo"
      Start-Sleep -Seconds (30 * $t)
    }
  }
}

# Uma pagina do Protheus, ou $null se nao veio. Usa curl.exe porque o servidor
# responde 204 com corpo, e o Invoke-RestMethod recusa isso.
function Pagina([int]$pagina, [int]$tamanho) {
  for ($t = 1; $t -le 2; $t++) {
    Remove-Item $tmp -ErrorAction SilentlyContinue
    & curl.exe -s -m 240 -H ('Authorization: Basic ' + $basic) -o $tmp ($Protheus + '?Page=' + $pagina + '&pageSize=' + $tamanho)
    if (Test-Path $tmp) {
      try {
        $j = Get-Content $tmp -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($j -and $j.Produtos) { return $j }
      } catch { }
    }
  }
  return $null
}

$itens = New-Object System.Collections.Generic.List[object]
$script:lidos = 0
$script:pulados = 0
$script:gravados = 0

function Enviar {
  if ($itens.Count -eq 0) { return }
  $n = Supabase 'protheus_gravar' @{ p_token = $token; p_execucao = $execucao; p_itens = $itens.ToArray() }
  $script:gravados += [int]$n
  $itens.Clear()
}

# So entram codigos desbloqueados.
function Guardar($j) {
  foreach ($p in $j.Produtos) {
    $script:lidos++
    $codigo = ([string]$p.Produto).Trim()
    if (-not $codigo -or ([string]$p.Bloqueado) -like 'S*') { continue }
    $itens.Add(@{
      codigo = $codigo
      descricao = [string]$p.Descricao
      tipo = [string]$p.Tipo
      unidade = [string]$p.UnMedida
      saldo_estoque = $p.SaldoEstoque
      saldo_compra = $p.SaldoCompra
      saldo_solicitacao = $p.SaldoSolicitacao
      custo = $p.Custo
      moeda = [string]$p.Moeda
      fab_importado = [string]$p.'Fab.Importado'
      fab_nacional = [string]$p.'Fab.Nacional'
      ponto_pedido = $p.PontoPedido
      lote_economico = $p.LoteEconomico
      prazo_entrega = $p.PrazoEntrega
    })
  }
  if ($itens.Count -ge $Lote) { Enviar }
}

$inicio = Get-Date
Log ('=== inicio' + $(if ($Teste) { ' (teste)' } else { '' }))
try {
  $execucao = Supabase 'protheus_iniciar' @{ p_token = $token }
} catch {
  Log "ERRO ao abrir no Supabase: $($_.Exception.Message)"
  exit 1
}

$completo = $false
try {
  $pagina = 1
  $vazias = 0
  while ($true) {
    if ($Teste -and $pagina -gt 3) { break }
    $j = Pagina $pagina $Tamanho
    if ($j) {
      Guardar $j
      $vazias = 0
      if (-not $j.hasNext) { $completo = $true; break }
    } else {
      # Pode ser um registro com defeito: tenta de 10 em 10, e as de 10 que
      # falharem, de 1 em 1, pulando so o item que nao vem.
      Log "pagina $pagina falhou, dividindo"
      $base = ($pagina - 1) * 10
      $ok = 0
      $fim = $false
      $falhas = @()
      for ($q = $base + 1; $q -le $base + 10; $q++) {
        $s = Pagina $q 10
        if ($s) {
          Guardar $s
          $ok++
          if (-not $s.hasNext) { $fim = $true; break }
        } else { $falhas += $q }
      }
      if ($ok -eq 0) {
        # Nada veio: fim da lista ou Protheus fora do ar.
        $vazias++
        Log "pagina $pagina sem nenhum item ($vazias)"
        if ($vazias -ge 2) { break }
      } else {
        $vazias = 0
        foreach ($q in $falhas) {
          for ($i = ($q - 1) * 10 + 1; $i -le $q * 10; $i++) {
            $u = Pagina $i 1
            if ($u) { Guardar $u } else { $script:pulados++; Log "item $i pulado (Protheus nao devolve)" }
          }
        }
        if ($fim) { $completo = $true; break }
      }
    }
    if ($pagina % 10 -eq 0) { Log "pagina ${pagina}: $($script:lidos) lidos, $($script:gravados) gravados" }
    $pagina++
  }
  Enviar
} catch {
  Log "ERRO: $($_.Exception.Message)"
  $completo = $false
}

try {
  $removidos = Supabase 'protheus_finalizar' @{
    p_token = $token; p_execucao = $execucao; p_completo = ($completo -and -not $Teste)
    p_lidos = $script:lidos; p_pulados = $script:pulados
  }
} catch {
  Log "ERRO ao fechar no Supabase: $($_.Exception.Message)"
  exit 1
}
$min = [int]((Get-Date) - $inicio).TotalMinutes
Log "=== fim em $min min: $($script:lidos) lidos, $($script:gravados) gravados, $($script:pulados) pulados, $removidos removidos, completo=$completo"
if (-not $completo -and -not $Teste) { exit 2 }
