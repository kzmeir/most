'use strict';
// Переписка проектов (группы WhatsApp): сторона ERP. Сообщения присылает отдельная служба-мост — POST /api/pm/chats/ingest
// (владелец или партнёр, в т. ч. по ключу ИИ: Authorization: Bearer most_…). Здесь нет ни кода WhatsApp, ни npm-зависимостей.
// Коллекции: pmChats (группы) и pmChatMessages (сообщения). Файлы — на диске DATA_DIR/pm-files/chats/<chatId>/<key>, в сообщении только ключи.
// Копия файлов в папку проекта на сетевом диске — только в подпапку «00-Входящие WhatsApp/<дата>/» (настройка), пути и корни разбирает модуль board (materials.js).
const fs = require('fs');
const path = require('path');
const PM = require('./domain');

const MAX_FILES_PER_MSG = 10;
const BRIDGE_STALE_MS = 15 * 60000; // мост молчит дольше — «нет сигнала»
const BRIDGE = { state: '', at: '', since: '', info: '', by: '', lastIngestAt: '', lastIngestN: 0 }; // состояние моста — только в памяти процесса

const chatsOf = db => (db.pmChats = db.pmChats || []);
const msgsOf = db => (db.pmChatMessages = db.pmChatMessages || []);
const safeId = s => String(s).replace(/[^\w-]/g, '');
const chatDir = (ctx, chatId) => path.join(ctx.store.DATA_DIR, 'pm-files', 'chats', safeId(chatId));
const logDir = (ctx, pid) => path.join(ctx.store.DATA_DIR, 'pm-files', safeId(pid));
const newKey = ext => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
const isLeader = u => PM.isLeader(u);
const bool = v => v === true || v === 'true' || v === 1 || v === '1';
const fileUrl = (chatId, key) => `/api/pm/chats/${encodeURIComponent(chatId)}/files/${encodeURIComponent(key)}`;

// файл из base64 {name, type, data}: тип из списка (или расширение имени, если тип общий), ≤ 20 МБ, сигнатура совпадает → { ext, data, name, type, size } или строка-причина
function readChatFile(f) {
  const nm = String((f && f.name) || '').slice(0, 200) || 'файл'; const ext = PM.chatFileExt(f && f.type, nm);
  if (!ext) return 'тип не принимается (картинки, PDF, офисные документы, аудио)';
  const b64 = String((f && f.data) || '').replace(/^data:[^,]*,/, ''); if (!b64) return 'пустой файл'; const mb = PM.CHAT_MAX_FILE / 1048576;
  if (b64.length * 3 / 4 > PM.CHAT_MAX_FILE + 4) return `больше ${mb} МБ`;
  const data = Buffer.from(b64, 'base64'); if (!data.length) return 'пустой файл'; if (data.length > PM.CHAT_MAX_FILE) return `больше ${mb} МБ`;
  if (!PM.chatFileSig(ext, data)) return 'содержимое не совпадает с типом файла';
  return { ext, data, name: nm, type: PM.CHAT_EXT_MIME[ext], size: data.length };
}

