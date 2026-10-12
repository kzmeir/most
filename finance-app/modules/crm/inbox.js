'use strict';
// «Обращения» модуля «Коммерция»: личные сообщения номеру WhatsApp бюро («архивариус») → диалоги и сделки.
// Служба-мост (отдельный процесс, не в этом репозитории) шлёт сообщения на POST /api/crm/inbox/ingest; здесь — только сторона ERP.
// Коллекции: crmInbox (диалог с контактом), crmInboxMessages (сообщения). Файлы — DATA_DIR/crm-files/inbox/<id диалога>/, в базе только ключи.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('./domain');

const MAX_MSGS = 100, MAX_REQ = 25 * 1024 * 1024, MAX_FILE = 20 * 1024 * 1024, MAX_TEXT = 8000, MAX_MSG_FILES = 10, FEED = 500;
const at = (b, o, s) => b.length >= o + s.length && b.slice(o, o + s.length).toString('latin1') === s;
const zip = b => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
const ole = b => b.length > 8 && b.readUInt32BE(0) === 0xD0CF11E0;
const jpg = b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const mp4 = b => at(b, 4, 'ftyp');
// что принимаем: картинки, PDF, офисные документы, dwg (как остальная «Коммерция» и ядро) + голосовые и видео WhatsApp. Сигнатура сверяется с расширением.
const TYPES = {
  jpg: { type: 'image/jpeg', sig: jpg, inline: true }, jpeg: { type: 'image/jpeg', sig: jpg, inline: true },
  png: { type: 'image/png', sig: b => at(b, 1, 'PNG'), inline: true }, webp: { type: 'image/webp', sig: b => at(b, 0, 'RIFF') && at(b, 8, 'WEBP'), inline: true }, gif: { type: 'image/gif', sig: b => at(b, 0, 'GIF8'), inline: true },
  pdf: { type: 'application/pdf', sig: b => at(b, 0, '%PDF-'), inline: true },
  docx: { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sig: zip }, xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sig: zip }, pptx: { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', sig: zip },
  doc: { type: 'application/msword', sig: ole }, xls: { type: 'application/vnd.ms-excel', sig: ole }, ppt: { type: 'application/vnd.ms-powerpoint', sig: ole },
  dwg: { type: 'application/acad', sig: b => at(b, 0, 'AC10') },
  ogg: { type: 'audio/ogg', sig: b => at(b, 0, 'OggS') }, opus: { type: 'audio/ogg', sig: b => at(b, 0, 'OggS') },
  mp3: { type: 'audio/mpeg', sig: b => at(b, 0, 'ID3') || (b.length > 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  m4a: { type: 'audio/mp4', sig: mp4 }, mp4: { type: 'video/mp4', sig: mp4 },
};
const IMG = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
// у файла из WhatsApp часто нет имени — расширение берём из MIME
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf', 'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'video/mp4': 'mp4', 'application/msword': 'doc', 'application/vnd.ms-excel': 'xls', 'application/vnd.ms-powerpoint': 'ppt', 'application/acad': 'dwg', 'image/vnd.dwg': 'dwg', 'application/x-dwg': 'dwg' };
for (const k of ['docx', 'xlsx', 'pptx']) MIME_EXT[TYPES[k].type] = k;
const KEY_RE = /^[a-z0-9]+-[a-f0-9]{8}\.[a-z0-9]{2,5}$/;
const GROUP_RE = /@(g\.us|broadcast|newsletter)$/;
const dirOf = (ctx, id) => path.join(ctx.store.DATA_DIR, 'crm-files', 'inbox', String(id).replace(/[^\w-]/g, ''));
const b64len = s => Math.floor(s.length * 3 / 4);

// время сообщения: секунды или миллисекунды Unix, либо ISO-строка → ISO; иначе ''
function isoTs(v) {
  if (v == null || v === '') return '';
  let n = typeof v === 'number' ? v : /^\d+(\.\d+)?$/.test(String(v).trim()) ? Number(v) : NaN;
  if (!isNaN(n)) { if (n < 1e11) n *= 1000; } else n = Date.parse(String(v));
  if (!isFinite(n) || n < Date.UTC(2009, 0, 1) || n > Date.now() + 2 * 864e5) return '';
  return new Date(n).toISOString();
}
// файл из запроса → { name, kind, type, data } или { name, rejected: 'причина' } (сообщение при этом принимается)
function fileIn(f) {
  let name = String((f && f.name) || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  const mime = String((f && f.type) || '').toLowerCase().split(';')[0].trim();
  let ext = ((name.match(/\.([a-z0-9]{2,5})$/i) || [])[1] || '').toLowerCase();
  if (!TYPES[ext] && MIME_EXT[mime]) { ext = MIME_EXT[mime]; name = (name || 'файл') + '.' + ext; }
  if (!name) name = 'файл';
  const t = TYPES[ext]; if (!t) return { name, rejected: 'тип файла не принимается' };
  const b64 = String((f && f.data) || '').replace(/^data:[^,]*,/, '');
  if (b64len(b64) > MAX_FILE + 4) return { name, rejected: 'файл больше 20 МБ' };
  const data = Buffer.from(b64, 'base64'); if (!data.length) return { name, rejected: 'пустой файл' };
  if (data.length > MAX_FILE) return { name, rejected: 'файл больше 20 МБ' };
  if (!t.sig(data)) return { name, rejected: 'содержимое не совпадает с расширением' };
  return { name, kind: ext, type: t.type, data };
}

const msgsOf = (db, id) => db.crmInboxMessages.filter(m => m.inboxId === id).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
// сводные поля диалога по его сообщениям: первое/последнее, число, счёт «похоже на заказ» (по входящим)
function recalc(db, d) {
  const ms = msgsOf(db, d.id); const inc = ms.filter(m => !m.fromMe);
  d.count = ms.length; d.firstAt = ms.length ? ms[0].ts : d.firstAt || ''; d.lastAt = ms.length ? ms[ms.length - 1].ts : d.lastAt || '';
  const label = m => m.text || (m.files && m.files.length ? `[${m.files.map(f => f.name).join(', ')}]` : `[${m.kind}]`);
  const first = inc.find(m => m.text) || inc[0] || ms[0]; const last = ms[ms.length - 1];
  d.firstText = first ? label(first).slice(0, 400) : ''; d.lastText = last ? label(last).slice(0, 400) : ''; d.lastFromMe = !!(last && last.fromMe);
  const sc = C.inboxScore(inc.map(m => m.text)); d.score = sc.score; d.words = sc.words;
}
// сделка с тем же телефоном: текущая, то есть не в отказе; сначала сделки в работе, затем подписанные, из равных — самая новая
function matchLead(db, phone) {
  if (!phone) return null;
  const hits = db.crmLeads.filter(l => l.status !== 'Отказ' && C.phonesIn(`${l.phone || ''} ; ${l.contact || ''}`).includes(phone));
  hits.sort((a, b) => (C.OPEN(b.status) - C.OPEN(a.status)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return hits[0] || null;
}
const histNote = (l, userId, note) => { (l.history = l.history || []).push({ at: new Date().toISOString(), by: userId, status: l.status, note }); };

// ---- приём от моста ----
function ingest(ctx) {
  const { db, store, user, ok, err } = ctx; const body = ctx.body || {};
  if (!C.canIngest(user)) return err(403, 'Принимать обращения может только руководитель (или его ключ ИИ)');
  const source = String(body.source || 'whatsapp').toLowerCase(); if (source !== 'whatsapp') return err(400, 'Неизвестный источник: принимается только source = "whatsapp"');
  const ct = body.contact && typeof body.contact === 'object' ? body.contact : {};
  const extId = String(ct.extId || '').trim().toLowerCase().replace(/:\d+(?=@)/, '').slice(0, 120);
  if (!extId) return err(400, 'Нет contact.extId (JID контакта)');
  if (GROUP_RE.test(extId)) return err(400, `Групповые чаты и рассылки сюда не принимаются (${extId}): группы принимает модуль «Проекты» (pm), «Обращения» — только личные сообщения`);
  const list = body.messages; if (!Array.isArray(list) || !list.length) return err(400, 'Нет сообщений (messages)');
  if (list.length > MAX_MSGS) return err(413, `Не больше ${MAX_MSGS} сообщений за запрос (пришло ${list.length}) — разбейте на части`);
  // сначала проверяем весь запрос — частично принятых запросов не бывает
  let total = 0; const seen = new Set(); const clean = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i] || {}; const id = String(m.extId || '').trim().slice(0, 200); if (!id) return err(400, `Сообщение ${i + 1}: нет extId`);
    const ts = isoTs(m.ts); if (!ts) return err(400, `Сообщение ${i + 1} (${id}): нет или неверное время ts — секунды/миллисекунды Unix или ISO`);
    const files = Array.isArray(m.files) ? m.files : []; if (files.length > MAX_MSG_FILES) return err(400, `Сообщение ${i + 1} (${id}): не больше ${MAX_MSG_FILES} файлов`);
    for (const f of files) total += b64len(String((f && f.data) || '').replace(/^data:[^,]*,/, ''));
    if (seen.has(id)) continue; seen.add(id);
    const kind = C.INBOX_KINDS.includes(m.kind) ? m.kind : files.length ? 'doc' : 'text';
    clean.push({ extId: id, ts, fromMe: m.fromMe === true || m.fromMe === 'true' || m.fromMe === 1, text: String(m.text == null ? '' : m.text).slice(0, MAX_TEXT), kind, files });
  }
  if (total > MAX_REQ) return err(413, `Файлов в запросе больше 25 МБ (${Math.round(total / 1048576)} МБ) — отправляйте меньшими частями`);
  const jidPhone = /@(s\.whatsapp\.net|c\.us)$/.test(extId) ? C.normPhone(extId) : ''; // у JID вида …@lid телефона нет
  const phone = C.normPhone(ct.phone) || jidPhone; const name = String(ct.name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const now = new Date().toISOString();
  let d = db.crmInbox.find(x => x.source === source && x.extId === extId) || (phone ? db.crmInbox.find(x => x.source === source && x.phone === phone) : null);
  const created = !d;
  if (!d) { d = { id: store.id(), source, extId, phone, name, leadId: '', status: 'new', firstAt: '', lastAt: '', count: 0, unread: 0, score: 0, words: [], createdAt: now }; db.crmInbox.push(d); }
  else { if (name && name !== d.name) d.name = name; if (phone && !d.phone) d.phone = phone; }
  const have = new Set(db.crmInboxMessages.filter(m => m.inboxId === d.id).map(m => m.extId));
  let added = 0, incoming = 0, dup = 0, nfiles = 0; const rejected = []; const dir = dirOf(ctx, d.id);
  for (const m of clean) {
    if (have.has(m.extId)) { dup++; continue; }
    const files = [];
    for (const raw of m.files) {
      const f = fileIn(raw);
      if (f.rejected) { rejected.push({ extId: m.extId, name: f.name, reason: f.rejected }); files.push({ name: f.name, rejected: f.rejected }); continue; }
      fs.mkdirSync(dir, { recursive: true });
      const key = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${f.kind}`; fs.writeFileSync(path.join(dir, key), f.data);
      files.push({ key, name: f.name, kind: f.kind, type: f.type, size: f.data.length, sha: crypto.createHash('sha256').update(f.data).digest('hex') }); nfiles++;
    }
    db.crmInboxMessages.push({ id: store.id(), inboxId: d.id, extId: m.extId, ts: m.ts, fromMe: m.fromMe, text: m.text, kind: m.kind, files, createdAt: now });
    have.add(m.extId); added++; if (!m.fromMe) incoming++;
  }
  dup += list.length - clean.length; // повторы внутри самого запроса
  if (added) { recalc(db, d); if (d.status !== 'ignored') d.unread = (d.unread || 0) + incoming; d.updatedAt = now; }
  // «новый заказ»: телефон есть в текущей сделке — переписка привязывается к ней, новой сделки не будет. «Не заказ» новые сообщения не воскрешают.
  let linked = false;
  if (d.status === 'new' && !d.leadId) { const l = matchLead(db, d.phone); if (l) { d.leadId = l.id; d.status = 'lead'; d.linkedAt = now; d.linkedBy = 'auto'; histNote(l, user.id, `WhatsApp: переписка с ${C.fmtPhone(d.phone)} привязана по номеру телефона`); linked = true; } }
  if (created || added || linked) { store.save(); store.audit(user.id, 'ingest', 'crmInbox', d.id, { added, duplicates: dup, files: nfiles, rejected: rejected.length, created, linked }); }
  return ok({ ok: true, inboxId: d.id, created, status: d.status, leadId: d.leadId || '', added, duplicates: dup, files: nfiles, rejectedFiles: rejected, score: d.score || 0, words: d.words || [] });
}

// ---- отдача ----
const fileOut = f => f.rejected ? { name: f.name, rejected: f.rejected } : { key: f.key, name: f.name, kind: f.kind, size: f.size, image: IMG.includes(f.kind) };
const msgOut = m => ({ id: m.id, extId: m.extId, ts: m.ts, fromMe: !!m.fromMe, text: m.text || '', kind: m.kind, files: (m.files || []).map(fileOut) });
function dialogOut(ctx, d, H) {
  const l = d.leadId && ctx.db.crmLeads.find(x => x.id === d.leadId);
  return { id: d.id, source: d.source, extId: d.extId, phone: d.phone || '', phoneText: C.fmtPhone(d.phone), name: d.name || '', leadId: d.leadId || '', status: d.status, statusName: C.INBOX_STATUS[d.status] || d.status,
    firstAt: d.firstAt || '', lastAt: d.lastAt || '', count: d.count || 0, unread: d.unread || 0, score: d.score || 0, words: d.words || [], level: C.inboxLevel(d.score || 0), firstText: d.firstText || '', lastText: d.lastText || '', lastFromMe: !!d.lastFromMe, linkedBy: d.linkedBy || '',
    lead: l && H.canSee(l) ? { id: l.id, no: l.no, client: l.client || '', object: l.object || '', status: l.status } : null };
}
// переписка для карточки сделки: диалоги, привязанные к лиду, с последними сообщениями
function threadsOfLead(ctx, leadId, n) {
  return ctx.db.crmInbox.filter(d => d.leadId === leadId).sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)))
    .map(d => ({ id: d.id, name: d.name || '', phoneText: C.fmtPhone(d.phone), count: d.count || 0, unread: d.unread || 0, lastAt: d.lastAt || '', messages: msgsOf(ctx.db, d.id).slice(-(n || 5)).map(msgOut) }));
}
// лид удалён — его диалоги возвращаются в «Обращения» (переписка не теряется)
function onLeadDeleted(db, leadId) { let n = 0; for (const d of db.crmInbox) if (d.leadId === leadId) { d.leadId = ''; d.status = 'new'; d.linkedBy = ''; n++; } return n; }
const counts = db => { const o = { new: 0, lead: 0, ignored: 0 }; for (const d of db.crmInbox) if (d.status in o) o[d.status]++; return o; };

// ---- /api/crm/inbox/* ; H — помощники из server.js: { editor, canSee(lead), leadOut(lead), nextNo(), today } ----
function handle(ctx, H) {
  const { parts, method, db, store, user, ok, err } = ctx; const body = ctx.body || {}; const qs = ctx.qs || {};
  const [, , b, c, e] = parts;
  if (b === 'ingest') return method === 'POST' ? ingest(ctx) : err(405, 'Приём обращений — только POST');
  const canSeeD = d => H.editor || (!!d.leadId && !!db.crmLeads.find(l => l.id === d.leadId && H.canSee(l))); // ПМ — только переписка своих сделок
  if (!b && method === 'GET') {
    const st = qs.status || ''; const rows = db.crmInbox.filter(d => canSeeD(d) && (!st || d.status === st)).sort((x, y) => String(y.lastAt).localeCompare(String(x.lastAt)));
    return ok({ items: rows.map(d => dialogOut(ctx, d, H)), counts: H.editor ? counts(db) : null, canEdit: H.editor });
  }
  const d = b && db.crmInbox.find(x => x.id === b); if (!d || !canSeeD(d)) return err(404, 'Обращение не найдено');
  const save = (action, extra) => { d.updatedAt = new Date().toISOString(); store.save(); store.audit(user.id, action, 'crmInbox', d.id, extra); };
  if (!c && method === 'GET') { const ms = msgsOf(db, d.id); return ok(Object.assign(dialogOut(ctx, d, H), { canEdit: H.editor, total: ms.length, messages: ms.slice(-FEED).map(msgOut) })); }
  if (c === 'files' && e && method === 'GET') {
    let f = null; if (KEY_RE.test(e)) for (const m of db.crmInboxMessages) { if (m.inboxId !== d.id) continue; f = (m.files || []).find(x => x.key === e); if (f) break; }
    const file = f && path.join(dirOf(ctx, d.id), f.key); if (!f || !fs.existsSync(file)) return err(404, 'Файл не найден');
    const t = TYPES[f.kind] || {};
    return ctx.send(200, fs.readFileSync(file), { 'Content-Type': f.type, 'Content-Disposition': `${t.inline ? 'inline' : 'attachment'}; filename="file.${f.kind}"; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400' });
  }
  if (method !== 'POST') return err(404, 'Нет такого действия с обращением');
  if (!H.editor) return err(403, 'Разбирать обращения могут руководители и секретарь');
  if (c === 'read') { if (d.unread) { d.unread = 0; store.save(); } return ok(dialogOut(ctx, d, H)); }
  // «Создать сделку»: лид из обращения (заказчик = имя, телефон, источник WhatsApp, заметка = первые сообщения)
  if (c === 'lead') {
    if (d.leadId && db.crmLeads.some(l => l.id === d.leadId)) return err(409, 'Обращение уже привязано к сделке');
    const str = (k, n) => String(body[k] == null ? '' : body[k]).trim().slice(0, n || 300);
    const inc = msgsOf(db, d.id).filter(m => !m.fromMe && m.text).slice(0, 5);
    const note = str('note', 4000) || ('WhatsApp ' + C.fmtPhone(d.phone) + ':\n' + inc.map(m => `${C.fdate(m.ts)} — ${m.text}`).join('\n')).slice(0, 2000).trim();
    const now = new Date().toISOString();
    const l = { track: C.normTrack(body.track || 'rp'), objectType: C.OBJECT_TYPES.includes(body.objectType) ? body.objectType : 'Прочее', source: 'WhatsApp', vatIncluded: false,
      client: str('client') || d.name || C.fmtPhone(d.phone) || 'WhatsApp', contact: str('contact') || d.name || '', phone: C.fmtPhone(d.phone), object: str('object'), address: str('address'), note, respId: str('respId') || user.id, nextDate: str('nextDate', 10), nextStep: str('nextStep'),
      id: store.id(), no: H.nextNo(), status: 'Новый', createdAt: now, createdBy: user.id, inboxId: d.id, history: [] };
    histNote(l, user.id, 'создан из обращения WhatsApp'); db.crmLeads.push(l);
    Object.assign(d, { leadId: l.id, status: 'lead', linkedAt: now, linkedBy: user.id, unread: 0 });
    store.audit(user.id, 'create', 'crmLeads', l.id, { inboxId: d.id }); save('to-lead', { leadId: l.id });
    return ok({ inbox: dialogOut(ctx, d, H), lead: H.leadOut(l) });
  }
  // «Привязать к сделке…»: leadId существующей сделки; пустой — отвязать (диалог возвращается в новые)
  if (c === 'link') {
    const id = String(body.leadId || '');
    if (!id) { if (d.status !== 'lead') return err(400, 'Выберите сделку'); Object.assign(d, { leadId: '', status: 'new', linkedBy: '' }); save('unlink'); return ok(dialogOut(ctx, d, H)); }
    const l = db.crmLeads.find(x => x.id === id); if (!l || !H.canSee(l)) return err(404, 'Сделка не найдена');
    if (d.leadId !== l.id) histNote(l, user.id, `WhatsApp: привязана переписка с ${d.name || C.fmtPhone(d.phone) || d.extId}`);
    Object.assign(d, { leadId: l.id, status: 'lead', linkedAt: new Date().toISOString(), linkedBy: user.id, unread: 0 }); save('link', { leadId: l.id });
    return ok(dialogOut(ctx, d, H));
  }
  // «Не заказ»: ignored — новые сообщения контакта принимаются, но диалог остаётся скрытым, пока метку не снимут вручную ({ ignored: false })
  if (c === 'ignore') {
    const on = !(body.ignored === false || body.ignored === 'false');
    if (on) { Object.assign(d, { status: 'ignored', leadId: '', linkedBy: '', unread: 0, ignoredAt: new Date().toISOString(), ignoredBy: user.id }); save('ignore'); }
    else { if (d.status !== 'ignored') return err(400, 'Обращение не помечено «Не заказ»'); Object.assign(d, { status: 'new', ignoredAt: '', ignoredBy: '' });
      const l = matchLead(db, d.phone); if (l) Object.assign(d, { leadId: l.id, status: 'lead', linkedBy: 'auto', linkedAt: new Date().toISOString() }); save('restore'); }
    return ok(dialogOut(ctx, d, H));
  }
  return err(404, 'Нет такого действия с обращением');
}

module.exports = { collections: ['crmInbox', 'crmInboxMessages'], handle, threadsOfLead, onLeadDeleted, counts, matchLead, isoTs, fileIn, TYPES, MAX_MSGS, MAX_REQ, MAX_FILE };
