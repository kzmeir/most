'use strict';
// Модуль «Персонал»: /api/hr/*. Поток B. Контракт — docs/ARCHITECTURE.md, задачи — modules/hr/README.md, логика — modules/hr/domain.js.
// Работает на сайте ERP: сотрудники (db.employees), ЗП и налоги считаются здесь на сервере и отдаются строго по правам:
// деньги (оклад, ставка часа, себестоимость) — только owner/partner/accountant; остальным — часы, команды, статусы табелей.
const HR = require('./domain');

const TEAM_FIELDS = ['name', 'section', 'leadUserId', 'members', 'note'];
const PERSON_MGR = ['position', 'hoursPerWeek', 'userId', 'note'];      // правят руководители (owner/partner)
const PERSON_MONEY = ['bonusMonthly', 'bonus13', 'rateOverride'];       // правят owner/partner/accountant
const ACTIVE = s => !['Готово', 'Отменён'].includes(s || 'В работе'); // как PM.ACTIVE, без зависимости от модуля pm
const now = () => new Date().toISOString();
const norm = s => String(s || '').trim().toLowerCase();

// ---------- связи пользователь ↔ сотрудник ----------
// Основная связь — users.employeeId (владелец задаёт в «Настройки → Пользователи»). Запасная — hrPeople.userId (руководитель ставит в «Команды»).
// В режиме разработки сотрудника можно подставить cookie devemployee=<id> (только для dev-пользователей).
function employeeIdOf(ctx, user) {
  const { db } = ctx; if (!user) return '';
  if (/^dev-/.test(String(user.id)) && ctx.req && ctx.auth) { const c = ctx.auth.parseCookies(ctx.req); if (c.devemployee && db.employees.some(e => e.id === c.devemployee)) return c.devemployee; }
  if (user.employeeId && db.employees.some(e => e.id === user.employeeId)) return user.employeeId;
  const u = db.users.find(x => x.id === user.id); if (u && u.employeeId && db.employees.some(e => e.id === u.employeeId)) return u.employeeId;
  const p = db.hrPeople.find(x => x.userId === user.id); if (p && db.employees.some(e => e.id === p.id)) return p.id;
  return '';
}
function userIdOf(db, employeeId) {
  const u = db.users.find(x => x.employeeId === employeeId && x.active !== false); if (u) return u.id;
  const p = db.hrPeople.find(x => x.id === employeeId && x.userId); return p ? p.userId : '';
}
function userEmpMap(db) { const m = {}; for (const p of db.hrPeople) if (p.userId) m[p.userId] = p.id; for (const u of db.users) if (u.employeeId) m[u.id] = u.employeeId; return m; }
const peopleMap = db => Object.fromEntries(db.hrPeople.map(p => [p.id, p]));
const teamsOf = (db, employeeId) => db.hrTeams.filter(t => (t.members || []).includes(employeeId));
const empById = (db, id) => db.employees.find(e => e.id === id) || null;
const isActiveEmp = e => e && e.status !== 'resigned';
const short = name => { const p = String(name || '').trim().split(/\s+/); return p.length > 2 ? `${p[0]} ${p[1]}` : p.join(' '); };

// кого пользователь видит и чьи табели может принимать
function scopeOf(ctx, user) {
  const { db } = ctx; const my = employeeIdOf(ctx, user);
  if (HR.isManager(user)) return { all: true, ids: null, accept: true, my };
  if (HR.canViewAll(user)) return { all: true, ids: null, accept: false, my };
  if (HR.isLead(user)) { const teams = db.hrTeams.filter(t => t.leadUserId === user.id || (user.section && t.section === user.section)); const ids = new Set(teams.flatMap(t => t.members || [])); if (my) ids.add(my); return { all: false, ids, accept: true, my, teams: teams.map(t => t.id), teamIds: new Set(teams.flatMap(t => t.members || [])) }; }
  return { all: false, ids: new Set(my ? [my] : []), accept: false, my };
}
const canSee = (scope, empId) => scope.all || scope.ids.has(empId);
// принимать: руководители — всех; руководитель раздела — членов своих команд (не свой собственный табель)
const canAccept = (scope, empId) => scope.accept && (scope.all || (scope.teamIds && scope.teamIds.has(empId) && empId !== scope.my));

// ---------- вывод ----------
function empOut(ctx, e, opts) {
  const { db, D } = ctx; opts = opts || {}; const x = (opts.people || peopleMap(db))[e.id] || {}; const teams = teamsOf(db, e.id); const uid = userIdOf(db, e.id);
  const o = { id: e.id, name: e.name, short: short(e.name), company: e.company || '', status: e.status || 'active', hired: e.hired || '', resigned: e.resigned || '', position: x.position || e.position || '', hoursPerWeek: HR.num(x.hoursPerWeek) || HR.HOURS_PER_WEEK, userId: uid, userName: uid ? ctx.userName(uid) : '', teams: teams.map(t => ({ id: t.id, name: t.name, section: t.section || '' })), section: (teams[0] || {}).section || '', note: x.note || '' };
  if (opts.money) { const r = HR.rateCalc(e, x, opts.ym || ctx.today().slice(0, 7), db.settings, D); Object.assign(o, { salary: r.salary, monthCost: r.monthCost, rate: r.rate, rateCalc: r.rateCalc, rateOverride: r.override, bonusMonthly: r.bonusMonthly, bonus13: !!x.bonus13, employerCost: r.employerCost, normHours: r.normHours }); }
  return o;
}
const teamOut = (ctx, t, people) => Object.assign({}, t, { members: (t.members || []).map(id => empById(ctx.db, id)).filter(Boolean).map(e => empOut(ctx, e, { people })), leadName: t.leadUserId ? ctx.userName(t.leadUserId) : '' });
const findTs = (db, employeeId, week) => db.hrTimesheets.find(t => t.employeeId === employeeId && t.week === week) || null;
const tsOut = ts => ts ? Object.assign({}, ts, { totals: HR.tsTotals(ts) }) : null;

