#!/bin/bash
# Проверка API и прав модуля board: доски проекта и свободные, операции с версиями и надгробиями, sync/presence, файлы (тип, размер, обход пути), шаблон ЭП, два сайта.
# Запуск из finance-app:  bash modules/board/tests/api_test.sh
# Сервер поднимается на порту 3196 с DEV_USER (роль — cookie devrole), база data-dev/board-test (в .gitignore). Тела запросов — файлом (-d @file): кириллица в аргументах curl портится.
set -u
APP="$(cd "$(dirname "$0")/../../.." && pwd)"; cd "$APP"
export DATA_DIR="data-dev/board-test"; export PORT=3196; export DEV_USER=owner
rm -rf "$DATA_DIR"; mkdir -p "$DATA_DIR"
node server.js > "$DATA_DIR/server.log" 2>&1 & SP=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null http://127.0.0.1:$PORT/api/status && break; sleep 0.5; done
B=http://127.0.0.1:$PORT/api; BODY="$DATA_DIR/body.json"
H=(-H 'Content-Type: application/json' -H 'X-Requested-With: fetch')
OWN=(-b 'devrole=owner'); PART=(-b 'devrole=partner'); ACC=(-b 'devrole=accountant'); SEC=(-b 'devrole=secretary'); GIP=(-b 'devrole=gip'); PMR=(-b 'devrole=pm'); LEAD=(-b 'devrole=lead; devsection=%D0%9E%D0%92'); STAFF=(-b 'devrole=staff')
call() { local -n R=$1; local m=$2 p=$3 body=${4:-}; if [ -n "$body" ]; then printf '%s' "$body" > "$BODY"; curl -s "${R[@]}" "${H[@]}" -X "$m" "$B$p" -d @"$BODY"; else curl -s "${R[@]}" "${H[@]}" -X "$m" "$B$p"; fi; }
code() { local -n R=$1; local m=$2 p=$3 body=${4:-}; if [ -n "$body" ]; then printf '%s' "$body" > "$BODY"; curl -s -o /dev/null -w '%{http_code}' "${R[@]}" "${H[@]}" -X "$m" "$B$p" -d @"$BODY"; else curl -s -o /dev/null -w '%{http_code}' "${R[@]}" "${H[@]}" -X "$m" "$B$p"; fi; }
js() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{let d;try{d=JSON.parse(s)}catch(e){console.log('<не JSON: '+s.slice(0,80)+'>');return}try{console.log($1)}catch(e){console.log('<'+e.message+'>')}})"; }
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "  ✓ $1 ($3)"; pass=$((pass+1)); else echo "  ✗ $1: ожидалось $2, получено $3"; fail=$((fail+1)); fi; }

echo "== подготовка: проект pm (ГИП — dev-gip) =="
P=$(call OWN POST /pm/projects '{"track":"ep","name":"ЭП для доски","pmId":"dev-pm"}' | js 'd.project.id')
chk "проект создан" 200 "$(code OWN GET /pm/projects/$P)"

