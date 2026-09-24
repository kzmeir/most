'use strict';
// Модуль «Доска» (аналог Miro): /api/board/*. Поток G. Контракт — docs/ARCHITECTURE.md, задание — modules/board/README.md, логика — modules/board/domain.js.
// Доски (boards) и объекты (boardItems) — в базе ядра; файлы (картинки, PDF) — на диске в DATA_DIR/board-files/<boardId>/, в базе только ключи.
// Совместная работа v1: клиент шлёт операции (upsert/delete по объектам), сервер нумерует ревизии доски (rev) и версии объектов (ver);
// клиенты опрашивают sync?since=rev и получают только изменённое (удалённые — надгробия). Конфликт — последняя запись по объекту выигрывает.
const fs = require('fs');
const path = require('path');
const BD = require('./domain');

const PRESENCE = new Map(); // boardId → Map('userId|client' → { userId, name, at })
const PRESENCE_TTL = 20000;
const AUDIT_EVERY = 5 * 60000; const auditAt = new Map(); // журнал операций — не чаще раза в 5 минут на пользователя и доску
let saveTimer = null;
const now = () => new Date().toISOString();
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };

// запись изменений объектов в базу — с задержкой, чтобы серия операций писалась одной транзакцией
function scheduleSave(store) { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; try { store.save(); } catch (e) { console.error('[board] save:', e.message); } }, 600); }
const pmOf = ctx => (ctx.modules.pm && ctx.modules.pm.domain) || null;
const projectOf = (db, b) => b && b.pmProjectId ? db.pmProjects.find(p => p.id === b.pmProjectId) || null : null;
function rights(ctx, b) { const p = projectOf(ctx.db, b); const PM = pmOf(ctx); return { view: BD.canView(ctx.user, b, p, PM), edit: BD.canEdit(ctx.user, b, p, PM), manage: BD.canManage(ctx.user, b, p, PM), project: p }; }
const filesDir = (ctx, boardId) => path.join(ctx.store.DATA_DIR, 'board-files', String(boardId).replace(/[^\w-]/g, ''));
const fileExists = (ctx, boardId, key) => BD.KEY_RE.test(String(key || '')) && fs.existsSync(path.join(filesDir(ctx, boardId), key));
const liveItems = (db, boardId) => db.boardItems.filter(i => i.boardId === boardId && !i.deleted);
const itemOut = it => it.deleted ? { id: it.id, deleted: true, rev: it.rev || 0, ver: it.ver || 0 } : it;

