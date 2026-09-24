'use strict';
// Хранилище: SQLite (встроенный node:sqlite, Node 22.5+/24) — data/db.sqlite.
// Вся база держится в памяти (db.<коллекция> — массивы, как раньше); save() пишет в SQLite только изменённые
// документы одной транзакцией. Старый data/db.json при первом запуске переносится в SQLite автоматически.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// node:sqlite помечен как экспериментальный — прячем только это предупреждение
const emitWarning = process.emitWarning;
process.emitWarning = (w, ...rest) => { if (/SQLite/i.test(String(w && w.message || w))) return; return emitWarning.call(process, w, ...rest); };
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.sqlite');
const JSON_FILE = path.join(DATA_DIR, 'db.json'); // старая база, только для переноса
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP_BACKUPS = 60;

const COLLECTIONS = require('./domain').COLLECTIONS;
// коллекции модулей (modules/*/server.js → collections) регистрируются до store.load()
function register(cols) { for (const c of cols || []) if (!COLLECTIONS.includes(c)) COLLECTIONS.push(c); }

function emptyDb() {
  const db = { settings: JSON.parse(JSON.stringify(require('./domain').DEFAULT_SETTINGS)), sessions: {} };
  for (const c of COLLECTIONS) db[c] = [];
  return db;
}

let db = null, sql = null;
const snap = new Map();  // «коллекция\0ключ» → JSON документа в SQLite (для поиска изменений)
const ordOf = new Map(); // «коллекция\0ключ» → порядковый номер (порядок массивов сохраняется)
let maxOrd = 0;
const kvSnap = {};

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function open() {
  sql = new DatabaseSync(DB_FILE);
  // на сетевой папке (\\MostServer\...) WAL не работает — обычный журнал; на локальном диске — WAL
  const net = /^\\\\/.test(path.resolve(DATA_DIR)) || !!process.env.SQLITE_NETWORK;
  sql.exec(`PRAGMA journal_mode=${net ? 'DELETE' : 'WAL'}; PRAGMA synchronous=${net ? 'FULL' : 'NORMAL'}; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, ord INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (col, id));
    CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);`);
}

// старая модель (income/expenses/taxes → ops) и недостающие коллекции
function normalize(d) {
  for (const c of COLLECTIONS) if (!Array.isArray(d[c])) d[c] = [];
  if (!d.settings) d.settings = emptyDb().settings;
  if (!d.sessions || typeof d.sessions !== 'object') d.sessions = {};
  if (!d.ops.length && ((d.income || []).length || (d.expenses || []).length)) {
    const acc = c => ((d.settings.defaultAccounts || {})[c]) || 'nal';
    for (const x of d.income || []) d.ops.push({ id: x.id, date: x.date, account: acc(x.company), debit: 0, credit: Number(x.amount) || 0, counterparty: x.client || '', purpose: x.purpose || '', project: x.project || '', category: 'Рабочий проект', comment: '', source: 'migrated' });
    for (const x of [...(d.expenses || []), ...(d.taxes || [])]) d.ops.push({ id: x.id, date: x.date, account: acc(x.company), debit: Number(x.amount) || 0, credit: 0, counterparty: x.recipient || x.kind || '', purpose: x.purpose || x.note || '', project: x.project || '', category: x.category || (x.kind ? 'Налоги' : ''), comment: '', source: 'migrated' });
  }
  delete d.income; delete d.expenses; delete d.taxes;
  return d;
}

function load() {
  ensureDirs(); open();
  const n = sql.prepare('SELECT COUNT(*) AS n FROM docs').get().n;
  if (!n && fs.existsSync(JSON_FILE)) {
    // перенос из db.json: копия старого файла остаётся рядом
    const raw = fs.readFileSync(JSON_FILE, 'utf8');
    db = normalize(raw.trim() ? JSON.parse(raw) : emptyDb());
    persist();
    fs.renameSync(JSON_FILE, JSON_FILE + '.migrated-' + new Date().toISOString().slice(0, 10));
    console.log(`  База перенесена из db.json в db.sqlite (${COLLECTIONS.reduce((s, c) => s + db[c].length, 0)} записей).`);
    return db;
  }
  db = {};
  for (const row of sql.prepare('SELECT col, id, ord, data FROM docs ORDER BY col, ord').all()) {
    (db[row.col] || (db[row.col] = [])).push(JSON.parse(row.data));
    const key = row.col + '\0' + row.id; snap.set(key, row.data); ordOf.set(key, row.ord); if (row.ord > maxOrd) maxOrd = row.ord;
  }
  for (const row of sql.prepare('SELECT k, v FROM kv').all()) { db[row.k] = JSON.parse(row.v); kvSnap[row.k] = row.v; }
  return normalize(db);
}

