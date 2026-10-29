# ScanLog - instala o sincronizador do Protheus neste PC (rodar uma vez).
# Guarda usuario/senha do Protheus e o token criptografados no usuario do
# Windows (so este usuario, neste PC, consegue ler) e agenda seg a sex, 4h.
$ErrorActionPreference = 'Stop'
$Dir = Join-Path $env:LOCALAPPDATA 'ScanLogSync'
$Tarefa = 'ScanLog Sync Protheus'
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'sync.ps1') $Dir -Force

Write-Host ''
Write-Host 'Usuario e senha do Protheus (ficam criptografados so neste PC).'
$u = Read-Host 'Usuario'
$s = Read-Host 'Senha' -AsSecureString
New-Object Management.Automation.PSCredential($u, $s) | Export-Clixml (Join-Path $Dir 'protheus.xml')

# Token que identifica este PC no Supabase. O banco guarda so o sha256 dele.
$tokenFile = Join-Path $Dir 'token.xml'
if (-not (Test-Path $tokenFile)) {
  $b = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  $novo = -join ($b | ForEach-Object { $_.ToString('x2') })
  New-Object Management.Automation.PSCredential('token', (ConvertTo-SecureString $novo -AsPlainText -Force)) | Export-Clixml $tokenFile
}
$tok = (Import-Clixml $tokenFile).GetNetworkCredential().Password
$hash = -join ([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($tok)) | ForEach-Object { $_.ToString('x2') })

$acao = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $Dir 'sync.ps1') + '"')
$quando = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At 4:00am
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 20) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $Tarefa -Action $acao -Trigger $quando -Settings $config `
  -Description 'Copia os produtos do Protheus para o ScanLog (Supabase).' -Force | Out-Null
Write-Host ''
Write-Host "Tarefa '$Tarefa' agendada: seg a sex, 4h. O PC precisa estar ligado e com este usuario logado (tela bloqueada serve)."

# SQL para o Supabase: a migracao (se o arquivo estiver junto) + o hash do token.
$sql = "update protheus_priv.config set token_hash = '$hash';"
$mig = Join-Path $PSScriptRoot '0007_protheus.sql'
if (Test-Path $mig) { $sql = (Get-Content $mig -Raw -Encoding UTF8) + "`r`n" + $sql }
Set-Clipboard -Value $sql
Write-Host ''
Write-Host 'O SQL ja esta copiado. Abra o Supabase > SQL Editor, cole (Ctrl+V) e clique Run.'
Read-Host 'Depois de rodar no Supabase, aperte Enter para um teste rapido (8 paginas, 1 a 2 minutos)' | Out-Null

& (Join-Path $Dir 'sync.ps1') -Teste
Write-Host ''
Write-Host "Pronto. Log em $Dir\sync.log"
