// Мост WhatsApp -> MOST ERP. Отдельный процесс рядом с ERP (docker-compose, сервис wa-bridge).
// Читает номер-архивариус как «связанное устройство» (библиотека Baileys) и передаёт в ERP:
//   группы  -> POST <ERP>/api/pm/chats/ingest          (вкладка «Переписка» проекта, файлы в папку проекта)
//   личные  -> POST <FIN>/api/crm/inbox/ingest         («Коммерция» -> «Обращения»)
// Сам в WhatsApp ничего не пишет, не отмечает «прочитано», не показывает «в сети».
// Ключ ERP мост создаёт сам и хранит в своей папке данных; владелец подтверждает его по коду в Настройках ERP.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, downloadMediaMessage, extractMessageContent, getContentType, Browsers } from 'baileys';

const ERP = (process.env.ERP_URL || 'http://most-finance:3001').replace(/\/+$/, '');
const FIN = (process.env.FIN_URL || 'http://most-finance:3000').replace(/\/+$/, '');
const DATA = process.env.WA_DATA || path.join(process.cwd(), 'data');
const PHONE = String(process.env.WA_PHONE || '').replace(/\D/g, ''); // номер архивариуса, только цифры: 7701… — для привязки по коду
const HISTORY = process.env.WA_HISTORY !== '0'; // грузить историю, которую WhatsApp отдаёт при привязке
const MAX_FILE = 20 * 1024 * 1024;
fs.mkdirSync(path.join(DATA, 'auth'), { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);
const quiet = { level: 'silent', child() { return quiet; }, trace() { }, debug() { }, info() { }, warn() { }, error() { }, fatal() { } };

// ---------- ключ ERP: создаётся здесь, наружу уходит только sha256 ----------
const TOKEN_FILE = path.join(DATA, 'erp-token');
let TOKEN = '';
try { TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { }
async function pairErp() {
  if (!TOKEN) { TOKEN = 'most_' + crypto.randomBytes(32).toString('hex'); fs.writeFileSync(TOKEN_FILE, TOKEN + '\n', { mode: 0o600 }); }
  const hash = crypto.createHash('sha256').update(TOKEN).digest('hex');
  const r = await fetch(FIN + '/api/tokens/pair', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ hash, name: 'WhatsApp-мост' }) });
  const j = await r.json().catch(() => ({}));
  if (r.ok) log(`ERP: ключ ждёт подтверждения. Настройки -> «Ключи для ИИ» -> код ${j.code}`); else log('ERP: запрос ключа отклонён:', r.status, j.error || '');
}
async function erp(base, p, body) {
  const r = await fetch(base + '/api' + p, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text(); let j = {}; try { j = JSON.parse(txt); } catch { }
  return { status: r.status, ok: r.ok, json: j };
}
let erpReady = false;
async function ensureErp() {
  if (TOKEN) { const r = await erp(ERP, '/me').catch(() => null); if (r && r.ok && r.json.user) { if (!erpReady) log('ERP: ключ действует, пользователь', r.json.user.login); erpReady = true; return true; } }
  erpReady = false; await pairErp().catch(e => log('ERP недоступна:', e.message)); return false;
}

// ---------- очередь отправки: ERP недоступна -> копим на диске и повторяем ----------
const OUTBOX = path.join(DATA, 'outbox'); fs.mkdirSync(OUTBOX, { recursive: true });
let seq = 0;
function enqueue(kind, payload) { const f = path.join(OUTBOX, `${Date.now()}-${String(seq++).padStart(5, '0')}-${kind}.json`); fs.writeFileSync(f, JSON.stringify(payload)); }
let flushing = false;
async function flush() {
  if (flushing) return; flushing = true;
  try {
    if (!erpReady && !(await ensureErp())) return;
    for (const f of fs.readdirSync(OUTBOX).sort()) {
      const full = path.join(OUTBOX, f); let payload; try { payload = JSON.parse(fs.readFileSync(full, 'utf8')); } catch { fs.unlinkSync(full); continue; }
      const isGroup = f.endsWith('-group.json');
      const r = await erp(isGroup ? ERP : FIN, isGroup ? '/pm/chats/ingest' : '/crm/inbox/ingest', payload).catch(e => ({ status: 0, err: e.message }));
      if (r.ok || r.status === 400 || r.status === 413) { if (!r.ok) log('ERP отклонила пачку', f, r.status, r.json && r.json.error); fs.unlinkSync(full); continue; } // 400/413 повтором не лечатся
      if (r.status === 401 || r.status === 403) erpReady = false;
      log('ERP не приняла пачку, повторю позже:', r.status || r.err); break;
    }
  } finally { flushing = false; }
}
setInterval(() => flush().catch(() => { }), 20000);

// ---------- состояние для раздела «WhatsApp» в ERP ----------
let state = 'disconnected', info = '';
async function report() { if (erpReady) await erp(ERP, '/pm/chats/ingest-status', { state, at: new Date().toISOString(), info: info.slice(0, 200) }).catch(() => { }); }
setInterval(() => report(), 5 * 60 * 1000);

// ---------- группы: названия и «не грузить» ----------
const groupNames = new Map(); let muted = new Set();
async function refreshMuted() { if (!erpReady) return; const r = await erp(ERP, '/pm/chats').catch(() => null); const list = r && r.ok ? (Array.isArray(r.json) ? r.json : r.json.chats || r.json.items || []) : []; muted = new Set(list.filter(c => c.muted).map(c => c.extId)); }
setInterval(() => refreshMuted().catch(() => { }), 10 * 60 * 1000);

// ---------- разбор сообщения ----------
const phoneOf = jid => { const m = String(jid || '').match(/^(\d{7,15})(?::\d+)?@(s\.whatsapp\.net|c\.us)$/); return m ? '+' + m[1] : ''; };
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'video/mp4': 'mp4' };
function parse(msg) {
  const content = extractMessageContent(msg.message); if (!content) return null;
  const type = getContentType(content); if (!type || type === 'protocolMessage' || type === 'reactionMessage' || type === 'senderKeyDistributionMessage' || type === 'pollUpdateMessage') return null;
  const m = content[type] || {}; let text = '', kind = 'text', media = null;
  if (type === 'conversation') text = content.conversation || '';
  else if (type === 'extendedTextMessage') text = m.text || '';
  else if (type === 'imageMessage') { kind = 'image'; text = m.caption || ''; media = { mime: m.mimetype || 'image/jpeg', name: '', size: Number(m.fileLength || 0) }; }
  else if (type === 'documentMessage' || type === 'documentWithCaptionMessage') { const d = type === 'documentMessage' ? m : ((m.message || {}).documentMessage || {}); kind = 'doc'; text = d.caption || ''; media = { mime: d.mimetype || 'application/octet-stream', name: d.fileName || '', size: Number(d.fileLength || 0) }; }
  else if (type === 'audioMessage') { kind = 'audio'; media = { mime: (m.mimetype || 'audio/ogg').split(';')[0], name: '', size: Number(m.fileLength || 0) }; }
  else if (type === 'videoMessage') { kind = 'video'; text = m.caption || ''; media = { mime: m.mimetype || 'video/mp4', name: '', size: Number(m.fileLength || 0) }; }
  else if (type === 'locationMessage' || type === 'liveLocationMessage') text = `[геометка ${m.degreesLatitude}, ${m.degreesLongitude}]`;
  else if (type === 'contactMessage') text = `[контакт: ${m.displayName || ''}]`;
  else if (type === 'pollCreationMessage' || type === 'pollCreationMessageV3') text = `[опрос: ${m.name || ''}]`;
  else if (type === 'stickerMessage') text = '[стикер]';
  else text = `[${type.replace(/Message$/, '')}]`;
  const ctx = m.contextInfo || {}; let quoted = '';
  if (ctx.quotedMessage) { const qc = extractMessageContent(ctx.quotedMessage) || {}; const qt = getContentType(qc); quoted = String(qc.conversation || (qc[qt] || {}).text || (qc[qt] || {}).caption || (qt ? `[${qt.replace(/Message$/, '')}]` : '')).slice(0, 200); }
  return { text: String(text).slice(0, 8000), kind, media, quoted };
}
async function fileOf(sock, msg, p, { video }) {
  if (!p.media) return [];
  if (p.kind === 'video' && !video) return [];
  if (p.media.size > MAX_FILE) return [];
  try {
    const buf = await downloadMediaMessage(msg, 'buffer', {}, { logger: quiet, reuploadRequest: sock.updateMediaMessage });
    if (!buf || buf.length > MAX_FILE) return [];
    const ext = EXT[p.media.mime] || (p.media.name.split('.').pop() || 'bin');
    const name = p.media.name || `${p.kind}-${new Date(Number(msg.messageTimestamp) * 1000).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
    return [{ name, type: p.media.mime, data: buf.toString('base64') }];
  } catch (e) { log('файл не скачан:', e.message); return []; }
}

async function handle(sock, msg, { history }) {
  const jid = msg.key && msg.key.remoteJid; if (!jid || !msg.message) return;
  if (jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return;
  const p = parse(msg); if (!p) return;
  const ts = Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000);
  const old = history && Date.now() / 1000 - ts > 14 * 86400; // файлы из истории — только за последние две недели
  if (jid.endsWith('@g.us')) {
    if (muted.has(jid)) return;
    if (!groupNames.has(jid)) { try { groupNames.set(jid, (await sock.groupMetadata(jid)).subject || jid); } catch { groupNames.set(jid, jid); } }
    const who = msg.key.participantAlt || msg.key.participant || '';
    const files = old ? [] : await fileOf(sock, msg, p, { video: false });
    enqueue('group', { source: 'whatsapp', chat: { extId: jid, name: groupNames.get(jid) }, messages: [{ extId: msg.key.id, ts, author: msg.key.fromMe ? 'MOST (архив)' : (msg.pushName || phoneOf(who) || 'участник'), phone: phoneOf(who), text: p.text, quoted: p.quoted, kind: p.kind, files }] });
  } else {
    const contact = msg.key.remoteJidAlt && /@s\.whatsapp\.net$/.test(msg.key.remoteJidAlt) ? msg.key.remoteJidAlt : jid;
    const files = old ? [] : await fileOf(sock, msg, p, { video: true });
    enqueue('direct', { source: 'whatsapp', contact: { extId: contact, phone: phoneOf(contact), name: msg.key.fromMe ? '' : (msg.pushName || '') }, messages: [{ extId: msg.key.id, ts, fromMe: !!msg.key.fromMe, text: p.text, kind: p.kind, files }] });
  }
}

// ---------- подключение ----------
let backoff = 2000, asked = false;
async function start() {
  const { state: auth, saveCreds } = await useMultiFileAuthState(path.join(DATA, 'auth'));
  const sock = makeWASocket({ auth, logger: quiet, browser: Browsers.ubuntu('MOST ERP'), markOnlineOnConnect: false, syncFullHistory: HISTORY, generateHighQualityLinkPreview: false });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async u => {
    if (u.qr && !auth.creds.registered) {
      if (PHONE && !asked) { asked = true; try { const code = await sock.requestPairingCode(PHONE); state = 'qr'; info = `код привязки: ${code} — WhatsApp на телефоне архивариуса -> Связанные устройства -> Привязать по номеру телефона`; log(info); await report(); } catch (e) { asked = false; log('код привязки не получен:', e.message); } }
      else if (!PHONE) { state = 'qr'; info = 'не задан номер архивариуса (WA_PHONE) — привязка по коду невозможна'; log(info); await report(); }
    }
    if (u.connection === 'open') { backoff = 2000; asked = false; state = 'connected'; info = `подключён: ${phoneOf(sock.user && sock.user.id) || ''}`; log(info); await ensureErp(); await refreshMuted().catch(() => { }); await report(); flush().catch(() => { }); }
    if (u.connection === 'close') {
      const code = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode;
      state = 'disconnected'; info = code === DisconnectReason.loggedOut ? 'номер отвязан в WhatsApp — нужна привязка заново' : `соединение закрыто (${code || '?'})`; log(info); await report();
      if (code === DisconnectReason.loggedOut) { fs.rmSync(path.join(DATA, 'auth'), { recursive: true, force: true }); fs.mkdirSync(path.join(DATA, 'auth'), { recursive: true }); }
      asked = false; setTimeout(() => start().catch(e => log('start:', e.message)), backoff); backoff = Math.min(backoff * 2, 5 * 60 * 1000);
    }
  });
  sock.ev.on('messages.upsert', async ({ messages, type }) => { for (const m of messages) await handle(sock, m, { history: type !== 'notify' }).catch(e => log('сообщение не разобрано:', e.message)); flush().catch(() => { }); });
  if (HISTORY) sock.ev.on('messaging-history.set', async ({ messages }) => { log(`история: ${messages.length} сообщений`); for (const m of messages) await handle(sock, m, { history: true }).catch(() => { }); flush().catch(() => { }); });
  sock.ev.on('groups.update', ups => { for (const g of ups) if (g.id && g.subject) groupNames.set(g.id, g.subject); });
}

log(`Мост WhatsApp -> ERP. ERP ${ERP}, Финансы ${FIN}, данные ${DATA}, номер ${PHONE ? '+' + PHONE.slice(0, 4) + '…' : 'не задан'}`);
if (process.env.WA_SELFTEST === '1') { // проверка установки: библиотека загрузилась, ERP отвечает
  const r = await fetch(ERP + '/api/status').then(x => x.status).catch(e => 'нет связи: ' + e.message); log('самопроверка: библиотека на месте, ERP /api/status ->', r); process.exit(0);
}
if (process.env.WA_REPLAY) { // проверка без WhatsApp: проиграть сообщения из файла (формат Baileys) и отправить в ERP
  const fake = { groupMetadata: async jid => ({ subject: 'Тестовая группа ' + jid.slice(0, 4) }), updateMediaMessage: async () => { } };
  for (const m of JSON.parse(fs.readFileSync(process.env.WA_REPLAY, 'utf8'))) await handle(fake, m, { history: false });
  for (let i = 0; i < 60 && !(await ensureErp()); i++) await new Promise(r => setTimeout(r, 2000));
  await flush(); log('проиграно; в очереди осталось:', fs.readdirSync(OUTBOX).length); process.exit(0);
}
ensureErp().catch(() => { }).finally(() => start().catch(e => { log('start:', e.message); process.exit(1); }));
