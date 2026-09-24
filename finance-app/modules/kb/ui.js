/* Модуль «Знания» — экраны. Поток D. Помощники интерфейса приходят в init(ui) (см. docs/ARCHITECTURE.md). Логика — modules/kb/domain.js (window.MostKb). */
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'kb',
  title: 'Знания',
  nav: [
    { id: 'kbnews', label: 'Новости', icon: '📰' },
    { id: 'kbbase', label: 'База знаний', icon: '📚' },
    { id: 'kbcourses', label: 'Обучение', icon: '🎓' },
    { id: 'kbtests', label: 'Тесты', icon: '✔' },
    { id: 'kbsign', label: 'Ознакомление', icon: '✍' },
  ],
  routes: ['kbarticle', 'kbtest', 'kbattempt', 'kbenroll'], // карточки: #/kbarticle?id=…
  canOpen: u => !!u,
  // инструкция модуля (раздел «Инструкция» и кнопка «?» в шапке раздела): [заголовок, html, id раздела меню]
  help: [
    ['Что такое «Знания»', `
<p>Здесь всё, что нужно знать о работе в бюро: новости, регламенты и гайды, программа обучения новичков, тесты и документы, с которыми нужно ознакомиться.</p>
<p>Уведомлений на почту и в мессенджеры нет — всё, что ждёт вас, видно здесь:</p>
<ul>
<li><b>цифры в меню</b> — непрочитанные новости, программа обучения, тесты к сдаче, документы на ознакомление;</li>
<li><b>блок «Ждёт вас»</b> наверху раздела «Новости» — конкретные дела со ссылками: что прочитать, что сдать, какой следующий шаг обучения.</li>
</ul>
<p>Заходите хотя бы раз в день и доводите цифры в меню до нуля.</p>`],
    ['Новости', `
<ol>
<li>Откройте «Новости». Непрочитанные отмечены оранжевой полосой слева.</li>
<li>Прочитайте и нажмите <b>«Прочитал»</b> — руководители видят, дошла ли информация.</li>
<li>Закреплённые (📌) всегда сверху — это важное надолго.</li>
</ol>
<p><b>Кто публикует:</b> владелец, партнёр и секретарь — кнопка «+ Новость». Им же видно «прочитали N из M» (наведите мышь — будут имена), и они могут изменить (✎) или удалить (✕) новость. Текст можно размечать: строка с <code>#</code> — заголовок, с <code>-</code> — пункт списка.</p>`, 'kbnews'],
    ['База знаний', `
<ol>
<li>Выберите раздел вверху: Регламенты, Гайды, Стандарты Revit ADSK, Нормы, Документы для подписи. Цифра рядом — сколько статей.</li>
<li>Или наберите слово в поиске и нажмите Enter: ищет по названию, тегам и тексту («топосъемка» найдёт и «топосъёмку»).</li>
<li>Откройте статью. Открытая статья считается прочитанной — это засчитывается в программе обучения.</li>
<li>Внизу статьи — <b>файлы и ссылки</b>. Щелчок по сетевому пути (<code>\\\\MostServer\\…</code>, <code>Y:\\…</code>) копирует его: вставьте в адресную строку Проводника. Браузер сам сетевые файлы не открывает.</li>
<li>Если к статье есть тест — кнопка «Проверить себя».</li>
</ol>
<p><b>Кто пишет статьи:</b> владелец, партнёр и секретарь («+ Статья», ✎ в статье). «Импорт регламентов» загружает файл, который готовит скрипт <code>modules/kb/tools/import_kb.py</code> из папки «Регламенты» на сервере. «Стартовое наполнение» (владелец и партнёр) загружает статьи бюро, документы для подписи, тесты и программу стажировки; повторное нажатие ничего не дублирует.</p>`, 'kbbase'],
    ['Обучение', `
<p><b>Новичку.</b> Вверху — «Моё обучение»: программа, наставник и процент. Откройте её:</p>
<ol>
<li>Программа разбита по неделям. Идите по шагам сверху вниз.</li>
<li>Шаг «📄 статья» засчитывается сам, когда вы откроете статью; «✔ тест» — когда сдадите тест; «✍ подпись» — когда нажмёте «Ознакомлен» в документе.</li>
<li>Обычные задания (например, «получить доступы с наставником») отмечайте галочкой сами, когда сделали. Наставник тоже может отметить.</li>
<li>На 100 % программа сама становится «завершено».</li>
</ol>
<p><b>Наставнику и руководителю.</b> В таблице «Новички» — все, кого вы ведёте, с прогрессом. Руководитель раздела видит новичков своего раздела, владелец и партнёр — всех. В карточке новичка можно отмечать шаги, сменить наставника, поставить паузу, оставить заметку.</p>
<p><b>Кто назначает обучение и пишет программы:</b> владелец, партнёр и руководитель раздела (только в своём разделе) — кнопки «Назначить обучение» и «+ Программа». Программа пишется текстом: <code># Неделя 1</code> — неделя, <code>- шаг</code> — шаг; после шага через <code>|</code> можно указать <code>статья: …</code>, <code>тест: …</code> или <code>подпись: …</code>.</p>`, 'kbcourses'],
    ['Тесты', `
<ol>
<li>Откройте «Тесты» и нажмите <b>«Пройти»</b>. Рядом видно число вопросов, проходной балл и сколько попыток осталось.</li>
<li>Отметьте ответы. Где написано «несколько ответов» — выберите все верные.</li>
<li>Нажмите «Завершить и проверить». Сразу увидите балл и разбор: зелёным — правильные ответы, красным — ваши ошибки.</li>
<li>Не сдали — перечитайте «материал для подготовки» и нажмите «Пересдать». Когда попытки кончатся, обратитесь к руководителю.</li>
</ol>
<p>Вкладка «Мои попытки» — история с разбором каждой попытки. Руководители видят там результаты сотрудников (руководитель раздела — своего раздела).</p>
<p><b>Кто составляет тесты:</b> владелец, партнёр и руководители разделов («+ Тест»). Вопросы пишутся текстом: <code>?</code> вопрос, <code>+</code> верный вариант, <code>-</code> неверный; несколько <code>+</code> — вопрос с несколькими ответами. Балл — доля вопросов, отвеченных полностью верно.</p>`, 'kbtests'],
    ['Ознакомление с документами', `
<ol>
<li>В разделе — документы, с которыми нужно ознакомиться: соглашение о неразглашении, авторское право, материальная ответственность и другие.</li>
<li>Нажмите «Открыть», прочитайте документ полностью и нажмите <b>«Ознакомлен»</b>. Отметка сохраняется с датой.</li>
<li>Бумажный подписанный экземпляр передайте секретарю — отметка в системе его не заменяет.</li>
</ol>
<p>Владелец, партнёр и секретарь видят сводную таблицу «сотрудник × документ», руководитель раздела — по своему разделу. Новый документ — статья в разделе «Документы для подписи» базы знаний.</p>`, 'kbsign'],
  ],
  init(ui) {
    const { api, esc, fdate, head, tbl, empty, chip, modal, formHtml, toast, bind, params, route, ACT, SECTIONS, $ } = ui;
    const K = window.MostKb;
    const SIGN = 'Документы для подписи';
    let S = { canPublish: false, canTeach: false, isLeader: false, sections: K.SECTIONS };

    document.head.insertAdjacentHTML('beforeend', `<style>
.kb-feed{display:grid;gap:12px;max-width:860px}.kb-news.unread{border-left:3px solid var(--accent)}.kb-news h3{margin:0 0 4px;font-size:16px}.kb-meta{font-size:12px;color:var(--ink-faint);display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.kb-text{line-height:1.55;margin-top:8px;overflow-wrap:anywhere}.kb-text p{margin:6px 0}.kb-text h3{font-size:16px;margin:14px 0 6px}.kb-text h4{font-size:14px;margin:12px 0 4px}.kb-text ul{margin:4px 0;padding-left:20px}.kb-text li{margin:2px 0}.kb-text table{border-collapse:collapse;margin:8px 0;font-size:13px}.kb-text td,.kb-text th{border:1px solid var(--line);padding:4px 8px;vertical-align:top;text-align:left}.kb-text th{background:var(--panel-2);font-weight:600}.kb-text table{max-width:100%;display:block;overflow-x:auto}
.kb-path{font-family:ui-monospace,Consolas,monospace;font-size:12px;background:var(--panel-2);padding:1px 6px;border-radius:4px;cursor:pointer;word-break:break-all}
.kb-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}.kb-bar input[type=search]{flex:1;min-width:200px}.kb-bar .grow{flex:1}
.kb-list{display:grid;gap:8px;max-width:960px}.kb-item{display:block;text-decoration:none;color:inherit}.kb-item:hover{border-color:var(--accent)}.kb-item b{font-size:14.5px}.kb-snip{font-size:12.5px;color:var(--ink-soft);margin-top:4px}
.kb-pbar{height:8px;background:var(--panel-2);border-radius:99px;overflow:hidden;min-width:90px;margin:4px 0}.kb-pbar i{display:block;height:100%;background:var(--accent)}.kb-pbar.ok i{background:var(--ok)}
.kb-week{margin-bottom:12px}.kb-week h3{margin:0 0 8px;font-size:15px}.kb-step{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-top:1px solid var(--line)}.kb-step input,.kb-opt input{width:auto;flex:none;margin-top:3px}.kb-step .grow{flex:1}.kb-step.done .kb-st{color:var(--ink-soft)}
.kb-q{margin-bottom:12px}.kb-qt{font-weight:600;margin-bottom:8px;white-space:pre-line}.kb-opt{display:flex;gap:8px;align-items:flex-start;padding:5px 8px;border-radius:6px;cursor:pointer}.kb-opt:hover{background:var(--panel-2)}.kb-opt.right{background:var(--ok-bg)}.kb-opt.wrong{background:var(--crit-bg)}
.kb-editor textarea[name=text]{width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;min-height:300px}.kb-hint{font-size:12px;color:var(--ink-soft);margin:4px 0 8px;white-space:pre-line}
.kb-wait ul{margin:4px 0;padding-left:18px}.kb-wait li{margin:4px 0}.kb-wait>ul{list-style:none;padding-left:0}
.kb-matrix td,.kb-matrix th{text-align:center}.kb-matrix td:first-child,.kb-matrix th:first-child{text-align:left;white-space:nowrap}
</style>`);

    // ---------- общее ----------
    const wide = w => { const c = $('#modal .modal-card'); if (c) c.style.maxWidth = w; };
    function paintBadges() {
      for (const [id, n] of [['kbnews', S.unreadNews], ['kbsign', S.toSign], ['kbcourses', S.myEnrolls], ['kbtests', S.pendingTests]]) ui.setBadge(id, n); // ядро хранит счётчик и восстанавливает после перерисовки меню
    }
    async function loadSummary() { try { S = Object.assign(S, await api('/kb/summary')); } catch { } paintBadges(); return S; }
    // обёртка раздела: сводка (права + счётчики) до отрисовки, бейджи — после
    const section = fn => async main => { await loadSummary(); await fn(main); };
    const pbar = (pct, done) => `<div class="kb-pbar${done ? ' ok' : ''}" title="${pct}%"><i style="width:${pct}%"></i></div>`;
    const dt = iso => iso ? fdate(String(iso).slice(0, 10)) : '';
    const pathSpan = p => `<span class="kb-path" data-act="kbCopy" data-url="${esc(p)}" title="Скопировать путь — вставить в Проводник">${esc(p)}</span>`;
    const linkHtml = l => /^https?:\/\//i.test(l.url) ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title || l.url)}</a>` : `${l.title && l.title !== l.url ? esc(l.title) + ' — ' : ''}${pathSpan(l.url)}`;
    ACT.kbCopy = async ({ url }) => { try { await navigator.clipboard.writeText(url); toast('Путь скопирован — вставьте в адресную строку Проводника'); } catch { toast(url, 6000); } };
    // простая разметка: # заголовок, - список (отступ — вложенность), | таблица, **жирный**, http-ссылки
    function render(text) {
      const inline = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      const out = []; let list = 0, table = false;
      const closeList = () => { while (list > 0) { out.push('</ul>'); list--; } };
      const close = () => { closeList(); if (table) { out.push('</table>'); table = false; } };
      for (const raw of String(text || '').split(/\r?\n/)) {
        const line = raw.replace(/\s+$/, ''); if (!line.trim()) { close(); continue; }
        const h = line.match(/^(#{1,3})\s+(.*)$/); if (h) { close(); const tg = h[1].length === 1 ? 'h3' : 'h4'; out.push(`<${tg}>${inline(h[2])}</${tg}>`); continue; }
        const li = line.match(/^(\s*)[-•*]\s+(.*)$/);
        if (li) { if (table) { out.push('</table>'); table = false; } const lvl = Math.floor(li[1].replace(/\t/g, '  ').length / 2) + 1; while (list < lvl) { out.push('<ul>'); list++; } while (list > lvl) { out.push('</ul>'); list--; } out.push(`<li>${inline(li[2])}</li>`); continue; }
        if (/^\|/.test(line)) { closeList(); const first = !table; if (first) { out.push('<table>'); table = true; } const tg = first ? 'th' : 'td'; out.push('<tr>' + line.replace(/^\|\s*/, '').split('|').map(c => `<${tg}>${inline(c.trim())}</${tg}>`).join('') + '</tr>'); continue; } // первая строка таблицы — заголовок
        close(); out.push(`<p>${inline(line)}</p>`);
      }
      close(); return `<div class="kb-text">${out.join('')}</div>`;
    }
    const peopleOpts = first => [...(first ? [['', first]] : []), ...ui.state.people.map(p => [p.id, p.name + (p.section ? ' · ' + p.section : '')])];
    const bigText = rows => { const ta = $('#modal-body textarea[name=text]'); if (ta) ta.rows = rows; };

    // «Ждёт вас» — вместо уведомлений (решение директора): новости, документы, обучение, тесты
    const KIND_ICON = { article: '📄', test: '✔', sign: '✍', task: '☐' };
    function waitingHtml() {
      const w = S.waiting || {}; const items = [];
      for (const d of w.sign || []) items.push(`<li>✍ Ознакомиться: <a href="#/kbarticle?id=${d.id}">${esc(d.title)}</a></li>`);
      for (const t of w.tests || []) items.push(`<li>✔ Сдать тест: <a href="#/kbtest?id=${t.id}">${esc(t.title)}</a> <span class="faint">· ${esc(t.course)}</span></li>`);
      for (const c of w.courses || []) items.push(`<li>🎓 <a href="#/kbenroll?id=${c.enrollId}">${esc(c.course)}</a> — ${c.pct}%${c.next.length ? `<ul>${c.next.map(s => `<li>${KIND_ICON[s.kind] || '•'} ${s.refId ? `<a href="#/${s.kind === 'test' ? 'kbtest' : 'kbarticle'}?id=${s.refId}">${esc(s.title)}</a>` : esc(s.title)} <span class="faint">· ${esc(s.week)}</span></li>`).join('')}</ul>` : ''}</li>`);
      if (!items.length) return '';
      return `<div class="card kb-wait" style="max-width:860px;margin-bottom:14px"><div class="label"><span>Ждёт вас</span><span>${items.length}</span></div><ul>${items.join('')}</ul></div>`;
    }

    // ---------- новости ----------
    SECTIONS.kbnews = section(async main => {
      const list = await api('/kb/news');
      const btn = S.canPublish ? '<button class="btn primary" data-act="kbNewsAdd">+ Новость</button>' : '';
      main.innerHTML = head('Новости бюро', S.unreadNews ? `Непрочитанных: ${S.unreadNews}` : 'Всё прочитано', btn) + waitingHtml() + (list.length ? `<div class="kb-feed">${list.map(n => `<div class="card kb-news${n.read ? '' : ' unread'}">
        <div class="kb-meta">${n.pinned ? chip('pin', { pin: ['accent', '📌 закреплено'] }) : ''}<span>${fdate(n.date)}</span><span>${esc(n.author || '')}</span>${S.canPublish ? `<span title="${esc((n.readers || []).map(r => r.name).join(', '))}">прочитали ${n.readersN} из ${n.usersN}</span>` : ''}</div>
        <h3>${esc(n.title)}</h3>${render(n.text)}
        <div class="kb-bar" style="margin:10px 0 0">${n.read ? `<span class="chip ok">✓ прочитано ${dt(n.readAt)}</span>` : `<button class="btn sm primary" data-act="kbNewsRead" data-id="${n.id}">Прочитал</button>`}
        ${S.canPublish ? `<span class="grow"></span><button class="btn sm" data-act="kbNewsEdit" data-id="${n.id}">✎</button><button class="btn sm danger" data-act="kbNewsDel" data-id="${n.id}">✕</button>` : ''}</div></div>`).join('')}</div>` : empty('Новостей пока нет'));
      const byId = Object.fromEntries(list.map(n => [n.id, n]));
      const F = [{ name: 'title', label: 'Заголовок', required: true }, { name: 'text', label: 'Текст (# заголовок, - список)', type: 'textarea' }, { name: 'date', label: 'Дата', type: 'date', half: true }, { name: 'pinned', label: 'Закрепить сверху', type: 'select', options: [['false', 'Нет'], ['true', 'Да']], half: true }];
      ACT.kbNewsAdd = () => { modal('Новость', formHtml(F, { date: ui.today() }, 'Опубликовать'), async v => { await api('/kb/news', { method: 'POST', body: v }); toast('Опубликовано'); route(); }); bigText(10); wide('720px'); };
      ACT.kbNewsEdit = ({ id }) => { modal('Новость', formHtml(F, Object.assign({}, byId[id], { pinned: String(!!byId[id].pinned) })), async v => { await api('/kb/news/' + id, { method: 'PUT', body: v }); toast('Сохранено'); route(); }); bigText(10); wide('720px'); };
      ACT.kbNewsDel = async ({ id }) => { if (!confirm('Удалить новость?')) return; await api('/kb/news/' + id, { method: 'DELETE' }); route(); };
      ACT.kbNewsRead = async ({ id }) => { await api(`/kb/news/${id}/read`, { method: 'POST' }); route(); };
      bind(main);
    });

    // ---------- база знаний ----------
    const artForm = (a = {}) => `<form class="kb-editor">
      <div class="form-row">${ui.field({ name: 'title', label: 'Заголовок', required: true }, a.title)}${ui.field({ name: 'section', label: 'Раздел', type: 'select', options: [...new Set([...S.sections, ...(a.section ? [a.section] : [])])] }, a.section || 'Регламенты')}</div>
      ${ui.field({ name: 'tags', label: 'Теги через запятую' }, (a.tags || []).join(', '))}
      <div class="field"><label>Текст</label><textarea name="text">${esc(a.text || '')}</textarea><div class="kb-hint"># Заголовок · - пункт списка (отступ 2 пробела — вложенный) · | ячейка | ячейка — таблица · **жирный**</div></div>
      <div class="field"><label>Файлы и ссылки — по строке: Название | путь \\\\MostServer\\… , Y:\\… или https://…</label><textarea name="links" rows="3">${esc((a.links || []).map(l => (l.title && l.title !== l.url ? l.title + ' | ' : '') + l.url).join('\n'))}</textarea></div>
      <div class="error"></div><button class="btn primary block" type="submit">Сохранить</button></form>`;
    const artModal = (title, a, onSave) => { modal(title, artForm(a), onSave); wide('900px'); };
    SECTIONS.kbbase = section(async main => {
      const q = params().get('q') || '', sec = params().get('section') || '';
      const r = await api('/kb/articles?' + ui.qsOf({ q, section: sec }));
      const tabs = `<div class="tabs" style="flex-wrap:wrap"><a href="#/kbbase?${ui.qsOf({ q })}" class="${sec ? '' : 'active'}">Все</a>${[...new Set([...S.sections, ...Object.keys(r.counts)])].map(s => `<a href="#/kbbase?${ui.qsOf({ q, section: s })}" class="${s === sec ? 'active' : ''}">${esc(s)} <span class="faint">${r.counts[s] || 0}</span></a>`).join('')}</div>`;
      const btns = (S.isLeader ? '<button class="btn" data-act="kbSeed" title="Нормы, ADSK, документы для подписи, тест по регламенту РП, программа стажировки">Стартовое наполнение</button> ' : '') + (S.canPublish ? '<button class="btn" data-act="kbImport">Импорт регламентов</button> <button class="btn primary" data-act="kbArtAdd">+ Статья</button>' : '');
      main.innerHTML = head('База знаний', 'Регламенты, гайды, стандарты Revit ADSK, нормы', btns) + tabs +
        `<div class="kb-bar"><input type="search" id="kb-q" placeholder="Поиск по названию, тегам и тексту…" value="${esc(q)}"><button class="btn" id="kb-go">Найти</button></div>` +
        (r.items.length ? `<div class="kb-list">${r.items.map(a => `<a class="card kb-item" href="#/kbarticle?id=${a.id}"><div class="kb-meta"><span>${esc(a.section)}</span>${a.tags.map(t => `<span class="chip neutral">${esc(t)}</span>`).join('')}${a.sign ? (a.signed ? '<span class="chip ok">ознакомлен</span>' : '<span class="chip warn">нужно ознакомиться</span>') : a.read ? '<span class="chip neutral">прочитано</span>' : ''}${a.links ? `<span>📎 ${a.links}</span>` : ''}</div><b>${esc(a.title)}</b>${a.snippet ? `<div class="kb-snip">${esc(a.snippet)}</div>` : ''}</a>`).join('')}</div>` : empty(q ? 'Ничего не найдено' : 'В разделе пока нет статей'));
      const go = () => location.hash = '#/kbbase?' + ui.qsOf({ q: $('#kb-q').value.trim(), section: sec });
      $('#kb-go').onclick = go; $('#kb-q').onkeydown = e => { if (e.key === 'Enter') go(); };
      ACT.kbArtAdd = () => artModal('Новая статья', { section: sec || 'Регламенты' }, async v => { const a = await api('/kb/articles', { method: 'POST', body: v }); toast('Сохранено'); location.hash = '#/kbarticle?id=' + a.id; });
      ACT.kbSeed = async () => { if (!confirm('Загрузить стартовое наполнение? Существующие статьи, тесты и программы с теми же названиями не изменятся.')) return; const x = await api('/kb/seed', { method: 'POST' }); toast(`Добавлено: статей ${x.articles}, тестов ${x.tests}, программ ${x.courses}, новостей ${x.news}`, 5000); route(); };
      ACT.kbImport = () => {
        modal('Импорт регламентов', `<div class="kb-hint">1. На компьютере с доступом к серверу в папке finance-app выполните:</div>${pathSpan('python modules/kb/tools/import_kb.py "\\\\MostServer\\Материалы для проектирования\\Регламенты" kb-import.json')}
<div class="kb-hint" style="margin-top:8px">2. Выберите получившийся kb-import.json. Статьи сопоставляются по пути файла: повторный импорт обновит текст, а не создаст копии.</div>
<input type="file" id="kb-imp" accept=".json"><div class="error"></div><button class="btn primary block" id="kb-imp-go" style="margin-top:10px">Загрузить</button>`); wide('720px');
        $('#kb-imp-go').onclick = async () => { const f = $('#kb-imp').files[0]; if (!f) return toast('Выберите файл'); try { const data = JSON.parse(await f.text()); const x = await api('/kb/import', { method: 'POST', body: { articles: data.articles || data } }); ui.closeModal(); toast(`Добавлено ${x.added}, обновлено ${x.updated}`, 5000); route(); } catch (e) { $('#modal-body .error').textContent = e.message; } };
        bind($('#modal-body'));
      };
      bind(main);
    });
    SECTIONS.kbarticle = section(async main => {
      const a = await api('/kb/articles/' + params().get('id'));
      if (!a.sign && !a.read) api(`/kb/articles/${a.id}/read`, { method: 'POST' }).catch(() => { }); // открыл — прочитал
      const btns = a.canEdit ? `<button class="btn" data-act="kbArtEdit">✎ Изменить</button> <button class="btn danger" data-act="kbArtDel">✕</button>` : '';
      const signBox = a.sign ? `<div class="card" style="margin:12px 0;max-width:900px">${a.signed ? `<span class="chip ok">✓ Ознакомлен ${dt(a.signed.at)}</span>` : '<p style="margin:0 0 8px">Прочитайте документ полностью и подтвердите ознакомление. Отметка сохраняется с датой; подписанный бумажный экземпляр передайте секретарю.</p><button class="btn primary" data-act="kbSign">Ознакомлен</button>'}</div>` : '';
      main.innerHTML = head(a.title, `<a href="#/kbbase?section=${encodeURIComponent(a.section)}">${esc(a.section)}</a>${a.author ? ' · ' + esc(a.author) : ''}${a.updatedAt || a.createdAt ? ' · ' + dt(a.updatedAt || a.createdAt) : ''}`, btns) +
        `<div class="card" style="max-width:900px">${(a.tags || []).length ? `<div class="kb-meta">${a.tags.map(t => `<a class="chip neutral" href="#/kbbase?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>` : ''}${render(a.text)}
        ${(a.links || []).length ? `<h4 style="margin:14px 0 6px">Файлы и ссылки</h4><ul style="margin:0;padding-left:18px">${a.links.map(l => `<li style="margin:4px 0">${linkHtml(l)}</li>`).join('')}</ul>` : ''}
        ${(a.tests || []).length ? `<h4 style="margin:14px 0 6px">Проверить себя</h4>${a.tests.map(t => `<a class="btn sm" href="#/kbtest?id=${t.id}">✔ ${esc(t.title)}</a>`).join(' ')}` : ''}</div>` + signBox +
        (a.signers ? `<h3 style="margin-top:18px">Ознакомлены (${a.signers.length})</h3>` + (a.signers.length ? tbl([{ t: 'Сотрудник' }, { t: 'Дата' }], a.signers.map(s => `<tr><td>${esc(s.name)}</td><td>${dt(s.at)}</td></tr>`)) : empty('Пока никто')) : '');
      ACT.kbSign = async () => { await api(`/kb/articles/${a.id}/sign`, { method: 'POST' }); toast('Отмечено: ознакомлен'); route(); };
      ACT.kbArtEdit = () => artModal('Статья', a, async v => { await api('/kb/articles/' + a.id, { method: 'PUT', body: v }); toast('Сохранено'); route(); });
      ACT.kbArtDel = async () => { if (!confirm('Удалить статью «' + a.title + '»? Отметки о прочтении тоже удалятся.')) return; await api('/kb/articles/' + a.id, { method: 'DELETE' }); location.hash = '#/kbbase?section=' + encodeURIComponent(a.section); };
      bind(main);
    });

    // ---------- ознакомление с документами ----------
    SECTIONS.kbsign = section(async main => {
      const r = await api('/kb/signs');
      main.innerHTML = head('Ознакомление с документами', 'NDA, авторское право, материальная ответственность — отметка «ознакомлен» с датой') +
        (r.mine.length ? tbl([{ t: 'Документ' }, { t: 'Статус' }], r.mine.map(d => `<tr><td><a href="#/kbarticle?id=${d.id}">${esc(d.title)}</a></td><td>${d.signed ? `<span class="chip ok">ознакомлен ${dt(d.signed.at)}</span>` : `<a class="btn sm primary" href="#/kbarticle?id=${d.id}">Открыть</a>`}</td></tr>`)) : empty(`Документов нет. Добавьте их в «База знаний» → раздел «${SIGN}».`)) +
        (r.matrix && r.matrix.docs.length ? `<h3 style="margin-top:22px">Сводная по сотрудникам</h3><div class="kb-matrix">${tbl([{ t: 'Сотрудник' }, ...r.matrix.docs.map(d => ({ t: ui.cut(d.title, 18) })), { t: 'Итого' }], r.matrix.rows.map(u => { const n = Object.values(u.marks).filter(Boolean).length; return `<tr><td>${esc(u.name)}</td>${r.matrix.docs.map(d => `<td>${u.marks[d.id] ? `<span class="chip ok" title="${dt(u.marks[d.id])}">✓ ${dt(u.marks[d.id])}</span>` : '<span class="faint">—</span>'}</td>`).join('')}<td>${n === r.matrix.docs.length ? '<span class="chip ok">все</span>' : `${n} из ${r.matrix.docs.length}`}</td></tr>`; }))}</div>` : '');
      bind(main);
    });

    // ---------- тесты ----------
    const testForm = (x, arts) => `<form class="kb-editor">
      ${ui.field({ name: 'title', label: 'Название', required: true }, x.title)}
      ${ui.field({ name: 'description', label: 'Описание для сдающего', type: 'textarea' }, x.description)}
      <div class="form-row">${ui.field({ name: 'passScore', label: 'Проходной балл, %', type: 'number', min: 0 }, x.passScore ?? 80)}${ui.field({ name: 'maxAttempts', label: 'Попыток (0 — без ограничений)', type: 'number', min: 0 }, x.maxAttempts ?? 3)}</div>
      ${ui.field({ name: 'articleId', label: 'Статья для подготовки', type: 'select', options: [['', '—'], ...arts.map(a => [a.id, a.section + ' · ' + a.title])] }, x.articleId)}
      <div class="field"><label>Вопросы</label><div class="kb-hint">? Текст вопроса
+ правильный вариант (несколько «+» — вопрос с несколькими ответами)
- неправильный вариант
Пустая строка между вопросами. Балл — доля вопросов, отвеченных полностью верно.</div><textarea name="text" required>${esc(x.text || '? Вопрос\n+ верный ответ\n- неверный ответ\n')}</textarea></div>
      <div class="error"></div><button class="btn primary block" type="submit">Сохранить</button></form>`;
    const testModal = async id => {
      const [x, arts] = await Promise.all([id ? api(`/kb/tests/${id}?edit=1`) : Promise.resolve({}), api('/kb/articles').then(r => r.items)]);
      modal(id ? 'Тест' : 'Новый тест', testForm(x, arts), async v => { const r = await api('/kb/tests' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body: v }); toast('Сохранено: вопросов ' + r.questions.length); route(); }); wide('900px');
    };
    SECTIONS.kbtests = section(async main => {
      const tab = params().get('tab') || 'list';
      const tabs = `<div class="tabs"><a href="#/kbtests" class="${tab === 'list' ? 'active' : ''}">Тесты</a><a href="#/kbtests?tab=hist" class="${tab === 'hist' ? 'active' : ''}">${S.canTeach ? 'Результаты' : 'Мои попытки'}</a></div>`;
      const btn = S.canTeach ? '<button class="btn primary" data-act="kbTestAdd">+ Тест</button>' : '';
      if (tab === 'hist') {
        const h = await api('/kb/attempts');
        main.innerHTML = head('Тесты', '', btn) + tabs + (h.length ? tbl([{ t: 'Дата' }, { t: 'Сотрудник' }, { t: 'Тест' }, { t: 'Попытка', cls: 'num' }, { t: 'Балл', cls: 'num' }, { t: '' }], h.map(z => `<tr><td>${dt(z.at)}</td><td>${esc(z.name)}</td><td>${esc(z.test)}</td><td class="num">${z.no || ''}</td><td class="num">${z.score}% <span class="faint">(${z.right}/${z.total})</span></td><td>${z.passed ? '<span class="chip ok">сдан</span>' : '<span class="chip crit">не сдан</span>'} <a class="btn sm" href="#/kbattempt?id=${z.id}">Разбор</a></td></tr>`)) : empty('Попыток пока нет'));
      } else {
        const list = await api('/kb/tests');
        main.innerHTML = head('Тесты', 'Проверка знаний по регламентам и гайдам', btn) + tabs + (list.length ? tbl([{ t: 'Тест' }, { t: 'Вопросов', cls: 'num' }, { t: 'Проходной', cls: 'num' }, { t: 'Мой лучший', cls: 'num' }, { t: 'Попыток' }, { t: '' }], list.map(x => `<tr><td><b>${esc(x.title)}</b>${x.description ? `<div class="faint">${esc(ui.cut(x.description, 110))}</div>` : ''}${x.takers !== undefined ? `<div class="faint">сдавали: ${x.takers} чел.</div>` : ''}</td><td class="num">${x.n}</td><td class="num">${x.passScore}%</td><td class="num">${x.best === null ? '—' : x.best + '%'} ${x.passed ? '<span class="chip ok">сдан</span>' : ''}</td><td>${x.attempts}${x.left !== null ? ` · осталось ${x.left}` : ''}</td><td><div class="actions">${x.left === 0 ? '<span class="faint">попытки исчерпаны</span>' : `<a class="btn sm primary" href="#/kbtest?id=${x.id}">${x.attempts ? 'Пересдать' : 'Пройти'}</a>`}${S.canTeach ? `<button class="btn sm" data-act="kbTestEdit" data-id="${x.id}">✎</button><button class="btn sm danger" data-act="kbTestDel" data-id="${x.id}">✕</button>` : ''}</div></td></tr>`)) : empty(S.canTeach ? 'Тестов пока нет — создайте первый' : 'Тестов пока нет'));
      }
      ACT.kbTestAdd = () => testModal(); ACT.kbTestEdit = ({ id }) => testModal(id);
      ACT.kbTestDel = async ({ id }) => { if (!confirm('Удалить тест? История попыток сохранится.')) return; await api('/kb/tests/' + id, { method: 'DELETE' }); route(); };
      bind(main);
    });
    const qHtml = (q, i, detail) => `<div class="card kb-q"><div class="kb-qt">${i + 1}. ${esc(q.text)}${q.multi ? ' <span class="chip neutral">несколько ответов</span>' : ''}</div>${q.options.map((o, k) => {
      const d = detail && detail[q.id]; const chosen = d ? d.chosen.includes(k) : false; const right = d ? d.correct.includes(k) : false;
      return `<label class="kb-opt${d ? (right ? ' right' : chosen ? ' wrong' : '') : ''}"><input type="${q.multi ? 'checkbox' : 'radio'}" name="${q.id}" value="${k}"${chosen ? ' checked' : ''}${d ? ' disabled' : ''}><span>${esc(o)}${d && right ? ' ✓' : ''}</span></label>`; }).join('')}</div>`;
    const resultHead = z => `<div class="card ${z.passed ? 'ok' : 'crit'}" style="max-width:860px;margin-bottom:12px"><div class="label">${z.name ? esc(z.name) + ' · ' : ''}${dt(z.at)}${z.no ? ' · попытка ' + z.no : ''}</div><div class="val">${z.score}% — ${z.passed ? 'сдан' : 'не сдан'}</div><div class="foot">верно ${z.right} из ${z.total}. Зелёным — правильные ответы, красным — ошибочно выбранные.</div></div>`;
    SECTIONS.kbtest = section(async main => {
      const x = await api('/kb/tests/' + params().get('id'));
      const intro = `${x.description ? esc(x.description) + '<br>' : ''}Вопросов: ${x.questions.length} · проходной балл ${x.passScore}%${x.left !== null ? ` · осталось попыток: ${x.left}` : ''}${x.articleId ? ` · <a href="#/kbarticle?id=${x.articleId}">материал для подготовки</a>` : ''}`;
      if (x.left === 0) { main.innerHTML = head(x.title, intro) + empty('Попытки закончились — обратитесь к руководителю'); return; }
      main.innerHTML = head(x.title, intro) + `<form id="kb-test" style="max-width:860px">${x.questions.map((q, i) => qHtml(q, i)).join('')}<button class="btn primary" type="submit">Завершить и проверить</button></form>`;
      $('#kb-test').onsubmit = async e => {
        e.preventDefault(); const answers = {};
        for (const q of x.questions) answers[q.id] = [...main.querySelectorAll(`input[name="${q.id}"]:checked`)].map(i => Number(i.value));
        const skipped = x.questions.filter(q => !answers[q.id].length).length;
        if (skipped && !confirm(`Без ответа вопросов: ${skipped}. Завершить?`)) return;
        const z = await api(`/kb/tests/${x.id}/attempt`, { method: 'POST', body: { answers } });
        main.innerHTML = head(x.title, `<a href="#/kbtests">← к тестам</a>${z.left !== null ? ` · осталось попыток: ${z.left}` : ''}`, z.passed || z.left === 0 ? '' : `<a class="btn primary" href="#/kbtest?id=${x.id}&r=${Date.now()}">Пересдать</a>`) + resultHead(z) + `<div style="max-width:860px">${z.questions.map((q, i) => qHtml(q, i, z.detail)).join('')}</div>`;
        loadSummary(); window.scrollTo(0, 0);
      };
    });
    SECTIONS.kbattempt = section(async main => {
      const z = await api('/kb/attempts/' + params().get('id'));
      main.innerHTML = head('Разбор: ' + z.test, '<a href="#/kbtests?tab=hist">← к результатам</a>') + resultHead(z) + `<div style="max-width:860px">${z.questions.map((q, i) => qHtml(q, i, z.detail)).join('')}</div>`;
    });

    // ---------- обучение ----------
    const courseForm = x => `<form class="kb-editor">
      <div class="form-row">${ui.field({ name: 'title', label: 'Название программы', required: true }, x.title)}${ui.field({ name: 'audience', label: 'Для кого' }, x.audience)}</div>
      ${ui.field({ name: 'description', label: 'Описание', type: 'textarea' }, x.description)}
      <div class="field"><label>Недели и шаги</label><div class="kb-hint"># Неделя 1. Название
- Шаг-задание (отмечает новичок или наставник)
- Прочитать … | статья: название статьи  → засчитывается, когда статья открыта
- Сдать … | тест: название теста  → засчитывается при сдаче
- Подписать … | подпись: название документа  → при отметке «Ознакомлен»
Название можно писать началом: «статья: Регламент проектирования».</div><textarea name="text" required>${esc(x.text || '# Неделя 1. Знакомство\n- Первый шаг\n')}</textarea></div>
      ${x.missing && x.missing.length ? `<div class="notice warn">Не найдены в базе: ${x.missing.map(esc).join('; ')}</div>` : ''}
      <div class="error"></div><button class="btn primary block" type="submit">Сохранить</button></form>`;
    const courseModal = async id => { const x = id ? await api('/kb/courses/' + id) : {}; modal(id ? 'Программа обучения' : 'Новая программа', courseForm(x), async v => { const r = await api('/kb/courses' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body: v }); toast(`Сохранено: недель ${r.weeks.length}`); route(); }); wide('900px'); };
    SECTIONS.kbcourses = section(async main => {
      const [en, courses] = await Promise.all([api('/kb/enrolls'), api('/kb/courses')]);
      const me = ui.state.user.id; const mine = en.filter(e => e.userId === me); const others = en.filter(e => e.userId !== me);
      const btns = S.canTeach ? '<button class="btn" data-act="kbCourseAdd">+ Программа</button> <button class="btn primary" data-act="kbEnrollAdd">Назначить обучение</button>' : '';
      const row = e => `<tr><td><a href="#/kbenroll?id=${e.id}"><b>${esc(e.name)}</b></a>${e.section ? ` <span class="chip neutral">${esc(e.section)}</span>` : ''}</td><td>${esc(e.course)}</td><td>${esc(e.mentor || '—')}</td><td>${fdate(e.start)}</td><td style="min-width:140px">${pbar(e.pct, e.status === 'done')}<span class="faint">${e.pct}% · ${e.doneN}/${e.total}</span></td><td>${e.status === 'done' ? `<span class="chip ok">завершено ${fdate(e.finishedAt)}</span>` : e.status === 'paused' ? '<span class="chip neutral">пауза</span>' : '<span class="chip accent">идёт</span>'}</td></tr>`;
      const cols = [{ t: 'Сотрудник' }, { t: 'Программа' }, { t: 'Наставник' }, { t: 'Начало' }, { t: 'Прогресс' }, { t: '' }];
      main.innerHTML = head('Обучение', 'Программы стажировки по неделям, наставник, прогресс новичка', btns) +
        (mine.length ? `<h3>Моё обучение</h3><div class="grid g2" style="margin-bottom:18px">${mine.map(e => `<a class="card kb-item" href="#/kbenroll?id=${e.id}"><div class="label"><span>${esc(e.course)}</span><span>наставник: ${esc(e.mentor || '—')}</span></div><div class="val">${e.pct}%</div>${pbar(e.pct, e.status === 'done')}<div class="foot">выполнено ${e.doneN} из ${e.total} шагов</div></a>`).join('')}</div>` : '') +
        (others.length ? `<h3>Новички${S.isLeader ? '' : ' — мои подопечные и мой раздел'}</h3>` + tbl(cols, others.map(row)) : (S.canTeach && !mine.length ? empty('Обучение пока никому не назначено') : '')) +
        `<h3 style="margin-top:18px">Программы</h3>` + (courses.length ? tbl([{ t: 'Программа' }, { t: 'Для кого' }, { t: 'Недель', cls: 'num' }, { t: 'Шагов', cls: 'num' }, { t: 'Назначено', cls: 'num' }, { t: '' }], courses.map(c => `<tr><td><b>${esc(c.title)}</b>${c.description ? `<div class="faint">${esc(ui.cut(c.description, 110))}</div>` : ''}</td><td>${esc(c.audience || '')}</td><td class="num">${c.weeks}</td><td class="num">${c.steps}</td><td class="num">${c.enrolled}</td><td>${S.canTeach ? `<div class="actions"><button class="btn sm" data-act="kbCourseEdit" data-id="${c.id}">✎</button><button class="btn sm danger" data-act="kbCourseDel" data-id="${c.id}">✕</button></div>` : ''}</td></tr>`)) : empty(S.isLeader ? 'Программ нет — «База знаний» → «Стартовое наполнение» добавит программу стажировки' : 'Программ пока нет'));
      ACT.kbCourseAdd = () => courseModal(); ACT.kbCourseEdit = ({ id }) => courseModal(id);
      ACT.kbCourseDel = async ({ id }) => { if (!confirm('Удалить программу?')) return; await api('/kb/courses/' + id, { method: 'DELETE' }); route(); };
      ACT.kbEnrollAdd = () => {
        if (!courses.length) return toast('Сначала создайте программу');
        const sections = (window.MostDomain && window.MostDomain.SECTIONS) || [];
        const lead = ui.state.user.role === 'lead';
        modal('Назначить обучение', formHtml([
          { name: 'userId', label: 'Новичок', type: 'select', options: peopleOpts('— выберите —'), required: true },
          { name: 'courseId', label: 'Программа', type: 'select', options: courses.map(c => [c.id, c.title]) },
          { name: 'mentorId', label: 'Наставник', type: 'select', options: peopleOpts('— я —') },
          { name: 'section', label: 'Раздел новичка', type: 'select', options: lead ? [[ui.state.user.section, ui.state.user.section]] : [['', '— из профиля —'], ...sections.map(s => [s, s])], half: true },
          { name: 'start', label: 'Начало', type: 'date', half: true },
        ], { start: ui.today() }, 'Назначить'), async v => { const e = await api('/kb/enrolls', { method: 'POST', body: v }); toast('Назначено'); location.hash = '#/kbenroll?id=' + e.id; });
      };
      bind(main);
    });
    SECTIONS.kbenroll = section(async main => {
      const e = await api('/kb/enrolls/' + params().get('id'));
      const canTick = e.mine || e.canManage;
      const refLink = s => !s.refId ? (s.missing ? ` <span class="chip warn" title="${esc(s.ref)}">не найдено в базе</span>` : '') : s.kind === 'test' ? ` <a class="btn sm" href="#/kbtest?id=${s.refId}">✔ ${esc(ui.cut(s.refTitle, 50))}</a>` : ` <a class="btn sm" href="#/kbarticle?id=${s.refId}">${s.kind === 'sign' ? '✍' : '📄'} ${esc(ui.cut(s.refTitle, 50))}</a>`;
      // автошаги (статья/тест/подпись), засчитанные системой, снять нельзя; вручную отмеченные — можно
      const stepHtml = s => { const locked = s.done && s.how !== 'отмечено'; return `<div class="kb-step${s.done ? ' done' : ''}"><input type="checkbox" ${s.done ? 'checked' : ''} ${canTick && !locked ? `data-step="${s.id}"` : 'disabled'} title="${s.kind !== 'task' ? 'Засчитается автоматически; можно отметить вручную' : ''}"><div class="grow"><span class="kb-st">${esc(s.title)}</span>${refLink(s)}${s.done ? `<div class="faint">${esc(s.how || '')} ${dt(s.at)}${s.byName ? ' · ' + esc(s.byName) : ''}</div>` : s.score != null ? `<div class="faint">лучший результат ${s.score}%</div>` : ''}</div></div>`; };
      const btns = e.canManage ? `<button class="btn" data-act="kbEnrollEdit">Наставник / статус</button> <button class="btn danger" data-act="kbEnrollDel">✕</button>` : '';
      main.innerHTML = head(e.course, `${esc(e.name)}${e.section ? ' · ' + esc(e.section) : ''} · наставник ${esc(e.mentor || '—')} · с ${fdate(e.start)}${e.status === 'done' ? ' · завершено ' + fdate(e.finishedAt) : ''}${e.note ? '<br>' + esc(e.note) : ''}`, btns) +
        `<div class="card" style="max-width:860px;margin-bottom:14px"><div class="label"><span>Прогресс</span><span>${e.doneN} из ${e.total}</span></div><div class="val">${e.pct}%</div>${pbar(e.pct, e.status === 'done')}</div>` +
        `<div style="max-width:860px">${e.weeks.map(w => `<div class="card kb-week"><h3>${esc(w.title)} <span class="faint" style="font-weight:400">${w.steps.filter(s => s.done).length}/${w.steps.length}</span></h3>${w.steps.map(stepHtml).join('')}</div>`).join('')}</div>`;
      main.querySelectorAll('input[data-step]').forEach(i => i.onchange = async () => { i.disabled = true; try { await api(`/kb/enrolls/${e.id}/steps/${i.dataset.step}`, { method: 'PUT', body: { done: i.checked } }); route(); } catch (er) { toast(er.message); i.checked = !i.checked; i.disabled = false; } });
      ACT.kbEnrollEdit = () => modal('Обучение: ' + e.name, formHtml([{ name: 'mentorId', label: 'Наставник', type: 'select', options: peopleOpts('—') }, { name: 'start', label: 'Начало', type: 'date', half: true }, { name: 'status', label: 'Статус', type: 'select', options: [['active', 'Идёт'], ['done', 'Завершено'], ['paused', 'Пауза']], half: true }, { name: 'note', label: 'Заметка наставника', type: 'textarea' }], e), async v => { await api('/kb/enrolls/' + e.id, { method: 'PUT', body: v }); toast('Сохранено'); route(); });
      ACT.kbEnrollDel = async () => { if (!confirm('Удалить назначение? Ручные отметки шагов пропадут (попытки тестов и подписи останутся).')) return; await api('/kb/enrolls/' + e.id, { method: 'DELETE' }); location.hash = '#/kbcourses'; };
      bind(main);
    });

    // счётчики в меню: при входе, при каждом открытии раздела модуля и раз в 5 минут
    setTimeout(() => { if (ui.state.user) loadSummary(); }, 1000);
    setInterval(() => { if (ui.state.user) loadSummary(); }, 300000);
  },
});
