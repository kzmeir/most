/* Общая предметная логика для локального сервера (Node) и веб-версии (браузер).
   Модель повторяет таблицу «Бюджет МОСТ»: операции (дебет/кредит по счетам, проект, категория),
   реестры договоров, подрядчиков, АВР, КП; справочники счетов и категорий. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MostDomain = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const COLLECTIONS = ['users', 'docs', 'invoices', 'projects', 'contracts', 'subcontracts', 'proposals', 'ops', 'accounts', 'categories', 'payroll', 'employees', 'vacations', 'obligations', 'cash', 'audit'];
  const PM_READ = ['docs', 'invoices', 'projects', 'contracts', 'subcontracts'];
  const ROLES = ['owner', 'partner', 'accountant', 'pm'];
  const ADMIN = ['owner', 'partner', 'accountant'];
  const ROLE_LABEL = { owner: 'Владелец', partner: 'Партнёр', accountant: 'Бухгалтер', pm: 'Проджект-менеджер' };
  const KINDS = { expense: 'Расход', income: 'Доход', transfer: 'Перевод между своими счетами', tax: 'Налоги', payroll: 'Зарплата', owner: 'Вывод учредителям' };
  const DEFAULT_SETTINGS = { companies: ['MOST Project', 'MOST Architects'], vatRate: 0.16, payrollTax: 0.45, usdRate: 525, defaultAccounts: { 'MOST Project': 'PROJECT осн', 'MOST Architects': 'MOST' } };

  function can(role, collection, action) {
    if (!ROLES.includes(role)) return false;
    if (collection === 'users') return role === 'owner';
    if (collection === 'settings') return action === 'read' ? ADMIN.includes(role) : role === 'owner';
    if (ADMIN.includes(role)) return true;
    return PM_READ.includes(collection) && action === 'read';
  }
  const isAdmin = r => ADMIN.includes(r);
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.max(0, Math.floor((new Date(b) - new Date(a)) / 864e5));

  // ---- справочники ----
  function catKind(categories, name) {
    if (!name) return 'untagged';
    const c = categories.find(x => x.id === name); return c ? (c.kind || 'expense') : 'expense';
  }
  function accountCompany(accounts, id) { const a = accounts.find(x => x.id === id); return a ? (a.company || '') : ''; }

  // ---- операции ----
  // q: {year, ym, from, to, account, company, project, category, kind, text, untagged}
  function filterOps(ops, q, accounts, categories) {
    q = q || {}; const t = (q.text || '').toLowerCase();
    return ops.filter(o => {
      const d = o.date || '';
      if (q.ym && d.slice(0, 7) !== q.ym) return false;
      if (q.year && d.slice(0, 4) !== String(q.year)) return false;
      if (q.from && d < q.from) return false;
      if (q.to && d > q.to) return false;
      if (q.account && o.account !== q.account) return false;
      if (q.company && accountCompany(accounts, o.account) !== q.company) return false;
      if (q.project && o.project !== q.project) return false;
      if (q.category && o.category !== q.category) return false;
      if (q.kind && catKind(categories, o.category) !== q.kind) return false;
      if (q.untagged && o.category && o.project && !o.auto && !o.autoProject) return false;
      if (q.counterparty && (o.counterparty || '') !== q.counterparty) return false;
      if (q.min && Math.max(num(o.debit), num(o.credit)) < num(q.min)) return false;
      if (q.max && Math.max(num(o.debit), num(o.credit)) > num(q.max)) return false;
      if (q.source && (o.source || '') !== q.source) return false;
      if (t && !((o.counterparty || '') + ' ' + (o.purpose || '') + ' ' + (o.comment || '') + ' ' + (o.project || '') + ' ' + (o.opNo || '')).toLowerCase().includes(t)) return false;
      return true;
    });
  }
  // итоги: доход = кредит не-переводов, расход = дебет не-переводов
  function totals(ops, categories) {
    const r = { income: 0, expense: 0, transfersIn: 0, transfersOut: 0, n: ops.length, untagged: 0, auto: 0 };
    for (const o of ops) {
      const k = catKind(categories, o.category);
      if (k === 'transfer') { r.transfersIn += num(o.credit); r.transfersOut += num(o.debit); continue; }
      r.income += num(o.credit); r.expense += num(o.debit);
      if (k === 'untagged' || !o.project) r.untagged++;
      if (o.auto || o.autoProject) r.auto++;
    }
    r.net = r.income - r.expense; return r;
  }
  function groupSum(ops, key, categories, field) {
    const out = {};
    for (const o of ops) { if (catKind(categories, o.category) === 'transfer') continue; const k = o[key] || '—'; out[k] = (out[k] || 0) + num(o[field]); }
    return out;
  }
  function projectSummary(ops, categories) {
    const out = {};
    for (const o of ops) {
      if (catKind(categories, o.category) === 'transfer') continue;
      const p = o.project || '—'; const s = out[p] || (out[p] = { credit: 0, debit: 0, n: 0, first: '', last: '' });
      s.credit += num(o.credit); s.debit += num(o.debit); s.n++;
      if (!s.first || o.date < s.first) s.first = o.date; if (o.date > s.last) s.last = o.date;
    }
    return out;
  }
  function monthsList(ops) {
    const c = {}; for (const o of ops) { const ym = (o.date || '').slice(0, 7); if (ym) c[ym] = (c[ym] || 0) + 1; }
    return Object.keys(c).sort().reverse().map(ym => ({ ym, n: c[ym] }));
  }
  // «оплачен» по счёту к оплате → операция расхода
  function invoiceToOp(inv, settings, accounts) {
    const company = inv.company || ''; const acc = (settings.defaultAccounts || {})[company] || (accounts.find(a => a.company === company && a.active) || {}).id || 'nal';
    return { date: inv.paidAt || todayStr(), account: acc, debit: num(inv.amount), credit: 0, counterparty: inv.contractor || '', purpose: inv.purpose || '', project: inv.project || '', category: inv.category || '', comment: 'по счёту к оплате', invoiceId: inv.id, source: 'invoice' };
  }

  // ---- автоподсказки категории/проекта по истории операций ----
  const OWN = /most\s*(project|architects)|мост/i;
  const normCp = s => String(s || '').toLowerCase().replace(/[«»"'“”]|тоо|ип|ао|\s+/g, '');
  function buildHistory(ops) {
    const cat = {}, proj = {};
    for (const o of ops) {
      const k = normCp(o.counterparty); if (!k) continue;
      if (o.category && !o.auto) { (cat[k] = cat[k] || {})[o.category] = (cat[k][o.category] || 0) + 1; }
      if (o.project && !o.autoProject && o.date) { if (!proj[k] || o.date > proj[k].date) proj[k] = { date: o.date, project: o.project }; }
    }
    return { cat, proj };
  }
  const NO_PROJECT = ['Перевод между счетами', 'Депозит', 'Банк', 'Налоги', 'НДС', 'Расходы налоги по зп', 'Расходы по зп'];
  function suggest(o, hist, todayIso) {
    const out = {}; const p = (o.purpose || '').toLowerCase(), cp = o.counterparty || '';
    let cat = '';
    if (OWN.test(cp) && p.includes('депозит')) cat = 'Депозит';
    else if (OWN.test(cp)) cat = 'Перевод между счетами';
    else if (/угд|государственная корпорация|правительство для граждан|департамент государственных доходов/i.test(cp)) cat = (p.includes('ндс') && !p.includes('в т.ч')) ? 'НДС' : (/опв|ипн|осмс|восмс|социальн/.test(p) ? 'Расходы налоги по зп' : 'Налоги');
    else if (/kaspi bank/i.test(cp) && /комисси|вознагражд/.test(p)) cat = 'Банк';
    else if (/заработн|зарплат|аванс сотрудник/.test(p)) cat = 'Расходы по зп';
    else if (num(o.credit) && /авторск/.test(p)) cat = 'Авторский надзор';
    else if (num(o.credit) && /эскиз/.test(p)) cat = 'Эскизный проект';
    else if (num(o.credit) && /рабоч|\bрп\b|проектн/.test(p)) cat = 'Рабочий проект';
    else { const h = hist.cat[normCp(cp)]; if (h) { const top = Object.entries(h).sort((a, b) => b[1] - a[1])[0]; const total = Object.values(h).reduce((a, b) => a + b, 0); if (top[1] >= 2 && top[1] / total >= 0.6) cat = top[0]; } }
    if (cat && !o.category) { out.category = cat; out.auto = true; }
    const effCat = o.category || cat;
    if (!o.project) {
      if (effCat === 'Перевод между счетами' || effCat === 'Депозит') out.project = effCat;
      else if (!NO_PROJECT.includes(effCat)) { const h = hist.proj[normCp(cp)]; const limit = new Date(todayIso || todayStr()); limit.setMonth(limit.getMonth() - 15); if (h && h.date >= limit.toISOString().slice(0, 10)) { out.project = h.project; out.autoProject = true; } }
    }
    return out;
  }

  // ---- отпуска: календарные дни без праздников РК, накопление 24 дня/год ----
  const HOLIDAYS_FIXED = ['01-01', '01-02', '01-07', '03-08', '03-21', '03-22', '03-23', '05-01', '05-07', '05-09', '07-06', '08-30', '10-25', '12-16'];
  const HOLIDAYS_EXTRA = { 2024: ['06-16'], 2025: ['06-06'], 2026: ['05-27'], 2027: ['05-16'] }; // Курбан-айт
  function isHoliday(iso) { const y = iso.slice(0, 4), md = iso.slice(5); return HOLIDAYS_FIXED.includes(md) || (HOLIDAYS_EXTRA[y] || []).includes(md); }
  function vacationDays(from, to) {
    if (!from || !to || to < from) return 0; let n = 0; const d = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z');
    while (d <= end) { const iso = d.toISOString().slice(0, 10); if (!isHoliday(iso)) n++; d.setUTCDate(d.getUTCDate() + 1); }
    return n;
  }
  function vacationBalance(emp, vacations, asOf) {
    asOf = asOf || todayStr(); const perYear = num(emp.vacationDays) || 24;
    const start = emp.hired || emp.vacationStart || (asOf.slice(0, 4) + '-01-01'); const end = emp.resigned && emp.resigned < asOf ? emp.resigned : asOf;
    const months = Math.max(0, (new Date(end) - new Date(start)) / (365.25 * 864e5) * 12);
    const accrued = Math.round(months * perYear / 12 * 10) / 10 + num(emp.vacationCarry);
    const mine = vacations.filter(v => v.employeeId === emp.id && (v.type || 'vacation') === 'vacation' && v.from <= asOf);
    const used = mine.reduce((s, v) => s + (num(v.days) || vacationDays(v.from, v.to)), 0);
    return { accrued: Math.round(accrued * 10) / 10, used, balance: Math.round((accrued - used) * 10) / 10, since: start };
  }
  const VACATION_TYPES = { vacation: 'Отпуск', sick: 'Больничный', unpaid: 'За свой счёт', trip: 'Командировка' };

  // ---- очередь к бухгалтеру / АВР ----
  function decorateDoc(d, nameOf) {
    const end = d.status === 'done' && d.doneAt ? d.doneAt : new Date().toISOString();
    return Object.assign({}, d, { daysWaiting: d.createdAt ? daysBetween(d.createdAt, end) : 0, requestedByName: nameOf(d.requestedBy), assignedToName: nameOf(d.assignedTo), updatedByName: nameOf(d.updatedBy) });
  }

  // ---- дашборд ----
  function dashboard(db, asOf) {
    asOf = asOf || todayStr(); const ym = asOf.slice(0, 7), year = asOf.slice(0, 4);
    const prev = (() => { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)); const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; return `${py}-${String(pm).padStart(2, '0')}`; })();
    const cats = db.categories || [], accs = db.accounts || [], settings = Object.assign({}, DEFAULT_SETTINGS, db.settings || {});
    const opsY = filterOps(db.ops, { year }, accs, cats), opsM = opsY.filter(o => o.date.slice(0, 7) === ym), opsP = filterOps(db.ops, { ym: prev }, accs, cats);
    const tY = totals(opsY, cats), tM = totals(opsM, cats), tP = totals(opsP, cats);
    const byCompany = {}; for (const o of opsY) { if (catKind(cats, o.category) === 'transfer') continue; const c = accountCompany(accs, o.account) || o.account; const s = byCompany[c] || (byCompany[c] = { income: 0, expense: 0 }); s.income += num(o.credit); s.expense += num(o.debit); }
    const byCategory = groupSum(opsY.filter(o => num(o.debit)), 'category', cats, 'debit');
    const byProjectIn = groupSum(opsY.filter(o => num(o.credit)), 'project', cats, 'credit');
    const untaggedAll = db.ops.filter(o => !o.category || !o.project || o.auto || o.autoProject).length;
    const cash = (db.cash || []).map(c => ({ id: c.id, company: c.company, balance: num(c.balance), asOf: c.asOf }));
    const pay = [...(db.payroll || [])].sort((a, b) => (b.id > a.id ? 1 : -1))[0]; const payrollNet = pay ? num(pay.project) + num(pay.architects) : 0;
    const payrollGross = Math.round(payrollNet * (1 + num(settings.payrollTax || 0.45))); const oblig = (db.obligations || []).reduce((s, o) => s + num(o.monthly), 0);
    const openInv = (db.invoices || []).filter(i => i.status === 'open'), heldInv = (db.invoices || []).filter(i => i.status === 'held');
    const queue = (db.docs || []).filter(d => d.status !== 'done').map(d => decorateDoc(d, () => ''));
    const contracts = db.contracts || []; const active = contracts.filter(c => !c.closed);
    return {
      asOf, cash, cashTotal: cash.reduce((s, c) => s + c.balance, 0),
      month: { ym, income: tM.income, expenses: tM.expense, net: tM.net, prevYm: prev, prevIncome: tP.income, prevExpenses: tP.expense, n: tM.n },
      year: { income: tY.income, expenses: tY.expense, net: tY.net, byCompany, byCategory, byProjectIn, n: tY.n },
      untagged: { year: tY.untagged, auto: tY.auto, all: untaggedAll },
      fixedLoad: { payrollNet, payrollGross, obligations: oblig, total: payrollGross + oblig, payrollMonth: pay ? pay.id : null },
      kpnDeferred: Math.max(0, Math.round(tY.net * 0.20)),
      invoices: { openCount: openInv.length, openSum: openInv.reduce((s, i) => s + num(i.amount), 0), heldCount: heldInv.length, heldSum: heldInv.reduce((s, i) => s + num(i.amount), 0) },
      queue: { count: queue.length, maxDays: queue.reduce((m, d) => Math.max(m, d.daysWaiting), 0), overdue: queue.filter(d => d.daysWaiting > 3).length, byStatus: { new: queue.filter(d => d.status === 'new').length, in_progress: queue.filter(d => d.status === 'in_progress').length } },
      contracts: { active: active.length, sum: active.reduce((s, c) => s + num(c.sum), 0), remaining: active.reduce((s, c) => s + num(c.remaining), 0), toPay: active.reduce((s, c) => s + num(c.toPay), 0) },
    };
  }

  // ---- CSV (1С / Excel): UTF-8 BOM, разделитель ; ----
  const escCsv = v => { if (v === null || v === undefined) return ''; const s = String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const toCSV = (rows, cols) => '﻿' + [cols.map(c => escCsv(c.title)).join(';'), ...rows.map(r => cols.map(c => escCsv(r[c.key])).join(';'))].join('\r\n');
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, ''); const first = text.split(/\r?\n/)[0] || '';
    const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) { const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; } else field += ch; }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return []; const header = rows[0].map(h => h.trim());
    return rows.slice(1).filter(r => r.some(x => x.trim() !== '')).map(r => { const o = {}; header.forEach((h, i) => o[h] = (r[i] || '').trim()); return o; });
  }
  const amt = s => num(String(s == null ? '' : s).replace(/\s/g, '').replace(',', '.'));
  const CSV = {
    invoices: { cols: [{ key: 'invoiceDate', title: 'Дата' }, { key: 'company', title: 'Компания' }, { key: 'contractor', title: 'Контрагент' }, { key: 'amount', title: 'Сумма' }, { key: 'purpose', title: 'Назначение' }, { key: 'project', title: 'Проект' }, { key: 'status', title: 'Статус' }],
      fromRow: r => ({ invoiceDate: r['Дата'] || todayStr(), company: r['Компания'] || '', contractor: r['Контрагент'] || '', amount: amt(r['Сумма']), purpose: r['Назначение'] || '', project: r['Проект'] || '', status: r['Статус'] || 'open' }) },
    docs: { cols: [{ key: 'createdAt', title: 'Создан' }, { key: 'type', title: 'Тип' }, { key: 'number', title: 'Номер' }, { key: 'actDate', title: 'Дата АВР' }, { key: 'client', title: 'Клиент' }, { key: 'company', title: 'Компания' }, { key: 'project', title: 'Проект' }, { key: 'amount', title: 'Сумма' }, { key: 'description', title: 'Описание' }, { key: 'status', title: 'Статус' }, { key: 'signed', title: 'Подписан' }, { key: 'paid', title: 'Оплачен' }],
      fromRow: r => ({ type: r['Тип'] || 'act', number: r['Номер'] || '', actDate: r['Дата АВР'] || '', client: r['Клиент'] || '', company: r['Компания'] || '', project: r['Проект'] || '', amount: amt(r['Сумма']), description: r['Описание'] || '', status: r['Статус'] || 'new', signed: /да|true|1/i.test(r['Подписан'] || ''), paid: /да|true|1/i.test(r['Оплачен'] || '') }) },
    ops: { cols: [{ key: 'opNo', title: '№ операции' }, { key: 'date', title: 'Дата' }, { key: 'account', title: 'Счёт' }, { key: 'debit', title: 'Дебет' }, { key: 'credit', title: 'Кредит' }, { key: 'counterparty', title: 'Контрагент' }, { key: 'purpose', title: 'Назначение' }, { key: 'project', title: 'Проект' }, { key: 'category', title: 'Категория' }, { key: 'comment', title: 'Комментарий' }],
      fromRow: r => ({ opNo: r['№ операции'] || r['№'] || '', date: r['Дата'] || todayStr(), account: r['Счёт'] || 'nal', debit: amt(r['Дебет']), credit: amt(r['Кредит']), counterparty: r['Контрагент'] || '', purpose: r['Назначение'] || '', project: r['Проект'] || '', category: r['Категория'] || '', comment: r['Комментарий'] || '' }) },
  };

  // ---- счета к оплате: импорт из файла (Excel/CSV-реестр или текст PDF-счёта) ----
  const normName = s => String(s || '').toLowerCase().replace(/[«»"'“”]/g, '').replace(/\s+/g, ' ').trim();
  const invoiceKey = i => [normName(i.company), normName(i.contractor), Math.round(num(i.amount)), normName(i.purpose).slice(0, 24)].join('|');
  const isNumLike = v => typeof v === 'number' || /^[\d\s ]+([,.]\d+)?$/.test(String(v).trim());
  const isDate = v => /^\d{4}-\d{2}-\d{2}/.test(String(v)) || /^\d{2}\.\d{2}\.\d{4}$/.test(String(v));
  const toIso = v => { const s = String(v); const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : (s.match(/^\d{4}-\d{2}-\d{2}/) || [''])[0]; };
  // наша компания по названию/тексту: «Проджект итого», «Покупатель: MOST Project ТОО», «Мост»
  function companyOf(s) {
    const t = String(s || '').toLowerCase();
    if (/project|проджект|прожект/.test(t)) return 'MOST Project';
    if (/architect|архитект|(^|[^а-яё])мост([^а-яё]|$)/.test(t)) return 'MOST Architects';
    if (/pana/.test(t)) return 'ИП PANA Design';
    return '';
  }
  const HEAD = { contractor: /контрагент|поставщик|получател|кому|наименование|организац|исполнител/i, amount: /сумма|amount|к оплате/i, purpose: /назнач|описан|за что|коммент|основани|услуг/i, project: /проект|объект/i, company: /^компания$|наша|плательщик|покупател|заказчик/i, date: /дата/i, status: /статус/i, number: /номер|^№/i };
  // rows: массив массивов (xlsx) или объектов (csv). Заголовок ищем в первых 10 строках, иначе колонки угадываем по содержимому.
  function invoicesFromRows(rows, defaults) {
    defaults = defaults || {};
    rows = (rows || []).map(r => Array.isArray(r) ? r : Object.values(r)).filter(r => r.some(c => c !== '' && c != null));
    if (!rows.length) return { items: [], mapping: null };
    let hdr = -1, map = null;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const m = {}; let hits = 0;
      rows[i].forEach((c, j) => { if (typeof c !== 'string') return; for (const [k, re] of Object.entries(HEAD)) if (re.test(c.trim()) && m[k] === undefined) { m[k] = j; hits++; break; } });
      if (hits >= 2 && m.amount !== undefined && m.contractor !== undefined) { hdr = i; map = m; break; }
    }
    const data = hdr >= 0 ? rows.slice(hdr + 1) : rows;
    if (!map) {
      const n = Math.max(...data.map(r => r.length)); const score = [];
      for (let j = 0; j < n; j++) { const vals = data.map(r => r[j]).filter(v => v !== '' && v != null); score.push({ j, num: vals.filter(v => isNumLike(v) && !isDate(v)).length, date: vals.filter(isDate).length, text: vals.filter(v => typeof v === 'string' && !isDate(v) && !isNumLike(v)).length }); }
      map = {};
      const amountCol = score.filter(s => s.num > 0).sort((a, b) => b.num - a.num)[0]; if (!amountCol) return { items: [], mapping: null }; map.amount = amountCol.j;
      const dateCol = score.filter(s => s.date > 0 && s.j !== map.amount).sort((a, b) => b.date - a.date)[0]; if (dateCol) map.date = dateCol.j;
      const texts = score.filter(s => s.text > 0 && s.j !== map.amount && s.j !== map.date).sort((a, b) => a.j - b.j);
      if (texts[0]) map.contractor = texts[0].j; if (texts[1]) map.purpose = texts[1].j; if (texts[2]) map.project = texts[2].j;
    }
    const items = []; let pending = [];
    for (const r of data) {
      const cells = r.map(c => c == null ? '' : c); const line = cells.map(String).join(' ');
      if (/итого|всего/i.test(line)) { const co = companyOf(line) || defaults.company || ''; for (const p of pending) if (!p.company) p.company = co; pending = []; continue; }
      const amount = num(String(cells[map.amount] ?? '').replace(/\s/g, '').replace(',', '.'));
      const contractor = String(map.contractor !== undefined ? cells[map.contractor] : '').trim();
      if (!amount || !contractor) continue;
      const it = { company: map.company !== undefined ? (companyOf(cells[map.company]) || String(cells[map.company] || '').trim()) : '', contractor, amount, purpose: String(map.purpose !== undefined ? cells[map.purpose] : '').trim(), project: String(map.project !== undefined ? cells[map.project] : '').trim(), number: String(map.number !== undefined ? cells[map.number] : '').trim(), invoiceDate: map.date !== undefined ? toIso(cells[map.date]) : '', status: 'open' };
      if (map.status !== undefined && /held|придерж/i.test(String(cells[map.status]))) it.status = 'held';
      items.push(it); pending.push(it);
    }
    for (const it of items) { if (!it.invoiceDate) it.invoiceDate = defaults.invoiceDate || todayStr(); if (!it.company) it.company = defaults.company || ''; }
    return { items, mapping: map };
  }
  // текст PDF-счёта (типовая форма «Счет на оплату № … от …») → поля счёта
  const RU_MONTHS = { января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6, июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12 };
  function parseInvoiceText(text) {
    const t = String(text || '').replace(/[ \t ]+/g, ' ');
    const out = { number: '', invoiceDate: '', contractor: '', company: '', amount: 0, purpose: '' };
    const money = s => num(String(s).replace(/\s/g, '').replace(',', '.'));
    let m = t.match(/Сч[её]т(?:[- ]фактура)?\s*(?:на оплату)?\s*№?\s*([\w\-\/]+)\s+от\s+(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
    if (m) { out.number = m[1]; const mo = RU_MONTHS[m[3].toLowerCase()]; if (mo) out.invoiceDate = `${m[4]}-${String(mo).padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
    else if ((m = t.match(/Сч[её]т(?:[- ]фактура)?\s*(?:на оплату)?\s*№?\s*([\w\-\/]+)\s+от\s+(\d{2})\.(\d{2})\.(\d{4})/i))) { out.number = m[1]; out.invoiceDate = `${m[4]}-${m[3]}-${m[2]}`; }
    if ((m = t.match(/Поставщик:\s*(?:БИН\s*\/?\s*ИИН\s*\d+\s*,?\s*)?([^\n,]+)/i))) out.contractor = m[1].trim();
    else if ((m = t.match(/Бенефициар:[^\n]*\n([^\n]+)/i))) out.contractor = m[1].replace(/\s*KZ\w{18}.*$/, '').trim();
    if ((m = t.match(/Покупатель:\s*([^\n]+)/i))) out.company = companyOf(m[1]);
    if ((m = t.match(/Всего к оплате:?\s*([\d\s]+[,.]\d{2})/i)) && money(m[1])) out.amount = money(m[1]);
    else if ((m = t.match(/на сумму\s*([\d\s]+[,.]\d{2})/i))) out.amount = money(m[1]);
    else if ((m = t.match(/Итого(?:\s*с\s*НДС)?:?\s*([\d\s]+[,.]\d{2})/i))) out.amount = money(m[1]);
    const names = []; const body = t.split(/№\s*(?:Код\s*)?Наименование/i)[1];
    if (body) for (const line of body.split('\n')) { if (/^\s*(Итого|Всего)/i.test(line)) break; const mm = line.match(/^\s*\d+\s+(?:\d{6,}\s+)?(.+?)\s+[\d\s,.]+\s+\S+\s+[\d\s,.]+\s+[\d\s,.]+\s*$/); if (mm) names.push(mm[1].trim()); }
    out.purpose = names.join('; ').slice(0, 200);
    if (out.number) out.purpose = `Счёт № ${out.number}${out.purpose ? ': ' + out.purpose : ''}`;
    return out;
  }

  return { COLLECTIONS, PM_READ, ROLES, ADMIN, ROLE_LABEL, KINDS, DEFAULT_SETTINGS, can, isAdmin, num, todayStr, daysBetween, catKind, accountCompany, filterOps, totals, groupSum, projectSummary, monthsList, invoiceToOp, decorateDoc, dashboard, toCSV, parseCSV, CSV, buildHistory, suggest, isHoliday, vacationDays, vacationBalance, VACATION_TYPES, invoiceKey, invoicesFromRows, parseInvoiceText, companyOf };
});
