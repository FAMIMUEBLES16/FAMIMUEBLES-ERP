$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
if (-not (Test-Path $cloudflared)) {
    $cloudflared = 'C:\Program Files\cloudflared\cloudflared.exe'
}
$launcher = Join-Path $root 'start-cloudflared-autoupdate.ps1'
$taskName = 'FAMIMUEBLES Cloudflare Quick Tunnel'

if (-not (Test-Path $cloudflared)) {
    $command = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
    if ($command) {
        $cloudflared = $command.Source
    }
}
if (-not (Test-Path $cloudflared)) {
    throw "No se encontro cloudflared.exe"
}
if (-not (Test-Path $launcher)) {
    throw "No se encontro el lanzador: $launcher"
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`""
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$triggerStartup = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances Ignore
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger @($triggerLogon, $triggerStartup) -Settings $settings -Principal $principal -Description 'Tunel Cloudflare gratuito del ERP, sin ventana de consola.'
$task.Settings.Hidden = $true
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force -ErrorAction Stop | Out-Null
Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
Write-Output "Tarea registrada y tunel iniciado: $taskName"