// ---- папка проекта на сетевом диске (разбор путей и корней — модуль board, materials.js; здесь только проверка «внутри» и запись) ----
function boardMat(ctx) {
  const b = ctx.modules && ctx.modules.board; if (!b) return null; if (b.materials) return b.materials;
  try { return require(path.join(b.dir || path.join(__dirname, '..', 'board'), 'materials.js')); } catch { return null; }
}
const inside = (base, x) => { const back = path.relative(base, x); return !!back && !back.startsWith('..') && !path.isAbsolute(back); };
// папка проекта: поле проекта folder, иначе папка, привязанная к доске проекта. → { MAT, list, root, rootPath, rel, abs, display } | { skip: причина }
function projectFolder(ctx, p) {
  const MAT = boardMat(ctx); if (!MAT || !MAT.roots || !MAT.parseUserPath || !MAT.absOf) return { skip: 'модуль «Доска» недоступен — папка проекта не определяется' };
  let list; try { list = MAT.roots(ctx.db); } catch { return { skip: 'корни сетевых папок не настроены' }; }
  let hit = p && p.folder ? MAT.parseUserPath(list, p.folder) : null;
  if (!hit) { const bd = (ctx.db.boards || []).find(b => b.pmProjectId === p.id && b.folder && b.folder.root); if (bd) hit = { root: bd.folder.root, rel: bd.folder.rel || '' }; }
  if (!hit) return { skip: p && p.folder ? 'папка проекта вне разрешённых корней' : 'папка проекта не задана' };
  if (!hit.rel) return { skip: 'папка проекта — корень диска, запись в корень запрещена' };
  const abs = MAT.absOf(list, hit.root, hit.rel); const r = list.find(x => x.id === hit.root); if (!abs || !r) return { skip: 'папка проекта вне разрешённых корней' };
  return { MAT, list, root: hit.root, rootPath: path.resolve(r.path), rel: hit.rel, abs, display: MAT.displayPath(list, hit.root, hit.rel) };
}
const saveReason = e => { const c = e && e.code; return c === 'EROFS' || c === 'EACCES' || c === 'EPERM' ? 'нет прав на запись (диск только для чтения)' : c === 'ENOENT' || c === 'ENOTDIR' ? 'папка проекта недоступна' : c === 'ENOSPC' ? 'на диске нет места' : c === 'ETIMEDOUT' || c === 'EBUSY' || c === 'ENETUNREACH' || c === 'EHOSTUNREACH' || c === 'UNKNOWN' ? 'сетевой диск недоступен' : String((e && e.message) || 'ошибка записи').slice(0, 160); };
// один файл сообщения → <папка проекта>/<подпапка>/<ГГГГ-ММ-ДД>/<имя>. Только внутрь подпапки; существующее не перезаписывается (« (2)», « (3)»). Бросает ошибку с причиной.
function copyToFolder(ctx, pf, sub, m, f) {
  const ext = String(f.key || '').split('.').pop(); if (!PM.CHAT_KEY_RE.test(String(f.key || '')) || !PM.CHAT_EXT_MIME[ext]) throw new Error('расширение не из списка принимаемых');
  const date = PM.almatyDate(m.ts); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('нет даты сообщения');
  const name = PM.chatSafeName(f.name, ext); const subName = PM.chatFolderName(sub);
  const relDir = `${pf.rel}/${subName}/${date}`; const subAbs = pf.MAT.absOf(pf.list, pf.root, `${pf.rel}/${subName}`); const dirAbs = pf.MAT.absOf(pf.list, pf.root, relDir);
  if (!subAbs || !dirAbs || !inside(pf.abs, subAbs) || !inside(subAbs, dirAbs) || !inside(pf.rootPath, dirAbs)) throw new Error('путь вне папки проекта');
  let st; try { st = fs.statSync(pf.abs); } catch (e) { throw Object.assign(new Error('папка проекта недоступна'), { code: e.code === 'ENOENT' ? 'ENOENT' : e.code }); }
  if (!st.isDirectory()) throw Object.assign(new Error('папка проекта недоступна'), { code: 'ENOTDIR' });
  fs.mkdirSync(dirAbs, { recursive: true });
  // символьные ссылки и junction: настоящий путь тоже внутри корня и папки проекта
  const rr = fs.realpathSync(pf.rootPath), rp = fs.realpathSync(pf.abs), rd = fs.realpathSync(dirAbs);
  if (!inside(rr, rd) || !inside(rp, rd)) throw new Error('путь вне папки проекта');
  const src = path.join(chatDir(ctx, m.chatId), f.key); if (!fs.existsSync(src)) throw new Error('файл не найден в хранилище ERP');
  for (let n = 1; n < 1000; n++) {
    const fin = PM.chatNumbered(name, n); const dst = path.join(dirAbs, fin); if (path.dirname(dst) !== dirAbs || path.basename(dst) !== fin) throw new Error('недопустимое имя файла');
    try { fs.copyFileSync(src, dst, fs.constants.COPYFILE_EXCL); return pf.MAT.displayPath(pf.list, pf.root, `${relDir}/${fin}`); }
    catch (e) { if (e.code === 'EEXIST') continue; throw e; } // на сетевом диске ничего не удаляем и не перезаписываем
  }
  throw new Error('слишком много файлов с таким именем');
}
// сохранить в папку проекта файлы сообщений (ещё не сохранённые). Ошибки не бросает — пишет f.savedError. → { saved, failed, skipped, note, folder }
function saveFiles(ctx, chat, list, S) {
  const out = { saved: 0, failed: 0, skipped: 0, note: '', folder: '' }; const files = [];
  for (const m of list) if (!m.deleted) for (const f of m.files || []) if (!f.savedTo) files.push([m, f]);
  if (!files.length) return out;
  const skipAll = why => { out.skipped = files.length; out.note = why; for (const [, f] of files) if (f.savedTo === undefined) f.savedTo = ''; return out; };
  if (!S.chatFilesToFolder) return skipAll('копирование в папку проекта выключено');
  const p = chat.pid && ctx.db.pmProjects.find(x => x.id === chat.pid); if (!p) return skipAll('группа не привязана к проекту');
  let pf; try { pf = projectFolder(ctx, p); } catch (e) { pf = { skip: 'папка проекта не определяется' }; }
  if (pf.skip) return skipAll(pf.skip);
  out.folder = pf.display;
  for (const [m, f] of files) {
    try { f.savedTo = copyToFolder(ctx, pf, S.chatFolderName, m, f); f.savedAt = new Date().toISOString(); delete f.savedError; out.saved++; }
    catch (e) { f.savedTo = ''; f.savedError = saveReason(e); out.failed++; }
  }
  return out;
}

