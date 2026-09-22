'use strict';
// JSON-хранилище: один файл data/db.json, атомарная запись, автобэкапы.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP_BACKUPS = 60;

const COLLECTIONS = require('./domain').COLLECTIONS;

function emptyDb() {
  const db = { settings: JSON.parse(JSON.stringify(require('./domain').DEFAULT_SETTINGS)), sessions: {} };
  for (const c of COLLECTIONS) db[c] = [];
  return db;
}

let db = null;

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function load() {
  ensureDirs();
  if (!fs.existsSync(DB_FILE)) { db = emptyDb(); persist(); return db; }
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  db = raw.trim() ? JSON.parse(raw) : emptyDb();
  // добить недостающие коллекции (миграция на лету)
  for (const c of COLLECTIONS) if (!Array.isArray(db[c])) db[c] = [];
  if (!db.settings) db.settings = emptyDb().settings;
  // миграция старой модели (income/expenses/taxes → ops)
  if (!db.ops.length && ((db.income || []).length || (db.expenses || []).length)) {
    const acc = c => ((db.settings.defaultAccounts || {})[c]) || 'nal';
    for (const x of db.income || []) db.ops.push({ id: x.id, date: x.date, account: acc(x.company), debit: 0, credit: Number(x.amount) || 0, counterparty: x.client || '', purpose: x.purpose || '', project: x.project || '', category: 'Рабочий проект', comment: '', source: 'migrated' });
    for (const x of [...(db.expenses || []), ...(db.taxes || [])]) db.ops.push({ id: x.id, date: x.date, account: acc(x.company), debit: Number(x.amount) || 0, credit: 0, counterparty: x.recipient || x.kind || '', purpose: x.purpose || x.note || '', project: x.project || '', category: x.category || (x.kind ? 'Налоги' : ''), comment: '', source: 'migrated' });
    delete db.income; delete db.expenses; delete db.taxes;
  }
  if (!db.sessions) db.sessions = {};
  return db;
}

function persist() {
  ensureDirs();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE); // атомарно: либо старый файл, либо новый
}

// один автобэкап в сутки — при первой записи дня
function autoBackup() {
  const today = new Date().toISOString().slice(0, 10);
  const has = fs.existsSync(BACKUP_DIR) && fs.readdirSync(BACKUP_DIR).some(f => f.startsWith('db-' + today));
  if (!has) backup('auto');
}

function backup(tag = 'manual') {
  ensureDirs();
  if (!fs.existsSync(DB_FILE)) persist();
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const name = `db-${stamp}-${tag}.json`;
  fs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, name));
  // хранить последние KEEP_BACKUPS
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
  a.push({ ts: new Date().toISOString(), userId, action, collection, docId, extra: extra || null });
  if (a.length > 5000) a.splice(0, a.length - 5000);
}

module.exports = { load, save, persist, backup, listBackups, get, id, col, insert, update, remove, find, audit, COLLECTIONS, DATA_DIR, DB_FILE, BACKUP_DIR };
