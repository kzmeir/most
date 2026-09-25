'use strict';
// Модуль «Доска» (аналог Miro), v2: /api/board/*. Поток G. Контракт — docs/ARCHITECTURE.md, задание — modules/board/README.md, логика — modules/board/domain.js.
// Доски (boards), объекты (boardItems) и комментарии (boardComments) — в базе ядра; файлы (картинки, PDF) — на диске в DATA_DIR/board-files/<boardId>/, в базе только ключи.
// Совместная работа: клиент шлёт операции (upsert/delete по объектам), сервер нумерует ревизии доски (rev) и версии объектов (ver); клиенты опрашивают
// sync?since=rev раз в секунду и получают только изменённое (удалённые — надгробия), плюс присутствие с курсорами (в памяти сервера, без записи в БД).
// Права v2 (решение директора 25.09.2026): все активные пользователи видят все доски и создают новые; правка — по режиму доски «Кто правит»
// (все / участники / только руководители проекта); настройки — владелец доски, ПМ/ГИП проекта, owner/partner; удаление — владелец и owner/partner.
const fs = require('fs');
const path = require('path');
const BD = require('./domain');

const PRESENCE = new Map(); // boardId → Map('userId|client' → { userId, name, client, at, x, y, sel })
const PRESENCE_TTL = 12000;
const AUDIT_EVERY = 5 * 60000; const auditAt = new Map(); // журнал операций — не чаще раза в 5 минут на пользователя и доску
let saveTimer = null;
const now = () => new Date().toISOString();
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };

// запись изменений в базу — с задержкой, чтобы серия операций писалась одной транзакцией
function scheduleSave(store) { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; try { store.save(); } catch (e) { console.error('[board] save:', e.message); } }, 600); }
const pmOf = ctx => (ctx.modules.pm && ctx.modules.pm.domain) || null;
const projectOf = (db, b) => b && b.pmProjectId ? db.pmProjects.find(p => p.id === b.pmProjectId) || null : null;
function rights(ctx, b) { const p = projectOf(ctx.db, b); const PM = pmOf(ctx); return { view: BD.canView(ctx.user), edit: BD.canEdit(ctx.user, b, p, PM), manage: BD.canManage(ctx.user, b, p, PM), del: BD.canDelete(ctx.user, b, PM), project: p }; }
const filesDir = (ctx, boardId) => path.join(ctx.store.DATA_DIR, 'board-files', String(boardId).replace(/[^\w-]/g, ''));
const fileExists = (ctx, boardId, key) => BD.KEY_RE.test(String(key || '')) && fs.existsSync(path.join(filesDir(ctx, boardId), key));
const liveItems = (db, boardId) => db.boardItems.filter(i => i.boardId === boardId && !i.deleted);
const boardComments = (db, boardId) => db.boardComments.filter(c => c.boardId === boardId);
// имена авторов: пользователи базы — через ядро; dev-пользователи (режим разработки) — из памяти по последнему запросу
const NAMES = new Map();
const nameOf = (ctx, id) => { if (!id) return ''; if (ctx.user && ctx.user.id === id && ctx.user.name) NAMES.set(id, ctx.user.name); return ctx.userName(id) || NAMES.get(id) || ''; };
const itemOut = (ctx, it) => it.deleted ? { id: it.id, deleted: true, rev: it.rev || 0, ver: it.ver || 0 } : Object.assign({}, it, { updatedByName: nameOf(ctx, it.updatedBy || it.createdBy) });
const commentOut = (ctx, c) => c.deleted ? { id: c.id, deleted: true, rev: c.rev || 0 } : Object.assign({}, c, { userName: nameOf(ctx, c.userId), resolvedByName: c.resolvedBy ? nameOf(ctx, c.resolvedBy) : '' });

