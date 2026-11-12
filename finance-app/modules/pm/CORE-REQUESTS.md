# Запросы потока pm к ядру и другим модулям

## 13.10.2026 — переписка WhatsApp

1. **board: экспортировать `materials`** из `modules/board/server.js` (`module.exports.materials = MAT`). Сейчас pm берёт функции разбора путей (`roots`, `parseUserPath`, `absOf`, `displayPath`) через `ctx.modules.board`: если поля `materials` нет — подключает `materials.js` из папки модуля (`ctx.modules.board.dir`). С экспортом запасной путь станет не нужен.
2. **ядро: не писать в аудит `POST /api/pm/chats/ingest-status` по ключу ИИ.** Ядро пишет в аудит каждый изменяющий запрос по ключу; мост шлёт состояние раз в 5 минут — это ~290 строк аудита в сутки без пользы. Приём (`ingest`) модуль и так пишет в аудит сам, когда что-то принято.
3. **ядро: лимит тела запроса 32 МБ** (`readBody`). Файл 20 МБ в base64 — 26,7 МБ, проходит только отдельным запросом. Если понадобятся пачки с несколькими крупными файлами — поднять лимит для `/api/pm/chats/ingest` или принимать файлы отдельным бинарным запросом.
4. **docs/ARCHITECTURE.md**: в «Общие данные» дописать коллекции pm `pmLog`, `pmChats`, `pmChatMessages` (владелец — pm; читать переписку другим модулям — только с проверкой `ctx.modules.pm.domain.canChatRead`).
5. **Docker (поток E / координатор)**: чтобы файлы из групп ложились в папки проектов, сетевые тома в `docker-compose.yml` нужны на запись хотя бы для подпапок «00-Входящие WhatsApp»; сейчас только чтение — pm это переживает (`savedError`, кнопка «Повторить»).

## 14.10.2026 — квартал, офис проекта, переносы сроков, проверка пунктов

6. **docs/ARCHITECTURE.md, таблица «События»** — дописать (pm шлёт уже сейчас, модуль уведомлений подхватит позже):
   - `pm.remind` — `{ project: {id, name, track}, userIds, items: [{id, title, due, assigneeId}], by, text, logId }` — «Напомнить исполнителям»;
   - `pm.shift.requested` — `{ item, project, shift }` — запрошен перенос срока пункта;
   - `pm.shift.decided` — `{ item, project, shift }` (`shift.status` approved | rejected);
   - `pm.item.reviewed` — `{ item, project, action: accept|return, comment, by }`.