const msgOut = (m, inLog) => m.deleted
  ? { id: m.id, chatId: m.chatId, ts: m.ts, author: m.author, phone: m.phone, kind: m.kind, deleted: true, text: '', quoted: '', files: [] }
  : { id: m.id, chatId: m.chatId, ts: m.ts, author: m.author, phone: m.phone, kind: m.kind, text: m.text, quoted: m.quoted || '', editedAt: m.editedAt || '', deleted: false, inLog: !!inLog,
      files: (m.files || []).map(f => ({ key: f.key, name: f.name, type: f.type, size: f.size, url: fileUrl(m.chatId, f.key), savedTo: f.savedTo || '', savedError: f.savedError || '' })) };
const bySort = (a, b) => String(a.ts).localeCompare(String(b.ts)) || String(a.id).localeCompare(String(b.id));

// ---- лента проекта: GET /api/pm/projects/:id/chat?chat=&q=&files=1&before=<id>&after=<id>&date=ГГГГ-ММ-ДД&limit= ----
function projectChat(ctx, p) {
  const { db, user, qs = {}, ok, err } = ctx; const S = PM.pmSettings(db);
  if (!PM.canChatRead(user, p, S, db.pmItems)) return err(403, 'Переписку проекта читают ГИП/ПМ проекта и руководители');
  const groups = chatsOf(db).filter(c => c.pid === p.id); const all = msgsOf(db).filter(m => m.pid === p.id).sort(bySort);
  const list = PM.chatFilter(all, { q: qs.q, files: bool(qs.files), chatId: qs.chat && groups.some(c => c.id === qs.chat) ? qs.chat : '' });
  const limit = Math.max(1, Math.min(200, Math.round(Number(qs.limit)) || PM.CHAT_PAGE)); let from, to;
  const idx = id => list.findIndex(m => m.id === id);
  if (qs.before && idx(qs.before) >= 0) { to = idx(qs.before); from = Math.max(0, to - limit); }
  else if (qs.after && idx(qs.after) >= 0) { from = idx(qs.after) + 1; to = Math.min(list.length, from + limit); }
  else if (/^\d{4}-\d{2}-\d{2}$/.test(String(qs.date || ''))) { const i = list.findIndex(m => PM.almatyDate(m.ts) >= qs.date); from = i < 0 ? Math.max(0, list.length - limit) : i; to = Math.min(list.length, from + limit); }
  else { to = list.length; from = Math.max(0, to - limit); }
  const inLog = new Set((db.pmLog || []).filter(r => r.pid === p.id && r.chatRef && r.chatRef.msgId).map(r => r.chatRef.msgId));
  let folder = ''; if (S.chatFilesToFolder) { try { const pf = projectFolder(ctx, p); folder = pf.skip ? '' : pf.display; } catch { /* нет папки */ } }
  return ok({ chats: groups.map(c => ({ id: c.id, name: c.name, count: c.count || 0, lastMsgAt: c.lastMsgAt || '' })), messages: list.slice(from, to).map(m => msgOut(m, inLog.has(m.id))), moreBefore: from > 0, moreAfter: to < list.length,
    total: list.length, all: all.length, canLog: PM.canLogAdd(user, p, db.pmItems), types: PM.LOG_TYPES, folder, canBind: isLeader(user) });
}

