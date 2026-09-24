# Проверка tools/backup-gdrive.ps1 (SQLite/VACUUM INTO) на тестовых путях — не трогает \\MostServer и реальный Google Drive.
# Запуск: powershell -NoProfile -ExecutionPolicy Bypass -File tests\backup_gdrive_test.ps1
$ErrorActionPreference = 'Stop'
$App = Split-Path -Parent $PSScriptRoot
$Scr = Join-Path $App 'tests\tmp'
$Src = Join-Path $Scr 'backup-src'
$Dest = Join-Path $Scr 'backup-dest'
Remove-Item $Src, $Dest -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $Src 'data\files') | Out-Null
New-Item -ItemType Directory -Force $Dest | Out-Null

$pass = 0; $fail = 0
function Chk($name, $ok) {
  if ($ok) { Write-Host "  OK  $name"; $script:pass++ } else { Write-Host "  FAIL $name"; $script:fail++ }
}

# тестовая база через ту же схему, что и lib/store.js: docs(col,id,ord,data) + kv(k,v), с сессией и пользователем
$initJs = Join-Path $Src 'init.js'
@'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2]);
db.exec(`CREATE TABLE docs (col TEXT NOT NULL, id TEXT NOT NULL, ord INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (col, id));
  CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);`);
db.prepare('INSERT INTO docs VALUES (?,?,?,?)').run('users', 'u1', 1, JSON.stringify({ id: 'u1', login: 'test' }));
db.prepare('INSERT INTO docs VALUES (?,?,?,?)').run('ops', 'o1', 2, JSON.stringify({ id: 'o1', debit: 100 }));
db.prepare('INSERT INTO kv VALUES (?,?)').run('sessions', JSON.stringify({ 'tok-123': { userId: 'u1' } }));
db.prepare('INSERT INTO kv VALUES (?,?)').run('settings', JSON.stringify({ companies: ['Test'] }));
db.close();
'@ | Set-Content -Path $initJs -Encoding utf8
node --no-warnings $initJs (Join-Path $Src 'data\db.sqlite')
Set-Content (Join-Path $Src 'data\files\sample.pdf') 'dummy' -Encoding utf8
Remove-Item $initJs -Force

$script = Join-Path $App 'tools\backup-gdrive.ps1'
$out = & $script -App $Src -Dest $Dest -Keep 3 2>&1
Write-Host ($out -join "`n")

$zip = Get-ChildItem $Dest -Filter 'MOST-Финансы_*.zip' | Select-Object -First 1
Chk 'zip создан' ($null -ne $zip)

if ($zip) {
  $Unzip = Join-Path $Scr 'backup-unzip'
  Remove-Item $Unzip -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive $zip.FullName -DestinationPath $Unzip
  Chk 'db.sqlite в копии' (Test-Path (Join-Path $Unzip 'db.sqlite'))
  Chk 'прикреплённый файл скопирован' (Test-Path (Join-Path $Unzip 'files\sample.pdf'))

  $readJs = Join-Path $Scr 'read.js'
  @'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const kv = Object.fromEntries(db.prepare('SELECT k, v FROM kv').all().map(r => [r.k, r.v]));
const docs = db.prepare('SELECT col, id, data FROM docs').all();
console.log(JSON.stringify({ hasSessions: 'sessions' in kv, hasSettings: 'settings' in kv, docs: docs.length, user: docs.some(d => d.col === 'users' && d.data.includes('"test"')) }));
'@ | Set-Content -Path $readJs -Encoding utf8
  $readOut = node --no-warnings $readJs (Join-Path $Unzip 'db.sqlite') | ConvertFrom-Json
  Remove-Item $readJs -Force
  Chk 'sessions удалены из копии' (-not $readOut.hasSessions)
  Chk 'settings на месте' ($readOut.hasSettings)
  Chk 'документы (users, ops) скопированы' ($readOut.docs -eq 2 -and $readOut.user)
}

# хранится не больше Keep последних копий
for ($i = 0; $i -lt 4; $i++) {
  Start-Sleep -Milliseconds 1100
  & $script -App $Src -Dest $Dest -Keep 3 | Out-Null
}
$count = (Get-ChildItem $Dest -Filter 'MOST-Финансы_*.zip').Count
Chk 'хранится не больше Keep=3 копий' ($count -eq 3)

Remove-Item $Src, $Dest, (Join-Path $Scr 'backup-unzip') -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "PASS=$pass FAIL=$fail"
if ($fail -gt 0) { exit 1 }
