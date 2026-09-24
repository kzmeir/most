'use strict';
// Модуль «Аналитика» (панель директора): /api/analytics/*. Поток H. Контракт модулей — docs/ARCHITECTURE.md, задание — modules/analytics/README.md.
// Только чтение: данные берутся через lib/domain.js (ctx.D) и функции модулей (ctx.modules.pm / crm / hr), в чужие коллекции ничего не пишем.
// Сайт «Финансы», только owner и partner.
const AN = require('./domain');

const num = v => Number(v) || 0;
const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
// модуль подключён и включён (в режиме DEV_USER включены все)
const moduleOn = (ctx, id) => !!(ctx.modules && ctx.modules[id]) && (!!process.env.DEV_USER || ((ctx.db.settings || {}).enabledModules || []).includes(id));
const erpPort = () => Number(process.env.ERP_PORT) || (Number(process.env.PORT) || 3000) + 1;

// ---- деньги ----
function moneyBlock(ctx, t, opts) {
  const { db, D } = ctx; const cats = db.categories || []; const kind = c => D.catKind(cats, c);
  // остатки: опорный остаток счёта + операции после него; счета без опорного остатка — «неизвестно»
  const bal = D.accountBalances(db.ops || [], db.cash || [], db.accounts || [], t);
  const byCo = new Map(); for (const a of bal) { const k = a.company || 'Без компании'; const r = byCo.get(k) || { company: k, balance: 0, accounts: 0, unknown: 0 }; r.accounts++; if (a.balance == null) r.unknown++; else r.balance += a.balance; byCo.set(k, r); }
  const balances = { byCompany: [...byCo.values()].sort((a, b) => b.balance - a.balance), total: bal.reduce((s, a) => s + (a.balance == null ? 0 : a.balance), 0), unknown: bal.filter(a => a.balance == null).length, accounts: bal.length };
  // дебиторка
  const rec = D.receivables(db, t); const lim = AN.LIMITS.receivableDays;
  const overActs = rec.acts.filter(a => a.age > lim); const byClient = new Map();
  for (const a of overActs) { const r = byClient.get(a.client || '—') || { client: a.client || '—', sum: 0, n: 0, maxAge: 0 }; r.sum += num(a.amount); r.n++; r.maxAge = Math.max(r.maxAge, a.age); byClient.set(r.client, r); }
  const receivables = { total: num(rec.totals.acts), n: rec.totals.actsN, buckets: rec.buckets.map(b => ({ label: b.label, n: b.n, sum: b.sum })), over30: overActs.reduce((s, a) => s + num(a.amount), 0), over90: rec.acts.filter(a => a.age > 90).reduce((s, a) => s + num(a.amount), 0),
    topOver: [...byClient.values()].sort((a, b) => b.sum - a.sum).slice(0, 8), top: rec.byClient.slice(0, 8).map(c => ({ client: c.client, sum: c.sum, n: c.n })) };
  // прогноз на 13 недель (~3 месяца) от известного остатка + ожидаемые поступления по графикам платежей crm
  let expected = [];
  if (moduleOn(ctx, 'crm') && ctx.modules.crm.expectedPayments) { try { expected = ctx.modules.crm.expectedPayments(ctx, t, addDays(t, 13 * 7)); } catch (e) { expected = []; } }
  const fc = D.cashForecast(db, { today: t, startBalance: balances.total, weeks: 13, expected });
  const gapW = fc.weeks.find(w => w.balance < 0);
  const forecast = { start: balances.total, min: fc.min, end: fc.end, inflow: fc.inflow, outflow: fc.outflow, fromSchedules: expected.reduce((s, e) => s + num(e.amount), 0), weeks: fc.weeks.map(w => ({ from: w.from, to: w.to, inflow: w.inflow, outflow: w.outflow, balance: w.balance })), gap: gapW ? { from: gapW.from, to: gapW.to, balance: gapW.balance } : null };
  // выручка и расходы по месяцам за 12 мес. (без переводов между счетами)
  const ym0 = addMonths(t.slice(0, 7), -11); const months = Array.from({ length: 12 }, (_, i) => ({ ym: addMonths(ym0, i), income: 0, expense: 0 }));
  const mi = new Map(months.map((m, i) => [m.ym, i]));
  for (const o of db.ops || []) { const i = mi.get(String(o.date || '').slice(0, 7)); if (i === undefined || kind(o.category) === 'transfer') continue; months[i].income += num(o.credit); months[i].expense += num(o.debit); }
  // налоги и платежи в бюджет на 30 дней
  let taxes = []; try { taxes = (D.taxCalendar(t, 2, db.settings) || []).filter(x => x.date >= t && x.date <= addDays(t, 30)).map(x => ({ date: x.date, title: x.title, kind: x.kind || '', note: x.note || '' })); } catch (e) { taxes = []; }
  return { balances, receivables, forecast, months, taxes, margin: marginBlock(ctx, opts) };
}
// маржа по финансовым проектам: контракт без НДС − субподряд − ФОТ-оценка (часы табелей × ставка, если включён hr)
function marginBlock(ctx, opts) {
  const { db } = ctx; const hr = moduleOn(ctx, 'hr') && ctx.modules.hr.laborCost ? ctx.modules.hr : null;
  const pmByFin = new Map(); for (const p of db.pmProjects || []) if (p.projectId) (pmByFin.get(p.projectId) || pmByFin.set(p.projectId, []).get(p.projectId)).push(p);
  const rows = [];
  for (const p of db.projects || []) {
    if (p.status === 'archive' || p.status === 'Завершён') continue; const contract = num(p.contractNoVat); if (!contract) continue;
    const subs = (db.subcontracts || []).filter(s => s.project === p.id || s.project === p.name);
    const subSum = subs.reduce((s, x) => s + num(x.sum), 0), subPaid = subs.reduce((s, x) => s + num(x.paid), 0);
    let labor = null, hours = null; if (hr) { labor = 0; hours = 0; for (const pp of pmByFin.get(p.id) || []) { try { const c = hr.laborCost(ctx, pp.id, { includeDraft: false }); labor += num(c.cost); hours += num(c.hours); } catch (e) { /* нет данных */ } } }
    const margin = contract - subSum - (labor || 0);
    rows.push({ id: p.id, name: p.name || p.id, client: p.client || '', contract, subs: subSum, subPaid, labor, hours, margin, pct: Math.round(margin / contract * 1000) / 10, pm: (pmByFin.get(p.id) || []).map(x => ({ id: x.id, name: x.name, track: x.track })) });
  }
  rows.sort((a, b) => b.contract - a.contract);
  return { rows: rows.slice(0, (opts && opts.marginTop) || 25), total: { contract: rows.reduce((s, r) => s + r.contract, 0), subs: rows.reduce((s, r) => s + r.subs, 0), labor: hr ? rows.reduce((s, r) => s + (r.labor || 0), 0) : null }, withLabor: !!hr, projects: rows.length };
}

