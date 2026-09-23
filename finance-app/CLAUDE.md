# MOST Финансы — контекст для Claude Code

Система учёта финансов архитектурного бюро MOST (ТОО MOST Architects, ТОО MOST Project, ИП PANA Design, ИП MOST Design; Алматы, Казахстан).
Владелец — Мейр, пишет коротко по-русски. Отвечать по-русски, кратко, по делу. Пользователи: владелец, партнёр, бухгалтер, секретарь, проджект-менеджер.
Задел на ERP бюро: проект — центр, к нему привязаны договоры, акты, подрядчики, операции, стадии.

## Две редакции одного кода

- **Офисная (основная)**: `server.js` на Node.js без зависимостей, база — `data/db.json` (атомарная запись, автобэкапы в `data/backups/`, файлы в `data/files/`). Вход по логину и паролю (scrypt, cookie-сессии 30 дней, CSRF-заголовок `X-Requested-With: fetch`, лимит попыток входа). Запуск `start.bat` / `start-internet.bat` (сервер + Cloudflare Tunnel через `tools/serve-internet.js`, адрес пишется в `data/tunnel-url.txt`). Стоит на офисном сервере MostServer.
- **Веб (резерв)**: та же логика в `web/db-server.js`, сборка `python3 web/build.py` → одна HTML-страница, опубликована как артефакт claude.ai (https://claude.ai/artifact/GkLvE7g6sXqAE5U1RrUpmW, capabilities db/user/downloads/assets). Вход по аккаунту claude.ai; роли в `meta/roles`. Операции лежат месячными документами `opsm/YYYY-MM`. Документ-id для кириллических кодов — FNV-1a хэш `k-xxxxxxxx` (`docIdOf`, та же функция в `tools/import_budget.py`).
- Общая логика в `lib/domain.js` (UMD: Node `module.exports` / браузер `window.MostDomain`): права `can(role, collection, action)`, фильтры и итоги операций, дашборд, отчёт, остатки по счетам, платёжный календарь, контрагенты (`cpResolver`, `buildCounterparties`), связки (`contractProject`, `contractFacts`, `allocateIncome`), карточка проекта, КП (`kpCalc`), CSV.
- Парсеры: `lib/statement.js` (выписка Kaspi PDF по координатам через pdf.js, Excel/CSV любого банка `fromRows`, дедупликация), `lib/xlsx.js` (чтение .xlsx без зависимостей), `lib/help.js` (текст инструкции, раздел «Инструкция»).
- Фронтенд: `public/app.js` — vanilla JS SPA, hash-роутинг `#/раздел?параметры`, `SECTIONS.<id>`, действия через `data-act` → `ACT.<name>`, модальные формы `formHtml`. Стиль: `public/styles.css`, брендбук MOST: оранжевый `#ff4d23`, чёрный, серый `#686a6d`, белый; шрифт Neue Haas Grotesk с запасным стеком; логотип `public/logo.svg` (векторная «M»).

## Данные

- Модель повторяет Google-таблицу «Бюджет МОСТ» (операции с 2018 г., реестры договоров, подрядчиков, АВР, КП, справочники). Импорт: `python3 tools/import_budget.py budget.xlsx` → `seed/*.json` и `web/dist/seed/`. `tools/import_payroll.py` — ведомость ЗП → сотрудники и месяцы.
- Коллекции: users, docs (АВР/счета клиентам = очередь к бухгалтеру), invoices (счета к оплате: dueDate, approved, file), projects, contracts (projectId), subcontracts, proposals (kp), counterparties (aliases), stages (projectId, planSum, planCost, progress), ops (date, account, debit, credit, counterparty, purpose, project, category, comment, opNo, contractId, stageId, auto/autoProject), accounts, categories (kind), payroll, employees, vacations, obligations, cash (опорные остатки), audit.
- **Реальные данные компании не коммитить**: `seed/`, `data/`, `web/dist/`, `tests/fixtures/*` в .gitignore. Бэкап JSON не содержит хэшей паролей.

## Права

`ADMIN = owner, partner, accountant, secretary` — полный доступ; секретарю закрыт дашборд (`canDashboard`), согласовать оплату могут только owner/partner; users — только owner; settings пишет только owner. PM — только чтение docs, invoices, projects, contracts, subcontracts, counterparties, stages. Проверка на сервере в каждом маршруте, фронт лишь прячет кнопки (`canR`/`canW`).

## Команды

```
node server.js                      # http://localhost:3000, DATA_DIR/PORT из окружения
node tools/add_user.js login pass secretary "Имя"
python3 web/build.py [out.html]     # сборка веб-версии
bash tests/api_test.sh; python3 tests/ui_smoke.py; python3 tests/web_look.py   # см. tests/README.md
zip -r MOST-Финансы.zip finance-app -x "finance-app/data/*" "finance-app/web/dist/*"   # поставка на MostServer
```

## Что осталось (по приоритету)

1. Налоги и начисления по ЗП (ИПН, ОПВ, СО, ОСМС — ставки сверить с бухгалтером), налоговый календарь, НДС по счетам и актам.
2. Даты приёма сотрудников (отпуска считаются от 01.01.2026), увольнения, премии из блока «Доплаты».
3. Учёт времени сотрудников по проектам → себестоимость и загрузка; план ресурсов.
4. Воронка лид → КП → договор; генерация договора/счёта/АВР из шаблонов (КП уже есть).
5. Уведомления (Telegram/email): очередь к бухгалтеру > 3 дней, просроченные счета.
6. Права по проектам для ПМ; история изменений записей.
7. Переход с JSON-файла на PostgreSQL при росте (модель в `lib/domain.js` переносится как есть).
8. Загрузить выписку MOST Project (не загружалась), задать опорные остатки счетов, подтвердить «авто» разнесения (≈1000 операций).

Подробная хронология решений — `docs/SESSION-NOTES.md`.
