$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonw = Join-Path $root '.venv\Scripts\pythonw.exe'
$server = Join-Path $root 'server.py'
$taskName = 'FAMIMUEBLES ERP Server'
$startupPath = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupPath 'FAMIMUEBLES ERP.lnk'

if (-not (Test-Path $pythonw)) {
    throw "No se encontro Python del entorno virtual: $pythonw"
}
if (-not (Test-Path $server)) {
    throw "No se encontro el servidor: $server"
}

$action = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$server`"" -WorkingDirectory $root
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances Ignore
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger $triggerLogon -Settings $settings -Principal $principal -Description 'Servidor ERP FAMIMUEBLES sin ventana de consola.'
$task.Settings.Hidden = $true

if (Test-Path $shortcutPath) {
    $shell = New-Object -ComObject WScript.Shell
    $existingShortcut = $shell.CreateShortcut($shortcutPath)
    $expectedLauncher = Join-Path $root 'start-server-hidden.vbs'
    if (
        $existingShortcut.TargetPath -eq (Join-Path $env:SystemRoot 'System32\wscript.exe') -and
        $existingShortcut.Arguments -eq "//nologo `"$expectedLauncher`""
    ) {
        Remove-Item -LiteralPath $shortcutPath -Force
    } else {
        throw "El acceso directo de inicio tiene un destino inesperado y no se modifico: $shortcutPath"
    }
}

Register-ScheduledTask -TaskName $taskName -InputObject $task -Force -ErrorAction Stop | Out-Null
Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
Write-Output "Tarea registrada y servidor iniciado sin consola: $taskName"