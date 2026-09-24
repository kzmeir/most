# Проверка tools/backup-gdrive.ps1 на тестовых путях — не трогает \\MostServer и реальный Google Drive.
# Запуск: powershell -NoProfile -ExecutionPolicy Bypass -File tests\backup_gdrive_test.ps1
$ErrorActionPreference = 'Stop'
$App = Split-Path -Parent $PSScriptRoot
$Scr = Join-Path $App 'tests\tmp'
$Src = Join-Path $Scr 'backup-src'
$Dest = Join-Path $Scr 'backup-dest'
$Unzip = Join-Path $Scr 'backup-unzip'
Remove-Item $Src, $Dest, $Unzip -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $Src 'data\files') | Out-Null
New-Item -ItemType Directory -Force $Dest | Out-Null

$pass = 0; $fail = 0
function Chk($name, $ok) {
  if ($ok) { Write-Host "  OK  $name"; $script:pass++ } else { Write-Host "  FAIL $name"; $script:fail++ }
}

# тестовая база: сессия (не должна попасть в копию) + пользователь (должен остаться — для восстановления)
$dbSrc = @{ settings = @{ companies = @('Test') }; sessions = @{ 'tok-123' = @{ userId = 'u1' } }; users = @(@{ id = 'u1'; login = 'test' }); ops = @() }
$dbSrc | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $Src 'data\db.json') -Encoding utf8
Set-Content (Join-Path $Src 'data\files\sample.pdf') 'dummy' -Encoding utf8

$script = Join-Path $App 'tools\backup-gdrive.ps1'
$out = & $script -App $Src -Dest $Dest -Keep 3 2>&1
Write-Host ($out -join "`n")

$zip = Get-ChildItem $Dest -Filter 'MOST-Финансы_*.zip' | Select-Object -First 1
Chk 'zip создан' ($null -ne $zip)

if ($zip) {
  Expand-Archive $zip.FullName -DestinationPath $Unzip
  $db = Get-Content (Join-Path $Unzip 'db.json') -Raw | ConvertFrom-Json
  Chk 'db.json без сессий' ($db.sessions.Count -eq 0)
  Chk 'пользователи сохранены (для восстановления)' ($db.users.Count -eq 1 -and $db.users[0].login -eq 'test')
  Chk 'операции на месте' ($db.PSObject.Properties.Name -contains 'ops')
  Chk 'прикреплённый файл скопирован' (Test-Path (Join-Path $Unzip 'files\sample.pdf'))
}

# хранится не больше Keep последних копий
for ($i = 0; $i -lt 4; $i++) {
  Start-Sleep -Milliseconds 1100
  & $script -App $Src -Dest $Dest -Keep 3 | Out-Null
}
$count = (Get-ChildItem $Dest -Filter 'MOST-Финансы_*.zip').Count
Chk 'хранится не больше Keep=3 копий' ($count -eq 3)

Remove-Item $Src, $Dest, $Unzip -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "PASS=$pass FAIL=$fail"
if ($fail -gt 0) { exit 1 }

