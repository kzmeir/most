/* Веб-версия: та же логика, что в server.js, но хранилище — общая база артефакта claude.ai (capability db),
   а вход — по аккаунту claude.ai (capability user). Права на чтение/запись коллекций дополнительно
   зафиксированы правилами базы при публикации (см. web/build.py). */
(() => {
'use strict';
const COLLECTIONS = ['docs', 'invoices', 'projects', 'income', 'expenses', 'payroll', 'obligations', 'cash', 'taxes'];
const PM_READ = ['docs', 'invoices', 'projects'];
const ADMIN = ['owner', 'partner', 'accountant'];
const ROLE_LABEL = { owner: 'Владелец', partner: 'Партнёр', accountant: 'Бухгалтер', pm: 'Проджект-менеджер' };
const DEFAULT_SETTINGS = { companies: ['MOST Project', 'MOST Architects'], vatRate: 0.16, payrollTax: 0.45, usdRate: 525 };
const AUDIT_MAX = 300;

let db = null, user = null, dl = null, me = null, myRole = null;
const cache = {}; for (const c of COLLECTIONS) cache[c] = new Map();
let settings = Object.assign({}, DEFAULT_SETTINGS), rolesDoc = { owner: null, roles: {} }, auditItems = [];
let lastOwnWrite = 0, refreshTimer = null, firstDelivery = new Set();

const today = () => new Date().toISOString().slice(0, 10);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const daysBetween = (a, b) => Math.max(0, Math.floor((new Date(b) - new Date(a)) / 864e5));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2) + Date.now().toString(16));
const sortKey = d => d.date || d.invoiceDate || d.createdAt || d.id || '';
const col = c => [...cache[c].values()].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));

// ---------- доступ ----------
function computeRole() {
  if (!me || !me.id) return null;
  if (me.isOwner) return 'owner';
  if (me.canEdit) return rolesDoc.roles[me.id] || 'partner';
  return 'pm';
}
const isAdmin = r => ADMIN.includes(r);
function can(collection, action) {
  const role = myRole;
  if (!role) return false;
  if (isAdmin(role)) return true;
  return PM_READ.includes(collection) && action === 'read';
}

// ---------- обновление экрана при чужих изменениях ----------
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    const m = document.querySelector('#modal');
    if (m && !m.hidden) return scheduleRefresh();
    if (Date.now() - lastOwnWrite < 1500) return;
    window.dispatchEvent(new Event('hashchange'));
  }, 500);
}

// ---------- инициализация ----------
const waitFirst = (name, subscribe) => new Promise(resolve => {
  let done = false; const finish = () => { if (!done) { done = true; resolve(); } };
  setTimeout(finish, 8000);
  subscribe(() => { if (!firstDelivery.has(name)) { firstDelivery.add(name); finish(); } else scheduleRefresh(); });
});
async function init() {
  if (!window.claude || !window.claude.use) return;
  [db, user, dl] = await Promise.all([claude.use('db'), claude.use('user'), claude.use('downloads')]);
  if (!user) return;
  me = await user.me();
  if (!db || !me.id) return;
  const metaSubs = [
    waitFirst('meta/roles', cb => db.doc('meta/roles').onSnapshot(s => { if (s.exists) rolesDoc = Object.assign({ owner: null, roles: {} }, s.data()); myRole = computeRole(); cb(); }, () => cb())),
  ];
  myRole = computeRole();
  await Promise.all(metaSubs);
  myRole = computeRole();
  if (!myRole) return;
  const subs = [];
  if (isAdmin(myRole)) {
    subs.push(waitFirst('meta/settings', cb => db.doc('meta/settings').onSnapshot(s => { if (s.exists) settings = Object.assign({}, DEFAULT_SETTINGS, s.data()); cb(); }, () => cb())));
    subs.push(waitFirst('meta/audit', cb => db.doc('meta/audit').onSnapshot(s => { if (s.exists) auditItems = (s.data().items || []).slice(); cb(); }, () => cb())));
  }
  for (const c of COLLECTIONS) {
    if (!can(c, 'read')) continue;
    subs.push(waitFirst(c, cb => db.collection(c).onSnapshot(snap => { cache[c] = new Map(snap.docs.map(d => [d.id, d.data()])); cb(); }, () => cb())));
  }
  await Promise.all(subs);
  // владелец фиксирует свой id, чтобы остальные видели его имя
  if (myRole === 'owner' && rolesDoc.owner !== me.id) { rolesDoc = Object.assign({}, rolesDoc, { owner: me.id }); await db.doc('meta/roles').set(rolesDoc).catch(() => {}); }
}
const initP = init().catch(e => { console.error('init', e); });

