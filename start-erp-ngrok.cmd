@echo off
setlocal
cd /d "%~dp0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8024 .*LISTENING"') do set "ERP_PID=%%P"
if not defined ERP_PID (
	call "%~dp0start-erp-server.cmd"
	for /l %%I in (1,1,15) do (
		for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8024 .*LISTENING"') do set "ERP_PID=%%P"
		if defined ERP_PID goto server_ready
		>nul timeout /t 1 /nobreak
	)
)
:server_ready
if not defined ERP_PID exit /b 1
set "NGROK=C:\Users\mijad\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
if not exist "%NGROK%" exit /b 1
wscript.exe //nologo "%~dp0start-ngrok-hidden.vbs"
exit /b 0