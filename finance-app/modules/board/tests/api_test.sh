#!/bin/bash
# Проверка API и прав модуля board (v2): все роли × три режима «Кто правит», настройки и удаление, операции с версиями и надгробиями,
# комментарии (ветки, «решено», счётчик), присутствие с курсорами, файлы (тип, размер, обход пути), шаблон ЭП, два сайта.
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
OPS='{"ops":[{"op":"upsert","item":{"id":"probe","type":"sticky","x":1,"y":1,"props":{"text":"проба"}}}]}'

echo "== подготовка: проекты pm (ЭП — ПМ dev-pm, РП — ГИП dev-gip) =="
P=$(call OWN POST /pm/projects '{"track":"ep","name":"ЭП для доски","pmId":"dev-pm"}' | js 'd.project.id')
RP=$(call OWN POST /pm/projects '{"track":"rp","name":"РП для доски","gipId":"dev-gip"}' | js 'd.project.id')
chk "проекты созданы" "200/200" "$(code OWN GET /pm/projects/$P)/$(code OWN GET /pm/projects/$RP)"

echo "== доступ для всех: видят, создают, правят по умолчанию =="
chk "коллекция boards через общий API закрыта" 404 "$(code OWN GET /boards)"
FB=$(call STAFF POST /board/boards '{"title":"Доска стажёра","members":["dev-secretary","dev-staff","нет-такого"]}' | js 'd.board.id')
chk "staff создал свободную доску; участники — только реальные, без себя" "dev-secretary" "$(call STAFF GET /board/boards/$FB | js 'd.board.members.join(",")')"
PB=$(call STAFF POST /board/boards "{\"title\":\"Доска ЭП\",\"pmProjectId\":\"$P\",\"template\":\"ep\"}")
PBID=$(echo "$PB" | js 'd.board.id'); chk "staff создал доску проекта ЭП из шаблона: 13 объектов, rev 1" "13/1" "$(echo "$PB" | js 'd.items.length+"/"+d.rev')"
chk "доска РП из шаблона ЭП: шаблон не применяется" 0 "$(call ACC POST /board/boards "{\"title\":\"РП доска\",\"pmProjectId\":\"$RP\",\"template\":\"ep\"}" | js 'd.items.length')"
chk "режим по умолчанию — все" all "$(echo "$PB" | js 'd.board.editMode')"
for R in LEAD GIP PMR SEC ACC PART OWN STAFF; do chk "$R видит доску проекта и правит (режим все)" "200/true" "$(code $R GET /board/boards/$PBID)/$(call $R GET /board/boards/$PBID | js 'd.board.canEdit')"; done
chk "gip видит чужую свободную доску" 200 "$(code GIP GET /board/boards/$FB)"
chk "lead операции на доске проекта — 200" 200 "$(code LEAD POST /board/boards/$PBID/ops "$OPS")"
chk "gip операции на чужой свободной доске — 200" 200 "$(code GIP POST /board/boards/$FB/ops "$OPS")"
chk "список: все доски всем (staff видит 3)" 3 "$(call LEAD GET /board/boards | js 'd.boards.length')"
chk "список: «мои» у staff — 2 (владелец)" 2 "$(call STAFF GET '/board/boards?mine=1' | js 'd.boards.length')"
chk "список: «мои» у secretary — 1 (участник)" 1 "$(call SEC GET '/board/boards?mine=1' | js 'd.boards.length')"
chk "список по проекту и поиск" "1/1" "$(call LEAD GET "/board/boards?pid=$P" | js 'd.boards.length')/$(call LEAD GET '/board/boards?q=%D1%81%D1%82%D0%B0%D0%B6' | js 'd.boards.length')"
chk "by-project всем: доски и canCreate" "1/true" "$(call STAFF GET /board/by-project/$P | js 'd.boards.length+"/"+d.canCreate')"
chk "by-project отдаёт стадию проекта" "rp" "$(call LEAD GET /board/by-project/$RP | js 'd.project.track')"

