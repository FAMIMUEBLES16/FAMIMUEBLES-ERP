@echo off
setlocal
cd /d "%~dp0"
if not exist "server.py" (
	echo No se encontro server.py en %CD%.
	exit /b 0
)
wscript.exe //nologo "%~dp0start-server-hidden.vbs"
exit /b 0