echo "== создание досок и доступ =="
chk "коллекция boards через общий API закрыта" 404 "$(code OWN GET /boards)"
FB=$(call STAFF POST /board/boards '{"title":"Моя свободная","members":["dev-secretary","dev-staff","нет-такого"]}' | js 'd.board.id')
chk "staff создал свободную доску" 200 "$(code STAFF GET /board/boards/$FB)"
chk "участники: секретарь (себя и чужих не добавляет)" "dev-secretary" "$(call STAFF GET /board/boards/$FB | js 'd.board.members.join(",")')"
chk "staff доску проекта создать не может" 403 "$(code STAFF POST /board/boards "{\"title\":\"x\",\"pmProjectId\":\"$P\"}")"
chk "lead (не ПМ проекта) доску проекта создать не может" 403 "$(code LEAD POST /board/boards "{\"title\":\"x\",\"pmProjectId\":\"$P\"}")"
PB=$(call PMR POST /board/boards "{\"title\":\"Доска ЭП\",\"pmProjectId\":\"$P\",\"template\":\"ep\"}")
PBID=$(echo "$PB" | js 'd.board.id'); chk "ПМ проекта создал доску из шаблона ЭП: 13 объектов, rev 1" "13/1" "$(echo "$PB" | js 'd.items.length+"/"+d.rev')"
chk "в шаблоне 6 рамок с заголовками" 6 "$(echo "$PB" | js 'd.items.filter(i=>i.type==="frame"&&i.props.title).length')"
chk "заголовок в UTF-8" "ТЗ и исходные" "$(echo "$PB" | js 'd.items.find(i=>i.type==="frame").props.title')"
chk "lead открывает доску проекта (просмотр)" "200/false" "$(code LEAD GET /board/boards/$PBID)/$(call LEAD GET /board/boards/$PBID | js 'd.board.canEdit')"
chk "accountant видит доску проекта без правки" false "$(call ACC GET /board/boards/$PBID | js 'd.board.canEdit')"
chk "gip (не этого проекта) — просмотр" false "$(call GIP GET /board/boards/$PBID | js 'd.board.canEdit')"
chk "владелец (руководитель) — правит и управляет" "true/true" "$(call OWN GET /board/boards/$PBID | js 'd.board.canEdit+"/"+d.board.canManage')"
chk "staff доску проекта не видит" 403 "$(code STAFF GET /board/boards/$PBID)"
chk "secretary (участник) видит свободную доску" 200 "$(code SEC GET /board/boards/$FB)"
chk "gip чужую свободную доску не видит" 403 "$(code GIP GET /board/boards/$FB)"
chk "список staff: только своя" "1" "$(call STAFF GET /board/boards | js 'd.boards.length')"
chk "список owner: только доска проекта (свободные — владельцу и участникам)" 1 "$(call OWN GET /board/boards | js 'd.boards.length')"
chk "список по проекту" 1 "$(call OWN GET "/board/boards?pid=$P" | js 'd.boards.length')"
chk "поиск по названию (staff)" "Моя свободная" "$(call STAFF GET '/board/boards?q=%D1%81%D0%B2%D0%BE%D0%B1%D0%BE%D0%B4' | js 'd.boards.map(b=>b.title).join()')"

RP=$(call OWN POST /pm/projects '{"track":"rp","name":"РП для доски","gipId":"dev-gip"}' | js 'd.project.id')
chk "доска РП из шаблона ЭП: шаблон не применяется (0 объектов)" 0 "$(call GIP POST /board/boards "{\"title\":\"РП доска\",\"pmProjectId\":\"$RP\",\"template\":\"ep\"}" | js 'd.items.length')"
chk "by-project отдаёт стадию проекта" "rp" "$(call GIP GET /board/by-project/$RP | js 'd.project.track')"

echo "== настройки =="
chk "ПМ проекта переименовал доску" "ЭП · доска" "$(call PMR PUT /board/boards/$PBID '{"title":"ЭП · доска"}' | js 'd.board.title')"
chk "lead настройки 403" 403 "$(code LEAD PUT /board/boards/$PBID '{"title":"x"}')"
chk "участник свободной доски настройки не меняет" 403 "$(code SEC PUT /board/boards/$FB '{"title":"x"}')"
chk "владелец свободной доски меняет" 200 "$(code STAFF PUT /board/boards/$FB '{"title":"Моя свободная 2","members":["dev-secretary","dev-gip"]}')"
chk "партнёр чужую свободную доску не видит и не меняет" 403 "$(code PART PUT /board/boards/$FB '{"title":"Свободная"}')"
chk "gip после добавления видит свободную" 200 "$(code GIP GET /board/boards/$FB)"

