'use strict';
// MOST Финансы — self-hosted сервер. Только встроенные модули Node.js.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const store = require('./lib/store');
const auth = require('./lib/auth');
const D = require('./lib/domain');
const PM = require('./lib/pm');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const SEED_DIR = path.join(__dirname, 'seed');
const FILES_DIR = path.join(store.DATA_DIR, 'files'); // файлы счетов (PDF/картинки)
const FILE_TYPES = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const FILE_COLS = ['invoices', 'docs', 'contracts', 'subcontracts', 'proposals']; // где можно прикрепить файл
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
const MAX_OPS = 3000;

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
    req.on('data', c => { size += c.length; if (size > 32 * 1024 * 1024) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}
const today = D.todayStr, num = D.num;
function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}
function userName(id) { const u = store.get().users.find(x => x.id === id); return u ? (u.name || u.login) : ''; }
const decorateDoc = d => D.decorateDoc(d, userName);

// публичный адрес из туннеля (пишет tools/serve-internet.js)
function publicUrl() { try { const f = path.join(store.DATA_DIR, 'tunnel-url.txt'); if (!fs.existsSync(f)) return ''; const st = fs.statSync(f); if (Date.now() - st.mtimeMs > 7 * 864e5) return ''; return fs.readFileSync(f, 'utf8').trim(); } catch { return ''; } }

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
    if (!store.COLLECTIONS.includes(name) || name === 'users') continue;
    if (db[name].length) { report[name] = `пропущено (уже ${db[name].length})`; continue; }
    for (const d of data) { if (!d.id) d.id = store.id(); db[name].push(d); }
    report[name] = data.length;
  }
  store.save(); return report;
}

