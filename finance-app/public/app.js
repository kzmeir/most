/* MOST Финансы — фронтенд (vanilla JS) */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const state = { user: null, status: null, people: [], settings: null };
const ADMIN = ['owner', 'partner', 'accountant'];
const isAdmin = () => state.user && ADMIN.includes(state.user.role);
const isOwner = () => state.user && state.user.role === 'owner';
const COMPANIES = () => (state.settings && state.settings.companies) || ['MOST Project', 'MOST Architects'];
const CATS = ['Субподряд / проектные', 'Наличные (ЗП/премии)', 'Налоги / бюджет', 'Материалы / товары', 'Техника', 'Счета к оплате', 'Офис', 'Прочее'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0)) + ' ₸';
const fdate = d => { if (!d) return ''; const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(d); };
const today = () => new Date().toISOString().slice(0, 10);
const ym = d => String(d || '').slice(0, 7);

async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { method: opts.method || 'GET', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data && data.error) || ('Ошибка ' + r.status));
  return data;
}
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, ms); }
function modal(title, bodyHtml, onSubmit) {
  $('#modal-title').textContent = title; $('#modal-body').innerHTML = bodyHtml; $('#modal').hidden = false;
  const form = $('#modal-body form');
  if (form && onSubmit) form.onsubmit = async e => { e.preventDefault(); const btn = form.querySelector('button[type=submit]'); btn.disabled = true; try { await onSubmit(Object.fromEntries(new FormData(form).entries())); closeModal(); } catch (er) { const el = form.querySelector('.error') || form.appendChild(Object.assign(document.createElement('div'), { className: 'error' })); el.textContent = er.message; } finally { btn.disabled = false; } };
  setTimeout(() => { const f = $('#modal-body input,#modal-body select,#modal-body textarea'); f && f.focus(); }, 30);
}
function closeModal() { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; }
$('#modal-close').onclick = closeModal; $('#modal').addEventListener('click', e => { if (e.target === $('#modal')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ---- form builder ----
function field(f, v) {
  const val = v ?? f.value ?? '';
  const req = f.required ? ' required' : '';
  let inp;
  if (f.type === 'select') inp = `<select name="${f.name}"${req}>${(f.options || []).map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}"${String(ov) === String(val) ? ' selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
  else if (f.type === 'textarea') inp = `<textarea name="${f.name}" rows="3"${req}>${esc(val)}</textarea>`;
  else inp = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}"${req}${f.step ? ` step="${f.step}"` : ''}${f.min !== undefined ? ` min="${f.min}"` : ''}>`;
  return `<div class="field"><label>${esc(f.label)}</label>${inp}</div>`;
}
function formHtml(fields, values = {}, submitLabel = 'Сохранить') {
  const rows = []; let i = 0;
  while (i < fields.length) { const f = fields[i]; if (f.half && fields[i + 1] && fields[i + 1].half) { rows.push(`<div class="form-row">${field(f, values[f.name])}${field(fields[i + 1], values[fields[i + 1].name])}</div>`); i += 2; } else { rows.push(field(f, values[f.name])); i++; } }
  return `<form>${rows.join('')}<div class="error"></div><button class="btn primary block" type="submit">${esc(submitLabel)}</button></form>`;
}
const numify = (o, keys) => { keys.forEach(k => { if (k in o) o[k] = Number(String(o[k]).replace(/\s/g, '').replace(',', '.')) || 0; }); return o; };

// ---- boot ----
async function boot() {
  try { state.status = await api('/status'); } catch (e) { $('#app').innerHTML = `<div class="boot">Сервер недоступен: ${esc(e.message)}</div>`; return; }
  if (state.status.needsSetup) return renderSetup();
  try { state.user = (await api('/me')).user; } catch { return renderLogin(); }
  await afterLogin();
}
async function afterLogin() {
  try { state.people = await api('/people'); } catch { state.people = []; }
  if (isAdmin()) { try { state.settings = await api('/settings'); } catch { } }
  renderApp();
}
function renderSetup() {
  $('#app').innerHTML = `<div class="auth"><div class="auth-card"><div class="brand"><div class="logo">M</div><b>MOST Финансы</b></div><h1>Первый запуск</h1><p class="sub">Создайте аккаунт владельца. Данные хранятся только на этом компьютере.</p>${formHtml([{ name: 'name', label: 'Ваше имя', required: true }, { name: 'login', label: 'Логин', required: true }, { name: 'password', label: 'Пароль (мин. 6 символов)', type: 'password', required: true }], {}, 'Создать и войти')}</div></div>`;
  $('#app form').onsubmit = async e => { e.preventDefault(); try { const r = await api('/setup', { method: 'POST', body: Object.fromEntries(new FormData(e.target).entries()) }); state.user = r.user; state.status.needsSetup = false; await afterLogin(); if (!state.status.hasData && state.status.seed.available) location.hash = '#/settings'; } catch (er) { $('#app .error').textContent = er.message; } };
}
function renderLogin() {
  $('#app').innerHTML = `<div class="auth"><div class="auth-card"><div class="brand"><div class="logo">M</div><b>MOST Финансы</b></div>${formHtml([{ name: 'login', label: 'Логин', required: true }, { name: 'password', label: 'Пароль', type: 'password', required: true }], {}, 'Войти')}</div></div>`;
  $('#app form').onsubmit = async e => { e.preventDefault(); try { const r = await api('/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target).entries()) }); state.user = r.user; await afterLogin(); } catch (er) { $('#app .error').textContent = er.message; } };
}

// ---- app shell ----
const NAV = [
  { id: 'dashboard', label: 'Дашборд', icon: '▦', admin: true },
  { id: 'docs', label: 'Акты и счета → бухгалтеру', icon: '📋' },
  { id: 'invoices', label: 'Счета к оплате', icon: '🧾' },
  { id: 'income', label: 'Доходы', icon: '↓', admin: true },
  { id: 'expenses', label: 'Расходы', icon: '↑', admin: true },
  { id: 'payroll', label: 'ЗП / ФОТ', icon: '👥', admin: true },
  { id: 'projects', label: 'Проекты', icon: '◈' },
  { id: 'obligations', label: 'Обязательные платежи', icon: '🔁', admin: true },
  { id: 'settings', label: 'Настройки', icon: '⚙', admin: true },
];
function renderApp() {
  const nav = NAV.filter(n => !n.admin || isAdmin());
  $('#app').innerHTML = `<div class="shell"><aside class="side" id="side"><div class="brand"><div class="logo">M</div><b>MOST Финансы</b></div><nav class="nav" id="nav">${nav.map(n => `<a href="#/${n.id}" data-id="${n.id}"><span>${n.icon}</span>${esc(n.label)}<span class="badge" id="badge-${n.id}" hidden></span></a>`).join('')}</nav><div class="me"><b>${esc(state.user.name)}</b><span class="muted">${esc(state.user.roleLabel || state.user.role)}</span><br><button class="btn sm" id="logout" style="margin-top:8px">Выйти</button></div></aside><div><div class="topbar"><button class="icon-btn" id="burger">☰</button><b>MOST Финансы</b></div><main class="main" id="main"></main></div></div>`;
  $('#logout').onclick = async () => { await api('/logout', { method: 'POST' }); state.user = null; location.hash = ''; renderLogin(); };
  $('#burger').onclick = () => $('#side').classList.toggle('open');
  $('#nav').addEventListener('click', () => $('#side').classList.remove('open'));
  if (!location.hash || !nav.some(n => '#/' + n.id === location.hash)) location.hash = '#/' + nav[0].id;
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
const SECTIONS = {};
const head = (title, sub, btnHtml = '') => `<div class="head"><div class="grow"><h1>${esc(title)}</h1>${sub ? `<p class="sub" style="margin:0">${sub}</p>` : ''}</div>${btnHtml}</div>`;
const tbl = (cols, rows, foot) => `<div class="tbl"><table><thead><tr>${cols.map(c => `<th${c.cls ? ` class="${c.cls}"` : ''}>${esc(c.t)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table></div>`;
const empty = t => `<div class="empty">${esc(t)}</div>`;
const chip = (s, map) => { const m = map[s] || ['neutral', s]; return `<span class="chip ${m[0]}">${esc(m[1])}</span>`; };
const INV_ST = { open: ['warn', 'К оплате'], held: ['neutral', 'Придержан'], paid: ['ok', 'Оплачен'] };
const DOC_ST = { new: ['warn', 'Новый'], in_progress: ['accent', 'В работе'], done: ['ok', 'Готово'] };
const DOC_TYPE = { act: 'Акт', invoice_out: 'Счёт клиенту', other: 'Другое' };
const bind = (root) => root.querySelectorAll('[data-act]').forEach(el => el.onclick = () => ACT[el.dataset.act](el.dataset));
const ACT = {};

// ---- dashboard ----
SECTIONS.dashboard = async main => {
  const d = await api('/dashboard');
  const m = d.month;
  const catRows = Object.entries(d.year.byCategory).sort((a, b) => b[1] - a[1]); const catMax = catRows[0] ? catRows[0][1] : 1;
  main.innerHTML = head('Дашборд', `На ${fdate(d.asOf)} · месяц ${m.ym}`) + `
  <div class="grid g4">
    <div class="card"><div class="label">На счетах</div><div class="val num">${money(d.cashTotal)}</div><div class="foot">${d.cash.map(c => `${esc(c.company)}: ${money(c.balance)} (${fdate(c.asOf)})`).join(' · ') || 'счета не заведены'}</div></div>
    <div class="card ${m.net < 0 ? 'crit' : 'ok'}"><div class="label">Месяц: остаток</div><div class="val num">${money(m.net)}</div><div class="foot">пришло ${money(m.income)} · ушло ${money(m.expenses)}</div></div>
    <div class="card"><div class="label">Постоянная нагрузка / мес</div><div class="val num">${money(d.fixedLoad.total)}</div><div class="foot">ФОТ с налогами ${money(d.fixedLoad.payrollGross)} + обязательные ${money(d.fixedLoad.obligations)}</div></div>
    <div class="card"><div class="label">Отложенный КПН (оценка)</div><div class="val num">${money(d.kpnDeferred)}</div><div class="foot">20% от (доход − расход) за год</div></div>
    <div class="card ${d.invoices.openSum ? 'crit' : ''}"><div class="label">Счета к оплате <a href="#/invoices">→</a></div><div class="val num">${money(d.invoices.openSum)}</div><div class="foot">${d.invoices.openCount} открытых · придержано ${money(d.invoices.heldSum)} (${d.invoices.heldCount})</div></div>
    <div class="card ${d.queue.overdue ? 'crit' : ''}"><div class="label">Очередь к бухгалтеру <a href="#/docs">→</a></div><div class="val num">${d.queue.count}</div><div class="foot">${d.queue.overdue ? `${d.queue.overdue} висят > 3 дней · ` : ''}макс. ${d.queue.maxDays} дн. · новых ${d.queue.byStatus.new}, в работе ${d.queue.byStatus.in_progress}</div></div>
    <div class="card"><div class="label">Год: доход</div><div class="val num">${money(d.year.income)}</div><div class="foot">${Object.entries(d.year.byCompany).map(([k, v]) => `${esc(k)}: ${money(v)}`).join(' · ') || '—'}</div></div>
    <div class="card"><div class="label">Год: расход</div><div class="val num">${money(d.year.expenses)}</div><div class="foot">чистыми ${money(d.year.net)}</div></div>
  </div>
  <h2>Расходы за год по категориям</h2>
  <div class="card">${catRows.length ? catRows.map(([k, v]) => `<div class="kv" style="margin-bottom:8px"><span>${esc(k)}</span><b class="num">${money(v)}</b><div class="bar" style="grid-column:1/-1"><i style="width:${Math.round(v / catMax * 100)}%"></i></div></div>`).join('') : '<span class="muted">Пока нет расходов за этот год</span>'}</div>`;
};

// ---- docs: очередь к бухгалтеру ----
SECTIONS.docs = async main => {
  const docs = await api('/docs');
  const projects = await api('/projects').catch(() => []);
  const url = new URLSearchParams((location.hash.split('?')[1]) || '');
  const fs = url.get('status') || 'active', fp = url.get('project') || '';
  let list = docs.filter(d => fs === 'all' ? true : fs === 'active' ? d.status !== 'done' : d.status === fs).filter(d => !fp || d.project === fp);
  list.sort((a, b) => (a.status === 'done') - (b.status === 'done') || b.daysWaiting - a.daysWaiting);
  const accountants = state.people.filter(p => p.role === 'accountant');
  main.innerHTML = head('Акты и счета → бухгалтеру', isAdmin() ? 'Создайте запрос — бухгалтер увидит его здесь, возьмёт в работу и закроет. Старше 3 дней — красным.' : 'Статус актов и счетов клиентам по проектам. Только просмотр.', isAdmin() ? '<button class="btn primary" data-act="docAdd">+ Запрос бухгалтеру</button>' : '') +
    `<div class="filters"><select id="f-status"><option value="active"${fs === 'active' ? ' selected' : ''}>Активные</option><option value="new"${fs === 'new' ? ' selected' : ''}>Новые</option><option value="in_progress"${fs === 'in_progress' ? ' selected' : ''}>В работе</option><option value="done"${fs === 'done' ? ' selected' : ''}>Готовые</option><option value="all"${fs === 'all' ? ' selected' : ''}>Все</option></select><select id="f-project"><option value="">Все проекты</option>${[...new Set(docs.map(d => d.project).filter(Boolean))].map(p => `<option${p === fp ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></div>` +
    (list.length ? `<div class="q">${list.map(d => `<div class="q-card ${d.status}${d.status !== 'done' && d.daysWaiting > 3 ? ' overdue' : ''}"><div><div class="t">${esc(DOC_TYPE[d.type] || d.type)} · ${esc(d.client || '—')}${d.project ? ` <span class="muted">/ ${esc(d.project)}</span>` : ''}</div><div class="m">${esc(d.description || '')}</div><div class="m">${d.amount ? `<b class="num">${money(d.amount)}</b> · ` : ''}запросил ${esc(d.requestedByName || '—')} ${fdate(d.createdAt)}${d.assignedToName ? ` · назначено: ${esc(d.assignedToName)}` : ''}${d.doneAt ? ` · закрыт ${fdate(d.doneAt)}` : ''}${d.note ? ` · ${esc(d.note)}` : ''}</div></div><div class="side-col">${chip(d.status, DOC_ST)}<div class="days">${d.daysWaiting}<span class="faint"> дн.</span></div>${isAdmin() ? `<div class="actions" style="margin-top:6px">${d.status === 'new' ? `<button class="btn sm" data-act="docStatus" data-id="${d.id}" data-status="in_progress">В работу</button>` : ''}${d.status !== 'done' ? `<button class="btn sm primary" data-act="docStatus" data-id="${d.id}" data-status="done">Готово</button>` : `<button class="btn sm" data-act="docStatus" data-id="${d.id}" data-status="in_progress">Вернуть</button>`}<button class="btn sm" data-act="docEdit" data-id="${d.id}">✎</button><button class="btn sm danger" data-act="del" data-col="docs" data-id="${d.id}">✕</button></div>` : ''}</div></div>`).join('')}</div>` : empty('Запросов нет'));
  const nav = () => { location.hash = `#/docs?status=${$('#f-status').value}&project=${encodeURIComponent($('#f-project').value)}`; };
  $('#f-status').onchange = nav; $('#f-project').onchange = nav;
  const docFields = (v = {}) => [
    { name: 'type', label: 'Тип', type: 'select', options: [['act', 'Акт'], ['invoice_out', 'Счёт клиенту'], ['other', 'Другое']], half: true },
    { name: 'amount', label: 'Сумма, ₸', type: 'number', step: '0.01', half: true },
    { name: 'client', label: 'Клиент', required: true, half: true },
    { name: 'project', label: 'Проект', type: 'select', options: ['', ...projects.map(p => p.name)], half: true },
    { name: 'description', label: 'Что нужно (описание)', type: 'textarea' },
    { name: 'assignedTo', label: 'Назначить бухгалтеру', type: 'select', options: [['', '— не назначено —'], ...accountants.map(a => [a.id, a.name])] },
    { name: 'note', label: 'Комментарий' },
  ];
  ACT.docAdd = () => modal('Запрос бухгалтеру', formHtml(docFields(), {}, 'Создать запрос'), async v => { await api('/docs', { method: 'POST', body: numify(v, ['amount']) }); toast('Запрос создан'); route(); refreshBadge(); });
  ACT.docEdit = ({ id }) => { const d = docs.find(x => x.id === id); modal('Редактировать запрос', formHtml(docFields(d), d), async v => { await api('/docs/' + id, { method: 'PUT', body: numify(v, ['amount']) }); toast('Сохранено'); route(); }); };
  ACT.docStatus = async ({ id, status }) => { await api('/docs/' + id, { method: 'PUT', body: { status } }); toast(status === 'done' ? 'Закрыто' : 'Взято в работу'); route(); refreshBadge(); };
  bind(main);
};

// ---- invoices ----
SECTIONS.invoices = async main => {
  const inv = await api('/invoices');
  const url = new URLSearchParams((location.hash.split('?')[1]) || '');
  const fc = url.get('company') || '', fs = url.get('status') || 'open';
  const list = inv.filter(i => (!fc || i.company === fc) && (fs === 'all' || i.status === fs)).sort((a, b) => (b.invoiceDate || '').localeCompare(a.invoiceDate || ''));
  const total = list.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const byCo = {}; inv.filter(i => i.status === 'open').forEach(i => byCo[i.company] = (byCo[i.company] || 0) + Number(i.amount || 0));
  main.innerHTML = head('Счета к оплате', `Открыто: ${Object.entries(byCo).map(([k, v]) => `<b>${esc(k)}</b> ${money(v)}`).join(' · ') || 'нет'}`, isAdmin() ? '<button class="btn primary" data-act="invAdd">+ Счёт</button>' : '') +
    `<div class="filters"><select id="f-co"><option value="">Обе компании</option>${COMPANIES().map(c => `<option${c === fc ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select><select id="f-st"><option value="open"${fs === 'open' ? ' selected' : ''}>К оплате</option><option value="held"${fs === 'held' ? ' selected' : ''}>Придержаны</option><option value="paid"${fs === 'paid' ? ' selected' : ''}>Оплачены</option><option value="all"${fs === 'all' ? ' selected' : ''}>Все</option></select></div>` +
    (list.length ? tbl([{ t: 'Дата' }, { t: 'Компания' }, { t: 'Контрагент' }, { t: 'Назначение' }, { t: 'Проект' }, { t: 'Сумма', cls: 'amt' }, { t: 'Статус' }, { t: '' }],
      list.map(i => `<tr><td class="nowrap">${fdate(i.invoiceDate)}</td><td>${esc(i.company)}</td><td><b>${esc(i.contractor)}</b></td><td class="muted">${esc(i.purpose)}</td><td class="muted">${esc(i.project)}</td><td class="amt num">${money(i.amount)}</td><td>${chip(i.status, INV_ST)}${i.paidAt ? `<div class="faint">${fdate(i.paidAt)}</div>` : ''}</td><td>${isAdmin() ? `<div class="actions">${i.status !== 'paid' ? `<button class="btn sm primary" data-act="invStatus" data-id="${i.id}" data-status="paid">Оплачен</button>` : ''}${i.status === 'open' ? `<button class="btn sm" data-act="invStatus" data-id="${i.id}" data-status="held">Придержать</button>` : ''}${i.status === 'held' ? `<button class="btn sm" data-act="invStatus" data-id="${i.id}" data-status="open">К оплате</button>` : ''}<button class="btn sm" data-act="invEdit" data-id="${i.id}">✎</button><button class="btn sm danger" data-act="del" data-col="invoices" data-id="${i.id}">✕</button></div>` : ''}</td></tr>`),
      `<tr><td colspan="5">Итого (${list.length})</td><td class="amt num">${money(total)}</td><td colspan="2"></td></tr>`) : empty('Счетов нет'));
  const nav = () => location.hash = `#/invoices?company=${encodeURIComponent($('#f-co').value)}&status=${$('#f-st').value}`;
  $('#f-co').onchange = nav; $('#f-st').onchange = nav;
  const fields = [{ name: 'company', label: 'Компания', type: 'select', options: COMPANIES(), half: true }, { name: 'invoiceDate', label: 'Дата счёта', type: 'date', value: today(), half: true }, { name: 'contractor', label: 'Контрагент', required: true, half: true }, { name: 'amount', label: 'Сумма, ₸', type: 'number', step: '0.01', required: true, half: true }, { name: 'purpose', label: 'Назначение' }, { name: 'project', label: 'Проект' }, { name: 'status', label: 'Статус', type: 'select', options: [['open', 'К оплате'], ['held', 'Придержать'], ['paid', 'Оплачен']] }];
  ACT.invAdd = () => modal('Новый счёт', formHtml(fields), async v => { await api('/invoices', { method: 'POST', body: numify(v, ['amount']) }); toast('Счёт добавлен'); route(); });
  ACT.invEdit = ({ id }) => { const i = inv.find(x => x.id === id); modal('Счёт', formHtml(fields, i), async v => { await api('/invoices/' + id, { method: 'PUT', body: numify(v, ['amount']) }); toast('Сохранено'); route(); }); };
  ACT.invStatus = async ({ id, status }) => { await api('/invoices/' + id, { method: 'PUT', body: { status } }); toast(status === 'paid' ? 'Отмечен оплаченным — добавлен в расходы' : 'Статус изменён'); route(); };
  bind(main);
};

// ---- generic ledger sections ----
function ledger(cfg) {
  return async main => {
    const rows = await api('/' + cfg.col);
    const url = new URLSearchParams((location.hash.split('?')[1]) || '');
    const fc = url.get('company') || '', fm = url.get('month') || '', fx = url.get('cat') || '';
    const months = [...new Set(rows.map(r => ym(r.date)).filter(Boolean))].sort().reverse();
    const list = rows.filter(r => (!fc || r.company === fc) && (!fm || ym(r.date) === fm) && (!fx || r[cfg.groupKey] === fx)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const total = list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const groups = {}; list.forEach(r => { const k = r[cfg.groupKey] || '—'; groups[k] = (groups[k] || 0) + Number(r.amount || 0); });
    main.innerHTML = head(cfg.title, `${list.length} операций · итого <b>${money(total)}</b>`, `<button class="btn primary" data-act="add">+ Добавить</button>`) +
      `<div class="filters"><select id="f-co"><option value="">Обе компании</option>${COMPANIES().map(c => `<option${c === fc ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select><select id="f-m"><option value="">Все месяцы</option>${months.map(m => `<option${m === fm ? ' selected' : ''}>${m}</option>`).join('')}</select><select id="f-x"><option value="">${esc(cfg.groupLabel)}: все</option>${Object.keys(groups).sort().map(g => `<option${g === fx ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></div>` +
      `<div class="grid g3" style="margin-bottom:14px">${Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `<div class="card"><div class="label">${esc(k)}</div><div class="val num" style="font-size:17px">${money(v)}</div></div>`).join('')}</div>` +
      (list.length ? tbl([{ t: 'Дата' }, { t: 'Компания' }, { t: cfg.partyLabel }, { t: cfg.groupLabel }, { t: 'Назначение' }, { t: 'Сумма', cls: 'amt' }, { t: '' }],
        list.map(r => `<tr><td class="nowrap">${fdate(r.date)}</td><td>${esc(r.company)}</td><td><b>${esc(r[cfg.partyKey])}</b></td><td>${esc(r[cfg.groupKey] || '')}</td><td class="muted">${esc(r.purpose || '')}</td><td class="amt num">${money(r.amount)}</td><td><div class="actions"><button class="btn sm" data-act="edit" data-id="${r.id}">✎</button><button class="btn sm danger" data-act="del" data-col="${cfg.col}" data-id="${r.id}">✕</button></div></td></tr>`),
        `<tr><td colspan="5">Итого</td><td class="amt num">${money(total)}</td><td></td></tr>`) : empty('Пока пусто'));
    const nav = () => location.hash = `#/${cfg.col}?company=${encodeURIComponent($('#f-co').value)}&month=${$('#f-m').value}&cat=${encodeURIComponent($('#f-x').value)}`;
    ['#f-co', '#f-m', '#f-x'].forEach(s => $(s).onchange = nav);
    const fields = [{ name: 'date', label: 'Дата', type: 'date', value: today(), half: true }, { name: 'company', label: 'Компания', type: 'select', options: COMPANIES(), half: true }, { name: cfg.partyKey, label: cfg.partyLabel, required: true, half: true }, { name: 'amount', label: 'Сумма, ₸', type: 'number', step: '0.01', required: true, half: true }, cfg.groupField, { name: 'purpose', label: 'Назначение' }];
    ACT.add = () => modal(cfg.addTitle, formHtml(fields), async v => { await api('/' + cfg.col, { method: 'POST', body: numify(v, ['amount']) }); toast('Добавлено'); route(); });
    ACT.edit = ({ id }) => { const r = rows.find(x => x.id === id); modal(cfg.addTitle, formHtml(fields, r), async v => { await api(`/${cfg.col}/${id}`, { method: 'PUT', body: numify(v, ['amount']) }); toast('Сохранено'); route(); }); };
    bind(main);
  };
}
SECTIONS.income = ledger({ col: 'income', title: 'Доходы', addTitle: 'Поступление', partyKey: 'client', partyLabel: 'Клиент', groupKey: 'project', groupLabel: 'Проект', groupField: { name: 'project', label: 'Проект' } });
SECTIONS.expenses = ledger({ col: 'expenses', title: 'Расходы', addTitle: 'Расход', partyKey: 'recipient', partyLabel: 'Получатель', groupKey: 'category', groupLabel: 'Категория', groupField: { name: 'category', label: 'Категория', type: 'select', options: CATS } });

// ---- payroll ----
SECTIONS.payroll = async main => {
  const rows = (await api('/payroll')).sort((a, b) => b.id.localeCompare(a.id));
  const tax = (state.settings && state.settings.payrollTax) || 0.45;
  const t = rows.reduce((s, r) => ({ p: s.p + Number(r.project || 0), a: s.a + Number(r.architects || 0) }), { p: 0, a: 0 });
  main.innerHTML = head('ЗП / ФОТ', `На руки по месяцам; с налогами — ×${(1 + tax).toFixed(2)}`, '<button class="btn primary" data-act="add">+ Месяц</button>') +
    (rows.length ? tbl([{ t: 'Месяц' }, { t: 'MOST Project', cls: 'amt' }, { t: 'MOST Architects', cls: 'amt' }, { t: 'Итого на руки', cls: 'amt' }, { t: 'С налогами', cls: 'amt' }, { t: '' }],
      rows.map(r => { const s = Number(r.project || 0) + Number(r.architects || 0); return `<tr><td><b>${esc(r.id)}</b></td><td class="amt num">${money(r.project)}</td><td class="amt num">${money(r.architects)}</td><td class="amt num">${money(s)}</td><td class="amt num">${money(s * (1 + tax))}</td><td><div class="actions"><button class="btn sm" data-act="edit" data-id="${r.id}">✎</button><button class="btn sm danger" data-act="del" data-col="payroll" data-id="${r.id}">✕</button></div></td></tr>`; }),
      `<tr><td>Итого</td><td class="amt num">${money(t.p)}</td><td class="amt num">${money(t.a)}</td><td class="amt num">${money(t.p + t.a)}</td><td class="amt num">${money((t.p + t.a) * (1 + tax))}</td><td></td></tr>`) : empty('Нет данных по ЗП'));
  const fields = [{ name: 'id', label: 'Месяц (ГГГГ-ММ)', required: true, value: today().slice(0, 7) }, { name: 'project', label: 'MOST Project, на руки', type: 'number', half: true }, { name: 'architects', label: 'MOST Architects, на руки', type: 'number', half: true }];
  ACT.add = () => modal('ЗП за месяц', formHtml(fields), async v => { await api('/payroll', { method: 'POST', body: numify(v, ['project', 'architects']) }); toast('Добавлено'); route(); });
  ACT.edit = ({ id }) => { const r = rows.find(x => x.id === id); modal('ЗП за ' + id, formHtml(fields.slice(1), r), async v => { await api('/payroll/' + id, { method: 'PUT', body: numify(v, ['project', 'architects']) }); toast('Сохранено'); route(); }); };
  bind(main);
};

// ---- projects ----
SECTIONS.projects = async main => {
  const rows = await api('/projects');
  main.innerHTML = head('Проекты', 'Контракт без НДС, целевая себестоимость, статус', isAdmin() ? '<button class="btn primary" data-act="add">+ Проект</button>' : '') +
    (rows.length ? tbl([{ t: 'Проект' }, { t: 'Заказчик' }, { t: 'Контракт без НДС', cls: 'amt' }, { t: 'Целевая себест.', cls: 'amt' }, { t: 'Маржа план' }, { t: 'Статус' }, { t: '' }],
      rows.map(p => { const m = p.contractNoVat && p.targetCost ? Math.round((p.contractNoVat - p.targetCost) / p.contractNoVat * 100) + '%' : '—'; return `<tr><td><b>${esc(p.name)}</b></td><td class="muted">${esc(p.client || '')}</td><td class="amt num">${p.contractNoVat ? money(p.contractNoVat) : '—'}</td><td class="amt num">${p.targetCost ? money(p.targetCost) : '—'}</td><td>${m}</td><td>${chip(p.status, { 'В работе': ['accent', 'В работе'], 'Завершён': ['ok', 'Завершён'], 'Пауза': ['neutral', 'Пауза'] })}</td><td>${isAdmin() ? `<div class="actions"><button class="btn sm" data-act="edit" data-id="${p.id}">✎</button><button class="btn sm danger" data-act="del" data-col="projects" data-id="${p.id}">✕</button></div>` : ''}</td></tr>`; })) : empty('Проектов нет'));
  const fields = [{ name: 'name', label: 'Название', required: true }, { name: 'client', label: 'Заказчик' }, { name: 'contractNoVat', label: 'Контракт без НДС, ₸', type: 'number', half: true }, { name: 'targetCost', label: 'Целевая себестоимость, ₸', type: 'number', half: true }, { name: 'status', label: 'Статус', type: 'select', options: ['В работе', 'Завершён', 'Пауза'] }];
  ACT.add = () => modal('Проект', formHtml(fields), async v => { await api('/projects', { method: 'POST', body: numify(v, ['contractNoVat', 'targetCost']) }); toast('Добавлено'); route(); });
  ACT.edit = ({ id }) => { const r = rows.find(x => x.id === id); modal('Проект', formHtml(fields, r), async v => { await api('/projects/' + id, { method: 'PUT', body: numify(v, ['contractNoVat', 'targetCost']) }); toast('Сохранено'); route(); }); };
  bind(main);
};

// ---- obligations ----
SECTIONS.obligations = async main => {
  const rows = await api('/obligations');
  const total = rows.reduce((s, r) => s + Number(r.monthly || 0), 0);
  main.innerHTML = head('Обязательные платежи', `Постоянные траты в месяц: <b>${money(total)}</b>`, '<button class="btn primary" data-act="add">+ Платёж</button>') +
    (rows.length ? tbl([{ t: 'Платёж' }, { t: 'В месяц', cls: 'amt' }, { t: 'Тип' }, { t: 'Осталось' }, { t: 'Остаток', cls: 'amt' }, { t: 'Примечание' }, { t: '' }],
      rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td class="amt num">${money(r.monthly)}</td><td>${esc(r.kind || '')}</td><td>${r.monthsLeft ? r.monthsLeft + ' мес' : '—'}</td><td class="amt num">${r.monthsLeft ? money(r.monthly * r.monthsLeft) : '—'}</td><td class="muted">${esc(r.note || '')}</td><td><div class="actions"><button class="btn sm" data-act="edit" data-id="${r.id}">✎</button><button class="btn sm danger" data-act="del" data-col="obligations" data-id="${r.id}">✕</button></div></td></tr>`),
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
  const ROLE = { owner: 'Владелец', partner: 'Партнёр', accountant: 'Бухгалтер', pm: 'Проджект-менеджер' };
  main.innerHTML = head('Настройки') +
    (!st.hasData && st.seed.available && isOwner() ? `<div class="notice">База пустая. <button class="btn primary sm" data-act="seed">Загрузить стартовые данные</button> — счета, ЗП, доходы/расходы, проекты, обязательные платежи, собранные ранее.</div>` : '') +
    (isOwner() ? `<h2>Пользователи и роли</h2>${tbl([{ t: 'Имя' }, { t: 'Логин' }, { t: 'Роль' }, { t: 'Статус' }, { t: '' }], users.map(u => `<tr><td><b>${esc(u.name)}</b></td><td class="muted">${esc(u.login)}</td><td>${esc(ROLE[u.role] || u.role)}</td><td>${u.active ? '<span class="chip ok">активен</span>' : '<span class="chip neutral">отключён</span>'}</td><td><div class="actions"><button class="btn sm" data-act="userEdit" data-id="${u.id}">✎</button>${u.id !== state.user.id ? `<button class="btn sm" data-act="userToggle" data-id="${u.id}" data-active="${u.active}">${u.active ? 'Отключить' : 'Включить'}</button>` : ''}</div></td></tr>`))}<p><button class="btn primary" data-act="userAdd">+ Пользователь</button></p><p class="faint">Владелец, партнёр, бухгалтер — полный доступ. Проджект-менеджер — только просмотр актов/счетов клиентам, входящих счетов и проектов; доходы, расходы и ЗП скрыты (проверяет сервер).</p>` : '') +
    (isOwner() ? `<h2>Параметры</h2><div class="card">${formHtml([{ name: 'vatRate', label: 'НДС (0.16 = 16%)', type: 'number', step: '0.01', half: true }, { name: 'payrollTax', label: 'Налоги на ФОТ (0.45 = 45%)', type: 'number', step: '0.01', half: true }, { name: 'usdRate', label: 'Курс $ → ₸', type: 'number', step: '0.01' }], state.settings || {})}</div>` : '') +
    `<h2>Резервные копии</h2><div class="card"><p class="muted" style="margin-top:0">Автоматически — при первой записи каждого дня. Папка: <code>${esc(backups.dir)}</code></p><p><button class="btn primary" data-act="backup">Сделать бэкап сейчас</button> <a class="btn" href="/api/backup" download>Скачать всю базу (JSON)</a></p>${backups.list.length ? `<div class="faint">Последние: ${backups.list.slice(0, 5).map(b => esc(b.name)).join(', ')}${backups.list.length > 5 ? ` … всего ${backups.list.length}` : ''}</div>` : ''}</div>` +
    `<h2>Обмен с 1С</h2><div class="card"><p class="muted" style="margin-top:0">Обмен файлами CSV (UTF-8, разделитель «;»). Живой синхронизации нет.</p><p><a class="btn" href="/api/export/1c/invoices.csv" download>Экспорт счетов</a> <a class="btn" href="/api/export/1c/docs.csv" download>Экспорт актов/счетов клиентам</a></p><div class="form-row"><div class="field"><label>Импорт в</label><select id="imp-col"><option value="invoices">Счета к оплате</option><option value="docs">Акты/счета клиентам</option></select></div><div class="field"><label>CSV-файл</label><input type="file" id="imp-file" accept=".csv,text/csv"></div></div><button class="btn" data-act="import">Импортировать</button> <span class="faint">Колонки как в экспорте.</span></div>` +
    `<h2>Журнал действий</h2>${audit.length ? `<pre class="log">${audit.slice(-100).reverse().map(a => `${esc(a.ts.replace('T', ' ').slice(0, 16))}  ${esc(peopleName(a.userId))}  ${esc(a.action)}  ${esc(a.collection)}${a.docId ? ' ' + esc(String(a.docId).slice(0, 8)) : ''}`).join('\n')}</pre>` : '<p class="muted">Пока пусто</p>'}`;
  const settingsForm = main.querySelector('.card form');
  if (settingsForm) { settingsForm.querySelector('button').textContent = 'Сохранить параметры'; settingsForm.onsubmit = async e => { e.preventDefault(); const v = numify(Object.fromEntries(new FormData(settingsForm).entries()), ['vatRate', 'payrollTax', 'usdRate']); state.settings = await api('/settings', { method: 'PUT', body: v }); toast('Параметры сохранены'); }; }
  const userFields = (edit) => [{ name: 'name', label: 'Имя', required: true, half: true }, { name: 'login', label: 'Логин', required: !edit, half: true }, { name: 'role', label: 'Роль', type: 'select', options: Object.entries(ROLE) }, { name: 'password', label: edit ? 'Новый пароль (пусто — не менять)' : 'Пароль', type: 'password', required: !edit }];
  ACT.userAdd = () => modal('Новый пользователь', formHtml(userFields(false)), async v => { await api('/users', { method: 'POST', body: v }); toast('Пользователь создан'); state.people = await api('/people'); route(); });
  ACT.userEdit = ({ id }) => { const u = users.find(x => x.id === id); modal('Пользователь', formHtml(userFields(true).filter(f => f.name !== 'login'), u), async v => { if (!v.password) delete v.password; await api('/users/' + id, { method: 'PUT', body: v }); toast('Сохранено'); state.people = await api('/people'); route(); }); };
  ACT.userToggle = async ({ id, active }) => { await api('/users/' + id, { method: 'PUT', body: { active: active !== 'true' } }); toast('Готово'); route(); };
  ACT.backup = async () => { const r = await api('/backup', { method: 'POST' }); toast('Бэкап создан: ' + r.name, 4000); route(); };
  ACT.seed = async () => { if (!confirm('Загрузить стартовые данные в пустую базу?')) return; const r = await api('/seed', { method: 'POST' }); toast('Загружено: ' + Object.entries(r.imported).map(([k, v]) => `${k} ${v}`).join(', '), 6000); route(); };
  ACT.import = async () => { const f = $('#imp-file').files[0]; if (!f) return toast('Выберите CSV-файл'); const csv = await f.text(); const r = await api('/import/1c/' + $('#imp-col').value, { method: 'POST', body: { csv } }); toast(`Импортировано записей: ${r.imported}`, 4000); };
  bind(main);
};
function peopleName(id) { const p = state.people.find(x => x.id === id); return p ? p.name : (id === state.user.id ? state.user.name : '—'); }

// ---- shared delete ----
ACT.del = async ({ col, id }) => { if (!confirm('Удалить запись?')) return; await api(`/${col}/${id}`, { method: 'DELETE' }); toast('Удалено'); route(); if (col === 'docs') refreshBadge(); };

boot();
})();
