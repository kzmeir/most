#!/bin/bash
# Проверка API и прав модуля pm по ролям (owner, partner, gip свой/чужой, pm, lead с разделом, staff, accountant, secretary).
# Запуск из finance-app:  bash modules/pm/tests/api_test.sh
# Нужны node 18+ и curl. Сервер поднимается на порту 3199 с DEV_USER (роль берётся из cookie devrole), база — data-dev/pm-test (в .gitignore).
# Тела запросов передаются файлом (-d @file): в Git Bash кириллица в аргументах curl портится (cp1251).
set -u
APP="$(cd "$(dirname "$0")/../../.." && pwd)"; cd "$APP"
export DATA_DIR="data-dev/pm-test"; export PORT=3199; export DEV_USER=owner
rm -rf "$DATA_DIR"; mkdir -p "$DATA_DIR"
node server.js > "$DATA_DIR/server.log" 2>&1 & SP=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null http://127.0.0.1:$PORT/api/status && break; sleep 0.5; done
B=http://127.0.0.1:$PORT/api; BODY="$DATA_DIR/body.json"
H=(-H 'Content-Type: application/json' -H 'X-Requested-With: fetch')
OWN=(-b 'devrole=owner'); GIP=(-b 'devrole=gip'); PMR=(-b 'devrole=pm'); LEAD=(-b 'devrole=lead; devsection=%D0%9E%D0%92'); STAFF=(-b 'devrole=staff'); ACC=(-b 'devrole=accountant'); SEC=(-b 'devrole=secretary'); PART=(-b 'devrole=partner')
# call <роль> <МЕТОД> <путь> [json]  — тело запроса; code — только HTTP-код
call() { local -n R=$1; local m=$2 p=$3 body=${4:-}; if [ -n "$body" ]; then printf '%s' "$body" > "$BODY"; curl -s "${R[@]}" "${H[@]}" -X "$m" "$B$p" -d @"$BODY"; else curl -s "${R[@]}" "${H[@]}" -X "$m" "$B$p"; fi; }
code() { local -n R=$1; local m=$2 p=$3 body=${4:-}; if [ -n "$body" ]; then printf '%s' "$body" > "$BODY"; curl -s -o /dev/null -w '%{http_code}' "${R[@]}" "${H[@]}" -X "$m" "$B$p" -d @"$BODY"; else curl -s -o /dev/null -w '%{http_code}' "${R[@]}" "${H[@]}" -X "$m" "$B$p"; fi; }
js() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{let d;try{d=JSON.parse(s)}catch(e){console.log('<не JSON: '+s.slice(0,80)+'>');return}try{console.log($1)}catch(e){console.log('<'+e.message+'>')}})"; }
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "  ✓ $1 ($3)"; pass=$((pass+1)); else echo "  ✗ $1: ожидалось $2, получено $3"; fail=$((fail+1)); fi; }
T=$(date +%F); DUE=$(node -e "console.log(new Date(Date.now()+90*864e5).toISOString().slice(0,10))")

echo "== доступ к модулю =="
chk "staff overview 403" 403 "$(code STAFF GET /pm/overview)"
chk "owner overview 200" 200 "$(code OWN GET /pm/overview)"
chk "accountant overview 200" 200 "$(code ACC GET /pm/overview)"
chk "secretary my 200" 200 "$(code SEC GET /pm/my)"
chk "staff badges 403" 403 "$(code STAFF GET /pm/badges)"
chk "коллекция pmProjects через общий API закрыта" 404 "$(code OWN GET /pmProjects)"
chk "шаблон РП = 79 пунктов" 79 "$(call OWN GET /pm/overview | js 'd.templates.rp')"
chk "шаблоны: концепция 13, ЭП 35" "13/35" "$(call OWN GET /pm/overview | js 'd.templates.concept+"/"+d.templates.ep')"

