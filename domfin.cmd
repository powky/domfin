@echo off
rem Domfin's launcher for Windows: runs scripts\domfin.ps1 (macOS and Linux: ./domfin).
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\domfin.ps1" %*
exit /b %ERRORLEVEL%
