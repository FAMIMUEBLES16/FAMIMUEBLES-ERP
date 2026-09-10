Option Explicit

Dim shell
Dim ngrokCommand
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "C:\Users\mijad\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe"
ngrokCommand = Chr(34) & "C:\Users\mijad\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe" & Chr(34) & " http --domain=crouch-untitled-harness.ngrok-free.dev 127.0.0.1:8024 --log " & Chr(34) & "C:\Users\mijad\OneDrive\Documentos\FAMIMUEBLES ERP\logs\ngrok-autostart.log" & Chr(34)
shell.Run ngrokCommand, 0, False
