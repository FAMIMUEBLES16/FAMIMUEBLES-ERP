$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
if (-not (Test-Path $cloudflared)) {
    $cloudflared = 'C:\Program Files\cloudflared\cloudflared.exe'
}
if (-not (Test-Path $cloudflared)) {
    $command = Get-Command cloudflared.exe -ErrorAction Stop
    $cloudflared = $command.Source
}

$logPath = Join-Path $root 'logs\cloudflared-autostart.log'
$errorLogPath = Join-Path $root 'logs\cloudflared-autostart.err.log'
$token = [Environment]::GetEnvironmentVariable('FAMIMUEBLES_GITHUB_TOKEN', 'User')
if ([string]::IsNullOrWhiteSpace($token)) {
    throw 'No se encontro FAMIMUEBLES_GITHUB_TOKEN en las variables del usuario.'
}

$null = New-Item -ItemType Directory -Path (Split-Path $logPath) -Force
$runStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
foreach ($existingLog in @($logPath, $errorLogPath)) {
    if (Test-Path $existingLog) {
        Move-Item -LiteralPath $existingLog -Destination "$existingLog.$runStamp"
    }
}
$originReady = $false
for ($attempt = 0; $attempt -lt 60 -and -not $originReady; $attempt++) {
    try {
        $health = Invoke-WebRequest -Uri 'http://127.0.0.1:8024/api/health' -UseBasicParsing -TimeoutSec 3
        $originReady = $health.StatusCode -eq 200
    } catch {
        $originReady = $false
    }
    if (-not $originReady) { Start-Sleep -Seconds 1 }
}
if (-not $originReady) {
    throw 'El servidor ERP no respondio en http://127.0.0.1:8024.'
}
$process = Start-Process -FilePath $cloudflared -ArgumentList @('tunnel', '--protocol', 'http2', '--url', 'http://127.0.0.1:8024') -WorkingDirectory $root -RedirectStandardOutput $logPath -RedirectStandardError $errorLogPath -WindowStyle Hidden -PassThru
$pattern = 'https://(?!api\.trycloudflare\.com)[a-z0-9-]+\.trycloudflare\.com'
$tunnelUrl = $null
for ($attempt = 0; $attempt -lt 60 -and -not $tunnelUrl; $attempt++) {
    if ($process.HasExited) { break }
    Start-Sleep -Seconds 1
    foreach ($outputPath in @($logPath, $errorLogPath)) {
        if (Test-Path $outputPath) {
            $match = Select-String -Path $outputPath -Pattern $pattern | Select-Object -Last 1
        }
        if ($match) {
            $tunnelUrl = [regex]::Match($match.Line, $pattern).Value
            break
        }
    }
}
if (-not $tunnelUrl) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw 'Cloudflare no entrego una URL dentro del tiempo esperado.'
}

$headers = @{
    Authorization = "Bearer $token"
    Accept = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
}
$apiRoot = 'https://api.github.com/repos/FAMIMUEBLES16/FAMIMUEBLES-ERP/contents/'
$document = @{ url = $tunnelUrl; updatedAt = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress
$tunnelPath = Join-Path $root 'tunnel-url.json'
[IO.File]::WriteAllText($tunnelPath, $document, [Text.UTF8Encoding]::new($false))

$localConfigPath = Join-Path $root 'js\config.js'
$configText = [IO.File]::ReadAllText($localConfigPath)
$configText = [regex]::Replace($configText, "const PUBLIC_API_URL = '[^']*';", "const PUBLIC_API_URL = '$tunnelUrl/api';")
[IO.File]::WriteAllText($localConfigPath, $configText, [Text.UTF8Encoding]::new($false))

function Publish-GitHubFile($path, $text, $message) {
    $apiUrl = "$apiRoot$path"
    $remote = Invoke-RestMethod -Headers $headers -Uri $apiUrl -TimeoutSec 20
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text))
    $body = @{ message = $message; content = $encoded; sha = $remote.sha; branch = 'main' }
    Invoke-RestMethod -Method Put -Headers $headers -Uri $apiUrl -Body ($body | ConvertTo-Json) -ContentType 'application/json' -TimeoutSec 20 | Out-Null
}

Publish-GitHubFile 'tunnel-url.json' $document "Actualizar URL del tunel: $tunnelUrl"
Publish-GitHubFile 'js/config.js' $configText "Actualizar API publica del tunel: $tunnelUrl"

$process.WaitForExit()
