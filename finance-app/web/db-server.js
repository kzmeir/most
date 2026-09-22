/* Веб-версия: та же логика, что в server.js, но хранилище — общая база артефакта claude.ai (capability db),
   а вход — по аккаунту claude.ai (capability user). Операции хранятся месячными документами opsm/ГГГГ-ММ.
   Права на чтение/запись коллекций дополнительно зафиксированы правилами базы при публикации (см. web/build.py). */
(() => {
'use strict';
const D = window.MostDomain;
const COLS = D.COLLECTIONS.filter(c => !['users', 'audit', 'ops'].includes(c)); // обычные коллекции: документ = запись
const AUDIT_MAX = 300, MAX_OPS = 3000;

let db = null, user = null, dl = null, me = null, myRole = null;
const cache = {}; for (const c of COLS) cache[c] = new Map();
let months = new Map(); // ym -> {ym, items:[]}
let settings = Object.assign({}, D.DEFAULT_SETTINGS), rolesDoc = { owner: null, roles: {} }, auditItems = [];
let lastOwnWrite = 0, refreshTimer = null; const firstDelivery = new Set();

const today = D.todayStr, num = D.num, uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2) + Date.now().toString(16));
const sortKey = d => d.date || d.invoiceDate || d.createdAt || d.id || '';
const col = c => [...cache[c].values()].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
const allOps = () => { const out = []; for (const m of months.values()) for (const o of m.items || []) out.push(o); return out; };
const view = () => ({ ops: allOps(), settings, docs: col('docs'), invoices: col('invoices'), projects: col('projects'), contracts: col('contracts'), subcontracts: col('subcontracts'), proposals: col('proposals'), accounts: col('accounts'), categories: col('categories'), payroll: col('payroll'), obligations: col('obligations'), cash: col('cash') });

// ---------- доступ ----------
function computeRole() { if (!me || !me.id) return null; if (me.isOwner) return 'owner'; if (me.canEdit) return rolesDoc.roles[me.id] || 'partner'; return 'pm'; }
const can = (c, action) => myRole ? D.can(myRole, c, action) : false;

// ---------- обновление экрана при чужих изменениях ----------
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    const m = document.querySelector('#modal'); if (m && !m.hidden) return scheduleRefresh();
    if (Date.now() - lastOwnWrite < 1500) return;
    if (document.activeElement && document.activeElement.tagName === 'SELECT') return scheduleRefresh();
    window.dispatchEvent(new Event('hashchange'));
  }, 600);
}
const waitFirst = (name, subscribe) => new Promise(resolve => {
  let done = false; const finish = () => { if (!done) { done = true; resolve(); } };
  setTimeout(finish, 10000);
  subscribe(() => { if (!firstDelivery.has(name)) { firstDelivery.add(name); finish(); } else scheduleRefresh(); });
});
async function init() {
  if (!window.claude || !window.claude.use) return;
  [db, user, dl] = await Promise.all([claude.use('db'), claude.use('user'), claude.use('downloads')]);
  if (!user) return;
  me = await user.me();
  if (!db || !me.id) return;
  await waitFirst('meta/roles', cb => db.doc('meta/roles').onSnapshot(s => { if (s.exists) rolesDoc = Object.assign({ owner: null, roles: {} }, s.data()); myRole = computeRole(); cb(); }, () => cb()));
  myRole = computeRole();
  if (!myRole) return;
  const subs = [];
  if (D.isAdmin(myRole)) {
    subs.push(waitFirst('meta/settings', cb => db.doc('meta/settings').onSnapshot(s => { if (s.exists) settings = Object.assign({}, D.DEFAULT_SETTINGS, s.data()); cb(); }, () => cb())));
    subs.push(waitFirst('meta/audit', cb => db.doc('meta/audit').onSnapshot(s => { if (s.exists) auditItems = (s.data().items || []).slice(); cb(); }, () => cb())));
    subs.push(waitFirst('opsm', cb => db.collection('opsm').onSnapshot(snap => { months = new Map(snap.docs.map(d => [d.id, d.data()])); cb(); }, () => cb())));
  }
  for (const c of COLS) {
    if (!can(c, 'read')) continue;
    subs.push(waitFirst(c, cb => db.collection(c).onSnapshot(snap => { cache[c] = new Map(snap.docs.map(d => { const x = d.data(); return [x.id || d.id, x]; })); cb(); }, () => cb())));
  }
  await Promise.all(subs);
  if (myRole === 'owner' && rolesDoc.owner !== me.id) { rolesDoc = Object.assign({}, rolesDoc, { owner: me.id }); await db.doc('meta/roles').set(rolesDoc).catch(() => {}); }
}
const initP = init().catch(e => { console.error('init', e); });

