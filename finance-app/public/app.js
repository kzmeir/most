/* MOST Финансы — фронтенд (vanilla JS). Модель повторяет таблицу «Бюджет МОСТ». */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const state = { user: null, status: null, people: [], settings: null, accounts: [], categories: [], projects: [] };
const ADMIN = ['owner', 'partner', 'accountant'];
const isAdmin = () => state.user && ADMIN.includes(state.user.role);
const isOwner = () => state.user && state.user.role === 'owner';
const COMPANIES = () => (state.settings && state.settings.companies) || ['MOST Project', 'MOST Architects'];
const OUR = () => [...new Set([...COMPANIES(), 'ИП PANA Design', 'ИП MOST Design'])];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0)) + ' ₸';
const money0 = n => Number(n) ? money(n) : '—';
const fdate = d => { if (!d) return ''; const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(d); };
const today = () => new Date().toISOString().slice(0, 10);
const ym = d => String(d || '').slice(0, 7);
const cut = (s, n = 70) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const mname = m => { const p = String(m).split('-'); return p[1] ? `${MONTHS[Number(p[1]) - 1]} ${p[0]}` : m; };
const YESNO = [['false', 'Нет'], ['true', 'Да']];
const KIND_LABEL = { expense: 'Расход', income: 'Доход', transfer: 'Перевод', tax: 'Налоги', payroll: 'Зарплата', owner: 'Учредители' };