// ---------- запись ----------
async function write(c, doc) { lastOwnWrite = Date.now(); const copy = JSON.parse(JSON.stringify(doc)); await db.collection(c).doc(copy.id).set(copy); cache[c].set(copy.id, copy); return copy; }
async function removeDoc(c, id) { if (!cache[c].has(id)) return false; lastOwnWrite = Date.now(); await db.collection(c).doc(id).delete(); cache[c].delete(id); return true; }
async function audit(action, collection, docId, extra) {
  auditItems.push({ ts: new Date().toISOString(), userId: me.id, action, collection, docId, extra: extra || null });
  if (auditItems.length > AUDIT_MAX) auditItems.splice(0, auditItems.length - AUDIT_MAX);
  lastOwnWrite = Date.now();
  await db.doc('meta/audit').set({ items: auditItems }).catch(e => console.warn('audit', e));
}

// ---------- имена ----------
async function names(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length || !user) return {};
  const ps = await user.profiles(list);
  const out = {}; for (const id of list) out[id] = (ps[id] && ps[id].name) || 'Кто-то'; return out;
}
function decorate(docs, nm) {
  return docs.map(d => { const end = d.status === 'done' && d.doneAt ? d.doneAt : new Date().toISOString(); return Object.assign({}, d, { daysWaiting: d.createdAt ? daysBetween(d.createdAt, end) : 0, requestedByName: nm[d.requestedBy] || '', assignedToName: nm[d.assignedTo] || '', updatedByName: nm[d.updatedBy] || '' }); });
}
async function decorateDocs(docs) { const nm = await names(docs.flatMap(d => [d.requestedBy, d.assignedTo, d.updatedBy])); return decorate(docs, nm); }

// ---------- CSV ----------
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
const INVOICE_COLS = [{ key: 'invoiceDate', title: 'Дата' }, { key: 'company', title: 'Компания' }, { key: 'contractor', title: 'Контрагент' }, { key: 'amount', title: 'Сумма' }, { key: 'purpose', title: 'Назначение' }, { key: 'project', title: 'Проект' }, { key: 'status', title: 'Статус' }];
const DOC_COLS = [{ key: 'createdAt', title: 'Создан' }, { key: 'type', title: 'Тип' }, { key: 'client', title: 'Клиент' }, { key: 'project', title: 'Проект' }, { key: 'amount', title: 'Сумма' }, { key: 'description', title: 'Описание' }, { key: 'status', title: 'Статус' }, { key: 'doneAt', title: 'Выполнен' }];

