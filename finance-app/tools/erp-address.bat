@echo off
chcp 65001 >nul
rem Добавляет адрес http://erp.most на этот компьютер (одна строка в hosts). Запуск двойным щелчком, Windows спросит права администратора.
net session >nul 2>&1
if errorlevel 1 goto :elevate
findstr /C:"erp.most" %SystemRoot%\System32\drivers\etc\hosts >nul 2>&1
if not errorlevel 1 goto :already
echo.>>%SystemRoot%\System32\drivers\etc\hosts
echo 192.168.50.94  erp.most>>%SystemRoot%\System32\drivers\etc\hosts
ipconfig /flushdns >nul
echo.
echo  Готово. Откройте в браузере: http://erp.most
start "" "http://erp.most"
pause
exit /b 0

:already
echo.
echo  Адрес erp.most уже настроен. Откройте: http://erp.most
start "" "http://erp.most"
pause
exit /b 0

:elevate
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b 0
