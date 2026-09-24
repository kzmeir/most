'use strict';
// Модуль «Управление проектами» (ЭП / РП): /api/pm/*. Свои права (domain.js), финансы здесь не видны.
const PM = require('./domain');

const FIELDS = ['name', 'client', 'address', 'area', 'status', 'risk', 'gipId', 'pmId', 'start', 'due', 'forecast', 'comment', 'projectId', 'members', 'miroUrl'];

// общие операции — их вызывают и другие модули через ctx.modules.pm (например, коммерция при подписании договора)
function addItems(ctx, list) { for (const it of list) { it.id = ctx.store.id(); ctx.db.pmItems.push(it); } return list; }
function applyPlan(ctx, p, start, fit) { const its = ctx.db.pmItems.filter(i => i.pid === p.id); const r = PM.plan(its, start, fit ? p.due : ''); for (const it of its) if (!it.done && r.due[it.id]) it.due = r.due[it.id]; return r; }
function createProject(ctx, fields, byUserId) {
  const p = Object.assign(ctx.pick(fields, FIELDS), { id: ctx.store.id(), track: fields.track, name: String(fields.name).trim(), status: fields.status || 'В работе', risk: fields.risk || 'Низкий', createdAt: new Date().toISOString(), createdBy: byUserId || '' });
  ctx.db.pmProjects.push(p); addItems(ctx, PM.itemsFromTemplate(p.track, p.id));
  if (p.start) { const r = applyPlan(ctx, p, p.start, !!(fields.fit && p.due)); if (!p.forecast) p.forecast = r.end; }
  ctx.store.save(); ctx.store.audit(byUserId || '', 'create', 'pmProjects', p.id); ctx.emit('pm.project.created', { project: p });
  return p;
}

