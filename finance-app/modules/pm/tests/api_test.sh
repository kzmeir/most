#!/bin/bash
# Проверка API и прав модуля pm по ролям (owner, partner, gip свой/чужой, pm, lead с разделом, staff, accountant, secretary).
# Запуск из finance-app:  bash modules/pm/tests/api_test.sh
# Нужны node 18+ и curl. Сервер поднимается на порту 3199 с DEV_USER (роль берётся из cookie devrole), база — data-dev/pm-test (в .gitignore).
set -u
APP="$(cd "$(dirname "$0")/../../.." && pwd)"; cd "$APP"
export DATA_DIR="data-dev/pm-test"; export PORT=3199; export DEV_USER=owner
rm -rf "$DATA_DIR"; mkdir -p "$DATA_DIR"
node server.js > "$DATA_DIR/server.log" 2>&1 & SP=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null http://127.0.0.1:$PORT/api/status && break; sleep 0.5; done
B=http://127.0.0.1:$PORT/api
H=(-H 'Content-Type: application/json' -H 'X-Requested-With: fetch')
OWN=(-b 'devrole=owner'); GIP=(-b 'devrole=gip'); PMR=(-b 'devrole=pm'); LEAD=(-b 'devrole=lead; devsection=%D0%9E%D0%92'); STAFF=(-b 'devrole=staff'); ACC=(-b 'devrole=accountant'); SEC=(-b 'devrole=secretary'); PART=(-b 'devrole=partner')
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
js() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s);console.log($1)})"; }
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "  ✓ $1 ($3)"; pass=$((pass+1)); else echo "  ✗ $1: ожидалось $2, получено $3"; fail=$((fail+1)); fi; }
T=$(date +%F); DUE=$(node -e "console.log(new Date(Date.now()+90*864e5).toISOString().slice(0,10))")

echo "== доступ к модулю =="
chk "staff overview 403" 403 "$(code "${STAFF[@]}" $B/pm/overview)"
chk "owner overview 200" 200 "$(code "${OWN[@]}" $B/pm/overview)"
chk "accountant overview 200" 200 "$(code "${ACC[@]}" $B/pm/overview)"
chk "secretary my 200" 200 "$(code "${SEC[@]}" $B/pm/my)"
chk "коллекция pmProjects через общий API закрыта" 404 "$(code "${OWN[@]}" $B/pmProjects)"
chk "шаблон РП = 79 пунктов" 79 "$(curl -s "${OWN[@]}" $B/pm/overview | js 'd.templates.rp')"

echo "== создание =="
RP=$(curl -s "${OWN[@]}" "${H[@]}" -X POST $B/pm/projects -d "{\"track\":\"rp\",\"name\":\"Тест РП\",\"client\":\"ТОО Тест\",\"start\":\"$T\",\"due\":\"$DUE\",\"fit\":true,\"gipId\":\"dev-gip\",\"budget\":{\"contract\":100000000,\"sections\":[{\"name\":\"АР\",\"sum\":30000000,\"executor\":\"Внутренние\"}]}}")
RPID=$(echo "$RP" | js 'd.project.id'); chk "owner создал РП (79 пунктов)" 79 "$(echo "$RP" | js 'd.items.length')"
chk "план под дату по договору: прогноз = срок" "$DUE" "$(echo "$RP" | js 'd.project.forecast')"
chk "все пункты получили срок" 79 "$(echo "$RP" | js 'd.items.filter(i=>i.due).length')"
chk "бюджет виден владельцу" 100000000 "$(echo "$RP" | js 'd.budget.contract')"
EP=$(curl -s "${OWN[@]}" "${H[@]}" -X POST $B/pm/projects -d "{\"track\":\"ep\",\"name\":\"Тест ЭП\",\"pmId\":\"dev-pm\",\"start\":\"$T\",\"miroUrl\":\"https://miro.com/app/board/uXjVKabc123=/\"}")
EPID=$(echo "$EP" | js 'd.project.id'); chk "owner создал ЭП (8 этапов)" 8 "$(echo "$EP" | js 'd.stageNames.length')"
chk "ошибка без стадии" 400 "$(code "${OWN[@]}" "${H[@]}" -X POST $B/pm/projects -d '{"name":"x"}')"
chk "accountant создать нельзя" 403 "$(code "${ACC[@]}" "${H[@]}" -X POST $B/pm/projects -d '{"track":"rp","name":"x"}')"
chk "lead создать нельзя" 403 "$(code "${LEAD[@]}" "${H[@]}" -X POST $B/pm/projects -d '{"track":"rp","name":"x"}')"
G=$(curl -s "${GIP[@]}" "${H[@]}" -X POST $B/pm/projects -d '{"track":"rp","name":"РП ГИПа","start":"'$T'"}')
GID=$(echo "$G" | js 'd.project.id'); chk "gip создал РП, сам стал ГИПом" dev-gip "$(echo "$G" | js 'd.project.gipId')"
PP=$(curl -s "${PMR[@]}" "${H[@]}" -X POST $B/pm/projects -d '{"track":"ep","name":"ЭП ПМа"}')
PPID=$(echo "$PP" | js 'd.project.id'); chk "pm создал ЭП, сам стал ПМом" dev-pm "$(echo "$PP" | js 'd.project.pmId')"

