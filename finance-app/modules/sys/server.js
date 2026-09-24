'use strict';
// Модуль «Сервис»: /api/sys/*. Поток E. Контракт модулей — docs/ARCHITECTURE.md, задачи — modules/sys/README.md.
// Уведомления (Telegram/WhatsApp/почта) отложены решением директора (docs/ARCHITECTURE.md, «Решения директора»,
// 24.09.2026) — модуль отдаёт только статус сервера для экрана владельца/партнёра «Состояние системы». Только чтение.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP_VERSION = '2.0';
const STALE_BACKUP_HOURS = 36;
const BACKUP_TASK_NAME = 'MOST Финансы - бэкап';

function tunnelUrl(dataDir) {
  try {
    const f = path.join(dataDir, 'tunnel-url.txt');
    if (!fs.existsSync(f)) return '';
    if (Date.now() - fs.statSync(f).mtimeMs > 7 * 864e5) return '';
    return fs.readFileSync(f, 'utf8').trim();
  } catch { return ''; }
}

// последний бэкап с реальным временем изменения файла (не парсим имя - оно уже в UTC ISO-подобном виде,
// но mtime надёжнее, если файл когда-то скопировали/восстановили)
function lastBackupInfo(backupDir, name) {
  if (!name) return null;
  try {
    const st = fs.statSync(path.join(backupDir, name));
    const ageHours = (Date.now() - st.mtimeMs) / 3600e3;
    return { name, size: st.size, mtime: st.mtime.toISOString(), ageHours: Math.round(ageHours * 10) / 10, stale: ageHours > STALE_BACKUP_HOURS };
  } catch { return null; }
}

// Get-ScheduledTaskInfo - только чтение, задачу не запускает. Любая проблема (нет прав, задачи нет, не Windows) -> null.
function scheduledTaskInfo(name) {
  try {
    const ps = `try { $t = Get-ScheduledTaskInfo -TaskName '${name.replace(/'/g, "''")}' -ErrorAction Stop; ` +
      `[PSCustomObject]@{ lastRunTime = $t.LastRunTime.ToString('o'); lastTaskResult = $t.LastTaskResult } | ConvertTo-Json -Compress } catch { '{}' }`;
    const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 5000, windowsHide: true }).toString('utf8').trim();
    if (!out) return null;
    const obj = JSON.parse(out);
    if (!obj || !obj.lastRunTime) return null;
    return { lastRunTime: obj.lastRunTime, lastTaskResult: obj.lastTaskResult };
  } catch { return null; }
}

// PowerShell (Set-Content/Add-Content -Encoding utf8) пишет файлы с BOM - Node его не снимает сам
const stripBOM = s => s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;

function deployLogTail(dataDir, n) {
  try {
    const logsDir = path.join(dataDir, 'logs');
    const files = fs.readdirSync(logsDir).filter(f => /^deploy-.*\.log$/.test(f)).sort();
    if (!files.length) return null;
    const latest = files[files.length - 1];
    const lines = stripBOM(fs.readFileSync(path.join(logsDir, latest), 'utf8')).split(/\r?\n/).filter(Boolean);
    return { file: latest, lines: lines.slice(-n) };
  } catch { return null; }
}

// VERSION пишет tools/deploy-to-server.ps1 при выкладке, в корень приложения (рядом с server.js)
function readVersionFile() {
  try {
    const raw = stripBOM(fs.readFileSync(path.join(__dirname, '..', '..', 'VERSION'), 'utf8'));
    const out = {};
    for (const line of raw.split(/\r?\n/)) { const m = line.match(/^(\w+)=(.*)$/); if (m) out[m[1]] = m[2]; }
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

function diskSpace(dir) {
  try {
    const s = fs.statfsSync(dir);
    return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch { return null; }
}

function handle(ctx) {
  const { parts, method, user, err, ok, db, store: st } = ctx;
  if (!user) return err(401, 'Не авторизован');
  const [, a] = parts;

  if (a === 'status' && method === 'GET') {
    if (!['owner', 'partner'].includes(user.role)) return err(403, 'Нет доступа');
    let dbSize = 0; try { dbSize = fs.statSync(st.DB_FILE).size; } catch { }
    const backups = st.listBackups();
    const lastBackup = lastBackupInfo(st.BACKUP_DIR, backups[0] && backups[0].name);

    const split = !process.env.DEV_USER || !!process.env.DEV_SPLIT; // логика как в server.js: SPLIT
    const enabled = new Set((db.settings.enabledModules || []));
    const modules = Object.keys(ctx.modules).sort().map(id => {
      const on = !!process.env.DEV_USER || enabled.has(id);
      return { id, on, site: !on ? '—' : (split ? 'ERP' : 'все (один сайт, DEV_USER без DEV_SPLIT)') };
    });

    return ok({
      version: APP_VERSION,
      deployedVersion: readVersionFile(),
      dbFile: st.DB_FILE,
      dbSize,
      disk: diskSpace(st.DATA_DIR),
      backupsDir: st.BACKUP_DIR,
      backupsCount: backups.length,
      lastBackup,
      backupTask: scheduledTaskInfo(BACKUP_TASK_NAME),
      lastDeploy: deployLogTail(st.DATA_DIR, 20),
      uptimeSeconds: Math.round(process.uptime()),
      tunnelUrl: tunnelUrl(st.DATA_DIR),
      devMode: !!process.env.DEV_USER,
      site: split ? 'split (Финансы/ERP на разных портах)' : 'all (один порт, DEV_USER)',
      modules,
    });
  }

  return err(404, 'Нет такого действия');
}

module.exports = { id: 'sys', api: 'sys', collections: [], handle };
