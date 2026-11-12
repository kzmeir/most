#!/bin/bash
# Проверка API и прав модуля hr по ролям: owner, partner, accountant, secretary, gip, lead (АР / ОВ), staff (с привязкой к сотруднику и без).
# Запуск из finance-app:  bash modules/hr/tests/api_test.sh
# Сервер поднимается на порту 3198 с DEV_USER (роль — cookie devrole, раздел — devsection, сотрудник — devemployee), база data-dev/hr-test (в .gitignore).
# Тела запросов передаются файлом (-d @file): в Git Bash кириллица в аргументах curl портится.
set -u
APP="$(cd "$(dirname "$0")/../../.." && pwd)"; cd "$APP"
export DATA_DIR="data-dev/hr-test"; export PORT=3198; export DEV_USER=owner
rm -rf "$DATA_DIR"; mkdir -p "$DATA_DIR"
node server.js > "$DATA_DIR/server.log" 2>&1 & SP=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null http://127.0.0.1:$PORT/api/status && break; sleep 0.5; done
B=http://127.0.0.1:$PORT/api; BODY="$DATA_DIR/body.json"
H=(-H 'Content-Type: application/json' -H 'X-Requested-With: fetch')
OWN=(-b 'devrole=owner'); PART=(-b 'devrole=partner'); ACC=(-b 'devrole=accountant'); SEC=(-b 'devrole=secretary'); GIP=(-b 'devrole=gip'); PMR=(-b 'devrole=pm')
LEADAR=(-b 'devrole=lead; devsection=%D0%90%D0%A0'); LEADOV=(-b 'devrole=lead; devsection=%D0%9E%D0%92'); STAFF=(-b 'devrole=staff')
call() { local -n R=$1; local m=$2 p=$3 body=${4:-}; if [ -n "$body" ]; then printf '%s' "$body" > "$BODY"; curl -s "${R[@]}" "${H[@]}" -X "$m" "$B$p" -d @"$BODY"; else curl -s "${R[@]}" "${H[@]}" -X "$m" "$B$p"; fi; }
code() { local -n R=$1; local m=$2 p=$3 body=${4:-}; if [ -n "$body" ]; then printf '%s' "$body" > "$BODY"; curl -s -o /dev/null -w '%{http_code}' "${R[@]}" "${H[@]}" -X "$m" "$B$p" -d @"$BODY"; else curl -s -o /dev/null -w '%{http_code}' "${R[@]}" "${H[@]}" -X "$m" "$B$p"; fi; }
js() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{let d;try{d=JSON.parse(s)}catch(e){console.log('<не JSON: '+s.slice(0,80)+'>');return}try{console.log($1)}catch(e){console.log('<'+e.message+'>')}})"; }
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "  ✓ $1 ($3)"; pass=$((pass+1)); else echo "  ✗ $1: ожидалось $2, получено $3"; fail=$((fail+1)); fi; }
T=$(date +%F); W=$(node -e "console.log(require('./modules/hr/domain.js').isoWeek('$T'))"); W1=$(node -e "console.log(require('./modules/hr/domain.js').addWeeks('$W',-1))"); W2=$(node -e "console.log(require('./modules/hr/domain.js').addWeeks('$W',-2))")
echo "Сегодня $T, неделя $W (проверяем $W1 и $W2)"

echo "== подготовка: сотрудники (ядро), проект pm =="
A=$(call OWN POST /employees '{"name":"Тестов Архитектор Иванович","company":"MOST Project","salary":900000,"status":"active","hired":"2025-01-10"}' | js 'd.id')
BB=$(call OWN POST /employees '{"name":"Инженерова Ольга Петровна","company":"MOST Project","salary":600000,"status":"active"}' | js 'd.id')
C=$(call OWN POST /employees '{"name":"Новичков Стажёр","company":"MOST Architects","salary":150000,"status":"active"}' | js 'd.id')
chk "созданы 3 сотрудника" 3 "$(call OWN GET /employees | js 'd.length')"
P=$(call OWN POST /pm/projects "{\"track\":\"rp\",\"name\":\"Тест РП для табеля\",\"start\":\"$T\",\"gipId\":\"dev-gip\"}" | js 'd.project.id')
chk "проект pm создан (79 пунктов со сроками)" 79 "$(call OWN GET /pm/projects/$P | js 'd.items.filter(i=>i.due).length')"
STA=(-b "devrole=staff; devemployee=$A"); STB=(-b "devrole=staff; devemployee=$BB"); LEADA=(-b "devrole=lead; devsection=%D0%90%D0%A0; devemployee=$A")