echo "== карточка и права ГИП/ПМ =="
chk "gip читает чужой проект" 200 "$(code "${GIP[@]}" $B/pm/projects/$PPID)"
chk "gip меняет свой проект" 200 "$(code "${GIP[@]}" "${H[@]}" -X PUT $B/pm/projects/$GID -d '{"status":"Ждём заказчика","comment":"ок"}')"
chk "gip меняет чужой проект 403" 403 "$(code "${GIP[@]}" "${H[@]}" -X PUT $B/pm/projects/$PPID -d '{"status":"На паузе"}')"
chk "gip — проект, где он назначен ГИПом, тоже свой" 200 "$(code "${GIP[@]}" "${H[@]}" -X PUT $B/pm/projects/$RPID -d '{"comment":"гип"}')"
chk "gip не может сменить ГИПа (поле отброшено)" dev-gip "$(curl -s "${GIP[@]}" "${H[@]}" -X PUT $B/pm/projects/$GID -d '{"gipId":"dev-owner"}' | js 'd.project.gipId')"
chk "gip видит бюджет своего проекта (seeBudget)" 100000000 "$(curl -s "${GIP[@]}" $B/pm/projects/$RPID | js 'd.budget.contract')"
chk "pm не видит бюджет чужого проекта" undefined "$(curl -s "${PMR[@]}" $B/pm/projects/$RPID | js 'String(d.budget)')"
chk "accountant не видит бюджет" undefined "$(curl -s "${ACC[@]}" $B/pm/projects/$RPID | js 'String(d.budget)')"
chk "gip удалить нельзя" 403 "$(code "${GIP[@]}" "${H[@]}" -X DELETE $B/pm/projects/$GID)"
chk "pm меняет бюджет чужого 403" 403 "$(code "${PMR[@]}" "${H[@]}" -X PUT $B/pm/projects/$RPID -d '{"budget":{"contract":1}}')"
chk "partner (руководитель) меняет любой" 200 "$(code "${PART[@]}" "${H[@]}" -X PUT $B/pm/projects/$GID -d '{"risk":"Высокий"}')"

