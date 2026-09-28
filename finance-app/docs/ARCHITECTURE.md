# MOST ERP — модули и правила параллельной работы

Одна программа (`server.js`, Node.js без npm-зависимостей), одна база (`data/db.sqlite`, SQLite; модули работают с коллекциями в памяти через `ctx.db` и `store.save()`). Поверх ядра подключаются модули из `modules/<id>/`. Финансы пока живут в ядре (`lib/domain.js`, `public/app.js`) и считаются встроенным модулем `fin`.

## Решения директора (24.09.2026)

- **Сервер** — MostServer в офисе (Docker), доступ снаружи через Cloudflare Tunnel. Облако не планируется; если понадобится — только в Казахстане (персональные данные: ИИН, оклады).
- **Учёт** — главная система 1С. ERP — управленческий учёт и проекты: не дублировать бухгалтерский ввод, обмен с 1С — выгрузки/загрузки (CSV), официальные документы (АВР, счета, ЭСФ) выписывает бухгалтер в 1С.
- **Уведомления** — пока не делаем (ни Telegram, ни WhatsApp). Напоминания — внутри системы: счётчики и списки «просрочено», «ждёт вас».
- **Субподрядчики** в систему не заходят; их пункты (КЖ, ЭЛ, СС и др.) ведёт руководитель раздела, в пункте указывается исполнитель-подрядчик.
- **Сопровождение** — директор и сисадмин; изменения — через Claude в этом репозитории.
- **Методология проектов** — Метод Пульса (ТОС/CCPM + Agile): буферы, зоны, прогнозы, устав, ретроспективы (24.09).
- **Стадии** — концепция = первый этап ЭП; авторский надзор в интерфейсе скрыт (данные и API сохранены) (24.09).
- **«Коммерция»** — на сайте «Финансы», не в ERP (24.09).
- **ИИ-панель** — через Claude Code (`claude -p`) под аккаунтом директора, без ключа API; только owner/partner; ИИ ничего не меняет сам (24.09).
- **Доска** — своя замена Miro, данные на своём сервере; вторая версия — доступ всем пользователям (25.09).

## Два сайта

Одна программа, одна база, два порта: **«Финансы»** — `PORT` (3000, только офис; финансы, пользователи, настройки) и **«MOST ERP»** — `ERP_PORT` (по умолчанию PORT+1 = 3001; только включённые модули + вход, `/api/me`, `/api/people`, чтение `/api/settings`). Сайт ERP физически не отдаёт финансовые API (404), сайт «Финансы» — модули. Вход общий (одна cookie на хост). На каком сайте модуль — поле `site` в `server.js`: `'erp'` (по умолчанию), `'fin'` или `['erp','fin']`; сайт запроса модулю — `ctx.site`. Статика модуля — `modules/<id>/assets/<файл>` → `/m/<id>/assets/<файл>`. Наружу через туннель открывается только ERP. В режиме `DEV_USER` — один порт со всем сразу (`DEV_SPLIT=1` — два сайта для проверки). В `ui.js` сайт — `window.MOST_SITE` ('fin' | 'erp' | 'all').

## Кто что трогает

| Папка / файл | Владелец | Кто ещё меняет |
|---|---|---|
| `server.js`, `lib/store.js`, `lib/auth.js`, `lib/domain.js`, `public/app.js`, `public/index.html`, `public/styles.css`, `docs/ARCHITECTURE.md` | ведущая сессия (ядро) | никто; нужна правка ядра — запись в `modules/<id>/CORE-REQUESTS.md` своей ветки |
| `modules/pm/` | поток A — управление проектами | — |
| `modules/hr/` | поток B — персонал, табель, загрузка | — |
| `modules/crm/` | поток C — коммерция | — |
| `modules/kb/` | поток D — знания и обучение | — |
| `modules/sys/`, `tools/`, `tests/`, `*.bat`, Docker | поток E — сервис и инфраструктура | — |
| `modules/ai/` (сайты erp+fin) | поток F — ИИ-панель | — |
| `modules/board/` | поток G — доска (замена Miro) | — |
| `modules/analytics/` (сайт fin) | поток H — панель директора | — |
| `modules/office/` | поток I — документы и канцелярия | — |

