Option Explicit

Dim shell
Dim fileSystem
Dim root
Dim pythonw
Dim python
Dim server
Dim logPath
Dim logFile

Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
root = fileSystem.GetParentFolderName(WScript.ScriptFullName)
pythonw = root & "\.venv\Scripts\pythonw.exe"
python = root & "\.venv\Scripts\python.exe"
server = root & "\server.py"
logPath = root & "\logs\server-startup.log"

Sub WriteLog(message)
    On Error Resume Next
    Set logFile = fileSystem.OpenTextFile(logPath, 8, True)
    logFile.WriteLine Now & " - " & message
    logFile.Close
    On Error GoTo 0
End Sub

If Not fileSystem.FileExists(pythonw) Then
    If fileSystem.FileExists(python) Then
        pythonw = python
        WriteLog "pythonw.exe no existe; se usara python.exe"
    Else
        WriteLog "No se encontro el interprete: " & pythonw
        WScript.Quit 0
    End If
End If
If Not fileSystem.FileExists(server) Then
    WriteLog "No se encontro el servidor: " & server
    WScript.Quit 0
End If

shell.CurrentDirectory = root
shell.Run Chr(34) & pythonw & Chr(34) & " " & Chr(34) & server & Chr(34), 0, False
WriteLog "Servidor solicitado en segundo plano"
