'use strict';
// Модуль «Управление проектами» (ЭП / РП; треки concept и an скрыты — см. domain.js): /api/pm/*. Свои права (domain.js), финансы здесь не видны —
// всё нужное из финансов (список проектов для связи, факт бюджета, подрядчики для подсказок) отдаётся отсюда с проверкой прав.
const fs = require('fs');
const path = require('path');
const PM = require('./domain');
const TEAM = require('./team'); // «Квартал», «Офис проекта», переносы сроков, проверка пунктов, напоминания
const CHAT = require('./chat'); // переписка проектов (группы WhatsApp): приём от моста, привязка к проектам, лента, копия файлов в папку проекта

const CONTRACT_FIELDS = ['contractNo', 'contractDate', 'contractTerm', 'contractTermUnit', 'contractStartRule', 'dueNote'];
const FIELDS = ['name', 'no', 'client', 'address', 'area', 'status', 'risk', 'gipId', 'pmId', 'start', 'due', 'forecast', 'comment', 'projectId', 'members', 'miroUrl', 'folder'].concat(CONTRACT_FIELDS);
const ITEM_FIELDS_ANY = ['done', 'kstatus', 'na', 'due', 'note', 'assigneeId', 'contractor', 'doneNote'];
const ITEM_FIELDS_MGR = ['title', 'role', 'weeks', 'weeksMax', 'crit', 'stage'];
const RETRO_FIELDS = ['interpret', 'change', 'sprint'];
// устав проекта: только известные поля, текст
function cleanCharter(c) { if (!c || typeof c !== 'object') return null; const out = {}; for (const [k] of PM.CHARTER_FIELDS) out[k] = String(c[k] || '').trim().slice(0, 2000); return out; }
const BLOCKER_FIELDS = ['what', 'holder', 'ownerId', 'expected', 'lastContact', 'status', 'comment', 'since'];
const TRACKS = Object.keys(PM.TRACKS);

