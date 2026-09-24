# Бэкап базы MOST Финансы в Google Drive (папка синхронизируется Google Drive для компьютера).
# Копия: db.json (без активных сессий) + прикреплённые файлы, zip с датой. Хранится 60 последних.
param(
  [string]$App = "\\MostServer\Documents\MOST-Финансы",
  [string]$Dest = "G:\Мой диск\Финансы\MOST-Финансы бэкап",
  [int]$Keep = 60
)
$ErrorActionPreference = 'Stop'
$data = Join-Path $App 'data'
if (-not (Test-Path (Join-Path $data 'db.json'))) { throw "Нет базы: $data\db.json" }
New-Item -ItemType Directory -Force $Dest | Out-Null

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss' # с секундами: минутного разрешения не хватает при двух запусках подряд (тест, ручной повтор)
$tmp = Join-Path $env:TEMP "most-backup-$stamp"
New-Item -ItemType Directory -Force $tmp | Out-Null
try {
  # db.json без сессий (cookie-токены входа в облако не отправляем); пользователи с хэшами паролей остаются для восстановления
  # .replace снимает BOM, если db.json когда-то сохраняли не через сервер (Notepad, PowerShell) — Node его не пропускает
  $js = "const fs=require('fs');const db=JSON.parse(fs.readFileSync(process.argv[1],'utf8').replace(/^﻿/,''));db.sessions=[];fs.writeFileSync(process.argv[2],JSON.stringify(db));"
  node -e $js (Join-Path $data 'db.json') (Join-Path $tmp 'db.json')
  if ($LASTEXITCODE -ne 0) { throw 'Не удалось прочитать db.json' }
  $files = Join-Path $data 'files'
  if (Test-Path $files) { Copy-Item $files (Join-Path $tmp 'files') -Recurse }
  $zip = Join-Path $Dest "MOST-Финансы_$stamp.zip"
  Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath $zip -Force
  Get-ChildItem $Dest -Filter 'MOST-Финансы_*.zip' | Sort-Object Name -Descending | Select-Object -Skip $Keep | Remove-Item -Force
  "OK: $zip ($([math]::Round((Get-Item $zip).Length/1MB,2)) МБ)"
} finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
