$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
if (-not (Test-Path $cloudflared)) {
    $cloudflared = 'C:\Program Files\cloudflared\cloudflared.exe'
}
$launcher = Join-Path $root 'start-cloudflared-autoupdate.ps1'
$taskName = 'FAMIMUEBLES Cloudflare Quick Tunnel'
$startupPath = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupPath 'FAMIMUEBLES Public Tunnel.lnk'

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

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`""
$shortcut.WorkingDirectory = $root
$shortcut.Description = 'Iniciar y supervisar el tunel publico FAMIMUEBLES ERP'
$shortcut.Save()

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`""
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$triggerStartup = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances Ignore
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger @($triggerLogon, $triggerStartup) -Settings $settings -Principal $principal -Description 'Tunel Cloudflare gratuito del ERP, sin ventana de consola.'
$task.Settings.Hidden = $true
try {
    Register-ScheduledTask -TaskName $taskName -InputObject $task -Force -ErrorAction Stop | Out-Null
    Write-Output "Tarea registrada: $taskName"
}
catch {
    Write-Warning "No fue posible actualizar la tarea programada: $($_.Exception.Message). Se usara el acceso directo de inicio de sesion: $shortcutPath"
}

try {
    Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
    Write-Output "Tunel solicitado mediante la tarea: $taskName"
}
catch {
    Write-Warning "No fue posible iniciar la tarea programada: $($_.Exception.Message). El acceso directo iniciara el tunel al iniciar sesion."
}