// ---------- API ----------
async function api(req, res, url, user) {
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return p; } });
  const method = req.method;
  const mutating = ['POST', 'PUT', 'DELETE'].includes(method);
  if (mutating && req.headers['x-requested-with'] !== 'fetch') return err(res, 403, 'CSRF: нет заголовка');
  const body = mutating ? await readBody(req).catch(e => ({ __err: e.message })) : {};
  if (body.__err) return err(res, 400, body.__err);
  const db = store.get();
  const [seg, id2, seg3] = parts;
  const qs = Object.fromEntries(url.searchParams.entries());

  // --- public ---
  if (seg === 'status' && method === 'GET') return ok(res, { publicUrl: publicUrl(), needsSetup: db.users.length === 0, hasData: store.COLLECTIONS.some(c => c !== 'users' && c !== 'audit' && db[c].length > 0), seed: seedStatus(), version: '2.0' });
  if (seg === 'setup' && method === 'POST') {
    if (db.users.length) return err(res, 403, 'Уже настроено');
    if (!body.login || !body.password || String(body.password).length < 6) return err(res, 400, 'Логин и пароль (мин. 6 символов)');
    const { salt, hash } = auth.hashPassword(body.password);
    const u = store.insert('users', { login: String(body.login).trim().toLowerCase(), name: body.name || body.login, role: 'owner', salt, passHash: hash, active: true, createdAt: new Date().toISOString() });
    const token = auth.createSession(u.id);
    return send(res, 200, { user: auth.publicUser(u) }, { 'Set-Cookie': auth.sessionCookie(token) });
  }
  if (seg === 'login' && method === 'POST') {
    // за туннелем/прокси (TRUST_PROXY=1) реальный IP приходит в заголовке, иначе лимит попыток блокировал бы всех сразу
    const ip = (process.env.TRUST_PROXY ? (req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) : '') || req.socket.remoteAddress || '';
    if (!auth.loginAllowed(ip)) return err(res, 429, 'Слишком много попыток. Подождите 15 минут.');
    const u = db.users.find(x => x.login === String(body.login || '').trim().toLowerCase() && x.active !== false);
    if (!u || !auth.verifyPassword(body.password || '', u.salt, u.passHash)) { auth.noteFailedLogin(ip); return err(res, 401, 'Неверный логин или пароль'); }
    const token = auth.createSession(u.id);
    store.audit(u.id, 'login', 'users', u.id);
    return send(res, 200, { user: auth.publicUser(u) }, { 'Set-Cookie': auth.sessionCookie(token) });
  }
  if (seg === 'logout' && method === 'POST') { if (user) auth.destroySession(user.token); return send(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() }); }
  if (seg === 'me' && method === 'GET') return user ? ok(res, { user: { id: user.id, login: user.login, name: user.name, role: user.role, roleLabel: D.ROLE_LABEL[user.role], isAdmin: D.isAdmin(user.role), section: user.section, seeBudget: user.seeBudget } }) : err(res, 401, 'Не авторизован');

  if (!user) return err(res, 401, 'Не авторизован');
  const role = user.role;
  if (seg === 'people' && method === 'GET') return ok(res, db.users.filter(u => u.active !== false).map(u => ({ id: u.id, name: u.name || u.login, role: u.role, roleLabel: D.ROLE_LABEL[u.role], section: u.section || '' })));
  if (seg === 'pm') return pmApi(req, res, parts, method, body, user, db);

  // --- dashboard / backup / seed / 1c ---
  if (seg === 'dashboard') { if (!D.canDashboard(role)) return err(res, 403, 'Нет доступа'); return ok(res, D.dashboard(db)); }
  if (seg === 'backups' && method === 'GET') { if (!D.isAdmin(role)) return err(res, 403, 'Нет доступа'); return ok(res, { dir: store.BACKUP_DIR, list: store.listBackups() }); }
  if (seg === 'backup') {
    if (!D.isAdmin(role)) return err(res, 403, 'Нет доступа');
    if (method === 'POST') { const name = store.backup('manual'); store.audit(user.id, 'backup', 'db', name); return ok(res, { name, dir: store.BACKUP_DIR }); }
    if (method === 'GET') { const copy = Object.assign({}, db, { users: db.users.map(auth.publicUser) }); delete copy.sessions; return send(res, 200, JSON.stringify(copy, null, 2), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="most-finance-${today()}.json"` }); }
  }
  // --- восстановление из JSON-бэкапа (владелец): пользователи и сессии сохраняются, остальное заменяется ---
  if (seg === 'restore' && method === 'POST') {
    if (role !== 'owner') return err(res, 403, 'Только владелец');
    const data = body.data; const cols = D.backupCollections(data); if (!cols) return err(res, 400, 'Это не файл бэкапа «MOST Финансы» (нет операций, счетов или актов)');
    const before = store.backup('before-restore'); const report = {};
    for (const c of cols) { db[c] = data[c].map(d => Object.assign({}, d, { id: d.id || store.id() })); report[c] = db[c].length; }
    if (data.settings && typeof data.settings === 'object') { db.settings = Object.assign({}, db.settings, data.settings); report.settings = 'ok'; }
    store.save(); store.audit(user.id, 'restore', 'db', before, report);
    return ok(res, { restored: report, backupBefore: before });
  }
  // --- контрагенты: построить справочник, статистика, объединение ---
  if (seg === 'counterparties' && id2 === 'rebuild' && method === 'POST') {
    if (!D.can(role, 'counterparties', 'write')) return err(res, 403, 'Только просмотр');
    const fresh = D.buildCounterparties(db); for (const c of fresh) db.counterparties.push(c);
    store.audit(user.id, 'rebuild', 'counterparties', null, { added: fresh.length }); store.save(); return ok(res, { added: fresh.length, total: db.counterparties.length });
  }
  if (seg === 'counterparties' && id2 === 'stats' && method === 'GET') { if (!D.isAdmin(role)) return err(res, 403, 'Нет доступа'); return ok(res, D.counterpartyStats(db)); }
  if (seg === 'counterparties' && id2 && seg3 === 'merge' && method === 'POST') {
    if (!D.can(role, 'counterparties', 'write')) return err(res, 403, 'Только просмотр');
    const src = store.find('counterparties', id2), dst = store.find('counterparties', body.into); if (!src || !dst || src.id === dst.id) return err(res, 400, 'Укажите, с кем объединить');
    const aliases = [...new Set([...(dst.aliases || []), src.name, src.short, ...(src.aliases || [])].filter(x => x && x !== dst.name))];
    store.update('counterparties', dst.id, { aliases, bin: dst.bin || src.bin, iban: dst.iban || src.iban, contact: dst.contact || src.contact }); store.remove('counterparties', src.id);
    store.audit(user.id, 'merge', 'counterparties', dst.id, { from: src.id }); return ok(res, store.find('counterparties', dst.id));
  }
  // --- авторазнесение приходов по договорам/проектам ---
  if (seg === 'ops' && id2 === 'allocate' && method === 'POST') {
    if (!D.can(role, 'ops', 'write')) return err(res, 403, 'Только просмотр');
    const list = D.allocateIncome(db, { all: !!body.all, ids: Array.isArray(body.ids) ? body.ids : null });
    if (body.apply) { for (const a of list) store.update('ops', a.id, { project: a.project, contractId: a.contractId, autoProject: true, allocReason: a.reason }); store.audit(user.id, 'allocate', 'ops', null, { rows: list.length }); store.save(); }
    return ok(res, { proposals: list, applied: body.apply ? list.length : 0 });
  }
  if (seg === 'contracts' && id2 === 'facts' && method === 'GET') { if (!D.isAdmin(role)) return err(res, 403, 'Нет доступа'); const resolve = D.cpResolver(db.counterparties); const out = {}; for (const c of db.contracts) out[c.id] = D.contractFacts(c, db, resolve, db.projects); return ok(res, out); }
  if (seg === 'projects' && id2 && seg3 === 'card' && method === 'GET') {
    if (!D.can(role, 'projects', 'read')) return err(res, 403, 'Нет доступа');
    const p = store.find('projects', id2) || db.projects.find(x => x.name === id2); if (!p) return err(res, 404, 'Проект не найден');
    const admin = D.isAdmin(role); return ok(res, D.projectCard(p, admin ? db : Object.assign({}, db, { ops: [] }), admin));
  }
  if (seg === 'balances' && method === 'GET') { if (!D.isAdmin(role)) return err(res, 403, 'Нет доступа'); return ok(res, D.accountBalances(db.ops, db.cash, db.accounts, qs.asOf)); }
  if (seg === 'obligations' && id2 === 'invoices' && method === 'POST') {
    if (!D.can(role, 'obligations', 'write')) return err(res, 403, 'Только просмотр');
    const ym = /^\d{4}-\d{2}$/.test(body.ym || '') ? body.ym : today().slice(0, 7);
    const items = D.obligationInvoices(db.obligations, db.invoices, ym, db.settings); const created = [];
    for (const it of items) { created.push(store.insert('invoices', Object.assign(it, { createdAt: new Date().toISOString(), createdBy: user.id }))); const o = store.find('obligations', it.obligationId); if (o && o.monthsLeft !== null && o.monthsLeft !== undefined && o.monthsLeft !== '') store.update('obligations', o.id, { monthsLeft: Math.max(0, num(o.monthsLeft) - 1) }); }
    store.audit(user.id, 'obligation-invoices', 'invoices', null, { ym, rows: created.length }); store.save();
    return ok(res, { ym, created: created.length, skipped: db.obligations.length - created.length, items: created });
  }
  if (seg === 'seed' && method === 'POST') { if (role !== 'owner') return err(res, 403, 'Только владелец'); const r = importSeed(); store.audit(user.id, 'seed', 'db', null, r); return ok(res, { imported: r }); }
  if (seg === 'export' && id2 === '1c' && method === 'GET') {
    if (!D.isAdmin(role)) return err(res, 403, 'Нет доступа');
    const name = (seg3 || '').replace('.csv', ''); const spec = D.CSV[name];
    if (!spec) return err(res, 404, 'Нет такого экспорта');
    const rows = name === 'ops' ? D.filterOps(db.ops, qs, db.accounts, db.categories) : db[name];
    return send(res, 200, D.toCSV(rows, spec.cols), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}-1c.csv"` });
  }
  if (seg === 'import' && id2 === '1c' && method === 'POST') {
    if (!D.isAdmin(role)) return err(res, 403, 'Нет доступа');
    const target = seg3; const spec = D.CSV[target]; if (!spec) return err(res, 400, 'invoices, docs или ops');
    const rows = D.parseCSV(body.csv || ''); let n = 0;
    for (const r of rows) { const d = Object.assign(spec.fromRow(r), { id: store.id(), createdBy: user.id, createdAt: new Date().toISOString(), source: '1c' }); if (target === 'docs') d.requestedBy = user.id; db[target].push(d); n++; }
    store.audit(user.id, 'import1c', target, null, { rows: n }); store.save();
    return ok(res, { imported: n });
  }

  // --- счета к оплате: загрузка списком из файла и файл счёта ---
  if (seg === 'invoices' && id2 === 'bulk' && method === 'POST') {
    if (!D.can(role, 'invoices', 'write')) return err(res, 403, 'Только просмотр');
    const items = Array.isArray(body.items) ? body.items : []; if (!items.length) return err(res, 400, 'Нет счетов');
    const keys = new Set(db.invoices.map(D.invoiceKey)); const created = []; let skipped = 0;
    for (const it of items) {
      const doc = { company: String(it.company || ''), contractor: String(it.contractor || '').trim(), amount: num(it.amount), purpose: String(it.purpose || ''), project: String(it.project || ''), category: String(it.category || ''), number: String(it.number || ''), invoiceDate: it.invoiceDate || today(), status: ['open', 'held', 'paid'].includes(it.status) ? it.status : 'open', source: it.source || 'file', createdAt: new Date().toISOString(), createdBy: user.id };
      if (!doc.contractor || !doc.amount) { skipped++; continue; }
      const k = D.invoiceKey(doc); if (!it.force && keys.has(k)) { skipped++; continue; } keys.add(k);
      created.push(Object.assign({}, store.insert('invoices', doc), { ref: it.ref }));
    }
    store.audit(user.id, 'import-invoices', 'invoices', null, { rows: created.length, skipped }); store.save();
    return ok(res, { imported: created.length, skipped, items: created });
  }
  if (FILE_COLS.includes(seg) && id2 && seg3 === 'file') {
    if (!D.can(role, seg, 'write')) return err(res, 403, 'Только просмотр');
    const inv = store.find(seg, id2); if (!inv) return err(res, 404, 'Не найдено');
    const dropOld = () => { if (inv.file && inv.file.key) { try { fs.unlinkSync(path.join(FILES_DIR, path.basename(inv.file.key))); } catch { } } };
    if (method === 'POST') {
      const type = String(body.type || ''); if (!FILE_TYPES[type]) return err(res, 400, 'Разрешены PDF, JPG, PNG, WebP');
      const data = Buffer.from(String(body.data || ''), 'base64'); if (!data.length) return err(res, 400, 'Пустой файл'); if (data.length > 20 * 1024 * 1024) return err(res, 400, 'Файл больше 20 МБ');
      fs.mkdirSync(FILES_DIR, { recursive: true }); dropOld();
      const key = `${seg}-${String(id2).replace(/[^\w-]/g, '')}-${Date.now()}${FILE_TYPES[type]}`; fs.writeFileSync(path.join(FILES_DIR, key), data);
      const r = store.update(seg, id2, { file: { name: String(body.name || 'файл').slice(0, 120), type, size: data.length, key, uploadedAt: new Date().toISOString(), uploadedBy: user.id } });
      store.audit(user.id, 'file', seg, id2); return ok(res, seg === 'docs' ? decorateDoc(r) : r);
    }
    if (method === 'DELETE') { dropOld(); const r = store.update(seg, id2, { file: null }); store.audit(user.id, 'file-delete', seg, id2); return ok(res, seg === 'docs' ? decorateDoc(r) : r); }
  }
  if (seg === 'files' && id2 && method === 'GET') {
    const key = path.basename(id2); let inv = null, owner = '';
    for (const c of FILE_COLS) { const f = db[c].find(i => i.file && i.file.key === key); if (f) { inv = f; owner = c; break; } }
    const file = path.join(FILES_DIR, key);
    if (!inv || !fs.existsSync(file)) return err(res, 404, 'Файл не найден');
    if (!D.can(role, owner, 'read')) return err(res, 403, 'Нет доступа');
    return send(res, 200, fs.readFileSync(file), { 'Content-Type': inv.file.type, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(inv.file.name)}`, 'Cache-Control': 'private, max-age=3600' });
  }

  // --- users (owner) ---
  if (seg === 'users') {
    if (role !== 'owner') return err(res, 403, 'Только владелец');
    if (method === 'GET') return ok(res, db.users.map(auth.publicUser));
    if (method === 'POST') {
      if (!body.login || !body.password || !D.ROLES.includes(body.role)) return err(res, 400, 'Логин, пароль, роль');
      if (db.users.some(u => u.login === String(body.login).trim().toLowerCase())) return err(res, 409, 'Такой логин уже есть');
      const { salt, hash } = auth.hashPassword(body.password);
      const u = store.insert('users', { login: String(body.login).trim().toLowerCase(), name: body.name || body.login, role: body.role, section: String(body.section || ''), seeBudget: body.seeBudget === true || body.seeBudget === 'true', salt, passHash: hash, active: true, createdAt: new Date().toISOString() });
      store.audit(user.id, 'create', 'users', u.id); return ok(res, auth.publicUser(u));
    }
    if (method === 'PUT' && id2) {
      const u = store.find('users', id2); if (!u) return err(res, 404, 'Нет пользователя');
      const patch = {};
      if (body.name) patch.name = body.name;
      if ('section' in body) patch.section = String(body.section || '');
      if ('seeBudget' in body) patch.seeBudget = body.seeBudget === true || body.seeBudget === 'true';
      if (body.role && D.ROLES.includes(body.role)) { if (u.id === user.id && body.role !== 'owner') return err(res, 400, 'Нельзя снять роль владельца с себя'); patch.role = body.role; }
      if (typeof body.active === 'boolean') { if (u.id === user.id && !body.active) return err(res, 400, 'Нельзя отключить себя'); patch.active = body.active; }
      if (body.password) { const { salt, hash } = auth.hashPassword(body.password); patch.salt = salt; patch.passHash = hash; }
      const r = store.update('users', id2, patch); store.audit(user.id, 'update', 'users', id2); return ok(res, auth.publicUser(r));
    }
    if (method === 'DELETE' && id2) { if (id2 === user.id) return err(res, 400, 'Нельзя удалить себя'); store.remove('users', id2); store.audit(user.id, 'delete', 'users', id2); return ok(res, { ok: true }); }
  }
  // --- settings ---
  if (seg === 'settings') {
    if (method === 'GET') { if (!D.can(role, 'settings', 'read')) return err(res, 403, 'Нет доступа'); return ok(res, db.settings); }
    if (method === 'PUT') { if (!D.can(role, 'settings', 'write')) return err(res, 403, 'Только владелец'); db.settings = Object.assign({}, db.settings, body); store.save(); store.audit(user.id, 'update', 'settings', null); return ok(res, db.settings); }
  }

  // --- операции: фильтры, сводки ---
  if (seg === 'ops' && method === 'GET') {
    if (!D.can(role, 'ops', 'read')) return err(res, 403, 'Нет доступа к разделу');
    if (id2 === 'months') return ok(res, D.monthsList(db.ops));
    if (id2 === 'report') return ok(res, D.report(db.ops, qs, db.accounts, db.categories));
    if (id2 === 'summary') return ok(res, D.projectSummary(D.filterOps(db.ops, qs, db.accounts, db.categories), db.categories));
    if (id2) { const d = store.find('ops', id2); return d ? ok(res, d) : err(res, 404, 'Не найдено'); }
    const list = D.filterOps(db.ops, qs, db.accounts, db.categories).sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id)));
    return ok(res, { total: list.length, totals: D.totals(list, db.categories), items: list.slice(0, MAX_OPS) });
  }

  if (seg === 'ops' && id2 === 'bulk' && method === 'POST') {
    if (!D.can(role, 'ops', 'write')) return err(res, 403, 'Только просмотр');
    const items = Array.isArray(body.items) ? body.items : []; if (!items.length) return err(res, 400, 'Нет операций');
    const hist = D.buildHistory(db.ops); let n = 0;
    for (const it of items) {
      const doc = Object.assign({}, it, { createdAt: new Date().toISOString(), createdBy: user.id, source: it.source || 'statement' }); delete doc.id;
      doc.date = doc.date || today(); doc.debit = num(doc.debit); doc.credit = num(doc.credit); doc.account = doc.account || body.account || 'nal';
      if (body.autoTag !== false) Object.assign(doc, D.suggest(doc, hist));
      doc.id = store.id(); db.ops.push(doc); n++;
    }
    const added = db.ops.slice(-n).map(o => o.id); for (const a of D.allocateIncome(db, { ids: added })) { const o = store.find('ops', a.id); if (o) Object.assign(o, { project: a.project, contractId: a.contractId, autoProject: true, allocReason: a.reason }); }
    if (body.cash && body.cash.company) { const id = body.cash.id || ('acc-' + (body.account || 'x')); const c = store.find('cash', id); const rec = { id, company: body.cash.company, account: body.cash.account || body.account || '', balance: num(body.cash.balance), asOf: body.cash.asOf || today() }; if (c) store.update('cash', id, rec); else store.insert('cash', rec); }
    store.audit(user.id, 'import-statement', 'ops', null, { rows: n, account: body.account || '' }); store.save();
    return ok(res, { imported: n });
  }

  // --- generic collections ---
  if (!store.COLLECTIONS.includes(seg) || seg === 'users') return err(res, 404, 'Нет такого раздела');
  const action = method === 'GET' ? 'read' : 'write';
  if (!D.can(role, seg, action)) return err(res, 403, action === 'read' ? 'Нет доступа к разделу' : 'Только просмотр');
  const list = db[seg];
  if (method === 'GET' && !id2) return ok(res, seg === 'docs' ? list.map(decorateDoc) : list);
  if (method === 'GET' && id2) { const d = store.find(seg, id2); return d ? ok(res, seg === 'docs' ? decorateDoc(d) : d) : err(res, 404, 'Не найдено'); }
  if (method === 'POST') {
    const doc = Object.assign({}, body, { createdAt: new Date().toISOString(), createdBy: user.id }); delete doc.id;
    if (seg === 'docs') { doc.status = doc.status || 'new'; doc.requestedBy = user.id; }
    if (seg === 'invoices') { doc.status = doc.status || 'open'; doc.invoiceDate = doc.invoiceDate || today(); }
    if (seg === 'ops') { doc.date = doc.date || today(); doc.debit = num(doc.debit); doc.credit = num(doc.credit); doc.source = doc.source || 'manual'; delete doc.auto; delete doc.autoProject; }
    if (['payroll', 'cash', 'accounts', 'categories', 'projects'].includes(seg) && body.id) { doc.id = String(body.id); if (store.find(seg, doc.id)) return err(res, 409, 'Такой код уже есть'); }
    for (const k of ['amount', 'sum', 'paid', 'remaining', 'toPay', 'toClose', 'closedActs', 'byBudget', 'monthly', 'monthsLeft', 'balance', 'contractNoVat', 'targetCost', 'invoiceAmount']) if (k in doc) doc[k] = num(doc[k]);
    const r = store.insert(seg, doc); store.audit(user.id, 'create', seg, r.id); return ok(res, seg === 'docs' ? decorateDoc(r) : r);
  }
  if (method === 'PUT' && id2) {
    const before = store.find(seg, id2); if (!before) return err(res, 404, 'Не найдено');
    const patch = Object.assign({}, body); delete patch.id; delete patch.createdAt; delete patch.createdBy;
    for (const k of ['amount', 'sum', 'paid', 'remaining', 'toPay', 'toClose', 'closedActs', 'byBudget', 'monthly', 'monthsLeft', 'balance', 'contractNoVat', 'targetCost', 'invoiceAmount', 'debit', 'credit']) if (k in patch) patch[k] = num(patch[k]);
    if (seg === 'docs') { if (patch.status === 'done' && before.status !== 'done') patch.doneAt = new Date().toISOString(); if (patch.status === 'in_progress' && !before.startedAt) patch.startedAt = new Date().toISOString(); patch.updatedBy = user.id; }
    if (seg === 'ops') { if ('category' in patch) patch.auto = false; if ('project' in patch) patch.autoProject = false; }
    if (seg === 'invoices' && 'approved' in patch) { patch.approved = patch.approved === true || patch.approved === 'true'; if (patch.approved !== !!before.approved) { if (!['owner', 'partner'].includes(role)) return err(res, 403, 'Согласовать оплату может владелец или партнёр'); patch.approvedBy = patch.approved ? user.id : null; patch.approvedAt = patch.approved ? new Date().toISOString() : null; } }
    const after = Object.assign({}, before, patch);
    if (seg === 'invoices' && after.status === 'paid' && before.status !== 'paid') {
      after.paidAt = after.paidAt || today(); patch.paidAt = after.paidAt;
      if (!db.ops.some(o => o.invoiceId === after.id)) { const op = store.insert('ops', Object.assign(D.invoiceToOp(after, db.settings, db.accounts), { createdBy: user.id, createdAt: new Date().toISOString() })); patch.opId = op.id; }
    }
    const r = store.update(seg, id2, patch);
    store.audit(user.id, 'update', seg, id2); return ok(res, seg === 'docs' ? decorateDoc(r) : r);
  }
  if (method === 'DELETE' && id2) {
    if (FILE_COLS.includes(seg)) { const d = store.find(seg, id2); if (d && d.file && d.file.key) { try { fs.unlinkSync(path.join(FILES_DIR, path.basename(d.file.key))); } catch { } } }
    if (!store.remove(seg, id2)) return err(res, 404, 'Не найдено'); store.audit(user.id, 'delete', seg, id2); return ok(res, { ok: true });
  }
  return err(res, 405, 'Метод не поддерживается');
}

// ---------- управление проектами (ЭП / РП): отдельные права, финансы в этом разделе не видны ----------
const PM_FIELDS = ['name', 'client', 'address', 'area', 'status', 'risk', 'gipId', 'pmId', 'start', 'due', 'forecast', 'comment', 'projectId', 'members', 'miroUrl'];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in (o || {})).map(k => [k, o[k]]));
function pmApi(req, res, parts, method, body, user, db) {
  const [, a, b, c] = parts;
  if (!PM.canOpen(user)) return err(res, 403, 'Нет доступа к управлению проектами');
  const t = today(); const findP = id => db.pmProjects.find(p => p.id === id);
  const projOut = p => { const o = Object.assign({}, p); if (!PM.canBudget(user, p)) delete o.budget; return o; };
  const addItems = list => { for (const it of list) { it.id = store.id(); db.pmItems.push(it); } return list; };
  const applyPlan = (p, start, fit) => { const its = db.pmItems.filter(i => i.pid === p.id); const r = PM.plan(its, start, fit ? p.due : ''); for (const it of its) if (!it.done && r.due[it.id]) it.due = r.due[it.id]; return r; };
  const card = p => {
    const out = { project: projOut(p), items: db.pmItems.filter(i => i.pid === p.id).sort((x, y) => x.stage - y.stage || x.order - y.order), blockers: db.pmBlockers.filter(x => x.pid === p.id), canEdit: PM.isManager(user, p), canBudget: PM.canBudget(user, p), summary: PM.summary(p, db.pmItems, db.pmBlockers, t) };
    if (out.canBudget) {
      out.budget = PM.budgetCalc(p.budget);
      const fp = p.projectId ? db.projects.find(x => x.id === p.projectId) : null;
      if (fp) { const ops = db.ops.filter(o => (o.project === fp.id || o.project === fp.name) && D.catKind(db.categories, o.category) !== 'transfer'); out.fact = { project: fp.name, income: ops.reduce((s, o) => s + num(o.credit), 0), expense: ops.reduce((s, o) => s + num(o.debit), 0), n: ops.length, subPaid: db.subcontracts.filter(s => s.project === fp.id || s.project === fp.name).reduce((s, x) => s + num(x.paid), 0) }; }
    }
    return out;
  };
  if (a === 'overview' && method === 'GET') {
    const dash = PM.dashboard(db.pmProjects, db.pmItems, db.pmBlockers, t);
    dash.rows = dash.rows.map(r => Object.assign(projOut(r), { canEdit: PM.isManager(user, r), canBudget: PM.canBudget(user, r) }));
    return ok(res, Object.assign(dash, { blockersList: db.pmBlockers.map(x => Object.assign({}, x, { project: (findP(x.pid) || {}).name || '', track: (findP(x.pid) || {}).track || '' })), canCreate: PM.canCreate(user), leader: PM.isLeader(user), financeProjects: PM.isLeader(user) ? db.projects.map(p => ({ id: p.id, name: p.name })) : [] }));
  }
  if (a === 'my' && method === 'GET') {
    const active = new Set(db.pmProjects.filter(p => !['Готово', 'Отменён'].includes(p.status)).map(p => p.id));
    const mine = db.pmItems.filter(it => active.has(it.pid) && !it.done && !it.na).filter(it => { const p = findP(it.pid);
      if (it.assigneeId === user.id) return true;
      if (user.role === 'lead') return !!user.section && PM.itemSection(it) === user.section;
      if (p.gipId === user.id && ['ГИП', 'Заказчик'].includes(it.role)) return true;
      if (p.pmId === user.id && ['ПМ', 'Заказчик'].includes(it.role)) return true;
      return PM.isLeader(user) && it.due && it.due < t; });
    return ok(res, mine.map(it => { const p = findP(it.pid); return Object.assign({}, it, { project: p.name, track: p.track, canEdit: PM.canEditItem(user, p, it) }); }).sort((x, y) => String(x.due || '9').localeCompare(String(y.due || '9'))));
  }
  if (a === 'projects') {
    if (!b && method === 'POST') {
      if (!PM.canCreate(user)) return err(res, 403, 'Создавать проекты могут руководители, ПМ и ГИП');
      if (!['ep', 'rp'].includes(body.track) || !String(body.name || '').trim()) return err(res, 400, 'Укажите стадию (ЭП/РП) и название');
      const p = Object.assign(pick(body, PM_FIELDS), { id: store.id(), track: body.track, name: String(body.name).trim(), status: body.status || 'В работе', risk: body.risk || 'Низкий', createdAt: new Date().toISOString(), createdBy: user.id });
      if (user.role === 'gip' && !p.gipId) p.gipId = user.id; if (user.role === 'pm' && !p.pmId) p.pmId = user.id;
      db.pmProjects.push(p); addItems(PM.itemsFromTemplate(p.track, p.id));
      if (p.start) { const r = applyPlan(p, p.start, !!(body.fit && p.due)); if (!p.forecast) p.forecast = r.end; }
      store.save(); store.audit(user.id, 'create', 'pmProjects', p.id); return ok(res, card(p));
    }
    const p = b && findP(b); if (b && !p) return err(res, 404, 'Проект не найден');
    if (p && !c && method === 'GET') return ok(res, card(p));
    if (p && !c && method === 'PUT') {
      if (!PM.isManager(user, p)) return err(res, 403, 'Менять карточку могут руководитель, ГИП и ПМ проекта');
      const patch = pick(body, PM_FIELDS); if ('budget' in body) { if (!PM.canBudget(user, p)) return err(res, 403, 'Нет доступа к бюджету'); patch.budget = body.budget; }
      if (('gipId' in patch || 'pmId' in patch) && !PM.isLeader(user)) { delete patch.gipId; delete patch.pmId; }
      Object.assign(p, patch, { updatedAt: new Date().toISOString(), updatedBy: user.id }); store.save(); store.audit(user.id, 'update', 'pmProjects', p.id); return ok(res, card(p));
    }
    if (p && !c && method === 'DELETE') {
      if (!PM.isLeader(user)) return err(res, 403, 'Удалять может руководитель');
      db.pmItems = db.pmItems.filter(i => i.pid !== p.id); db.pmBlockers = db.pmBlockers.filter(x => x.pid !== p.id); db.pmProjects = db.pmProjects.filter(x => x.id !== p.id);
      store.save(); store.audit(user.id, 'delete', 'pmProjects', p.id); return ok(res, { ok: true });
    }
    if (p && c === 'plan' && method === 'POST') {
      if (!PM.isManager(user, p)) return err(res, 403, 'Планировать может ГИП/ПМ проекта');
      const start = body.start || p.start || t; const r = applyPlan(p, start, !!body.fit && !!p.due); p.start = start; if (!body.fit) p.forecast = r.end;
      store.save(); store.audit(user.id, 'plan', 'pmProjects', p.id, { start, fit: !!body.fit }); return ok(res, card(p));
    }
    if (p && c === 'handover' && method === 'POST') {
      if (p.track !== 'ep') return err(res, 400, 'Передать в РП можно эскизный проект'); if (!PM.isManager(user, p)) return err(res, 403, 'Передаёт ПМ проекта или руководитель');
      const rp = { id: store.id(), track: 'rp', name: p.name, client: p.client || '', address: p.address || '', area: p.area || '', projectId: p.projectId || '', members: p.members || {}, pmId: p.pmId || '', gipId: body.gipId || p.gipId || '', status: 'В работе', risk: 'Низкий', start: body.start || t, due: body.due || '', epId: p.id, createdAt: new Date().toISOString(), createdBy: user.id };
      db.pmProjects.push(rp); addItems(PM.itemsFromTemplate('rp', rp.id)); rp.forecast = applyPlan(rp, rp.start, !!rp.due).end;
      Object.assign(p, { status: 'Готово', rpId: rp.id, handedAt: t }); store.save(); store.audit(user.id, 'handover', 'pmProjects', p.id, { rp: rp.id }); return ok(res, card(rp));
    }
    if (p && c === 'items' && method === 'POST') {
      if (!PM.isManager(user, p)) return err(res, 403, 'Добавлять пункты может ГИП/ПМ проекта');
      const st = Number(body.stage) || 1; const same = db.pmItems.filter(i => i.pid === p.id && i.stage === st);
      const it = addItems([{ pid: p.id, stage: st, stageName: (same[0] || {}).stageName || PM.stageNames(p.track)[st - 1] || `Этап ${st}`, title: String(body.title || '').trim() || 'Пункт', role: body.role || 'ГИП', section: PM.ROLE_SECTION[body.role] || '', weeks: num(body.weeks) || 1, crit: body.crit || '', optional: false, done: false, na: false, due: body.due || '', assigneeId: body.assigneeId || '', note: body.note || '', order: Math.max(0, ...db.pmItems.filter(i => i.pid === p.id).map(i => i.order || 0)) + 1, custom: true }])[0];
      store.save(); store.audit(user.id, 'create', 'pmItems', it.id); return ok(res, it);
    }
  }
  if (a === 'items' && b) {
    const it = db.pmItems.find(i => i.id === b); if (!it) return err(res, 404, 'Пункт не найден'); const p = findP(it.pid);
    if (method === 'PUT') {
      if (!PM.canEditItem(user, p, it)) return err(res, 403, 'Этот пункт ведёт другой раздел');
      const patch = pick(body, ['done', 'na', 'due', 'note', 'assigneeId', 'doneNote']);
      if (PM.isManager(user, p)) Object.assign(patch, pick(body, ['title', 'role', 'weeks', 'crit', 'stage']));
      if ('done' in patch) { patch.done = !!patch.done; if (patch.done && !it.done) { patch.doneAt = t; patch.doneBy = user.id; } if (!patch.done) { patch.doneAt = ''; patch.doneBy = ''; } }
      if ('role' in patch) patch.section = PM.ROLE_SECTION[patch.role] || '';
      Object.assign(it, patch); store.save(); store.audit(user.id, 'update', 'pmItems', it.id, patch.done !== undefined ? { done: patch.done } : null); return ok(res, it);
    }
    if (method === 'DELETE') { if (!PM.isManager(user, p)) return err(res, 403, 'Удалять пункты может ГИП/ПМ проекта'); db.pmItems = db.pmItems.filter(i => i.id !== it.id); store.save(); store.audit(user.id, 'delete', 'pmItems', b); return ok(res, { ok: true }); }
  }
  if (a === 'blockers') {
    const F = ['what', 'holder', 'ownerId', 'expected', 'lastContact', 'status', 'comment', 'since'];
    if (!b && method === 'POST') { const p = findP(body.pid); if (!p) return err(res, 400, 'Нет проекта'); if (!PM.isManager(user, p) && user.role !== 'lead') return err(res, 403, 'Нет прав');
      const x = Object.assign(pick(body, F), { id: store.id(), pid: p.id, status: body.status || 'open', since: body.since || t, createdAt: new Date().toISOString(), createdBy: user.id }); db.pmBlockers.push(x); store.save(); store.audit(user.id, 'create', 'pmBlockers', x.id); return ok(res, x); }
    const x = b && db.pmBlockers.find(z => z.id === b); if (!x) return err(res, 404, 'Блокер не найден'); const p = findP(x.pid);
    if (!PM.isManager(user, p) && x.createdBy !== user.id) return err(res, 403, 'Менять может ГИП/ПМ проекта или автор');
    if (method === 'PUT') { Object.assign(x, pick(body, F), x.status !== 'closed' && body.status === 'closed' ? { closedAt: t } : {}); store.save(); store.audit(user.id, 'update', 'pmBlockers', x.id); return ok(res, x); }
    if (method === 'DELETE') { db.pmBlockers = db.pmBlockers.filter(z => z.id !== x.id); store.save(); store.audit(user.id, 'delete', 'pmBlockers', x.id); return ok(res, { ok: true }); }
  }
  return err(res, 404, 'Нет такого действия');
}

// ---------- static ----------
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || !path.extname(p)) p = '/index.html';
  if (p === '/statement.js') { res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' }); return res.end(fs.readFileSync(path.join(__dirname, 'lib', 'statement.js'))); }
  if (p === '/help.js') { res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' }); return res.end(fs.readFileSync(path.join(__dirname, 'lib', 'help.js'))); }
  if (p === '/xlsx.js') { res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' }); return res.end(fs.readFileSync(path.join(__dirname, 'lib', 'xlsx.js'))); }
  if (p === '/pm.js') { res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' }); return res.end(fs.readFileSync(path.join(__dirname, 'lib', 'pm.js'))); }
  if (p === '/domain.js') { res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' }); return res.end(fs.readFileSync(path.join(__dirname, 'lib', 'domain.js'))); }
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

// ---------- один сервер на папку данных: второй запуск (на другом ПК или повторно) затёр бы изменения первого ----------
const LOCK = path.join(store.DATA_DIR, 'server.lock');
function takeLock() {
  try {
    const l = JSON.parse(fs.readFileSync(LOCK, 'utf8')); const fresh = Date.now() - fs.statSync(LOCK).mtimeMs < 90e3;
    const sameHost = l.host === os.hostname(); let alive = false; if (sameHost) { try { process.kill(l.pid, 0); alive = true; } catch { } }
    if (fresh && (!sameHost || alive) && !process.env.FORCE_START) {
      console.error(`\n  MOST Финансы уже запущен с этой базой: компьютер ${l.host}, порт ${l.port}, с ${String(l.startedAt || '').replace('T', ' ').slice(0, 16)}.`);
      console.error(`  Откройте http://${l.host}:${l.port} или остановите тот сервер. Если он точно выключен — подождите 2 минуты и запустите снова.\n`);
      process.exit(1);
    }
  } catch { }
  const startedAt = new Date().toISOString();
  const write = () => { try { fs.writeFileSync(LOCK, JSON.stringify({ host: os.hostname(), pid: process.pid, port: PORT, startedAt })); } catch { } };
  write(); setInterval(write, 30e3).unref();
  process.on('exit', () => { try { const l = JSON.parse(fs.readFileSync(LOCK, 'utf8')); if (l.pid === process.pid && l.host === os.hostname()) fs.unlinkSync(LOCK); } catch { } });
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(s, () => process.exit(0));
}
takeLock();

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  MOST Финансы запущен.');
  console.log(`  На этом компьютере:  http://localhost:${PORT}`);
  for (const ip of lanIPs()) console.log(`  Для команды в сети:  http://${ip}:${PORT}`);
  console.log(`  База данных:         ${store.DB_FILE}`);
  console.log(`  Бэкапы:              ${store.BACKUP_DIR}\n`);
  console.log('  Не закрывайте это окно, пока приложением пользуются.\n');
});
