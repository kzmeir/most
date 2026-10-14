'use strict';
// Модуль «Telegram» (tg): бот бюро — уведомления, ежедневный отчёт исполнителя, итог недели. /api/tg/*.
// Без npm: Telegram Bot API через встроенный fetch, приём — long polling (getUpdates) из процесса ERP (входящих вебхуков нет).
// Очередь и журнал отправленного — коллекция tgOutbox (ключ дубля), отметки расписания — tgState: после перезапуска дублей нет.
// Токен бота — в tgConfig; наружу (API, журнал действий) — только «…последние 4 символа». Ключу ИИ (viaToken) раздел бота закрыт.
// Пункты и журнал проекта меняются ТОЛЬКО через modules/pm (pm.handle с правами самого человека) — права pm не обходятся.
const fs = require('fs');
const path = require('path');
const TG = require('./domain');

const COLS = ['tgConfig', 'tgLinks', 'tgCodes', 'tgOutbox', 'tgState'];
const LEADS = ['owner', 'partner'];
const INBOX_ROLES = ['owner', 'partner', 'secretary'];
const OUTBOX_KEEP_DAYS = 30, OUTBOX_EXPIRE_H = 72, MAX_TRIES = 8, SEND_GAP_MS = 40; // ≤ 25 сообщений/сек

// ---- окружение: store, модули, fetch, часы — подменяются в тестах (setEnv) ----
const ENV = {
  store: null, fetch: null, now: () => Date.now(), modules: null, sleep: ms => new Promise(r => { const t = setTimeout(r, ms); if (t.unref) t.unref(); }),
  apiBase: (process.env.TG_API_BASE || 'https://api.telegram.org').replace(/\/+$/, ''),
  // в режиме разработки (DEV_USER) бот работает только с заглушкой Bot API (TG_API_BASE) — настоящий Telegram с тестовой базы не трогаем
  allowed: !process.env.DEV_USER || !!process.env.TG_API_BASE,
  isOn: id => !!process.env.DEV_USER || (((store().get().settings || {}).enabledModules) || []).includes(id),
  log: (...a) => console.log('[tg]', ...a),
};
const RUN = { on: false, timer: null, polling: false, flushing: false, lastSend: 0, pausedUntil: 0, lastPollOk: '', lastError: '', fails: {}, inboxAt: 0, ticking: false };
function setEnv(o) { Object.assign(ENV, o || {}); }
function store() { if (!ENV.store) ENV.store = require('../../lib/store'); return ENV.store; }
const getDb = () => store().get();
const nowIso = () => new Date(ENV.now()).toISOString();
const today = () => TG.almaty(ENV.now()).date;
function modules() {
  if (ENV.modules) return ENV.modules;
  const dir = path.join(__dirname, '..'); const out = {};
  for (const n of fs.readdirSync(dir)) { const f = path.join(dir, n, 'server.js'); if (/^[a-z][a-z0-9]*$/.test(n) && fs.existsSync(f)) { try { out[n] = n === 'tg' ? module.exports : require(f); } catch (e) { /* модуль с ошибкой — пропускаем */ } } }
  return (ENV.modules = out);
}
const modOn = id => !!modules()[id] && ENV.isOn(id);
const PMD = () => (modules().pm && modules().pm.domain) || null;

// ---- данные модуля ----
const col = name => { const db = getDb(); if (!Array.isArray(db[name])) db[name] = []; return db[name]; };
function one(name) { const c = col(name); let d = c.find(x => x.id === 'main'); if (!d) { d = { id: 'main' }; c.push(d); } return d; }
const cfg = () => one('tgConfig');
const state = () => { const s = one('tgState'); if (!s.ran) s.ran = {}; return s; };
const settings = () => TG.settingsOf(cfg());
const save = () => { try { store().save(); } catch (e) { ENV.log('save:', e.message); } };
const audit = (uid, action, docId, extra) => { try { store().audit(uid || '', action, 'tgConfig', docId, extra); } catch (e) { /* журнал не критичен */ } };
const users = () => getDb().users || [];
// в режиме разработки (DEV_USER) вход — «dev-<роль>», такого пользователя нет в базе: подставляем, чтобы привязку можно было проверить в браузере
const devUser = id => (process.env.DEV_USER && /^dev-[a-z]+$/.test(String(id)) ? { id, login: 'dev', name: `Разработчик (${String(id).slice(4)})`, role: String(id).slice(4) } : null);
const userById = id => users().find(u => u.id === id && u.active !== false) || devUser(id);
const nameOf = id => { const u = users().find(x => x.id === id) || devUser(id); return u ? (u.name || u.login || '') : ''; };
const linkOf = uid => col('tgLinks').find(l => l.userId === uid) || null;
const linkByChat = chatId => col('tgLinks').find(l => String(l.chatId) === String(chatId)) || null;
// пользователь для pm — та же форма, что даёт ядро (auth.currentUser)
const asUser = u => ({ id: u.id, login: u.login, name: u.name, role: u.role, section: u.section || '', seeBudget: !!u.seeBudget, employeeId: u.employeeId || '', token: '' });
const active = () => ENV.allowed && ENV.isOn('tg') && !!cfg().token;

// ---- проекты и пункты (только чтение; владелец — pm) ----
const ACTIVE_ST = s => !['Готово', 'Отменён'].includes(s || 'В работе');
const shown = p => { const D = PMD(); return D && D.shownTrack ? D.shownTrack(p.track) : p.track !== 'an'; };
const liveProjects = () => (getDb().pmProjects || []).filter(p => ACTIVE_ST(p.status) && shown(p));
const trackPath = p => (p && p.track === 'rp' ? 'rp' : 'ep');
const projUrl = p => `${settings().erpUrl}/#/${trackPath(p)}/p?id=${encodeURIComponent(p.id)}`;
const myUrl = u => `${settings().erpUrl}/#/${u && u.role === 'gip' ? 'rp' : 'ep'}/my`;
const openItem = it => !it.done && !it.na;
function itemsOf(uid) { const ps = new Map(liveProjects().map(p => [p.id, p])); return (getDb().pmItems || []).filter(it => it.assigneeId === uid && openItem(it) && ps.has(it.pid)).map(it => ({ item: it, project: ps.get(it.pid) })); }

