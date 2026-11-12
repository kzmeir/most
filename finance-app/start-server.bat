@echo off
setlocal
set "LOGFILE=%TEMP%\most-start-server.log"
echo %DATE% %TIME% start-server.bat: cwd=%CD% dp0=%~dp0 user=%USERNAME%@%COMPUTERNAME% >>"%LOGFILE%"

chcp 65001 >nul 2>>"%LOGFILE%"
title MOST Финансы - локальный запуск (без туннеля, временно)

pushd "%~dp0" 2>>"%LOGFILE%"
if errorlevel 1 goto :nopushd
echo %DATE% %TIME% pushd выполнен, теперь в %CD% >>"%LOGFILE%"

rem ищем node.exe: сначала PATH, затем типовые места установки - планировщик иногда даёт урезанный PATH.
rem без вложенных скобочных блоков if(...): на этой машине они ломали разбор cmd.exe дальше по файлу.
set "NODE_EXE="
for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
if defined NODE_EXE goto :havenode
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if defined NODE_EXE goto :havenode
if exist "%LocalAppData%\Programs\node\node.exe" set "NODE_EXE=%LocalAppData%\Programs\node\node.exe"
if defined NODE_EXE goto :havenode
goto :nonode

:havenode
echo %DATE% %TIME% node.exe = %NODE_EXE% >>"%LOGFILE%"
echo.
echo  Временный локальный автозапуск (без Cloudflare Tunnel) - до переноса на Docker/NAS сисадмином.
echo  Если сервер с этой базой уже где-то запущен, это окно будет тихо ждать и само подхватит
echo  работу, как только тот процесс остановится.
echo  Не закрывайте это окно, пока приложением пользуются.
echo  Лог сервера: data\logs\server-дата.log
echo  Лог запуска этого окна: %LOGFILE%
echo.
echo %DATE% %TIME% запускаю: "%NODE_EXE%" tools\serve-local.js >>"%LOGFILE%"
"%NODE_EXE%" tools\serve-local.js
echo %DATE% %TIME% serve-local.js завершился, код %errorlevel% >>"%LOGFILE%"
timeout /t 30 /nobreak >nul
exit /b 0

:nopushd
echo %DATE% %TIME% ОШИБКА: pushd в %~dp0 не удался, папка или сетевой путь недоступны >>"%LOGFILE%"
exit /b 1

:nonode
echo %DATE% %TIME% ОШИБКА: node.exe не найден ни в PATH, ни в обычных местах установки >>"%LOGFILE%"
echo.
echo  Не найден Node.js. Установите с https://nodejs.org (LTS) и запустите снова.
echo  Подробный лог: %LOGFILE%
echo.
timeout /t 20 /nobreak >nul
exit /b 1
