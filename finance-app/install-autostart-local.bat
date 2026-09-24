@echo off
chcp 65001 >nul
title MOST Финансы — локальный автозапуск: настройка
pushd "%~dp0"
set TASK=MOST Финансы - локально
set TRIGGER=%1
if /i "%TRIGGER%"=="boot" (
  set SC=ONSTART
  echo  Регистрирую задачу Windows: при включении компьютера запускать сервер локально ^(без туннеля^), в свёрнутом окне.
) else (
  set SC=ONLOGON
  echo  Регистрирую задачу Windows: при входе пользователя запускать сервер локально ^(без туннеля^), в свёрнутом окне.
)
schtasks /Create /F /SC %SC% /RL HIGHEST /TN "%TASK%" /TR "cmd /c start /min \"MOST Финансы (локально)\" \"%~dp0start-server.bat\""
if errorlevel 1 (
  echo.
  echo  Не удалось создать задачу. Запустите этот файл от имени администратора.
) else (
  echo.
  echo  Готово. Проверить: Планировщик заданий -^> "%TASK%".
  echo  Для триггера «при включении компьютера» вместо «при входе» запустите: install-autostart-local.bat boot
  echo  Удалить: remove-autostart-local.bat ^(или schtasks /Delete /TN "%TASK%" /F^)
  echo  Это временное решение для ПК директора, пока сисадмин не перенёс сервер на Docker/NAS —
  echo  см. docs\DEPLOY.md, раздел «Временный режим: ПК директора».
)
pause
