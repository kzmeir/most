# Бэкап базы MOST Финансы в Google Drive (папка синхронизируется Google Drive для компьютера).
# Копия: db.sqlite через VACUUM INTO (согласованный снимок, сервер можно не останавливать),
# из копии удаляются сессии (cookie-токены входа не отправляем) + прикреплённые файлы, zip с датой.
# Хранится $Keep последних копий.
param(
  [string]$App = "\\MostServer\Documents\MOST-Финансы",
  [string]$Dest = "G:\Мой диск\Финансы\MOST-Финансы бэкап",
  [int]$Keep = 60
)
$ErrorActionPreference = 'Stop'
$data = Join-Path $App 'data'
if (-not (Test-Path (Join-Path $data 'db.sqlite'))) { throw "Нет базы: $data\db.sqlite (если ещё старая db.json — запустите сервер один раз, перенесёт сам)" }
New-Item -ItemType Directory -Force $Dest | Out-Null

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss' # с секундами: минутного разрешения не хватает при двух запусках подряд (тест, ручной повтор)
$tmp = Join-Path $env:TEMP "most-backup-$stamp"      # содержимое зеркалится в zip как есть — только db.sqlite и files/
$work = Join-Path $env:TEMP "most-backup-$stamp-js"  # вспомогательный .js сюда, чтобы не попал в zip
New-Item -ItemType Directory -Force $tmp | Out-Null
New-Item -ItemType Directory -Force $work | Out-Null
try {
  # node:sqlite VACUUM INTO копирует базу одним согласованным снимком; затем из копии удаляется строка sessions.
  # Пишем во временный .js-файл, а не через `node -e`, чтобы не воевать с экранированием кавычек между PowerShell и JS.
  $jsFile = Join-Path $work 'backup.js'
  @'
const { DatabaseSync } = require('node:sqlite');
const [, , src, dst] = process.argv;
const db = new DatabaseSync(src, { readOnly: true });
db.exec("VACUUM INTO '" + dst.replace(/'/g, "''") + "'");
db.close();
const copy = new DatabaseSync(dst);
copy.exec("DELETE FROM kv WHERE k='sessions'");
copy.close();
'@ | Set-Content -Path $jsFile -Encoding utf8
  # --no-warnings: экспериментальное предупреждение node:sqlite на stderr иначе PowerShell 5.1 считает ошибкой (NativeCommandError)
  node --no-warnings $jsFile (Join-Path $data 'db.sqlite') (Join-Path $tmp 'db.sqlite')
  if ($LASTEXITCODE -ne 0) { throw 'Не удалось скопировать db.sqlite' }
  $files = Join-Path $data 'files'
  if (Test-Path $files) { Copy-Item $files (Join-Path $tmp 'files') -Recurse }
  $zip = Join-Path $Dest "MOST-Финансы_$stamp.zip"
  Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath $zip -Force
  Get-ChildItem $Dest -Filter 'MOST-Финансы_*.zip' | Sort-Object Name -Descending | Select-Object -Skip $Keep | Remove-Item -Force
  "OK: $zip ($([math]::Round((Get-Item $zip).Length/1MB,2)) МБ)"
} finally { Remove-Item $tmp, $work -Recurse -Force -ErrorAction SilentlyContinue }
