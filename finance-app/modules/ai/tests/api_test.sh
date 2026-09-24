#!/bin/bash
# Проверка API модуля ai: права по ролям, очередь, таймаут, заглушка backend='mock', черновики, .docx, «Применить», сайты.
# Запуск из finance-app:  bash modules/ai/tests/api_test.sh
# Нужны node 22.5+, curl, python (проверка .docx). Сервер — порт 3196 с DEV_USER (роль — cookie devrole), база — пустая data-dev/ai-test (в .gitignore).
# Claude не вызывается: все запросы идут в заглушку mock. Тела запросов — файлом (-d @file): в Git Bash кириллица в аргументах curl портится.
set -u
APP="$(cd "$(dirname "$0")/../../.." && pwd)"; cd "$APP"
export DATA_DIR="data-dev/ai-test"; export PORT=3196; export DEV_USER=owner
rm -rf "$DATA_DIR"; mkdir -p "$DATA_DIR"
node server.js > "$DATA_DIR/server.log" 2>&1 & SP=$!
for i in $(seq 1 20); do curl -s -o /dev/null http://127.0.0.1:$PORT/api/status && break; sleep 0.5; done
B=http://127.0.0.1:$PORT/api; BODY="$DATA_DIR/body.json"
H=(-H 'Content-Type: application/json' -H 'X-Requested-With: fetch')
OWN=(-b 'devrole=owner'); PART=(-b 'devrole=partner'); SEC=(-b 'devrole=secretary'); PMR=(-b 'devrole=pm'); GIP=(-b 'devrole=gip'); ACC=(-b 'devrole=accountant'); STAFF=(-b 'devrole=staff'); LEAD=(-b 'devrole=lead')
call() { local -n R=$1; local m=$2 p=$3 body=${4:-}; if [ -n "$body" ]; then printf '%s' "$body" > "$BODY"; curl -s "${R[@]}" "${H[@]}" -X "$m" "$B$p" -d @"$BODY"; else curl -s "${R[@]}" "${H[@]}" -X "$m" "$B$p"; fi; }
code() { local -n R=$1; local m=$2 p=$3 body=${4:-}; if [ -n "$body" ]; then printf '%s' "$body" > "$BODY"; curl -s -o /dev/null -w '%{http_code}' "${R[@]}" "${H[@]}" -X "$m" "$B$p" -d @"$BODY"; else curl -s -o /dev/null -w '%{http_code}' "${R[@]}" "${H[@]}" -X "$m" "$B$p"; fi; }
js() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{let d;try{d=JSON.parse(s)}catch(e){console.log('<не JSON: '+s.slice(0,80)+'>');return}try{console.log($1)}catch(e){console.log('<'+e.message+'>')}})"; }
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "  ✓ $1 ($3)"; pass=$((pass+1)); else echo "  ✗ $1: ожидалось $2, получено $3"; fail=$((fail+1)); fi; }
# ждать завершения задачи: wait_job <роль> <id> → итоговый JSON
wait_job() { local r=$1 id=$2 j; for i in $(seq 1 60); do j=$(call $r GET /ai/jobs/$id); case "$(echo "$j" | js 'd.status')" in done|error) echo "$j"; return;; esac; sleep 0.5; done; echo "$j"; }
T=$(date +%F); DUE=$(node -e "console.log(new Date(Date.now()+120*864e5).toISOString().slice(0,10))")

echo "== права =="
for R in STAFF GIP SEC ACC PMR LEAD; do chk "$R → 403" 403 "$(code $R GET /ai/status)"; done
chk "owner 200" 200 "$(code OWN GET /ai/status)"
chk "partner 200" 200 "$(code PART GET /ai/status)"
chk "partner: настройки 403" 403 "$(code PART GET /ai/config)"
chk "partner: журнал 403" 403 "$(code PART GET /ai/log)"
chk "коллекция aiLog через общий API закрыта" 404 "$(code OWN GET /aiLog)"
chk "DEV без DEV_SPLIT: все места панели" "pm,pmall,fin" "$(call OWN GET /ai/commands | js 'd.scopes.join(",")')"

echo "== настройки: заглушка =="
chk "owner: backend=mock" mock "$(call OWN PUT /ai/config '{"backend":"mock","mockDelayMs":300,"timeoutSec":20}' | js 'd.backend')"
chk "неверный backend — 400" 400 "$(code OWN PUT /ai/config '{"backend":"gpt"}')"
chk "статус: mock" mock "$(call OWN GET /ai/status | js 'd.backend')"

echo "== проект для проверки (через pm) =="
PID=$(call OWN POST /pm/projects "{\"track\":\"rp\",\"name\":\"Тест ИИ РП\",\"client\":\"ТОО Тест\",\"start\":\"$T\",\"due\":\"$DUE\",\"fit\":true,\"budget\":{\"contract\":123456789}}" | js 'd.project.id')
chk "проект создан" 1 "$(call OWN GET /ai/projects | js 'd.filter(p=>p.id==="'$PID'").length')"
N0=$(call OWN GET /pm/projects/$PID | js 'd.items.length')