function touch(ctx, boardId, client) {
  const m = PRESENCE.get(boardId) || new Map(); PRESENCE.set(boardId, m); const t = Date.now();
  m.set(ctx.user.id + '|' + String(client || '').slice(0, 24), { userId: ctx.user.id, name: ctx.userName(ctx.user.id) || ctx.user.name || '', at: t });
  for (const [k, v] of m) if (t - v.at > PRESENCE_TTL) m.delete(k);
}
function presence(boardId) {
  const m = PRESENCE.get(boardId); if (!m) return []; const t = Date.now(); const by = new Map();
  for (const v of m.values()) { if (t - v.at > PRESENCE_TTL) continue; const p = by.get(v.userId) || { userId: v.userId, name: v.name, n: 0 }; p.n++; by.set(v.userId, p); }
  return [...by.values()];
}
function boardOut(ctx, b, r) {
  const { db } = ctx; const p = r ? r.project : projectOf(db, b);
  return { id: b.id, title: b.title, pmProjectId: b.pmProjectId || '', project: p ? { id: p.id, name: p.name, track: p.track || '', status: p.status || '' } : null, ownerId: b.ownerId, ownerName: ctx.userName(b.ownerId) || '', members: b.members || [], memberNames: (b.members || []).map(id => ctx.userName(id) || id), template: b.template || '', createdAt: b.createdAt, updatedAt: b.updatedAt || b.createdAt, updatedByName: ctx.userName(b.updatedBy || b.createdBy) || '', rev: b.rev || 0, itemsN: liveItems(db, b.id).length, online: presence(b.id).length, canEdit: r ? r.edit : false, canManage: r ? r.manage : false };
}
// применить операции клиента: одна ревизия на пакет; объекты получают rev пакета и ver+1
function applyOps(ctx, b, ops) {
  const { db, user } = ctx; const byId = new Map(db.boardItems.filter(i => i.boardId === b.id).map(i => [i.id, i]));
  b.rev = (b.rev || 0) + 1; const rev = b.rev; const t = now(); const applied = [];
  for (const op of (Array.isArray(ops) ? ops : []).slice(0, 500)) {
    if (!op || typeof op !== 'object') continue;
    if (op.op === 'delete') { const it = byId.get(String(op.id || '')); if (!it || it.deleted) continue; Object.assign(it, { deleted: true, rev, ver: (it.ver || 0) + 1, updatedAt: t, updatedBy: user.id, props: {} }); applied.push(itemOut(it)); continue; }
    if (op.op !== 'upsert') continue;
    const clean = BD.cleanItem(op.item, b.id); if (!clean) continue;
    if (clean.props.src && !fileExists(ctx, b.id, clean.props.src)) clean.props.src = ''; if (clean.props.pdf && !fileExists(ctx, b.id, clean.props.pdf)) clean.props.pdf = '';
    const cur = byId.get(clean.id);
    if (cur) { Object.assign(cur, clean, { deleted: false, rev, ver: (cur.ver || 0) + 1, updatedAt: t, updatedBy: user.id }); applied.push(cur); }
    else { const it = Object.assign(clean, { rev, ver: 1, createdAt: t, createdBy: user.id, updatedAt: t, updatedBy: user.id }); db.boardItems.push(it); byId.set(it.id, it); applied.push(it); }
  }
  b.updatedAt = t; b.updatedBy = user.id; scheduleSave(ctx.store);
  const k = user.id + '|' + b.id; if (Date.now() - (auditAt.get(k) || 0) > AUDIT_EVERY) { auditAt.set(k, Date.now()); ctx.store.audit(user.id, 'ops', 'boardItems', b.id, { ops: applied.length }); }
  return { rev, items: applied };
}
function addTemplate(ctx, b, template, title) {
  if (template !== 'ep') return 0; const { db } = ctx; const box = BD.bbox(liveItems(db, b.id)); const dy = box ? box.y + box.h + 300 : 0; const t = now();
  b.rev = (b.rev || 0) + 1; const items = BD.epTemplate(b.id, { title }); for (const it of items) { it.y += dy; db.boardItems.push(Object.assign(it, { rev: b.rev, ver: 1, createdAt: t, createdBy: ctx.user.id, updatedAt: t, updatedBy: ctx.user.id })); }
  b.template = 'ep'; b.updatedAt = t; b.updatedBy = ctx.user.id; return items.length;
}
// покрытие для других модулей: доски проекта (карточка pm), без объектов
function boardsOfProject(ctx, pmProjectId) { return ctx.db.boards.filter(b => b.pmProjectId === pmProjectId).map(b => boardOut(ctx, b, rights(ctx, b))).filter(b => b.canEdit || rights(ctx, ctx.db.boards.find(x => x.id === b.id)).view); }

