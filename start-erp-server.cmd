@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\pythonw.exe" exit /b 1
wscript.exe //nologo "%~dp0start-server-hidden.vbs"
exit /b 0