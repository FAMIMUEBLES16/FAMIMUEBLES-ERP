@echo off
setlocal
cd /d "%~dp0"
set "NGROK=C:\Users\mijad\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
if not exist "%NGROK%" exit /b 1
wscript.exe //nologo "%~dp0start-ngrok-hidden.vbs"
exit /b 0