echo "== кто меняет настройки, кто удаляет =="
chk "lead (не владелец, не ПМ) настройки 403" 403 "$(code LEAD PUT /board/boards/$PBID '{"title":"x"}')"
chk "gip (ПМ другого проекта) настройки 403" 403 "$(code GIP PUT /board/boards/$PBID '{"title":"x"}')"
chk "ПМ проекта меняет настройки доски проекта" 200 "$(code PMR PUT /board/boards/$PBID '{"title":"ЭП · доска"}')"
chk "владелец доски (staff) меняет настройки" 200 "$(code STAFF PUT /board/boards/$PBID '{"members":["dev-secretary"]}')"
chk "partner меняет настройки любой доски" 200 "$(code PART PUT /board/boards/$FB '{"title":"Доска стажёра ✎"}')"
chk "участник (secretary) настройки 403" 403 "$(code SEC PUT /board/boards/$FB '{"title":"x"}')"
chk "gip (ПМ проекта РП) удалить чужую доску РП — 403 (не владелец, не owner/partner)" 403 "$(code GIP DELETE /board/boards/$(call GIP GET "/board/boards?pid=$RP" | js 'd.boards[0].id'))"
chk "lead удалить 403" 403 "$(code LEAD DELETE /board/boards/$PBID)"

echo "== режим «участники доски» =="
chk "владелец доски включил режим участников" members "$(call STAFF PUT /board/boards/$PBID '{"editMode":"members"}' | js 'd.board.editMode')"
for R in LEAD GIP ACC; do chk "$R (не участник) — только просмотр, ops 403" "false/403" "$(call $R GET /board/boards/$PBID | js 'd.board.canEdit')/$(code $R POST /board/boards/$PBID/ops "$OPS")"; done
chk "secretary (участник) правит" "true/200" "$(call SEC GET /board/boards/$PBID | js 'd.board.canEdit')/$(code SEC POST /board/boards/$PBID/ops "$OPS")"
chk "ПМ проекта правит при любом режиме" 200 "$(code PMR POST /board/boards/$PBID/ops "$OPS")"
chk "владелец доски правит" 200 "$(code STAFF POST /board/boards/$PBID/ops "$OPS")"
chk "owner/partner правят" "200/200" "$(code OWN POST /board/boards/$PBID/ops "$OPS")/$(code PART POST /board/boards/$PBID/ops "$OPS")"
chk "lead: загрузка файла тоже закрыта" 403 "$(code LEAD POST /board/boards/$PBID/files '{"name":"a.png","type":"image/png","data":"iVBORw0KGgo="}')"
chk "sync сообщает режим и право" "members/false" "$(call LEAD GET "/board/boards/$PBID/sync?since=0" | js 'd.editMode+"/"+d.canEdit')"

echo "== режим «только руководители проекта» =="
chk "ПМ проекта включил режим руководителей" managers "$(call PMR PUT /board/boards/$PBID '{"editMode":"managers"}' | js 'd.board.editMode')"
for R in LEAD GIP ACC SEC; do chk "$R — только просмотр, ops 403" "false/403" "$(call $R GET /board/boards/$PBID | js 'd.board.canEdit')/$(code $R POST /board/boards/$PBID/ops "$OPS")"; done
chk "ПМ проекта, владелец доски, owner, partner — правят" "200/200/200/200" "$(code PMR POST /board/boards/$PBID/ops "$OPS")/$(code STAFF POST /board/boards/$PBID/ops "$OPS")/$(code OWN POST /board/boards/$PBID/ops "$OPS")/$(code PART POST /board/boards/$PBID/ops "$OPS")"
chk "текст ошибки говорит про руководителей" "Эту доску правят только руководители проекта" "$(call LEAD POST /board/boards/$PBID/ops "$OPS" | js 'd.error')"
chk "неизвестный режим → все" all "$(call PMR PUT /board/boards/$PBID '{"editMode":"zzz"}' | js 'd.board.editMode')"
call PMR PUT /board/boards/$PBID '{"editMode":"all"}' > /dev/null

