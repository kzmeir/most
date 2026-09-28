'use strict';
// «Материалы» доски: папка проекта на сетевом диске → список картинок и PDF по категориям, миниатюры, связь объектов доски с файлами.
// Только чтение сетевых папок: сервер ничего не создаёт и не меняет на дисках; пишет только в DATA_DIR (скан — в базе, миниатюры — board-thumbs/).
// Корни (разрешённые сетевые папки): настройка модуля (boardConfig 'roots', меняют owner/partner) → env BOARD_ROOTS → по умолчанию Y: и Z:.
// Путь вне корней, «..», «:» внутри пути, символьные ссылки наружу — отказ.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const BD = require('./domain');

const DEFAULT_ROOTS = [
  { id: 'y', alias: 'Y:', path: '\\\\SynologyMost\\MOST-2025', label: 'MOST-2025 (Y:) — концепции, ЭП, архив', tracks: ['ep', 'concept'] },
  { id: 'z', alias: 'Z:', path: '\\\\MostServer\\Projects', label: 'Projects (Z:) — рабочие проекты РП', tracks: ['rp'] },
];
// лимиты сканирования (можно уменьшить в тестах через opts)
const LIMITS = { depth: 6, files: 1500, dirs: 1500, ms: 20000, par: 8 };
const THUMB_MAX = 400 * 1024; // миниатюра 400 px в JPEG — обычно 20–60 КБ
const RESCAN_MIN_MS = Number(process.env.BOARD_RESCAN_MS || 15000); // «Обновить» — не чаще раза в 15 с на доску
const STALE_MS = 5 * 60000; // при открытии доски — пересканировать, если скан старше 5 минут
const NEW_DAYS = 14; // «новое» — файл появился после первого скана и не старше 14 дней
const CAND_TTL = 10 * 60000; const CAND_BUDGET = 80; // подбор папки: индекс папок корня кэшируется на 10 минут, не больше 80 чтений каталогов