Сайт «Финансы»: ядро (финансы), `crm`, `analytics`, `ai`. Сайт ERP: `pm`, `kb`, `hr`, `sys`, `board`, `office`, `ai`.

Стили: у модуля свои классы с префиксом `<id>-` в `modules/<id>/ui.js` (вставляет `<style>` при init). Общие стили из `public/styles.css` используйте как есть.

## Контракт модуля

`modules/<id>/server.js` (обязателен):

```js
module.exports = {
  id: 'kb', api: 'kb',                    // /api/kb/...
  collections: ['kbNews', 'kbArticles'],  // коллекции в базе; имена с префиксом модуля
  handle(ctx) { ... },                    // все запросы /api/<api>/*; пользователь уже проверен (ctx.user)
  on: { 'pm.project.created': (ctx, data) => {} }, // необязательно: события других модулей
  // любые функции для других модулей: ctx.modules.<id>.<функция>(ctx, ...)
};
```

`ctx`: `parts` (путь после `/api/`), `method`, `body`, `qs`, `user` ({id, role, section, seeBudget, employeeId}), `db` (вся база), `store` (`save()`, `id()`, `audit(userId, action, collection, docId, extra)`), `D` (lib/domain.js), `today()`, `num()`, `pick(obj, keys)`, `userName(id)`, `modules`, `emit(name, data)`, `ok(body)`, `err(status, message)`, `send(status, body, headers)`.

Правила:
- Права проверяет **сервер** в `handle`, интерфейс лишь прячет кнопки.
- Коллекции модуля недоступны через общий `/api/<коллекция>` — только через API модуля.
- Чужие коллекции только читаем. Изменить чужое — через функцию модуля-владельца (`ctx.modules.pm.createProject(ctx, fields, userId)`) или событие.
- Каждое изменение — `store.save()` и `store.audit(...)`.
- Никаких npm-зависимостей и внешних сервисов без согласования с ядром.

`modules/<id>/domain.js` (необязателен): чистая логика, UMD как `modules/pm/domain.js` (в браузере — `window.Most<Id>`), подключается до `ui.js`.

`modules/<id>/ui.js`:

```js
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'kb', title: 'Знания',
  nav: [{ id: 'kbnews', label: 'Новости', icon: '📰', can: u => true }], // id разделов уникальны, начинаются с id модуля
  routes: ['kbarticle'],        // скрытые разделы (карточки): #/kbarticle?id=…
  canOpen: u => true,           // кому показывать модуль в переключателе
  help: [['Новости', '<p>…</p>', 'kbnews']], // инструкция модуля: [заголовок, html, id раздела меню]; показывается в «Инструкции» и по кнопке «?» в шапке раздела
  init(ui) { ui.SECTIONS.kbnews = async main => { main.innerHTML = ui.head('Новости') + ...; ui.bind(main); }; },
});
```

`ui` — помощники ядра: `setBadge(navId, n)` (счётчик в меню, переживает перерисовку; модуль может задать `onNav(ui, sectionId)` — вызывается после каждой отрисовки меню), `api`, `state` (user, people, settings, projects…), `head`, `tbl`, `empty`, `chip`, `sel`, `modal`, `formHtml`, `field`, `numify`, `boolify`, `toast`, `bind` + `ACT`, `params`, `qsOf`, `route`, `esc`, `money`, `fdate`, `today`, `mname`, `cut`, `peopleName`, `isAdmin`, `isOwner`, `canR`, `canW`, `$`. Действия кнопок: `data-act="kbRead"` → `ui.ACT.kbRead = ({ id }) => …` (имена с префиксом модуля).

## Общие данные (только чтение для модулей)

