$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonw = Join-Path $root '.venv\Scripts\pythonw.exe'
$server = Join-Path $root 'server.py'
$launcher = Join-Path $root 'start-server-hidden.vbs'
$taskName = 'FAMIMUEBLES ERP Server'
$startupPath = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupPath 'FAMIMUEBLES ERP.lnk'

if (-not (Test-Path $pythonw)) {
    throw "No se encontro Python del entorno virtual: $pythonw"
}
if (-not (Test-Path $server)) {
    throw "No se encontro el servidor: $server"
}
if (-not (Test-Path $launcher)) {
    throw "No se encontro el lanzador: $launcher"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
$shortcut.Arguments = "//nologo `"$launcher`""
$shortcut.WorkingDirectory = $root
$shortcut.Description = 'Iniciar el servidor local FAMIMUEBLES ERP'
$shortcut.Save()

$action = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$server`"" -WorkingDirectory $root
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$triggerStartup = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances Ignore
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger @($triggerLogon, $triggerStartup) -Settings $settings -Principal $principal -Description 'Servidor ERP FAMIMUEBLES sin ventana de consola.'
$task.Settings.Hidden = $true
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force -ErrorAction Stop | Out-Null
Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
Write-Output "Tarea registrada y servidor iniciado sin consola: $taskName"