// ---- корни ----
function cleanRoot(r) {
  if (!r || typeof r !== 'object') return null; const id = String(r.id || '').toLowerCase().trim(); const p = String(r.path || '').trim();
  if (!BD.ROOT_ID_RE.test(id) || !p || /[\x00-\x1f]/.test(p) || p.replace(/\\/g, '/').split('/').some(s => s === '..')) return null;
  const alias = String(r.alias || '').trim().replace(/[\\/]+$/, '').slice(0, 20);
  return { id, alias, path: p.replace(/[\\/]+$/, '') || p, label: String(r.label || '').slice(0, 120), tracks: (Array.isArray(r.tracks) ? r.tracks : String(r.tracks || '').split(/[\s,]+/)).map(String).filter(t => /^[a-z]{1,12}$/.test(t)).slice(0, 5) };
}
// BOARD_ROOTS="y|Y:|\\SynologyMost\MOST-2025|ep,concept;z|Z:|\\MostServer\Projects|rp"  (id | алиас | путь | стадии)
function parseRootsEnv(s) { return String(s || '').split(';').map(x => x.trim()).filter(Boolean).map(x => { const [id, alias, p, tracks] = x.split('|'); return cleanRoot({ id, alias, path: p, tracks, label: `${alias || id} — ${p}` }); }).filter(Boolean); }
function roots(db) {
  const cfg = (db.boardConfig || []).find(x => x.id === 'roots');
  if (cfg && Array.isArray(cfg.roots) && cfg.roots.length) return cfg.roots.map(cleanRoot).filter(Boolean);
  const env = parseRootsEnv(process.env.BOARD_ROOTS); return env.length ? env : DEFAULT_ROOTS.map(cleanRoot);
}
const rootSource = db => { const cfg = (db.boardConfig || []).find(x => x.id === 'roots'); return cfg && cfg.roots && cfg.roots.length ? 'settings' : process.env.BOARD_ROOTS ? 'env' : 'default'; };
const norm = s => String(s || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
// путь пользователя («Y:\Concept Projects EP\111-…», «\\SynologyMost\MOST-2025\…», «y:/…») → { root, rel } или null
function parseUserPath(list, input) {
  let s = String(input || '').trim().replace(/^["']|["']$/g, ''); if (!s || s.length > 1000) return null; const n = s.replace(/\\/g, '/');
  for (const r of list) {
    for (const pre of [r.alias, r.path].filter(Boolean)) {
      const np = norm(pre); const nl = n.toLowerCase();
      if (nl === np || nl.startsWith(np + '/')) { const rel = BD.cleanRel(n.slice(np.length)); if (rel === null) return null; return { root: r.id, rel }; }
    }
  }
  return null;
}
// абсолютный путь внутри корня (с проверкой, что не вышли наружу)
function absOf(list, rootId, rel) {
  const r = list.find(x => x.id === rootId); if (!r) return null; const clean = BD.cleanRel(rel); if (clean === null) return null;
  const abs = path.resolve(r.path, ...clean.split('/').filter(Boolean)); const back = path.relative(path.resolve(r.path), abs);
  if (back.startsWith('..') || path.isAbsolute(back)) return null; return abs;
}
const displayPath = (list, rootId, rel) => { const r = list.find(x => x.id === rootId); if (!r) return rel; const base = r.alias || r.path; const sep = /^[a-z]:$/i.test(base) || base.startsWith('\\\\') || base.includes('\\') ? '\\' : '/'; return rel ? base + sep + rel.split('/').join(sep) : base + sep; };
const uncPath = (list, rootId, rel) => { const r = list.find(x => x.id === rootId); if (!r) return ''; const sep = r.path.includes('\\') ? '\\' : '/'; return rel ? r.path + sep + rel.split('/').join(sep) : r.path; };
// символьные ссылки / junction: настоящий путь тоже должен лежать в корне
async function insideReal(list, rootId, abs) {
  const r = list.find(x => x.id === rootId); if (!r) return false;
  try { const [rr, ra] = await Promise.all([fsp.realpath(r.path), fsp.realpath(abs)]); const back = path.relative(rr, ra); return !back.startsWith('..') && !path.isAbsolute(back); } catch { return false; }
}
const fileId = (root, rel) => crypto.createHash('sha1').update(root + ':' + rel).digest('hex').slice(0, 16);
const thumbKey = (root, rel, size, mtime) => crypto.createHash('sha1').update(`${root}:${rel}|${size}|${mtime}`).digest('hex').slice(0, 24);
const thumbsDir = store => path.join(store.DATA_DIR, 'board-thumbs');

// ---- сканирование папки: обход в ширину (сначала верхние уровни), лимиты глубины, числа файлов и каталогов, времени ----
async function scanFolder(abs, opts) {
  const L = Object.assign({}, LIMITS, opts || {}); const t0 = Date.now(); const files = []; const errors = []; let dirs = 0, deep = 0; let truncated = '';
  let level = [{ abs, rel: '' }];
  for (let depth = 0; level.length && !truncated; depth++) {
    const next = [];
    for (let i = 0; i < level.length && !truncated; i += L.par) {
      const chunk = level.slice(i, i + L.par);
      const lists = await Promise.all(chunk.map(d => fsp.readdir(d.abs, { withFileTypes: true }).then(ents => ({ d, ents }), e => { errors.push(`${d.rel || '.'}: ${e.code || e.message}`); return { d, ents: [] }; })));
      for (const { d, ents } of lists) {
        dirs++; const stats = [];
        for (const e of ents) {
          const rel = d.rel ? d.rel + '/' + e.name : e.name;
          if (e.isDirectory()) { if (!BD.excludedDir(e.name)) { if (depth + 1 < L.depth) next.push({ abs: path.join(d.abs, e.name), rel }); else deep++; } continue; }
          if (!e.isFile() || BD.excludedFile(e.name)) continue; stats.push({ name: e.name, rel, abs: path.join(d.abs, e.name) });
        }
        for (let j = 0; j < stats.length; j += L.par) {
          const got = await Promise.all(stats.slice(j, j + L.par).map(s => fsp.stat(s.abs).then(st => ({ s, st }), () => null)));
          for (const g of got) { if (!g || !g.st.size) continue; if (files.length >= L.files) { truncated = 'files'; break; } files.push({ rel: g.s.rel, name: g.s.name, size: g.st.size, mtime: Math.round(g.st.mtimeMs) }); }
          if (truncated) break;
        }
        if (dirs >= L.dirs) { truncated = truncated || 'dirs'; break; }
        if (Date.now() - t0 > L.ms) { truncated = truncated || 'time'; break; }
      }
    }
    level = next;
  }
  return { files, errors: errors.slice(0, 20), dirs, deep, truncated, ms: Date.now() - t0 };
}

// ---- состояние скана доски (коллекция boardMaterials, один документ на доску) ----
const SCANS = new Map(); // boardId → Promise (один скан на доску одновременно)
const docOf = (db, boardId) => db.boardMaterials.find(x => x.id === boardId) || null;
// слить новый скан со старым: «впервые замечен» (firstSeen) — пусто у файлов первого скана, дата — у появившихся позже; changedAt — если файл изменился
function mergeScan(prev, folder, scan, list, nowIso, store) {
  const old = new Map((prev && prev.folderKey === folder.root + ':' + folder.rel ? prev.files : []).map(f => [f.path, f])); const first = !old.size && !(prev && prev.folderKey === folder.root + ':' + folder.rel && prev.scannedAt);
  const files = scan.files.map(x => {
    const p = folder.rel ? folder.rel + '/' + x.rel : x.rel; const o = old.get(p); const changed = o && (o.size !== x.size || o.mtime !== x.mtime);
    if (changed && store) { try { fs.unlinkSync(path.join(thumbsDir(store), thumbKey(folder.root, p, o.size, o.mtime) + '.jpg')); } catch { } } // старая миниатюра больше не нужна
    return { f: fileId(folder.root, p), root: folder.root, path: p, rel: x.rel, name: x.name, dir: x.rel.includes('/') ? x.rel.slice(0, x.rel.lastIndexOf('/')) : '', kind: BD.matKind(x.name), cat: BD.matCategory(x.rel), size: x.size, mtime: x.mtime, firstSeen: o ? o.firstSeen || '' : first ? '' : nowIso, changedAt: changed ? nowIso : o ? o.changedAt || '' : '' };
  });
  return files;
}
async function rescan(ctx, bd, o) {
  const { db, store } = ctx; const list = roots(db); const folder = bd.folder; if (!folder) throw Object.assign(new Error('Папка проекта не привязана'), { status: 400 });
  const abs = absOf(list, folder.root, folder.rel); if (!abs) throw Object.assign(new Error('Папка вне разрешённых корней'), { status: 400 });
  if (SCANS.has(bd.id)) return SCANS.get(bd.id);
  const p = (async () => {
    if (!(await insideReal(list, folder.root, abs))) throw Object.assign(new Error(`Папка недоступна: ${displayPath(list, folder.root, folder.rel)}`), { status: 404 });
    const scan = await scanFolder(abs, o && o.limits); const t = new Date().toISOString();
    let doc = docOf(db, bd.id); const files = mergeScan(doc, folder, scan, list, t, store);
    if (!doc) { doc = { id: bd.id, boardId: bd.id }; db.boardMaterials.push(doc); }
    Object.assign(doc, { folderKey: folder.root + ':' + folder.rel, files, scannedAt: t, scannedBy: ctx.user.id, truncated: scan.truncated, errors: scan.errors, dirs: scan.dirs, deep: scan.deep, ms: scan.ms });
    store.save(); return doc;
  })().finally(() => SCANS.delete(bd.id));
  SCANS.set(bd.id, p); return p;
}

// ---- ответы ----
function thumbExists(store, f) { return fs.existsSync(path.join(thumbsDir(store), thumbKey(f.root, f.path, f.size, f.mtime) + '.jpg')); }
function filesOut(ctx, doc) {
  const t = Date.now(); const isNew = f => !!f.firstSeen && t - Date.parse(f.firstSeen) < NEW_DAYS * 86400000; const isChanged = f => !!f.changedAt && t - Date.parse(f.changedAt) < NEW_DAYS * 86400000;
  return (doc ? doc.files : []).map(f => ({ f: f.f, root: f.root, path: f.path, rel: f.rel, name: f.name, dir: f.dir, kind: f.kind, cat: f.cat, size: f.size, mtime: f.mtime, t: thumbKey(f.root, f.path, f.size, f.mtime), thumb: thumbExists(ctx.store, f), isNew: isNew(f), changed: !isNew(f) && isChanged(f) }));
}
// связанные объекты доски: сверка версии файла (из скана; вне папки — stat, не больше 300 файлов)
async function linkedState(ctx, bd, doc) {
  const list = roots(ctx.db); const byKey = new Map((doc ? doc.files : []).map(f => [BD.linkKey(f.root, f.path), f])); const out = {}; const need = [];
  for (const it of ctx.db.boardItems) {
    if (it.boardId !== bd.id || it.deleted || !it.props || !it.props.srcPath) continue; const k = BD.linkKey(it.props.srcRoot, it.props.srcPath); const f = byKey.get(k);
    if (f) out[it.id] = { state: f.size === it.props.srcSize && f.mtime === it.props.srcMtime ? 'ok' : 'changed', f: f.f, size: f.size, mtime: f.mtime };
    else need.push(it);
  }
  for (const it of need.slice(0, 300)) {
    const abs = absOf(list, it.props.srcRoot, it.props.srcPath); let st = null; if (abs) { try { st = await fsp.stat(abs); } catch { } }
    out[it.id] = st ? { state: st.size === it.props.srcSize && Math.round(st.mtimeMs) === it.props.srcMtime ? 'ok' : 'changed', f: fileId(it.props.srcRoot, it.props.srcPath), size: st.size, mtime: Math.round(st.mtimeMs), outside: true } : { state: 'missing' };
  }
  for (const it of need.slice(300)) out[it.id] = { state: 'unknown' };
  for (const [id, s] of Object.entries(out)) { const it = ctx.db.boardItems.find(x => x.id === id && x.boardId === bd.id); if (it) { s.display = displayPath(list, it.props.srcRoot, it.props.srcPath); s.unc = uncPath(list, it.props.srcRoot, it.props.srcPath); } }
  return out;
}
function folderOut(db, bd) {
  if (!bd.folder) return null; const list = roots(db); const r = list.find(x => x.id === bd.folder.root);
  return { root: bd.folder.root, rel: bd.folder.rel, display: displayPath(list, bd.folder.root, bd.folder.rel), unc: uncPath(list, bd.folder.root, bd.folder.rel), rootLabel: r ? r.label || r.alias || r.id : '(корень удалён из настроек)', ok: !!r, setAt: bd.folder.setAt || '', setBy: bd.folder.setBy || '' };
}
// найти файл доски по id: сначала скан текущей папки, потом связанные объекты (файл мог уйти из папки или папку перепривязали)
function findFile(ctx, bd, f) {
  const doc = docOf(ctx.db, bd.id); const hit = doc && doc.files.find(x => x.f === f); if (hit) return { root: hit.root, path: hit.path, name: hit.name, size: hit.size, mtime: hit.mtime, kind: hit.kind };
  const it = ctx.db.boardItems.find(x => x.boardId === bd.id && !x.deleted && x.props && x.props.srcPath && fileId(x.props.srcRoot, x.props.srcPath) === f);
  return it ? { root: it.props.srcRoot, path: it.props.srcPath, name: it.props.srcPath.split('/').pop(), kind: BD.matKind(it.props.srcPath) } : null;
}

// ---- подбор папки проекта: индекс каталогов корней (обход в ширину до глубины 3, номерные папки проектов не раскрываются) ----
const CAND = new Map(); // rootId → { at, dirs, busy }
async function rootIndex(r) {
  const c = CAND.get(r.id + '|' + r.path); if (c && Date.now() - c.at < CAND_TTL) return c.dirs; if (c && c.busy) return c.busy;
  const busy = (async () => {
    const dirs = []; let level = [{ abs: r.path, rel: '' }]; let reads = 0;
    for (let depth = 1; depth <= 4 && level.length; depth++) {
      const next = [];
      for (const d of level) {
        if (reads >= CAND_BUDGET) break; reads++; let ents = []; try { ents = await fsp.readdir(d.abs, { withFileTypes: true }); } catch { continue; }
        for (const e of ents) { if (!e.isDirectory() || BD.excludedDir(e.name)) continue; const rel = d.rel ? d.rel + '/' + e.name : e.name; dirs.push({ root: r.id, rel, name: e.name, depth, tracks: r.tracks }); if (!BD.folderNo(e.name) && depth < 4 && !/^\d{2}[-_ ]/.test(e.name)) next.push({ abs: path.join(d.abs, e.name), rel }); }
      }
      level = next;
    }
    CAND.set(r.id + '|' + r.path, { at: Date.now(), dirs }); return dirs;
  })();
  CAND.set(r.id + '|' + r.path, { at: 0, dirs: [], busy }); return busy;
}
async function candidates(ctx, project, q) {
  const list = roots(ctx.db); const all = [];
  for (const r of list) { try { all.push(...(await rootIndex(r))); } catch { } }
  const target = q ? { name: q, no: (String(q).match(/^\s*(\d{2,4})\b/) || [])[1] || '' } : project;
  return BD.scoreCandidates(target || {}, all, { track: project && project.track, min: 0.3, limit: 10 }).map(d => ({ root: d.root, rel: d.rel, name: d.name, score: d.score, why: d.why, display: displayPath(list, d.root, d.rel) }));
}

// ---- отдача файла из папки (потоком, с Range — pdf.js читает нужные страницы, не качая весь файл) ----
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
async function sendRaw(ctx, abs, name) {
  const { req, res } = ctx; let st; try { st = await fsp.stat(abs); } catch { return ctx.err(404, 'Файл не найден в папке'); } if (!st.isFile()) return ctx.err(404, 'Файл не найден');
  const ext = String(name).split('.').pop().toLowerCase(); const type = MIME[ext]; if (!type) return ctx.err(400, 'Тип файла не поддерживается');
  const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Last-Modified': st.mtime.toUTCString(), 'X-File-Size': String(st.size), 'X-File-Mtime': String(Math.round(st.mtimeMs)), 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}` };
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '')); let start = 0, end = st.size - 1, code = 200;
  if (m && (m[1] || m[2])) { if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(end, Number(m[2])); } else start = Math.max(0, st.size - Number(m[2])); if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); } code = 206; head['Content-Range'] = `bytes ${start}-${end}/${st.size}`; }
  head['Content-Length'] = end - start + 1; res.writeHead(code, head); if (req.method === 'HEAD') return res.end();
  const rs = fs.createReadStream(abs, { start, end }); rs.on('error', () => res.destroy()); rs.pipe(res);
}

// настоящий тип файла по первым байтам
const sniff = b => !b || b.length < 12 ? '' : b.subarray(0, 5).toString('latin1') === '%PDF-' ? 'pdf' : b.readUInt32BE(0) === 0x89504e47 ? 'png' : b.readUInt16BE(0) === 0xffd8 ? 'jpg' : b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' ? 'webp' : '';

module.exports = { sniff, DEFAULT_ROOTS, LIMITS, THUMB_MAX, RESCAN_MIN_MS, STALE_MS, cleanRoot, parseRootsEnv, roots, rootSource, parseUserPath, absOf, insideReal, displayPath, uncPath, fileId, thumbKey, thumbsDir, scanFolder, rescan, docOf, filesOut, linkedState, folderOut, findFile, candidates, sendRaw, SCANS };
