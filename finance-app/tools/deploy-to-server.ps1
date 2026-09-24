# Выкладка MOST Финансы/ERP на рабочий сервер одним запуском вместо ручного копирования директором.
# -Target и -Port ОБЯЗАТЕЛЬНЫ (нет значений по умолчанию) - без них скрипт печатает справку и выходит,
# ничего не делая. Рабочий путь задаёт только bat-обёртка директора; для проверки передавайте свои
# -Target/-Port на тестовую копию. Скрипт НИКОГДА не трогает data\, seed\, tunnel.txt/tunnel-url.txt
# в целевой папке - их нет ни в одном списке копирования.
param(
  [string]$Source = "C:\Users\Admin\Documents\most\finance-app",
  [string]$Target,
  [int]$Port,
  [string]$RequireBranch = "erp/main",
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'

if (-not $Target -or -not $Port) {
  Write-Host "Использование: deploy-to-server.ps1 -Target <путь к серверу> -Port <порт сайта Финансы> [-Source <путь>] [-DryRun]"
  Write-Host "  -Target    обязателен, например \\MostServer\Documents\MOST-Финансы"
  Write-Host "  -Port      обязателен, порт сайта Финансы (сайт ERP - это Port+1), например 3000"
  Write-Host "  -Source    необязателен, по умолчанию C:\Users\Admin\Documents\most\finance-app (чекаут erp/main)"
  Write-Host "  -DryRun    ничего не меняет: только показывает, что было бы скопировано и какой PID был бы остановлен"
  exit 1
}

function Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Write-Host $line
  if ($script:LogFile) { try { Add-Content -Path $script:LogFile -Value $line -Encoding utf8 } catch {} }
}
function Fail($msg) {
  Log "ОШИБКА: $msg"
  Log "Выкладка ОСТАНОВЛЕНА."
  exit 1
}

$logDir = Join-Path $Target 'data\logs'
if (Test-Path (Join-Path $Target 'data')) {
  try { New-Item -ItemType Directory -Force $logDir | Out-Null } catch {}
  $script:LogFile = Join-Path $logDir "deploy-$(Get-Date -Format 'yyyy-MM-dd_HHmmss').log"
} else {
  $script:LogFile = Join-Path $env:TEMP "most-deploy-$(Get-Date -Format 'yyyy-MM-dd_HHmmss').log"
}
$tag = if ($DryRun) { '[DRY RUN] ' } else { '' }
Log "=== ${tag}Выкладка MOST: Source=$Source Target=$Target Port=$Port ==="

# ---------- 1) предполётная проверка ----------
if (-not (Test-Path $Source)) { Fail "Источник не найден: $Source" }
try {
  $status = & git -C $Source status --porcelain 2>&1
  if ($LASTEXITCODE -ne 0) { Fail "git status не сработал в $Source (это точно git-репозиторий?): $status" }
  if ($status) { Fail "В $Source есть незакоммиченные изменения - сначала закоммитьте или отмените их:`n$status" }
  $branch = (& git -C $Source branch --show-current 2>&1).Trim()
  if ($LASTEXITCODE -ne 0) { Fail "Не удалось определить текущую ветку в $Source" }
  if ($RequireBranch -and $branch -ne $RequireBranch) { Fail "Текущая ветка в $Source - '$branch', ожидалась '$RequireBranch'" }
  Log "git: чисто, ветка $branch"
} catch { Fail "Проверка git не удалась: $($_.Exception.Message)" }

$checkFiles = @()
if (Test-Path (Join-Path $Source 'server.js')) { $checkFiles += (Join-Path $Source 'server.js') }
$libDir = Join-Path $Source 'lib'
if (Test-Path $libDir) { $checkFiles += Get-ChildItem $libDir -Filter '*.js' -File | ForEach-Object { $_.FullName } }
$modulesDir = Join-Path $Source 'modules'
if (Test-Path $modulesDir) {
  foreach ($m in Get-ChildItem $modulesDir -Directory) {
    foreach ($f in 'server.js', 'domain.js', 'ui.js') {
      $p = Join-Path $m.FullName $f
      if (Test-Path $p) { $checkFiles += $p }
    }
  }
}
Log "node --check: $($checkFiles.Count) файлов"
$badFiles = @()
foreach ($f in $checkFiles) {
  & node --check $f 2>"$env:TEMP\most-deploy-checkerr.txt"
  if ($LASTEXITCODE -ne 0) {
    $checkErr = Get-Content "$env:TEMP\most-deploy-checkerr.txt" -Raw -ErrorAction SilentlyContinue
    $badFiles += "$f`n$checkErr"
  }
}
Remove-Item "$env:TEMP\most-deploy-checkerr.txt" -ErrorAction SilentlyContinue
if ($badFiles.Count -gt 0) { Fail "node --check не прошёл:`n$($badFiles -join "`n---`n")" }
Log "node --check: всё чисто"

