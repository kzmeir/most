'use strict';
// Модуль «Сервис»: /api/sys/*. Поток E. Контракт модулей — docs/ARCHITECTURE.md, задачи — modules/sys/README.md.
const fs = require('fs');
const path = require('path');
const https = require('https');
const store = require('../../lib/store'); // тот же синглтон, что в server.js — нужен таймеру повторов вне запроса

const VERSION = '2.0';
const MAX_ATTEMPTS = 5;
const RETRY_MS = 5 * 60 * 1000; // повтор неотправленных уведомлений

function tunnelUrl(dataDir) {
  try {
    const f = path.join(dataDir, 'tunnel-url.txt');
    if (!fs.existsSync(f)) return '';
    if (Date.now() - fs.statSync(f).mtimeMs > 7 * 864e5) return '';
    return fs.readFileSync(f, 'utf8').trim();
  } catch { return ''; }
}

// настройки модуля живут в settings.sys (там же, где токены/ставки — секреты не коммитятся, см. CLAUDE.md)
function sysSettings(db) {
  if (!db.settings.sys || typeof db.settings.sys !== 'object') db.settings.sys = { telegramToken: '', chats: {} };
  if (!db.settings.sys.chats) db.settings.sys.chats = {};
  return db.settings.sys;
}

// ---------- Telegram ----------
function sendTelegram(token, chatId, text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true });
    const req = https.request({
      hostname: 'api.telegram.org', path: `/bot${token}/sendMessage`, method: 'POST', timeout: 10000,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let body = ''; res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 200) return resolve();
        let msg = `HTTP ${res.statusCode}`; try { msg = JSON.parse(body).description || msg; } catch { }
        reject(new Error(msg));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('таймаут')));
    req.write(payload); req.end();
  });
}

// одна попытка доставки одного элемента очереди; пишет результат в db и сохраняет
function deliver(db, item) {
  const s = sysSettings(db);
  const chatId = s.chats[item.userId];
  if (!s.telegramToken || !chatId) {
    item.status = 'skipped';
    item.lastError = !s.telegramToken ? 'не задан токен бота' : 'нет chat_id у пользователя';
    store.save();
    return Promise.resolve();
  }
  item.attempts = (item.attempts || 0) + 1;
  const text = item.link ? `${item.text}\n${item.link}` : item.text;
  return sendTelegram(s.telegramToken, chatId, text)
    .then(() => { item.status = 'sent'; item.sentAt = new Date().toISOString(); item.lastError = ''; })
    .catch(e => { item.lastError = e.message; item.status = item.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending'; })
    .finally(() => store.save());
}

// ctx.modules.sys.notify(ctx, { userIds, text, link }) — кладёт в очередь и сразу пробует отправить
function notify(ctx, { userIds, text, link } = {}) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))];
  const items = ids.map(userId => {
    const item = { id: ctx.store.id(), userId, text: String(text || ''), link: link || '', status: 'pending', attempts: 0, createdAt: new Date().toISOString(), lastError: '' };
    ctx.db.sysOutbox.push(item);
    return item;
  });
  ctx.store.save();
  for (const item of items) deliver(ctx.db, item).catch(() => { });
  return items;
}

// фоновый повтор: пока сообщение «pending» и попыток меньше лимита — пробуем снова каждые RETRY_MS
setInterval(() => {
  const db = store.get();
  for (const item of db.sysOutbox) if (item.status === 'pending' && (item.attempts || 0) < MAX_ATTEMPTS) deliver(db, item).catch(() => { });
}, RETRY_MS).unref();

function outboxCounts(list) {
  const c = { pending: 0, sent: 0, failed: 0, skipped: 0, total: list.length };
  for (const o of list) if (c[o.status] !== undefined) c[o.status]++;
  return c;
}

function handle(ctx) {
  const { parts, method, user, db, store: st, body, ok, err } = ctx;
  if (!user) return err(401, 'Не авторизован');
  const owner = user.role === 'owner';
  const [, a, b, c] = parts;

  if (a === 'status' && method === 'GET') {
    if (!owner) return err(403, 'Нет доступа');
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
      outbox: outboxCounts(db.sysOutbox),
    });
  }

  if (a === 'outbox' && !b && method === 'GET') {
    if (!owner) return err(403, 'Нет доступа');
    return ok(db.sysOutbox.slice(-200).slice().reverse());
  }
  if (a === 'outbox' && b && c === 'retry' && method === 'POST') {
    if (!owner) return err(403, 'Нет доступа');
    const item = db.sysOutbox.find(o => o.id === b); if (!item) return err(404, 'Не найдено');
    item.status = 'pending';
    deliver(db, item).catch(() => { });
    return ok(item);
  }

  if (a === 'settings') {
    if (!owner) return err(403, 'Только владелец');
    const s = sysSettings(db);
    const out = () => ({ hasToken: !!s.telegramToken, tokenTail: s.telegramToken ? s.telegramToken.slice(-4) : '', chats: s.chats });
    if (method === 'GET') return ok(out());
    if (method === 'PUT') {
      if (typeof body.telegramToken === 'string' && body.telegramToken.trim()) s.telegramToken = body.telegramToken.trim();
      if (body.telegramToken === '') s.telegramToken = '';
      if (body.chats && typeof body.chats === 'object') {
        const add = Object.fromEntries(Object.entries(body.chats).map(([k, v]) => [k, String(v == null ? '' : v).trim()]).filter(([, v]) => v));
        Object.assign(s.chats, add);
      }
      st.save(); st.audit(user.id, 'update', 'sysSettings', null);
      return ok(out());
    }
  }

  if (a === 'notify' && b === 'test' && method === 'POST') {
    if (!owner) return err(403, 'Нет доступа');
    const items = notify(ctx, { userIds: [user.id], text: body.text || 'Тестовое уведомление MOST ERP', link: body.link || '' });
    return ok({ sent: items.length, items });
  }

  return err(404, 'Нет такого действия');
}

module.exports = { id: 'sys', api: 'sys', collections: ['sysOutbox'], handle, notify };