// ---------- запись ----------
const clone = x => JSON.parse(JSON.stringify(x));
// id документа в базе: только [A-Za-z0-9_-.~:@+]; для кириллических кодов (проекты, категории, счета) — FNV-1a хэш (та же функция в tools/import_budget.py)
function docIdOf(id) { id = String(id); if (/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(id)) return id; let h = 0x811c9dc5; for (const b of new TextEncoder().encode(id)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return 'k-' + h.toString(16).padStart(8, '0'); }
async function write(c, doc) { lastOwnWrite = Date.now(); const copy = clone(doc); await db.collection(c).doc(docIdOf(copy.id)).set(copy); cache[c].set(copy.id, copy); return copy; }
async function removeDoc(c, id) { if (!cache[c].has(id)) return false; lastOwnWrite = Date.now(); await db.collection(c).doc(docIdOf(id)).delete(); cache[c].delete(id); return true; }
async function writeMonth(ym, items) { lastOwnWrite = Date.now(); const doc = { ym, items: clone(items) }; await db.collection('opsm').doc(ym).set(doc); months.set(ym, doc); }
function findOp(id) { for (const m of months.values()) { const i = (m.items || []).findIndex(o => o.id === id); if (i >= 0) return { ym: m.ym, items: m.items, i }; } return null; }
async function insertOp(op) { const ym = (op.date || today()).slice(0, 7); const m = months.get(ym) || { ym, items: [] }; op.id = op.id || `op-${(op.date || today()).replace(/-/g, '')}-${uid().slice(0, 8)}`; await writeMonth(ym, [...(m.items || []), op]); return op; }
async function updateOp(id, patch) {
  const f = findOp(id); if (!f) return null;
  const after = Object.assign({}, f.items[f.i], patch, { id });
  const newYm = (after.date || '').slice(0, 7);
  if (newYm && newYm !== f.ym) { await writeMonth(f.ym, f.items.filter((_, k) => k !== f.i)); const m = months.get(newYm) || { ym: newYm, items: [] }; await writeMonth(newYm, [...(m.items || []), after]); }
  else { const items = f.items.slice(); items[f.i] = after; await writeMonth(f.ym, items); }
  return after;
}
async function deleteOp(id) { const f = findOp(id); if (!f) return false; await writeMonth(f.ym, f.items.filter((_, k) => k !== f.i)); return true; }
async function audit(action, collection, docId, extra) {
  auditItems.push({ ts: new Date().toISOString(), userId: me.id, action, collection, docId, extra: extra || null });
  if (auditItems.length > AUDIT_MAX) auditItems.splice(0, auditItems.length - AUDIT_MAX);
  lastOwnWrite = Date.now();
  await db.doc('meta/audit').set({ items: auditItems }).catch(e => console.warn('audit', e));
}

// ---------- имена ----------
async function names(ids) {
  const list = [...new Set(ids.filter(Boolean))]; if (!list.length || !user) return {};
  const ps = await user.profiles(list); const out = {}; for (const id of list) out[id] = (ps[id] && ps[id].name) || 'Кто-то'; return out;
}
async function decorateDocs(docs) { const nm = await names(docs.flatMap(d => [d.requestedBy, d.assignedTo, d.updatedBy])); return docs.map(d => D.decorateDoc(d, id => nm[id] || '')); }

// ---------- роутер ----------
const resp = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8' } });
const ok = b => resp(200, b), err = (s, m) => resp(s, { error: m });
async function peopleList() {
  const ids = [rolesDoc.owner, ...Object.keys(rolesDoc.roles), me.id];
  for (const d of col('docs')) ids.push(d.requestedBy, d.assignedTo);
  const nm = await names(ids);
  return [...new Set(ids.filter(Boolean))].map(id => { const role = id === rolesDoc.owner ? 'owner' : (rolesDoc.roles[id] || (id === me.id ? myRole : 'pm')); return { id, name: nm[id], role, roleLabel: D.ROLE_LABEL[role] }; });
}
const NUMKEYS = ['amount', 'sum', 'paid', 'remaining', 'toPay', 'toClose', 'closedActs', 'byBudget', 'monthly', 'monthsLeft', 'balance', 'contractNoVat', 'targetCost', 'invoiceAmount', 'debit', 'credit'];
async function route(path, opts) {
  await initP;
  const method = (opts && opts.method) || 'GET'; const body = (opts && opts.body) || {};
  const [p, qstr] = path.replace(/^\/+/, '').split('?'); const [seg, id2, seg3] = p.split('/').filter(Boolean);
  const qs = Object.fromEntries(new URLSearchParams(qstr || '').entries());
  if (seg === 'status') return ok({ needsSetup: false, web: true, hasData: months.size > 0 || COLS.some(c => cache[c].size > 0), seed: { available: false, files: [] }, version: '2.0-web' });
  if (!window.claude || !window.claude.use) return err(503, 'Эта версия работает только внутри claude.ai.');
  if (!user || !me || !me.id) return err(401, 'Войдите в claude.ai под рабочим аккаунтом организации.');
  if (!db) return err(503, 'База недоступна для этого аккаунта.');
  if (!myRole) return err(403, 'У вас нет доступа к этой странице.');
  const role = myRole;
  if (seg === 'me') return ok({ user: { id: me.id, login: '', name: me.name || 'Вы', role, roleLabel: role === 'partner' && !rolesDoc.roles[me.id] ? 'Полный доступ' : D.ROLE_LABEL[role], isAdmin: D.isAdmin(role) } });
  if (seg === 'logout') return ok({ ok: true });
  if (seg === 'people') return ok(await peopleList());
  if (seg === 'dashboard') return D.isAdmin(role) ? ok(D.dashboard(view())) : err(403, 'Нет доступа');
  if (seg === 'backups') return D.isAdmin(role) ? ok({ dir: 'claude.ai', list: [] }) : err(403, 'Нет доступа');
  if (seg === 'backup') {
    if (!D.isAdmin(role)) return err(403, 'Нет доступа');
    if (method === 'GET') { const v = view(); const copy = Object.assign({ exportedAt: new Date().toISOString(), roles: rolesDoc, audit: auditItems }, v); return resp(200, JSON.stringify(copy)); }
    return err(400, 'В веб-версии нажмите «Скачать всю базу (JSON)»');
  }
  if (seg === 'seed') return err(400, 'Данные уже загружены');
  if (seg === 'export' && id2 === '1c') {
    if (!D.isAdmin(role)) return err(403, 'Нет доступа');
    const name = (seg3 || '').replace('.csv', ''); const spec = D.CSV[name]; if (!spec) return err(404, 'Нет такого экспорта');
    const v = view(); const rows = name === 'ops' ? D.filterOps(v.ops, qs, v.accounts, v.categories) : v[name];
    return resp(200, D.toCSV(rows, spec.cols));
  }
  if (seg === 'import' && id2 === '1c' && method === 'POST') {
    if (!D.isAdmin(role)) return err(403, 'Нет доступа'); const target = seg3; const spec = D.CSV[target]; if (!spec) return err(400, 'invoices, docs или ops');
    const rows = D.parseCSV(body.csv || ''); let n = 0;
    if (target === 'ops') { const byYm = {}; for (const r of rows) { const d = Object.assign(spec.fromRow(r), { createdBy: me.id, createdAt: new Date().toISOString(), source: '1c' }); d.id = `op-${d.date.replace(/-/g, '')}-${uid().slice(0, 8)}`; (byYm[d.date.slice(0, 7)] = byYm[d.date.slice(0, 7)] || []).push(d); n++; }
      for (const [ym, items] of Object.entries(byYm)) { const m = months.get(ym) || { ym, items: [] }; await writeMonth(ym, [...(m.items || []), ...items]); } }
    else for (const r of rows) { const d = Object.assign(spec.fromRow(r), { id: uid(), createdBy: me.id, createdAt: new Date().toISOString(), source: '1c' }); if (target === 'docs') d.requestedBy = me.id; await write(target, d); n++; }
    await audit('import1c', target, null, { rows: n }); return ok({ imported: n });
  }
  if (seg === 'users') {
    if (role !== 'owner') return err(403, 'Только владелец');
    if (method === 'GET') { const ids = [me.id, ...Object.keys(rolesDoc.roles)]; const nm = await names(ids); return ok(ids.map(id => ({ id, login: '', name: nm[id], role: id === me.id ? 'owner' : rolesDoc.roles[id], active: true }))); }
    const saveRoles = async () => { lastOwnWrite = Date.now(); await db.doc('meta/roles').set(rolesDoc); };
    if (method === 'POST') { if (!body.id || !['partner', 'accountant'].includes(body.role)) return err(400, 'Человек и роль'); if (body.id === me.id) return err(400, 'Это вы'); rolesDoc = Object.assign({}, rolesDoc, { roles: Object.assign({}, rolesDoc.roles, { [body.id]: body.role }) }); await saveRoles(); await audit('create', 'users', body.id); return ok({ ok: true }); }
    if (method === 'PUT' && id2) { if (!['partner', 'accountant'].includes(body.role)) return err(400, 'Роль'); rolesDoc = Object.assign({}, rolesDoc, { roles: Object.assign({}, rolesDoc.roles, { [id2]: body.role }) }); await saveRoles(); await audit('update', 'users', id2); return ok({ ok: true }); }
    if (method === 'DELETE' && id2) { const roles = Object.assign({}, rolesDoc.roles); delete roles[id2]; rolesDoc = Object.assign({}, rolesDoc, { roles }); await saveRoles(); await audit('delete', 'users', id2); return ok({ ok: true }); }
  }
  if (seg === 'settings') {
    if (method === 'GET') return D.isAdmin(role) ? ok(settings) : err(403, 'Нет доступа');
    if (method === 'PUT') { if (role !== 'owner') return err(403, 'Только владелец'); settings = Object.assign({}, settings, body); lastOwnWrite = Date.now(); await db.doc('meta/settings').set(settings); await audit('update', 'settings', null); return ok(settings); }
  }
  if (seg === 'audit') return D.isAdmin(role) ? ok(auditItems) : err(403, 'Нет доступа');

  // --- операции ---
  if (seg === 'ops') {
    const action = method === 'GET' ? 'read' : 'write'; if (!can('ops', action)) return err(403, action === 'read' ? 'Нет доступа к разделу' : 'Только просмотр');
    const v = view();
    if (method === 'GET') {
      if (id2 === 'months') return ok(D.monthsList(v.ops));
      if (id2 === 'summary') return ok(D.projectSummary(D.filterOps(v.ops, qs, v.accounts, v.categories), v.categories));
      if (id2) { const f = findOp(id2); return f ? ok(f.items[f.i]) : err(404, 'Не найдено'); }
      const list = D.filterOps(v.ops, qs, v.accounts, v.categories).sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id)));
      return ok({ total: list.length, totals: D.totals(list, v.categories), items: list.slice(0, MAX_OPS) });
    }
    if (method === 'POST' && id2 === 'bulk') {
      const items = Array.isArray(body.items) ? body.items : []; if (!items.length) return err(400, 'Нет операций');
      const hist = D.buildHistory(v.ops); const byYm = {}; let n = 0;
      for (const it of items) {
        const doc = Object.assign({}, it, { createdAt: new Date().toISOString(), createdBy: me.id, source: it.source || 'statement' }); delete doc.id;
        doc.date = doc.date || today(); doc.debit = num(doc.debit); doc.credit = num(doc.credit); doc.account = doc.account || body.account || 'nal';
        if (body.autoTag !== false) Object.assign(doc, D.suggest(doc, hist));
        doc.id = `op-${doc.date.replace(/-/g, '')}-${uid().slice(0, 8)}`; (byYm[doc.date.slice(0, 7)] = byYm[doc.date.slice(0, 7)] || []).push(doc); n++;
      }
      for (const [ym, its] of Object.entries(byYm)) { const m = months.get(ym) || { ym, items: [] }; await writeMonth(ym, [...(m.items || []), ...its]); }
      if (body.cash && body.cash.company) { const id = body.cash.id || ('acc-' + (body.account || 'x')); await write('cash', { id, company: body.cash.company, account: body.cash.account || body.account || '', balance: num(body.cash.balance), asOf: body.cash.asOf || today() }); }
      await audit('import-statement', 'ops', null, { rows: n, account: body.account || '' }); return ok({ imported: n });
    }
    if (method === 'POST') { const doc = Object.assign({}, body, { createdAt: new Date().toISOString(), createdBy: me.id }); delete doc.id; delete doc.auto; delete doc.autoProject; doc.date = doc.date || today(); doc.debit = num(doc.debit); doc.credit = num(doc.credit); doc.source = doc.source || 'manual'; const r = await insertOp(doc); await audit('create', 'ops', r.id); return ok(r); }
    if (method === 'PUT' && id2) { const patch = Object.assign({}, body); delete patch.id; delete patch.createdAt; delete patch.createdBy; if ('debit' in patch) patch.debit = num(patch.debit); if ('credit' in patch) patch.credit = num(patch.credit); if ('category' in patch) patch.auto = false; if ('project' in patch) patch.autoProject = false; const r = await updateOp(id2, patch); if (!r) return err(404, 'Не найдено'); await audit('update', 'ops', id2); return ok(r); }
    if (method === 'DELETE' && id2) { if (!(await deleteOp(id2))) return err(404, 'Не найдено'); await audit('delete', 'ops', id2); return ok({ ok: true }); }
  }

  // --- обычные коллекции ---
  if (!COLS.includes(seg)) return err(404, 'Нет такого раздела');
  const action = method === 'GET' ? 'read' : 'write'; if (!can(seg, action)) return err(403, action === 'read' ? 'Нет доступа к разделу' : 'Только просмотр');
  if (method === 'GET' && !id2) return ok(seg === 'docs' ? await decorateDocs(col('docs')) : col(seg));
  if (method === 'GET' && id2) { const d = cache[seg].get(id2); return d ? ok(seg === 'docs' ? (await decorateDocs([d]))[0] : d) : err(404, 'Не найдено'); }
  if (method === 'POST') {
    const doc = Object.assign({}, body, { createdAt: new Date().toISOString(), createdBy: me.id }); delete doc.id;
    if (seg === 'docs') { doc.status = doc.status || 'new'; doc.requestedBy = me.id; }
    if (seg === 'invoices') { doc.status = doc.status || 'open'; doc.invoiceDate = doc.invoiceDate || today(); }
    if (['payroll', 'cash', 'accounts', 'categories', 'projects'].includes(seg) && body.id) { doc.id = String(body.id); if (cache[seg].has(doc.id)) return err(409, 'Такой код уже есть'); }
    for (const k of NUMKEYS) if (k in doc) doc[k] = num(doc[k]);
    if (!doc.id) doc.id = uid();
    const r = await write(seg, doc); await audit('create', seg, r.id); return ok(seg === 'docs' ? (await decorateDocs([r]))[0] : r);
  }
  if (method === 'PUT' && id2) {
    const before = cache[seg].get(id2); if (!before) return err(404, 'Не найдено');
    const patch = Object.assign({}, body); delete patch.id; delete patch.createdAt; delete patch.createdBy;
    for (const k of NUMKEYS) if (k in patch) patch[k] = num(patch[k]);
    if (seg === 'docs') { if (patch.status === 'done' && before.status !== 'done') patch.doneAt = new Date().toISOString(); if (patch.status === 'in_progress' && !before.startedAt) patch.startedAt = new Date().toISOString(); patch.updatedBy = me.id; }
    const after = Object.assign({}, before, patch, { id: id2 });
    if (seg === 'invoices' && after.status === 'paid' && before.status !== 'paid') {
      after.paidAt = after.paidAt || today();
      if (!allOps().some(o => o.invoiceId === after.id)) { const op = await insertOp(Object.assign(D.invoiceToOp(after, settings, col('accounts')), { createdBy: me.id, createdAt: new Date().toISOString() })); after.opId = op.id; }
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
  const base = href.split('?')[0]; const filename = base.endsWith('.csv') ? base.split('/').pop().replace('.csv', '-1c.csv') : `most-finance-${today()}.json`;
  if (dl) { try { await dl.save({ filename, data: text }); } catch (er) { if (er && er.code !== 'declined') console.warn('download', er); } return; }
  const m = document.querySelector('#modal'); document.querySelector('#modal-title').textContent = a.textContent.trim();
  document.querySelector('#modal-body').innerHTML = '<p class="muted" style="margin-top:0">Скачивание здесь недоступно. Скопируйте текст.</p><textarea id="dl-text" rows="12" style="font-family:ui-monospace,monospace;font-size:12px"></textarea><p><button class="btn primary" id="dl-copy">Скопировать</button></p>';
  document.querySelector('#dl-text').value = text; m.hidden = false;
  document.querySelector('#dl-copy').onclick = async () => { try { await navigator.clipboard.writeText(text); document.querySelector('#dl-copy').textContent = 'Скопировано'; } catch { document.querySelector('#dl-text').select(); } };
});
})();