# ---------- 2) бэкап целевой базы (если она уже есть) ----------
$targetDb = Join-Path $Target 'data\db.sqlite'
if (Test-Path $targetDb) {
  $backupFile = Join-Path $Target "data\backups\db-before-deploy-$(Get-Date -Format 'yyyy-MM-dd_HHmmss').sqlite"
  if ($DryRun) {
    Log "[DryRun] бэкап базы был бы сделан в $backupFile"
  } else {
    New-Item -ItemType Directory -Force (Split-Path $backupFile) | Out-Null
    $work = Join-Path $env:TEMP "most-deploy-js-$(Get-Date -Format 'yyyyMMddHHmmss')"
    New-Item -ItemType Directory -Force $work | Out-Null
    $jsFile = Join-Path $work 'vacuum.js'
    @'
const { DatabaseSync } = require('node:sqlite');
const [, , src, dst] = process.argv;
const db = new DatabaseSync(src, { readOnly: true });
db.exec("VACUUM INTO '" + dst.replace(/'/g, "''") + "'");
db.close();
'@ | Set-Content -Path $jsFile -Encoding utf8
    & node --no-warnings $jsFile $targetDb $backupFile
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $backupFile)) { Fail "Не удалось сделать бэкап базы перед выкладкой" }
    Log "бэкап базы: $backupFile"
  }
} else {
  Log "целевой базы data\db.sqlite ещё нет - бэкап пропущен (первая выкладка?)"
}

