/* Модуль «Управление проектами» — экраны. Поток A. Помощники интерфейса приходят в init(ui) (см. docs/ARCHITECTURE.md).
   Логика — modules/pm/domain.js (window.MostPM). Данные — только /api/pm/* (на сайте ERP финансовых API нет). */
let PM_ACCESS = { canOpen: null, staffOwnProjects: false, staff: false, tracks: null }; // ответ /api/pm/access: открыт ли модуль и какие разделы (ЭП/РП) показывать
// Два раздела интерфейса — «ЭП» и «РП» (решение директора: «разделить полностью») — два UI-модуля с общим кодом и фильтром стадии (track)
const PM_TRACK_UI = { ep: { id: 'pmep', title: 'ЭП', full: 'Эскизные проекты', icon: '✎', lead: 'ПМ', leadField: 'pmId' }, rp: { id: 'pmrp', title: 'РП', full: 'Рабочие проекты', icon: '▤', lead: 'ГИП', leadField: 'gipId' } };
const pmTrackPath = t => t === 'rp' ? 'rp' : 'ep';
const pmRoleTrack = u => u && u.role === 'pm' ? 'ep' : 'rp';
const pmDefaultTracks = u => !u ? [] : u.role === 'pm' ? ['ep'] : u.role === 'gip' ? ['rp'] : u.role === 'staff' ? [] : ['ep', 'rp'];
const pmTrackOpen = (u, T) => (PM_ACCESS.tracks || pmDefaultTracks(u)).includes(T);
function pmModule(T) {
  const M = PM_TRACK_UI[T], S = id => `${T}/${id}`;
  return {
    id: M.id, title: M.title,
    nav: [ // сотруднику (staff, при включённом settings.pm.staffOwnProjects) — только реестр своих проектов и «Мои задачи»
      { id: T, label: 'Сводка', icon: '◎', can: u => u.role !== 'staff' },
      { id: S('reg'), label: M.full, icon: M.icon },
      { id: S('my'), label: 'Мои задачи', icon: '☑' },
      { id: S('bl'), label: 'Блокеры', icon: '⛔', can: u => u.role !== 'staff' },
    ],
    routes: [S('p'), ...(T === 'rp' ? ['pmp', 'pm', 'pmrp', 'pmmy', 'pmbl', 'pmown'] : ['pmep'])], // карточка #/ep/p?id=… и #/rp/p?id=…; старые адреса → редирект
    canOpen: u => !!window.MostPM && window.MostPM.canOpen(u, PM_ACCESS) && pmTrackOpen(u, T),
    help: pmHelp(T),
    onNav() { if (this._badges) this._badges(); },
    init(ui) { pmInit.call(this, ui, T); },
  };
}
// инструкция раздела (кнопка «?» в шапке и раздел «Инструкция»): [заголовок, html, id раздела, только для стадии?]
function pmHelp(T) {
  const S = id => `${T}/${id}`; const TU = PM_TRACK_UI[T];
  return [
    ['Как устроено управление проектами', `
<p>Проект живёт по двум стадиям: <b>Эскизный проект (ЭП)</b> → <b>Рабочий проект (РП)</b>. Концепция — не отдельная стадия, а первый этап ЭП (форэскиз → концепция → согласование → договор на ЭП). Каждая стадия — отдельная карточка со своим шаблоном этапов и пунктов из регламентов MOST (ЭП — 48 пунктов в 9 этапах, РП — 79 пунктов из «Дорожной карты проекта»). Авторский надзор в модуле пока не планируется (решение директора).</p>
<ul>
<li>ЭП ведёт <b>проектный менеджер (ПМ)</b>, РП — <b>ГИП</b>: назначают сроки и исполнителей, добавляют пункты, передают проект на следующую стадию.</li>
<li><b>Руководитель раздела</b> (АР, КЖ, ГП, ОВ, ВК, ЭЛ, СС…) отмечает пункты своего раздела во всех проектах — в том числе те, что делает субподрядчик. Субподрядчики в систему не заходят; в пункте указывается «исполнитель-подрядчик».</li>
<li>У пункта есть <b>критерий приёмки</b> — что должно быть на руках, чтобы поставить «сделано» (подписанный документ, письмо, комплект чертежей). «Не требуется» — если пункт к проекту не относится.</li>
<li><b>Рядовые сотрудники</b> (роль staff) модуль по умолчанию не видят. Владелец или партнёр может включить на Сводке «Доступ сотрудников»: тогда сотрудник видит «Мои проекты» (где он исполнитель пункта или участник) и «Мои задачи», только на чтение, отмечает «сделано» у своих пунктов; бюджет, финансы и чужие блокеры ему не показываются.</li>
<li><b>Руководители</b> видят всё, назначают ГИП/ПМ, привязывают финансовый проект, видят бюджет и маржу; ГИП/ПМ видят бюджет своего проекта, если владелец включил им доступ. Деньги здесь не вводятся — факт приходит из финансов.</li>
<li>Уведомлений нет: всё, что ждёт вас, видно в цифрах меню («Мои задачи» — просроченные пункты, «Блокеры» — висят больше 14 дней) и в списках.</li>
</ul>`],
    ['Метод Пульса: буфер, ритм, устав', `
<p>Модуль считает проекты по «Методу Пульса» (Теория ограничений + Agile, pulsemanagement.org): сроки только у проекта, у пунктов — две оценки (оптимистичная 50 % и пессимистичная 90 %), проект защищает <b>буфер расписания</b>: 30 % срока по договору или разница оценок цепи, если даты договора нет.</p>
<ul>
<li><b>Температурный график</b> на сводке и чип «Буфер» в реестре: по горизонтали — доля выполненного объёма, по вертикали — доля съеденного буфера. Зелёная зона — не вмешиваться; жёлтая — готовить план изменений; красная — применять его; чёрная — буфер исчерпан, пересогласовать срок или объём с заказчиком; «профицит» — слишком много запаса, срок можно сократить.</li>
<li><b>Прогноз по скорости</b>: скорость закрытия пунктов за последние 4 недели даёт реалистичный срок; средняя с начала проекта — оптимистичный; с учётом добавленных пунктов — пессимистичный. Пока отметок «сделано» нет, расход буфера считается по прошедшему времени против выполненного объёма.</li>
<li><b>Приоритет портфеля</b>: сначала чёрные и красные проекты с большим прогрессом, затем жёлтые, затем по Проходу (контракт без НДС в месяц срока). Один исполнитель — одна задача; новый проект не стартует на разделе-ограничении, пока тот не освободился.</li>
<li><b>Ритм</b>: ежедневно 10 минут по разделу («когда закончишь?», «что мешает закончить сейчас?»); каждую неделю планирование спринта, демонстрация и обратная связь заказчика; раз в неделю совещание руководства по состоянию проектов на сводке; в конце этапа — ретроспектива с планом действий (вкладка «Ретро»); раз в квартал — приоритеты и очередь стартов.</li>
<li><b>Устав</b> (вкладка «Устав») заполняется на запуске проекта не дольше 4 часов вместе с командой и заказчиком: что делаем (результат без глаголов), зачем, критерий завершения (зависит только от нас), критерий успеха, требования, угрозы, ресурсы. Проверочная фраза показывает, логична ли цель. Пока устава нет, на вкладке стоит ⚠.</li>
</ul>`],
    ['Сводка', `
<p>Картина по всем проектам на сегодня: сколько в работе, где срок по договору прошёл, что «горит» (до срока ≤ 14 дней), сколько просроченных пунктов и блокеров. Ниже — воронка по этапам для каждой стадии, загрузка ГИП/ПМ и Гант по месяцам (полоса от старта до прогноза; красная — срок прошёл, жёлтая — ждём заказчика или госорган, зелёная — готово). Строка Ганта открывает карточку.</p>
<p><b>Руководителю:</b> «Импорт реестра» загружает JSON, который готовит <code>modules/pm/tools/import_pm.py</code> из реестра MOST_Планирование_проектов.xlsx и таблицы бюджетов. Проекты с тем же названием пропускаются или пересоздаются («заменить»).</p>`, T],
    ['Импорт из ClickUp', `
<p>Сводка → «Импорт из ClickUp» (руководитель). Выгрузка из ClickUp: список или папка → … → Export → CSV. Колонки сопоставляются автоматически (Task Name, Status, Assignees, Start Date, Due Date, Parent ID, List Name, Tags, Priority, Task Content; кастомные поля «Заказчик», «Адрес», «Площадь», «Договор №», «Этап»), их можно поправить в форме — ниже показан предпросмотр найденных проектов.</p>
<ul>
<li><b>Проекты</b> — задачи верхнего уровня (подзадачи любого уровня — их пункты) или списки ClickUp. Каждый проект создаётся как ЭП с шаблоном из 48 пунктов; статус, старт и срок, заказчик, площадь, договор — из выгрузки.</li>
<li><b>Подзадача с тем же названием, что пункт шаблона</b> («Посадка», «Фасады», «Рендеры»…) — становится отметкой «сделано» (если в ClickUp статус complete/closed), сроком и исполнителем этого пункта. Остальные подзадачи добавляются пунктами текущего этапа с пометкой «из ClickUp».</li>
<li><b>Люди</b> сопоставляются по имени с пользователями системы (порядок слов не важен, «Иванов И.» ↔ «Иван Иванов»); не найденные имена пишутся в заметку пункта и в комментарий проекта.</li>
<li>Проект с таким же названием уже есть — «пропустить» или «дополнить» (отметки и новые пункты, без изменения карточки). Пример файла: <code>modules/pm/tools/clickup.example.csv</code>.</li>
</ul>`, T, 'ep'],
    ['Эскизные проекты', `
<p>Шаблон ЭП — дорожная карта бюро (таблица «Hayat дорожная карта»): этап 1 «Концепция» (форэскиз → концепция → согласование), затем этапы <b>A</b> Сбор информации → <b>B</b> Посадка → <b>C</b> Схемы блоков и планировок → <b>D</b> Планировки → <b>E</b> Концепт фасада → <b>F</b> Финальный фасад → <b>G</b> ГП и благоустройство → <b>H</b> Завершение (35 задач с кодами A1…H3).</p>
<ul>
<li>У пункта есть <b>код</b> и <b>блокеры</b> — пункты, которые должны быть закрыты раньше: пока они открыты, у пункта чип «ждёт: B3». «Разложить сроки» строит план по блокерам: пункт начинается, когда закрыты его блокеры.</li>
<li>Статусы из таблицы (ГОТОВО / В РАБОТЕ / У ГАПа / У ЗАКАЗЧИКА / НЕ НАЧАТО) заносятся по коду: <code>POST /api/pm/projects/:id/statuses {items:[{code, status, due}]}</code> — «ГОТОВО» ставит «сделано», остальные — подпись статуса у пункта.</li>
<li>Руководитель может <b>⟳ Шаблон</b> — пересобрать пункты старого проекта по текущему шаблону: отметки, сроки и исполнители совпавших пунктов сохраняются, прочие уходят в этап «Прочее».</li>
<li>Создать: «+ Проект» → стадия «Эскизный проект», заказчик, дата старта и дата по договору, ПМ; «Разложить сроки» — план по неделям и блокерам. Щёлкните строку — откроется карточка.</li>
</ul>`, S('reg'), 'ep'],
    ['Рабочие проекты', `
<p>То же, что для ЭП, но ведёт ГИП, а шаблон — 79 пунктов регламента РП: ИРД (ТУ, геология) → ГПР → схема КЖ → финальные планы → проект → отверстия → комплектация для экспертизы → экспертиза → на стройку. Пункты с ролью «Заказчик» — ожидания от заказчика (ТУ, геология, письма в экспертизу): контролирует ГИП; если ждём долго — заведите блокер.</p>`, S('reg'), 'rp'],
    ['Мои задачи', `
<ol>
<li>Ваши открытые пункты по активным проектам, сгруппированные по объектам: ГИП/ПМ — пункты своей роли и ожидания от заказчика; руководитель раздела — пункты раздела, включая субподрядчиков; все — пункты, где вы назначены исполнителем. Руководители видят просроченное по всем проектам.</li>
<li>Галочка — «сделано» (сверьтесь с критерием приёмки). ✎ — срок, исполнитель, подрядчик, «чем подтверждено», заметка.</li>
<li>«Только просроченные» — то, что горит; цифра в меню — число просроченных.</li>
</ol>`, S('my')],
    ['Блокеры', `
<p>Блокер — внешнее ожидание, которым мы управляем, а не делаем сами: ИРД или письмо от заказчика, заключение экспертизы, ответ смежника. Заводит ГИП/ПМ проекта или руководитель раздела: чего ждём, кто держит, кто дожимает с нашей стороны, с какого дня, когда ожидаем, последний контакт. Больше 14 дней — строка красная и считается в меню. Получили — закройте блокер (✓).</p>`, S('bl')],
    ['Карточка проекта', `
<ul>
<li><b>Шапка</b>: стадия, статус, риск, заказчик, ГИП/ПМ, папка на сервере («📁 Папка» и «Скопировать путь» — вставьте в Проводник). Кнопки: «Разложить сроки», «Передать в ЭП/РП», «✎ Проект», удалить (руководитель).</li>
<li><b>Этапы</b>: раскрывающиеся блоки, текущий подсвечен. У пункта — галочка «сделано» (только у того, кто его ведёт), критерий приёмки, роль и раздел, исполнитель и подрядчик, срок (красный — просрочен), ✎ и ✕. «+ Пункт» добавляет свой пункт в этап.</li>
<li><b>Блокеры</b> — ожидания по этому проекту. <b>Бюджет</b> (руководители и ГИП/ПМ с доступом): контракт, целевая себестоимость, разделы с исполнителем «Внутренние / Субподряд», валовая и чистая маржа; факт по деньгам — из финансов по привязанному проекту. <b>Миро</b> — доска концепции или ЭП прямо в карточке. <b>О проекте</b> — реквизиты, папка (стандарт №-год-название и разделы 00-ИРД … 13-TH), связанные стадии.</li>
<li>«Разложить сроки»: этапы идут последовательно, пункты этапа — параллельно, длительность этапа — самый долгий пункт (недели из регламента); «под дату по договору» сжимает или растягивает план до срока. Сделанные пункты не сдвигаются.</li>
<li><b>Устав</b> — цель проекта и проверочная фраза; <b>Ретро</b> — записи ретроспектив с автоматическим снимком показателей (зона буфера, скорость, добавленный объём, возвраты пунктов) и планом действий. Карточка «Буфер расписания» показывает расход буфера и прогноз по скорости; у пункта видны две оценки и число возвратов (снятых отметок «сделано»).</li>
</ul>`, S('p')],
    ['Канбан', `
<ul>
<li><b>Проекты</b>: в реестре переключатель «Список | Канбан». Колонки — статусы (В работе, Ждём заказчика, Ждём госорган, На паузе, Готово; «Отменён» свёрнут). Перетащите карточку в другую колонку — статус проекта сменится. Двигать могут руководитель и ГИП/ПМ проекта; у остальных карточки без кнопки «⇄».</li>
<li><b>Пункты</b>: в карточке проекта вкладка «Канбан» — «К выполнению / В работе / На проверке / Готово», фильтр по этапу. «Готово» — то же, что галочка «сделано» (критерий приёмки, дата, счётчики); вынуть из «Готово» — возврат пункта. Двигает тот, кто может отметить пункт.</li>
<li><b>Телефон</b>: колонки листаются пальцем вбок; чтобы переместить карточку — долгое нажатие или кнопка «⇄» → нужная колонка.</li>
</ul>`, S('reg')],
    ['Часы по проекту (модуль «Персонал»)', `
<p>Вкладка «Часы» в карточке появляется, когда включён модуль «Персонал»: часы из сданных и принятых табелей по этому проекту — по разделам и по людям, за всё время и по месяцам (месяц недели — по её четвергу). Себестоимость и ставки видят только владелец, партнёр и бухгалтер с доступом к бюджету проекта; ГИП и ПМ видят часы без денег. Черновики табелей не учитываются.</p>`, S('p')],
  ].filter(e => !e[3] || e[3] === T).map(e => e.slice(0, 3));
}
// общий код экранов для раздела T ('ep' | 'rp')
function pmInit(ui, T) {
    const M = this; const PM = window.MostPM; const TU = PM_TRACK_UI[T]; const S = id => `${T}/${id}`;
    const { esc, api, fdate, today, toast, modal, formHtml, tbl, empty, chip, sel, head, bind, params, route, money, qsOf, cut, $ } = ui;
    // сотруднику модуль виден только при включённой настройке — узнаём у сервера и перерисовываем меню
    if (!PM_ACCESS._asked) { PM_ACCESS._asked = true; const before = pmDefaultTracks(ui.state.user).join(); api('/pm/access').then(acc => { PM_ACCESS = Object.assign({ _asked: true }, acc); if ((acc.tracks || []).join() !== before) route(); }).catch(() => {}); }
    if (!document.getElementById('pm-style')) document.head.insertAdjacentHTML('beforeend', `<style id="pm-style">
.pm-kpi .card .val{font-size:20px}.pm-kpi .card .foot{margin-top:6px}
.pm-sub{display:flex;gap:6px 10px;flex-wrap:wrap;align-items:center;font-size:13px}
.pm-tabs{overflow-x:auto;flex-wrap:nowrap;white-space:nowrap;-webkit-overflow-scrolling:touch;width:0;min-width:100%}.pm-tabs a{flex:none} /* width:0 + min-width:100% — полоса вкладок не раздувает страницу на телефоне */
.pm-row{cursor:pointer}.pm-row td .faint{margin-top:2px}
.pm-scroll{width:0;min-width:100%;overflow-x:auto}
.pm-stage{padding:0;margin-bottom:10px}.pm-stage>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 14px;flex-wrap:wrap}.pm-stage>summary::-webkit-details-marker{display:none}.pm-stage>summary::before{content:'▸';color:var(--ink-faint);font-size:12px}.pm-stage[open]>summary::before{content:'▾'}.pm-stage>summary .grow{flex:1;font-weight:700;min-width:160px}
.pm-stage .tbl{border:0;border-radius:0 0 var(--r) var(--r);box-shadow:none;border-top:1px solid var(--line)}.pm-stage table{min-width:640px}.pm-stage.cur>summary{box-shadow:inset 3px 0 0 var(--accent)}.pm-stage.fin>summary .grow{color:var(--ink-soft)}
.pm-item td{vertical-align:top}.pm-item.done td .t{text-decoration:line-through;color:var(--ink-faint)}.pm-item.na td{opacity:.55}.pm-item.over td.due{color:var(--crit);font-weight:600}
.pm-chk{width:34px}.pm-chk input{width:17px;height:17px;margin:2px 0 0;cursor:pointer}.pm-chk input:disabled{cursor:default;opacity:.4}
.pm-t{font-weight:500}.pm-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;color:var(--ink-soft);background:var(--panel-2);padding:1px 5px;border-radius:5px;margin-right:2px}.pm-crit{font-size:12px;color:var(--ink-faint)}.pm-note{font-size:12.5px;color:var(--ink-soft);white-space:pre-wrap}
.pm-my .card{padding:0;margin-bottom:12px}.pm-my .card h3{margin:0;padding:10px 14px;font-size:14px;border-bottom:1px solid var(--line)}.pm-my .tbl{border:0;box-shadow:none;border-radius:0 0 var(--r) var(--r)}
.pm-kv{display:grid;grid-template-columns:180px 1fr;gap:8px 14px;font-size:13.5px}.pm-kv b{color:var(--ink-soft);font-weight:500}@media(max-width:600px){.pm-kv{grid-template-columns:1fr}.pm-kv b{margin-bottom:-6px}}
.pm-path{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;background:var(--panel-2);padding:2px 6px;border-radius:6px;word-break:break-all}
.pm-miro{width:100%;height:70vh;border:1px solid var(--line);border-radius:8px;background:#fff}
.pm-hidem{display:table-cell}@media(max-width:820px){.pm-hidem{display:none}}
.pm-fever{width:100%;height:auto;display:block;margin:6px 0}.pm-fever text{font-family:inherit}
.pm-phrase{font-size:15px;line-height:1.5;margin:6px 0 0}
.pm-hist-row{display:grid;grid-template-columns:120px 1fr auto;gap:6px 12px;padding:6px 0;border-bottom:1px solid var(--line);font-size:13px}.pm-hist-row:last-child{border-bottom:0}@media(max-width:600px){.pm-hist-row{grid-template-columns:1fr}}
.pm-chk input{width:20px;height:20px}
.pm-seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;flex:none}.pm-seg a{padding:6px 12px;font-size:13px;color:var(--ink-soft);text-decoration:none;min-height:34px;display:inline-flex;align-items:center}.pm-seg a.active{background:var(--accent);color:#fff}
.pm-kb{display:flex;gap:10px;align-items:flex-start;overflow-x:auto;width:0;min-width:100%;padding-bottom:8px;-webkit-overflow-scrolling:touch;scroll-snap-type:x proximity}
.pm-kb-col{flex:0 0 272px;background:var(--panel-2);border:1px solid var(--line);border-radius:10px;display:flex;flex-direction:column;max-height:calc(100vh - 220px);scroll-snap-align:start}
.pm-kb-col.over{outline:2px dashed var(--accent);outline-offset:-2px}.pm-kb-col.fold{flex-basis:150px}
.pm-kb-h{display:flex;align-items:center;gap:6px;padding:9px 10px;font-weight:700;font-size:13px;border-bottom:1px solid var(--line)}.pm-kb-h .n{margin-left:auto;font-weight:500;color:var(--ink-faint)}
.pm-kb-list{padding:8px;display:flex;flex-direction:column;gap:8px;overflow-y:auto;min-height:60px}
.pm-kc{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:12.5px;cursor:pointer;position:relative;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.pm-kc[draggable=true]{cursor:grab}.pm-kc.drag{opacity:.45}.pm-kc.zone-red,.pm-kc.zone-black{box-shadow:inset 3px 0 0 var(--crit)}.pm-kc.zone-yellow{box-shadow:inset 3px 0 0 var(--warn)}.pm-kc.zone-green{box-shadow:inset 3px 0 0 var(--ok)}.pm-kc.zone-blue{box-shadow:inset 3px 0 0 var(--ink-faint)}
.pm-kc .kt{font-weight:600;font-size:13px;line-height:1.3;padding-right:30px;word-break:break-word}.pm-kc .km{color:var(--ink-soft);margin-top:3px;display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center}.pm-kc .bar{margin:4px 0 2px}
.pm-kc .kmove{position:absolute;top:4px;right:4px;min-width:28px;min-height:28px;padding:0 6px}
.pm-kb-more{font-size:12px;color:var(--ink-faint);text-align:center;padding:4px}
.pm-kmenu{display:flex;flex-direction:column;gap:8px}.pm-kmenu .btn{min-height:44px;justify-content:flex-start}
@media(max-width:600px){.pm-kb-col{flex:0 0 84vw;max-height:none}.pm-kb-col.fold{flex-basis:44vw}.pm-kc .kmove{min-width:40px;min-height:40px}.pm-kc .kt{padding-right:44px}}
@media(max-width:600px){.pm-stage table,.pm-my table{min-width:0;width:100%;table-layout:fixed}.pm-stage .tbl,.pm-my .tbl{max-width:100%;overflow-x:hidden}.pm-item td{white-space:normal;word-break:break-word}.pm-stage th:nth-child(1),.pm-my th:nth-child(1){width:46px}.pm-stage th:nth-child(4),.pm-my th:nth-child(4){width:82px}.pm-stage th:nth-child(5),.pm-my th:nth-child(5){width:72px}.pm-stage th:nth-child(6),.pm-my th:nth-child(6){width:50px}.pm-item .actions{flex-direction:column;gap:6px}.pm-stage th:nth-child(3),.pm-item td:nth-child(3),.pm-my th:nth-child(3){display:none}.pm-stage th,.pm-my th{white-space:normal;font-size:10.5px;padding-left:4px;padding-right:4px}.pm-chk{width:46px}.pm-chk input{width:30px;height:30px;margin:0}.pm-item td{padding:10px 6px}.pm-item td.due,.pm-item td:nth-child(4){font-size:12px}.pm-item .actions .btn.sm,.pm-stage>summary .btn.sm{min-width:40px;min-height:40px}.pm-stage>summary{padding:12px 10px}.pm-kpi .card .val{font-size:18px}.pm-my .card h3{padding:12px 10px}}
</style>`);

    // ---- общие помощники ----
    const me = () => ui.state.user || {};
    const people = () => { const l = (ui.state.people || []).slice(); const u = me(); if (u.id && !l.some(p => p.id === u.id)) l.unshift({ id: u.id, name: u.name, role: u.role, roleLabel: u.roleLabel }); return l; };
    const pname = id => { if (!id) return ''; if (id === 'import') return 'импорт'; const p = people().find(x => x.id === id); return p ? p.name : '—'; };
    const LEAD_ROLES = ['owner', 'partner', 'pm', 'gip'];
    const userOpts = roles => [['', '—'], ...people().filter(p => !roles || roles.includes(p.role)).map(p => [p.id, p.name + (p.roleLabel ? ` · ${p.roleLabel}` : '')])];
    const STATUS_CHIP = { 'В работе': ['accent', 'В работе'], 'Ждём заказчика': ['warn', 'Ждём заказчика'], 'Ждём госорган': ['warn', 'Ждём госорган'], 'На паузе': ['neutral', 'На паузе'], 'Готово': ['ok', 'Готово'], 'Отменён': ['neutral', 'Отменён'] };
    const RISK_CHIP = { 'Низкий': ['ok', 'риск низкий'], 'Средний': ['warn', 'риск средний'], 'Высокий': ['crit', 'риск высокий'] };
    const TRACK_CHIP = { concept: ['neutral', 'Концепция'], ep: ['accent', 'ЭП'], rp: ['ok', 'РП'], an: ['warn', 'АН'] };
    // Метод Пульса: зона буфера и температурный график
    const ZONE_CHIP = { none: ['neutral', 'нет сроков'], blue: ['neutral', 'профицит'], green: ['ok', 'по плану'], yellow: ['warn', 'жёлтая'], red: ['crit', 'красная'], black: ['crit', 'чёрная'] };
    const pct = v => `${Math.round((Number(v) || 0) * 100)} %`;
    const zoneChip = h => h && h.zone ? (h.zone === 'none' ? `<span class="chip neutral" title="${esc(PM.ZONES.none)}">нет сроков</span>` : `<span class="chip ${ZONE_CHIP[h.zone][0]}" title="${esc(PM.ZONES[h.zone])} · расход буфера ${pct(h.consumption)} при выполнении ${pct(h.progress)} (${esc(h.basis || '')})">${esc(ZONE_CHIP[h.zone][1])} · ${pct(h.consumption)}</span>`) : '';
    function feverChart(rows) {
      const Wd = 560, Ht = 320, L = 42, B = 28, T = 10, R = 12, w = Wd - L - R, hh = Ht - T - B;
      const X = x => L + Math.max(0, Math.min(1, x)) * w, Y = y => T + hh - (Math.max(-0.3, Math.min(1.2, y)) + 0.3) / 1.5 * hh;
      const lo = x => 0.1 + 0.5 * x, hi = x => 0.4 + 0.6 * x; const poly = pts => pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
      return `<svg viewBox="0 0 ${Wd} ${Ht}" class="pm-fever" role="img" aria-label="Температурный график расхода буфера">
        <polygon points="${poly([[0, -0.3], [1, -0.3], [1, lo(1)], [0, lo(0)]])}" fill="var(--ok-bg)"/><polygon points="${poly([[0, lo(0)], [1, lo(1)], [1, hi(1)], [0, hi(0)]])}" fill="var(--warn-bg)"/><polygon points="${poly([[0, hi(0)], [1, hi(1)], [1, 1], [0, 1]])}" fill="var(--crit-bg)"/><polygon points="${poly([[0, 1], [1, 1], [1, 1.2], [0, 1.2]])}" fill="var(--line-strong)" opacity=".7"/>
        <line x1="${L}" y1="${Y(0)}" x2="${Wd - R}" y2="${Y(0)}" stroke="var(--ink-faint)" stroke-dasharray="3 3"/>
        ${[0, 0.25, 0.5, 0.75, 1].map(v => `<text x="${X(v)}" y="${Ht - 8}" font-size="10" text-anchor="middle" fill="var(--ink-soft)">${v * 100}%</text>`).join('')}${[0, 0.5, 1].map(v => `<text x="${L - 5}" y="${Y(v) + 3}" font-size="10" text-anchor="end" fill="var(--ink-soft)">${v * 100}%</text>`).join('')}
        <text x="${Wd - R}" y="${Ht - 8}" font-size="10" text-anchor="end" fill="var(--ink-faint)">выполнено →</text><text x="${L + 4}" y="${T + 10}" font-size="10" fill="var(--ink-faint)">↑ расход буфера</text>
        ${rows.map(r => `<a href="${cardLink(r.id, r.track)}"><circle cx="${X(r.health.progress).toFixed(1)}" cy="${Y(r.health.consumption).toFixed(1)}" r="6" fill="var(--accent)" stroke="#fff" stroke-width="1.5"><title>${esc(r.name)}: выполнено ${pct(r.health.progress)}, буфер ${pct(r.health.consumption)}</title></circle><text x="${(X(r.health.progress) + 8).toFixed(1)}" y="${(Y(r.health.consumption) + 3).toFixed(1)}" font-size="10" fill="var(--ink)">${esc(cut(r.name, 16))}</text></a>`).join('')}
      </svg>`;
    }
    const dueHtml = (d, done) => { if (!d) return '<span class="faint">—</span>'; if (done) return `<span class="faint">${fdate(d)}</span>`; const n = PM.days(today(), d); return n < 0 ? `<span class="crit-text" title="просрочено на ${-n} дн.">${fdate(d)}</span>` : n <= 7 ? `<span class="warn-text" title="осталось ${n} дн.">${fdate(d)}</span>` : fdate(d); };
    const bar = pct => `<div class="bar" title="${pct}%"><i style="width:${Math.min(100, Number(pct) || 0)}%"></i></div>`;
    const cardLink = (id, track) => `#/${pmTrackPath(track || T)}/p?id=${encodeURIComponent(id)}`;
    const listHash = t => `#/${pmTrackPath(t || T)}/reg`;
    const rerender = async () => { const y = window.scrollY; await route(); window.scrollTo(0, y); };
    const copy = async text => { try { await navigator.clipboard.writeText(text); toast('Скопировано: ' + text, 3500); } catch { window.prompt('Скопируйте путь', text); } };
    // ---- канбан: общая доска для проектов (колонки — статусы) и пунктов (колонки — статус пункта) ----
    // cols: [{ key, label, cls, fold, foldHref }], cards: [{ id, col, html, canMove, zone }]. Перетаскивание мышью (HTML5 DnD, только точный указатель),
    // на телефоне — долгое нажатие или кнопка «⇄» открывают меню «в колонку». Без права — карточку не двигать.
    const pmStore = { get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } } };
    function kanbanHtml(cols, cards) {
      return `<div class="pm-kb">${cols.map(col => { const list = cards.filter(x => x.col === col.key);
        return `<div class="pm-kb-col${col.fold ? ' fold' : ''}" data-col="${esc(col.key)}"><div class="pm-kb-h">${col.cls ? `<span class="chip ${col.cls}">${esc(col.label)}</span>` : esc(col.label)}<span class="n">${list.length}</span></div><div class="pm-kb-list">${col.fold ? `<a class="pm-kb-more" href="${col.foldHref}">показать ${list.length}</a>` : list.map(x => `<div class="pm-kc${x.zone ? ' zone-' + esc(x.zone) : ''}" data-kid="${esc(x.id)}" data-col="${esc(col.key)}" data-move="${x.canMove ? '1' : ''}">${x.html}${x.canMove ? `<button class="btn sm kmove" data-kmove="${esc(x.id)}" title="Переместить в колонку" aria-label="Переместить в колонку">⇄</button>` : ''}</div>`).join('') || '<div class="pm-kb-more">пусто</div>'}</div></div>`; }).join('')}</div>`;
    }
    function bindKanban(root, cols, o) {
      const board = root.querySelector('.pm-kb'); if (!board) return;
      const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches; let dragId = '';
      const colOf = id => { const el = board.querySelector(`.pm-kc[data-kid="${CSS.escape(id)}"]`); return el ? el.dataset.col : ''; };
      const move = async (id, to) => { if (!to || colOf(id) === to) return; const el = board.querySelector(`.pm-kc[data-kid="${CSS.escape(id)}"]`); const dst = board.querySelector(`.pm-kb-col[data-col="${CSS.escape(to)}"] .pm-kb-list`); if (el && dst && !dst.querySelector('.pm-kb-more[href]')) { dst.querySelectorAll('.pm-kb-more').forEach(x => x.remove()); dst.prepend(el); el.dataset.col = to; } try { await o.onMove(id, to); } catch (e) { toast(e.message, 4000); } await rerender(); };
      const menu = id => { const cur = colOf(id); modal(o.menuTitle || 'Переместить в колонку', `<div class="pm-kmenu">${cols.map(c => `<button class="btn" data-kto="${esc(c.key)}"${c.key === cur ? ' disabled' : ''}>→ ${esc(c.label)}${c.key === cur ? ' (сейчас)' : ''}</button>`).join('')}</div>`);
        document.querySelectorAll('#modal-body [data-kto]').forEach(b => b.onclick = () => { const cl = document.getElementById('modal-close'); if (cl) cl.click(); move(id, b.dataset.kto); }); };
      board.querySelectorAll('.pm-kc').forEach(el => {
        const id = el.dataset.kid, can = el.dataset.move === '1'; let timer = 0, longDone = false;
        el.addEventListener('click', e => { if (longDone) { longDone = false; return; } const b = e.target.closest('[data-kmove]'); if (b) { e.stopPropagation(); menu(id); return; } if (e.target.closest('a,button')) return; o.onOpen && o.onOpen(id); });
        if (!can) return;
        if (fine) { el.draggable = true; el.addEventListener('dragstart', e => { dragId = id; el.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch { /* старые браузеры */ } }); el.addEventListener('dragend', () => { dragId = ''; el.classList.remove('drag'); board.querySelectorAll('.over').forEach(x => x.classList.remove('over')); }); }
        // телефон: долгое нажатие (0,5 с) открывает меню «в колонку»; прокрутка отменяет
        el.addEventListener('touchstart', () => { longDone = false; clearTimeout(timer); timer = setTimeout(() => { longDone = true; if (navigator.vibrate) try { navigator.vibrate(20); } catch { /* нет вибро */ } menu(id); }, 500); }, { passive: true });
        ['touchmove', 'touchend', 'touchcancel'].forEach(ev => el.addEventListener(ev, () => clearTimeout(timer), { passive: true }));
        el.addEventListener('contextmenu', e => { if (longDone || !fine) e.preventDefault(); });
      });
      board.querySelectorAll('.pm-kb-col').forEach(col => {
        col.addEventListener('dragover', e => { if (!dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('over'); });
        col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
        col.addEventListener('drop', e => { e.preventDefault(); col.classList.remove('over'); const id = dragId || e.dataTransfer.getData('text/plain'); dragId = ''; if (id) move(id, col.dataset.col); });
      });
    }
    let badgeAt = 0;
    const badges = async force => { if (!force && Date.now() - badgeAt < 60000) return; badgeAt = Date.now(); try { const b = await api('/pm/badges'); const bt = (b.byTrack && b.byTrack[T]) || {}; ui.setBadge(S('my'), bt.my || 0); ui.setBadge(S('bl'), bt.bl || 0); } catch { /* нет доступа */ } };
    M._badges = () => badges(false);
    let ctxData = { leader: false, financeProjects: [] };

    // ---- форма проекта ----
    const projFields = (p, o) => [
      ...(o.isNew && !o.fixedTrack ? [{ name: 'track', label: 'Стадия', type: 'select', options: PM.VISIBLE_TRACKS.map(t => [t, PM.TRACKS[t]]), half: true }] : []),
      { name: 'name', label: 'Объект (название проекта)', required: true, half: !!o.isNew },
      { name: 'no', label: '№ проекта (для папки №-год-название)', half: true }, { name: 'client', label: 'Заказчик', half: true, list: 'dl-cp' },
      { name: 'address', label: 'Адрес / участок', half: true }, { name: 'area', label: 'Площадь, м²', half: true },
      { name: 'status', label: 'Статус', type: 'select', options: PM.STATUS, half: true }, { name: 'risk', label: 'Риск', type: 'select', options: PM.RISK, half: true },
      ...(o.leader ? [{ name: 'gipId', label: 'ГИП (ведёт РП)', type: 'select', options: userOpts(LEAD_ROLES), half: true }, { name: 'pmId', label: 'ПМ (ведёт ЭП)', type: 'select', options: userOpts(LEAD_ROLES), half: true }] : []),
      { name: 'start', label: 'Дата старта (первый день отсчёта срока)', type: 'date', half: true }, { name: 'due', label: 'Дата по договору', type: 'date', half: true },
      { name: 'contractNo', label: 'Договор №', half: true }, { name: 'contractDate', label: 'Дата договора', type: 'date', half: true },
      { name: 'contractTerm', label: 'Срок по договору (число)', type: 'number', min: 0, half: true }, { name: 'contractTermUnit', label: 'Единица срока', type: 'select', options: PM.TERM_UNITS.map(u => [u, u === 'месяцев' ? 'месяцев' : `${u} дней`]), half: true },
      { name: 'contractStartRule', label: 'Отсчёт срока (условие из договора)', half: true }, { name: 'dueFromTerm', label: 'Дата по договору', type: 'select', options: [['0', 'оставить как есть'], ['1', 'пересчитать: старт + срок (рабочие дни по календарю РК)']], half: true },
      { name: 'dueNote', label: 'Примечание к сроку (ДС, продления, чего не хватает для отсчёта)' },
      ...(o.isNew ? [{ name: 'fit', label: 'Разложить сроки', type: 'select', options: [['0', 'От старта по нормативам (недели из регламента)'], ['1', 'Под дату по договору (сжать / растянуть)']], half: true }] : [{ name: 'forecast', label: 'Прогноз сдачи', type: 'date', half: true }]),
      { name: 'folder', label: 'Папка на сервере (например S:\\109-2025-Эверест)' },
      { name: 'miroUrl', label: 'Доска Миро (ссылка; для концепции и ЭП)' },
      ...(o.leader ? [{ name: 'projectId', label: 'Финансовый проект (факт по деньгам берётся из финансов)', type: 'select', options: [['', '—'], ...(o.financeProjects || []).map(x => [x.id, `${x.name}${x.status === 'archive' ? ' · архив' : ''}${x.id !== x.name ? ` (${x.id})` : ''}`])] }] : []),
      { name: 'comment', label: 'Комментарий', type: 'textarea' },
    ];
    ui.ACT.pmNew = ({ track }) => modal(`Новый проект — ${TU.full}`, formHtml(projFields({}, { isNew: true, fixedTrack: T, leader: ctxData.leader, financeProjects: ctxData.financeProjects }), { status: 'В работе', risk: 'Низкий', start: today() }, 'Создать'), async v => {
      v.track = track || T; v.fit = v.fit === '1'; if (!v.months) delete v.months; else v.months = Number(v.months);
      const c = await api('/pm/projects', { method: 'POST', body: v }); toast('Проект создан: этапы и пункты из шаблона'); location.hash = cardLink(c.project.id, c.project.track);
    });

    // ---- реестры ----
    const REG = { [S('reg')]: T === 'ep' ? { title: 'Эскизные проекты', tracks: ['ep'], also: ['concept'] } : { title: 'Рабочие проекты', tracks: ['rp'] } }; // у сотрудника — только его проекты этой стадии (фильтр на сервере) // также: старые карточки концепций показываем среди ЭП
    const register = (id, cfg) => async main => {
      const d = await api('/pm/overview?track=' + T); ctxData = { leader: d.leader, financeProjects: d.financeProjects }; badges();
      const u = params(); const track = cfg.tracks.includes(u.get('track')) ? u.get('track') : cfg.tracks[0];
      const fs = u.get('status') || 'active', mine = u.get('mine') === '1', q = (u.get('q') || '').trim(), ql = q.toLowerCase();
      const VK = 'pm.view.' + T; const view = ['list', 'kanban'].includes(u.get('view')) ? u.get('view') : (pmStore.get(VK) === 'kanban' ? 'kanban' : 'list'); pmStore.set(VK, view); // «Список | Канбан» — запоминается в браузере
      const kanban = view === 'kanban', showCancel = u.get('cancel') === '1';
      const all = d.rows.filter(r => cfg.any || r.track === track || (cfg.also || []).includes(r.track)); // сервер уже отдал сотруднику только его проекты
      let rows = all.slice();
      if (!kanban) { if (fs === 'active') rows = rows.filter(r => PM.ACTIVE(r.status)); else if (fs !== 'all') rows = rows.filter(r => r.status === fs); } // в канбане колонки — сами статусы
      if (mine) rows = rows.filter(r => r.gipId === me().id || r.pmId === me().id);
      if (ql) rows = rows.filter(r => `${r.name} ${r.client || ''} ${r.no || ''} ${r.address || ''}`.toLowerCase().includes(ql));
      rows.sort((a, b) => (b.late - a.late) || (b.hot - a.hot) || String(a.forecast || a.due || '9').localeCompare(String(b.forecast || b.due || '9')) || a.name.localeCompare(b.name, 'ru'));
      expState = { rows, blockers: d.blockersList.filter(b => rows.some(r => r.id === b.pid)) };
      const act = all.filter(r => PM.ACTIVE(r.status));
      const sub = `${act.length} в работе · <span class="${act.filter(r => r.late).length ? 'crit-text' : ''}">просрочено ${act.filter(r => r.late).length}</span> · <span class="${act.filter(r => r.hot).length ? 'warn-text' : ''}">горит (≤ 14 дн.) ${act.filter(r => r.hot).length}</span> · просроченных пунктов ${act.reduce((s, r) => s + r.overdueN, 0)}`;
      const tabs = cfg.tracks.length > 1 && !cfg.any ? `<div class="tabs pm-tabs">${cfg.tracks.map(t => `<a href="#/${id}?${qsOf({ track: t, status: fs, mine: mine ? '1' : '', q, view })}" class="${t === track ? 'active' : ''}">${esc(PM.TRACKS[t])} <span class="faint">${d.rows.filter(r => r.track === t && PM.ACTIVE(r.status)).length}</span></a>`).join('')}</div>` : '';
      const leadLabel = PM.LEAD_FIELD[track] === 'pmId' ? 'ПМ' : 'ГИП';
      const hrefOf = o => `#/${id}?${qsOf(Object.assign({ track: cfg.tracks.length > 1 ? track : '', status: fs === 'active' ? '' : fs, mine: mine ? '1' : '', q, view, cancel: showCancel ? '1' : '' }, o))}`;
      const seg = `<span class="pm-seg" role="tablist"><a href="${hrefOf({ view: 'list' })}" class="${kanban ? '' : 'active'}">Список</a><a href="${hrefOf({ view: 'kanban' })}" class="${kanban ? 'active' : ''}">Канбан</a></span>`;
      // канбан проектов: колонки — статусы; «Отменён» свёрнут, пока не нажали «показать»
      const PCOLS = PM.STATUS.map(st => ({ key: st, label: st, cls: STATUS_CHIP[st][0], fold: PM.KANBAN_PROJECT_HIDDEN.includes(st) && !showCancel, foldHref: hrefOf({ cancel: '1' }) }));
      const projectKanban = list => kanbanHtml(PCOLS, list.map(r => ({ id: r.id, col: PM.STATUS.includes(r.status) ? r.status : 'В работе', canMove: !!r.canEdit, zone: PM.ACTIVE(r.status) && r.health && r.health.zone !== 'none' ? r.health.zone : '',
        html: `<div class="kt">${esc(r.name)}${r.no ? ` <span class="faint">№${esc(r.no)}</span>` : ''}</div>${r.client ? `<div class="faint">${esc(r.client)}</div>` : ''}<div class="km"><span>${esc(leadLabel)}: <b>${esc(pname(r.leadId) || '—')}</b></span></div><div class="km"><span>${esc(cut(r.progress.stageName || '—', 42))}</span><span>${r.progress.pct}%</span></div>${bar(r.progress.pct)}<div class="km">${PM.ACTIVE(r.status) ? zoneChip(r.health) : ''}<span title="срок по договору${r.forecast && r.forecast !== r.due ? '; прогноз ' + fdate(r.forecast) : ''}">⏱ ${r.due ? (r.late ? `<span class="crit-text">${fdate(r.due)}</span>` : fdate(r.due)) : '—'}</span>${r.overdueN ? `<span class="chip crit" title="просроченных пунктов">просроч. ${r.overdueN}</span>` : ''}${r.blockersN ? `<span class="chip ${r.blockerMaxDays > 14 ? 'crit' : 'warn'}" title="открытых блокеров; самый старый — ${r.blockerMaxDays} дн.">⛔ ${r.blockersN}</span>` : ''}${r.hot ? '<span class="chip warn">горит</span>' : ''}</div>` })));
      main.innerHTML = head(cfg.title, d.staff ? `${sub}<div class="faint">Проекты этой стадии, где вы исполнитель пункта или участник; отмечать «сделано» можно только свои пункты.</div>` : sub, (d.canCreate ? `<button class="btn primary" data-act="pmNew" data-track="${track}">+ Проект</button> ` : '') + (d.staff ? '' : '<button class="btn" data-act="pmExport" title="Показанные строки — в Excel">⇩ Excel</button>')) + tabs +
        `<div class="filters">${seg}${kanban ? '' : sel('pm-f-status', [['active', 'Активные'], ...PM.STATUS.map(s => [s, s]), ['all', 'Все']], fs)}<label class="fl"><input type="checkbox" id="pm-f-mine"${mine ? ' checked' : ''}> мои</label><input id="pm-f-q" placeholder="Поиск: объект, заказчик, №" value="${esc(q)}"></div>` +
        (kanban ? (all.length ? projectKanban(rows) : empty(`Проектов «${PM.TRACKS[track]}» пока нет${d.canCreate ? ' — нажмите «+ Проект»' : ''}`)) : rows.length ? tbl([{ t: 'Объект' }, { t: leadLabel }, { t: 'Этап' }, { t: 'Статус' }, { t: 'Буфер' }, { t: 'Старт' }, { t: 'Срок' }, { t: 'Просрочено', cls: 'right' }, { t: 'Блокеры', cls: 'right' }, { t: 'Риск' }],
          rows.map(r => `<tr class="pm-row" data-id="${esc(r.id)}" data-track="${esc(r.track)}"><td><b>${esc(r.name)}</b>${r.no ? ` <span class="faint">№${esc(r.no)}</span>` : ''}<div class="faint">${esc(r.client || '')}</div></td><td class="nowrap">${esc(pname(r.leadId) || '—')}</td><td style="min-width:150px"><div class="faint">${esc(r.progress.stageName)}</div>${bar(r.progress.pct)}<span class="faint">${r.progress.done}/${r.progress.total} · ${r.progress.pct}%</span></td><td>${chip(r.status, STATUS_CHIP)}${r.hot ? ' <span class="chip warn">горит</span>' : ''}</td><td class="nowrap">${PM.ACTIVE(r.status) ? zoneChip(r.health) : '<span class="faint">—</span>'}</td><td class="nowrap">${r.start ? fdate(r.start) : '—'}</td><td class="nowrap">${r.due ? (r.late ? `<span class="crit-text">${fdate(r.due)}</span>` : fdate(r.due)) : '—'}${r.forecast && r.forecast !== r.due ? `<div class="faint">прогноз ${fdate(r.forecast)}</div>` : ''}</td><td class="right">${r.overdueN ? `<span class="chip crit">${r.overdueN}</span>` : '<span class="faint">0</span>'}</td><td class="right">${r.blockersN ? `<span class="chip ${r.blockerMaxDays > 14 ? 'crit' : 'warn'}" title="самый старый — ${r.blockerMaxDays} дн.">${r.blockersN} · ${r.blockerMaxDays} дн.</span>` : '<span class="faint">—</span>'}</td><td>${r.risk && r.risk !== 'Низкий' ? chip(r.risk, RISK_CHIP) : '<span class="faint">низкий</span>'}</td></tr>`))
          : empty(all.length ? 'Под фильтр ничего не попало' : `Проектов «${PM.TRACKS[track]}» пока нет${d.canCreate ? ' — нажмите «+ Проект»' : ''}`));
      main.querySelectorAll('.tbl').forEach(el => el.classList.add('pm-scroll')); // таблица прокручивается внутри себя и не раздувает страницу на телефоне
      const apply = () => { location.hash = hrefOf({ status: $('#pm-f-status') ? $('#pm-f-status').value : fs, mine: $('#pm-f-mine').checked ? '1' : '', q: $('#pm-f-q').value.trim() }); };
      if ($('#pm-f-status')) $('#pm-f-status').onchange = apply; $('#pm-f-mine').onchange = apply; $('#pm-f-q').onkeydown = e => { if (e.key === 'Enter') apply(); };
      main.querySelectorAll('tr.pm-row').forEach(tr => tr.onclick = () => { location.hash = cardLink(tr.dataset.id, tr.dataset.track); });
      if (kanban) bindKanban(main, PCOLS, { menuTitle: 'Статус проекта', onOpen: pid => { const r = rows.find(x => x.id === pid); if (r) location.hash = cardLink(r.id, r.track); },
        onMove: async (pid, to) => { const r = rows.find(x => x.id === pid); await api('/pm/projects/' + encodeURIComponent(pid), { method: 'PUT', body: { status: to } }); toast(`«${r ? r.name : 'Проект'}» → ${to}`); badges(true); } });
      bind(main);
    };
    for (const [id, cfg] of Object.entries(REG)) ui.SECTIONS[id] = register(id, cfg);

    // ---- карточка проекта ----
    ui.SECTIONS[S('p')] = async main => {
      const id = params().get('id'); if (!id) { location.hash = listHash(T); return; }
      const c = await api('/pm/projects/' + encodeURIComponent(id)); const p = c.project, s = c.summary, h = c.health; ctxData = { leader: c.leader, financeProjects: c.financeProjects || [] };
      if (pmTrackPath(p.track) !== T) { location.hash = cardLink(p.id, p.track) + (params().get('tab') ? '&tab=' + encodeURIComponent(params().get('tab')) : ''); return; } // карточка другой стадии — в её раздел
      const tabs = [['stages', 'Этапы'], ['kanban', 'Канбан'], ['charter', `Устав${c.charterOk ? '' : ' ⚠'}`], ['blockers', `Блокеры${c.blockers.filter(b => b.status !== 'closed').length ? ' ' + c.blockers.filter(b => b.status !== 'closed').length : ''}`], ...(c.canBudget ? [['budget', 'Бюджет']] : []), ...(c.hours ? [['hours', `Часы${c.hours.total.hours ? ' ' + Math.round(c.hours.total.hours) : ''}`]] : []), ['retro', `Ретро${(c.retros || []).length ? ' ' + c.retros.length : ''}`], ...(window.MostBoard && window.MostBoard.embed && ['ep', 'rp', 'concept'].includes(p.track) ? [['board', 'Доска']] : []), ...(p.track === 'ep' || p.track === 'concept' || p.miroUrl ? [['miro', 'Миро']] : []), ['info', 'О проекте']];
      const tab = tabs.some(t => t[0] === params().get('tab')) ? params().get('tab') : 'stages';
      const link = t => `${cardLink(p.id, p.track)}&tab=${t}`;
      const next = PM.NEXT_TRACK[p.track];
      const btns = [c.canEdit ? `<button class="btn" data-act="pmPlan">⇶ Разложить сроки</button>` : '', c.canEdit && next && !p[next + 'Id'] ? `<button class="btn" data-act="pmHandover">${p.track === 'concept' ? '→ Свернуть в ЭП' : `→ Передать в ${esc(PM.TRACK_SHORT[next])}`}</button>` : '', c.canEdit ? `<button class="btn" data-act="pmEdit">✎ Проект</button>` : '', c.leader ? `<button class="btn" data-act="pmRebuild" title="Пересобрать пункты по текущему шаблону">⟳ Шаблон</button>` : '', c.leader ? `<button class="btn danger" data-act="pmDel">✕</button>` : ''].filter(Boolean).join(' ');
      const sub = `<div class="pm-sub">${chip(p.track, TRACK_CHIP)} ${chip(p.status, STATUS_CHIP)} ${p.risk && p.risk !== 'Низкий' ? chip(p.risk, RISK_CHIP) : ''}${p.client ? `<span>${esc(p.client)}</span>` : ''}${p.gipId ? `<span>ГИП: <b>${esc(pname(p.gipId))}</b></span>` : ''}${p.pmId ? `<span>ПМ: <b>${esc(pname(p.pmId))}</b></span>` : ''}${p.folder ? `<a href="file:///${esc(p.folder.replace(/\\/g, '/'))}" title="Откроется, если браузер разрешает file://; иначе — скопируйте путь">📁 Папка</a><button class="btn sm" data-act="pmCopy" data-text="${esc(p.folder)}">Скопировать путь</button>` : ''}${c.ep && pmTrackPath(p.track) === 'rp' ? `<a href="${cardLink(c.ep.id, 'ep')}" title="Эскизный проект этого объекта">← ЭП этого объекта</a>` : ''}${c.rp && pmTrackPath(p.track) === 'ep' ? `<a href="${cardLink(c.rp.id, 'rp')}" title="Рабочий проект этого объекта">РП этого объекта →</a>` : ''}</div>`;
      const deadline = p.forecast || p.due;
      main.innerHTML = `<p class="faint" style="margin:0 0 6px"><a href="${listHash(p.track)}">← ${esc(PM.TRACKS[p.track] || 'Проекты')}</a></p>` + head(p.name, sub, btns) +
        `<div class="grid g4 pm-kpi" style="margin-bottom:14px">
          <div class="card"><div class="label">Готовность</div><div class="val">${s.progress.pct}%</div>${bar(s.progress.pct)}<div class="foot">${s.progress.done} из ${s.progress.total} пунктов · этап ${s.progress.stage} из ${c.stageNames.length}: ${esc(s.progress.stageName)}</div></div>
          <div class="card ${['red', 'black'].includes(h.zone) ? 'crit' : h.zone === 'green' ? 'ok' : ''}"><div class="label">Буфер расписания</div><div class="val">${h.zone === 'none' ? '—' : pct(h.consumption)}</div><div class="foot">${zoneChip(h)}<br>${h.zone === 'none' ? (c.canEdit ? 'Задайте старт и дату по договору в «✎ Проект», затем «⇶ Разложить сроки»' : 'старт и дата по договору не заданы') : `план до ${fdate(h.planEnd)} · с буфером до ${fdate(h.promised)} · ${h.mode === 'contract' ? 'буфер 30 % срока договора' : 'буфер от оценок цепи'}`}</div></div>
          <div class="card ${s.late ? 'crit' : ''}"><div class="label">Срок</div><div class="val">${deadline ? fdate(deadline) : '—'}</div><div class="foot">${p.due ? `по договору ${fdate(p.due)}` : 'дата по договору не задана'}${h.forecast.realistic ? ` · прогноз по скорости ${fdate(h.forecast.realistic)}` : ' · скорость пока не измерена'}${s.late ? ' · <b class="crit-text">просрочен</b>' : s.hot ? ' · <b class="warn-text">горит</b>' : ''}</div></div>
          <div class="card ${s.overdueN ? 'crit' : ''}"><div class="label">Просрочено пунктов</div><div class="val">${s.overdueN}</div><div class="foot">блокеров ${s.blockersN}${s.blockerMaxDays ? ` · висит до ${s.blockerMaxDays} дн.` : ''}</div></div>
        </div>` +
        (h.zone === 'none' && c.canEdit ? `<div class="notice" style="margin-bottom:12px">Сроки не заданы — буфер и прогноз не считаются. <b>Задайте старт и срок</b> в «✎ Проект» (или «Дата по договору» из договора), затем <b>⇶ Разложить сроки</b> по пунктам.</div>` : '') +
        `<div class="tabs pm-tabs">${tabs.map(t => `<a href="${link(t[0])}" class="${t[0] === tab ? 'active' : ''}">${esc(t[1])}</a>`).join('')}</div>` +
        (tab === 'stages' ? stagesHtml(c) : tab === 'kanban' ? itemKanbanHtml(c) : tab === 'charter' ? charterHtml(c) : tab === 'retro' ? retroHtml(c) : tab === 'blockers' ? blockersHtml(c) : tab === 'budget' ? budgetHtml(c) : tab === 'hours' ? hoursHtml(c) : tab === 'board' ? '<div id="pm-board"></div>' : tab === 'miro' ? miroHtml(c) : infoHtml(c));
      // доска проекта (модуль board): встраивается после отрисовки, сам показывает доски проекта, «+ Доска» по правам и «На весь экран»
      if (tab === 'board' && window.MostBoard && window.MostBoard.embed) window.MostBoard.embed(document.getElementById('pm-board'), { pmProjectId: p.id, height: '72vh' });
      // действия карточки
      const canEditAny = c.canEdit;
      ui.ACT.pmEdit = () => modal('Проект', formHtml(projFields(p, { leader: c.leader, financeProjects: c.financeProjects }), p), async v => { await api('/pm/projects/' + p.id, { method: 'PUT', body: v }); toast('Сохранено'); rerender(); });
      ui.ACT.pmRebuild = () => modal('Пересобрать пункты по шаблону', `<p class="faint" style="margin:0 0 10px">Пункты проекта будут пересобраны по текущему шаблону «${esc(PM.TRACKS[p.track])}»${p.templateVersion ? ` (сейчас: ${esc(p.templateVersion)})` : ''}. У совпавших по коду или названию пунктов сохранятся отметки «сделано», сроки, исполнители, заметки и история. Остальные пункты с данными и добавленные вручную / из ClickUp уйдут в конец, в этап «Прочее»; без данных — удалятся (список — в журнале).</p>` + formHtml([{ name: 'keepExtra', label: 'Пункты не из шаблона', type: 'select', options: [['1', 'оставить в этапе «Прочее»'], ['0', 'удалить все несовпавшие']] }], { keepExtra: '1' }, 'Пересобрать'), async v => { const r = await api(`/pm/projects/${p.id}/rebuild`, { method: 'POST', body: { template: p.track, keepExtra: v.keepExtra === '1' } }); toast(`Шаблон применён: совпало ${r.report.matched}, новых ${r.report.created}, в «Прочее» ${r.report.moved.length}, удалено ${r.report.deleted.length}${r.report.deleted.length ? ': ' + r.report.deleted.slice(0, 5).join(', ') : ''}`, 12000); rerender(); });
      ui.ACT.pmPlan = () => modal('Разложить сроки', `<p class="faint" style="margin:0 0 10px">Пункт с блокерами (зависимостями, «ждёт: B3») начинается, когда закрыты все его блокеры; без блокеров — с начала своего этапа; этапы идут друг за другом, длительность — по неделям оценки. Сроки уже сделанных пунктов не меняются.</p>` + formHtml([{ name: 'start', label: 'Дата старта', type: 'date', value: p.start || today() }, { name: 'fit', label: 'Как считать', type: 'select', options: [['0', 'От старта по нормативам'], ['1', p.due ? `Под дату по договору (${fdate(p.due)})` : 'Под дату по договору — сначала задайте её в карточке']] }], {}, 'Разложить'), async v => { await api(`/pm/projects/${p.id}/plan`, { method: 'POST', body: { start: v.start, fit: v.fit === '1' } }); toast('Сроки разложены'); rerender(); });
      ui.ACT.pmHandover = () => p.track === 'concept'
        ? modal('Свернуть в ЭП', `<p class="faint" style="margin:0 0 10px">Концепция теперь — первый этап эскизного проекта. Карточка станет ЭП: её пункты — этап 1 «Концепция», ниже добавятся этапы 2–9 шаблона ЭП; отметки «сделано» сохранятся.</p>` + formHtml([{ name: 'pmId', label: 'ПМ эскизного проекта', type: 'select', options: userOpts(LEAD_ROLES), value: p.pmId || '' }, { name: 'start', label: 'Старт (сроки пересчитаются от даты)', type: 'date', value: p.start || today(), half: true }, { name: 'due', label: 'Дата по договору', type: 'date', value: p.due || '', half: true }], {}, 'Свернуть в ЭП'), async v => { await api(`/pm/projects/${p.id}/handover`, { method: 'POST', body: v }); toast('Концепция свёрнута в ЭП'); rerender(); })
        : modal(`Передать в ${PM.TRACK_SHORT[next]}`, `<p class="faint" style="margin:0 0 10px">Будет создан новый проект «${esc(PM.TRACKS[next])}» со своим шаблоном этапов; этот проект закроется со статусом «Готово».</p>` + formHtml([{ name: 'gipId', label: 'ГИП рабочего проекта', type: 'select', options: userOpts(LEAD_ROLES), value: p.gipId || '' }, { name: 'start', label: 'Старт', type: 'date', value: today(), half: true }, { name: 'due', label: 'Дата по договору', type: 'date', half: true }, { name: 'comment', label: 'Комментарий' }], {}, 'Передать'), async v => { const r = await api(`/pm/projects/${p.id}/handover`, { method: 'POST', body: v }); toast(`Создан ${PM.TRACK_SHORT[next]}: ${r.project.name}`); if (pmTrackOpen(me(), pmTrackPath(r.project.track))) location.hash = cardLink(r.project.id, r.project.track); else rerender(); });
      ui.ACT.pmDel = async () => { if (!confirm(`Удалить проект «${p.name}» со всеми пунктами и блокерами?`)) return; await api('/pm/projects/' + p.id, { method: 'DELETE' }); toast('Удалено'); location.hash = listHash(p.track); };
      ui.ACT.pmCopy = ({ text }) => copy(text);
      ui.ACT.pmMiroSave = async () => { const v = $('#pm-miro-url').value.trim(); await api('/pm/projects/' + p.id, { method: 'PUT', body: { miroUrl: v } }); toast('Ссылка сохранена'); rerender(); };
      // устав и ретроспектива (Метод Пульса)
      ui.ACT.pmCharterEdit = () => { modal('Устав проекта', `<p class="faint" style="margin:0 0 10px">Заполняйте вместе с командой и заказчиком на запуске (не дольше 4 часов). «Что» — результат без глаголов, одна цель. Критерий завершения зависит только от нас, критерий успеха может зависеть от заказчика и рынка.</p>` + formHtml(PM.CHARTER_FIELDS.map(([k, l]) => ({ name: k, label: l, type: ['requirements', 'environment', 'threats', 'people'].includes(k) ? 'textarea' : 'text' })), p.charter || {}), async v => { await api('/pm/projects/' + p.id, { method: 'PUT', body: { charter: v } }); toast('Устав сохранён'); rerender(); }); $('#modal .modal-card').style.maxWidth = '720px'; };
      ui.ACT.pmRetroAdd = () => { modal('Ретроспектива', `<div class="card" style="margin-bottom:12px"><div class="label">Показатели сейчас (снимутся автоматически)</div><div class="pm-sub">${zoneChip(h)} <span class="faint">выполнено ${pct(h.progress)} · скорость ${h.curV} нед./день (средняя ${h.avgV}) · добавлено ${h.addedW} нед. · возвратов ${h.returns} · прогноз ${h.forecast.realistic ? fdate(h.forecast.realistic) : '—'}</span></div></div>` + formHtml([{ name: 'interpret', label: 'Как понимаем показатели (почему буфер расходуется так)', type: 'textarea' }, { name: 'change', label: 'Что меняем в работе (правила, порядок, качество)', type: 'textarea' }, { name: 'actions', label: 'План действий, по одному в строке: первый шаг | кто | когда начнём (ГГГГ-ММ-ДД) | сколько сделаем к следующей ретро', type: 'textarea' }], {}, 'Записать'), async v => { const actions = String(v.actions || '').split('\n').map(l => l.split('|').map(x => x.trim())).filter(a => a[0]).map(a => ({ step: a[0], who: a[1] || '', when: a[2] || '', howMuch: a[3] || '' })); await api(`/pm/projects/${p.id}/retro`, { method: 'POST', body: { interpret: v.interpret, change: v.change, actions } }); toast('Ретроспектива записана'); location.hash = `${cardLink(p.id, p.track)}&tab=retro`; rerender(); }); $('#modal .modal-card').style.maxWidth = '720px'; };
      ui.ACT.pmRetroDel = async ({ id: rid }) => { if (!confirm('Удалить запись ретроспективы?')) return; await api(`/pm/projects/${p.id}/retro/${rid}`, { method: 'DELETE' }); toast('Удалено'); rerender(); };
      // пункты
      const dl = `<datalist id="pm-dl-contr">${(c.contractors || []).map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
      const stageOpts = [...new Map(c.items.map(i => [i.stage, i.stageName])).entries()].sort((a, b) => a[0] - b[0]).map(([n, nm]) => [n, nm]);
      const itemFields = (it, full) => [
        ...(full ? [{ name: 'title', label: 'Пункт', required: true }, { name: 'stage', label: 'Этап', type: 'select', options: stageOpts, half: true }, { name: 'role', label: 'Роль (кто ведёт)', type: 'select', options: PM.ITEM_ROLES, half: true }, { name: 'weeks', label: 'Оптимистичная оценка, недель (успеем с вероятностью 50 %)', type: 'number', step: '0.1', half: true }, { name: 'weeksMax', label: 'Пессимистичная, недель (90 %; пусто = ×2)', type: 'number', step: '0.1', half: true }, { name: 'crit', label: 'Критерий приёмки' }] : []),
        { name: 'due', label: 'Срок', type: 'date', half: true }, { name: 'assigneeId', label: 'Исполнитель (сотрудник)', type: 'select', options: userOpts(), half: true },
        { name: 'contractor', label: 'Исполнитель-подрядчик (субподряд; ведёт руководитель раздела)', list: 'pm-dl-contr' },
        { name: 'na', label: 'Не требуется в этом проекте', type: 'select', options: [['false', 'Нет — пункт нужен'], ['true', 'Да — не требуется']], half: true }, { name: 'doneNote', label: 'Чем подтверждено (документ, письмо)', half: true },
        { name: 'note', label: 'Заметка', type: 'textarea' },
      ];
      const itemBody = v => { v.na = v.na === 'true'; if ('weeks' in v) v.weeks = Number(String(v.weeks).replace(',', '.')) || 1; if ('weeksMax' in v) v.weeksMax = Number(String(v.weeksMax).replace(',', '.')) || 0; if ('stage' in v) v.stage = Number(v.stage); return v; };
      ui.ACT.pmItemAdd = ({ stage }) => modal('Новый пункт', dl + formHtml([{ name: 'title', label: 'Пункт', required: true }, { name: 'stage', label: 'Этап', type: 'select', options: stageOpts, half: true }, { name: 'role', label: 'Роль (кто ведёт)', type: 'select', options: PM.ITEM_ROLES, half: true }, { name: 'weeks', label: 'Недель', type: 'number', step: '0.1', half: true }, { name: 'due', label: 'Срок', type: 'date', half: true }, { name: 'crit', label: 'Критерий приёмки' }, { name: 'assigneeId', label: 'Исполнитель', type: 'select', options: userOpts(), half: true }, { name: 'contractor', label: 'Подрядчик', list: 'pm-dl-contr', half: true }, { name: 'note', label: 'Заметка' }], { stage: Number(stage) || 1, role: 'ГИП', weeks: 1 }, 'Добавить'), async v => { await api(`/pm/projects/${p.id}/items`, { method: 'POST', body: itemBody(v) }); toast('Пункт добавлен'); rerender(); });
      ui.ACT.pmItemHist = ({ id: iid }) => { const it = c.items.find(x => x.id === iid); if (it) histModal(it); };
      ui.ACT.pmItemEdit = ({ id: iid }) => { const it = c.items.find(x => x.id === iid); if (!it) return; modal(canEditAny ? 'Пункт' : 'Пункт: срок, исполнитель, заметка', dl + `<p class="faint" style="margin:0 0 8px"><b>${esc(it.stageName)}</b>${canEditAny ? '' : ` · ${esc(it.title)}${it.crit ? ` · критерий: ${esc(it.crit)}` : ''}`}</p>` + formHtml(itemFields(it, canEditAny), Object.assign({}, it, { na: it.na ? 'true' : 'false' })), async v => { await api('/pm/items/' + iid, { method: 'PUT', body: itemBody(v) }); toast('Сохранено'); rerender(); }); };
      ui.ACT.pmItemDel = async ({ id: iid }) => { if (!confirm('Удалить пункт?')) return; await api('/pm/items/' + iid, { method: 'DELETE' }); toast('Удалено'); rerender(); };
      bindChecks(main);
      if (tab === 'kanban') {
        const ks = $('#pm-k-stage'); if (ks) ks.onchange = () => { location.hash = `${link('kanban')}${ks.value ? '&kst=' + encodeURIComponent(ks.value) : ''}`; };
        bindKanban(main, KCOLS, { menuTitle: 'Статус пункта', onOpen: iid => { const it = c.items.find(x => x.id === iid); if (it && it.canEdit) ui.ACT.pmItemEdit({ id: iid }); else if (it && (it.history || []).length) histModal(it); },
          onMove: async (iid, to) => { await api('/pm/items/' + encodeURIComponent(iid), { method: 'PUT', body: { kstatus: to } }); toast(to === 'done' ? 'Отмечено: сделано' : `→ ${PM.KANBAN.find(k => k[0] === to)[1]}`); badges(true); } });
      }
      // блокеры карточки
      ui.ACT.pmBlAdd = () => blockerModal(null, p.id);
      ui.ACT.pmBlEdit = ({ id: bid }) => { const b = c.blockers.find(x => x.id === bid); if (b) blockerModal(b); };
      ui.ACT.pmBlClose = async ({ id: bid, to }) => { await api('/pm/blockers/' + bid, { method: 'PUT', body: { status: to } }); toast(to === 'closed' ? 'Блокер закрыт' : 'Блокер открыт снова'); rerender(); badges(true); };
      ui.ACT.pmBlDel = async ({ id: bid }) => { if (!confirm('Удалить блокер?')) return; await api('/pm/blockers/' + bid, { method: 'DELETE' }); toast('Удалено'); rerender(); };
      bind(main);
    };
    // галочки «сделано» — общие для карточки и «Моих задач»
    function bindChecks(main) {
      main.querySelectorAll('input[data-pmdone]').forEach(cb => cb.onchange = async () => { const on = cb.checked; try { await api('/pm/items/' + cb.dataset.pmdone, { method: 'PUT', body: { done: on } }); toast(on ? 'Отмечено: сделано' : 'Отметка снята'); await rerender(); badges(true); } catch (e) { toast(e.message, 4000); cb.checked = !on; } });
    }
    // история пункта: последние 20 изменений (сервер хранит в самом пункте)
    const HIST_LABEL = (e, name) => { const d = v => v ? fdate(String(v).slice(0, 10)) : '—'; const yes = v => v === true || v === 'true';
      switch (e.field) {
        case 'created': return 'пункт добавлен';
        case 'done': return yes(e.to) ? '✓ отмечено «сделано»' : 'снята отметка «сделано»';
        case 'na': return yes(e.to) ? 'отмечено «не требуется»' : 'снято «не требуется»';
        case 'due': return `срок: ${d(e.from)} → ${d(e.to)}`;
        case 'assigneeId': return `исполнитель: ${e.from ? name(e.from) : '—'} → ${e.to ? name(e.to) : '—'}`;
        case 'contractor': return `подрядчик: ${e.from || '—'} → ${e.to || '—'}`;
        case 'title': return `название: «${e.from}» → «${e.to}»`;
        case 'weeks': return `оценка: ${e.from || '—'} → ${e.to} нед.`;
        case 'weeksMax': return `пессимистичная оценка: ${e.from || '—'} → ${e.to || '—'} нед.`;
        case 'stage': return `этап: ${e.from} → ${e.to}`;
        case 'role': return `роль: ${e.from || '—'} → ${e.to}`;
        case 'kstatus': { const L = k => (PM.KANBAN.find(x => x[0] === k) || [k, k || '—'])[1]; return `канбан: ${L(e.from)} → ${L(e.to)}`; }
        default: return `${e.field}: ${e.from} → ${e.to}`;
      } };
    const fdt = iso => { const x = new Date(iso); return isNaN(x) ? String(iso || '') : x.toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
    const histModal = it => modal('История пункта', `<p class="faint" style="margin:0 0 8px">${esc(it.title)}${it.stageName ? ` · ${esc(it.stageName)}` : ''}</p>` + ((it.history || []).length ? `<div class="pm-hist">${it.history.slice().reverse().map(e => `<div class="pm-hist-row"><span class="faint nowrap">${esc(fdt(e.at))}</span><span>${esc(HIST_LABEL(e, pname))}${e.note ? ` <span class="faint">(${esc(e.note)})</span>` : ''}</span><span class="faint">${esc(pname(e.by) || e.by || '')}</span></div>`).join('')}</div>` : empty('Изменений пока нет')));
    // выгрузка реестра в Excel (.xlsx собирается в браузере, domain.xlsx): показанные строки реестра или вся сводка
    let expState = { rows: [], blockers: [] };
    ui.ACT.pmExport = () => {
      const sheets = PM.registryExport(expState.rows, expState.blockers, id => pname(id)); const bytes = PM.xlsx(sheets);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `MOST_Планирование_проектов_${today()}.xlsx`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      toast(`Excel: ${expState.rows.length} проектов, ${sheets[1].rows.length - 1} открытых блокеров`);
    };
    const itemRow = (it, o) => { const over = !it.done && !it.na && it.due && it.due < today(); return `<tr class="pm-item${it.done ? ' done' : ''}${it.na ? ' na' : ''}${over ? ' over' : ''}">
      <td class="pm-chk"><input type="checkbox" data-pmdone="${esc(it.id)}"${it.done ? ' checked' : ''}${it.canEdit && !it.na ? '' : ' disabled'} title="${it.canEdit ? 'Отметить «сделано»' : 'Этот пункт ведёт другой раздел'}"></td>
      <td>${o && o.project ? `<div class="faint"><a href="${cardLink(it.pid, it.track)}">${esc(it.project)}</a> · ${esc(it.stageName)}</div>` : ''}<div class="pm-t">${it.code ? `<span class="pm-code">${esc(it.code)}</span> ` : ''}${esc(it.title)}${(it.waiting || []).length ? ` <span class="chip warn" title="ждёт закрытия пунктов-блокеров">ждёт: ${esc(it.waiting.join(', '))}</span>` : ''}${it.rmStatus && !it.done ? ` <span class="chip neutral" title="статус из дорожной карты">${esc(it.rmStatus)}</span>` : ''}${it.optional ? ' <span class="chip neutral" title="по необходимости">опц.</span>' : ''}${it.na ? ' <span class="chip neutral">не требуется</span>' : ''}${it.custom ? ' <span class="chip neutral" title="добавлен вручную">доп.</span>' : ''}</div>${it.crit ? `<div class="pm-crit">критерий: ${esc(it.crit)}</div>` : ''}${it.note ? `<div class="pm-note">${esc(it.note)}</div>` : ''}${it.done ? `<div class="pm-crit">сделано${it.doneAt ? ' ' + fdate(it.doneAt) : ''}${it.doneBy ? ' · ' + esc(pname(it.doneBy)) : ''}${it.doneNote ? ' · ' + esc(it.doneNote) : ''}</div>` : ''}</td>
      <td class="nowrap">${esc(it.role)}${it.section && it.section !== it.role ? `<div class="faint">${esc(it.section)}</div>` : ''}</td>
      <td>${it.assigneeId ? esc(pname(it.assigneeId)) : '<span class="faint">—</span>'}${it.contractor ? `<div class="faint" title="исполнитель-подрядчик">🛠 ${esc(it.contractor)}</div>` : ''}</td>
      <td class="nowrap due">${dueHtml(it.due, it.done)}${!it.done && it.weeks ? `<div class="faint" title="оптимистичная – пессимистичная оценка">${PM.W(it)}–${PM.WMAX(it)} нед.</div>` : ''}${it.returns ? `<div class="faint crit-text" title="снимали отметку «сделано»">возвратов ${it.returns}</div>` : ''}</td>
      <td><div class="actions">${(it.history || []).length ? `<button class="btn sm" data-act="pmItemHist" data-id="${esc(it.id)}" title="История: кто и когда менял">🕓</button>` : ''}${it.canEdit ? `<button class="btn sm" data-act="pmItemEdit" data-id="${esc(it.id)}" title="Изменить">✎</button>${o && o.manager ? `<button class="btn sm danger" data-act="pmItemDel" data-id="${esc(it.id)}" title="Удалить">✕</button>` : ''}` : ''}</div></td></tr>`; };
    // канбан пунктов проекта: колонки «К выполнению / В работе / На проверке / Готово» (поле kstatus; «Готово» = отметка «сделано»), «не требуется» не показываются
    const KCOLS = PM.KANBAN.map(([key, label]) => ({ key, label, cls: { todo: 'neutral', doing: 'accent', review: 'warn', done: 'ok' }[key] }));
    function itemKanbanHtml(c) {
      const kst = params().get('kst') || ''; const cur = c.summary.progress.stage;
      const stages = [...new Map(c.items.map(i => [i.stage, i.stageName])).entries()].sort((a, b) => a[0] - b[0]);
      const act = c.items.filter(i => !i.na); const na = c.items.length - act.length;
      const list = act.filter(i => !kst || (kst === 'cur' ? i.stage === cur : String(i.stage) === kst));
      const t = today();
      const cards = list.map(it => { const over = !it.done && it.due && it.due < t; return { id: it.id, col: it.kcol || PM.itemKanban(it), canMove: !!it.canEdit, zone: over ? 'red' : '',
        html: `<div class="kt">${it.code ? `<span class="pm-code">${esc(it.code)}</span> ` : ''}${esc(it.title)}</div><div class="km"><span class="faint">${esc(cut(it.stageName || '', 40))}</span></div><div class="km"><span>${it.assigneeId ? '👤 ' + esc(pname(it.assigneeId)) : `<span class="faint">${esc(it.role || '')}</span>`}</span>${it.contractor ? `<span class="faint" title="исполнитель-подрядчик">🛠 ${esc(cut(it.contractor, 24))}</span>` : ''}</div><div class="km"><span title="${over ? 'просрочено' : 'срок'}">⏱ ${dueHtml(it.due, it.done)}</span>${(it.waiting || []).length && !it.done ? `<span class="chip warn" title="ждёт закрытия пунктов-блокеров">ждёт: ${esc(it.waiting.join(', '))}</span>` : ''}${it.returns ? `<span class="faint crit-text" title="снимали отметку «сделано»">возвр. ${it.returns}</span>` : ''}</div>` }; });
      const opts = [['', `Все этапы (${act.length})`], ['cur', `Текущий этап ${cur}`], ...stages.map(([n, nm]) => [String(n), nm])];
      return `<div class="filters">${sel('pm-k-stage', opts, kst)}<span class="faint">Перетащите карточку в колонку${c.items.some(i => i.canEdit) ? '' : ' (нет прав на пункты — только просмотр)'}; на телефоне — долгое нажатие или ⇄. «Готово» = отметка «сделано».${na ? ` Не требуется: ${na} (скрыты).` : ''}</span></div>` + (list.length ? kanbanHtml(KCOLS, cards) : empty('Пунктов нет'));
    }
    const ITEM_COLS = [{ t: '' }, { t: 'Пункт' }, { t: 'Роль' }, { t: 'Исполнитель' }, { t: 'Срок' }, { t: '' }];
    function stagesHtml(c) {
      const by = new Map(); for (const it of c.items) { if (!by.has(it.stage)) by.set(it.stage, { n: it.stage, name: it.stageName, items: [] }); by.get(it.stage).items.push(it); }
      const stages = [...by.values()].sort((a, b) => a.n - b.n); const cur = c.summary.progress.stage;
      if (!stages.length) return empty('Пунктов нет');
      return stages.map(st => { const act = st.items.filter(i => !i.na), done = act.filter(i => i.done).length, fin = act.length && done === act.length, dues = act.filter(i => !i.done && i.due).map(i => i.due).sort(), over = act.filter(i => !i.done && i.due && i.due < today()).length;
        return `<details class="card pm-stage${st.n === cur ? ' cur' : ''}${fin ? ' fin' : ''}"${st.n === cur || (!fin && st.n < cur + 2 && st.n >= cur) ? ' open' : ''}><summary><span class="grow">${esc(st.name)}</span><span class="faint">${done}/${act.length}</span>${fin ? '<span class="chip ok">готово</span>' : st.n === cur ? '<span class="chip accent">текущий</span>' : ''}${over ? `<span class="chip crit">просрочено ${over}</span>` : ''}${dues.length ? `<span class="faint">до ${fdate(dues[dues.length - 1])}</span>` : ''}${c.canEdit ? `<button class="btn sm" data-act="pmItemAdd" data-stage="${st.n}">+ Пункт</button>` : ''}</summary>${tbl(ITEM_COLS, st.items.map(it => itemRow(it, { manager: c.canEdit })))}</details>`; }).join('');
    }
    function charterHtml(c) {
      const ch = c.project.charter || {}; const ok = PM.charterComplete(ch);
      return `<div class="card" style="margin-bottom:12px"><div class="label">Проверочная фраза устава</div>${ok ? `<p class="pm-phrase">${esc(PM.charterPhrase(ch))}</p>` : `<p class="faint" style="margin:6px 0 0">Устав не заполнен: нужны «что», «зачем», критерий завершения и критерий успеха. Без устава расползается объём и теряется цель — заполните на запуске проекта вместе с командой и заказчиком.</p>`}${c.canEdit ? '<div style="margin-top:10px"><button class="btn primary" data-act="pmCharterEdit">✎ Устав</button></div>' : ''}</div>
        <div class="card"><div class="pm-kv">${PM.CHARTER_FIELDS.map(([k, l]) => `<b>${esc(l.split(' (')[0])}</b><div>${ch[k] ? esc(ch[k]).replace(/\n/g, '<br>') : '<span class="faint">—</span>'}</div>`).join('')}</div></div>`;
    }
    function retroHtml(c) {
      const list = (c.retros || []).slice().reverse();
      return `<div class="head" style="margin-bottom:10px"><div class="grow faint">Ретроспектива спринта или этапа (поток улучшений): показатели снимаются автоматически, команда отвечает «как это понимать» и «что меняем», план действий — с первым шагом, ответственным и сроком. Без плана действий ретроспектива прошла зря.</div>${c.canEdit ? '<button class="btn primary" data-act="pmRetroAdd">+ Ретроспектива</button>' : ''}</div>` +
        (list.length ? list.map(r => { const s = r.snapshot || {}; return `<div class="card" style="margin-bottom:10px"><div class="pm-sub"><b>${fdate(r.date)}</b> <span class="faint">${esc(pname(r.by))}</span> ${s.zone ? `<span class="chip ${ZONE_CHIP[s.zone][0]}">${esc(ZONE_CHIP[s.zone][1])} · ${pct(s.consumption)}</span>` : ''} <span class="faint">выполнено ${pct(s.progress)} · скорость ${s.curV} нед./день · добавлено ${s.addedW} нед. · возвратов ${s.returns} · блокеров ${s.blockers}${s.forecast && s.forecast.realistic ? ' · прогноз ' + fdate(s.forecast.realistic) : ''}</span>${c.canEdit ? `<button class="btn sm danger" data-act="pmRetroDel" data-id="${esc(r.id)}" style="margin-left:auto">✕</button>` : ''}</div>${r.interpret ? `<p style="margin:8px 0 0"><b>Как понимаем показатели:</b> ${esc(r.interpret)}</p>` : ''}${r.change ? `<p style="margin:6px 0 0"><b>Что меняем:</b> ${esc(r.change)}</p>` : ''}${(r.actions || []).length ? `<div style="margin-top:8px">${tbl([{ t: 'Первый шаг' }, { t: 'Кто' }, { t: 'Когда начнём' }, { t: 'Сколько сделаем к следующей ретро' }], r.actions.map(a => `<tr><td>${esc(a.step)}</td><td>${esc(a.who || '')}</td><td class="nowrap">${a.when ? fdate(a.when) : ''}</td><td>${esc(a.howMuch || '')}</td></tr>`))}</div>` : ''}</div>`; }).join('') : empty('Ретроспектив ещё не было'));
    }
    function infoHtml(c) {
      const p = c.project; const row = (k, v) => v ? `<b>${esc(k)}</b><div>${v}</div>` : '';
      const rel = ['concept', 'ep', 'rp'].filter(k => c[k]).map(k => `<a href="${cardLink(c[k].id, c[k].track)}">${esc(PM.TRACK_SHORT[c[k].track])}: ${esc(c[k].name)}</a> ${chip(c[k].status, STATUS_CHIP)}`).join('<br>');
      return `<div class="card"><div class="pm-kv">${row('Заказчик', esc(p.client || ''))}${row('Адрес / участок', esc(p.address || ''))}${row('Площадь', p.area ? esc(String(p.area)) + ' м²' : '')}${row('№ проекта', esc(p.no || ''))}
        <b>Папка на сервере</b><div>${p.folder ? `<span class="pm-path">${esc(p.folder)}</span> <a class="btn sm" href="file:///${esc(p.folder.replace(/\\/g, '/'))}">Открыть папку</a> <button class="btn sm" data-act="pmCopy" data-text="${esc(p.folder)}">Скопировать путь</button><div class="faint">Браузер может не открывать file:// — тогда вставьте скопированный путь в адресную строку Проводника.</div>` : `<span class="faint">не указана.</span> Стандарт: <span class="pm-path">S:\\${esc(c.folderHint)}</span> <button class="btn sm" data-act="pmCopy" data-text="S:\\${esc(c.folderHint)}">Скопировать имя</button><div class="faint">Папку создаёт сисадмин; внутри — разделы ${PM.FOLDER_SECTIONS.join(', ')}. Путь впишите в «✎ Проект».</div>`}</div>
        ${row('Ведёт', [p.gipId ? `ГИП ${esc(pname(p.gipId))}` : '', p.pmId ? `ПМ ${esc(pname(p.pmId))}` : ''].filter(Boolean).join(' · '))}${row('Финансовый проект', c.finance ? `${esc(c.finance.name)} <span class="faint">(${esc(c.finance.id)}${c.finance.status === 'archive' ? ', архив' : ''})</span>` : (c.leader ? '<span class="faint">не привязан — выберите в «✎ Проект», чтобы видеть факт по деньгам</span>' : ''))}${row('Связанные стадии', rel)}${row('Договор', PM.contractLabel(p) ? `${esc(PM.contractLabel(p))}${p.contractStartRule ? `<div class="faint">отсчёт: ${esc(p.contractStartRule)}</div>` : ''}` : '')}${row('Сроки', `${p.start ? 'старт ' + fdate(p.start) : ''}${p.due ? ' · по договору ' + fdate(p.due) : ''}${p.forecast ? ' · прогноз ' + fdate(p.forecast) : ''}${p.dueNote ? `<div class="faint">${esc(p.dueNote)}</div>` : ''}`)}${row('Комментарий', esc(p.comment || '').replace(/\n/g, '<br>'))}${row('Создан', `${fdate(String(p.createdAt || '').slice(0, 10))}${p.createdBy ? ' · ' + esc(pname(p.createdBy)) : ''}${p.imported ? ` · импорт из реестра ${fdate(String(p.imported.at).slice(0, 10))}` : ''}`)}</div></div>`;
    }
    // часы табелей по проекту (модуль «Персонал»): разделы и люди за всё время и по месяцам; деньги — если сервер их отдал
    function hoursHtml(c) {
      const h = c.hours; if (!h) return ''; const fh = v => v ? String(Math.round(v * 10) / 10).replace('.', ',') : ''; const fm = v => v ? money(v) : '';
      const note = `<div class="faint" style="margin-bottom:8px">Часы из табелей модуля «Персонал» — сданные и принятые (черновики не считаются); месяц недели — по её четвергу. ${h.total.hours ? `${fh(h.total.hours)} ч за ${h.weeks} нед.${h.money ? ` · себестоимость ${fm(h.total.cost)} ₸` : ''}` : ''}</div>`;
      if (!h.total.hours) return note + empty('По этому проекту часов в табелях пока нет');
      const mcol = h.months.map(m => ({ t: PM.mname(m).slice(0, 3) + ' ’' + m.slice(2, 4), cls: 'amt' })); const M = h.months;
      const secHead = [{ t: 'Раздел' }, ...mcol, { t: 'Всего, ч', cls: 'amt' }, ...(h.money ? [{ t: 'Себестоимость, ₸', cls: 'amt' }] : [])];
      const secRows = h.sections.map(x => `<tr><td><b>${esc(x.section)}</b></td>${M.map(m => `<td class="amt num">${fh(x.byMonth[m])}</td>`).join('')}<td class="amt num"><b>${fh(x.hours)}</b></td>${h.money ? `<td class="amt num">${fm(x.cost)}</td>` : ''}</tr>`)
        .concat([`<tr><td><b>Итого</b></td>${M.map(m => `<td class="amt num"><b>${fh(h.byMonth[m].hours)}</b></td>`).join('')}<td class="amt num"><b>${fh(h.total.hours)}</b></td>${h.money ? `<td class="amt num"><b>${fm(h.total.cost)}</b></td>` : ''}</tr>`]);
      const pplHead = [{ t: 'Сотрудник' }, ...mcol, { t: 'Всего, ч', cls: 'amt' }, ...(h.money ? [{ t: 'Ставка, ₸/ч', cls: 'amt' }, { t: 'Себестоимость, ₸', cls: 'amt' }] : [])];
      const pplRows = h.people.map(e => `<tr><td><b>${esc(e.name)}</b>${e.position ? `<div class="faint">${esc(e.position)}</div>` : ''}</td>${M.map(m => `<td class="amt num">${fh(e.byMonth[m])}</td>`).join('')}<td class="amt num"><b>${fh(e.hours)}</b></td>${h.money ? `<td class="amt num">${fm(e.rate)}</td><td class="amt num">${fm(e.cost)}</td>` : ''}</tr>`);
      return note + `<h2 style="margin-top:0">По разделам</h2>${tbl(secHead, secRows)}<h2>По людям</h2>${tbl(pplHead, pplRows)}`;
    }
    function miroHtml(c) {
      const p = c.project; const embed = PM.miroEmbed(p.miroUrl);
      return `<div class="card" style="margin-bottom:12px"><div class="filters" style="margin:0"><input id="pm-miro-url" placeholder="https://miro.com/app/board/…" value="${esc(p.miroUrl || '')}" style="flex:1;min-width:240px"${c.canEdit ? '' : ' disabled'}>${c.canEdit ? '<button class="btn" data-act="pmMiroSave">Сохранить</button>' : ''}${p.miroUrl ? `<a class="btn" href="${esc(p.miroUrl)}" target="_blank" rel="noopener">Открыть в Миро ↗</a>` : ''}</div></div>` +
        (embed ? `<iframe class="pm-miro" src="${esc(embed)}" allow="fullscreen; clipboard-read; clipboard-write" allowfullscreen></iframe>` : empty(p.miroUrl ? 'Ссылка не похожа на доску Миро (нужен адрес вида miro.com/app/board/…)' : 'Вставьте ссылку на доску Миро — она встроится сюда'));
    }
    function blockersHtml(c) {
      const list = c.blockers.slice().sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || b.days - a.days);
      const canAdd = c.canEdit || me().role === 'lead';
      return `<div class="head" style="margin-bottom:10px"><div class="grow faint">Внешние ожидания: чего ждём от заказчика или госоргана, кто дожимает с нашей стороны. Красным — висит больше 14 дней.</div>${canAdd ? '<button class="btn primary" data-act="pmBlAdd">+ Блокер</button>' : ''}</div>` + (list.length ? blockersTable(list, false) : empty('Блокеров нет'));
    }
    function blockersTable(list, withProject) {
      return tbl([...(withProject ? [{ t: 'Объект' }] : []), { t: 'Чего ждём' }, { t: 'Кто держит' }, { t: 'Ответственный (наш)' }, { t: 'С какого дня' }, { t: 'Ожидаем' }, { t: 'Контакт' }, { t: 'Статус' }, { t: '' }],
        list.map(b => `<tr class="${b.status !== 'closed' && b.days > 14 ? 'row-old' : ''}">${withProject ? `<td><a href="${cardLink(b.pid, b.track)}&tab=blockers"><b>${esc(b.project)}</b></a> ${chip(b.track, TRACK_CHIP)}</td>` : ''}<td><b>${esc(b.what)}</b>${b.comment ? `<div class="faint">${esc(b.comment)}</div>` : ''}</td><td>${esc(b.holder || '')}</td><td>${b.ownerId ? esc(pname(b.ownerId)) : esc(b.ownerName || '—')}</td><td class="nowrap">${b.since ? fdate(b.since) : '—'}${b.status !== 'closed' ? `<div class="${b.days > 14 ? 'crit-text' : 'faint'}">${b.days} дн.</div>` : ''}</td><td class="nowrap">${b.expected ? dueHtml(b.expected, b.status === 'closed') : '—'}</td><td class="nowrap">${b.lastContact ? fdate(b.lastContact) : '—'}</td><td>${b.status === 'closed' ? `<span class="chip ok">закрыт${b.closedAt ? ' ' + fdate(b.closedAt) : ''}</span>` : '<span class="chip warn">открыт</span>'}</td><td>${b.canEdit ? `<div class="actions">${b.status !== 'closed' ? `<button class="btn sm" data-act="pmBlClose" data-id="${esc(b.id)}" data-to="closed" title="Закрыть">✓</button>` : `<button class="btn sm" data-act="pmBlClose" data-id="${esc(b.id)}" data-to="open" title="Открыть снова">↺</button>`}<button class="btn sm" data-act="pmBlEdit" data-id="${esc(b.id)}">✎</button><button class="btn sm danger" data-act="pmBlDel" data-id="${esc(b.id)}">✕</button></div>` : ''}</td></tr>`));
    }
    function blockerModal(b, pid) {
      const f = [{ name: 'what', label: 'Чего ждём', required: true }, { name: 'holder', label: 'Кто держит', type: 'select', options: PM.HOLDERS, half: true }, { name: 'ownerId', label: 'Ответственный с нашей стороны', type: 'select', options: userOpts(), half: true }, { name: 'since', label: 'Висит с', type: 'date', half: true }, { name: 'expected', label: 'Ожидаемая дата', type: 'date', half: true }, { name: 'lastContact', label: 'Последний контакт', type: 'date', half: true }, { name: 'status', label: 'Статус', type: 'select', options: [['open', 'Открыт'], ['closed', 'Закрыт']], half: true }, { name: 'comment', label: 'Комментарий', type: 'textarea' }];
      modal(b ? 'Блокер' : 'Новый блокер', formHtml(f, b || { since: today(), status: 'open', holder: 'Заказчик' }), async v => { if (b) await api('/pm/blockers/' + b.id, { method: 'PUT', body: v }); else await api('/pm/blockers', { method: 'POST', body: Object.assign({ pid }, v) }); toast('Сохранено'); rerender(); badges(true); });
    }
    function budgetHtml(c) {
      if (!c.budget) return empty('Нет доступа к бюджету');
      const b = c.budget, f = c.fact, pct = v => v == null ? '—' : Math.round(v * 100) + ' %';
      const secs = b.sections.length ? tbl([{ t: 'Раздел' }, { t: 'Исполнитель' }, { t: 'Сумма', cls: 'amt' }, { t: '% себестоимости', cls: 'amt' }], b.sections.map(s => `<tr><td>${esc(s.name)}</td><td>${s.executor ? `<span class="chip ${s.executor === 'Субподряд' ? 'warn' : 'neutral'}">${esc(s.executor)}</span>` : ''}</td><td class="amt num">${money(s.sum)}</td><td class="amt num">${pct(s.pct)}</td></tr>`), `<tr><td colspan="2">Итого себестоимость</td><td class="amt num">${money(b.cost)}</td><td class="amt num">100 %</td></tr>`) : empty('Разделы бюджета не заполнены');
      return `<div class="grid g4 pm-kpi" style="margin-bottom:12px"><div class="card"><div class="label">Контракт без НДС</div><div class="val num">${money(b.contract)}</div><div class="foot">${b.contractVat ? 'с НДС ' + money(b.contractVat) : ''}${b.perM2 ? ` · ${money(b.perM2)}/м²` : ''}</div></div><div class="card"><div class="label">Целевая себестоимость</div><div class="val num">${money(b.target)}</div><div class="foot">маржа ${pct(b.marginTarget)} · план разделов ${money(b.cost)}</div></div><div class="card ${b.over < 0 ? 'crit' : 'ok'}"><div class="label">${b.over < 0 ? 'Перерасход' : 'Остаток'} к цели</div><div class="val num">${money(Math.abs(b.over))}</div><div class="foot">валовая маржа ${money(b.gross)} (${pct(b.grossPct)})</div></div><div class="card"><div class="label">Чистая маржа</div><div class="val num">${money(b.net)}</div><div class="foot">${pct(b.netPct)} · доля ГИПа ${money(b.gip)}</div></div></div>` +
        `<div class="head" style="margin-bottom:10px"><div class="grow faint">Бюджет по разделам — план (как в таблице бюджетов). Деньги здесь не вводятся: факт приходит из финансов по привязанному проекту.${b.note ? ' ' + esc(b.note) : ''}</div>${c.canEdit ? '<button class="btn" data-act="pmBudgetEdit">✎ Бюджет</button>' : ''}</div>` + secs +
        (f ? `<h2>Факт из финансов — ${esc(f.project)}</h2><div class="grid g4 pm-kpi"><div class="card"><div class="label">Договоры</div><div class="val num">${money(f.contracts || f.contractNoVat)}</div><div class="foot">${f.contractNoVat ? 'без НДС ' + money(f.contractNoVat) : ''}</div></div><div class="card ok"><div class="label">Приход</div><div class="val num">${money(f.income)}</div><div class="foot">операций ${f.n}</div></div><div class="card"><div class="label">Расход</div><div class="val num">${money(f.expense)}</div><div class="foot">подряд ${money(f.subSum)} (оплачено ${money(f.subPaid)})</div></div><div class="card ${f.income - f.expense < 0 ? 'crit' : 'ok'}"><div class="label">Маржа факт</div><div class="val num">${money(f.income - f.expense)}</div><div class="foot">${f.income ? Math.round((f.income - f.expense) / f.income * 100) + ' %' : ''}</div></div></div>` : `<p class="faint">Факт по деньгам появится, когда руководитель привяжет финансовый проект («✎ Проект» → «Финансовый проект»).</p>`);
    }
    ui.ACT.pmBudgetEdit = () => {
      const id = params().get('id'); api('/pm/projects/' + encodeURIComponent(id)).then(c => {
        const b = (c.project.budget) || { sections: [] }; const rows = [...(b.sections || []), {}, {}, {}];
        const body = `<form><div class="form-row">${fld('contract', 'Контракт без НДС, ₸', b.contract)}${fld('contractVat', 'Контракт с НДС, ₸', b.contractVat)}</div><div class="form-row">${fld('area', 'Площадь, м²', b.area)}${fld('months', 'Длительность, мес', b.months)}</div><div class="form-row">${fld('marginTarget', 'Целевая маржа, %', b.marginTarget == null ? 30 : Math.round(b.marginTarget * 100))}${fld('gipSum', 'Доля ГИПа, ₸ (команда ГИП × месяцы)', b.gipSum)}</div>
          <div class="field"><label>Разделы: название · сумма, ₸ · исполнитель</label>${rows.map((s, i) => `<div class="form-row" style="grid-template-columns:2fr 1fr 1fr;margin-bottom:6px"><input name="s_name_${i}" list="pm-dl-bsec" placeholder="Раздел" value="${esc(s.name || '')}"><input name="s_sum_${i}" type="number" step="1" placeholder="Сумма" value="${s.sum || ''}"><select name="s_exec_${i}">${['', ...PM.EXECUTORS].map(x => `<option value="${x}"${(s.executor || '') === x ? ' selected' : ''}>${x || '—'}</option>`).join('')}</select></div>`).join('')}<datalist id="pm-dl-bsec">${PM.BUDGET_SECTIONS.map(x => `<option value="${x}">`).join('')}</datalist></div>
          <div class="field"><label>Примечание</label><input name="note" value="${esc(b.note || '')}"></div><div class="error"></div><button class="btn primary block" type="submit">Сохранить</button></form>`;
        modal('Бюджет по разделам', body, async v => { const sections = rows.map((_, i) => ({ name: v[`s_name_${i}`], sum: Number(v[`s_sum_${i}`]) || 0, executor: v[`s_exec_${i}`] })).filter(s => s.name && s.name.trim()); await api('/pm/projects/' + id, { method: 'PUT', body: { budget: { contract: Number(v.contract) || 0, contractVat: Number(v.contractVat) || 0, area: Number(v.area) || 0, months: Number(v.months) || 0, marginTarget: v.marginTarget === '' ? null : Number(v.marginTarget) / 100, gipSum: Number(v.gipSum) || 0, note: v.note, sections } } }); toast('Бюджет сохранён'); rerender(); });
        $('#modal .modal-card').style.maxWidth = '720px';
      }).catch(e => toast(e.message, 4000));
    };
    const fld = (name, label, val) => `<div class="field"><label>${esc(label)}</label><input name="${name}" type="number" step="any" value="${val == null || val === 0 ? '' : val}"></div>`;

    // ---- мои задачи ----
    ui.SECTIONS[S('my')] = async main => {
      const list = (await api('/pm/my')).filter(i => pmTrackPath(i.track) === T); badges(true); const onlyOver = params().get('over') === '1';
      const over = list.filter(i => i.due && i.due < today()); const shown = onlyOver ? over : list;
      const u = me(); const who = u.role === 'lead' ? `Пункты раздела «${esc(u.section || '—')}» по всем активным проектам — в том числе те, что делают субподрядчики (их отмечает руководитель раздела).` : ['owner', 'partner'].includes(u.role) ? 'Просроченные пункты всех активных проектов и пункты, где вы исполнитель.' : 'Пункты ваших проектов (роль ГИП/ПМ и ожидания от заказчика) и пункты, где вы назначены исполнителем.';
      main.innerHTML = head(`Мои задачи · ${TU.title}`, `${list.length} открытых · <span class="${over.length ? 'crit-text' : ''}">просрочено ${over.length}</span><div class="faint">${who}</div>`, `<a class="btn ${onlyOver ? 'primary' : ''}" href="#/${S('my')}${onlyOver ? '' : '?over=1'}">${onlyOver ? 'Показать все' : 'Только просроченные'}</a>`);
      if (!shown.length) { main.innerHTML += empty(onlyOver ? 'Просроченных нет' : 'Открытых задач нет'); return; }
      const byP = new Map(); for (const it of shown) { if (!byP.has(it.pid)) byP.set(it.pid, { pid: it.pid, name: it.project, track: it.track, items: [] }); byP.get(it.pid).items.push(it); }
      main.innerHTML += `<div class="pm-my">${[...byP.values()].map(g => `<div class="card"><h3><a href="${cardLink(g.pid, g.track)}">${esc(g.name)}</a> ${chip(g.track, TRACK_CHIP)} <span class="faint">${g.items.length}</span></h3>${tbl(ITEM_COLS, g.items.map(it => itemRow(Object.assign({}, it, { project: '' }), { manager: false })))}</div>`).join('')}</div>`;
      ui.ACT.pmItemHist = ({ id: iid }) => { const it = list.find(x => x.id === iid); if (it) histModal(it); };
      ui.ACT.pmItemEdit = ({ id: iid }) => { const it = list.find(x => x.id === iid); if (!it) return; modal('Пункт: срок, исполнитель, заметка', `<p class="faint" style="margin:0 0 8px"><b>${esc(it.project)}</b> · ${esc(it.stageName)}<br>${esc(it.title)}${it.crit ? `<br>критерий: ${esc(it.crit)}` : ''}</p>` + formHtml([{ name: 'due', label: 'Срок', type: 'date', half: true }, { name: 'assigneeId', label: 'Исполнитель', type: 'select', options: userOpts(), half: true }, { name: 'contractor', label: 'Исполнитель-подрядчик' }, { name: 'doneNote', label: 'Чем подтверждено' }, { name: 'note', label: 'Заметка', type: 'textarea' }], it), async v => { await api('/pm/items/' + iid, { method: 'PUT', body: v }); toast('Сохранено'); rerender(); }); };
      bindChecks(main); bind(main);
    };

    // ---- блокеры (все проекты) ----
    ui.SECTIONS[S('bl')] = async main => {
      const d = await api('/pm/overview?track=' + T); ctxData = { leader: d.leader, financeProjects: d.financeProjects }; badges(true);
      const st = params().get('st') || 'open'; const activeP = new Set(d.rows.filter(r => PM.ACTIVE(r.status)).map(r => r.id));
      let list = d.blockersList.filter(b => st === 'all' || (st === 'open' ? b.status !== 'closed' : b.status === 'closed'));
      list.sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || b.days - a.days);
      const open = d.blockersList.filter(b => b.status !== 'closed' && activeP.has(b.pid)), old = open.filter(b => b.days > 14);
      const canAdd = d.rows.some(r => r.canEdit) || me().role === 'lead';
      main.innerHTML = head(`Блокеры · ${TU.title}`, `${open.length} открытых · <span class="${old.length ? 'crit-text' : ''}">висят больше 14 дней: ${old.length}</span><div class="faint">Внешние ожидания — заказчик, госорган, смежник. Это то, чем управляем, а не делаем сами: кто дожимает, когда ждём, когда последний контакт.</div>`, canAdd ? '<button class="btn primary" data-act="pmBlNew">+ Блокер</button>' : '') +
        `<div class="filters">${sel('pm-f-bst', [['open', 'Открытые'], ['closed', 'Закрытые'], ['all', 'Все']], st)}</div>` + (list.length ? blockersTable(list, true) : empty('Блокеров нет'));
      $('#pm-f-bst').onchange = () => { location.hash = `#/${S('bl')}?st=${$('#pm-f-bst').value}`; };
      ui.ACT.pmBlNew = () => { const opts = d.rows.filter(r => PM.ACTIVE(r.status) && (r.canEdit || me().role === 'lead')).sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(r => [r.id, `${r.name} (${PM.TRACK_SHORT[r.track]})`]); if (!opts.length) return toast('Нет проектов, где вы можете добавить блокер'); modal('Новый блокер', formHtml([{ name: 'pid', label: 'Проект', type: 'select', options: opts }, { name: 'what', label: 'Чего ждём', required: true }, { name: 'holder', label: 'Кто держит', type: 'select', options: PM.HOLDERS, half: true }, { name: 'ownerId', label: 'Ответственный с нашей стороны', type: 'select', options: userOpts(), half: true }, { name: 'since', label: 'Висит с', type: 'date', value: today(), half: true }, { name: 'expected', label: 'Ожидаемая дата', type: 'date', half: true }, { name: 'comment', label: 'Комментарий' }]), async v => { await api('/pm/blockers', { method: 'POST', body: v }); toast('Блокер добавлен'); rerender(); badges(true); }); };
      ui.ACT.pmBlEdit = ({ id: bid }) => { const b = d.blockersList.find(x => x.id === bid); if (b) blockerModal(b); };
      ui.ACT.pmBlClose = async ({ id: bid, to }) => { await api('/pm/blockers/' + bid, { method: 'PUT', body: { status: to } }); toast(to === 'closed' ? 'Блокер закрыт' : 'Блокер открыт снова'); rerender(); badges(true); };
      ui.ACT.pmBlDel = async ({ id: bid }) => { if (!confirm('Удалить блокер?')) return; await api('/pm/blockers/' + bid, { method: 'DELETE' }); toast('Удалено'); rerender(); };
      bind(main);
    };

    // ---- сводка ----
    ui.SECTIONS[T] = async main => {
      const d = await api('/pm/overview?track=' + T); ctxData = { leader: d.leader, financeProjects: d.financeProjects }; badges(true);
      expState = { rows: d.rows, blockers: d.blockersList };
      const active = d.rows.filter(r => PM.ACTIVE(r.status)); const t = today();
      const kpi = `<div class="grid g4 pm-kpi" style="margin-bottom:14px">
        <div class="card"><div class="label">Активных проектов</div><div class="val">${d.active}</div><div class="foot">${esc(TU.full)}${T === 'ep' && d.byTrack.concept && d.byTrack.concept.n ? ` · концепций ${d.byTrack.concept.n}` : ''}</div></div>
        <div class="card ${d.late ? 'crit' : ''}"><div class="label">Просрочено проектов <a href="#/${S('reg')}?status=all">→</a></div><div class="val">${d.late}</div><div class="foot">дата по договору прошла</div></div>
        <div class="card ${d.hot ? 'crit' : ''}"><div class="label">Горит (≤ 14 дней)</div><div class="val">${d.hot}</div><div class="foot">просроченных пунктов ${d.overdueItems}</div></div>
        <div class="card ${d.blockersOld ? 'crit' : ''}"><div class="label">Блокеры <a href="#/${S('bl')}">→</a></div><div class="val">${d.blockers}</div><div class="foot">висят > 14 дней: ${d.blockersOld}</div></div></div>`;
      const settingsCard = d.canSettings && d.settings ? `<div class="card" style="margin-bottom:14px"><div class="label">Доступ рядовых сотрудников (staff) к «Проектам»</div><div class="pm-sub" style="margin-top:6px"><span>${d.settings.staffOwnProjects ? 'включён: сотрудник видит проекты, где он исполнитель пункта или участник — только чтение и отметки «сделано» у своих пунктов, без бюджета, финансов и чужих блокеров' : 'выключен (по умолчанию): сотрудники модуль не видят'}</span> <button class="btn sm" data-act="pmStaffToggle" data-on="${d.settings.staffOwnProjects ? '1' : '0'}">${d.settings.staffOwnProjects ? 'Выключить' : 'Включить'}</button></div></div>` : '';
      const statusRow = `<div class="pm-sub" style="margin-bottom:14px">${Object.entries(d.byStatus).map(([k, n]) => `${chip(k, STATUS_CHIP)} <b>${n}</b>`).join(' ') || '<span class="faint">Активных проектов нет</span>'}</div>`;
      const funnel = tr => { const f = d.byTrack[tr]; const max = Math.max(1, ...f.funnel.map(x => x.n)); return `<div class="card"><div class="label">Воронка ${esc(PM.TRACKS[tr])} <a href="${listHash(tr)}">→</a><span>${f.n} в работе${f.late ? ` · <span class="crit-text">${f.late} просрочено</span>` : ''}</span></div>${f.funnel.map(x => `<div style="display:grid;grid-template-columns:1fr 36px;gap:8px;align-items:center;font-size:12.5px;margin-top:6px"><div><div class="${x.n ? '' : 'faint'}" style="margin-bottom:2px">${esc(x.name)}</div><div class="bar"><i style="width:${Math.round(x.n / max * 100)}%"></i></div></div><b class="right">${x.n}</b></div>`).join('')}</div>`; };
      const funnels = `<div class="grid g2" style="margin-bottom:14px">${funnel(T)}${T === 'ep' && d.byTrack.concept && d.byTrack.concept.all ? funnel('concept') : ''}</div>`;
      // Метод Пульса: температурный график и приоритет портфеля
      const withH = active.filter(r => r.health && r.health.zone !== 'none'); const noDates = active.filter(r => r.health && r.health.zone === 'none'); const pri = PM.priority(withH.map(r => Object.assign({}, r))); const hasT = pri.some(r => r.throughput);
      const portfolio = `<div class="grid g2" style="margin-bottom:14px"><div class="card"><div class="label">Температурный график буфера <span class="faint">x — выполнено, y — расход буфера расписания</span></div>${withH.length ? feverChart(withH) : empty('Нет активных проектов со сроками')}${noDates.length ? `<div class="faint" style="margin-top:4px">Без сроков (не на графике): ${noDates.map(r => `<a href="${cardLink(r.id, r.track)}">${esc(r.name)}</a>`).join(', ')} — задайте старт и срок в карточке.</div>` : ''}<div class="faint">Зелёная зона — по плану, не вмешиваться. Жёлтая — готовить план изменений. Красная — применять его. Серая полоса сверху — буфер исчерпан: пересогласовать срок или объём с заказчиком. Точка открывает карточку.</div></div>
        <div><h2 style="margin-top:0">Приоритет портфеля</h2><div class="faint" style="margin:-6px 0 8px">Куда направлять ресурсы сначала: чёрные и красные с большим прогрессом, затем жёлтые, затем по Проходу (контракт в месяц срока). Совещание по состоянию проектов — каждую неделю.</div>${pri.length ? tbl([{ t: '№' }, { t: 'Объект' }, { t: 'Зона' }, { t: 'Выполнено', cls: 'right' }, { t: 'Прогноз' }, ...(hasT ? [{ t: 'Проход, ₸/мес', cls: 'amt' }] : [])], pri.slice(0, 12).map(r => `<tr class="pm-row" data-id="${esc(r.id)}" data-track="${esc(r.track)}"><td>${r.rank}</td><td><b>${esc(r.name)}</b> <span class="faint">${esc(PM.TRACK_SHORT[r.track])}</span></td><td class="nowrap">${zoneChip(r.health)}</td><td class="right num">${pct(r.health.progress)}</td><td class="nowrap">${r.health.forecast.realistic ? fdate(r.health.forecast.realistic) : '<span class="faint">нет скорости</span>'}</td>${hasT ? `<td class="amt num">${r.throughput ? money(r.throughput.perMonth) : ''}</td>` : ''}</tr>`)) : empty('Нет активных проектов')}</div></div>`;
      const cnt = x => T === 'ep' ? (x.ep || 0) + (x.concept || 0) : (x.rp || 0); const loadRows = Object.entries(d.load).map(([uid, x]) => ({ uid, name: pname(uid), ...x })).filter(r => cnt(r) > 0).sort((a, b) => cnt(b) - cnt(a));
      const load = `<h2 style="margin-top:0">Загрузка ${esc(TU.lead)}</h2>` + (loadRows.length ? tbl([{ t: 'Кто' }, { t: 'Проектов', cls: 'amt' }, { t: 'Просрочено проектов', cls: 'amt' }, { t: 'Просроч. пунктов', cls: 'amt' }], loadRows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td class="amt num">${cnt(r) || ''}</td><td class="amt num ${r.late ? 'crit-text' : ''}">${r.late || ''}</td><td class="amt num ${r.overdue ? 'crit-text' : ''}">${r.overdue || ''}</td></tr>`)) : empty('Назначьте ГИП / ПМ в карточках проектов — появится загрузка'));
      const grows = active.filter(r => r.start).sort((a, b) => String(a.start).localeCompare(String(b.start)));
      const months = PM.ganttMonths(grows, t, 8, 16); const cur = t.slice(0, 7); const loadM = PM.ganttLoad(grows, months);
      const gantt = `<h2>Гант по месяцам</h2><div class="faint" style="margin:-6px 0 8px">Полоса — от даты старта до прогноза / даты по договору. Красная — срок прошёл, жёлтая — ждём заказчика или госорган, зелёная — готово. Текущий месяц подсвечен.</div>` + (grows.length ? `<div class="tbl cal-wrap"><table class="cal"><thead><tr><th>Объект</th><th class="pm-hidem">Ведёт</th><th class="pm-hidem">Старт</th><th class="pm-hidem">Срок</th>${months.map(m => `<th class="cal-h"${m === cur ? ' style="background:var(--accent-soft)"' : ''} title="${esc(PM.mname(m))}">${m.slice(5)}.${m.slice(2, 4)}</th>`).join('')}</tr></thead><tbody>${grows.map(r => { const end = r.forecast || r.due; const cls = r.status === 'Готово' ? 'vac-t' : r.late ? 'vac-v' : /Ждём/.test(r.status) ? 'vac-s' : 'vac-u'; return `<tr class="pm-row" data-id="${esc(r.id)}" data-track="${esc(r.track)}"><td class="nowrap"><b>${esc(r.name)}</b> <span class="faint">${esc(PM.TRACK_SHORT[r.track])}</span></td><td class="pm-hidem nowrap">${esc(pname(r.leadId) || '—')}</td><td class="pm-hidem nowrap">${fdate(r.start)}</td><td class="pm-hidem nowrap ${r.late ? 'crit-text' : ''}">${end ? fdate(end) : '—'}</td>${months.map(m => `<td class="cal-cell${PM.inMonth(r, m) ? ' ' + cls : ''}${m === cur ? ' wknd' : ''}" title="${esc(r.name)} · ${esc(PM.mname(m))}"></td>`).join('')}</tr>`; }).join('')}<tr><td colspan="4"><b>Активных объектов</b></td>${loadM.map((n, i) => `<td class="cal-cell right num" style="font-size:11px;padding:2px 3px;${months[i] === cur ? 'background:var(--accent-soft)' : ''}"><b>${n || ''}</b></td>`).join('')}</tr></tbody></table></div>` : empty('Задайте дату старта и дату по договору в карточках — появится Гант'));
      main.innerHTML = head(`Сводка · ${TU.full}`, `Сегодня ${fdate(t)} · шаблон ${TU.title}: ${d.templates[T]} пунктов`, (d.canCreate ? `<button class="btn primary" data-act="pmNew" data-track="${T}">+ Проект</button> ` : '') + `<button class="btn" data-act="pmExport" title="Реестр ${TU.title} и блокеры — в Excel">⇩ Excel</button> ` + (d.leader ? (T === 'ep' ? '<button class="btn" data-act="pmClickup">⇪ Импорт из ClickUp</button>' : '<button class="btn" data-act="pmImport">⇪ Импорт реестра</button>') : '')) + kpi + statusRow + settingsCard + portfolio + funnels + `<div class="grid g2"><div>${load}</div><div></div></div>` + gantt;
      main.querySelectorAll('.tbl, .cal-wrap').forEach(el => el.classList.add('pm-scroll'));
      main.querySelectorAll('tr.pm-row').forEach(tr => tr.onclick = () => { location.hash = cardLink(tr.dataset.id, tr.dataset.track); });
      ui.ACT.pmStaffToggle = async ({ on }) => { const r = await api('/pm/settings', { method: 'PUT', body: { staffOwnProjects: on !== '1' } }); toast(r.staffOwnProjects ? 'Доступ сотрудников к своим проектам включён' : 'Доступ сотрудников выключен'); rerender(); };
      ui.ACT.pmImport = () => modal('Импорт реестра проектов', `<p class="faint" style="margin:0 0 10px">JSON готовит скрипт <code>modules/pm/tools/import_pm.py</code> из реестра MOST_Планирование_проектов.xlsx и таблицы бюджетов. Проекты с таким же названием и стадией пропускаются (или пересоздаются в режиме «заменить»).</p><form><div class="field"><label>Файл JSON</label><input type="file" id="pm-imp-file" accept=".json,application/json" required></div><div class="field"><label>Если проект уже есть</label><select name="mode"><option value="skip">Пропустить</option><option value="replace">Заменить (удалить и создать заново)</option></select></div><div class="error"></div><button class="btn primary block" type="submit">Импортировать</button></form>`, async v => {
        const f = $('#pm-imp-file').files[0]; if (!f) throw new Error('Выберите файл'); let data; try { data = JSON.parse(await f.text()); } catch { throw new Error('Файл не читается как JSON'); }
        if (!Array.isArray(data.projects)) throw new Error('В файле нет списка projects'); data.mode = v.mode;
        const r = await api('/pm/import', { method: 'POST', body: data });
        toast(`Создано ${r.created.length}, заменено ${r.replaced.length}, пропущено ${r.skipped.length}; пунктов ${r.items} (отмечено ${r.done}), задач Trello ${r.tasks}, блокеров ${r.blockers}, бюджетов ${r.budgets}${r.unlinked.length ? '; без привязки к финансам: ' + r.unlinked.join(', ') : ''}`, 12000); rerender();
      });
      // импорт ЭП из CSV-выгрузки ClickUp: файл → автосопоставление колонок → предпросмотр → POST /pm/import-clickup
      ui.ACT.pmClickup = () => {
        let csv = null, map = {};
        modal('Импорт из ClickUp', `<p class="faint" style="margin:0 0 10px">Выгрузка ClickUp: список или папка → … → <b>Export → CSV</b> (UTF-8; разделитель запятая или «;»). Задачи верхнего уровня становятся проектами ЭП, подзадачи — отметками «сделано» у пунктов шаблона с тем же названием или дополнительными пунктами текущего этапа. Люди сопоставляются по имени с пользователями системы, иначе имя пишется в заметку.</p><form><div class="field"><label>Файл CSV</label><input type="file" id="cu-file" accept=".csv,text/csv" required></div><div id="cu-body"></div><div class="error"></div><button class="btn primary block" type="submit" id="cu-go" disabled>Импортировать</button></form>`, async v => {
          if (!csv) throw new Error('Выберите файл CSV');
          const projects = PM.clickupToProjects(csv, map, { source: v.source, track: 'ep' }); if (!projects.length) throw new Error('В файле не нашлось задач — проверьте колонку «Название задачи»');
          const r = await api('/pm/import-clickup', { method: 'POST', body: { mode: v.mode, projects } });
          toast(`ClickUp: создано ${r.created.length}, дополнено ${r.merged.length}, пропущено ${r.skipped.length}; пунктов шаблона совпало ${r.matched} (отмечено «сделано» ${r.done}), добавлено пунктов ${r.added}; люди: сопоставлено ${r.people.mapped.length}${r.people.unmapped.length ? ', не найдены: ' + r.people.unmapped.join(', ') : ''}`, 15000); rerender();
        });
        $('#modal .modal-card').style.maxWidth = '980px';
        const render = () => {
          const body = $('#cu-body'); if (!csv) { body.innerHTML = ''; return; }
          const source = (body.querySelector('[name=source]') || {}).value || 'parent', mode = (body.querySelector('[name=mode]') || {}).value || 'skip';
          const opts = k => ['<option value="">—</option>', ...csv.header.map((hd, i) => `<option value="${i}"${map[k] === i ? ' selected' : ''}>${esc(hd)}</option>`)].join('');
          const P = PM.clickupToProjects(csv, map, { source });
          const prev = P.slice(0, 6).map(x => `<tr><td><b>${esc(x.name)}</b><div class="faint">${esc(x.client || '')}</div></td><td>${chip(x.pmStatus, STATUS_CHIP)}</td><td class="nowrap">${x.start ? fdate(x.start) : '—'} → ${x.due ? fdate(x.due) : '—'}</td><td>${esc(x.assignees.join(', ') || '—')}</td><td class="amt num">${x.tasks.length}</td><td class="faint">${esc(x.tasks.slice(0, 4).map(tk => tk.title + (tk.done ? ' ✓' : '')).join('; '))}${x.tasks.length > 4 ? '…' : ''}</td></tr>`);
          body.innerHTML = `<details style="margin-bottom:8px"><summary class="faint">Сопоставление колонок (определено автоматически — раскройте, чтобы поправить)</summary><div class="grid g2" style="gap:6px 12px;margin-top:6px">${PM.CLICKUP_FIELDS.map(([k, label]) => `<div class="field"><label>${esc(label)}</label><select data-map="${k}">${opts(k)}</select></div>`).join('')}</div></details>
            <div class="form-row"><div class="field"><label>Проекты — это</label><select name="source"><option value="parent"${source === 'parent' ? ' selected' : ''}>задачи верхнего уровня (подзадачи — пункты)</option><option value="list"${source === 'list' ? ' selected' : ''}>списки ClickUp (все задачи списка — пункты)</option></select></div><div class="field"><label>Если проект с таким названием уже есть</label><select name="mode"><option value="skip"${mode === 'skip' ? ' selected' : ''}>пропустить</option><option value="merge"${mode === 'merge' ? ' selected' : ''}>дополнить: отметки «сделано» и новые пункты</option></select></div></div>
            <div class="faint" style="margin:6px 0">Файл: ${csv.rows.length} строк, ${csv.header.length} колонок, разделитель «${csv.delimiter === '\t' ? 'таб' : csv.delimiter}». Найдено проектов: <b>${P.length}</b>, задач в них: <b>${P.reduce((a, x) => a + x.tasks.length, 0)}</b>.</div>
            ${P.length ? `<div style="max-height:260px;overflow:auto">${tbl([{ t: 'Проект ЭП' }, { t: 'Статус' }, { t: 'Старт → срок' }, { t: 'Исполнители' }, { t: 'Задач', cls: 'amt' }, { t: 'Подзадачи' }], prev)}</div>` : '<div class="error">Проекты не найдены — проверьте колонки «Название задачи» и «Родительская задача»</div>'}`;
          body.querySelectorAll('select[data-map]').forEach(el => el.onchange = () => { if (el.value === '') delete map[el.dataset.map]; else map[el.dataset.map] = Number(el.value); render(); });
          body.querySelectorAll('select[name=source],select[name=mode]').forEach(el => el.onchange = render);
          $('#cu-go').disabled = !P.length;
        };
        $('#cu-file').onchange = async () => { const f = $('#cu-file').files[0]; if (!f) return; csv = PM.parseCsv(await f.text()); map = PM.clickupAutoMap(csv.header); render(); };
      };
      bind(main);
    };
    // старые адреса (#/pm, #/pmep, #/pmrp, #/pmmy, #/pmbl, #/pmown, #/pmp?id=…) → разделы «ЭП» / «РП»
    const legacyTrack = () => pmRoleTrack(me());
    ui.SECTIONS.pmp = async main => { const id = params().get('id'); if (!id) { location.hash = `#/${legacyTrack()}/reg`; return; } try { const c = await api('/pm/projects/' + encodeURIComponent(id)); location.hash = cardLink(c.project.id, c.project.track) + (params().get('tab') ? '&tab=' + encodeURIComponent(params().get('tab')) : ''); } catch (e) { main.innerHTML = empty(e.message); } };
    ui.SECTIONS.pm = async () => { location.hash = `#/${legacyTrack()}`; };
    ui.SECTIONS.pmep = async () => { location.hash = '#/ep/reg'; }; ui.SECTIONS.pmrp = async () => { location.hash = '#/rp/reg'; };
    ui.SECTIONS.pmmy = async () => { location.hash = `#/${legacyTrack()}/my`; }; ui.SECTIONS.pmbl = async () => { location.hash = `#/${legacyTrack()}/bl`; }; ui.SECTIONS.pmown = async () => { location.hash = `#/${legacyTrack()}/reg`; };
    badges(false);
}
// регистрация двух разделов первыми в переключателе ERP (ЭП, РП, Доска, Знания…); порядок можно закрепить в ядре (MODULE_ORDER)
window.MOST_MODULES = window.MOST_MODULES || []; window.MOST_MODULES.unshift(pmModule('ep'), pmModule('rp'));