// общие операции — их вызывают и другие модули через ctx.modules.pm (например, коммерция при подписании договора)
function addItems(ctx, list) { for (const it of list) { it.id = ctx.store.id(); ctx.db.pmItems.push(it); } return list; }
// поля договора: срок — число, единица — из списка; dueFromTerm — пересчитать дату по договору из срока
function cleanContract(patch, body, p) {
  if ('contractTerm' in patch) patch.contractTerm = Math.max(0, Math.round(Number(patch.contractTerm) || 0));
  if ('contractTermUnit' in patch && !PM.TERM_UNITS.includes(patch.contractTermUnit)) patch.contractTermUnit = 'рабочих';
  for (const k of ['contractNo', 'contractStartRule', 'dueNote']) if (k in patch) patch[k] = String(patch[k] || '').trim().slice(0, 500);
  if (body && (body.dueFromTerm === true || body.dueFromTerm === '1' || body.dueFromTerm === 1)) {
    const start = patch.start || (p && p.start) || '', term = 'contractTerm' in patch ? patch.contractTerm : (p && p.contractTerm), unit = patch.contractTermUnit || (p && p.contractTermUnit) || 'рабочих';
    const due = PM.termEnd(start, term, unit); if (due) patch.due = due;
  }
  return patch;
}
// история пункта: последние 20 изменений — кто, когда, что (галочки, срок, исполнитель, подрядчик, название, оценка, этап, роль)
const HIST_FIELDS = ['done', 'na', 'due', 'assigneeId', 'contractor', 'title', 'weeks', 'weeksMax', 'stage', 'role', 'rmStatus', 'kstatus'];
function logHistory(it, patch, userId, note) {
  const h = Array.isArray(it.history) ? it.history.slice() : []; const at = new Date().toISOString();
  for (const k of HIST_FIELDS) if (k in patch && String(patch[k] == null ? '' : patch[k]) !== String(it[k] == null ? '' : it[k])) h.push(Object.assign({ at, by: userId || '', field: k, from: it[k] == null ? '' : it[k], to: patch[k] == null ? '' : patch[k] }, note ? { note } : {}));
  it.history = h.slice(-20);
}
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
// сигнатуру не менять — её используют другие модули. fields.track: ep|rp (concept сворачивается в ЭП — его первый этап; an — скрытый трек, только через API); fields.fit — уложить план в дату по договору; fields.months — месяцев АН
function createProject(ctx, fields, byUserId) {
  const p = Object.assign(ctx.pick(fields, FIELDS), { id: ctx.store.id(), track: PM.normalizeTrack(fields.track), name: String(fields.name).trim(), status: fields.status || 'В работе', risk: fields.risk || 'Низкий', createdAt: new Date().toISOString(), createdBy: byUserId || '' });
  if (!PM.STATUS.includes(p.status)) p.status = 'В работе'; if (!PM.RISK.includes(p.risk)) p.risk = 'Низкий';
  const DS = PM.pmSettings(ctx.db); const okU = id => !!id && ctx.db.users.some(u => u.id === id && u.active !== false); // ПМ/ГИП по умолчанию
  if (p.track === 'ep' && !p.pmId && okU(DS.defaultEpPmId)) p.pmId = DS.defaultEpPmId;
  if (p.track === 'rp' && !p.gipId && okU(DS.defaultRpGipId)) p.gipId = DS.defaultRpGipId;
  if (fields.budget) p.budget = cleanBudget(fields.budget);
  p.templateVersion = PM.TEMPLATE_VERSION[p.track] || '';
  ctx.db.pmProjects.push(p); addItems(ctx, PM.itemsFromTemplate(p.track, p.id, { start: p.start, due: p.due, months: fields.months }));
  if (p.start) { const r = applyPlan(ctx, p, p.start, !!(fields.fit && p.due)); if (!p.forecast) p.forecast = fields.fit && p.due ? p.due : r.end; }
  ctx.store.save(); ctx.store.audit(byUserId || '', 'create', 'pmProjects', p.id); ctx.emit('pm.project.created', { project: p });
  return p;
}
// старая карточка концепции сворачивается в ЭП: её пункты становятся этапом 1 «Концепция», добавляются этапы 2–9 шаблона ЭП; отметки «сделано» сохраняются
function collapseConcept(ctx, p, body, byUserId) {
  body = body || {}; const t = PM.today();
  const mine = ctx.db.pmItems.filter(i => i.pid === p.id);
  for (const it of mine) Object.assign(it, { stage: 1, stageName: PM.CONCEPT_STAGE.name });
  let order = Math.max(0, ...mine.map(i => i.order || 0));
  addItems(ctx, PM.itemsFromTemplate('ep', p.id, {}).filter(i => i.stage > 1).map(i => Object.assign(i, { order: ++order })));
  Object.assign(p, { track: 'ep', pmId: body.pmId || p.pmId || '', collapsedFrom: 'concept', collapsedAt: t, updatedAt: new Date().toISOString(), updatedBy: byUserId || '' });
  if (body.due) p.due = body.due; const start = body.start || p.start || t; const r = applyPlan(ctx, p, start, !!p.due); if (!p.start) p.start = start; p.forecast = p.due || r.end;
  ctx.store.save(); ctx.store.audit(byUserId || '', 'collapse', 'pmProjects', p.id, { to: 'ep' }); ctx.emit('pm.project.handover', { from: p, to: p });
  return p;
}
// импорт ЭП из ClickUp: задача верхнего уровня (или список) → проект ЭП; подзадача → отметка «сделано» у пункта шаблона с тем же названием или дополнительный пункт этапа.
// mode: skip — существующий по названию проект не трогаем; merge — дополняем его отметками и пунктами. Люди — по имени с db.users, иначе имя в заметку.
function importClickup(ctx, list, mode, user) {
  const { db, store } = ctx; const t = PM.today(); const now = new Date().toISOString();
  const rep = { created: [], merged: [], skipped: [], items: 0, matched: 0, done: 0, added: 0, people: { mapped: [], unmapped: [] } };
  const mapped = new Set(), unmapped = new Set(); const leadUsers = db.users.filter(u => ['owner', 'partner', 'pm', 'gip'].includes(u.role));
  const person = (names, pool) => { for (const n of names || []) { const u = PM.matchUser(pool || db.users, n); if (u) { mapped.add(n); return u; } unmapped.add(n); } return null; };
  for (const src of list) {
    const name = String(src.name || '').trim(); if (!name) continue;
    let p = db.pmProjects.find(x => x.track === 'ep' && PM.normTitle(x.name) === PM.normTitle(name));
    if (p && mode !== 'merge') { rep.skipped.push(name); continue; }
    const tasks = Array.isArray(src.tasks) ? src.tasks : [];
    if (!p) {
      const pmUser = person(src.assignees, leadUsers);
      const comment = [src.note, src.list ? `ClickUp: список «${src.list}»` : 'из ClickUp', (src.tags || []).length ? `теги: ${src.tags.join(', ')}` : '', src.priority ? `приоритет ${src.priority}` : '', !pmUser && (src.assignees || []).length ? `исполнитель в ClickUp: ${src.assignees.join(', ')}` : ''].filter(Boolean).join(' · ');
      p = createProject(ctx, { track: 'ep', name, client: src.client || '', address: src.address || '', area: src.area || '', contractNo: src.contractNo || '', status: PM.STATUS.includes(src.pmStatus) ? src.pmStatus : 'В работе', start: src.start || '', due: src.due || '', fit: !!(src.start && src.due), pmId: pmUser ? pmUser.id : '', comment, dueNote: src.due ? 'срок из ClickUp' : '' }, user.id);
      p.imported = { at: now, source: 'ClickUp', cuId: src.cuId || '' }; rep.created.push(name); rep.items += db.pmItems.filter(i => i.pid === p.id).length;
    } else rep.merged.push(name);
    const items = () => db.pmItems.filter(i => i.pid === p.id);
    const curStage = () => { const open = items().filter(i => !i.done && !i.na).sort((a, b) => a.stage - b.stage); return open.length ? open[0].stage : 1; };
    for (const tk of tasks) {
      const title = String(tk.title || '').trim(); if (!title) continue; const u = person(tk.assignees); const extra = (tk.assignees || []).length && !u ? `ClickUp: ${tk.assignees.join(', ')}` : '';
      const it = PM.findItemByTitle(items(), title) || items().find(i => i.custom && ((i.cuId && tk.cuId && i.cuId === tk.cuId) || PM.normTitle(i.title) === PM.normTitle(title))); // повторный импорт: свой же добавленный пункт не дублируем
      if (it) {
        rep.matched++;
        if (tk.done && !it.done) { logHistory(it, { done: true }, user.id, 'по ClickUp'); Object.assign(it, { done: true, doneAt: tk.due || '', doneBy: 'clickup', doneNote: 'по ClickUp' }); rep.done++; } // doneAt — только дата из ClickUp: отметки импорта не должны выглядеть как сегодняшняя скорость
        if (tk.due && !it.done && it.due !== tk.due) { logHistory(it, { due: tk.due }, user.id, 'по ClickUp'); it.due = tk.due; } if (u && !it.assigneeId) { logHistory(it, { assigneeId: u.id }, user.id, 'по ClickUp'); it.assigneeId = u.id; }
        if (extra && !String(it.note || '').includes(extra)) it.note = [it.note, extra].filter(Boolean).join(' · ');
      } else {
        const st = PM.stageIndex('ep', tk.stage) || curStage(); const order = Math.max(0, ...items().map(i => i.order || 0)) + 1;
        addItems(ctx, [{ pid: p.id, stage: st, stageName: PM.stageNames('ep')[st - 1] || `Этап ${st}`, title, role: 'ПМ', section: '', weeks: 1, weeksMax: 0, crit: '', optional: false, done: !!tk.done, doneAt: tk.done ? (tk.due || '') : '', doneBy: tk.done ? 'clickup' : '', doneNote: tk.done ? 'по ClickUp' : '', na: false, due: tk.due || '', assigneeId: u ? u.id : '', contractor: '', note: [tk.note, tk.status ? `статус ClickUp: ${tk.status}` : '', (tk.tags || []).length ? `теги: ${tk.tags.join(', ')}` : '', extra, 'из ClickUp'].filter(Boolean).join(' · '), order, custom: true, source: 'clickup', cuId: tk.cuId || '', createdBy: user.id, createdAt: now }]);
        rep.added++;
      }
    }
    store.audit(user.id, 'import-clickup', 'pmProjects', p.id, { tasks: tasks.length });
  }
  rep.people.mapped = [...mapped]; rep.people.unmapped = [...unmapped]; store.save(); return rep;
}
// часы табелей по проекту через модуль hr (без правок hr): разделы и люди за всё время и по месяцам; деньги — только owner/partner/accountant (hr.domain.isMoney) с доступом к бюджету
function hoursOf(ctx, hr, p, user, canBudget) {
  const H = hr.domain || {}; const money = !!(H.isMoney && H.isMoney(user) && canBudget);
  const calc = opts => money ? hr.laborCost(ctx, p.id, opts) : hr.laborHours(ctx, p.id, opts);
  const all = calc({}) || {}; const months = Object.keys(all.byMonth || {}).sort(); const perMonth = {};
  for (const ym of months) { // недели месяца — по их четвергу (правило ISO), как считает hr
    const weeks = []; for (let d = H.addDays(ym + '-01', -7), n = 0; n < 8; d = H.addDays(d, 7), n++) { const w = H.isoWeek(d); if (H.weekMonth(w) === ym && !weeks.includes(w)) weeks.push(w); }
    weeks.sort(); perMonth[ym] = weeks.length ? calc({ from: weeks[0], to: weeks[weeks.length - 1] }) || {} : {};
  }
  const secOrder = s => { const i = PM.SECTIONS.indexOf(s); return i < 0 ? 99 : i; };
  const sections = Object.keys(all.bySection || {}).sort((a, b) => secOrder(a) - secOrder(b) || a.localeCompare(b, 'ru')).map(sec => Object.assign({ section: sec, hours: all.bySection[sec].hours, byMonth: Object.fromEntries(months.map(m => [m, ((perMonth[m].bySection || {})[sec] || {}).hours || 0])) }, money ? { cost: all.bySection[sec].cost } : {}));
  const people = (all.byEmployee || []).map(e => Object.assign({ employeeId: e.employeeId, name: e.name || e.employeeId, position: e.position || '', hours: e.hours, byMonth: Object.fromEntries(months.map(m => [m, ((perMonth[m].byEmployee || []).find(x => x.employeeId === e.employeeId) || {}).hours || 0])) }, money ? { cost: e.cost, rate: e.rate } : {}));
  return { money, total: Object.assign({ hours: all.hours || 0 }, money ? { cost: all.cost || 0 } : {}), weeks: all.weeks || 0, byStatus: all.byStatus || {}, months, byMonth: Object.fromEntries(months.map(m => [m, Object.assign({ hours: all.byMonth[m].hours }, money ? { cost: all.byMonth[m].cost } : {})])), sections, people };
}
// пересборка пунктов проекта по текущему шаблону: совпавшие по коду или названию сохраняют отметки, сроки, исполнителей, заметки и историю;
// прочие пункты с данными (из ClickUp, ручные, старый шаблон) — в конец, этап «Прочее» (keepExtra), иначе удаляются; что удалено — в журнал
function rebuildItems(ctx, p, track, keepExtra, userId) {
  const db = ctx.db; const now = new Date().toISOString();
  const old = db.pmItems.filter(i => i.pid === p.id).sort((a, b) => a.stage - b.stage || (a.order || 0) - (b.order || 0));
  const fresh = PM.itemsFromTemplate(track, p.id, { start: p.start, due: p.due }); const used = new Set();
  const rep = { template: track, version: PM.TEMPLATE_VERSION[track] || '', matched: 0, created: 0, moved: [], deleted: [] };
  const CARRY = ['done', 'doneAt', 'doneBy', 'doneNote', 'na', 'due', 'assigneeId', 'contractor', 'note', 'history', 'returns', 'rmStatus', 'kstatus', 'weeksMax', 'cuId'];
  const hasData = x => !!(x.done || x.na || x.due || x.assigneeId || x.contractor || x.note || (x.history || []).length || x.rmStatus);
  for (const n of fresh) {
    const free = old.filter(x => !used.has(x.id));
    const o = (n.code && free.find(x => x.code && PM.normCode(x.code) === PM.normCode(n.code))) || free.find(x => PM.normTitle(x.title) === PM.normTitle(n.title)) || (free.length ? PM.findItemByTitle(free.filter(x => !x.custom), n.title) : null);
    if (o) { used.add(o.id); for (const k of CARRY) if (o[k] !== undefined && o[k] !== '' && o[k] !== null) n[k] = o[k]; rep.matched++; } else rep.created++;
    n.id = ctx.store.id();
  }
  const lastStage = Math.max(0, ...fresh.map(i => i.stage)) + 1; let order = fresh.length; const keep = new Set();
  for (const x of old) { if (used.has(x.id)) continue; if (keepExtra && (x.custom || hasData(x))) { Object.assign(x, { stage: lastStage, stageName: 'Прочее', order: ++order, custom: true }); keep.add(x.id); rep.moved.push(x.title); } else rep.deleted.push(x.title); }
  db.pmItems = db.pmItems.filter(i => i.pid !== p.id || keep.has(i.id)).concat(fresh);
  Object.assign(p, { templateVersion: PM.TEMPLATE_VERSION[track] || '', rebuiltAt: now, rebuiltBy: userId, updatedAt: now, updatedBy: userId });
  ctx.store.save(); ctx.store.audit(userId, 'rebuild', 'pmProjects', p.id, { template: track, matched: rep.matched, created: rep.created, moved: rep.moved.length, deleted: rep.deleted });
  return rep;
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

// журнал проекта: вложения (картинки, PDF ≤ 20 МБ) — на диске в DATA_DIR/pm-files/<pid>/, в записи только ключи (как у модулей board и mkt)
const LOG_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };
const logDir = (ctx, pid) => path.join(ctx.store.DATA_DIR, 'pm-files', String(pid).replace(/[^\w-]/g, ''));
const dropLogDir = (ctx, pid) => { try { if (ctx.store.DATA_DIR) fs.rmSync(logDir(ctx, pid), { recursive: true, force: true }); } catch { /* нет папки */ } };
const dropLogFile = (ctx, pid, key) => { if (PM.LOG_KEY_RE.test(String(key || ''))) { try { fs.unlinkSync(path.join(logDir(ctx, pid), key)); } catch { /* уже нет */ } } };
// файл из base64 {name, type, data}: тип из списка, размер ≤ 20 МБ, сигнатура совпадает с типом → { ext, data, name, type, size } или строка ошибки
function readLogFile(f) {
  const nm = String((f && f.name) || 'Файл').slice(0, 200); const type = String((f && f.type) || ''); const ext = PM.LOG_FILE_TYPES[type]; if (!ext) return `${nm}: разрешены картинки (PNG, JPG, WebP, GIF) и PDF`;
  const b64 = String(f.data || '').replace(/^data:[^,]*,/, ''); if (!b64) return `${nm}: пустой файл`; const mb = PM.LOG_MAX_FILE / 1048576;
  if (b64.length * 3 / 4 > PM.LOG_MAX_FILE + 4) return `${nm}: больше ${mb} МБ`;
  const data = Buffer.from(b64, 'base64'); if (!data.length) return `${nm}: пустой файл`; if (data.length > PM.LOG_MAX_FILE) return `${nm}: больше ${mb} МБ`;
  if (!PM.logFileSig(ext, data)) return `${nm}: содержимое не совпадает с типом файла`;
  return { ext, data, name: nm, type, size: data.length };
}
function writeLogFile(ctx, pid, f) { const dir = logDir(ctx, pid); fs.mkdirSync(dir, { recursive: true }); const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${f.ext}`; fs.writeFileSync(path.join(dir, key), f.data); return { key, name: f.name, type: f.type, size: f.size }; }

function handle(ctx) {
  const { parts, method, body, user, db, store, D, ok, err, pick, num } = ctx;
  const [, a, b, c, d] = parts;
  const S = PM.pmSettings(db); const staff = PM.isStaff(user);
  // доступность модуля для текущего пользователя — без прав на модуль: меню в браузере узнаёт, показывать ли «Проекты» сотруднику
  if (a === 'access' && method === 'GET') return ok({ canOpen: PM.canOpen(user, S), staffOwnProjects: !!S.staffOwnProjects, staff, tracks: PM.canOpen(user, S) ? PM.userTracks(user, db.pmProjects, db.pmItems) : [] });
  if (!PM.canOpen(user, S)) return err(403, 'Нет доступа к управлению проектами');
  // назначить ПМ (ЭП) и ГИП (РП) по умолчанию проектам, где не заполнено (replace — и там, где заполнено). dry — только список.
  if (a === 'assign-defaults' && method === 'POST') {
    if (!['owner', 'partner'].includes(user.role)) return err(403, 'Назначать могут владелец и партнёр');
    const replace = body.replace === true || body.replace === 'true'; const plan = [];
    for (const [track, field, id] of [['ep', 'pmId', S.defaultEpPmId], ['rp', 'gipId', S.defaultRpGipId]]) {
      if ((body.track && body.track !== track) || !id || !db.users.some(u => u.id === id && u.active !== false)) continue;
      for (const p of db.pmProjects) if (p.track === track && PM.ACTIVE(p.status) && p[field] !== id && (replace || !p[field])) plan.push({ id: p.id, name: p.name, track, field, from: p[field] || '', to: id });
    }
    if (body.dry === true || body.dry === 'true') return ok({ plan, replace });
    for (const x of plan) { const p = db.pmProjects.find(q => q.id === x.id); p.history = PM.projectHistory(p, { [x.field]: x.to }, user.id, 'назначение по умолчанию'); p[x.field] = x.to; p.updatedAt = new Date().toISOString(); p.updatedBy = user.id; }
    if (plan.length) { store.save(); store.audit(user.id, 'assign-defaults', 'pmProjects', plan.map(x => x.id).join(','), { n: plan.length, replace }); }
    return ok({ done: plan.length, plan });
  }
  // настройки модуля: читает руководитель, меняют владелец и партнёр (db.settings.pm)
  if (a === 'settings') {
    if (!PM.isLeader(user)) return err(403, 'Только руководитель');
    if (method === 'GET') return ok(S);
    if (method === 'PUT') {
      if (!['owner', 'partner'].includes(user.role)) return err(403, 'Менять настройки модуля могут владелец и партнёр');
      const next = Object.assign({}, S); if ('staffOwnProjects' in body) next.staffOwnProjects = body.staffOwnProjects === true || body.staffOwnProjects === 'true' || body.staffOwnProjects === 1;
      for (const k of ['chatForMembers', 'chatFilesToFolder']) if (k in body) next[k] = body[k] === true || body[k] === 'true' || body[k] === 1; // переписка: чтение участниками, копия файлов в папку проекта
      if ('chatFolderName' in body) next.chatFolderName = PM.chatFolderName(body.chatFolderName);
      for (const [k, lo, hi] of [['overloadLimit', 1, 100], ['silentDays', 1, 60]]) if (k in body) { const n = Math.round(Number(body[k])); if (!(n >= lo && n <= hi)) return err(400, k === 'overloadLimit' ? 'Порог перегрузки — от 1 до 100 пунктов' : '«Кто молчит» — от 1 до 60 дней'); next[k] = n; } // «Офис проекта»
      for (const [k, roles] of [['defaultEpPmId', ['pm', 'owner', 'partner']], ['defaultRpGipId', ['gip', 'owner', 'partner']]]) if (k in body) {
        const id = String(body[k] || ''); if (id && !db.users.some(u => u.id === id && u.active !== false && roles.includes(u.role))) return err(400, k === 'defaultEpPmId' ? 'ПМ по умолчанию — пользователь с ролью ПМ' : 'ГИП по умолчанию — пользователь с ролью ГИП'); next[k] = id; }
      db.settings = Object.assign({}, db.settings, { pm: next }); store.save(); store.audit(user.id, 'update', 'settings', 'pm', next); return ok(next);
    }
  }
  if (a === 'chats') return CHAT.handle(ctx); // группы WhatsApp: приём, привязка, файлы (права — внутри)
  const t = ctx.today(); const now = () => new Date().toISOString(); const findP = id => db.pmProjects.find(p => p.id === id);
  const visibleP = p => !!p && (!staff || PM.staffSees(user, p, db.pmItems)); // сотрудник видит только свои проекты
  // заказчик проекта — автоматически из единого справочника по цепочке проект → договор → контрагент (не вводится руками)
  const cg = D.customerGroups ? D.customerGroups(db) : null;
  const clientOf = p => { if (!cg) return null; const fp = finProject(db, p); return D.projectClient(fp || { id: p.id, name: p.name, client: p.client }, db, cg); };
  const projOut = p => {
    const o = Object.assign({}, p); if (!PM.canBudget(user, p)) delete o.budget;
    const pc = clientOf(p);
    if (pc && (pc.client || pc.group)) { if (pc.source === 'contract' || !o.client) o.client = pc.client || o.client; o.clientGroup = pc.group; o.clientAuto = !!(pc.source && pc.source !== 'manual'); }
    return o;
  };
  const finProjects = () => db.projects.map(x => ({ id: x.id, name: x.name, status: x.status || '' })).sort((x, y) => (x.status === 'archive') - (y.status === 'archive') || String(x.name).localeCompare(String(y.name), 'ru'));
  const blockerOut = x => { const p = findP(x.pid) || {}; return Object.assign({}, x, { project: p.name || '', track: p.track || '', days: PM.blockerAge(x, t), canEdit: PM.isManager(user, p) || x.createdBy === user.id }); };
  const logs = () => (db.pmLog = db.pmLog || []);
  const card = p => {
    const items = db.pmItems.filter(i => i.pid === p.id).sort((x, y) => x.stage - y.stage || x.order - y.order);
    const h = PM.health(p, db.pmItems, t);
    const out = { project: projOut(p), items: items.map(i => Object.assign({}, i, { canEdit: PM.canEditItem(user, p, i), waiting: PM.waitingFor(items, i), kcol: PM.itemKanban(i) }, TEAM.itemFlags(user, p, i, db.users))), blockers: db.pmBlockers.filter(x => x.pid === p.id).map(blockerOut), canEdit: PM.isManager(user, p), canBudget: PM.canBudget(user, p), leader: PM.isLeader(user), summary: PM.summary(p, db.pmItems, db.pmBlockers, t), stageNames: PM.stageNamesOf(items, p.track), contractors: contractorsOf(db, p), folderHint: PM.folderName(p), health: h, charterOk: PM.charterComplete(p.charter), retros: p.retros || [], logN: logs().filter(r => r.pid === p.id).length, canLog: PM.canLogAdd(user, p, db.pmItems), canChat: PM.canChatRead(user, p, S, db.pmItems) };
    if (out.canChat) out.chatN = CHAT.countOf(db, p.id);
    if (staff) { out.staff = true; out.blockers = out.blockers.filter(x => x.ownerId === user.id); out.contractors = []; }
    const hrMod = ctx.modules && ctx.modules.hr; if (hrMod && hrMod.laborHours && !staff) out.hours = hoursOf(ctx, hrMod, p, user, out.canBudget); // вкладка «Часы» — только при включённом модуле hr
    if (out.canBudget) out.throughput = PM.throughput(p, h);
    for (const k of ['epId', 'rpId', 'conceptId']) { const q = p[k] && findP(p[k]); if (q) out[k.replace('Id', '')] = { id: q.id, name: q.name, status: q.status, track: q.track }; }
    const fp = finProject(db, p); if (fp) out.finance = { id: fp.id, name: fp.name, client: fp.client || '', status: fp.status || '' };
    if (PM.isLeader(user)) out.financeProjects = finProjects();
    if (out.canBudget) {
      out.budget = PM.budgetCalc(p.budget);
      if (fp) { const ops = db.ops.filter(o => (o.project === fp.id || o.project === fp.name) && D.catKind(db.categories, o.category) !== 'transfer'); const subs = db.subcontracts.filter(s => s.project === fp.id || s.project === fp.name);
        out.fact = { project: fp.name, income: ops.reduce((s, o) => s + num(o.credit), 0), expense: ops.reduce((s, o) => s + num(o.debit), 0), n: ops.length, subPaid: subs.reduce((s, x) => s + num(x.paid), 0), subSum: subs.reduce((s, x) => s + num(x.sum), 0), contracts: db.contracts.filter(cn => cn.projectId === fp.id || cn.code === fp.id).reduce((s, x) => s + num(x.sum), 0), contractNoVat: num(fp.contractNoVat), targetCost: num(fp.targetCost) }; }
    }
    if (staff) { delete out.finance; delete out.financeProjects; delete out.budget; delete out.fact; delete out.throughput; }
    return out;
  };
  // счётчики в меню: просроченные «мои» пункты и блокеры старше 14 дней
  const myItems = () => {
    const active = new Set(db.pmProjects.filter(p => PM.ACTIVE(p.status) && PM.shownTrack(p.track)).map(p => p.id));
    return db.pmItems.filter(it => active.has(it.pid) && !it.done && !it.na).filter(it => { const p = findP(it.pid); if (!p) return false;
      if (it.assigneeId && it.assigneeId === user.id) return true;
      if (user.role === 'lead') return !!user.section && PM.itemSection(it) === user.section;
      if (p.gipId === user.id && ['ГИП', 'Заказчик'].includes(it.role)) return true;
      if (p.pmId === user.id && ['ПМ', 'Заказчик'].includes(it.role)) return true;
      return PM.isLeader(user) && !!it.due && it.due < t; });
  };
  if (TEAM.handle(ctx, { logHistory, visibleP, staff, S, t })) return; // квартал, офис, переносы, проверка, напоминания (права — внутри)
  const flags = (p, i) => TEAM.itemFlags(user, p, i, db.users);
  const decN = tr => { const x = TEAM.decisions(user, db, tr, visibleP); return x.shifts.length + x.review.length; };
  const inTrackQ = p => { const q = ctx.qs && ctx.qs.track; return !q || PM.trackPath(p.track) === PM.trackPath(q); }; // ?track=ep|rp — раздел интерфейса (concept считается ЭП)
  if (a === 'badges' && method === 'GET') { const my = myItems().filter(it => it.due && it.due < t); const bl = db.pmBlockers.filter(x => { const q = findP(x.pid); return !!q && PM.shownTrack(q.track) && (!staff || x.ownerId === user.id) && x.status !== 'closed' && PM.blockerAge(x, t) > 14 && PM.ACTIVE(q.status); });
    const byTrack = { ep: { my: 0, bl: 0 }, rp: { my: 0, bl: 0 } }; for (const it of my) { const q = findP(it.pid); if (q) byTrack[PM.trackPath(q.track)].my++; } for (const x of bl) byTrack[PM.trackPath(findP(x.pid).track)].bl++;
    for (const tr of ['ep', 'rp']) byTrack[tr].dec = staff ? 0 : decN(tr); // «Ждут решения»: запросы переносов и пункты на проверке
    return ok({ pmmy: my.length, pmbl: bl.length, byTrack }); }
  if (false) return ok({ pmmy: myItems().filter(it => it.due && it.due < t).length, pmbl: db.pmBlockers.filter(x => { const q = findP(x.pid); return !!q && PM.shownTrack(q.track) && (!staff || x.ownerId === user.id) && x.status !== 'closed' && PM.blockerAge(x, t) > 14 && PM.ACTIVE(q.status); }).length });
  if (a === 'overview' && method === 'GET') {
    const projs = db.pmProjects.filter(p => PM.shownTrack(p.track) && visibleP(p) && inTrackQ(p)); const pset = new Set(projs.map(p => p.id));
    const blockersIn = db.pmBlockers.filter(x => pset.has(x.pid) && (!staff || x.ownerId === user.id)); // блокеры только проектов сводки (стадия, видимость, staff)
    const dash = PM.dashboard(projs, db.pmItems, blockersIn, t); // АН скрыт из сводки (данные и карточки по API остаются)
    dash.rows = dash.rows.map(r => Object.assign(projOut(r), { canEdit: PM.isManager(user, r), canBudget: PM.canBudget(user, r) }, PM.canBudget(user, r) ? { throughput: PM.throughput(r, r.health) } : {}));
    return ok(Object.assign(dash, { blockersList: blockersIn.map(blockerOut), settings: PM.isLeader(user) ? S : undefined, canSettings: ['owner', 'partner'].includes(user.role), staff, canCreate: PM.canCreate(user), leader: PM.isLeader(user), financeProjects: PM.isLeader(user) ? finProjects() : [], templates: Object.fromEntries(TRACKS.map(k => [k, PM.templateCount(k)])), decisions: staff ? 0 : decN(ctx.qs && ctx.qs.track) }));
  }
  if (a === 'my' && method === 'GET') return ok(myItems().map(it => { const p = findP(it.pid); return Object.assign({}, it, { project: p.name, track: p.track, canEdit: PM.canEditItem(user, p, it), waiting: PM.waitingFor(db.pmItems.filter(x => x.pid === it.pid), it), kcol: PM.itemKanban(it) }, flags(p, it)); }).sort((x, y) => String(x.due || '9').localeCompare(String(y.due || '9'))));
  if (a === 'finance' && b === 'projects' && method === 'GET') { if (!PM.isLeader(user)) return err(403, 'Только руководитель'); return ok(finProjects()); }
  if (a === 'projects') {
    if (!b && method === 'GET') return ok(db.pmProjects.filter(p => (!ctx.qs.track || p.track === ctx.qs.track) && visibleP(p)).map(p => Object.assign(projOut(PM.summary(p, db.pmItems, db.pmBlockers, t)), { canEdit: PM.isManager(user, p) })));
    if (!b && method === 'POST') {
      if (!PM.canCreate(user)) return err(403, 'Создавать проекты могут руководители, ПМ и ГИП');
      if (!TRACKS.includes(body.track) || !String(body.name || '').trim()) return err(400, 'Укажите стадию (ЭП / РП) и название');
      const f = Object.assign({}, body); if (user.role === 'gip' && !f.gipId) f.gipId = user.id; if (user.role === 'pm' && !f.pmId) f.pmId = user.id;
      if (!PM.isLeader(user)) delete f.budget;
      return ok(card(createProject(ctx, f, user.id)));
    }
    const p = b && findP(b); if (b && !p) return err(404, 'Проект не найден');
    if (p && staff && !visibleP(p)) return err(403, 'Проект вам не назначен');
    if (p && !c && method === 'GET') return ok(card(p));
    if (p && !c && method === 'PUT') {
      if (!PM.isManager(user, p)) return err(403, 'Менять карточку могут руководитель, ГИП и ПМ проекта');
      const patch = pick(body, FIELDS); if ('budget' in body) { if (!PM.canBudget(user, p)) return err(403, 'Нет доступа к бюджету'); patch.budget = cleanBudget(body.budget); }
      if ('charter' in body) patch.charter = cleanCharter(body.charter);
      if (('gipId' in patch || 'pmId' in patch || 'projectId' in patch) && !PM.isLeader(user)) { delete patch.gipId; delete patch.pmId; delete patch.projectId; }
      if ('status' in patch && !PM.STATUS.includes(patch.status)) delete patch.status; if ('risk' in patch && !PM.RISK.includes(patch.risk)) delete patch.risk;
      if ('name' in patch) { patch.name = String(patch.name).trim(); if (!patch.name) delete patch.name; }
      cleanContract(patch, body, p);
      p.history = PM.projectHistory(p, patch, user.id); // статус, сроки, название — для ленты «Журнал»
      Object.assign(p, patch, { updatedAt: now(), updatedBy: user.id }); store.save(); store.audit(user.id, 'update', 'pmProjects', p.id); return ok(card(p));
    }
    if (p && !c && method === 'DELETE') {
      if (!PM.isLeader(user)) return err(403, 'Удалять может руководитель');
      db.pmItems = db.pmItems.filter(i => i.pid !== p.id); db.pmBlockers = db.pmBlockers.filter(x => x.pid !== p.id); db.pmProjects = db.pmProjects.filter(x => x.id !== p.id);
      db.pmLog = logs().filter(r => r.pid !== p.id); dropLogDir(ctx, p.id); CHAT.onProjectDelete(db, p.id); // группы WhatsApp проекта снова «не привязаны», сообщения остаются
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
      if (p.track === 'concept') { collapseConcept(ctx, p, body, user.id); return ok(card(p)); } // старая концепция сворачивается в ЭП на месте
      const linkKey = next + 'Id'; if (p[linkKey] && findP(p[linkKey])) return err(400, 'Проект уже передан дальше');
      const q = createProject(ctx, { track: next, name: body.name || p.name, no: p.no || '', client: p.client || '', address: p.address || '', area: p.area || '', projectId: p.projectId || '', folder: p.folder || '', members: p.members || {}, pmId: body.pmId || p.pmId || '', gipId: body.gipId || p.gipId || '', start: body.start || t, due: body.due || '', fit: !!body.due, comment: body.comment || '', miroUrl: next === 'ep' ? (p.miroUrl || '') : '' }, user.id);
      q[p.track + 'Id'] = p.id; p.history = PM.projectHistory(p, { status: 'Готово' }, user.id, `передан в ${PM.TRACK_SHORT[next] || next}`); Object.assign(p, { status: 'Готово', [linkKey]: q.id, handedAt: t }); store.save(); store.audit(user.id, 'handover', 'pmProjects', p.id, { to: q.id, track: next }); ctx.emit('pm.project.handover', { from: p, to: q }); return ok(card(q));
    }
    // пересобрать пункты по текущему шаблону (руководитель): {template: ep|rp, keepExtra: true}
    if (p && c === 'rebuild' && method === 'POST') {
      if (!PM.isLeader(user)) return err(403, 'Пересобрать пункты может руководитель');
      const track = TRACKS.includes(body.template) ? body.template : p.track; const keepExtra = !(body.keepExtra === false || body.keepExtra === 'false' || body.keepExtra === 0);
      const rep = rebuildItems(ctx, p, track, keepExtra, user.id); return ok(Object.assign({ report: rep }, card(p)));
    }
    // статусы из дорожной карты по кодам пунктов: {items: [{code, status, due, title?}]} → «сделано» и подпись статуса (ГИП/ПМ проекта, руководитель)
    if (p && c === 'statuses' && method === 'POST') {
      if (!PM.isManager(user, p)) return err(403, 'Статусы ставит ГИП/ПМ проекта или руководитель');
      const list = Array.isArray(body.items) ? body.items : []; if (!list.length) return err(400, 'Нет строк items');
      const items = db.pmItems.filter(i => i.pid === p.id); const rep = { updated: 0, done: 0, missing: [] };
      for (const r of list) {
        const code = PM.normCode(r.code); const it = (code && items.find(i => i.code && PM.normCode(i.code) === code)) || (r.title ? PM.findItemByTitle(items, r.title) : null);
        if (!it) { rep.missing.push(r.code || r.title || '?'); continue; }
        const st = PM.roadmapStatus(r.status); const patch = {}; const due = r.due ? PM.parseAnyDate(r.due) : '';
        if (due) patch.due = due; if (st.label !== undefined) patch.rmStatus = st.label;
        if (st.done === true && !it.done) { Object.assign(patch, { done: true, doneAt: due || it.due || t, doneBy: user.id, doneNote: 'по дорожной карте' }); rep.done++; }
        if (st.done === false && it.done) Object.assign(patch, { done: false, doneAt: '', doneBy: '' });
        if (st.label !== undefined) { const k = PM.rmKanban(st.label); if (k) patch.kstatus = k; } // колонка канбана — по статусу таблицы
        logHistory(it, patch, user.id, 'по дорожной карте'); Object.assign(it, patch, { updatedAt: now(), updatedBy: user.id }); rep.updated++;
      }
      store.save(); store.audit(user.id, 'statuses', 'pmProjects', p.id, rep); return ok(Object.assign({ report: rep }, card(p)));
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
    // журнал проекта: лента (записи + события), добавить запись, импорт пачкой
    if (p && c === 'log' && !d && method === 'GET') {
      const blk = db.pmBlockers.filter(x => x.pid === p.id && (!staff || x.ownerId === user.id));
      const extra = PM.canChatRead(user, p, S, db.pmItems) ? CHAT.dayEvents(db, p.id) : []; // переписка: строка на день и группу — только тем, кто её читает
      const events = PM.projectFeed(p, db.pmItems, blk, logs(), { extra }).map(e => e.kind === 'log' ? Object.assign(e, { canEdit: PM.canLogEdit(user, p, e), files: (e.files || []).map(f => Object.assign({}, f, { url: `/api/pm/log/${e.id}/files/${f.key}` })) }) : e);
      return ok({ events, canAdd: PM.canLogAdd(user, p, db.pmItems), canEdit: PM.isManager(user, p), types: PM.LOG_TYPES, today: t, maxFile: PM.LOG_MAX_FILE, maxFiles: PM.LOG_MAX_FILES });
    }
    if (p && c === 'chat' && !d && method === 'GET') return CHAT.projectChat(ctx, p); // вкладка «Переписка»
    if (p && c === 'log' && !d && method === 'POST') {
      if (!PM.canLogAdd(user, p, db.pmItems)) return err(403, 'Добавлять записи могут участники проекта и те, кто ведёт его пункты');
      const r = PM.cleanLog(body, t); if (r.error) return err(400, r.error);
      const rec = Object.assign({ id: store.id(), pid: p.id }, r.rec, { files: [], by: user.id, createdAt: now() }); logs().push(rec);
      store.save(); store.audit(user.id, 'create', 'pmLog', rec.id, { pid: p.id, date: rec.date }); return ok(Object.assign({}, rec, { canEdit: true }));
    }
    if (p && c === 'log' && d === 'batch' && method === 'POST') {
      if (!PM.canLogAdd(user, p, db.pmItems)) return err(403, 'Добавлять записи могут участники проекта и те, кто ведёт его пункты');
      const src = Array.isArray(body.rows) ? body.rows : typeof body.text === 'string' ? PM.parseLogBatch(body.text, { today: t, type: body.type }).rows : [];
      if (!src.length) return err(400, 'Нет строк для импорта'); if (src.length > PM.LOG_MAX_BATCH) return err(400, `Не больше ${PM.LOG_MAX_BATCH} записей за раз`);
      const bad = []; const recs = [];
      src.forEach((row, i) => { const r = PM.cleanLog(Object.assign({ type: body.type }, row), t); if (r.error) bad.push(`строка ${row.line || i + 1}: ${r.error}`); else recs.push(Object.assign({ id: store.id(), pid: p.id }, r.rec, { files: [], by: user.id, createdAt: now(), source: 'batch' })); });
      if (bad.length) return err(400, bad.slice(0, 5).join('; '));
      logs().push(...recs); store.save(); store.audit(user.id, 'import', 'pmLog', p.id, { n: recs.length }); return ok({ added: recs.length });
    }
    if (p && c === 'items' && method === 'POST') {
      if (!PM.isManager(user, p)) return err(403, 'Добавлять пункты может ГИП/ПМ проекта');
      const st = Number(body.stage) || 1; const same = db.pmItems.filter(i => i.pid === p.id && i.stage === st); const role = PM.ITEM_ROLES.includes(body.role) ? body.role : 'ГИП';
      const it = addItems(ctx, [{ pid: p.id, stage: st, stageName: (same[0] || {}).stageName || String(body.stageName || '').trim() || PM.stageNames(p.track)[st - 1] || `Этап ${st}`, title: String(body.title || '').trim() || 'Пункт', role, section: PM.ROLE_SECTION[role] || '', weeks: num(body.weeks) || 1, weeksMax: num(body.weeksMax) || 0, crit: body.crit || '', optional: false, done: false, na: false, due: body.due || '', assigneeId: body.assigneeId || '', contractor: body.contractor || '', note: body.note || '', order: Math.max(0, ...db.pmItems.filter(i => i.pid === p.id).map(i => i.order || 0)) + 1, custom: true, createdBy: user.id, createdAt: now(), history: [{ at: now(), by: user.id, field: 'created', from: '', to: '' }] }])[0];
      store.save(); store.audit(user.id, 'create', 'pmItems', it.id); return ok(Object.assign({}, it, { canEdit: true }));
    }
  }
  if (a === 'items' && b) {
    const it = db.pmItems.find(i => i.id === b); if (!it) return err(404, 'Пункт не найден'); const p = findP(it.pid);
    if (method === 'PUT') {
      if (!PM.canEditItem(user, p, it)) return err(403, 'Этот пункт ведёт другой раздел');
      let patch = pick(body, staff ? PM.STAFF_ITEM_FIELDS : ITEM_FIELDS_ANY); // сотрудник — только отметка (и колонка канбана) и заметка своего пункта
      if (PM.isManager(user, p)) Object.assign(patch, pick(body, ITEM_FIELDS_MGR));
      patch = PM.kanbanPatch(it, patch); // колонка канбана ↔ «сделано»: «Готово» = done, открытая колонка у сделанного — возврат
      if ('done' in patch) { patch.done = !!patch.done && patch.done !== 'false'; if (patch.done && !it.done) { patch.doneAt = t; patch.doneBy = user.id; } if (!patch.done) { if (it.done) patch.returns = (Number(it.returns) || 0) + 1; patch.doneAt = ''; patch.doneBy = ''; } }
      if ('weeksMax' in patch) patch.weeksMax = num(patch.weeksMax) || 0;
      if ('na' in patch) patch.na = !!patch.na && patch.na !== 'false';
      if ('role' in patch) { if (!PM.ITEM_ROLES.includes(patch.role)) delete patch.role; else patch.section = PM.ROLE_SECTION[patch.role] || ''; }
      if ('stage' in patch) { patch.stage = Number(patch.stage) || it.stage; const same = db.pmItems.find(i => i.pid === p.id && i.stage === patch.stage && i.id !== it.id); patch.stageName = same ? same.stageName : (PM.stageNames(p.track)[patch.stage - 1] || `Этап ${patch.stage}`); }
      if ('weeks' in patch) patch.weeks = num(patch.weeks) || it.weeks;
      if ('contractor' in patch) patch.contractor = String(patch.contractor || '').trim();
      if ('due' in patch) patch.due = String(patch.due || '').slice(0, 10);
      if ('due' in patch && it.due && patch.due && patch.due !== it.due) { // прямая правка срока — «перенос без запроса» в истории переносов; открытый запрос закрывается
        const pend = PM.shiftPending(it); if (pend) Object.assign(pend, { status: 'cancelled', decidedAt: now(), decidedBy: user.id, comment: 'срок изменён напрямую' });
        it.shifts = (Array.isArray(it.shifts) ? it.shifts : []).concat([{ id: store.id(), at: now(), by: user.id, assigneeId: it.assigneeId || '', from: it.due, to: patch.due, days: PM.days(it.due, patch.due), reason: '', status: 'direct' }]).slice(-30);
        logHistory(it, { due: patch.due }, user.id, 'перенос без запроса'); const rest = Object.assign({}, patch); delete rest.due; logHistory(it, rest, user.id);
      } else logHistory(it, patch, user.id);
      Object.assign(it, patch, { updatedAt: now(), updatedBy: user.id }); store.save(); store.audit(user.id, 'update', 'pmItems', it.id, patch.done !== undefined ? { done: patch.done } : null);
      if (patch.done === true) ctx.emit('pm.item.done', { item: it, project: p });
      return ok(Object.assign({}, it, { canEdit: true, kcol: PM.itemKanban(it) }, flags(p, it)));
    }
    if (method === 'DELETE') { if (!PM.isManager(user, p)) return err(403, 'Удалять пункты может ГИП/ПМ проекта'); db.pmItems = db.pmItems.filter(i => i.id !== it.id); store.save(); store.audit(user.id, 'delete', 'pmItems', b); return ok({ ok: true }); }
  }
  if (a === 'log' && b) {
    const rec = logs().find(r => r.id === b); if (!rec) return err(404, 'Запись не найдена'); const p = findP(rec.pid); if (!p) return err(404, 'Проект не найден');
    if (!visibleP(p)) return err(403, 'Проект вам не назначен');
    if (c === 'files' && d && method === 'GET') {
      if (!PM.LOG_KEY_RE.test(d) || !(rec.files || []).some(f => f.key === d)) return err(404, 'Файл не найден'); const file = path.join(logDir(ctx, p.id), d); if (!fs.existsSync(file)) return err(404, 'Файл не найден');
      return ctx.send(200, fs.readFileSync(file), { 'Content-Type': LOG_MIME[d.split('.').pop()] || 'application/octet-stream', 'Content-Disposition': `inline; filename="${d}"`, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    }
    if (!PM.canLogEdit(user, p, rec)) return err(403, 'Править запись может автор или ГИП/ПМ проекта');
    if (c === 'files' && !d && method === 'POST') {
      if ((rec.files || []).length >= PM.LOG_MAX_FILES) return err(400, `Не больше ${PM.LOG_MAX_FILES} вложений в записи`);
      const f = readLogFile(body); if (typeof f === 'string') return err(400, f);
      const x = writeLogFile(ctx, p.id, f); rec.files = [...(rec.files || []), x]; Object.assign(rec, { updatedAt: now(), updatedBy: user.id });
      store.save(); store.audit(user.id, 'file', 'pmLog', rec.id, { key: x.key, size: x.size }); return ok(Object.assign({}, x, { url: `/api/pm/log/${rec.id}/files/${x.key}` }));
    }
    if (c === 'files' && d && method === 'DELETE') {
      if (!(rec.files || []).some(f => f.key === d)) return err(404, 'Файл не найден'); dropLogFile(ctx, p.id, d); rec.files = rec.files.filter(f => f.key !== d);
      Object.assign(rec, { updatedAt: now(), updatedBy: user.id }); store.save(); store.audit(user.id, 'file-delete', 'pmLog', rec.id, { key: d }); return ok({ ok: true });
    }
    if (!c && method === 'PUT') {
      const r = PM.cleanLog(Object.assign({ date: rec.date, type: rec.type, text: rec.text, participants: rec.participants }, ctx.pick(body, ['date', 'type', 'text', 'participants'])), t); if (r.error) return err(400, r.error);
      Object.assign(rec, r.rec, { updatedAt: now(), updatedBy: user.id }); store.save(); store.audit(user.id, 'update', 'pmLog', rec.id); return ok(Object.assign({}, rec, { canEdit: true }));
    }
    if (!c && method === 'DELETE') {
      for (const f of rec.files || []) dropLogFile(ctx, p.id, f.key);
      db.pmLog = logs().filter(r => r.id !== rec.id); store.save(); store.audit(user.id, 'delete', 'pmLog', rec.id, { pid: p.id }); return ok({ ok: true });
    }
  }
  if (a === 'blockers') {
    if (!b && method === 'GET') return ok(db.pmBlockers.filter(x => !staff || x.ownerId === user.id).map(blockerOut));
    if (!b && method === 'POST') { const p = findP(body.pid); if (!p) return err(400, 'Нет проекта'); if (!PM.isManager(user, p) && user.role !== 'lead') return err(403, 'Нет прав');
      if (!String(body.what || '').trim()) return err(400, 'Опишите, чего ждём');
      const x = Object.assign(pick(body, BLOCKER_FIELDS), { id: store.id(), pid: p.id, what: String(body.what).trim(), status: body.status === 'closed' ? 'closed' : 'open', since: body.since || t, createdAt: now(), createdBy: user.id }); db.pmBlockers.push(x); store.save(); store.audit(user.id, 'create', 'pmBlockers', x.id); return ok(blockerOut(x)); }
    const x = b && db.pmBlockers.find(z => z.id === b); if (!x) return err(404, 'Блокер не найден'); const p = findP(x.pid);
    if (!PM.isManager(user, p) && x.createdBy !== user.id) return err(403, 'Менять может ГИП/ПМ проекта или автор');
    if (method === 'PUT') { const patch = pick(body, BLOCKER_FIELDS); if ('status' in patch) patch.status = patch.status === 'closed' ? 'closed' : 'open'; Object.assign(x, patch, x.status !== 'closed' && patch.status === 'closed' ? { closedAt: t, closedBy: user.id } : {}, patch.status === 'open' ? { closedAt: '', closedBy: '' } : {}, { updatedAt: now(), updatedBy: user.id }); store.save(); store.audit(user.id, 'update', 'pmBlockers', x.id); return ok(blockerOut(x)); }
    if (method === 'DELETE') { db.pmBlockers = db.pmBlockers.filter(z => z.id !== x.id); store.save(); store.audit(user.id, 'delete', 'pmBlockers', x.id); return ok({ ok: true }); }
  }
  // импорт из реестра (JSON от modules/pm/tools/import_pm.py): проекты + пункты прошлых этапов отмечены, задачи Trello, блокеры, бюджеты
  // массовое обновление дат и реквизитов договоров (руководитель): rows [{id|name, start, due, contractNo, contractDate, contractTerm, contractTermUnit, contractStartRule, dueNote, dueFromTerm}]
  if (a === 'contract-dates' && method === 'POST') {
    if (!PM.isLeader(user)) return err(403, 'Только руководитель');
    const rows = Array.isArray(body.rows) ? body.rows : []; const normName = x => String(x || '').toLowerCase().replace(/[\s\u00A0\u2014\u2013-]+/g, ' ').trim();
    const applied = [], missed = [];
    for (const r of rows) {
      const p = (r.id && findP(r.id)) || db.pmProjects.find(x => normName(x.name) === normName(r.name) && (!r.track || x.track === r.track));
      if (!p) { missed.push(r.name || r.id || '?'); continue; }
      const patch = cleanContract(pick(r, ['start', 'due'].concat(CONTRACT_FIELDS)), r, p);
      Object.assign(p, patch, { updatedAt: now(), updatedBy: user.id }); store.audit(user.id, 'update', 'pmProjects', p.id); applied.push({ id: p.id, name: p.name, start: p.start, due: p.due, contractNo: p.contractNo || '' });
    }
    if (applied.length) store.save();
    return ok({ applied, missed });
  }
  // импорт ЭП из CSV-выгрузки ClickUp (руководитель): { mode: skip|merge, projects: [...] } — разбор в браузере (domain.clickupToProjects) или { csv, map?, source? } — разбор здесь
  if (a === 'import-clickup' && method === 'POST') {
    if (!PM.isLeader(user)) return err(403, 'Импорт доступен только руководителю');
    let list = Array.isArray(body.projects) ? body.projects : null;
    if (!list && typeof body.csv === 'string') { const csv = PM.parseCsv(body.csv); list = PM.clickupToProjects(csv, body.map && typeof body.map === 'object' ? body.map : PM.clickupAutoMap(csv.header), { source: body.source === 'list' ? 'list' : 'parent', track: 'ep' }); }
    if (!list || !list.length) return err(400, 'В выгрузке нет задач');
    return ok(importClickup(ctx, list, body.mode === 'merge' ? 'merge' : 'skip', user));
  }
  if (a === 'import' && method === 'POST') {
    if (!PM.isLeader(user)) return err(403, 'Импорт доступен только руководителю');
    const list = Array.isArray(body.projects) ? body.projects : []; if (!list.length) return err(400, 'В файле нет проектов');
    const mode = body.mode === 'replace' ? 'replace' : 'skip'; const since = body.since || t;
    const rep = { created: [], replaced: [], skipped: [], unlinked: [], items: 0, done: 0, tasks: 0, blockers: 0, budgets: 0 };
    for (const src of list) {
      const name = String(src.name || '').trim(); const track = PM.normalizeTrack(src.track); if (!name) continue;
      const ex = db.pmProjects.find(q => q.track === track && String(q.name).trim().toLowerCase() === name.toLowerCase());
      if (ex) {
        if (mode !== 'replace') { rep.skipped.push(name); continue; }
        db.pmItems = db.pmItems.filter(i => i.pid !== ex.id); db.pmBlockers = db.pmBlockers.filter(x => x.pid !== ex.id); db.pmProjects = db.pmProjects.filter(x => x.id !== ex.id); rep.replaced.push(name);
      } else rep.created.push(name);
      const f = pick(src, ['name', 'no', 'client', 'address', 'area', 'status', 'risk', 'gipId', 'pmId', 'start', 'due', 'forecast', 'comment', 'projectId', 'miroUrl', 'folder'].concat(CONTRACT_FIELDS)); cleanContract(f, src, null); f.track = track; f.fit = !!f.due; f.budget = src.budget || null;
      if (f.projectId && !db.projects.some(x => x.id === f.projectId)) { rep.unlinked.push(`${name} → ${f.projectId}`); f.projectId = ''; }
      if (f.gipId && !db.users.some(u => u.id === f.gipId)) f.gipId = ''; if (f.pmId && !db.users.some(u => u.id === f.pmId)) f.pmId = '';
      const p = createProject(ctx, f, user.id); if (f.budget) rep.budgets++;
      const stage = Number(src.stage) || PM.stageIndex(track, src.stageName) || 1;
      for (const it of db.pmItems.filter(i => i.pid === p.id)) { rep.items++; if (it.stage < stage) { logHistory(it, { done: true }, user.id, 'по реестру: этап пройден'); Object.assign(it, { done: true, doneAt: '', doneBy: 'import', doneNote: 'по реестру: этап пройден' }); rep.done++; } }
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

module.exports = { team: TEAM, id: 'pm', api: 'pm', collections: ['pmProjects', 'pmItems', 'pmBlockers', 'pmLog', 'pmChats', 'pmChatMessages'], handle, chat: CHAT, createProject, collapseConcept, importClickup, hoursOf, logHistory, rebuildItems, domain: PM };
