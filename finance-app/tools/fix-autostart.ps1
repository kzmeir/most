# Автозапуск MOST после перезагрузки: задержка 1 минута после входа (чтобы успела подключиться сеть к \\MostServer)
# и перезапуск задачи при сбое (каждую минуту, до 5 раз). Запускать от администратора: tools\fix-autostart.bat
$ErrorActionPreference = 'Stop'
$name = 'MOST Финансы - локально'
$t = Get-ScheduledTask -TaskName $name
foreach ($tr in $t.Triggers) { $tr.Delay = 'PT1M' }
$t.Settings.RestartCount = 5
$t.Settings.RestartInterval = 'PT1M'
Set-ScheduledTask -TaskName $name -Trigger $t.Triggers -Settings $t.Settings | Out-Null
$c = Get-ScheduledTask -TaskName $name
Write-Host "Готово: задержка после входа = $($c.Triggers[0].Delay), перезапуск при сбое = $($c.Settings.RestartCount) раз через $($c.Settings.RestartInterval)"