echo "== объекты: операции, версии, надгробия, стрелки =="
OPS1="{\"client\":\"a\",\"ops\":[{\"op\":\"upsert\",\"item\":{\"id\":\"s1\",\"type\":\"sticky\",\"x\":10,\"y\":20,\"w\":200,\"h\":200,\"z\":3,\"props\":{\"text\":\"Привет\",\"color\":\"nope\",\"size\":99}}},{\"op\":\"upsert\",\"item\":{\"id\":\"t1\",\"type\":\"text\",\"x\":0,\"y\":0,\"props\":{\"text\":\"$(printf 'x%.0s' $(seq 1 60))\"}}},{\"op\":\"upsert\",\"item\":{\"id\":\"a1\",\"type\":\"arrow\",\"x\":0,\"y\":0,\"props\":{\"from\":\"s1\",\"to\":\"t1\",\"x2\":5,\"y2\":5}}},{\"op\":\"upsert\",\"item\":{\"id\":\"bad\",\"type\":\"nope\"}},{\"op\":\"upsert\",\"item\":{\"id\":\"i1\",\"type\":\"image\",\"props\":{\"src\":\"aaaa-bbbb.png\"}}}]}"
R1=$(call PMR POST /board/boards/$PBID/ops "$OPS1")
chk "4 операции применены (мусорный тип отброшен)" 4 "$(echo "$R1" | js 'd.items.length')"
chk "цвет и размер приведены к допустимым" "yellow/16" "$(echo "$R1" | js '(()=>{const s=d.items.find(i=>i.id==="s1");return s.props.color+"/"+s.props.size})()')"
chk "ссылка на несуществующий файл очищена" "" "$(echo "$R1" | js 'd.items.find(i=>i.id==="i1").props.src')"
chk "у объекта есть имя последнего редактора" true "$(echo "$R1" | js 'd.items[0].updatedByName.length>0')"
REV=$(echo "$R1" | js 'd.rev')
R2=$(call OWN POST /board/boards/$PBID/ops '{"client":"b","ops":[{"op":"upsert","item":{"id":"s1","type":"sticky","x":50,"y":60,"props":{"text":"Победил последний","color":"green"}}}]}')
chk "второй пользователь перезаписал s1: ver 2, rev +1" "2/$((REV+1))" "$(echo "$R2" | js 'd.items[0].ver+"/"+d.rev')"
chk "последний выигрывает по объекту" "Победил последний" "$(call OWN GET /board/boards/$PBID | js 'd.items.find(i=>i.id==="s1").props.text')"
chk "sync с предыдущей ревизии: только s1" "s1" "$(call LEAD GET "/board/boards/$PBID/sync?since=$REV" | js 'd.items.map(i=>i.id).join()')"
chk "sync с текущей ревизии: пусто" 0 "$(call LEAD GET "/board/boards/$PBID/sync?since=$((REV+1))" | js 'd.items.length')"
R3=$(call PMR POST /board/boards/$PBID/ops '{"ops":[{"op":"delete","id":"t1"}]}')
chk "удаление: надгробие + стрелка a1 отвязана" "true/" "$(echo "$R3" | js '(()=>{const t=d.items.find(i=>i.id==="t1");const a=d.items.find(i=>i.id==="a1");return t.deleted+"/"+a.props.to})()')"
chk "sync после удаления: надгробие и стрелка" "a1:ok,t1:del" "$(call LEAD GET "/board/boards/$PBID/sync?since=$((REV+1))" | js 'd.items.map(i=>i.id+":"+(i.deleted?"del":"ok")).sort().join()')"
chk "в карточке удалённых нет" true "$(call OWN GET /board/boards/$PBID | js '!d.items.some(i=>i.id==="t1")')"
chk "стрелка на несуществующий объект теряет ссылку" "" "$(call PMR POST /board/boards/$PBID/ops '{"ops":[{"op":"upsert","item":{"id":"a8","type":"arrow","x":1,"y":1,"props":{"from":"нет","to":"s1","x2":9,"y2":9}}}]}' | js 'd.items[0].props.from')"
chk "шаблон ЭП на свободную доску (12 объектов без заголовка)" 12 "$(call STAFF POST /board/boards/$FB/template '{"template":"ep"}' | js 'd.added')"