echo "== объекты: операции, версии, надгробия =="
OPS1="{\"client\":\"a\",\"ops\":[{\"op\":\"upsert\",\"item\":{\"id\":\"s1\",\"type\":\"sticky\",\"x\":10,\"y\":20,\"w\":200,\"h\":200,\"z\":3,\"props\":{\"text\":\"Привет\",\"color\":\"nope\",\"size\":99}}},{\"op\":\"upsert\",\"item\":{\"id\":\"t1\",\"type\":\"text\",\"x\":0,\"y\":0,\"props\":{\"text\":\"$(printf 'x%.0s' $(seq 1 60))\"}}},{\"op\":\"upsert\",\"item\":{\"id\":\"a1\",\"type\":\"arrow\",\"x\":0,\"y\":0,\"props\":{\"from\":\"s1\",\"to\":\"t1\",\"x2\":5,\"y2\":5}}},{\"op\":\"upsert\",\"item\":{\"id\":\"bad\",\"type\":\"nope\"}},{\"op\":\"upsert\",\"item\":{\"id\":\"i1\",\"type\":\"image\",\"props\":{\"src\":\"aaaa-bbbb.png\"}}}]}"
R1=$(call PMR POST /board/boards/$PBID/ops "$OPS1")
chk "ПМ применил 4 операции (мусорный тип отброшен), rev 2" "4/2" "$(echo "$R1" | js 'd.items.length+"/"+d.rev')"
chk "цвет и размер приведены к допустимым" "yellow/16" "$(echo "$R1" | js '(()=>{const s=d.items.find(i=>i.id==="s1");return s.props.color+"/"+s.props.size})()')"
chk "ссылка на несуществующий файл очищена" "" "$(echo "$R1" | js 'd.items.find(i=>i.id==="i1").props.src')"
chk "стрелка привязана к обоим объектам" "s1/t1" "$(echo "$R1" | js '(()=>{const a=d.items.find(i=>i.id==="a1");return a.props.from+"/"+a.props.to})()')"
R2=$(call OWN POST /board/boards/$PBID/ops '{"client":"b","ops":[{"op":"upsert","item":{"id":"s1","type":"sticky","x":50,"y":60,"props":{"text":"Победил последний","color":"green"}}}]}')
chk "второй пользователь перезаписал s1: ver 2, rev 3" "2/3" "$(echo "$R2" | js 'd.items[0].ver+"/"+d.rev')"
chk "последний выигрывает по объекту" "Победил последний" "$(call OWN GET /board/boards/$PBID | js 'd.items.find(i=>i.id==="s1").props.text')"
chk "sync с ревизии 2: только s1" "s1" "$(call LEAD GET "/board/boards/$PBID/sync?since=2" | js 'd.items.map(i=>i.id).join()')"
chk "sync с текущей ревизии: пусто" 0 "$(call LEAD GET "/board/boards/$PBID/sync?since=3" | js 'd.items.length')"
chk "sync с нуля: все 17 (13 шаблон + 4)" 17 "$(call LEAD GET "/board/boards/$PBID/sync?since=0" | js 'd.items.length')"
chk "удаление → надгробие с rev 4 (+ отвязанная стрелка a1)" "true/4/a1" "$(call PMR POST /board/boards/$PBID/ops '{"ops":[{"op":"delete","id":"t1"}]}' | js '(()=>{const t=d.items.find(i=>i.id==="t1");const a=d.items.find(i=>i.id==="a1");return t.deleted+"/"+d.rev+"/"+(a&&a.props.to===""?"a1":"-")})()')"
chk "sync после удаления отдаёт надгробие и изменённую стрелку" "a1:ok,t1:del" "$(call LEAD GET "/board/boards/$PBID/sync?since=3" | js 'd.items.map(i=>i.id+":"+(i.deleted?"del":"ok")).sort().join()')"
chk "в карточке доски удалённых нет" 16 "$(call OWN GET /board/boards/$PBID | js 'd.items.length')"
chk "повторное удаление — без изменений" 0 "$(call PMR POST /board/boards/$PBID/ops '{"ops":[{"op":"delete","id":"t1"}]}' | js 'd.items.length')"
chk "восстановление удалённого upsert-ом (ver 3)" "3" "$(call PMR POST /board/boards/$PBID/ops '{"ops":[{"op":"upsert","item":{"id":"t1","type":"text","x":1,"y":1,"props":{"text":"вернулся"}}}]}' | js 'd.items[0].deleted===false?d.items[0].ver+"":"x"')"
R3=$(call PMR POST /board/boards/$PBID/ops '{"ops":[{"op":"upsert","item":{"id":"s9","type":"sticky","x":1000,"y":1000,"w":200,"h":200,"props":{"text":"с9"}}},{"op":"upsert","item":{"id":"a9","type":"arrow","x":0,"y":0,"props":{"from":"s9","to":"t1","x2":0,"y2":0}}}]}')
R4=$(call PMR POST /board/boards/$PBID/ops '{"ops":[{"op":"delete","id":"s9"}]}')
chk "удаление объекта отвязывает стрелку: from пуст, конец в точке привязки" "true" "$(echo "$R4" | js '(()=>{const a=d.items.find(i=>i.id==="a9");return !!a && a.props.from==="" && a.props.to==="t1" && a.x>=1000 && a.x<=1200 && a.y>=1000 && a.y<=1200 && a.ver===2})()')"
chk "надгробие s9 и стрелка в одной ревизии" "true" "$(echo "$R4" | js '(()=>{const s=d.items.find(i=>i.id==="s9");const a=d.items.find(i=>i.id==="a9");return s.deleted===true && a.rev===s.rev})()')"
chk "стрелка на несуществующий объект теряет привязку" "" "$(call PMR POST /board/boards/$PBID/ops '{"ops":[{"op":"upsert","item":{"id":"a8","type":"arrow","x":1,"y":1,"props":{"from":"нет","to":"t1","x2":9,"y2":9}}}]}' | js 'd.items[0].props.from')"
chk "lead (просмотр) операции 403" 403 "$(code LEAD POST /board/boards/$PBID/ops '{"ops":[]}')"
chk "secretary операции на доске проекта 403" 403 "$(code SEC POST /board/boards/$PBID/ops '{"ops":[]}')"
chk "secretary (участник) правит свободную доску" 200 "$(code SEC POST /board/boards/$FB/ops '{"ops":[{"op":"upsert","item":{"id":"f1","type":"frame","x":0,"y":0,"props":{"title":"Раздел"}}}]}')"
chk "staff чужую доску проекта 403" 403 "$(code STAFF POST /board/boards/$PBID/ops '{"ops":[]}')"
chk "шаблон ЭП добавляется на свободную доску (без заголовка — 12)" 12 "$(call STAFF POST /board/boards/$FB/template '{"template":"ep"}' | js 'd.added')"
chk "неизвестный шаблон 400" 400 "$(code STAFF POST /board/boards/$FB/template '{"template":"zzz"}')"