// ---- кому можно: тип включён у модуля, человек подключён, не выключил у себя, роль подходит ----
function wants(uid, type) {
  if (!cfg().token || !settings().types[type]) return false;
  const u = userById(uid); const l = linkOf(uid); if (!u || !l || l.blocked) return false;
  return TG.roleFits(type, u.role) && !(l.off || []).includes(type);
}
// в очередь: ключ дубля = ключ события + человек; повтор (в том числе после перезапуска) не ставится
function enqueue(uid, type, key, text, keyboard) {
  if (!uid || !wants(uid, type)) return false;
  const k = `${key}|${uid}`; const ob = col('tgOutbox'); if (ob.some(m => m.key === k)) return false;
  ob.push(Object.assign({ id: store().id(), key: k, userId: uid, type, text, createdAt: nowIso(), status: 'queued', tries: 0 }, keyboard ? { keyboard } : {}));
  return true;
}

// ---- Telegram Bot API ----
const clean = s => { const t = cfg().token; let m = String(s || ''); if (t) m = m.split(t).join('…'); return m.slice(0, 300); };
async function call(method, params, tokenOverride) {
  const token = tokenOverride || cfg().token; if (!token) { const e = new Error('Токен бота не задан'); e.code = 'notoken'; throw e; }
  const f = ENV.fetch || globalThis.fetch; const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), ((params && params.timeout) || 0) * 1000 + 15000); if (tm.unref) tm.unref();
  try {
    const r = await f(`${ENV.apiBase}/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params || {}), signal: ctrl.signal });
    const j = await r.json().catch(() => ({ ok: false, error_code: r.status, description: 'Ответ не JSON' }));
    if (!j || !j.ok) { const e = new Error(clean((j && j.description) || `HTTP ${r.status}`)); e.code = (j && j.error_code) || r.status; e.retryAfter = j && j.parameters && j.parameters.retry_after; throw e; }
    return j.result;
  } catch (e) { if (e.code) throw e; const x = new Error(clean(e.name === 'AbortError' ? 'Нет ответа от Telegram' : (e.message || 'Ошибка сети'))); x.code = 'net'; throw x; }
  finally { clearTimeout(tm); }
}
async function pace() { const w = RUN.lastSend + SEND_GAP_MS - Date.now(); if (w > 0) await new Promise(r => setTimeout(r, w)); RUN.lastSend = Date.now(); }
const markup = kb => (kb && kb.length ? { reply_markup: { inline_keyboard: kb } } : {});
async function sendTo(chatId, text, keyboard) { await pace(); return call('sendMessage', Object.assign({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }, markup(keyboard))); }
// ответ на действие самого человека (команда, кнопка) — сразу, без очереди и тихих часов; ошибки не роняют ERP
async function reply(chatId, text, keyboard) { try { return await sendTo(chatId, text, keyboard); } catch (e) { RUN.lastError = e.message; ENV.log('reply:', e.message); return null; } }
async function answerCb(id, text) { try { await call('answerCallbackQuery', { callback_query_id: id, text: String(text || '').slice(0, 190) }); } catch (e) { /* устарела — не страшно */ } }

// отправка очереди: не в тихие часы, при 429 — пауза retry_after, сеть — повтор позже
async function flushOutbox(ms) {
  ms = ms == null ? ENV.now() : ms;
  if (RUN.flushing || !active() || TG.isQuiet(TG.almaty(ms).hour) || Date.now() < RUN.pausedUntil) return 0;
  RUN.flushing = true; let sent = 0;
  try {
    const q = col('tgOutbox').filter(m => m.status === 'queued').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(0, 200);
    for (const m of q) {
      if (ms - Date.parse(m.createdAt) > OUTBOX_EXPIRE_H * 3600e3) { m.status = 'expired'; continue; }
      const l = linkOf(m.userId); if (!l || l.blocked || !userById(m.userId)) { m.status = 'dropped'; continue; }
      try { const r = await sendTo(l.chatId, m.text, m.keyboard); Object.assign(m, { status: 'sent', sentAt: nowIso(), msgId: r && r.message_id }); sent++; save(); }
      catch (e) {
        m.tries = (m.tries || 0) + 1; m.error = e.message; RUN.lastError = e.message;
        if (e.code === 429) { RUN.pausedUntil = Date.now() + (Number(e.retryAfter) || 5) * 1000; break; }
        if (e.code === 403) { m.status = 'failed'; l.blocked = true; l.blockedAt = nowIso(); continue; } // человек остановил бота в Telegram
        if (e.code === 400 || m.tries >= MAX_TRIES) { m.status = 'failed'; continue; }
        break; // сеть / 5xx — следующая попытка на следующем такте
      }
    }
    save();
  } finally { RUN.flushing = false; }
  return sent;
}

// ---- вызов pm с правами человека (как если бы он нажал кнопку в ERP) ----
function emitAll(ctx, name, data) { const mods = modules(); for (const id of Object.keys(mods)) { const h = mods[id].on && mods[id].on[name]; if (h && ENV.isOn(id)) { try { h(Object.assign({}, ctx, { module: id }), data); } catch (e) { ENV.log(`${id} ${name}:`, e.message); } } } }
async function pmCall(u, method, parts, body) {
  const pm = modules().pm; if (!pm || !modOn('pm')) return { s: 503, b: { error: 'Модуль «Проекты» выключен' } };
  let res = null; const D = (() => { try { return require('../../lib/domain'); } catch { return {}; } })();
  const ctx = { site: 'erp', parts: ['pm', ...parts], method, body: body || {}, qs: {}, user: asUser(u), db: getDb(), store: store(), D, today, num: v => Number(v) || 0,
    pick: (o, keys) => Object.fromEntries(keys.filter(k => k in (o || {})).map(k => [k, o[k]])), userName: nameOf, modules: modules(),
    ok: b => (res = { s: 200, b }), err: (s, m) => (res = { s, b: { error: m } }), send: (s, b) => (res = { s, b }) };
  ctx.emit = (n, d) => emitAll(ctx, n, d);
  try { await pm.handle(ctx); } catch (e) { return { s: 500, b: { error: e.message } }; }
  return res || { s: 500, b: { error: 'Нет ответа' } };
}

// ---- уведомления по пунктам ----
const itemText = (icon, head, it, p, extra) => [`${icon ? icon + ' ' : ''}<b>${TG.esc(head)}</b>`, TG.esc(TG.cut(it.title, 200)), p ? `Проект: ${TG.esc(p.name)}` : '', ...(extra || []).filter(Boolean), p ? TG.link(projUrl(p)) : ''].filter(Boolean).join('\n');
const findItem = (d, db) => (d && d.item && d.item.id ? (db.pmItems || []).find(i => i.id === d.item.id) || d.item : d && d.itemId ? (db.pmItems || []).find(i => i.id === d.itemId) : null);
const findProj = (d, it, db) => (d && d.project && d.project.id ? d.project : (db.pmProjects || []).find(p => p.id === ((d && (d.pid || d.projectId)) || (it && it.pid))) || null);
const actorOf = (ctx, d) => (d && (d.by || d.byUserId || d.userId)) || (ctx && ctx.user && ctx.user.id) || '';
function notifyAssigned(it, p, by) {
  if (!it.assigneeId || it.assigneeId === by || !openItem(it)) return false;
  return enqueue(it.assigneeId, 'assigned', `asg:${it.id}:${it.assigneeId}:${today()}`, itemText(TG.typeIcon('assigned'), 'Вам назначен пункт', it, p, [it.due ? `Срок: ${TG.fdate(it.due)}` : '', by && nameOf(by) ? `Назначил: ${TG.esc(nameOf(by))}` : '']));
}
function notifyReturned(it, p, by, comment) {
  if (!it.assigneeId || it.assigneeId === by) return false;
  return enqueue(it.assigneeId, 'reviewed', `ret:${it.id}:${Number(it.returns) || 0}`, itemText(TG.typeIcon('reviewed'), 'Пункт вернули на доработку', it, p, [comment ? `Замечание: ${TG.esc(TG.cut(comment, 500))}` : '', by && nameOf(by) ? `Проверил: ${TG.esc(nameOf(by))}` : '']));
}
function notifyAccepted(it, p, by) {
  if (!it.assigneeId || it.assigneeId === by || (it.doneBy && it.doneBy === it.assigneeId)) return false;
  return enqueue(it.assigneeId, 'reviewed', `acc:${it.id}:${it.doneAt || today()}`, itemText('', 'Пункт принят', it, p, [by && nameOf(by) ? `Принял: ${TG.esc(nameOf(by))}` : '']));
}
const managersOf = (p, except) => { const ids = [p && p.gipId, p && p.pmId].filter(Boolean); const out = [...new Set(ids)].filter(id => id !== except && userById(id)); return out.length ? out : users().filter(u => u.active !== false && LEADS.includes(u.role) && u.id !== except).map(u => u.id); };

// события pm. Имена: pm.item.done есть; pm.item.reviewed, pm.shift.requested, pm.shift.decided, pm.remind, pm.item.assigned добавляет поток pm —
// пока их нет, подписка просто не срабатывает (назначения и возвраты ловит сверка пунктов раз в минуту). Данные разбираются терпимо к форме.
const guard = fn => (ctx, d) => { try { if (!active()) return; const db = getDb(); const it = findItem(d, db); const p = findProj(d, it, db); fn(ctx, d || {}, it, p, db); save(); } catch (e) { ENV.log('событие:', e.message); } };
const ON = {
  'pm.item.done': guard((ctx, d, it, p) => { if (it) notifyAccepted(it, p, it.doneBy || actorOf(ctx, d)); }),
  'pm.item.assigned': guard((ctx, d, it, p) => { if (it) notifyAssigned(Object.assign({}, it, d.assigneeId ? { assigneeId: d.assigneeId } : {}), p, actorOf(ctx, d)); }),
  'pm.item.reviewed': guard((ctx, d, it, p) => {
    if (!it) return; const by = actorOf(ctx, d); const v = String(d.result || d.decision || d.verdict || d.status || '').toLowerCase();
    const accepted = d.accepted === true || d.ok === true || d.approved === true || /^(accept|ok|done|approved|приня)/.test(v) || (!v && d.accepted === undefined && !!it.done);
    if (accepted) notifyAccepted(it, p, by); else notifyReturned(it, p, by, d.comment || d.note || d.remark || d.text || '');
  }),
  'pm.shift.requested': guard((ctx, d, it, p) => {
    if (!it) return; const sh = d.shift || d.request || d; const by = sh.by || sh.requestedBy || actorOf(ctx, d); const to = sh.to || sh.due || sh.newDue || '';
    const ids = [].concat(d.to || d.managerIds || d.managerId || []).filter(Boolean); const rec = ids.length ? ids : managersOf(p, by);
    const txt = itemText(TG.typeIcon('shift'), 'Запрошен перенос срока', it, p, [`Срок: ${TG.fdate(sh.from || it.due) || '—'} → ${TG.fdate(to) || '—'}`, sh.reason || sh.comment ? `Причина: ${TG.esc(TG.cut(sh.reason || sh.comment, 400))}` : '', by ? `Просит: ${TG.esc(nameOf(by))}` : '']);
    for (const uid of rec) enqueue(uid, 'shift', `shq:${sh.id || it.id + ':' + to}`, txt);
  }),
  'pm.shift.decided': guard((ctx, d, it, p) => {
    if (!it) return; const sh = d.shift || d.request || d; const author = sh.by || sh.requestedBy || d.requestedBy || d.authorId || '';
    const v = String(d.decision || sh.status || sh.decision || '').toLowerCase(); const yes = d.approved === true || sh.approved === true || /^(approv|accept|yes|ok|соглас|одобр)/.test(v);
    const to = sh.to || sh.due || sh.newDue || '';
    enqueue(author, 'shift', `shd:${sh.id || it.id + ':' + to}:${yes ? 1 : 0}`, itemText(TG.typeIcon('shift'), yes ? 'Перенос срока согласован' : 'Перенос срока отклонён', it, p, [yes && to ? `Новый срок: ${TG.fdate(to)}` : '', sh.comment || d.comment ? `Комментарий: ${TG.esc(TG.cut(sh.comment || d.comment, 400))}` : '', `Решил: ${TG.esc(nameOf(actorOf(ctx, d)))}`]));
  }),
  'pm.remind': guard((ctx, d, it, p) => {
    const by = actorOf(ctx, d); const ids = [].concat(d.to || d.userIds || d.userId || d.assigneeId || (it && it.assigneeId) || []).filter(x => x && x !== by);
    const extra = [d.text || d.note ? TG.esc(TG.cut(d.text || d.note, 500)) : '', by ? `От: ${TG.esc(nameOf(by))}` : ''];
    const txt = it ? itemText(TG.typeIcon('remind'), 'Напоминание', it, p, extra) : [`${TG.typeIcon('remind')} <b>Напоминание</b>`, ...extra.filter(Boolean), p ? TG.link(projUrl(p)) : ''].filter(Boolean).join('\n');
    for (const uid of ids) enqueue(uid, 'remind', `rem:${d.id || (it ? it.id : '') + ':' + nowIso().slice(0, 16)}`, txt);
  }),
  'crm.inbox.new': (ctx, d) => { try { if (active() && d && (d.dialog || d.inbox)) { notifyInbox(d.dialog || d.inbox); save(); } } catch (e) { ENV.log('crm.inbox.new:', e.message); } },
};

// сверка пунктов (раз в минуту): новые назначения, возвраты, приёмка — если pm не прислал событие. Первый проход только запоминает.
function scanItems() {
  const st = state(); const db = getDb(); const live = new Map(liveProjects().map(p => [p.id, p])); const prev = st.seen || null; const next = {};
  for (const it of db.pmItems || []) {
    const cur = [it.assigneeId || '', Number(it.returns) || 0, it.done ? (it.doneAt || '1') : '']; next[it.id] = cur;
    const was = prev && prev[it.id]; const p = live.get(it.pid); if (!prev || !p) continue;
    if (cur[0] && cur[0] !== (was ? was[0] : '')) notifyAssigned(it, p, it.updatedBy || '');
    if (was && cur[1] > was[1]) notifyReturned(it, p, it.updatedBy || '', '');
    if (was && cur[2] && cur[2] !== was[2]) notifyAccepted(it, p, it.doneBy || it.updatedBy || '');
  }
  st.seen = next;
}

// ---- «Коммерция»: новые обращения WhatsApp (если события нет — опрос раз в 5 минут) ----
function notifyInbox(d) {
  const url = `${settings().finUrl}/#/crmdialog?id=${encodeURIComponent(d.id)}`;
  const txt = [`${TG.typeIcon('inbox')} <b>Новое обращение WhatsApp</b>`, TG.esc(TG.cut(d.name || 'Без имени', 80)), TG.link(url, 'Открыть в «Коммерции»')].join('\n');
  let n = 0; for (const u of leadersAll()) if (INBOX_ROLES.includes(u.role)) n += enqueue(u.id, 'inbox', `inbox:${d.id}`, txt) ? 1 : 0; return n;
}
function pollInbox() {
  const st = state(); const db = getDb(); if (!modOn('crm') || !Array.isArray(db.crmInbox)) return 0;
  if (!st.inboxSince) { st.inboxSince = nowIso(); return 0; }
  const fresh = db.crmInbox.filter(d => String(d.createdAt || '') > st.inboxSince); let n = 0;
  for (const d of fresh) n += notifyInbox(d);
  if (fresh.length) st.inboxSince = fresh.map(d => d.createdAt).sort().pop();
  return n;
}

// ---- расписание (Алматы): 9:00 сроки, сводка, блокеры (пн); 18:00 будни — отчёт; пятница 17:00 — итог недели ----
const linked = () => col('tgLinks').map(l => userById(l.userId)).filter(Boolean);
const leadersAll = () => users().filter(u => u.active !== false).concat(col('tgLinks').map(l => devUser(l.userId)).filter(Boolean));
function runMorning(t) {
  const tomorrow = TG.addDays(t.date, 1); let n = 0;
  for (const u of linked()) {
    if (!wants(u.id, 'due')) continue; const mine = itemsOf(u.id).filter(r => r.item.due);
    const over = mine.filter(r => r.item.due < t.date).sort((a, b) => a.item.due.localeCompare(b.item.due)); const tom = mine.filter(r => r.item.due === tomorrow);
    if (over.length || tom.length) n += enqueue(u.id, 'due', `due:${t.date}`, TG.dueDigest(tom, over, myUrl(u))) ? 1 : 0;
  }
  const db = getDb(); const live = liveProjects(); const ids = new Set(live.map(p => p.id)); const D = PMD();
  const age = b => (D && D.blockerAge ? D.blockerAge(b, t.date) : 0);
  const openBl = (db.pmBlockers || []).filter(b => ids.has(b.pid) && b.status !== 'closed');
  for (const u of linked()) {
    if (u.role !== 'owner' || !wants(u.id, 'morning')) continue;
    const its = (db.pmItems || []).filter(it => ids.has(it.pid) && openItem(it)); const over = its.filter(it => it.due && it.due < t.date);
    const shifts = its.filter(it => (it.shift && it.shift.status === 'pending') || (Array.isArray(it.shifts) && it.shifts.some(s => s && s.status === 'pending'))).length;
    const inbox = modOn('crm') && Array.isArray(db.crmInbox) ? db.crmInbox : null; const dayAgo = new Date(ENV.now() - 864e5).toISOString();
    const s = { date: t.date, overdue: over.length, overdueProjects: new Set(over.map(it => it.pid)).size, review: its.filter(it => it.kstatus === 'review').length, shifts, blockers: openBl.length, blockersOld: openBl.filter(b => age(b) > 14).length, inboxNew: inbox ? inbox.filter(d => String(d.createdAt || '') > dayAgo).length : 0, inboxTotal: inbox ? inbox.filter(d => d.status === 'new').length : null };
    const e = settings().erpUrl; n += enqueue(u.id, 'morning', `morning:${t.date}`, TG.morning(s, { ep: `${e}/#/ep`, rp: `${e}/#/rp`, inbox: `${settings().finUrl}/#/crminbox` })) ? 1 : 0;
  }
  if (t.dow === 1) { // блокеры старше 14 дней — раз в неделю, ГИП/ПМ своих проектов (руководителям — все)
    const week = TG.isoWeek(t.date);
    for (const u of linked()) {
      if (!wants(u.id, 'blockers')) continue;
      const mine = openBl.filter(b => age(b) > 14).map(b => ({ b, p: live.find(p => p.id === b.pid) })).filter(x => LEADS.includes(u.role) || x.p.gipId === u.id || x.p.pmId === u.id);
      if (!mine.length) continue;
      const txt = [`${TG.typeIcon('blockers')} <b>Блокеры старше 14 дней — ${mine.length}</b>`, ...mine.slice(0, 15).map(x => `• ${TG.esc(TG.cut(x.b.what || 'Блокер', 100))} — <i>${TG.esc(TG.cut(x.p.name, 50))}</i>, ${age(x.b)} дн. ${TG.link(projUrl(x.p), '→')}`), mine.length > 15 ? `…и ещё ${mine.length - 15}` : ''].filter(Boolean).join('\n');
      n += enqueue(u.id, 'blockers', `blk:${week}`, TG.fit(txt)) ? 1 : 0;
    }
  }
  return n;
}
function isWorkDay(d) { const D = PMD(); if (D && D.isWorkDay) return D.isWorkDay(d); const wd = new Date(d + 'T00:00:00Z').getUTCDay(); return wd !== 0 && wd !== 6; }
function runDaily(t) {
  if (!settings().types.daily || !isWorkDay(t.date)) return 0; let n = 0;
  for (const u of linked()) {
    if (!wants(u.id, 'daily')) continue; const rows = itemsOf(u.id).sort((a, b) => String(a.item.due || '9').localeCompare(String(b.item.due || '9')));
    if (!rows.length) continue; const ask = TG.reportAsk(rows); const l = linkOf(u.id);
    if (enqueue(u.id, 'daily', `daily:${t.date}`, ask.text, ask.keyboard)) { l.report = { date: t.date, pids: [...new Set(rows.slice(0, TG.REPORT_MAX).map(r => r.project.id))] }; n++; }
  }
  return n;
}
function weekRows(from, to) {
  const db = getDb(); const inW = s => { const d = String(s || '').slice(0, 10); return d >= from && d <= to; };
  const logBy = new Set((db.pmLog || []).filter(r => inW(r.createdAt) || inW(r.date)).map(r => r.by));
  const rows = []; const silentAll = new Set();
  for (const p of liveProjects()) {
    const its = (db.pmItems || []).filter(i => i.pid === p.id);
    const done = its.filter(i => i.done && inW(i.doneAt)).length; const overdue = its.filter(i => openItem(i) && i.due && i.due < to).length;
    let shifts = 0, returns = 0; const acted = new Set(logBy);
    for (const i of its) for (const h of i.history || []) { if (!inW(h.at)) continue; acted.add(h.by); if (h.field === 'due' && h.from) shifts++; if ((h.field === 'done' && h.from === true && h.to === false) || (h.field === 'kstatus' && h.from === 'review' && ['doing', 'todo'].includes(h.to))) returns++; }
    for (const i of its) if (i.done && inW(i.doneAt)) acted.add(i.doneBy);
    const silent = [...new Set(its.filter(i => openItem(i) && i.assigneeId && !acted.has(i.assigneeId)).map(i => i.assigneeId))].map(nameOf).filter(Boolean);
    silent.forEach(s => silentAll.add(s));
    if (done || overdue || shifts || returns) rows.push({ name: p.name, url: projUrl(p), done, overdue, shifts, returns, silent });
  }
  rows.sort((a, b) => b.overdue - a.overdue || b.done - a.done);
  return { rows, silentAll: [...silentAll] };
}
function runWeekly(t) {
  const week = TG.isoWeek(t.date); const { rows } = weekRows(TG.weekStart(t.date), t.date); const txt = TG.weekly(week, rows); let n = 0;
  for (const u of linked()) n += enqueue(u.id, 'weekly', `week:${week}`, txt) ? 1 : 0;
  return n;
}
function purge(ms) { const db = getDb(); const lim = new Date(ms - OUTBOX_KEEP_DAYS * 864e5).toISOString(); const n = (db.tgOutbox || []).length; db.tgOutbox = (db.tgOutbox || []).filter(m => m.status === 'queued' || String(m.createdAt) > lim); const c = new Date(ms).toISOString(); db.tgCodes = (db.tgCodes || []).filter(x => x.expiresAt > c); return n - db.tgOutbox.length; }

// один такт планировщика (раз в 30 с): сверка, расписание по Алматы, очередь
async function tick(ms) {
  ms = ms == null ? ENV.now() : ms; if (!active()) return;
  const t = TG.almaty(ms); const st = state(); const ran = st.ran;
  scanItems();
  if (!RUN.inboxAt || ms - RUN.inboxAt >= 5 * 60e3 || ms < RUN.inboxAt) { pollInbox(); RUN.inboxAt = ms; }
  if (t.hour >= 9 && t.hour < 12 && ran.morning !== t.date) { ran.morning = t.date; runMorning(t); }
  if (t.hour >= 18 && t.hour < TG.QUIET_FROM && ran.daily !== t.date) { ran.daily = t.date; runDaily(t); }
  if (t.dow === 5 && t.hour >= 17 && t.hour < TG.QUIET_FROM && ran.weekly !== TG.isoWeek(t.date)) { ran.weekly = TG.isoWeek(t.date); runWeekly(t); }
  if (ran.purge !== t.date) { ran.purge = t.date; purge(ms); }
  save();
  await flushOutbox(ms);
}

// ---- входящие: команды, кнопки, текст отчёта ----
const HELP = 'Бот MOST ERP присылает уведомления по вашим пунктам.\n/settings — какие уведомления получать\n/stop — отключить Telegram\nПодключение — код из ERP (раздел «Telegram»): /start КОД';
function settingsKb(u, l) {
  const S = settings().types; return TG.TYPES.filter(t => S[t[0]] && TG.roleFits(t[0], u.role)).map(t => [{ text: `${(l.off || []).includes(t[0]) ? '○' : '●'} ${t[1]}`, callback_data: `pf:${t[0]}` }]);
}
function linkUser(code, msg) {
  const c = String(code).replace(/\D/g, ''); const chat = msg.chat; const now = nowIso(); const key = String(chat.id);
  const f = RUN.fails[key] || (RUN.fails[key] = { n: 0, at: ENV.now() }); if (ENV.now() - f.at > 3600e3) Object.assign(f, { n: 0, at: ENV.now() });
  if (f.n >= 5) return { error: 'Слишком много неверных кодов. Попробуйте через час.' };
  const db = getDb(); const rec = (db.tgCodes || []).find(x => x.code === c && x.expiresAt > now); const u = rec && userById(rec.userId);
  if (!rec || !u) { f.n++; return { error: 'Код не подошёл или устарел. Получите новый в ERP: раздел «Telegram» → «Подключить».' }; }
  db.tgCodes = db.tgCodes.filter(x => x.userId !== rec.userId);
  db.tgLinks = col('tgLinks').filter(l => l.userId !== u.id && String(l.chatId) !== key); // один человек — один чат
  const from = msg.from || {}; db.tgLinks.push({ id: store().id(), userId: u.id, chatId: chat.id, username: String(from.username || '').slice(0, 64), firstName: String(from.first_name || '').slice(0, 64), linkedAt: now, off: [] });
  save(); try { store().audit(u.id, 'link', 'tgLinks', u.id, { username: from.username || '' }); } catch (e) { /* журнал */ }
  return { user: u };
}
async function onReportText(u, l, text) {
  const pids = ((l.report && l.report.pids) || []).filter(id => (getDb().pmProjects || []).some(p => p.id === id));
  if (!pids.length) return reply(l.chatId, 'Сейчас нет открытого отчёта. ' + HELP);
  if (pids.length === 1) return writeLog(u, l, pids, text);
  l.pending = { text: String(text).slice(0, 4000), at: nowIso() }; save();
  const ps = pids.map(id => getDb().pmProjects.find(p => p.id === id));
  return reply(l.chatId, 'В какой проект записать?', [...ps.map(p => [{ text: TG.cut(p.name, 50), callback_data: `lg:${p.id}` }]), [{ text: 'Во все', callback_data: 'lg:all' }]]);
}
async function writeLog(u, l, pids, text) {
  const ok = [], bad = [];
  for (const pid of pids) { const p = getDb().pmProjects.find(x => x.id === pid); const r = await pmCall(u, 'POST', ['projects', pid, 'log'], { type: 'note', text, date: today() }); (r.s === 200 ? ok : bad).push(`${p ? p.name : pid}${r.s === 200 ? '' : ': ' + ((r.b && r.b.error) || r.s)}`); }
  l.pending = null; save();
  return reply(l.chatId, [ok.length ? `Записано в журнал: ${TG.esc(ok.join(', '))}` : '', bad.length ? `Не записано — ${TG.esc(bad.join('; '))}` : ''].filter(Boolean).join('\n'));
}
async function onCallback(cq) {
  const chat = cq.message && cq.message.chat; if (!chat || chat.type !== 'private') return answerCb(cq.id, '');
  const l = linkByChat(chat.id); const u = l && userById(l.userId); if (!u) return answerCb(cq.id, 'Сначала подключитесь: /start КОД из ERP');
  if (l.blocked) { l.blocked = false; save(); }
  const c = TG.parseCallback(cq.data); if (!c) return answerCb(cq.id, 'Кнопка устарела');
  if (c.kind === 'pf') {
    const off = new Set(l.off || []); off.has(c.type) ? off.delete(c.type) : off.add(c.type); l.off = [...off]; save();
    try { await call('editMessageReplyMarkup', { chat_id: chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: settingsKb(u, l) } }); } catch (e) { /* сообщение старое */ }
    return answerCb(cq.id, `${TG.typeLabel(c.type)}: ${off.has(c.type) ? 'выключено' : 'включено'}`);
  }
  if (c.kind === 'ks') {
    const it = (getDb().pmItems || []).find(i => i.id === c.itemId); if (!it) return answerCb(cq.id, 'Пункт не найден');
    const r = await pmCall(u, 'PUT', ['items', it.id], { kstatus: c.kstatus });
    if (r.s !== 200) return answerCb(cq.id, (r.b && r.b.error) || 'Не получилось');
    await answerCb(cq.id, `${c.label}: ${TG.cut(it.title, 60)}`);
    return reply(chat.id, `${TG.esc(TG.cut(it.title, 120))} — <b>${TG.esc(c.label)}</b>`);
  }
  if (c.kind === 'lg') {
    if (!l.pending || !l.pending.text) return answerCb(cq.id, 'Текст отчёта не найден — напишите его ещё раз');
    const pids = c.pid === 'all' ? ((l.report && l.report.pids) || []) : [c.pid]; await answerCb(cq.id, 'Записываю');
    return writeLog(u, l, pids, l.pending.text);
  }
}
async function processUpdate(up) {
  if (up.callback_query) return onCallback(up.callback_query);
  const msg = up.message; if (!msg || !msg.chat || msg.chat.type !== 'private') return; // группы и каналы — игнор
  const text = String(msg.text || '').trim(); const cmd = TG.parseCommand(text); let l = linkByChat(msg.chat.id); let u = l && userById(l.userId);
  if (l && l.blocked) { l.blocked = false; save(); }
  if ((cmd && cmd.cmd === 'start' && cmd.arg) || (!cmd && !u && /^\d{6}$/.test(text))) {
    const r = linkUser(cmd ? cmd.arg : text, msg); if (r.error) return reply(msg.chat.id, r.error);
    return reply(msg.chat.id, `Готово: Telegram подключён к MOST ERP (${TG.esc(r.user.name || r.user.login)}).\nКакие уведомления получать — /settings. Тихие часы 21:00–8:00. Отключить — /stop.`);
  }
  if (cmd && cmd.cmd === 'start') return reply(msg.chat.id, u ? `Вы уже подключены как ${TG.esc(u.name || u.login)}. /settings — уведомления, /stop — отключить.` : 'Чтобы подключиться, получите код в MOST ERP: раздел «Telegram» → «Подключить», и отправьте сюда: /start КОД');
  if (!u) return reply(msg.chat.id, 'Этот чат не подключён к MOST ERP. Получите код в ERP (раздел «Telegram») и отправьте: /start КОД');
  if (cmd && cmd.cmd === 'stop') { getDb().tgLinks = col('tgLinks').filter(x => x !== l); save(); try { store().audit(u.id, 'unlink', 'tgLinks', u.id, { via: 'bot' }); } catch (e) { /* журнал */ } return reply(msg.chat.id, 'Telegram отключён от MOST ERP. Подключить снова — новый код в ERP.'); }
  if (cmd && cmd.cmd === 'settings') { const kb = settingsKb(u, l); return reply(msg.chat.id, kb.length ? 'Уведомления (● — включено). Нажмите, чтобы переключить:' : 'Для вас пока нет включённых уведомлений.', kb); }
  if (cmd) return reply(msg.chat.id, HELP);
  if (text && l.report && l.report.date >= TG.addDays(today(), -1)) return onReportText(u, l, text);
  return reply(msg.chat.id, HELP);
}