// ---------- дашборд ----------
function dashboard() {
  const ym = today().slice(0, 7); const prev = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })(); const year = today().slice(0, 4);
  const sum = (arr, f) => arr.filter(f).reduce((s, x) => s + num(x.amount), 0); const inc = col('income'), exp = col('expenses');
  const incM = sum(inc, x => (x.date || '').startsWith(ym)), expM = sum(exp, x => (x.date || '').startsWith(ym));
  const incP = sum(inc, x => (x.date || '').startsWith(prev)), expP = sum(exp, x => (x.date || '').startsWith(prev));
  const incY = sum(inc, x => (x.date || '').startsWith(year)), expY = sum(exp, x => (x.date || '').startsWith(year));
  const byCompany = {}; for (const x of inc.filter(x => (x.date || '').startsWith(year))) byCompany[x.company || '—'] = (byCompany[x.company || '—'] || 0) + num(x.amount);
  const byCat = {}; for (const x of exp.filter(x => (x.date || '').startsWith(year))) byCat[x.category || 'Прочее'] = (byCat[x.category || 'Прочее'] || 0) + num(x.amount);
  const cash = col('cash').map(c => ({ id: c.id, company: c.company, balance: num(c.balance), asOf: c.asOf })); const cashTotal = cash.reduce((s, c) => s + c.balance, 0);
  const pay = [...col('payroll')].sort((a, b) => (b.id > a.id ? 1 : -1))[0]; const payrollNet = pay ? num(pay.project) + num(pay.architects) : 0;
  const payrollGross = Math.round(payrollNet * (1 + num(settings.payrollTax || 0.45))); const oblig = col('obligations').reduce((s, o) => s + num(o.monthly), 0);
  const invs = col('invoices'); const openInv = invs.filter(i => i.status === 'open'), heldInv = invs.filter(i => i.status === 'held');
  const queue = decorate(col('docs').filter(d => d.status !== 'done'), {});
  return { asOf: today(), cash, cashTotal,
    month: { ym, income: incM, expenses: expM, net: incM - expM, prevYm: prev, prevIncome: incP, prevExpenses: expP },
    year: { income: incY, expenses: expY, net: incY - expY, byCompany, byCategory: byCat },
    fixedLoad: { payrollNet, payrollGross, obligations: oblig, total: payrollGross + oblig, payrollMonth: pay ? pay.id : null },
    kpnDeferred: Math.max(0, Math.round((incY - expY) * 0.20)),
    invoices: { openCount: openInv.length, openSum: openInv.reduce((s, i) => s + num(i.amount), 0), heldCount: heldInv.length, heldSum: heldInv.reduce((s, i) => s + num(i.amount), 0) },
    queue: { count: queue.length, maxDays: queue.reduce((m, d) => Math.max(m, d.daysWaiting), 0), overdue: queue.filter(d => d.daysWaiting > 3).length, byStatus: { new: queue.filter(d => d.status === 'new').length, in_progress: queue.filter(d => d.status === 'in_progress').length } } };
}

