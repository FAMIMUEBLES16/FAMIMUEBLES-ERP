$ErrorActionPreference = 'Stop'

$ngrok = 'C:\Users\mijad\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe'
$publicUrl = 'https://crouch-untitled-harness.ngrok-free.dev/api/health'
$log = 'C:\Users\mijad\OneDrive\Documentos\FAMIMUEBLES ERP\logs\ngrok-watchdog.log'
$env:NGROK_AUTHTOKEN = $env:NGROK_AUTHTOKEN

function EnsureLogDirectory {
    $dir = Split-Path -Parent $log
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

function StartNgrok {
    if (-not (Test-Path $ngrok)) {
        throw "No se encontró ngrok en: $ngrok"
    }

    $running = Get-CimInstance Win32_Process |
        Where-Object { $_.Name -eq 'ngrok.exe' -and $_.CommandLine -match 'crouch-untitled-harness\.ngrok-free\.dev' }

    if ($running) {
        foreach ($p in $running) {
            try {
                Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
            } catch {}
        }
    }

    Start-Process -FilePath $ngrok -ArgumentList 'http --domain=crouch-untitled-harness.ngrok-free.dev 127.0.0.1:8024 --log "C:\Users\mijad\OneDrive\Documentos\FAMIMUEBLES ERP\logs\ngrok-autostart.log"' -WorkingDirectory (Split-Path -Parent $ngrok) -WindowStyle Hidden | Out-Null
    Start-Sleep -Seconds 5
}

EnsureLogDirectory

while ($true) {
    try {
        $response = Invoke-WebRequest -Uri $publicUrl -UseBasicParsing -TimeoutSec 15
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
            Write-Host "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] URL publica OK"
        }
        else {
            throw "Codigo inesperado: $($response.StatusCode)"
        }
    }
    catch {
        $msg = "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] URL publica caida. Reiniciando ngrok. Error: $($_.Exception.Message)"
        Add-Content -Path $log -Value $msg
        Write-Host $msg
        try {
            StartNgrok
        }
        catch {
            $err = "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] No se pudo reiniciar ngrok: $($_.Exception.Message)"
            Add-Content -Path $log -Value $err
            Write-Host $err
        }
    }

    Start-Sleep -Seconds 30
}
