'use strict';
// Модуль «Управление проектами» (концепция / ЭП / РП / АН): /api/pm/*. Свои права (domain.js), финансы здесь не видны —
// всё нужное из финансов (список проектов для связи, факт бюджета, подрядчики для подсказок) отдаётся отсюда с проверкой прав.
const PM = require('./domain');

const FIELDS = ['name', 'no', 'client', 'address', 'area', 'status', 'risk', 'gipId', 'pmId', 'start', 'due', 'forecast', 'comment', 'projectId', 'members', 'miroUrl', 'folder'];
const ITEM_FIELDS_ANY = ['done', 'na', 'due', 'note', 'assigneeId', 'contractor', 'doneNote'];
const ITEM_FIELDS_MGR = ['title', 'role', 'weeks', 'weeksMax', 'crit', 'stage'];
const RETRO_FIELDS = ['interpret', 'change', 'sprint'];
// устав проекта: только известные поля, текст
function cleanCharter(c) { if (!c || typeof c !== 'object') return null; const out = {}; for (const [k] of PM.CHARTER_FIELDS) out[k] = String(c[k] || '').trim().slice(0, 2000); return out; }
const BLOCKER_FIELDS = ['what', 'holder', 'ownerId', 'expected', 'lastContact', 'status', 'comment', 'since'];
const TRACKS = Object.keys(PM.TRACKS);

// общие операции — их вызывают и другие модули через ctx.modules.pm (например, коммерция при подписании договора)
function addItems(ctx, list) { for (const it of list) { it.id = ctx.store.id(); ctx.db.pmItems.push(it); } return list; }
function applyPlan(ctx, p, start, fit) { const its = ctx.db.pmItems.filter(i => i.pid === p.id); const r = PM.plan(its, start, fit ? p.due : ''); for (const it of its) if (!it.done && r.due[it.id]) it.due = r.due[it.id]; return r; }
// бюджет: только известные поля, разделы — название/сумма/исполнитель
function cleanBudget(b) {
  if (!b || typeof b !== 'object') return null; const num = v => (v === '' || v == null ? null : Number(v));
  const out = { contract: Number(b.contract) || 0, contractVat: Number(b.contractVat) || 0, area: Number(b.area) || 0, months: Number(b.months) || 0, marginTarget: num(b.marginTarget), gipShare: num(b.gipShare), gipSum: Number(b.gipSum) || 0, objectType: String(b.objectType || ''), note: String(b.note || ''), sections: [] };
  if (out.marginTarget != null && out.marginTarget > 1) out.marginTarget = out.marginTarget / 100; // 30 → 0,3
  if (out.gipShare != null && out.gipShare > 1) out.gipShare = out.gipShare / 100;
  for (const s of Array.isArray(b.sections) ? b.sections : []) { const name = String((s && s.name) || '').trim(); if (!name) continue; out.sections.push({ name, sum: Number(s.sum) || 0, executor: String(s.executor || '') }); }
  return out;
}
// сигнатуру не менять — её используют другие модули. fields.track: concept|ep|rp|an; fields.fit — уложить план в дату по договору; fields.months — месяцев АН
function createProject(ctx, fields, byUserId) {
  const p = Object.assign(ctx.pick(fields, FIELDS), { id: ctx.store.id(), track: TRACKS.includes(fields.track) ? fields.track : 'rp', name: String(fields.name).trim(), status: fields.status || 'В работе', risk: fields.risk || 'Низкий', createdAt: new Date().toISOString(), createdBy: byUserId || '' });
  if (!PM.STATUS.includes(p.status)) p.status = 'В работе'; if (!PM.RISK.includes(p.risk)) p.risk = 'Низкий';
  if (fields.budget) p.budget = cleanBudget(fields.budget);
  ctx.db.pmProjects.push(p); addItems(ctx, PM.itemsFromTemplate(p.track, p.id, { start: p.start, due: p.due, months: fields.months }));
  if (p.start) { const r = applyPlan(ctx, p, p.start, !!(fields.fit && p.due)); if (!p.forecast) p.forecast = fields.fit && p.due ? p.due : r.end; }
  ctx.store.save(); ctx.store.audit(byUserId || '', 'create', 'pmProjects', p.id); ctx.emit('pm.project.created', { project: p });
  return p;
}
// финансовый проект, к которому привязан проект управления
function finProject(db, p) { return p && p.projectId ? db.projects.find(x => x.id === p.projectId) || null : null; }
// подрядчики по финансовому проекту — подсказки для поля «Исполнитель-подрядчик» (только названия, без сумм)
function contractorsOf(db, p) {
  const fp = finProject(db, p); const set = new Set();
  if (fp) for (const s of db.subcontracts) if (s.project === fp.id || s.project === fp.name) if (s.contractor) set.add(String(s.contractor).trim());
  for (const it of db.pmItems) if (it.pid === p.id && it.contractor) set.add(String(it.contractor).trim());
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}