async function api(path, opts = {}) {
  const r = window.__apiFetch ? await window.__apiFetch(path, opts) : await fetch('/api' + path, { method: opts.method || 'GET', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data && data.error) || ('Ошибка ' + r.status));
  return data;
}
const qsOf = o => Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && v !== null && v !== false).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, ms); }
function modal(title, bodyHtml, onSubmit) {
  $('#modal-title').textContent = title; $('#modal-body').innerHTML = bodyHtml; $('#modal').hidden = false;
  const form = $('#modal-body form');
  if (form && onSubmit) form.onsubmit = async e => { e.preventDefault(); const btn = form.querySelector('button[type=submit]'); btn.disabled = true; try { await onSubmit(Object.fromEntries(new FormData(form).entries())); closeModal(); } catch (er) { const el = form.querySelector('.error') || form.appendChild(Object.assign(document.createElement('div'), { className: 'error' })); el.textContent = er.message; } finally { btn.disabled = false; } };
  setTimeout(() => { const f = $('#modal-body input,#modal-body select,#modal-body textarea'); f && f.focus(); }, 30);
}
function closeModal() { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; $('#modal .modal-card').style.maxWidth = ''; }
$('#modal-close').onclick = closeModal; $('#modal').addEventListener('click', e => { if (e.target === $('#modal')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ---- form builder ----
function field(f, v) {
  const val = v ?? f.value ?? '';
  const req = f.required ? ' required' : '';
  let inp;
  if (f.type === 'select') inp = `<select name="${f.name}"${req}>${(f.options || []).map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}"${String(ov) === String(val) ? ' selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
  else if (f.type === 'textarea') inp = `<textarea name="${f.name}" rows="3"${req}>${esc(val)}</textarea>`;
  else inp = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}"${req}${f.step ? ` step="${f.step}"` : ''}${f.min !== undefined ? ` min="${f.min}"` : ''}${f.list ? ` list="${f.list}"` : ''}>`;
  return `<div class="field"><label>${esc(f.label)}</label>${inp}</div>`;
}
function formHtml(fields, values = {}, submitLabel = 'Сохранить') {
  const rows = []; let i = 0;
  while (i < fields.length) { const f = fields[i]; if (f.half && fields[i + 1] && fields[i + 1].half) { rows.push(`<div class="form-row">${field(f, values[f.name])}${field(fields[i + 1], values[fields[i + 1].name])}</div>`); i += 2; } else { rows.push(field(f, values[f.name])); i++; } }
  return `<form>${rows.join('')}<div class="error"></div><button class="btn primary block" type="submit">${esc(submitLabel)}</button></form>`;
}
const numify = (o, keys) => { keys.forEach(k => { if (k in o) o[k] = Number(String(o[k]).replace(/\s/g, '').replace(',', '.')) || 0; }); return o; };
const boolify = (o, keys) => { keys.forEach(k => { if (k in o) o[k] = o[k] === 'true' || o[k] === true; }); return o; };
const yn = v => v ? '<span class="chip ok">да</span>' : '<span class="chip neutral">нет</span>';
const projectOptions = () => [['', '—'], ...state.projects.map(p => [p.id, p.id === p.name ? p.id : `${p.id} — ${p.name}`])];
const categoryOptions = () => [['', '—'], ...state.categories.map(c => [c.id, c.id === c.name ? c.id : `${c.id} — ${c.name}`])];
const accountOptions = () => state.accounts.filter(a => a.active !== false).map(a => [a.id, `${a.id}${a.company ? ' · ' + a.company : ''}`]);
const accCompany = id => { const a = state.accounts.find(x => x.id === id); return a ? (a.company || '') : ''; };
const catKind = id => { const c = state.categories.find(x => x.id === id); return c ? (c.kind || 'expense') : (id ? 'expense' : 'untagged'); };

// ---- boot ----
async function boot() {
  try { state.status = await api('/status'); } catch (e) { $('#app').innerHTML = `<div class="boot">Сервер недоступен: ${esc(e.message)}</div>`; return; }
  if (state.status.needsSetup) return renderSetup();
  try { state.user = (await api('/me')).user; } catch (e) { return state.status.web ? renderNoAccess(e.message) : renderLogin(); }
  await afterLogin();
}
async function loadRefs() {
  try { state.people = await api('/people'); } catch { state.people = []; }
  try { state.projects = await api('/projects'); } catch { state.projects = []; }
  if (isAdmin()) {
    try { state.settings = await api('/settings'); } catch { }
    try { state.accounts = await api('/accounts'); } catch { state.accounts = []; }
    try { state.categories = await api('/categories'); } catch { state.categories = []; }
  }
}
async function afterLogin() { await loadRefs(); renderApp(); }
function renderSetup() {
  $('#app').innerHTML = `<div class="auth"><div class="auth-card"><div class="brand"><div class="logo"><svg viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" fill="#000"/><path d="M7 27V9h4.6l6.4 9.2L24.4 9H29v18h-4.2V16.2L18 25.6l-6.8-9.4V27z" fill="#ff4d23"/></svg></div><b>most<small>финансы</small></b></div><h1>Первый запуск</h1><p class="sub">Создайте аккаунт владельца. Данные хранятся только на этом компьютере.</p>${formHtml([{ name: 'name', label: 'Ваше имя', required: true }, { name: 'login', label: 'Логин', required: true }, { name: 'password', label: 'Пароль (мин. 6 символов)', type: 'password', required: true }], {}, 'Создать и войти')}</div></div>`;
  $('#app form').onsubmit = async e => { e.preventDefault(); try { const r = await api('/setup', { method: 'POST', body: Object.fromEntries(new FormData(e.target).entries()) }); state.user = r.user; state.status.needsSetup = false; await afterLogin(); if (!state.status.hasData && state.status.seed.available) location.hash = '#/settings'; } catch (er) { $('#app .error').textContent = er.message; } };
}
function renderNoAccess(msg) {
  $('#app').innerHTML = `<div class="auth"><div class="auth-card"><div class="brand"><div class="logo"><svg viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" fill="#000"/><path d="M7 27V9h4.6l6.4 9.2L24.4 9H29v18h-4.2V16.2L18 25.6l-6.8-9.4V27z" fill="#ff4d23"/></svg></div><b>most<small>финансы</small></b></div><h1>Нет доступа</h1><p class="sub">${esc(msg || 'Откройте страницу под рабочим аккаунтом claude.ai.')}</p><p class="faint">Доступ выдаёт владелец через меню «Поделиться» на этой странице.</p></div></div>`;
}
function renderLogin() {
  $('#app').innerHTML = `<div class="auth"><div class="auth-card"><div class="brand"><div class="logo"><svg viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" fill="#000"/><path d="M7 27V9h4.6l6.4 9.2L24.4 9H29v18h-4.2V16.2L18 25.6l-6.8-9.4V27z" fill="#ff4d23"/></svg></div><b>most<small>финансы</small></b></div>${formHtml([{ name: 'login', label: 'Логин', required: true }, { name: 'password', label: 'Пароль', type: 'password', required: true }], {}, 'Войти')}</div></div>`;
  $('#app form').onsubmit = async e => { e.preventDefault(); try { const r = await api('/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target).entries()) }); state.user = r.user; await afterLogin(); } catch (er) { $('#app .error').textContent = er.message; } };
}

// ---- app shell ----
const NAV = [
  { id: 'dashboard', label: 'Дашборд', icon: '▦', admin: true },
  { id: 'ops', label: 'Операции', icon: '⇅', admin: true },
  { id: 'docs', label: 'Акты и счета клиентам', icon: '📋' },
  { id: 'invoices', label: 'Счета к оплате', icon: '🧾' },
  { id: 'projects', label: 'Проекты', icon: '◈' },
  { id: 'contracts', label: 'Договоры', icon: '📄' },
  { id: 'subcontracts', label: 'Подрядчики', icon: '🛠' },
  { id: 'proposals', label: 'Коммерческие предложения', icon: '✉', admin: true },
  { id: 'payroll', label: 'ЗП / ФОТ', icon: '👥', admin: true },
  { id: 'obligations', label: 'Обязательные платежи', icon: '🔁', admin: true },
  { id: 'settings', label: 'Настройки', icon: '⚙', admin: true },
];
function renderApp() {
  const nav = NAV.filter(n => !n.admin || isAdmin());
  $('#app').innerHTML = `<div class="shell"><aside class="side" id="side"><div class="brand"><div class="logo"><svg viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" fill="#000"/><path d="M7 27V9h4.6l6.4 9.2L24.4 9H29v18h-4.2V16.2L18 25.6l-6.8-9.4V27z" fill="#ff4d23"/></svg></div><b>most<small>финансы</small></b></div><nav class="nav" id="nav">${nav.map(n => `<a href="#/${n.id}" data-id="${n.id}"><span>${n.icon}</span>${esc(n.label)}<span class="badge" id="badge-${n.id}" hidden></span></a>`).join('')}</nav><div class="me"><b>${esc(state.user.name)}</b><span class="muted">${esc(state.user.roleLabel || state.user.role)}</span>${state.status.web ? '' : '<br><button class="btn sm" id="logout" style="margin-top:8px">Выйти</button>'}</div></aside><div><div class="topbar"><button class="icon-btn" id="burger">☰</button><b>most · финансы</b></div><main class="main" id="main"></main></div></div>`;
  if ($('#logout')) $('#logout').onclick = async () => { await api('/logout', { method: 'POST' }); state.user = null; location.hash = ''; renderLogin(); };
  $('#burger').onclick = () => $('#side').classList.toggle('open');
  $('#nav').addEventListener('click', () => $('#side').classList.remove('open'));
  if (!location.hash || !nav.some(n => location.hash.startsWith('#/' + n.id))) location.hash = '#/' + nav[0].id;
  route();
  refreshBadge();
}
async function refreshBadge() { try { const d = await api('/docs'); const n = d.filter(x => x.status !== 'done').length; const b = $('#badge-docs'); if (b) { b.textContent = n; b.hidden = !n; } } catch { } }
window.addEventListener('hashchange', route);
async function route() {
  if (!state.user) return;
  const id = (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.id === id));
  const main = $('#main'); main.innerHTML = '<div class="boot">Загрузка…</div>';
  try { await (SECTIONS[id] || SECTIONS.docs)(main); } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
const params = () => new URLSearchParams((location.hash.split('?')[1]) || '');
const SECTIONS = {};
const head = (title, sub, btnHtml = '') => `<div class="head"><div class="grow"><h1>${esc(title)}</h1>${sub ? `<p class="sub" style="margin:0">${sub}</p>` : ''}</div>${btnHtml}</div>`;
const tbl = (cols, rows, foot) => `<div class="tbl"><table><thead><tr>${cols.map(c => `<th${c.cls ? ` class="${c.cls}"` : ''}>${esc(c.t)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table></div>`;
const empty = t => `<div class="empty">${esc(t)}</div>`;
const chip = (s, map) => { const m = map[s] || ['neutral', s]; return `<span class="chip ${m[0]}">${esc(m[1])}</span>`; };
const sel = (id, opts, cur, first) => `<select id="${id}">${first ? `<option value="">${esc(first)}</option>` : ''}${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
const INV_ST = { open: ['warn', 'К оплате'], held: ['neutral', 'Придержан'], paid: ['ok', 'Оплачен'] };
const DOC_ST = { new: ['warn', 'Новый'], in_progress: ['accent', 'В работе'], done: ['ok', 'Выставлен'] };
const DOC_TYPE = { act: 'АВР', invoice_out: 'Счёт клиенту', other: 'Другое' };
const bind = (root) => root.querySelectorAll('[data-act]').forEach(el => el.onclick = e => { e.stopPropagation(); ACT[el.dataset.act](el.dataset); });
const ACT = {};
const actions = (col, id, extra = '') => isAdmin() ? `<div class="actions">${extra}<button class="btn sm" data-act="edit" data-id="${esc(id)}">✎</button><button class="btn sm danger" data-act="del" data-col="${col}" data-id="${esc(id)}">✕</button></div>` : '';

// ---- dashboard ----
SECTIONS.dashboard = async main => {
  const d = await api('/dashboard');
  const m = d.month;
  const bars = (obj, n = 8) => { const rows = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n); const mx = rows[0] ? rows[0][1] : 1; return rows.length ? rows.map(([k, v]) => `<div class="kv" style="margin-bottom:8px"><span>${esc(k)}</span><b class="num">${money(v)}</b><div class="bar" style="grid-column:1/-1"><i style="width:${Math.round(v / mx * 100)}%"></i></div></div>`).join('') : '<span class="muted">Нет данных</span>'; };
  main.innerHTML = head('Дашборд', `На ${fdate(d.asOf)} · ${mname(m.ym)} · операций за год ${d.year.n}`) + `
  <div class="grid g4">
    <div class="card"><div class="label">На счетах (ввод вручную)</div><div class="val num">${money(d.cashTotal)}</div><div class="foot">${d.cash.map(c => `${esc(c.company)}: ${money(c.balance)} (${fdate(c.asOf)})`).join(' · ') || 'остатки не заведены'}</div></div>
    <div class="card ${m.net < 0 ? 'crit' : 'ok'}"><div class="label">${esc(mname(m.ym))}: остаток <a href="#/ops?ym=${m.ym}">→</a></div><div class="val num">${money(m.net)}</div><div class="foot">пришло ${money(m.income)} · ушло ${money(m.expenses)} · пред. месяц: +${money(m.prevIncome)} / −${money(m.prevExpenses)}</div></div>
    <div class="card"><div class="label">Год: доход</div><div class="val num">${money(d.year.income)}</div><div class="foot">${Object.entries(d.year.byCompany).filter(([, v]) => v.income > 0).map(([k, v]) => `${esc(k)}: ${money(v.income)}`).join(' · ') || '—'}</div></div>
    <div class="card"><div class="label">Год: расход</div><div class="val num">${money(d.year.expenses)}</div><div class="foot">чистыми ${money(d.year.net)} · без переводов между счетами</div></div>
    <div class="card ${d.untagged.all ? 'crit' : 'ok'}"><div class="label">Не разнесено / автоподсказки <a href="#/ops?year=${d.asOf.slice(0, 4)}&untagged=1">→</a></div><div class="val num">${d.untagged.all}</div><div class="foot">операций без категории или проекта, либо с автоподсказкой — проверьте и подтвердите</div></div>
    <div class="card"><div class="label">Постоянная нагрузка / мес</div><div class="val num">${money(d.fixedLoad.total)}</div><div class="foot">ФОТ с налогами ${money(d.fixedLoad.payrollGross)} + обязательные ${money(d.fixedLoad.obligations)}</div></div>
    <div class="card ${d.invoices.openSum ? 'crit' : ''}"><div class="label">Счета к оплате <a href="#/invoices">→</a></div><div class="val num">${money(d.invoices.openSum)}</div><div class="foot">${d.invoices.openCount} открытых · придержано ${money(d.invoices.heldSum)} (${d.invoices.heldCount})</div></div>
    <div class="card ${d.queue.overdue ? 'crit' : ''}"><div class="label">Очередь к бухгалтеру <a href="#/docs">→</a></div><div class="val num">${d.queue.count}</div><div class="foot">${d.queue.overdue ? `${d.queue.overdue} висят > 3 дней · ` : ''}новых ${d.queue.byStatus.new}, в работе ${d.queue.byStatus.in_progress}</div></div>
    <div class="card"><div class="label">Договоры в работе <a href="#/contracts">→</a></div><div class="val num">${money(d.contracts.sum)}</div><div class="foot">${d.contracts.active} договоров · остаток к получению ${money(d.contracts.remaining)}</div></div>
    <div class="card"><div class="label">Отложенный КПН (оценка)</div><div class="val num">${money(d.kpnDeferred)}</div><div class="foot">20% от (доход − расход) за год</div></div>
  </div>
  <div class="grid g2" style="margin-top:14px"><div><h2 style="margin-top:0">Расходы за год по категориям</h2><div class="card">${bars(d.year.byCategory, 10)}</div></div><div><h2 style="margin-top:0">Доход за год по проектам</h2><div class="card">${bars(d.year.byProjectIn, 10)}</div></div></div>`;
};

// ---- ops: операции ----
const OPS_SORT = { date: o => o.date || '', account: o => o.account || '', counterparty: o => (o.counterparty || '').toLowerCase(), purpose: o => (o.purpose || '').toLowerCase(), project: o => o.project || '', category: o => o.category || '', debit: o => Number(o.debit) || 0, credit: o => Number(o.credit) || 0 };
SECTIONS.ops = async main => {
  const u = params();
  const g = k => u.get(k) || '';
  const hasRange = g('from') || g('to');
  const q = { year: g('year') || (g('ym') || hasRange ? '' : today().slice(0, 4)), ym: g('ym'), from: g('from'), to: g('to'), account: g('account'), company: g('company'), category: g('category'), project: g('project'), kind: g('kind'), source: g('source'), counterparty: g('counterparty'), min: g('min'), max: g('max'), text: g('text'), untagged: g('untagged') === '1' };
  const sort = g('sort') || 'date', dir = g('dir') || (sort === 'date' ? 'desc' : 'asc');
  const [months, res] = await Promise.all([api('/ops/months'), api('/ops?' + qsOf(q))]);
  const list = res.items.slice(), t = res.totals;
  const key = OPS_SORT[sort] || OPS_SORT.date; list.sort((a, b) => { const x = key(a), y = key(b); const c = x < y ? -1 : x > y ? 1 : 0; return dir === 'asc' ? c : -c; });
  const years = [...new Set(months.map(x => x.ym.slice(0, 4)))].sort().reverse();
  const yearMonths = months.filter(x => !q.year || x.ym.startsWith(q.year)).map(x => [x.ym, `${mname(x.ym)} (${x.n})`]);
  const active = Object.entries(q).filter(([k, v]) => v && !['year', 'ym'].includes(k)).length;
  const th = (id, label, cls = '') => `<th class="sortable ${cls}${sort === id ? ' sorted' : ''}" data-sort="${id}">${esc(label)}${sort === id ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</th>`;
  main.innerHTML = head('Операции', `${res.total} операций${res.total > list.length ? `, показаны первые ${list.length}` : ''} · доход <b class="num">${money(t.income)}</b> · расход <b class="num">${money(t.expense)}</b> · остаток <b class="num">${money(t.net)}</b>${t.transfersIn || t.transfersOut ? ` · переводы между счетами ${money(t.transfersIn)} / ${money(t.transfersOut)}` : ''}`, `<button class="btn" data-act="stmt">⇪ Загрузить выписку (PDF)</button> <button class="btn primary" data-act="opAdd">+ Операция</button>`) +
    `<div class="filters">${sel('f-year', years, q.year, 'Все годы')}${sel('f-ym', yearMonths, q.ym, 'Все месяцы')}<label class="fl">с <input type="date" id="f-from" value="${esc(q.from)}"></label><label class="fl">по <input type="date" id="f-to" value="${esc(q.to)}"></label>${sel('f-co', COMPANIES(), q.company, 'Все компании')}${sel('f-acc', accountOptions(), q.account, 'Все счета')}</div>` +
    `<div class="filters">${sel('f-cat', categoryOptions().slice(1), q.category, 'Все категории')}${sel('f-proj', projectOptions().slice(1), q.project, 'Все проекты')}${sel('f-kind', Object.entries(KIND_LABEL), q.kind, 'Все виды')}${sel('f-src', [['budget', 'Из таблицы бюджета'], ['statement', 'Из выписки'], ['manual', 'Введены вручную'], ['invoice', 'По счетам к оплате'], ['1c', 'Из 1С']], q.source, 'Любой источник')}<input id="f-min" type="number" placeholder="Сумма от" value="${esc(q.min)}" style="width:120px"><input id="f-max" type="number" placeholder="до" value="${esc(q.max)}" style="width:110px"><input id="f-text" placeholder="Поиск: контрагент, назначение" value="${esc(q.text)}" style="min-width:220px"><label class="chip ${q.untagged ? 'warn' : 'neutral'}" style="cursor:pointer"><input type="checkbox" id="f-untagged"${q.untagged ? ' checked' : ''} style="width:auto;margin-right:4px">не разнесено / авто (${t.untagged + t.auto})</label>${q.counterparty ? `<span class="chip accent">контрагент: ${esc(q.counterparty)} <button class="icon-btn" data-act="cpClear" style="padding:0 4px">✕</button></span>` : ''}${active ? '<button class="btn sm" data-act="reset">Сбросить фильтры</button>' : ''}</div>` +
    (list.length ? tbl([], [], '').replace('<thead><tr></tr></thead>', `<thead><tr>${th('date', 'Дата')}${th('account', 'Счёт')}${th('counterparty', 'Контрагент')}${th('purpose', 'Назначение')}${th('project', 'Проект')}${th('category', 'Категория')}${th('debit', 'Дебет', 'amt')}${th('credit', 'Кредит', 'amt')}<th></th></tr></thead>`).replace('<tbody></tbody>', `<tbody>${list.map(o => `<tr data-id="${esc(o.id)}" class="${catKind(o.category) === 'transfer' ? 'row-transfer' : ''}${(!o.category || !o.project) ? ' row-untagged' : ''}"><td class="nowrap">${fdate(o.date)}${o.source === 'statement' ? '<div class="faint">выписка</div>' : ''}</td><td class="nowrap"><span title="${esc(accCompany(o.account))}">${esc(o.account)}</span></td><td><a href="#/ops?${qsOf(Object.assign({}, q, { counterparty: o.counterparty, untagged: q.untagged ? '1' : '' }))}" class="cp-link" title="Показать все операции контрагента"><b>${esc(cut(o.counterparty, 40))}</b></a></td><td class="muted" title="${esc(o.purpose)}">${esc(cut(o.purpose, 60))}${o.comment ? `<div class="faint">${esc(cut(o.comment, 60))}</div>` : ''}</td><td>${isAdmin() ? `<button class="cell-edit${o.autoProject ? ' auto' : ''}${o.project ? '' : ' none'}" data-act="cell" data-id="${esc(o.id)}" data-field="project" title="${o.autoProject ? 'Автоподсказка — нажмите, чтобы подтвердить или изменить' : 'Изменить проект'}">${esc(o.project || '—')}${o.autoProject ? ' <i>авто</i>' : ''}</button>` : esc(o.project || '—')}</td><td>${isAdmin() ? `<button class="cell-edit${o.auto ? ' auto' : ''}${o.category ? '' : ' none'}" data-act="cell" data-id="${esc(o.id)}" data-field="category" title="${o.auto ? 'Автоподсказка — нажмите, чтобы подтвердить или изменить' : 'Изменить категорию'}">${esc(o.category || '—')}${o.auto ? ' <i>авто</i>' : ''}</button>` : esc(o.category || '—')}</td><td class="amt num">${o.debit ? money(o.debit) : ''}</td><td class="amt num ok-text">${o.credit ? money(o.credit) : ''}</td><td>${actions('ops', o.id, (o.auto || o.autoProject) ? `<button class="btn sm primary" data-act="confirm" data-id="${esc(o.id)}" title="Подтвердить автоподсказку">✓</button>` : '')}</td></tr>`).join('')}</tbody>`).replace('<tfoot></tfoot>', `<tfoot><tr><td colspan="6">Итого (${list.length})</td><td class="amt num">${money(list.reduce((s, o) => s + Number(o.debit || 0), 0))}</td><td class="amt num">${money(list.reduce((s, o) => s + Number(o.credit || 0), 0))}</td><td></td></tr></tfoot>`) : empty('Операций по этому фильтру нет'));
  const nav = (extra = {}) => { const ymv = $('#f-ym').value; location.hash = '#/ops?' + qsOf(Object.assign({ year: ymv ? '' : $('#f-year').value, ym: ymv, from: $('#f-from').value, to: $('#f-to').value, account: $('#f-acc').value, company: $('#f-co').value, category: $('#f-cat').value, project: $('#f-proj').value, kind: $('#f-kind').value, source: $('#f-src').value, min: $('#f-min').value, max: $('#f-max').value, text: $('#f-text').value, counterparty: q.counterparty, untagged: $('#f-untagged').checked ? '1' : '', sort: sort === 'date' && dir === 'desc' ? '' : sort, dir: sort === 'date' && dir === 'desc' ? '' : dir }, extra)); };
  ['#f-ym', '#f-from', '#f-to', '#f-acc', '#f-co', '#f-cat', '#f-proj', '#f-kind', '#f-src', '#f-untagged'].forEach(s => $(s).onchange = () => nav());
  $('#f-year').onchange = () => { $('#f-ym').value = ''; nav(); };
  ['#f-text', '#f-min', '#f-max'].forEach(s => $(s).onkeydown = e => { if (e.key === 'Enter') nav(); });
  main.querySelectorAll('th.sortable').forEach(h => h.onclick = () => { const id = h.dataset.sort; nav({ sort: id, dir: sort === id && dir === 'asc' ? 'desc' : sort === id ? 'asc' : (id === 'date' || id === 'debit' || id === 'credit' ? 'desc' : 'asc') }); });
  ACT.reset = () => { location.hash = '#/ops?year=' + today().slice(0, 4); };
  ACT.cpClear = () => { q.counterparty = ''; nav(); };
  const fields = [{ name: 'date', label: 'Дата', type: 'date', value: today(), half: true }, { name: 'account', label: 'Счёт', type: 'select', options: accountOptions(), half: true }, { name: 'debit', label: 'Дебет (ушло), ₸', type: 'number', step: '0.01', half: true }, { name: 'credit', label: 'Кредит (пришло), ₸', type: 'number', step: '0.01', half: true }, { name: 'counterparty', label: 'Контрагент', required: true }, { name: 'purpose', label: 'Назначение платежа' }, { name: 'project', label: 'Проект', type: 'select', options: projectOptions(), half: true }, { name: 'category', label: 'Категория', type: 'select', options: categoryOptions(), half: true }, { name: 'comment', label: 'Комментарий' }];
  ACT.opAdd = () => modal('Новая операция', formHtml(fields), async v => { await api('/ops', { method: 'POST', body: numify(v, ['debit', 'credit']) }); toast('Операция добавлена'); route(); });
  ACT.edit = ({ id }) => { const o = list.find(x => x.id === id); modal('Операция', formHtml(fields, o), async v => { await api('/ops/' + id, { method: 'PUT', body: numify(v, ['debit', 'credit']) }); toast('Сохранено'); route(); }); };
  ACT.confirm = async ({ id }) => { const o = list.find(x => x.id === id); await api('/ops/' + id, { method: 'PUT', body: { category: o.category, project: o.project } }); toast('Подтверждено'); route(); };
  ACT.cell = ({ id, field }) => {
    const btn = main.querySelector(`tr[data-id="${CSS.escape(id)}"] [data-field="${field}"]`); if (!btn) return;
    const o = list.find(x => x.id === id); const s = document.createElement('select');
    s.innerHTML = (field === 'project' ? projectOptions() : categoryOptions()).map(([v, l]) => `<option value="${esc(v)}"${v === (o[field] || '') ? ' selected' : ''}>${esc(l)}</option>`).join('');
    s.style.minWidth = '160px'; btn.replaceWith(s); s.focus();
    let done = false;
    s.onchange = async () => { done = true; const body = {}; body[field] = s.value; const r = await api('/ops/' + id, { method: 'PUT', body }); Object.assign(o, r); toast('Сохранено'); route(); };
    s.onblur = () => { if (!done) route(); };
  };
  ACT.stmt = () => importStatement();
  bind(main);
};

// ---- импорт банковской выписки (PDF) ----
async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  const base = window.__PDFJS_BASE || '/vendor/';
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = base + 'pdf.min.js'; s.onload = res; s.onerror = () => rej(new Error('Не удалось загрузить модуль чтения PDF. Нужен доступ в интернет.')); document.head.appendChild(s); });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
  return window.pdfjsLib;
}
function importStatement() {
  modal('Загрузить выписку из банка', `<div class="field"><label>PDF-выписка Kaspi Business</label><input type="file" id="stmt-file" accept="application/pdf,.pdf"></div><p class="faint" style="margin-top:0">В Kaspi Business: Счёт → Выписка → Скачать PDF за нужный период. Уже загруженные операции (по дате, сумме и номеру документа) пропускаются, категории и проекты подставляются автоматически по истории и помечаются «авто».</p><div id="stmt-out"></div>`);
  $('#modal .modal-card').style.maxWidth = '960px';
  $('#stmt-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; const out = $('#stmt-out'); out.innerHTML = '<div class="boot">Читаю PDF…</div>';
    try {
      const pdfjs = await loadPdfJs();
      const pages = await window.MostStatement.fromPdfJs(pdfjs, new Uint8Array(await f.arrayBuffer()));
      const { meta, ops } = window.MostStatement.parse(pages);
      if (!ops.length) { out.innerHTML = '<div class="notice warn">Операции в этом PDF не найдены. Поддерживается выписка Kaspi Business (таблица «Дата операции / Дебет / Кредит / Наименование…»).</div>'; return; }
      const account = window.MostStatement.guessAccount(meta, state.accounts);
      const render = async acc => {
        const from = meta.from || ops.reduce((m, o) => !m || o.date < m ? o.date : m, ''), to = meta.to || ops.reduce((m, o) => o.date > m ? o.date : m, '');
        const existing = (await api('/ops?' + qsOf({ account: acc, from, to }))).items;
        const { fresh, dup } = window.MostStatement.dedupe(ops.map(o => Object.assign({}, o, { account: acc })), existing);
        const sd = fresh.reduce((s, o) => s + o.debit, 0), sc = fresh.reduce((s, o) => s + o.credit, 0);
        const allD = ops.reduce((s, o) => s + o.debit, 0), allC = ops.reduce((s, o) => s + o.credit, 0);
        const recon = meta.opening != null && meta.closing != null ? Math.round(meta.opening + allC - allD - meta.closing) : null;
        const company = accCompany(acc); const cashRows = await api('/cash').catch(() => []); const cashRec = cashRows.find(c => c.account === acc || c.company === company);
        out.innerHTML = `<div class="grid g3" style="margin-bottom:12px"><div class="card"><div class="label">Выписка</div><div class="val" style="font-size:15px">${esc(meta.client || '—')}</div><div class="foot">${esc(meta.iban || '')} · ${fdate(from)} – ${fdate(to)}</div></div><div class="card ${fresh.length ? 'ok' : ''}"><div class="label">Новых операций</div><div class="val num">${fresh.length}</div><div class="foot">дебет ${money(sd)} · кредит ${money(sc)} · дубликатов пропущено ${dup.length}</div></div><div class="card ${recon === 0 ? 'ok' : recon != null ? 'crit' : ''}"><div class="label">Сверка с остатком</div><div class="val num">${meta.closing != null ? money(meta.closing) : '—'}</div><div class="foot">${recon == null ? 'остатки не найдены' : recon === 0 ? 'сходится' : `расхождение ${money(recon)} — проверьте после импорта`}</div></div></div>` +
          `<div class="form-row"><div class="field"><label>Счёт в системе</label>${sel('stmt-acc', accountOptions(), acc)}</div><div class="field"><label>Остаток на счёте</label><label class="chip neutral" style="padding:8px 10px"><input type="checkbox" id="stmt-cash"${meta.closing != null ? ' checked' : ' disabled'} style="width:auto;margin-right:6px">записать исходящий остаток ${meta.closing != null ? money(meta.closing) + ' на ' + fdate(to) : ''}</label></div></div>` +
          (fresh.length ? `<div class="tbl" style="max-height:340px;overflow:auto">${tbl([{ t: 'Дата' }, { t: 'Контрагент' }, { t: 'Назначение' }, { t: 'Дебет', cls: 'amt' }, { t: 'Кредит', cls: 'amt' }], fresh.slice(0, 300).map(o => `<tr><td class="nowrap">${fdate(o.date)}</td><td>${esc(cut(o.counterparty, 36))}</td><td class="muted">${esc(cut(o.purpose, 70))}</td><td class="amt num">${o.debit ? money(o.debit) : ''}</td><td class="amt num ok-text">${o.credit ? money(o.credit) : ''}</td></tr>`)).replace('class="tbl"', 'class="tbl-inner"')}</div>${fresh.length > 300 ? `<p class="faint">Показаны первые 300 из ${fresh.length}</p>` : ''}` : '<div class="notice">Все операции из этой выписки уже есть в системе.</div>') +
          `<p style="margin-bottom:0"><button class="btn primary" id="stmt-go"${fresh.length ? '' : ' disabled'}>Загрузить ${fresh.length} операций</button> <span class="faint">Категории и проекты подставятся автоматически, проверьте их в списке «не разнесено / авто».</span></p>`;
        $('#stmt-acc').onchange = () => render($('#stmt-acc').value);
        $('#stmt-go').onclick = async () => {
          $('#stmt-go').disabled = true;
          const body = { account: acc, items: fresh.map(o => ({ date: o.date, account: acc, debit: o.debit, credit: o.credit, counterparty: o.counterparty, purpose: o.purpose, opNo: o.opNo, knp: o.knp, source: 'statement' })) };
          if ($('#stmt-cash').checked && meta.closing != null) body.cash = { id: cashRec ? cashRec.id : undefined, company, account: acc, balance: meta.closing, asOf: to };
          try { const r = await api('/ops/bulk', { method: 'POST', body }); closeModal(); toast(`Загружено операций: ${r.imported}`, 5000); location.hash = '#/ops?' + qsOf({ from, to, account: acc, untagged: '1' }); route(); } catch (er) { toast(er.message, 5000); $('#stmt-go').disabled = false; }
        };
      };
      await render(account);
    } catch (er) { console.error(er); out.innerHTML = `<div class="notice warn">${esc(er.message || String(er))}</div>`; }
  };
}

// ---- docs: акты и счета клиентам (АВР) + очередь к бухгалтеру ----
SECTIONS.docs = async main => {
  const docs = await api('/docs');
  const u = params();
  const fs = u.get('status') || 'active', fp = u.get('project') || '', fy = u.get('year') || '';
  let list = docs.filter(d => fs === 'all' ? true : fs === 'active' ? d.status !== 'done' : fs === 'unpaid' ? (d.status === 'done' && !d.paid) : d.status === fs).filter(d => !fp || d.project === fp).filter(d => !fy || (d.actDate || d.createdAt || '').startsWith(fy));
  list.sort((a, b) => (a.status === 'done') - (b.status === 'done') || (b.actDate || b.createdAt || '').localeCompare(a.actDate || a.createdAt || ''));
  const accountants = state.people.filter(p => p.role === 'accountant');
  const years = [...new Set(docs.map(d => (d.actDate || d.createdAt || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const sum = list.reduce((s, d) => s + Number(d.amount || 0), 0);
  main.innerHTML = head('Акты и счета клиентам', (isAdmin() ? 'Запрос бухгалтеру → в работе → выставлен. Дальше отмечайте «подписан» и «оплачен». Старше 3 дней без движения — красным.' : 'Реестр АВР и счетов клиентам. Только просмотр.') + ` · показано ${list.length} на <b class="num">${money(sum)}</b>`, isAdmin() ? '<button class="btn primary" data-act="docAdd">+ Запрос бухгалтеру</button>' : '') +
    `<div class="filters">${sel('f-status', [['active', 'В работе у бухгалтера'], ['new', 'Новые'], ['in_progress', 'В работе'], ['done', 'Выставленные'], ['unpaid', 'Выставлены, не оплачены'], ['all', 'Все']], fs)}${sel('f-project', [...new Set(docs.map(d => d.project).filter(Boolean))].sort(), fp, 'Все проекты')}${sel('f-year', years, fy, 'Все годы')}</div>` +
    (list.length ? `<div class="q">${list.map(d => `<div class="q-card ${d.status}${d.status !== 'done' && d.daysWaiting > 3 ? ' overdue' : ''}"><div><div class="t">${esc(DOC_TYPE[d.type] || d.type)}${d.number ? ' ' + esc(d.number) : ''}${d.actDate ? ` от ${fdate(d.actDate)}` : ''} · ${esc(d.client || '—')}${d.project ? ` <span class="muted">/ ${esc(d.project)}</span>` : ''}</div><div class="m">${esc(d.description || '')}</div><div class="m">${d.amount ? `<b class="num">${money(d.amount)}</b> · ` : ''}${d.company ? esc(d.company) + ' · ' : ''}${d.requestedByName ? `запросил ${esc(d.requestedByName)} ${fdate(d.createdAt)}` : fdate(d.createdAt)}${d.assignedToName ? ` · назначено: ${esc(d.assignedToName)}` : ''}${d.doneAt ? ` · выставлен ${fdate(d.doneAt)}` : ''}${d.note ? ` · ${esc(d.note)}` : ''}</div></div><div class="side-col">${chip(d.status, DOC_ST)}${d.status === 'done' ? ` <span class="chip ${d.signed ? 'ok' : 'neutral'}">${d.signed ? 'подписан' : 'не подписан'}</span> <span class="chip ${d.paid ? 'ok' : 'warn'}">${d.paid ? 'оплачен' + (d.paidAt ? ' ' + fdate(d.paidAt) : '') : 'не оплачен'}</span>` : `<div class="days">${d.daysWaiting}<span class="faint"> дн.</span></div>`}${isAdmin() ? `<div class="actions" style="margin-top:6px">${d.status === 'new' ? `<button class="btn sm" data-act="docStatus" data-id="${d.id}" data-status="in_progress">В работу</button>` : ''}${d.status !== 'done' ? `<button class="btn sm primary" data-act="docStatus" data-id="${d.id}" data-status="done">Выставлен</button>` : `${!d.signed ? `<button class="btn sm" data-act="docFlag" data-id="${d.id}" data-flag="signed">Подписан</button>` : ''}${!d.paid ? `<button class="btn sm primary" data-act="docFlag" data-id="${d.id}" data-flag="paid">Оплачен</button>` : ''}<button class="btn sm" data-act="docStatus" data-id="${d.id}" data-status="in_progress">Вернуть</button>`}<button class="btn sm" data-act="docEdit" data-id="${d.id}">✎</button><button class="btn sm danger" data-act="del" data-col="docs" data-id="${d.id}">✕</button></div>` : ''}</div></div>`).join('')}</div>` : empty('По этому фильтру ничего нет'));
  const nav = () => { location.hash = '#/docs?' + qsOf({ status: $('#f-status').value, project: $('#f-project').value, year: $('#f-year').value }); };
  ['#f-status', '#f-project', '#f-year'].forEach(s => $(s).onchange = nav);
  const docFields = () => [
    { name: 'type', label: 'Тип', type: 'select', options: [['act', 'АВР (акт выполненных работ)'], ['invoice_out', 'Счёт клиенту'], ['other', 'Другое']], half: true },
    { name: 'amount', label: 'Сумма, ₸', type: 'number', step: '0.01', half: true },
    { name: 'client', label: 'Заказчик', required: true, half: true },
    { name: 'company', label: 'Наша компания', type: 'select', options: OUR(), half: true },
    { name: 'project', label: 'Проект', type: 'select', options: projectOptions(), half: true },
    { name: 'assignedTo', label: 'Назначить бухгалтеру', type: 'select', options: [['', '— не назначено —'], ...accountants.map(a => [a.id, a.name])], half: true },
    { name: 'description', label: 'Что нужно (описание)', type: 'textarea' },
    { name: 'number', label: 'Номер АВР / счёта', half: true }, { name: 'actDate', label: 'Дата документа', type: 'date', half: true },
    { name: 'signed', label: 'Подписан заказчиком', type: 'select', options: YESNO, half: true }, { name: 'paid', label: 'Оплачен', type: 'select', options: YESNO, half: true },
    { name: 'note', label: 'Комментарий' },
  ];
  ACT.docAdd = () => modal('Запрос бухгалтеру', formHtml(docFields(), {}, 'Создать запрос'), async v => { await api('/docs', { method: 'POST', body: boolify(numify(v, ['amount']), ['signed', 'paid']) }); toast('Запрос создан'); route(); refreshBadge(); });
  ACT.docEdit = ({ id }) => { const d = docs.find(x => x.id === id); modal('Акт / счёт', formHtml(docFields(), d), async v => { await api('/docs/' + id, { method: 'PUT', body: boolify(numify(v, ['amount']), ['signed', 'paid']) }); toast('Сохранено'); route(); }); };
  ACT.docStatus = async ({ id, status }) => { await api('/docs/' + id, { method: 'PUT', body: { status } }); toast(status === 'done' ? 'Отмечено: выставлен' : 'Статус изменён'); route(); refreshBadge(); };
  ACT.docFlag = async ({ id, flag }) => { const body = {}; body[flag] = true; if (flag === 'paid') body.paidAt = today(); await api('/docs/' + id, { method: 'PUT', body }); toast(flag === 'paid' ? 'Отмечен оплаченным' : 'Отмечен подписанным'); route(); };
  bind(main);
};

// ---- invoices: счета к оплате ----
SECTIONS.invoices = async main => {
  const inv = await api('/invoices');
  const u = params();
  const fc = u.get('company') || '', fs = u.get('status') || 'open';
  const list = inv.filter(i => (!fc || i.company === fc) && (fs === 'all' || i.status === fs)).sort((a, b) => (b.invoiceDate || '').localeCompare(a.invoiceDate || ''));
  const total = list.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const byCo = {}; inv.filter(i => i.status === 'open').forEach(i => byCo[i.company] = (byCo[i.company] || 0) + Number(i.amount || 0));
  main.innerHTML = head('Счета к оплате', `Открыто: ${Object.entries(byCo).map(([k, v]) => `<b>${esc(k)}</b> ${money(v)}`).join(' · ') || 'нет'}`, isAdmin() ? '<button class="btn primary" data-act="invAdd">+ Счёт</button>' : '') +
    `<div class="filters">${sel('f-co', COMPANIES(), fc, 'Обе компании')}${sel('f-st', [['open', 'К оплате'], ['held', 'Придержаны'], ['paid', 'Оплачены'], ['all', 'Все']], fs)}</div>` +
    (list.length ? tbl([{ t: 'Дата' }, { t: 'Компания' }, { t: 'Контрагент' }, { t: 'Назначение' }, { t: 'Проект' }, { t: 'Сумма', cls: 'amt' }, { t: 'Статус' }, { t: '' }],
      list.map(i => `<tr><td class="nowrap">${fdate(i.invoiceDate)}</td><td>${esc(i.company)}</td><td><b>${esc(i.contractor)}</b></td><td class="muted">${esc(i.purpose)}</td><td class="muted">${esc(i.project)}</td><td class="amt num">${money(i.amount)}</td><td>${chip(i.status, INV_ST)}${i.paidAt ? `<div class="faint">${fdate(i.paidAt)}</div>` : ''}</td><td>${isAdmin() ? `<div class="actions">${i.status !== 'paid' ? `<button class="btn sm primary" data-act="invStatus" data-id="${i.id}" data-status="paid">Оплачен</button>` : ''}${i.status === 'open' ? `<button class="btn sm" data-act="invStatus" data-id="${i.id}" data-status="held">Придержать</button>` : ''}${i.status === 'held' ? `<button class="btn sm" data-act="invStatus" data-id="${i.id}" data-status="open">К оплате</button>` : ''}<button class="btn sm" data-act="edit" data-id="${i.id}">✎</button><button class="btn sm danger" data-act="del" data-col="invoices" data-id="${i.id}">✕</button></div>` : ''}</td></tr>`),
      `<tr><td colspan="5">Итого (${list.length})</td><td class="amt num">${money(total)}</td><td colspan="2"></td></tr>`) : empty('Счетов нет'));
  const nav = () => location.hash = '#/invoices?' + qsOf({ company: $('#f-co').value, status: $('#f-st').value });
  $('#f-co').onchange = nav; $('#f-st').onchange = nav;
  const fields = [{ name: 'company', label: 'Компания', type: 'select', options: COMPANIES(), half: true }, { name: 'invoiceDate', label: 'Дата счёта', type: 'date', value: today(), half: true }, { name: 'contractor', label: 'Контрагент', required: true, half: true }, { name: 'amount', label: 'Сумма, ₸', type: 'number', step: '0.01', required: true, half: true }, { name: 'purpose', label: 'Назначение' }, { name: 'project', label: 'Проект', type: 'select', options: projectOptions(), half: true }, { name: 'category', label: 'Категория расхода (для операции)', type: 'select', options: categoryOptions(), half: true }, { name: 'status', label: 'Статус', type: 'select', options: [['open', 'К оплате'], ['held', 'Придержать'], ['paid', 'Оплачен']] }];
  ACT.invAdd = () => modal('Новый счёт', formHtml(fields), async v => { await api('/invoices', { method: 'POST', body: numify(v, ['amount']) }); toast('Счёт добавлен'); route(); });
  ACT.edit = ({ id }) => { const i = inv.find(x => x.id === id); modal('Счёт', formHtml(fields, i), async v => { await api('/invoices/' + id, { method: 'PUT', body: numify(v, ['amount']) }); toast('Сохранено'); route(); }); };
  ACT.invStatus = async ({ id, status }) => { await api('/invoices/' + id, { method: 'PUT', body: { status } }); toast(status === 'paid' ? 'Отмечен оплаченным — добавлена операция расхода' : 'Статус изменён'); route(); };
  bind(main);
};

// ---- projects ----
SECTIONS.projects = async main => {
  const rows = await api('/projects'); state.projects = rows;
  const summary = isAdmin() ? await api('/ops/summary').catch(() => ({})) : {};
  const contracts = await api('/contracts').catch(() => []);
  const u = params(); const fs = u.get('status') || 'active', ft = (u.get('text') || '').toLowerCase();
  const list = rows.filter(p => fs === 'all' ? true : fs === 'active' ? p.status !== 'archive' && p.status !== 'Завершён' : p.status === fs).filter(p => !ft || (p.id + ' ' + p.name + ' ' + (p.client || '')).toLowerCase().includes(ft));
  const byName = n => summary[n] || { credit: 0, debit: 0, n: 0 };
  const cSum = p => contracts.filter(c => c.code === p.id || c.name === p.name || c.code === p.name).reduce((s, c) => s + Number(c.sum || 0), 0);
  main.innerHTML = head('Проекты', 'Контракт, фактический приход и расход по операциям (без переводов), маржа', isAdmin() ? '<button class="btn primary" data-act="add">+ Проект</button>' : '') +
    `<div class="filters">${sel('f-st', [['active', 'В работе'], ['archive', 'Архив'], ['Завершён', 'Завершённые'], ['all', 'Все']], fs)}<input id="f-text" placeholder="Поиск" value="${esc(u.get('text') || '')}"></div>` +
    (list.length ? tbl([{ t: 'Проект' }, { t: 'Заказчик' }, { t: 'Контракт без НДС', cls: 'amt' }, { t: 'Договоры', cls: 'amt' }, { t: 'Приход факт', cls: 'amt' }, { t: 'Расход факт', cls: 'amt' }, { t: 'Маржа факт' }, { t: 'Статус' }, { t: '' }],
      list.map(p => { const s = byName(p.id).n ? byName(p.id) : byName(p.name); const m = s.credit ? Math.round((s.credit - s.debit) / s.credit * 100) + '%' : '—'; return `<tr><td><b>${esc(p.name)}</b>${p.id !== p.name && !/^prj-/.test(p.id) ? `<div class="faint">${esc(p.id)}</div>` : ''}</td><td class="muted">${esc(p.client || '')}</td><td class="amt num">${money0(p.contractNoVat)}</td><td class="amt num">${money0(cSum(p))}</td><td class="amt num">${isAdmin() ? `<a href="#/ops?project=${encodeURIComponent(p.id)}">${money0(s.credit)}</a>` : money0(s.credit)}</td><td class="amt num">${money0(s.debit)}</td><td>${m}</td><td>${chip(p.status, { 'В работе': ['accent', 'В работе'], 'Завершён': ['ok', 'Завершён'], 'Пауза': ['neutral', 'Пауза'], archive: ['neutral', 'Архив'] })}</td><td>${actions('projects', p.id)}</td></tr>`; })) : empty('Проектов нет'));
  const nav = () => location.hash = '#/projects?' + qsOf({ status: $('#f-st').value, text: $('#f-text').value });
  $('#f-st').onchange = nav; $('#f-text').onkeydown = e => { if (e.key === 'Enter') nav(); };
  const fields = (edit) => [{ name: 'id', label: 'Код (как в операциях)', required: !edit, half: true }, { name: 'name', label: 'Название', required: true, half: true }, { name: 'client', label: 'Заказчик' }, { name: 'contractNoVat', label: 'Контракт без НДС, ₸', type: 'number', half: true }, { name: 'targetCost', label: 'Целевая себестоимость, ₸', type: 'number', half: true }, { name: 'status', label: 'Статус', type: 'select', options: [['В работе', 'В работе'], ['Пауза', 'Пауза'], ['Завершён', 'Завершён'], ['archive', 'Архив']] }];
  ACT.add = () => modal('Проект', formHtml(fields(false)), async v => { await api('/projects', { method: 'POST', body: numify(v, ['contractNoVat', 'targetCost']) }); toast('Добавлено'); route(); });
  ACT.edit = ({ id }) => { const r = rows.find(x => x.id === id); modal('Проект', formHtml(fields(true).filter(f => f.name !== 'id'), r), async v => { await api('/projects/' + id, { method: 'PUT', body: numify(v, ['contractNoVat', 'targetCost']) }); toast('Сохранено'); route(); }); };
  bind(main);
};

// ---- contracts: реестр договоров с заказчиками ----
SECTIONS.contracts = async main => {
  const rows = await api('/contracts');
  const u = params(); const fc = u.get('company') || '', fs = u.get('status') || 'active', ft = (u.get('text') || '').toLowerCase();
  const list = rows.filter(c => (!fc || c.company === fc) && (fs === 'all' ? true : fs === 'active' ? !c.closed : fs === 'unsigned' ? !c.signed : c.closed)).filter(c => !ft || [c.code, c.name, c.title, c.client, c.clientShort].join(' ').toLowerCase().includes(ft)).sort((a, b) => String(b.id).localeCompare(String(a.id)));
  const tot = k => list.reduce((s, c) => s + Number(c[k] || 0), 0);
  main.innerHTML = head('Договоры с заказчиками', `${list.length} договоров · сумма <b class="num">${money(tot('sum'))}</b> · оплачено <b class="num">${money(tot('paid'))}</b> · остаток <b class="num">${money(tot('remaining'))}</b>`, isAdmin() ? '<button class="btn primary" data-act="add">+ Договор</button>' : '') +
    `<div class="filters">${sel('f-co', OUR(), fc, 'Все наши компании')}${sel('f-st', [['active', 'Открытые'], ['unsigned', 'Не подписанные'], ['closed', 'Закрытые'], ['all', 'Все']], fs)}<input id="f-text" placeholder="Поиск: проект, заказчик, номер" value="${esc(u.get('text') || '')}" style="min-width:220px"></div>` +
    (list.length ? tbl([{ t: 'Проект / договор' }, { t: 'Заказчик' }, { t: 'Исполнитель' }, { t: 'Сумма', cls: 'amt' }, { t: 'Оплачено', cls: 'amt' }, { t: 'Остаток', cls: 'amt' }, { t: 'На оплату', cls: 'amt' }, { t: 'Закрыто актами', cls: 'amt' }, { t: 'Подписан' }, { t: '' }],
      list.map(c => `<tr><td><b>${esc(c.name || c.code)}</b>${c.code && c.code !== c.name ? ` <span class="faint">${esc(c.code)}</span>` : ''}<div class="faint" title="${esc(c.title)}">${esc(cut(c.title, 60))}${c.dept ? ' · ' + esc(c.dept) : ''}</div>${c.note ? `<div class="faint">${esc(cut(c.note, 60))}</div>` : ''}</td><td>${esc(c.clientShort || '')}<div class="faint">${esc(cut(c.client, 40))}</div></td><td class="muted">${esc((c.company || '').replace('ТОО ', ''))}</td><td class="amt num">${money0(c.sum)}</td><td class="amt num">${money0(c.paid)}</td><td class="amt num">${money0(c.remaining)}</td><td class="amt num">${money0(c.toPay)}</td><td class="amt num">${money0(c.closedActs)}</td><td>${yn(c.signed)}${c.closed ? ' <span class="chip neutral">закрыт</span>' : ''}</td><td>${actions('contracts', c.id)}</td></tr>`),
      `<tr><td colspan="3">Итого (${list.length})</td><td class="amt num">${money(tot('sum'))}</td><td class="amt num">${money(tot('paid'))}</td><td class="amt num">${money(tot('remaining'))}</td><td class="amt num">${money(tot('toPay'))}</td><td class="amt num">${money(tot('closedActs'))}</td><td colspan="2"></td></tr>`) : empty('Договоров нет'));
  const nav = () => location.hash = '#/contracts?' + qsOf({ company: $('#f-co').value, status: $('#f-st').value, text: $('#f-text').value });
  $('#f-co').onchange = nav; $('#f-st').onchange = nav; $('#f-text').onkeydown = e => { if (e.key === 'Enter') nav(); };
  const fields = [{ name: 'code', label: 'Код проекта', half: true }, { name: 'name', label: 'Краткое название', required: true, half: true }, { name: 'title', label: 'Номер / название по договору' }, { name: 'dept', label: 'Отдел (ЭП, РП, АН…)', half: true }, { name: 'company', label: 'Исполнитель (наша компания)', type: 'select', options: ['ТОО MOST Project', 'ТОО MOST Architects', 'ИП PANA Design', 'ИП MOST Design'], half: true }, { name: 'clientShort', label: 'Заказчик (кратко)', half: true }, { name: 'client', label: 'Заказчик (ТОО)', half: true }, { name: 'sum', label: 'Сумма контракта, ₸', type: 'number', required: true, half: true }, { name: 'paid', label: 'Оплачено, ₸', type: 'number', half: true }, { name: 'remaining', label: 'Остаток, ₸', type: 'number', half: true }, { name: 'toPay', label: 'На оплату сейчас, ₸', type: 'number', half: true }, { name: 'toClose', label: 'На закрытие актами, ₸', type: 'number', half: true }, { name: 'closedActs', label: 'Закрыто актами, ₸', type: 'number', half: true }, { name: 'signed', label: 'Подписан', type: 'select', options: YESNO, half: true }, { name: 'closed', label: 'Проект закрыт', type: 'select', options: YESNO, half: true }, { name: 'link', label: 'Ссылка на документ' }, { name: 'note', label: 'Примечание' }];
  const NUM = ['sum', 'paid', 'remaining', 'toPay', 'toClose', 'closedActs'];
  ACT.add = () => modal('Договор', formHtml(fields), async v => { await api('/contracts', { method: 'POST', body: boolify(numify(v, NUM), ['signed', 'closed']) }); toast('Добавлено'); route(); });
  ACT.edit = ({ id }) => { const r = rows.find(x => x.id === id); modal('Договор', formHtml(fields, r), async v => { await api('/contracts/' + id, { method: 'PUT', body: boolify(numify(v, NUM), ['signed', 'closed']) }); toast('Сохранено'); route(); }); };
  bind(main);
};

// ---- subcontracts: договоры с подрядчиками ----
SECTIONS.subcontracts = async main => {
  const rows = await api('/subcontracts');
  const u = params(); const fp = u.get('project') || '', fs = u.get('status') || 'active', ft = (u.get('text') || '').toLowerCase();
  const list = rows.filter(c => (!fp || c.project === fp) && (fs === 'all' ? true : fs === 'active' ? !c.closed : fs === 'debt' ? Number(c.remaining || 0) > 0 : c.closed)).filter(c => !ft || [c.project, c.section, c.title, c.contractor].join(' ').toLowerCase().includes(ft)).sort((a, b) => String(a.project).localeCompare(String(b.project)) || String(b.id).localeCompare(String(a.id)));
  const tot = k => list.reduce((s, c) => s + Number(c[k] || 0), 0);
  main.innerHTML = head('Договоры с подрядчиками', `${list.length} договоров · сумма <b class="num">${money(tot('sum'))}</b> · оплачено <b class="num">${money(tot('paid'))}</b> · остаток <b class="num">${money(tot('remaining'))}</b>`, isAdmin() ? '<button class="btn primary" data-act="add">+ Договор</button>' : '') +
    `<div class="filters">${sel('f-proj', [...new Set(rows.map(c => c.project).filter(Boolean))].sort(), fp, 'Все проекты')}${sel('f-st', [['active', 'Открытые'], ['debt', 'С остатком к оплате'], ['closed', 'Закрытые'], ['all', 'Все']], fs)}<input id="f-text" placeholder="Поиск: подрядчик, раздел" value="${esc(u.get('text') || '')}"></div>` +
    (list.length ? tbl([{ t: 'Проект' }, { t: 'Раздел' }, { t: 'Подрядчик / договор' }, { t: 'Заказчик' }, { t: 'Сумма', cls: 'amt' }, { t: 'Оплачено', cls: 'amt' }, { t: 'По бюджету', cls: 'amt' }, { t: 'Остаток', cls: 'amt' }, { t: 'На оплату', cls: 'amt' }, { t: 'Подписан' }, { t: '' }],
      list.map(c => `<tr><td><b>${esc(c.project)}</b></td><td>${esc(c.section || '')}</td><td>${esc(c.contractor)}<div class="faint" title="${esc(c.title)}">${esc(cut(c.title, 50))}</div>${c.note ? `<div class="faint">${esc(cut(c.note, 50))}</div>` : ''}</td><td class="muted">${esc((c.company || '').replace('ТОО ', ''))}</td><td class="amt num">${money0(c.sum)}</td><td class="amt num">${money0(c.paid)}</td><td class="amt num">${money0(c.byBudget)}</td><td class="amt num">${money0(c.remaining)}</td><td class="amt num">${money0(c.toPay)}</td><td>${yn(c.signed)}${c.closed ? ' <span class="chip neutral">закрыт</span>' : ''}</td><td>${actions('subcontracts', c.id)}</td></tr>`),
      `<tr><td colspan="4">Итого (${list.length})</td><td class="amt num">${money(tot('sum'))}</td><td class="amt num">${money(tot('paid'))}</td><td class="amt num">${money(tot('byBudget'))}</td><td class="amt num">${money(tot('remaining'))}</td><td class="amt num">${money(tot('toPay'))}</td><td colspan="2"></td></tr>`) : empty('Договоров нет'));
  const nav = () => location.hash = '#/subcontracts?' + qsOf({ project: $('#f-proj').value, status: $('#f-st').value, text: $('#f-text').value });
  $('#f-proj').onchange = nav; $('#f-st').onchange = nav; $('#f-text').onkeydown = e => { if (e.key === 'Enter') nav(); };
  const fields = [{ name: 'project', label: 'Проект', required: true, half: true, list: 'dl-projects' }, { name: 'section', label: 'Раздел (КЖ, ОВ, ЭЛ…)', half: true }, { name: 'contractor', label: 'Подрядчик', required: true, half: true }, { name: 'company', label: 'Заказчик (наша компания)', type: 'select', options: ['ТОО MOST Project', 'ТОО MOST Architects'], half: true }, { name: 'title', label: 'Номер / название договора' }, { name: 'sum', label: 'Сумма, ₸', type: 'number', required: true, half: true }, { name: 'paid', label: 'Оплачено, ₸', type: 'number', half: true }, { name: 'byBudget', label: 'По бюджету, ₸', type: 'number', half: true }, { name: 'remaining', label: 'Остаток, ₸', type: 'number', half: true }, { name: 'toPay', label: 'На оплату, ₸', type: 'number', half: true }, { name: 'closedActs', label: 'Закрыто актами, ₸', type: 'number', half: true }, { name: 'signed', label: 'Подписан', type: 'select', options: YESNO, half: true }, { name: 'closed', label: 'Закрыт', type: 'select', options: YESNO, half: true }, { name: 'link', label: 'Ссылка на документ' }, { name: 'note', label: 'Примечание' }];
  const NUM = ['sum', 'paid', 'byBudget', 'remaining', 'toPay', 'closedActs'];
  ACT.add = () => modal('Договор с подрядчиком', formHtml(fields), async v => { await api('/subcontracts', { method: 'POST', body: boolify(numify(v, NUM), ['signed', 'closed']) }); toast('Добавлено'); route(); });
  ACT.edit = ({ id }) => { const r = rows.find(x => x.id === id); modal('Договор с подрядчиком', formHtml(fields, r), async v => { await api('/subcontracts/' + id, { method: 'PUT', body: boolify(numify(v, NUM), ['signed', 'closed']) }); toast('Сохранено'); route(); }); };
  bind(main);
};

// ---- proposals: коммерческие предложения ----
SECTIONS.proposals = async main => {
  const rows = (await api('/proposals')).sort((a, b) => String(b.id).localeCompare(String(a.id)));
  main.innerHTML = head('Коммерческие предложения', `${rows.length} КП · сумма <b class="num">${money(rows.reduce((s, r) => s + Number(r.sum || 0), 0))}</b>`, '<button class="btn primary" data-act="add">+ КП</button>') +
    (rows.length ? tbl([{ t: '№' }, { t: 'Название' }, { t: 'Заказчик' }, { t: 'Сумма', cls: 'amt' }, { t: 'Статус' }, { t: 'Контакт с клиентом' }, { t: '' }],
      rows.map(r => `<tr><td>${esc(r.no || '')}</td><td><b>${esc(r.title)}</b></td><td>${esc(r.client || '')}</td><td class="amt num">${money0(r.sum)}</td><td>${chip(r.status, { 'У клиента': ['warn', 'У клиента'], 'Выполнено': ['ok', 'Выполнено'], 'Отказ': ['crit', 'Отказ'], 'В работе': ['accent', 'В работе'] })}</td><td class="muted">${esc(r.contact || '')}</td><td>${actions('proposals', r.id)}</td></tr>`)) : empty('КП нет'));
  const fields = [{ name: 'no', label: '№', half: true }, { name: 'sum', label: 'Сумма, ₸', type: 'number', half: true }, { name: 'title', label: 'Название', required: true }, { name: 'client', label: 'Заказчик', half: true }, { name: 'contact', label: 'Контакт с клиентом (кто ведёт)', half: true }, { name: 'status', label: 'Статус', type: 'select', options: ['У клиента', 'В работе', 'Выполнено', 'Отказ'] }];
  ACT.add = () => modal('Коммерческое предложение', formHtml(fields), async v => { await api('/proposals', { method: 'POST', body: numify(v, ['sum']) }); toast('Добавлено'); route(); });
  ACT.edit = ({ id }) => { const r = rows.find(x => x.id === id); modal('Коммерческое предложение', formHtml(fields, r), async v => { await api('/proposals/' + id, { method: 'PUT', body: numify(v, ['sum']) }); toast('Сохранено'); route(); }); };
  bind(main);
};

// ---- payroll: ЗП / ФОТ, сотрудники, отпуска ----
const VAC_TYPES = window.MostDomain ? window.MostDomain.VACATION_TYPES : { vacation: 'Отпуск', sick: 'Больничный', unpaid: 'За свой счёт', trip: 'Командировка' };
const VAC_CLASS = { vacation: 'vac-v', sick: 'vac-s', unpaid: 'vac-u', trip: 'vac-t' };
SECTIONS.payroll = async main => {
  const D = window.MostDomain;
  const [months, employees, vacations] = await Promise.all([api('/payroll'), api('/employees').catch(() => []), api('/vacations').catch(() => [])]);
  months.sort((a, b) => b.id.localeCompare(a.id));
  const u = params(); const tab = u.get('tab') || 'months', open = u.get('open') || (months[0] ? months[0].id : ''), cal = u.get('cal') || today().slice(0, 7), fe = u.get('emp') || 'active';
  const tax = (state.settings && state.settings.payrollTax) || 0.45;
  const empName = id => { const e = employees.find(x => x.id === id); return e ? e.name : '—'; };
  const activeEmps = employees.filter(e => e.status !== 'resigned').sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const tabs = `<div class="tabs">${[['months', 'По месяцам'], ['employees', `Сотрудники (${activeEmps.length})`], ['vacations', 'Отпуска и календарь']].map(([id, l]) => `<a href="#/payroll?tab=${id}" class="${tab === id ? 'active' : ''}">${esc(l)}</a>`).join('')}</div>`;
  const totalsOf = lines => ({ project: lines.filter(l => l.company === 'MOST Project').reduce((s, l) => s + Number(l.amount || 0), 0), architects: lines.filter(l => l.company !== 'MOST Project').reduce((s, l) => s + Number(l.amount || 0), 0) });
  const saveMonth = async (m, lines) => { const t = totalsOf(lines); await api('/payroll/' + m.id, { method: 'PUT', body: { lines, project: t.project, architects: t.architects } }); };
  const lineFields = () => [{ name: 'employeeId', label: 'Сотрудник', type: 'select', options: [['', '— не из списка —'], ...employees.map(e => [e.id, e.name + (e.status === 'resigned' ? ' (уволен)' : '')])], half: true }, { name: 'company', label: 'Компания', type: 'select', options: COMPANIES(), half: true }, { name: 'salary', label: 'Оклад на руки, ₸', type: 'number', half: true }, { name: 'amount', label: 'Начислено за месяц, ₸', type: 'number', required: true, half: true }, { name: 'note', label: 'Примечание (отпуск, больничный, аванс…)' }];

  if (tab === 'months') {
    const t = months.reduce((s, r) => ({ p: s.p + Number(r.project || 0), a: s.a + Number(r.architects || 0) }), { p: 0, a: 0 });
    main.innerHTML = head('ЗП / ФОТ', `На руки по месяцам; с налогами — ×${(1 + tax).toFixed(2)}. Нажмите на месяц, чтобы раскрыть сотрудников.`, '<button class="btn primary" data-act="addMonth">+ Месяц</button>') + tabs +
      (months.length ? tbl([{ t: '' }, { t: 'Месяц' }, { t: 'Сотрудников' }, { t: 'MOST Project', cls: 'amt' }, { t: 'MOST Architects', cls: 'amt' }, { t: 'Итого на руки', cls: 'amt' }, { t: 'С налогами', cls: 'amt' }, { t: '' }],
        months.map(r => { const s = Number(r.project || 0) + Number(r.architects || 0); const lines = (r.lines || []).map((l, idx) => Object.assign({ _i: idx }, l)).sort((a, b) => empName(a.employeeId).localeCompare(empName(b.employeeId), 'ru')); const isOpen = open === r.id; return `<tr class="row-click" data-act="toggle" data-id="${r.id}"><td>${isOpen ? '▾' : '▸'}</td><td><b>${esc(mname(r.id))}</b></td><td>${lines.length || '—'}</td><td class="amt num">${money(r.project)}</td><td class="amt num">${money(r.architects)}</td><td class="amt num">${money(s)}</td><td class="amt num">${money(s * (1 + tax))}</td><td>${actions('payroll', r.id).replace('data-act="edit"', 'data-act="editMonth"')}</td></tr>` +
          (isOpen ? `<tr class="row-detail"><td colspan="8"><div class="detail"><div class="head" style="margin-bottom:8px"><div class="grow"><b>${esc(mname(r.id))}</b> · ${lines.length} строк</div><button class="btn sm" data-act="fill" data-id="${r.id}">Заполнить по окладам</button> <button class="btn sm primary" data-act="lineAdd" data-id="${r.id}">+ Сотрудник</button></div>${lines.length ? tbl([{ t: 'Сотрудник' }, { t: 'Компания' }, { t: 'Оклад', cls: 'amt' }, { t: 'Начислено', cls: 'amt' }, { t: 'Разница', cls: 'amt' }, { t: 'Примечание' }, { t: '' }], lines.map((l, i) => { const d = Number(l.amount || 0) - Number(l.salary || 0); return `<tr><td><b>${esc(l.employeeId ? empName(l.employeeId) : (l.name || '—'))}</b></td><td class="muted">${esc(l.company || '')}</td><td class="amt num">${money0(l.salary)}</td><td class="amt num">${money(l.amount)}</td><td class="amt num ${d < -1 ? 'crit-text' : d > 1 ? 'ok-text' : 'muted'}">${Math.abs(d) > 1 ? (d > 0 ? '+' : '') + money(d) : ''}</td><td class="muted">${esc(l.note || '')}</td><td><div class="actions"><button class="btn sm" data-act="lineEdit" data-id="${r.id}" data-i="${l._i}">✎</button><button class="btn sm danger" data-act="lineDel" data-id="${r.id}" data-i="${l._i}">✕</button></div></td></tr>`; }), `<tr><td colspan="3">Итого</td><td class="amt num">${money(lines.reduce((s, l) => s + Number(l.amount || 0), 0))}</td><td colspan="3"></td></tr>`) : empty('Строк нет — нажмите «Заполнить по окладам»')}</div></td></tr>` : ''); }),
        `<tr><td></td><td>Итого</td><td></td><td class="amt num">${money(t.p)}</td><td class="amt num">${money(t.a)}</td><td class="amt num">${money(t.p + t.a)}</td><td class="amt num">${money((t.p + t.a) * (1 + tax))}</td><td></td></tr>`) : empty('Нет данных по ЗП'));
    const monthOf = id => months.find(m => m.id === id);
    ACT.toggle = ({ id }) => { location.hash = '#/payroll?' + qsOf({ tab: 'months', open: open === id ? 'none' : id }); };
    ACT.addMonth = () => modal('Новый месяц', formHtml([{ name: 'id', label: 'Месяц (ГГГГ-ММ)', required: true, value: today().slice(0, 7) }]), async v => { if (monthOf(v.id)) throw new Error('Такой месяц уже есть'); await api('/payroll', { method: 'POST', body: { id: v.id, project: 0, architects: 0, lines: [] } }); toast('Месяц добавлен'); location.hash = '#/payroll?' + qsOf({ tab: 'months', open: v.id }); route(); });
    ACT.editMonth = ({ id }) => { const r = monthOf(id); modal('Итоги за ' + mname(id), formHtml([{ name: 'project', label: 'MOST Project, на руки', type: 'number', half: true }, { name: 'architects', label: 'MOST Architects, на руки', type: 'number', half: true }], r), async v => { await api('/payroll/' + id, { method: 'PUT', body: numify(v, ['project', 'architects']) }); toast('Сохранено'); route(); }); };
    ACT.fill = async ({ id }) => { const r = monthOf(id); const lines = (r.lines || []).slice(); const have = new Set(lines.map(l => l.employeeId)); let n = 0; for (const e of activeEmps) { if (have.has(e.id)) continue; lines.push({ employeeId: e.id, company: e.company || 'MOST Project', salary: Number(e.salary || 0), amount: Number(e.salary || 0), note: '' }); n++; } if (!n) return toast('Все активные сотрудники уже в списке'); await saveMonth(r, lines); toast(`Добавлено строк: ${n}`); route(); };
    ACT.lineAdd = ({ id }) => { const r = monthOf(id); modal('Строка ЗП за ' + mname(id), formHtml(lineFields()), async v => { const e = employees.find(x => x.id === v.employeeId); const line = numify(v, ['salary', 'amount']); if (e && !line.salary) line.salary = Number(e.salary || 0); if (e && !v.company) line.company = e.company; await saveMonth(r, [...(r.lines || []), line]); toast('Добавлено'); route(); }); const sel = $('#modal select[name=employeeId]'); if (sel) sel.onchange = () => { const e = employees.find(x => x.id === sel.value); if (e) { $('#modal [name=salary]').value = e.salary || ''; $('#modal [name=amount]').value = e.salary || ''; $('#modal [name=company]').value = e.company || 'MOST Project'; } }; };
    ACT.lineEdit = ({ id, i }) => { const r = monthOf(id); const l = r.lines[Number(i)]; modal('Строка ЗП за ' + mname(id), formHtml(lineFields(), l), async v => { const lines = r.lines.slice(); lines[Number(i)] = Object.assign({}, l, numify(v, ['salary', 'amount'])); await saveMonth(r, lines); toast('Сохранено'); route(); }); };
    ACT.lineDel = async ({ id, i }) => { if (!confirm('Удалить строку?')) return; const r = monthOf(id); const lines = r.lines.slice(); lines.splice(Number(i), 1); await saveMonth(r, lines); toast('Удалено'); route(); };
  }

  if (tab === 'employees') {
    const list = employees.filter(e => fe === 'all' ? true : fe === 'active' ? e.status !== 'resigned' : e.status === 'resigned').sort((a, b) => (a.company || '').localeCompare(b.company || '') || a.name.localeCompare(b.name, 'ru'));
    const fond = activeEmps.reduce((s, e) => s + Number(e.salary || 0), 0);
    main.innerHTML = head('Сотрудники', `Активных ${activeEmps.length} · фонд по окладам <b class="num">${money(fond)}</b> в месяц на руки, с налогами <b class="num">${money(fond * (1 + tax))}</b>`, '<button class="btn primary" data-act="empAdd">+ Сотрудник</button>') + tabs +
      `<div class="filters">${sel('f-emp', [['active', 'Работают'], ['resigned', 'Уволенные'], ['all', 'Все']], fe)}</div>` +
      (list.length ? tbl([{ t: 'Сотрудник' }, { t: 'Компания' }, { t: 'Должность' }, { t: 'Оклад на руки', cls: 'amt' }, { t: 'С налогами', cls: 'amt' }, { t: 'Принят' }, { t: 'Отпуск: накоплено / использовано / остаток' }, { t: 'Статус' }, { t: '' }],
        list.map(e => { const b = D.vacationBalance(e, vacations); return `<tr><td><b>${esc(e.name)}</b>${e.iin ? `<div class="faint">ИИН ${esc(e.iin)}</div>` : ''}</td><td>${esc(e.company || '')}</td><td class="muted">${esc(e.position || '')}</td><td class="amt num">${money(e.salary)}</td><td class="amt num">${money(Number(e.salary || 0) * (1 + tax))}</td><td>${e.hired ? fdate(e.hired) : '—'}</td><td><span class="num">${b.accrued}</span> / <span class="num">${b.used}</span> / <b class="num ${b.balance < 0 ? 'crit-text' : ''}">${b.balance}</b> дн.${e.hired ? '' : ' <span class="faint">с начала года</span>'}</td><td>${e.status === 'resigned' ? `<span class="chip neutral">уволен${e.resigned ? ' ' + fdate(e.resigned) : ''}</span>` : '<span class="chip ok">работает</span>'}</td><td>${actions('employees', e.id).replace('data-act="edit"', 'data-act="empEdit"')}</td></tr>`; }),
        `<tr><td colspan="3">Итого (${list.length})</td><td class="amt num">${money(list.reduce((s, e) => s + Number(e.salary || 0), 0))}</td><td class="amt num">${money(list.reduce((s, e) => s + Number(e.salary || 0), 0) * (1 + tax))}</td><td colspan="4"></td></tr>`) : empty('Сотрудников нет'));
    $('#f-emp').onchange = () => location.hash = '#/payroll?' + qsOf({ tab: 'employees', emp: $('#f-emp').value });
    const empFields = [{ name: 'name', label: 'ФИО', required: true }, { name: 'company', label: 'Компания', type: 'select', options: COMPANIES(), half: true }, { name: 'position', label: 'Должность', half: true }, { name: 'salary', label: 'Оклад на руки, ₸', type: 'number', required: true, half: true }, { name: 'iin', label: 'ИИН', half: true }, { name: 'hired', label: 'Дата приёма (для расчёта отпуска)', type: 'date', half: true }, { name: 'vacationDays', label: 'Дней отпуска в год', type: 'number', value: 24, half: true }, { name: 'vacationCarry', label: 'Остаток отпуска на дату приёма в систему, дн.', type: 'number', half: true }, { name: 'status', label: 'Статус', type: 'select', options: [['active', 'Работает'], ['resigned', 'Уволен']], half: true }, { name: 'resigned', label: 'Дата увольнения', type: 'date' }, { name: 'note', label: 'Примечание' }];
    ACT.empAdd = () => modal('Сотрудник', formHtml(empFields), async v => { await api('/employees', { method: 'POST', body: numify(v, ['salary', 'vacationDays', 'vacationCarry']) }); toast('Добавлено'); route(); });
    ACT.empEdit = ({ id }) => { const e = employees.find(x => x.id === id); modal('Сотрудник', formHtml(empFields, e), async v => { await api('/employees/' + id, { method: 'PUT', body: numify(v, ['salary', 'vacationDays', 'vacationCarry']) }); toast('Сохранено'); route(); }); };
  }

  if (tab === 'vacations') {
    const [y, mo] = cal.split('-').map(Number); const daysIn = new Date(y, mo, 0).getDate();
    const first = `${cal}-01`, last = `${cal}-${String(daysIn).padStart(2, '0')}`;
    const inMonth = vacations.filter(v => v.from <= last && v.to >= first);
    const prev = (() => { const d = new Date(y, mo - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })(), next = (() => { const d = new Date(y, mo, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
    const rows = activeEmps.filter(e => !fe || fe === 'active' || true);
    const cell = (e, d) => { const iso = `${cal}-${String(d).padStart(2, '0')}`; const v = inMonth.find(x => x.employeeId === e.id && x.from <= iso && x.to >= iso); const dow = new Date(y, mo - 1, d).getDay(); const cls = [v ? VAC_CLASS[v.type || 'vacation'] : '', D.isHoliday(iso) ? 'hol' : (dow === 0 || dow === 6 ? 'wknd' : '')].join(' ').trim(); return `<td class="cal-cell ${cls}"${v ? ` title="${esc(VAC_TYPES[v.type || 'vacation'])}: ${fdate(v.from)} – ${fdate(v.to)}${v.note ? ' · ' + esc(v.note) : ''}" data-act="vacEdit" data-id="${v.id}"` : ''}></td>`; };
    const onVac = new Set(inMonth.map(v => v.employeeId)).size;
    main.innerHTML = head('Отпуска и календарь', `${mname(cal)} · в отпуске/отсутствуют ${onVac} чел. · отпуск 24 календарных дня в год, праздники РК не считаются`, '<button class="btn primary" data-act="vacAdd">+ Отпуск / отсутствие</button>') + tabs +
      `<div class="filters"><a class="btn sm" href="#/payroll?tab=vacations&cal=${prev}">‹ ${esc(mname(prev))}</a><input type="month" id="f-cal" value="${cal}" style="width:auto"><a class="btn sm" href="#/payroll?tab=vacations&cal=${next}">${esc(mname(next))} ›</a><span class="legend"><i class="vac-v"></i>отпуск <i class="vac-s"></i>больничный <i class="vac-u"></i>за свой счёт <i class="vac-t"></i>командировка <i class="hol"></i>праздник</span></div>` +
      `<div class="tbl cal-wrap"><table class="cal"><thead><tr><th>Сотрудник</th>${Array.from({ length: daysIn }, (_, i) => { const d = i + 1; const dow = new Date(y, mo - 1, d).getDay(); return `<th class="cal-h ${dow === 0 || dow === 6 ? 'wknd' : ''}">${d}</th>`; }).join('')}<th class="amt">Остаток</th></tr></thead><tbody>${rows.map(e => { const b = D.vacationBalance(e, vacations); return `<tr><td class="nowrap"><b>${esc(e.name.split(' ').slice(0, 2).join(' '))}</b><div class="faint">${esc((e.company || '').replace('MOST ', ''))}</div></td>${Array.from({ length: daysIn }, (_, i) => cell(e, i + 1)).join('')}<td class="amt num ${b.balance < 0 ? 'crit-text' : ''}">${b.balance}</td></tr>`; }).join('')}</tbody></table></div>` +
      `<h2>Отпуска и отсутствия в ${esc(mname(cal))}</h2>` + (inMonth.length ? tbl([{ t: 'Сотрудник' }, { t: 'Тип' }, { t: 'С' }, { t: 'По' }, { t: 'Дней' }, { t: 'Примечание' }, { t: '' }], inMonth.sort((a, b) => a.from.localeCompare(b.from)).map(v => `<tr><td><b>${esc(empName(v.employeeId))}</b></td><td>${chip(v.type || 'vacation', { vacation: ['accent', 'Отпуск'], sick: ['warn', 'Больничный'], unpaid: ['neutral', 'За свой счёт'], trip: ['ok', 'Командировка'] })}</td><td>${fdate(v.from)}</td><td>${fdate(v.to)}</td><td class="num">${v.days || D.vacationDays(v.from, v.to)}</td><td class="muted">${esc(v.note || '')}</td><td>${actions('vacations', v.id).replace('data-act="edit"', 'data-act="vacEdit"')}</td></tr>`)) : empty('В этом месяце отсутствий нет'));
    $('#f-cal').onchange = () => location.hash = '#/payroll?' + qsOf({ tab: 'vacations', cal: $('#f-cal').value });
    const vacFields = [{ name: 'employeeId', label: 'Сотрудник', type: 'select', options: activeEmps.map(e => [e.id, e.name]) }, { name: 'type', label: 'Тип', type: 'select', options: Object.entries(VAC_TYPES), half: true }, { name: 'from', label: 'С', type: 'date', required: true, half: true }, { name: 'to', label: 'По (включительно)', type: 'date', required: true, half: true }, { name: 'note', label: 'Примечание', half: true }];
    const withDays = v => Object.assign(v, { days: D.vacationDays(v.from, v.to) });
    ACT.vacAdd = () => modal('Отпуск / отсутствие', formHtml(vacFields, { from: first }), async v => { if (v.to < v.from) throw new Error('Дата «по» раньше даты «с»'); await api('/vacations', { method: 'POST', body: withDays(v) }); toast(`Записано: ${D.vacationDays(v.from, v.to)} дн.`); route(); });
    ACT.vacEdit = ({ id }) => { const v = vacations.find(x => x.id === id); modal('Отпуск / отсутствие', formHtml(vacFields, v), async val => { await api('/vacations/' + id, { method: 'PUT', body: withDays(val) }); toast('Сохранено'); route(); }); };
  }
  bind(main);
};

// ---- obligations ----
SECTIONS.obligations = async main => {
  const rows = await api('/obligations');
  const total = rows.reduce((s, r) => s + Number(r.monthly || 0), 0);
  main.innerHTML = head('Обязательные платежи', `Постоянные траты в месяц: <b>${money(total)}</b>`, '<button class="btn primary" data-act="add">+ Платёж</button>') +
    (rows.length ? tbl([{ t: 'Платёж' }, { t: 'В месяц', cls: 'amt' }, { t: 'Тип' }, { t: 'Осталось' }, { t: 'Остаток', cls: 'amt' }, { t: 'Примечание' }, { t: '' }],
      rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td class="amt num">${money(r.monthly)}</td><td>${esc(r.kind || '')}</td><td>${r.monthsLeft ? r.monthsLeft + ' мес' : '—'}</td><td class="amt num">${r.monthsLeft ? money(r.monthly * r.monthsLeft) : '—'}</td><td class="muted">${esc(r.note || '')}</td><td>${actions('obligations', r.id)}</td></tr>`),
      `<tr><td>Итого в месяц</td><td class="amt num">${money(total)}</td><td colspan="5"></td></tr>`) : empty('Пусто'));
  const fields = [{ name: 'name', label: 'Название', required: true }, { name: 'monthly', label: 'В месяц, ₸', type: 'number', required: true, half: true }, { name: 'kind', label: 'Тип', type: 'select', options: ['Регулярный', 'Рассрочка'], half: true }, { name: 'monthsLeft', label: 'Осталось месяцев (для рассрочки)', type: 'number', min: 0 }, { name: 'note', label: 'Примечание' }];
  ACT.add = () => modal('Обязательный платёж', formHtml(fields), async v => { await api('/obligations', { method: 'POST', body: numify(v, ['monthly', 'monthsLeft']) }); toast('Добавлено'); route(); });
  ACT.edit = ({ id }) => { const r = rows.find(x => x.id === id); modal('Платёж', formHtml(fields, r), async v => { await api('/obligations/' + id, { method: 'PUT', body: numify(v, ['monthly', 'monthsLeft']) }); toast('Сохранено'); route(); }); };
  bind(main);
};

// ---- settings ----
SECTIONS.settings = async main => {
  const st = await api('/status');
  const backups = await api('/backups').catch(() => ({ list: [], dir: '' }));
  const users = isOwner() ? await api('/users') : [];
  const audit = await api('/audit').catch(() => []);
  const cash = await api('/cash').catch(() => []);
  const ROLE = { owner: 'Владелец', partner: 'Партнёр', accountant: 'Бухгалтер', pm: 'Проджект-менеджер' };
  const year = today().slice(0, 4);
  main.innerHTML = head('Настройки') +
    (!st.hasData && st.seed.available && isOwner() ? `<div class="notice">База пустая. <button class="btn primary sm" data-act="seed">Загрузить данные из таблицы «Бюджет МОСТ»</button> — операции с 2018 года, договоры, подрядчики, АВР, КП, справочники.</div>` : '') +
    (isOwner() && st.web ? accessBlock(users) : '') +
    (isOwner() && !st.web ? `<h2>Пользователи и роли</h2>${tbl([{ t: 'Имя' }, { t: 'Логин' }, { t: 'Роль' }, { t: 'Статус' }, { t: '' }], users.map(u => `<tr><td><b>${esc(u.name)}</b></td><td class="muted">${esc(u.login)}</td><td>${esc(ROLE[u.role] || u.role)}</td><td>${u.active ? '<span class="chip ok">активен</span>' : '<span class="chip neutral">отключён</span>'}</td><td><div class="actions"><button class="btn sm" data-act="userEdit" data-id="${u.id}">✎</button>${u.id !== state.user.id ? `<button class="btn sm" data-act="userToggle" data-id="${u.id}" data-active="${u.active}">${u.active ? 'Отключить' : 'Включить'}</button>` : ''}</div></td></tr>`))}<p><button class="btn primary" data-act="userAdd">+ Пользователь</button></p><p class="faint">Владелец, партнёр, бухгалтер — полный доступ. Проджект-менеджер — только просмотр актов/счетов клиентам, счетов к оплате, проектов и договоров; операции, ЗП и остальное скрыты (проверяет сервер).</p>` : '') +
    `<h2>Остатки на счетах</h2><div class="card"><p class="muted" style="margin-top:0">Вводятся вручную по выписке банка; показываются на дашборде.</p>${cash.length ? tbl([{ t: 'Счёт' }, { t: 'Компания' }, { t: 'Остаток', cls: 'amt' }, { t: 'На дату' }, { t: '' }], cash.map(c => `<tr><td><b>${esc(c.account || c.id)}</b></td><td>${esc(c.company)}</td><td class="amt num">${money(c.balance)}</td><td>${fdate(c.asOf)}</td><td>${actions('cash', c.id).replace('data-act="edit"', 'data-act="cashEdit"')}</td></tr>`)) : ''}<p><button class="btn" data-act="cashAdd">+ Счёт</button></p></div>` +
    `<h2>Справочник счетов</h2>${tbl([{ t: 'Код' }, { t: 'Название' }, { t: 'Компания' }, { t: 'Активен' }, { t: '' }], state.accounts.map(a => `<tr><td><b>${esc(a.id)}</b>${a.iban ? `<div class="faint">${esc(a.iban)}</div>` : ''}</td><td>${esc(a.name || '')}</td><td>${esc(a.company || '')}</td><td>${yn(a.active !== false)}</td><td>${isOwner() ? `<div class="actions"><button class="btn sm" data-act="accEdit" data-id="${esc(a.id)}">✎</button></div>` : ''}</td></tr>`))}${isOwner() ? '<p><button class="btn" data-act="accAdd">+ Счёт</button></p>' : ''}` +
    `<h2>Справочник категорий</h2>${tbl([{ t: 'Категория' }, { t: 'Описание' }, { t: 'Вид' }, { t: '' }], state.categories.map(c => `<tr><td><b>${esc(c.id)}</b></td><td class="muted">${esc(c.name || '')}</td><td>${esc(KIND_LABEL[c.kind] || c.kind || '')}</td><td>${isOwner() ? `<div class="actions"><button class="btn sm" data-act="catEdit" data-id="${esc(c.id)}">✎</button></div>` : ''}</td></tr>`))}${isOwner() ? '<p><button class="btn" data-act="catAdd">+ Категория</button></p><p class="faint">Вид «Перевод» исключается из доходов и расходов. «Доход» — категории поступлений от клиентов.</p>' : ''}` +
    (isOwner() ? `<h2>Параметры</h2><div class="card">${formHtml([{ name: 'vatRate', label: 'НДС (0.16 = 16%)', type: 'number', step: '0.01', half: true }, { name: 'payrollTax', label: 'Налоги на ФОТ (0.45 = 45%)', type: 'number', step: '0.01', half: true }, { name: 'usdRate', label: 'Курс $ → ₸', type: 'number', step: '0.01' }], state.settings || {})}</div>` : '') +
    `<h2>Резервные копии</h2><div class="card"><p class="muted" style="margin-top:0">${st.web ? 'База хранится на claude.ai. Регулярно скачивайте копию JSON и кладите её в папку <code>MOST-Финансы\\backups</code> на MostServer.' : `Автоматически — при первой записи каждого дня. Папка: <code>${esc(backups.dir)}</code>`}</p><p>${st.web ? '' : '<button class="btn primary" data-act="backup">Сделать бэкап сейчас</button> '}<a class="btn" href="/api/backup" download>Скачать всю базу (JSON)</a></p>${backups.list.length ? `<div class="faint">Последние: ${backups.list.slice(0, 5).map(b => esc(b.name)).join(', ')}${backups.list.length > 5 ? ` … всего ${backups.list.length}` : ''}</div>` : ''}</div>` +
    `<h2>Обмен с 1С / Excel</h2><div class="card"><p class="muted" style="margin-top:0">Файлы CSV (UTF-8, разделитель «;»). Живой синхронизации нет.</p><p><a class="btn" href="/api/export/1c/ops.csv?year=${year}" download>Экспорт операций ${year}</a> <a class="btn" href="/api/export/1c/invoices.csv" download>Экспорт счетов к оплате</a> <a class="btn" href="/api/export/1c/docs.csv" download>Экспорт актов/счетов клиентам</a></p><div class="form-row"><div class="field"><label>Импорт в</label><select id="imp-col"><option value="ops">Операции</option><option value="invoices">Счета к оплате</option><option value="docs">Акты/счета клиентам</option></select></div><div class="field"><label>CSV-файл</label><input type="file" id="imp-file" accept=".csv,text/csv"></div></div><button class="btn" data-act="import">Импортировать</button> <span class="faint">Колонки как в экспорте.</span></div>` +
    `<h2>Журнал действий</h2>${audit.length ? `<pre class="log">${audit.slice(-100).reverse().map(a => `${esc(a.ts.replace('T', ' ').slice(0, 16))}  ${esc(peopleName(a.userId))}  ${esc(a.action)}  ${esc(a.collection)}${a.docId ? ' ' + esc(String(a.docId).slice(0, 14)) : ''}`).join('\n')}</pre>` : '<p class="muted">Пока пусто</p>'}`;
  const settingsForm = main.querySelector('form');
  if (settingsForm && settingsForm.querySelector('[name=vatRate]')) { settingsForm.querySelector('button').textContent = 'Сохранить параметры'; settingsForm.onsubmit = async e => { e.preventDefault(); const v = numify(Object.fromEntries(new FormData(settingsForm).entries()), ['vatRate', 'payrollTax', 'usdRate']); state.settings = await api('/settings', { method: 'PUT', body: v }); toast('Параметры сохранены'); }; }
  function accessBlock(list) {
    return `<h2>Доступ и роли</h2>${tbl([{ t: 'Имя' }, { t: 'Роль' }, { t: '' }], list.map(u => `<tr><td><b>${esc(u.name || 'Без имени')}</b></td><td>${u.role === 'owner' ? esc(ROLE.owner) : `<select data-role="${esc(u.id)}" style="width:auto"><option value="partner"${u.role === 'partner' ? ' selected' : ''}>Партнёр</option><option value="accountant"${u.role === 'accountant' ? ' selected' : ''}>Бухгалтер</option></select>`}</td><td><div class="actions">${u.role !== 'owner' ? `<button class="btn sm danger" data-act="accessDel" data-id="${esc(u.id)}">✕</button>` : ''}</div></td></tr>`))}` +
      `<div class="card" style="margin-top:10px"><div class="form-row"><div class="field"><label>Добавить человека (поиск по имени)</label><input id="acc-q" placeholder="Начните вводить имя" autocomplete="off"></div><div class="field"><label>Роль</label><select id="acc-role"><option value="accountant">Бухгалтер</option><option value="partner">Партнёр</option></select></div></div><div id="acc-hits" class="q"></div></div>` +
      `<p class="faint">Права задаются в меню «Поделиться» наверху страницы: партнёр и бухгалтер — «Может редактировать», проджект-менеджер — «Только просмотр» (он увидит только акты, счета, проекты и договоры). Роль здесь — подпись рядом с именем.</p>`;
  }
  const accQ = main.querySelector('#acc-q');
  if (accQ) {
    const hits = main.querySelector('#acc-hits');
    const show = list => { hits.innerHTML = list.map(h => `<div class="q-card"><div><div class="t"></div></div><div class="side-col"><button class="btn sm primary" data-act="accessAdd" data-id="${esc(h.id)}">Добавить</button></div></div>`).join(''); list.forEach((h, k) => { hits.children[k].querySelector('.t').textContent = h.name || 'Без имени'; }); bind(hits); };
    accQ.onfocus = accQ.oninput = async () => { const list = window.__userSearch ? await window.__userSearch(accQ.value) : []; show(list.filter(h => !users.some(u => u.id === h.id))); };
    main.querySelectorAll('select[data-role]').forEach(s => { s.onchange = async () => { await api('/users/' + s.dataset.role, { method: 'PUT', body: { role: s.value } }); toast('Роль обновлена'); state.people = await api('/people'); }; });
    ACT.accessAdd = async ({ id }) => { await api('/users', { method: 'POST', body: { id, role: $('#acc-role').value } }); toast('Добавлено'); state.people = await api('/people'); route(); };
    ACT.accessDel = async ({ id }) => { if (!confirm('Убрать роль? Доступ к странице снимается отдельно в меню «Поделиться».')) return; await api('/users/' + id, { method: 'DELETE' }); toast('Убрано'); state.people = await api('/people'); route(); };
  }
  const userFields = (edit) => [{ name: 'name', label: 'Имя', required: true, half: true }, { name: 'login', label: 'Логин', required: !edit, half: true }, { name: 'role', label: 'Роль', type: 'select', options: Object.entries(ROLE) }, { name: 'password', label: edit ? 'Новый пароль (пусто — не менять)' : 'Пароль', type: 'password', required: !edit }];
  ACT.userAdd = () => modal('Новый пользователь', formHtml(userFields(false)), async v => { await api('/users', { method: 'POST', body: v }); toast('Пользователь создан'); state.people = await api('/people'); route(); });
  ACT.userEdit = ({ id }) => { const u = users.find(x => x.id === id); modal('Пользователь', formHtml(userFields(true).filter(f => f.name !== 'login'), u), async v => { if (!v.password) delete v.password; await api('/users/' + id, { method: 'PUT', body: v }); toast('Сохранено'); state.people = await api('/people'); route(); }); };
  ACT.userToggle = async ({ id, active }) => { await api('/users/' + id, { method: 'PUT', body: { active: active !== 'true' } }); toast('Готово'); route(); };
  const cashFields = [{ name: 'id', label: 'Код счёта', required: true, half: true }, { name: 'company', label: 'Компания', type: 'select', options: OUR(), half: true }, { name: 'account', label: 'Название (банк)', half: true }, { name: 'balance', label: 'Остаток, ₸', type: 'number', required: true, half: true }, { name: 'asOf', label: 'На дату', type: 'date', value: today() }];
  ACT.cashAdd = () => modal('Остаток на счёте', formHtml(cashFields), async v => { await api('/cash', { method: 'POST', body: numify(v, ['balance']) }); toast('Добавлено'); route(); });
  ACT.cashEdit = ({ id }) => { const c = cash.find(x => x.id === id); modal('Остаток на счёте', formHtml(cashFields.slice(1), c), async v => { await api('/cash/' + id, { method: 'PUT', body: numify(v, ['balance']) }); toast('Сохранено'); route(); }); };
  const accFields = [{ name: 'id', label: 'Код (как в операциях)', required: true, half: true }, { name: 'name', label: 'Название', half: true }, { name: 'company', label: 'Компания', type: 'select', options: [...OUR(), 'Наличные'], half: true }, { name: 'active', label: 'Активен', type: 'select', options: YESNO, half: true }, { name: 'iban', label: 'IBAN (для автоподбора при загрузке выписки)' }];
  ACT.accAdd = () => modal('Счёт', formHtml(accFields), async v => { await api('/accounts', { method: 'POST', body: boolify(v, ['active']) }); toast('Добавлено'); state.accounts = await api('/accounts'); route(); });
  ACT.accEdit = ({ id }) => { const a = state.accounts.find(x => x.id === id); modal('Счёт ' + id, formHtml(accFields.slice(1), Object.assign({}, a, { active: a.active !== false })), async v => { await api('/accounts/' + id, { method: 'PUT', body: boolify(v, ['active']) }); toast('Сохранено'); state.accounts = await api('/accounts'); route(); }); };
  const catFields = [{ name: 'id', label: 'Категория (как в операциях)', required: true, half: true }, { name: 'name', label: 'Описание', half: true }, { name: 'kind', label: 'Вид', type: 'select', options: Object.entries(KIND_LABEL) }];
  ACT.catAdd = () => modal('Категория', formHtml(catFields), async v => { await api('/categories', { method: 'POST', body: v }); toast('Добавлено'); state.categories = await api('/categories'); route(); });
  ACT.catEdit = ({ id }) => { const c = state.categories.find(x => x.id === id); modal('Категория ' + id, formHtml(catFields.slice(1), c), async v => { await api('/categories/' + id, { method: 'PUT', body: v }); toast('Сохранено'); state.categories = await api('/categories'); route(); }); };
  ACT.backup = async () => { const r = await api('/backup', { method: 'POST' }); toast('Бэкап создан: ' + r.name, 4000); route(); };
  ACT.seed = async () => { if (!confirm('Загрузить стартовые данные в пустую базу?')) return; const r = await api('/seed', { method: 'POST' }); toast('Загружено: ' + Object.entries(r.imported).map(([k, v]) => `${k} ${v}`).join(', '), 6000); await loadRefs(); route(); };
  ACT.import = async () => { const f = $('#imp-file').files[0]; if (!f) return toast('Выберите CSV-файл'); const csv = await f.text(); const r = await api('/import/1c/' + $('#imp-col').value, { method: 'POST', body: { csv } }); toast(`Импортировано записей: ${r.imported}`, 4000); };
  bind(main);
};
function peopleName(id) { const p = state.people.find(x => x.id === id); return p ? p.name : (id === state.user.id ? state.user.name : '—'); }

// ---- shared delete ----
ACT.del = async ({ col, id }) => { if (!confirm('Удалить запись?')) return; await api(`/${col}/${id}`, { method: 'DELETE' }); toast('Удалено'); route(); if (col === 'docs') refreshBadge(); };

boot();
})();
