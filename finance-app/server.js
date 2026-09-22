'use strict';
// MOST Финансы — self-hosted сервер. Только встроенные модули Node.js.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const store = require('./lib/store');
const auth = require('./lib/auth');
const rules = require('./lib/rules');
const x1c = require('./lib/export1c');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const SEED_DIR = path.join(__dirname, 'seed');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };

store.load();

// ---------- helpers ----------
function send(res, status, body, headers) {
  const h = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {});
  res.writeHead(status, h);
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const ok = (res, body) => send(res, 200, body);
const err = (res, status, message) => send(res, status, { error: message });
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 2 * 1024 * 1024) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}
const today = () => new Date().toISOString().slice(0, 10);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
function daysBetween(a, b) { return Math.max(0, Math.floor((new Date(b) - new Date(a)) / 864e5)); }
function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}

// ---------- domain hooks ----------
function userName(id) { const u = store.get().users.find(x => x.id === id); return u ? (u.name || u.login) : ''; }
function decorateDoc(d) {
  const end = d.status === 'done' && d.doneAt ? d.doneAt : new Date().toISOString();
  return Object.assign({}, d, { daysWaiting: d.createdAt ? daysBetween(d.createdAt, end) : 0, requestedByName: userName(d.requestedBy), assignedToName: userName(d.assignedTo), updatedByName: userName(d.updatedBy) });
}
function onInvoiceUpdate(before, after, user) {
  // «оплачено» → запись в расходы (один раз)
  if (after.status === 'paid' && before.status !== 'paid') {
    after.paidAt = after.paidAt || today();
    const exists = store.col('expenses').some(e => e.invoiceId === after.id);
    if (!exists) store.insert('expenses', { date: after.paidAt, company: after.company || '', recipient: after.contractor || '', amount: num(after.amount), category: 'Счета к оплате', purpose: after.purpose || '', project: after.project || '', invoiceId: after.id, createdBy: user.id });
  }
}

// ---------- dashboard ----------
function dashboard() {
  const db = store.get();
  const ym = today().slice(0, 7);
  const prev = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  const year = today().slice(0, 4);
  const sum = (arr, f) => arr.filter(f).reduce((s, x) => s + num(x.amount), 0);
  const inc = db.income, exp = db.expenses;
  const incM = sum(inc, x => (x.date || '').startsWith(ym)), expM = sum(exp, x => (x.date || '').startsWith(ym));
  const incP = sum(inc, x => (x.date || '').startsWith(prev)), expP = sum(exp, x => (x.date || '').startsWith(prev));
  const incY = sum(inc, x => (x.date || '').startsWith(year)), expY = sum(exp, x => (x.date || '').startsWith(year));
  const byCompany = {}; for (const x of inc.filter(x => (x.date || '').startsWith(year))) byCompany[x.company || '—'] = (byCompany[x.company || '—'] || 0) + num(x.amount);
  const byCat = {}; for (const x of exp.filter(x => (x.date || '').startsWith(year))) byCat[x.category || 'Прочее'] = (byCat[x.category || 'Прочее'] || 0) + num(x.amount);
  const cash = db.cash.map(c => ({ id: c.id, company: c.company, balance: num(c.balance), asOf: c.asOf }));
  const cashTotal = cash.reduce((s, c) => s + c.balance, 0);
  const pay = [...db.payroll].sort((a, b) => (b.id > a.id ? 1 : -1))[0];
  const payrollNet = pay ? num(pay.project) + num(pay.architects) : 0;
  const payrollGross = Math.round(payrollNet * (1 + num(db.settings.payrollTax || 0.45)));
  const oblig = db.obligations.reduce((s, o) => s + num(o.monthly), 0);
  const fixedLoad = payrollGross + oblig;
  const kpnDeferred = Math.max(0, Math.round((incY - expY) * 0.20));
  const openInv = db.invoices.filter(i => i.status === 'open'), heldInv = db.invoices.filter(i => i.status === 'held');
  const queue = db.docs.filter(d => d.status !== 'done').map(decorateDoc);
  return {
    asOf: today(), month: ym,
    cash, cashTotal,
    month: { ym, income: incM, expenses: expM, net: incM - expM, prevYm: prev, prevIncome: incP, prevExpenses: expP },
    year: { income: incY, expenses: expY, net: incY - expY, byCompany, byCategory: byCat },
    fixedLoad: { payrollNet, payrollGross, obligations: oblig, total: fixedLoad, payrollMonth: pay ? pay.id : null },
    kpnDeferred,
    invoices: { openCount: openInv.length, openSum: openInv.reduce((s, i) => s + num(i.amount), 0), heldCount: heldInv.length, heldSum: heldInv.reduce((s, i) => s + num(i.amount), 0) },
    queue: { count: queue.length, maxDays: queue.reduce((m, d) => Math.max(m, d.daysWaiting), 0), overdue: queue.filter(d => d.daysWaiting > 3).length, byStatus: { new: queue.filter(d => d.status === 'new').length, in_progress: queue.filter(d => d.status === 'in_progress').length } },
  };
}

