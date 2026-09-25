/* Модуль «Доска» — экраны и редактор (v2). Поток G. Помощники интерфейса приходят в init(ui) (см. docs/ARCHITECTURE.md).
   Логика — modules/board/domain.js (window.MostBoard: типы, права, геометрия, комментарии); здесь добавляются MostBoard.Editor и MostBoard.embed.
   Редактор: DOM-объекты в мире с transform (translate + scale), стрелки в SVG, выделение и рамка выбора, отмена/повтор, операции на сервер
   пакетами; опрос раз в секунду — изменения объектов и комментариев, присутствие с курсорами коллег. Экспорт PNG/PDF рисуется на canvas
   в браузере (PDF — jsPDF с cdnjs). Данные — только /api/board/*. */
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'board',
  title: 'Доска',
  nav: [{ id: 'boards', label: 'Доски', icon: '▦' }],
  routes: ['board'], // доска на весь экран: #/board?id=…
  canOpen: u => !!u,
  help: [
    ['Что такое «Доска»', `
<p>Своя доска вместо Miro: бесконечный холст со стикерами, текстом, рамками разделов, стрелками, картинками и листами PDF. Данные и файлы лежат на нашем сервере. Доску видят и правят все пользователи ERP; доска может быть привязана к проекту из «Проектов» или быть свободной.</p>
<ul>
<li><b>Кто правит</b> — настройка доски: все пользователи (по умолчанию), участники доски или только руководители проекта (ПМ/ГИП проекта, владелец доски, владелец и партнёр компании правят всегда). Настройки меняют владелец доски, ПМ/ГИП проекта, владелец и партнёр; удаляют доску владелец доски, владелец и партнёр. Остальным закрытая доска открыта на просмотр, комментировать могут все.</li>
<li>Совместная работа: изменения сохраняются автоматически и раз в секунду приходят коллегам; на доске видны их курсоры с именами и выделенные ими объекты; вверху — кто сейчас на доске. Если два человека двигают один объект — остаётся последнее изменение.</li>
<li>Наведите мышь на объект — подсказка покажет, кто и когда менял его последним.</li>
</ul>`],
    ['Доски', `
<ol>
<li><b>+ Доска</b> — новая доска: название, проект (или свободная), «Кто правит», участники, для ЭП — шаблон. <b>+ Из шаблона ЭП</b> — сразу с рамками «ТЗ и исходные», «Участок», «Аналоги», «Концепция», «Замечания заказчика», «Решения» (шаблон только для эскизных проектов и свободных досок).</li>
<li>Поиск по названию и проекту, фильтр по проекту, «мои» — где вы владелец или участник. Столбцы: объектов, нерешённых комментариев, кто на доске сейчас.</li>
<li>⚙ — название, проект, «Кто правит», участники, удаление (по правам).</li>
<li><b>⇪ Импорт из Miro</b> (владелец и партнёр) — перенос доски Miro: JSON готовит <code>node modules/board/tools/miro_import.js</code> из canvas-SVG доски (коннектор Miro, только чтение): стикеры, тексты, рамки, фигуры, коннекторы с привязкой, разделители, картинки (если файл скачан рядом); таблицы, рисунки от руки и приложения не переносятся — на их месте заглушки или пусто. У перенесённой доски в шапке ссылка «Источник: Miro».</li>
</ol>`, 'boards'],
    ['Работа на доске', `
<ul>
<li><b>Холст</b>: колесо мыши — масштаб к курсору, два пальца на тачпаде — перемещение, щипок — масштаб; пробел + мышь или инструмент «Рука» — перемещение; на телефоне один палец — перемещение, два — масштаб. Внизу справа: − / 100 % / + / ⤢ (показать всё) / ▦ (мини-карта: щелчок по ней переносит взгляд).</li>
<li><b>Инструменты</b> слева (клавиши): выбор (V), рука (H), стикер (N), текст (T), рамка (F), фигура (R), стрелка (A), картинка / PDF (I), комментарий (C). Щёлкните по холсту — объект появится и сразу откроется для ввода текста. Стрелку тяните от объекта к объекту — она привяжется и будет следовать за ними.</li>
<li><b>Правка</b>: двойной щелчок — текст (у рамки — заголовок), Esc или Ctrl+Enter — готово. Выделение щелчком, Shift — добавить, рамкой — протянуть по пустому месту. Маркеры по краям — размер (картинки пропорционально, Shift — свободно). Перетаскивание рамки переносит всё, что внутри.</li>
<li><b>Клавиши</b>: Delete — удалить, Ctrl+Z / Ctrl+Y — отмена / повтор, Ctrl+C / Ctrl+V — копировать / вставить (картинка из буфера тоже), Ctrl+D — дублировать, Ctrl+A — всё, Ctrl+G / Ctrl+Shift+G — группа, стрелки — сдвиг, Ctrl+F — поиск по доске, Esc — снять выделение.</li>
<li><b>Комментарии</b>: инструмент «Комментарий» и щелчок по объекту или месту, либо 💬 в панели выделенного объекта. Маркер 💬 на доске открывает ветку: ответы, «Решено», удаление своего. Кнопка 💬 в шапке — список веток (нерешённые первыми), число — сколько не решено.</li>
<li><b>Файлы</b>: перетащите JPG/PNG/WebP/GIF/PDF на холст или нажмите «Картинка / PDF». У PDF выберите страницы («1» или «1-3,5») — каждая ляжет отдельным листом, оригинал хранится на сервере («PDF ↗»). Лимит файла — 20 МБ.</li>
<li><b>Экспорт</b> (⤓ в шапке): вся доска или выделенная рамка с содержимым — в PNG или PDF, рисуется в браузере.</li>
<li><b>Поиск</b> (Ctrl+F): по тексту стикеров, фигур, заголовкам рамок и именам файлов; Enter или ↓ — к следующему совпадению.</li>
</ul>`, 'board'],
  ],
  onNav(ui, id) { if (id !== 'board') document.body.classList.remove('bd-full'); },
  init(ui) {
    const BD = window.MostBoard; const { esc, api, fdate, toast, modal, formHtml, tbl, empty, chip, sel, head, bind, params, route, qsOf, $ } = ui;
    if (!document.getElementById('bd-style')) document.head.insertAdjacentHTML('beforeend', `<style id="bd-style">
.bd-root{position:relative;display:flex;flex-direction:column;background:var(--paper);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;height:70vh;min-height:420px}
.bd-root.full{position:fixed;inset:0;z-index:30;border:0;border-radius:0;height:auto;min-height:0}
.bd-top{display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--panel);border-bottom:1px solid var(--line);flex-wrap:wrap;min-height:44px}
.bd-top .bd-title{font-weight:700;font-size:15px;cursor:text;padding:2px 6px;border-radius:6px;max-width:34vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bd-top .bd-title:hover{background:var(--panel-2)}.bd-top .grow{flex:1}.bd-top .faint{white-space:nowrap}
.bd-top .btn.sm{padding:4px 9px}.bd-top .bd-ic{width:32px;height:32px;border:1px solid var(--line-strong);background:var(--panel);border-radius:8px;cursor:pointer;font-size:15px;display:inline-grid;place-items:center;position:relative}.bd-top .bd-ic:hover{background:var(--panel-2)}.bd-top .bd-ic.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.bd-cmn{position:absolute;top:-6px;right:-6px;background:var(--accent);color:#fff;font-size:10px;font-weight:700;border-radius:999px;padding:0 5px;line-height:15px}.bd-cmn:empty{display:none}
.bd-find{display:inline-flex;align-items:center;gap:2px}.bd-find input{width:180px;padding:5px 8px;font-size:13px}.bd-find .n{font-size:11px;color:var(--ink-faint);min-width:36px;text-align:center}.bd-find button{width:26px;height:28px;border:0;background:transparent;cursor:pointer;color:var(--ink-soft);border-radius:6px}.bd-find button:hover{background:var(--panel-2)}
.bd-pres{display:flex;gap:2px;align-items:center}.bd-av{width:26px;height:26px;border-radius:50%;display:inline-grid;place-items:center;font-size:11px;font-weight:700;color:#fff;border:2px solid var(--panel)}
.bd-status{font-size:12px;color:var(--ink-faint);white-space:nowrap}.bd-status.err{color:var(--crit)}
.bd-menu{position:absolute;right:0;top:36px;z-index:9;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow);padding:4px;min-width:200px;display:flex;flex-direction:column}.bd-menu button{text-align:left;border:0;background:transparent;padding:8px 12px;border-radius:6px;cursor:pointer;font:inherit;color:var(--ink);white-space:nowrap}.bd-menu button:hover{background:var(--panel-2)}.bd-menu button:disabled{opacity:.4;cursor:default}.bd-exp{position:relative}
.bd-main{position:relative;flex:1;min-height:0}
.bd-tools{position:absolute;left:10px;top:10px;z-index:5;display:flex;flex-direction:column;gap:4px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:4px;box-shadow:var(--shadow)}
.bd-tools button,.bd-zoom button,.bd-ctx button{width:36px;height:36px;border:0;background:transparent;border-radius:8px;cursor:pointer;font-size:16px;display:grid;place-items:center;color:var(--ink)}.bd-tools button:hover,.bd-zoom button:hover,.bd-ctx button:hover{background:var(--panel-2)}.bd-tools button.on,.bd-zoom button.on{background:var(--accent);color:#fff}.bd-tools button:disabled{opacity:.35;cursor:default}
.bd-zoom{position:absolute;right:10px;bottom:10px;z-index:5;display:flex;gap:2px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:2px;box-shadow:var(--shadow)}.bd-zoom span{font-size:12px;min-width:44px;text-align:center;font-variant-numeric:tabular-nums}
.bd-mini{position:absolute;left:10px;bottom:10px;z-index:5;width:200px;height:140px;border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow);cursor:crosshair;background:var(--panel)}
.bd-vp{position:absolute;inset:0;overflow:hidden;touch-action:none;cursor:default;background:var(--paper);background-image:radial-gradient(var(--line-strong) 1px,transparent 1px);background-size:24px 24px;user-select:none;-webkit-user-select:none}.bd-vp.hand{cursor:grab}.bd-vp.hand.panning{cursor:grabbing}.bd-vp.create{cursor:crosshair}.bd-vp.comment{cursor:help}.bd-vp.drop{outline:3px dashed var(--accent);outline-offset:-3px}
.bd-world{position:absolute;left:0;top:0;transform-origin:0 0;width:0;height:0}
.bd-layer{position:absolute;left:0;top:0;width:0;height:0}
.bd-it{position:absolute;left:0;top:0;box-sizing:border-box;transform-origin:0 0}
.bd-txt{white-space:pre-wrap;word-wrap:break-word;overflow:hidden;line-height:1.3;width:100%;height:100%;padding:10px;font-family:inherit;color:#111}
.bd-sticky{box-shadow:0 2px 6px rgba(0,0,0,.18);border-radius:4px}.bd-sticky .bd-txt{display:flex;align-items:flex-start}
.bd-text .bd-txt{padding:4px 6px;color:var(--ink)}.bd-text{background:transparent}.bd-text.empty{outline:1px dashed var(--line-strong)}
.bd-rect{border:2px solid rgba(0,0,0,.25);border-radius:8px}.bd-rect .bd-txt{display:grid;place-items:center;text-align:center}
.bd-frame{border:2px solid rgba(0,0,0,.18);border-radius:6px;background:rgba(0,0,0,.02)}.bd-ftitle{position:absolute;left:0;top:0;transform:translateY(-100%);padding:2px 10px;font-weight:700;font-size:max(18px,calc(13px / var(--z,1)));line-height:1.3;color:#111;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;border-radius:6px 6px 0 0}
.bd-img{background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.18)}.bd-img img{width:100%;height:100%;object-fit:fill;display:block;pointer-events:none}.bd-badge{position:absolute;left:6px;bottom:6px;font-size:11px;background:rgba(0,0,0,.6);color:#fff;padding:1px 6px;border-radius:999px}
.bd-it.sel{outline:calc(2px / var(--z,1)) solid var(--accent);outline-offset:calc(1px / var(--z,1))}.bd-it.locked{opacity:.85}.bd-it.found{outline:calc(3px / var(--z,1)) dashed #f9a825;outline-offset:calc(2px / var(--z,1))}
.bd-svg{position:absolute;left:0;top:0;overflow:visible;width:1px;height:1px}.bd-svg path.line{fill:none;stroke:#37474f;stroke-width:3;stroke-linecap:round}.bd-svg path.line.sel{stroke:var(--accent)}.bd-svg path.hit{fill:none;stroke:transparent;stroke-width:16;cursor:pointer}.bd-svg text{font-size:14px;fill:#37474f;paint-order:stroke;stroke:var(--paper);stroke-width:4px}
.bd-sel{position:absolute;left:0;top:0;pointer-events:none;border:calc(1px / var(--z,1)) dashed var(--accent)}.bd-h{position:absolute;width:calc(10px / var(--z,1));height:calc(10px / var(--z,1));margin:calc(-5px / var(--z,1)) 0 0 calc(-5px / var(--z,1));background:#fff;border:calc(1.5px / var(--z,1)) solid var(--accent);border-radius:2px;pointer-events:all}
.bd-h.nw,.bd-h.se{cursor:nwse-resize}.bd-h.ne,.bd-h.sw{cursor:nesw-resize}.bd-h.n,.bd-h.s{cursor:ns-resize}.bd-h.e,.bd-h.w{cursor:ew-resize}
.bd-band{position:absolute;border:1px solid var(--accent);background:rgba(255,77,35,.08);pointer-events:none}
.bd-edit{position:absolute;left:0;top:0;box-sizing:border-box;border:0;outline:calc(2px / var(--z,1)) solid var(--accent);resize:none;background:transparent;font-family:inherit;line-height:1.3;padding:10px;color:#111;overflow:hidden;border-radius:4px}.bd-edit.text{padding:4px 6px;color:var(--ink)}.bd-edit.title{padding:2px 10px;font-weight:700;white-space:nowrap}
.bd-ctx{position:absolute;z-index:6;display:flex;gap:2px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:2px 4px;box-shadow:var(--shadow);white-space:nowrap}.bd-ctx button{width:30px;height:30px;font-size:14px}.bd-ctx .sw{width:18px;height:18px;border-radius:50%;border:1px solid rgba(0,0,0,.2);cursor:pointer;margin:0 2px}.bd-ctx .sw.on{outline:2px solid var(--accent);outline-offset:1px}.bd-ctx .sep{width:1px;height:22px;background:var(--line);margin:0 4px}.bd-ctx select{width:auto;padding:3px 4px;font-size:12px}
.bd-cur{position:absolute;left:0;top:0;transform:translate(var(--x),var(--y)) scale(calc(1 / var(--z,1)));transform-origin:0 0;pointer-events:none;transition:transform .4s linear;z-index:2}.bd-cur svg{display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))}.bd-cur-n{position:absolute;left:14px;top:16px;font-size:11px;padding:1px 7px;border-radius:999px;color:#fff;white-space:nowrap;font-weight:600}
.bd-cm{position:absolute;left:0;top:0;transform:translate(var(--x),var(--y)) translate(-6px,-26px) scale(calc(1 / var(--z,1)));transform-origin:6px 26px;width:28px;height:28px;border-radius:14px 14px 14px 2px;background:#f9a825;color:#111;display:grid;place-items:center;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:pointer;pointer-events:all;z-index:3}.bd-cm b{position:absolute;top:-6px;right:-8px;background:var(--crit);color:#fff;font-size:10px;border-radius:999px;padding:0 5px;line-height:15px}.bd-cm.res{background:#c8e6c9;opacity:.8}.bd-cm.on{outline:3px solid var(--accent)}
.bd-side{position:absolute;right:10px;top:10px;bottom:60px;width:330px;max-width:calc(100% - 20px);z-index:8;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);display:flex;flex-direction:column;overflow:hidden}.bd-side .hd{display:flex;align-items:center;gap:6px;padding:10px 12px;border-bottom:1px solid var(--line);font-weight:700}.bd-side .hd .grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bd-side .bd-msgs{flex:1;overflow:auto;padding:8px 12px}.bd-side .ft{padding:8px 12px;border-top:1px solid var(--line)}.bd-side textarea{width:100%;min-height:64px;resize:vertical}
.bd-msg{padding:8px 0;border-bottom:1px solid var(--line)}.bd-msg:last-child{border-bottom:0}.bd-msg .who{font-size:12px;color:var(--ink-soft);display:flex;gap:6px;align-items:center}.bd-msg .who .grow{flex:1}.bd-msg .tx{white-space:pre-wrap;word-wrap:break-word;margin-top:2px}.bd-msg .icon-btn{padding:0 4px;font-size:13px}
.bd-th{padding:8px 0;border-bottom:1px solid var(--line);cursor:pointer}.bd-th:hover{background:var(--panel-2)}.bd-th .t{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bd-th .m{font-size:12px;color:var(--ink-soft)}.bd-th.res .t{color:var(--ink-faint);text-decoration:line-through}
.bd-row{cursor:pointer}.bd-mem{display:flex;flex-wrap:wrap;gap:6px;max-height:220px;overflow:auto}.bd-mem label{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;border:1px solid var(--line);border-radius:999px;padding:3px 9px;cursor:pointer}.bd-mem label:has(input:checked){border-color:var(--accent);background:var(--accent-soft)}.bd-mem input{width:auto;margin:0}
.bd-empty{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;color:var(--ink-faint);pointer-events:none;font-size:14px;max-width:360px}
@media(max-width:700px){.bd-tools{flex-direction:row;left:8px;top:8px;right:auto}.bd-tools button{width:32px;height:32px}.bd-top .faint,.bd-find,.bd-mini{display:none}.bd-side{right:0;top:0;bottom:0;width:100%;max-width:none;border-radius:0}}
</style>`);

    const me = () => ui.state.user || {};
    const people = () => (ui.state.people || []).slice();
    const TRACK = { concept: 'концепция', ep: 'ЭП', rp: 'РП', an: 'АН' };
    const MODE_CHIP = { all: ['neutral', 'правят все'], members: ['warn', 'участники'], managers: ['crit', 'руководители'] };
    const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase();
    const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
    const colorOf = id => `hsl(${hue(id)},60%,42%)`;
    const avatar = (id, name) => `<span class="bd-av" title="${esc(name)}" style="background:${colorOf(id)}">${esc(initials(name))}</span>`;
    const clone = o => JSON.parse(JSON.stringify(o));
    const when = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`; };
    const fileUrl = (boardId, key) => `/api/board/boards/${encodeURIComponent(boardId)}/files/${encodeURIComponent(key)}`;
    const readB64 = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('Не удалось прочитать файл')); r.readAsDataURL(file); });
    const imgSize = file => new Promise(res => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => { res({ w: im.naturalWidth, h: im.naturalHeight }); URL.revokeObjectURL(u); }; im.onerror = () => { res({ w: 400, h: 300 }); URL.revokeObjectURL(u); }; im.src = u; });
    const loadImg = url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('img')); im.src = url; });
    const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); };
    let pdfjsP = null, jspdfP = null;
    const pdfjs = () => pdfjsP || (pdfjsP = import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs'; return m; }).catch(e => { pdfjsP = null; throw new Error('Не удалось загрузить pdf.js (нужен доступ к cdnjs.cloudflare.com): ' + e.message); }));
    const jspdf = () => jspdfP || (jspdfP = new Promise((res, rej) => { if (window.jspdf && window.jspdf.jsPDF) return res(window.jspdf.jsPDF); const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = () => res(window.jspdf.jsPDF); s.onerror = () => { jspdfP = null; rej(new Error('Не удалось загрузить jsPDF (нужен доступ к cdnjs.cloudflare.com)')); }; document.head.appendChild(s); }));
    const parsePages = (s, n) => { const out = new Set(); for (const part of String(s || '1').split(/[,\s;]+/).filter(Boolean)) { const m = part.match(/^(\d+)(?:-(\d+))?$/); if (!m) continue; const a = Math.max(1, Number(m[1])), b = Math.min(n, Number(m[2] || m[1])); for (let i = a; i <= b && out.size < 30; i++) out.add(i); } return [...out].sort((a, b) => a - b); };
    const TOOLS = [['select', '⬚', 'Выбор (V)'], ['hand', '✋', 'Рука (H)'], ['sticky', '▣', 'Стикер (N)'], ['text', 'T', 'Текст (T)'], ['frame', '▭', 'Рамка (F)'], ['rect', '▢', 'Фигура (R)'], ['arrow', '↗', 'Стрелка (A)'], ['file', '🖼', 'Картинка / PDF (I)'], ['comment', '💬', 'Комментарий (C)']];
    const KEY_TOOL = { v: 'select', h: 'hand', n: 'sticky', t: 'text', f: 'frame', r: 'rect', a: 'arrow', i: 'file', c: 'comment' };
    const fill = c => BD.COLORS[c] || c || BD.COLORS.gray;
    const isTextual = it => ['sticky', 'text', 'rect'].includes(it.type);
    const rgba = (hex, a) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || ''); return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : hex; };

    // ---- экспорт: рисуем объекты на canvas (PNG; PDF — этот же рисунок через jsPDF) ----
    async function renderCanvas(items, box, boardId) {
      const pad = 40; const W = box.w + pad * 2, H = box.h + pad * 2; const scale = Math.max(0.1, Math.min(2, 4000 / W, 4000 / H));
      const cv = document.createElement('canvas'); cv.width = Math.ceil(W * scale); cv.height = Math.ceil(H * scale); const g = cv.getContext('2d');
      g.fillStyle = '#f7f7f6'; g.fillRect(0, 0, cv.width, cv.height); g.scale(scale, scale); g.translate(pad - box.x, pad - box.y);
      const FONT = 'Helvetica, Arial, sans-serif'; const byId = new Map(items.map(i => [i.id, i])); const get = id => byId.get(id) || null;
      const lines = (text, maxW) => { const out = []; for (const para of String(text || '').split('\n')) { let line = ''; for (const w of para.split(/(\s+)/)) { const t = line + w; if (g.measureText(t).width > maxW && line) { out.push(line.trimEnd()); line = w.trimStart(); } else line = t; } out.push(line.trimEnd()); } return out; };
      const text = (str, x, y, maxW, maxH, size, color, align) => { g.font = `${size}px ${FONT}`; g.fillStyle = color; g.textBaseline = 'top'; const lh = size * 1.3; const ls = lines(str, maxW); const total = ls.length * lh; let y0 = align === 'center' ? y + Math.max(0, (maxH - total) / 2) : y; for (const [i, l] of ls.entries()) { if (y0 + (i + 1) * lh > y + maxH + 1) break; const w = g.measureText(l).width; g.fillText(l, align === 'center' ? x + (maxW - w) / 2 : x, y0 + i * lh); } };
      const rr = (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
      const sorted = items.filter(i => i.type !== 'arrow').sort((a, b) => ((a.type === 'frame' ? 0 : 1) - (b.type === 'frame' ? 0 : 1)) || (a.z || 0) - (b.z || 0));
      for (const it of sorted) {
        const col = fill(it.props.color); const { x, y, w, h } = it;
        if (it.type === 'frame') { g.fillStyle = rgba(col, 0.18); g.fillRect(x, y, w, h); g.strokeStyle = col; g.lineWidth = 3; g.strokeRect(x, y, w, h); g.font = `bold 22px ${FONT}`; const title = it.props.title || ''; const tw = Math.min(w, g.measureText(title).width + 20); g.fillStyle = col; g.fillRect(x, y - 30, tw, 30); g.fillStyle = '#111'; g.textBaseline = 'middle'; g.fillText(title, x + 10, y - 15, w - 20); }
        else if (it.type === 'sticky') { g.save(); g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 8; g.shadowOffsetY = 3; g.fillStyle = col; g.fillRect(x, y, w, h); g.restore(); text(it.props.text, x + 10, y + 10, w - 20, h - 20, it.props.size || 16, '#111'); }
        else if (it.type === 'rect') { g.fillStyle = col; rr(x, y, w, h, 8); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.stroke(); text(it.props.text, x + 10, y + 10, w - 20, h - 20, it.props.size || 16, '#111', 'center'); }
        else if (it.type === 'text') text(it.props.text, x + 6, y + 4, w - 12, h - 8, it.props.size || 20, it.props.color ? fill(it.props.color) : '#111');
        else { try { if (!it.props.src) throw new Error(); const img = await loadImg(fileUrl(boardId, it.props.src)); g.drawImage(img, x, y, w, h); } catch { g.fillStyle = '#e0e0e0'; g.fillRect(x, y, w, h); } if (it.type === 'pdf') { g.font = `12px ${FONT}`; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x + 6, y + h - 24, 80, 18); g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(`PDF · стр. ${it.props.page}`, x + 10, y + h - 15); } }
      }
      g.lineWidth = 3; g.lineCap = 'round';
      for (const it of items) {
        if (it.type !== 'arrow') continue; const { p1, p2 } = BD.arrowEnds(it, get); g.strokeStyle = '#37474f'; g.fillStyle = '#37474f'; g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
        if (it.props.head) { const a = Math.atan2(p2.y - p1.y, p2.x - p1.x); const L = 14; g.beginPath(); g.moveTo(p2.x, p2.y); g.lineTo(p2.x - L * Math.cos(a - 0.45), p2.y - L * Math.sin(a - 0.45)); g.lineTo(p2.x - L * Math.cos(a + 0.45), p2.y - L * Math.sin(a + 0.45)); g.closePath(); g.fill(); }
        if (it.props.text) { g.font = `14px ${FONT}`; g.textBaseline = 'bottom'; const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2 - 6; const tw = g.measureText(it.props.text).width; g.fillStyle = '#f7f7f6'; g.fillRect(mx - tw / 2 - 4, my - 16, tw + 8, 18); g.fillStyle = '#37474f'; g.fillText(it.props.text, mx - tw / 2, my); }
      }
      return cv;
    }

    // ================= редактор =================
    class Editor {
      constructor(root, boardId, o) {
        this.root = root; this.boardId = boardId; this.o = o || {}; this.client = Math.random().toString(36).slice(2, 10);
        this.items = new Map(); this.comments = new Map(); this.sel = new Set(); this.tool = 'select'; this.view = { x: 0, y: 0, z: 1 }; this.rev = 0;
        this.undoS = []; this.redoS = []; this.pending = []; this.locked = new Set(); this.clip = []; this.pasteN = 0; this.pointers = new Map(); this.canEdit = false; this.dead = false;
        this.side = { mode: '', id: '' }; this.find = { q: '', list: [], i: -1 }; this.otherSel = new Map(); this.cursor = null; this.showResolved = false;
        try { this.miniOn = localStorage.getItem('bd-mini') !== '0'; } catch { this.miniOn = true; }
        root.classList.add('bd-root'); if (this.o.full) root.classList.add('full'); root.tabIndex = 0; window.MostBoard._last = this; // для отладки из консоли
        root.innerHTML = '<div class="boot">Загрузка доски…</div>';
        this.load().catch(e => { root.innerHTML = `<div class="empty" style="margin:20px">${esc(e.message)}</div>`; });
      }
      // ---- загрузка и каркас ----
      async load() {
        const d = await api(`/board/boards/${encodeURIComponent(this.boardId)}?client=${this.client}`);
        this.board = d.board; this.rev = d.rev; this.canEdit = !!d.board.canEdit; this.me = d.me; this.modes = d.modes || BD.EDIT_MODES; for (const it of d.items) this.items.set(it.id, it); for (const c of d.comments || []) this.comments.set(c.id, c);
        this.build(); this.renderAll(); this.zoomFit(); this.presence(d.presence);
        this.timer = setInterval(() => this.poll(), 1000); this.onHide = () => { if (document.hidden) this.flush(true); }; document.addEventListener('visibilitychange', this.onHide); window.addEventListener('pagehide', this.onHide);
      }
      destroy() { this.dead = true; clearInterval(this.timer); document.removeEventListener('visibilitychange', this.onHide); window.removeEventListener('pagehide', this.onHide); document.removeEventListener('keydown', this.onKey); document.removeEventListener('keyup', this.onKeyUp); document.removeEventListener('paste', this.onPaste); document.removeEventListener('pointerdown', this.onDocDown); }
      build() {
        const b = this.board; const r = this.root;
        r.innerHTML = `<div class="bd-top">${this.o.full ? '<a class="btn sm" href="#/boards">← Доски</a>' : ''}<span class="bd-title" title="${b.canManage ? 'Переименовать' : ''}">${esc(b.title)}</span>${b.project ? `<a class="faint" href="#/pmp?id=${encodeURIComponent(b.project.id)}">${esc(b.project.name)} · ${esc(TRACK[b.project.track] || '')}</a>` : '<span class="faint">свободная доска</span>'}${b.editMode !== 'all' ? chip(b.editMode, MODE_CHIP) : ''}${b.source && b.source.url ? `<a class="faint" href="${esc(b.source.url)}" target="_blank" rel="noopener" title="Перенесено из Miro ${esc(when(b.source.at))}">Источник: Miro ↗</a>` : ''}<span class="bd-find"><input placeholder="Поиск по доске (Ctrl+F)" class="bd-q"><span class="n"></span><button data-a="findPrev" title="Предыдущее">↑</button><button data-a="findNext" title="Следующее">↓</button></span><span class="grow"></span><span class="bd-pres"></span><button class="bd-ic" data-a="comments" title="Комментарии">💬<span class="bd-cmn"></span></button><span class="bd-exp"><button class="bd-ic" data-a="export" title="Экспорт в PNG / PDF">⤓</button><div class="bd-menu" hidden></div></span><span class="bd-status"></span>${b.canManage ? '<button class="bd-ic" data-a="settings" title="Название, проект, «Кто правит», участники">⚙</button>' : ''}${this.o.full ? '' : `<a class="btn sm" href="#/board?id=${encodeURIComponent(b.id)}" title="На весь экран">⤢</a>`}</div>
          <div class="bd-main"><div class="bd-tools">${TOOLS.map(([id, ic, t]) => `<button data-tool="${id}" title="${esc(t)}"${this.canEdit || id === 'select' || id === 'hand' || id === 'comment' ? '' : ' disabled'}>${ic}</button>`).join('')}<button data-a="undo" title="Отменить (Ctrl+Z)"${this.canEdit ? '' : ' disabled'}>↶</button><button data-a="redo" title="Повторить (Ctrl+Y)"${this.canEdit ? '' : ' disabled'}>↷</button></div>
          <div class="bd-vp"><div class="bd-world"><div class="bd-layer bd-frames"></div><div class="bd-layer bd-items"></div><svg class="bd-svg" xmlns="http://www.w3.org/2000/svg"><defs><marker id="bd-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#37474f"/></marker><marker id="bd-head-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#ff4d23"/></marker></defs><g class="bd-arrows"></g></svg><div class="bd-layer bd-cursors"></div><div class="bd-layer bd-cms"></div><div class="bd-sel" hidden></div></div><div class="bd-band" hidden></div><div class="bd-ctx" hidden></div><div class="bd-empty" hidden></div></div>
          <div class="bd-side" hidden></div><canvas class="bd-mini" width="200" height="140"${this.miniOn ? '' : ' hidden'}></canvas>
          <div class="bd-zoom"><button data-a="zout" title="Уменьшить">−</button><span class="bd-zv">100%</span><button data-a="zin" title="Увеличить">+</button><button data-a="z100" title="100 %">1:1</button><button data-a="fit" title="Показать всё">⤢</button><button data-a="mini" class="${this.miniOn ? 'on' : ''}" title="Мини-карта">▦</button></div><input type="file" class="bd-file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" multiple hidden></div>`;
        this.vp = r.querySelector('.bd-vp'); this.world = r.querySelector('.bd-world'); this.lFrames = r.querySelector('.bd-frames'); this.lItems = r.querySelector('.bd-items'); this.gArrows = r.querySelector('.bd-arrows'); this.lCursors = r.querySelector('.bd-cursors'); this.lCms = r.querySelector('.bd-cms'); this.selBox = r.querySelector('.bd-sel'); this.band = r.querySelector('.bd-band'); this.ctx = r.querySelector('.bd-ctx'); this.fileInput = r.querySelector('.bd-file'); this.sideEl = r.querySelector('.bd-side'); this.mini = r.querySelector('.bd-mini'); this.findInput = r.querySelector('.bd-q');
        r.querySelectorAll('[data-tool]').forEach(bt => bt.onclick = () => this.setTool(bt.dataset.tool));
        r.querySelectorAll('[data-a]').forEach(bt => bt.onclick = ev => { ev.stopPropagation(); this.action(bt.dataset.a); });
        r.querySelector('.bd-title').onclick = () => { if (b.canManage) this.settings(); };
        this.fileInput.onchange = () => { const at = this.center(); for (const f of this.fileInput.files) this.upload(f, at); this.fileInput.value = ''; };
        this.findInput.oninput = () => this.doFind(this.findInput.value); this.findInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); this.findStep(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { this.findInput.value = ''; this.doFind(''); this.findInput.blur(); } e.stopPropagation(); };
        const vp = this.vp;
        vp.addEventListener('pointerdown', e => this.down(e)); vp.addEventListener('pointermove', e => this.move(e)); vp.addEventListener('pointerup', e => this.up(e)); vp.addEventListener('pointercancel', e => this.up(e));
        vp.addEventListener('wheel', e => this.wheel(e), { passive: false }); vp.addEventListener('dblclick', e => this.dbl(e)); vp.addEventListener('contextmenu', e => e.preventDefault());
        vp.addEventListener('dragover', e => { e.preventDefault(); vp.classList.add('drop'); }); vp.addEventListener('dragleave', () => vp.classList.remove('drop'));
        vp.addEventListener('drop', e => { e.preventDefault(); vp.classList.remove('drop'); if (!this.canEdit) return toast('У вас только просмотр'); const at = this.toWorld(e.clientX, e.clientY); let k = 0; for (const f of e.dataTransfer.files) this.upload(f, { x: at.x + k * 40, y: at.y + k++ * 40 }); });
        this.sideEl.addEventListener('pointerdown', e => e.stopPropagation()); this.sideEl.addEventListener('wheel', e => e.stopPropagation());
        this.mini.addEventListener('pointerdown', e => { e.stopPropagation(); this.miniDrag = true; this.miniGo(e); }); this.mini.addEventListener('pointermove', e => { if (this.miniDrag) this.miniGo(e); }); this.mini.addEventListener('pointerup', () => { this.miniDrag = false; }); this.mini.addEventListener('pointerleave', () => { this.miniDrag = false; });
        this.onKey = e => this.key(e); this.onKeyUp = e => { if (e.code === 'Space') { this.space = false; this.vp.classList.toggle('hand', this.tool === 'hand'); } }; this.onPaste = e => this.paste(e); this.onDocDown = e => { const m = this.root.querySelector('.bd-menu'); if (m && !m.hidden && !e.target.closest('.bd-exp')) m.hidden = true; };
        document.addEventListener('keydown', this.onKey); document.addEventListener('keyup', this.onKeyUp); document.addEventListener('paste', this.onPaste); document.addEventListener('pointerdown', this.onDocDown);
        this.setTool('select'); this.status(this.canEdit ? 'Сохранено' : 'Только просмотр');
      }
      alive() { if (this.dead) return false; if (!this.root.isConnected) { this.destroy(); return false; } return true; }
      status(t, err) { const s = this.root.querySelector('.bd-status'); if (s) { s.textContent = t; s.classList.toggle('err', !!err); } }
      // ---- присутствие: аватары, курсоры, чужие выделения ----
      presence(list) {
        list = list || []; const others = list.filter(p => p.client !== this.client); const el = this.root.querySelector('.bd-pres'); if (!el) return;
        const byUser = new Map(); for (const p of list) if (!byUser.has(p.userId)) byUser.set(p.userId, p.name); el.innerHTML = [...byUser.entries()].map(([id, name]) => avatar(id, name + (id === this.me ? ' (вы)' : ''))).join(''); el.title = [...byUser.values()].join(', ');
        const layer = this.lCursors; const keep = new Set();
        for (const p of others) { if (p.x == null || p.idle) continue; const k = p.userId + '|' + p.client; keep.add(k); let c = layer.querySelector(`[data-k="${CSS.escape(k)}"]`); const col = colorOf(p.userId);
          if (!c) { c = document.createElement('div'); c.className = 'bd-cur'; c.dataset.k = k; c.innerHTML = `<svg width="18" height="22" viewBox="0 0 18 22"><path d="M1 1L17 10L9.5 11.5L6 20Z" fill="${col}" stroke="#fff" stroke-width="1.5"/></svg><span class="bd-cur-n" style="background:${col}"></span>`; c.querySelector('.bd-cur-n').textContent = p.name || '?'; layer.appendChild(c); }
          c.style.setProperty('--x', p.x + 'px'); c.style.setProperty('--y', p.y + 'px'); }
        for (const c of [...layer.children]) if (!keep.has(c.dataset.k)) c.remove();
        const selMap = new Map(); for (const p of others) for (const id of p.sel || []) if (!selMap.has(id)) selMap.set(id, colorOf(p.userId));
        for (const id of this.otherSel.keys()) if (!selMap.has(id)) { const e = this.elOf(id); if (e) e.style.boxShadow = ''; }
        for (const [id, col] of selMap) { const e = this.elOf(id); if (e) e.style.boxShadow = `0 0 0 calc(3px / var(--z, 1)) ${col}`; }
        this.otherSel = selMap;
      }
      // ---- вид ----
      applyView() { const v = this.view; this.world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`; this.world.style.setProperty('--z', v.z); const zv = this.root.querySelector('.bd-zv'); if (zv) zv.textContent = Math.round(v.z * 100) + '%'; this.placeCtx(); this.miniSoon(); }
      toWorld(cx, cy) { const r = this.vp.getBoundingClientRect(); return { x: (cx - r.left - this.view.x) / this.view.z, y: (cy - r.top - this.view.y) / this.view.z }; }
      toScreen(wx, wy) { return { x: wx * this.view.z + this.view.x, y: wy * this.view.z + this.view.y }; }
      center() { const r = this.vp.getBoundingClientRect(); return this.toWorld(r.left + r.width / 2, r.top + r.height / 2); }
      viewBox() { const r = this.vp.getBoundingClientRect(); return { x: -this.view.x / this.view.z, y: -this.view.y / this.view.z, w: r.width / this.view.z, h: r.height / this.view.z }; }
      zoomAt(cx, cy, f) { const r = this.vp.getBoundingClientRect(); const sx = cx - r.left, sy = cy - r.top; const v = this.view; const z = Math.min(4, Math.max(0.05, v.z * f)); const wx = (sx - v.x) / v.z, wy = (sy - v.y) / v.z; v.z = z; v.x = sx - wx * z; v.y = sy - wy * z; this.applyView(); }
      zoomFit() { const box = BD.bbox([...this.items.values()]); const r = this.vp.getBoundingClientRect(); if (!box || !r.width) { this.view = { x: r.width / 2, y: r.height / 2, z: 1 }; return this.applyView(); } const pad = 60; const z = Math.min(2, Math.max(0.05, Math.min((r.width - pad * 2) / (box.w || 1), (r.height - pad * 2) / (box.h || 1)))); this.view = { z, x: (r.width - box.w * z) / 2 - box.x * z, y: (r.height - box.h * z) / 2 - box.y * z }; this.applyView(); }
      focusPoint(x, y, z) { const r = this.vp.getBoundingClientRect(); if (z) this.view.z = Math.min(4, Math.max(0.05, z)); this.view.x = r.width / 2 - x * this.view.z; this.view.y = r.height / 2 - y * this.view.z; this.applyView(); }
      focusItem(id) { const it = this.items.get(id); if (!it) return; const box = it.type === 'arrow' ? BD.arrowBox(it) : it; const r = this.vp.getBoundingClientRect(); const z = Math.min(1, Math.max(this.view.z, Math.min((r.width - 120) / (box.w || 1), (r.height - 120) / (box.h || 1), 1))); this.focusPoint(box.x + box.w / 2, box.y + box.h / 2, Math.max(0.3, z)); this.sel = new Set([id]); this.renderSel(); }
      wheel(e) { e.preventDefault(); const pinch = e.ctrlKey || e.metaKey; const pad = !pinch && (e.deltaX !== 0 || (Math.abs(e.deltaY) < 50 && e.deltaMode === 0)); if (pad) { this.view.x -= e.deltaX; this.view.y -= e.deltaY; this.applyView(); } else { const f = Math.exp(-(e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY) * (pinch ? 0.01 : 0.0015)); this.zoomAt(e.clientX, e.clientY, f); } }
      // ---- мини-карта ----
      miniSoon() { if (!this.miniOn || this.miniT) return; this.miniT = requestAnimationFrame(() => { this.miniT = 0; this.drawMini(); }); }
      drawMini() {
        const cv = this.mini; if (!cv || !this.miniOn) return; const g = cv.getContext('2d'); const W = cv.width, H = cv.height; const cs = getComputedStyle(this.root);
        g.clearRect(0, 0, W, H); g.fillStyle = cs.getPropertyValue('--panel') || '#fff'; g.fillRect(0, 0, W, H);
        const items = [...this.items.values()]; const vb = this.viewBox(); const all = BD.bbox(items); const box = all ? { x: Math.min(all.x, vb.x), y: Math.min(all.y, vb.y), w: 0, h: 0 } : { x: vb.x, y: vb.y, w: 0, h: 0 };
        const x2 = all ? Math.max(all.x + all.w, vb.x + vb.w) : vb.x + vb.w, y2 = all ? Math.max(all.y + all.h, vb.y + vb.h) : vb.y + vb.h; box.w = x2 - box.x || 1; box.h = y2 - box.y || 1;
        const s = Math.min((W - 10) / box.w, (H - 10) / box.h); const ox = 5 + (W - 10 - box.w * s) / 2, oy = 5 + (H - 10 - box.h * s) / 2; this.miniMap = { box, s, ox, oy };
        const X = x => ox + (x - box.x) * s, Y = y => oy + (y - box.y) * s;
        for (const it of items) { if (it.type === 'arrow') continue; g.fillStyle = it.type === 'frame' ? rgba(fill(it.props.color), 0.55) : it.type === 'sticky' || it.type === 'rect' ? fill(it.props.color) : '#9b9da0'; g.fillRect(X(it.x), Y(it.y), Math.max(1.5, it.w * s), Math.max(1.5, it.h * s)); }
        g.strokeStyle = cs.getPropertyValue('--accent') || '#ff4d23'; g.lineWidth = 1.5; g.strokeRect(X(vb.x), Y(vb.y), vb.w * s, vb.h * s);
      }
      miniGo(e) { const m = this.miniMap; if (!m) return; const r = this.mini.getBoundingClientRect(); const x = m.box.x + (e.clientX - r.left - m.ox) / m.s, y = m.box.y + (e.clientY - r.top - m.oy) / m.s; this.focusPoint(x, y); }
      // ---- отрисовка ----
      renderAll() { this.lFrames.innerHTML = ''; this.lItems.innerHTML = ''; this.gArrows.innerHTML = ''; for (const it of this.items.values()) this.draw(it); this.drawArrows(); this.renderSel(); this.renderComments(); this.emptyHint(); this.miniSoon(); }
      emptyHint() { const e = this.root.querySelector('.bd-empty'); if (!e) return; const on = !this.items.size; e.hidden = !on; if (on) e.textContent = this.canEdit ? 'Пустая доска. Выберите инструмент слева и щёлкните по холсту или перетащите сюда картинку / PDF.' : 'Пустая доска.'; }
      elOf(id) { return this.root.querySelector(`.bd-it[data-id="${CSS.escape(id)}"]`); }
      draw(it) {
        if (it.type === 'arrow') return;
        let el = this.elOf(it.id); const layer = it.type === 'frame' ? this.lFrames : this.lItems;
        if (!el) { el = document.createElement('div'); el.dataset.id = it.id; layer.appendChild(el); el._sig = ''; } else if (el.parentNode !== layer) layer.appendChild(el);
        const sig = JSON.stringify([it.type, it.props, it.w, it.h]);
        if (el._sig !== sig) {
          el._sig = sig; el.className = `bd-it bd-${it.type === 'pdf' ? 'img' : it.type}${it.props.locked ? ' locked' : ''}`; el.style.background = ''; el.style.borderColor = '';
          if (it.type === 'sticky' || it.type === 'rect') { el.style.background = fill(it.props.color); el.innerHTML = '<div class="bd-txt"></div>'; const t = el.firstChild; t.textContent = it.props.text; t.style.fontSize = `max(${it.props.size}px, calc(11px / var(--z, 1)))`; }
          else if (it.type === 'text') { el.innerHTML = '<div class="bd-txt"></div>'; const t = el.firstChild; t.textContent = it.props.text; t.style.fontSize = `max(${it.props.size}px, calc(11px / var(--z, 1)))`; if (it.props.color) t.style.color = fill(it.props.color); el.classList.toggle('empty', !it.props.text); }
          else if (it.type === 'frame') { el.style.background = fill(it.props.color) + '1f'; el.style.borderColor = fill(it.props.color); el.innerHTML = '<div class="bd-ftitle"></div>'; el.firstChild.textContent = it.props.title; el.firstChild.style.background = fill(it.props.color); }
          else { el.innerHTML = `<img alt="" draggable="false">${it.type === 'pdf' ? `<span class="bd-badge">PDF · стр. ${it.props.page}${it.props.pages > 1 ? ' из ' + it.props.pages : ''}</span>` : ''}`; const img = el.firstChild; if (it.props.src) img.src = fileUrl(this.boardId, it.props.src); else { img.remove(); el.textContent = 'файл не найден'; } }
        }
        el.style.transform = `translate(${it.x}px, ${it.y}px)${it.rot ? ` rotate(${it.rot}deg)` : ''}`; el.style.width = it.w + 'px'; el.style.height = it.h + 'px'; el.style.zIndex = String(Math.round(it.z || 0) + 100000);
        el.title = it.updatedByName ? `${it.updatedByName} · ${when(it.updatedAt)}` : ''; // история: кто менял последним
        el.classList.toggle('sel', this.sel.has(it.id)); el.classList.toggle('found', this.find.list.includes(it.id));
      }
      drawArrows() {
        const g = this.gArrows; const keep = new Set(); const get = id => this.items.get(id) || null;
        for (const it of this.items.values()) {
          if (it.type !== 'arrow') continue; keep.add(it.id); const { p1, p2 } = BD.arrowEnds(it, get); const d = `M${p1.x} ${p1.y}L${p2.x} ${p2.y}`;
          let grp = g.querySelector(`g[data-id="${CSS.escape(it.id)}"]`); if (!grp) { grp = document.createElementNS('http://www.w3.org/2000/svg', 'g'); grp.dataset.id = it.id; grp.innerHTML = '<path class="line"/><text text-anchor="middle"></text><path class="hit"><title></title></path>'; g.appendChild(grp); }
          const line = grp.children[0], txt = grp.children[1], hit = grp.children[2]; const selOn = this.sel.has(it.id); line.setAttribute('d', d); hit.setAttribute('d', d); line.classList.toggle('sel', selOn);
          if (it.props.head) line.setAttribute('marker-end', selOn ? 'url(#bd-head-sel)' : 'url(#bd-head)'); else line.removeAttribute('marker-end');
          txt.textContent = it.props.text || ''; txt.setAttribute('x', (p1.x + p2.x) / 2); txt.setAttribute('y', (p1.y + p2.y) / 2 - 6); hit.firstChild.textContent = it.updatedByName ? `${it.updatedByName} · ${when(it.updatedAt)}` : '';
        }
        for (const grp of [...g.children]) if (!keep.has(grp.dataset.id)) grp.remove();
        this.placeCms();
      }
      remove(id) { const el = this.elOf(id); if (el) el.remove(); const grp = this.gArrows.querySelector(`g[data-id="${CSS.escape(id)}"]`); if (grp) grp.remove(); this.items.delete(id); this.sel.delete(id); }
      redrawSet(ids) { for (const id of ids) { const it = this.items.get(id); if (it) this.draw(it); } this.drawArrows(); this.renderSel(); }
      selItems() { return [...this.sel].map(id => this.items.get(id)).filter(Boolean); }
      renderSel() {
        this.root.querySelectorAll('.bd-it.sel').forEach(el => { if (!this.sel.has(el.dataset.id)) el.classList.remove('sel'); }); for (const id of this.sel) { const el = this.elOf(id); if (el) el.classList.add('sel'); }
        const items = this.selItems(); const box = BD.bbox(items); const sb = this.selBox;
        if (!box) { sb.hidden = true; this.ctx.hidden = true; return; }
        sb.hidden = !this.canEdit; sb.style.transform = `translate(${box.x}px, ${box.y}px)`; sb.style.width = box.w + 'px'; sb.style.height = box.h + 'px';
        const single = items.length === 1 && items[0].type !== 'arrow' && !items[0].props.locked && this.canEdit;
        sb.innerHTML = single ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(h => `<div class="bd-h ${h}" data-h="${h}" style="left:${/e/.test(h) ? 100 : /w/.test(h) ? 0 : 50}%;top:${/s/.test(h) ? 100 : /n/.test(h) ? 0 : 50}%"></div>`).join('') : '';
        this.renderCtx(items, box);
      }
      renderCtx(items, box) {
        const c = this.ctx; c.hidden = false; const first = items[0]; const E = this.canEdit; const hasColor = E && items.some(it => 'color' in BD.DEFAULTS[it.type].props && it.type !== 'text'); const hasText = E && items.some(it => 'size' in BD.DEFAULTS[it.type].props); const arrows = E ? items.filter(it => it.type === 'arrow') : []; const pdf = items.find(it => it.type === 'pdf' && it.props.pdf);
        const cur = first.props.color || ''; const size = first.props.size || 16;
        c.innerHTML = (hasColor ? BD.COLOR_KEYS.map(k => `<span class="sw${cur === k ? ' on' : ''}" data-c="${k}" title="${k}" style="background:${BD.COLORS[k]}"></span>`).join('') + '<span class="sep"></span>' : '') +
          (hasText ? `<select data-size title="Размер текста">${BD.SIZES.map(s => `<option value="${s}"${s === size ? ' selected' : ''}>${s}</option>`).join('')}</select><span class="sep"></span>` : '') +
          (arrows.length ? `<button data-a="head" title="Наконечник">${arrows[0].props.head ? '→' : '—'}</button><button data-a="label" title="Подпись">Aa</button><span class="sep"></span>` : '') +
          (pdf ? `<a class="btn sm" href="${fileUrl(this.boardId, pdf.props.pdf)}" target="_blank" rel="noopener" title="Открыть оригинал PDF">PDF ↗</a><span class="sep"></span>` : '') +
          `<button data-a="cmItem" title="Комментарий к объекту">💬</button>${items.length === 1 && first.type === 'frame' ? '<button data-a="expFrame" title="Экспорт рамки в PNG / PDF">⤓</button>' : ''}` +
          (E ? `<span class="sep"></span><button data-a="front" title="На передний план">⤒</button><button data-a="back" title="На задний план">⤓</button><button data-a="dup" title="Дублировать (Ctrl+D)">⧉</button><button data-a="lock" title="${first.props.locked ? 'Разблокировать' : 'Закрепить'}">${first.props.locked ? '🔓' : '🔒'}</button><button data-a="del" title="Удалить (Delete)">✕</button>` : '');
        c.querySelectorAll('.sw').forEach(s => s.onclick = () => this.setProp('color', s.dataset.c));
        const sz = c.querySelector('[data-size]'); if (sz) sz.onchange = () => this.setProp('size', Number(sz.value));
        c.querySelectorAll('[data-a]').forEach(bt => bt.onclick = ev => { ev.stopPropagation(); this.action(bt.dataset.a); });
        this.placeCtx(box);
      }
      placeCtx(box) { if (this.ctx.hidden) return; box = box || BD.bbox(this.selItems()); if (!box) return; const p = this.toScreen(box.x + box.w / 2, box.y); const r = this.vp.getBoundingClientRect(); const w = this.ctx.offsetWidth || 200; this.ctx.style.left = Math.max(60, Math.min(r.width - w - 8, p.x - w / 2)) + 'px'; this.ctx.style.top = Math.max(8, Math.min(r.height - 44, p.y - 46)) + 'px'; }
      // ---- изменения: локально + история + очередь на сервер ----
      snap(ids) { return [...ids].map(id => this.items.get(id)).filter(Boolean).map(clone); }
      apply(states, removeIds) {
        for (const id of removeIds || []) this.remove(id);
        const ids = []; for (const s of states || []) { const it = clone(s); this.items.set(it.id, it); ids.push(it.id); this.draw(it); }
        this.drawArrows(); this.renderSel(); this.emptyHint(); this.miniSoon(); return ids;
      }
      commit(before, after, removeIds) { this.undoS.push({ before, after, removed: removeIds || [] }); if (this.undoS.length > 200) this.undoS.shift(); this.redoS = []; this.send(after, removeIds); }
      send(states, removeIds) {
        if (!this.canEdit) return; for (const s of states || []) { this.pending.push({ op: 'upsert', item: clone(s) }); this.locked.add(s.id); } for (const id of removeIds || []) { this.pending.push({ op: 'delete', id }); this.locked.add(id); }
        this.status('Сохранение…'); clearTimeout(this.flushT); this.flushT = setTimeout(() => this.flush(), 250);
      }
      async flush(beacon) {
        if (!this.pending.length || this.flushing) return; const ops = this.pending; this.pending = []; this.flushing = true;
        try {
          const body = JSON.stringify({ ops, client: this.client }); const url = `/api/board/boards/${encodeURIComponent(this.boardId)}/ops`;
          const res = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body, keepalive: !!beacon });
          const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.error || 'Ошибка ' + res.status);
          this.rev = Math.max(this.rev, d.rev || 0); for (const it of d.items || []) { const cur = this.items.get(it.id); if (cur && !it.deleted) { cur.rev = it.rev; cur.ver = it.ver; cur.updatedAt = it.updatedAt; cur.updatedByName = it.updatedByName; const el = this.elOf(it.id); if (el) el.title = `${it.updatedByName} · ${when(it.updatedAt)}`; } }
          for (const op of ops) this.locked.delete(op.op === 'delete' ? op.id : op.item.id);
          this.status(this.pending.length ? 'Сохранение…' : 'Сохранено ' + new Date().toTimeString().slice(0, 5));
        } catch (e) { this.pending = ops.concat(this.pending); this.status('Не сохранено: ' + e.message, true); setTimeout(() => this.flush(), 4000); }
        finally { this.flushing = false; if (this.pending.length) { clearTimeout(this.flushT); this.flushT = setTimeout(() => this.flush(), 250); } }
      }
      async poll() {
        if (!this.alive()) return; if (document.hidden && (this.pollN = (this.pollN || 0) + 1) % 5) return;
        try {
          const q = { since: this.rev, client: this.client, sel: [...this.sel].slice(0, 30).join(',') || '-' }; if (this.cursor) { q.cx = Math.round(this.cursor.x); q.cy = Math.round(this.cursor.y); }
          const d = await api(`/board/boards/${encodeURIComponent(this.boardId)}/sync?${qsOf(q)}`); if (!this.alive()) return;
          this.presence(d.presence); if (d.title !== this.board.title) { this.board.title = d.title; const t = this.root.querySelector('.bd-title'); if (t) t.textContent = d.title; }
          if (d.canEdit !== this.canEdit || d.canManage !== this.board.canManage || d.editMode !== this.board.editMode) { this.canEdit = d.canEdit; this.board.canManage = d.canManage; this.board.canEdit = d.canEdit; this.board.editMode = d.editMode; this.build(); this.renderAll(); this.applyView(); toast(this.canEdit ? 'Вам открыта правка этой доски' : 'Доска переведена в режим просмотра'); }
          const changed = []; const removed = [];
          for (const it of d.items || []) { if (this.locked.has(it.id) || (this.drag && this.drag.ids && this.drag.ids.has(it.id)) || this.editing === it.id) continue; if (it.deleted) { if (this.items.has(it.id)) removed.push(it.id); } else { const cur = this.items.get(it.id); if (!cur || (it.ver || 0) >= (cur.ver || 0)) changed.push(it); } }
          if (changed.length || removed.length) this.apply(changed, removed);
          let cm = false; for (const c of d.comments || []) { if (c.deleted) { if (this.comments.delete(c.id)) cm = true; } else { this.comments.set(c.id, c); cm = true; } } if (cm) this.renderComments();
          this.rev = Math.max(this.rev, d.rev || 0); if (!this.pending.length && !this.flushing && this.canEdit && /Не сохранено|Нет связи/.test(this.root.querySelector('.bd-status').textContent)) this.status('Сохранено');
        } catch (e) { this.status('Нет связи: ' + e.message, true); }
      }
      // ---- инструменты и действия ----
      setTool(t) { this.tool = t; this.root.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); this.vp.classList.toggle('hand', t === 'hand'); this.vp.classList.toggle('create', ['sticky', 'text', 'frame', 'rect', 'arrow'].includes(t)); this.vp.classList.toggle('comment', t === 'comment'); if (t === 'file') { this.fileInput.click(); this.setTool('select'); } }
      action(a) {
        const vr = this.vp.getBoundingClientRect();
        if (a === 'zin') return this.zoomAt(vr.left + vr.width / 2, vr.top + vr.height / 2, 1.25);
        if (a === 'zout') return this.zoomAt(vr.left + vr.width / 2, vr.top + vr.height / 2, 0.8);
        if (a === 'z100') { const c = this.center(); return this.focusPoint(c.x, c.y, 1); }
        if (a === 'fit') return this.zoomFit();
        if (a === 'mini') { this.miniOn = !this.miniOn; this.mini.hidden = !this.miniOn; this.root.querySelector('[data-a=mini]').classList.toggle('on', this.miniOn); try { localStorage.setItem('bd-mini', this.miniOn ? '1' : '0'); } catch { } return this.miniSoon(); }
        if (a === 'settings') return this.settings();
        if (a === 'comments') return this.side.mode === 'list' ? this.closeSide() : this.openList();
        if (a === 'cmItem') { const it = this.selItems()[0]; if (it) this.openNew(it.id, it.x + it.w, it.y); return; }
        if (a === 'export') return this.exportMenu();
        if (a === 'expFrame') return this.exportMenu(this.selItems()[0]);
        if (a === 'findNext') return this.findStep(1); if (a === 'findPrev') return this.findStep(-1);
        if (!this.canEdit) return;
        if (a === 'undo') return this.undo(); if (a === 'redo') return this.redo(); if (a === 'del') return this.deleteSel(); if (a === 'dup') return this.duplicate();
        if (a === 'front' || a === 'back') { const all = [...this.items.values()]; const before = this.snap(this.sel); let z = a === 'front' ? BD.maxZ(all) : all.reduce((m, it) => Math.min(m, it.z || 0), 0); const after = before.map(s => Object.assign(clone(s), { z: a === 'front' ? ++z : --z })); this.apply(after); return this.commit(before, after); }
        if (a === 'lock') { const before = this.snap(this.sel); const on = !before[0].props.locked; const after = before.map(s => { const c = clone(s); if (on) c.props.locked = true; else delete c.props.locked; return c; }); this.apply(after); return this.commit(before, after); }
        if (a === 'head') { const before = this.snap([...this.sel].filter(id => this.items.get(id).type === 'arrow')); const after = before.map(s => { const c = clone(s); c.props.head = !c.props.head; return c; }); this.apply(after); return this.commit(before, after); }
        if (a === 'label') { const it = this.selItems().find(x => x.type === 'arrow'); if (!it) return; const v = window.prompt('Подпись стрелки', it.props.text || ''); if (v === null) return; const before = this.snap([it.id]); const after = [Object.assign(clone(it), { props: Object.assign({}, it.props, { text: v.slice(0, 200) }) })]; this.apply(after); return this.commit(before, after); }
      }
      setProp(k, v) { const ids = [...this.sel].filter(id => k in BD.DEFAULTS[this.items.get(id).type].props); if (!ids.length) return; const before = this.snap(ids); const after = before.map(s => { const c = clone(s); c.props[k] = v; return c; }); this.apply(after); this.commit(before, after); }
      undo() { const h = this.undoS.pop(); if (!h) return; this.redoS.push(h); const afterIds = new Set(h.after.map(s => s.id)); const beforeIds = new Set(h.before.map(s => s.id)); const rm = [...afterIds].filter(id => !beforeIds.has(id)); this.apply(h.before, rm); this.send(h.before, rm); this.sel = new Set(h.before.map(s => s.id)); this.renderSel(); }
      redo() { const h = this.redoS.pop(); if (!h) return; this.undoS.push(h); const afterIds = new Set(h.after.map(s => s.id)); const rm = [...h.before.map(s => s.id).filter(id => !afterIds.has(id)), ...h.removed]; this.apply(h.after, rm); this.send(h.after, rm); this.sel = new Set(h.after.map(s => s.id)); this.renderSel(); }
      deleteSel() {
        const ids = [...this.sel].filter(id => !(this.items.get(id) || {}).props.locked); if (!ids.length) return; const before = this.snap(ids);
        const fix = BD.detachArrows([...this.items.values()], ids); const beforeFix = this.snap(fix.map(f => f.id)); this.apply(fix, ids); this.sel.clear(); this.renderSel(); this.commit(before.concat(beforeFix), fix, ids); this.renderComments();
      }
      newItem(type, x, y, extra) { const d = BD.DEFAULTS[type]; return Object.assign({ id: BD.newId(), boardId: this.boardId, type, x, y, w: d.w, h: d.h, z: BD.maxZ([...this.items.values()]) + 1, rot: 0, props: Object.assign(clone(d.props), (extra && extra.props) || {}) }, extra && extra.geom ? extra.geom : {}); }
      create(type, x, y, extra) { const it = this.newItem(type, x, y, extra); if (type === 'frame') it.z = -1 - this.items.size; this.apply([it]); this.sel = new Set([it.id]); this.renderSel(); this.commit([], [it]); return it; }
      copy() { const items = this.selItems(); if (!items.length) return; this.clip = clone(items); this.pasteN = 0; toast(`Скопировано: ${items.length}`); }
      pasteItems(list, at) {
        if (!list.length) return; this.pasteN++; const box = BD.bbox(list); const dx = at ? at.x - box.x : 30 * this.pasteN, dy = at ? at.y - box.y : 30 * this.pasteN; const map = new Map(list.map(it => [it.id, BD.newId()])); let z = BD.maxZ([...this.items.values()]);
        const out = list.map(it => { const c = clone(it); c.id = map.get(it.id); c.x += dx; c.y += dy; c.z = ++z; if (c.type === 'arrow') { c.props.x2 += dx; c.props.y2 += dy; c.props.from = map.get(c.props.from) || ''; c.props.to = map.get(c.props.to) || ''; } if (c.props.group) c.props.group = c.props.group + '-' + this.pasteN; delete c.props.locked; return c; });
        this.apply(out); this.sel = new Set(out.map(it => it.id)); this.renderSel(); this.commit([], out);
      }
      duplicate() { const items = this.selItems(); if (!items.length) return; const save = this.pasteN; this.pasteN = 0; this.pasteItems(clone(items)); this.pasteN = save; }
      paste(e) { if (!this.alive() || !this.canEdit || this.editing || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return; const files = [...(e.clipboardData && e.clipboardData.files || [])].filter(f => BD.FILE_TYPES[f.type]); if (files.length) { e.preventDefault(); const at = this.center(); files.forEach((f, i) => this.upload(f, { x: at.x + i * 40, y: at.y + i * 40 })); return; } const text = e.clipboardData && e.clipboardData.getData('text/plain'); if (this.clip.length) { e.preventDefault(); this.pasteItems(this.clip); } else if (text && text.trim()) { e.preventDefault(); const c = this.center(); this.create('sticky', c.x - 100, c.y - 100, { props: { text: text.trim().slice(0, BD.MAX_TEXT) } }); } }
      group(on) { const items = this.selItems(); if (items.length < (on ? 2 : 1)) return; const before = clone(items); const gid = BD.newId(); const after = before.map(s => { const c = clone(s); if (on) c.props.group = gid; else delete c.props.group; return c; }); this.apply(after); this.commit(before, after); toast(on ? 'Сгруппировано' : 'Разгруппировано'); }
      expandGroups() { const add = []; for (const id of this.sel) { const it = this.items.get(id); const g = it && it.props.group; if (g) for (const x of this.items.values()) if (x.props.group === g) add.push(x.id); } for (const id of add) this.sel.add(id); }
      // стрелки, привязанные к объектам ids (сами не в ids); freshArrows — их снимки с текущими точками привязки, чтобы на сервере координаты концов не устаревали
      attachedArrows(ids) { const set = ids instanceof Set ? ids : new Set(ids); return [...this.items.values()].filter(a => a.type === 'arrow' && !set.has(a.id) && ((a.props.from && set.has(a.props.from)) || (a.props.to && set.has(a.props.to)))).map(a => a.id); }
      freshArrows(ids) { const get = id => this.items.get(id) || null; return this.attachedArrows(ids).map(id => { const a = clone(this.items.get(id)); const { p1, p2 } = BD.arrowEnds(a, get); a.x = p1.x; a.y = p1.y; a.props.x2 = p2.x; a.props.y2 = p2.y; return a; }); }
      shifted(s, dx, dy) { const c = clone(s); c.x += dx; c.y += dy; if (c.type === 'arrow') { c.props.x2 += dx; c.props.y2 += dy; } return c; }
      // ---- поиск по доске ----
      doFind(q) { this.find.q = q; const prev = this.find.list; this.find.list = BD.search([...this.items.values()], q).map(i => i.id); this.find.i = -1; for (const id of new Set([...prev, ...this.find.list])) { const el = this.elOf(id); if (el) el.classList.toggle('found', this.find.list.includes(id)); } this.findCount(); if (this.find.list.length) this.findStep(1); }
      findStep(dir) { const n = this.find.list.length; if (!n) return; this.find.i = ((this.find.i + dir) % n + n) % n; this.focusItem(this.find.list[this.find.i]); this.findCount(); }
      findCount() { const el = this.root.querySelector('.bd-find .n'); if (el) el.textContent = this.find.q ? (this.find.list.length ? `${this.find.i + 1} / ${this.find.list.length}` : '0') : ''; }
      // ---- клавиатура ----
      key(e) {
        if (!this.alive()) return; const tag = document.activeElement && document.activeElement.tagName; const inField = /INPUT|TEXTAREA|SELECT/.test(tag) || (document.activeElement && document.activeElement.isContentEditable);
        if (this.editing) { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); this.endEdit(true); } return; }
        const mod = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
        if (mod && k === 'f' && this.root.contains(document.activeElement) || (mod && k === 'f' && this.o.full && !inField)) { e.preventDefault(); this.findInput.focus(); this.findInput.select(); return; }
        if (inField) return;
        if (e.code === 'Space' && !e.repeat) { this.space = true; this.vp.classList.add('hand'); e.preventDefault(); return; }
        if (k === 'escape') { if (this.side.mode) return this.closeSide(); this.sel.clear(); this.renderSel(); this.setTool('select'); return; }
        if (mod && k === 'a') { e.preventDefault(); this.sel = new Set(this.items.keys()); this.renderSel(); return; }
        if (mod && k === 'c') { e.preventDefault(); return this.copy(); }
        if (!mod && k === 'c') { e.preventDefault(); return this.setTool('comment'); }
        if (!this.canEdit) { if (!mod && (k === 'h' || k === 'v')) this.setTool(KEY_TOOL[k]); return; }
        if (mod && k === 'z') { e.preventDefault(); return e.shiftKey ? this.redo() : this.undo(); } if (mod && k === 'y') { e.preventDefault(); return this.redo(); }
        if (mod && k === 'd') { e.preventDefault(); return this.duplicate(); } if (mod && k === 'g') { e.preventDefault(); return this.group(!e.shiftKey); }
        if (k === 'delete' || k === 'backspace') { if (this.sel.size) { e.preventDefault(); this.deleteSel(); } return; }
        if (k === 'enter' && this.sel.size === 1) { const it = this.selItems()[0]; if (isTextual(it) || it.type === 'frame') { e.preventDefault(); this.startEdit(it); } return; }
        if (/^arrow(up|down|left|right)$/.test(k) && this.sel.size) { e.preventDefault(); const s = e.shiftKey ? 10 : 1; const dx = k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0, dy = k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0; const before = this.snap(this.sel); const after = before.map(x => this.shifted(x, dx, dy)); this.apply(after); return this.commit(before, after); }
        if (!mod && KEY_TOOL[k]) { e.preventDefault(); this.setTool(KEY_TOOL[k]); }
      }
      // ---- указатель ----
      hitId(e, live) { // live — во время перетаскивания события приходят на захвативший элемент, ищем по координатам
        let t = e.target; if (live) { const under = document.elementsFromPoint(e.clientX, e.clientY); t = under.find(x => x.closest && x.closest('.bd-it') && !x.closest('.bd-sel')) || under.find(x => x.closest && x.closest('g[data-id]')) || null; }
        if (!t || !t.closest) return ''; const el = t.closest('.bd-it'); if (el) return el.dataset.id; const g = t.closest('g[data-id]'); return g ? g.dataset.id : ''; }
      down(e) {
        if (this.editing && !(e.target.closest && e.target.closest('.bd-edit'))) this.endEdit(true);
        if (e.target.closest && (e.target.closest('.bd-ctx') || e.target.closest('.bd-edit') || e.target.closest('.bd-cm'))) return;
        this.root.focus({ preventScroll: true }); this.vp.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.drag = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0: Object.assign({}, this.view) }; return; }
        const w = this.toWorld(e.clientX, e.clientY); const id = this.hitId(e); const handle = e.target.closest && e.target.closest('.bd-h');
        const pan = this.space || this.tool === 'hand' || e.button === 1 || e.button === 2 || (e.pointerType === 'touch' && !id && this.tool === 'select');
        if (pan) { this.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, v0: Object.assign({}, this.view) }; this.vp.classList.add('panning'); return; }
        if (this.tool === 'comment') { e.preventDefault(); this.setTool('select'); const it = id && this.items.get(id); if (it && it.type !== 'arrow') this.openNew(it.id, it.x + it.w, it.y); else this.openNew('', w.x, w.y); return; }
        if (!this.canEdit) { if (id) { this.sel = new Set([id]); this.renderSel(); } else if (!e.shiftKey) { this.sel.clear(); this.renderSel(); } return; }
        if (handle) { const it = this.selItems()[0]; this.drag = { mode: 'resize', h: handle.dataset.h, it0: clone(it), w0: w, ids: new Set([it.id]), arrowsBefore: this.snap(this.attachedArrows([it.id])) }; return; }
        if (['sticky', 'text', 'frame', 'rect'].includes(this.tool)) { e.preventDefault(); const d = BD.DEFAULTS[this.tool]; const it = this.create(this.tool, w.x - (this.tool === 'frame' ? 0 : d.w / 2), w.y - (this.tool === 'frame' ? 0 : d.h / 2)); this.setTool('select'); this.pointers.delete(e.pointerId); try { this.vp.releasePointerCapture(e.pointerId); } catch { } this.startEdit(it); return; }
        if (this.tool === 'arrow') { const from = id && this.items.get(id) && this.items.get(id).type !== 'arrow' ? id : ''; const it = this.newItem('arrow', w.x, w.y, { props: { from, x2: w.x, y2: w.y } }); this.items.set(it.id, it); this.drawArrows(); this.drag = { mode: 'arrow', it, ids: new Set([it.id]) }; return; }
        if (id) {
          const it = this.items.get(id); if (e.shiftKey) { if (this.sel.has(id)) this.sel.delete(id); else this.sel.add(id); } else if (!this.sel.has(id)) this.sel = new Set([id]);
          this.expandGroups(); this.renderSel(); if (it.props.locked && !e.shiftKey) return;
          const ids = new Set([...this.sel].filter(x => !(this.items.get(x) || {}).props.locked)); const all = [...this.items.values()];
          for (const fid of [...ids]) { const f = this.items.get(fid); if (f && f.type === 'frame') for (const ch of BD.insideFrame(f, all)) if (!ch.props.locked) ids.add(ch.id); }
          for (const a of all) if (a.type === 'arrow' && !ids.has(a.id) && a.props.from && a.props.to && ids.has(a.props.from) && ids.has(a.props.to)) ids.add(a.id);
          this.drag = { mode: 'move', w0: w, ids, before: this.snap(ids), arrowsBefore: this.snap(this.attachedArrows(ids)), moved: false, pointerType: e.pointerType }; return;
        }
        if (!e.shiftKey) { this.sel.clear(); this.renderSel(); }
        this.drag = { mode: 'band', sx: e.clientX, sy: e.clientY, add: e.shiftKey ? new Set(this.sel) : new Set() };
      }
      move(e) {
        this.cursor = this.toWorld(e.clientX, e.clientY);
        const p = this.pointers.get(e.pointerId); if (p) { p.x = e.clientX; p.y = e.clientY; } const d = this.drag; if (!d) return;
        if (d.mode === 'pinch') { if (this.pointers.size < 2) return; const [a, b] = [...this.pointers.values()]; const dist = Math.hypot(a.x - b.x, a.y - b.y); const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; const r = this.vp.getBoundingClientRect(); const z = Math.min(4, Math.max(0.05, d.v0.z * dist / (d.d0 || 1))); const wx = (d.m0.x - r.left - d.v0.x) / d.v0.z, wy = (d.m0.y - r.top - d.v0.y) / d.v0.z; this.view = { z, x: m.x - r.left - wx * z, y: m.y - r.top - wy * z }; return this.applyView(); }
        if (d.mode === 'pan') { this.view.x = d.v0.x + e.clientX - d.sx; this.view.y = d.v0.y + e.clientY - d.sy; return this.applyView(); }
        const w = this.cursor;
        if (d.mode === 'band') { this.band.hidden = false; const r = this.vp.getBoundingClientRect(); const x1 = Math.min(d.sx, e.clientX) - r.left, y1 = Math.min(d.sy, e.clientY) - r.top; Object.assign(this.band.style, { left: x1 + 'px', top: y1 + 'px', width: Math.abs(e.clientX - d.sx) + 'px', height: Math.abs(e.clientY - d.sy) + 'px' }); return; }
        if (d.mode === 'move') { const dx = w.x - d.w0.x, dy = w.y - d.w0.y; if (Math.abs(dx) + Math.abs(dy) > 0.5) d.moved = true; for (const s of d.before) { const it = this.items.get(s.id); if (!it) continue; it.x = s.x + dx; it.y = s.y + dy; if (it.type === 'arrow') { it.props.x2 = s.props.x2 + dx; it.props.y2 = s.props.y2 + dy; } this.draw(it); } this.drawArrows(); this.renderSel(); return; }
        if (d.mode === 'resize') { const it = this.items.get(d.it0.id); if (!it) return; const o = d.it0; let x = o.x, y = o.y, wd = o.w, ht = o.h; const dx = w.x - d.w0.x, dy = w.y - d.w0.y; const h = d.h; if (/e/.test(h)) wd = o.w + dx; if (/s/.test(h)) ht = o.h + dy; if (/w/.test(h)) { wd = o.w - dx; x = o.x + dx; } if (/n/.test(h)) { ht = o.h - dy; y = o.y + dy; } const keep = (it.type === 'image' || it.type === 'pdf') && h.length === 2 && !e.shiftKey; if (keep) { const k = Math.max(wd / o.w, ht / o.h); wd = o.w * k; ht = o.h * k; if (/w/.test(h)) x = o.x + o.w - wd; if (/n/.test(h)) y = o.y + o.h - ht; } if (wd < 16) { wd = 16; if (/w/.test(h)) x = o.x + o.w - 16; } if (ht < 16) { ht = 16; if (/n/.test(h)) y = o.y + o.h - 16; } Object.assign(it, { x, y, w: wd, h: ht }); this.draw(it); this.drawArrows(); this.renderSel(); d.moved = true; return; }
        if (d.mode === 'arrow') { const it = d.it; const id = this.hitId(e, true); const target = id && id !== it.props.from && this.items.get(id) && this.items.get(id).type !== 'arrow' ? id : ''; it.props.to = target; it.props.x2 = w.x; it.props.y2 = w.y; d.moved = true; this.drawArrows(); }
      }
      up(e) {
        this.pointers.delete(e.pointerId); try { this.vp.releasePointerCapture(e.pointerId); } catch { } const d = this.drag; if (!d) return;
        if (d.mode === 'pinch') { if (!this.pointers.size) this.drag = null; return; }
        this.drag = null; this.vp.classList.remove('panning');
        if (d.mode === 'band') { this.band.hidden = true; const a = this.toWorld(d.sx, d.sy), b = this.toWorld(e.clientX, e.clientY); const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; if (r.w > 3 || r.h > 3) { this.sel = new Set(d.add); for (const it of this.items.values()) { const box = it.type === 'arrow' ? BD.arrowBox(it) : it; if (it.type === 'frame' ? BD.contains(r, box) : BD.intersects(r, box)) this.sel.add(it.id); } this.expandGroups(); } this.renderSel(); return; }
        if (d.mode === 'move' || d.mode === 'resize') { if (!d.moved) return; const before = (d.mode === 'move' ? d.before : [d.it0]).concat(d.arrowsBefore || []); const after = this.snap(d.ids).concat(this.freshArrows(d.ids)); this.commit(before, after); this.placeCms(); return; }
        if (d.mode === 'arrow') { const it = d.it; const len = Math.hypot(it.props.x2 - it.x, it.props.y2 - it.y); if (!d.moved || (len < 12 && !it.props.to)) { this.items.delete(it.id); this.drawArrows(); this.setTool('select'); return; } this.apply([it]); this.sel = new Set([it.id]); this.renderSel(); this.commit([], [it]); this.setTool('select'); }
      }
      dbl(e) { if (!this.canEdit) return; const id = this.hitId(e); const it = id && this.items.get(id); if (it && (isTextual(it) || it.type === 'frame')) { this.startEdit(it); return; } if (!id && this.tool === 'select') { const w = this.toWorld(e.clientX, e.clientY); const s = this.create('sticky', w.x - 100, w.y - 100); this.startEdit(s); } }
      // ---- редактирование текста ----
      startEdit(it) {
        if (this.editing) this.endEdit(true); if (it.props.locked) return; this.editing = it.id; const isTitle = it.type === 'frame';
        const ta = document.createElement('textarea'); ta.className = 'bd-edit' + (it.type === 'text' ? ' text' : isTitle ? ' title' : ''); ta.value = isTitle ? it.props.title : it.props.text; ta.style.fontSize = isTitle ? 'max(18px, calc(13px / var(--z, 1)))' : `max(${it.props.size}px, calc(11px / var(--z, 1)))`;
        const cur = this.items.get(it.id) || it;
        if (isTitle) { ta.style.transform = `translate(${cur.x}px, ${cur.y - 30}px)`; ta.style.width = cur.w + 'px'; ta.style.height = '30px'; } else { ta.style.transform = `translate(${cur.x}px, ${cur.y}px)`; ta.style.width = cur.w + 'px'; ta.style.height = cur.h + 'px'; if (it.type === 'sticky' || it.type === 'rect') ta.style.background = fill(cur.props.color); if (it.type === 'text' && it.props.color) ta.style.color = fill(it.props.color); if (it.type === 'rect') ta.style.textAlign = 'center'; }
        ta.style.zIndex = '999999'; this.world.appendChild(ta); const el = this.elOf(it.id); if (el && !isTitle) el.style.visibility = 'hidden'; this.ta = ta;
        ta.oninput = () => { if (it.type === 'text') { ta.style.height = 'auto'; const h = Math.max(BD.DEFAULTS.text.h, ta.scrollHeight); ta.style.height = h + 'px'; } };
        ta.addEventListener('pointerdown', ev => ev.stopPropagation()); ta.addEventListener('wheel', ev => ev.stopPropagation()); ta.onblur = () => { if (this.editing === it.id) this.endEdit(true); };
        ta.focus({ preventScroll: true }); ta.select(); requestAnimationFrame(() => { if (this.ta === ta && document.activeElement !== ta) { ta.focus({ preventScroll: true }); ta.select(); } });
      }
      endEdit(save) {
        const id = this.editing; const ta = this.ta; if (!id || !ta) return; this.editing = null; this.ta = null; const it = this.items.get(id); const el = this.elOf(id); if (el) el.style.visibility = '';
        const val = ta.value; const grown = it && it.type === 'text' ? Math.max(BD.DEFAULTS.text.h, ta.scrollHeight) : 0; ta.remove(); if (!it || !save) return;
        const before = [clone(it)]; const c = clone(it); if (it.type === 'frame') c.props.title = val.trim().slice(0, BD.MAX_TITLE) || 'Рамка'; else c.props.text = val.slice(0, BD.MAX_TEXT); if (grown) c.h = grown;
        if (JSON.stringify(before[0]) === JSON.stringify(c)) return; this.apply([c]); this.commit(before, [c]);
      }
      // ---- комментарии ----
      placeCms() { const get = id => this.items.get(id) || null; for (const el of this.lCms.children) { const c = this.comments.get(el.dataset.id); if (!c) continue; const a = BD.commentAnchor(c, get); el.style.setProperty('--x', a.x + 'px'); el.style.setProperty('--y', a.y + 'px'); } }
      renderComments() {
        const layer = this.lCms; if (!layer) return; const keep = new Set(); const get = id => this.items.get(id) || null; const ths = BD.threads([...this.comments.values()]);
        for (const t of ths) { if (t.resolved && !this.showResolved && this.side.id !== t.id) continue; keep.add(t.id); let el = layer.querySelector(`[data-id="${CSS.escape(t.id)}"]`); if (!el) { el = document.createElement('div'); el.dataset.id = t.id; el.addEventListener('pointerdown', ev => ev.stopPropagation()); el.onclick = ev => { ev.stopPropagation(); this.openThread(t.id); }; layer.appendChild(el); }
          el.className = 'bd-cm' + (t.resolved ? ' res' : '') + (this.side.id === t.id ? ' on' : ''); el.innerHTML = `💬${t.replies.length ? `<b>${t.replies.length + 1}</b>` : ''}`; el.title = `${t.userName}: ${t.text.slice(0, 80)}`; const a = BD.commentAnchor(t, get); el.style.setProperty('--x', a.x + 'px'); el.style.setProperty('--y', a.y + 'px'); }
        for (const el of [...layer.children]) if (!keep.has(el.dataset.id)) el.remove();
        const n = BD.openComments([...this.comments.values()]); const cn = this.root.querySelector('.bd-cmn'); if (cn) cn.textContent = n ? String(n) : '';
        if (this.side.mode === 'thread' || this.side.mode === 'list') this.renderSide();
      }
      openNew(itemId, x, y) { this.side = { mode: 'new', id: '', itemId, x, y }; this.renderSide(); const ta = this.sideEl.querySelector('textarea'); if (ta) ta.focus(); }
      openThread(id) { this.side = { mode: 'thread', id }; this.renderSide(); this.renderComments(); const c = this.comments.get(id); if (c) { const a = BD.commentAnchor(c, i => this.items.get(i) || null); const vb = this.viewBox(); if (!BD.intersects(vb, { x: a.x, y: a.y, w: 1, h: 1 })) this.focusPoint(a.x, a.y); } }
      openList() { this.side = { mode: 'list', id: '' }; this.renderSide(); }
      closeSide() { const was = this.side.id; this.side = { mode: '', id: '' }; this.sideEl.hidden = true; this.sideEl.innerHTML = ''; if (was) this.renderComments(); }
      renderSide() {
        const s = this.side; const el = this.sideEl; if (!s.mode) return; el.hidden = false; const all = [...this.comments.values()]; const get = id => this.items.get(id) || null; const canDel = c => c.userId === this.me || this.board.canManage;
        const msg = c => `<div class="bd-msg" data-id="${esc(c.id)}"><div class="who">${avatar(c.userId, c.userName)}<span class="grow"><b>${esc(c.userName)}</b> · ${esc(when(c.createdAt))}</span>${canDel(c) ? `<button class="icon-btn" data-del="${esc(c.id)}" title="Удалить">✕</button>` : ''}</div><div class="tx">${esc(c.text)}</div></div>`;
        if (s.mode === 'list') {
          const ths = BD.threads(all).filter(t => this.showResolved || !t.resolved);
          el.innerHTML = `<div class="hd"><span class="grow">Комментарии · ${BD.openComments(all)} нерешённых</span><label class="faint" style="font-weight:400;display:inline-flex;gap:4px;align-items:center"><input type="checkbox" data-sr${this.showResolved ? ' checked' : ''} style="width:auto"> решённые</label><button class="icon-btn" data-close>✕</button></div><div class="bd-msgs">${ths.length ? ths.map(t => `<div class="bd-th${t.resolved ? ' res' : ''}" data-open="${esc(t.id)}"><div class="t">${esc(t.text)}</div><div class="m">${esc(t.userName)} · ${esc(when(t.createdAt))}${t.replies.length ? ` · ответов ${t.replies.length}` : ''}${t.itemId && get(t.itemId) ? ` · ${esc(BD.itemLabel(get(t.itemId)))}` : ' · место на доске'}${t.resolved ? ' · решено' : ''}</div></div>`).join('') : '<div class="faint" style="padding:12px 0">Комментариев нет. Инструмент 💬 слева — щёлкните по объекту или месту.</div>'}</div>`;
          el.querySelectorAll('[data-open]').forEach(x => x.onclick = () => this.openThread(x.dataset.open)); const sr = el.querySelector('[data-sr]'); if (sr) sr.onchange = () => { this.showResolved = sr.checked; this.renderComments(); this.renderSide(); };
        } else if (s.mode === 'new') {
          const it = s.itemId ? get(s.itemId) : null;
          el.innerHTML = `<div class="hd"><span class="grow">Новый комментарий</span><button class="icon-btn" data-close>✕</button></div><div class="bd-msgs"><div class="faint">${it ? esc(BD.itemLabel(it)) : 'Место на доске'}</div></div><div class="ft"><textarea placeholder="Что уточнить или решить?" maxlength="${BD.MAX_COMMENT}"></textarea><button class="btn primary block" data-send style="margin-top:6px">Отправить</button></div>`;
          el.querySelector('[data-send]').onclick = () => this.postComment({ itemId: s.itemId, x: s.x, y: s.y, text: el.querySelector('textarea').value });
        } else {
          const t = BD.threads(all).find(x => x.id === s.id); if (!t) return this.closeSide(); const it = t.itemId ? get(t.itemId) : null;
          el.innerHTML = `<div class="hd"><span class="grow" title="${it ? esc(BD.itemLabel(it)) : 'Место на доске'}">${it ? esc(BD.itemLabel(it)) : 'Место на доске'}</span><button class="btn sm ${t.resolved ? '' : 'primary'}" data-res="${t.resolved ? '0' : '1'}" title="${t.resolved ? 'Открыть снова' : 'Отметить решённым'}">${t.resolved ? '↺ Открыть' : '✓ Решено'}</button><button class="icon-btn" data-goto title="Показать на доске">◎</button><button class="icon-btn" data-close>✕</button></div><div class="bd-msgs">${t.resolved ? `<div class="chip ok" style="margin-bottom:6px">решено${t.resolvedByName ? ' · ' + esc(t.resolvedByName) : ''}</div>` : ''}${msg(t)}${t.replies.map(msg).join('')}</div><div class="ft"><textarea placeholder="Ответить…" maxlength="${BD.MAX_COMMENT}"></textarea><button class="btn block" data-send style="margin-top:6px">Ответить</button></div>`;
          el.querySelector('[data-send]').onclick = () => this.postComment({ parentId: t.id, text: el.querySelector('textarea').value });
          el.querySelector('[data-res]').onclick = async ev => { try { const r = await api(`/board/boards/${encodeURIComponent(this.boardId)}/comments/${encodeURIComponent(t.id)}`, { method: 'PUT', body: { resolved: ev.currentTarget.dataset.res === '1' } }); this.comments.set(r.comment.id, r.comment); this.rev = Math.max(this.rev, r.rev || 0); this.renderComments(); } catch (e) { toast(e.message, 4000); } };
          el.querySelector('[data-goto]').onclick = () => { const a = BD.commentAnchor(t, get); this.focusPoint(a.x, a.y); if (it) { this.sel = new Set([it.id]); this.renderSel(); } };
          el.querySelectorAll('[data-del]').forEach(x => x.onclick = async () => { if (!confirm('Удалить комментарий?')) return; try { const r = await api(`/board/boards/${encodeURIComponent(this.boardId)}/comments/${encodeURIComponent(x.dataset.del)}`, { method: 'DELETE' }); for (const id of r.deleted) this.comments.delete(id); this.rev = Math.max(this.rev, r.rev || 0); if (r.deleted.includes(t.id)) this.closeSide(); this.renderComments(); } catch (e) { toast(e.message, 4000); } });
        }
        const cl = el.querySelector('[data-close]'); if (cl) cl.onclick = () => this.closeSide();
        const ta = el.querySelector('textarea'); if (ta) ta.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); el.querySelector('[data-send]').click(); } };
      }
      async postComment(body) {
        if (!String(body.text || '').trim()) return toast('Напишите текст комментария');
        try { const r = await api(`/board/boards/${encodeURIComponent(this.boardId)}/comments`, { method: 'POST', body: Object.assign({ client: this.client }, body) }); this.comments.set(r.comment.id, r.comment); this.rev = Math.max(this.rev, r.rev || 0); this.openThread(r.comment.parentId || r.comment.id); }
        catch (e) { toast(e.message, 5000); }
      }
      // ---- экспорт PNG / PDF ----
      exportMenu(frame) {
        const m = this.root.querySelector('.bd-menu'); if (!frame && !m.hidden) { m.hidden = true; return; }
        const fr = frame || (this.selItems().length === 1 && this.selItems()[0].type === 'frame' ? this.selItems()[0] : null);
        m.innerHTML = `<button data-e="png">PNG — вся доска</button><button data-e="pdf">PDF — вся доска</button><button data-e="png-frame"${fr ? '' : ' disabled'}>PNG — рамка${fr ? ' «' + esc(fr.props.title) + '»' : ' (выделите рамку)'}</button><button data-e="pdf-frame"${fr ? '' : ' disabled'}>PDF — рамка</button>`; m.hidden = false;
        m.querySelectorAll('[data-e]').forEach(bt => bt.onclick = () => { m.hidden = true; const [kind, scope] = bt.dataset.e.split('-'); this.exportAs(kind, scope === 'frame' ? fr : null); });
      }
      async exportAs(kind, frame) {
        const all = [...this.items.values()]; let items = all; if (frame) { const inside = BD.insideFrame(frame, all); const ids = new Set([frame.id, ...inside.map(i => i.id)]); items = [frame, ...inside, ...all.filter(a => a.type === 'arrow' && ids.has(a.props.from) && ids.has(a.props.to))]; }
        const box = frame ? { x: frame.x, y: frame.y - 30, w: frame.w, h: frame.h + 30 } : BD.bbox(items); if (!box) return toast('На доске пусто');
        const name = `${this.board.title}${frame ? ' — ' + frame.props.title : ''}`.replace(/[\\/:*?"<>|]/g, ' ').trim();
        try {
          this.status('Экспорт…'); const cv = await renderCanvas(items, box, this.boardId);
          if (kind === 'png') { await new Promise(res => cv.toBlob(b => { download(b, name + '.png'); res(); }, 'image/png')); }
          else { const jsPDF = await jspdf(); const w = cv.width, h = cv.height; const doc = new jsPDF({ orientation: w >= h ? 'l' : 'p', unit: 'px', format: [w, h], hotfixes: ['px_scaling'], compress: true }); doc.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h); doc.save(name + '.pdf'); }
          this.status(this.canEdit ? 'Сохранено' : 'Только просмотр'); toast(`Экспорт готов: ${name}.${kind}`);
        } catch (e) { this.status('Ошибка экспорта', true); toast(e.message, 5000); }
      }
      // ---- файлы ----
      async upload(file, at) {
        if (!this.canEdit) return toast('У вас только просмотр'); if (!BD.FILE_TYPES[file.type]) return toast('Можно: PNG, JPG, WebP, GIF, PDF', 4000); if (file.size > BD.MAX_FILE) return toast('Файл больше 20 МБ', 4000);
        try {
          if (file.type === 'application/pdf') return await this.uploadPdf(file, at);
          this.status('Загрузка ' + file.name + '…'); const [b64, size] = await Promise.all([readB64(file), imgSize(file)]);
          const f = await api(`/board/boards/${encodeURIComponent(this.boardId)}/files`, { method: 'POST', body: { name: file.name, type: file.type, data: b64, client: this.client } });
          const k = Math.min(1, 600 / (size.w || 600)); const w = Math.round(size.w * k), h = Math.round(size.h * k);
          this.create('image', at.x - w / 2, at.y - h / 2, { geom: { w, h }, props: { src: f.key, name: file.name } }); this.status('Сохранено');
        } catch (e) { this.status('Ошибка загрузки', true); toast(e.message, 5000); }
      }
      async uploadPdf(file, at) {
        this.status('Читаю PDF…'); const lib = await pdfjs(); const buf = await file.arrayBuffer(); const doc = await lib.getDocument({ data: buf.slice(0) }).promise; const n = doc.numPages;
        const pages = n === 1 ? [1] : await new Promise(res => { modal(`PDF · ${n} стр.`, formHtml([{ name: 'pages', label: 'Какие страницы положить на доску (например 1 или 1-3,5; до 30)', value: '1' }], {}, 'Разместить'), async v => { res(parsePages(v.pages, n)); }); const m = $('#modal'); const obs = new MutationObserver(() => { if (m.hidden) { obs.disconnect(); res(null); } }); obs.observe(m, { attributes: true }); });
        if (!pages || !pages.length) { this.status('Сохранено'); return; }
        this.status('Загрузка PDF…'); const orig = await api(`/board/boards/${encodeURIComponent(this.boardId)}/files`, { method: 'POST', body: { name: file.name, type: 'application/pdf', data: await readB64(file), client: this.client } });
        let x = at.x; const created = [];
        for (const p of pages) {
          this.status(`Страница ${p} из ${pages.length}…`); const page = await doc.getPage(p); const v1 = page.getViewport({ scale: 1 }); const scale = Math.min(3, 1600 / v1.width); const vp = page.getViewport({ scale }); const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
          await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; const blob = await new Promise(r => cv.toBlob(r, 'image/png')); const b64 = await readB64(blob);
          const f = await api(`/board/boards/${encodeURIComponent(this.boardId)}/files`, { method: 'POST', body: { name: `${file.name} · стр. ${p}.png`, type: 'image/png', data: b64, client: this.client } });
          const w = Math.round(v1.width * 1.2), h = Math.round(v1.height * 1.2); const it = this.newItem('pdf', x, at.y, { geom: { w, h }, props: { src: f.key, pdf: orig.key, name: file.name, page: p, pages: n } }); this.apply([it]); created.push(it); x += w + 40;
        }
        this.sel = new Set(created.map(it => it.id)); this.renderSel(); this.commit([], created); this.status('Сохранено');
      }
      // ---- настройки доски ----
      settings() { boardSettings(this.board, () => api(`/board/boards/${encodeURIComponent(this.boardId)}`).then(d => { this.board = d.board; this.canEdit = !!d.board.canEdit; this.build(); this.renderAll(); this.applyView(); }), () => { location.hash = '#/boards'; }); }
    }

    // ---- форма доски: название, проект, «Кто правит», участники ----
    function boardForm(b, projects, modes) {
      const chosen = new Set(b && b.members || []); const others = people().filter(p => p.id !== me().id && (!b || p.id !== b.ownerId));
      return `<form>${formHtml([{ name: 'title', label: 'Название', required: !b }, { name: 'pmProjectId', label: 'Проект', type: 'select', options: [['', '— свободная доска —'], ...projects.map(p => [p.id, `${p.name}${p.track ? ' · ' + (TRACK[p.track] || p.track) : ''}`])] }, { name: 'editMode', label: 'Кто правит (владелец доски, ПМ/ГИП проекта, владелец и партнёр компании правят всегда)', type: 'select', options: Object.entries(modes) }, ...(b ? [] : [{ name: 'template', label: 'Шаблон', type: 'select', options: [['', 'Пустая'], ['ep', 'Шаблон ЭП: ТЗ и исходные, Участок, Аналоги, Концепция, Замечания, Решения']] }])], b || { editMode: 'all' }).replace(/^<form>|<div class="error"><\/div><button[\s\S]*$/g, '')}<div class="field"><label>Участники (для режима «участники доски»)</label><div class="bd-mem">${others.map(p => `<label><input type="checkbox" name="m_${esc(p.id)}"${chosen.has(p.id) ? ' checked' : ''}>${esc(p.name)}${p.roleLabel ? ` <span class="faint">${esc(p.roleLabel)}</span>` : ''}</label>`).join('') || '<span class="faint">других пользователей нет</span>'}</div></div><div class="error"></div><button class="btn primary block" type="submit">${b ? 'Сохранить' : 'Создать'}</button>${b && b.canDelete ? '<button class="btn danger block" type="button" data-bd-del style="margin-top:8px">Удалить доску</button>' : ''}</form>`;
    }
    const formBody = v => ({ title: v.title, pmProjectId: v.pmProjectId, editMode: v.editMode, template: v.template, members: Object.keys(v).filter(k => k.startsWith('m_')).map(k => k.slice(2)) });
    async function boardSettings(b, after, afterDelete) {
      const d = await api('/board/boards'); const projects = d.projects.slice(); if (b.pmProjectId && !projects.some(p => p.id === b.pmProjectId) && b.project) projects.unshift(b.project);
      modal('Доска', boardForm(b, projects, d.modes), async v => { await api(`/board/boards/${encodeURIComponent(b.id)}`, { method: 'PUT', body: formBody(v) }); toast('Сохранено'); if (after) after(); });
      const del = $('#modal [data-bd-del]'); if (del) del.onclick = async () => { if (!confirm(`Удалить доску «${b.title}» со всеми объектами, комментариями и файлами?`)) return; try { await api(`/board/boards/${encodeURIComponent(b.id)}`, { method: 'DELETE' }); ui.closeModal(); toast('Доска удалена'); if (afterDelete) afterDelete(); else route(); } catch (e) { toast(e.message, 4000); } };
    }
    function createBoard(preset, after) {
      api('/board/boards').then(d => { modal(preset && preset.template === 'ep' ? 'Доска из шаблона ЭП' : 'Новая доска', boardForm(null, d.projects, d.modes), async v => { const r = await api('/board/boards', { method: 'POST', body: formBody(v) }); toast('Доска создана'); if (after) after(r); else location.hash = `#/board?id=${encodeURIComponent(r.board.id)}`; }); const f = $('#modal form'); if (!f) return;
        const trackOf = id => { const p = d.projects.find(x => x.id === id); return p ? p.track : (preset && preset.pmProjectId === id ? preset.track || '' : ''); };
        const syncTpl = () => { const pid = f.pmProjectId.value; const ok = !pid || trackOf(pid) === 'ep'; f.template.disabled = !ok; if (!ok) f.template.value = ''; f.template.title = ok ? '' : 'Шаблон ЭП — только для эскизного проекта'; }; // шаблон ЭП — только для ЭП
        if (preset) { if (preset.template) f.template.value = preset.template; if (preset.pmProjectId) { f.pmProjectId.value = preset.pmProjectId; const p = d.projects.find(x => x.id === preset.pmProjectId); if (p && !f.title.value) f.title.value = `${p.name} · ${preset.template === 'ep' ? 'ЭП' : 'доска'}`; } }
        f.pmProjectId.onchange = syncTpl; syncTpl(); }).catch(e => toast(e.message, 4000));
    }

    // ---- экран «Доски» ----
    ui.SECTIONS.boards = async main => {
      document.body.classList.remove('bd-full'); const u = params(); const q = (u.get('q') || '').trim(), pid = u.get('pid') || '', mine = u.get('mine') === '1';
      const d = await api('/board/boards?' + qsOf({ q, pid, mine: mine ? '1' : '' }));
      const leader = BD.isLeader(me(), window.MostPM);
      main.innerHTML = head('Доски', `${d.boards.length} досок · своя доска вместо Miro: файлы и данные на нашем сервере, видят и правят все`, (leader ? '<button class="btn" data-act="bdMiro" title="JSON от modules/board/tools/miro_import.js">⇪ Импорт из Miro</button> ' : '') + '<button class="btn" data-act="bdNewEp">+ Из шаблона ЭП</button> <button class="btn primary" data-act="bdNew">+ Доска</button>') +
        `<div class="filters"><input id="bd-q" placeholder="Поиск: название, проект" value="${esc(q)}">${sel('bd-pid', [['', 'Все проекты'], ...d.projects.map(p => [p.id, p.name])], pid)}<label class="fl"><input type="checkbox" id="bd-mine"${mine ? ' checked' : ''}> мои</label></div>` +
        (d.boards.length ? tbl([{ t: 'Доска' }, { t: 'Проект' }, { t: 'Кто правит' }, { t: 'Объектов', cls: 'amt' }, { t: 'Комментарии', cls: 'amt' }, { t: 'Изменена' }, { t: 'На доске' }, { t: '' }], d.boards.map(b => `<tr class="bd-row" data-id="${esc(b.id)}"><td><b>${esc(b.title)}</b>${b.template ? ' <span class="chip neutral">шаблон ЭП</span>' : ''}<div class="faint">${esc(b.ownerName)}${b.members.length ? ' + ' + b.members.length : ''}${b.canEdit ? '' : ' · только просмотр'}</div></td><td>${b.project ? `<a href="#/pmp?id=${encodeURIComponent(b.project.id)}">${esc(b.project.name)}</a> <span class="faint">${esc(TRACK[b.project.track] || '')}</span>` : '<span class="faint">свободная</span>'}</td><td>${chip(b.editMode, MODE_CHIP)}</td><td class="amt num">${b.itemsN}</td><td class="amt">${b.openComments ? `<span class="chip warn" title="нерешённых">💬 ${b.openComments}</span>` : '<span class="faint">—</span>'}</td><td class="nowrap">${fdate(String(b.updatedAt).slice(0, 10))}<div class="faint">${esc(b.updatedByName)}</div></td><td>${b.online ? `<span class="chip ok">сейчас ${b.online}</span>` : '<span class="faint">—</span>'}</td><td><div class="actions">${b.canManage ? `<button class="btn sm" data-act="bdSet" data-id="${esc(b.id)}" title="Настройки">⚙</button>` : ''}${b.canDelete ? `<button class="btn sm danger" data-act="bdDel" data-id="${esc(b.id)}" title="Удалить">✕</button>` : ''}</div></td></tr>`)) : empty(q || pid || mine ? 'Ничего не найдено' : 'Досок пока нет — создайте первую'));
      const nav = () => { location.hash = '#/boards?' + qsOf({ q: $('#bd-q').value.trim(), pid: $('#bd-pid').value, mine: $('#bd-mine').checked ? '1' : '' }); }; $('#bd-q').onkeydown = e => { if (e.key === 'Enter') nav(); }; $('#bd-pid').onchange = nav; $('#bd-mine').onchange = nav;
      main.querySelectorAll('tr.bd-row').forEach(tr => tr.onclick = () => { location.hash = `#/board?id=${encodeURIComponent(tr.dataset.id)}`; });
      ui.ACT.bdNew = () => createBoard({ pmProjectId: pid }); ui.ACT.bdNewEp = () => createBoard({ template: 'ep', pmProjectId: pid });
      ui.ACT.bdSet = ({ id }) => { const b = d.boards.find(x => x.id === id); if (b) boardSettings(b, () => route()); };
      // импорт доски Miro: JSON конвертера, на сервер частями по 200 объектов (картинки внутри JSON в base64)
      ui.ACT.bdMiro = () => modal('Импорт доски из Miro', `<p class="faint" style="margin:0 0 10px">JSON готовит <code>node modules/board/tools/miro_import.js</code> из canvas-SVG Miro (коннектор Miro, только чтение). Будет создана новая доска со ссылкой «Источник: Miro».</p><form><div class="field"><label>Файл JSON</label><input type="file" id="bd-miro-file" accept=".json,application/json" required></div><div class="field"><label>Название (пусто — из файла)</label><input name="title"></div><div class="field"><label>Проект</label><select name="pmProjectId">${[['', '— свободная доска —'], ...d.projects.map(p => [p.id, `${p.name}${p.track ? ' · ' + (TRACK[p.track] || p.track) : ''}`])].map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></div><div class="error"></div><button class="btn primary block" type="submit">Импортировать</button></form>`, async v => {
        const f = $('#bd-miro-file').files[0]; if (!f) throw new Error('Выберите файл'); let data; try { data = JSON.parse(await f.text()); } catch { throw new Error('Файл не читается как JSON'); }
        if (!Array.isArray(data.items)) throw new Error('В файле нет списка items'); const items = data.items; const chunk = 200; let boardId = '', added = 0;
        for (let i = 0; i < Math.max(1, items.length); i += chunk) { const r = await api('/board/import', { method: 'POST', body: { boardId, title: v.title || data.title, pmProjectId: v.pmProjectId || data.pmProjectId || '', sourceUrl: data.sourceUrl || '', items: items.slice(i, i + chunk), done: i + chunk >= items.length } }); boardId = r.boardId; added += r.added; toast(`Перенесено ${added} из ${items.length}…`, 2000); }
        toast(`Готово: перенесено ${added} объектов`, 6000); location.hash = `#/board?id=${encodeURIComponent(boardId)}`;
      });
      ui.ACT.bdDel = async ({ id }) => { const b = d.boards.find(x => x.id === id); if (!confirm(`Удалить доску «${b.title}» со всеми объектами, комментариями и файлами?`)) return; await api(`/board/boards/${encodeURIComponent(id)}`, { method: 'DELETE' }); toast('Удалено'); route(); };
      bind(main);
    };
    // ---- доска на весь экран ----
    ui.SECTIONS.board = async main => {
      const id = params().get('id'); if (!id) { location.hash = '#/boards'; return; }
      document.body.classList.add('bd-full'); main.innerHTML = '<div id="bd-root"></div>'; new Editor($('#bd-root'), id, { full: true });
    };
    // ---- встраивание в карточку проекта pm: window.MostBoard.embed(el, { pmProjectId, boardId?, height? }) ----
    window.MostBoard.Editor = Editor; window.MostBoard.renderCanvas = renderCanvas;
    window.MostBoard.embed = async (el, o) => {
      o = o || {}; el.innerHTML = '<div class="boot">Загрузка досок…</div>'; let ed = null;
      const draw = async () => {
        if (ed) { ed.destroy(); ed = null; } let d; try { d = await api('/board/by-project/' + encodeURIComponent(o.pmProjectId)); } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
        const cur = o.boardId && d.boards.some(b => b.id === o.boardId) ? o.boardId : (d.boards[0] || {}).id; const isEp = d.project.track === 'ep'; // шаблон ЭП и подпись «Доска ЭП» — только для эскизного проекта
        el.innerHTML = `<div class="head" style="margin-bottom:8px"><div class="grow">${d.boards.length > 1 ? `<select id="bd-emb-sel">${d.boards.map(b => `<option value="${esc(b.id)}"${b.id === cur ? ' selected' : ''}>${esc(b.title)}</option>`).join('')}</select>` : d.boards.length ? `<b>${esc(d.boards[0].title)}</b>` : '<span class="faint">У проекта ещё нет доски.</span>'}</div>${d.canCreate ? `<button class="btn" id="bd-emb-new">${isEp ? '+ Доска ЭП' : '+ Доска'}</button>` : ''}${cur ? `<a class="btn primary" href="#/board?id=${encodeURIComponent(cur)}">На весь экран ⤢</a>` : ''}</div><div id="bd-emb-root"></div>`;
        const s = el.querySelector('#bd-emb-sel'); if (s) s.onchange = () => { o.boardId = s.value; draw(); };
        const nb = el.querySelector('#bd-emb-new'); if (nb) nb.onclick = () => createBoard({ template: isEp ? 'ep' : '', pmProjectId: o.pmProjectId, track: d.project.track }, r => { o.boardId = r.board.id; draw(); });
        if (cur) { const root = el.querySelector('#bd-emb-root'); if (o.height) root.style.height = o.height; ed = new Editor(root, cur, { full: false }); }
      };
      await draw(); return { destroy: () => { if (ed) ed.destroy(); }, refresh: draw };
    };
  },
});