echo "== пункты =="
ITEMS=$(curl -s "${OWN[@]}" $B/pm/projects/$RPID)
OV=$(echo "$ITEMS" | js 'd.items.find(i=>i.role==="ОВ").id'); AR=$(echo "$ITEMS" | js 'd.items.find(i=>i.role==="ГАП").id'); GIPIT=$(echo "$ITEMS" | js 'd.items.find(i=>i.role==="ГИП").id')
chk "lead ОВ отмечает пункт ОВ" 200 "$(code "${LEAD[@]}" "${H[@]}" -X PUT $B/pm/items/$OV -d '{"done":true,"note":"готово"}')"
chk "lead ОВ не трогает пункт ГАП" 403 "$(code "${LEAD[@]}" "${H[@]}" -X PUT $B/pm/items/$AR -d '{"done":true}')"
chk "lead не меняет название (поле отброшено)" false "$(curl -s "${LEAD[@]}" "${H[@]}" -X PUT $B/pm/items/$OV -d '{"title":"x"}' | js 'd.title==="x"')"
chk "pm чужой пункт 403" 403 "$(code "${PMR[@]}" "${H[@]}" -X PUT $B/pm/items/$GIPIT -d '{"done":true}')"
chk "назначенный исполнитель может отметить" 200 "$(curl -s "${OWN[@]}" "${H[@]}" -X PUT $B/pm/items/$GIPIT -d '{"assigneeId":"dev-pm"}' >/dev/null; code "${PMR[@]}" "${H[@]}" -X PUT $B/pm/items/$GIPIT -d '{"done":true}')"
chk "doneBy проставлен" dev-pm "$(curl -s "${OWN[@]}" $B/pm/projects/$RPID | js 'd.items.find(i=>i.id==="'$GIPIT'").doneBy')"
chk "менеджер меняет этап/роль пункта" ВК "$(curl -s "${OWN[@]}" "${H[@]}" -X PUT $B/pm/items/$AR -d '{"role":"ВК","stage":5}' | js 'd.section')"
NEW=$(curl -s "${OWN[@]}" "${H[@]}" -X POST $B/pm/projects/$RPID/items -d '{"stage":3,"title":"Доп. пункт","role":"ГП","weeks":1}')
NEWID=$(echo "$NEW" | js 'd.id'); chk "добавлен свой пункт в этап 3" "3. Этап 1. Схема КЖ" "$(echo "$NEW" | js 'd.stageName')"
chk "lead добавить пункт нельзя" 403 "$(code "${LEAD[@]}" "${H[@]}" -X POST $B/pm/projects/$RPID/items -d '{"stage":3,"title":"x"}')"
chk "удалить пункт (владелец)" 200 "$(code "${OWN[@]}" "${H[@]}" -X DELETE $B/pm/items/$NEWID)"
chk "мои задачи lead ОВ — только ОВ" true "$(curl -s "${LEAD[@]}" $B/pm/my | js 'd.length>0 && d.every(i=>i.section==="ОВ")')"
chk "мои задачи gip — свои проекты" true "$(curl -s "${GIP[@]}" $B/pm/my | js 'd.length>0 && d.every(i=>["ГИП","Заказчик"].includes(i.role))')"

echo "== план, блокеры, передача в РП =="
chk "план от старта (gip свой)" 200 "$(code "${GIP[@]}" "${H[@]}" -X POST $B/pm/projects/$GID/plan -d '{"start":"'$T'"}')"
chk "план чужого 403" 403 "$(code "${PMR[@]}" "${H[@]}" -X POST $B/pm/projects/$GID/plan -d '{}')"
BL=$(curl -s "${LEAD[@]}" "${H[@]}" -X POST $B/pm/blockers -d '{"pid":"'$RPID'","what":"Ждём ТУ","holder":"Заказчик","since":"2026-06-01"}')
BLID=$(echo "$BL" | js 'd.id'); chk "lead создал блокер" open "$(echo "$BL" | js 'd.status')"
chk "блокер без текста 400" 400 "$(code "${OWN[@]}" "${H[@]}" -X POST $B/pm/blockers -d '{"pid":"'$RPID'"}')"
chk "pm чужой блокер 403" 403 "$(code "${PMR[@]}" "${H[@]}" -X PUT $B/pm/blockers/$BLID -d '{"status":"closed"}')"
chk "автор закрывает блокер" closed "$(curl -s "${LEAD[@]}" "${H[@]}" -X PUT $B/pm/blockers/$BLID -d '{"status":"closed"}' | js 'd.status')"
chk "старые блокеры (>14 дн.) считаются в сводке" true "$(curl -s "${OWN[@]}" "${H[@]}" -X PUT $B/pm/blockers/$BLID -d '{"status":"open"}' >/dev/null; curl -s "${OWN[@]}" $B/pm/overview | js 'd.blockersOld>=1')"
chk "передать РП в РП нельзя" 400 "$(code "${OWN[@]}" "${H[@]}" -X POST $B/pm/projects/$RPID/handover -d '{}')"
HO=$(curl -s "${PMR[@]}" "${H[@]}" -X POST $B/pm/projects/$PPID/handover -d '{"gipId":"dev-gip","due":"'$DUE'"}')
chk "ПМ передал свой ЭП в РП" rp "$(echo "$HO" | js 'd.project.track')"
chk "у РП ссылка на ЭП" "$PPID" "$(echo "$HO" | js 'd.project.epId')"
chk "ЭП закрыт (Готово)" Готово "$(curl -s "${OWN[@]}" $B/pm/projects/$PPID | js 'd.project.status')"
chk "повторная передача 400" 400 "$(code "${OWN[@]}" "${H[@]}" -X POST $B/pm/projects/$PPID/handover -d '{}')"