// ---------- seed ----------
function seedStatus() {
  if (!fs.existsSync(SEED_DIR)) return { available: false, files: [] };
  return { available: true, files: fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.json')) };
}
function importSeed() {
  const db = store.get(); const report = {};
  for (const f of seedStatus().files) {
    const name = f.replace('.json', '');
    const data = JSON.parse(fs.readFileSync(path.join(SEED_DIR, f), 'utf8'));
    if (name === 'settings') { db.settings = Object.assign({}, db.settings, data); report.settings = 'ok'; continue; }
    if (!store.COLLECTIONS.includes(name)) continue;
    if (db[name].length) { report[name] = `пропущено (уже ${db[name].length})`; continue; }
    for (const d of data) { if (!d.id) d.id = store.id(); db[name].push(d); }
    report[name] = data.length;
  }
  store.save(); return report;
}

// ---------- API ----------
async function api(req, res, url, user) {
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = req.method;
  const mutating = ['POST', 'PUT', 'DELETE'].includes(method);
  if (mutating && req.headers['x-requested-with'] !== 'fetch') return err(res, 403, 'CSRF: нет заголовка');
  const body = mutating ? await readBody(req).catch(e => ({ __err: e.message })) : {};
  if (body.__err) return err(res, 400, body.__err);
  const db = store.get();
  const [seg, id2, seg3] = parts;

  // --- public ---
  if (seg === 'status' && method === 'GET') return ok(res, { needsSetup: db.users.length === 0, hasData: store.COLLECTIONS.some(c => c !== 'users' && c !== 'audit' && db[c].length > 0), seed: seedStatus(), version: '1.0' });
  if (seg === 'setup' && method === 'POST') {
    if (db.users.length) return err(res, 403, 'Уже настроено');
    if (!body.login || !body.password || String(body.password).length < 6) return err(res, 400, 'Логин и пароль (мин. 6 символов)');
    const { salt, hash } = auth.hashPassword(body.password);
    const u = store.insert('users', { login: String(body.login).trim().toLowerCase(), name: body.name || body.login, role: 'owner', salt, passHash: hash, active: true, createdAt: new Date().toISOString() });
    const token = auth.createSession(u.id);
    return send(res, 200, { user: auth.publicUser(u) }, { 'Set-Cookie': auth.sessionCookie(token) });
  }
  if (seg === 'login' && method === 'POST') {
    const ip = req.socket.remoteAddress || '';
    if (!auth.loginAllowed(ip)) return err(res, 429, 'Слишком много попыток. Подождите 15 минут.');
    const u = db.users.find(x => x.login === String(body.login || '').trim().toLowerCase() && x.active !== false);
    if (!u || !auth.verifyPassword(body.password || '', u.salt, u.passHash)) { auth.noteFailedLogin(ip); return err(res, 401, 'Неверный логин или пароль'); }
    const token = auth.createSession(u.id);
    store.audit(u.id, 'login', 'users', u.id);
    return send(res, 200, { user: auth.publicUser(u) }, { 'Set-Cookie': auth.sessionCookie(token) });
  }
  if (seg === 'logout' && method === 'POST') { if (user) auth.destroySession(user.token); return send(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() }); }
  if (seg === 'me' && method === 'GET') return user ? ok(res, { user: { id: user.id, login: user.login, name: user.name, role: user.role, roleLabel: rules.ROLE_LABEL[user.role], isAdmin: rules.isAdmin(user.role) } }) : err(res, 401, 'Не авторизован');

  if (!user) return err(res, 401, 'Не авторизован');
  const role = user.role;
  // список людей (без секретов) — для назначения и отображения имён
  if (seg === 'people' && method === 'GET') return ok(res, db.users.filter(u => u.active !== false).map(u => ({ id: u.id, name: u.name || u.login, role: u.role, roleLabel: rules.ROLE_LABEL[u.role] })));

  // --- dashboard / backup / seed / 1c ---
  if (seg === 'dashboard') { if (!rules.isAdmin(role)) return err(res, 403, 'Нет доступа'); return ok(res, dashboard()); }
  if (seg === 'backups' && method === 'GET') { if (!rules.isAdmin(role)) return err(res, 403, 'Нет доступа'); return ok(res, { dir: store.BACKUP_DIR, list: store.listBackups() }); }
  if (seg === 'backup') {
    if (!rules.isAdmin(role)) return err(res, 403, 'Нет доступа');
    if (method === 'POST') { const name = store.backup('manual'); store.audit(user.id, 'backup', 'db', name); return ok(res, { name, dir: store.BACKUP_DIR }); }
    if (method === 'GET') { const copy = Object.assign({}, db); delete copy.sessions; return send(res, 200, JSON.stringify(copy, null, 2), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="most-finance-${today()}.json"` }); }
  }
  if (seg === 'seed' && method === 'POST') { if (role !== 'owner') return err(res, 403, 'Только владелец'); const r = importSeed(); store.audit(user.id, 'seed', 'db', null, r); return ok(res, { imported: r }); }
  if (seg === 'export' && id2 === '1c' && method === 'GET') {
    if (!rules.isAdmin(role)) return err(res, 403, 'Нет доступа');
    if (seg3 === 'invoices.csv') return send(res, 200, x1c.toCSV(db.invoices, x1c.INVOICE_COLS), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="invoices-1c.csv"' });
    if (seg3 === 'docs.csv') return send(res, 200, x1c.toCSV(db.docs, x1c.DOC_COLS), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="docs-1c.csv"' });
    return err(res, 404, 'Нет такого экспорта');
  }
  if (seg === 'import' && id2 === '1c' && method === 'POST') {
    if (!rules.isAdmin(role)) return err(res, 403, 'Нет доступа');
    const target = seg3; if (!['invoices', 'docs'].includes(target)) return err(res, 400, 'invoices или docs');
    const rows = x1c.parseCSV(body.csv || ''); let n = 0;
    const map = target === 'invoices'
      ? r => ({ invoiceDate: r['Дата'] || today(), company: r['Компания'] || '', contractor: r['Контрагент'] || '', amount: num(String(r['Сумма']).replace(/\s/g, '').replace(',', '.')), purpose: r['Назначение'] || '', project: r['Проект'] || '', status: r['Статус'] || 'open', createdBy: user.id, createdAt: new Date().toISOString(), source: '1c' })
      : r => ({ type: r['Тип'] || 'act', client: r['Клиент'] || '', project: r['Проект'] || '', amount: num(String(r['Сумма']).replace(/\s/g, '').replace(',', '.')), description: r['Описание'] || '', status: r['Статус'] || 'new', requestedBy: user.id, createdAt: new Date().toISOString(), source: '1c' });
    for (const r of rows) { store.insert(target, map(r)); n++; }
    store.audit(user.id, 'import1c', target, null, { rows: n });
    return ok(res, { imported: n });
  }

  // --- users (owner) ---
  if (seg === 'users') {
    if (role !== 'owner') return err(res, 403, 'Только владелец');
    if (method === 'GET') return ok(res, db.users.map(auth.publicUser));
    if (method === 'POST') {
      if (!body.login || !body.password || !rules.ROLES.includes(body.role)) return err(res, 400, 'Логин, пароль, роль');
      if (db.users.some(u => u.login === String(body.login).trim().toLowerCase())) return err(res, 409, 'Такой логин уже есть');
      const { salt, hash } = auth.hashPassword(body.password);
      const u = store.insert('users', { login: String(body.login).trim().toLowerCase(), name: body.name || body.login, role: body.role, salt, passHash: hash, active: true, createdAt: new Date().toISOString() });
      store.audit(user.id, 'create', 'users', u.id); return ok(res, auth.publicUser(u));
    }
    if (method === 'PUT' && id2) {
      const u = store.find('users', id2); if (!u) return err(res, 404, 'Нет пользователя');
      const patch = {};
      if (body.name) patch.name = body.name;
      if (body.role && rules.ROLES.includes(body.role)) { if (u.id === user.id && body.role !== 'owner') return err(res, 400, 'Нельзя снять роль владельца с себя'); patch.role = body.role; }
      if (typeof body.active === 'boolean') { if (u.id === user.id && !body.active) return err(res, 400, 'Нельзя отключить себя'); patch.active = body.active; }
      if (body.password) { const { salt, hash } = auth.hashPassword(body.password); patch.salt = salt; patch.passHash = hash; }
      const r = store.update('users', id2, patch); store.audit(user.id, 'update', 'users', id2); return ok(res, auth.publicUser(r));
    }
    if (method === 'DELETE' && id2) { if (id2 === user.id) return err(res, 400, 'Нельзя удалить себя'); store.remove('users', id2); store.audit(user.id, 'delete', 'users', id2); return ok(res, { ok: true }); }
  }
  // --- settings ---
  if (seg === 'settings') {
    if (method === 'GET') { if (!rules.can(role, 'settings', 'read')) return err(res, 403, 'Нет доступа'); return ok(res, db.settings); }
    if (method === 'PUT') { if (!rules.can(role, 'settings', 'write')) return err(res, 403, 'Только владелец'); db.settings = Object.assign({}, db.settings, body); store.save(); store.audit(user.id, 'update', 'settings', null); return ok(res, db.settings); }
  }

  // --- generic collections ---
  if (!store.COLLECTIONS.includes(seg) || seg === 'users') return err(res, 404, 'Нет такого раздела');
  const action = method === 'GET' ? 'read' : 'write';
  if (!rules.can(role, seg, action)) return err(res, 403, action === 'read' ? 'Нет доступа к разделу' : 'Только просмотр');
  const list = db[seg];
  if (method === 'GET' && !id2) return ok(res, seg === 'docs' ? list.map(decorateDoc) : list);
  if (method === 'GET' && id2) { const d = store.find(seg, id2); return d ? ok(res, seg === 'docs' ? decorateDoc(d) : d) : err(res, 404, 'Не найдено'); }
  if (method === 'POST') {
    const doc = Object.assign({}, body, { createdAt: new Date().toISOString(), createdBy: user.id }); delete doc.id;
    if (seg === 'docs') { doc.status = doc.status || 'new'; doc.requestedBy = user.id; }
    if (seg === 'invoices') { doc.status = doc.status || 'open'; doc.invoiceDate = doc.invoiceDate || today(); }
    if (seg === 'payroll' && body.id) doc.id = body.id;
    if (seg === 'cash' && body.id) doc.id = body.id;
    if ('amount' in doc) doc.amount = num(doc.amount);
    const r = store.insert(seg, doc); store.audit(user.id, 'create', seg, r.id); return ok(res, seg === 'docs' ? decorateDoc(r) : r);
  }
  if (method === 'PUT' && id2) {
    const before = store.find(seg, id2); if (!before) return err(res, 404, 'Не найдено');
    const patch = Object.assign({}, body); delete patch.id; delete patch.createdAt; delete patch.createdBy;
    if ('amount' in patch) patch.amount = num(patch.amount);
    if (seg === 'docs') { if (patch.status === 'done' && before.status !== 'done') patch.doneAt = new Date().toISOString(); if (patch.status === 'in_progress' && !before.startedAt) patch.startedAt = new Date().toISOString(); patch.updatedBy = user.id; }
    const after = Object.assign({}, before, patch);
    if (seg === 'invoices') onInvoiceUpdate(before, after, user);
    const r = store.update(seg, id2, Object.assign(patch, seg === 'invoices' && after.paidAt ? { paidAt: after.paidAt } : {}));
    store.audit(user.id, 'update', seg, id2); return ok(res, seg === 'docs' ? decorateDoc(r) : r);
  }
  if (method === 'DELETE' && id2) { if (!store.remove(seg, id2)) return err(res, 404, 'Не найдено'); store.audit(user.id, 'delete', seg, id2); return ok(res, { ok: true }); }
  return err(res, 405, 'Метод не поддерживается');
}

// ---------- static ----------
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || !path.extname(p)) p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) return err(res, 403, 'forbidden');
  fs.readFile(file, (e, data) => {
    if (e) return err(res, 404, 'not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api')) return await api(req, res, url, auth.currentUser(req));
    if (req.method === 'GET') return serveStatic(req, res, url);
    return err(res, 405, 'method');
  } catch (e) {
    console.error(e);
    return err(res, 500, 'Ошибка сервера: ' + e.message);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  MOST Финансы запущен.');
  console.log(`  На этом компьютере:  http://localhost:${PORT}`);
  for (const ip of lanIPs()) console.log(`  Для команды в сети:  http://${ip}:${PORT}`);
  console.log(`  База данных:         ${store.DB_FILE}`);
  console.log(`  Бэкапы:              ${store.BACKUP_DIR}\n`);
  console.log('  Не закрывайте это окно, пока приложением пользуются.\n');
});
