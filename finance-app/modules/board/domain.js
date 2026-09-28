/* Доска (board): типы объектов и их значения по умолчанию, права (v2: доступ для всех, режим «Кто правит»), проверка объектов,
   комментарии, шаблон ЭП, геометрия (рамки, стрелки), поиск. Чистая логика без базы — Node (server.js) и браузер (window.MostBoard;
   ui.js добавляет туда Editor и embed). */
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
  const MAX_TEXT = 5000, MAX_TITLE = 200, MAX_COMMENT = 3000;
  const KEY_RE = /^[a-z0-9]+-[a-z0-9]+\.(png|jpg|webp|gif|pdf)$/;
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // ---- права (v2, решение директора 25.09.2026): все активные пользователи видят и правят все доски; у доски режим «Кто правит» ----
  const EDIT_MODES = { all: 'Все пользователи', members: 'Участники доски', managers: 'Только руководители проекта' };
  const LEADERS = ['owner', 'partner'];
  const isLeader = (user, PM) => !!user && (PM ? PM.isLeader(user) : LEADERS.includes(user.role));
  const inList = (list, id) => Array.isArray(list) && list.includes(id);
  const editMode = board => (board && EDIT_MODES[board.editMode] ? board.editMode : 'all');
  // руководитель доски: владелец доски, ПМ/ГИП её проекта, owner/partner — правит при любом режиме, меняет настройки
  const isBoardManager = (user, board, project, PM) => !!user && !!board && (board.ownerId === user.id || isLeader(user, PM) || !!(project && PM && PM.isManager(user, project)));
  const canView = user => !!user && !!user.role;
  function canEdit(user, board, project, PM) {
    if (!canView(user) || !board) return false; if (isBoardManager(user, board, project, PM)) return true;
    const m = editMode(board); return m === 'all' || (m === 'members' && inList(board.members, user.id));
  }
  const canManage = (user, board, project, PM) => isBoardManager(user, board, project, PM); // название, проект, участники, режим
  const canDelete = (user, board, PM) => !!user && !!board && (board.ownerId === user.id || isLeader(user, PM));
  const canComment = user => canView(user);
  const canCreateProjectBoard = (user, project) => canView(user) && !!project; // v2: доски создаёт любой пользователь

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
    // связь с файлом в папке проекта (материалы): корень + путь от корня + версия файла на момент размещения
    if ((raw.type === 'image' || raw.type === 'pdf') && p.srcPath) { const rel = cleanRel(p.srcPath); if (rel && ROOT_ID_RE.test(String(p.srcRoot || ''))) { props.srcRoot = String(p.srcRoot); props.srcPath = rel.slice(0, 1000); props.srcSize = Math.max(0, Math.round(num(p.srcSize))); props.srcMtime = Math.max(0, Math.round(num(p.srcMtime))); } }
    if (raw.type === 'frame' && MAT_CAT_IDS.includes(p.matCat)) props.matCat = p.matCat; // рамка-категория «Разложить всё»
    it.props = props; return it;
  }
  // комментарий с клиента → чистый (текст обязателен)
  function cleanComment(raw, boardId) {
    if (!raw || typeof raw !== 'object') return null; const text = String(raw.text == null ? '' : raw.text).trim().slice(0, MAX_COMMENT); if (!text) return null;
    const clamp = v => Math.min(1e6, Math.max(-1e6, num(v)));
    return { boardId, itemId: String(raw.itemId || '').slice(0, 40), x: clamp(raw.x), y: clamp(raw.y), text, parentId: String(raw.parentId || '').slice(0, 40) };
  }
  // ветки: корни (parentId пуст) с ответами, нерешённые первыми, новые сверху
  function threads(comments) {
    const roots = comments.filter(c => !c.deleted && !c.parentId); const by = new Map(roots.map(r => [r.id, Object.assign({}, r, { replies: [] })]));
    for (const c of comments) if (!c.deleted && c.parentId && by.has(c.parentId)) by.get(c.parentId).replies.push(c);
    const out = [...by.values()]; for (const t of out) t.replies.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return out.sort((a, b) => (a.resolved ? 1 : 0) - (b.resolved ? 1 : 0) || String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  const openComments = comments => comments.filter(c => !c.deleted && !c.parentId && !c.resolved).length;
  // точка маркера комментария: у объекта — правый верхний угол, у места — само место
  const commentAnchor = (c, get) => { const it = c.itemId ? get(c.itemId) : null; if (!it) return { x: c.x, y: c.y }; if (it.type === 'arrow') return { x: (it.x + it.props.x2) / 2, y: (it.y + it.props.y2) / 2 }; return { x: it.x + it.w, y: it.y }; };

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
  // объекты, целиком лежащие в рамке (двигаются вместе с ней, попадают в экспорт рамки)
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
  // стрелки, чьи концы ссылаются на несуществующие объекты, отвязываются (координаты остаются последними известными)
  function repairArrows(items) {
    const ids = new Set(items.map(i => i.id)); const out = [];
    for (const it of items) { if (it.type !== 'arrow') continue; const bad = (it.props.from && !ids.has(it.props.from)) || (it.props.to && !ids.has(it.props.to)); if (!bad) continue; const c = JSON.parse(JSON.stringify(it)); if (c.props.from && !ids.has(c.props.from)) c.props.from = ''; if (c.props.to && !ids.has(c.props.to)) c.props.to = ''; out.push(c); }
    return out;
  }
  // текст объекта для поиска и подписей
  const itemText = it => !it ? '' : it.type === 'frame' ? it.props.title || '' : it.type === 'image' || it.type === 'pdf' ? it.props.name || '' : it.props.text || '';
  const itemLabel = it => { const t = itemText(it).replace(/\s+/g, ' ').trim(); const kind = { sticky: 'Стикер', text: 'Текст', frame: 'Рамка', rect: 'Фигура', arrow: 'Стрелка', image: 'Картинка', pdf: 'PDF' }[it.type] || ''; return t ? `${kind}: ${t.length > 40 ? t.slice(0, 39) + '…' : t}` : kind; };
  function search(items, q) { q = String(q || '').trim().toLowerCase(); if (!q) return []; return items.filter(it => itemText(it).toLowerCase().includes(q)).sort((a, b) => a.y - b.y || a.x - b.x); }

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

  // ---- материалы из папки проекта (сетевые диски): пути, категории, исключения, подбор папки, раскладка ----
  const ROOT_ID_RE = /^[a-z0-9]{1,12}$/;
  const MAT_EXT = { jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', pdf: 'pdf' };
  const MAT_CATS = [['render', 'Рендеры', 'orange'], ['ref', 'Референсы', 'yellow'], ['present', 'Презентации / PDF', 'blue'], ['docs', 'ИРД / Документы', 'green'], ['other', 'Прочее', 'gray']];
  const MAT_CAT_IDS = MAT_CATS.map(c => c[0]);
  const MAT_LABEL = Object.fromEntries(MAT_CATS.map(c => [c[0], c[1]]));
  // путь внутри корня: прямые слэши, без пустых и «.»; «..», NUL, «:» (диск / поток NTFS) и управляющие символы — отказ (null)
  function cleanRel(s) {
    s = String(s == null ? '' : s); if (s.length > 1000 || /[\x00-\x1f]/.test(s)) return null;
    const segs = s.replace(/\\/g, '/').split('/').map(x => x.trim()).filter(x => x && x !== '.');
    if (segs.some(x => x.includes(':') || /^\.+$/.test(x))) return null;
    return segs.join('/');
  }
  const low = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
  // границы слова для кириллицы (\b в JS её не понимает)
  const word = stems => new RegExp(`(^|[^a-zа-я0-9])(${stems})([^a-zа-я]|$)`);
  const CAT_RULES = [
    ['render', /render|рендер|визуал|visual|cgi|ракурс|(^|[^a-z])viz([^a-z]|$)/],
    ['ref', /refer|референс|аналог|analog|inspir|moodboard|мудборд|примеры/],
    ['present', /презент|present|градсовет|альбом|буклет|(^|[^a-zа-я])pdf([^a-zа-я]|$)/],
    ['docs', /исходн|задани|госакт|гос акт|техусл|договор|документ|топосъем|топо съем/],
    ['docs', word('ирд|ird|апз|ту|docs?|топо')],
  ];
  const catOf = name => { const s = low(name); for (const [cat, re] of CAT_RULES) if (re.test(s)) return cat; return ''; };
  // категория файла: по папкам сверху вниз (раздел проекта «04-Render», «05-Reference»…), затем по имени файла; PDF без подсказок — «Презентации / PDF»
  function matCategory(rel) {
    const segs = String(rel || '').split('/'); const name = segs.pop();
    for (const d of segs) { const c = catOf(d); if (c) return c; }
    const c = catOf(name.replace(/\.[^.]+$/, '')); if (c) return c;
    return /\.pdf$/i.test(name) ? 'present' : 'other';
  }
  const matKind = name => MAT_EXT[String(name || '').split('.').pop().toLowerCase()] || '';
  // что не сканируем: служебные папки (textures, maps, backup, AutoSave, корзины Synology/Windows, скрытые) и файлы (Thumbs.db, ~$, скрытые)
  const EXCL_DIR = word('textures?|текстур[а-я]*|maps?|backups?|бэкап[а-я]*|autosave|thumbs?|@eadir|#recycle|\\$recycle\\.bin');
  const excludedDir = name => { const n = low(name); return !n || /^[.#@$~]/.test(n) || EXCL_DIR.test(n); };
  const excludedFile = name => { const n = low(name); return !n || /^[.~]/.test(n) || n === 'thumbs.db' || n === 'desktop.ini' || !matKind(n); };

  // подбор папки проекта: номер (NNN-ГГГГ-…) и слова названия; редкие слова весят больше частых («Эверест» — у многих)
  // слова сравниваются в латинице: «Эверест Парк» находит «Everest park», «Хаят» — «HAYAT»
  const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', қ: 'k', ғ: 'g', ү: 'u', ұ: 'u', ә: 'a', ө: 'o', һ: 'h', і: 'i', ң: 'n' };
  const latin = t => t.replace(/[а-яқғүұәөһің]/g, ch => TR[ch] !== undefined ? TR[ch] : ch);
  const tokens = s => (low(s).match(/[a-zа-яқғүұәөһің0-9]+/g) || []).filter(t => t.length >= 3 && !/^\d+$/.test(t) && !/^(очередь|оч|жк|эп|рп)$/.test(t)).map(latin);
  const stem = t => t.slice(0, Math.max(4, Math.min(6, t.length - 1)));
  const folderNo = name => { const m = String(name || '').match(/^(\d{2,4})[-_ .]/); return m ? Number(m[1]) : null; };
  function scoreCandidates(project, dirs, o) {
    o = o || {}; const pno = project && project.no ? Number(String(project.no).replace(/\D/g, '')) || null : null; const pt = [...new Set(tokens(project && project.name).map(stem))];
    const df = new Map(); const dirStems = dirs.map(d => { const s = new Set(tokens(d.name).map(stem)); for (const t of s) df.set(t, (df.get(t) || 0) + 1); return s; });
    const hit = (s, t) => s.has(t) || [...s].some(x => x.startsWith(t) || t.startsWith(x));
    const out = [];
    dirs.forEach((d, i) => {
      let score = 0; const why = [];
      if (pno && folderNo(d.name) === pno) { score += 1; why.push('номер'); }
      if (pt.length) { let w = 0, tot = 0; for (const t of pt) { const wt = 1 / Math.log2(2 + (df.get(t) || 0)); tot += wt; if (hit(dirStems[i], t)) w += wt; } if (w) { score += 0.9 * w / tot; why.push('название'); } }
      if (score && o.track && d.tracks && d.tracks.includes(o.track)) score += 0.05;
      if (score >= (o.min || 0.3)) out.push(Object.assign({}, d, { score: Math.round(score * 100) / 100, why }));
    });
    return out.sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name), 'ru')).slice(0, o.limit || 8);
  }

  // «Разложить всё»: рамки-категории (props.matCat) и сетка ячеек; файлы, уже лежащие на доске (props.srcRoot:srcPath), пропускаются,
  // существующие рамки дополняются в свободные ячейки (рамка растёт вниз), новые рамки — ниже содержимого доски слева направо
  const LAYOUT = { cellW: 440, cellH: 380, imgW: 400, imgH: 300, pad: 50, gap: 240, maxCols: 6, maxPlace: 150 };
  const linkKey = (root, rel) => `${root}:${rel}`;
  function layoutPlan(files, items, o) {
    o = Object.assign({}, LAYOUT, o || {}); const live = (items || []).filter(it => !it.deleted);
    const onBoard = new Set(live.filter(it => (it.type === 'image' || it.type === 'pdf') && it.props && it.props.srcPath).map(it => linkKey(it.props.srcRoot, it.props.srcPath)));
    const todo = files.filter(f => !onBoard.has(linkKey(f.root, f.path)));
    const box = bbox(live); let nx = box ? box.x : 0; const ny = box ? box.y + box.h + 300 : 0;
    const frames = []; const places = []; let left = o.maxPlace; let z = live.reduce((m, it) => Math.min(m, num(it.z)), 0);
    for (const [cat, title, color] of MAT_CATS) {
      const list = todo.filter(f => f.cat === cat).slice(0, Math.max(0, left)); if (!list.length) continue; left -= list.length;
      let fr = live.find(it => it.type === 'frame' && it.props.matCat === cat); let op = 'grow';
      if (!fr) { const cols = Math.max(2, Math.min(o.maxCols, Math.ceil(Math.sqrt(list.length * 1.6)))); fr = { id: newId(), type: 'frame', x: nx, y: ny, w: o.pad * 2 + cols * o.cellW - (o.cellW - o.imgW), h: o.pad * 2 + o.cellH, z: --z, rot: 0, props: { title, color, matCat: cat } }; op = 'create'; nx += fr.w + o.gap; }
      else fr = JSON.parse(JSON.stringify(fr));
      const cols = Math.max(1, Math.floor((fr.w - o.pad * 2 + (o.cellW - o.imgW)) / o.cellW));
      const others = live.filter(it => it.id !== fr.id && it.type !== 'frame' && it.type !== 'arrow');
      let i = 0; let maxY = fr.y + fr.h;
      for (const f of list) {
        for (; ; i++) { const cell = { x: fr.x + o.pad + (i % cols) * o.cellW, y: fr.y + o.pad + Math.floor(i / cols) * o.cellH, w: o.imgW, h: o.cellH - 20 }; if (i > 5000 || !others.some(it => intersects(cell, rectOf(it)))) { places.push({ f: f.f, cat, frameId: fr.id, x: cell.x, y: cell.y, w: o.imgW, h: o.imgH, labelY: cell.y + o.imgH + 6 }); maxY = Math.max(maxY, cell.y + o.cellH + o.pad - 20); i++; break; } }
      }
      if (op === 'create') { fr.h = Math.max(fr.h, maxY - fr.y); frames.push({ op, item: fr }); } else if (maxY > fr.y + fr.h) { fr.h = maxY - fr.y; frames.push({ op, item: fr }); }
    }
    return { frames, places, skipped: files.length - todo.length, rest: Math.max(0, todo.length - places.length) };
  }
  // вписать картинку (w×h) в ячейку cw×ch с сохранением пропорций
  const fitBox = (w, h, cw, ch) => { w = num(w) || cw; h = num(h) || ch; const k = Math.min(cw / w, ch / h); return { w: Math.max(8, Math.round(w * k)), h: Math.max(8, Math.round(h * k)) }; };

  return { TYPES, COLORS, COLOR_KEYS, SIZES, DEFAULTS, FILE_TYPES, MAX_FILE, MAX_TEXT, MAX_TITLE, MAX_COMMENT, KEY_RE, newId, EDIT_MODES, LEADERS, isLeader, editMode, isBoardManager, canView, canEdit, canManage, canDelete, canComment, canCreateProjectBoard,
    cleanItem, cleanComment, threads, openComments, commentAnchor, rectOf, center, intersects, contains, bbox, arrowBox, anchor, arrowEnds, insideFrame, maxZ, detachArrows, repairArrows, itemText, itemLabel, search, EP_FRAMES, epTemplate, num,
    ROOT_ID_RE, MAT_EXT, MAT_CATS, MAT_CAT_IDS, MAT_LABEL, cleanRel, matCategory, matKind, excludedDir, excludedFile, tokens, folderNo, scoreCandidates, LAYOUT, linkKey, layoutPlan, fitBox };
});