echo "== кто на доске =="
call PMR GET "/board/boards/$PBID/sync?since=0&client=x1" > /dev/null; call PMR GET "/board/boards/$PBID/sync?since=0&client=x2" > /dev/null
chk "один пользователь с нескольких вкладок = один человек, окон ≥ 2" true "$(call PMR GET "/board/boards/$PBID/sync?since=99&client=x1" | js '(()=>{const p=d.presence.filter(x=>x.userId==="dev-pm");return p.length===1 && p[0].n>=2})()')"
chk "второй пользователь виден первому" true "$(call OWN GET "/board/boards/$PBID/sync?since=99&client=y" > /dev/null; call PMR GET "/board/boards/$PBID/sync?since=99&client=x1" | js 'd.presence.some(p=>p.userId==="dev-owner") && d.presence.some(p=>p.userId==="dev-pm")')"
chk "в списке досок — сколько на доске (≥ 2)" true "$(call OWN GET /board/boards | js 'd.boards.find(b=>b.id==="'$PBID'").online>=2')"

echo "== файлы =="
node -e "const fs=require('fs');const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');fs.writeFileSync('$DATA_DIR/png.json',JSON.stringify({name:'пиксель.png',type:'image/png',data:png.toString('base64')}));fs.writeFileSync('$DATA_DIR/pdf.json',JSON.stringify({name:'a.pdf',type:'application/pdf',data:Buffer.from('%PDF-1.4 fake').toString('base64')}));fs.writeFileSync('$DATA_DIR/exe.json',JSON.stringify({name:'x.exe',type:'application/x-msdownload',data:'AAAA'}));fs.writeFileSync('$DATA_DIR/fake.json',JSON.stringify({name:'f.png',type:'image/png',data:Buffer.from('not png').toString('base64')}));fs.writeFileSync('$DATA_DIR/big.json',JSON.stringify({name:'big.png',type:'image/png',data:Buffer.alloc(21*1024*1024,1).toString('base64')}))"
F=$(curl -s "${PMR[@]}" "${H[@]}" -X POST $B/board/boards/$PBID/files -d @"$DATA_DIR/png.json"); KEY=$(echo "$F" | js 'd.key')
chk "PNG загружен ПМом, ключ вида xxx-yyy.png" true "$(echo "$F" | js '/^[a-z0-9]+-[a-z0-9]+\.png$/.test(d.key) && d.size===70')"
chk "файл лежит в DATA_DIR/board-files/<доска>/" 1 "$(ls "$DATA_DIR/board-files/$PBID" | wc -l | tr -d ' ')"
chk "файл отдаётся с типом image/png" "200 image/png" "$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "${LEAD[@]}" $B/board/boards/$PBID/files/$KEY)"
chk "staff файл доски проекта не получает" 403 "$(code STAFF GET /board/boards/$PBID/files/$KEY)"
chk "lead загрузить файл не может" 403 "$(curl -s -o /dev/null -w '%{http_code}' "${LEAD[@]}" "${H[@]}" -X POST $B/board/boards/$PBID/files -d @"$DATA_DIR/png.json")"
chk "exe отклонён" 400 "$(curl -s -o /dev/null -w '%{http_code}' "${PMR[@]}" "${H[@]}" -X POST $B/board/boards/$PBID/files -d @"$DATA_DIR/exe.json")"
chk "подделка PNG отклонена" 400 "$(curl -s -o /dev/null -w '%{http_code}' "${PMR[@]}" "${H[@]}" -X POST $B/board/boards/$PBID/files -d @"$DATA_DIR/fake.json")"
chk "PDF с сигнатурой принят" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${PMR[@]}" "${H[@]}" -X POST $B/board/boards/$PBID/files -d @"$DATA_DIR/pdf.json")"
chk "файл больше 20 МБ отклонён" 400 "$(curl -s -o /dev/null -w '%{http_code}' "${PMR[@]}" "${H[@]}" -X POST $B/board/boards/$PBID/files -d @"$DATA_DIR/big.json")"
chk "обход пути 404" 404 "$(curl -s -o /dev/null -w '%{http_code}' "${PMR[@]}" "$B/board/boards/$PBID/files/..%2F..%2Fdb.sqlite")"
chk "картинка с существующим ключом сохраняет ссылку" "$KEY" "$(call PMR POST /board/boards/$PBID/ops "{\"ops\":[{\"op\":\"upsert\",\"item\":{\"id\":\"i2\",\"type\":\"image\",\"x\":0,\"y\":0,\"w\":100,\"h\":100,\"props\":{\"src\":\"$KEY\",\"name\":\"пиксель.png\"}}}]}" | js 'd.items[0].props.src')"
chk "используемый файл удалить нельзя" 400 "$(code PMR DELETE /board/boards/$PBID/files/$KEY)"
chk "lead удалить файл не может" 403 "$(code LEAD DELETE /board/boards/$PBID/files/$KEY)"
call PMR POST /board/boards/$PBID/ops '{"ops":[{"op":"delete","id":"i2"}]}' > /dev/null
chk "неиспользуемый файл удаляет ПМ" 200 "$(code PMR DELETE /board/boards/$PBID/files/$KEY)"

