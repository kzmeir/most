#!/usr/bin/env node
'use strict';
/* Временный локальный автозапуск без Cloudflare Tunnel — пока сервер не перенесён на Docker/NAS
   (docs/DEPLOY.md, «Временный режим: ПК директора»). Держит node server.js живым: перезапуск при
   падении с нарастающей паузой (как tools/serve-internet.js, без туннеля), лог в
   data/logs/server-<yyyy-mm-dd>.log (дописывается), старые логи чистятся через LOG_KEEP_DAYS дней.
   Запуск: node tools/serve-local.js (или start-server.bat).
   Если сервер с этой же базой уже запущен (например, из сессии Claude) — server.js сам тихо
   завершится по data/server.lock; этот скрипт просто подождёт и попробует снова следующим
   перезапуском, без вмешательства в уже работающий процесс. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..');
const DATA = process.env.DATA_DIR || path.join(APP, 'data');
const LOG_DIR = path.join(DATA, 'logs');
const LOG_KEEP_DAYS = Number(process.env.LOG_KEEP_DAYS) || 14;
fs.mkdirSync(LOG_DIR, { recursive: true });

function logFile() { return path.join(LOG_DIR, `server-${new Date().toISOString().slice(0, 10)}.log`); }
function rotate() {
  const cutoff = Date.now() - LOG_KEEP_DAYS * 864e5;
  let files; try { files = fs.readdirSync(LOG_DIR); } catch { return; }
  for (const f of files) {
    if (!/^server-\d{4}-\d{2}-\d{2}\.log$/.test(f)) continue;
    const p = path.join(LOG_DIR, f);
    try { if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p); } catch { }
  }
}
function write(line) {
  const s = `${new Date().toISOString()} ${line}\n`;
  process.stdout.write(s);
  try { fs.appendFileSync(logFile(), s, 'utf8'); } catch { }
}

rotate();
setInterval(rotate, 6 * 3600e3).unref(); // раз в 6 часов — на случай, если процесс живёт сутками без перезапуска

// pid самой обёртки — для tools/deploy-to-server.ps1: так он отличает "родитель — эта обёртка" от
// случайно совпавшего по имени node.exe (CommandLine чужого процесса не всегда читается кросс-сессийно)
try { fs.writeFileSync(path.join(LOG_DIR, 'serve-local.pid'), String(process.pid), 'utf8'); } catch { }
write(`serve-local.js: обёртка запущена, pid=${process.pid}`);

let delay = 2000;
function start() {
  write('server: запуск');
  let child;
  try { child = spawn(process.execPath, [path.join(APP, 'server.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env }); }
  catch (e) { write(`server: не удалось запустить (${e.message}). Повтор через ${delay / 1000} с`); return setTimeout(start, delay); }
  const handle = buf => { for (const line of String(buf).split(/\r?\n/)) if (line.trim()) write(`[server] ${line}`); };
  child.stdout.on('data', handle); child.stderr.on('data', handle);
  child.on('error', e => write(`server: ошибка ${e.message}`));
  child.on('exit', code => {
    write(`server: завершился (код ${code}). Перезапуск через ${delay / 1000} с`);
    setTimeout(start, delay);
    delay = Math.min(delay * 2, 60000);
  });
  setTimeout(() => { delay = 2000; }, 60000); // проработал минуту без падений — сбросить паузу к минимуму
}
start();
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