echo "== запрос и черновик =="
chk "команда без проекта — 400" 400 "$(code OWN POST /ai/ask '{"scope":"pm","cmd":"plan"}')"
chk "неизвестная команда — 400" 400 "$(code OWN POST /ai/ask '{"scope":"pmall","cmd":"rm -rf"}')"
chk "протокол без текста — 400" 400 "$(code OWN POST /ai/ask "{\"scope\":\"pm\",\"pid\":\"$PID\",\"cmd\":\"protocol\"}")"
J=$(call OWN POST /ai/ask "{\"scope\":\"pm\",\"pid\":\"$PID\",\"cmd\":\"plan\",\"text\":\"учесть экспертизу\"}"); JID=$(echo "$J" | js 'd.id')
chk "задача поставлена" queued "$(echo "$J" | js 'd.status')"
R=$(wait_job OWN $JID); chk "план готов" done "$(echo "$R" | js 'd.status')"
DID=$(echo "$R" | js 'd.draftId')
chk "в черновике есть план (пункт + срок)" "1/1" "$(echo "$R" | js 'd.draft.plan.items.length+"/"+d.draft.plan.dues.length')"
chk "срок пункта — с названием пункта" true "$(echo "$R" | js '!!d.draft.plan.dues[0].title')"
chk "бюджет проекта не ушёл в промпт" false "$(grep -c 123456789 "$DATA_DIR/server.log" >/dev/null; echo "$R" | js 'JSON.stringify(d).includes("123456789")')"
chk "чужой черновик не виден партнёру" 404 "$(code PART GET /ai/drafts/$DID)"
chk "журнал: запись без ответа" "done/false" "$(call OWN GET /ai/log | js 'd.rows[0].status+"/"+("blocks" in d.rows[0])')"

echo "== .docx =="
curl -s "${OWN[@]}" -D "$DATA_DIR/h.txt" -o "$DATA_DIR/plan.docx" "$B/ai/drafts/$DID/docx"
chk "тип Word" 1 "$(grep -ci 'wordprocessingml' "$DATA_DIR/h.txt")"
chk "имя файла в UTF-8" 1 "$(grep -c "filename\*=UTF-8''" "$DATA_DIR/h.txt")"
chk "docx — корректный ZIP с XML" ok "$(python -c "
import zipfile,sys;from xml.dom import minidom;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None
[minidom.parseString(z.read(n)) for n in z.namelist() if n.endswith(('.xml','.rels'))];d=z.read('word/document.xml').decode();assert 'Arial' in z.read('word/styles.xml').decode();print('ok')" "$DATA_DIR/plan.docx" 2>&1 | tail -1)"
JZ=$(call OWN POST /ai/ask "{\"scope\":\"pm\",\"pid\":\"$PID\",\"cmd\":\"znp\"}" | js 'd.id'); RZ=$(wait_job OWN $JZ)
chk "ЗнП: 25 строк формы" 25 "$(echo "$RZ" | js 'd.draft.blocks[0].table.rows.length')"
curl -s "${OWN[@]}" -o "$DATA_DIR/znp.docx" "$B/ai/drafts/$(echo "$RZ" | js 'd.draftId')/docx"
chk "ЗнП docx: шапка «УТВЕРЖДАЮ» и таблица" ok "$(python -c "
import zipfile,sys;d=zipfile.ZipFile(sys.argv[1]).read('word/document.xml').decode();assert 'УТВЕРЖДАЮ' in d and 'Основание для проектирования' in d and d.count('<w:tbl>')>=2;print('ok')" "$DATA_DIR/znp.docx" 2>&1 | tail -1)"

echo "== «Применить» =="
chk "партнёр не применяет чужой черновик" 404 "$(code PART POST /ai/drafts/$DID/apply '{}')"
A=$(call OWN POST /ai/drafts/$DID/apply '{}'); chk "применено: 2 изменения" 2 "$(echo "$A" | js 'd.ok')"
chk "в проекте +1 пункт" $((N0+1)) "$(call OWN GET /pm/projects/$PID | js 'd.items.length')"
chk "новый пункт — из плана" 1 "$(call OWN GET /pm/projects/$PID | js 'd.items.filter(i=>i.title==="Проверить комплект ИРД (mock)").length')"
chk "повторно — 409" 409 "$(code OWN POST /ai/drafts/$DID/apply '{}')"
JN=$(call OWN POST /ai/ask '{"scope":"pmall","cmd":"newplan","text":"ЖК на 10 000 м², ЭП, срок 3 месяца"}' | js 'd.id'); RN=$(wait_job OWN $JN)
chk "план нового проекта: project" "ep" "$(echo "$RN" | js 'd.draft.project.track')"
chk "применить → проект создан в pm" 1 "$(call OWN POST /ai/drafts/$(echo "$RN" | js 'd.draftId')/apply '{}' > /dev/null; call OWN GET /pm/projects | js 'd.filter(p=>p.name==="Тест ИИ проект (mock)").length')"
chk "черновик без плана — нечего применять" 400 "$(code OWN POST /ai/drafts/$(echo "$RZ" | js 'd.draftId')/apply '{}')"

