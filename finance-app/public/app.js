/* MOST Финансы — фронтенд (vanilla JS). Модель повторяет таблицу «Бюджет МОСТ». */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const state = { user: null, status: null, people: [], settings: null, accounts: [], categories: [], projects: [], counterparties: [] };
const ADMIN = ['owner', 'partner', 'accountant', 'secretary'];
const isAdmin = () => state.user && ADMIN.includes(state.user.role);
const isOwner = () => state.user && state.user.role === 'owner';
const canR = col => !!state.user && window.MostDomain.can(state.user.role, col, 'read');
const canW = col => !!state.user && window.MostDomain.can(state.user.role, col, 'write');
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
const LOGO = '<svg viewBox="0 30 143 128" aria-hidden="true"><path fill="#ff4d23" d="M0 30H60L103 70L74 99L40 67.5ZM40 67.5V158H0V102.5ZM103 69L142 30V158H103Z"/></svg>';
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
  try { state.counterparties = canR('counterparties') ? await api('/counterparties') : []; } catch { state.counterparties = []; }
  if (isAdmin()) {
    try { state.settings = await api('/settings'); } catch { }
    try { state.accounts = await api('/accounts'); } catch { state.accounts = []; }
    try { state.categories = await api('/categories'); } catch { state.categories = []; }
  }
}
async function afterLogin() { await loadRefs(); renderApp(); }
function renderSetup() {
  $('#app').innerHTML = `<div class="auth"><div class="auth-card"><div class="brand"><div class="logo">${LOGO}</div><b>most<small>финансы</small></b></div><h1>Первый запуск</h1><p class="sub">Создайте аккаунт владельца. Данные хранятся только на этом компьютере.</p>${formHtml([{ name: 'name', label: 'Ваше имя', required: true }, { name: 'login', label: 'Логин', required: true }, { name: 'password', label: 'Пароль (мин. 6 символов)', type: 'password', required: true }], {}, 'Создать и войти')}</div></div>`;
  $('#app form').onsubmit = async e => { e.preventDefault(); try { const r = await api('/setup', { method: 'POST', body: Object.fromEntries(new FormData(e.target).entries()) }); state.user = r.user; state.status.needsSetup = false; await afterLogin(); if (!state.status.hasData && state.status.seed.available) location.hash = '#/settings'; } catch (er) { $('#app .error').textContent = er.message; } };
}
function renderNoAccess(msg) {
  $('#app').innerHTML = `<div class="auth"><div class="auth-card"><div class="brand"><div class="logo">${LOGO}</div><b>most<small>финансы</small></b></div><h1>Нет доступа</h1><p class="sub">${esc(msg || 'Откройте страницу под рабочим аккаунтом claude.ai.')}</p><p class="faint">Доступ выдаёт владелец через меню «Поделиться» на этой странице.</p></div></div>`;
}
function renderLogin() {
  $('#app').innerHTML = `<div class="auth"><div class="auth-card"><div class="brand"><div class="logo">${LOGO}</div><b>most<small>финансы</small></b></div>${formHtml([{ name: 'login', label: 'Логин', required: true }, { name: 'password', label: 'Пароль', type: 'password', required: true }], {}, 'Войти')}</div></div>`;
  $('#app form').onsubmit = async e => { e.preventDefault(); try { const r = await api('/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target).entries()) }); state.user = r.user; await afterLogin(); } catch (er) { $('#app .error').textContent = er.message; } };
}

// ---- app shell ----
const NAV = [
  { id: 'dashboard', label: 'Дашборд', icon: '▦', dash: true },
  { id: 'ops', label: 'Операции', icon: '⇅', admin: true },
  { id: 'docs', label: 'Акты и счета клиентам', icon: '📋', col: 'docs' },
  { id: 'invoices', label: 'Счета к оплате', icon: '🧾', col: 'invoices' },
  { id: 'projects', label: 'Проекты', icon: '◈', col: 'projects' },
  { id: 'contracts', label: 'Договоры', icon: '📄', col: 'contracts' },
  { id: 'subcontracts', label: 'Подрядчики', icon: '🛠', col: 'subcontracts' },
  { id: 'counterparties', label: 'Контрагенты', icon: '☷', col: 'counterparties' },
  { id: 'proposals', label: 'Коммерческие предложения', icon: '✉', col: 'proposals' },
  { id: 'payroll', label: 'ЗП / ФОТ', icon: '👥', admin: true },
  { id: 'obligations', label: 'Обязательные платежи', icon: '🔁', admin: true },
  { id: 'reports', label: 'Отчёты', icon: '📊', admin: true },
  { id: 'settings', label: 'Настройки', icon: '⚙', admin: true },
  { id: 'help', label: 'Инструкция', icon: '?' },
];
function renderApp() {
  const nav = NAV.filter(n => n.dash ? window.MostDomain.canDashboard(state.user.role) : n.col ? canR(n.col) : (!n.admin || isAdmin()));
  $('#app').innerHTML = `<div class="shell"><aside class="side" id="side"><div class="brand"><div class="logo">${LOGO}</div><b>most<small>финансы</small></b></div><nav class="nav" id="nav">${nav.map(n => `<a href="#/${n.id}" data-id="${n.id}"><span>${n.icon}</span>${esc(n.label)}<span class="badge" id="badge-${n.id}" hidden></span></a>`).join('')}</nav><div class="me"><b>${esc(state.user.name)}</b><span class="muted">${esc(state.user.roleLabel || state.user.role)}</span>${state.status.web ? '' : '<br><button class="btn sm" id="logout" style="margin-top:8px">Выйти</button>'}</div></aside><div><div class="topbar"><button class="icon-btn" id="burger">☰</button><b>most · финансы</b></div><main class="main" id="main"></main></div></div>`;
  if (!$('#dl-cp')) document.body.insertAdjacentHTML('beforeend', '<datalist id="dl-cp"></datalist><datalist id="dl-projects"></datalist>'); refreshCpList();
  if ($('#logout')) $('#logout').onclick = async () => { await api('/logout', { method: 'POST' }); state.user = null; location.hash = ''; renderLogin(); };
  $('#burger').onclick = () => $('#side').classList.toggle('open');
  $('#nav').addEventListener('click', () => $('#side').classList.remove('open'));
  if (!location.hash || !nav.some(n => location.hash.startsWith('#/' + n.id)) && !location.hash.startsWith('#/project?')) location.hash = '#/' + nav[0].id;
  route();
  refreshBadge();
}
function refreshCpList() { const d = $('#dl-cp'); if (d) d.innerHTML = (state.counterparties || []).map(c => `<option value="${esc(c.name)}">${esc(c.short || '')}</option>`).join(''); const dp = $('#dl-projects'); if (dp) dp.innerHTML = (state.projects || []).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join(''); }
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
const actions = (col, id, extra = '') => canW(col) ? `<div class="actions">${extra}<button class="btn sm" data-act="edit" data-id="${esc(id)}">✎</button><button class="btn sm danger" data-act="del" data-col="${col}" data-id="${esc(id)}">✕</button></div>` : '';

// ---- dashboard ----
SECTIONS.dashboard = async main => {
  const [d, bal, invAll] = await Promise.all([api('/dashboard'), api('/balances').catch(() => []), api('/invoices').catch(() => [])]);
  const m = d.month; const cal = window.MostDomain.paymentCalendar(invAll, today()); const known = bal.filter(b => b.balance !== null); const balTotal = known.reduce((s, b) => s + b.balance, 0);
  const lastB = state.status.lastBackupAt ? Math.floor((Date.now() - new Date(state.status.lastBackupAt).getTime()) / 864e5) : null;
  const backupNotice = state.status.web && isAdmin() && (lastB === null || lastB > 7) ? `<div class="notice warn" style="margin-bottom:12px">${lastB === null ? 'Копия базы ещё не скачивалась.' : `Копия базы скачивалась ${lastB} дн. назад.`} Скачайте JSON и положите в папку MOST-Финансы\\backups на MostServer. <a class="btn sm primary" href="/api/backup" download>Скачать копию</a></div>` : '';
  const bars = (obj, n = 8) => { const rows = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n); const mx = rows[0] ? rows[0][1] : 1; return rows.length ? rows.map(([k, v]) => `<div class="kv" style="margin-bottom:8px"><span>${esc(k)}</span><b class="num">${money(v)}</b><div class="bar" style="grid-column:1/-1"><i style="width:${Math.round(v / mx * 100)}%"></i></div></div>`).join('') : '<span class="muted">Нет данных</span>'; };
  main.innerHTML = backupNotice + head('Дашборд', `На ${fdate(d.asOf)} · ${mname(m.ym)} · операций за год ${d.year.n}`) + `
  <div class="grid g4">
    <div class="card"><div class="label">На счетах (по операциям) <a href="#/settings">→</a></div><div class="val num">${known.length ? money(balTotal) : '—'}</div><div class="foot">${known.length ? known.map(b => `${esc(b.id)}: ${money(b.balance)}${b.opsAfter ? ` (выписка ${fdate(b.anchor.asOf)} + ${b.opsAfter} оп.)` : ` (${fdate(b.anchor.asOf)})`}`).join(' · ') : 'нет опорного остатка — загрузите выписку или введите остаток в настройках'}</div></div>
    <div class="card ${m.net < 0 ? 'crit' : 'ok'}"><div class="label">${esc(mname(m.ym))}: остаток <a href="#/ops?ym=${m.ym}">→</a></div><div class="val num">${money(m.net)}</div><div class="foot">пришло ${money(m.income)} · ушло ${money(m.expenses)} · пред. месяц: +${money(m.prevIncome)} / −${money(m.prevExpenses)}</div></div>
    <div class="card"><div class="label">Год: доход</div><div class="val num">${money(d.year.income)}</div><div class="foot">${Object.entries(d.year.byCompany).filter(([, v]) => v.income > 0).map(([k, v]) => `${esc(k)}: ${money(v.income)}`).join(' · ') || '—'}</div></div>
    <div class="card"><div class="label">Год: расход</div><div class="val num">${money(d.year.expenses)}</div><div class="foot">чистыми ${money(d.year.net)} · без переводов между счетами</div></div>
    <div class="card ${d.untagged.all ? 'crit' : 'ok'}"><div class="label">Не разнесено / автоподсказки <a href="#/ops?year=${d.asOf.slice(0, 4)}&untagged=1">→</a></div><div class="val num">${d.untagged.all}</div><div class="foot">операций без категории или проекта, либо с автоподсказкой — проверьте и подтвердите</div></div>
    <div class="card"><div class="label">Постоянная нагрузка / мес</div><div class="val num">${money(d.fixedLoad.total)}</div><div class="foot">ФОТ с налогами ${money(d.fixedLoad.payrollGross)} + обязательные ${money(d.fixedLoad.obligations)}</div></div>
    <div class="card ${d.invoices.openSum ? 'crit' : ''}"><div class="label">Счета к оплате <a href="#/invoices?view=calendar">→</a></div><div class="val num">${money(d.invoices.openSum)}</div><div class="foot">${d.invoices.openCount} открытых · придержано ${money(d.invoices.heldSum)} (${d.invoices.heldCount})${cal.summary.overdue ? ` · <span class="crit-text">просрочено ${money(cal.summary.overdue)}</span>` : ''} · на неделе ${money(cal.summary.thisWeek)} · не согласовано ${cal.summary.unapproved}</div></div>
    <div class="card ${d.queue.overdue ? 'crit' : ''}"><div class="label">Очередь к бухгалтеру <a href="#/docs">→</a></div><div class="val num">${d.queue.count}</div><div class="foot">${d.queue.overdue ? `${d.queue.overdue} висят > 3 дней · ` : ''}новых ${d.queue.byStatus.new}, в работе ${d.queue.byStatus.in_progress}</div></div>
    <div class="card"><div class="label">Договоры в работе <a href="#/contracts">→</a></div><div class="val num">${money(d.contracts.sum)}</div><div class="foot">${d.contracts.active} договоров · остаток к получению ${money(d.contracts.remaining)}</div></div>
    <div class="card"><div class="label">Отложенный КПН (оценка)</div><div class="val num">${money(d.kpnDeferred)}</div><div class="foot">20% от (доход − расход) за год</div></div>
  </div>
  <div class="grid g2" style="margin-top:14px"><div><h2 style="margin-top:0">Расходы за год по категориям</h2><div class="card">${bars(d.year.byCategory, 10)}</div></div><div><h2 style="margin-top:0">Доход за год по проектам</h2><div class="card">${bars(d.year.byProjectIn, 10)}</div></div></div>`;
};

// ---- ops: операции ----
const OPS_SORT = { opNo: o => String(o.opNo || '').padStart(14, '0'), comment: o => (o.comment || '').toLowerCase(), date: o => o.date || '', account: o => o.account || '', counterparty: o => (o.counterparty || '').toLowerCase(), purpose: o => (o.purpose || '').toLowerCase(), project: o => o.project || '', category: o => o.category || '', debit: o => Number(o.debit) || 0, credit: o => Number(o.credit) || 0 };
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
  main.innerHTML = head('Операции', `${res.total} операций${res.total > list.length ? `, показаны первые ${list.length}` : ''} · доход <b class="num">${money(t.income)}</b> · расход <b class="num">${money(t.expense)}</b> · остаток <b class="num">${money(t.net)}</b>${t.transfersIn || t.transfersOut ? ` · переводы между счетами ${money(t.transfersIn)} / ${money(t.transfersOut)}` : ''}`, `<button class="btn" data-act="allocate" title="Проект и договор для приходов по договорам клиентов">⇢ Разнести приходы</button> <button class="btn" data-act="stmt">⇪ Загрузить выписку</button> <button class="btn primary" data-act="opAdd">+ Операция</button>`) +
    `<div class="filters">${sel('f-year', years, q.year, 'Все годы')}${sel('f-ym', yearMonths, q.ym, 'Все месяцы')}<label class="fl">с <input type="date" id="f-from" value="${esc(q.from)}"></label><label class="fl">по <input type="date" id="f-to" value="${esc(q.to)}"></label>${sel('f-co', COMPANIES(), q.company, 'Все компании')}${sel('f-acc', accountOptions(), q.account, 'Все счета')}</div>` +
    `<div class="filters">${sel('f-cat', categoryOptions().slice(1), q.category, 'Все категории')}${sel('f-proj', projectOptions().slice(1), q.project, 'Все проекты')}${sel('f-kind', Object.entries(KIND_LABEL), q.kind, 'Все виды')}${sel('f-src', [['budget', 'Из таблицы бюджета'], ['statement', 'Из выписки'], ['manual', 'Введены вручную'], ['invoice', 'По счетам к оплате'], ['1c', 'Из 1С']], q.source, 'Любой источник')}<input id="f-min" type="number" placeholder="Сумма от" value="${esc(q.min)}" style="width:120px"><input id="f-max" type="number" placeholder="до" value="${esc(q.max)}" style="width:110px"><input id="f-text" placeholder="Поиск: контрагент, назначение" value="${esc(q.text)}" style="min-width:220px"><label class="chip ${q.untagged ? 'warn' : 'neutral'}" style="cursor:pointer"><input type="checkbox" id="f-untagged"${q.untagged ? ' checked' : ''} style="width:auto;margin-right:4px">не разнесено / авто (${t.untagged + t.auto})</label>${q.counterparty ? `<span class="chip accent">контрагент: ${esc(q.counterparty)} <button class="icon-btn" data-act="cpClear" style="padding:0 4px">✕</button></span>` : ''}${active ? '<button class="btn sm" data-act="reset">Сбросить фильтры</button>' : ''}</div>` +
    (list.length ? tbl([], [], '').replace('<thead><tr></tr></thead>', `<thead><tr>${th('opNo', '№')}${th('date', 'Дата')}${th('account', 'Счёт')}${th('counterparty', 'Контрагент')}${th('purpose', 'Назначение')}${th('project', 'Проект')}${th('category', 'Категория')}${th('comment', 'Комментарий')}${th('debit', 'Дебет', 'amt')}${th('credit', 'Кредит', 'amt')}<th></th></tr></thead>`).replace('<tbody></tbody>', `<tbody>${list.map(o => `<tr data-id="${esc(o.id)}" class="${catKind(o.category) === 'transfer' ? 'row-transfer' : ''}${(!o.category || !o.project) ? ' row-untagged' : ''}"><td class="nowrap faint num" title="Номер операции из выписки">${esc(o.opNo || '')}</td><td class="nowrap">${fdate(o.date)}${o.source === 'statement' ? '<div class="faint">выписка</div>' : ''}</td><td class="nowrap"><span title="${esc(accCompany(o.account))}">${esc(o.account)}</span></td><td><a href="#/ops?${qsOf(Object.assign({}, q, { counterparty: o.counterparty, untagged: q.untagged ? '1' : '' }))}" class="cp-link" title="Показать все операции контрагента"><b>${esc(cut(o.counterparty, 40))}</b></a></td><td class="muted" title="${esc(o.purpose)}">${esc(cut(o.purpose, 60))}</td><td>${isAdmin() ? `<button class="cell-edit${o.autoProject ? ' auto' : ''}${o.project ? '' : ' none'}" data-act="cell" data-id="${esc(o.id)}" data-field="project" title="${o.autoProject ? 'Автоподсказка — нажмите, чтобы подтвердить или изменить' : 'Изменить проект'}">${esc(o.project || '—')}${o.autoProject ? ' <i>авто</i>' : ''}</button>` : esc(o.project || '—')}</td><td>${isAdmin() ? `<button class="cell-edit${o.auto ? ' auto' : ''}${o.category ? '' : ' none'}" data-act="cell" data-id="${esc(o.id)}" data-field="category" title="${o.auto ? 'Автоподсказка — нажмите, чтобы подтвердить или изменить' : 'Изменить категорию'}">${esc(o.category || '—')}${o.auto ? ' <i>авто</i>' : ''}</button>` : esc(o.category || '—')}</td><td class="muted" title="${esc(o.comment)}">${esc(cut(o.comment, 40))}</td><td class="amt num">${o.debit ? money(o.debit) : ''}</td><td class="amt num ok-text">${o.credit ? money(o.credit) : ''}</td><td>${actions('ops', o.id, (o.auto || o.autoProject) ? `<button class="btn sm primary" data-act="confirm" data-id="${esc(o.id)}" title="Подтвердить автоподсказку">✓</button>` : '')}</td></tr>`).join('')}</tbody>`).replace('<tfoot></tfoot>', `<tfoot><tr><td colspan="8">Итого (${list.length})</td><td class="amt num">${money(list.reduce((s, o) => s + Number(o.debit || 0), 0))}</td><td class="amt num">${money(list.reduce((s, o) => s + Number(o.credit || 0), 0))}</td><td></td></tr></tfoot>`) : empty('Операций по этому фильтру нет'));
  const nav = (extra = {}) => { const ymv = $('#f-ym').value; location.hash = '#/ops?' + qsOf(Object.assign({ year: ymv ? '' : $('#f-year').value, ym: ymv, from: $('#f-from').value, to: $('#f-to').value, account: $('#f-acc').value, company: $('#f-co').value, category: $('#f-cat').value, project: $('#f-proj').value, kind: $('#f-kind').value, source: $('#f-src').value, min: $('#f-min').value, max: $('#f-max').value, text: $('#f-text').value, counterparty: q.counterparty, untagged: $('#f-untagged').checked ? '1' : '', sort: sort === 'date' && dir === 'desc' ? '' : sort, dir: sort === 'date' && dir === 'desc' ? '' : dir }, extra)); };
  ['#f-ym', '#f-from', '#f-to', '#f-acc', '#f-co', '#f-cat', '#f-proj', '#f-kind', '#f-src', '#f-untagged'].forEach(s => $(s).onchange = () => nav());
  $('#f-year').onchange = () => { $('#f-ym').value = ''; nav(); };
  ['#f-text', '#f-min', '#f-max'].forEach(s => $(s).onkeydown = e => { if (e.key === 'Enter') nav(); });
  main.querySelectorAll('th.sortable').forEach(h => h.onclick = () => { const id = h.dataset.sort; nav({ sort: id, dir: sort === id && dir === 'asc' ? 'desc' : sort === id ? 'asc' : (id === 'date' || id === 'debit' || id === 'credit' ? 'desc' : 'asc') }); });
  ACT.reset = () => { location.hash = '#/ops?year=' + today().slice(0, 4); };
  ACT.cpClear = () => { q.counterparty = ''; nav(); };
  const fields = [{ name: 'date', label: 'Дата', type: 'date', value: today(), half: true }, { name: 'account', label: 'Счёт', type: 'select', options: accountOptions(), half: true }, { name: 'debit', label: 'Дебет (ушло), ₸', type: 'number', step: '0.01', half: true }, { name: 'credit', label: 'Кредит (пришло), ₸', type: 'number', step: '0.01', half: true }, { name: 'counterparty', label: 'Контрагент', required: true }, { name: 'purpose', label: 'Назначение платежа' }, { name: 'project', label: 'Проект', type: 'select', options: projectOptions(), half: true }, { name: 'category', label: 'Категория', type: 'select', options: categoryOptions(), half: true }, { name: 'opNo', label: '№ операции (из выписки банка)', half: true }, { name: 'comment', label: 'Комментарий', half: true }];
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
  ACT.allocate = () => allocateIncomeModal();
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
  modal('Загрузить выписку из банка', `<div class="field"><label>Выписка: PDF Kaspi Business или Excel / CSV любого банка</label><input type="file" id="stmt-file" accept="application/pdf,.pdf,.xlsx,.csv"></div><p class="faint" style="margin-top:0">В Kaspi Business: Счёт → Выписка → Скачать PDF за нужный период. Уже загруженные операции (по дате, сумме и номеру документа) пропускаются, категории и проекты подставляются автоматически по истории и помечаются «авто».</p><div id="stmt-out"></div>`);
  $('#modal .modal-card').style.maxWidth = '960px';
  $('#stmt-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; const out = $('#stmt-out'); out.innerHTML = '<div class="boot">Читаю PDF…</div>';
    try {
      let parsed;
      if (/\.xlsx$/i.test(f.name)) { const wb = await window.MostXlsx.parse(new Uint8Array(await f.arrayBuffer())); parsed = wb.sheets.map(sh => window.MostStatement.fromRows(sh.rows)).sort((a, b) => b.ops.length - a.ops.length)[0] || { meta: {}, ops: [] }; }
      else if (/\.csv$/i.test(f.name)) { const objs = window.MostDomain.parseCSV(await f.text()); parsed = window.MostStatement.fromRows([Object.keys(objs[0] || {}), ...objs.map(o => Object.values(o))]); }
      else { const pdfjs = await loadPdfJs(); const pages = await window.MostStatement.fromPdfJs(pdfjs, new Uint8Array(await f.arrayBuffer())); parsed = window.MostStatement.parse(pages); }
      const { meta, ops } = parsed;
      if (!ops.length) { out.innerHTML = '<div class="notice warn">Операции в файле не найдены. PDF: выписка Kaspi Business. Excel/CSV: нужна строка заголовков с колонками «Дата», «Дебет»/«Кредит» (или «Сумма»), «Контрагент»/«Наименование», «Назначение».</div>'; return; }
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
          (fresh.length ? `<div class="tbl" style="max-height:340px;overflow:auto">${tbl([{ t: '№' }, { t: 'Дата' }, { t: 'Контрагент' }, { t: 'Назначение' }, { t: 'Дебет', cls: 'amt' }, { t: 'Кредит', cls: 'amt' }], fresh.slice(0, 300).map(o => `<tr><td class="faint num">${esc(o.opNo || '')}</td><td class="nowrap">${fdate(o.date)}</td><td>${esc(cut(o.counterparty, 36))}</td><td class="muted">${esc(cut(o.purpose, 70))}</td><td class="amt num">${o.debit ? money(o.debit) : ''}</td><td class="amt num ok-text">${o.credit ? money(o.credit) : ''}</td></tr>`)).replace('class="tbl"', 'class="tbl-inner"')}</div>${fresh.length > 300 ? `<p class="faint">Показаны первые 300 из ${fresh.length}</p>` : ''}` : '<div class="notice">Все операции из этой выписки уже есть в системе.</div>') +
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
  const [docs, ctsAll, stagesAll] = await Promise.all([api('/docs'), api('/contracts').catch(() => []), api('/stages').catch(() => [])]);
  const contractOpts = [['', '—'], ...ctsAll.map(c => [c.id, `${c.name || c.code}${c.title ? ' · ' + c.title : ''}`])], stageOpts = [['', '—'], ...stagesAll.map(x => [x.id, `${x.projectId} · ${x.name}`])];
  const u = params();
  const fs = u.get('status') || 'active', fp = u.get('project') || '', fy = u.get('year') || '';
  let list = docs.filter(d => fs === 'all' ? true : fs === 'active' ? d.status !== 'done' : fs === 'unpaid' ? (d.status === 'done' && !d.paid) : d.status === fs).filter(d => !fp || d.project === fp).filter(d => !fy || (d.actDate || d.createdAt || '').startsWith(fy));
  list.sort((a, b) => (a.status === 'done') - (b.status === 'done') || (b.actDate || b.createdAt || '').localeCompare(a.actDate || a.createdAt || ''));
  const accountants = state.people.filter(p => p.role === 'accountant');
  const years = [...new Set(docs.map(d => (d.actDate || d.createdAt || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const sum = list.reduce((s, d) => s + Number(d.amount || 0), 0);
  main.innerHTML = head('Акты и счета клиентам', (canW('docs') ? 'Запрос бухгалтеру → в работе → выставлен. Дальше отмечайте «подписан» и «оплачен». Старше 3 дней без движения — красным.' : 'Реестр АВР и счетов клиентам. Только просмотр.') + ` · показано ${list.length} на <b class="num">${money(sum)}</b>`, canW('docs') ? '<button class="btn primary" data-act="docAdd">+ Запрос бухгалтеру</button>' : '') +
    `<div class="filters">${sel('f-status', [['active', 'В работе у бухгалтера'], ['new', 'Новые'], ['in_progress', 'В работе'], ['done', 'Выставленные'], ['unpaid', 'Выставлены, не оплачены'], ['all', 'Все']], fs)}${sel('f-project', [...new Set(docs.map(d => d.project).filter(Boolean))].sort(), fp, 'Все проекты')}${sel('f-year', years, fy, 'Все годы')}</div>` +
    (list.length ? `<div class="q">${list.map(d => `<div class="q-card ${d.status}${d.status !== 'done' && d.daysWaiting > 3 ? ' overdue' : ''}"><div><div class="t">${esc(DOC_TYPE[d.type] || d.type)}${d.number ? ' ' + esc(d.number) : ''}${d.actDate ? ` от ${fdate(d.actDate)}` : ''} · ${esc(d.client || '—')}${d.project ? ` <span class="muted">/ ${esc(d.project)}</span>` : ''}</div><div class="m">${esc(d.description || '')}</div><div class="m">${d.amount ? `<b class="num">${money(d.amount)}</b> · ` : ''}${d.company ? esc(d.company) + ' · ' : ''}${d.requestedByName ? `запросил ${esc(d.requestedByName)} ${fdate(d.createdAt)}` : fdate(d.createdAt)}${d.assignedToName ? ` · назначено: ${esc(d.assignedToName)}` : ''}${d.doneAt ? ` · выставлен ${fdate(d.doneAt)}` : ''}${d.note ? ` · ${esc(d.note)}` : ''}</div></div><div class="side-col">${chip(d.status, DOC_ST)}<div style="margin-top:6px">${fileCell('docs', d)}</div>${d.status === 'done' ? ` <span class="chip ${d.signed ? 'ok' : 'neutral'}">${d.signed ? 'подписан' : 'не подписан'}</span> <span class="chip ${d.paid ? 'ok' : 'warn'}">${d.paid ? 'оплачен' + (d.paidAt ? ' ' + fdate(d.paidAt) : '') : 'не оплачен'}</span>` : `<div class="days">${d.daysWaiting}<span class="faint"> дн.</span></div>`}${canW('docs') ? `<div class="actions" style="margin-top:6px">${d.status === 'new' ? `<button class="btn sm" data-act="docStatus" data-id="${d.id}" data-status="in_progress">В работу</button>` : ''}${d.status !== 'done' ? `<button class="btn sm primary" data-act="docStatus" data-id="${d.id}" data-status="done">Выставлен</button>` : `${!d.signed ? `<button class="btn sm" data-act="docFlag" data-id="${d.id}" data-flag="signed">Подписан</button>` : ''}${!d.paid ? `<button class="btn sm primary" data-act="docFlag" data-id="${d.id}" data-flag="paid">Оплачен</button>` : ''}<button class="btn sm" data-act="docStatus" data-id="${d.id}" data-status="in_progress">Вернуть</button>`}<button class="btn sm" data-act="docEdit" data-id="${d.id}">✎</button><button class="btn sm danger" data-act="del" data-col="docs" data-id="${d.id}">✕</button></div>` : ''}</div></div>`).join('')}</div>` : empty('По этому фильтру ничего нет'));
  const nav = () => { location.hash = '#/docs?' + qsOf({ status: $('#f-status').value, project: $('#f-project').value, year: $('#f-year').value }); };
  ['#f-status', '#f-project', '#f-year'].forEach(s => $(s).onchange = nav);
  const docFields = () => [
    { name: 'type', label: 'Тип', type: 'select', options: [['act', 'АВР (акт выполненных работ)'], ['invoice_out', 'Счёт клиенту'], ['other', 'Другое']], half: true },
    { name: 'amount', label: 'Сумма, ₸', type: 'number', step: '0.01', half: true },
    { name: 'client', label: 'Заказчик', required: true, half: true, list: 'dl-cp' },
    { name: 'company', label: 'Наша компания', type: 'select', options: OUR(), half: true },
    { name: 'project', label: 'Проект', type: 'select', options: projectOptions(), half: true },
    { name: 'contractId', label: 'Договор', type: 'select', options: contractOpts, half: true },
    { name: 'stageId', label: 'Стадия проекта', type: 'select', options: stageOpts, half: true },
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

// ---- файлы у записей (счета, акты, договоры, КП) ----
const FILE_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';
const fileUrl = f => f && f.key ? (state.status && state.status.web ? '/_blob/' + f.key : '/api/files/' + encodeURIComponent(f.key)) : '';
const fileIcon = f => !f ? '' : /pdf/.test(f.type || '') ? '📄' : '🖼';
const guessType = f => f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : /\.jpe?g$/i.test(f.name) ? 'image/jpeg' : /\.png$/i.test(f.name) ? 'image/png' : /\.webp$/i.test(f.name) ? 'image/webp' : '');
const readAsBase64 = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('Не удалось прочитать файл')); r.readAsDataURL(file); });
async function uploadFile(col, id, file) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Файл больше 20 МБ');
  return api(`/${col}/${encodeURIComponent(id)}/file`, { method: 'POST', body: { name: file.name, type: guessType(file), data: await readAsBase64(file) } });
}
const FILE_TITLE = { invoices: r => `${r.contractor} — ${money(r.amount)}`, docs: r => `${DOC_TYPE[r.type] || r.type || 'Документ'}${r.number ? ' ' + r.number : ''} · ${r.client || ''}`, contracts: r => r.name || r.code || 'Договор', subcontracts: r => `${r.contractor || ''} · ${r.project || ''}`, proposals: r => r.title || 'КП' };
function showFile(col, rec) {
  const f = rec.file; if (!f) return; const url = fileUrl(f);
  modal((FILE_TITLE[col] || (r => r.id))(rec), `<p class="muted" style="margin-top:0">${esc(f.name)} · ${Math.max(1, Math.round((f.size || 0) / 1024))} КБ · загружен ${fdate(f.uploadedAt)} · <a href="${url}" target="_blank" rel="noopener">открыть в новой вкладке</a>${canW(col) ? ` · <button class="btn sm danger" data-act="fileDel" data-col="${col}" data-id="${esc(rec.id)}">удалить файл</button>` : ''}</p>${/pdf/.test(f.type || '') ? `<iframe class="preview-frame" src="${url}" title="${esc(f.name)}"></iframe>` : `<img class="preview-img" src="${url}" alt="${esc(f.name)}">`}`);
  $('#modal .modal-card').style.maxWidth = '1000px'; bind($('#modal-body'));
}
const fileCell = (col, r) => r.file ? `<button class="file-chip" data-act="fileShow" data-col="${col}" data-id="${esc(r.id)}" title="${esc(r.file.name)}">${fileIcon(r.file)} ${esc(cut(r.file.name, 20))}</button>${canW(col) ? ` <button class="btn sm" data-act="fileAttach" data-col="${col}" data-id="${esc(r.id)}" title="Заменить файл">📎</button>` : ''}` : (canW(col) ? `<button class="btn sm" data-act="fileAttach" data-col="${col}" data-id="${esc(r.id)}" title="Прикрепить файл (PDF или фото)">📎 файл</button>` : '<span class="faint">—</span>');
ACT.fileShow = async ({ col, id }) => { const r = await api(`/${col}/${encodeURIComponent(id)}`); showFile(col, r); };
ACT.fileAttach = ({ col, id }) => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = FILE_ACCEPT; inp.id = 'file-attach'; inp.hidden = true; document.body.appendChild(inp); inp.onchange = async () => { const f = inp.files[0]; inp.remove(); if (!f) return; try { toast('Загружаю файл…', 8000); await uploadFile(col, id, f); toast('Файл прикреплён'); route(); } catch (er) { toast(er.message, 5000); } }; inp.click(); };
ACT.fileDel = async ({ col, id }) => { if (!confirm('Удалить файл?')) return; await api(`/${col}/${encodeURIComponent(id)}/file`, { method: 'DELETE' }); closeModal(); toast('Файл удалён'); route(); };

// ---- invoices: счета к оплате (список и платёжный календарь) ----
const canApprove = () => state.user && ['owner', 'partner'].includes(state.user.role);
const approvedChip = i => i.status === 'paid' ? '' : (i.approved ? '<span class="chip ok" title="Согласован к оплате">✓ согласован</span>' : '<span class="chip neutral" title="Ждёт согласования владельца или партнёра">не согласован</span>');
SECTIONS.invoices = async main => {
  const inv = await api('/invoices');
  const u = params();
  const view = u.get('view') || 'list';
  const fc = u.get('company') || '', fs = u.get('status') || 'open', ft = (u.get('text') || '').toLowerCase();
  const byCo = {}; inv.filter(i => i.status === 'open').forEach(i => byCo[i.company] = (byCo[i.company] || 0) + Number(i.amount || 0));
  const cal = window.MostDomain.paymentCalendar(inv, today());
  const tabs = `<div class="tabs"><a href="#/invoices?${qsOf({ company: fc, status: fs, text: u.get('text') || '' })}" class="tab${view === 'list' ? ' active' : ''}">Список</a><a href="#/invoices?view=calendar" class="tab${view === 'calendar' ? ' active' : ''}">Платёжный календарь${cal.summary.overdue ? ` <span class="badge" style="display:inline-block">${cal.overdue.n}</span>` : ''}</a></div>`;
  const headHtml = head('Счета к оплате', `Открыто: ${Object.entries(byCo).map(([k, v]) => `<b>${esc(k)}</b> ${money(v)}`).join(' · ') || 'нет'} · просрочено <b class="num">${money(cal.summary.overdue)}</b> · на этой неделе <b class="num">${money(cal.summary.thisWeek)}</b> · не согласовано ${cal.summary.unapproved}`, canW('invoices') ? '<button class="btn" data-act="invImport">⇪ Загрузить из файла</button> <button class="btn primary" data-act="invAdd">+ Счёт</button>' : '');
  const rowActions = i => canW('invoices') ? `<div class="actions">${i.status !== 'paid' && !i.approved && canApprove() ? `<button class="btn sm" data-act="invApprove" data-id="${i.id}" data-approved="true" title="Согласовать к оплате">Согласовать</button>` : ''}${i.status !== 'paid' && i.approved && canApprove() ? `<button class="btn sm" data-act="invApprove" data-id="${i.id}" data-approved="false" title="Снять согласование">Отозвать</button>` : ''}${i.status !== 'paid' ? `<button class="btn sm primary" data-act="invStatus" data-id="${i.id}" data-status="paid">Оплачен</button>` : ''}${i.status === 'open' ? `<button class="btn sm" data-act="invStatus" data-id="${i.id}" data-status="held">Придержать</button>` : ''}${i.status === 'held' ? `<button class="btn sm" data-act="invStatus" data-id="${i.id}" data-status="open">К оплате</button>` : ''}<button class="btn sm" data-act="edit" data-id="${i.id}">✎</button><button class="btn sm danger" data-act="del" data-col="invoices" data-id="${i.id}">✕</button></div>` : '';
  if (view === 'calendar') {
    const groups = ['overdue', 'today', 'week', 'next', 'later', 'nodate'];
    main.innerHTML = headHtml + tabs + `<p class="muted">Неделя до ${fdate(cal.weekEnd)}, следующая до ${fdate(cal.nextWeekEnd)}. Срок оплаты ставится в карточке счёта (✎) или прямо здесь. «Согласовать» может владелец или партнёр.</p>` +
      groups.filter(g => cal[g].n).map(g => `<h2 class="${g === 'overdue' ? 'crit-text' : ''}">${esc(window.MostDomain.CAL_LABEL[g])} · ${cal[g].n} · <span class="num">${money(cal[g].sum)}</span>${cal[g].approved !== cal[g].sum ? ` <span class="faint">(согласовано ${money(cal[g].approved)})</span>` : ''}</h2>` +
        tbl([{ t: 'Срок' }, { t: 'Компания' }, { t: 'Контрагент' }, { t: 'Назначение' }, { t: 'Сумма', cls: 'amt' }, { t: 'Статус' }, { t: 'Файл' }, { t: '' }],
          cal[g].items.map(i => `<tr class="${g === 'overdue' ? 'row-untagged' : ''}"><td class="nowrap">${canW('invoices') ? `<input type="date" class="due-inline" data-id="${esc(i.id)}" value="${esc(i.dueDate || '')}" style="width:150px">` : fdate(i.dueDate)}</td><td>${esc(i.company)}</td><td><b>${esc(i.contractor)}</b>${i.number ? `<div class="faint">№ ${esc(i.number)}</div>` : ''}</td><td class="muted" title="${esc(i.purpose)}">${esc(cut(i.purpose, 60))}${i.project ? `<div class="faint">${esc(i.project)}</div>` : ''}</td><td class="amt num">${money(i.amount)}</td><td>${chip(i.status, INV_ST)} ${approvedChip(i)}</td><td>${fileCell('invoices', i)}</td><td>${rowActions(i)}</td></tr>`))).join('') +
      (groups.every(g => !cal[g].n) ? empty('Открытых счетов нет') : '');
    main.querySelectorAll('.due-inline').forEach(el => el.onchange = async () => { await api('/invoices/' + el.dataset.id, { method: 'PUT', body: { dueDate: el.value } }); toast('Срок сохранён'); route(); });
  } else {
    const list = inv.filter(i => (!fc || i.company === fc) && (fs === 'all' || i.status === fs) && (!ft || `${i.contractor} ${i.purpose} ${i.project} ${i.number || ''}`.toLowerCase().includes(ft))).sort((a, b) => (b.invoiceDate || '').localeCompare(a.invoiceDate || ''));
    const total = list.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    main.innerHTML = headHtml + tabs +
      `<div class="filters">${sel('f-co', COMPANIES(), fc, 'Обе компании')}${sel('f-st', [['open', 'К оплате'], ['held', 'Придержаны'], ['paid', 'Оплачены'], ['all', 'Все']], fs)}<input id="f-text" placeholder="Поиск: контрагент, назначение, №" value="${esc(u.get('text') || '')}" style="min-width:220px"></div>` +
      (list.length ? tbl([{ t: 'Дата / срок' }, { t: 'Компания' }, { t: 'Контрагент' }, { t: 'Назначение' }, { t: 'Проект' }, { t: 'Сумма', cls: 'amt' }, { t: 'Статус' }, { t: 'Файл' }, { t: '' }],
        list.map(i => `<tr class="${i.file ? 'row-click' : ''}" data-id="${esc(i.id)}"><td class="nowrap">${fdate(i.invoiceDate)}${i.number ? `<div class="faint">№ ${esc(i.number)}</div>` : ''}${i.dueDate && i.status !== 'paid' ? `<div class="${i.dueDate < today() ? 'crit-text' : 'faint'}">до ${fdate(i.dueDate)}</div>` : ''}</td><td>${esc(i.company)}</td><td><b>${esc(i.contractor)}</b></td><td class="muted" title="${esc(i.purpose)}">${esc(cut(i.purpose, 70))}</td><td class="muted">${esc(i.project)}</td><td class="amt num">${money(i.amount)}</td><td>${chip(i.status, INV_ST)}${i.paidAt ? `<div class="faint">${fdate(i.paidAt)}</div>` : ''} ${approvedChip(i)}</td><td>${fileCell('invoices', i)}</td><td>${rowActions(i)}</td></tr>`),
        `<tr><td colspan="5">Итого (${list.length})</td><td class="amt num">${money(total)}</td><td colspan="3"></td></tr>`) : empty('Счетов нет'));
    const nav = () => location.hash = '#/invoices?' + qsOf({ company: $('#f-co').value, status: $('#f-st').value, text: $('#f-text').value });
    $('#f-co').onchange = nav; $('#f-st').onchange = nav; $('#f-text').onkeydown = e => { if (e.key === 'Enter') nav(); };
    main.querySelectorAll('tr.row-click').forEach(tr => tr.onclick = () => { const i = inv.find(x => x.id === tr.dataset.id); if (i && i.file) showFile('invoices', i); });
  }
  const fields = [{ name: 'company', label: 'Компания', type: 'select', options: COMPANIES(), half: true }, { name: 'invoiceDate', label: 'Дата счёта', type: 'date', value: today(), half: true }, { name: 'contractor', label: 'Контрагент', required: true, half: true, list: 'dl-cp' }, { name: 'amount', label: 'Сумма, ₸', type: 'number', step: '0.01', required: true, half: true }, { name: 'number', label: '№ счёта', half: true }, { name: 'dueDate', label: 'Оплатить до', type: 'date', half: true }, { name: 'status', label: 'Статус', type: 'select', options: [['open', 'К оплате'], ['held', 'Придержать'], ['paid', 'Оплачен']], half: true }, ...(canApprove() ? [{ name: 'approved', label: 'Согласован к оплате', type: 'select', options: YESNO, half: true }] : []), { name: 'purpose', label: 'Назначение' }, { name: 'project', label: 'Проект', type: 'select', options: projectOptions(), half: true }, { name: 'category', label: 'Категория расхода (для операции)', type: 'select', options: categoryOptions(), half: true }];
  const prep = v => boolify(numify(v, ['amount']), canApprove() ? ['approved'] : []);
  ACT.invAdd = () => modal('Новый счёт', formHtml(fields), async v => { await api('/invoices', { method: 'POST', body: prep(v) }); toast('Счёт добавлен'); route(); });
  ACT.edit = ({ id }) => { const i = inv.find(x => x.id === id); modal('Счёт', formHtml(fields, i), async v => { await api('/invoices/' + id, { method: 'PUT', body: prep(v) }); toast('Сохранено'); route(); }); };
  ACT.invStatus = async ({ id, status }) => { await api('/invoices/' + id, { method: 'PUT', body: { status } }); toast(status === 'paid' ? 'Отмечен оплаченным — добавлена операция расхода' : 'Статус изменён'); route(); };
  ACT.invApprove = async ({ id, approved }) => { await api('/invoices/' + id, { method: 'PUT', body: { approved: approved === 'true' } }); toast(approved === 'true' ? 'Согласовано' : 'Согласование снято'); route(); };
  ACT.invImport = () => importInvoices(inv);
  bind(main);
};

// ---- импорт счетов из файлов: реестр Excel/CSV или PDF/фото счетов ----
function importInvoices(existing) {
  modal('Загрузить счета из файла', `<div class="field"><label>Файлы: реестр Excel (.xlsx) / CSV или PDF-счета и фото (можно несколько сразу)</label><input type="file" id="inv-files" multiple accept=".xlsx,.csv,${FILE_ACCEPT}"></div><p class="faint" style="margin-top:0">Excel/CSV: колонки «Контрагент», «Сумма», «Назначение», «Проект», «Компания», «Дата» — по заголовку, а без заголовка по содержимому (как в реестре «к оплате»: строки «Проджект итого» / «Мост итого» задают компанию). PDF: типовой «Счёт на оплату № … от …» — номер, дата, поставщик, сумма и позиции читаются сами, файл прикрепляется к счёту. Уже существующие счета (компания + контрагент + сумма + назначение) помечаются как дубликаты.</p><div id="inv-out"></div>`);
  $('#modal .modal-card').style.maxWidth = '1100px';
  $('#inv-files').onchange = async e => {
    const files = [...e.target.files]; if (!files.length) return; const out = $('#inv-out'); out.innerHTML = '<div class="boot">Читаю файлы…</div>';
    const rows = [], errors = []; const D = window.MostDomain;
    for (const f of files) {
      try {
        if (/\.xlsx$/i.test(f.name)) { const wb = await window.MostXlsx.parse(new Uint8Array(await f.arrayBuffer())); for (const s of wb.sheets) D.invoicesFromRows(s.rows).items.forEach(it => rows.push(Object.assign(it, { _src: f.name + (wb.sheets.length > 1 ? ' / ' + s.name : '') }))); }
        else if (/\.csv$/i.test(f.name)) { const objs = D.parseCSV(await f.text()); D.invoicesFromRows([Object.keys(objs[0] || {}), ...objs.map(o => Object.values(o))]).items.forEach(it => rows.push(Object.assign(it, { _src: f.name }))); }
        else if (/pdf/.test(f.type) || /\.pdf$/i.test(f.name)) { const pdfjs = await loadPdfJs(); const pages = await window.MostStatement.fromPdfJs(pdfjs, new Uint8Array(await f.arrayBuffer())); const text = pages.map(p => window.MostStatement.lines(p).map(r => r.items.map(i => i.text).join(' ')).join('\n')).join('\n'); const it = D.parseInvoiceText(text); rows.push(Object.assign(it, { status: 'open', project: '', invoiceDate: it.invoiceDate || today(), contractor: it.contractor || f.name.replace(/\.pdf$/i, ''), _src: f.name, _file: f })); }
        else if (/^image\//.test(guessType(f))) rows.push({ company: '', contractor: f.name.replace(/\.\w+$/, ''), amount: 0, purpose: '', project: '', number: '', invoiceDate: today(), status: 'open', _src: f.name, _file: f });
        else errors.push(`${f.name}: неподдерживаемый формат`);
      } catch (er) { console.error(er); errors.push(`${f.name}: ${er.message || er}`); }
    }
    const keys = new Set(existing.map(D.invoiceKey)); rows.forEach(r => { r._dup = keys.has(D.invoiceKey(r)); });
    const fresh = rows.filter(r => !r._dup);
    out.innerHTML = (errors.length ? `<div class="notice warn">${errors.map(esc).join('<br>')}</div>` : '') +
      (rows.length ? `<div class="grid g3" style="margin-bottom:12px"><div class="card"><div class="label">Найдено счетов</div><div class="val num">${rows.length}</div><div class="foot">в файлах: ${files.length}</div></div><div class="card ${fresh.length ? 'ok' : ''}"><div class="label">Новых</div><div class="val num">${fresh.length}</div><div class="foot">дубликатов: ${rows.length - fresh.length}</div></div><div class="card"><div class="label">Сумма новых</div><div class="val num">${money(fresh.reduce((s, r) => s + (Number(r.amount) || 0), 0))}</div><div class="foot">проверьте компанию и суммы, поля можно править</div></div></div>` +
        `<div style="max-height:380px;overflow:auto">${tbl([{ t: '' }, { t: 'Дата' }, { t: 'Компания' }, { t: 'Контрагент' }, { t: 'Назначение' }, { t: 'Проект' }, { t: 'Сумма', cls: 'amt' }, { t: 'Источник' }], rows.map((r, i) => `<tr class="${r._dup ? 'row-transfer' : ''}"><td><input type="checkbox" class="inv-pick" data-i="${i}"${r._dup ? '' : ' checked'} style="width:auto"></td><td><input type="date" class="inv-date" data-i="${i}" value="${esc(r.invoiceDate)}" style="width:140px"></td><td>${sel('', COMPANIES(), r.company, '—').replace('id=""', `class="inv-co" data-i="${i}"`)}</td><td><input class="inv-cp" data-i="${i}" value="${esc(r.contractor)}" style="min-width:150px"></td><td><input class="inv-purp" data-i="${i}" value="${esc(r.purpose)}" style="min-width:200px"></td><td><input class="inv-proj" data-i="${i}" value="${esc(r.project)}" list="proj-list" style="width:110px"></td><td class="amt"><input type="number" step="0.01" class="inv-amt" data-i="${i}" value="${Number(r.amount) || ''}" style="width:130px;text-align:right"></td><td class="faint nowrap">${r._file ? fileIcon({ type: guessType(r._file) }) + ' ' : ''}${esc(cut(r._src, 26))}${r._dup ? ' <span class="chip neutral">уже есть</span>' : ''}</td></tr>`)).replace('class="tbl"', 'class="tbl-inner"')}</div><datalist id="proj-list">${state.projects.map(p => `<option value="${esc(p.id)}">`).join('')}</datalist>` +
        `<p style="margin-bottom:0"><button class="btn primary" id="inv-go">Загрузить выбранные</button> <span class="faint">Отмеченные дубликаты будут загружены повторно.</span></p>` : '<div class="notice">Счетов в файлах не найдено.</div>');
    const go = $('#inv-go'); if (!go) return;
    go.onclick = async () => {
      const picked = [...out.querySelectorAll('.inv-pick:checked')].map(c => Number(c.dataset.i)); if (!picked.length) return toast('Ничего не выбрано');
      const get = (cls, i) => { const el = out.querySelector(`.${cls}[data-i="${i}"]`); return el ? el.value : ''; };
      const items = picked.map(i => ({ ref: i, force: !!rows[i]._dup, number: rows[i].number || '', status: rows[i].status || 'open', invoiceDate: get('inv-date', i) || today(), company: get('inv-co', i), contractor: get('inv-cp', i).trim(), purpose: get('inv-purp', i).trim(), project: get('inv-proj', i).trim(), amount: Number(get('inv-amt', i)) || 0, source: 'file' }));
      const bad = items.filter(it => !it.contractor || !it.amount).length; if (bad) { toast(`У ${bad} счетов нет контрагента или суммы — заполните или снимите отметку`, 5000); return; }
      go.disabled = true;
      try {
        const r = await api('/invoices/bulk', { method: 'POST', body: { items } });
        let filesOk = 0, filesErr = 0;
        for (const c of r.items || []) { const src = rows[c.ref]; if (src && src._file) { try { await uploadFile('invoices', c.id, src._file); filesOk++; } catch (er) { filesErr++; console.error(er); } } }
        closeModal(); toast(`Загружено счетов: ${r.imported}${r.skipped ? `, пропущено ${r.skipped}` : ''}${filesOk ? `, файлов прикреплено ${filesOk}` : ''}${filesErr ? `, ошибок файлов ${filesErr}` : ''}`, 6000); route();
      } catch (er) { toast(er.message, 5000); go.disabled = false; }
    };
  };
}

// ---- projects ----
SECTIONS.projects = async main => {
  const rows = await api('/projects'); state.projects = rows;
  const summary = isAdmin() ? await api('/ops/summary').catch(() => ({})) : {};
  const contracts = await api('/contracts').catch(() => []);
  const u = params(); const fs = u.get('status') || 'active', ft = (u.get('text') || '').toLowerCase();
  const list = rows.filter(p => fs === 'all' ? true : fs === 'active' ? p.status !== 'archive' && p.status !== 'Завершён' : p.status === fs).filter(p => !ft || (p.id + ' ' + p.name + ' ' + (p.client || '')).toLowerCase().includes(ft));
  const byName = n => summary[n] || { credit: 0, debit: 0, n: 0 };
  const cSum = p => contracts.filter(c => c.code === p.id || c.name === p.name || c.code === p.name).reduce((s, c) => s + Number(c.sum || 0), 0);
  main.innerHTML = head('Проекты', 'Контракт, фактический приход и расход по операциям (без переводов), маржа', canW('projects') ? '<button class="btn primary" data-act="add">+ Проект</button>' : '') +
    `<div class="filters">${sel('f-st', [['active', 'В работе'], ['archive', 'Архив'], ['Завершён', 'Завершённые'], ['all', 'Все']], fs)}<input id="f-text" placeholder="Поиск" value="${esc(u.get('text') || '')}"></div>` +
    (list.length ? tbl([{ t: 'Проект' }, { t: 'Заказчик' }, { t: 'Контракт без НДС', cls: 'amt' }, { t: 'Договоры', cls: 'amt' }, { t: 'Приход факт', cls: 'amt' }, { t: 'Расход факт', cls: 'amt' }, { t: 'Маржа факт' }, { t: 'Статус' }, { t: '' }],
      list.map(p => { const s = byName(p.id).n ? byName(p.id) : byName(p.name); const m = s.credit ? Math.round((s.credit - s.debit) / s.credit * 100) + '%' : '—'; return `<tr><td><a href="#/project?id=${encodeURIComponent(p.id)}"><b>${esc(p.name)}</b></a>${p.id !== p.name && !/^prj-/.test(p.id) ? `<div class="faint">${esc(p.id)}</div>` : ''}</td><td class="muted">${esc(p.client || '')}</td><td class="amt num">${money0(p.contractNoVat)}</td><td class="amt num">${money0(cSum(p))}</td><td class="amt num">${isAdmin() ? `<a href="#/ops?project=${encodeURIComponent(p.id)}">${money0(s.credit)}</a>` : money0(s.credit)}</td><td class="amt num">${money0(s.debit)}</td><td>${m}</td><td>${chip(p.status, { 'В работе': ['accent', 'В работе'], 'Завершён': ['ok', 'Завершён'], 'Пауза': ['neutral', 'Пауза'], archive: ['neutral', 'Архив'] })}</td><td>${actions('projects', p.id)}</td></tr>`; })) : empty('Проектов нет'));
  const nav = () => location.hash = '#/projects?' + qsOf({ status: $('#f-st').value, text: $('#f-text').value });
  $('#f-st').onchange = nav; $('#f-text').onkeydown = e => { if (e.key === 'Enter') nav(); };
  const fields = (edit) => [{ name: 'id', label: 'Код (как в операциях)', required: !edit, half: true }, { name: 'name', label: 'Название', required: true, half: true }, { name: 'client', label: 'Заказчик' }, { name: 'contractNoVat', label: 'Контракт без НДС, ₸', type: 'number', half: true }, { name: 'targetCost', label: 'Целевая себестоимость, ₸', type: 'number', half: true }, { name: 'status', label: 'Статус', type: 'select', options: [['В работе', 'В работе'], ['Пауза', 'Пауза'], ['Завершён', 'Завершён'], ['archive', 'Архив']] }];
  ACT.add = () => modal('Проект', formHtml(fields(false)), async v => { await api('/projects', { method: 'POST', body: numify(v, ['contractNoVat', 'targetCost']) }); toast('Добавлено'); route(); });
  ACT.edit = ({ id }) => { const r = rows.find(x => x.id === id); modal('Проект', formHtml(fields(true).filter(f => f.name !== 'id'), r), async v => { await api('/projects/' + id, { method: 'PUT', body: numify(v, ['contractNoVat', 'targetCost']) }); toast('Сохранено'); route(); }); };
  bind(main);
};

// ---- contracts: реестр договоров с заказчиками ----
SECTIONS.contracts = async main => {
  const [rows, facts] = await Promise.all([api('/contracts'), isAdmin() ? api('/contracts/facts').catch(() => ({})) : Promise.resolve({})]);
  const projOf = c => window.MostDomain.contractProject(c, state.projects);
  const u = params(); const fc = u.get('company') || '', fs = u.get('status') || 'active', ft = (u.get('text') || '').toLowerCase();
  const list = rows.filter(c => (!fc || c.company === fc) && (fs === 'all' ? true : fs === 'active' ? !c.closed : fs === 'unsigned' ? !c.signed : c.closed)).filter(c => !ft || [c.code, c.name, c.title, c.client, c.clientShort].join(' ').toLowerCase().includes(ft)).sort((a, b) => String(b.id).localeCompare(String(a.id)));
  const tot = k => list.reduce((s, c) => s + Number(c[k] || 0), 0);
  main.innerHTML = head('Договоры с заказчиками', `${list.length} договоров · сумма <b class="num">${money(tot('sum'))}</b> · оплачено <b class="num">${money(tot('paid'))}</b> · остаток <b class="num">${money(tot('remaining'))}</b>`, canW('contracts') ? '<button class="btn primary" data-act="add">+ Договор</button>' : '') +
    `<div class="filters">${sel('f-co', OUR(), fc, 'Все наши компании')}${sel('f-st', [['active', 'Открытые'], ['unsigned', 'Не подписанные'], ['closed', 'Закрытые'], ['all', 'Все']], fs)}<input id="f-text" placeholder="Поиск: проект, заказчик, номер" value="${esc(u.get('text') || '')}" style="min-width:220px"></div>` +
    (list.length ? tbl([{ t: 'Проект / договор' }, { t: 'Заказчик' }, { t: 'Исполнитель' }, { t: 'Сумма', cls: 'amt' }, { t: 'Оплачено', cls: 'amt' }, { t: 'Остаток', cls: 'amt' }, { t: 'На оплату', cls: 'amt' }, { t: 'Закрыто актами', cls: 'amt' }, ...(isAdmin() ? [{ t: 'Факт по операциям', cls: 'amt' }] : []), { t: 'Подписан' }, { t: 'Файл' }, { t: '' }],
      list.map(c => { const pr = projOf(c), fc = facts[c.id]; return `<tr><td>${pr ? `<a href="#/project?id=${encodeURIComponent(pr.id)}"><b>${esc(c.name || c.code)}</b></a>` : `<b>${esc(c.name || c.code)}</b> <span class="chip warn" title="Проект не найден — выберите в карточке договора">нет проекта</span>`}${c.code && c.code !== c.name ? ` <span class="faint">${esc(c.code)}</span>` : ''}<div class="faint" title="${esc(c.title)}">${esc(cut(c.title, 60))}${c.dept ? ' · ' + esc(c.dept) : ''}</div>${c.note ? `<div class="faint">${esc(cut(c.note, 60))}</div>` : ''}</td><td>${esc(c.clientShort || '')}<div class="faint">${esc(cut(c.client, 40))}</div></td><td class="muted">${esc((c.company || '').replace('ТОО ', ''))}</td><td class="amt num">${money0(c.sum)}</td><td class="amt num">${money0(c.paid)}</td><td class="amt num">${money0(c.remaining)}</td><td class="amt num">${money0(c.toPay)}</td><td class="amt num">${money0(c.closedActs)}</td>${isAdmin() ? `<td class="amt num ok-text">${fc && fc.paidFact ? money(fc.paidFact) : '—'}${fc && fc.lastPayment ? `<div class="faint">${fdate(fc.lastPayment)}</div>` : ''}</td>` : ''}<td>${yn(c.signed)}${c.closed ? ' <span class="chip neutral">закрыт</span>' : ''}</td><td>${fileCell('contracts', c)}</td><td>${actions('contracts', c.id)}</td></tr>`; }),
      `<tr><td colspan="3">Итого (${list.length})</td><td class="amt num">${money(tot('sum'))}</td><td class="amt num">${money(tot('paid'))}</td><td class="amt num">${money(tot('remaining'))}</td><td class="amt num">${money(tot('toPay'))}</td><td class="amt num">${money(tot('closedActs'))}</td><td colspan="${isAdmin() ? 4 : 3}"></td></tr>`) : empty('Договоров нет'));
  const nav = () => location.hash = '#/contracts?' + qsOf({ company: $('#f-co').value, status: $('#f-st').value, text: $('#f-text').value });
  $('#f-co').onchange = nav; $('#f-st').onchange = nav; $('#f-text').onkeydown = e => { if (e.key === 'Enter') nav(); };
  const fields = [{ name: 'projectId', label: 'Проект (связка для карточки проекта)', type: 'select', options: projectOptions() }, { name: 'code', label: 'Код проекта', half: true }, { name: 'name', label: 'Краткое название', required: true, half: true }, { name: 'title', label: 'Номер / название по договору' }, { name: 'dept', label: 'Отдел (ЭП, РП, АН…)', half: true }, { name: 'company', label: 'Исполнитель (наша компания)', type: 'select', options: ['ТОО MOST Project', 'ТОО MOST Architects', 'ИП PANA Design', 'ИП MOST Design'], half: true }, { name: 'clientShort', label: 'Заказчик (кратко)', half: true }, { name: 'client', label: 'Заказчик (ТОО)', half: true, list: 'dl-cp' }, { name: 'sum', label: 'Сумма контракта, ₸', type: 'number', required: true, half: true }, { name: 'paid', label: 'Оплачено, ₸', type: 'number', half: true }, { name: 'remaining', label: 'Остаток, ₸', type: 'number', half: true }, { name: 'toPay', label: 'На оплату сейчас, ₸', type: 'number', half: true }, { name: 'toClose', label: 'На закрытие актами, ₸', type: 'number', half: true }, { name: 'closedActs', label: 'Закрыто актами, ₸', type: 'number', half: true }, { name: 'signed', label: 'Подписан', type: 'select', options: YESNO, half: true }, { name: 'closed', label: 'Проект закрыт', type: 'select', options: YESNO, half: true }, { name: 'link', label: 'Ссылка на документ' }, { name: 'note', label: 'Примечание' }];
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
  main.innerHTML = head('Договоры с подрядчиками', `${list.length} договоров · сумма <b class="num">${money(tot('sum'))}</b> · оплачено <b class="num">${money(tot('paid'))}</b> · остаток <b class="num">${money(tot('remaining'))}</b>`, canW('subcontracts') ? '<button class="btn primary" data-act="add">+ Договор</button>' : '') +
    `<div class="filters">${sel('f-proj', [...new Set(rows.map(c => c.project).filter(Boolean))].sort(), fp, 'Все проекты')}${sel('f-st', [['active', 'Открытые'], ['debt', 'С остатком к оплате'], ['closed', 'Закрытые'], ['all', 'Все']], fs)}<input id="f-text" placeholder="Поиск: подрядчик, раздел" value="${esc(u.get('text') || '')}"></div>` +
    (list.length ? tbl([{ t: 'Проект' }, { t: 'Раздел' }, { t: 'Подрядчик / договор' }, { t: 'Заказчик' }, { t: 'Сумма', cls: 'amt' }, { t: 'Оплачено', cls: 'amt' }, { t: 'По бюджету', cls: 'amt' }, { t: 'Остаток', cls: 'amt' }, { t: 'На оплату', cls: 'amt' }, { t: 'Подписан' }, { t: 'Файл' }, { t: '' }],
      list.map(c => `<tr><td>${state.projects.some(p => p.id === c.project || p.name === c.project) ? `<a href="#/project?id=${encodeURIComponent((state.projects.find(p => p.id === c.project || p.name === c.project) || {}).id)}"><b>${esc(c.project)}</b></a>` : `<b>${esc(c.project)}</b>`}</td><td>${esc(c.section || '')}</td><td>${esc(c.contractor)}<div class="faint" title="${esc(c.title)}">${esc(cut(c.title, 50))}</div>${c.note ? `<div class="faint">${esc(cut(c.note, 50))}</div>` : ''}</td><td class="muted">${esc((c.company || '').replace('ТОО ', ''))}</td><td class="amt num">${money0(c.sum)}</td><td class="amt num">${money0(c.paid)}</td><td class="amt num">${money0(c.byBudget)}</td><td class="amt num">${money0(c.remaining)}</td><td class="amt num">${money0(c.toPay)}</td><td>${yn(c.signed)}${c.closed ? ' <span class="chip neutral">закрыт</span>' : ''}</td><td>${fileCell('subcontracts', c)}</td><td>${actions('subcontracts', c.id)}</td></tr>`),
      `<tr><td colspan="4">Итого (${list.length})</td><td class="amt num">${money(tot('sum'))}</td><td class="amt num">${money(tot('paid'))}</td><td class="amt num">${money(tot('byBudget'))}</td><td class="amt num">${money(tot('remaining'))}</td><td class="amt num">${money(tot('toPay'))}</td><td colspan="3"></td></tr>`) : empty('Договоров нет'));
  const nav = () => location.hash = '#/subcontracts?' + qsOf({ project: $('#f-proj').value, status: $('#f-st').value, text: $('#f-text').value });
  $('#f-proj').onchange = nav; $('#f-st').onchange = nav; $('#f-text').onkeydown = e => { if (e.key === 'Enter') nav(); };
  const fields = [{ name: 'project', label: 'Проект', required: true, half: true, list: 'dl-projects' }, { name: 'section', label: 'Раздел (КЖ, ОВ, ЭЛ…)', half: true }, { name: 'contractor', label: 'Подрядчик', required: true, half: true, list: 'dl-cp' }, { name: 'company', label: 'Заказчик (наша компания)', type: 'select', options: ['ТОО MOST Project', 'ТОО MOST Architects'], half: true }, { name: 'title', label: 'Номер / название договора' }, { name: 'sum', label: 'Сумма, ₸', type: 'number', required: true, half: true }, { name: 'paid', label: 'Оплачено, ₸', type: 'number', half: true }, { name: 'byBudget', label: 'По бюджету, ₸', type: 'number', half: true }, { name: 'remaining', label: 'Остаток, ₸', type: 'number', half: true }, { name: 'toPay', label: 'На оплату, ₸', type: 'number', half: true }, { name: 'closedActs', label: 'Закрыто актами, ₸', type: 'number', half: true }, { name: 'signed', label: 'Подписан', type: 'select', options: YESNO, half: true }, { name: 'closed', label: 'Закрыт', type: 'select', options: YESNO, half: true }, { name: 'link', label: 'Ссылка на документ' }, { name: 'note', label: 'Примечание' }];
  const NUM = ['sum', 'paid', 'byBudget', 'remaining', 'toPay', 'closedActs'];
  ACT.add = () => modal('Договор с подрядчиком', formHtml(fields), async v => { await api('/subcontracts', { method: 'POST', body: boolify(numify(v, NUM), ['signed', 'closed']) }); toast('Добавлено'); route(); });
  ACT.edit = ({ id }) => { const r = rows.find(x => x.id === id); modal('Договор с подрядчиком', formHtml(fields, r), async v => { await api('/subcontracts/' + id, { method: 'PUT', body: boolify(numify(v, NUM), ['signed', 'closed']) }); toast('Сохранено'); route(); }); };
  bind(main);
};

// ---- proposals: коммерческие предложения ----
SECTIONS.proposals = async main => {
  const rows = (await api('/proposals')).sort((a, b) => String(b.id).localeCompare(String(a.id)));
  main.innerHTML = head('Коммерческие предложения', `${rows.length} КП · сумма <b class="num">${money(rows.reduce((s, r) => s + Number(r.sum || 0), 0))}</b>`, canW('proposals') ? '<button class="btn primary" data-act="add">+ КП</button>' : '') +
    (rows.length ? tbl([{ t: '№' }, { t: 'Название' }, { t: 'Заказчик' }, { t: 'Сумма', cls: 'amt' }, { t: 'Статус' }, { t: 'Контакт с клиентом' }, { t: 'Документ' }, { t: 'Файл' }, { t: '' }],
      rows.map(r => `<tr><td>${esc(r.no || '')}</td><td><b>${esc(r.title)}</b></td><td>${esc(r.client || '')}</td><td class="amt num">${money0(r.sum)}</td><td>${chip(r.status, { 'У клиента': ['warn', 'У клиента'], 'Выполнено': ['ok', 'Выполнено'], 'Отказ': ['crit', 'Отказ'], 'В работе': ['accent', 'В работе'] })}</td><td class="muted">${esc(r.contact || '')}</td><td>${r.kp ? `<button class="file-chip" data-act="kpOpen" data-id="${esc(r.id)}" title="Открыть генератор КП">📝 ${esc((KP_TEMPLATES[r.kp.template] || {}).label || 'КП')}</button>` : (canW('proposals') ? `<div class="actions">${Object.entries(KP_TEMPLATES).map(([k, v]) => `<button class="btn sm" data-act="kpNew" data-id="${esc(r.id)}" data-tpl="${k}" title="${esc(v.label)}">${k === 'concept' ? 'Концепт' : k.toUpperCase()}</button>`).join('')}</div>` : '')}</td><td>${fileCell('proposals', r)}</td><td>${actions('proposals', r.id)}</td></tr>`)) : empty('КП нет'));
  const fields = [{ name: 'no', label: '№', half: true }, { name: 'sum', label: 'Сумма, ₸', type: 'number', half: true }, { name: 'title', label: 'Название', required: true }, { name: 'project', label: 'Проект (код)', half: true, list: 'dl-projects' }, { name: 'client', label: 'Заказчик', half: true, list: 'dl-cp' }, { name: 'contact', label: 'Контакт с клиентом (кто ведёт)', half: true }, { name: 'status', label: 'Статус', type: 'select', options: ['У клиента', 'В работе', 'Выполнено', 'Отказ'] }];
  ACT.add = () => modal('Коммерческое предложение', formHtml(fields), async v => { await api('/proposals', { method: 'POST', body: numify(v, ['sum']) }); toast('Добавлено'); route(); });
  ACT.edit = ({ id }) => { const r = rows.find(x => x.id === id); modal('Коммерческое предложение', formHtml(fields, r), async v => { await api('/proposals/' + id, { method: 'PUT', body: numify(v, ['sum']) }); toast('Сохранено'); route(); }); };
  const saveKp = id => async (kp, total) => { await api('/proposals/' + id, { method: 'PUT', body: { kp, sum: total } }); toast('КП сохранено'); route(); };
  ACT.kpNew = ({ id, tpl }) => { const r = rows.find(x => x.id === id); kpEditor(r, kpDefault(tpl, r), saveKp(id)); };
  ACT.kpOpen = ({ id }) => { const r = rows.find(x => x.id === id); kpEditor(r, Object.assign(kpDefault(r.kp.template, r), r.kp), saveKp(id)); };
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
  main.innerHTML = head('Обязательные платежи', `Постоянные траты в месяц: <b>${money(total)}</b>. Кнопка «Счета за месяц» создаёт счета к оплате по каждому платежу (один раз на месяц) и уменьшает остаток рассрочки.`, '<button class="btn" data-act="oblInvoices">🧾 Счета за месяц</button> <button class="btn primary" data-act="add">+ Платёж</button>') +
    (rows.length ? tbl([{ t: 'Платёж' }, { t: 'Компания' }, { t: 'В месяц', cls: 'amt' }, { t: 'Тип' }, { t: 'День оплаты' }, { t: 'Осталось' }, { t: 'Остаток', cls: 'amt' }, { t: 'Примечание' }, { t: '' }],
      rows.map(r => `<tr><td><b>${esc(r.name)}</b>${r.contractor ? `<div class="faint">${esc(r.contractor)}</div>` : ''}</td><td class="muted">${esc(r.company || '')}</td><td class="amt num">${money(r.monthly)}</td><td>${esc(r.kind || '')}</td><td>${r.dueDay ? esc(r.dueDay) + '-е' : '10-е'}</td><td>${r.monthsLeft ? r.monthsLeft + ' мес' : '—'}</td><td class="amt num">${r.monthsLeft ? money(r.monthly * r.monthsLeft) : '—'}</td><td class="muted">${esc(r.note || '')}</td><td>${actions('obligations', r.id)}</td></tr>`),
      `<tr><td colspan="2">Итого в месяц</td><td class="amt num">${money(total)}</td><td colspan="6"></td></tr>`) : empty('Пусто'));
  const fields = [{ name: 'name', label: 'Название', required: true, half: true }, { name: 'contractor', label: 'Контрагент (кому платим)', half: true }, { name: 'monthly', label: 'В месяц, ₸', type: 'number', required: true, half: true }, { name: 'company', label: 'Компания-плательщик', type: 'select', options: OUR(), half: true }, { name: 'kind', label: 'Тип', type: 'select', options: ['Регулярный', 'Рассрочка'], half: true }, { name: 'dueDay', label: 'День оплаты (число месяца)', type: 'number', min: 1, half: true }, { name: 'monthsLeft', label: 'Осталось месяцев (для рассрочки)', type: 'number', min: 0, half: true }, { name: 'category', label: 'Категория расхода', type: 'select', options: categoryOptions(), half: true }, { name: 'note', label: 'Примечание' }];
  ACT.add = () => modal('Обязательный платёж', formHtml(fields), async v => { await api('/obligations', { method: 'POST', body: numify(v, ['monthly', 'monthsLeft', 'dueDay']) }); toast('Добавлено'); route(); });
  ACT.edit = ({ id }) => { const r = rows.find(x => x.id === id); modal('Платёж', formHtml(fields, r), async v => { await api('/obligations/' + id, { method: 'PUT', body: numify(v, ['monthly', 'monthsLeft', 'dueDay']) }); toast('Сохранено'); route(); }); };
  ACT.oblInvoices = () => modal('Счета к оплате из обязательных платежей', `<form><div class="field"><label>Месяц</label><input type="month" name="ym" value="${today().slice(0, 7)}" required></div><p class="faint">Для каждого платежа появится счёт «К оплате» со сроком в день оплаты. Уже созданные за этот месяц пропускаются.</p><div class="error"></div><button class="btn primary block" type="submit">Создать счета</button></form>`, async v => { const r = await api('/obligations/invoices', { method: 'POST', body: { ym: v.ym } }); toast(`Создано счетов: ${r.created}${r.skipped ? `, пропущено ${r.skipped}` : ''}`, 5000); location.hash = '#/invoices?view=calendar'; });
  bind(main);
};

// ---- reports: отчёт по месяцам, категориям, проектам ----
SECTIONS.reports = async main => {
  const u = params(); const year = u.get('year') || today().slice(0, 4), company = u.get('company') || '';
  const [months, r] = await Promise.all([api('/ops/months'), api('/ops/report?' + qsOf({ year, company }))]);
  const years = [...new Set(months.map(x => x.ym.slice(0, 4)))].sort().reverse();
  const pct = x => Math.round(x * 100) + '%';
  const sumTbl = (rows, label, n = 30) => rows.length ? tbl([{ t: label }, { t: 'Сумма', cls: 'amt' }, { t: 'Доля' }], rows.slice(0, n).map(x => { const tot = rows.reduce((s, y) => s + y.sum, 0); return `<tr><td>${esc(x.key || '—')}</td><td class="amt num">${money(x.sum)}</td><td class="muted">${tot ? pct(x.sum / tot) : ''}</td></tr>`; })) : empty('Нет данных');
  main.innerHTML = head('Отчёты', `${year}${company ? ' · ' + esc(company) : ''} · доход <b class="num">${money(r.total.income)}</b> · расход <b class="num">${money(r.total.expense)}</b> · чистыми <b class="num ${r.total.net < 0 ? 'crit-text' : ''}">${money(r.total.net)}</b> · операций ${r.total.n} (без переводов между счетами)`, `<a class="btn" href="/api/export/1c/ops.csv?${qsOf({ year, company })}" download>⇩ Операции ${year} в CSV</a>`) +
    `<div class="filters">${sel('f-year', years, year)}${sel('f-co', COMPANIES(), company, 'Обе компании')}</div>` +
    `<h2>По месяцам</h2>` + tbl([{ t: 'Месяц' }, { t: 'Доход', cls: 'amt' }, { t: 'Расход', cls: 'amt' }, { t: 'Чистыми', cls: 'amt' }, { t: 'Нарастающим', cls: 'amt' }, { t: 'Операций' }],
      r.months.map(m => `<tr class="${!m.n ? 'muted' : ''}"><td><a href="#/ops?ym=${m.ym}${company ? '&company=' + encodeURIComponent(company) : ''}">${esc(mname(m.ym))}</a></td><td class="amt num ok-text">${m.income ? money(m.income) : ''}</td><td class="amt num">${m.expense ? money(m.expense) : ''}</td><td class="amt num ${m.net < 0 ? 'crit-text' : ''}">${m.n ? money(m.net) : ''}</td><td class="amt num ${m.cum < 0 ? 'crit-text' : ''}">${m.n ? money(m.cum) : ''}</td><td class="muted">${m.n || ''}</td></tr>`),
      `<tr><td>Итого</td><td class="amt num">${money(r.total.income)}</td><td class="amt num">${money(r.total.expense)}</td><td class="amt num">${money(r.total.net)}</td><td></td><td>${r.total.n}</td></tr>`) +
    `<h2>По компаниям</h2>` + tbl([{ t: 'Компания' }, { t: 'Доход', cls: 'amt' }, { t: 'Расход', cls: 'amt' }, { t: 'Чистыми', cls: 'amt' }], Object.entries(r.byCompany).sort((a, b) => b[1].income - a[1].income).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="amt num">${money(v.income)}</td><td class="amt num">${money(v.expense)}</td><td class="amt num ${v.income - v.expense < 0 ? 'crit-text' : ''}">${money(v.income - v.expense)}</td></tr>`)) +
    `<div class="grid g2" style="margin-top:14px"><div><h2 style="margin-top:0">Расходы по категориям</h2>${sumTbl(r.categories, 'Категория', 40)}</div><div><h2 style="margin-top:0">Доход по проектам</h2>${sumTbl(r.projectsIn, 'Проект', 40)}</div></div>` +
    `<div class="grid g2" style="margin-top:14px"><div><h2 style="margin-top:0">Расходы по проектам</h2>${sumTbl(r.projectsOut, 'Проект', 40)}</div><div><h2 style="margin-top:0">Крупнейшие получатели</h2>${sumTbl(r.counterparties, 'Контрагент', 30)}</div></div>`;
  const nav = () => location.hash = '#/reports?' + qsOf({ year: $('#f-year').value, company: $('#f-co').value });
  $('#f-year').onchange = nav; $('#f-co').onchange = nav;
  bind(main);
};

// ---- counterparties: справочник контрагентов ----
const CP_KIND = { client: ['accent', 'Заказчик'], contractor: ['warn', 'Подрядчик'], supplier: ['neutral', 'Поставщик'], other: ['neutral', 'Прочее'] };
SECTIONS.counterparties = async main => {
  const [rows, stats] = await Promise.all([api('/counterparties'), isAdmin() ? api('/counterparties/stats').catch(() => ({})) : Promise.resolve({})]);
  state.counterparties = rows; refreshCpList();
  const u = params(); const fk = u.get('kind') || '', ft = (u.get('text') || '').toLowerCase();
  const list = rows.filter(c => (!fk || c.kind === fk) && (!ft || [c.name, c.short, c.bin, ...(c.aliases || [])].join(' ').toLowerCase().includes(ft))).sort((a, b) => (stats[b.id] ? stats[b.id].income + stats[b.id].expense : 0) - (stats[a.id] ? stats[a.id].income + stats[a.id].expense : 0) || a.name.localeCompare(b.name));
  const st = id => stats[id] || { contracts: 0, contractsSum: 0, subcontracts: 0, invoicesOpen: 0, income: 0, expense: 0, ops: 0, projects: [], lastOp: '' };
  main.innerHTML = head('Контрагенты', `${rows.length} записей · заказчиков ${rows.filter(c => c.kind === 'client').length} · подрядчиков ${rows.filter(c => c.kind === 'contractor').length}. Псевдонимы — как контрагент пишется в выписках и договорах: по ним связываются операции, договоры и счета.`, canW('counterparties') ? `<button class="btn" data-act="cpRebuild" title="Добавить всех, кого нет, из договоров, подрядчиков, счетов и операций">↻ Собрать из данных</button> <button class="btn primary" data-act="cpAdd">+ Контрагент</button>` : '') +
    `<div class="filters">${sel('f-kind', Object.entries(CP_KIND).map(([k, v]) => [k, v[1]]), fk, 'Все типы')}<input id="f-text" placeholder="Поиск: название, БИН, псевдоним" value="${esc(u.get('text') || '')}" style="min-width:240px"></div>` +
    (list.length ? tbl([{ t: 'Контрагент' }, { t: 'Тип' }, { t: 'Договоры' }, ...(isAdmin() ? [{ t: 'Приход', cls: 'amt' }, { t: 'Расход', cls: 'amt' }, { t: 'Операций' }] : []), { t: 'Проекты' }, { t: '' }],
      list.slice(0, 400).map(c => { const s = st(c.id); return `<tr><td><b>${esc(c.name)}</b>${c.short && c.short !== c.name ? ` <span class="faint">(${esc(c.short)})</span>` : ''}${c.bin ? `<div class="faint">БИН ${esc(c.bin)}</div>` : ''}${(c.aliases || []).length ? `<div class="faint" title="${esc((c.aliases || []).join(' · '))}">ещё ${(c.aliases || []).length} написаний</div>` : ''}</td><td>${chip(c.kind || 'other', CP_KIND)}</td><td>${s.contracts ? `${s.contracts} на ${money(s.contractsSum)}` : ''}${s.subcontracts ? `<div class="faint">подряд: ${s.subcontracts}</div>` : ''}${s.invoicesOpen ? `<div class="crit-text">к оплате ${money(s.invoicesOpen)}</div>` : ''}</td>${isAdmin() ? `<td class="amt num ok-text">${s.income ? money(s.income) : ''}</td><td class="amt num">${s.expense ? money(s.expense) : ''}</td><td class="muted">${s.ops ? `<a href="#/ops?year=&counterparty=${encodeURIComponent(c.name)}">${s.ops}</a>${s.lastOp ? `<div class="faint">${fdate(s.lastOp)}</div>` : ''}` : ''}</td>` : ''}<td class="muted">${s.projects.slice(0, 4).map(p => `<a href="#/project?id=${encodeURIComponent(p)}">${esc(cut(p, 18))}</a>`).join(', ')}${s.projects.length > 4 ? ` +${s.projects.length - 4}` : ''}</td><td>${canW('counterparties') ? `<div class="actions"><button class="btn sm" data-act="cpMerge" data-id="${esc(c.id)}" title="Объединить с другой записью">⇆</button>${actions('counterparties', c.id)}</div>` : ''}</td></tr>`; }),
      list.length > 400 ? `<tr><td colspan="9">Показаны первые 400 из ${list.length}</td></tr>` : '') : empty(rows.length ? 'Ничего не найдено' : 'Справочник пуст — нажмите «Собрать из данных»'));
  const nav = () => location.hash = '#/counterparties?' + qsOf({ kind: $('#f-kind').value, text: $('#f-text').value });
  $('#f-kind').onchange = nav; $('#f-text').onkeydown = e => { if (e.key === 'Enter') nav(); };
  const fields = [{ name: 'name', label: 'Название (как в договоре)', required: true }, { name: 'short', label: 'Кратко', half: true }, { name: 'kind', label: 'Тип', type: 'select', options: Object.entries(CP_KIND).map(([k, v]) => [k, v[1]]), half: true }, { name: 'bin', label: 'БИН / ИИН', half: true }, { name: 'iban', label: 'IBAN', half: true }, { name: 'aliases', label: 'Другие написания (по одному в строке)', type: 'textarea' }, { name: 'contact', label: 'Контакт (имя, телефон, почта)' }, { name: 'note', label: 'Примечание' }];
  const prep = v => Object.assign(v, { aliases: String(v.aliases || '').split(/\n/).map(x => x.trim()).filter(Boolean) });
  const toForm = c => Object.assign({}, c, { aliases: (c.aliases || []).join('\n') });
  ACT.cpAdd = () => modal('Контрагент', formHtml(fields), async v => { await api('/counterparties', { method: 'POST', body: prep(v) }); toast('Добавлено'); route(); });
  ACT.edit = ({ id }) => { const c = rows.find(x => x.id === id); modal('Контрагент', formHtml(fields, toForm(c)), async v => { await api('/counterparties/' + id, { method: 'PUT', body: prep(v) }); toast('Сохранено'); route(); }); };
  ACT.cpRebuild = async () => { const r = await api('/counterparties/rebuild', { method: 'POST' }); toast(`Добавлено контрагентов: ${r.added}, всего ${r.total}`, 5000); route(); };
  ACT.cpMerge = ({ id }) => { const c = rows.find(x => x.id === id); modal(`Объединить «${c.name}» с…`, `<form><div class="field"><label>Оставить запись</label><select name="into" required>${rows.filter(x => x.id !== id).sort((a, b) => a.name.localeCompare(b.name)).map(x => `<option value="${esc(x.id)}">${esc(x.name)}${x.short ? ' (' + esc(x.short) + ')' : ''}</option>`).join('')}</select></div><p class="faint">Название и все написания «${esc(c.name)}» станут псевдонимами выбранной записи, а сама запись удалится.</p><div class="error"></div><button class="btn primary block" type="submit">Объединить</button></form>`, async v => { await api(`/counterparties/${encodeURIComponent(id)}/merge`, { method: 'POST', body: { into: v.into } }); toast('Объединено'); route(); }); };
  bind(main);
};

// ---- project card: карточка проекта, стадии, план/факт ----
const STAGE_KINDS = ['Форэскиз', 'Концепция', 'Эскизный проект', 'Рабочий проект', 'Авторский надзор', 'Дизайн-проект', 'Экспертиза', 'Другое'];
const pbar = (v, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, Math.round(v || 0)))}%"></i></div>`;
SECTIONS.project = async main => {
  const id = params().get('id'); if (!id) { location.hash = '#/projects'; return; }
  const c = await api(`/projects/${encodeURIComponent(id)}/card`); const p = c.project; const f = c.fact, pl = c.plan;
  const sst = window.MostDomain.STAGE_STATUS; const stChip = s => chip(s, { plan: ['neutral', sst.plan], work: ['accent', sst.work], done: ['ok', sst.done], paid: ['ok', sst.paid], hold: ['warn', sst.hold] });
  const months = Object.entries(c.byMonth || {}).sort();
  main.innerHTML = `<p class="faint" style="margin:0 0 6px"><a href="#/projects">← Проекты</a></p>` + head(p.name, `${p.id !== p.name ? esc(p.id) + ' · ' : ''}${esc(c.client || 'заказчик не указан')} · ${esc(p.status || '')}${c.progress !== null ? ` · готовность ${c.progress}%` : ''}`, canW('projects') ? `<button class="btn" data-act="stageAdd">+ Стадия</button> <button class="btn" data-act="projEdit">✎ Проект</button>` : '') +
    (c.admin ? `<div class="grid g4" style="margin-bottom:14px">
      <div class="card"><div class="label">Договоры</div><div class="val num">${money(c.contracts.reduce((s, x) => s + Number(x.sum || 0), 0))}</div><div class="foot">${c.contracts.length} шт. · оплачено по операциям ${money(c.contracts.reduce((s, x) => s + Number(x.paidFact || 0), 0))}</div></div>
      <div class="card"><div class="label">Приход факт <a href="#/ops?year=&project=${encodeURIComponent(p.id)}">→</a></div><div class="val num ok-text">${money(f.income)}</div><div class="foot">план ${money(pl.income)} · акты ${money(f.actsSum)} (оплачено ${money(f.actsPaid)})</div></div>
      <div class="card"><div class="label">Расход факт</div><div class="val num">${money(f.expense)}</div><div class="foot">план ${money(pl.expense)} · подряд ${money(f.subSum)} (оплачено ${money(f.subPaid)})${f.untagged ? ` · <span class="crit-text">${f.untagged} без категории/авто</span>` : ''}</div></div>
      <div class="card ${f.margin < 0 ? 'crit' : 'ok'}"><div class="label">Маржа факт</div><div class="val num">${money(f.margin)}</div><div class="foot">${f.marginPct !== null ? Math.round(f.marginPct * 100) + '% · ' : ''}план ${money(pl.margin)} · операций ${f.n}</div></div></div>` : '') +
    `<h2>Стадии</h2>` + (c.stages.length ? tbl([{ t: 'Стадия' }, { t: 'Сроки' }, { t: 'Готовность' }, { t: 'План, ₸', cls: 'amt' }, ...(c.admin ? [{ t: 'Акты', cls: 'amt' }, { t: 'Приход факт', cls: 'amt' }, { t: 'Расход план / факт', cls: 'amt' }] : []), { t: 'Статус' }, { t: '' }],
      c.stages.map(s => `<tr><td><b>${esc(s.name)}</b>${s.kind && s.kind !== s.name ? `<div class="faint">${esc(s.kind)}</div>` : ''}${s.responsible ? `<div class="faint">${esc(s.responsible)}</div>` : ''}</td><td class="nowrap">${s.start ? fdate(s.start) : '—'} – ${s.end ? fdate(s.end) : '—'}${s.end && s.end < today() && s.status !== 'done' && s.status !== 'paid' ? '<div class="crit-text">срок прошёл</div>' : ''}</td><td style="min-width:120px">${pbar(s.progress)}<span class="faint">${Number(s.progress) || 0}%</span></td><td class="amt num">${money0(s.planSum)}</td>${c.admin ? `<td class="amt num">${money0(s.actsSum)}${s.actsPaid ? `<div class="faint">оплачено ${money(s.actsPaid)}</div>` : ''}</td><td class="amt num ok-text">${money0(s.factIncome)}</td><td class="amt num">${money0(s.planCost)} / ${money0(s.factExpense)}</td>` : ''}<td>${stChip(s.status || 'plan')}</td><td>${canW('stages') ? `<div class="actions"><button class="btn sm" data-act="stageEdit" data-id="${esc(s.id)}">✎</button><button class="btn sm danger" data-act="stageDel" data-id="${esc(s.id)}">✕</button></div>` : ''}</td></tr>`),
      `<tr><td colspan="3">Итого</td><td class="amt num">${money(c.stages.reduce((s, x) => s + Number(x.planSum || 0), 0))}</td>${c.admin ? `<td class="amt num">${money(c.stages.reduce((s, x) => s + Number(x.actsSum || 0), 0))}</td><td class="amt num">${money(c.stages.reduce((s, x) => s + Number(x.factIncome || 0), 0))}</td><td class="amt num">${money(c.stages.reduce((s, x) => s + Number(x.planCost || 0), 0))} / ${money(c.stages.reduce((s, x) => s + Number(x.factExpense || 0), 0))}</td>` : ''}<td colspan="2"></td></tr>`) : empty('Стадий нет. Добавьте ЭП, РП, авторский надзор — с плановой суммой и сроками, тогда появится план/факт по стадиям.')) +
    `<div class="grid g2" style="margin-top:14px"><div><h2 style="margin-top:0">Договоры с заказчиком</h2>${c.contracts.length ? tbl([{ t: 'Договор' }, { t: 'Сумма', cls: 'amt' }, ...(c.admin ? [{ t: 'Оплачено по операциям', cls: 'amt' }, { t: 'Остаток (по таблице)', cls: 'amt' }] : []), { t: '' }], c.contracts.map(x => `<tr><td><b>${esc(x.title || x.name)}</b><div class="faint">${esc(x.clientShort || x.client || '')}${x.closed ? ' · закрыт' : ''}</div></td><td class="amt num">${money0(x.sum)}</td>${c.admin ? `<td class="amt num ok-text">${money0(x.paidFact)}${x.lastPayment ? `<div class="faint">посл. ${fdate(x.lastPayment)}</div>` : ''}</td><td class="amt num">${money0(x.remaining)}</td>` : ''}<td>${fileCell('contracts', x)}</td></tr>`)) : empty('Договоры не привязаны. В карточке договора выберите проект.')}</div>
    <div><h2 style="margin-top:0">Акты и счета клиенту</h2>${c.acts.length ? tbl([{ t: 'Документ' }, { t: 'Сумма', cls: 'amt' }, { t: 'Статус' }], c.acts.map(d => `<tr><td>${esc(DOC_TYPE[d.type] || d.type)} ${esc(d.number || '')}${d.actDate ? ` от ${fdate(d.actDate)}` : ''}<div class="faint">${esc(cut(d.description, 50))}</div></td><td class="amt num">${money0(d.amount)}</td><td>${chip(d.status, DOC_ST)}${d.status === 'done' ? (d.paid ? ' <span class="chip ok">оплачен</span>' : ' <span class="chip warn">не оплачен</span>') : ''}</td></tr>`)) : empty('Актов нет')}</div></div>` +
    (c.admin ? `<div class="grid g2" style="margin-top:14px"><div><h2 style="margin-top:0">Расходы по категориям</h2>${Object.keys(c.byCategory).length ? tbl([{ t: 'Категория' }, { t: 'Сумма', cls: 'amt' }], Object.entries(c.byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="amt num">${money(v)}</td></tr>`)) : empty('Расходов нет')}</div><div><h2 style="margin-top:0">По месяцам</h2>${months.length ? tbl([{ t: 'Месяц' }, { t: 'Приход', cls: 'amt' }, { t: 'Расход', cls: 'amt' }], months.map(([ym, v]) => `<tr><td><a href="#/ops?ym=${ym}&project=${encodeURIComponent(p.id)}">${esc(mname(ym))}</a></td><td class="amt num ok-text">${v.income ? money(v.income) : ''}</td><td class="amt num">${v.expense ? money(v.expense) : ''}</td></tr>`)) : empty('Операций нет')}</div></div>` : '') +
    (c.subcontracts.length ? `<h2>Подрядчики</h2>${tbl([{ t: 'Раздел' }, { t: 'Подрядчик' }, { t: 'Сумма', cls: 'amt' }, { t: 'Оплачено', cls: 'amt' }, { t: 'Остаток', cls: 'amt' }], c.subcontracts.map(x => `<tr><td>${esc(x.section || '')}</td><td>${esc(x.contractor)}<div class="faint">${esc(cut(x.title, 40))}</div></td><td class="amt num">${money0(x.sum)}</td><td class="amt num">${money0(x.paid)}</td><td class="amt num">${money0(x.remaining)}</td></tr>`))}` : '');
  const sFields = [{ name: 'name', label: 'Название стадии', required: true, half: true }, { name: 'kind', label: 'Тип', type: 'select', options: STAGE_KINDS, half: true }, { name: 'planSum', label: 'План приход (сумма по договору), ₸', type: 'number', half: true }, { name: 'planCost', label: 'План расход (бюджет стадии), ₸', type: 'number', half: true }, { name: 'start', label: 'Начало', type: 'date', half: true }, { name: 'end', label: 'Срок сдачи', type: 'date', half: true }, { name: 'progress', label: 'Готовность, %', type: 'number', min: 0, half: true }, { name: 'status', label: 'Статус', type: 'select', options: Object.entries(sst), half: true }, { name: 'responsible', label: 'Ответственный', half: true }, { name: 'order', label: 'Порядок', type: 'number', half: true }, { name: 'note', label: 'Примечание' }];
  const sPrep = v => Object.assign(numify(v, ['planSum', 'planCost', 'progress', 'order']), { projectId: p.id });
  ACT.stageAdd = () => modal('Стадия проекта', formHtml(sFields, { order: c.stages.length + 1, status: 'plan', kind: 'Эскизный проект' }), async v => { await api('/stages', { method: 'POST', body: sPrep(v) }); toast('Стадия добавлена'); route(); });
  ACT.stageEdit = ({ id }) => { const s = c.stages.find(x => x.id === id); modal('Стадия проекта', formHtml(sFields, s), async v => { await api('/stages/' + id, { method: 'PUT', body: sPrep(v) }); toast('Сохранено'); route(); }); };
  ACT.stageDel = async ({ id }) => { if (!confirm('Удалить стадию?')) return; await api('/stages/' + id, { method: 'DELETE' }); toast('Удалено'); route(); };
  ACT.projEdit = () => { const fields = [{ name: 'name', label: 'Название', required: true }, { name: 'client', label: 'Заказчик', half: true, list: 'dl-cp' }, { name: 'status', label: 'Статус', type: 'select', options: ['В работе', 'Пауза', 'Завершён', 'archive'], half: true }, { name: 'contractNoVat', label: 'Контракт без НДС, ₸', type: 'number', half: true }, { name: 'targetCost', label: 'Целевая себестоимость, ₸', type: 'number', half: true }]; modal('Проект', formHtml(fields, p), async v => { await api('/projects/' + encodeURIComponent(p.id), { method: 'PUT', body: numify(v, ['contractNoVat', 'targetCost']) }); toast('Сохранено'); route(); }); };
  bind(main);
};

// ---- ops: авторазнесение приходов по договорам/проектам ----
async function allocateIncomeModal() {
  modal('Разнести приходы по проектам', '<div class="boot">Ищу договоры клиентов…</div>');
  $('#modal .modal-card').style.maxWidth = '1100px';
  const r = await api('/ops/allocate', { method: 'POST', body: { apply: false } }); const list = r.proposals;
  const body = $('#modal-body');
  if (!list.length) { body.innerHTML = '<div class="notice">Все приходы уже разнесены или для оставшихся не найден договор клиента. Проверьте, что заказчики договоров есть в справочнике контрагентов (кнопка «Собрать из данных»).</div>'; return; }
  body.innerHTML = `<p class="muted" style="margin-top:0">Найдено ${list.length} приходов на <b class="num">${money(list.reduce((s, a) => s + a.credit, 0))}</b>. Проект берётся из договора клиента; операции получат пометку «авто» — подтвердите их в списке «не разнесено / авто». Снимите отметку с ошибочных.</p>` +
    `<div style="max-height:420px;overflow:auto">${tbl([{ t: '' }, { t: 'Дата' }, { t: 'Контрагент' }, { t: 'Сумма', cls: 'amt' }, { t: 'Сейчас' }, { t: 'Проект →' }, { t: 'Договор' }, { t: 'Основание' }], list.map((a, i) => `<tr><td><input type="checkbox" class="al-pick" data-i="${i}" checked style="width:auto"></td><td class="nowrap">${fdate(a.date)}</td><td>${esc(cut(a.counterparty, 30))}</td><td class="amt num">${money(a.credit)}</td><td class="muted">${esc(a.current || '—')}</td><td><b>${esc(a.project)}</b></td><td class="muted">${esc(cut(a.contract, 44))}</td><td class="faint">${esc(a.reason)}${a.candidates > 1 ? ` (договоров у клиента: ${a.candidates})` : ''}</td></tr>`)).replace('class="tbl"', 'class="tbl-inner"')}</div>` +
    `<p style="margin-bottom:0"><button class="btn primary" id="al-go">Разнести отмеченные</button></p>`;
  $('#al-go').onclick = async () => { const ids = [...body.querySelectorAll('.al-pick:checked')].map(c => list[Number(c.dataset.i)].id); if (!ids.length) return toast('Ничего не выбрано'); $('#al-go').disabled = true; const rr = await api('/ops/allocate', { method: 'POST', body: { apply: true, ids } }); closeModal(); toast(`Разнесено приходов: ${rr.applied}`, 5000); location.hash = '#/ops?year=' + today().slice(0, 4) + '&kind=income&untagged=1'; route(); };
}

// ---- КП: шаблоны и генератор ----
const KP_COMMON = { company: 'ТОО «MOST Architects»', address: 'г. Алматы, ул. Утеген батыра 11в к6/1', phone: '+7 771 733 77 00', site: 'most-a.com', email: 'info@most-a.com', director: 'Иманкулов И.Т.' };
const KP_TEMPLATES = {
  concept: { label: 'Концепция (форэскиз, концепция, ЭП)', subject: 'на разработку форэскиза, концепции и эскизного проекта', stage: 'Форэскиз, концепция и эскизный проект', mode: 'area', rate: 2000, vatRate: 12,
    areas: [{ name: 'Площадь наземных этажей', m2: 0, coef: 1 }, { name: 'Подземный этаж — паркинг', m2: 0, coef: 1 }], areasNote: 'Стоимость работ подлежит пересчёту по фактической площади объекта, утверждённой на стадии эскизного проекта, с сохранением ставки за квадратный метр.',
    stages: [
      { name: 'Стадия 1. Форэскиз', share: 10, term: '1 неделя', works: ['Градостроительный анализ участка и окружения, ограничения застройки', 'Варианты посадки и объёмно-пространственного решения', 'Предварительные технико-экономические показатели', 'Выбор направления для дальнейшей проработки'] },
      { name: 'Стадия 2. Концепция', share: 20, term: '1 месяц', works: ['Посадка комплекса на участок, генеральный план, отступы от границ', 'Объёмно-пространственное решение, этажность, силуэт', 'Технико-экономические показатели, коэффициенты застройки и использования территории', 'Архитектурное решение фасадов, ведомость отделочных материалов', 'Визуализации — 8–11 ракурсов (экстерьер, интерьеры общественных зон)', 'Комплект презентационных материалов для градостроительного совета'] },
      { name: 'Стадия 3. Эскизный проект', share: 70, term: '2 месяца', works: ['Планировочные решения этажей', 'Планировка подземного этажа, расчёт машино-мест по действующему нормативу', 'Баланс территории: озеленение, покрытия, проезды, площадки', 'Схема транспортного обслуживания, узлы въезда, пожарные проезды', 'Фасады и характерные разрезы', 'Пояснительная записка', 'Комплект документации для получения архитектурно-планировочного задания'] }],
    termsNote: 'Отсчёт срока каждой стадии начинается с даты поступления аванса и передачи заказчиком исходных данных в полном объёме.',
    payments: ['Стадия 1: аванс 50 % при подписании договора, 50 % по передаче материалов стадии', 'Стадия 2: аванс 50 % при старте стадии, 50 % по передаче материалов стадии', 'Стадия 3: аванс 50 % при старте стадии, 50 % по передаче материалов стадии', 'Рабочие файлы и исходники передаются заказчику после полной оплаты соответствующей стадии'],
    excluded: ['Рабочая документация и проектно-сметная документация', 'Смежные разделы: конструктивные решения, отопление и вентиляция, водоснабжение и канализация, электроснабжение, слаботочные системы, проект организации строительства', 'Инженерно-геологические и геодезические изыскания, топографическая съёмка', 'Авторский надзор за строительством', 'Ведение согласований в государственных органах. Бюро участвует в защите проектных решений, подача и сопровождение — на стороне заказчика'],
    conditions: ['Исходные данные, предоставляемые заказчиком: топографическая съёмка, правоустанавливающие документы на участок, архитектурно-планировочное задание, технические условия на подключение к инженерным сетям, задание на проектирование', 'Изменение состава работ, площади объекта или градостроительных условий влечёт пересмотр стоимости и сроков'], validity: '30 календарных дней' },
  ep: { label: 'Эскизный проект (ЭП)', subject: 'на разработку эскизного проекта', stage: 'Эскизный проект (ЭП)', mode: 'area', rate: 1050, vatRate: 16,
    areas: [{ name: 'Коммерция', m2: 0, coef: 1 }, { name: 'Жилой сектор', m2: 0, coef: 1 }, { name: 'Паркинг', m2: 0, coef: 0.5 }], areasNote: 'Реализуемая площадь принята по данным заказчика по категориям. К паркингу применён понижающий коэффициент.',
    stages: [{ name: 'Эскизный проект', share: 100, term: '80 рабочих дней', works: ['Генеральный план', 'Разработка планировочных решений', 'Разработка концепции фасадов', 'Разработка концепции благоустройства дворовых пространств', 'Эскиз наружного фасадного освещения', 'Финальное согласование планировочных решений', 'Финальное согласование фасада', 'Разработка визуализаций — 8–10 изображений', 'Сбор альбома эскизного проекта'] }],
    termsNote: 'Отсчёт срока начинается с даты поступления аванса и передачи заказчиком исходных данных в полном объёме.',
    payments: ['Аванс — 41 % при подписании договора', 'Промежуточная оплата — 41 % после согласования проекта заказчиком', 'Промежуточная оплата — 9 % после выполнения работ эскизного проекта', 'Окончательный расчёт — 9 % после согласования проекта государственными органами'],
    excluded: ['Рабочая документация и проектно-сметная документация', 'Смежные разделы: конструктивные решения, инженерные сети, проект организации строительства', 'Инженерно-геологические и геодезические изыскания, топографическая съёмка', 'Авторский надзор за строительством', 'Ведение согласований в государственных органах: бюро участвует в защите проектных решений, подача и сопровождение — на стороне заказчика'],
    conditions: ['Исходные данные, предоставляемые заказчиком: топографическая съёмка, правоустанавливающие документы на участок, архитектурно-планировочное задание, технические условия, задание на проектирование', 'Изменение состава работ, площади объекта или градостроительных условий влечёт пересмотр стоимости и сроков'], validity: '10 рабочих дней' },
  rp: { label: 'Рабочий проект (РП)', subject: 'на разработку рабочего проекта', stage: 'Рабочий проект (РП)', mode: 'area', rate: 3500, vatRate: 16,
    areas: [{ name: 'Наземная часть', m2: 0, coef: 1 }, { name: 'Подземный паркинг', m2: 0, coef: 0.6 }], areasNote: 'Площадь принята по утверждённому эскизному проекту. Стоимость подлежит уточнению по фактическим ТЭП после экспертизы с сохранением ставки за квадратный метр. Ставка по умолчанию — проверьте перед отправкой.',
    stages: [
      { name: 'Архитектурные решения (АР)', share: 25, term: '6 недель', works: ['Планы этажей, кровли, разрезы, фасады', 'Ведомости отделки, заполнения проёмов, перемычек', 'Узлы и детали, спецификации'] },
      { name: 'Конструктивные решения (КЖ, КМ)', share: 22, term: '8 недель', works: ['Расчёт несущих конструкций', 'Фундаменты, каркас, перекрытия, лестницы', 'Чертежи армирования, спецификации'] },
      { name: 'Отопление, вентиляция, кондиционирование (ОВ)', share: 10, term: '5 недель', works: ['Тепловой и воздушный баланс', 'Схемы и планы систем, подбор оборудования', 'Спецификации'] },
      { name: 'Водоснабжение и канализация (ВК)', share: 8, term: '4 недели', works: ['Расчёт расходов, схемы сетей', 'Планы и аксонометрия, подбор оборудования', 'Спецификации'] },
      { name: 'Электроснабжение и освещение (ЭОМ)', share: 10, term: '5 недель', works: ['Расчёт нагрузок, однолинейные схемы', 'Планы силового оборудования и освещения', 'Спецификации'] },
      { name: 'Слаботочные системы (СС)', share: 5, term: '3 недели', works: ['Пожарная сигнализация и оповещение', 'СКУД, видеонаблюдение, СКС', 'Спецификации'] },
      { name: 'Генеральный план и благоустройство (ГП)', share: 8, term: '4 недели', works: ['Разбивочный план, план организации рельефа', 'Благоустройство, озеленение, покрытия', 'Сводный план инженерных сетей'] },
      { name: 'Проект организации строительства (ПОС)', share: 4, term: '2 недели', works: ['Стройгенплан, календарный график', 'Пояснительная записка'] },
      { name: 'Сметная документация', share: 4, term: '3 недели', works: ['Локальные и объектные сметы', 'Сводный сметный расчёт'] },
      { name: 'Пояснительная записка и сопровождение экспертизы', share: 4, term: 'по графику экспертизы', works: ['Общая пояснительная записка', 'Ответы на замечания экспертизы, корректировка'] }],
    termsNote: 'Разделы выполняются параллельно; общий срок выдачи полного комплекта — 4–5 месяцев с даты аванса и передачи исходных данных.',
    payments: ['Аванс — 30 % при подписании договора', '30 % — по выдаче разделов АР и КР', '30 % — по выдаче полного комплекта рабочей документации', '10 % — по получению положительного заключения экспертизы'],
    excluded: ['Инженерно-геологические и геодезические изыскания', 'Прохождение государственной экспертизы (оплата услуг экспертизы — заказчиком)', 'Специальные разделы: охрана окружающей среды, промышленная безопасность, технологические решения', 'Дизайн интерьеров и ландшафтный дизайн', 'Авторский надзор за строительством'],
    conditions: ['Исходные данные: утверждённый эскизный проект, архитектурно-планировочное задание, технические условия, результаты изысканий, задание на проектирование', 'Изменение утверждённых решений эскизного проекта в ходе рабочего проектирования влечёт пересмотр стоимости и сроков'], validity: '30 календарных дней' },
  an: { label: 'Авторский надзор (АН)', subject: 'на осуществление авторского надзора за строительством', stage: 'Авторский надзор (АН)', mode: 'fixed', vatRate: 16,
    items: [{ name: 'Авторский надзор за строительством', qty: 12, unit: 'мес', price: 1000000 }], areasNote: 'Стоимость указана за один месяц авторского надзора; период принят по графику строительства заказчика и подлежит уточнению.',
    stages: [{ name: 'Авторский надзор', share: 100, term: 'на период строительства', works: ['Выезды на объект по графику, не реже двух раз в неделю', 'Ведение журнала авторского надзора', 'Проверка соответствия выполняемых работ проектной документации', 'Консультации подрядчика по проектным решениям, ответы на запросы', 'Согласование замены материалов и изделий', 'Внесение изменений в рабочую документацию, вызванных условиями строительства', 'Участие в приёмке скрытых работ и ответственных конструкций'] }],
    termsNote: 'Срок авторского надзора равен сроку строительства по графику заказчика; при продлении строительства оплата продлевается помесячно.',
    payments: ['Ежемесячно, по акту выполненных работ, в течение 5 рабочих дней'],
    excluded: ['Технический надзор', 'Изменения проекта по инициативе заказчика — по отдельному расчёту', 'Повторная экспертиза изменений'],
    conditions: ['Заказчик обеспечивает доступ на объект и уведомляет о приёмке скрытых работ не позднее чем за 2 рабочих дня', 'Изменение объёма или срока строительства влечёт пересмотр стоимости'], validity: '30 календарных дней' },
};
const kpDefault = (tpl, r) => { const t = KP_TEMPLATES[tpl] || KP_TEMPLATES.ep; const d = new Date(); return Object.assign({ template: tpl, subject: t.subject, object: r.title || '', address: '', land: '', stage: t.stage, date: `${['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'][d.getMonth()]} ${d.getFullYear()} г.`, mode: t.mode, rate: t.rate || 0, vatRate: t.vatRate, vatIncluded: true, areas: JSON.parse(JSON.stringify(t.areas || [])), items: JSON.parse(JSON.stringify(t.items || [])), areasNote: t.areasNote, stages: JSON.parse(JSON.stringify(t.stages)), termsNote: t.termsNote, payments: t.payments.slice(), excluded: t.excluded.slice(), conditions: t.conditions.slice(), validity: t.validity, client: r.client || '' }, KP_COMMON); };
const kpMoney = n => new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0)) + ' ₸';
const kpM2 = n => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0) + ' м²';
function kpHtml(kp) {
  const c = window.MostDomain.kpCalc(kp); const li = arr => (arr || []).filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('');
  const params = [['Объект', kp.object], ['Адрес', kp.address], ['Земельный участок', kp.land], ['Заказчик', kp.client], ['Стадия', kp.stage], ['Дата предложения', kp.date]].filter(x => x[1]);
  let priceHtml;
  if (kp.mode === 'fixed') {
    priceHtml = `<table class="t"><tr><th>Наименование</th><th class="r">Кол-во</th><th class="r">Цена</th><th class="r">Сумма</th></tr>${(kp.items || []).map(i => `<tr><td>${esc(i.name)}</td><td class="r">${esc(i.qty)} ${esc(i.unit || '')}</td><td class="r">${kpMoney(i.price)}</td><td class="r"><b>${kpMoney(Number(i.qty) * Number(i.price))}</b></td></tr>`).join('')}<tr class="tot"><td colspan="3">Итого по предложению</td><td class="r">${kpMoney(c.total)}</td></tr></table>`;
  } else {
    const areas = (kp.areas || []).filter(a => Number(a.m2));
    priceHtml = `<table class="t"><tr><th>Категория</th><th class="r">Площадь</th><th class="r">Ставка, ₸/м²</th><th class="r">Коэф.</th><th class="r">Стоимость</th></tr>${areas.map(a => `<tr><td>${esc(a.name)}</td><td class="r">${kpM2(a.m2)}</td><td class="r">${new Intl.NumberFormat('ru-RU').format(Number(a.rate) || kp.rate)}</td><td class="r">${Number(a.coef) === 1 || !a.coef ? '—' : String(a.coef).replace('.', ',')}</td><td class="r"><b>${kpMoney(a.sum)}</b></td></tr>`).join('')}<tr class="tot"><td>Итого</td><td class="r">${kpM2(c.area)}</td><td></td><td></td><td class="r">${kpMoney(c.total)}</td></tr></table>` +
      (c.stages.length > 1 ? `<table class="t" style="margin-top:10px"><tr><th>Стадия</th><th class="r">Доля</th><th class="r">Срок</th><th class="r">Сумма</th></tr>${c.stages.map(s => `<tr><td>${esc(s.name)}</td><td class="r">${esc(s.share)} %</td><td class="r">${esc(s.term || '')}</td><td class="r"><b>${kpMoney(s.sum)}</b></td></tr>`).join('')}<tr class="tot"><td>Итого по предложению</td><td class="r">100 %</td><td></td><td class="r">${kpMoney(c.total)}</td></tr></table>` : '');
  }
  const vatLine = c.vatIncluded ? `Стоимость указана с учётом НДС ${Math.round(c.vatRate * 100)} %. В том числе: сумма без НДС — ${kpMoney(c.noVat)}, НДС — ${kpMoney(c.vatSum)}.` : `Стоимость указана без НДС. НДС ${Math.round(c.vatRate * 100)} % — ${kpMoney(c.vatSum)}, итого с НДС — ${kpMoney(c.withVat)}.`;
  let n = 0; const sec = (title, body) => `<h2>${++n}. ${title}</h2>${body}`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>КП — ${esc(kp.object || '')}</title><style>
  @page{size:A4;margin:18mm 16mm}body{font:11pt/1.45 "Neue Haas Grotesk Text Pro","Helvetica Neue",Helvetica,Arial,sans-serif;color:#000;margin:0;padding:24px;max-width:820px}
  .hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5px solid #000;padding-bottom:10px;margin-bottom:22px}.hdr b{font-size:13pt;letter-spacing:.02em}.hdr .c{font-size:9pt;color:#686a6d;text-align:right}
  .logo{display:flex;align-items:center;gap:10px}.logo svg{width:34px;height:30px}
  h1{font-size:17pt;margin:0 0 4px;letter-spacing:-.01em}.sub{color:#686a6d;margin:0 0 18px}h2{font-size:11pt;color:#ff4d23;text-transform:uppercase;letter-spacing:.04em;margin:22px 0 8px;border-bottom:1px solid #000;padding-bottom:4px}h3{font-size:11pt;margin:12px 0 4px}
  table.p{border-collapse:collapse;width:100%;margin-bottom:6px}table.p td{padding:5px 8px 5px 0;border-bottom:1px solid #e5e5e5;vertical-align:top}table.p td:first-child{color:#686a6d;width:32%}
  table.t{border-collapse:collapse;width:100%}table.t th{font-size:9pt;color:#ff4d23;text-align:left;padding:6px 6px;border-bottom:1.5px solid #000}table.t td{padding:6px;border-bottom:1px solid #e5e5e5;vertical-align:top}table.t .r{text-align:right;white-space:nowrap}table.t tr.tot td{font-weight:700;border-top:1.5px solid #000;border-bottom:0}
  ul{margin:4px 0 8px;padding-left:0;list-style:none}li{padding-left:16px;position:relative;margin:2px 0}li::before{content:"—";position:absolute;left:0;color:#ff4d23}.note{font-size:9.5pt;color:#686a6d;font-style:italic;margin:8px 0}
  .sign{display:flex;justify-content:space-between;gap:40px;margin-top:40px;page-break-inside:avoid}.sign div{flex:1}.sign .l{border-bottom:1px solid #000;height:34px;margin:18px 0 4px}.sign small{color:#686a6d}
  @media print{body{padding:0}.noprint{display:none}}</style></head><body>
  <div class="hdr"><div class="logo"><svg viewBox="0 30 143 128"><path fill="#ff4d23" d="M0 30H60L103 70L74 99L40 67.5ZM40 67.5V158H0V102.5ZM103 69L142 30V158H103Z"/></svg><div><b>${esc(kp.company)}</b><div class="c" style="text-align:left">${esc(kp.address2 || KP_COMMON.address)}</div></div></div><div class="c">${esc(kp.site)} · ${esc(kp.email)} · ${esc(kp.phone)}</div></div>
  <h1>КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ</h1><p class="sub">${esc(kp.subject)}</p>
  <table class="p">${params.map(([k, v]) => `<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table>
  ${kp.mode !== 'fixed' ? sec('База расчёта стоимости', `<table class="p">${(kp.areas || []).filter(a => Number(a.m2)).map(a => `<tr><td>${esc(a.name)}</td><td style="text-align:right"><b>${kpM2(a.m2)}</b></td></tr>`).join('')}<tr><td><b>Расчётная площадь объекта</b></td><td style="text-align:right"><b>${kpM2(c.area)}</b></td></tr></table>${kp.areasNote ? `<p class="note">${esc(kp.areasNote)}</p>` : ''}`) : ''}
  ${sec('Стоимость работ', priceHtml + `<p class="note">${vatLine}</p>${kp.mode === 'fixed' && kp.areasNote ? `<p class="note">${esc(kp.areasNote)}</p>` : ''}`)}
  ${sec('Состав работ', c.stages.map(s => `<h3>${esc(s.name)}</h3><ul>${li(s.works)}</ul>`).join(''))}
  ${sec('Сроки выполнения', `<table class="p">${c.stages.map(s => `<tr><td>${esc(s.name)}</td><td><b>${esc(s.term || '—')}</b></td></tr>`).join('')}</table>${kp.termsNote ? `<p class="note">${esc(kp.termsNote)}</p>` : ''}`)}
  ${sec('Порядок оплаты', `<ul>${li(kp.payments)}</ul>`)}
  ${(kp.excluded || []).length ? sec('Не входит в настоящее предложение', `<p class="note">Перечисленные работы могут быть выполнены по отдельному договору.</p><ul>${li(kp.excluded)}</ul>`) : ''}
  ${sec('Условия', `<ul>${li(kp.conditions)}<li>Настоящее предложение действительно в течение ${esc(kp.validity)} с даты его направления</li></ul>`)}
  <div class="sign"><div><b>ИСПОЛНИТЕЛЬ</b><br>${esc(kp.company)}<div class="l"></div><small>Директор ${esc(kp.director)}, подпись, дата</small></div><div><b>ЗАКАЗЧИК</b><br>${esc(kp.client || '')}<div class="l"></div><small>подпись, дата</small></div></div>
  </body></html>`;
}
const linesOf = s => String(s || '').split(/\n/).map(x => x.replace(/^[—\-•]\s*/, '').trim()).filter(Boolean);
function kpEditor(r, kp, onSave) {
  const t = KP_TEMPLATES[kp.template] || KP_TEMPLATES.ep;
  const areasTxt = (kp.areas || []).map(a => `${a.name} | ${a.m2 || 0} | ${a.rate || ''} | ${a.coef == null ? 1 : a.coef}`).join('\n');
  const itemsTxt = (kp.items || []).map(i => `${i.name} | ${i.qty} | ${i.unit || ''} | ${i.price}`).join('\n');
  const stagesTxt = (kp.stages || []).map(s => `# ${s.name} | ${s.share} | ${s.term || ''}\n${(s.works || []).map(w => '— ' + w).join('\n')}`).join('\n\n');
  const f = (name, label, val, extra = '') => `<div class="field"><label>${esc(label)}</label><input name="${name}" value="${esc(val ?? '')}"${extra}></div>`;
  const ta = (name, label, val, rows = 4) => `<div class="field"><label>${esc(label)}</label><textarea name="${name}" rows="${rows}" style="font-family:ui-monospace,monospace;font-size:12px">${esc(val)}</textarea></div>`;
  modal(`КП: ${t.label}`, `<form id="kp-form"><div class="form-row">${f('template', 'Шаблон', '', '')}${f('date', 'Дата предложения', kp.date)}</div>
    ${f('subject', 'Предмет («на разработку …»)', kp.subject)}
    <div class="form-row">${f('object', 'Объект', kp.object)}${f('client', 'Заказчик', kp.client, ' list="dl-cp"')}</div>
    <div class="form-row">${f('address', 'Адрес', kp.address)}${f('land', 'Земельный участок', kp.land)}</div>
    <div class="form-row">${f('stage', 'Стадия', kp.stage)}${f('validity', 'Срок действия КП', kp.validity)}</div>
    <div class="form-row">${f('rate', kp.mode === 'fixed' ? 'Ставка (не используется)' : 'Ставка по умолчанию, ₸/м² (с НДС)', kp.rate, ' type="number" step="0.01"')}${f('vatRate', 'НДС, %', kp.vatRate, ' type="number" step="1"')}</div>
    ${kp.mode === 'fixed' ? ta('items', 'Позиции: название | кол-во | ед. | цена', itemsTxt, 3) : ta('areas', 'Площади: категория | м² | ставка (пусто = по умолчанию) | коэффициент', areasTxt, 4)}
    ${ta('areasNote', 'Примечание к расчёту', kp.areasNote, 2)}
    ${ta('stages', 'Стадии и состав работ: строка «# Название | доля % | срок», ниже работы по одной в строке', stagesTxt, 14)}
    ${ta('termsNote', 'Примечание к срокам', kp.termsNote, 2)}
    ${ta('payments', 'Порядок оплаты (по одному пункту в строке)', (kp.payments || []).join('\n'), 4)}
    ${ta('excluded', 'Не входит в предложение', (kp.excluded || []).join('\n'), 4)}
    ${ta('conditions', 'Условия', (kp.conditions || []).join('\n'), 3)}
    <div class="form-row">${f('company', 'Исполнитель', kp.company)}${f('director', 'Директор', kp.director)}</div>
    <div class="form-row">${f('address2', 'Адрес исполнителя', kp.address2 || KP_COMMON.address)}${f('phone', 'Телефон', kp.phone)}</div>
    <div class="error"></div><p style="margin:12px 0 0;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="kp-preview">Предпросмотр</button><button class="btn primary" type="submit">Сохранить КП</button><span class="faint" id="kp-total"></span></p></form><div id="kp-out" style="margin-top:12px"></div>`);
  $('#modal .modal-card').style.maxWidth = '1100px';
  const form = $('#kp-form'); form.querySelector('[name=template]').outerHTML = `<select name="template">${Object.entries(KP_TEMPLATES).map(([k, v]) => `<option value="${k}"${k === kp.template ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`;
  form.querySelector('[name=template]').onchange = e => { const nk = Object.assign(kpDefault(e.target.value, r), { object: form.object.value, client: form.client.value, address: form.address.value, land: form.land.value }); closeModal(); kpEditor(r, nk, onSave); };
  const collect = () => {
    const v = Object.fromEntries(new FormData(form).entries()); const out = Object.assign({}, kp, v, { rate: Number(v.rate) || 0, vatRate: Number(v.vatRate) || 0, address2: v.address2 });
    out.address = v.address; out.payments = linesOf(v.payments); out.excluded = linesOf(v.excluded); out.conditions = linesOf(v.conditions);
    if (kp.mode === 'fixed') out.items = linesOf(v.items).map(l => { const [name, qty, unit, price] = l.split('|').map(x => x.trim()); return { name, qty: Number(qty) || 0, unit, price: Number(String(price).replace(/\s/g, '')) || 0 }; });
    else out.areas = linesOf(v.areas).map(l => { const [name, m2, rate, coef] = l.split('|').map(x => x.trim()); const a = { name, m2: Number(String(m2).replace(/\s/g, '').replace(',', '.')) || 0, coef: coef === '' || coef == null ? 1 : Number(String(coef).replace(',', '.')) }; if (rate) a.rate = Number(String(rate).replace(/\s/g, '')); return a; });
    const stages = []; let cur = null;
    for (const line of String(v.stages || '').split(/\n/)) { const s = line.trim(); if (!s) continue; if (s.startsWith('#')) { const [name, share, term] = s.slice(1).split('|').map(x => x.trim()); cur = { name, share: Number(share) || 0, term: term || '', works: [] }; stages.push(cur); } else if (cur) cur.works.push(s.replace(/^[—\-•]\s*/, '')); }
    out.stages = stages; delete out.company2;
    // суммы по категориям с индивидуальной ставкой и коэффициентом
    if (out.mode !== 'fixed') { out.areas = out.areas.map(a => Object.assign(a, { sum: Math.round(a.m2 * (a.rate || out.rate) * (a.coef == null ? 1 : a.coef)) })); out.areaTotal = out.areas.reduce((s, a) => s + a.m2, 0); out.fixed = true; out.stages = out.stages.map(s => Object.assign(s, { sum: Math.round(out.areas.reduce((x, a) => x + a.sum, 0) * s.share / 100) })); }
    else { out.fixed = true; out.stages = out.stages.map((s, i) => Object.assign(s, { sum: i === 0 ? out.items.reduce((x, it) => x + it.qty * it.price, 0) : 0 })); }
    return out;
  };
  const showTotal = () => { const c = window.MostDomain.kpCalc(collect()); $('#kp-total').textContent = `Итого: ${money(c.total)}${c.vatIncluded ? ` (без НДС ${money(c.noVat)})` : ''}`; };
  form.oninput = showTotal; showTotal();
  $('#kp-preview').onclick = () => { const html = kpHtml(collect()); const fname = `КП-${(collect().object || 'MOST').replace(/[^\wа-яё\- ]/gi, '').slice(0, 40)}.html`; const web = !!(state.status && state.status.web); $('#kp-out').innerHTML = `<p style="margin:0 0 6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">${web ? '' : '<button class="btn" type="button" id="kp-print">🖨 Печать / сохранить в PDF</button>'}<a class="btn" id="kp-dl" download="${esc(fname)}">⇩ Скачать HTML</a><span class="faint">${web ? 'Скачанный файл откройте в браузере и нажмите Ctrl+P → «Сохранить как PDF».' : 'PDF: в окне печати выберите «Сохранить как PDF».'}</span></p><iframe id="kp-frame" class="preview-frame" style="height:75vh;background:#fff"></iframe>`; const fr = $('#kp-frame'); fr.srcdoc = html; if ($('#kp-print')) $('#kp-print').onclick = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Откройте HTML-файл в браузере и нажмите Ctrl+P'); } }; const a = $('#kp-dl'); if (window.__saveFile) a.onclick = e => { e.preventDefault(); window.__saveFile(fname, html).then(ok => toast(ok ? 'Файл сохранён' : 'Скачивание отменено')); }; else { const blob = new Blob([html], { type: 'text/html' }); a.href = URL.createObjectURL(blob); } };
  form.onsubmit = async e => { e.preventDefault(); const out = collect(); const c = window.MostDomain.kpCalc(out); try { await onSave(out, c.total); closeModal(); } catch (er) { form.querySelector('.error').textContent = er.message; } };
}

// ---- help: инструкция ----
SECTIONS.help = async main => {
  const secs = (window.MostHelp && window.MostHelp.sections) || [];
  main.innerHTML = head('Инструкция', 'Как пользоваться системой: вход, разделы, типовые задачи. Разделы, к которым у вас нет доступа, в меню не показываются.') + `<div class="help">${secs.map(([t, h], i) => `<details class="card"${i < 2 ? ' open' : ''}><summary><b>${esc(t)}</b></summary><div class="help-body">${h}</div></details>`).join('')}</div>`;
};

// ---- settings ----
SECTIONS.settings = async main => {
  const st = await api('/status');
  const backups = await api('/backups').catch(() => ({ list: [], dir: '' }));
  const users = isOwner() ? await api('/users') : [];
  const audit = await api('/audit').catch(() => []);
  const cash = await api('/cash').catch(() => []);
  const bal = await api('/balances').catch(() => []);
  const ROLE = { owner: 'Владелец', partner: 'Партнёр', accountant: 'Бухгалтер', secretary: 'Секретарь', pm: 'Проджект-менеджер' };
  const year = today().slice(0, 4);
  main.innerHTML = head('Настройки') +
    (!st.hasData && st.seed.available && isOwner() ? `<div class="notice">База пустая. <button class="btn primary sm" data-act="seed">Загрузить данные из таблицы «Бюджет МОСТ»</button> — операции с 2018 года, договоры, подрядчики, АВР, КП, справочники.</div>` : '') +
    (isOwner() && st.web ? accessBlock(users) : '') +
    (isOwner() && !st.web ? `<h2>Пользователи и роли</h2>${tbl([{ t: 'Имя' }, { t: 'Логин' }, { t: 'Роль' }, { t: 'Статус' }, { t: '' }], users.map(u => `<tr><td><b>${esc(u.name)}</b></td><td class="muted">${esc(u.login)}</td><td>${esc(ROLE[u.role] || u.role)}</td><td>${u.active ? '<span class="chip ok">активен</span>' : '<span class="chip neutral">отключён</span>'}</td><td><div class="actions"><button class="btn sm" data-act="userEdit" data-id="${u.id}">✎</button>${u.id !== state.user.id ? `<button class="btn sm" data-act="userToggle" data-id="${u.id}" data-active="${u.active}">${u.active ? 'Отключить' : 'Включить'}</button>` : ''}</div></td></tr>`))}<p><button class="btn primary" data-act="userAdd">+ Пользователь</button></p><p class="faint">Владелец, партнёр, бухгалтер — полный доступ. Секретарь — всё то же, кроме дашборда; согласовывать оплату не может. Проджект-менеджер — только просмотр актов/счетов клиентам, счетов к оплате, проектов и договоров; операции, ЗП и остальное скрыты (проверяет сервер).</p>` : '') +
    `<h2>Остатки на счетах</h2><div class="card"><p class="muted" style="margin-top:0">Опорный остаток берётся из выписки (при загрузке) или вводится вручную с датой; дальше остаток считается по операциям после этой даты. В поле «Счёт» укажите код из справочника, чтобы связать.</p>${cash.length ? tbl([{ t: 'Счёт' }, { t: 'Компания' }, { t: 'Остаток', cls: 'amt' }, { t: 'На дату' }, { t: '' }], cash.map(c => `<tr><td><b>${esc(c.account || c.id)}</b></td><td>${esc(c.company)}</td><td class="amt num">${money(c.balance)}</td><td>${fdate(c.asOf)}</td><td>${actions('cash', c.id).replace('data-act="edit"', 'data-act="cashEdit"')}</td></tr>`)) : ''}<p><button class="btn" data-act="cashAdd">+ Остаток</button></p>${bal.length ? `<h3 style="margin:14px 0 6px">Расчёт по операциям</h3>${tbl([{ t: 'Счёт' }, { t: 'Компания' }, { t: 'Опорный остаток' }, { t: 'Операций после' }, { t: 'Расчёт сейчас', cls: 'amt' }, { t: 'Последняя операция' }], bal.map(b => `<tr><td><b>${esc(b.id)}</b></td><td class="muted">${esc(b.company)}</td><td>${b.anchor ? `${money(b.anchor.balance)} <span class="faint">на ${fdate(b.anchor.asOf)}</span>` : '<span class="faint">нет — загрузите выписку</span>'}</td><td>${b.anchor ? b.opsAfter : '—'}</td><td class="amt num">${b.balance !== null ? money(b.balance) : '—'}</td><td class="muted">${fdate(b.lastOp)}</td></tr>`))}` : ''}<datalist id="dl-accounts">${state.accounts.map(a => `<option value="${esc(a.id)}">`).join('')}</datalist></div>` +
    `<h2>Справочник счетов</h2>${tbl([{ t: 'Код' }, { t: 'Название' }, { t: 'Компания' }, { t: 'Активен' }, { t: '' }], state.accounts.map(a => `<tr><td><b>${esc(a.id)}</b>${a.iban ? `<div class="faint">${esc(a.iban)}</div>` : ''}</td><td>${esc(a.name || '')}</td><td>${esc(a.company || '')}</td><td>${yn(a.active !== false)}</td><td>${isOwner() ? `<div class="actions"><button class="btn sm" data-act="accEdit" data-id="${esc(a.id)}">✎</button></div>` : ''}</td></tr>`))}${isOwner() ? '<p><button class="btn" data-act="accAdd">+ Счёт</button></p>' : ''}` +
    `<h2>Справочник категорий</h2>${tbl([{ t: 'Категория' }, { t: 'Описание' }, { t: 'Вид' }, { t: '' }], state.categories.map(c => `<tr><td><b>${esc(c.id)}</b></td><td class="muted">${esc(c.name || '')}</td><td>${esc(KIND_LABEL[c.kind] || c.kind || '')}</td><td>${isOwner() ? `<div class="actions"><button class="btn sm" data-act="catEdit" data-id="${esc(c.id)}">✎</button></div>` : ''}</td></tr>`))}${isOwner() ? '<p><button class="btn" data-act="catAdd">+ Категория</button></p><p class="faint">Вид «Перевод» исключается из доходов и расходов. «Доход» — категории поступлений от клиентов.</p>' : ''}` +
    (isOwner() ? `<h2>Параметры</h2><div class="card">${formHtml([{ name: 'vatRate', label: 'НДС (0.16 = 16%)', type: 'number', step: '0.01', half: true }, { name: 'payrollTax', label: 'Налоги на ФОТ (0.45 = 45%)', type: 'number', step: '0.01', half: true }, { name: 'usdRate', label: 'Курс $ → ₸', type: 'number', step: '0.01' }], state.settings || {})}</div>` : '') +
    (!st.web ? `<h2>Доступ из интернета</h2><div class="card">${st.publicUrl ? `<p style="margin-top:0">Адрес для сотрудников: <b><a href="${esc(st.publicUrl)}" target="_blank" rel="noopener">${esc(st.publicUrl)}</a></b> <button class="btn sm" data-act="copyUrl" data-url="${esc(st.publicUrl)}">Скопировать</button></p><p class="faint" style="margin-bottom:0">Адрес меняется при каждом запуске start-internet.bat; постоянный адрес — через именованный туннель Cloudflare (см. README). Вместе с адресом сотруднику нужен логин и пароль из раздела «Пользователи».</p>` : '<p class="muted" style="margin:0">Сейчас система доступна только в офисной сети. Чтобы открыть доступ из интернета по логину и паролю, запустите на MostServer <code>start-internet.bat</code> — адрес появится здесь.</p>'}</div>` : '') +
    `<h2>Резервные копии</h2><div class="card"><p class="muted" style="margin-top:0">${st.web ? 'База хранится на claude.ai. Регулярно скачивайте копию JSON и кладите её в папку <code>MOST-Финансы\\backups</code> на MostServer.' : `Автоматически — при первой записи каждого дня. Папка: <code>${esc(backups.dir)}</code>`}</p><p>${st.web ? '' : '<button class="btn primary" data-act="backup">Сделать бэкап сейчас</button> '}<a class="btn" href="/api/backup" download>Скачать всю базу (JSON)</a></p>${isOwner() ? `<div class="form-row"><div class="field"><label>Восстановить из копии (JSON)</label><input type="file" id="restore-file" accept=".json,application/json"></div><div class="field"><label>&nbsp;</label><button class="btn danger" data-act="restore">Восстановить из файла</button></div></div><p class="faint">Заменит операции, счета, договоры и справочники данными из файла. Пользователи и пароли сохраняются. ${st.web ? 'В веб-версии занимает 1–2 минуты, не закрывайте страницу.' : 'Перед восстановлением автоматически делается копия текущей базы.'}</p>` : ''}${backups.list.length ? `<div class="faint">Последние: ${backups.list.slice(0, 5).map(b => esc(b.name)).join(', ')}${backups.list.length > 5 ? ` … всего ${backups.list.length}` : ''}</div>` : ''}</div>` +
    `<h2>Обмен с 1С / Excel</h2><div class="card"><p class="muted" style="margin-top:0">Файлы CSV (UTF-8, разделитель «;»). Живой синхронизации нет.</p><p><a class="btn" href="/api/export/1c/ops.csv?year=${year}" download>Экспорт операций ${year}</a> <a class="btn" href="/api/export/1c/invoices.csv" download>Экспорт счетов к оплате</a> <a class="btn" href="/api/export/1c/docs.csv" download>Экспорт актов/счетов клиентам</a></p><div class="form-row"><div class="field"><label>Импорт в</label><select id="imp-col"><option value="ops">Операции</option><option value="invoices">Счета к оплате</option><option value="docs">Акты/счета клиентам</option></select></div><div class="field"><label>CSV-файл</label><input type="file" id="imp-file" accept=".csv,text/csv"></div></div><button class="btn" data-act="import">Импортировать</button> <span class="faint">Колонки как в экспорте.</span></div>` +
    `<h2>Журнал действий</h2>${audit.length ? `<pre class="log">${audit.slice(-100).reverse().map(a => `${esc(a.ts.replace('T', ' ').slice(0, 16))}  ${esc(peopleName(a.userId))}  ${esc(a.action)}  ${esc(a.collection)}${a.docId ? ' ' + esc(String(a.docId).slice(0, 14)) : ''}`).join('\n')}</pre>` : '<p class="muted">Пока пусто</p>'}`;
  const settingsForm = main.querySelector('form');
  if (settingsForm && settingsForm.querySelector('[name=vatRate]')) { settingsForm.querySelector('button').textContent = 'Сохранить параметры'; settingsForm.onsubmit = async e => { e.preventDefault(); const v = numify(Object.fromEntries(new FormData(settingsForm).entries()), ['vatRate', 'payrollTax', 'usdRate']); state.settings = await api('/settings', { method: 'PUT', body: v }); toast('Параметры сохранены'); }; }
  function accessBlock(list) {
    return `<h2>Доступ и роли</h2>${tbl([{ t: 'Имя' }, { t: 'Роль' }, { t: '' }], list.map(u => `<tr><td><b>${esc(u.name || 'Без имени')}</b></td><td>${u.role === 'owner' ? esc(ROLE.owner) : `<select data-role="${esc(u.id)}" style="width:auto"><option value="partner"${u.role === 'partner' ? ' selected' : ''}>Партнёр</option><option value="accountant"${u.role === 'accountant' ? ' selected' : ''}>Бухгалтер</option><option value="secretary"${u.role === 'secretary' ? ' selected' : ''}>Секретарь</option></select>`}</td><td><div class="actions">${u.role !== 'owner' ? `<button class="btn sm danger" data-act="accessDel" data-id="${esc(u.id)}">✕</button>` : ''}</div></td></tr>`))}` +
      `<div class="card" style="margin-top:10px"><div class="form-row"><div class="field"><label>Добавить человека (поиск по имени)</label><input id="acc-q" placeholder="Начните вводить имя" autocomplete="off"></div><div class="field"><label>Роль</label><select id="acc-role"><option value="accountant">Бухгалтер</option><option value="partner">Партнёр</option><option value="secretary">Секретарь</option></select></div></div><div id="acc-hits" class="q"></div></div>` +
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
  const cashFields = [{ name: 'id', label: 'Код счёта', required: true, half: true }, { name: 'company', label: 'Компания', type: 'select', options: OUR(), half: true }, { name: 'account', label: 'Счёт (код из справочника)', half: true, list: 'dl-accounts' }, { name: 'balance', label: 'Остаток, ₸', type: 'number', required: true, half: true }, { name: 'asOf', label: 'На дату', type: 'date', value: today() }];
  ACT.cashAdd = () => modal('Остаток на счёте', formHtml(cashFields), async v => { await api('/cash', { method: 'POST', body: numify(v, ['balance']) }); toast('Добавлено'); route(); });
  ACT.cashEdit = ({ id }) => { const c = cash.find(x => x.id === id); modal('Остаток на счёте', formHtml(cashFields.slice(1), c), async v => { await api('/cash/' + id, { method: 'PUT', body: numify(v, ['balance']) }); toast('Сохранено'); route(); }); };
  const accFields = [{ name: 'id', label: 'Код (как в операциях)', required: true, half: true }, { name: 'name', label: 'Название', half: true }, { name: 'company', label: 'Компания', type: 'select', options: [...OUR(), 'Наличные'], half: true }, { name: 'active', label: 'Активен', type: 'select', options: YESNO, half: true }, { name: 'iban', label: 'IBAN (для автоподбора при загрузке выписки)' }];
  ACT.accAdd = () => modal('Счёт', formHtml(accFields), async v => { await api('/accounts', { method: 'POST', body: boolify(v, ['active']) }); toast('Добавлено'); state.accounts = await api('/accounts'); route(); });
  ACT.accEdit = ({ id }) => { const a = state.accounts.find(x => x.id === id); modal('Счёт ' + id, formHtml(accFields.slice(1), Object.assign({}, a, { active: a.active !== false })), async v => { await api('/accounts/' + id, { method: 'PUT', body: boolify(v, ['active']) }); toast('Сохранено'); state.accounts = await api('/accounts'); route(); }); };
  const catFields = [{ name: 'id', label: 'Категория (как в операциях)', required: true, half: true }, { name: 'name', label: 'Описание', half: true }, { name: 'kind', label: 'Вид', type: 'select', options: Object.entries(KIND_LABEL) }];
  ACT.catAdd = () => modal('Категория', formHtml(catFields), async v => { await api('/categories', { method: 'POST', body: v }); toast('Добавлено'); state.categories = await api('/categories'); route(); });
  ACT.catEdit = ({ id }) => { const c = state.categories.find(x => x.id === id); modal('Категория ' + id, formHtml(catFields.slice(1), c), async v => { await api('/categories/' + id, { method: 'PUT', body: v }); toast('Сохранено'); state.categories = await api('/categories'); route(); }); };
  ACT.restore = async () => { const f = $('#restore-file').files[0]; if (!f) return toast('Выберите JSON-файл копии'); let data; try { data = JSON.parse(await f.text()); } catch { return toast('Файл не читается как JSON', 4000); } const cols = window.MostDomain.backupCollections(data); if (!cols) return toast('Это не копия базы «MOST Финансы»', 4000); if (!confirm(`Восстановить из «${f.name}»?\n${cols.map(c => `${c}: ${data[c].length}`).join(', ')}\n\nТекущие данные этих разделов будут заменены.`)) return; toast('Восстанавливаю…', 120000); try { const r = await api('/restore', { method: 'POST', body: { data } }); toast('Восстановлено: ' + Object.entries(r.restored).map(([k, v]) => `${k} ${v}`).join(', '), 8000); await loadRefs(); route(); } catch (er) { toast(er.message, 6000); } };
  ACT.copyUrl = async ({ url }) => { try { await navigator.clipboard.writeText(url); toast('Адрес скопирован'); } catch { toast(url, 6000); } };
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
