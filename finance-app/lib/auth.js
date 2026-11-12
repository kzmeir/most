'use strict';
// Пароли (scrypt), сессии (httpOnly cookie), лимит попыток входа.
const crypto = require('crypto');
const store = require('./store');

const SESSION_DAYS = 30;
const COOKIE = 'mfsid';

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const h = crypto.scryptSync(String(password), salt, 64);
  const b = Buffer.from(hash, 'hex');
  return h.length === b.length && crypto.timingSafeEqual(h, b);
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('='); if (i < 0) return;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const db = store.get();
  // чистим протухшие
  const now = Date.now();
  for (const [t, s] of Object.entries(db.sessions)) if (s.exp < now) delete db.sessions[t];
  db.sessions[token] = { userId, exp: now + SESSION_DAYS * 864e5 };
  store.persist();
  return token;
}
function destroySession(token) {
  const db = store.get();
  if (token && db.sessions[token]) { delete db.sessions[token]; store.persist(); }
}
function sessionCookie(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
function clearCookie() { return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`; }

// текущий пользователь по cookie (или null)
function currentUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const db = store.get();
  const s = db.sessions[token];
  if (!s || s.exp < Date.now()) return null;
  const u = db.users.find(x => x.id === s.userId && x.active !== false);
  if (!u) return null;
  return { id: u.id, login: u.login, name: u.name, role: u.role, section: u.section || '', seeBudget: !!u.seeBudget, employeeId: u.employeeId || '', token };
}

// ключ ИИ (Authorization: Bearer most_…): в базе только sha256 ключа; действует от имени владельца, который его выдал
const tokenHash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
function newApiToken() { const token = 'most_' + crypto.randomBytes(32).toString('hex'); return { token, hash: tokenHash(token) }; }
function tokenUser(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(most_[a-f0-9]{64})$/); if (!m) return null;
  const db = store.get(); const h = tokenHash(m[1]); const t = (db.apiTokens || []).find(x => x.hash === h); if (!t) return null;
  const u = db.users.find(x => x.id === t.userId && x.active !== false); if (!u) return null;
  if (!t.lastUsedAt || Date.now() - new Date(t.lastUsedAt).getTime() > 60e3) { t.lastUsedAt = new Date().toISOString(); try { store.save(); } catch { } }
  return { id: u.id, login: u.login, name: u.name, role: u.role, section: u.section || '', seeBudget: !!u.seeBudget, employeeId: u.employeeId || '', token: null, viaToken: t.id, tokenName: t.name || '' };
}

// лимит попыток входа: 10 за 15 минут с одного IP
const attempts = new Map();
function loginAllowed(ip) {
  const now = Date.now();
  const a = (attempts.get(ip) || []).filter(t => now - t < 15 * 60e3);
  attempts.set(ip, a);
  return a.length < 10;
}
function noteFailedLogin(ip) { (attempts.get(ip) || (attempts.set(ip, []), attempts.get(ip))).push(Date.now()); }

function publicUser(u) { return { id: u.id, login: u.login, name: u.name, role: u.role, section: u.section || '', seeBudget: !!u.seeBudget, employeeId: u.employeeId || '', active: u.active !== false, createdAt: u.createdAt }; }

module.exports = { tokenUser, newApiToken, hashPassword, verifyPassword, parseCookies, createSession, destroySession, sessionCookie, clearCookie, currentUser, loginAllowed, noteFailedLogin, publicUser, COOKIE };
