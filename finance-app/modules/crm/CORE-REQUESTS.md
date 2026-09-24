# Запросы потока C (crm) к ядру

1. **Прогноз денег** (`lib/domain.js → cashForecast`, маршрут прогноза в `server.js`): добавить ожидаемые поступления по графикам платежей —
   `MODULE_BY_ID.crm && MODULE_BY_ID.crm.expectedPayments(ctx, from, to)` → `[{ date, planned, late, amount, withVat, status, invoiced, label, client, contractId, leadId, paymentId }]`.
   Чтобы не считать дважды: пропускать строки с `invoiced: true`, если по этому договору (`contractId`) акт уже есть в `db.docs`; и не брать `contracts.expectedDate/toPay` для договоров, у которых есть строки графика (`contractId`). Просроченные неоплаченные приходят с `late: true` и датой `from`.
   Функции нужен только `ctx.db`, `ctx.D`, `ctx.today` — можно передать облегчённый ctx.
2. **(по желанию) «Пора выставлять акт» → очередь бухгалтера**: сейчас бухгалтер получает данные из «Коммерция → Документы» (HTML + CSV для 1С). Если нужна строка в `db.docs` (очередь к бухгалтеру в «Финансах»), нужна функция ядра вида `ctx.core.requestDoc({ type: 'act', client, contractId, amount, note })` — модули в чужие коллекции не пишут.
3. Включить модуль `crm` в «Настройки → Модули» после приёмки.