- Пользователи: `db.users` — `id, name, role, section, seeBudget, employeeId`. Роли: `owner, partner` (руководители), `accountant, secretary` (финансы), `pm` (проектный менеджер), `gip`, `lead` (руководитель раздела, `section`), `staff` (сотрудник). Разделы: `D.SECTIONS`.
- Сотрудники: `db.employees` — `id, name, company, position, salary (на руки), hired, status, resigned`. Пользователь ↔ сотрудник: `users.employeeId`.
- Проекты управления: `db.pmProjects` (`id, track: 'ep'|'rp', name, client, gipId, pmId, status, start, due, forecast, projectId → db.projects.id`), `db.pmItems` (`pid, stage, stageName, title, role, section, due, done, kstatus` — колонка канбана: todo|doing|review|done, «done» = done). Владелец — модуль pm.
- Финансовые проекты и договоры: `db.projects`, `db.contracts` (`projectId`), акты `db.docs`, операции `db.ops` (только руководители и финансы).

## События

| Событие | Кто шлёт | Данные |
|---|---|---|
| `pm.project.created` | pm | `{ project }` |
| `pm.item.done` | pm | `{ item, project }` |
| `pm.project.handover` | pm | `{ from, to }` — передача концепция → ЭП → РП |
| `crm.contract.signed` | crm | `{ contract, pmProjectId }` |
| `kb.test.passed` | kb | `{ userId, testId, score }` |
|  |  | Дата «сегодня» — по Asia/Almaty (`D.todayStr`, `ctx.today`), не `toISOString()`. |

Новое событие — допишите строку в таблицу в своей ветке (это единственная правка ядра без запроса).

## Как разрабатывать и проверять

1. Своя ветка `erp/<id>` от `erp/main`, коммиты только в свою папку (+ `CORE-REQUESTS.md`).
2. Тестовая база: скопируйте свежий бэкап `\\MostServer\Documents\MOST-Финансы\data\backups\db-*.sqlite` в `finance-app/data-dev/<id>/db.sqlite` (или, пока рабочая база не перенесена, `data\db.json` в `data-dev/<id>/db.json` — при запуске он сам переедет в SQLite) (папка в .gitignore, реальные данные компании — не коммитить и никуда не отправлять) или начните с пустой.
3. Запуск без пароля (только с этого компьютера):
   `set DATA_DIR=data-dev\<id>& set DEV_USER=owner& set PORT=<порт>& node server.js`
   Порты: pm 3101, hr 3102, crm 3103, kb 3104, sys 3105, ai 3106, board 3107, analytics 3108, office 3109; с `DEV_SPLIT=1` задавайте `ERP_PORT` явно: pm 3111, hr 3112, crm 3113, kb 3114, sys 3115, ai 3116, board 3117, analytics 3118, office 3119. Роль для проверки прав — cookie `devrole=gip` (и `devsection=ОВ` для руководителя раздела) в браузере или `DEV_USER=gip`.
4. На рабочем сервере модуль виден, только если владелец включил его в «Настройки → Модули» (settings.enabledModules); в режиме DEV_USER включены все. Модули включаются после приёмки.
5. **Никогда не останавливать node-процессы оптом** (`taskkill /IM node.exe`, `Stop-Process -Name node`) — на этом ПК работает рабочий сервер; останавливать только свой тестовый процесс по PID или своему порту. Задачи планировщика «MOST Финансы…» не запускать и не менять.
6. Рабочий сервер (`\\MostServer\...`, порт 3000) не трогать — ни чтением, ни записью, ни перезапуском. Выкладка — только директор: `tools\deploy-to-server.bat` (сначала `-DryRun`). Скрипты с путём рабочего сервера по умолчанию запрещены; синтаксис PowerShell проверять только `Parser::ParseFile`, не запуском.
7. Перед сдачей: `node --check` своих файлов, проверка прав каждой ролью, короткий отчёт в `modules/<id>/README.md` («Сделано / Как проверить / Что осталось»).
8. Коммит — подпись `Co-Authored-By: Claude …` как в истории репозитория. Не пушить, не сливать в `erp/main` самостоятельно.

Веб-версия (`web/`) модули не поддерживает и не развивается; офисная версия — основная.
