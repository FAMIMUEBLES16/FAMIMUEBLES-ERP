Option Explicit

Dim shell
Dim fileSystem
Dim root
Dim python
Dim server
Dim logPath
Dim logFile
Dim command
Dim exitCode

Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
root = fileSystem.GetParentFolderName(WScript.ScriptFullName)
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

If Not fileSystem.FolderExists(root & "\logs") Then
    fileSystem.CreateFolder(root & "\logs")
End If
If Not fileSystem.FileExists(python) Then
    WriteLog "No se encontro el interprete: " & python
    WScript.Quit 2
End If
If Not fileSystem.FileExists(server) Then
    WriteLog "No se encontro el servidor: " & server
    WScript.Quit 2
End If

shell.CurrentDirectory = root
command = Chr(34) & python & Chr(34) & " -u " & Chr(34) & server & Chr(34)
Do
    WriteLog "Iniciando servidor oculto"
    exitCode = shell.Run(command, 0, True)
    WriteLog "Servidor finalizo con codigo " & exitCode & "; reintentando en 30 segundos"
    WScript.Sleep 30000
Loop
