@echo off
chcp 65001 >nul
title MOST Финансы - настройка ежедневного бэкапа
pushd "%~dp0"
set "TASK=MOST Финансы - бэкап"
set "TIME=03:00"
echo  Регистрирую задачу Windows: ежедневно в %TIME% сохранять копию базы в Google Drive.
echo  tools\backup-gdrive.ps1 - G:\Мой диск\Финансы\MOST-Финансы бэкап
schtasks /Create /F /SC DAILY /ST %TIME% /RL LIMITED /TN "%TASK%" /TR "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%~dp0tools\backup-gdrive.ps1\" -Dest \"G:\Мой диск\Финансы\MOST-Финансы бэкап\""
if errorlevel 1 goto :failed

echo.
echo  Готово. Требуется Google Drive для компьютера, установленный и авторизованный в аккаунте компании,
echo  папка G:\Мой диск\... должна быть видна на этом компьютере.
echo  Проверить задачу:   Планировщик заданий - "%TASK%"
echo  Запустить сейчас:   schtasks /Run /TN "%TASK%"
echo  Удалить:            schtasks /Delete /TN "%TASK%" /F
pause
exit /b 0

:failed
echo.
echo  Не удалось создать задачу. Запустите этот файл от имени администратора.
pause
exit /b 1
