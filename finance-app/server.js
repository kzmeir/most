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

const PORT = Number(process.env.PORT) || 3000;          // сайт «Финансы» (только офис)
const ERP_PORT = Number(process.env.ERP_PORT) || PORT + 1; // сайт «MOST ERP» (модули; его можно открыть наружу через туннель)
const PUBLIC = path.join(__dirname, 'public');
const SEED_DIR = path.join(__dirname, 'seed');
const FILES_DIR = path.join(store.DATA_DIR, 'files'); // файлы счетов (PDF/картинки)
const FILE_TYPES = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const FILE_COLS = ['invoices', 'docs', 'contracts', 'subcontracts', 'proposals']; // где можно прикрепить файл
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
const MAX_OPS = 3000;

// ---------- модули ERP: modules/<id>/server.js (API + коллекции), domain.js и ui.js (браузер). Контракт — docs/ARCHITECTURE.md ----------
const MODULES_DIR = path.join(__dirname, 'modules');
const MODULES = (fs.existsSync(MODULES_DIR) ? fs.readdirSync(MODULES_DIR) : []).sort()
  .filter(n => /^[a-z][a-z0-9]*$/.test(n) && fs.existsSync(path.join(MODULES_DIR, n, 'server.js')))
  .map(n => Object.assign(require(path.join(MODULES_DIR, n, 'server.js')), { dir: path.join(MODULES_DIR, n), id: n }));
const MODULE_BY_ID = Object.fromEntries(MODULES.map(m => [m.id, m]));
const MODULE_COLS = new Set(MODULES.flatMap(m => m.collections || []));
store.register([...MODULE_COLS]);
// события между модулями: ctx.emit('pm.project.created', data) → у всех модулей on['pm.project.created'](ctx, data)
function emit(ctx, name, data) { for (const m of MODULES) { const h = m.on && m.on[name]; if (h) { try { h(Object.assign({}, ctx, { module: m.id }), data); } catch (e) { console.error(`[${m.id}] ${name}:`, e.message); } } } }
const pickKeys = (o, keys) => Object.fromEntries(keys.filter(k => k in (o || {})).map(k => [k, o[k]]));
// скрипты модулей для браузера: /m/<id>/domain.js, /m/<id>/ui.js (подключаются в index.html перед app.js)
// какие модули включены на этом сервере: «Настройки → Модули» (settings.enabledModules); в режиме разработки — все
const MODULE_TITLES = { pm: 'Проекты', kb: 'Знания и обучение', hr: 'Персонал и табель', crm: 'Коммерция', sys: 'Сервис' };
const moduleOn = m => !!process.env.DEV_USER || ((store.get().settings || {}).enabledModules || []).includes(m.id);
// сайты: 'fin' — только финансы, 'erp' — только модули, 'all' — всё вместе (режим разработки на одном порту)
// на каком сайте модуль: m.site ('erp' по умолчанию, 'fin' — «Коммерция» у финансов, ['erp','fin'] — на обоих, например ИИ-панель)
const moduleActive = (m, site) => (site === 'all' || [].concat(m.site || 'erp').includes(site)) && moduleOn(m); // m.site: 'erp' | 'fin' | ['erp','fin'] // 'all' — один порт в режиме разработки
const ERP_API = ['status', 'login', 'logout', 'me', 'people']; // общее ядро, доступное на сайте ERP
const moduleScripts = site => MODULES.filter(m => moduleActive(m, site)).flatMap(m => ['domain.js', 'ui.js'].filter(f => fs.existsSync(path.join(m.dir, f))).map(f => `<script src="/m/${m.id}/${f}"></script>`)).join('\n');

store.load();

