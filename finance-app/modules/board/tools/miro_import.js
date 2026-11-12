'use strict';
// Перенос доски Miro в нашу «Доску»: canvas-SVG Miro (инструмент canvas_read_as_svg коннектора Miro, области до 500 объектов) → наши boardItems.
// Только чтение Miro: SVG сохраняется в файл, скрипт его разбирает. Картинки: файл, скачанный по ссылке image_get_url, кладётся в --images-dir
// под именем miro-img-<miroId>.<png|jpg|webp|gif> — тогда он уедет на наш сервер вместе с объектом; иначе на его месте заглушка «картинка в Miro».
// Запуск из finance-app:
//   node modules/board/tools/miro_import.js --svg data-dev/board/board.svg [--svg ещё.svg] [--images-dir data-dev/board] --title "ЭП Маяк" --url https://miro.com/app/board/uXjV…=/
//        [--out data-dev/board/miro-import.json]            → JSON для «Доски → Импорт из Miro» (владелец/партнёр)
//        [--post http://127.0.0.1:3107 --cookie devrole=owner --project <pmProjectId> --chunk 200]  → сразу на сервер частями (POST /api/board/import)
// Координаты и размеры 1:1 (единицы Miro = наши единицы), цвета — ближайшие из нашей палитры, стрелки-коннекторы привязываются к объектам.
const fs = require('fs');
const path = require('path');
const BD = require('../domain');