// проекты для табеля: активные pmProjects; «мои» — где пользователь ГИП/ПМ, исполнитель пункта, есть пункты раздела команды или недавно списывал часы
function projectsFor(ctx, employeeId, week) {
  const { db } = ctx; const uid = userIdOf(db, employeeId); const secs = new Set(teamsOf(db, employeeId).map(t => t.section).filter(Boolean));
  const recent = new Set(); const from = HR.addWeeks(week, -8); for (const t of db.hrTimesheets) if (t.employeeId === employeeId && t.week >= from && t.week <= week) for (const l of t.lines || []) if (l.pid) recent.add(l.pid);
  const mineItems = new Set(); for (const it of db.pmItems) { if (it.done || it.na) continue; if ((uid && it.assigneeId === uid) || (secs.size && secs.has(HR.itemSection(it)))) mineItems.add(it.pid); }
  return db.pmProjects.filter(p => ACTIVE(p.status) || recent.has(p.id)).map(p => ({ id: p.id, name: p.name, track: p.track || '', status: p.status || '', mine: recent.has(p.id) || !!(uid && (p.gipId === uid || p.pmId === uid)) || mineItems.has(p.id) }))
    .sort((a, b) => (b.mine - a.mine) || String(a.name).localeCompare(String(b.name), 'ru'));
}
const projectNames = db => Object.fromEntries(db.pmProjects.map(p => [p.id, p.name]));

// ---------- себестоимость ----------
// ставка часа сотрудника в месяце (кэш на запрос)
function rateIndex(ctx) {
  const { db, D } = ctx; const people = peopleMap(db); const cache = new Map();
  return (empId, ym) => { const k = empId + '|' + ym; if (cache.has(k)) return cache.get(k); const e = empById(db, empId); const r = e ? HR.rateCalc(e, people[empId], ym, db.settings, D).rate : 0; cache.set(k, r); return r; };
}
// строки табелей за период: часы и стоимость. o: { from, to (недели), pid, employeeId, includeDraft, acceptedOnly }
function laborLines(ctx, o) {
  o = o || {}; const rate = rateIndex(ctx); const out = [];
  for (const ts of ctx.db.hrTimesheets) {
    if (o.employeeId && ts.employeeId !== o.employeeId) continue; if (o.from && ts.week < o.from) continue; if (o.to && ts.week > o.to) continue;
    if (ts.status === 'draft' && !o.includeDraft) continue; if (o.acceptedOnly && ts.status !== 'accepted') continue;
    const ym = HR.weekMonth(ts.week); const r = rate(ts.employeeId, ym);
    for (const l of ts.lines || []) { if (o.pid && l.pid !== o.pid) continue; const h = HR.lineTotal(l); if (!h) continue; out.push({ employeeId: ts.employeeId, week: ts.week, ym, pid: l.pid || '', kind: l.kind || 'project', section: l.section || '', hours: h, rate: r, cost: Math.round(h * r), status: ts.status }); }
  }
  return out;
}
function aggregate(lines) {
  const r = { hours: 0, cost: 0, bySection: {}, byEmployee: {}, byMonth: {}, byStatus: { draft: 0, submitted: 0, accepted: 0, rejected: 0 }, weeks: new Set() };
  for (const l of lines) {
    r.hours += l.hours; r.cost += l.cost; r.weeks.add(l.week); r.byStatus[l.status] = (r.byStatus[l.status] || 0) + l.hours;
    const s = r.bySection[l.section || '—'] || (r.bySection[l.section || '—'] = { hours: 0, cost: 0 }); s.hours += l.hours; s.cost += l.cost;
    const e = r.byEmployee[l.employeeId] || (r.byEmployee[l.employeeId] = { employeeId: l.employeeId, hours: 0, cost: 0 }); e.hours += l.hours; e.cost += l.cost;
    const m = r.byMonth[l.ym] || (r.byMonth[l.ym] = { hours: 0, cost: 0 }); m.hours += l.hours; m.cost += l.cost;
  }
  r.hours = HR.round1(r.hours); r.weeks = r.weeks.size; r.byEmployee = Object.values(r.byEmployee).map(e => Object.assign(e, { hours: HR.round1(e.hours), rate: e.hours ? Math.round(e.cost / e.hours) : 0 })).sort((a, b) => b.cost - a.cost);
  for (const k of Object.keys(r.bySection)) r.bySection[k].hours = HR.round1(r.bySection[k].hours); for (const k of Object.keys(r.byMonth)) r.byMonth[k].hours = HR.round1(r.byMonth[k].hours);
  for (const k of Object.keys(r.byStatus)) r.byStatus[k] = HR.round1(r.byStatus[k]);
  return r;
}
// себестоимость часов по проекту pm — для модуля pm и аналитики: ctx.modules.hr.laborCost(ctx, pmProjectId, { from, to, includeDraft })
// Деньги (cost, rate) вызывающий модуль показывает только owner/partner/accountant (ctx.modules.hr.domain.isMoney(user)); часы — по своим правилам.
function laborCost(ctx, pmProjectId, opts) {
  const lines = laborLines(ctx, Object.assign({}, opts || {}, { pid: pmProjectId })); const a = aggregate(lines); const emps = peopleMap(ctx.db);
  a.byEmployee = a.byEmployee.map(e => { const emp = empById(ctx.db, e.employeeId); return Object.assign(e, { name: emp ? emp.name : e.employeeId, position: (emps[e.employeeId] || {}).position || (emp && emp.position) || '' }); });
  return Object.assign({ pid: pmProjectId }, a);
}
// то же без денег
function laborHours(ctx, pmProjectId, opts) {
  const a = laborCost(ctx, pmProjectId, opts); delete a.cost;
  for (const k of Object.keys(a.bySection)) delete a.bySection[k].cost; for (const k of Object.keys(a.byMonth)) delete a.byMonth[k].cost;
  a.byEmployee = a.byEmployee.map(e => { const o = Object.assign({}, e); delete o.cost; delete o.rate; return o; });
  return a;
}

