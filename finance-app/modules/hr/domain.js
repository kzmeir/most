/* Персонал (hr): недели табеля (ISO), норма часов по праздникам РК, стоимость часа сотрудника, итоги табеля,
   план загрузки по срокам пунктов pm. Чистая логика без базы — Node (server.js) и браузер (window.MostHR).
   Деньги считаются только на сервере для ролей owner/partner/accountant; здесь лишь формулы. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MostHR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const pad = n => String(n).padStart(2, '0');

  // ---- роли ----
  const MONEY = ['owner', 'partner', 'accountant'];            // видят оклады, ставку часа, себестоимость
  const MANAGERS = ['owner', 'partner'];                       // команды, любые табели, принятие, импорт
  const VIEW_ALL = ['owner', 'partner', 'accountant', 'secretary']; // видят все табели (без денег у секретаря)
  const PLANNERS = ['owner', 'partner', 'accountant', 'secretary', 'pm', 'gip', 'lead']; // видят загрузку людей
  const canOpen = u => !!u && !!u.role;
  const isMoney = u => !!u && MONEY.includes(u.role);
  const isManager = u => !!u && MANAGERS.includes(u.role);
  const canViewAll = u => !!u && VIEW_ALL.includes(u.role);
  const canPlan = u => !!u && PLANNERS.includes(u.role);
  const isLead = u => !!u && u.role === 'lead';

  // ---- справочники ----
  const SECTIONS = ['АР', 'КЖ', 'ГП', 'ОВ', 'ВК', 'ЭЛ', 'СС', 'ГСВ', 'ТХ', 'Смета', 'Визуализация', 'ГИП', 'ПМ', 'Офис'];
  const KINDS = { project: 'Проект', office: 'Офис / без проекта', absence: 'Отпуск / больничный' };
  const STATUS = { draft: 'Черновик', submitted: 'Сдан', accepted: 'Принят', rejected: 'Возвращён' };
  const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const HOURS_PER_WEEK = 40;
  const MAX_DAY = 24;
  // роль пункта pm без раздела → раздел загрузки
  const ROLE_SECTION = { 'ГИП': 'ГИП', 'ПМ': 'ПМ', 'ГАП': 'АР', 'ГКП': 'КЖ', 'Сметчик': 'Смета', 'Визуализатор': 'Визуализация' };
  const itemSection = it => (it && (it.section || ROLE_SECTION[it.role])) || '';

  // ---- недели ISO (понедельник — первый день) ----
  const toDate = iso => new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  const toIso = d => d.toISOString().slice(0, 10);
  const today = () => toIso(new Date());
  const addDays = (iso, n) => toIso(new Date(toDate(iso).getTime() + Math.round(n) * 864e5));
  const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
  const isWeek = w => /^\d{4}-W\d{2}$/.test(String(w || ''));
  function isoWeek(iso) {
    const d = toDate(iso || today()); if (isNaN(d)) return '';
    const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); // четверг этой недели
    const y = d.getUTCFullYear(); const jan4 = new Date(Date.UTC(y, 0, 4)); const week1Mon = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 864e5);
    return `${y}-W${pad(1 + Math.floor((d - week1Mon) / (7 * 864e5)))}`;
  }
  function weekStart(week) {
    const m = /^(\d{4})-W(\d{2})$/.exec(String(week || '')); if (!m) return '';
    const jan4 = new Date(Date.UTC(Number(m[1]), 0, 4)); const week1Mon = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 864e5);
    return toIso(new Date(week1Mon.getTime() + (Number(m[2]) - 1) * 7 * 864e5));
  }
  const weekDates = week => { const s = weekStart(week); return s ? Array.from({ length: 7 }, (_, i) => addDays(s, i)) : []; };
  const addWeeks = (week, n) => isoWeek(addDays(weekStart(week), n * 7));
  const weekMonth = week => addDays(weekStart(week), 3).slice(0, 7); // месяц недели — по четвергу (правило ISO)
  const weekNo = week => Number(String(week).slice(6)) || 0;
  const weekLabel = week => { const d = weekDates(week); return d.length ? `${d[0].slice(8)}.${d[0].slice(5, 7)} – ${d[6].slice(8)}.${d[6].slice(5, 7)}.${d[6].slice(0, 4)}` : String(week || ''); };
  const weekTitle = week => `Неделя ${weekNo(week)} · ${weekLabel(week)}`;
  function weeksRange(from, to) { const out = []; let w = from, n = 0; while (w && w <= to && n++ < 520) { out.push(w); w = addWeeks(w, 1); } return out; }
  const lastWeeks = (to, n) => weeksRange(addWeeks(to, -(Math.max(1, n) - 1)), to);
  const weekOfMonthStart = ym => isoWeek(ym + '-01');

  // ---- норма часов (рабочие дни пн–пт без праздников РК; isHoliday — из lib/domain.js) ----
  function normHours(ym, hoursPerWeek, isHoliday) {
    const [y, m] = String(ym).split('-').map(Number); if (!y || !m) return { days: 0, hours: 0 };
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate(); let n = 0;
    for (let d = 1; d <= days; d++) { const iso = `${ym}-${pad(d)}`; const dow = toDate(iso).getUTCDay(); if (dow === 0 || dow === 6) continue; if (isHoliday && isHoliday(iso)) continue; n++; }
    return { days: n, hours: Math.round(n * (num(hoursPerWeek) || HOURS_PER_WEEK) / 5 * 10) / 10 };
  }
  function weekNorm(week, hoursPerWeek, isHoliday) {
    const dates = weekDates(week); let n = 0; for (const iso of dates.slice(0, 5)) if (!(isHoliday && isHoliday(iso))) n++;
    return Math.round(n * (num(hoursPerWeek) || HOURS_PER_WEEK) / 5 * 10) / 10;
  }
  const weekHolidays = (week, isHoliday) => weekDates(week).map(iso => !!(isHoliday && isHoliday(iso)));

  // ---- стоимость часа: затраты работодателя в месяц / норма часов месяца ----
  // emp — db.employees (salary на руки), extra — hrPeople (hoursPerWeek, bonusMonthly на руки, bonus13, rateOverride), D — lib/domain.js
  function rateCalc(emp, extra, ym, settings, D) {
    extra = extra || {}; const salary = num(emp && emp.salary);
    const tx = D.payrollTaxes(salary, settings); const bonusM = num(extra.bonusMonthly); const bonusCost = bonusM ? D.payrollTaxes(bonusM, settings).employerCost : 0;
    const bonus13 = extra.bonus13 ? Math.round(tx.employerCost / 12) : 0; const hpw = num(extra.hoursPerWeek) || HOURS_PER_WEEK;
    const nh = normHours(ym, hpw, D.isHoliday); const monthCost = tx.employerCost + bonusCost + bonus13;
    const calc = nh.hours ? Math.round(monthCost / nh.hours) : 0; const override = num(extra.rateOverride);
    return { employeeId: emp ? emp.id : '', ym, salary, gross: tx.gross, employer: tx.employer, employerCost: tx.employerCost, bonusMonthly: bonusM, bonusCost, bonus13, monthCost, hoursPerWeek: hpw, normDays: nh.days, normHours: nh.hours, rateCalc: calc, rate: override || calc, override };
  }

  // ---- табель ----
  const lineTotal = l => (l && l.hours || []).reduce((s, h) => s + num(h), 0);
  const round1 = v => Math.round(num(v) * 100) / 100;
  function tsTotals(ts) {
    const days = [0, 0, 0, 0, 0, 0, 0]; const byKind = { project: 0, office: 0, absence: 0 };
    for (const l of (ts && ts.lines) || []) { (l.hours || []).forEach((h, i) => { if (i < 7) days[i] += num(h); }); byKind[l.kind || 'project'] = (byKind[l.kind || 'project'] || 0) + lineTotal(l); }
    const total = days.reduce((a, b) => a + b, 0);
    return { days: days.map(round1), total: round1(total), project: round1(byKind.project), office: round1(byKind.office), absence: round1(byKind.absence), work: round1(byKind.project + byKind.office) };
  }
  // строки из формы → чистые строки (7 чисел 0..24 с шагом 0,25; пустые строки отбрасываются)
  function cleanLines(lines) {
    const out = [];
    for (const l of Array.isArray(lines) ? lines : []) {
      if (!l || typeof l !== 'object') continue;
      const kind = KINDS[l.kind] ? l.kind : (l.pid ? 'project' : 'office'); const pid = kind === 'project' ? String(l.pid || '').trim() : '';
      const hours = Array.from({ length: 7 }, (_, i) => Math.max(0, Math.round(num(Array.isArray(l.hours) ? l.hours[i] : 0) * 4) / 4)); // шаг 0,25; больше 24 в день отсекает validateLines
      const section = SECTIONS.includes(l.section) ? l.section : ''; const note = String(l.note || '').slice(0, 300);
      if (!hours.some(h => h > 0) && !pid && !note) continue;
      out.push({ kind, pid, section: kind === 'absence' ? '' : section, hours, note });
    }
    return out;
  }
  function validateLines(lines) {
    const days = [0, 0, 0, 0, 0, 0, 0];
    for (const l of lines) { if (l.kind === 'project' && !l.pid) return 'В строке с проектом не выбран проект'; if (l.hours.some(h => h > MAX_DAY)) return `Больше ${MAX_DAY} часов в одной ячейке — опечатка?`; l.hours.forEach((h, i) => { days[i] += h; }); }
    const over = days.findIndex(d => d > MAX_DAY); if (over >= 0) return `${DAYS[over]}: больше ${MAX_DAY} часов в день`;
    return '';
  }
  const fmtH = h => { const v = round1(h); return v ? String(v).replace('.', ',') : ''; };

  // ---- план загрузки по срокам пунктов pm ----
  // o: { items (pmItems открытые), activePids (Set), teams (hrTeams), people ({employeeId: hrPeople}), employees (db.employees), userEmp ({userId: employeeId}),
  //      vacations (db.vacations), weeks ([week]), isHoliday }
  // Допущение: пункт = один специалист на полную ставку в течение его нормативных недель до срока; просроченные пункты — в текущей неделе.
  function planLoad(o) {
    const weeks = o.weeks || []; if (!weeks.length) return { weeks, sections: [], items: 0 };
    const W = weeks.length; const first = weekStart(weeks[0]); const last = addDays(weekStart(weeks[W - 1]), 6);
    const idx = new Map(weeks.map((w, i) => [w, i]));
    const hpwOf = id => num(o.people && o.people[id] && o.people[id].hoursPerWeek) || HOURS_PER_WEEK;
    const active = new Set((o.employees || []).filter(e => e.status !== 'resigned').map(e => e.id));
    // раздел → сотрудники команд
    const secPeople = {}; for (const t of o.teams || []) { const s = t.section || ''; if (!s) continue; const set = secPeople[s] || (secPeople[s] = new Set()); for (const id of t.members || []) if (active.has(id)) set.add(id); }
    // отсутствия по неделям: часы, выпадающие из ёмкости
    const vacHours = (empId, week) => { let h = 0; const dates = weekDates(week).slice(0, 5); for (const v of o.vacations || []) { if (v.employeeId !== empId || (v.type || 'vacation') === 'trip') continue; for (const d of dates) if (d >= v.from && d <= (v.to || v.from) && !(o.isHoliday && o.isHoliday(d))) h += hpwOf(empId) / 5; } return h; };
    const capacity = (ids, wi) => { let c = 0; for (const id of ids) c += Math.max(0, weekNorm(weeks[wi], hpwOf(id), o.isHoliday) - vacHours(id, weeks[wi])); return round1(c); };
    const secs = {}; const secOf = s => secs[s] || (secs[s] = { section: s, plan: new Array(W).fill(0), overdue: 0, items: [], people: [...(secPeople[s] || [])] });
    const byEmp = {}; const empOf = id => byEmp[id] || (byEmp[id] = { employeeId: id, plan: new Array(W).fill(0), overdue: 0, items: 0 }); let n = 0;
    for (const it of o.items || []) {
      if (it.done || it.na || !it.due || !o.activePids.has(it.pid)) continue;
      const s = itemSection(it); if (!s) continue; // ожидания заказчика — не наша загрузка
      const wk = Math.max(0.2, num(it.weeks) || 1); const hours = wk * HOURS_PER_WEEK; const due = String(it.due).slice(0, 10);
      const start = addDays(due, -Math.ceil(wk * 7) + 1); if (start > last) continue;
      const overdue = due < first; const sec = secOf(s); n++;
      const emp = it.assigneeId && o.userEmp ? o.userEmp[it.assigneeId] : '';
      sec.items.push({ id: it.id, pid: it.pid, title: it.title, due, weeks: wk, hours, overdue, assigneeId: it.assigneeId || '', stageName: it.stageName || '' });
      if (overdue) { sec.overdue += hours; if (emp) { const e = empOf(emp); e.overdue += hours; e.items++; } continue; } // долг: срок прошёл, пункт не закрыт
      let ws = weeksRange(isoWeek(start < first ? first : start), isoWeek(due)).map(w => idx.get(w)).filter(i => i !== undefined);
      if (!ws.length) ws = [0]; const per = hours / ws.length;
      for (const i of ws) sec.plan[i] += per;
      if (emp) { const e = empOf(emp); for (const i of ws) e.plan[i] += per; e.items++; }
    }
    const sections = Object.values(secs).map(sec => { const cap = weeks.map((_, i) => capacity(sec.people, i)); const total = round1(sec.plan.reduce((a, b) => a + b, 0)); const plan = sec.plan.map(round1); return Object.assign(sec, { plan, overdue: round1(sec.overdue), capacity: cap, load: plan.map((p, i) => cap[i] ? Math.round(p / cap[i] * 100) : (p ? 999 : 0)), total, items: sec.items.sort((a, b) => a.due.localeCompare(b.due)) }); })
      .sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section));
    return { weeks, sections, items: n, byEmployee: Object.values(byEmp).map(e => Object.assign(e, { plan: e.plan.map(round1), overdue: round1(e.overdue), capacity: weeks.map((_, i) => capacity([e.employeeId], i)) })) };
  }

  return { MONEY, MANAGERS, VIEW_ALL, PLANNERS, canOpen, isMoney, isManager, canViewAll, canPlan, isLead, SECTIONS, KINDS, STATUS, DAYS, HOURS_PER_WEEK, MAX_DAY, ROLE_SECTION, itemSection,
    today, addDays, daysBetween, isWeek, isoWeek, weekStart, weekDates, addWeeks, weekMonth, weekNo, weekLabel, weekTitle, weeksRange, lastWeeks, weekOfMonthStart, normHours, weekNorm, weekHolidays, rateCalc, lineTotal, tsTotals, cleanLines, validateLines, fmtH, round1, planLoad, num };
});
