'use strict';
// Модуль «Сервис»: /api/sys/*. Поток E. Контракт модулей — docs/ARCHITECTURE.md, задачи — modules/sys/README.md.
// Уведомления (Telegram/WhatsApp/почта) отложены решением директора (docs/ARCHITECTURE.md, «Решения директора»,
// 24.09.2026) — модуль отдаёт только статус сервера для экрана владельца «Состояние системы».
const fs = require('fs');
const path = require('path');

const VERSION = '2.0';

function tunnelUrl(dataDir) {
  try {
    const f = path.join(dataDir, 'tunnel-url.txt');
    if (!fs.existsSync(f)) return '';
    if (Date.now() - fs.statSync(f).mtimeMs > 7 * 864e5) return '';
    return fs.readFileSync(f, 'utf8').trim();
  } catch { return ''; }
}

function handle(ctx) {
  const { parts, method, user, err, ok, store: st } = ctx;
  if (!user) return err(401, 'Не авторизован');
  const [, a] = parts;

  if (a === 'status' && method === 'GET') {
    if (user.role !== 'owner') return err(403, 'Нет доступа');
    let dbSize = 0; try { dbSize = fs.statSync(st.DB_FILE).size; } catch { }
    const backups = st.listBackups();
    return ok({
      version: VERSION,
      dbFile: st.DB_FILE,
      dbSize,
      backupsDir: st.BACKUP_DIR,
      backupsCount: backups.length,
      lastBackup: backups[0] || null,
      tunnelUrl: tunnelUrl(st.DATA_DIR),
      devMode: !!process.env.DEV_USER,
    });
  }

  return err(404, 'Нет такого действия');
}

module.exports = { id: 'sys', api: 'sys', collections: [], handle };