echo "== доступ и связь с сотрудником =="
chk "staff без привязки: me.linked=false" false "$(call STAFF GET /hr/me | js 'd.linked')"
chk "staff без привязки: табель 400" 400 "$(code STAFF GET /hr/timesheet)"
chk "staff с devemployee: linked" true "$(call STA GET /hr/me | js 'd.linked')"
chk "коллекция hrTeams через общий API закрыта" 404 "$(code OWN GET /hrTeams)"
chk "owner: money=true, accept=true" "true/true" "$(call OWN GET /hr/me | js 'd.money+"/"+d.accept')"
chk "secretary: money=false, all=true" "false/true" "$(call SEC GET /hr/me | js 'd.money+"/"+d.all')"

echo "== команды =="
chk "staff создать команду 403" 403 "$(code STAFF POST /hr/teams '{"name":"x"}')"
chk "lead создать команду 403" 403 "$(code LEADAR POST /hr/teams '{"name":"x"}')"
TA=$(call OWN POST /hr/teams "{\"name\":\"АР\",\"section\":\"АР\",\"members\":[\"$A\"]}" | js 'd.id')  # руководитель — по разделу пользователя (у всех dev-lead один id)
chk "owner создал команду АР с 1 участником" 1 "$(call OWN GET /hr/teams/$TA | js 'd.members.length')"
chk "имя сохранилось в UTF-8" "АР" "$(call OWN GET /hr/teams/$TA | js 'd.name')"
chk "дубликат названия 409" 409 "$(code OWN POST /hr/teams '{"name":"ар"}')"
TO=$(call PART POST /hr/teams "{\"name\":\"ОВ\",\"section\":\"ОВ\",\"members\":[\"$BB\"]}" | js 'd.id')
chk "partner создал команду ОВ" 200 "$(code OWN GET /hr/teams/$TO)"
chk "lead АР меняет состав своей команды" 2 "$(call LEADAR PUT /hr/teams/$TA "{\"members\":[\"$A\",\"$C\"],\"name\":\"Взлом\"}" | js 'd.members.length')"
chk "lead не переименовал команду (поле отброшено)" "АР" "$(call OWN GET /hr/teams/$TA | js 'd.name')"
chk "lead ОВ чужую команду 403" 403 "$(code LEADOV PUT /hr/teams/$TA '{"note":"x"}')"
chk "lead АР убрал участника" 1 "$(call LEADAR DELETE /hr/teams/$TA/members/$C | js 'd.members.length')"
chk "без команды: 1 (стажёр)" 1 "$(call OWN GET /hr/teams | js 'd.unassigned.length')"
TX=$(call OWN POST /hr/teams '{"name":"Временная"}' | js 'd.id')
chk "lead удалить команду 403" 403 "$(code LEADAR DELETE /hr/teams/$TX)"
chk "partner удалил команду" 200 "$(code PART DELETE /hr/teams/$TX)"

echo "== карточка сотрудника и деньги =="
chk "secretary: сотрудники без окладов" "3/false" "$(call SEC GET /hr/employees | js 'd.employees.length+"/"+("salary" in d.employees[0])')"
chk "accountant: оклад виден" 900000 "$(call ACC GET /hr/employees | js 'd.employees.find(e=>e.id==="'$A'").salary')"
chk "staff править карточку 403" 403 "$(code STAFF PUT /hr/employees/$A '{"position":"x"}')"
chk "owner: должность и норма 30 ч" "ГАП/30" "$(call OWN PUT /hr/employees/$A '{"position":"ГАП","hoursPerWeek":30}' | js 'd.employee.position+"/"+d.employee.hoursPerWeek')"
chk "accountant: 13-я зарплата включена" true "$(call ACC PUT /hr/employees/$A '{"bonus13":true,"position":"Взлом"}' | js 'd.employee.bonus13')"
chk "accountant не поменял должность" "ГАП" "$(call OWN GET /hr/employees/$A | js 'd.employee.position')"
chk "карточка staff: денег нет" undefined "$(call STA GET /hr/employees/$A | js 'String(d.rate)')"
chk "карточка owner: ставка > 0" true "$(call OWN GET /hr/employees/$A | js 'd.rate.rate>0')"
chk "связь через hrPeople.userId: staff → стажёр" true "$(call OWN PUT /hr/employees/$C '{"userId":"dev-staff"}' > /dev/null; call STAFF GET /hr/me | js 'd.employeeId==="'$C'"')"

