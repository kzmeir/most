@echo off
rem MOST autostart fix: 1 min delay after logon + restart on failure. Asks for admin rights. ASCII only.
net session >nul 2>&1
if errorlevel 1 goto :elevate
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-autostart.ps1"
pause
exit /b 0

:elevate
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b 0