// записать изменения: новые/изменённые документы, удалённые, настройки и сессии — одной транзакцией
function persist() {
  const d = get(); const seenKeys = new Set(); const up = [], del = [], kv = [];
  for (const c of COLLECTIONS) {
    const used = new Set();
    for (const doc of d[c] || []) {
      if (!doc.id) doc.id = id(); // у записей журнала раньше не было id
      let k = String(doc.id); if (used.has(k)) { let i = 2; while (used.has(k + '#' + i)) i++; k = k + '#' + i; } used.add(k);
      const key = c + '\0' + k; seenKeys.add(key); const s = JSON.stringify(doc);
      if (snap.get(key) !== s) up.push([c, k, key, s]);
    }
  }
  for (const key of snap.keys()) if (!seenKeys.has(key)) del.push(key);
  for (const k of ['settings', 'sessions']) { const s = JSON.stringify(d[k] || (k === 'sessions' ? {} : null)); if (kvSnap[k] !== s) kv.push([k, s]); }
  if (!up.length && !del.length && !kv.length) return;
  const put = sql.prepare('INSERT INTO docs (col, id, ord, data) VALUES (?, ?, ?, ?) ON CONFLICT (col, id) DO UPDATE SET data = excluded.data');
  const rm = sql.prepare('DELETE FROM docs WHERE col = ? AND id = ?');
  const putKv = sql.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v');
  sql.exec('BEGIN');
  try {
    for (const [c, k, key, s] of up) { let o = ordOf.get(key); if (o === undefined) { o = ++maxOrd; ordOf.set(key, o); } put.run(c, k, o, s); }
    for (const key of del) { const [c, k] = key.split('\0'); rm.run(c, k); }
    for (const [k, s] of kv) putKv.run(k, s);
    sql.exec('COMMIT');
  } catch (e) { sql.exec('ROLLBACK'); throw e; }
  for (const [, , key, s] of up) snap.set(key, s);
  for (const key of del) { snap.delete(key); ordOf.delete(key); }
  for (const [k, s] of kv) kvSnap[k] = s;
}

// один автобэкап в сутки — при первой записи дня
function autoBackup() {
  const today = new Date().toISOString().slice(0, 10);
  const has = fs.existsSync(BACKUP_DIR) && fs.readdirSync(BACKUP_DIR).some(f => f.startsWith('db-' + today));
  if (!has) backup('auto');
}

// полная согласованная копия базы (VACUUM INTO) — файл db-<время>-<метка>.sqlite
function backup(tag = 'manual') {
  ensureDirs(); if (!sql) load();
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const name = `db-${stamp}-${String(tag).replace(/[^\w-]/g, '')}.sqlite`;
  sql.exec(`VACUUM INTO '${path.join(BACKUP_DIR, name).replace(/'/g, "''")}'`);
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('db-')).sort();
  while (files.length > KEEP_BACKUPS) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
  return name;
}

function listBackups() {
  ensureDirs();
  return fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('db-')).sort().reverse()
    .map(f => ({ name: f, size: fs.statSync(path.join(BACKUP_DIR, f)).size }));
}

function save() { autoBackup(); persist(); }

function get() { return db || load(); }
function id() { return crypto.randomUUID(); }

function col(name) {
  if (!COLLECTIONS.includes(name)) throw new Error('unknown collection ' + name);
  return get()[name];
}
function insert(name, doc) {
  const c = col(name);
  if (!doc.id) doc.id = id();
  c.push(doc); save(); return doc;
}
function update(name, docId, patch) {
  const c = col(name);
  const i = c.findIndex(d => d.id === docId);
  if (i < 0) return null;
  c[i] = Object.assign({}, c[i], patch, { id: docId });
  save(); return c[i];
}
function remove(name, docId) {
  const c = col(name);
  const i = c.findIndex(d => d.id === docId);
  if (i < 0) return false;
  c.splice(i, 1); save(); return true;
}
function find(name, docId) { return col(name).find(d => d.id === docId) || null; }

function audit(userId, action, collection, docId, extra) {
  const a = get().audit;
  a.push({ id: id(), ts: new Date().toISOString(), userId, action, collection, docId, extra: extra || null });
  if (a.length > 5000) a.splice(0, a.length - 5000);
  persist();
}

module.exports = { register, load, save, persist, backup, listBackups, get, id, col, insert, update, remove, find, audit, COLLECTIONS, DATA_DIR, DB_FILE, BACKUP_DIR };