// присутствие: кто на доске, где курсор и что выделено (только память)
function touch(ctx, boardId, q) {
  q = q || {}; const m = PRESENCE.get(boardId) || new Map(); PRESENCE.set(boardId, m); const t = Date.now(); const client = String(q.client || '').slice(0, 24); const key = ctx.user.id + '|' + client;
  const prev = m.get(key) || {}; const has = v => v !== undefined && v !== '' && v !== null && Number.isFinite(Number(v));
  m.set(key, { userId: ctx.user.id, name: nameOf(ctx, ctx.user.id) || ctx.user.name || '', client, at: t, x: has(q.cx) ? Number(q.cx) : prev.x, y: has(q.cy) ? Number(q.cy) : prev.y, sel: q.sel !== undefined ? String(q.sel).split(',').filter(x => x && x !== '-').slice(0, 30) : prev.sel || [], moved: has(q.cx) && (prev.x !== Number(q.cx) || prev.y !== Number(q.cy)) ? t : prev.moved || 0 }); // sel=- — выделение снято
  for (const [k, v] of m) if (t - v.at > PRESENCE_TTL) m.delete(k);
}
function presence(boardId) { const m = PRESENCE.get(boardId); if (!m) return []; const t = Date.now(); return [...m.values()].filter(v => t - v.at <= PRESENCE_TTL).map(v => ({ userId: v.userId, name: v.name, client: v.client, x: v.x, y: v.y, sel: v.sel, at: v.at, idle: t - (v.moved || 0) > 30000 })); }
const onlineUsers = boardId => new Set(presence(boardId).map(p => p.userId)).size;

function boardOut(ctx, b, r) {
  const { db } = ctx; const p = r ? r.project : projectOf(db, b);
  return { id: b.id, title: b.title, pmProjectId: b.pmProjectId || '', project: p ? { id: p.id, name: p.name, track: p.track || '', status: p.status || '' } : null, ownerId: b.ownerId, ownerName: ctx.userName(b.ownerId) || '', members: b.members || [], memberNames: (b.members || []).map(id => ctx.userName(id) || id), editMode: BD.editMode(b), template: b.template || '', source: b.source || null, createdAt: b.createdAt, updatedAt: b.updatedAt || b.createdAt, updatedByName: ctx.userName(b.updatedBy || b.createdBy) || '', rev: b.rev || 0, itemsN: liveItems(db, b.id).length, openComments: BD.openComments(boardComments(db, b.id)), online: onlineUsers(b.id), canEdit: r ? r.edit : false, canManage: r ? r.manage : false, canDelete: r ? r.del : false };
}
// применить операции клиента: одна ревизия на пакет; объекты получают rev пакета и ver+1
function applyOps(ctx, b, ops) {
  const { db, user } = ctx; const byId = new Map(db.boardItems.filter(i => i.boardId === b.id).map(i => [i.id, i]));
  b.rev = (b.rev || 0) + 1; const rev = b.rev; const t = now(); const applied = [];
  for (const op of (Array.isArray(ops) ? ops : []).slice(0, 500)) {
    if (!op || typeof op !== 'object') continue;
    if (op.op === 'delete') {
      const it = byId.get(String(op.id || '')); if (!it || it.deleted) continue;
      for (const fix of BD.detachArrows([...byId.values()].filter(i => !i.deleted), [it.id])) { const ar = byId.get(fix.id); Object.assign(ar, { x: fix.x, y: fix.y, props: fix.props, rev, ver: (ar.ver || 0) + 1, updatedAt: t, updatedBy: user.id }); applied.push(ar); }
      Object.assign(it, { deleted: true, rev, ver: (it.ver || 0) + 1, updatedAt: t, updatedBy: user.id, props: {} }); applied.push(it); continue;
    }
    if (op.op !== 'upsert') continue;
    const clean = BD.cleanItem(op.item, b.id); if (!clean) continue;
    if (clean.props.src && !fileExists(ctx, b.id, clean.props.src)) clean.props.src = ''; if (clean.props.pdf && !fileExists(ctx, b.id, clean.props.pdf)) clean.props.pdf = '';
    if (clean.type === 'arrow') { const live = id => { const x = byId.get(id); return x && !x.deleted; }; if (clean.props.from && !live(clean.props.from)) clean.props.from = ''; if (clean.props.to && !live(clean.props.to)) clean.props.to = ''; }
    const cur = byId.get(clean.id);
    if (cur) { Object.assign(cur, clean, { deleted: false, rev, ver: (cur.ver || 0) + 1, updatedAt: t, updatedBy: user.id }); applied.push(cur); }
    else { const it = Object.assign(clean, { rev, ver: 1, createdAt: t, createdBy: user.id, updatedAt: t, updatedBy: user.id }); db.boardItems.push(it); byId.set(it.id, it); applied.push(it); }
  }
  b.updatedAt = t; b.updatedBy = user.id; scheduleSave(ctx.store);
  const k = user.id + '|' + b.id; if (Date.now() - (auditAt.get(k) || 0) > AUDIT_EVERY) { auditAt.set(k, Date.now()); ctx.store.audit(user.id, 'ops', 'boardItems', b.id, { ops: applied.length }); }
  return { rev, items: applied.map(it => itemOut(ctx, it)) };
}
function addTemplate(ctx, b, template, title) {
  if (template !== 'ep') return 0; const { db } = ctx; const box = BD.bbox(liveItems(db, b.id)); const dy = box ? box.y + box.h + 300 : 0; const t = now();
  b.rev = (b.rev || 0) + 1; const items = BD.epTemplate(b.id, { title }); for (const it of items) { it.y += dy; db.boardItems.push(Object.assign(it, { rev: b.rev, ver: 1, createdAt: t, createdBy: ctx.user.id, updatedAt: t, updatedBy: ctx.user.id })); }
  b.template = 'ep'; b.updatedAt = t; b.updatedBy = ctx.user.id; return items.length;
}
// для других модулей: доски проекта (карточка pm), без объектов
function boardsOfProject(ctx, pmProjectId) { return ctx.db.boards.filter(b => b.pmProjectId === pmProjectId).map(b => boardOut(ctx, b, rights(ctx, b))); }

