#!/bin/bash
# Проверка модуля analytics: права по всем ролям, сайты (на ERP — 404), суммы на маленьком наборе, работа без hr/crm.
# Запуск из finance-app:  bash modules/analytics/tests/api_test.sh
# Сервер — порты 3194 (DEV) и 3194/3195 (DEV_SPLIT), база — пустая data-dev/analytics-test (в .gitignore). Нужны node 22.5+ и curl.
set -u
APP="$(cd "$(dirname "$0")/../../.." && pwd)"; cd "$APP"
export DATA_DIR="data-dev/analytics-test"; export DEV_USER=owner
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "  ✓ $1 ($3)"; pass=$((pass+1)); else echo "  ✗ $1: ожидалось $2, получено $3"; fail=$((fail+1)); fi; }
H=(-H 'X-Requested-With: fetch')
code() { curl -s -o /dev/null -w '%{http_code}' -b "devrole=$1" "${H[@]}" "$2"; }
js() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{let d;try{d=JSON.parse(s)}catch(e){console.log('<не JSON: '+s.slice(0,80)+'>');return}try{console.log($1)}catch(e){console.log('<'+e.message+'>')}})"; }
start() { rm -f "$DATA_DIR/server.lock"; node server.js > "$DATA_DIR/server.log" 2>&1 & SP=$!; for i in $(seq 1 20); do curl -s -o /dev/null http://127.0.0.1:$1/api/status && break; sleep 0.5; done; }

rm -rf "$DATA_DIR"; mkdir -p "$DATA_DIR"
echo "== права (один порт, DEV) =="
export PORT=3194; start 3194; B=http://127.0.0.1:3194/api
for R in staff gip pm lead secretary accountant; do chk "$R → 403" 403 "$(code $R $B/analytics/overview)"; done
chk "owner 200" 200 "$(code owner $B/analytics/overview)"
chk "partner 200" 200 "$(code partner $B/analytics/overview)"
chk "пустая база: панель собирается без ошибок" "{}" "$(curl -s -b devrole=owner "${H[@]}" $B/analytics/overview | js 'JSON.stringify(d.errors)')"
chk "пустая база: блоки" "true/true" "$(curl -s -b devrole=owner "${H[@]}" $B/analytics/overview | js '!!d.money+"/"+Array.isArray(d.signals)')"
chk "только чтение: POST — 404" 404 "$(curl -s -o /dev/null -w '%{http_code}' -b devrole=owner "${H[@]}" -X POST $B/analytics/overview)"
chk "неизвестный раздел — 404" 404 "$(code owner $B/analytics/nope)"
kill $SP 2>/dev/null; wait $SP 2>/dev/null

echo "== два сайта (DEV_SPLIT): только «Финансы» =="
export DEV_SPLIT=1 PORT=3194 ERP_PORT=3195; start 3195
chk "«Финансы»: панель 200" 200 "$(code owner http://127.0.0.1:3194/api/analytics/overview)"
chk "ERP: панель 404" 404 "$(code owner http://127.0.0.1:3195/api/analytics/overview)"
chk "«Финансы»: скрипт модуля подключён" 1 "$(curl -s http://127.0.0.1:3194/index.html | grep -c '/m/analytics/ui.js')"
chk "ERP: скрипта модуля нет" 0 "$(curl -s http://127.0.0.1:3195/index.html | grep -c '/m/analytics/ui.js')"
chk "порт ERP для ссылок" 3195 "$(curl -s -b devrole=owner "${H[@]}" http://127.0.0.1:3194/api/analytics/overview | js 'd.erpPort')"
chk "«Финансы»: секретарю 403" 403 "$(code secretary http://127.0.0.1:3194/api/analytics/overview)"
kill $SP 2>/dev/null; wait $SP 2>/dev/null
unset DEV_SPLIT ERP_PORT

echo "== суммы на маленьком наборе и работа без hr/crm =="
OUT=$(node modules/analytics/tests/overview_test.js 2>&1); RC=$?; echo "$OUT" | grep '  ✗'
chk "overview_test: код выхода" 0 "$RC"
chk "overview_test: все проверки" "32 ✓, 0 ✗" "$(echo "$OUT" | grep -o '[0-9]* ✓, [0-9]* ✗')"

echo; echo "Итого: $pass ✓, $fail ✗"; [ $fail -eq 0 ]