// ---------- API ----------
function handle(ctx) {
  const { parts, method, body, user, db, store, D, ok, err, pick, num, qs } = ctx;
  if (!HR.canOpen(user)) return err(401, 'Не авторизован');
  const [, a, b, c] = parts; const t = ctx.today(); const curWeek = HR.isoWeek(t); const money = HR.isMoney(user), manager = HR.isManager(user);
  const scope = scopeOf(ctx, user); const my = scope.my; const people = peopleMap(db);
  const weekArg = w => (HR.isWeek(w) ? w : curWeek); const ymArg = v => (/^\d{4}-\d{2}$/.test(v || '') ? v : t.slice(0, 7));
  const audit = (action, col, id, extra) => store.audit(user.id, action, col, id, extra);
  const newTs = empId => { const d = { id: store.id(), employeeId: empId, week: '', status: 'draft', lines: [], total: 0, createdAt: now(), createdBy: user.id }; db.hrTimesheets.push(d); return d; };
  const checkLines = lines => { const bad = HR.validateLines(lines); if (bad) return bad; for (const l of lines) if (l.pid && !db.pmProjects.some(p => p.id === l.pid)) return 'Нет такого проекта'; return ''; };

  // --- я и счётчики ---
  if (a === 'me' && method === 'GET') {
    const e = my && empById(db, my);
    return ok({ employeeId: my, employee: e ? empOut(ctx, e, { people }) : null, linked: !!e, week: curWeek, today: t, manager, money, accept: scope.accept, all: scope.all, plan: HR.canPlan(user), sections: HR.SECTIONS, teams: e ? teamsOf(db, my).map(x => ({ id: x.id, name: x.name, section: x.section })) : [] });
  }
  if (a === 'badges' && method === 'GET') {
    let hrtime = 0, hrreview = 0;
    if (my) { const dow = (new Date(t + 'T00:00:00Z').getUTCDay() + 6) % 7; const weeks = HR.lastWeeks(HR.addWeeks(curWeek, -1), 4); if (dow >= 4) weeks.push(curWeek); // с пятницы напоминаем и о текущей неделе
      for (const w of weeks) { const ts = findTs(db, my, w); if (!ts || ts.status === 'draft' || ts.status === 'rejected') hrtime++; } }
    if (scope.accept) hrreview = db.hrTimesheets.filter(ts => ts.status === 'submitted' && canAccept(scope, ts.employeeId)).length;
    return ok({ hrtime, hrreview });
  }

  // --- команды ---
  if (a === 'teams') {
    const teamLead = tm => manager || (HR.isLead(user) && (tm.leadUserId === user.id || (!!user.section && tm.section === user.section)));
    if (!b && method === 'GET') {
      const teams = db.hrTeams.map(tm => Object.assign(teamOut(ctx, tm, people), { canEdit: teamLead(tm) })).sort((x, y) => HR.SECTIONS.indexOf(x.section) - HR.SECTIONS.indexOf(y.section) || String(x.name).localeCompare(String(y.name), 'ru'));
      const inTeam = new Set(db.hrTeams.flatMap(tm => tm.members || []));
      const emps = db.employees.filter(isActiveEmp).map(e => empOut(ctx, e, { people })).sort((x, y) => x.name.localeCompare(y.name, 'ru'));
      return ok({ teams, employees: emps, unassigned: emps.filter(e => !inTeam.has(e.id)), canEdit: manager, sections: HR.SECTIONS, hoursPerWeek: HR.HOURS_PER_WEEK });
    }
    const cleanTeam = src => {
      const p = pick(src, TEAM_FIELDS);
      if ('name' in p) { p.name = String(p.name).trim(); if (!p.name) delete p.name; }
      if ('section' in p) p.section = HR.SECTIONS.includes(p.section) ? p.section : '';
      if ('leadUserId' in p) p.leadUserId = p.leadUserId && (db.users.some(u => u.id === p.leadUserId) || /^dev-/.test(String(p.leadUserId))) ? String(p.leadUserId) : '';
      if ('members' in p) p.members = [...new Set((Array.isArray(p.members) ? p.members : []).map(String).filter(id => empById(db, id)))];
      if ('note' in p) p.note = String(p.note || '').slice(0, 500);
      return p;
    };
    if (!b && method === 'POST') {
      if (!manager) return err(403, 'Команды создаёт владелец или партнёр');
      const p = cleanTeam(body); if (!p.name) return err(400, 'Название команды');
      if (db.hrTeams.some(x => norm(x.name) === norm(p.name))) return err(409, 'Команда с таким названием уже есть');
      const tm = Object.assign({ section: '', leadUserId: '', members: [], note: '' }, p, { id: store.id(), createdAt: now(), createdBy: user.id }); db.hrTeams.push(tm); store.save(); audit('create', 'hrTeams', tm.id);
      return ok(Object.assign(teamOut(ctx, tm, people), { canEdit: true }));
    }
    const tm = b && db.hrTeams.find(x => x.id === b); if (b && !tm) return err(404, 'Команда не найдена');
    if (tm && !c && method === 'GET') return ok(Object.assign(teamOut(ctx, tm, people), { canEdit: teamLead(tm) }));
    if (tm && !c && method === 'PUT') {
      if (!teamLead(tm)) return err(403, 'Менять команду может владелец, партнёр или её руководитель');
      const p = cleanTeam(body); if (!manager) { delete p.name; delete p.section; delete p.leadUserId; } // руководитель раздела правит только состав и заметку
      if (p.name && db.hrTeams.some(x => x.id !== tm.id && norm(x.name) === norm(p.name))) return err(409, 'Команда с таким названием уже есть');
      Object.assign(tm, p, { updatedAt: now(), updatedBy: user.id }); store.save(); audit('update', 'hrTeams', tm.id); return ok(Object.assign(teamOut(ctx, tm, people), { canEdit: true }));
    }
    if (tm && !c && method === 'DELETE') { if (!manager) return err(403, 'Удалять команды может владелец или партнёр'); db.hrTeams = db.hrTeams.filter(x => x.id !== tm.id); store.save(); audit('delete', 'hrTeams', tm.id); return ok({ ok: true }); }
    if (tm && c === 'members' && method === 'POST') {
      if (!teamLead(tm)) return err(403, 'Состав меняет владелец, партнёр или руководитель команды');
      const e = empById(db, String(body.employeeId || '')); if (!e) return err(400, 'Нет такого сотрудника');
      tm.members = [...new Set([...(tm.members || []), e.id])]; tm.updatedAt = now(); tm.updatedBy = user.id; store.save(); audit('member-add', 'hrTeams', tm.id, { employeeId: e.id }); return ok(Object.assign(teamOut(ctx, tm, people), { canEdit: true }));
    }
    if (tm && c === 'members' && parts[4] && method === 'DELETE') {
      if (!teamLead(tm)) return err(403, 'Состав меняет владелец, партнёр или руководитель команды');
      tm.members = (tm.members || []).filter(id => id !== parts[4]); tm.updatedAt = now(); tm.updatedBy = user.id; store.save(); audit('member-del', 'hrTeams', tm.id, { employeeId: parts[4] }); return ok(Object.assign(teamOut(ctx, tm, people), { canEdit: true }));
    }
  }

  // --- сотрудники (карточка модуля: должность, норма часов, связь с пользователем; деньги — только MONEY) ---
  if (a === 'employees') {
    if (!b && method === 'GET') {
      const ym = ymArg(qs.ym);
      const list = db.employees.filter(e => qs.all === '1' || isActiveEmp(e)).map(e => empOut(ctx, e, { people, money, ym })).sort((x, y) => (x.status === 'resigned') - (y.status === 'resigned') || x.name.localeCompare(y.name, 'ru'));
      return ok({ employees: list, money, canEdit: manager, ym });
    }
    const e = b && empById(db, b); if (b && !e) return err(404, 'Сотрудник не найден');
    if (e && method === 'GET') {
      const ym = ymArg(qs.ym); const out = { employee: empOut(ctx, e, { people, money, ym }), canEdit: manager, canEditMoney: money, money, hoursVisible: canSee(scope, e.id) || HR.canPlan(user) };
      if (out.hoursVisible) {
        const weeks = HR.lastWeeks(curWeek, 8); out.weeks = weeks.map(w => { const ts = findTs(db, e.id, w); return { week: w, status: ts ? ts.status : '', total: ts ? HR.tsTotals(ts).total : 0, norm: HR.weekNorm(w, out.employee.hoursPerWeek, D.isHoliday) }; });
        const lines = laborLines(ctx, { employeeId: e.id, from: weeks[0], to: curWeek, includeDraft: true }); const names = projectNames(db); const byP = {};
        for (const l of lines) { const k = l.pid || l.kind; const r = byP[k] || (byP[k] = { pid: l.pid, kind: l.kind, name: l.pid ? names[l.pid] || l.pid : HR.KINDS[l.kind], hours: 0 }); r.hours = HR.round1(r.hours + l.hours); }
        out.byProject = Object.values(byP).sort((x, y) => y.hours - x.hours); out.hours8w = HR.round1(lines.reduce((s, l) => s + l.hours, 0));
      }
      if (money) out.rate = HR.rateCalc(e, people[e.id], ym, db.settings, D);
      return ok(out);
    }
    if (e && method === 'PUT') {
      if (!manager && !money) return err(403, 'Карточку сотрудника правят владелец и партнёр (бухгалтер — премии и ставку)');
      const patch = {}; if (manager) Object.assign(patch, pick(body, PERSON_MGR)); if (money) Object.assign(patch, pick(body, PERSON_MONEY));
      if ('position' in patch) patch.position = String(patch.position || '').slice(0, 80);
      if ('hoursPerWeek' in patch) patch.hoursPerWeek = Math.min(60, Math.max(0, num(patch.hoursPerWeek))) || HR.HOURS_PER_WEEK;
      if ('userId' in patch) { patch.userId = String(patch.userId || ''); if (patch.userId && !db.users.some(u => u.id === patch.userId) && !/^dev-/.test(patch.userId)) return err(400, 'Нет такого пользователя'); if (patch.userId) for (const p of db.hrPeople) if (p.id !== e.id && p.userId === patch.userId) p.userId = ''; }
      if ('note' in patch) patch.note = String(patch.note || '').slice(0, 500);
      if ('bonusMonthly' in patch) patch.bonusMonthly = Math.max(0, num(patch.bonusMonthly)); if ('rateOverride' in patch) patch.rateOverride = Math.max(0, num(patch.rateOverride)); if ('bonus13' in patch) patch.bonus13 = patch.bonus13 === true || patch.bonus13 === 'true';
      let p = db.hrPeople.find(x => x.id === e.id); if (!p) { p = { id: e.id, createdAt: now() }; db.hrPeople.push(p); }
      Object.assign(p, patch, { updatedAt: now(), updatedBy: user.id }); store.save(); audit('update', 'hrPeople', e.id);
      return ok({ employee: empOut(ctx, e, { people: peopleMap(db), money }) });
    }
  }

  // --- табель одного сотрудника за неделю ---
  if (a === 'timesheet') {
    const week = weekArg(method === 'GET' ? qs.week : body.week); const empId = String((method === 'GET' ? qs.employeeId : body.employeeId) || my || '');
    if (!empId) return err(400, 'Ваш аккаунт не привязан к сотруднику: попросите владельца указать сотрудника в «Настройки → Пользователи» или в карточке сотрудника («Команды»)');
    const e = empById(db, empId); if (!e) return err(404, 'Сотрудник не найден');
    if (!canSee(scope, empId)) return err(403, 'Это табель другого сотрудника');
    const own = empId === my; const accepter = canAccept(scope, empId) && (!own || manager); const ts = findTs(db, empId, week); const st = ts ? ts.status : 'draft'; // свой табель руководитель раздела не принимает
    const can = { edit: st !== 'accepted' && (own || accepter), submit: (own || accepter) && st !== 'accepted' && st !== 'submitted', accept: accepter && st !== 'accepted', reject: accepter && st === 'submitted', reopen: accepter && st === 'accepted' };
    if (method === 'GET') {
      const x = people[empId] || {}; const hpw = num(x.hoursPerWeek) || HR.HOURS_PER_WEEK; const prevTs = findTs(db, empId, HR.addWeeks(week, -1));
      const teams = teamsOf(db, empId); const scopeList = scope.all ? db.employees.filter(isActiveEmp) : db.employees.filter(z => scope.ids.has(z.id));
      return ok({ employee: empOut(ctx, e, { people }), week, weeks: HR.lastWeeks(HR.addWeeks(week, 2), 8), dates: HR.weekDates(week), holidays: HR.weekHolidays(week, D.isHoliday), norm: HR.weekNorm(week, hpw, D.isHoliday), ts: tsOut(ts) || { employeeId: empId, week, status: 'draft', lines: [], totals: HR.tsTotals({ lines: [] }) }, prev: prevTs ? { week: prevTs.week, lines: prevTs.lines } : null, projects: projectsFor(ctx, empId, week), projectNames: projectNames(db), sections: HR.SECTIONS, defaultSection: (teams[0] || {}).section || '', can, own, me: my, scope: scopeList.map(z => ({ id: z.id, name: z.name })).sort((p1, p2) => p1.name.localeCompare(p2.name, 'ru')), names: { acceptedBy: ts && ts.acceptedBy ? ctx.userName(ts.acceptedBy) : '', submittedBy: ts && ts.submittedBy ? ctx.userName(ts.submittedBy) : '', rejectedBy: ts && ts.rejectedBy ? ctx.userName(ts.rejectedBy) : '' } });
    }
    if (method === 'PUT') {
      if (!can.edit) return err(403, st === 'accepted' ? 'Табель уже принят — верните его в работу (↺), чтобы править' : 'Нет прав менять этот табель');
      const lines = HR.cleanLines(body.lines); const bad = checkLines(lines); if (bad) return err(400, bad);
      const doc = ts || Object.assign(newTs(empId), { week });
      doc.lines = lines; doc.total = HR.tsTotals(doc).total; doc.updatedAt = now(); doc.updatedBy = user.id;
      if (own && !accepter && doc.status === 'submitted') { doc.status = 'draft'; doc.submittedAt = ''; } // сотрудник поправил после сдачи — снова черновик
      if (doc.status === 'rejected') doc.status = 'draft';
      store.save(); audit('save', 'hrTimesheets', doc.id, { week, hours: doc.total });
      return ok({ ts: tsOut(doc), can: Object.assign({}, can, { submit: (own || accepter) && doc.status !== 'submitted', reject: accepter && doc.status === 'submitted' }) });
    }
    if (method === 'POST' && b) {
      let doc = ts;
      if (b === 'submit') {
        if (!can.submit) return err(403, st === 'accepted' ? 'Табель уже принят' : st === 'submitted' ? 'Табель уже сдан' : 'Нет прав');
        if (Array.isArray(body.lines)) { const lines = HR.cleanLines(body.lines); const bad = checkLines(lines); if (bad) return err(400, bad); doc = doc || Object.assign(newTs(empId), { week }); doc.lines = lines; }
        if (!doc || !HR.tsTotals(doc).total) return err(400, 'В табеле нет часов');
        Object.assign(doc, { status: 'submitted', total: HR.tsTotals(doc).total, submittedAt: now(), submittedBy: user.id, rejectNote: '', updatedAt: now(), updatedBy: user.id }); store.save(); audit('submit', 'hrTimesheets', doc.id, { week }); return ok({ ts: tsOut(doc) });
      }
      if (b === 'accept') { if (!can.accept) return err(403, 'Принимает руководитель раздела своей команды, владелец или партнёр'); if (!doc) return err(404, 'Табель ещё не заполнен'); if (!HR.tsTotals(doc).total) return err(400, 'В табеле нет часов'); Object.assign(doc, { status: 'accepted', total: HR.tsTotals(doc).total, acceptedAt: now(), acceptedBy: user.id, rejectNote: '', updatedAt: now(), updatedBy: user.id }); store.save(); audit('accept', 'hrTimesheets', doc.id, { week, employeeId: empId }); return ok({ ts: tsOut(doc) }); }
      if (b === 'reject') { if (!can.reject) return err(403, 'Вернуть можно только сданный табель, и только руководителю'); if (!doc) return err(404, 'Табель ещё не заполнен'); Object.assign(doc, { status: 'rejected', rejectNote: String(body.note || '').slice(0, 300), rejectedAt: now(), rejectedBy: user.id, updatedAt: now(), updatedBy: user.id }); store.save(); audit('reject', 'hrTimesheets', doc.id, { week, employeeId: empId }); return ok({ ts: tsOut(doc) }); }
      if (b === 'reopen') { if (!can.reopen) return err(403, 'Вернуть в работу принятый табель может руководитель'); if (!doc) return err(404, 'Табель ещё не заполнен'); Object.assign(doc, { status: 'draft', acceptedAt: '', acceptedBy: '', updatedAt: now(), updatedBy: user.id }); store.save(); audit('reopen', 'hrTimesheets', doc.id, { week, employeeId: empId }); return ok({ ts: tsOut(doc) }); }
    }
  }

  // --- табели команды: статусы по людям за несколько недель (руководители, руководители разделов, финансы) ---
  if (a === 'timesheets' && method === 'GET') {
    const week = weekArg(qs.week); const n = Math.min(12, Math.max(1, num(qs.n) || 4)); const weeks = HR.lastWeeks(week, n);
    const emps = db.employees.filter(e => canSee(scope, e.id) && (isActiveEmp(e) || weeks.some(w => findTs(db, e.id, w))));
    const rows = emps.map(e => { const x = people[e.id] || {}; const hpw = num(x.hoursPerWeek) || HR.HOURS_PER_WEEK; const o = empOut(ctx, e, { people }); return Object.assign(o, { canAccept: canAccept(scope, e.id), weeks: weeks.map(w => { const ts = findTs(db, e.id, w); const tt = ts ? HR.tsTotals(ts) : null; return { week: w, status: ts ? ts.status : '', total: tt ? tt.total : 0, work: tt ? tt.work : 0, norm: HR.weekNorm(w, hpw, D.isHoliday), rejectNote: ts && ts.rejectNote || '' }; }) }); })
      .sort((p1, p2) => (p1.section || 'я').localeCompare(p2.section || 'я', 'ru') || p1.name.localeCompare(p2.name, 'ru'));
    const cur = rows.map(r => r.weeks[r.weeks.length - 1]); const stat = { total: rows.length, submitted: cur.filter(w => w.status === 'submitted').length, accepted: cur.filter(w => w.status === 'accepted').length, missing: cur.filter(w => !w.status || w.status === 'draft' || w.status === 'rejected').length };
    return ok({ week, weeks, rows, stat, accept: scope.accept, all: scope.all });
  }

  // --- загрузка: факт по неделям (люди × недели, проекты × недели) ---
  if (a === 'load' && method === 'GET') {
    const to = weekArg(qs.to); const n = Math.min(26, Math.max(1, num(qs.n) || 8)); const weeks = HR.lastWeeks(to, n); const wi = new Map(weeks.map((w, i) => [w, i]));
    const see = e => HR.canPlan(user) || canSee(scope, e.id);
    const lines = laborLines(ctx, { from: weeks[0], to, includeDraft: true }).filter(l => { const e = empById(db, l.employeeId); return e && see(e); });
    const rowsMap = {}; const rowOf = e => rowsMap[e.id] || (rowsMap[e.id] = Object.assign(empOut(ctx, e, { people }), { hours: new Array(n).fill(0), status: new Array(n).fill(''), total: 0 }));
    for (const e of db.employees) if (see(e) && isActiveEmp(e)) rowOf(e);
    for (const l of lines) { const r = rowOf(empById(db, l.employeeId)); const i = wi.get(l.week); r.hours[i] = HR.round1(r.hours[i] + l.hours); r.total = HR.round1(r.total + l.hours); }
    for (const r of Object.values(rowsMap)) { r.norm = weeks.map(w => HR.weekNorm(w, r.hoursPerWeek, D.isHoliday)); for (const [i, w] of weeks.entries()) { const ts = findTs(db, r.id, w); r.status[i] = ts ? ts.status : ''; } }
    const names = projectNames(db); const projMap = {}; const secMap = {};
    for (const l of lines) { const k = l.pid || l.kind; const p = projMap[k] || (projMap[k] = { pid: l.pid, kind: l.kind, name: l.pid ? names[l.pid] || l.pid : HR.KINDS[l.kind], hours: new Array(n).fill(0), total: 0, people: new Set() }); const i = wi.get(l.week); p.hours[i] = HR.round1(p.hours[i] + l.hours); p.total = HR.round1(p.total + l.hours); p.people.add(l.employeeId);
      if (l.kind === 'project') { const s = secMap[l.section || '—'] || (secMap[l.section || '—'] = { section: l.section || '—', hours: new Array(n).fill(0), total: 0 }); s.hours[i] = HR.round1(s.hours[i] + l.hours); s.total = HR.round1(s.total + l.hours); } }
    const rows = Object.values(rowsMap).sort((p1, p2) => (p1.section || 'я').localeCompare(p2.section || 'я', 'ru') || p1.name.localeCompare(p2.name, 'ru'));
    return ok({ weeks, rows, projects: Object.values(projMap).map(p => Object.assign(p, { people: p.people.size })).sort((p1, p2) => p2.total - p1.total), sections: Object.values(secMap).sort((p1, p2) => p2.total - p1.total), totals: weeks.map((w, i) => HR.round1(rows.reduce((s, r) => s + r.hours[i], 0))), all: HR.canPlan(user) || scope.all });
  }

  // --- план загрузки по срокам пунктов pm (разделы × недели, ёмкость команд) ---
  if (a === 'plan' && method === 'GET') {
    if (!HR.canPlan(user)) return err(403, 'План загрузки видят руководители, ГИП, ПМ и руководители разделов');
    const n = Math.min(26, Math.max(2, num(qs.n) || 9)); const weeks = HR.weeksRange(curWeek, HR.addWeeks(curWeek, n - 1));
    const activePids = new Set(db.pmProjects.filter(p => ACTIVE(p.status)).map(p => p.id));
    const plan = HR.planLoad({ items: db.pmItems, activePids, teams: db.hrTeams, people, employees: db.employees, userEmp: userEmpMap(db), vacations: db.vacations, weeks, isHoliday: D.isHoliday });
    const names = projectNames(db); const empName = id => { const e = empById(db, id); return e ? short(e.name) : id; };
    for (const s of plan.sections) { s.people = s.people.map(id => ({ id, name: empName(id) })); s.items = s.items.map(it => Object.assign(it, { project: names[it.pid] || it.pid, assignee: it.assigneeId ? ctx.userName(it.assigneeId) : '' })); }
    plan.byEmployee = plan.byEmployee.map(x => Object.assign(x, { name: empName(x.employeeId) }));
    return ok(Object.assign(plan, { projects: activePids.size, holidays: weeks.map(w => HR.weekHolidays(w, D.isHoliday).slice(0, 5).filter(Boolean).length) }));
  }

  // --- деньги: ставка часа и себестоимость (только owner/partner/accountant) ---
  if (a === 'rates' && method === 'GET') {
    if (!money) return err(403, 'Ставки и оклады видят владелец, партнёр и бухгалтер');
    const ym = ymArg(qs.ym);
    const rows = db.employees.filter(e => isActiveEmp(e) || db.hrTimesheets.some(ts => ts.employeeId === e.id && HR.weekMonth(ts.week) === ym)).map(e => Object.assign(empOut(ctx, e, { people }), HR.rateCalc(e, people[e.id], ym, db.settings, D), { bonus13: !!(people[e.id] || {}).bonus13 }));
    const hours = {}; for (const l of laborLines(ctx, { from: HR.addWeeks(HR.weekOfMonthStart(ym), -1), to: HR.addWeeks(HR.isoWeek(ym + '-28'), 1), includeDraft: true })) if (l.ym === ym) hours[l.employeeId] = HR.round1((hours[l.employeeId] || 0) + l.hours);
    for (const r of rows) { r.hoursMonth = hours[r.id] || 0; r.costMonth = Math.round(r.hoursMonth * r.rate); }
    rows.sort((p1, p2) => (p1.section || 'я').localeCompare(p2.section || 'я', 'ru') || p1.name.localeCompare(p2.name, 'ru'));
    const total = rows.reduce((s, r) => ({ salary: s.salary + r.salary, employerCost: s.employerCost + r.employerCost, monthCost: s.monthCost + r.monthCost, normHours: s.normHours + r.normHours, hoursMonth: HR.round1(s.hoursMonth + r.hoursMonth), costMonth: s.costMonth + r.costMonth }), { salary: 0, employerCost: 0, monthCost: 0, normHours: 0, hoursMonth: 0, costMonth: 0 });
    return ok({ ym, rows, total, tax: D.settingsOf(db.settings).tax, canEdit: money });
  }
  if (a === 'cost' && method === 'GET') {
    if (!money) return err(403, 'Себестоимость видят владелец, партнёр и бухгалтер');
    const to = weekArg(qs.to); const from = qs.from === 'all' ? '' : (HR.isWeek(qs.from) ? qs.from : HR.addWeeks(to, -11)); const includeDraft = qs.draft === '1';
    if (b) { const p = db.pmProjects.find(x => x.id === b); if (!p) return err(404, 'Проект не найден'); const r = laborCost(ctx, b, { from, to, includeDraft }); return ok(Object.assign(r, { project: { id: p.id, name: p.name, track: p.track || '', status: p.status || '', budget: p.budget || null }, from, to, includeDraft })); }
    const lines = laborLines(ctx, { from, to, includeDraft }); const names = projectNames(db); const byP = {};
    for (const l of lines) { const k = l.pid || l.kind; const r = byP[k] || (byP[k] = { pid: l.pid, kind: l.kind, name: l.pid ? names[l.pid] || l.pid : HR.KINDS[l.kind], hours: 0, cost: 0, bySection: {}, people: new Set() }); r.hours = HR.round1(r.hours + l.hours); r.cost += l.cost; r.people.add(l.employeeId); const s = r.bySection[l.section || '—'] || (r.bySection[l.section || '—'] = { hours: 0, cost: 0 }); s.hours = HR.round1(s.hours + l.hours); s.cost += l.cost; }
    const rows = Object.values(byP).map(r => Object.assign(r, { people: r.people.size, track: r.pid ? (db.pmProjects.find(p => p.id === r.pid) || {}).track || '' : '' })).sort((p1, p2) => p2.cost - p1.cost);
    return ok({ from, to, includeDraft, rows, total: { hours: HR.round1(rows.reduce((s, r) => s + r.hours, 0)), cost: rows.reduce((s, r) => s + r.cost, 0) }, weeks: from ? HR.weeksRange(from, to).length : 0 });
  }

  // --- импорт команд (JSON от modules/hr/tools/import_fot.js: состав команд из листа «ФОТ») ---
  if (a === 'import' && method === 'POST') {
    if (!manager) return err(403, 'Импорт доступен владельцу и партнёру');
    const list = Array.isArray(body.teams) ? body.teams : []; if (!list.length) return err(400, 'В файле нет команд');
    const replace = body.mode === 'replace'; const rep = { created: [], updated: [], members: 0, positions: 0, skipped: [] };
    for (const src of list) {
      const name = String(src.name || '').trim(); if (!name) continue; const section = HR.SECTIONS.includes(src.section) ? src.section : '';
      const members = [];
      for (const m of Array.isArray(src.members) ? src.members : []) {
        const id = typeof m === 'string' ? m : String(m.employeeId || ''); const e = empById(db, id); if (!e) { rep.skipped.push(`${name}: ${id || (m && m.name) || '?'}`); continue; } members.push(id);
        const pos = typeof m === 'object' && m.position ? String(m.position).slice(0, 80) : ''; if (pos) { let p = db.hrPeople.find(x => x.id === id); if (!p) { p = { id, createdAt: now() }; db.hrPeople.push(p); } if (replace || !p.position) { p.position = pos; p.updatedAt = now(); p.updatedBy = user.id; rep.positions++; } }
      }
      let tm = db.hrTeams.find(x => norm(x.name) === norm(name));
      if (tm) { tm.members = replace ? [...new Set(members)] : [...new Set([...(tm.members || []), ...members])]; if (section && (replace || !tm.section)) tm.section = section; tm.updatedAt = now(); tm.updatedBy = user.id; rep.updated.push(name); }
      else { tm = { id: store.id(), name, section, leadUserId: '', members: [...new Set(members)], note: String(src.note || '').slice(0, 500), createdAt: now(), createdBy: user.id, source: 'import' }; db.hrTeams.push(tm); rep.created.push(name); }
      rep.members += members.length;
    }
    store.save(); audit('import', 'hrTeams', '', { created: rep.created.length, updated: rep.updated.length, members: rep.members }); return ok(rep);
  }
  return err(404, 'Нет такого действия');
}

module.exports = { id: 'hr', api: 'hr', collections: ['hrTeams', 'hrTimesheets', 'hrPeople'], handle, laborCost, laborHours, domain: HR };