function handle(ctx) {
  const { parts, method, body, user, db, store, D, ok, err, pick, num } = ctx;
  const [, a, b, c, d] = parts;
  if (!PM.canOpen(user)) return err(403, 'Нет доступа к управлению проектами');
  const t = ctx.today(); const now = () => new Date().toISOString(); const findP = id => db.pmProjects.find(p => p.id === id);
  const projOut = p => { const o = Object.assign({}, p); if (!PM.canBudget(user, p)) delete o.budget; return o; };
  const finProjects = () => db.projects.map(x => ({ id: x.id, name: x.name, status: x.status || '' })).sort((x, y) => (x.status === 'archive') - (y.status === 'archive') || String(x.name).localeCompare(String(y.name), 'ru'));
  const blockerOut = x => { const p = findP(x.pid) || {}; return Object.assign({}, x, { project: p.name || '', track: p.track || '', days: PM.blockerAge(x, t), canEdit: PM.isManager(user, p) || x.createdBy === user.id }); };
  const card = p => {
    const items = db.pmItems.filter(i => i.pid === p.id).sort((x, y) => x.stage - y.stage || x.order - y.order);
    const h = PM.health(p, db.pmItems, t);
    const out = { project: projOut(p), items: items.map(i => Object.assign({}, i, { canEdit: PM.canEditItem(user, p, i) })), blockers: db.pmBlockers.filter(x => x.pid === p.id).map(blockerOut), canEdit: PM.isManager(user, p), canBudget: PM.canBudget(user, p), leader: PM.isLeader(user), summary: PM.summary(p, db.pmItems, db.pmBlockers, t), stageNames: PM.stageNamesOf(items, p.track), contractors: contractorsOf(db, p), folderHint: PM.folderName(p), health: h, charterOk: PM.charterComplete(p.charter), retros: p.retros || [] };
    if (out.canBudget) out.throughput = PM.throughput(p, h);
    for (const k of ['epId', 'rpId', 'conceptId']) { const q = p[k] && findP(p[k]); if (q) out[k.replace('Id', '')] = { id: q.id, name: q.name, status: q.status, track: q.track }; }
    const fp = finProject(db, p); if (fp) out.finance = { id: fp.id, name: fp.name, client: fp.client || '', status: fp.status || '' };
    if (PM.isLeader(user)) out.financeProjects = finProjects();
    if (out.canBudget) {
      out.budget = PM.budgetCalc(p.budget);
      if (fp) { const ops = db.ops.filter(o => (o.project === fp.id || o.project === fp.name) && D.catKind(db.categories, o.category) !== 'transfer'); const subs = db.subcontracts.filter(s => s.project === fp.id || s.project === fp.name);
        out.fact = { project: fp.name, income: ops.reduce((s, o) => s + num(o.credit), 0), expense: ops.reduce((s, o) => s + num(o.debit), 0), n: ops.length, subPaid: subs.reduce((s, x) => s + num(x.paid), 0), subSum: subs.reduce((s, x) => s + num(x.sum), 0), contracts: db.contracts.filter(cn => cn.projectId === fp.id || cn.code === fp.id).reduce((s, x) => s + num(x.sum), 0), contractNoVat: num(fp.contractNoVat), targetCost: num(fp.targetCost) }; }
    }
    return out;
  };
  // счётчики в меню: просроченные «мои» пункты и блокеры старше 14 дней
  const myItems = () => {
    const active = new Set(db.pmProjects.filter(p => PM.ACTIVE(p.status)).map(p => p.id));
    return db.pmItems.filter(it => active.has(it.pid) && !it.done && !it.na).filter(it => { const p = findP(it.pid); if (!p) return false;
      if (it.assigneeId && it.assigneeId === user.id) return true;
      if (user.role === 'lead') return !!user.section && PM.itemSection(it) === user.section;
      if (p.gipId === user.id && ['ГИП', 'Заказчик'].includes(it.role)) return true;
      if (p.pmId === user.id && ['ПМ', 'Заказчик'].includes(it.role)) return true;
      return PM.isLeader(user) && !!it.due && it.due < t; });
  };
  if (a === 'badges' && method === 'GET') return ok({ pmmy: myItems().filter(it => it.due && it.due < t).length, pmbl: db.pmBlockers.filter(x => x.status !== 'closed' && PM.blockerAge(x, t) > 14 && PM.ACTIVE((findP(x.pid) || {}).status)).length });
  if (a === 'overview' && method === 'GET') {
    const dash = PM.dashboard(db.pmProjects, db.pmItems, db.pmBlockers, t);
    dash.rows = dash.rows.map(r => Object.assign(projOut(r), { canEdit: PM.isManager(user, r), canBudget: PM.canBudget(user, r) }, PM.canBudget(user, r) ? { throughput: PM.throughput(r, r.health) } : {}));
    return ok(Object.assign(dash, { blockersList: db.pmBlockers.map(blockerOut), canCreate: PM.canCreate(user), leader: PM.isLeader(user), financeProjects: PM.isLeader(user) ? finProjects() : [], templates: Object.fromEntries(TRACKS.map(k => [k, PM.templateCount(k)])) }));
  }
  if (a === 'my' && method === 'GET') return ok(myItems().map(it => { const p = findP(it.pid); return Object.assign({}, it, { project: p.name, track: p.track, canEdit: PM.canEditItem(user, p, it) }); }).sort((x, y) => String(x.due || '9').localeCompare(String(y.due || '9'))));
  if (a === 'finance' && b === 'projects' && method === 'GET') { if (!PM.isLeader(user)) return err(403, 'Только руководитель'); return ok(finProjects()); }
  if (a === 'projects') {
    if (!b && method === 'GET') return ok(db.pmProjects.filter(p => !ctx.qs.track || p.track === ctx.qs.track).map(p => Object.assign(projOut(PM.summary(p, db.pmItems, db.pmBlockers, t)), { canEdit: PM.isManager(user, p) })));
    if (!b && method === 'POST') {
      if (!PM.canCreate(user)) return err(403, 'Создавать проекты могут руководители, ПМ и ГИП');
      if (!TRACKS.includes(body.track) || !String(body.name || '').trim()) return err(400, 'Укажите стадию (концепция / ЭП / РП / АН) и название');
      const f = Object.assign({}, body); if (user.role === 'gip' && !f.gipId) f.gipId = user.id; if (user.role === 'pm' && !f.pmId) f.pmId = user.id;
      if (!PM.isLeader(user)) delete f.budget;
      return ok(card(createProject(ctx, f, user.id)));
    }
    const p = b && findP(b); if (b && !p) return err(404, 'Проект не найден');
    if (p && !c && method === 'GET') return ok(card(p));
    if (p && !c && method === 'PUT') {
      if (!PM.isManager(user, p)) return err(403, 'Менять карточку могут руководитель, ГИП и ПМ проекта');
      const patch = pick(body, FIELDS); if ('budget' in body) { if (!PM.canBudget(user, p)) return err(403, 'Нет доступа к бюджету'); patch.budget = cleanBudget(body.budget); }
      if ('charter' in body) patch.charter = cleanCharter(body.charter);
      if (('gipId' in patch || 'pmId' in patch || 'projectId' in patch) && !PM.isLeader(user)) { delete patch.gipId; delete patch.pmId; delete patch.projectId; }
      if ('status' in patch && !PM.STATUS.includes(patch.status)) delete patch.status; if ('risk' in patch && !PM.RISK.includes(patch.risk)) delete patch.risk;
      if ('name' in patch) { patch.name = String(patch.name).trim(); if (!patch.name) delete patch.name; }
      Object.assign(p, patch, { updatedAt: now(), updatedBy: user.id }); store.save(); store.audit(user.id, 'update', 'pmProjects', p.id); return ok(card(p));
    }
    if (p && !c && method === 'DELETE') {
      if (!PM.isLeader(user)) return err(403, 'Удалять может руководитель');
      db.pmItems = db.pmItems.filter(i => i.pid !== p.id); db.pmBlockers = db.pmBlockers.filter(x => x.pid !== p.id); db.pmProjects = db.pmProjects.filter(x => x.id !== p.id);
      for (const q of db.pmProjects) for (const k of ['epId', 'rpId', 'conceptId']) if (q[k] === p.id) delete q[k];
      store.save(); store.audit(user.id, 'delete', 'pmProjects', p.id); return ok({ ok: true });
    }
    if (p && c === 'plan' && method === 'POST') {
      if (!PM.isManager(user, p)) return err(403, 'Планировать может ГИП/ПМ проекта');
      const start = body.start || p.start || t; const fit = !!body.fit && !!p.due; const r = applyPlan(ctx, p, start, fit); p.start = start; p.forecast = fit ? p.due : r.end;
      store.save(); store.audit(user.id, 'plan', 'pmProjects', p.id, { start, fit }); return ok(card(p));
    }
    // передача дальше: концепция → ЭП, ЭП → РП (новый проект со своим шаблоном; старый закрывается)
    if (p && c === 'handover' && method === 'POST') {
      const next = PM.NEXT_TRACK[p.track]; if (!next) return err(400, 'Передать дальше можно концепцию (в ЭП) и эскизный проект (в РП)'); if (!PM.isManager(user, p)) return err(403, 'Передаёт ПМ проекта или руководитель');
      const linkKey = next + 'Id'; if (p[linkKey] && findP(p[linkKey])) return err(400, 'Проект уже передан дальше');
      const q = createProject(ctx, { track: next, name: body.name || p.name, no: p.no || '', client: p.client || '', address: p.address || '', area: p.area || '', projectId: p.projectId || '', folder: p.folder || '', members: p.members || {}, pmId: body.pmId || p.pmId || '', gipId: body.gipId || p.gipId || '', start: body.start || t, due: body.due || '', fit: !!body.due, comment: body.comment || '', miroUrl: next === 'ep' ? (p.miroUrl || '') : '' }, user.id);
      q[p.track + 'Id'] = p.id; Object.assign(p, { status: 'Готово', [linkKey]: q.id, handedAt: t }); store.save(); store.audit(user.id, 'handover', 'pmProjects', p.id, { to: q.id, track: next }); ctx.emit('pm.project.handover', { from: p, to: q }); return ok(card(q));
    }
    // ретроспектива: снимок показателей + выводы и план действий (Метод Пульса)
    if (p && c === 'retro' && method === 'POST') {
      if (!PM.isManager(user, p)) return err(403, 'Ретроспективу записывает ГИП/ПМ проекта');
      const actions = (Array.isArray(body.actions) ? body.actions : []).map(x => ({ step: String((x && x.step) || '').trim().slice(0, 500), who: String((x && x.who) || '').trim().slice(0, 200), when: String((x && x.when) || '').slice(0, 10), howMuch: String((x && x.howMuch) || '').trim().slice(0, 500) })).filter(x => x.step);
      const r = Object.assign({ id: store.id(), date: t, by: user.id, snapshot: PM.retroSnapshot(PM.health(p, db.pmItems, t), db.pmBlockers.filter(x => x.pid === p.id)), actions }, Object.fromEntries(RETRO_FIELDS.map(k => [k, String(body[k] || '').trim().slice(0, 4000)])));
      p.retros = [...(p.retros || []), r]; store.save(); store.audit(user.id, 'retro', 'pmProjects', p.id, { retro: r.id }); return ok(card(p));
    }
    if (p && c === 'retro' && d && method === 'DELETE') {
      if (!PM.isManager(user, p)) return err(403, 'Удалять может ГИП/ПМ проекта'); p.retros = (p.retros || []).filter(r => r.id !== d); store.save(); store.audit(user.id, 'retro-delete', 'pmProjects', p.id, { retro: d }); return ok(card(p));
    }
    if (p && c === 'items' && method === 'POST') {
      if (!PM.isManager(user, p)) return err(403, 'Добавлять пункты может ГИП/ПМ проекта');
      const st = Number(body.stage) || 1; const same = db.pmItems.filter(i => i.pid === p.id && i.stage === st); const role = PM.ITEM_ROLES.includes(body.role) ? body.role : 'ГИП';
      const it = addItems(ctx, [{ pid: p.id, stage: st, stageName: (same[0] || {}).stageName || String(body.stageName || '').trim() || PM.stageNames(p.track)[st - 1] || `Этап ${st}`, title: String(body.title || '').trim() || 'Пункт', role, section: PM.ROLE_SECTION[role] || '', weeks: num(body.weeks) || 1, weeksMax: num(body.weeksMax) || 0, crit: body.crit || '', optional: false, done: false, na: false, due: body.due || '', assigneeId: body.assigneeId || '', contractor: body.contractor || '', note: body.note || '', order: Math.max(0, ...db.pmItems.filter(i => i.pid === p.id).map(i => i.order || 0)) + 1, custom: true, createdBy: user.id, createdAt: now() }])[0];
      store.save(); store.audit(user.id, 'create', 'pmItems', it.id); return ok(Object.assign({}, it, { canEdit: true }));
    }
  }
  if (a === 'items' && b) {
    const it = db.pmItems.find(i => i.id === b); if (!it) return err(404, 'Пункт не найден'); const p = findP(it.pid);
    if (method === 'PUT') {
      if (!PM.canEditItem(user, p, it)) return err(403, 'Этот пункт ведёт другой раздел');
      const patch = pick(body, ITEM_FIELDS_ANY);
      if (PM.isManager(user, p)) Object.assign(patch, pick(body, ITEM_FIELDS_MGR));
      if ('done' in patch) { patch.done = !!patch.done && patch.done !== 'false'; if (patch.done && !it.done) { patch.doneAt = t; patch.doneBy = user.id; } if (!patch.done) { if (it.done) patch.returns = (Number(it.returns) || 0) + 1; patch.doneAt = ''; patch.doneBy = ''; } }
      if ('weeksMax' in patch) patch.weeksMax = num(patch.weeksMax) || 0;
      if ('na' in patch) patch.na = !!patch.na && patch.na !== 'false';
      if ('role' in patch) { if (!PM.ITEM_ROLES.includes(patch.role)) delete patch.role; else patch.section = PM.ROLE_SECTION[patch.role] || ''; }
      if ('stage' in patch) { patch.stage = Number(patch.stage) || it.stage; const same = db.pmItems.find(i => i.pid === p.id && i.stage === patch.stage && i.id !== it.id); patch.stageName = same ? same.stageName : (PM.stageNames(p.track)[patch.stage - 1] || `Этап ${patch.stage}`); }
      if ('weeks' in patch) patch.weeks = num(patch.weeks) || it.weeks;
      if ('contractor' in patch) patch.contractor = String(patch.contractor || '').trim();
      Object.assign(it, patch, { updatedAt: now(), updatedBy: user.id }); store.save(); store.audit(user.id, 'update', 'pmItems', it.id, patch.done !== undefined ? { done: patch.done } : null);
      if (patch.done === true) ctx.emit('pm.item.done', { item: it, project: p });
      return ok(Object.assign({}, it, { canEdit: true }));
    }
    if (method === 'DELETE') { if (!PM.isManager(user, p)) return err(403, 'Удалять пункты может ГИП/ПМ проекта'); db.pmItems = db.pmItems.filter(i => i.id !== it.id); store.save(); store.audit(user.id, 'delete', 'pmItems', b); return ok({ ok: true }); }
  }
  if (a === 'blockers') {
    if (!b && method === 'GET') return ok(db.pmBlockers.map(blockerOut));
    if (!b && method === 'POST') { const p = findP(body.pid); if (!p) return err(400, 'Нет проекта'); if (!PM.isManager(user, p) && user.role !== 'lead') return err(403, 'Нет прав');
      if (!String(body.what || '').trim()) return err(400, 'Опишите, чего ждём');
      const x = Object.assign(pick(body, BLOCKER_FIELDS), { id: store.id(), pid: p.id, what: String(body.what).trim(), status: body.status === 'closed' ? 'closed' : 'open', since: body.since || t, createdAt: now(), createdBy: user.id }); db.pmBlockers.push(x); store.save(); store.audit(user.id, 'create', 'pmBlockers', x.id); return ok(blockerOut(x)); }
    const x = b && db.pmBlockers.find(z => z.id === b); if (!x) return err(404, 'Блокер не найден'); const p = findP(x.pid);
    if (!PM.isManager(user, p) && x.createdBy !== user.id) return err(403, 'Менять может ГИП/ПМ проекта или автор');
    if (method === 'PUT') { const patch = pick(body, BLOCKER_FIELDS); if ('status' in patch) patch.status = patch.status === 'closed' ? 'closed' : 'open'; Object.assign(x, patch, x.status !== 'closed' && patch.status === 'closed' ? { closedAt: t, closedBy: user.id } : {}, patch.status === 'open' ? { closedAt: '', closedBy: '' } : {}, { updatedAt: now(), updatedBy: user.id }); store.save(); store.audit(user.id, 'update', 'pmBlockers', x.id); return ok(blockerOut(x)); }
    if (method === 'DELETE') { db.pmBlockers = db.pmBlockers.filter(z => z.id !== x.id); store.save(); store.audit(user.id, 'delete', 'pmBlockers', x.id); return ok({ ok: true }); }
  }
  // импорт из реестра (JSON от modules/pm/tools/import_pm.py): проекты + пункты прошлых этапов отмечены, задачи Trello, блокеры, бюджеты
  if (a === 'import' && method === 'POST') {
    if (!PM.isLeader(user)) return err(403, 'Импорт доступен только руководителю');
    const list = Array.isArray(body.projects) ? body.projects : []; if (!list.length) return err(400, 'В файле нет проектов');
    const mode = body.mode === 'replace' ? 'replace' : 'skip'; const since = body.since || t;
    const rep = { created: [], replaced: [], skipped: [], unlinked: [], items: 0, done: 0, tasks: 0, blockers: 0, budgets: 0 };
    for (const src of list) {
      const name = String(src.name || '').trim(); const track = TRACKS.includes(src.track) ? src.track : 'rp'; if (!name) continue;
      const ex = db.pmProjects.find(q => q.track === track && String(q.name).trim().toLowerCase() === name.toLowerCase());
      if (ex) {
        if (mode !== 'replace') { rep.skipped.push(name); continue; }
        db.pmItems = db.pmItems.filter(i => i.pid !== ex.id); db.pmBlockers = db.pmBlockers.filter(x => x.pid !== ex.id); db.pmProjects = db.pmProjects.filter(x => x.id !== ex.id); rep.replaced.push(name);
      } else rep.created.push(name);
      const f = pick(src, ['name', 'no', 'client', 'address', 'area', 'status', 'risk', 'gipId', 'pmId', 'start', 'due', 'forecast', 'comment', 'projectId', 'miroUrl', 'folder']); f.track = track; f.fit = !!f.due; f.budget = src.budget || null;
      if (f.projectId && !db.projects.some(x => x.id === f.projectId)) { rep.unlinked.push(`${name} → ${f.projectId}`); f.projectId = ''; }
      if (f.gipId && !db.users.some(u => u.id === f.gipId)) f.gipId = ''; if (f.pmId && !db.users.some(u => u.id === f.pmId)) f.pmId = '';
      const p = createProject(ctx, f, user.id); if (f.budget) rep.budgets++;
      const stage = Number(src.stage) || PM.stageIndex(track, src.stageName) || 1;
      for (const it of db.pmItems.filter(i => i.pid === p.id)) { rep.items++; if (it.stage < stage) { Object.assign(it, { done: true, doneAt: '', doneBy: 'import', doneNote: 'по реестру: этап пройден' }); rep.done++; } }
      let order = Math.max(0, ...db.pmItems.filter(i => i.pid === p.id).map(i => i.order || 0));
      for (const tk of Array.isArray(src.tasks) ? src.tasks : []) {
        const title = String(tk.title || '').trim(); if (!title) continue; const st = PM.stageIndex(track, tk.stage) || stage; const role = PM.ITEM_ROLES.includes(tk.role) ? tk.role : 'ГИП'; const done = !!tk.done || /готово/i.test(String(tk.status || ''));
        addItems(ctx, [{ pid: p.id, stage: st, stageName: PM.stageNames(track)[st - 1] || `Этап ${st}`, title, role, section: PM.ROLE_SECTION[role] || '', weeks: 1, crit: '', optional: false, done, na: false, due: tk.due || '', assigneeId: '', contractor: '', note: [tk.comment, done ? '' : tk.status, 'из Trello'].filter(Boolean).join(' · '), doneAt: done ? (tk.due || '') : '', doneBy: done ? 'import' : '', order: ++order, custom: true, source: 'trello' }]); rep.tasks++;
      }
      for (const bl of Array.isArray(src.blockers) ? src.blockers : []) {
        const what = String(bl.what || '').trim(); if (!what) continue;
        db.pmBlockers.push({ id: store.id(), pid: p.id, what, holder: PM.HOLDERS.includes(bl.holder) ? bl.holder : (bl.holder || 'Заказчик'), ownerId: bl.ownerId && db.users.some(u => u.id === bl.ownerId) ? bl.ownerId : '', ownerName: bl.ownerName || '', expected: bl.expected || '', lastContact: bl.lastContact || '', status: /закрыт|closed/i.test(String(bl.status || '')) ? 'closed' : 'open', comment: bl.comment || '', since: bl.since || since, createdAt: now(), createdBy: user.id, source: 'import' }); rep.blockers++;
      }
      p.imported = { at: now(), source: String(body.source || 'import'), stage };
    }
    store.save(); store.audit(user.id, 'import', 'pmProjects', '', { created: rep.created.length, replaced: rep.replaced.length, skipped: rep.skipped.length, mode });
    return ok(rep);
  }
  return err(404, 'Нет такого действия');
}

module.exports = { id: 'pm', api: 'pm', collections: ['pmProjects', 'pmItems', 'pmBlockers'], handle, createProject, domain: PM };
