$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ngrok = Join-Path $root '.tools\ngrok.exe'
if (-not (Test-Path $ngrok)) {
    $ngrokCommand = Get-Command ngrok.exe -ErrorAction SilentlyContinue
    if ($ngrokCommand) {
        $ngrok = $ngrokCommand.Source
    }
}
$log = Join-Path $root 'logs\ngrok-autostart.log'
$launcher = Join-Path $root 'start-ngrok-hidden.vbs'
$taskName = 'FAMIMUEBLES ngrok Tunnel'

if (-not (Test-Path $ngrok)) {
    throw "No se encontro ngrok: $ngrok"
}
if (-not (Test-Path $launcher)) {
    throw "No se encontro el lanzador oculto: $launcher"
}

Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Get-ScheduledTask -TaskName 'FAMIMUEBLES Cloudflare Tunnel' -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$ngrok* http --domain=crouch-untitled-harness.ngrok-free.dev 8024*" } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$launcher`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances Ignore
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Tunel ngrok publico FAMIMUEBLES sin ventana de consola.'
$task.Settings.Hidden = $true
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force -ErrorAction Stop | Out-Null
Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
Write-Output "Tarea registrada y tunel iniciado sin consola: $taskName"