echo "== создание =="
RP=$(call OWN POST /pm/projects "{\"track\":\"rp\",\"name\":\"Тест РП\",\"no\":\"1\",\"client\":\"ТОО Тест\",\"start\":\"$T\",\"due\":\"$DUE\",\"fit\":true,\"gipId\":\"dev-gip\",\"folder\":\"S:\\\\001-2026-Тест\",\"budget\":{\"contract\":100000000,\"sections\":[{\"name\":\"АР\",\"sum\":30000000,\"executor\":\"Внутренние\"}]}}")
RPID=$(echo "$RP" | js 'd.project.id'); chk "owner создал РП (79 пунктов)" 79 "$(echo "$RP" | js 'd.items.length')"
chk "имя сохранилось в UTF-8" "Тест РП" "$(echo "$RP" | js 'd.project.name')"
chk "план под дату по договору: прогноз = срок" "$DUE" "$(echo "$RP" | js 'd.project.forecast')"
chk "все пункты получили срок" 79 "$(echo "$RP" | js 'd.items.filter(i=>i.due).length')"
chk "бюджет виден владельцу" 100000000 "$(echo "$RP" | js 'd.budget.contract')"
chk "подсказка имени папки №-год-название" "001-$(date +%Y)-Тест РП" "$(echo "$RP" | js 'd.folderHint')"
EP=$(call OWN POST /pm/projects "{\"track\":\"ep\",\"name\":\"Тест ЭП\",\"pmId\":\"dev-pm\",\"start\":\"$T\",\"miroUrl\":\"https://miro.com/app/board/uXjVKabc123=/\"}")
EPID=$(echo "$EP" | js 'd.project.id'); chk "owner создал ЭП (8 этапов)" 8 "$(echo "$EP" | js 'd.stageNames.length')"
AN=$(call OWN POST /pm/projects "{\"track\":\"an\",\"name\":\"Тест АН\",\"start\":\"2026-10-01\",\"due\":\"2027-01-15\",\"fit\":true}")
chk "АН: запуск + 4 месяца = 5 этапов" 5 "$(echo "$AN" | js 'd.stageNames.length')"
CN=$(call OWN POST /pm/projects "{\"track\":\"concept\",\"name\":\"Тест концепция\",\"pmId\":\"dev-pm\",\"start\":\"$T\"}")
CNID=$(echo "$CN" | js 'd.project.id'); chk "концепция: 3 этапа, 13 пунктов" "3/13" "$(echo "$CN" | js 'd.stageNames.length+"/"+d.items.length')"
chk "ошибка без стадии" 400 "$(code OWN POST /pm/projects '{"name":"x"}')"
chk "accountant создать нельзя" 403 "$(code ACC POST /pm/projects '{"track":"rp","name":"x"}')"
chk "lead создать нельзя" 403 "$(code LEAD POST /pm/projects '{"track":"rp","name":"x"}')"
G=$(call GIP POST /pm/projects "{\"track\":\"rp\",\"name\":\"РП ГИПа\",\"start\":\"$T\"}")
GID=$(echo "$G" | js 'd.project.id'); chk "gip создал РП, сам стал ГИПом" dev-gip "$(echo "$G" | js 'd.project.gipId')"
PP=$(call PMR POST /pm/projects '{"track":"ep","name":"ЭП ПМа"}')
PMEP=$(echo "$PP" | js 'd.project.id'); chk "pm создал ЭП, сам стал ПМом" dev-pm "$(echo "$PP" | js 'd.project.pmId')"

