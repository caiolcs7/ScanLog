@echo off
rem Atualiza o sincronizador ja instalado (nao pede senha de novo) e roda um teste rapido.
copy /Y "%~dp0sync.ps1" "%LOCALAPPDATA%\ScanLogSync\sync.ps1" >nul || (echo Nao achei a instalacao. Rode o instalar.bat. & pause & exit /b 1)
powershell -NoProfile -Command "Set-ScheduledTask -TaskName 'ScanLog Sync Protheus' -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 12:30am) | Out-Null; Write-Host 'Horario da tarefa: seg a sex, 0h30.'"
echo Atualizado. Rodando um teste rapido (1 a 2 minutos)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\ScanLogSync\sync.ps1" -Teste
pause
