'use strict';
// Модуль «ИИ-панель»: /api/ai/*. Поток F. Контракт модулей — docs/ARCHITECTURE.md, задание — modules/ai/README.md.
// Claude Code CLI (`claude -p`, аккаунт директора) или Claude API (ключ из переменной окружения) — настройка backend.
// ИИ ничего не меняет сам: ответ — черновик; «Применить» вызывает API модуля pm от имени пользователя, «Скачать .docx» — документ Word.
// Контекст собирает сервер; персональные данные сотрудников (ИИН, оклады, ЗП по фамилиям) не отправляются; суммы — только в финансовой панели.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const A = require('./domain');
const DOCX = require('./docx');

const DEFAULTS = { backend: 'cli', cliPath: '', model: '', apiModel: 'claude-opus-5-5', timeoutSec: 300, maxQueue: 5, mockDelayMs: 200 };
const CONFIG_FIELDS = Object.keys(DEFAULTS);
const LOG_KEEP = 2000, DRAFTS_KEEP = 60; // на пользователя

// ---- настройки: settings.ai (ядро) ← aiConfig (модуль, правит владелец) ----
function cfgOf(db) {
  const c = Object.assign({}, DEFAULTS, (db.settings && db.settings.ai) || {}, (db.aiConfig || []).find(x => x.id === 'config') || {});
  if (!A.BACKENDS.includes(c.backend)) c.backend = 'cli';
  c.timeoutSec = Math.min(1800, Math.max(1, Number(c.timeoutSec) || DEFAULTS.timeoutSec)); c.maxQueue = Math.min(50, Math.max(1, Number(c.maxQueue) || DEFAULTS.maxQueue));
  c.mockDelayMs = Math.max(0, Number(c.mockDelayMs) || 0); delete c.id; return c;
}
// Claude Code CLI: путь из настроек или поиск. Десктоп-приложение Claude кладёт CLI в %APPDATA%\Claude\claude-code\<версия>\claude.exe
// (НЕ %LOCALAPPDATA%\AnthropicClaude\claude.exe — это само приложение); нативный установщик — ~/.local/bin/claude(.exe).
const verKey = v => String(v).split('.').map(n => String(Number(n) || 0).padStart(6, '0')).join('.');
function findCli(cfg) {
  if (cfg.cliPath) return fs.existsSync(cfg.cliPath) ? cfg.cliPath : '';
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude'; const cands = [];
  const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const cc = path.join(appdata, 'Claude', 'claude-code');
  try { for (const v of fs.readdirSync(cc).filter(v => /^\d+(\.\d+)*$/.test(v)).sort((a, b) => verKey(b).localeCompare(verKey(a)))) cands.push(path.join(cc, v, exe)); } catch (e) { /* нет папки */ }
  cands.push(path.join(os.homedir(), '.local', 'bin', exe), path.join(os.homedir(), '.claude', 'local', exe));
  if (process.platform === 'darwin') cands.push(path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code'));
  return cands.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || '';
}
let VERSION_CACHE = { path: '', version: '' };
function cliVersion(p) {
  if (!p) return ''; if (VERSION_CACHE.path === p) return VERSION_CACHE.version;
  let v = ''; try { v = String(execFileSync(p, ['--version'], { timeout: 15000, windowsHide: true, encoding: 'utf8' })).trim().split('\n')[0]; } catch (e) { v = ''; }
  VERSION_CACHE = { path: p, version: v }; return v;
}
// сайт запроса: ядро может передать ctx.site; иначе — по порту (сайт ERP — ERP_PORT); в DEV без DEV_SPLIT — всё на одном порту
function siteOf(ctx) {
  if (ctx.site) return ctx.site;
  if (process.env.DEV_USER && !process.env.DEV_SPLIT) return 'all';
  const PORT = Number(process.env.PORT) || 3000, ERP = Number(process.env.ERP_PORT) || PORT + 1;
  const lp = ctx.req && ctx.req.socket && ctx.req.socket.localPort; return lp === ERP ? 'erp' : 'fin';
}
const scopesFor = site => site === 'erp' ? ['pm', 'pmall'] : site === 'fin' ? ['fin'] : ['pm', 'pmall', 'fin'];

// ---- очередь: одна задача за раз, задачи в памяти (после перезапуска сервера — заново) ----
const JOBS = new Map(); const QUEUE = []; let RUNNING = null;
function pruneJobs() { const old = [...JOBS.values()].filter(j => ['done', 'error'].includes(j.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); while (JOBS.size > 200 && old.length) JOBS.delete(old.shift().id); }
function jobOut(j) { return { id: j.id, scope: j.scope, cmd: j.cmd, label: j.label, pid: j.pid, param: j.param, status: j.status, createdAt: j.createdAt, startedAt: j.startedAt || '', endedAt: j.endedAt || '', error: j.error || '', draftId: j.draftId || '', position: j.status === 'queued' ? QUEUE.indexOf(j) + 1 : 0, backend: j.backend }; }
function pump(env) {
  if (RUNNING || !QUEUE.length) return;
  const j = QUEUE.shift(); RUNNING = j; j.status = 'running'; j.startedAt = new Date().toISOString(); const t0 = Date.now();
  const cfg = cfgOf(env.db);
  runBackend(cfg, j).then(text => {
    const ans = A.parseAnswer(text);
    const d = Object.assign({ id: env.store.id(), jobId: j.id, userId: j.userId, scope: j.scope, cmd: j.cmd, label: j.label, pid: j.pid, param: j.param, question: j.text.slice(0, 2000), createdAt: new Date().toISOString(), applied: null, backend: cfg.backend }, ans);
    if (!d.title) d.title = j.label + (j.pname ? ' — ' + j.pname : '');
    env.db.aiDrafts.push(d); pruneDrafts(env.db, j.userId);
    j.status = 'done'; j.draftId = d.id; return { ok: true, chars: String(text || '').length };
  }).catch(e => { j.status = 'error'; j.error = e.message || String(e); return { ok: false }; }).then(r => {
    j.endedAt = new Date().toISOString(); const ms = Date.now() - t0;
    env.db.aiLog.push({ id: env.store.id(), at: j.startedAt, userId: j.userId, scope: j.scope, cmd: j.cmd, pid: j.pid || '', param: j.param || '', backend: cfg.backend, ms, status: j.status, error: j.error || '', promptChars: j.prompt.length, answerChars: r.chars || 0 });
    if (env.db.aiLog.length > LOG_KEEP) env.db.aiLog.splice(0, env.db.aiLog.length - LOG_KEEP);
    j.prompt = ''; // промпт с данными в памяти не держим
    try { env.store.save(); env.store.audit(j.userId, 'ai', 'aiLog', j.id, { cmd: j.cmd, status: j.status, ms }); } catch (e) { console.error('[ai] save:', e.message); }
    RUNNING = null; pruneJobs(); setImmediate(() => pump(env));
  });
}
function pruneDrafts(db, userId) { const mine = db.aiDrafts.filter(d => d.userId === userId); if (mine.length > DRAFTS_KEEP) { const drop = new Set(mine.slice(0, mine.length - DRAFTS_KEEP).map(d => d.id)); for (let i = db.aiDrafts.length - 1; i >= 0; i--) if (drop.has(db.aiDrafts[i].id)) db.aiDrafts.splice(i, 1); } }

// ---- бэкенды ----
const SYSTEM = `Ты — помощник руководителей архитектурного бюро MOST (Алматы, Казахстан): проекты ЖК и общественных зданий, стадии концепция / эскизный проект (ЭП) / рабочий проект (РП) / авторский надзор (АН).
Пиши по-русски, деловым языком, коротко и по существу, с опорой только на переданные данные; если данных не хватает — так и напиши («уточнить у …»), ничего не выдумывай (особенно цифры, даты и суммы).
Нормы — Республики Казахстан (СН РК, СП РК), ссылайся только если уверен.
Ответ — ТОЛЬКО один JSON-объект без пояснений вокруг:
{"title": "заголовок документа/ответа", "summary": "1–3 предложения главного",
 "blocks": [ {"h": "заголовок раздела"}, {"h2": "подзаголовок"}, {"p": "абзац; **жирный** можно"}, {"ul": ["пункт", "…"]}, {"ol": ["шаг", "…"]}, {"table": {"head": ["…"], "rows": [["…"]]}} ]
 ,"plan": {...} и "project": {...} — только если этого требует задача}
Даты — ГГГГ-ММ-ДД. Суммы — в тенге с разделителями тысяч.`;
function runBackend(cfg, j) {
  if (cfg.backend === 'mock') return runMock(cfg, j);
  if (cfg.backend === 'api') return runApi(cfg, j);
  return runCli(cfg, j);
}
function runCli(cfg, j) {
  return new Promise((resolve, reject) => {
    const cli = findCli(cfg); if (!cli) return reject(new Error('Claude Code CLI не найден на сервере. Директору: установить Claude Code и указать путь в настройках ИИ-панели (cliPath).'));
    const args = ['-p', '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--system-prompt', SYSTEM]; if (cfg.model) args.push('--model', cfg.model);
    const cwd = path.join(os.tmpdir(), 'most-ai'); try { fs.mkdirSync(cwd, { recursive: true }); } catch (e) { /* есть */ }
    let child; try { child = spawn(cli, args, { cwd, windowsHide: true, env: Object.assign({}, process.env, { CLAUDE_CODE_ENTRYPOINT: 'most-erp' }) }); } catch (e) { return reject(new Error('Не удалось запустить Claude Code: ' + e.message)); }
    let out = '', errOut = '', done = false;
    const finish = (e, v) => { if (done) return; done = true; clearTimeout(timer); e ? reject(e) : resolve(v); };
    const timer = setTimeout(() => { try { child.kill(); } catch (e) { /* уже */ } finish(new Error(`Превышено время ожидания (${cfg.timeoutSec} с). Упростите запрос или увеличьте таймаут в настройках.`)); }, cfg.timeoutSec * 1000);
    child.stdout.on('data', d => { out += d; if (out.length > 5e6) { child.kill(); finish(new Error('Слишком длинный ответ')); } });
    child.stderr.on('data', d => { errOut += d; });
    child.on('error', e => finish(new Error(e.code === 'ENOENT' ? 'Claude Code CLI не найден: ' + cli : 'Ошибка запуска Claude Code: ' + e.message)));
    child.on('close', code => {
      let r = null; try { r = JSON.parse(out); } catch (e) { r = null; }
      const text = r ? String(r.result || '') : ''; const all = `${text} ${errOut} ${out.slice(0, 500)}`;
      if (/not logged in|please run \/login|invalid api key|authenticat|oauth|401/i.test(all) && (!r || r.is_error || code)) return finish(new Error('Claude Code на сервере не выполнил вход. Директору: запустить claude в терминале сервера под своей учётной записью и войти (/login).'));
      if (/usage limit|rate limit|429|overloaded/i.test(all) && (!r || r.is_error)) return finish(new Error('Лимит использования Claude исчерпан или сервис перегружен — попробуйте позже.'));
      if (!r) return finish(new Error(`Claude Code завершился с кодом ${code}: ${(errOut || out).trim().slice(0, 300) || 'нет ответа'}`));
      if (r.is_error) return finish(new Error('Claude Code: ' + (text || r.subtype || 'ошибка').slice(0, 300)));
      finish(null, text);
    });
    child.stdin.on('error', () => { /* процесс закрылся раньше */ });
    child.stdin.end(j.prompt);
  });
}
async function runApi(cfg, j) {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new Error('Не задан ключ Claude API: переменная окружения ANTHROPIC_API_KEY на сервере (ключ не хранится в базе).');
  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), cfg.timeoutSec * 1000);
  const model = cfg.apiModel || DEFAULTS.apiModel; const headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  const body = { model, max_tokens: 16000, system: SYSTEM, messages: [{ role: 'user', content: j.prompt }] };
  if (/^claude-(opus-5|fable-5-1)$/.test(model)) { headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; body.fallbacks = 'default'; } // при отказе классификатора — запасная модель на стороне API
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal });
    const data = await r.json().catch(() => null);
    if (!r.ok) { const m = (data && data.error && data.error.message) || r.statusText; throw new Error(r.status === 401 ? 'Claude API: неверный ключ' : r.status === 429 ? 'Claude API: лимит запросов, попробуйте позже' : `Claude API ${r.status}: ${m}`); }
    if (data.stop_reason === 'refusal') throw new Error('Claude отказался отвечать на этот запрос');
    return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  } catch (e) { if (e.name === 'AbortError') throw new Error(`Превышено время ожидания (${cfg.timeoutSec} с)`); throw e; } finally { clearTimeout(timer); }
}
// заглушка для тестов: детерминированный ответ по команде, задержка mockDelayMs (таймаут работает как у CLI)
function runMock(cfg, j) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Превышено время ожидания (${cfg.timeoutSec} с). Упростите запрос или увеличьте таймаут в настройках.`)), cfg.timeoutSec * 1000);
    setTimeout(() => {
      clearTimeout(timer); const m = j.mock || {};
      if (/__nojson__/.test(j.text)) return resolve('# Ответ без JSON\n\n- пункт один\n- пункт два\n\n| A | B |\n|---|---|\n| 1 | 2 |');
      const out = { title: `${j.label} (mock)`, summary: `Тестовый ответ: ${m.stats || ''}`.trim(), blocks: [{ h: 'Данные' }, { p: `Команда ${j.cmd}, промпт ${j.prompt.length} символов.` }, { table: { head: ['Показатель', 'Значение'], rows: Object.entries(m.facts || {}).map(([k, v]) => [k, String(v)]) } }] };
      if (j.cmd === 'plan') out.plan = { items: [{ stage: 1, title: 'Проверить комплект ИРД (mock)', role: 'ГИП', weeks: 1, crit: 'ИРД на руках' }], dues: m.firstOpen ? [{ id: m.firstOpen, due: m.soon, why: 'mock: подтянуть под срок' }] : [] };
      if (j.cmd === 'newplan') out.project = { name: 'Тест ИИ проект (mock)', track: 'ep', client: 'ТОО Mock', start: m.today, due: m.soon };
      if (j.cmd === 'znp') out.blocks = [{ table: { head: ['№', 'Перечень основных данных и требований', 'Содержание'], rows: A.ZNP_ROWS.map((r, i) => [String(i + 1), r, 'уточнить у заказчика']) } }];
      resolve(JSON.stringify(out));
    }, /__slow__/.test(j.text) ? cfg.timeoutSec * 1000 + 2000 : cfg.mockDelayMs);
  });
}

// ---- контекст ----
const cut = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; };
const json = o => JSON.stringify(o, null, 1);
function pmCtx(ctx, p) {
  const { db } = ctx; const PM = ctx.modules.pm && ctx.modules.pm.domain; const t = ctx.today(); const un = id => (ctx.userName ? ctx.userName(id) : '') || '';
  const items = db.pmItems.filter(i => i.pid === p.id).sort((a, b) => a.stage - b.stage || a.order - b.order);
  const stages = []; for (const i of items) { let s = stages[stages.length - 1]; if (!s || s.stage !== i.stage) stages.push(s = { stage: i.stage, name: i.stageName, items: [] });
    s.items.push({ id: i.id, title: i.title, role: i.role, section: i.section || '', weeks: i.weeks, due: i.due || '', done: !!i.done, doneAt: i.doneAt || '', na: !!i.na, contractor: i.contractor || '', crit: cut(i.crit, 160), note: cut(i.note, 160) }); }
  const proj = { id: p.id, name: p.name, no: p.no || '', stage: PM ? PM.TRACKS[p.track] : p.track, track: p.track, client: p.client || '', address: p.address || '', area: p.area || '', status: p.status, risk: p.risk, start: p.start || '', due: p.due || '', forecast: p.forecast || '', gip: un(p.gipId), pm: un(p.pmId), comment: cut(p.comment, 600), contractNo: p.contractNo || '', contractDate: p.contractDate || '', contractTerm: p.contractTerm || '', contractTermUnit: p.contractTermUnit || '', dueNote: p.dueNote || '' };
  const blockers = db.pmBlockers.filter(x => x.pid === p.id && x.status !== 'closed').map(x => ({ what: x.what, holder: x.holder, since: x.since || '', expected: x.expected || '', lastContact: x.lastContact || '', status: x.status, comment: cut(x.comment, 200) }));
  const sum = PM ? PM.summary(p, db.pmItems, db.pmBlockers, t) : {};
  return { today: t, project: proj, progress: { pct: sum.pct, stage: sum.stageName, overdue: sum.overdue, blockers: blockers.length }, roles: PM ? PM.ITEM_ROLES : [], stages, blockers };
}
function pmAllCtx(ctx, section) {
  const { db } = ctx; const PM = ctx.modules.pm && ctx.modules.pm.domain; const t = ctx.today(); const un = id => (ctx.userName ? ctx.userName(id) : '') || '';
  const active = db.pmProjects.filter(p => !PM || PM.ACTIVE(p.status)); const byId = new Map(active.map(p => [p.id, p]));
  const projects = active.map(p => { const s = PM ? PM.summary(p, db.pmItems, db.pmBlockers, t) : {}; return { name: p.name, stage: PM ? PM.TRACK_SHORT[p.track] || p.track : p.track, client: p.client || '', status: p.status, risk: p.risk, due: p.due || '', forecast: p.forecast || '', current: s.stageName, pct: s.pct, overdue: s.overdue, gip: un(p.gipId), pm: un(p.pmId) }; });
  const itemSection = i => (PM ? PM.itemSection(i) : i.section) || '';
  const overdue = db.pmItems.filter(i => byId.has(i.pid) && !i.done && !i.na && i.due && i.due < t && (!section || itemSection(i) === section || i.role === section))
    .sort((a, b) => a.due.localeCompare(b.due)).slice(0, 400).map(i => ({ project: byId.get(i.pid).name, stage: i.stageName, title: i.title, role: i.role, section: itemSection(i), due: i.due, days: Math.round((new Date(t) - new Date(i.due)) / 864e5), contractor: i.contractor || '' }));
  const blockers = db.pmBlockers.filter(x => byId.has(x.pid) && x.status !== 'closed').map(x => ({ project: byId.get(x.pid).name, what: x.what, holder: x.holder, since: x.since || '', status: x.status }));
  return { today: t, section: section || '', projects, overdue, blockers };
}
// регламенты из «Знаний» (опубликованные статьи), подходящие к стадии/задаче
function kbCtx(ctx, q) {
  const db = ctx.db; if (!db.kbArticles) return [];
  const K = ctx.modules.kb && ctx.modules.kb.domain; const list = db.kbArticles.filter(a => !a.draft);
  let hits = []; try { hits = K && K.search ? K.search(list, q).slice(0, 3).map(h => h.a) : []; } catch (e) { hits = []; }
  if (!hits.length) { const words = String(q).toLowerCase().split(/\s+/).filter(w => w.length > 3); hits = list.map(a => ({ a, n: words.filter(w => `${a.title} ${(a.tags || []).join(' ')}`.toLowerCase().includes(w)).length })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 3).map(x => x.a); }
  return hits.map(a => ({ title: a.title, section: a.section || '', text: cut(a.text, 5000) }));
}
const PAYROLL_RE = /зп|зарплат|заработн|оклад|аванс сотр|премия|отпускн|пенсион|соц\.? ?отчисл|ипн|опв|осмс/i;
function finCtx(ctx, cmd, text) {
  const { db, D } = ctx; const t = ctx.today(); const num = v => Number(v) || 0; const out = { today: t };
  const cats = db.categories || []; const kindOf = c => D.catKind ? D.catKind(cats, c) : '';
  const isPayroll = o => PAYROLL_RE.test(`${o.category || ''} ${kindOf(o.category)}`) || (db.employees || []).some(e => e.name && o.counterparty && String(o.counterparty).includes(String(e.name).split(' ')[0]) && String(e.name).split(' ')[0].length > 3);
  try { const r = D.receivables(db, t); out.receivables = { totals: r.totals, byClient: r.byClient.slice(0, 40).map(x => ({ client: x.client, sum: x.sum, n: x.n, maxAge: x.maxAge })), acts: r.acts.slice(0, 150).map(d => ({ client: d.client, number: d.number, amount: d.amount, date: d.from, age: d.age, company: d.company || '' })) }; } catch (e) { out.receivables = { error: e.message }; }
  if (cmd === 'forecast' || cmd === 'ask') {
    let start = 0; try { start = D.accountBalances(db.ops, db.cash, db.accounts, t).reduce((s, a) => s + (a.balance == null ? 0 : a.balance), 0); } catch (e) { start = 0; }
    try { const f = D.cashForecast(db, { today: t, startBalance: start, weeks: 8 }); out.forecast = { startBalance: Math.round(start), min: f.min, end: f.end, inflow: f.inflow, outflow: f.outflow, weeks: f.weeks.map(w => ({ from: w.from, to: w.to, inflow: w.inflow, outflow: w.outflow, balance: w.balance, items: w.items.slice(0, 25).map(i => ({ date: i.date, amount: i.amount, kind: i.kind === 'payroll' ? 'ЗП (итого)' : i.kind, label: i.kind === 'payroll' ? 'ЗП на руки (итого по компании)' : cut(i.label, 90) })) })) }; } catch (e) { out.forecast = { error: e.message }; }
    const crm = ctx.modules.crm; if (crm && crm.expectedPayments && db.crmPayments) { try { out.expectedByContractSchedules = crm.expectedPayments(ctx, t, new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10)).map(e => ({ date: e.date, amount: e.amount, label: e.label, status: e.status })); } catch (e) { /* нет */ } }
  }
  out.contracts = (db.contracts || []).filter(c => !c.closed).map(c => ({ client: c.clientShort || c.client || '', name: c.name || c.code, company: c.company || '', sum: num(c.sum), paid: num(c.paid), remaining: num(c.remaining), toPay: num(c.toPay), signed: !!c.signed, note: cut(c.note, 60) }));
  out.subcontracts = (db.subcontracts || []).map(s => ({ project: s.project, contractor: s.contractor, section: s.section || s.work || '', sum: num(s.sum), paid: num(s.paid) }));
  // обороты по проектам за всё время и по месяцам за год (без ЗП)
  const ops = (db.ops || []).filter(o => kindOf(o.category) !== 'transfer' && !isPayroll(o));
  const byProj = new Map(); for (const o of ops) { const k = o.project || '—'; const r = byProj.get(k) || { project: k, income: 0, expense: 0 }; r.income += num(o.credit); r.expense += num(o.debit); byProj.set(k, r); }
  out.projectsTurnover = [...byProj.values()].sort((a, b) => (b.income + b.expense) - (a.income + a.expense)).slice(0, 80);
  const y0 = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 7); const byM = new Map();
  for (const o of ops) { const m = String(o.date || '').slice(0, 7); if (m < y0) continue; const r = byM.get(m) || { month: m, income: 0, expense: 0 }; r.income += num(o.credit); r.expense += num(o.debit); byM.set(m, r); }
  out.monthly = [...byM.values()].sort((a, b) => a.month.localeCompare(b.month));
  // операции по проекту/контрагенту, если они названы в вопросе (без ЗП)
  const q = ' ' + String(text || '').toLowerCase() + ' ';
  const names = new Set([...(db.projects || []).flatMap(p => [p.id, p.name]), ...(db.subcontracts || []).map(s => s.contractor), ...(db.contracts || []).map(c => c.clientShort)].filter(n => n && String(n).length >= 4));
  const hit = [...names].filter(n => q.includes(String(n).toLowerCase()) || String(n).toLowerCase().split(/\s+/).some(w => w.length >= 5 && q.includes(' ' + w)));
  if (hit.length) { const hs = hit.map(h => String(h).toLowerCase()); out.matched = hit.slice(0, 10); out.opsMatched = ops.filter(o => hs.some(h => `${o.project || ''} ${o.counterparty || ''}`.toLowerCase().includes(h))).slice(-400).map(o => ({ date: o.date, project: o.project || '', counterparty: o.counterparty || '', purpose: cut(o.purpose, 80), category: o.category || '', income: num(o.credit), expense: num(o.debit) })); }
  out.note = 'Данные о зарплате отдельных сотрудников исключены. Суммы в тенге.';
  return out;
}
// промпт: данные + задача
const TASK = {
  plan: (c, x) => `Составь план работ по проекту «${c.project.name}» (${c.project.stage}). Сегодня ${c.today}, срок по договору ${c.project.due || 'не задан'}.