function handle(ctx) {
  const { parts, method, body, user, db, store, D, ok, err, pick, num } = ctx;
  const [, a, b, c] = parts;
  if (!PM.canOpen(user)) return err(403, 'Нет доступа к управлению проектами');
  const t = ctx.today(); const findP = id => db.pmProjects.find(p => p.id === id);
  const projOut = p => { const o = Object.assign({}, p); if (!PM.canBudget(user, p)) delete o.budget; return o; };
  const card = p => {
    const out = { project: projOut(p), items: db.pmItems.filter(i => i.pid === p.id).sort((x, y) => x.stage - y.stage || x.order - y.order), blockers: db.pmBlockers.filter(x => x.pid === p.id), canEdit: PM.isManager(user, p), canBudget: PM.canBudget(user, p), summary: PM.summary(p, db.pmItems, db.pmBlockers, t) };
    if (out.canBudget) {
      out.budget = PM.budgetCalc(p.budget);
      const fp = p.projectId ? db.projects.find(x => x.id === p.projectId) : null;
      if (fp) { const ops = db.ops.filter(o => (o.project === fp.id || o.project === fp.name) && D.catKind(db.categories, o.category) !== 'transfer'); out.fact = { project: fp.name, income: ops.reduce((s, o) => s + num(o.credit), 0), expense: ops.reduce((s, o) => s + num(o.debit), 0), n: ops.length, subPaid: db.subcontracts.filter(s => s.project === fp.id || s.project === fp.name).reduce((s, x) => s + num(x.paid), 0) }; }
    }
    return out;
  };
  if (a === 'overview' && method === 'GET') {
    const dash = PM.dashboard(db.pmProjects, db.pmItems, db.pmBlockers, t);
    dash.rows = dash.rows.map(r => Object.assign(projOut(r), { canEdit: PM.isManager(user, r), canBudget: PM.canBudget(user, r) }));
    return ok(Object.assign(dash, { blockersList: db.pmBlockers.map(x => Object.assign({}, x, { project: (findP(x.pid) || {}).name || '', track: (findP(x.pid) || {}).track || '' })), canCreate: PM.canCreate(user), leader: PM.isLeader(user), financeProjects: PM.isLeader(user) ? db.projects.map(p => ({ id: p.id, name: p.name })) : [] }));
  }
  if (a === 'my' && method === 'GET') {
    const active = new Set(db.pmProjects.filter(p => !['Готово', 'Отменён'].includes(p.status)).map(p => p.id));
    const mine = db.pmItems.filter(it => active.has(it.pid) && !it.done && !it.na).filter(it => { const p = findP(it.pid);
      if (it.assigneeId === user.id) return true;
      if (user.role === 'lead') return !!user.section && PM.itemSection(it) === user.section;
      if (p.gipId === user.id && ['ГИП', 'Заказчик'].includes(it.role)) return true;
      if (p.pmId === user.id && ['ПМ', 'Заказчик'].includes(it.role)) return true;
      return PM.isLeader(user) && it.due && it.due < t; });
    return ok(mine.map(it => { const p = findP(it.pid); return Object.assign({}, it, { project: p.name, track: p.track, canEdit: PM.canEditItem(user, p, it) }); }).sort((x, y) => String(x.due || '9').localeCompare(String(y.due || '9'))));
  }
  if (a === 'projects') {
    if (!b && method === 'POST') {
      if (!PM.canCreate(user)) return err(403, 'Создавать проекты могут руководители, ПМ и ГИП');
      if (!['ep', 'rp'].includes(body.track) || !String(body.name || '').trim()) return err(400, 'Укажите стадию (ЭП/РП) и название');
      const f = Object.assign({}, body); if (user.role === 'gip' && !f.gipId) f.gipId = user.id; if (user.role === 'pm' && !f.pmId) f.pmId = user.id;
      return ok(card(createProject(ctx, f, user.id)));
    }
    const p = b && findP(b); if (b && !p) return err(404, 'Проект не найден');
    if (p && !c && method === 'GET') return ok(card(p));
    if (p && !c && method === 'PUT') {
      if (!PM.isManager(user, p)) return err(403, 'Менять карточку могут руководитель, ГИП и ПМ проекта');
      const patch = pick(body, FIELDS); if ('budget' in body) { if (!PM.canBudget(user, p)) return err(403, 'Нет доступа к бюджету'); patch.budget = body.budget; }
      if (('gipId' in patch || 'pmId' in patch) && !PM.isLeader(user)) { delete patch.gipId; delete patch.pmId; }
      Object.assign(p, patch, { updatedAt: new Date().toISOString(), updatedBy: user.id }); store.save(); store.audit(user.id, 'update', 'pmProjects', p.id); return ok(card(p));
    }
    if (p && !c && method === 'DELETE') {
      if (!PM.isLeader(user)) return err(403, 'Удалять может руководитель');
      db.pmItems = db.pmItems.filter(i => i.pid !== p.id); db.pmBlockers = db.pmBlockers.filter(x => x.pid !== p.id); db.pmProjects = db.pmProjects.filter(x => x.id !== p.id);
      store.save(); store.audit(user.id, 'delete', 'pmProjects', p.id); return ok({ ok: true });
    }
    if (p && c === 'plan' && method === 'POST') {
      if (!PM.isManager(user, p)) return err(403, 'Планировать может ГИП/ПМ проекта');
      const start = body.start || p.start || t; const r = applyPlan(ctx, p, start, !!body.fit && !!p.due); p.start = start; if (!body.fit) p.forecast = r.end;
      store.save(); store.audit(user.id, 'plan', 'pmProjects', p.id, { start, fit: !!body.fit }); return ok(card(p));
    }
    if (p && c === 'handover' && method === 'POST') {
      if (p.track !== 'ep') return err(400, 'Передать в РП можно эскизный проект'); if (!PM.isManager(user, p)) return err(403, 'Передаёт ПМ проекта или руководитель');
      const rp = createProject(ctx, { track: 'rp', name: p.name, client: p.client || '', address: p.address || '', area: p.area || '', projectId: p.projectId || '', members: p.members || {}, pmId: p.pmId || '', gipId: body.gipId || p.gipId || '', start: body.start || t, due: body.due || '', fit: !!body.due }, user.id);
      rp.epId = p.id; Object.assign(p, { status: 'Готово', rpId: rp.id, handedAt: t }); store.save(); store.audit(user.id, 'handover', 'pmProjects', p.id, { rp: rp.id }); return ok(card(rp));
    }
    if (p && c === 'items' && method === 'POST') {
      if (!PM.isManager(user, p)) return err(403, 'Добавлять пункты может ГИП/ПМ проекта');
      const st = Number(body.stage) || 1; const same = db.pmItems.filter(i => i.pid === p.id && i.stage === st);
      const it = addItems(ctx, [{ pid: p.id, stage: st, stageName: (same[0] || {}).stageName || PM.stageNames(p.track)[st - 1] || `Этап ${st}`, title: String(body.title || '').trim() || 'Пункт', role: body.role || 'ГИП', section: PM.ROLE_SECTION[body.role] || '', weeks: num(body.weeks) || 1, crit: body.crit || '', optional: false, done: false, na: false, due: body.due || '', assigneeId: body.assigneeId || '', note: body.note || '', order: Math.max(0, ...db.pmItems.filter(i => i.pid === p.id).map(i => i.order || 0)) + 1, custom: true }])[0];
      store.save(); store.audit(user.id, 'create', 'pmItems', it.id); return ok(it);
    }
  }
  if (a === 'items' && b) {
    const it = db.pmItems.find(i => i.id === b); if (!it) return err(404, 'Пункт не найден'); const p = findP(it.pid);
    if (method === 'PUT') {
      if (!PM.canEditItem(user, p, it)) return err(403, 'Этот пункт ведёт другой раздел');
      const patch = pick(body, ['done', 'na', 'due', 'note', 'assigneeId', 'doneNote']);
      if (PM.isManager(user, p)) Object.assign(patch, pick(body, ['title', 'role', 'weeks', 'crit', 'stage']));
      if ('done' in patch) { patch.done = !!patch.done; if (patch.done && !it.done) { patch.doneAt = t; patch.doneBy = user.id; } if (!patch.done) { patch.doneAt = ''; patch.doneBy = ''; } }
      if ('role' in patch) patch.section = PM.ROLE_SECTION[patch.role] || '';
      Object.assign(it, patch); store.save(); store.audit(user.id, 'update', 'pmItems', it.id, patch.done !== undefined ? { done: patch.done } : null);
      if (patch.done === true) ctx.emit('pm.item.done', { item: it, project: p });
      return ok(it);
    }
    if (method === 'DELETE') { if (!PM.isManager(user, p)) return err(403, 'Удалять пункты может ГИП/ПМ проекта'); db.pmItems = db.pmItems.filter(i => i.id !== it.id); store.save(); store.audit(user.id, 'delete', 'pmItems', b); return ok({ ok: true }); }
  }
  if (a === 'blockers') {
    const F = ['what', 'holder', 'ownerId', 'expected', 'lastContact', 'status', 'comment', 'since'];
    if (!b && method === 'POST') { const p = findP(body.pid); if (!p) return err(400, 'Нет проекта'); if (!PM.isManager(user, p) && user.role !== 'lead') return err(403, 'Нет прав');
      const x = Object.assign(pick(body, F), { id: store.id(), pid: p.id, status: body.status || 'open', since: body.since || t, createdAt: new Date().toISOString(), createdBy: user.id }); db.pmBlockers.push(x); store.save(); store.audit(user.id, 'create', 'pmBlockers', x.id); return ok(x); }
    const x = b && db.pmBlockers.find(z => z.id === b); if (!x) return err(404, 'Блокер не найден'); const p = findP(x.pid);
    if (!PM.isManager(user, p) && x.createdBy !== user.id) return err(403, 'Менять может ГИП/ПМ проекта или автор');
    if (method === 'PUT') { Object.assign(x, pick(body, F), x.status !== 'closed' && body.status === 'closed' ? { closedAt: t } : {}); store.save(); store.audit(user.id, 'update', 'pmBlockers', x.id); return ok(x); }
    if (method === 'DELETE') { db.pmBlockers = db.pmBlockers.filter(z => z.id !== x.id); store.save(); store.audit(user.id, 'delete', 'pmBlockers', x.id); return ok({ ok: true }); }
  }
  return err(404, 'Нет такого действия');
}

module.exports = { id: 'pm', api: 'pm', collections: ['pmProjects', 'pmItems', 'pmBlockers'], handle, createProject, domain: PM };