// ---------- роутер ----------
const resp = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8' } });
const ok = b => resp(200, b), err = (s, m) => resp(s, { error: m });
async function peopleList() {
  const ids = [rolesDoc.owner, ...Object.keys(rolesDoc.roles), me.id];
  for (const d of col('docs')) ids.push(d.requestedBy, d.assignedTo);
  const nm = await names(ids);
  return [...new Set(ids.filter(Boolean))].map(id => { const role = id === rolesDoc.owner ? 'owner' : (rolesDoc.roles[id] || (id === me.id ? myRole : 'pm')); return { id, name: nm[id], role, roleLabel: ROLE_LABEL[role] }; });
}
async function route(path, opts) {
  await initP;
  const method = (opts && opts.method) || 'GET'; const body = (opts && opts.body) || {};
  const [seg, id2, seg3] = path.replace(/^\/+/, '').split('?')[0].split('/').filter(Boolean);
  if (seg === 'status') return ok({ needsSetup: false, web: true, hasData: COLLECTIONS.some(c => cache[c].size > 0), seed: { available: false, files: [] }, version: '1.0-web' });
  if (!window.claude || !window.claude.use) return err(503, 'Эта версия работает только внутри claude.ai.');
  if (!user || !me || !me.id) return err(401, 'Войдите в claude.ai под рабочим аккаунтом организации.');
  if (!db) return err(503, 'База недоступна для этого аккаунта.');
  if (!myRole) return err(403, 'У вас нет доступа к этой странице.');
  const role = myRole;
  if (seg === 'me') return ok({ user: { id: me.id, login: '', name: me.name || 'Вы', role, roleLabel: role === 'partner' && !rolesDoc.roles[me.id] ? 'Полный доступ' : ROLE_LABEL[role], isAdmin: isAdmin(role) } });
  if (seg === 'logout') return ok({ ok: true });
  if (seg === 'people') return ok(await peopleList());
  if (seg === 'dashboard') return isAdmin(role) ? ok(dashboard()) : err(403, 'Нет доступа');
  if (seg === 'backups') return isAdmin(role) ? ok({ dir: 'claude.ai', list: [] }) : err(403, 'Нет доступа');
  if (seg === 'backup') {
    if (!isAdmin(role)) return err(403, 'Нет доступа');
    if (method === 'GET') { const copy = { exportedAt: new Date().toISOString(), settings, roles: rolesDoc, audit: auditItems }; for (const c of COLLECTIONS) copy[c] = col(c); return resp(200, JSON.stringify(copy, null, 2)); }
    return err(400, 'В веб-версии нажмите «Скачать всю базу (JSON)»');
  }
  if (seg === 'seed') return err(400, 'Данные уже загружены');
  if (seg === 'export' && id2 === '1c') {
    if (!isAdmin(role)) return err(403, 'Нет доступа');
    if (seg3 === 'invoices.csv') return resp(200, toCSV(col('invoices'), INVOICE_COLS)); if (seg3 === 'docs.csv') return resp(200, toCSV(col('docs'), DOC_COLS)); return err(404, 'Нет такого экспорта');
  }
  if (seg === 'import' && id2 === '1c' && method === 'POST') {
    if (!isAdmin(role)) return err(403, 'Нет доступа'); const target = seg3; if (!['invoices', 'docs'].includes(target)) return err(400, 'invoices или docs');
    const rows = parseCSV(body.csv || ''); const amt = r => num(String(r['Сумма']).replace(/\s/g, '').replace(',', '.'));
    const map = target === 'invoices' ? r => ({ invoiceDate: r['Дата'] || today(), company: r['Компания'] || '', contractor: r['Контрагент'] || '', amount: amt(r), purpose: r['Назначение'] || '', project: r['Проект'] || '', status: r['Статус'] || 'open', createdBy: me.id, createdAt: new Date().toISOString(), source: '1c' })
      : r => ({ type: r['Тип'] || 'act', client: r['Клиент'] || '', project: r['Проект'] || '', amount: amt(r), description: r['Описание'] || '', status: r['Статус'] || 'new', requestedBy: me.id, createdAt: new Date().toISOString(), source: '1c' });
    for (const r of rows) await write(target, Object.assign(map(r), { id: uid() }));
    await audit('import1c', target, null, { rows: rows.length }); return ok({ imported: rows.length });
  }
  if (seg === 'users') {
    if (role !== 'owner') return err(403, 'Только владелец');
    if (method === 'GET') { const ids = [me.id, ...Object.keys(rolesDoc.roles)]; const nm = await names(ids); return ok(ids.map(id => ({ id, login: '', name: nm[id], role: id === me.id ? 'owner' : rolesDoc.roles[id], active: true }))); }
    if (method === 'POST') { if (!body.id || !['partner', 'accountant'].includes(body.role)) return err(400, 'Человек и роль'); if (body.id === me.id) return err(400, 'Это вы'); rolesDoc = Object.assign({}, rolesDoc, { roles: Object.assign({}, rolesDoc.roles, { [body.id]: body.role }) }); lastOwnWrite = Date.now(); await db.doc('meta/roles').set(rolesDoc); await audit('create', 'users', body.id); return ok({ ok: true }); }
    if (method === 'PUT' && id2) { if (!['partner', 'accountant'].includes(body.role)) return err(400, 'Роль'); rolesDoc = Object.assign({}, rolesDoc, { roles: Object.assign({}, rolesDoc.roles, { [id2]: body.role }) }); lastOwnWrite = Date.now(); await db.doc('meta/roles').set(rolesDoc); await audit('update', 'users', id2); return ok({ ok: true }); }
    if (method === 'DELETE' && id2) { const roles = Object.assign({}, rolesDoc.roles); delete roles[id2]; rolesDoc = Object.assign({}, rolesDoc, { roles }); lastOwnWrite = Date.now(); await db.doc('meta/roles').set(rolesDoc); await audit('delete', 'users', id2); return ok({ ok: true }); }
  }
  if (seg === 'settings') {
    if (method === 'GET') return isAdmin(role) ? ok(settings) : err(403, 'Нет доступа');
    if (method === 'PUT') { if (role !== 'owner') return err(403, 'Только владелец'); settings = Object.assign({}, settings, body); lastOwnWrite = Date.now(); await db.doc('meta/settings').set(settings); await audit('update', 'settings', null); return ok(settings); }
  }
  if (seg === 'audit') return isAdmin(role) ? ok(auditItems) : err(403, 'Нет доступа');
  if (!COLLECTIONS.includes(seg)) return err(404, 'Нет такого раздела');
  const action = method === 'GET' ? 'read' : 'write'; if (!can(seg, action)) return err(403, action === 'read' ? 'Нет доступа к разделу' : 'Только просмотр');
  if (method === 'GET' && !id2) return ok(seg === 'docs' ? await decorateDocs(col('docs')) : col(seg));
  if (method === 'GET' && id2) { const d = cache[seg].get(id2); return d ? ok(seg === 'docs' ? (await decorateDocs([d]))[0] : d) : err(404, 'Не найдено'); }
  if (method === 'POST') {
    const doc = Object.assign({}, body, { createdAt: new Date().toISOString(), createdBy: me.id }); delete doc.id;
    if (seg === 'docs') { doc.status = doc.status || 'new'; doc.requestedBy = me.id; }
    if (seg === 'invoices') { doc.status = doc.status || 'open'; doc.invoiceDate = doc.invoiceDate || today(); }
    if ((seg === 'payroll' || seg === 'cash') && body.id) doc.id = String(body.id);
    if ('amount' in doc) doc.amount = num(doc.amount);
    if (!doc.id) doc.id = uid();
    const r = await write(seg, doc); await audit('create', seg, r.id); return ok(seg === 'docs' ? (await decorateDocs([r]))[0] : r);
  }
  if (method === 'PUT' && id2) {
    const before = cache[seg].get(id2); if (!before) return err(404, 'Не найдено');
    const patch = Object.assign({}, body); delete patch.id; delete patch.createdAt; delete patch.createdBy;
    if ('amount' in patch) patch.amount = num(patch.amount);
    if (seg === 'docs') { if (patch.status === 'done' && before.status !== 'done') patch.doneAt = new Date().toISOString(); if (patch.status === 'in_progress' && !before.startedAt) patch.startedAt = new Date().toISOString(); patch.updatedBy = me.id; }
    const after = Object.assign({}, before, patch, { id: id2 });
    if (seg === 'invoices' && after.status === 'paid' && before.status !== 'paid') {
      after.paidAt = after.paidAt || today();
      if (!col('expenses').some(e => e.invoiceId === after.id)) await write('expenses', { id: uid(), date: after.paidAt, company: after.company || '', recipient: after.contractor || '', amount: num(after.amount), category: 'Счета к оплате', purpose: after.purpose || '', project: after.project || '', invoiceId: after.id, createdBy: me.id, createdAt: new Date().toISOString() });
    }
    const r = await write(seg, after); await audit('update', seg, id2); return ok(seg === 'docs' ? (await decorateDocs([r]))[0] : r);
  }
  if (method === 'DELETE' && id2) { if (!(await removeDoc(seg, id2))) return err(404, 'Не найдено'); await audit('delete', seg, id2); return ok({ ok: true }); }
  return err(405, 'Метод не поддерживается');
}
window.__apiFetch = (path, opts) => route(path, opts).catch(e => { console.error(e); return err(500, 'Ошибка: ' + (e && e.message || e)); });
window.__userSearch = async q => { await initP; if (!user) return []; const hits = await user.search(q || ''); return hits.map(h => ({ id: h.id, name: h.name })); };