// ---- /api/pm/chats/* ----
function handle(ctx) {
  const { parts, method, body, user, db, store, ok, err } = ctx; const [, , b, c, d] = parts;
  const S = PM.pmSettings(db); const leader = isLeader(user); const now = () => new Date().toISOString();
  const findP = id => db.pmProjects.find(p => p.id === id);
  const chats = chatsOf(db), msgs = msgsOf(db);

  // приём пачки от моста
  if (b === 'ingest' && !c && method === 'POST') {
    if (!leader) return err(403, 'Принимать переписку может владелец или партнёр (в т. ч. по ключу ИИ)');
    if (body.source !== 'whatsapp') return err(400, 'source: поддерживается только «whatsapp»');
    const extId = String((body.chat && body.chat.extId) || '').trim().slice(0, 200); if (!extId) return err(400, 'chat.extId — идентификатор группы (JID)');
    const list = Array.isArray(body.messages) ? body.messages : null; if (!list || !list.length) return err(400, 'messages — массив сообщений');
    if (list.length > PM.CHAT_MAX_BATCH) return err(413, `Не больше ${PM.CHAT_MAX_BATCH} сообщений за запрос`);
    let bytes = 0; for (const m of list) { bytes += String((m && m.text) || '').length; for (const f of (m && Array.isArray(m.files) ? m.files : [])) bytes += Math.floor(String((f && f.data) || '').length * 3 / 4); }
    if (bytes > PM.CHAT_MAX_BYTES) return err(413, `Не больше ${PM.CHAT_MAX_BYTES / 1048576} МБ за запрос — разбейте пачку`);
    const name = String((body.chat && body.chat.name) || '').trim().slice(0, 200);
    let chat = chats.find(x => x.source === 'whatsapp' && x.extId === extId); let created = false;
    if (!chat) { chat = { id: store.id(), source: 'whatsapp', extId, name: name || extId, pid: '', muted: false, firstSeenAt: now(), lastMsgAt: '', count: 0 }; chats.push(chat); created = true; store.audit(user.id, 'create', 'pmChats', chat.id, { name: chat.name }); }
    else if (name && name !== chat.name) chat.name = name; // группу переименовали
    const head = () => ({ id: chat.id, name: chat.name, pid: chat.pid || '', muted: !!chat.muted, created });
    BRIDGE.lastIngestAt = now(); BRIDGE.lastIngestN = list.length;
    if (chat.muted) { if (created || name) store.save(); return ok({ chat: head(), accepted: 0, duplicates: 0, updated: 0, rejected: [], filesRejected: [], muted: list.length }); }
    const known = new Map(msgs.filter(m => m.chatId === chat.id).map(m => [m.extId, m])); const dir = chatDir(ctx, chat.id);
    const rep = { accepted: 0, duplicates: 0, updated: 0, rejected: [], filesRejected: [], files: 0 }; const fresh = [];
    for (const raw of list) {
      const r = PM.cleanChatMessage(raw); if (r.error) { rep.rejected.push({ extId: String((raw && raw.extId) || ''), reason: r.error }); continue; }
      const msg = r.msg; const ex = known.get(msg.extId); const inFiles = raw && Array.isArray(raw.files) ? raw.files : [];
      const takeFiles = () => { // файлы пишутся на диск только когда сообщение точно принимается
        const out = []; if (msg.deleted) return out;
        inFiles.forEach((f, i) => {
          const nm = String((f && f.name) || 'файл').slice(0, 200); if (i >= MAX_FILES_PER_MSG) { rep.filesRejected.push({ extId: msg.extId, name: nm, reason: `не больше ${MAX_FILES_PER_MSG} файлов в сообщении` }); return; }
          const x = readChatFile(f); if (typeof x === 'string') { rep.filesRejected.push({ extId: msg.extId, name: nm, reason: x }); return; }
          try { fs.mkdirSync(dir, { recursive: true }); const key = newKey(x.ext); fs.writeFileSync(path.join(dir, key), x.data); out.push({ key, name: x.name, type: x.type, size: x.size }); rep.files++; }
          catch (e) { rep.filesRejected.push({ extId: msg.extId, name: nm, reason: 'не удалось записать файл на сервере ERP' }); }
        });
        return out;
      };
      if (ex) { // повторная отправка: дубль; правка, удаление или досылка файла — обновление
        let changed = false;
        if (msg.deleted && !ex.deleted) { ex.deleted = true; changed = true; }
        if (msg.editedAt && msg.editedAt !== (ex.editedAt || '')) { ex.text = msg.text; ex.editedAt = msg.editedAt; changed = true; }
        if (!(ex.files || []).length && inFiles.length && !ex.deleted) { const fl = takeFiles(); if (fl.length) { ex.files = fl; changed = true; fresh.push(ex); } }
        if (changed) rep.updated++; else rep.duplicates++; continue;
      }
      if (!msg.text.trim() && !inFiles.length && !msg.deleted && msg.kind === 'text') { rep.rejected.push({ extId: msg.extId, reason: 'пустое сообщение' }); continue; }
      const rec = Object.assign({ id: store.id(), chatId: chat.id, pid: chat.pid || '' }, msg, { files: takeFiles(), receivedAt: now() });
      msgs.push(rec); known.set(rec.extId, rec); fresh.push(rec); rep.accepted++;
      if (!chat.lastMsgAt || rec.ts > chat.lastMsgAt) chat.lastMsgAt = rec.ts;
    }
    chat.count = (chat.count || 0) + rep.accepted;
    const sv = saveFiles(ctx, chat, fresh, S); // копия в папку проекта; сбой записи приём не роняет
    if (created || rep.accepted || rep.updated || name) store.save();
    if (rep.accepted || rep.updated) store.audit(user.id, 'ingest', 'pmChats', chat.id, { accepted: rep.accepted, updated: rep.updated, files: rep.files, saved: sv.saved, saveFailed: sv.failed });
    return ok(Object.assign({ chat: head() }, rep, { savedToFolder: sv.saved, saveFailed: sv.failed, saveNote: sv.note }));
  }
  // мост сообщает своё состояние (в памяти, показывается в настройках «WhatsApp»)
  if (b === 'ingest-status' && !c && method === 'POST') {
    if (!leader) return err(403, 'Состояние моста сообщает владелец или партнёр (в т. ч. по ключу ИИ)');
    if (!PM.CHAT_BRIDGE_STATES[body.state]) return err(400, 'state: connected | qr | disconnected');
    const at = body.at ? new Date(body.at) : null;
    Object.assign(BRIDGE, { state: body.state, at: now(), since: at && !isNaN(at) ? at.toISOString() : now(), info: String(body.info || '').slice(0, 200), by: user.tokenName || user.name || '' });
    return ok({ ok: true, state: BRIDGE.state, at: BRIDGE.at });
  }
  // список групп: руководитель — все; ПМ и ГИП — непривязанные (чтобы привязать к своему проекту) и группы своих проектов
  if (!b && method === 'GET') {
    const mine = db.pmProjects.filter(p => PM.shownTrack(p.track) && PM.canChatBind(user, p));
    if (!leader && !(['pm', 'gip'].includes(user.role) && mine.length)) return err(403, 'Группы WhatsApp привязывают руководители, ПМ и ГИП');
    const stat = new Map(); for (const m of msgs) { const s = stat.get(m.chatId) || { files: 0, unsaved: 0, errors: 0, last: null }; if (!m.deleted) for (const f of m.files || []) { s.files++; if (!f.savedTo) s.unsaved++; if (f.savedError) s.errors++; } if (!s.last || m.ts > s.last.ts) s.last = m; stat.set(m.chatId, s); }
    const pool = db.pmProjects.filter(p => PM.shownTrack(p.track));
    const rows = chats.filter(x => leader || !x.pid || mine.some(p => p.id === x.pid)).map(x => {
      const p = x.pid ? findP(x.pid) : null; const s = stat.get(x.id) || { files: 0, unsaved: 0, errors: 0, last: null }; const sg = x.pid ? null : PM.chatSuggest(x.name, leader ? pool : mine);
      let folder = '', folderNote = ''; if (p && S.chatFilesToFolder) { try { const pf = projectFolder(ctx, p); if (pf.skip) folderNote = pf.skip; else folder = pf.display; } catch { folderNote = 'папка проекта не определяется'; } }
      return Object.assign({ id: x.id, name: x.name, pid: x.pid || '', project: p ? p.name : '', track: p ? p.track : '', muted: !!x.muted, count: x.count || 0, files: s.files, firstSeenAt: x.firstSeenAt || '', lastMsgAt: x.lastMsgAt || '', suggest: sg, canBind: leader || !x.pid || mine.some(q => q.id === x.pid),
        folder, folderNote, unsaved: p && S.chatFilesToFolder ? s.unsaved : 0, saveErrors: s.errors },
      leader ? { extId: x.extId, last: s.last && !s.last.deleted ? { author: s.last.author, text: String(s.last.text || '').slice(0, 120), ts: s.last.ts } : null } : {});
    }).sort((x, y) => (x.pid ? 1 : 0) - (y.pid ? 1 : 0) || String(y.lastMsgAt).localeCompare(String(x.lastMsgAt)));
    const out = { chats: rows, projects: (leader ? pool : mine).map(p => ({ id: p.id, name: p.name, track: p.track, status: p.status })).sort((x, y) => (PM.ACTIVE(y.status) ? 1 : 0) - (PM.ACTIVE(x.status) ? 1 : 0) || String(x.name).localeCompare(String(y.name), 'ru')), leader, canSettings: leader, saveFailed: rows.reduce((n, r) => n + r.saveErrors, 0) };
    if (leader) { out.settings = { chatForMembers: !!S.chatForMembers, chatFilesToFolder: !!S.chatFilesToFolder, chatFolderName: PM.chatFolderName(S.chatFolderName) };
      out.bridge = Object.assign({}, BRIDGE, { label: BRIDGE.state ? PM.CHAT_BRIDGE_STATES[BRIDGE.state] : 'нет сигнала от моста', stale: !!BRIDGE.at && Date.now() - Date.parse(BRIDGE.at) > BRIDGE_STALE_MS }); }
    return ok(out);
  }
  // досохранить (или повторить после ошибки) файлы в папку проекта: { chatId } или { pid }; без параметров — все привязанные группы (руководитель)
  if (b === 'save-files' && !c && method === 'POST') {
    const target = chats.filter(x => x.pid && (!body.chatId || x.id === body.chatId) && (!body.pid || x.pid === body.pid));
    if ((body.chatId || body.pid) && !target.length) return err(404, 'Привязанная группа не найдена');
    if (!leader && (!(body.chatId || body.pid) || target.some(x => !PM.canChatBind(user, findP(x.pid))))) return err(403, 'Сохранять файлы в папку проекта может руководитель, ГИП или ПМ проекта');
    if (!S.chatFilesToFolder) return err(400, 'Копирование файлов в папку проекта выключено в настройках «WhatsApp»');
    const rep = { saved: 0, failed: 0, skipped: 0, notes: [], errors: [] };
    for (const x of target) { const list = msgs.filter(m => m.chatId === x.id); const r = saveFiles(ctx, x, list, S); rep.saved += r.saved; rep.failed += r.failed; rep.skipped += r.skipped; if (r.note) rep.notes.push(`${x.name}: ${r.note}`);
      if (r.failed) { const f = list.flatMap(m => m.files || []).find(q => q.savedError); if (f) rep.errors.push(`${x.name}: ${f.savedError}`); } }
    store.save(); store.audit(user.id, 'save-files', 'pmChats', target.map(x => x.id).join(',').slice(0, 200), { saved: rep.saved, failed: rep.failed });
    return ok(rep);
  }
  // сообщение → запись журнала проекта (текст, картинки и PDF сообщения, ссылка на сообщение)
  if (b === 'messages' && c && d === 'to-log' && method === 'POST') {
    const m = msgs.find(x => x.id === c); if (!m || m.deleted) return err(404, 'Сообщение не найдено'); const p = m.pid ? findP(m.pid) : null; if (!p) return err(400, 'Группа не привязана к проекту');
    if (!PM.canChatRead(user, p, S, db.pmItems)) return err(403, 'Нет доступа к переписке проекта');
    if (!PM.canLogAdd(user, p, db.pmItems)) return err(403, 'Добавлять записи в журнал могут участники проекта и те, кто ведёт его пункты');
    const logs = (db.pmLog = db.pmLog || []); const dup = logs.find(r => r.pid === p.id && r.chatRef && r.chatRef.msgId === m.id); if (dup) return err(409, 'Это сообщение уже есть в журнале');
    const chat = chats.find(x => x.id === m.chatId) || {}; const date = PM.almatyDate(m.ts); const t = ctx.today();
    const other = (m.files || []).filter(f => !PM.LOG_FILE_TYPES[f.type]); const copyable = (m.files || []).filter(f => PM.LOG_FILE_TYPES[f.type]).slice(0, PM.LOG_MAX_FILES);
    let text = String(body.text || '').trim() || [m.author ? `${m.author}: ` : '', String(m.text || '').trim() || ((m.files || []).length ? `файл из переписки — ${(m.files || []).map(f => f.name).join(', ')}` : '')].join('');
    if (other.length) text += `\nФайлы в переписке: ${other.map(f => f.name).join(', ')}`;
    const r = PM.cleanLog({ date: date > t ? t : date, type: body.type, text, participants: m.author || '' }, t); if (r.error) return err(400, r.error);
    const files = []; for (const f of copyable) { try { const ext = PM.LOG_FILE_TYPES[f.type]; const key = newKey(ext); const dir = logDir(ctx, p.id); fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(path.join(chatDir(ctx, m.chatId), f.key), path.join(dir, key)); files.push({ key, name: f.name, type: f.type, size: f.size }); } catch { /* файла нет на диске — запись без него */ } }
    const rec = Object.assign({ id: store.id(), pid: p.id }, r.rec, { files, by: user.id, createdAt: now(), source: 'chat', chatRef: { chatId: m.chatId, msgId: m.id, date, chat: chat.name || '' } });
    logs.push(rec); store.save(); store.audit(user.id, 'create', 'pmLog', rec.id, { pid: p.id, from: 'chat', msg: m.id });
    return ok(Object.assign({}, rec, { canEdit: true }));
  }
  const chat = b && chats.find(x => x.id === b); if (!chat) return err(404, 'Группа не найдена');
  // файл сообщения: право — как на чтение переписки проекта; у непривязанной группы — только руководитель
  if (c === 'files' && d && method === 'GET') {
    if (!PM.CHAT_KEY_RE.test(d)) return err(404, 'Файл не найден');
    const m = msgs.find(x => x.chatId === chat.id && !x.deleted && (x.files || []).some(f => f.key === d)); if (!m) return err(404, 'Файл не найден');
    const p = m.pid ? findP(m.pid) : null; if (!(p ? PM.canChatRead(user, p, S, db.pmItems) : leader)) return err(403, 'Нет доступа к переписке проекта');
    const file = path.join(chatDir(ctx, chat.id), d); if (!fs.existsSync(file)) return err(404, 'Файл не найден');
    const f = m.files.find(x => x.key === d); const ext = d.split('.').pop();
    return ctx.send(200, fs.readFileSync(file), { 'Content-Type': PM.CHAT_EXT_MIME[ext] || 'application/octet-stream', 'Content-Disposition': `${PM.CHAT_INLINE.includes(ext) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(PM.chatSafeName(f.name, ext))}`, 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff' }); // no-cache: браузер не отдаёт файл из кэша тому, кто вошёл позже без права чтения
  }
  // привязка к проекту и «не грузить»: владелец и партнёр — всё; ПМ и ГИП — только привязать (или перепривязать свою) к своему проекту
  if (!c && method === 'PUT') {
    const cur = chat.pid ? findP(chat.pid) : null; const patch = {};
    if ('pid' in body) {
      const pid = String(body.pid || ''); const target = pid ? findP(pid) : null; if (pid && (!target || !PM.shownTrack(target.track))) return err(400, 'Проект не найден');
      if (!leader) { if (!target) return err(403, 'Отвязать группу может владелец или партнёр'); if (!PM.canChatBind(user, target)) return err(403, 'Привязать группу можно только к своему проекту'); if (cur && !PM.canChatBind(user, cur)) return err(403, 'Группа привязана к чужому проекту — перепривязывает владелец или партнёр'); }
      patch.pid = pid;
    }
    if ('muted' in body) { if (!leader) return err(403, '«Не грузить» ставит владелец или партнёр'); patch.muted = bool(body.muted); }
    if (!leader && !('pid' in patch)) return err(403, 'Нет прав');
    let moved = 0;
    if ('pid' in patch && patch.pid !== (chat.pid || '')) { for (const m of msgs) if (m.chatId === chat.id) { m.pid = patch.pid; moved++; } Object.assign(chat, { boundAt: now(), boundBy: user.id }); }
    Object.assign(chat, patch, { updatedAt: now(), updatedBy: user.id }); store.save(); store.audit(user.id, 'update', 'pmChats', chat.id, Object.assign({}, patch, { moved }));
    return ok({ id: chat.id, name: chat.name, pid: chat.pid || '', muted: !!chat.muted, moved });
  }
  return err(404, 'Нет такого действия');
}
// проект удалён: его группы снова «не привязаны» (сообщения остаются)
function onProjectDelete(db, pid) { let n = 0; for (const c of chatsOf(db)) if (c.pid === pid) { c.pid = ''; n++; } for (const m of msgsOf(db)) if (m.pid === pid) m.pid = ''; return n; }
// для карточки и журнала проекта
const countOf = (db, pid) => msgsOf(db).reduce((n, m) => n + (m.pid === pid && !m.deleted ? 1 : 0), 0);
const dayEvents = (db, pid) => PM.chatDayEvents(msgsOf(db), chatsOf(db), pid);

module.exports = { handle, projectChat, onProjectDelete, countOf, dayEvents, saveFiles, projectFolder, readChatFile, BRIDGE };