# ---------- 3) копирование кода: server.js, package.json, lib\, public\, modules\ ----------
# data\, seed\, tunnel.txt, tunnel-url.txt в целевой папке никогда не трогаются - их нет в этом списке.
if (-not $DryRun) { New-Item -ItemType Directory -Force $Target | Out-Null }
$robocopyFlag = if ($DryRun) { '/L' } else { '/MIR' }
if ($DryRun) {
  Log "[DryRun] server.js -> $(Join-Path $Target 'server.js')"
  if (Test-Path (Join-Path $Source 'package.json')) { Log "[DryRun] package.json -> $(Join-Path $Target 'package.json')" }
} else {
  Copy-Item (Join-Path $Source 'server.js') (Join-Path $Target 'server.js') -Force
  if (Test-Path (Join-Path $Source 'package.json')) { Copy-Item (Join-Path $Source 'package.json') (Join-Path $Target 'package.json') -Force }
}
foreach ($dir in 'lib', 'public', 'modules') {
  $srcDir = Join-Path $Source $dir
  if (-not (Test-Path $srcDir)) { continue }
  $dstDir = Join-Path $Target $dir
  $rcOut = & robocopy $srcDir $dstDir $robocopyFlag /NFL /NDL /NJH /NP
  if ($LASTEXITCODE -ge 8) { Fail "robocopy $dir завершился с ошибкой (код $LASTEXITCODE)" }
  if ($DryRun) { Log "[DryRun] $dir - изменений: $(($rcOut | Select-String '^\s+(Newer|New File|\*EXTRA)').Count)" }
}
if ($DryRun) { Log "[DryRun] копирование не выполнялось (только просмотр)" } else { Log "код скопирован: server.js, package.json (если был), lib\, public\, modules\" }

# файл VERSION в корне целевой папки - экран "Сервис" в интерфейсе читает его для owner/partner
$gitHash = (& git -C $Source rev-parse HEAD 2>&1).Trim()
$versionContent = "commit=$gitHash`nbranch=$branch`ndeployed=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n"
if ($DryRun) {
  Log "[DryRun] VERSION был бы записан: commit=$gitHash branch=$branch"
} else {
  Set-Content -Path (Join-Path $Target 'VERSION') -Value $versionContent -Encoding utf8 -NoNewline
  Log "VERSION записан: commit=$gitHash branch=$branch"
}

# ---------- 4) перезапуск: только дочерний процесс под serve-local.js ----------
$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $conn) {
  Log "На порту $Port никто не слушает - запускать сервер должен директор сам (start-server.bat)."
} else {
  $childPid = $conn.OwningProcess
  $child = Get-CimInstance Win32_Process -Filter "ProcessId=$childPid" -ErrorAction SilentlyContinue
  $parentPid = if ($child) { $child.ParentProcessId } else { $null }
  $parent = if ($parentPid) { Get-CimInstance Win32_Process -Filter "ProcessId=$parentPid" -ErrorAction SilentlyContinue } else { $null }

  $confirmed = $false
  $reason = ''
  if ($parent -and $parent.Name -eq 'node.exe') {
    # CommandLine чужого процесса кросс-сессийно может не читаться (пустая строка) - не полагаемся на него.
    # Основной признак: сама обёртка пишет свой pid в data\logs\serve-local.pid при старте.
    $pidFile = Join-Path $Target 'data\logs\serve-local.pid'
    if (Test-Path $pidFile) {
      $wrapperPid = (Get-Content $pidFile -Raw -ErrorAction SilentlyContinue).Trim()
      if ($wrapperPid -eq [string]$parentPid) { $confirmed = $true; $reason = "pid-файл обёртки (data\logs\serve-local.pid) = $parentPid" }
    }
    if (-not $confirmed) {
      # запасной признак: время последнего запуска задачи "MOST Финансы - локально" близко к старту родителя
      try {
        $task = Get-ScheduledTaskInfo -TaskName 'MOST Финансы - локально' -ErrorAction Stop
        $parentStart = (Get-Process -Id $parentPid -ErrorAction Stop).StartTime
        if ($task.LastRunTime -and [math]::Abs(($task.LastRunTime - $parentStart).TotalMinutes) -le 5) {
          $confirmed = $true; $reason = "время запуска задачи «MOST Финансы - локально» совпадает со стартом родителя (вторичный признак, не такой надёжный, как pid-файл)"
        }
      } catch {}
    }
  }

  if ($confirmed) {
    if ($DryRun) {
      Log "[DryRun] был бы остановлен только PID $childPid (родитель $parentPid подтверждён: $reason); обёртка подняла бы новый код сама"
    } else {
      Log "порт $Port держит PID $childPid, родитель $parentPid подтверждён как обёртка serve-local.js ($reason). Останавливаю только $childPid."
      Stop-Process -Id $childPid -Force
    }
  } else {
    Log "Не удалось однозначно подтвердить, что процесс на порту $Port (PID $childPid, родитель $parentPid) управляется обёрткой serve-local.js."
    Log "Код скопирован, но перезапуск делать не буду - снимите процесс PID $childPid в Диспетчере задач сами, если хотите поднять новую версию сейчас."
    Log "=== ${tag}Выкладка завершена (код обновлён, перезапуск - вручную) ==="
    exit 0
  }
}

if ($DryRun) {
  Log "=== [DRY RUN] Проверка завершена, ничего не менялось ==="
  exit 0
}

# ---------- 5) ждём /api/status на Port и Port+1 ----------
$erpPort = $Port + 1
$deadline = (Get-Date).AddSeconds(30)
$finOk = $false; $erpOk = $false; $status = $null
while ((Get-Date) -lt $deadline -and -not ($finOk -and $erpOk)) {
  Start-Sleep -Milliseconds 1000
  if (-not $finOk) { try { $status = Invoke-RestMethod -Uri "http://localhost:$Port/api/status" -TimeoutSec 3; $finOk = $true } catch {} }
  if (-not $erpOk) { try { Invoke-RestMethod -Uri "http://localhost:$erpPort/api/status" -TimeoutSec 3 | Out-Null; $erpOk = $true } catch {} }
}
if (-not $finOk) {
  Log "Сайт Финансы (порт $Port) не ответил за 30 секунд после выкладки."
  Log "Откат кода вручную (checkout прошлого коммита и выкладка заново) - если дело в базе, восстановите её из бэкапа выше в data\backups\."
  exit 1
}
Log "сайт Финансы (порт $Port) ответил: версия $($status.version), включённые модули: $((($status.modules | Where-Object on) | ForEach-Object id) -join ', ')"
if ($erpOk) { Log "сайт MOST ERP (порт $erpPort) тоже ответил" } else { Log "сайт MOST ERP (порт $erpPort) НЕ ответил за 30 секунд - проверьте отдельно" }
Log "=== Выкладка завершена успешно ==="