// ---- проекты: портфель, Пульс, горящие, блокеры, загрузка ГИП/ПМ ----
function projectsBlock(ctx, t) {
  const { db } = ctx; const PM = ctx.modules.pm.domain; const un = id => (ctx.userName ? ctx.userName(id) : '') || '';
  const items = db.pmItems || [], blockers = db.pmBlockers || [];
  const all = db.pmProjects || [];
  const track = p => PM.normalizeTrack ? PM.normalizeTrack(p.track) : p.track; // старые концепции — среди ЭП
  const portfolio = {}; for (const p of all) { const tr = track(p); const r = portfolio[tr] || (portfolio[tr] = { track: tr, label: PM.TRACK_SHORT[tr] || tr, total: 0, byStatus: {} }); r.total++; r.byStatus[p.status || 'В работе'] = (r.byStatus[p.status || 'В работе'] || 0) + 1; }
  const active = all.filter(p => PM.ACTIVE(p.status));
  const list = active.map(p => {
    const s = PM.summary(p, items, blockers, t); let h = null; try { h = PM.health(p, items, t); } catch (e) { h = null; }
    const end = p.forecast || (h && h.forecast && h.forecast.realistic) || '';
    return { id: p.id, name: p.name, track: track(p), trackLabel: PM.TRACK_SHORT[track(p)] || track(p), client: p.client || '', status: p.status, risk: p.risk || '', start: p.start || '', due: p.due || '', forecast: end, gip: un(p.gipId), pm: un(p.pmId), gipId: p.gipId || '', pmId: p.pmId || '',
      pct: s.pct, stageName: s.stageName, overdue: s.overdue || 0, zone: h ? h.zone : '', consumption: h ? h.consumption : 0, progress: h ? h.progress : (s.pct || 0) / 100, promised: h ? h.promised : '',
      late: !!p.due && p.due < t, soon: !!p.due && p.due >= t && daysBetween(t, p.due) <= AN.LIMITS.dueSoonDays, forecastLate: !!(p.due && end && end > p.due) };
  });
  const rank = z => AN.ZONE_ORDER.indexOf(z) < 0 ? 9 : AN.ZONE_ORDER.indexOf(z);
  list.sort((a, b) => rank(a.zone) - rank(b.zone) || (b.progress || 0) - (a.progress || 0) || String(a.due || '9').localeCompare(String(b.due || '9')));
  const zones = {}; for (const x of list) if (x.zone) zones[x.zone] = (zones[x.zone] || 0) + 1;
  const byId = new Map(active.map(p => [p.id, p]));
  const old = blockers.filter(b => b.status !== 'closed' && byId.has(b.pid)).map(b => ({ pid: b.pid, project: byId.get(b.pid).name, what: b.what, holder: b.holder || '', days: PM.blockerAge(b, t) })).filter(b => b.days > AN.LIMITS.blockerDays).sort((a, b) => b.days - a.days);
  const burning = list.filter(x => x.late || x.soon || x.forecastLate || x.zone === 'red' || x.zone === 'black' || x.overdue > 0).slice(0, 15);
  // загрузка ГИП/ПМ: активные проекты и открытые просроченные пункты их ролей
  const load = new Map(); const bump = (id, role, p) => { if (!id) return; const r = load.get(id) || { id, name: un(id) || '—', gip: 0, pm: 0, red: 0, projects: [] }; r[role]++; if (p.zone === 'red' || p.zone === 'black') r.red++; r.projects.push(p.name); load.set(id, r); };
  for (const x of list) { bump(x.gipId, 'gip', x); bump(x.pmId, 'pm', x); }
  return { portfolio: Object.values(portfolio), active: list.length, zones, list, burning, blockers: old, load: [...load.values()].sort((a, b) => (b.gip + b.pm) - (a.gip + a.pm)), overdueItems: list.reduce((s, x) => s + x.overdue, 0) };
}