Проверь сроки незакрытых пунктов: успеваем ли к сроку, где цепочка этапов нереальна. В "plan.dues" предложи новые сроки ТОЛЬКО там, где их нужно менять: {"id": id существующего пункта, "due": "ГГГГ-ММ-ДД", "why": "почему"}.
В "plan.items" — недостающие пункты (если регламент/практика требуют, а в проекте их нет): {"stage": номер существующего этапа, "title", "role": одна из ${JSON.stringify(c.roles)}, "weeks": недель, "crit": критерий приёмки, "due": срок или ""}. Не дублируй существующие пункты.
В "blocks": ключевые даты по этапам (таблица Этап / Начало / Окончание / Комментарий), риски срока, что нужно от заказчика.${x.text ? '\nПожелания руководителя: ' + x.text : ''}`,
  znp: (c, x) => `Подготовь Задание на проектирование (ЗнП) по форме MOST — приложение к договору на выполнение проектных работ, для объекта «${c.project.name}», стадия ${c.project.stage}.
"blocks": одна таблица {"head": ["№", "Перечень основных данных и требований", "Содержание"], "rows": [...]} ровно по строкам: ${JSON.stringify(A.ZNP_ROWS)}.
Заполни из данных проекта (заказчик, адрес, площадь, стадия, договор); чего нет — «уточнить у заказчика» и типовая формулировка MOST для жилых комплексов в Алматы (сейсмичность до 9 баллов, СН/СП РК). "title": "Задание на проектирование".${x.text ? '\nДополнительно: ' + x.text : ''}`,
  tz: (c, x) => `Подготовь техническое задание (ТЗ) на разработку раздела ${x.param || '(раздел не указан)'} для объекта «${c.project.name}», стадия ${c.project.stage}. Разделы ТЗ: 1. Общие сведения об объекте; 2. Основание и исходные данные (что передаём исполнителю); 3. Состав и объём работ по разделу; 4. Требования к решениям и оформлению (нормы РК, BIM/Revit, форматы сдачи); 5. Сроки — по пунктам раздела ${x.param || ''} из плана проекта (таблица); 6. Порядок передачи, проверки и приёмки; 7. Контакты (ГИП/ПМ проекта). "title": "Техническое задание на раздел ${x.param || ''}".${x.text ? '\nДополнительно: ' + x.text : ''}`,
  protocol: (c, x) => `Оформи протокол совещания по проекту «${c.project.name}» из заметок ниже. "blocks": дата и место (если есть), участники (ul), повестка (ol), обсуждение кратко, таблица решений {"head": ["№", "Решение / поручение", "Ответственный", "Срок"]}. Ничего не добавляй от себя, неизвестное — «—». "title": "Протокол совещания".\nЗаметки:\n${x.text}`,
  letter: (c, x) => `Напиши официальное письмо от ТОО «MOST» заказчику (${c.project.client || 'заказчик'}) по проекту «${c.project.name}». Суть: ${x.text}. "blocks": обращение, текст абзацами, при необходимости перечень (ul) и срок ответа, подпись «С уважением, … ТОО «MOST»». "title": тема письма.`,
  fire: c => `Что горит по проекту «${c.project.name}» на ${c.today}: просроченные и ближайшие (14 дней) пункты, блокеры и сколько висят, реально ли успеть к сроку по договору (${c.project.due || 'не задан'}). "summary" — главное одной-двумя фразами; "blocks": таблица проблем {"head": ["Что", "Кто", "Срок/с какого", "Что сделать"]} и 3–5 действий на эту неделю.`,
  ask: (c, x) => `Ответь на вопрос руководителя по данным ниже. Если данных не хватает — скажи каких. Вопрос: ${x.text}`,
  fireall: c => `Сводка «что горит» по всем активным проектам на ${c.today}: проекты с риском срока по договору (прогноз позже срока, срок ближе 30 дней при низкой готовности), просрочки по разделам, блокеры старше 14 дней. "summary" — 2–3 фразы; "blocks": таблица {"head": ["Проект", "Стадия", "Проблема", "Что сделать", "Кто"]} по убыванию срочности, затем по разделам (ul).`,
  overdue: (c, x) => `Что просрочено у раздела ${x.param || '(все разделы)'} на ${c.today} по всем проектам: таблица {"head": ["Проект", "Пункт", "Срок", "Дней просрочки", "Исполнитель/подрядчик"]}, сгруппируй по проектам, в конце — что поставить в приоритет на неделю.`,
  newplan: (c, x) => `Составь план работ по НОВОМУ проекту по описанию руководителя. Сегодня ${c.today}. Верни "project": {"name", "track": "concept"|"ep"|"rp"|"an", "client", "address", "area", "start": "ГГГГ-ММ-ДД", "due": "ГГГГ-ММ-ДД"} — по «Применить» проект создаётся в «Проектах» по шаблону стадии со сроками под дату по договору. "blocks": этапы и ориентировочные сроки (таблица), что запросить у заказчика (ИРД), риски. Описание: ${x.text}`,
  receivables: (c, x) => `Дебиторская задолженность на ${c.today}: кто и сколько должен, возраст долга, что просрочено больше 30/90 дней, кому звонить в первую очередь. "blocks": таблица {"head": ["Заказчик", "Сумма", "Актов", "Макс. возраст, дн."]} и выводы.${x.text ? ' Уточнение: ' + x.text : ''}`,
  forecast: (c, x) => `Прогноз денег на 8 недель от ${c.today} по данным: остаток, поступления и платежи по неделям, минимальный остаток и когда, крупные поступления и платежи, риски кассового разрыва. "blocks": таблица по неделям {"head": ["Неделя", "Поступления", "Платежи", "Остаток"]} и выводы.${x.text ? ' Уточнение: ' + x.text : ''}`,
  subs: (c, x) => `Сколько ушло субподрядчикам по проекту: ${x.text}. По договорам субподряда (сумма, оплачено, остаток) и по фактическим операциям, если они есть; таблица {"head": ["Подрядчик", "Раздел", "Договор", "Оплачено", "Остаток"]} и итог.`,
};
function buildPrompt(ctx, scope, cmd, x) {
  let data, c, facts = {}, mock = {};
  if (scope === 'pm') {
    c = pmCtx(ctx, x.project); const kb = kbCtx(ctx, `регламент ${c.project.stage} ${cmd === 'tz' ? 'задание ' + (x.param || '') : cmd === 'znp' ? 'задание на проектирование' : 'план работ'}`);
    data = Object.assign({}, c, kb.length ? { regulations: kb } : {});
    const open = c.stages.flatMap(s => s.items).filter(i => !i.done && !i.na);
    facts = { 'Проект': c.project.name, 'Пунктов': c.stages.reduce((s, x2) => s + x2.items.length, 0), 'Открытых': open.length, 'Блокеров': c.blockers.length, 'Регламентов': kb.length };
    mock = { firstOpen: open[0] && open[0].id, today: c.today, soon: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) };
  } else if (scope === 'pmall') {
    c = pmAllCtx(ctx, cmd === 'overdue' ? x.param : ''); data = c; if (cmd === 'newplan') { const kb = kbCtx(ctx, 'регламент проектирования ' + x.text); if (kb.length) data = Object.assign({}, c, { regulations: kb }); }
    facts = { 'Активных проектов': c.projects.length, 'Просрочено пунктов': c.overdue.length, 'Блокеров': c.blockers.length };
    mock = { today: c.today, soon: new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10) };
  } else {
    c = finCtx(ctx, cmd, x.text); data = c; facts = { 'Договоров': c.contracts.length, 'Субподряд': c.subcontracts.length, 'Совпадений в вопросе': (c.matched || []).length };
  }
  let body = json(data); if (body.length > 400000) body = body.slice(0, 400000) + '\n…(данные обрезаны)';
  const prompt = `ДАННЫЕ (JSON, на ${ctx.today()}):\n${body}\n\nЗАДАЧА:\n${TASK[cmd](c, x)}\n\nОтветь одним JSON-объектом по схеме из системной инструкции.`;
  return { prompt, mock: Object.assign(mock, { facts, stats: Object.entries(facts).map(([k, v]) => `${k}: ${v}`).join(', ') }) };
}

// ---- вызов API модуля pm от имени пользователя (права проверяет pm) ----
function callPm(ctx, method, parts, body) {
  const pm = ctx.modules.pm; if (!pm || !pm.handle) return { ok: false, status: 404, error: 'Модуль «Проекты» не подключён' };
  const sub = Object.assign({}, ctx, { parts: ['pm', ...parts], method, body: body || {}, qs: {}, ok: b => ({ ok: true, body: b }), err: (s, m) => ({ ok: false, status: s, error: m }), send: (s, b) => ({ ok: s < 400, status: s, body: b }) });
  sub.emit = ctx.emit; try { return pm.handle(sub) || { ok: false, error: 'нет ответа' }; } catch (e) { return { ok: false, status: 500, error: e.message }; }
}

function handle(ctx) {
  const { parts, method, user, db, store, ok, err } = ctx; const body = ctx.body || {}; const qs = ctx.qs || {};
  const [, a, b, c] = parts;
  if (!user) return err(401, 'Не авторизован');
  if (!A.canUse(user)) return err(403, 'ИИ-панель пока доступна только руководителям');
  const site = siteOf(ctx); const scopes = scopesFor(site); const cfg = cfgOf(db); const env = { db, store };
  const findP = id => (db.pmProjects || []).find(p => p.id === id);
  const myDraft = id => { const d = db.aiDrafts.find(x => x.id === id); return d && (d.userId === user.id || A.canAdmin(user)) ? d : null; };
  const draftOut = d => {
    const o = Object.assign({}, d, { pname: d.pid ? ((findP(d.pid) || {}).name || '') : '' });
    if (d.plan && d.plan.dues) { const its = new Map((db.pmItems || []).filter(i => i.pid === d.pid).map(i => [i.id, i])); o.plan = Object.assign({}, d.plan, { dues: d.plan.dues.map(x => { const i = its.get(x.id); return Object.assign({}, x, i ? { title: i.title, stageName: i.stageName, role: i.role, oldDue: i.due || '', done: !!i.done } : { missing: true }); }) }); }
    return o;
  };

  if (a === 'status' && method === 'GET') {
    const cli = cfg.backend === 'cli' ? findCli(cfg) : '';
    return ok({ backend: cfg.backend, cli: cfg.backend === 'cli' ? { path: cli, found: !!cli, version: qs.version ? cliVersion(cli) : '' } : null, api: cfg.backend === 'api' ? { keySet: !!process.env.ANTHROPIC_API_KEY, model: cfg.apiModel } : null,
      queue: { running: RUNNING ? jobOut(RUNNING) : null, queued: QUEUE.length, max: cfg.maxQueue }, site, scopes, admin: A.canAdmin(user), timeoutSec: cfg.timeoutSec });
  }
  if (a === 'commands' && method === 'GET') return ok({ commands: Object.fromEntries(scopes.map(s => [s, A.COMMANDS[s]])), sections: A.SECTIONS, scopes, site });
  if (a === 'projects' && method === 'GET') { if (!scopes.includes('pm')) return err(404, 'Проекты — на сайте MOST ERP'); const PM = ctx.modules.pm && ctx.modules.pm.domain; return ok((db.pmProjects || []).map(p => ({ id: p.id, name: p.name, track: p.track, client: p.client || '', status: p.status, active: PM ? PM.ACTIVE(p.status) : true })).sort((x, y) => (y.active - x.active) || String(x.name).localeCompare(String(y.name), 'ru'))); }

  // ---- задать задачу ----
  if (a === 'ask' && method === 'POST') {
    const scope = String(body.scope || ''); const cmdId = String(body.cmd || '');
    if (!scopes.includes(scope)) return err(scope === 'fin' ? 403 : 404, scope === 'fin' ? 'Финансовая панель — только на сайте «Финансы»' : 'Нет такого места панели на этом сайте');
    const cm = A.command(scope, cmdId); if (!cm) return err(400, 'Неизвестная команда');
    const text = String(body.text || '').trim().slice(0, 20000); if (cm.text === 'req' && !text) return err(400, 'Напишите текст запроса');
    const param = cm.param ? String(body.param || '').trim().slice(0, 40) : ''; if (cm.param === 'section' && param && !A.SECTIONS.includes(param)) return err(400, 'Неизвестный раздел');
    let project = null; if (scope === 'pm') { project = findP(body.pid); if (!project) return err(400, 'Выберите проект'); }
    if (QUEUE.length >= cfg.maxQueue) return err(429, `Очередь заполнена (${QUEUE.length}) — подождите`);
    if (QUEUE.some(j => j.userId === user.id) && !body.force) return err(429, 'Ваш предыдущий запрос ещё в очереди');
    let built; try { built = buildPrompt(ctx, scope, cmdId, { project, text, param }); } catch (e) { return err(500, 'Не удалось собрать данные: ' + e.message); }
    const j = { id: store.id(), userId: user.id, scope, cmd: cmdId, label: cm.label + (param ? ' ' + param : ''), pid: project ? project.id : '', pname: project ? project.name : '', param, text, prompt: built.prompt, mock: built.mock, status: 'queued', createdAt: new Date().toISOString(), backend: cfg.backend };
    JOBS.set(j.id, j); QUEUE.push(j); setImmediate(() => pump(env));
    return ok(jobOut(j));
  }
  if (a === 'jobs') {
    if (!b && method === 'GET') return ok([...JOBS.values()].filter(j => j.userId === user.id || A.canAdmin(user)).sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, 30).map(jobOut));
    const j = b && JOBS.get(b); if (!j || (j.userId !== user.id && !A.canAdmin(user))) return err(404, 'Задача не найдена (после перезапуска сервера задачи очищаются)');
    if (method === 'GET') { const out = jobOut(j); if (j.draftId) { const d = myDraft(j.draftId); if (d) out.draft = draftOut(d); } return ok(out); }
    if (method === 'DELETE') { const i = QUEUE.indexOf(j); if (i < 0) return err(409, j.status === 'running' ? 'Задача уже выполняется' : 'Задача завершена'); QUEUE.splice(i, 1); j.status = 'error'; j.error = 'Отменено'; j.endedAt = new Date().toISOString(); return ok(jobOut(j)); }
  }

  // ---- черновики ----
  if (a === 'drafts') {
    if (!b && method === 'GET') return ok(db.aiDrafts.filter(d => d.userId === user.id && scopes.includes(d.scope)).slice(-30).reverse().map(d => ({ id: d.id, scope: d.scope, cmd: d.cmd, label: d.label, title: d.title, pid: d.pid, pname: d.pid ? ((findP(d.pid) || {}).name || '') : '', createdAt: d.createdAt, applied: d.applied })));
    const d = b && myDraft(b); if (!d || !scopes.includes(d.scope)) return err(404, 'Черновик не найден');
    if (!c && method === 'GET') return ok(draftOut(d));
    if (!c && method === 'DELETE') { db.aiDrafts.splice(db.aiDrafts.indexOf(d), 1); store.save(); store.audit(user.id, 'delete', 'aiDrafts', d.id); return ok({ ok: true }); }
    if (c === 'docx' && method === 'GET') {
      const p = d.pid && findP(d.pid); const date = ctx.today();
      const m = { title: d.title, subtitle: [p ? p.name : '', p && p.client ? 'Заказчик: ' + p.client : ''].filter(Boolean).join(' · '), blocks: (d.summary ? [{ p: d.summary }] : []).concat(d.blocks || []), footer: `ТОО «MOST» · подготовлено ${date.split('-').reverse().join('.')} · черновик ИИ, проверен: ______________` };
      if (d.cmd === 'znp') { m.topRight = ['Приложение № ___', `к Договору № ${(p && p.contractNo) || '______'} на выполнение проектных работ`, `от ${(p && p.contractDate) ? p.contractDate.split('-').reverse().join('.') : '«__» ________ 20__ г.'}`]; m.header = { left: ['УТВЕРЖДАЮ:', 'Заказчик', (p && p.client) || '________________', '', '______________ / ____________', '«__» ________ 20__ г.'], right: ['СОГЛАСОВАНО:', 'Исполнитель', 'ТОО «MOST»', '', '______________ / ____________', '«__» ________ 20__ г.'] }; m.blocks = d.blocks || []; }
      const buf = DOCX.build(m); const name = A.fileName(d.title + (p ? ' — ' + p.name : ''), date);
      store.audit(user.id, 'docx', 'aiDrafts', d.id);
      return ctx.send(200, buf, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="document.docx"; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'no-store' });
    }
    // «Применить»: план работ → сроки и пункты в pm; новый проект → проект в pm. Выбор строк — body.dues / body.items (индексы)
    if (c === 'apply' && method === 'POST') {
      if (d.applied && !body.again) return err(409, 'Черновик уже применён');
      const res = { ok: 0, errors: [] }; const pick = (arr, sel) => (arr || []).filter((_, i) => !Array.isArray(sel) || sel.map(Number).includes(i));
      if (d.plan && d.pid) {
        const p = findP(d.pid); if (!p) return err(404, 'Проект удалён');
        const ids = new Set(db.pmItems.filter(i => i.pid === p.id).map(i => i.id));
        for (const x of pick(d.plan.dues, body.dues)) { if (!ids.has(x.id)) { res.errors.push(`пункт ${x.id} не найден`); continue; } const r = callPm(ctx, 'PUT', ['items', x.id], { due: x.due }); r.ok ? res.ok++ : res.errors.push(r.error); }
        for (const x of pick(d.plan.items, body.items)) { const r = callPm(ctx, 'POST', ['projects', p.id, 'items'], { stage: x.stage, title: x.title, role: x.role, weeks: x.weeks, crit: x.crit }); if (!r.ok) { res.errors.push(r.error); continue; } res.ok++; if (x.due && r.body && r.body.id) callPm(ctx, 'PUT', ['items', r.body.id], { due: x.due }); }
      } else if (d.project) {
        const f = Object.assign({}, d.project, body.project && typeof body.project === 'object' ? A.cleanProject(Object.assign({}, d.project, body.project)) : {}); f.fit = !!f.due;
        const r = callPm(ctx, 'POST', ['projects'], f); if (!r.ok) return err(r.status || 400, r.error); res.ok = 1; res.pmProjectId = r.body && r.body.project && r.body.project.id;
      } else return err(400, 'В черновике нечего применять');
      if (!res.ok && res.errors.length) return err(400, 'Не применено: ' + res.errors.slice(0, 3).join('; '));
      d.applied = { at: new Date().toISOString(), by: user.id, n: res.ok, errors: res.errors.length, pmProjectId: res.pmProjectId || '' }; store.save(); store.audit(user.id, 'apply', 'aiDrafts', d.id, { n: res.ok, errors: res.errors.length });
      return ok(Object.assign(res, { draft: draftOut(d) }));
    }
  }

  // ---- владелец: настройки, проверка, журнал ----
  if (a === 'config') {
    if (!A.canAdmin(user)) return err(403, 'Настройки ИИ меняет владелец');
    if (method === 'GET') return ok(Object.assign(cfg, { cliFound: findCli(cfg), apiKeySet: !!process.env.ANTHROPIC_API_KEY, core: (db.settings && db.settings.ai) || null }));
    if (method === 'PUT') {
      const f = ctx.pick(body, CONFIG_FIELDS); if ('backend' in f && !A.BACKENDS.includes(f.backend)) return err(400, 'backend: cli | api | mock');
      if (f.cliPath && !/claude(\.exe|\.cmd)?$/i.test(f.cliPath)) return err(400, 'Укажите путь к исполняемому файлу claude (claude.exe)');
      for (const k of ['timeoutSec', 'maxQueue', 'mockDelayMs']) if (k in f) f[k] = Number(f[k]) || 0;
      let x = db.aiConfig.find(y => y.id === 'config'); if (!x) { x = { id: 'config' }; db.aiConfig.push(x); } Object.assign(x, f, { updatedAt: new Date().toISOString(), updatedBy: user.id });
      VERSION_CACHE = { path: '', version: '' }; store.save(); store.audit(user.id, 'update', 'aiConfig', 'config', f); return ok(cfgOf(db));
    }
  }
  if (a === 'log' && method === 'GET') {
    if (!A.canAdmin(user)) return err(403, 'Журнал видит владелец');
    const rows = db.aiLog.slice(-300).reverse().map(l => Object.assign({}, l, { user: ctx.userName ? ctx.userName(l.userId) : l.userId, pname: l.pid ? ((findP(l.pid) || {}).name || '') : '' }));
    const ok7 = db.aiLog.filter(l => l.at >= new Date(Date.now() - 7 * 864e5).toISOString());
    return ok({ rows, week: { n: ok7.length, errors: ok7.filter(l => l.status === 'error').length, avgSec: ok7.length ? Math.round(ok7.reduce((s, l) => s + l.ms, 0) / ok7.length / 1000) : 0 } });
  }
  return err(404, 'Нет такого раздела ИИ-панели');
}

module.exports = { id: 'ai', api: 'ai', site: ['erp', 'fin'], collections: ['aiLog', 'aiDrafts', 'aiConfig'], handle, domain: A, findCli, _buildPrompt: buildPrompt, _queue: () => ({ running: RUNNING, queued: QUEUE.length }) };
