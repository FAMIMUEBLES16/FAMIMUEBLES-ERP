$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
if (-not (Test-Path $cloudflared)) {
    $cloudflared = 'C:\Program Files\cloudflared\cloudflared.exe'
}
if (-not (Test-Path $cloudflared)) {
    $command = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
    if ($command) {
        $cloudflared = $command.Source
    }
}
if (-not (Test-Path $cloudflared)) {
    throw 'No se encontro cloudflared.exe'
}

$logPath = Join-Path $root 'logs\cloudflared-autostart.log'
$errorLogPath = Join-Path $root 'logs\cloudflared-autostart.err.log'
$token = [Environment]::GetEnvironmentVariable('FAMIMUEBLES_GITHUB_TOKEN', 'User')
$authorization = $null
$gitCommand = Get-Command git.exe -ErrorAction SilentlyContinue
if ($gitCommand) {
    $credentialInput = "protocol=https`nhost=github.com`n`n"
    $credentialOutput = $credentialInput | git -c credential.interactive=never credential fill 2>$null
    $credentialPassword = ($credentialOutput | Where-Object { $_ -like 'password=*' } | Select-Object -First 1) -replace '^password=', ''
    $credentialUser = ($credentialOutput | Where-Object { $_ -like 'username=*' } | Select-Object -First 1) -replace '^username=', ''
    if (-not [string]::IsNullOrWhiteSpace($credentialPassword)) {
        $credentialPair = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${credentialUser}:$credentialPassword"))
        $authorization = "Basic $credentialPair"
    }
}
if ([string]::IsNullOrWhiteSpace($authorization) -and -not [string]::IsNullOrWhiteSpace($token)) {
    $authorization = "Bearer $token"
}
if ([string]::IsNullOrWhiteSpace($authorization)) {
    throw 'Configura FAMIMUEBLES_GITHUB_TOKEN o inicia sesion en Git Credential Manager para publicar la URL del tunel.'
}

$null = New-Item -ItemType Directory -Path (Split-Path $logPath) -Force
$headers = @{
    Authorization = $authorization
    Accept = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
}
$apiRoot = 'https://api.github.com/repos/FAMIMUEBLES16/FAMIMUEBLES-ERP/contents/'
$pattern = 'https://(?!api\.trycloudflare\.com)[a-z0-9-]+\.trycloudflare\.com'
$mutex = New-Object System.Threading.Mutex($false, 'Local\FAMIMUEBLES-ERP-Cloudflare-Tunnel')
if (-not $mutex.WaitOne(0)) {
    exit 0
}

function Publish-GitHubFile($path, $text, $message) {
    $apiUrl = "$apiRoot$path"
    $remote = Invoke-RestMethod -Headers $headers -Uri $apiUrl -TimeoutSec 20
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text))
    $body = @{ message = $message; content = $encoded; sha = $remote.sha; branch = 'main' }
    Invoke-RestMethod -Method Put -Headers $headers -Uri $apiUrl -Body ($body | ConvertTo-Json) -ContentType 'application/json' -TimeoutSec 20 | Out-Null
}

function Start-PublicTunnel {
    $runStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $runLogPath = Join-Path (Split-Path $logPath) "cloudflared-autostart.$runStamp.log"
    $runErrorLogPath = Join-Path (Split-Path $errorLogPath) "cloudflared-autostart.$runStamp.err.log"

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

    $process = $null
    try {
        $process = Start-Process -FilePath $cloudflared -ArgumentList @('tunnel', '--protocol', 'http2', '--url', 'http://127.0.0.1:8024') -WorkingDirectory $root -RedirectStandardOutput $runLogPath -RedirectStandardError $runErrorLogPath -WindowStyle Hidden -PassThru
        $tunnelUrl = $null
        for ($attempt = 0; $attempt -lt 120 -and -not $tunnelUrl; $attempt++) {
            if ($process.HasExited) { break }
            Start-Sleep -Seconds 1
            foreach ($outputPath in @($runLogPath, $runErrorLogPath)) {
                $match = $null
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
            throw 'Cloudflare no entrego una URL dentro del tiempo esperado.'
        }

        $document = @{ url = $tunnelUrl; updatedAt = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress
        [IO.File]::WriteAllText((Join-Path $root 'tunnel-url.json'), $document, [Text.UTF8Encoding]::new($false))

        $localConfigPath = Join-Path $root 'js\config.js'
        $configText = [IO.File]::ReadAllText($localConfigPath)
        $configText = [regex]::Replace($configText, "const PUBLIC_API_URL = '[^']*';", "const PUBLIC_API_URL = '$tunnelUrl/api';")
        [IO.File]::WriteAllText($localConfigPath, $configText, [Text.UTF8Encoding]::new($false))

        $published = $false
        try {
            Publish-GitHubFile 'tunnel-url.json' $document "Actualizar URL del tunel: $tunnelUrl"
            Publish-GitHubFile 'js/config.js' $configText "Actualizar API publica del tunel: $tunnelUrl"
            $published = $true
        } catch {
            $message = "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] No se pudo publicar la nueva URL en GitHub; el tunel seguira activo y se reintentara. Error: $($_.Exception.Message)"
            Add-Content -LiteralPath $errorLogPath -Value $message
            Write-Output $message
        }

        $failedHealthChecks = 0
        $lastHealthError = $null
        while (-not $process.HasExited) {
            Start-Sleep -Seconds 15
            try {
                $response = Invoke-WebRequest -Uri "$tunnelUrl/api/health" -Headers @{'ngrok-skip-browser-warning' = 'true'} -UseBasicParsing -TimeoutSec 10
                $health = $response.Content | ConvertFrom-Json
                if ($response.StatusCode -ne 200 -or $health.ok -ne $true -or $health.backend -ne 'postgres') {
                    throw 'La API publica no reporto el backend PostgreSQL.'
                }
                $failedHealthChecks = 0
                $lastHealthError = $null
            } catch {
                $failedHealthChecks++
                $lastHealthError = $_.Exception.Message
                if ($failedHealthChecks -ge 8) {
                    throw "La API publica fallo $failedHealthChecks comprobaciones consecutivas. Ultimo error: $lastHealthError. Se reiniciara el tunel."
                }
            }
            if (-not $published) {
                try {
                    Publish-GitHubFile 'tunnel-url.json' $document "Actualizar URL del tunel: $tunnelUrl"
                    Publish-GitHubFile 'js/config.js' $configText "Actualizar API publica del tunel: $tunnelUrl"
                    $published = $true
                } catch {
                    $message = "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] GitHub sigue sin aceptar la URL publica; se reintentara en 15 segundos. Error: $($_.Exception.Message)"
                    Add-Content -LiteralPath $errorLogPath -Value $message
                    Write-Output $message
                }
            }
        }
        throw "El proceso de Cloudflare termino (codigo $($process.ExitCode))."
    } finally {
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force
        }
    }
}

try {
    while ($true) {
        try {
            Start-PublicTunnel
        } catch {
            $message = "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] Tunel publico no disponible; se reintentara en 30 segundos. Error: $($_.Exception.Message)"
            Add-Content -LiteralPath $errorLogPath -Value $message
            Write-Output $message
        }
        Start-Sleep -Seconds 30
    }
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