// ссылки «скачать» → встроенное сохранение файла
document.addEventListener('click', async e => {
  const a = e.target.closest('a[href^="/api/"]'); if (!a) return; e.preventDefault();
  const href = a.getAttribute('href'); const r = await route(href.replace(/^\/api/, ''), { method: 'GET' }); const text = await r.text();
  if (!r.ok) { const t = document.querySelector('#toast'); if (t) { t.textContent = 'Нет доступа'; t.hidden = false; setTimeout(() => t.hidden = true, 2500); } return; }
  const filename = href.endsWith('.csv') ? href.split('/').pop().replace('.csv', '-1c.csv') : `most-finance-${today()}.json`;
  if (dl) { try { await dl.save({ filename, data: text }); } catch (er) { if (er && er.code !== 'declined') console.warn('download', er); } return; }
  const m = document.querySelector('#modal'); document.querySelector('#modal-title').textContent = a.textContent.trim();
  document.querySelector('#modal-body').innerHTML = '<p class="muted" style="margin-top:0">Скачивание здесь недоступно. Скопируйте текст.</p><textarea id="dl-text" rows="12" style="font-family:ui-monospace,monospace;font-size:12px"></textarea><p><button class="btn primary" id="dl-copy">Скопировать</button></p>';
  document.querySelector('#dl-text').value = text; m.hidden = false;
  document.querySelector('#dl-copy').onclick = async () => { try { await navigator.clipboard.writeText(text); document.querySelector('#dl-copy').textContent = 'Скопировано'; } catch { document.querySelector('#dl-text').select(); } };
});
})();
