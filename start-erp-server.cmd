@echo off
setlocal
cd /d "%~dp0"
netstat -ano | findstr /C:":8024 " | findstr /C:"LISTENING" >nul
if not errorlevel 1 (
	echo [%date% %time%] ERP ya esta activo en el puerto 8024. >> "%~dp0logs\server-startup.log"
	exit /b 0
)
if not exist "server.py" (
	echo No se encontro server.py en %CD%.
	exit /b 0
)
wscript.exe //nologo "%~dp0start-server-hidden.vbs"
exit /b 0