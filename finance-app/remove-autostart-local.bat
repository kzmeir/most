@echo off
chcp 65001 >nul
title MOST Финансы — удаление локального автозапуска
set TASK=MOST Финансы - локально
schtasks /Delete /TN "%TASK%" /F
if errorlevel 1 (
  echo.
  echo  Задача "%TASK%" не найдена или не удалось удалить ^(запустите от имени администратора^).
) else (
  echo.
  echo  Задача "%TASK%" удалена. Уже запущенное окно start-server.bat это не останавливает —
  echo  закройте его вручную, если оно открыто.
)
pause