echo "== импорт =="
IMP='{"mode":"skip","since":"2026-07-13","projects":[{"name":"Импорт А","track":"rp","status":"Ждём заказчика","start":"2026-04-01","due":"2027-02-15","stageName":"3. Этап 1. Схема КЖ","projectId":"нет-такого","tasks":[{"title":"Карточка Trello","stage":"3. Этап 1. Схема КЖ","status":"В работе","due":"2026-05-29"},{"title":"Сделано","status":"Готово"}],"blockers":[{"what":"ИРД","holder":"Заказчик","status":"Открыт"}],"budget":{"contract":168040000,"marginTarget":0.3,"gipSum":12180000,"sections":[{"name":"АР","sum":30180000,"executor":"Внутренние"},{"name":"КЖ","sum":25500000,"executor":"Субподряд"}]}},{"name":"Импорт Б","track":"rp","status":"Готово","start":"2025-08-01","due":"2026-06-30","stageName":"8. Этап 6. Экспертиза"}]}'
R=$(curl -s "${OWN[@]}" "${H[@]}" -X POST $B/pm/import -d "$IMP")
chk "импорт: создано 2" 2 "$(echo "$R" | js 'd.created.length')"
chk "импорт: пункты прошлых этапов отмечены (А: этапы 1–2 = 8, Б: этапы 1–7 = 76)" 84 "$(echo "$R" | js 'd.done')"
chk "импорт: задачи Trello 2, блокеры 1, бюджеты 1" "2/1/1" "$(echo "$R" | js 'd.tasks+"/"+d.blockers+"/"+d.budgets')"
chk "импорт: неизвестный код финансов снят" 1 "$(echo "$R" | js 'd.unlinked.length')"
IA=$(curl -s "${OWN[@]}" $B/pm/overview | js 'JSON.stringify(d.rows.find(r=>r.name==="Импорт А"))')
chk "импорт: текущий этап А = 3" 3 "$(echo "$IA" | js 'd.progress.stage')"
chk "импорт: бюджет А сохранён" 168040000 "$(echo "$IA" | js 'd.budget.contract')"
chk "повторный импорт пропускает" 2 "$(curl -s "${OWN[@]}" "${H[@]}" -X POST $B/pm/import -d "$IMP" | js 'd.skipped.length')"
chk "импорт replace пересоздаёт" 2 "$(curl -s "${OWN[@]}" "${H[@]}" -X POST $B/pm/import -d "${IMP/\"mode\":\"skip\"/\"mode\":\"replace\"}" | js 'd.replaced.length')"
chk "импорт accountant 403" 403 "$(code "${ACC[@]}" "${H[@]}" -X POST $B/pm/import -d "$IMP")"
chk "импорт gip 403" 403 "$(code "${GIP[@]}" "${H[@]}" -X POST $B/pm/import -d "$IMP")"
chk "сводка: воронка РП из 9 этапов" true "$(curl -s "${OWN[@]}" $B/pm/overview | js 'd.byTrack.rp.n>=3 && d.byTrack.rp.funnel.length===9')"

echo "== удаление =="
chk "owner удаляет проект" 200 "$(code "${OWN[@]}" "${H[@]}" -X DELETE $B/pm/projects/$GID)"
chk "удалённый не найден" 404 "$(code "${OWN[@]}" $B/pm/projects/$GID)"
chk "пункты удалённого проекта убраны" 0 "$(node -e "const db=require('./$DATA_DIR/db.json');console.log(db.pmItems.filter(i=>i.pid==='$GID').length)")"

kill $SP 2>/dev/null; wait $SP 2>/dev/null
echo; echo "Итого: ✓ $pass  ✗ $fail"; [ $fail -eq 0 ]