echo "== доски проекта для карточки pm =="
chk "ПМ проекта: by-project, может создавать" "1/true" "$(call PMR GET /board/by-project/$P | js 'd.boards.length+"/"+d.canCreate')"
chk "lead: by-project без права создавать" "1/false" "$(call LEAD GET /board/by-project/$P | js 'd.boards.length+"/"+d.canCreate')"
chk "staff: by-project 403" 403 "$(code STAFF GET /board/by-project/$P)"
chk "несуществующий проект 404" 404 "$(code OWN GET /board/by-project/nope)"

echo "== удаление =="
chk "lead удалить доску 403" 403 "$(code LEAD DELETE /board/boards/$PBID)"
chk "участник удалить свободную 403" 403 "$(code SEC DELETE /board/boards/$FB)"
chk "ПМ проекта удалил доску" 200 "$(code PMR DELETE /board/boards/$PBID)"
chk "доска пропала" 404 "$(code OWN GET /board/boards/$PBID)"
chk "папка файлов удалена" "no" "$([ -d "$DATA_DIR/board-files/$PBID" ] && echo yes || echo no)"
chk "владелец удалил свободную" 200 "$(code STAFF DELETE /board/boards/$FB)"
kill $SP 2>/dev/null; wait $SP 2>/dev/null

echo "== два сайта (DEV_SPLIT=1): board на ERP-порту работает, финансы закрыты =="
export DEV_SPLIT=1; export ERP_PORT=3195
node server.js > "$DATA_DIR/server2.log" 2>&1 & SP=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null http://127.0.0.1:$ERP_PORT/api/status && break; sleep 0.5; done
E=http://127.0.0.1:$ERP_PORT
chk "ERP: /api/board/boards 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b 'devrole=owner' $E/api/board/boards)"
chk "ERP: /api/employees закрыт" 404 "$(curl -s -o /dev/null -w '%{http_code}' -b 'devrole=owner' $E/api/employees)"
chk "ERP: скрипты модуля отдаются" "200/200" "$(curl -s -o /dev/null -w '%{http_code}' $E/m/board/ui.js)/$(curl -s -o /dev/null -w '%{http_code}' $E/m/board/domain.js)"
kill $SP 2>/dev/null; wait $SP 2>/dev/null

echo; echo "Итого: ✓ $pass, ✗ $fail"; [ $fail -eq 0 ]