function handle(ctx) {
  const { parts, method, body, user, db, store, ok, err, qs } = ctx;
  if (!user) return err(401, 'Не авторизован');
  const [, a, b, c, d] = parts; const PM = pmOf(ctx);
  const audit = (action, col, id, extra) => store.audit(user.id, action, col, id, extra);
  const cleanMembers = list => [...new Set((Array.isArray(list) ? list : []).map(String).filter(id => id && id !== user.id && (db.users.some(u => u.id === id) || /^dev-/.test(id))))];

  // --- доски проекта (для карточки pm и встраивания) ---
  if (a === 'by-project' && b && method === 'GET') {
    const p = db.pmProjects.find(x => x.id === b); if (!p) return err(404, 'Проект не найден');
    if (!(PM && PM.canOpen(user))) return err(403, 'Нет доступа к проектам');
    return ok({ project: { id: p.id, name: p.name, track: p.track || '', status: p.status || '' }, boards: db.boards.filter(x => x.pmProjectId === p.id).map(x => boardOut(ctx, x, rights(ctx, x))).sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt))), canCreate: BD.canCreateProjectBoard(user, p, PM) });
  }
  if (a !== 'boards') return err(404, 'Нет такого действия');

  // --- список и создание ---
  if (!b && method === 'GET') {
    const q = String(qs.q || '').trim().toLowerCase();
    const list = db.boards.map(x => ({ x, r: rights(ctx, x) })).filter(({ x, r }) => r.view && (!qs.pid || x.pmProjectId === qs.pid) && (!q || String(x.title).toLowerCase().includes(q) || (r.project && String(r.project.name).toLowerCase().includes(q))))
      .map(({ x, r }) => boardOut(ctx, x, r)).sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)));
    const projects = PM && PM.canOpen(user) ? db.pmProjects.filter(p => PM.isManager(user, p)).map(p => ({ id: p.id, name: p.name, track: p.track || '' })).sort((x, y) => String(x.name).localeCompare(String(y.name), 'ru')) : [];
    return ok({ boards: list, projects, canCreate: true });
  }
  if (!b && method === 'POST') {
    const pid = String(body.pmProjectId || ''); let p = null;
    if (pid) { p = db.pmProjects.find(x => x.id === pid); if (!p) return err(404, 'Проект не найден'); if (!BD.canCreateProjectBoard(user, p, PM)) return err(403, 'Доску проекта создаёт ПМ/ГИП проекта или руководитель'); }
    const title = String(body.title || '').trim().slice(0, BD.MAX_TITLE) || (p ? `${p.name} · доска` : 'Новая доска');
    const bd = { id: store.id(), title, pmProjectId: pid, ownerId: user.id, members: cleanMembers(body.members), template: '', rev: 0, createdAt: now(), createdBy: user.id, updatedAt: now(), updatedBy: user.id };
    db.boards.push(bd); const n = addTemplate(ctx, bd, body.template === 'ep' ? 'ep' : '', body.template === 'ep' ? title : '');
    store.save(); audit('create', 'boards', bd.id, { pmProjectId: pid, template: n }); return ok({ board: boardOut(ctx, bd, rights(ctx, bd)), items: liveItems(db, bd.id), rev: bd.rev });
  }
  const bd = db.boards.find(x => x.id === b); if (!bd) return err(404, 'Доска не найдена');
  const r = rights(ctx, bd); if (!r.view) return err(403, 'Нет доступа к этой доске');

  if (!c && method === 'GET') { touch(ctx, bd.id, qs.client); return ok({ board: boardOut(ctx, bd, r), items: liveItems(db, bd.id), rev: bd.rev || 0, presence: presence(bd.id), me: user.id, colors: BD.COLORS, maxFile: BD.MAX_FILE }); }
  if (!c && method === 'PUT') {
    if (!r.manage) return err(403, 'Настройки доски меняет её владелец, ПМ/ГИП проекта или руководитель');
    const patch = {}; if ('title' in body) { patch.title = String(body.title || '').trim().slice(0, BD.MAX_TITLE); if (!patch.title) delete patch.title; }
    if ('members' in body) patch.members = cleanMembers(body.members);
    if ('pmProjectId' in body) { const pid = String(body.pmProjectId || ''); if (pid) { const p = db.pmProjects.find(x => x.id === pid); if (!p) return err(404, 'Проект не найден'); if (!BD.canCreateProjectBoard(user, p, PM)) return err(403, 'Привязать к проекту может ПМ/ГИП проекта или руководитель'); } patch.pmProjectId = pid; }
    Object.assign(bd, patch, { updatedAt: now(), updatedBy: user.id }); store.save(); audit('update', 'boards', bd.id); return ok({ board: boardOut(ctx, bd, rights(ctx, bd)) });
  }
  if (!c && method === 'DELETE') {
    if (!r.manage) return err(403, 'Удалить доску может её владелец, ПМ/ГИП проекта или руководитель');
    db.boardItems = db.boardItems.filter(i => i.boardId !== bd.id); db.boards = db.boards.filter(x => x.id !== bd.id); PRESENCE.delete(bd.id);
    try { fs.rmSync(filesDir(ctx, bd.id), { recursive: true, force: true }); } catch { }
    store.save(); audit('delete', 'boards', bd.id); return ok({ ok: true });
  }
  // --- синхронизация: изменения после ревизии since + кто на доске ---
  if (c === 'sync' && method === 'GET') {
    touch(ctx, bd.id, qs.client); const since = Math.max(0, Number(qs.since) || 0); const rev = bd.rev || 0;
    const items = since >= rev ? [] : db.boardItems.filter(i => i.boardId === bd.id && (i.rev || 0) > since).map(itemOut);
    return ok({ rev, items, presence: presence(bd.id), title: bd.title, updatedAt: bd.updatedAt, canEdit: r.edit });
  }
  if (c === 'ops' && method === 'POST') {
    if (!r.edit) return err(403, 'У вас только просмотр этой доски');
    touch(ctx, bd.id, body.client); return ok(applyOps(ctx, bd, body.ops));
  }
  if (c === 'template' && method === 'POST') {
    if (!r.edit) return err(403, 'У вас только просмотр этой доски');
    const n = addTemplate(ctx, bd, body.template === 'ep' ? 'ep' : '', ''); if (!n) return err(400, 'Неизвестный шаблон'); store.save(); audit('template', 'boards', bd.id, { items: n });
    return ok({ rev: bd.rev, added: n });
  }
  // --- файлы: base64 в JSON → диск; отдача по ключу ---
  if (c === 'files' && !d && method === 'POST') {
    if (!r.edit) return err(403, 'У вас только просмотр этой доски');
    const type = String(body.type || ''); const ext = BD.FILE_TYPES[type]; if (!ext) return err(400, 'Разрешены PNG, JPG, WebP, GIF и PDF');
    const b64 = String(body.data || ''); if (!b64) return err(400, 'Пустой файл'); if (b64.length * 3 / 4 > BD.MAX_FILE + 4) return err(400, `Файл больше ${Math.round(BD.MAX_FILE / 1048576)} МБ`);
    const data = Buffer.from(b64, 'base64'); if (!data.length) return err(400, 'Пустой файл'); if (data.length > BD.MAX_FILE) return err(400, `Файл больше ${Math.round(BD.MAX_FILE / 1048576)} МБ`);
    if (ext === 'pdf' && data.subarray(0, 5).toString() !== '%PDF-') return err(400, 'Это не PDF'); if (ext === 'png' && data.readUInt32BE(0) !== 0x89504e47) return err(400, 'Это не PNG'); if (ext === 'jpg' && data.readUInt16BE(0) !== 0xffd8) return err(400, 'Это не JPEG');
    const dir = filesDir(ctx, bd.id); fs.mkdirSync(dir, { recursive: true }); const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`; fs.writeFileSync(path.join(dir, key), data);
    audit('file', 'boards', bd.id, { key, size: data.length, name: String(body.name || '').slice(0, 120) }); touch(ctx, bd.id, body.client);
    return ok({ key, name: String(body.name || '').slice(0, 200), size: data.length, type, url: `/api/board/boards/${bd.id}/files/${key}` });
  }
  if (c === 'files' && d && method === 'GET') {
    if (!BD.KEY_RE.test(d)) return err(404, 'Файл не найден'); const file = path.join(filesDir(ctx, bd.id), d); if (!fs.existsSync(file)) return err(404, 'Файл не найден');
    const ext = d.split('.').pop(); return ctx.send(200, fs.readFileSync(file), { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Disposition': `inline; filename="${d}"`, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
  }
  if (c === 'files' && d && method === 'DELETE') {
    if (!r.manage) return err(403, 'Удалять файлы может владелец доски или руководитель'); if (!BD.KEY_RE.test(d)) return err(404, 'Файл не найден');
    const used = db.boardItems.some(i => i.boardId === bd.id && !i.deleted && (i.props.src === d || i.props.pdf === d)); if (used) return err(400, 'Файл используется на доске');
    try { fs.unlinkSync(path.join(filesDir(ctx, bd.id), d)); } catch { return err(404, 'Файл не найден'); } audit('file-delete', 'boards', bd.id, { key: d }); return ok({ ok: true });
  }
  return err(404, 'Нет такого действия');
}

module.exports = { id: 'board', api: 'board', collections: ['boards', 'boardItems'], handle, boardsOfProject, domain: BD };
