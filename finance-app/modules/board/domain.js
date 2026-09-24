/* Доска (board): типы объектов и их значения по умолчанию, права, проверка объектов, шаблон ЭП, геометрия (рамки, стрелки).
   Чистая логика без базы — Node (server.js) и браузер (window.MostBoard; ui.js добавляет туда embed и редактор). */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MostBoard = Object.assign(root.MostBoard || {}, factory());
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const TYPES = ['sticky', 'text', 'frame', 'rect', 'arrow', 'image', 'pdf'];
  // цвета стикеров и фигур (ключ → заливка); стикер — плотный цвет, рамка — лёгкая подложка
  const COLORS = { yellow: '#fff59d', green: '#c8e6c9', blue: '#bbdefb', pink: '#f8bbd0', orange: '#ffe0b2', purple: '#e1bee7', gray: '#eceff1', white: '#ffffff' };
  const COLOR_KEYS = Object.keys(COLORS);
  const SIZES = [12, 14, 16, 20, 24, 32, 48];
  const DEFAULTS = {
    sticky: { w: 200, h: 200, props: { text: '', color: 'yellow', size: 16 } },
    text: { w: 320, h: 44, props: { text: '', size: 20, color: '' } },
    frame: { w: 1000, h: 700, props: { title: 'Рамка', color: 'gray' } },
    rect: { w: 240, h: 140, props: { text: '', color: 'blue', size: 16 } },
    image: { w: 400, h: 300, props: { src: '', name: '' } },
    pdf: { w: 560, h: 400, props: { src: '', pdf: '', name: '', page: 1, pages: 1 } },
    arrow: { w: 0, h: 0, props: { from: '', to: '', x2: 0, y2: 0, head: true, text: '' } }, // x,y — начало (если from пуст), x2,y2 — конец (если to пуст)
  };
  const FILE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };
  const MAX_FILE = 20 * 1024 * 1024; // ядро принимает JSON до 32 МБ; base64 20 МБ ≈ 27 МБ
  const MAX_TEXT = 5000, MAX_TITLE = 200;
  const KEY_RE = /^[a-z0-9]+-[a-z0-9]+\.(png|jpg|webp|gif|pdf)$/;
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // ---- права. PM — modules/pm/domain.js (ctx.modules.pm.domain / window.MostPM), project — db.pmProjects ----
  const inList = (list, id) => Array.isArray(list) && list.includes(id);
  function canView(user, board, project, PM) {
    if (!user || !board) return false; if (board.ownerId === user.id || inList(board.members, user.id)) return true;
    if (board.pmProjectId) return !!(project && PM && PM.canOpen(user)); // доски проекта — тем, кто открывает проекты
    return false;
  }
  function canEdit(user, board, project, PM) {
    if (!user || !board) return false; if (board.ownerId === user.id || inList(board.members, user.id)) return true;
    if (board.pmProjectId) return !!(project && PM && PM.isManager(user, project)); // ПМ/ГИП проекта и руководители
    return false;
  }
  function canManage(user, board, project, PM) { // название, участники, удаление
    if (!user || !board) return false; if (board.ownerId === user.id) return true; if (PM && PM.isLeader(user)) return true;
    return !!(board.pmProjectId && project && PM && PM.isManager(user, project));
  }
  const canCreateProjectBoard = (user, project, PM) => !!(user && project && PM && PM.isManager(user, project));

  // ---- проверка объекта с клиента → чистый объект (или null) ----
  function cleanItem(raw, boardId) {
    if (!raw || typeof raw !== 'object' || !TYPES.includes(raw.type)) return null;
    const d = DEFAULTS[raw.type]; const p = raw.props && typeof raw.props === 'object' ? raw.props : {}; const props = {};
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, num(v)));
    const it = { id: String(raw.id || newId()).slice(0, 40), boardId, type: raw.type, x: clamp(raw.x, -1e6, 1e6), y: clamp(raw.y, -1e6, 1e6), w: clamp(raw.w == null ? d.w : raw.w, 0, 2e5), h: clamp(raw.h == null ? d.h : raw.h, 0, 2e5), z: clamp(raw.z, -1e6, 1e6), rot: clamp(raw.rot, -360, 360) };
    if (raw.type !== 'arrow') { it.w = Math.max(8, it.w); it.h = Math.max(8, it.h); }
    if ('text' in d.props) props.text = String(p.text == null ? '' : p.text).slice(0, MAX_TEXT);
    if ('title' in d.props) props.title = String(p.title == null ? d.props.title : p.title).slice(0, MAX_TITLE);
    if ('color' in d.props) props.color = COLOR_KEYS.includes(p.color) ? p.color : (/^#[0-9a-f]{6}$/i.test(String(p.color || '')) ? String(p.color).toLowerCase() : d.props.color);
    if ('size' in d.props) props.size = SIZES.includes(Number(p.size)) ? Number(p.size) : d.props.size;
    if ('src' in d.props) { props.src = KEY_RE.test(String(p.src || '')) ? String(p.src) : ''; props.name = String(p.name || '').slice(0, 200); }
    if ('pdf' in d.props) { props.pdf = KEY_RE.test(String(p.pdf || '')) ? String(p.pdf) : ''; props.page = Math.max(1, Math.round(num(p.page) || 1)); props.pages = Math.max(1, Math.round(num(p.pages) || 1)); }
    if (raw.type === 'arrow') { props.from = String(p.from || '').slice(0, 40); props.to = String(p.to || '').slice(0, 40); props.x2 = clamp(p.x2, -1e6, 1e6); props.y2 = clamp(p.y2, -1e6, 1e6); props.head = !(p.head === false || p.head === 'false' || p.head === 0); props.text = String(p.text || '').slice(0, 200); }
    if (p.group) props.group = String(p.group).slice(0, 40);
    if (p.locked) props.locked = true;
    it.props = props; return it;
  }

  // ---- геометрия ----
  const rectOf = it => ({ x: it.x, y: it.y, w: it.w, h: it.h });
  const center = it => ({ x: it.x + it.w / 2, y: it.y + it.h / 2 });
  const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const contains = (a, b) => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
  function bbox(items) { let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const it of items) { const r = it.type === 'arrow' ? arrowBox(it) : it; if (!r) continue; x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h); } return x1 === Infinity ? null : { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; }
  const arrowBox = it => { const x1 = Math.min(it.x, it.props.x2), y1 = Math.min(it.y, it.props.y2); return { x: x1, y: y1, w: Math.abs(it.props.x2 - it.x), h: Math.abs(it.props.y2 - it.y) }; };
  // точка на границе прямоугольника по лучу из центра к цели
  function anchor(r, to) {
    const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 }; const dx = to.x - c.x, dy = to.y - c.y; if (!dx && !dy) return c;
    const hw = r.w / 2, hh = r.h / 2; const sx = dx ? hw / Math.abs(dx) : Infinity, sy = dy ? hh / Math.abs(dy) : Infinity; const s = Math.min(sx, sy);
    return { x: c.x + dx * s, y: c.y + dy * s };
  }
  // концы стрелки с учётом привязок к объектам (get(id) → объект или null)
  function arrowEnds(it, get) {
    const a = it.props.from ? get(it.props.from) : null, b = it.props.to ? get(it.props.to) : null;
    let p1 = a ? center(a) : { x: it.x, y: it.y }, p2 = b ? center(b) : { x: it.props.x2, y: it.props.y2 };
    if (a) p1 = anchor(rectOf(a), p2); if (b) p2 = anchor(rectOf(b), p1);
    return { p1, p2 };
  }
  // объекты, целиком лежащие в рамке (двигаются вместе с ней)
  const insideFrame = (frame, items) => items.filter(it => it.id !== frame.id && it.type !== 'frame' && it.type !== 'arrow' && contains(rectOf(frame), rectOf(it)));
  const maxZ = items => items.reduce((m, it) => Math.max(m, num(it.z)), 0);
  // стрелки, привязанные к удаляемым объектам, отвязываются и остаются на месте (концы — в последних точках привязки)
  function detachArrows(items, deletedIds) {
    const del = new Set(deletedIds); const get = id => items.find(i => i.id === id) || null; const out = [];
    for (const it of items) {
      if (it.type !== 'arrow' || del.has(it.id) || !(del.has(it.props.from) || del.has(it.props.to))) continue;
      const { p1, p2 } = arrowEnds(it, get); const c = JSON.parse(JSON.stringify(it));
      if (del.has(c.props.from)) { c.props.from = ''; c.x = p1.x; c.y = p1.y; } if (del.has(c.props.to)) { c.props.to = ''; c.props.x2 = p2.x; c.props.y2 = p2.y; }
      out.push(c);
    }
    return out;
  }

  // ---- шаблон доски для ЭП: рамки разделов ----
  const EP_FRAMES = [
    ['ТЗ и исходные', 'Задание на проектирование, ИРД, АПЗ, топосъёмка, пожелания заказчика', 'blue'],
    ['Участок', 'Анализ участка: красные линии, сети, СЗЗ, рельеф, инсоляция', 'green'],
    ['Аналоги', 'Референсы и аналоги: планировки, фасады, благоустройство', 'yellow'],
    ['Концепция', 'Посадка, объёмы, планы, фасады — варианты и выбранное решение', 'orange'],
    ['Замечания заказчика', 'Замечания по циклам согласования и их статус', 'pink'],
    ['Решения', 'Принятые решения: что, когда, кем утверждено', 'purple'],
  ];
  function epTemplate(boardId, o) {
    o = o || {}; const W = 1400, H = 900, GAP = 120; const out = []; let z = 1;
    EP_FRAMES.forEach(([title, hint, color], i) => {
      const col = i % 3, row = Math.floor(i / 3); const x = col * (W + GAP), y = row * (H + GAP);
      out.push({ id: newId(), boardId, type: 'frame', x, y, w: W, h: H, z: z++, rot: 0, props: { title, color } });
      out.push({ id: newId(), boardId, type: 'sticky', x: x + 40, y: y + 80, w: 220, h: 160, z: 100 + z++, rot: 0, props: { text: hint, color: 'gray', size: 14 } });
    });
    if (o.title) out.push({ id: newId(), boardId, type: 'text', x: 0, y: -220, w: 1400, h: 70, z: 1000, rot: 0, props: { text: o.title, size: 48, color: '' } });
    return out;
  }

  // стрелки, чьи концы ссылаются на несуществующие объекты, отвязываются (координаты остаются последними известными)
  function repairArrows(items) {
    const ids = new Set(items.map(i => i.id)); const out = [];
    for (const it of items) { if (it.type !== 'arrow') continue; const bad = (it.props.from && !ids.has(it.props.from)) || (it.props.to && !ids.has(it.props.to)); if (!bad) continue; const c = JSON.parse(JSON.stringify(it)); if (c.props.from && !ids.has(c.props.from)) c.props.from = ''; if (c.props.to && !ids.has(c.props.to)) c.props.to = ''; out.push(c); }
    return out;
  }
  return { TYPES, COLORS, COLOR_KEYS, SIZES, DEFAULTS, FILE_TYPES, MAX_FILE, MAX_TEXT, MAX_TITLE, KEY_RE, newId, canView, canEdit, canManage, canCreateProjectBoard, cleanItem, rectOf, center, intersects, contains, bbox, arrowBox, anchor, arrowEnds, insideFrame, maxZ, detachArrows, repairArrows, EP_FRAMES, epTemplate, num };
});
