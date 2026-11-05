$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $root '.venv\Scripts\python.exe'
$server = Join-Path $root 'server.py'
$launcher = Join-Path $root 'start-server-hidden.vbs'
$taskName = 'FAMIMUEBLES ERP Server'
$startupPath = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupPath 'FAMIMUEBLES ERP.lnk'
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$launcherArguments = "//nologo `"$launcher`""
$pythonArguments = "-u `"$server`""

if (-not (Test-Path $python)) {
    throw "No se encontro Python del entorno virtual: $python"
}
if (-not (Test-Path $server)) {
    throw "No se encontro el servidor: $server"
}
if (-not (Test-Path $launcher)) {
    throw "No se encontro el lanzador: $launcher"
}
if (-not (Test-Path $startupPath -PathType Container)) {
    throw "No se encontro la carpeta de inicio de sesion: $startupPath"
}

$shell = New-Object -ComObject WScript.Shell
if (Test-Path $shortcutPath) {
    $shortcut = $shell.CreateShortcut($shortcutPath)
    if ($shortcut.TargetPath -ne $wscript -or $shortcut.Arguments -ne $launcherArguments) {
        throw "El acceso directo de inicio tiene un destino inesperado y no se modifico: $shortcutPath"
    }
} else {
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $wscript
    $shortcut.Arguments = $launcherArguments
    $shortcut.WorkingDirectory = $root
    $shortcut.WindowStyle = 7
    $shortcut.Description = 'Inicia y supervisa el servidor ERP FAMIMUEBLES.'
    $shortcut.Save()
}

$oldTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($oldTask) {
    $oldAction = $oldTask.Actions | Select-Object -First 1
    $knownLauncherTask = $oldAction.Execute -eq $wscript -and $oldAction.Arguments -eq $launcherArguments
    $knownPythonTask = $oldAction.Execute -eq $python -and $oldAction.Arguments -eq $pythonArguments
    if (-not ($knownLauncherTask -or $knownPythonTask)) {
        throw "La tarea '$taskName' tiene una accion inesperada y no se modifico."
    }
    if ($oldTask.State -eq 'Running') {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop
    }
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
}

$health = $null
$lastHealthError = ''
try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8024/api/health' -TimeoutSec 3
} catch {
    $lastHealthError = $_.Exception.Message
}

if ($health.ok -ne $true -or $health.backend -ne 'postgres') {
    $shell.CurrentDirectory = $root
    $shell.Run("`"$wscript`" $launcherArguments", 0, $false) | Out-Null
}

$deadline = (Get-Date).AddMinutes(3)
while (($health.ok -ne $true -or $health.backend -ne 'postgres') -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8024/api/health' -TimeoutSec 3
        $lastHealthError = ''
    } catch {
        $lastHealthError = $_.Exception.Message
    }
}

if ($health.ok -ne $true -or $health.backend -ne 'postgres') {
    throw "El ERP no alcanzo estado saludable con PostgreSQL. Ultimo error: $lastHealthError. Revise logs\server-startup.log y logs\server-headless.log."
}

Write-Output "Inicio de sesion configurado con supervisión oculta; ERP saludable en PostgreSQL: $shortcutPath"