function handle(ctx) {
  const { parts, method, body, user, db, store, ok, err, qs } = ctx;
  if (!BD.canView(user)) return err(401, 'Не авторизован');
  const [, a, b, c, d] = parts; const PM = pmOf(ctx);
  const audit = (action, col, id, extra) => store.audit(user.id, action, col, id, extra);
  const cleanMembers = list => [...new Set((Array.isArray(list) ? list : []).map(String).filter(id => id && (db.users.some(u => u.id === id) || /^dev-/.test(id))))];
  const cleanMode = m => (BD.EDIT_MODES[m] ? m : 'all');

  // --- доски проекта (для карточки pm и встраивания) ---
  if (a === 'by-project' && b && method === 'GET') {
    const p = db.pmProjects.find(x => x.id === b); if (!p) return err(404, 'Проект не найден');
    return ok({ project: { id: p.id, name: p.name, track: p.track || '', status: p.status || '' }, boards: db.boards.filter(x => x.pmProjectId === p.id).map(x => boardOut(ctx, x, rights(ctx, x))).sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt))), canCreate: BD.canCreateProjectBoard(user, p) });
  }
  // --- импорт (перенос досок Miro, JSON от modules/board/tools/miro_import.js): только руководитель; большие доски — частями ---
  // { title, pmProjectId, sourceUrl, items: [...], boardId?: продолжение, done?: true } → { boardId, added, total }
  if (a === 'import' && !b && method === 'POST') {
    if (!BD.isLeader(user, PM)) return err(403, 'Импорт досок доступен владельцу и партнёру');
    let bd = body.boardId ? db.boards.find(x => x.id === String(body.boardId)) : null; if (body.boardId && !bd) return err(404, 'Доска не найдена');
    if (!bd) {
      const pid = String(body.pmProjectId || ''); if (pid && !db.pmProjects.some(x => x.id === pid)) return err(404, 'Проект не найден');
      const url = String(body.sourceUrl || '').slice(0, 300); const title = String(body.title || '').trim().slice(0, BD.MAX_TITLE) || 'Импорт из Miro';
      bd = { id: store.id(), title, pmProjectId: pid, ownerId: user.id, members: [], editMode: 'all', template: '', source: url ? { kind: 'miro', url, at: now(), byId: user.id } : null, rev: 0, createdAt: now(), createdBy: user.id, updatedAt: now(), updatedBy: user.id };
      db.boards.push(bd); audit('import', 'boards', bd.id, { source: url });
    }
    const list = (Array.isArray(body.items) ? body.items : []).slice(0, 500); const t = now(); bd.rev = (bd.rev || 0) + 1; let added = 0; const dir = filesDir(ctx, bd.id);
    for (const raw of list) {
      const src = raw && typeof raw === 'object' ? raw : null; if (!src) continue; const file = src.file && typeof src.file === 'object' ? src.file : null; delete src.file;
      const it = BD.cleanItem(src, bd.id); if (!it) continue;
      if (file && BD.FILE_TYPES[file.type] && file.data) { // картинка из Miro: файл приезжает вместе с объектом
        const data = Buffer.from(String(file.data), 'base64'); if (data.length && data.length <= BD.MAX_FILE) { fs.mkdirSync(dir, { recursive: true }); const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${BD.FILE_TYPES[file.type]}`; fs.writeFileSync(path.join(dir, key), data); it.props.src = key; it.props.name = String(file.name || it.props.name || '').slice(0, 200); }
      } else { if (it.props.src && !fileExists(ctx, bd.id, it.props.src)) it.props.src = ''; if (it.props.pdf && !fileExists(ctx, bd.id, it.props.pdf)) it.props.pdf = ''; }
      const cur = db.boardItems.find(x => x.boardId === bd.id && x.id === it.id);
      if (cur) Object.assign(cur, it, { deleted: false, rev: bd.rev, ver: (cur.ver || 0) + 1, updatedAt: t, updatedBy: user.id }); else db.boardItems.push(Object.assign(it, { rev: bd.rev, ver: 1, createdAt: t, createdBy: user.id, updatedAt: t, updatedBy: user.id }));
      added++;
    }
    bd.updatedAt = t; bd.updatedBy = user.id; if (body.done) { for (const fix of BD.repairArrows(liveItems(db, bd.id))) { const ar = db.boardItems.find(x => x.boardId === bd.id && x.id === fix.id); if (ar) Object.assign(ar, { props: fix.props, rev: bd.rev }); } }
    store.save(); return ok({ boardId: bd.id, added, total: liveItems(db, bd.id).length, board: boardOut(ctx, bd, rights(ctx, bd)) });
  }
  if (a !== 'boards') return err(404, 'Нет такого действия');

  // --- список и создание: все доски видны всем ---
  if (!b && method === 'GET') {
    const q = String(qs.q || '').trim().toLowerCase();
    const list = db.boards.map(x => ({ x, r: rights(ctx, x) })).filter(({ x, r }) => (!qs.pid || x.pmProjectId === qs.pid) && (qs.mine !== '1' || x.ownerId === user.id || (x.members || []).includes(user.id)) && (!q || String(x.title).toLowerCase().includes(q) || (r.project && String(r.project.name).toLowerCase().includes(q))))
      .map(({ x, r }) => boardOut(ctx, x, r)).sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)));
    const projects = db.pmProjects.map(p => ({ id: p.id, name: p.name, track: p.track || '', status: p.status || '' })).sort((x, y) => String(x.name).localeCompare(String(y.name), 'ru'));
    return ok({ boards: list, projects, canCreate: true, modes: BD.EDIT_MODES });
  }
  if (!b && method === 'POST') {
    const pid = String(body.pmProjectId || ''); let p = null;
    if (pid) { p = db.pmProjects.find(x => x.id === pid); if (!p) return err(404, 'Проект не найден'); }
    const title = String(body.title || '').trim().slice(0, BD.MAX_TITLE) || (p ? `${p.name} · доска` : 'Новая доска');
    const bd = { id: store.id(), title, pmProjectId: pid, ownerId: user.id, members: cleanMembers(body.members).filter(id => id !== user.id), editMode: cleanMode(body.editMode), template: '', rev: 0, createdAt: now(), createdBy: user.id, updatedAt: now(), updatedBy: user.id };
    const tpl = body.template === 'ep' && (!p || p.track === 'ep') ? 'ep' : ''; // шаблон ЭП — только для эскизного проекта или свободной доски
    db.boards.push(bd); const n = addTemplate(ctx, bd, tpl, tpl ? title : '');
    store.save(); audit('create', 'boards', bd.id, { pmProjectId: pid, template: n }); return ok({ board: boardOut(ctx, bd, rights(ctx, bd)), items: liveItems(db, bd.id).map(it => itemOut(ctx, it)), rev: bd.rev });
  }
  const bd = db.boards.find(x => x.id === b); if (!bd) return err(404, 'Доска не найдена');
  const r = rights(ctx, bd);

  if (!c && method === 'GET') {
    touch(ctx, bd.id, qs); const live = liveItems(db, bd.id); const fixes = BD.repairArrows(live); // старые стрелки с оборванными привязками
    if (fixes.length) { bd.rev = (bd.rev || 0) + 1; for (const f of fixes) { const ar = live.find(i => i.id === f.id); Object.assign(ar, { props: f.props, rev: bd.rev, ver: (ar.ver || 0) + 1, updatedAt: now() }); } scheduleSave(store); }
    return ok({ board: boardOut(ctx, bd, r), items: live.map(it => itemOut(ctx, it)), comments: boardComments(db, bd.id).filter(x => !x.deleted).map(x => commentOut(ctx, x)), rev: bd.rev || 0, presence: presence(bd.id), me: user.id, colors: BD.COLORS, maxFile: BD.MAX_FILE, modes: BD.EDIT_MODES });
  }
  if (!c && method === 'PUT') {
    if (!r.manage) return err(403, 'Настройки доски меняет её владелец, ПМ/ГИП проекта, владелец или партнёр');
    const patch = {}; if ('title' in body) { patch.title = String(body.title || '').trim().slice(0, BD.MAX_TITLE); if (!patch.title) delete patch.title; }
    if ('members' in body) patch.members = cleanMembers(body.members).filter(id => id !== bd.ownerId);
    if ('editMode' in body) patch.editMode = cleanMode(body.editMode);
    if ('pmProjectId' in body) { const pid = String(body.pmProjectId || ''); if (pid && !db.pmProjects.some(x => x.id === pid)) return err(404, 'Проект не найден'); patch.pmProjectId = pid; }
    Object.assign(bd, patch, { updatedAt: now(), updatedBy: user.id }); store.save(); audit('update', 'boards', bd.id, { editMode: bd.editMode }); return ok({ board: boardOut(ctx, bd, rights(ctx, bd)) });
  }
  if (!c && method === 'DELETE') {
    if (!r.del) return err(403, 'Удалить доску может её владелец, владелец компании или партнёр');
    db.boardItems = db.boardItems.filter(i => i.boardId !== bd.id); db.boardComments = db.boardComments.filter(x => x.boardId !== bd.id); db.boards = db.boards.filter(x => x.id !== bd.id); PRESENCE.delete(bd.id);
    try { fs.rmSync(filesDir(ctx, bd.id), { recursive: true, force: true }); } catch { }
    store.save(); audit('delete', 'boards', bd.id); return ok({ ok: true });
  }
  // --- синхронизация: изменения после ревизии since (объекты и комментарии), присутствие с курсорами ---
  if (c === 'sync' && method === 'GET') {
    touch(ctx, bd.id, qs); const since = Math.max(0, Number(qs.since) || 0); const rev = bd.rev || 0;
    const items = since >= rev ? [] : db.boardItems.filter(i => i.boardId === bd.id && (i.rev || 0) > since).map(i => itemOut(ctx, i));
    const comments = since >= rev ? [] : boardComments(db, bd.id).filter(x => (x.rev || 0) > since).map(x => commentOut(ctx, x));
    return ok({ rev, items, comments, presence: presence(bd.id), title: bd.title, updatedAt: bd.updatedAt, canEdit: r.edit, canManage: r.manage, editMode: BD.editMode(bd), openComments: BD.openComments(boardComments(db, bd.id)) });
  }
  if (c === 'ops' && method === 'POST') {
    if (!r.edit) return err(403, BD.editMode(bd) === 'managers' ? 'Эту доску правят только руководители проекта' : 'Эту доску правят только её участники');
    touch(ctx, bd.id, body); return ok(applyOps(ctx, bd, body.ops));
  }
  if (c === 'template' && method === 'POST') {
    if (!r.edit) return err(403, 'У вас только просмотр этой доски'); if (r.project && r.project.track !== 'ep') return err(400, 'Шаблон ЭП — только для эскизного проекта');
    const n = addTemplate(ctx, bd, body.template === 'ep' ? 'ep' : '', ''); if (!n) return err(400, 'Неизвестный шаблон'); store.save(); audit('template', 'boards', bd.id, { items: n });
    return ok({ rev: bd.rev, added: n });
  }
  // --- комментарии: к объекту (itemId) или к месту (x, y); ветка = корень + ответы (parentId); «решено» у корня ---
  if (c === 'comments') {
    const all = boardComments(db, bd.id); const bump = () => { bd.rev = (bd.rev || 0) + 1; return bd.rev; };
    if (!d && method === 'POST') {
      if (!BD.canComment(user)) return err(403, 'Нет доступа');
      const cl = BD.cleanComment(body, bd.id); if (!cl) return err(400, 'Пустой комментарий');
      if (cl.parentId) { const root = all.find(x => x.id === cl.parentId && !x.deleted && !x.parentId); if (!root) return err(404, 'Ветка не найдена'); cl.itemId = root.itemId; cl.x = root.x; cl.y = root.y; }
      if (cl.itemId && !db.boardItems.some(i => i.boardId === bd.id && i.id === cl.itemId && !i.deleted)) cl.itemId = '';
      const cm = Object.assign(cl, { id: store.id(), userId: user.id, resolved: false, createdAt: now(), updatedAt: now(), rev: bump() }); db.boardComments.push(cm); bd.updatedAt = now(); store.save(); audit('comment', 'boardComments', cm.id, { boardId: bd.id }); touch(ctx, bd.id, body);
      return ok({ comment: commentOut(ctx, cm), rev: bd.rev });
    }
    const cm = d && all.find(x => x.id === d && !x.deleted); if (d && !cm) return err(404, 'Комментарий не найден');
    if (cm && method === 'PUT') {
      const patch = {};
      if ('text' in body) { if (cm.userId !== user.id) return err(403, 'Текст комментария меняет только его автор'); const text = String(body.text || '').trim().slice(0, BD.MAX_COMMENT); if (!text) return err(400, 'Пустой комментарий'); patch.text = text; }
      if ('resolved' in body) { if (cm.parentId) return err(400, 'Решённой отмечается ветка (первое сообщение)'); const on = body.resolved === true || body.resolved === 'true'; patch.resolved = on; patch.resolvedBy = on ? user.id : ''; patch.resolvedAt = on ? now() : ''; }
      Object.assign(cm, patch, { updatedAt: now(), rev: bump() }); bd.updatedAt = now(); store.save(); audit('comment-update', 'boardComments', cm.id, patch.resolved !== undefined ? { resolved: patch.resolved } : null);
      return ok({ comment: commentOut(ctx, cm), rev: bd.rev });
    }
    if (cm && method === 'DELETE') {
      if (cm.userId !== user.id && !r.manage) return err(403, 'Удаляет автор комментария или руководитель доски');
      const rev = bump(); const gone = [cm].concat(cm.parentId ? [] : all.filter(x => x.parentId === cm.id && !x.deleted));
      for (const x of gone) Object.assign(x, { deleted: true, text: '', rev, updatedAt: now() }); bd.updatedAt = now(); store.save(); audit('comment-delete', 'boardComments', cm.id, { n: gone.length });
      return ok({ deleted: gone.map(x => x.id), rev });
    }
    return err(404, 'Нет такого действия');
  }
  // --- файлы: base64 в JSON → диск; отдача по ключу ---
  if (c === 'files' && !d && method === 'POST') {
    if (!r.edit) return err(403, 'У вас только просмотр этой доски');
    const type = String(body.type || ''); const ext = BD.FILE_TYPES[type]; if (!ext) return err(400, 'Разрешены PNG, JPG, WebP, GIF и PDF');
    const b64 = String(body.data || ''); if (!b64) return err(400, 'Пустой файл'); if (b64.length * 3 / 4 > BD.MAX_FILE + 4) return err(400, `Файл больше ${Math.round(BD.MAX_FILE / 1048576)} МБ`);
    const data = Buffer.from(b64, 'base64'); if (!data.length) return err(400, 'Пустой файл'); if (data.length > BD.MAX_FILE) return err(400, `Файл больше ${Math.round(BD.MAX_FILE / 1048576)} МБ`);
    if (ext === 'pdf' && data.subarray(0, 5).toString() !== '%PDF-') return err(400, 'Это не PDF'); if (ext === 'png' && data.readUInt32BE(0) !== 0x89504e47) return err(400, 'Это не PNG'); if (ext === 'jpg' && data.readUInt16BE(0) !== 0xffd8) return err(400, 'Это не JPEG');
    const dir = filesDir(ctx, bd.id); fs.mkdirSync(dir, { recursive: true }); const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`; fs.writeFileSync(path.join(dir, key), data);
    audit('file', 'boards', bd.id, { key, size: data.length, name: String(body.name || '').slice(0, 120) }); touch(ctx, bd.id, body);
    return ok({ key, name: String(body.name || '').slice(0, 200), size: data.length, type, url: `/api/board/boards/${bd.id}/files/${key}` });
  }
  if (c === 'files' && d && method === 'GET') {
    if (!BD.KEY_RE.test(d)) return err(404, 'Файл не найден'); const file = path.join(filesDir(ctx, bd.id), d); if (!fs.existsSync(file)) return err(404, 'Файл не найден');
    const ext = d.split('.').pop(); return ctx.send(200, fs.readFileSync(file), { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Disposition': `inline; filename="${d}"`, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
  }
  if (c === 'files' && d && method === 'DELETE') {
    if (!r.manage) return err(403, 'Удалять файлы может руководитель доски'); if (!BD.KEY_RE.test(d)) return err(404, 'Файл не найден');
    const used = db.boardItems.some(i => i.boardId === bd.id && !i.deleted && (i.props.src === d || i.props.pdf === d)); if (used) return err(400, 'Файл используется на доске');
    try { fs.unlinkSync(path.join(filesDir(ctx, bd.id), d)); } catch { return err(404, 'Файл не найден'); } audit('file-delete', 'boards', bd.id, { key: d }); return ok({ ok: true });
  }
  return err(404, 'Нет такого действия');
}

module.exports = { id: 'board', api: 'board', collections: ['boards', 'boardItems', 'boardComments'], handle, boardsOfProject, domain: BD };