// ---- продажи: воронка crm ----
function salesBlock(ctx, t) {
  const { db } = ctx; const C = ctx.modules.crm.domain; const leads = db.crmLeads || [];
  const vat = (ctx.D.settingsOf ? ctx.D.settingsOf(db.settings) : db.settings || {}).vatRate;
  const f = C.funnel(leads, { vatRate: vat }); const fy = C.funnel(leads, { vatRate: vat, from: t.slice(0, 4) + '-01-01' });
  const inWork = leads.filter(l => ['КП отправлено', 'Торг'].includes(l.status));
  const lastTouch = l => { const h = (l.history || []).map(x => String(x.at || '').slice(0, 10)).sort().pop(); return [l.kpAt, h, String(l.updatedAt || '').slice(0, 10)].filter(Boolean).sort().pop() || String(l.createdAt || '').slice(0, 10); };
  const noAnswer = leads.filter(l => l.status === 'КП отправлено').map(l => ({ id: l.id, client: l.client || '', object: l.object || '', sum: C.leadCalc(l, vat).noVat, days: daysBetween(lastTouch(l), t), next: l.nextDate || '' }))
    .filter(x => x.days > AN.LIMITS.kpNoAnswerDays && !(x.next && x.next > t)).sort((a, b) => b.sum - a.sum);
  return { funnel: { byStatus: f.byStatus, open: f.open, openSum: f.openSum, won: f.won, wonSum: f.wonSum, lost: f.lost, conversion: f.conversion, conversionAll: f.conversionAll, reasons: f.reasons }, year: { won: fy.won, wonSum: fy.wonSum, conversion: fy.conversion, total: fy.total },
    kp: { n: inWork.length, sum: inWork.reduce((s, l) => s + C.leadCalc(l, vat).noVat, 0) }, rates: f.rates, noAnswer };
}