echo "== табель: сотрудник =="
L1="[{\"kind\":\"project\",\"pid\":\"$P\",\"section\":\"АР\",\"hours\":[8,8,8,8,6,0,0],\"note\":\"планы\"},{\"kind\":\"office\",\"hours\":[0,0,0,0,2,0,0]},{\"kind\":\"absence\",\"hours\":[0,0,0,0,0,0,0]}]"
chk "staff A: черновик недели $W1 (2 строки, 40 ч)" "draft/2/40" "$(call STA PUT /hr/timesheet "{\"week\":\"$W1\",\"lines\":$L1}" | js 'd.ts.status+"/"+d.ts.lines.length+"/"+d.ts.totals.total')"
chk "больше 24 ч в день — 400" 400 "$(code STA PUT /hr/timesheet "{\"week\":\"$W1\",\"lines\":[{\"kind\":\"office\",\"hours\":[25,0,0,0,0,0,0]}]}")"
chk "проект не выбран — 400" 400 "$(code STA PUT /hr/timesheet "{\"week\":\"$W1\",\"lines\":[{\"kind\":\"project\",\"pid\":\"\",\"hours\":[1,0,0,0,0,0,0]}]}")"
chk "неизвестный проект — 400" 400 "$(code STA PUT /hr/timesheet "{\"week\":\"$W1\",\"lines\":[{\"kind\":\"project\",\"pid\":\"nope\",\"hours\":[1,0,0,0,0,0,0]}]}")"
chk "норма недели при 30 ч/нед" 30 "$(call STA GET "/hr/timesheet?week=$W1" | js 'd.norm')"
chk "проект ★ мой (раздел команды АР)" true "$(call STA GET "/hr/timesheet?week=$W1" | js 'd.projects.find(p=>p.id==="'$P'").mine')"
chk "прошлая неделя доступна для копирования" 2 "$(call STA GET "/hr/timesheet?week=$W" | js 'd.prev.lines.length')"
chk "staff A сдал" submitted "$(call STA POST /hr/timesheet/submit "{\"week\":\"$W1\"}" | js 'd.ts.status')"
chk "повторная сдача 403" 403 "$(code STA POST /hr/timesheet/submit "{\"week\":\"$W1\"}")"
chk "staff принять сам 403" 403 "$(code STA POST /hr/timesheet/accept "{\"week\":\"$W1\"}")"
chk "staff A правит сданный → снова черновик" draft "$(call STA PUT /hr/timesheet "{\"week\":\"$W1\",\"lines\":$L1}" | js 'd.ts.status')"
call STA POST /hr/timesheet/submit "{\"week\":\"$W1\"}" > /dev/null
chk "staff A чужой табель 403" 403 "$(code STA GET "/hr/timesheet?employeeId=$BB&week=$W1")"
chk "staff A: пустой табель сдать нельзя (400)" 400 "$(code STA POST /hr/timesheet/submit "{\"week\":\"$W2\"}")"

