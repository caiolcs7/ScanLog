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
# Cada consulta leva ~50 s no servidor; varias ao mesmo tempo. De madrugada
# ninguem usa o Protheus, entao vai com mais.
$Juntas = $(if ((Get-Date).Hour -lt 6) { 16 } else { 8 })
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

# Paginas que vieram 100% bloqueadas ficam anotadas em bloqueadas.json. De terca
# a sexta (leitura rapida) elas nao sao baixadas; na segunda le tudo de novo,
# para pegar quem foi desbloqueado, e so a leitura completa apaga codigos.
$MapaFile = Join-Path $Dir 'bloqueadas.json'
$Hoje = [int][Math]::Floor((Get-Date).ToOADate())
$Rapida = (-not $Teste) -and ((Get-Date).DayOfWeek -ne 'Monday') -and (Test-Path $MapaFile)
$mapa = @{}
if (Test-Path $MapaFile) {
  try {
    $o = Get-Content $MapaFile -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($pr in $o.PSObject.Properties) { $mapa[$pr.Name] = $pr.Value }
  } catch { $mapa = @{}; $Rapida = $false }
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

# Baixa varias paginas ao mesmo tempo: mantem $Juntas consultas rodando e,
# quando uma termina, ja comeca a proxima (uma pagina lenta nao segura as
# outras). Uma tentativa so: falha aqui e quase sempre registro com defeito, e
# quem chama divide a pagina. Usa curl.exe porque o servidor responde 204 com
# corpo, e o Invoke-RestMethod recusa isso. Devolve @{ "pagina-tamanho" = json }.
function Baixar($pedidos) {
  $res = @{}
  $fila = New-Object System.Collections.Queue
  foreach ($q in $pedidos) { $fila.Enqueue($q) }
  $ativos = New-Object System.Collections.ArrayList
  while ($fila.Count -or $ativos.Count) {
    while ($ativos.Count -lt $Juntas -and $fila.Count) {
      $q = $fila.Dequeue()
      $f = Join-Path $Tmp ((Chave $q) + '.json')
      Remove-Item $f -ErrorAction SilentlyContinue
      $url = $Protheus + '?Page=' + $q.p + '&pageSize=' + $q.s
      $proc = Start-Process curl.exe -WindowStyle Hidden -PassThru `
        -ArgumentList @('-s', '-m', '240', '-H', "`"@$CabFile`"", '-o', "`"$f`"", "`"$url`"")
      [void]$ativos.Add(@{ q = $q; proc = $proc; f = $f })
    }
    Start-Sleep -Milliseconds 300
    foreach ($a in @($ativos)) {
      if ($a.proc.HasExited) {
        $j = Ler $a.f
        if ($j) { $res[(Chave $a.q)] = $j }
        $ativos.Remove($a)
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
Log ('=== inicio' + $(if ($Teste) { ' (teste)' } else { '' }) + $(if ($Rapida) { ' (rapida: pula paginas so com bloqueados)' } else { '' }) + ", $Juntas consultas por vez")
try {
  $execucao = Supabase 'protheus_iniciar' @{ p_token = $token }
} catch {
  Log "ERRO ao abrir no Supabase: $($_.Exception.Message)"
  exit 1
}

$completo = $false
try {
  # Paginas de 100 em blocos de 2x$Juntas. As que falham ficam para o fim e
  # la sao divididas de 10 em 10 e depois de 1 em 1, pulando so o item com
  # defeito.
  $pagina = 1
  $vazias = 0
  $iniVaz = 0
  $pulou = 0
  $fim = $null
  $falhas = New-Object System.Collections.ArrayList
  while ($true) {
    $n = 2 * $Juntas
    # Proximas $n paginas a baixar (na leitura rapida, sem as so de bloqueados).
    $bloco = @()
    $pp = $pagina
    while ($bloco.Count -lt $n -and $pp -lt $pagina + 5000) {
      if ($Rapida -and $mapa.ContainsKey("$pp")) { $pulou++ } else { $bloco += @{ p = $pp; s = $Tamanho } }
      $pp++
    }
    if ($bloco.Count -eq 0) { $pagina = $pp; continue }
    $res = Baixar $bloco
    foreach ($q in $bloco) {
      $j = $res[(Chave $q)]
      if ($j) {
        Guardar $j
        $livre = @($j.Produtos | Where-Object { ([string]$_.Produto).Trim() -and ([string]$_.Bloqueado) -notlike 'S*' }).Count
        if ($livre -eq 0 -and $j.hasNext) { $mapa["$($q.p)"] = $Hoje } else { $mapa.Remove("$($q.p)") }
        if (-not $j.hasNext -and ($null -eq $fim -or $q.p -lt $fim)) { $fim = $q.p }
      } else { $mapa.Remove("$($q.p)"); [void]$falhas.Add($q) }
    }
    Log "ate a pagina $($pp - 1): $($script:lidos) lidos, $($script:gravados) gravados, $pulou paginas puladas, $($falhas.Count) paginas para dividir"
    if ($null -ne $fim -or $Teste) { break }
    if ($res.Count -eq 0) {
      # Nada veio: fim da lista ou Protheus fora do ar.
      if ($vazias -eq 0) { $iniVaz = $bloco[0].p }
      $vazias++
      if ($vazias -ge 2) { break }
    } else { $vazias = 0 }
    $pagina = $pp
  }
  $falhas = @($falhas | Where-Object { $null -eq $fim -or $_.p -lt $fim })
  # Os dois ultimos blocos vazios (fim da lista ou Protheus fora) nao sao
  # paginas com defeito.
  if ($vazias -ge 2) { $falhas = @($falhas | Where-Object { $_.p -lt $iniVaz }) }
  if ($Teste) { $falhas = @() }
  if ($falhas.Count) {
    Log ("dividindo " + $falhas.Count + " paginas: " + (($falhas | ForEach-Object { $_.p }) -join ', '))
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
  $completo = $null -ne $fim
  Enviar
  if ($completo -and -not $Teste) {
    [IO.File]::WriteAllText($MapaFile, ($mapa | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
  }
} catch {
  Log "ERRO: $($_.Exception.Message)"
  $completo = $false
}
Remove-Item $CabFile -ErrorAction SilentlyContinue

try {
  $removidos = Supabase 'protheus_finalizar' @{
    # Leitura rapida nunca apaga codigos (um codigo que mudou de pagina poderia
    # cair numa pagina pulada); quem apaga e a leitura completa de segunda.
    p_token = $token; p_execucao = $execucao; p_completo = ($completo -and -not $Teste -and -not $Rapida)
    p_lidos = $script:lidos; p_pulados = $script:pulados
  }
} catch {
  Log "ERRO ao fechar no Supabase: $($_.Exception.Message)"
  exit 1
}
$min = [int]((Get-Date) - $inicio).TotalMinutes
Log ("=== fim em $min min: $($script:lidos) lidos, $($script:gravados) gravados, $($script:pulados) pulados, $removidos removidos, completo=$completo" + $(if ($Rapida) { ' (rapida)' } else { '' }))
if (-not $completo -and -not $Teste) { exit 2 }