// ---- люди: план загрузки разделов против ёмкости (hr.planLoad), фактические часы и себестоимость часа (hr.laborCost) ----
function peopleBlock(ctx, t) {
  const { db, D } = ctx; const HR = ctx.modules.hr.domain; const PM = ctx.modules.pm && ctx.modules.pm.domain;
  const cur = HR.isoWeek(t); const weeks = HR.weeksRange(cur, HR.addWeeks(cur, 5));
  const activePids = new Set((db.pmProjects || []).filter(p => !PM || PM.ACTIVE(p.status)).map(p => p.id));
  const userEmp = {}; for (const p of db.hrPeople || []) if (p.userId) userEmp[p.userId] = p.id; for (const u of db.users || []) if (u.employeeId) userEmp[u.id] = u.employeeId;
  const people = Object.fromEntries((db.hrPeople || []).map(p => [p.id, p]));
  const plan = HR.planLoad({ items: db.pmItems || [], activePids, teams: db.hrTeams || [], people, employees: db.employees || [], userEmp, vacations: db.vacations || [], weeks, isHoliday: D.isHoliday });
  const sections = plan.sections.map(s => { const p = s.plan.reduce((a, b) => a + b, 0), c = s.capacity.reduce((a, b) => a + b, 0); return { section: s.section, plan: Math.round(p), capacity: Math.round(c), overdue: Math.round(s.overdue), people: s.people.length, load: c ? Math.round(p / c * 100) / 100 : null, weekly: s.plan.map((v, i) => ({ plan: Math.round(v), capacity: Math.round(s.capacity[i]) })) }; });
  // факт за 12 недель (сданные и принятые табели)
  let fact = null; if (ctx.modules.hr.laborCost) { try { const c = ctx.modules.hr.laborCost(ctx, '', { from: HR.addWeeks(cur, -12), to: HR.addWeeks(cur, -1) }); const pn = new Map((db.pmProjects || []).map(p => [p.id, p.name]));
    const byProject = new Map(); for (const ts of db.hrTimesheets || []) { if (ts.status === 'draft' || ts.week < HR.addWeeks(cur, -12) || ts.week > HR.addWeeks(cur, -1)) continue; for (const l of ts.lines || []) { const h = HR.lineTotal ? HR.lineTotal(l) : num(l.hours); if (!h) continue; const k = l.pid || '—'; byProject.set(k, (byProject.get(k) || 0) + h); } }
    fact = { weeks: 12, hours: c.hours, cost: Math.round(num(c.cost)), perHour: c.hours ? Math.round(num(c.cost) / c.hours) : 0, bySection: Object.entries(c.bySection).map(([k, v]) => ({ section: k, hours: v.hours, cost: Math.round(v.cost) })).sort((a, b) => b.hours - a.hours),
      byProject: [...byProject.entries()].map(([pid, h]) => ({ pid, name: pn.get(pid) || (pid === '—' ? 'Без проекта / внутренние' : pid), hours: Math.round(h) })).sort((a, b) => b.hours - a.hours).slice(0, 12), byStatus: c.byStatus };
  } catch (e) { fact = null; } }
  return { weeks: weeks.length, weekList: weeks, sections, fact, employees: (db.employees || []).filter(e => e.status !== 'resigned').length };
}

// ---- сборка панели. Каждый блок — отдельно: ошибка одного не роняет панель ----
function overview(ctx, opts) {
  const t = (opts && opts.today) || ctx.today(); const out = { today: t, erpPort: erpPort(), modules: { pm: moduleOn(ctx, 'pm'), crm: moduleOn(ctx, 'crm'), hr: moduleOn(ctx, 'hr') }, errors: {} };
  const safe = (k, f) => { try { out[k] = f(); } catch (e) { out[k] = null; out.errors[k] = e.message; console.error(`[analytics] ${k}:`, e.message); } };
  safe('money', () => moneyBlock(ctx, t, opts));
  safe('projects', () => out.modules.pm ? projectsBlock(ctx, t) : null);
  safe('sales', () => out.modules.crm ? salesBlock(ctx, t) : null);
  safe('people', () => out.modules.hr ? peopleBlock(ctx, t) : null);
  out.signals = AN.signals(out);
  return out;
}

function handle(ctx) {
  const { parts, method, user, ok, err } = ctx; const [, a] = parts;
  if (!user) return err(401, 'Не авторизован');
  if (!AN.canOpen(user)) return err(403, 'Панель директора — только для руководителей');
  if (ctx.site && ctx.site === 'erp') return err(404, 'Панель директора — на сайте «Финансы»');
  if (a === 'overview' && method === 'GET') return ok(overview(ctx, {}));
  return err(404, 'Нет такого раздела аналитики');
}

module.exports = { id: 'analytics', api: 'analytics', site: 'fin', collections: [], handle, overview, domain: AN };