const args = process.argv.slice(2); const opt = {}; const svgs = []; const boundsFiles = [];
for (let i = 0; i < args.length; i++) { const a = args[i]; if (a === '--svg') svgs.push(args[++i]); else if (a === '--bounds') boundsFiles.push(args[++i]); else if (a.startsWith('--')) { const k = a.slice(2); const v = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true'; opt[k] = v; } }
if (!svgs.length) { console.error('Укажите --svg <файл canvas-SVG Miro> (см. шапку скрипта)'); process.exit(1); }
// --bounds file.json (можно несколько): ответы canvas_search (overview / matches) — у картинок и документов в SVG нет размеров, берём их из scope
const BOUNDS = new Map();
const walkBounds = v => { if (Array.isArray(v)) return v.forEach(walkBounds); if (!v || typeof v !== 'object') return; if ((typeof v.id === 'string' || typeof v.id === 'number') && v.scope && typeof v.scope === 'object' && v.type !== 'spatial_region' && Number(v.scope.width) > 1 && Number(v.scope.height) > 1) BOUNDS.set(String(v.id).replace(/^m/, ''), { x: Number(v.scope.x), y: Number(v.scope.y), width: Number(v.scope.width), height: Number(v.scope.height) }); for (const k of Object.keys(v)) if (k !== 'scope') walkBounds(v[k]); };
for (const f of boundsFiles) { try { walkBounds(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch (e) { console.error(`--bounds ${f}: ${e.message}`); } }

// ---- разбор SVG (грамматика Miro регулярная: теги с атрибутами, textArea/text с телом) ----
const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };
const decode = s => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m));
const htmlText = html => decode(decode(String(html || '')).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p[^>]*>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
const attrs = s => { const o = {}; for (const m of String(s).matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) o[m[1]] = decode(m[2]); return o; };
// ячейка таблицы Miro: обычный HTML или JSON-дельта редактора ({"ops":[{"insert":"…"}]})
const cellText = html => { const t = htmlText(html); if (/^\s*[\[{]/.test(t)) { try { const parts = []; const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (typeof v.insert === 'string') parts.push(v.insert); else Object.values(v).forEach(walk); } }; walk(JSON.parse(t)); if (parts.length) return parts.join('').replace(/\n+$/, '').trim(); } catch (e) { /* не JSON — оставляем как есть */ } } return t; };
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
function tokens(svg) { // [{ tag, attrs, close, selfClose, body }]
  const out = []; const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g; let m;
  while ((m = re.exec(svg))) {
    const t = { tag: m[2], close: !!m[1], selfClose: !!m[4] || /^(rect|image|line|circle|ellipse|polygon|path)$/.test(m[2]) && false, attrs: attrs(m[3]), body: '' };
    if (!t.close && !m[4] && /^(textArea|text|foreignObject)$/.test(m[2])) { const end = svg.indexOf(`</${m[2]}>`, re.lastIndex); if (end > 0) { t.body = svg.slice(re.lastIndex, end); re.lastIndex = end + m[2].length + 3; } }
    out.push(t);
  }
  return out;
}

// ---- цвета ----
const PALETTE = Object.entries(BD.COLORS).filter(([k]) => k !== 'white').map(([k, hex]) => [k, hex.slice(1).match(/../g).map(x => parseInt(x, 16))]);
function nearestColor(hex) {
  const m = /^#?([0-9a-f]{6})/i.exec(String(hex || '')); if (!m) return 'gray'; const rgb = m[1].match(/../g).map(x => parseInt(x, 16));
  if (rgb.every(v => v > 238)) return 'white'; let best = 'gray', bd = Infinity;
  for (const [k, c] of PALETTE) { const d = (rgb[0] - c[0]) ** 2 + (rgb[1] - c[1]) ** 2 + (rgb[2] - c[2]) ** 2; if (d < bd) { bd = d; best = k; } }
  return best;
}
const STICKY = { light_yellow: 'yellow', yellow: 'yellow', orange: 'orange', light_green: 'green', green: 'green', dark_green: 'green', light_blue: 'blue', blue: 'blue', dark_blue: 'blue', cyan: 'blue', light_pink: 'pink', pink: 'pink', red: 'pink', violet: 'purple', purple: 'purple', gray: 'gray', black: 'gray', white: 'white' };
const sizeOf = px => { const v = Math.min(48, Math.max(12, num(px) || 16)); return BD.SIZES.reduce((b, s) => Math.abs(s - v) < Math.abs(b - v) ? s : b, 16); };
const localId = (a, fallback) => { const raw = a['data-miro-id'] || a.id || fallback; const id = String(raw || '').replace(/^m/, ''); return 'm' + id.replace(/[^\w-]/g, '').slice(0, 30); };

// ---- картинки: размеры из заголовка файла ----
function imageInfo(file) { // тип — по сигнатуре файла (расширение у скачанных из Miro файлов может не совпадать)
  const b = fs.readFileSync(file); if (b.length < 30) return null; let type = '';
  if (b.readUInt32BE(0) === 0x89504e47) type = 'image/png'; else if (b[0] === 0xff && b[1] === 0xd8) type = 'image/jpeg'; else if (b.subarray(0, 4).toString('latin1') === 'GIF8') type = 'image/gif'; else if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') type = 'image/webp';
  if (!type) return null; let w = 0, h = 0;
  if (type === 'image/png') { w = b.readUInt32BE(16); h = b.readUInt32BE(20); }
  else if (type === 'image/gif') { w = b.readUInt16LE(6); h = b.readUInt16LE(8); }
  else if (type === 'image/jpeg') { let i = 2; while (i + 9 < b.length) { if (b[i] !== 0xff) { i++; continue; } const mk = b[i + 1]; if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break; } i += 2 + b.readUInt16BE(i + 2); } }
  else if (type === 'image/webp') { const fmt = b.subarray(12, 16).toString('latin1'); if (fmt === 'VP8 ') { w = b.readUInt16LE(26) & 0x3fff; h = b.readUInt16LE(28) & 0x3fff; } else if (fmt === 'VP8L') { const bits = b.readUInt32LE(21); w = (bits & 0x3fff) + 1; h = ((bits >>> 14) & 0x3fff) + 1; } else if (fmt === 'VP8X') { w = 1 + b.readUIntLE(24, 3); h = 1 + b.readUIntLE(27, 3); } }
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[type];
  return { type, w, h, size: b.length, data: b.toString('base64'), name: path.basename(file, path.extname(file)) + '.' + ext };
}
function findImage(dir, miroId) { if (!dir || !fs.existsSync(dir)) return null; const f = fs.readdirSync(dir).find(n => n.startsWith('miro-img-' + miroId + '.')); return f ? imageInfo(path.join(dir, f)) : null; }

// ---- конвертация ----
function convert(svg, o) {
  const items = []; const rep = { sticky: 0, text: 0, frame: 0, rect: 0, arrow: 0, image: 0, imagePlaceholder: 0, divider: 0, table: 0, foreign: {}, skipped: {} }; const stack = []; let z = 1, fz = -1; const degen = new Set();
  const miroIdOf = a => String(a['data-miro-id'] || a.id || '').replace(/^m/, ''); const boundsOf = a => (o.bounds && o.bounds.get(miroIdOf(a))) || null;
  const off = () => stack.reduce((p, s) => ({ x: p.x + s.x, y: p.y + s.y }), { x: 0, y: 0 });
  const push = it => { items.push(Object.assign({ rot: 0 }, it)); };
  for (const t of tokens(svg)) {
    const a = t.attrs;
    if (t.tag === 'g') { if (t.close) { if (stack.length) stack.pop(); continue; } const m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(a.transform || ''); stack.push({ x: m ? num(m[1]) : 0, y: m ? num(m[2]) : 0, id: localId(a, 'g' + items.length), title: a['data-frame'] || '', open: !t.selfClose }); if (t.selfClose) stack.pop(); continue; }
    if (t.close) continue; const p = off(); const rot = num(a['data-rotation']);
    if (t.tag === 'rect' && a['data-type'] === 'frame') { const fr = stack[stack.length - 1] || { id: localId(a, 'f' + items.length), title: a['data-title'] || '' }; const title = (a['data-title'] || fr.title || 'Рамка').trim(); const color = a.fill && !/^#?f{6,8}$/i.test(a.fill) ? nearestColor(a.fill) : 'gray'; push({ id: fr.id, type: 'frame', x: p.x + num(a.x), y: p.y + num(a.y), w: num(a.width) || 100, h: num(a.height) || 100, z: fz--, props: { title, color } }); rep.frame++; continue; }
    if (t.tag === 'rect' && a['data-type'] === 'sticky') { const w = num(a.width) || 200, h = num(a.height) || 200; push({ id: localId(a, 's' + items.length), type: 'sticky', x: p.x + num(a.x), y: p.y + num(a.y), w, h, z: z++, rot, props: { text: htmlText(a['data-content']), color: STICKY[a['data-color']] || 'yellow', size: sizeOf(w / 10) } }); rep.sticky++; continue; }
    if (t.tag === 'rect' && a['data-type'] === 'foreign') {
      const wt = a['data-widget-type'] || 'foreign'; if (wt === 'paint') { rep.skipped.paint = (rep.skipped.paint || 0) + 1; continue; } // рисунки от руки не переносятся
      let x = p.x + num(a.x), y = p.y + num(a.y), w = num(a.width), h = num(a.height);
      const rb = String(a['data-rendered-bounds'] || '').match(/-?\d+(\.\d+)?/g); if ((!w || !h) && rb && rb.length >= 4) { x = p.x + num(rb[0]); y = p.y + num(rb[1]); w = num(rb[2]); h = num(rb[3]); }
      const bb = boundsOf(a); if ((!w || !h) && bb) { w = bb.width; h = bb.height; }
      if (wt === 'divider') { push({ id: localId(a, 'd' + items.length), type: 'arrow', x, y, w: 0, h: 0, z: z++, props: { from: '', to: '', x2: x + w, y2: y + h, head: false, text: '' } }); rep.divider++; continue; }
      rep.foreign[wt] = (rep.foreign[wt] || 0) + 1; const label = { data_table_format: 'Таблица из Miro — не переносится, смотрите исходную доску', card: 'Карточка Miro', app_card: 'Карточка приложения Miro', document: 'Документ Miro', embed: 'Встроенный объект Miro', mindmap: 'Интеллект-карта Miro', code: 'Код из Miro' }[wt] || `Объект Miro (${wt})`;
      push({ id: localId(a, 'x' + items.length), type: 'rect', x, y, w: Math.max(80, w || 300), h: Math.max(40, h || 120), z: z++, props: { text: label, color: 'gray', size: sizeOf((w || 300) / 20) } }); continue;
    }
    if (t.tag === 'rect' && a['data-type'] === 'custom-widget') { rep.skipped[a['data-widget-type'] || 'custom'] = (rep.skipped[a['data-widget-type'] || 'custom'] || 0) + 1; continue; }
    if (t.tag === 'foreignObject') { // таблицы Miro приходят как foreignObject data-type="table" с HTML-таблицей внутри → фигура с текстом таблицы
      const kind = a['data-type'] || 'foreignObject'; let x = num(a.x), y = num(a.y), w = num(a.width), h = num(a.height);
      const rb = String(a['data-rendered-bounds'] || '').match(/-?\d+(\.\d+)?/g); if ((!w || !h) && rb && rb.length >= 4) { x = num(rb[0]); y = num(rb[1]); w = num(rb[2]); h = num(rb[3]); }
      const bb = boundsOf(a); if ((!w || !h) && bb) { w = bb.width; h = bb.height; }
      if (kind === 'table') {
        const rows = []; for (const tr of String(t.body).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) { const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => cellText(c[1])); if (cells.some(Boolean)) rows.push(cells); }
        const title = a['data-title'] && !/^table view$/i.test(a['data-title']) ? a['data-title'] : ''; const text = [title, ...rows.map(r => r.join(' | '))].filter(Boolean).join('\n');
        push({ id: localId(a, 'tb' + items.length), type: 'rect', x: p.x + x, y: p.y + y, w: Math.max(200, w || 600), h: Math.max(80, h || 40 + rows.length * 28), z: z++, props: { text: text || 'Таблица Miro (пустая)', color: 'white', size: 14 } }); rep.table++; continue;
      }
      rep.foreign[kind] = (rep.foreign[kind] || 0) + 1; push({ id: localId(a, 'x' + items.length), type: 'rect', x: p.x + x, y: p.y + y, w: Math.max(80, w || 300), h: Math.max(40, h || 120), z: z++, props: { text: `Объект Miro (${kind})`, color: 'gray', size: 16 } }); continue;
    }
    if (t.tag === 'rect' || t.tag === 'circle' || t.tag === 'ellipse' || t.tag === 'polygon') { // фигуры
      let x, y, w, h;
      if (t.tag === 'rect') { x = num(a.x); y = num(a.y); w = num(a.width); h = num(a.height); }
      else if (t.tag === 'polygon') { const pts = String(a.points || '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite); const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1); x = Math.min(...xs); y = Math.min(...ys); w = Math.max(...xs) - x; h = Math.max(...ys) - y; }
      else { const rx = num(a.rx || a.r), ry = num(a.ry || a.r); x = num(a.cx) - rx; y = num(a.cy) - ry; w = rx * 2; h = ry * 2; }
      if (!(w > 0 && h > 0)) continue; const fill = String(a.fill || ''); const color = !fill || fill === 'none' ? 'white' : nearestColor(fill);
      push({ id: localId(a, 'r' + items.length), type: 'rect', x: p.x + x, y: p.y + y, w, h, z: z++, rot, props: { text: htmlText(a['data-content']), color, size: sizeOf(a['data-font-size'] || 16) } }); rep.rect++; continue;
    }
    if (t.tag === 'textArea' || t.tag === 'text') {
      const size = sizeOf(a['font-size'] || a['data-font-size'] || 20); const text = htmlText(t.body); if (!text) continue; const lines = text.split('\n').length;
      let x = num(a.x), y = num(a.y), w = num(a.width), h = num(a.height);
      if (t.tag === 'text') { const est = Math.max(...text.split('\n').map(l => l.length)) * size * 0.6; y = y - size; h = size * 1.35 * lines; w = w || est; if (a['text-anchor'] === 'middle') x -= w / 2; else if (a['text-anchor'] === 'end') x -= w; }
      if (!w) w = Math.max(120, Math.max(...text.split('\n').map(l => l.length)) * size * 0.6); if (!h) h = size * 1.35 * lines + 8;
      const fill = String(a.fill || ''); const color = fill && !/^#?(1a1a1a|000000|313131|595959)$/i.test(fill) && fill !== 'none' ? (nearestColor(fill) === 'white' ? '' : fill.toLowerCase()) : '';
      push({ id: localId(a, 't' + items.length), type: 'text', x: p.x + x, y: p.y + y, w, h, z: z++, rot, props: { text, size, color } }); rep.text++; continue;
    }
    if (t.tag === 'line') {
      const x1 = p.x + num(a.x1), y1 = p.y + num(a.y1), x2 = p.x + num(a.x2), y2 = p.y + num(a.y2); const arrow = a['data-arrow'] || ''; const from = a['data-start'] ? 'm' + String(a['data-start']).replace(/^m/, '') : '', to = a['data-end'] ? 'm' + String(a['data-end']).replace(/^m/, '') : '';
      const swap = arrow === 'start'; const id = localId(a, 'l' + items.length); if (Math.abs(num(a.x2) - num(a.x1)) <= 1 && Math.abs(num(a.y2) - num(a.y1)) <= 1) degen.add(id); // координат нет — только привязки
      push({ id, type: 'arrow', x: swap ? x2 : x1, y: swap ? y2 : y1, w: 0, h: 0, z: z++, props: { from: swap ? to : from, to: swap ? from : to, x2: swap ? x1 : x2, y2: swap ? y1 : y2, head: arrow !== '' && arrow !== 'none', text: htmlText(a['data-content']) } }); rep.arrow++; continue;
    }
    if (t.tag === 'image') {
      const miroId = miroIdOf(a); const img = findImage(o.imagesDir, miroId); let w = num(a.width), h = num(a.height); const bb = boundsOf(a); // в SVG размер картинки часто 0×0 — берём из scope поиска, иначе из файла
      if ((!w || !h) && bb) { w = bb.width; h = bb.height; }
      if (img) { if (!w || !h) { w = img.w || 400; h = img.h || 300; } else if (img.w && img.h && !bb && !h) { h = w * img.h / img.w; } push({ id: localId(a, 'i' + items.length), type: 'image', x: p.x + num(a.x), y: p.y + num(a.y), w, h, z: z++, props: { src: '', name: img.name }, file: { name: img.name, type: img.type, data: img.data } }); rep.image++; }
      else { push({ id: localId(a, 'i' + items.length), type: 'rect', x: p.x + num(a.x), y: p.y + num(a.y), w: w || 400, h: h || 300, z: z++, props: { text: 'Картинка в Miro (файл не перенесён)', color: 'gray', size: 20 } }); rep.imagePlaceholder++; }
      continue;
    }
    if (t.tag === 'path') { rep.skipped.path = (rep.skipped.path || 0) + 1; continue; }
    if (!/^(svg|defs|title|desc|foreignObject|div|p|span|br|b|i|u|s|strong|em|a)$/.test(t.tag)) rep.skipped[t.tag] = (rep.skipped[t.tag] || 0) + 1;
  }
  // стрелки на объекты, которых нет среди перенесённых — становятся свободными
  const ids = new Set(items.map(i => i.id)); for (const it of items) if (it.type === 'arrow') { if (it.props.from && !ids.has(it.props.from)) it.props.from = ''; if (it.props.to && !ids.has(it.props.to)) it.props.to = ''; }
  // коннектор без координат, у которого потерян хотя бы один конец (объект не перенесён), нарисовать нечем — пропускаем
  const drop = new Set(); for (const it of items) if (it.type === 'arrow' && degen.has(it.id) && (!it.props.from || !it.props.to)) drop.add(it.id);
  if (drop.size) { rep.skipped.connectorNoEnd = (rep.skipped.connectorNoEnd || 0) + drop.size; rep.arrow -= drop.size; }
  return { items: items.filter(i => !drop.has(i.id)), rep };
}

// ---- сборка и вывод ----
const all = new Map(); const report = {};
for (const f of svgs) { const { items, rep } = convert(fs.readFileSync(f, 'utf8'), { imagesDir: opt['images-dir'], bounds: BOUNDS }); for (const it of items) all.set(it.id, it); report[path.basename(f)] = rep; }
const items = [...all.values()]; const title = opt.title || 'Импорт из Miro'; const url = opt.url || '';
const summary = Object.values(report).reduce((s, r) => { for (const k of ['sticky', 'text', 'frame', 'rect', 'arrow', 'image', 'imagePlaceholder', 'divider', 'table']) s[k] = (s[k] || 0) + r[k]; for (const [k, v] of Object.entries(r.foreign)) s.foreign[k] = (s.foreign[k] || 0) + v; for (const [k, v] of Object.entries(r.skipped)) s.skipped[k] = (s.skipped[k] || 0) + v; return s; }, { foreign: {}, skipped: {} });
const foreignTotal = Object.values(summary.foreign).reduce((a, b) => a + b, 0); const imageBytes = items.reduce((s, it) => s + (it.file ? Math.round(it.file.data.length * 3 / 4) : 0), 0);
const out = { title, sourceUrl: url, pmProjectId: opt.project || '', pmProjectName: opt['project-name'] || '', generated: new Date().toISOString().slice(0, 19),
  summary: { objects: items.length, placeholders: foreignTotal + summary.imagePlaceholder, imagePlaceholders: summary.imagePlaceholder, widgetPlaceholders: foreignTotal, images: summary.image, tables: summary.table, imageBytes, bytes: 0, parts: 1 },
  items: items.map(it => { const c = Object.assign({}, it); if (c.file) c.file = { name: c.file.name, type: c.file.type, data: c.file.data }; return c; }), report };
// размер считаем по объектам, не собирая одну строку: у досок с сотнями картинок JSON > 500 МБ не помещается в строку V8 («Invalid string length»)
const itemBytes = out.items.map(c => Buffer.byteLength(JSON.stringify(c), 'utf8')); const headBytes = Buffer.byteLength(JSON.stringify(Object.assign({}, out, { items: [] }), null, 1), 'utf8');
out.summary.bytes = headBytes + itemBytes.reduce((a, b) => a + b + 2, 0);
const maxBytes = Math.max(16, Number(opt['max-mb']) || 120) * 1048576; // больше — режем на части <out>.partN.json; загрузчик (miro_upload.html) склеивает части по part.key в одну доску
const parts = []; { let cur = [], size = headBytes; for (let i = 0; i < out.items.length; i++) { if (cur.length && size + itemBytes[i] > maxBytes) { parts.push(cur); cur = []; size = headBytes; } cur.push(i); size += itemBytes[i] + 2; } if (cur.length || !parts.length) parts.push(cur); }
out.summary.parts = parts.length;
const mb = n => (n / 1048576).toFixed(n < 1048576 ? 2 : 1) + ' МБ';
console.log(`Объектов: ${items.length} — рамок ${summary.frame}, стикеров ${summary.sticky}, текстов ${summary.text}, фигур ${summary.rect}, таблиц ${summary.table}, линий и стрелок ${summary.arrow + summary.divider} (коннекторов ${summary.arrow}, разделителей ${summary.divider}), картинок ${summary.image}${summary.imagePlaceholder ? ` + заглушек ${summary.imagePlaceholder}` : ''}.`);
console.log(`Заглушек всего: ${out.summary.placeholders} (картинок без файла ${summary.imagePlaceholder}, виджетов Miro ${foreignTotal}). Размер JSON: ${mb(out.summary.bytes)}, из них картинки ${mb(imageBytes)}.`);
if (Object.keys(summary.foreign).length) console.log('Заглушки вместо виджетов Miro: ' + Object.entries(summary.foreign).map(([k, v]) => `${k} × ${v}`).join(', '));
if (Object.keys(summary.skipped).length) console.log('Пропущено: ' + Object.entries(summary.skipped).map(([k, v]) => `${k} × ${v}`).join(', '));
if (parts.length > 1) console.log(`Частей: ${parts.length} (каждая ≤ ${mb(maxBytes)}) — в загрузчике выберите все части, они соберутся в одну доску`);
if (opt.out) {
  const outDir = path.dirname(path.resolve(opt.out)); const base = path.basename(opt.out).replace(/\.json$/i, ''); const partRe = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.part\\d+\\.json$');
  for (const f of fs.readdirSync(outDir)) if (partRe.test(f)) fs.unlinkSync(path.join(outDir, f)); // старые части прошлой сборки
  if (parts.length === 1) { fs.writeFileSync(opt.out, JSON.stringify(out, null, 1), 'utf8'); console.log('JSON: ' + opt.out + ' — загрузите в «Доски → Импорт из Miro» или через tools/miro_upload.html (/api/board/import/page)'); }
  else {
    if (fs.existsSync(opt.out)) fs.unlinkSync(opt.out); const key = base + '|' + url; const names = [];
    parts.forEach((idx, k) => { const f = path.join(outDir, `${base}.part${k + 1}.json`); const p = Object.assign({}, out, { items: idx.map(i => out.items[i]), part: { key, index: k + 1, count: parts.length, objects: idx.length } }); if (k) delete p.report; fs.writeFileSync(f, JSON.stringify(p, null, 1), 'utf8'); names.push(path.basename(f)); });
    console.log('JSON по частям: ' + names.join(', ') + ' — в tools/miro_upload.html (/api/board/import/page) выберите все части сразу');
  }
}

if (opt.post) {
  (async () => {
    const base = opt.post.replace(/\/$/, ''); const chunk = Math.max(1, Math.min(500, Number(opt.chunk) || 200)); let boardId = ''; let added = 0;
    const call = async body => { const r = await fetch(base + '/api/board/import', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: opt.cookie || '' }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status)); return d; };
    const parts = []; for (let i = 0; i < items.length; i += chunk) parts.push(out.items.slice(i, i + chunk)); if (!parts.length) parts.push([]);
    for (const [i, part] of parts.entries()) { const d = await call({ boardId, title, pmProjectId: opt.project || '', sourceUrl: url, items: part, done: i === parts.length - 1 }); boardId = d.boardId; added += d.added; console.log(`часть ${i + 1}/${parts.length}: +${d.added} (всего на доске ${d.total})`); }
    console.log(`Готово: доска ${boardId}, перенесено ${added}. Открыть: ${base}/#/board?id=${boardId}`);
  })().catch(e => { console.error('Ошибка загрузки: ' + e.message); process.exit(1); });
}