echo "== табель: руководитель раздела =="
chk "lead ОВ табель A (чужая команда) 403" 403 "$(code LEADOV GET "/hr/timesheet?employeeId=$A&week=$W1")"
chk "lead ОВ принять A 403" 403 "$(code LEADOV POST /hr/timesheet/accept "{\"employeeId\":\"$A\",\"week\":\"$W1\"}")"
chk "lead АР видит табель A и может принять" true "$(call LEADAR GET "/hr/timesheet?employeeId=$A&week=$W1" | js 'd.can.accept && d.can.reject')"
chk "lead АР (сам = A) свой табель принять не может" false "$(call LEADA GET "/hr/timesheet?employeeId=$A&week=$W1" | js 'd.can.accept')"
chk "lead АР: ждёт решения 1 (счётчик)" 1 "$(call LEADAR GET /hr/badges | js 'd.hrreview')"
chk "lead АР вернул с причиной" rejected "$(call LEADAR POST /hr/timesheet/reject "{\"employeeId\":\"$A\",\"week\":\"$W1\",\"note\":\"Уточните проект\"}" | js 'd.ts.status')"
chk "staff A видит причину" "Уточните проект" "$(call STA GET "/hr/timesheet?week=$W1" | js 'd.ts.rejectNote')"
chk "staff A поправил → черновик, сдал снова" submitted "$(call STA PUT /hr/timesheet "{\"week\":\"$W1\",\"lines\":$L1}" > /dev/null; call STA POST /hr/timesheet/submit "{\"week\":\"$W1\"}" | js 'd.ts.status')"
chk "lead АР принял" accepted "$(call LEADAR POST /hr/timesheet/accept "{\"employeeId\":\"$A\",\"week\":\"$W1\"}" | js 'd.ts.status')"
chk "staff A правит принятый 403" 403 "$(code STA PUT /hr/timesheet "{\"week\":\"$W1\",\"lines\":$L1}")"
chk "lead вернул в работу → черновик" draft "$(call LEADAR POST /hr/timesheet/reopen "{\"employeeId\":\"$A\",\"week\":\"$W1\"}" | js 'd.ts.status')"
chk "lead АР заполнил и принял за сотрудника" accepted "$(call LEADAR PUT /hr/timesheet "{\"employeeId\":\"$A\",\"week\":\"$W1\",\"lines\":$L1}" > /dev/null; call LEADAR POST /hr/timesheet/accept "{\"employeeId\":\"$A\",\"week\":\"$W1\"}" | js 'd.ts.status')"
chk "accountant принять не может (только смотрит)" 403 "$(code ACC POST /hr/timesheet/accept "{\"employeeId\":\"$BB\",\"week\":\"$W1\"}")"
L2="[{\"kind\":\"project\",\"pid\":\"$P\",\"section\":\"ОВ\",\"hours\":[8,8,8,8,8,0,0]}]"
chk "staff B сдал неделю $W1" submitted "$(call STB POST /hr/timesheet/submit "{\"week\":\"$W1\",\"lines\":$L2}" | js 'd.ts.status')"
chk "owner принял B" accepted "$(call OWN POST /hr/timesheet/accept "{\"employeeId\":\"$BB\",\"week\":\"$W1\"}" | js 'd.ts.status')"
chk "staff B черновик недели $W2" draft "$(call STB PUT /hr/timesheet "{\"week\":\"$W2\",\"lines\":$L2}" | js 'd.ts.status')"

echo "== списки табелей, счётчики =="
chk "staff A: список — только он" 1 "$(call STA GET "/hr/timesheets?week=$W1" | js 'd.rows.length')"
chk "lead АР: список — команда АР" "1/$A" "$(call LEADAR GET "/hr/timesheets?week=$W1" | js 'd.rows.length+"/"+d.rows[0].id')"
chk "owner: список — все 3" 3 "$(call OWN GET "/hr/timesheets?week=$W1" | js 'd.rows.length')"
chk "owner: принято 2 за $W1" 2 "$(call OWN GET "/hr/timesheets?week=$W1" | js 'd.stat.accepted')"
chk "staff A: не сданных недель ≥ 3 (счётчик)" true "$(call STA GET /hr/badges | js 'd.hrtime>=3')"
chk "lead АР: ждёт решения 0" 0 "$(call LEADAR GET /hr/badges | js 'd.hrreview')"

echo "== загрузка: факт и план =="
chk "staff A: загрузка — только свои строки" 1 "$(call STA GET '/hr/load?n=4' | js 'd.rows.length')"
chk "owner: загрузка — 3 человека, проект 118 ч (с черновиками)" "3/118" "$(call OWN GET '/hr/load?n=4' | js 'd.rows.length+"/"+d.projects.find(p=>p.pid==="'$P'").total')"
chk "gip видит загрузку всех" true "$(call GIP GET '/hr/load?n=4' | js 'd.all')"
chk "staff план 403" 403 "$(code STAFF GET /hr/plan)"
chk "gip план: разделы есть, АР с командой из 1 чел." "1" "$(call GIP GET /hr/plan | js 'd.sections.find(s=>s.section==="АР").people.length')"
chk "план АР: часы > 0 в горизонте" true "$(call GIP GET /hr/plan | js 'd.sections.find(s=>s.section==="АР").total>0')"
chk "план: ёмкость АР = 30 ч/нед (норма A)" true "$(call GIP GET /hr/plan | js 'd.sections.find(s=>s.section==="АР").capacity.some(c=>c===30)')"