echo "== финансы (только чтение) =="
JF=$(call PART POST /ai/ask '{"scope":"fin","cmd":"receivables"}' | js 'd.id'); chk "партнёр: дебиторка" done "$(wait_job PART $JF | js 'd.status')"
JM=$(call OWN POST /ai/ask '{"scope":"pmall","cmd":"ask","text":"__nojson__ что горит"}' | js 'd.id'); RM=$(wait_job OWN $JM)
chk "ответ не JSON → разбор markdown" "h/ul/table" "$(echo "$RM" | js 'd.draft.blocks.slice(0,3).map(b=>Object.keys(b)[0]).join("/")')"

echo "== очередь =="
call OWN PUT /ai/config '{"mockDelayMs":1500}' > /dev/null
J1=$(call OWN POST /ai/ask '{"scope":"pmall","cmd":"fireall"}' | js 'd.id')
J2J=$(call PART POST /ai/ask '{"scope":"pmall","cmd":"fireall"}'); J2=$(echo "$J2J" | js 'd.id')
chk "второй запрос ждёт в очереди" "queued/1" "$(echo "$J2J" | js 'd.status+"/"+d.position')"
chk "повтор того же пользователя, пока ждёт — 429" 429 "$(code PART POST /ai/ask '{"scope":"pmall","cmd":"fireall"}')"
chk "статус: один выполняется" "true/1" "$(call OWN GET /ai/status | js '!!d.queue.running+"/"+d.queue.queued')"
chk "первый готов" done "$(wait_job OWN $J1 | js 'd.status')"
chk "второй готов после первого" done "$(wait_job PART $J2 | js 'd.status')"
call OWN PUT /ai/config '{"maxQueue":1}' > /dev/null
J3=$(call OWN POST /ai/ask '{"scope":"pmall","cmd":"fireall"}' | js 'd.id'); J4=$(call PART POST /ai/ask '{"scope":"pmall","cmd":"fireall"}' | js 'd.id')
chk "очередь заполнена — 429" 429 "$(code OWN POST /ai/ask '{"scope":"pmall","cmd":"fireall","force":true}')"
chk "отмена задачи в очереди" "Отменено" "$(call PART DELETE /ai/jobs/$J4 | js 'd.error')"
wait_job OWN $J3 > /dev/null

echo "== таймаут и ошибки =="
call OWN PUT /ai/config '{"timeoutSec":1,"mockDelayMs":3000,"maxQueue":5}' > /dev/null
JT=$(call OWN POST /ai/ask '{"scope":"pmall","cmd":"fireall"}' | js 'd.id'); RT=$(wait_job OWN $JT)
chk "таймаут → ошибка" error "$(echo "$RT" | js 'd.status')"
chk "понятный текст таймаута" 1 "$(echo "$RT" | js '+d.error.includes("Превышено время")')"
call OWN PUT /ai/config '{"backend":"cli","cliPath":"C:/nope/claude.exe","timeoutSec":20}' > /dev/null
chk "CLI не найден: статус" false "$(call OWN GET /ai/status | js 'd.cli.found')"
JC=$(call OWN POST /ai/ask '{"scope":"pmall","cmd":"fireall"}' | js 'd.id'); RC=$(wait_job OWN $JC)
chk "CLI не найден → понятная ошибка" 1 "$(echo "$RC" | js '+d.error.includes("не найден")')"
chk "неверный путь CLI — 400" 400 "$(code OWN PUT /ai/config '{"cliPath":"C:/Windows/notepad.exe"}')"
call OWN PUT /ai/config '{"backend":"api"}' > /dev/null
JA=$(call OWN POST /ai/ask '{"scope":"pmall","cmd":"fireall"}' | js 'd.id')
chk "API без ключа → понятная ошибка" 1 "$(wait_job OWN $JA | js '+d.error.includes("ANTHROPIC_API_KEY")')"
chk "сервер жив" 200 "$(code OWN GET /ai/status)"
chk "журнал: ошибки записаны" 1 "$(call OWN GET /ai/log | js '+(d.week.errors>=3)')"

kill $SP 2>/dev/null; wait $SP 2>/dev/null

echo "== два сайта (DEV_SPLIT): финансовая панель закрыта на ERP =="
export DEV_SPLIT=1 PORT=3196 ERP_PORT=3197; rm -f "$DATA_DIR/server.lock"
node server.js > "$DATA_DIR/server2.log" 2>&1 & SP=$!
for i in $(seq 1 20); do curl -s -o /dev/null http://127.0.0.1:3197/api/status && break; sleep 0.5; done
B=http://127.0.0.1:3197/api
chk "ERP: места панели — только проекты" "pm,pmall" "$(call OWN GET /ai/commands | js 'd.scopes.join(",")')"
chk "ERP: финансовый запрос — 403" 403 "$(code OWN POST /ai/ask '{"scope":"fin","cmd":"receivables"}')"
kill $SP 2>/dev/null; wait $SP 2>/dev/null

echo; echo "Итого: $pass ✓, $fail ✗"; [ $fail -eq 0 ]
