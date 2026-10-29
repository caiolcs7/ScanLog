# ScanLog - copia os produtos do Protheus para o Supabase.
# Roda pela tarefa agendada "ScanLog Sync Protheus" (seg a sex, 4h).
# Manual: powershell -ExecutionPolicy Bypass -File sync.ps1 [-Teste]
# -Teste le so as primeiras paginas e nunca apaga nada.
# (Arquivo so com ASCII: o PowerShell 5.1 le .ps1 sem BOM como ANSI.)
param([switch]$Teste)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Dir = Join-Path $env:LOCALAPPDATA 'ScanLogSync'
$Protheus = 'http://10.10.10.3:8600/rest/MACWS009/consultar/produto'
$Supabase = 'https://pygedyytlcplfweibenv.supabase.co/rest/v1/rpc/'
$Chave = 'sb_publishable_Wo0BJpc1B3O8Feog9to3yQ_PcBZfNcQ'
$Tamanho = 100   # paginas de 500 ou mais o servidor devolve vazias
$Juntas = 8      # cada consulta leva ~50 s no servidor; varias ao mesmo tempo
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
$Tmp = Join-Path $Dir 'paginas'
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null
# O cabecalho com a senha vai num arquivo (curl -H @arquivo), e nao na linha de
# comando, que outros programas do PC conseguem ver.
$CabFile = Join-Path $Tmp 'cabecalho.txt'
$basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($cred.UserName + ':' + $cred.GetNetworkCredential().Password))
[IO.File]::WriteAllText($CabFile, "Authorization: Basic $basic`r`n")

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

function Chave($q) { "$($q.p)-$($q.s)" }

function Ler([string]$f) {
  if (-not (Test-Path $f)) { return $null }
  try {
    $j = Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j -and $j.Produtos) { return $j }
  } catch { }
  return $null
}

# Baixa varias paginas ao mesmo tempo ($Juntas por vez), com uma segunda
# tentativa para as que falharem. Usa curl.exe porque o servidor responde 204
# com corpo, e o Invoke-RestMethod recusa isso. Devolve @{ "pagina-tamanho" = json }.
function Baixar($pedidos) {
  $res = @{}
  for ($t = 1; $t -le 2; $t++) {
    $pend = @($pedidos | Where-Object { -not $res.ContainsKey((Chave $_)) })
    if ($pend.Count -eq 0) { break }
    for ($i = 0; $i -lt $pend.Count; $i += $Juntas) {
      $grupo = @($pend[$i..([Math]::Min($i + $Juntas, $pend.Count) - 1)])
      $procs = foreach ($q in $grupo) {
        $f = Join-Path $Tmp ((Chave $q) + '.json')
        Remove-Item $f -ErrorAction SilentlyContinue
        $url = $Protheus + '?Page=' + $q.p + '&pageSize=' + $q.s
        Start-Process curl.exe -WindowStyle Hidden -PassThru `
          -ArgumentList @('-s', '-m', '240', '-H', "`"@$CabFile`"", '-o', "`"$f`"", "`"$url`"")
      }
      $procs | Wait-Process
      foreach ($q in $grupo) {
        $j = Ler (Join-Path $Tmp ((Chave $q) + '.json'))
        if ($j) { $res[(Chave $q)] = $j }
      }
    }
  }
  return $res
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
Log ('=== inicio' + $(if ($Teste) { ' (teste)' } else { '' }) + ", $Juntas consultas por vez")
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
    $bloco = @($pagina..($pagina + $Juntas - 1) | ForEach-Object { @{ p = $_; s = $Tamanho } })
    $res = Baixar $bloco
    $fim = $null
    foreach ($q in $bloco) {
      $j = $res[(Chave $q)]
      if ($j) {
        Guardar $j
        if (-not $j.hasNext -and ($null -eq $fim -or $q.p -lt $fim)) { $fim = $q.p }
      }
    }
    # Paginas que falharam antes do fim da lista: pode ser um registro com
    # defeito. Tenta de 10 em 10, e as de 10 que falharem, de 1 em 1, pulando
    # so o item que nao vem.
    $falhas = @($bloco | Where-Object { -not $res.ContainsKey((Chave $_)) -and ($null -eq $fim -or $_.p -lt $fim) })
    if ($falhas.Count -eq $bloco.Count) {
      # Nada veio: fim da lista ou Protheus fora do ar.
      $vazias++
      Log "paginas $pagina a $($pagina + $Juntas - 1) sem nenhum item ($vazias)"
      if ($vazias -ge 2) { break }
      $pagina += $Juntas
      continue
    }
    $vazias = 0
    if ($falhas.Count) {
      Log ("paginas que falharam, dividindo: " + (($falhas | ForEach-Object { $_.p }) -join ', '))
      $subs = @(foreach ($f in $falhas) { foreach ($k in 1..10) { @{ p = ($f.p - 1) * 10 + $k; s = 10 } } })
      $rs = Baixar $subs
      $unid = @()
      foreach ($f in $falhas) {
        $irmas = @($subs | Where-Object { [Math]::Ceiling($_.p / 10) -eq $f.p })
        $ok = @($irmas | Where-Object { $rs.ContainsKey((Chave $_)) })
        foreach ($q in $ok) { Guardar $rs[(Chave $q)] }
        # Se nenhuma de 10 veio, a pagina inteira esta depois do fim da lista.
        if ($ok.Count -eq 0) { continue }
        foreach ($q in $irmas) {
          if (-not $rs.ContainsKey((Chave $q))) {
            $unid += @(foreach ($k in 1..10) { @{ p = ($q.p - 1) * 10 + $k; s = 1 } })
          }
        }
      }
      if ($unid.Count) {
        $ru = Baixar $unid
        foreach ($q in $unid) {
          if ($ru.ContainsKey((Chave $q))) { Guardar $ru[(Chave $q)] }
          else { $script:pulados++; Log "item $($q.p) pulado (Protheus nao devolve)" }
        }
      }
    }
    Log "ate a pagina $($pagina + $Juntas - 1): $($script:lidos) lidos, $($script:gravados) gravados"
    if ($null -ne $fim) { $completo = $true; break }
    if ($Teste) { break }
    $pagina += $Juntas
  }
  Enviar
} catch {
  Log "ERRO: $($_.Exception.Message)"
  $completo = $false
}
Remove-Item $CabFile -ErrorAction SilentlyContinue

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