echo "== карточка и права ГИП/ПМ =="
chk "gip читает чужой проект" 200 "$(code GIP GET /pm/projects/$PMEP)"
chk "gip меняет свой проект" 200 "$(code GIP PUT /pm/projects/$GID '{"status":"Ждём заказчика","comment":"ок"}')"
chk "gip меняет чужой проект 403" 403 "$(code GIP PUT /pm/projects/$PMEP '{"status":"На паузе"}')"
chk "gip — проект, где он назначен ГИПом, тоже свой" 200 "$(code GIP PUT /pm/projects/$RPID '{"comment":"гип"}')"
chk "gip не может сменить ГИПа (поле отброшено)" dev-gip "$(call GIP PUT /pm/projects/$GID '{"gipId":"dev-owner"}' | js 'd.project.gipId')"
chk "gip видит бюджет своего проекта (seeBudget)" 100000000 "$(call GIP GET /pm/projects/$RPID | js 'd.budget.contract')"
chk "pm не видит бюджет чужого проекта" undefined "$(call PMR GET /pm/projects/$RPID | js 'String(d.budget)')"
chk "accountant не видит бюджет" undefined "$(call ACC GET /pm/projects/$RPID | js 'String(d.budget)')"
chk "gip удалить нельзя" 403 "$(code GIP DELETE /pm/projects/$GID)"
chk "pm меняет бюджет чужого 403" 403 "$(code PMR PUT /pm/projects/$RPID '{"budget":{"contract":1}}')"
chk "partner (руководитель) меняет любой" 200 "$(code PART PUT /pm/projects/$GID '{"risk":"Высокий"}')"
chk "финансовые проекты только руководителю" 403 "$(code GIP GET /pm/finance/projects)"
chk "финансовые проекты: owner 200" 200 "$(code OWN GET /pm/finance/projects)"

echo "== пункты =="
ITEMS=$(call OWN GET /pm/projects/$RPID)
OV=$(echo "$ITEMS" | js 'd.items.find(i=>i.role==="ОВ").id'); AR=$(echo "$ITEMS" | js 'd.items.find(i=>i.role==="ГАП").id'); GIPIT=$(echo "$ITEMS" | js 'd.items.find(i=>i.role==="ГИП").id')
chk "lead ОВ отмечает пункт ОВ" 200 "$(code LEAD PUT /pm/items/$OV '{"done":true,"note":"готово","contractor":"ТОО Субподряд ОВ"}')"
chk "подрядчик записан в пункт" "ТОО Субподряд ОВ" "$(call OWN GET /pm/projects/$RPID | js 'd.items.find(i=>i.id==="'$OV'").contractor')"
chk "подрядчик попал в подсказки карточки" true "$(call OWN GET /pm/projects/$RPID | js 'd.contractors.includes("ТОО Субподряд ОВ")')"
chk "lead ОВ не трогает пункт ГАП" 403 "$(code LEAD PUT /pm/items/$AR '{"done":true}')"
chk "lead не меняет название (поле отброшено)" false "$(call LEAD PUT /pm/items/$OV '{"title":"x"}' | js 'd.title==="x"')"
chk "pm чужой пункт 403" 403 "$(code PMR PUT /pm/items/$GIPIT '{"done":true}')"
call OWN PUT /pm/items/$GIPIT '{"assigneeId":"dev-pm"}' > /dev/null
chk "назначенный исполнитель может отметить" 200 "$(code PMR PUT /pm/items/$GIPIT '{"done":true}')"
chk "doneBy проставлен" dev-pm "$(call OWN GET /pm/projects/$RPID | js 'd.items.find(i=>i.id==="'$GIPIT'").doneBy')"
chk "менеджер меняет этап/роль пункта" ВК "$(call OWN PUT /pm/items/$AR '{"role":"ВК","stage":5}' | js 'd.section')"
NEW=$(call OWN POST /pm/projects/$RPID/items '{"stage":3,"title":"Доп. пункт","role":"ГП","weeks":1}')
NEWID=$(echo "$NEW" | js 'd.id'); chk "добавлен свой пункт в этап 3" "3. Этап 1. Схема КЖ" "$(echo "$NEW" | js 'd.stageName')"
chk "lead добавить пункт нельзя" 403 "$(code LEAD POST /pm/projects/$RPID/items '{"stage":3,"title":"x"}')"
chk "удалить пункт (владелец)" 200 "$(code OWN DELETE /pm/items/$NEWID)"
chk "мои задачи lead ОВ — только ОВ" true "$(call LEAD GET /pm/my | js 'd.length>0 && d.every(i=>i.section==="ОВ")')"
chk "мои задачи gip — свои проекты" true "$(call GIP GET /pm/my | js 'd.length>0 && d.every(i=>["ГИП","Заказчик"].includes(i.role))')"
call OWN PUT /pm/items/$AR '{"due":"2026-01-01"}' > /dev/null
chk "счётчик просроченных у владельца ≥ 1" true "$(call OWN GET /pm/badges | js 'd.pmmy>=1')"