// длинный опрос getUpdates; ошибки сети не роняют ERP — пауза и повтор
async function pollLoop() {
  let backoff = 0; RUN.polling = true;
  while (RUN.on) {
    if (!active()) { await ENV.sleep(15000); continue; }
    const st = state(); const tok = cfg().token;
    try {
      const ups = await call('getUpdates', { offset: st.offset || 0, timeout: 25, allowed_updates: ['message', 'callback_query'] });
      if (cfg().token !== tok) continue; // токен сменили, пока ждали
      RUN.lastPollOk = nowIso(); RUN.lastError = ''; backoff = 0;
      for (const up of ups || []) { st.offset = up.update_id + 1; try { await processUpdate(up); } catch (e) { ENV.log('update:', e.message); } }
      if ((ups || []).length) save();
    } catch (e) {
      RUN.lastError = e.code === 401 ? 'Telegram не принял токен (401) — проверьте токен' : e.code === 409 ? 'Этого бота уже опрашивает другая программа (409)' : e.message;
      await ENV.sleep(e.retryAfter ? e.retryAfter * 1000 : e.code === 401 || e.code === 409 ? 60000 : Math.min(60000, 2000 * 2 ** backoff++));
    }
  }
  RUN.polling = false;
}
function start() {
  if (RUN.on) return; RUN.on = true;
  RUN.timer = setInterval(() => { if (RUN.ticking) return; RUN.ticking = true; tick().catch(e => ENV.log('tick:', e.message)).finally(() => { RUN.ticking = false; }); }, 30e3); if (RUN.timer.unref) RUN.timer.unref();
  pollLoop().catch(e => { ENV.log('poll:', e.message); RUN.polling = false; });
  ENV.log(ENV.allowed ? 'бот запущен (молчит, пока нет токена или модуль выключен)' : 'режим разработки без TG_API_BASE — бот не опрашивает Telegram');
}
function stop() { RUN.on = false; if (RUN.timer) clearInterval(RUN.timer); RUN.timer = null; }