echo "== комментарии =="
C1=$(call LEAD POST /board/boards/$PBID/comments '{"itemId":"s1","text":"Уточнить размеры"}')
CID=$(echo "$C1" | js 'd.comment.id'); chk "lead (даже без права правки) комментирует объект" "s1/Уточнить размеры" "$(echo "$C1" | js 'd.comment.itemId+"/"+d.comment.text')"
chk "у комментария есть автор" true "$(echo "$C1" | js 'd.comment.userName.length>0')"
C2=$(call STAFF POST /board/boards/$PBID/comments "{\"parentId\":\"$CID\",\"text\":\"Сделано, 12×8\"}")
chk "ответ в ветке наследует объект" "s1" "$(echo "$C2" | js 'd.comment.itemId')"
C3=$(call SEC POST /board/boards/$PBID/comments '{"x":300,"y":400,"text":"Здесь будет лестница"}')
chk "комментарий к месту" "300/400" "$(echo "$C3" | js 'd.comment.x+"/"+d.comment.y')"
chk "пустой комментарий 400" 400 "$(code SEC POST /board/boards/$PBID/comments '{"text":"   "}')"
chk "ответ в несуществующую ветку 404" 404 "$(code SEC POST /board/boards/$PBID/comments '{"parentId":"нет","text":"x"}')"
chk "в карточке доски 3 комментария" 3 "$(call OWN GET /board/boards/$PBID | js 'd.comments.length')"
chk "нерешённых веток в списке досок — 2" 2 "$(call OWN GET /board/boards | js 'd.boards.find(b=>b.id==="'$PBID'").openComments')"
chk "решить может любой" true "$(call GIP PUT /board/boards/$PBID/comments/$CID '{"resolved":true}' | js 'd.comment.resolved')"
chk "решённая ветка не считается" 1 "$(call OWN GET /board/boards | js 'd.boards.find(b=>b.id==="'$PBID'").openComments')"
chk "«решено» у ответа — 400" 400 "$(code GIP PUT /board/boards/$PBID/comments/$(echo "$C2" | js 'd.comment.id') '{"resolved":true}')"
chk "чужой текст менять нельзя" 403 "$(code STAFF PUT /board/boards/$PBID/comments/$CID '{"text":"x"}')"
chk "автор меняет текст" "Уточнить размеры окон" "$(call LEAD PUT /board/boards/$PBID/comments/$CID '{"text":"Уточнить размеры окон"}' | js 'd.comment.text')"
chk "sync отдаёт изменённые комментарии" true "$(call OWN GET "/board/boards/$PBID/sync?since=0" | js 'd.comments.length>=3 && d.openComments===1')"
chk "чужой удалить нельзя (не руководитель)" 403 "$(code GIP DELETE /board/boards/$PBID/comments/$CID)"
chk "руководитель доски удаляет ветку с ответами" 2 "$(call PMR DELETE /board/boards/$PBID/comments/$CID | js 'd.deleted.length')"
chk "удалённые — надгробия в sync" true "$(call OWN GET "/board/boards/$PBID/sync?since=0" | js 'd.comments.filter(c=>c.deleted).length===2')"
chk "автор удаляет своё" 1 "$(call SEC DELETE /board/boards/$PBID/comments/$(echo "$C3" | js 'd.comment.id') | js 'd.deleted.length')"

echo "== присутствие: курсоры и выделения =="
call PMR GET "/board/boards/$PBID/sync?since=99&client=x1&cx=120&cy=340&sel=s1,a1" > /dev/null; call PMR GET "/board/boards/$PBID/sync?since=99&client=x2" > /dev/null
PRES=$(call OWN GET "/board/boards/$PBID/sync?since=99&client=y&cx=5&cy=6")
chk "курсор и выделение ПМ видны другому" "120/340/s1,a1" "$(echo "$PRES" | js '(()=>{const p=d.presence.find(x=>x.client==="x1");return p.x+"/"+p.y+"/"+p.sel.join()})()')"
chk "вторая вкладка без курсора" true "$(echo "$PRES" | js '(()=>{const p=d.presence.find(x=>x.client==="x2");return p && p.x===undefined})()')"
chk "свой курсор тоже в списке (клиент отфильтрует)" true "$(echo "$PRES" | js 'd.presence.some(x=>x.client==="y" && x.x===5)')"
chk "в списке досок — людей на доске ≥ 2" true "$(call OWN GET /board/boards | js 'd.boards.find(b=>b.id==="'$PBID'").online>=2')"
chk "пустое выделение сбрасывается" 0 "$(call PMR GET "/board/boards/$PBID/sync?since=99&client=x1&sel=-" > /dev/null; call OWN GET "/board/boards/$PBID/sync?since=99&client=y" | js 'd.presence.find(x=>x.client==="x1").sel.length')"