echo "== план, блокеры, передача дальше =="
chk "план от старта (gip свой)" 200 "$(code GIP POST /pm/projects/$GID/plan "{\"start\":\"$T\"}")"
chk "план чужого 403" 403 "$(code PMR POST /pm/projects/$GID/plan '{}')"
BL=$(call LEAD POST /pm/blockers "{\"pid\":\"$RPID\",\"what\":\"Ждём ТУ\",\"holder\":\"Заказчик\",\"since\":\"2026-06-01\"}")
BLID=$(echo "$BL" | js 'd.id'); chk "lead создал блокер" open "$(echo "$BL" | js 'd.status')"
chk "блокер без текста 400" 400 "$(code OWN POST /pm/blockers "{\"pid\":\"$RPID\"}")"
chk "pm чужой блокер 403" 403 "$(code PMR PUT /pm/blockers/$BLID '{"status":"closed"}')"
chk "автор закрывает блокер" closed "$(call LEAD PUT /pm/blockers/$BLID '{"status":"closed"}' | js 'd.status')"
call OWN PUT /pm/blockers/$BLID '{"status":"open"}' > /dev/null
chk "старые блокеры (>14 дн.) считаются в сводке и счётчике" true "$(call OWN GET /pm/overview | js 'd.blockersOld>=1')"
chk "счётчик блокеров в меню ≥ 1" true "$(call GIP GET /pm/badges | js 'd.pmbl>=1')"
chk "передать РП дальше нельзя" 400 "$(code OWN POST /pm/projects/$RPID/handover '{}')"
HO=$(call PMR POST /pm/projects/$PMEP/handover "{\"gipId\":\"dev-gip\",\"due\":\"$DUE\"}")
chk "ПМ передал свой ЭП в РП" rp "$(echo "$HO" | js 'd.project.track')"
chk "у РП ссылка на ЭП" "$PMEP" "$(echo "$HO" | js 'd.project.epId')"
chk "ЭП закрыт (Готово) и знает свой РП" "Готово/true" "$(call OWN GET /pm/projects/$PMEP | js 'd.project.status+"/"+(d.project.rpId===d.rp.id)')"
chk "повторная передача 400" 400 "$(code OWN POST /pm/projects/$PMEP/handover '{}')"
HC=$(call OWN POST /pm/projects/$CNID/handover '{"pmId":"dev-pm"}')
chk "концепция передана в ЭП" ep "$(echo "$HC" | js 'd.project.track')"
chk "у ЭП ссылка на концепцию" "$CNID" "$(echo "$HC" | js 'd.project.conceptId')"