// режим разработки: DEV_USER=<роль> — вход без пароля, только с этого компьютера (127.0.0.1). На рабочем сервере не задавать.
const DEV_ROLE = process.env.DEV_USER || '';
function devUser(req) {
  if (!DEV_ROLE || process.env.TRUST_PROXY || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']) return null; // через туннель — никогда
  if (!/^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '')) return null;
  const c = auth.parseCookies(req); const role = D.ROLES.includes(c.devrole) ? c.devrole : (D.ROLES.includes(DEV_ROLE) ? DEV_ROLE : 'owner');
  return { id: 'dev-' + role, login: 'dev', name: `Разработчик (${D.ROLE_LABEL[role]})`, role, section: c.devsection || process.env.DEV_SECTION || '', seeBudget: true, token: '' };
}

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
async function api(req, res, url, user, site) {
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return p; } });
  const method = req.method;
  const mutating = ['POST', 'PUT', 'DELETE'].includes(method);
  if (mutating && req.headers['x-requested-with'] !== 'fetch') return err(res, 403, 'CSRF: нет заголовка');
  const body = mutating ? await readBody(req).catch(e => ({ __err: e.message })) : {};
  if (body.__err) return err(res, 400, body.__err);
  const db = store.get();
  const [seg, id2, seg3] = parts;
  const qs = Object.fromEntries(url.searchParams.entries());
  // сайт ERP физически не отдаёт финансовые разделы, сайт «Финансы» — модули
  if (site === 'erp' && !ERP_API.includes(seg) && !(seg === 'settings' && method === 'GET') && !MODULES.some(m => m.api === seg && moduleActive(m, site))) return err(res, 404, 'Этот раздел — на сайте «Финансы»');

  // --- public ---
  if (seg === 'status' && method === 'GET') return ok(res, { publicUrl: publicUrl(), needsSetup: db.users.length === 0 && !DEV_ROLE, hasData: store.COLLECTIONS.some(c => c !== 'users' && c !== 'audit' && db[c].length > 0), seed: seedStatus(), version: '2.0', site, modules: MODULES.map(m => ({ id: m.id, title: MODULE_TITLES[m.id] || m.id, on: moduleOn(m) })) });
  if (seg === 'setup' && method === 'POST') {
    if (db.users.length || site === 'erp') return err(res, 403, 'Уже настроено');
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
  const mod = MODULES.find(m => m.api === seg && moduleActive(m, site));
  if (mod) {
    const ctx = { req, res, parts, method, body, user, db, qs, store, auth, D, today, num, pick: pickKeys, userName, modules: MODULE_BY_ID, ok: b => ok(res, b), err: (s, m) => err(res, s, m), send: (s, b, h) => send(res, s, b, h) };
    ctx.emit = (name, data) => emit(ctx, name, data);
    return mod.handle(ctx);
  }

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
  // ожидаемые поступления по графикам платежей модуля «Коммерция» — для прогноза денег (сайт «Финансы»)
  if (seg === 'forecast' && id2 === 'expected' && method === 'GET') { if (!D.isAdmin(role)) return err(res, 403, 'Нет доступа'); const m = MODULE_BY_ID.crm; if (!m || !m.expectedPayments || !moduleOn(m)) return ok(res, []); try { return ok(res, m.expectedPayments({ db, D, today, num, store, user }, qs.from || today(), qs.to || '')); } catch (e) { return ok(res, []); } }
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
      const u = store.insert('users', { login: String(body.login).trim().toLowerCase(), name: body.name || body.login, role: body.role, section: String(body.section || ''), seeBudget: body.seeBudget === true || body.seeBudget === 'true', employeeId: String(body.employeeId || ''), salt, passHash: hash, active: true, createdAt: new Date().toISOString() });
      store.audit(user.id, 'create', 'users', u.id); return ok(res, auth.publicUser(u));
    }
    if (method === 'PUT' && id2) {
      const u = store.find('users', id2); if (!u) return err(res, 404, 'Нет пользователя');
      const patch = {};
      if (body.name) patch.name = body.name;
      if ('section' in body) patch.section = String(body.section || '');
      if ('seeBudget' in body) patch.seeBudget = body.seeBudget === true || body.seeBudget === 'true';
      if ('employeeId' in body) patch.employeeId = String(body.employeeId || '');
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
  if (!store.COLLECTIONS.includes(seg) || seg === 'users' || MODULE_COLS.has(seg)) return err(res, 404, 'Нет такого раздела'); // коллекции модулей — только через их API
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

// ---------- static ----------
function serveStatic(req, res, url, site) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || !path.extname(p)) p = '/index.html';
  if (p === '/index.html') { const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8').replace('<script src="/app.js"></script>', `<script>window.MOST_SITE = '${site}';</script>\n` + moduleScripts(site) + '\n<script src="/app.js"></script>'); const page = site === 'erp' ? html.replace('<title>MOST Финансы</title>', '<title>MOST ERP</title>') : html; res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' }); return res.end(page); }
  const mm = p.match(/^\/m\/([a-z][a-z0-9]*)\/(domain|ui)\.js$/); if (mm && MODULE_BY_ID[mm[1]] && moduleActive(MODULE_BY_ID[mm[1]], site)) { const file = path.join(MODULE_BY_ID[mm[1]].dir, mm[2] + '.js'); if (fs.existsSync(file)) { res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' }); return res.end(fs.readFileSync(file)); } return err(res, 404, 'not found'); }
  if (p === '/statement.js') { res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' }); return res.end(fs.readFileSync(path.join(__dirname, 'lib', 'statement.js'))); }
  if (p === '/help.js') { res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' }); return res.end(fs.readFileSync(path.join(__dirname, 'lib', 'help.js'))); }
  if (p === '/xlsx.js') { res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' }); return res.end(fs.readFileSync(path.join(__dirname, 'lib', 'xlsx.js'))); }
  if (p === '/domain.js') { res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' }); return res.end(fs.readFileSync(path.join(__dirname, 'lib', 'domain.js'))); }
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) return err(res, 403, 'forbidden');
  fs.readFile(file, (e, data) => {
    if (e) return err(res, 404, 'not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const handler = site => async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api')) return await api(req, res, url, devUser(req) || auth.currentUser(req), site);
    if (req.method === 'GET') return serveStatic(req, res, url, site);
    return err(res, 405, 'method');
  } catch (e) {
    console.error(e);
    return err(res, 500, 'Ошибка сервера: ' + e.message);
  }
};

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

if (DEV_ROLE) console.log(`\n  РЕЖИМ РАЗРАБОТКИ: вход без пароля как «${DEV_ROLE}», сервер слушает только 127.0.0.1. Не использовать с рабочей базой.`);
const HOST = DEV_ROLE ? '127.0.0.1' : '0.0.0.0';
// в режиме разработки — один порт со всеми разделами; на рабочем сервере — два сайта
const SPLIT = !DEV_ROLE || !!process.env.DEV_SPLIT; // DEV_SPLIT=1 — два сайта и в режиме разработки
if (SPLIT) http.createServer(handler('erp')).listen(ERP_PORT, HOST);
http.createServer(handler(SPLIT ? 'fin' : 'all')).listen(PORT, HOST, () => {
  console.log('\n  MOST запущен.');
  console.log(`  Финансы (офис):      http://localhost:${PORT}   ` + lanIPs().map(ip => `http://${ip}:${PORT}`).join('  '));
  if (SPLIT) console.log(`  MOST ERP (проекты):  http://localhost:${ERP_PORT}   ` + lanIPs().map(ip => `http://${ip}:${ERP_PORT}`).join('  '));
  console.log(`  База данных:         ${store.DB_FILE}`);
  console.log(`  Бэкапы:              ${store.BACKUP_DIR}\n`);
  console.log('  Не закрывайте это окно, пока приложением пользуются.\n');
});
