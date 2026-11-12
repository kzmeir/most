@echo off
rem Adds http://erp.most to this PC (one line in hosts). Double-click; Windows will ask for admin rights.
rem An old erp.most line (e.g. Wi-Fi 192.168.0.172) is replaced with the office LAN address 192.168.50.51.
rem ASCII only: cmd breaks Cyrillic in .bat files.
net session >nul 2>&1
if errorlevel 1 goto :elevate
set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"
findstr /C:"192.168.50.51  erp.most" "%HOSTS%" >nul 2>&1
if not errorlevel 1 goto :already
findstr /V /C:"erp.most" "%HOSTS%" > "%TEMP%\hosts.most.tmp"
copy /Y "%TEMP%\hosts.most.tmp" "%HOSTS%" >nul
del "%TEMP%\hosts.most.tmp"
echo 192.168.50.51  erp.most>>"%HOSTS%"
ipconfig /flushdns >nul
echo.
echo  OK. Open in browser: http://erp.most
start "" "http://erp.most"
pause
exit /b 0

:already
echo.
echo  erp.most is already set. Open: http://erp.most
start "" "http://erp.most"
pause
exit /b 0

:elevate
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b 0