echo "== импорт =="
IMP='{"mode":"skip","since":"2026-07-13","projects":[{"name":"Импорт А","track":"rp","status":"Ждём заказчика","start":"2026-04-01","due":"2027-02-15","stageName":"3. Этап 1. Схема КЖ","projectId":"нет-такого","tasks":[{"title":"Карточка Trello","stage":"3. Этап 1. Схема КЖ","status":"В работе","due":"2026-05-29"},{"title":"Сделано","status":"Готово"}],"blockers":[{"what":"ИРД","holder":"Заказчик","status":"Открыт"}],"budget":{"contract":168040000,"marginTarget":0.3,"gipSum":12180000,"sections":[{"name":"АР","sum":30180000,"executor":"Внутренние"},{"name":"КЖ","sum":25500000,"executor":"Субподряд"}]}},{"name":"Импорт Б","track":"rp","status":"Готово","start":"2025-08-01","due":"2026-06-30","stageName":"8. Этап 6. Экспертиза"}]}'
R=$(call OWN POST /pm/import "$IMP")
chk "импорт: создано 2" 2 "$(echo "$R" | js 'd.created.length')"
chk "импорт: пункты прошлых этапов отмечены (А: этапы 1–2 = 8, Б: этапы 1–7 = 76)" 84 "$(echo "$R" | js 'd.done')"
chk "импорт: задачи Trello 2, блокеры 1, бюджеты 1" "2/1/1" "$(echo "$R" | js 'd.tasks+"/"+d.blockers+"/"+d.budgets')"
chk "импорт: неизвестный код финансов снят" 1 "$(echo "$R" | js 'd.unlinked.length')"
IA=$(call OWN GET /pm/overview | js 'JSON.stringify(d.rows.find(r=>r.name==="Импорт А")||null)')
chk "импорт: текущий этап А = 3" 3 "$(echo "$IA" | js 'd.progress.stage')"
chk "импорт: бюджет А сохранён" 168040000 "$(echo "$IA" | js 'd.budget.contract')"
chk "импорт: прогноз = дата по договору" 2027-02-15 "$(echo "$IA" | js 'd.forecast')"
chk "повторный импорт пропускает" 2 "$(call OWN POST /pm/import "$IMP" | js 'd.skipped.length')"
chk "импорт replace пересоздаёт" 2 "$(call OWN POST /pm/import "${IMP/\"mode\":\"skip\"/\"mode\":\"replace\"}" | js 'd.replaced.length')"
chk "импорт accountant 403" 403 "$(code ACC POST /pm/import "$IMP")"
chk "импорт gip 403" 403 "$(code GIP POST /pm/import "$IMP")"
chk "сводка: воронка РП из 9 этапов, есть все 4 стадии" true "$(call OWN GET /pm/overview | js 'd.byTrack.rp.n>=3 && d.byTrack.rp.funnel.length===9 && !!d.byTrack.concept && !!d.byTrack.an')"

echo "== Метод Пульса: устав, две оценки, буфер, ретро =="
chk "карточка: зона буфера и режим по договору" true "$(call OWN GET /pm/projects/$RPID | js '["blue","green","yellow","red","black"].includes(d.health.zone) && typeof d.health.consumption==="number" && d.health.mode==="contract"')"
chk "буфер = 30 % срока договора" true "$(call OWN GET /pm/projects/$RPID | js 'Math.abs(d.health.bufferDays - Math.round((d.health.planDays+d.health.bufferDays)*0.3))<=1')"
chk "скорость и прогноз после отметок «сделано»" true "$(call OWN GET /pm/projects/$RPID | js 'd.health.curV>0 && !!d.health.forecast.realistic')"
chk "Проход виден владельцу (контракт 100 млн)" true "$(call OWN GET /pm/projects/$RPID | js '!!d.throughput && d.throughput.perMonth>0')"
chk "Проход скрыт от pm" undefined "$(call PMR GET /pm/projects/$RPID | js 'String(d.throughput)')"
chk "устав сохраняется, проверочная фраза готова" true "$(call OWN PUT /pm/projects/$RPID '{"charter":{"what":"РП жилого дома","why":"заказчик строит в 2027","doneCriterion":"положительное заключение экспертизы","successCriterion":"стройка началась в срок"}}' | js 'd.charterOk===true && d.project.charter.what==="РП жилого дома"')"
chk "устав: pm чужого проекта 403" 403 "$(code PMR PUT /pm/projects/$RPID '{"charter":{"what":"x"}}')"
chk "пессимистичная оценка пункта" 4 "$(call OWN PUT /pm/items/$AR '{"weeks":2,"weeksMax":4}' | js 'd.weeksMax')"
chk "снятие отметки считает возврат" 1 "$(call OWN PUT /pm/items/$OV '{"done":false}' | js 'd.returns')"
RT=$(call OWN POST /pm/projects/$RPID/retro '{"interpret":"буфер расходуется быстрее плана","change":"выдавать задания смежникам раньше","actions":[{"step":"собрать ГАП и ГКП","who":"ГИП","when":"2026-10-01","howMuch":"задание выдано"}]}')
RTID=$(echo "$RT" | js 'd.retros[0].id'); chk "ретроспектива со снимком показателей" true "$(echo "$RT" | js 'd.retros.length===1 && typeof d.retros[0].snapshot.consumption==="number" && d.retros[0].actions.length===1 && d.retros[0].snapshot.returns===1')"
chk "ретро: gip в чужом проекте 403" 403 "$(code GIP POST /pm/projects/$PMEP/retro '{"interpret":"x"}')"
chk "ретро удаляется" 0 "$(call OWN DELETE /pm/projects/$RPID/retro/$RTID | js 'd.retros.length')"
chk "сводка: health у строк, Проход только с бюджетом" true "$(call OWN GET /pm/overview | js 'd.rows.every(r=>r.health && r.health.zone) && d.rows.some(r=>r.throughput)')"
chk "сводка gip: Проход скрыт у чужих" true "$(call GIP GET /pm/overview | js 'd.rows.filter(r=>r.gipId!=="dev-gip").every(r=>r.throughput===undefined)')"