echo "== деньги: ставки и себестоимость =="
chk "secretary ставки 403" 403 "$(code SEC GET /hr/rates)"
chk "staff ставки 403" 403 "$(code STA GET /hr/rates)"
chk "gip себестоимость 403" 403 "$(code GIP GET /hr/cost)"
RATE=$(call ACC GET /hr/rates | js '(()=>{const r=d.rows.find(x=>x.id==="'$A'");return Math.round(r.monthCost/r.normHours)===r.rate && r.bonus13===true && r.rate>0})()')
chk "accountant: ставка = затраты / норма, 13-я учтена" true "$RATE"
chk "ставка вручную заменяет расчётную" 5000 "$(call ACC PUT /hr/employees/$A '{"rateOverride":5000}' > /dev/null; call ACC GET /hr/rates | js 'd.rows.find(x=>x.id==="'$A'").rate')"
COST=$(call OWN GET "/hr/cost?from=all");
chk "owner: себестоимость проекта = 38 ч × 5000 + 40 ч × ставка B" true "$(echo "$COST" | js '(()=>{const r=d.rows.find(x=>x.pid==="'$P'"); return r.hours===78 && r.cost>38*5000 && r.bySection["АР"].hours===38 && r.bySection["ОВ"].hours===40})()')"
chk "черновики не считаются без draft=1" 78 "$(echo "$COST" | js 'd.rows.find(x=>x.pid==="'$P'").hours')"
chk "с черновиками: 118 ч" 118 "$(call OWN GET "/hr/cost?from=all&draft=1" | js 'd.rows.find(x=>x.pid==="'$P'").hours')"
chk "детали проекта: 2 сотрудника, по месяцам" true "$(call OWN GET "/hr/cost/$P?from=all" | js 'd.byEmployee.length===2 && Object.keys(d.byMonth).length>=1 && d.project.name==="Тест РП для табеля"')"
chk "владелец сбросил ручную ставку" 0 "$(call OWN PUT /hr/employees/$A '{"rateOverride":0}' | js 'd.employee.rateOverride')"

echo "== импорт команд =="
chk "staff импорт 403" 403 "$(code STAFF POST /hr/import '{"teams":[]}')"
IMP=$(call OWN POST /hr/import "{\"teams\":[{\"name\":\"ГП\",\"section\":\"ГП\",\"members\":[{\"employeeId\":\"$C\",\"position\":\"Инженер ГП\"},{\"employeeId\":\"нет\",\"name\":\"Неизвестный\"}]},{\"name\":\"ар\",\"members\":[\"$BB\"]}]}")
chk "импорт: создана ГП, дополнена АР, 1 пропущен" "1/1/1" "$(echo "$IMP" | js 'd.created.length+"/"+d.updated.length+"/"+d.skipped.length')"
chk "должность из импорта" "Инженер ГП" "$(call OWN GET /hr/employees/$C | js 'd.employee.position')"
chk "АР дополнена участником B" 2 "$(call OWN GET /hr/teams/$TA | js 'd.members.length')"

kill $SP 2>/dev/null; wait $SP 2>/dev/null

echo "== два сайта (DEV_SPLIT=1): финансовые API на ERP-порту закрыты, hr работает =="
export DEV_SPLIT=1; export ERP_PORT=3197
node server.js > "$DATA_DIR/server2.log" 2>&1 & SP=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null http://127.0.0.1:$ERP_PORT/api/status && break; sleep 0.5; done
E=http://127.0.0.1:$ERP_PORT/api
chk "ERP: /api/hr/me 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b 'devrole=owner' $E/hr/me)"
chk "ERP: /api/employees закрыт (404)" 404 "$(curl -s -o /dev/null -w '%{http_code}' -b 'devrole=owner' $E/employees)"
chk "ERP: /api/payroll закрыт (404)" 404 "$(curl -s -o /dev/null -w '%{http_code}' -b 'devrole=owner' $E/payroll)"
chk "ERP: ставки владельцу отдаются (сервер считает сам)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b 'devrole=owner' $E/hr/rates)"
chk "ERP: скрипт модуля отдаётся" 200 "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$ERP_PORT/m/hr/ui.js)"
kill $SP 2>/dev/null; wait $SP 2>/dev/null

echo; echo "Итого: ✓ $pass, ✗ $fail"; [ $fail -eq 0 ]
