$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonw = Join-Path $root '.venv\Scripts\pythonw.exe'
$server = Join-Path $root 'server.py'
$taskName = 'FAMIMUEBLES ERP Server'

if (-not (Test-Path $pythonw)) {
    throw "No se encontro Python del entorno virtual: $pythonw"
}
if (-not (Test-Path $server)) {
    throw "No se encontro el servidor: $server"
}

Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$server*" } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

$action = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$server`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances Ignore
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Servidor ERP FAMIMUEBLES sin ventana de consola.'
$task.Settings.Hidden = $true
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force -ErrorAction Stop | Out-Null
Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
Write-Output "Tarea registrada y servidor iniciado sin consola: $taskName"