// ---- API ERP ----
const botStatus = () => { const c = cfg(); const ob = col('tgOutbox'); const d = today();
  return { tokenSet: !!c.token, tokenMask: TG.maskToken(c.token), botUsername: c.botUsername || '', botName: c.botName || '', checkedAt: c.checkedAt || '', moduleOn: ENV.isOn('tg'), allowed: ENV.allowed, stub: ENV.apiBase !== 'https://api.telegram.org',
    polling: RUN.polling && active(), lastPollOk: RUN.lastPollOk, lastError: RUN.lastError, pausedUntil: RUN.pausedUntil > Date.now() ? new Date(RUN.pausedUntil).toISOString() : '',
    queued: ob.filter(m => m.status === 'queued').length, failed: ob.filter(m => m.status === 'failed').length, sentToday: ob.filter(m => m.status === 'sent' && TG.almaty(Date.parse(m.sentAt)).date === d).length, quiet: TG.isQuiet(TG.almaty(ENV.now()).hour) }; };
const typesFor = (u, l) => { const S = settings().types; return TG.TYPES.filter(t => TG.roleFits(t[0], u.role)).map(t => ({ key: t[0], label: t[1], enabled: !!S[t[0]], on: !(l && (l.off || []).includes(t[0])) })); };

async function handle(ctx) {
  const { parts, method, body, user, ok, err } = ctx; const [, a, b] = parts; const role = user.role; const lead = LEADS.includes(role) && !user.viaToken;
  // ключ ИИ: раздел бота (токен) закрыт целиком, менять ничего нельзя
  if (user.viaToken && (a === 'bot' || method !== 'GET')) return err(403, 'Ключу ИИ раздел Telegram-бота закрыт — выполните это сами в ERP');
  const u = userById(user.id);
  if (a === 'me') {
    if (!u) return err(403, 'Нет пользователя');
    const l = linkOf(user.id); const c = cfg();
    if (method === 'GET' && !b) { const code = col('tgCodes').find(x => x.userId === user.id && x.expiresAt > nowIso());
      return ok({ linked: l ? { username: l.username || '', firstName: l.firstName || '', linkedAt: l.linkedAt, blocked: !!l.blocked } : null, code: code ? { code: code.code, expiresAt: code.expiresAt, deepLink: c.botUsername ? `https://t.me/${c.botUsername}?start=${code.code}` : '' } : null,
        botReady: !!c.token && ENV.allowed, botUsername: c.botUsername || '', types: typesFor(u, l), quiet: `${TG.QUIET_FROM}:00–${TG.QUIET_TO}:00` }); }
    if (method === 'POST' && b === 'code') {
      if (!c.token) return err(400, 'Бот ещё не подключён — директор вставляет токен на этой странице');
      const db = getDb(); const live = col('tgCodes').filter(x => x.expiresAt > nowIso() && x.userId !== user.id); let code; do code = TG.newCode(); while (live.some(x => x.code === code));
      const rec = { id: store().id(), userId: user.id, code, createdAt: nowIso(), expiresAt: new Date(ENV.now() + TG.CODE_TTL_MIN * 60e3).toISOString() };
      db.tgCodes = live.concat(rec); save(); store().audit(user.id, 'code', 'tgCodes', user.id);
      return ok({ code, expiresAt: rec.expiresAt, deepLink: c.botUsername ? `https://t.me/${c.botUsername}?start=${code}` : '' });
    }
    if (method === 'DELETE' && !b) { if (!l) return ok({ ok: true }); getDb().tgLinks = col('tgLinks').filter(x => x !== l); save(); store().audit(user.id, 'unlink', 'tgLinks', user.id); return ok({ ok: true }); }
    if (method === 'PUT' && b === 'prefs') {
      if (!l) return err(400, 'Telegram не подключён'); const off = new Set(l.off || []);
      if (body.type) { if (!TG.TYPE_KEYS.includes(body.type)) return err(400, 'Нет такого уведомления'); body.on === false || body.on === 'false' ? off.add(body.type) : off.delete(body.type); }
      if (Array.isArray(body.off)) { off.clear(); for (const k of body.off) if (TG.TYPE_KEYS.includes(k)) off.add(k); }
      l.off = [...off]; save(); store().audit(user.id, 'prefs', 'tgLinks', user.id, { off: l.off }); return ok({ types: typesFor(u, l) });
    }
    return err(404, 'Нет такого действия');
  }
  if (a === 'admin') {
    if (!LEADS.includes(role)) return err(403, 'Только владелец и партнёр');
    if (method === 'GET' && !b) { const links = col('tgLinks').map(l => { const x = users().find(q => q.id === l.userId) || {}; return { userId: l.userId, name: x.name || x.login || l.userId, role: x.role || '', username: l.username || '', firstName: l.firstName || '', linkedAt: l.linkedAt, blocked: !!l.blocked, off: l.off || [] }; });
      const st = botStatus(); return ok({ settings: settings(), types: TG.TYPES.map(t => ({ key: t[0], label: t[1], roles: t[3] })), links, people: users().filter(x => x.active !== false).length, status: { tokenSet: st.tokenSet, polling: st.polling, queued: st.queued, failed: st.failed, sentToday: st.sentToday, quiet: st.quiet, lastError: st.lastError, botUsername: st.botUsername } }); }
    if (method === 'PUT' && b === 'settings') {
      if (!lead) return err(403, 'Только владелец и партнёр'); const c = cfg(); const cur = settings();
      const types = Object.assign({}, cur.types); if (body.types && typeof body.types === 'object') for (const k of TG.TYPE_KEYS) if (k in body.types) types[k] = body.types[k] === true || body.types[k] === 'true';
      c.types = types; if ('erpUrl' in body) { const v = TG.cleanUrl(body.erpUrl); if (body.erpUrl && !v) return err(400, 'Адрес ERP: http://… или https://…'); c.erpUrl = v; }
      if ('finUrl' in body) { const v = TG.cleanUrl(body.finUrl); if (body.finUrl && !v) return err(400, 'Адрес «Финансов»: http://… или https://…'); c.finUrl = v; }
      save(); store().audit(user.id, 'update', 'tgConfig', 'settings', { types, erpUrl: c.erpUrl || '', finUrl: c.finUrl || '' }); return ok(settings());
    }
    if (method === 'POST' && b === 'test') {
      if (!lead) return err(403, 'Только владелец и партнёр'); const l = linkOf(user.id); if (!l) return err(400, 'Сначала подключите свой Telegram');
      if (!active()) return err(400, 'Бот не работает: нет токена или модуль выключен');
      try { await sendTo(l.chatId, `Проверка связи MOST ERP: уведомления приходят. ${TG.link(settings().erpUrl)}`); return ok({ ok: true }); } catch (e) { return err(502, 'Telegram: ' + e.message); }
    }
    return err(404, 'Нет такого действия');
  }
  if (a === 'links' && b && method === 'DELETE') {
    if (!lead) return err(403, 'Отключать других могут владелец и партнёр'); const l = linkOf(b); if (!l) return err(404, 'Не подключён');
    getDb().tgLinks = col('tgLinks').filter(x => x !== l); save(); store().audit(user.id, 'unlink', 'tgLinks', b); return ok({ ok: true });
  }
  if (a === 'bot') {
    if (role !== 'owner') return err(403, 'Только владелец');
    if (method === 'GET' && !b) return ok(botStatus());
    if (method === 'PUT' && !b) {
      const tok = String(body.token == null ? '' : body.token).trim(); if (tok && !TG.TOKEN_RE.test(tok)) return err(400, 'Не похоже на токен бота: 123456789:AA… (выдаёт @BotFather)');
      const c = cfg(); Object.assign(c, { token: tok, botUsername: '', botName: '', checkedAt: '', updatedAt: nowIso(), updatedBy: user.id }); const st = state(); st.offset = 0;
      RUN.lastError = ''; RUN.pausedUntil = 0; save(); audit(user.id, tok ? 'set-token' : 'clear-token', 'bot', { token: TG.maskToken(tok) }); return ok(botStatus());
    }
    if (method === 'POST' && b === 'check') {
      if (!cfg().token) return err(400, 'Токен не задан'); if (!ENV.allowed) return err(400, 'Режим разработки без TG_API_BASE — в Telegram не ходим');
      try { const me = await call('getMe', {}); Object.assign(cfg(), { botUsername: me.username || '', botName: me.first_name || '', checkedAt: nowIso() }); RUN.lastError = ''; save(); return ok(botStatus()); }
      catch (e) { RUN.lastError = e.message; return err(502, e.code === 401 ? 'Telegram не принял токен (401)' : 'Telegram: ' + e.message); }
    }
    return err(404, 'Нет такого действия');
  }
  return err(404, 'Нет такого раздела');
}

module.exports = { id: 'tg', api: 'tg', site: 'erp', collections: COLS, handle, on: ON, domain: TG,
  // для тестов и других модулей
  setEnv, start, stop, tick, flushOutbox, processUpdate, scanItems, pollInbox, runMorning, runDaily, runWeekly, weekRows, enqueue, pmCall, botStatus, RUN };

// запуск фонового бота — только внутри сервера ERP (в тестах модуль подключается без него); store.load() ядро делает после подключения модулей
if (require.main && path.resolve(require.main.filename) === path.resolve(__dirname, '..', '..', 'server.js')) { const t = setTimeout(start, 3000); if (t.unref) t.unref(); }