echo "== файлы =="
node -e "const fs=require('fs');const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');fs.writeFileSync('$DATA_DIR/png.json',JSON.stringify({name:'пиксель.png',type:'image/png',data:png.toString('base64')}));fs.writeFileSync('$DATA_DIR/pdf.json',JSON.stringify({name:'a.pdf',type:'application/pdf',data:Buffer.from('%PDF-1.4 fake').toString('base64')}));fs.writeFileSync('$DATA_DIR/exe.json',JSON.stringify({name:'x.exe',type:'application/x-msdownload',data:'AAAA'}));fs.writeFileSync('$DATA_DIR/fake.json',JSON.stringify({name:'f.png',type:'image/png',data:Buffer.from('not png').toString('base64')}));fs.writeFileSync('$DATA_DIR/big.json',JSON.stringify({name:'big.png',type:'image/png',data:Buffer.alloc(21*1024*1024,1).toString('base64')}))"
F=$(curl -s "${LEAD[@]}" "${H[@]}" -X POST $B/board/boards/$PBID/files -d @"$DATA_DIR/png.json"); KEY=$(echo "$F" | js 'd.key')
chk "PNG загружен (режим все — lead может), ключ вида xxx-yyy.png" true "$(echo "$F" | js '/^[a-z0-9]+-[a-z0-9]+\.png$/.test(d.key) && d.size===70')"
chk "файл отдаётся с типом image/png" "200 image/png" "$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "${STAFF[@]}" $B/board/boards/$PBID/files/$KEY)"
chk "exe отклонён / подделка PNG / больше 20 МБ" "400/400/400" "$(curl -s -o /dev/null -w '%{http_code}' "${PMR[@]}" "${H[@]}" -X POST $B/board/boards/$PBID/files -d @"$DATA_DIR/exe.json")/$(curl -s -o /dev/null -w '%{http_code}' "${PMR[@]}" "${H[@]}" -X POST $B/board/boards/$PBID/files -d @"$DATA_DIR/fake.json")/$(curl -s -o /dev/null -w '%{http_code}' "${PMR[@]}" "${H[@]}" -X POST $B/board/boards/$PBID/files -d @"$DATA_DIR/big.json")"
chk "PDF с сигнатурой принят" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${PMR[@]}" "${H[@]}" -X POST $B/board/boards/$PBID/files -d @"$DATA_DIR/pdf.json")"
chk "обход пути 404" 404 "$(curl -s -o /dev/null -w '%{http_code}' "${PMR[@]}" "$B/board/boards/$PBID/files/..%2F..%2Fdb.sqlite")"
chk "картинка с существующим ключом сохраняет ссылку" "$KEY" "$(call PMR POST /board/boards/$PBID/ops "{\"ops\":[{\"op\":\"upsert\",\"item\":{\"id\":\"i2\",\"type\":\"image\",\"x\":0,\"y\":0,\"w\":100,\"h\":100,\"props\":{\"src\":\"$KEY\",\"name\":\"пиксель.png\"}}}]}" | js 'd.items[0].props.src')"
chk "используемый файл удалить нельзя" 400 "$(code PMR DELETE /board/boards/$PBID/files/$KEY)"
chk "lead (не руководитель доски) удалить файл не может" 403 "$(code LEAD DELETE /board/boards/$PBID/files/$KEY)"
call PMR POST /board/boards/$PBID/ops '{"ops":[{"op":"delete","id":"i2"}]}' > /dev/null
chk "неиспользуемый файл удаляет руководитель доски" 200 "$(code PMR DELETE /board/boards/$PBID/files/$KEY)"

