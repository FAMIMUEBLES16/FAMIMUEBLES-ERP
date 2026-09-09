Option Explicit

Dim shell
Dim fileSystem
Dim root
Dim pythonw
Dim server

Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
root = fileSystem.GetParentFolderName(WScript.ScriptFullName)
pythonw = root & "\.venv\Scripts\pythonw.exe"
server = root & "\server.py"

If Not fileSystem.FileExists(pythonw) Then
    WScript.Quit 1
End If
If Not fileSystem.FileExists(server) Then
    WScript.Quit 1
End If

shell.CurrentDirectory = root
shell.Run Chr(34) & pythonw & Chr(34) & " " & Chr(34) & server & Chr(34), 0, False
