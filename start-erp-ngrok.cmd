@echo off
setlocal
cd /d "%~dp0"
set "NGROK=C:\Users\mijad\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
if not exist "%NGROK%" exit /b 1
"%NGROK%" http --domain=crouch-untitled-harness.ngrok-free.dev 8024