echo "== импорт из Miro (POST /api/board/import) =="
chk "staff импорт 403" 403 "$(code STAFF POST /board/import '{"title":"x","items":[]}')"
chk "gip импорт 403" 403 "$(code GIP POST /board/import '{"title":"x","items":[]}')"
IMP1=$(call PART POST /board/import "{\"title\":\"Маяк (Miro)\",\"pmProjectId\":\"$P\",\"sourceUrl\":\"https://miro.com/app/board/uXjVHKj4TjI=/\",\"items\":[{\"id\":\"m1\",\"type\":\"frame\",\"x\":0,\"y\":0,\"w\":1000,\"h\":800,\"z\":-1,\"props\":{\"title\":\"Концепт фасада\",\"color\":\"gray\"}},{\"id\":\"m2\",\"type\":\"sticky\",\"x\":100,\"y\":100,\"w\":300,\"h\":200,\"props\":{\"text\":\"Мудборд\",\"color\":\"orange\",\"size\":24}},{\"id\":\"m3\",\"type\":\"arrow\",\"x\":0,\"y\":0,\"props\":{\"from\":\"m2\",\"to\":\"нет\",\"x2\":900,\"y2\":500}}]}")
IMPID=$(echo "$IMP1" | js 'd.boardId'); chk "partner: первая часть создала доску, 3 объекта, источник Miro" "3/3/miro" "$(echo "$IMP1" | js 'd.added+"/"+d.total+"/"+d.board.source.kind')"
node -e "const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');require('fs').writeFileSync('$DATA_DIR/imp2.json',JSON.stringify({boardId:'$IMPID',items:[{id:'m4',type:'image',x:500,y:100,w:200,h:150,props:{name:'img'},file:{name:'miro.png',type:'image/png',data:png.toString('base64')}},{id:'m5',type:'nope'}],done:true}))"
IMP2=$(curl -s "${PART[@]}" "${H[@]}" -X POST $B/board/import -d @"$DATA_DIR/imp2.json")
chk "вторая часть: картинка с файлом добавлена, мусор отброшен, всего 4" "1/4" "$(echo "$IMP2" | js 'd.added+"/"+d.total')"
IMPB=$(call OWN GET /board/boards/$IMPID)
IMGOK=$(echo "$IMPB" | js '(()=>{const i=d.items.find(x=>x.id==="m4");return /\.png$/.test(i.props.src)})()'); NFILES=$(ls "$DATA_DIR/board-files/$IMPID" 2>/dev/null | wc -l | tr -d ' ')
chk "картинка получила ключ файла, файл лежит на диске" "true/1" "$IMGOK/$NFILES"
chk "стрелка на отсутствующий объект после done — свободная, from сохранён" "m2/" "$(echo "$IMPB" | js '(()=>{const a=d.items.find(x=>x.id==="m3");return a.props.from+"/"+a.props.to})()')"
chk "доска видна в списке с проектом и источником" true "$(call STAFF GET "/board/boards?pid=$P" | js '(()=>{const b=d.boards.find(x=>x.id==="'$IMPID'");return !!b && b.source.url.includes("miro.com")})()')"
chk "продолжение в чужую доску без прав — 404 на несуществующую" 404 "$(code PART POST /board/import '{"boardId":"нет","items":[]}')"
call PART DELETE /board/boards/$IMPID > /dev/null

echo "== удаление досок =="
chk "участник удалить свободную 403" 403 "$(code SEC DELETE /board/boards/$FB)"
chk "ПМ проекта (не владелец доски) удалить 403" 403 "$(code PMR DELETE /board/boards/$PBID)"
chk "partner удалил доску проекта" 200 "$(code PART DELETE /board/boards/$PBID)"
chk "доска пропала, файлы удалены" "404/no" "$(code OWN GET /board/boards/$PBID)/$([ -d "$DATA_DIR/board-files/$PBID" ] && echo yes || echo no)"
chk "владелец удалил свободную" 200 "$(code STAFF DELETE /board/boards/$FB)"
kill $SP 2>/dev/null; wait $SP 2>/dev/null

echo "== два сайта (DEV_SPLIT=1): board на ERP-порту работает, финансы закрыты =="
export DEV_SPLIT=1; export ERP_PORT=3195
node server.js > "$DATA_DIR/server2.log" 2>&1 & SP=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null http://127.0.0.1:$ERP_PORT/api/status && break; sleep 0.5; done
E=http://127.0.0.1:$ERP_PORT
chk "ERP: /api/board/boards 200 для staff" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b 'devrole=staff' $E/api/board/boards)"
chk "ERP: /api/employees закрыт" 404 "$(curl -s -o /dev/null -w '%{http_code}' -b 'devrole=owner' $E/api/employees)"
chk "ERP: скрипты модуля отдаются" "200/200" "$(curl -s -o /dev/null -w '%{http_code}' $E/m/board/ui.js)/$(curl -s -o /dev/null -w '%{http_code}' $E/m/board/domain.js)"
kill $SP 2>/dev/null; wait $SP 2>/dev/null

echo; echo "Итого: ✓ $pass, ✗ $fail"; [ $fail -eq 0 ]
