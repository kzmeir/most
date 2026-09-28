@echo off
setlocal
title MOST - выкладка на сервер
set "SITEPORT=3000"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-to-server.ps1" -MostServer -Port %SITEPORT% %*
set "RC=%errorlevel%"
if %RC%==0 goto :ok
if %RC%==2 goto :norestart
goto :failed

:ok
echo.
echo  Выкладка завершена успешно.
pause
exit /b 0

:norestart
echo.
echo  Код выложен, но перезапустить сервер не удалось - не хватает прав (Access is denied).
echo  Автозапуск обычно работает с повышенными правами, а этот запуск - нет.
choice /C YN /N /M "Повторить с правами администратора сейчас? (Y/N) "
if errorlevel 2 goto :norestart_manual
if errorlevel 1 goto :elevate
goto :norestart_manual

:elevate
powershell -NoProfile -Command "Start-Process -FilePath powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%~dp0deploy-to-server.ps1','-MostServer','-Port','%SITEPORT%'"
echo.
echo  Запущено в новом окне с запросом прав администратора - подтвердите в диалоге Windows.
pause
exit /b 2

:norestart_manual
echo.
echo  Хорошо, ничего не перезапускаю. Снимите процесс в Диспетчере задач сами, когда будет удобно
echo  (см. подсказку выше с PID), или запустите этот файл ещё раз.
pause
exit /b 2

:failed
echo.
echo  Выкладка завершилась с ошибкой. Подробности выше и в логе (data\logs\deploy-*.log или %TEMP%).
pause
exit /b 1