echo "== даты по договору =="
chk "договор: 120 раб. дн. от 01.06.2026 → 18.11.2026 (календарь РК)" 2026-11-18 "$(call OWN PUT /pm/projects/$RPID '{"contractNo":"123-26-РП","contractDate":"2026-05-29","contractTerm":120,"contractTermUnit":"рабочих","contractStartRule":"аванс+ТЗ+ИРД","start":"2026-06-01","dueFromTerm":"1"}' | js 'd.project.due')"
chk "договор: реквизиты в карточке" "123-26-РП|120|рабочих|2026-05-29" "$(call OWN GET /pm/projects/$RPID | js '[d.project.contractNo,d.project.contractTerm,d.project.contractTermUnit,d.project.contractDate].join("|")')"
chk "договор: неизвестная единица → рабочих, дата не трогается без dueFromTerm" "рабочих|2026-11-18" "$(call OWN PUT /pm/projects/$RPID '{"contractTermUnit":"лет","contractTerm":10}' | js 'd.project.contractTermUnit+"|"+d.project.due')"
chk "договор: gip чужого проекта 403" 403 "$(code GIP PUT /pm/projects/$PMEP '{"contractNo":"x"}')"
chk "массовые даты: gip 403" 403 "$(code GIP POST /pm/contract-dates '{"rows":[]}')"
chk "массовые даты: по id, 60 кал. дн. от 09.12.2025 → 07.02.2026; чужое имя — missed" "2026-02-07|1" "$(call OWN POST /pm/contract-dates "{\"rows\":[{\"id\":\"$RPID\",\"contractTerm\":60,\"contractTermUnit\":\"календарных\",\"start\":\"2025-12-09\",\"dueFromTerm\":true},{\"name\":\"Нет такого объекта\"}]}" | js 'd.applied[0].due+"|"+d.missed.length')"
chk "календарь: 1 рабочий день после 31.12.2026 → 05.01.2027" 2027-01-05 "$(node -e "console.log(require('./modules/pm/domain.js').addWorkDays('2027-01-01',1))")"

echo "== удаление =="
chk "owner удаляет проект" 200 "$(code OWN DELETE /pm/projects/$GID)"
chk "удалённый не найден" 404 "$(code OWN GET /pm/projects/$GID)"
chk "пункты удалённого проекта убраны" 0 "$(node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('$DATA_DIR/db.sqlite');console.log(db.prepare(\"select count(*) n from docs where col='pmItems' and json_extract(data,'\$.pid')=?\").get('$GID').n)" 2>/dev/null)"

kill $SP 2>/dev/null; wait $SP 2>/dev/null
echo; echo "Итого: ✓ $pass  ✗ $fail"; [ $fail -eq 0 ]
