#!/bin/bash
# Проверка API и прав модуля mkt: роли, статусы поста, правило согласий, картинки, импорт, итоги месяца.
# Запуск из finance-app:  bash modules/mkt/tests/api_test.sh
# Нужны node 22.5+ и curl. Сервер поднимается на порту 3192 с DEV_USER (роль — из cookie devrole), база — пустая data-dev/mkt-test (в .gitignore).
# Тела запросов передаются файлом (-d @file): в Git Bash кириллица в аргументах curl портится (cp1251). Данные вымышленные.
set -u
APP="$(cd "$(dirname "$0")/../../.." && pwd)"; cd "$APP"
export DATA_DIR="data-dev/mkt-test"; export PORT=3192; export DEV_USER=owner
rm -rf "$DATA_DIR"; mkdir -p "$DATA_DIR"
node server.js > "$DATA_DIR/server.log" 2>&1 & SP=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null http://127.0.0.1:$PORT/api/status && break; sleep 0.5; done
B=http://127.0.0.1:$PORT/api; BODY="$DATA_DIR/body.json"
H=(-H 'Content-Type: application/json' -H 'X-Requested-With: fetch')
OWN=(-b 'devrole=owner'); PART=(-b 'devrole=partner'); SEC=(-b 'devrole=secretary'); PMR=(-b 'devrole=pm'); GIP=(-b 'devrole=gip'); ACC=(-b 'devrole=accountant'); STAFF=(-b 'devrole=staff')
call() { local -n R=$1; local m=$2 p=$3 body=${4:-}; if [ -n "$body" ]; then printf '%s' "$body" > "$BODY"; curl -s "${R[@]}" "${H[@]}" -X "$m" "$B$p" -d @"$BODY"; else curl -s "${R[@]}" "${H[@]}" -X "$m" "$B$p"; fi; }
code() { local -n R=$1; local m=$2 p=$3 body=${4:-}; if [ -n "$body" ]; then printf '%s' "$body" > "$BODY"; curl -s -o /dev/null -w '%{http_code}' "${R[@]}" "${H[@]}" -X "$m" "$B$p" -d @"$BODY"; else curl -s -o /dev/null -w '%{http_code}' "${R[@]}" "${H[@]}" -X "$m" "$B$p"; fi; }
js() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{let d;try{d=JSON.parse(s)}catch(e){console.log('<не JSON: '+s.slice(0,80)+'>');return}try{console.log($1)}catch(e){console.log('<'+e.message+'>')}})"; }
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "  ✓ $1 ($3)"; pass=$((pass+1)); else echo "  ✗ $1: ожидалось $2, получено $3"; fail=$((fail+1)); fi; }
T=$(node -e "console.log(new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Almaty'}))"); MON=${T:0:7}
PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
JPG='/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA=='
img() { printf '{"name":"%s","type":"%s","data":"%s"}' "$1" "$2" "$3"; }

echo "== доступ к модулю =="
chk "staff 403" 403 "$(code STAFF GET /mkt/posts)"
chk "accountant 403" 403 "$(code ACC GET /mkt/posts)"
chk "pm 403" 403 "$(code PMR GET /mkt/posts)"
chk "gip 403" 403 "$(code GIP GET /mkt/posts)"
chk "owner 200" 200 "$(code OWN GET /mkt/posts)"
chk "partner 200" 200 "$(code PART GET /mkt/posts)"
chk "secretary 200" 200 "$(code SEC GET /mkt/posts)"
chk "коллекция mktPosts через общий API закрыта" 404 "$(code OWN GET /mktPosts)"
chk "права секретаря в meta: правит, не утверждает, не импортирует" "true/false/false" "$(call SEC GET /mkt/meta | js 'd.rights.editor+"/"+d.rights.approve+"/"+d.rights.import')"
chk "рубрики и каналы" "7/instagram,instagram_en,threads,telegram,linkedin" "$(call SEC GET /mkt/meta | js 'd.rubrics.length+"/"+Object.keys(d.channels).join(",")')"

echo "== пост: создание и картинки =="
P1=$(call SEC POST /mkt/posts '{"date":"2026-10-05","channels":["instagram","threads","facebook"],"rubric":"Backstage","title":"Утро в бюро","text":"Что обсуждаем на планёрке в понедельник?","textKz":"Дүйсенбідегі жиналыста не талқылаймыз?"}')
P1ID=$(echo "$P1" | js 'd.id')
chk "черновик создан, лишний канал отброшен" "draft/instagram,threads" "$(echo "$P1" | js 'd.status+"/"+d.channels.join(",")')"
chk "кириллица сохранилась" "Утро в бюро" "$(echo "$P1" | js 'd.title')"
chk "пустой пост — 400" 400 "$(code SEC POST /mkt/posts '{"rubric":"Backstage"}')"
chk "несуществующий проект — 400" 400 "$(code SEC POST /mkt/posts '{"title":"x","pmProjectId":"nope"}')"
chk "неизвестная рубрика → «Другое»" "Другое" "$(call SEC POST /mkt/posts '{"title":"Рубрика?","rubric":"Мемы"}' | js 'd.rubric')"
chk "картинка PNG загружена" 1 "$(call SEC POST /mkt/posts/$P1ID/images "$(img slide1.png image/png $PNG)" | js 'd.images.length')"
chk "картинка JPG загружена" 2 "$(call SEC POST /mkt/posts/$P1ID/images "$(img slide2.jpg image/jpeg $JPG)" | js 'd.images.length')"
chk "PDF не принимается" 400 "$(code SEC POST /mkt/posts/$P1ID/images "$(img a.pdf application/pdf $PNG)")"
chk "подмена типа (JPG с данными PNG) — 400" 400 "$(code SEC POST /mkt/posts/$P1ID/images "$(img a.jpg image/jpeg $PNG)")"
K1=$(call SEC GET /mkt/posts/$P1ID | js 'd.images[0].key'); K2=$(call SEC GET /mkt/posts/$P1ID | js 'd.images[1].key')
chk "картинка отдаётся с типом" "image/png" "$(curl -s "${SEC[@]}" -o /dev/null -w '%{content_type}' $B/mkt/files/$K1)"
chk "плохой ключ файла — 404" 404 "$(code SEC GET /mkt/files/..%2Fdb.sqlite)"
chk "ПМ картинку не получает" 403 "$(code PMR GET /mkt/files/$K1)"
chk "порядок слайдов поменялся" "$K2,$K1" "$(call SEC PUT /mkt/posts/$P1ID "{\"images\":[\"$K2\",\"$K1\"]}" | js 'd.images.map(i=>i.key).join(",")')"

echo "== статусы: на утверждение → правка → утверждён → опубликован =="
PE=$(call SEC POST /mkt/posts '{"title":"Только заголовок"}' | js 'd.id')
chk "пустой пост не отправить на утверждение" 400 "$(code SEC POST /mkt/posts/$PE/submit)"
chk "секретарь отправил на утверждение" review "$(call SEC POST /mkt/posts/$P1ID/submit | js 'd.status')"
chk "счётчик «На утверждение» у владельца" 1 "$(call OWN GET /mkt/badges | js 'd.mktreview')"
chk "у секретаря счётчик утверждения 0" 0 "$(call SEC GET /mkt/badges | js 'd.mktreview')"
chk "экран «На утверждение»: 1 пост с картинками" "1/2" "$(call OWN GET /mkt/review | js 'd.length+"/"+d[0].images.length')"
chk "секретарь не утверждает" 403 "$(code SEC POST /mkt/posts/$P1ID/approve)"
chk "правка без комментария — 400" 400 "$(code OWN POST /mkt/posts/$P1ID/rework '{}')"
chk "правка с комментарием" "rework/Добавьте схему" "$(call OWN POST /mkt/posts/$P1ID/rework '{"comment":"Добавьте схему"}' | js 'd.status+"/"+d.comment')"
chk "счётчик плана: пост на правке" 1 "$(call SEC GET /mkt/badges | js 'd.mktplan')"
chk "секретарь поправил текст" "На планёрке — три проекта. Какой первый?" "$(call SEC PUT /mkt/posts/$P1ID '{"text":"На планёрке — три проекта. Какой первый?"}' | js 'd.text')"
call SEC POST /mkt/posts/$P1ID/submit > /dev/null
chk "партнёр утвердил" approved "$(call PART POST /mkt/posts/$P1ID/approve | js 'd.status')"
chk "утверждённый не правится" 409 "$(code SEC PUT /mkt/posts/$P1ID '{"text":"x"}')"
chk "в утверждённый картинку не добавить" 409 "$(code SEC POST /mkt/posts/$P1ID/images "$(img s.png image/png $PNG)")"
chk "повторно утвердить — 409" 409 "$(code OWN POST /mkt/posts/$P1ID/approve)"
PB=$(call SEC POST /mkt/posts/$P1ID/publish '{"url":"https://www.instagram.com/p/test123/"}')
chk "опубликован: ссылка и дата (Алматы)" "published/https://www.instagram.com/p/test123//$T" "$(echo "$PB" | js 'd.status+"/"+d.publishedUrl+"/"+d.publishedAt')"
chk "история: создан, правка, утверждён, опубликован" "create,edit,submit,rework,edit,submit,approve,publish" "$(echo "$PB" | js 'd.history.map(h=>h.action).join(",")')"
chk "секретарь не удаляет опубликованный" 403 "$(code SEC DELETE /mkt/posts/$P1ID)"
chk "неизвестное действие — 404" 404 "$(code OWN POST /mkt/posts/$P1ID/constructor)"

echo "== отклонить и вернуть в черновик =="
P2ID=$(call SEC POST /mkt/posts '{"title":"Культура","text":"Самый лучший и уникальный офис!!"}' | js 'd.id')
chk "подсказки по голосу бренда" 2 "$(call SEC GET /mkt/posts/$P2ID | js 'd.lint.length')"
call SEC POST /mkt/posts/$P2ID/submit > /dev/null
chk "отклонён" rejected "$(call OWN POST /mkt/posts/$P2ID/reject '{"comment":"не про нас"}' | js 'd.status')"
chk "в черновик" draft "$(call SEC POST /mkt/posts/$P2ID/reopen | js 'd.status')"
chk "секретарь удалил черновик" 200 "$(code SEC DELETE /mkt/posts/$P2ID)"

echo "== правило согласий заказчиков =="
PID=$(call OWN POST /pm/projects '{"track":"rp","name":"ЖК Тестовый квартал","client":"ТОО Вымышленный заказчик"}' | js 'd.project.id')
chk "проект есть в списке согласий, «не спрашивали»" "unknown" "$(call SEC GET /mkt/consents | js 'd.find(r=>r.project.id==="'$PID'").status')"
P3=$(call SEC POST /mkt/posts "{\"title\":\"Почему двор без машин\",\"text\":\"Паркинг ушёл под стилобат.\",\"textKz\":\"Паркинг стилобат астына түсті.\",\"rubric\":\"Архитектура как улика\",\"pmProjectId\":\"$PID\"}")
P3ID=$(echo "$P3" | js 'd.id')
call SEC POST /mkt/posts/$P3ID/submit > /dev/null
chk "без согласия утвердить нельзя — 409" 409 "$(code OWN POST /mkt/posts/$P3ID/approve)"
chk "понятная причина" 1 "$(call OWN POST /mkt/posts/$P3ID/approve | js '+/Нет согласия заказчика проекта «ЖК Тестовый квартал»/.test(d.error)')"
chk "в карточке — причина блокировки" 1 "$(call OWN GET /mkt/review | js '+!!d.find(p=>p.id==="'$P3ID'").block')"
chk "ПМ не отмечает согласия" 403 "$(code PMR PUT /mkt/consents/$PID '{"status":"yes"}')"
chk "неизвестный статус — 400" 400 "$(code SEC PUT /mkt/consents/$PID '{"status":"maybe"}')"
chk "нет проекта — 404" 404 "$(code SEC PUT /mkt/consents/nope '{"status":"yes"}')"
call SEC PUT /mkt/consents/$PID '{"status":"no","note":"NDA до сдачи"}' > /dev/null
chk "NDA — утвердить нельзя" 1 "$(call OWN POST /mkt/posts/$P3ID/approve | js '+/NDA/.test(d.error)')"
CS=$(call SEC PUT /mkt/consents/$PID '{"status":"yes","what":["renders","drawings","bad"],"date":"2026-09-20","note":"письмо от заказчика"}')
chk "согласие: что можно, дата, кто" "renders,drawings/2026-09-20/dev-secretary" "$(echo "$CS" | js 'd.what.join(",")+"/"+d.date+"/"+d.by')"
chk "с согласием утверждён" approved "$(call OWN POST /mkt/posts/$P3ID/approve | js 'd.status')"
call SEC PUT /mkt/consents/$PID '{"status":"unknown"}' > /dev/null
chk "согласие снято — опубликовать нельзя" 409 "$(code SEC POST /mkt/posts/$P3ID/publish '{"url":"https://t.me/x/1"}')"
call SEC PUT /mkt/consents/$PID '{"status":"yes","what":["renders"]}' > /dev/null
chk "согласие есть — опубликован" published "$(call SEC POST /mkt/posts/$P3ID/publish '{"url":"https://t.me/x/1"}' | js 'd.status')"
chk "пост без проекта утверждается без согласия" approved "$(P4=$(call SEC POST /mkt/posts '{"title":"Команда","text":"Нас 50+.","textKz":"Бізде 50+ маман."}' | js 'd.id'); call SEC POST /mkt/posts/$P4/submit > /dev/null; call OWN POST /mkt/posts/$P4/approve | js 'd.status')"
echo "== языки: казахский и русский по закону, английский для Instagram EN =="
P5=$(call SEC POST /mkt/posts '{"title":"Только русский","text":"Текст","channels":["instagram"]}' | js 'd.id'); call SEC POST /mkt/posts/$P5/submit > /dev/null
chk "без казахского не утвердить" 1 "$(call OWN POST /mkt/posts/$P5/approve | js '+/казахском/.test(d.error)')"
call SEC POST /mkt/posts/$P5/rework > /dev/null; call OWN POST /mkt/posts/$P5/rework '{"comment":"добавить казахский"}' > /dev/null
chk "с казахским и Instagram EN без английского — нельзя" 1 "$(call SEC PUT /mkt/posts/$P5 '{"textKz":"Мәтін","channels":["instagram","instagram_en"]}' > /dev/null; call SEC POST /mkt/posts/$P5/submit > /dev/null; call OWN POST /mkt/posts/$P5/approve | js '+/английском/.test(d.error)')"
call OWN POST /mkt/posts/$P5/rework '{"comment":"добавить английский"}' > /dev/null
chk "все три языка — утверждён" approved "$(call SEC PUT /mkt/posts/$P5 '{"textEn":"Text"}' > /dev/null; call SEC POST /mkt/posts/$P5/submit > /dev/null; call OWN POST /mkt/posts/$P5/approve | js 'd.status')"
chk "pm-проект не изменён модулем" "undefined" "$(call OWN GET /pm/projects/$PID | js 'd.project.consent')"

echo "== импорт черновиков от ИИ =="
IMP="{\"posts\":[{\"date\":\"2026-10-06\",\"channels\":[\"instagram\"],\"rubric\":\"The Lab\",\"title\":\"Архивное дело № 1\",\"text\":\"Задача: 1,7 га. Идея: двор на кровле.\",\"images\":[$(img a.png image/png $PNG),$(img b.jpg image/jpeg $JPG)]},{\"date\":\"2026-10-08\",\"channels\":[\"threads\",\"telegram\"],\"rubric\":\"Архитектура как улика\",\"title\":\"Улика\",\"text\":\"Почему консоль?\",\"pmProjectId\":\"$PID\"}]}"
chk "секретарь не импортирует" 403 "$(code SEC POST /mkt/import "$IMP")"
N0=$(call OWN GET /mkt/posts | js 'd.length')
chk "ошибка в одном посте — 400, ничего не создано" "400/$N0" "$(code OWN POST /mkt/import '{"posts":[{"title":"ок"},{"title":"x","pmProjectId":"nope"}]}')/$(call OWN GET /mkt/posts | js 'd.length')"
chk "плохая картинка — 400" 400 "$(code OWN POST /mkt/import "{\"posts\":[{\"title\":\"x\",\"images\":[$(img a.exe application/x-msdownload $PNG)]}]}")"
chk "пустой импорт — 400" 400 "$(code OWN POST /mkt/import '{"posts":[]}')"
IR=$(call OWN POST /mkt/import "$IMP"); chk "импортировано 2" 2 "$(echo "$IR" | js 'd.created')"
I1=$(echo "$IR" | js 'd.ids[0]')
chk "импорт: статус «на утверждении», 2 слайда по порядку, рубрика" "review/2/a.png/The Lab" "$(call OWN GET /mkt/posts/$I1 | js 'd.status+"/"+d.images.length+"/"+d.images[0].name+"/"+d.rubric')"
chk "импорт: в истории create + submit" "create:импорт,submit" "$(call OWN GET /mkt/posts/$I1 | js 'd.history.map(h=>h.action+(h.note?":"+h.note:"")).join(",")')"
chk "партнёр тоже импортирует" 1 "$(call PART POST /mkt/import '{"posts":[{"title":"От партнёра","text":"t"}]}' | js 'd.created')"

echo "== удаление с файлами =="
IK=$(call OWN GET /mkt/posts/$I1 | js 'd.images[1].key')
chk "убрать слайд из поста → файл удалён" "1/404" "$(call SEC PUT /mkt/posts/$I1 "{\"images\":[\"$(call OWN GET /mkt/posts/$I1 | js 'd.images[0].key')\"]}" | js 'd.images.length')/$(code OWN GET /mkt/files/$IK)"
IK0=$(call OWN GET /mkt/posts/$I1 | js 'd.images[0].key')
chk "секретарь не удаляет пост на утверждении" 403 "$(code SEC DELETE /mkt/posts/$I1)"
chk "владелец удалил пост и картинки" "200/404" "$(code OWN DELETE /mkt/posts/$I1)/$(code OWN GET /mkt/files/$IK0)"

echo "== итоги месяца =="
call OWN POST /crm/leads '{"client":"ТОО Альфа-Тест","object":"ЖК","source":"Instagram"}' > /dev/null
call OWN POST /crm/leads '{"client":"ТОО Бета-Тест","object":"Вилла","source":"Instagram"}' > /dev/null
call OWN POST /crm/leads '{"client":"ИП Гамма","object":"Офис","source":"Рекомендация"}' > /dev/null
MT=$(call SEC GET /mkt/metrics/$MON)
chk "лиды за месяц по источникам" "3/Instagram:2" "$(echo "$MT" | js 'd.leads.total+"/"+d.leads.bySource[0].source+":"+d.leads.bySource[0].n')"
chk "опубликовано за месяц по рубрикам" "2/Архитектура как улика:1,Backstage:1" "$(echo "$MT" | js 'd.published.total+"/"+d.published.byRubric.map(r=>r.rubric+":"+r.n).join(",")')"
chk "ручные цифры сохранены" "1520/48000/0/7" "$(call SEC PUT /mkt/metrics/$MON '{"channels":{"instagram":{"followers":"1 520","reach":48000},"threads":{"followers":-5}},"vacancyResponses":7,"note":"первый месяц"}' | js 'd.channels.instagram.followers+"/"+d.channels.instagram.reach+"/"+d.channels.threads.followers+"/"+d.vacancyResponses')"
chk "год: 12 месяцев, текущий первый с ручными цифрами" "12/$MON/7" "$(call OWN GET /mkt/metrics | js 'd.length+"/"+d[0].month+"/"+d[0].manual.vacancyResponses')"
chk "плохой месяц — 400" 400 "$(code SEC PUT /mkt/metrics/2026-13x '{}')"

echo "== сводка для других модулей =="
chk "summary: ждут утверждения, последняя публикация" "2/$T/0" "$(call OWN GET /mkt/summary | js 'd.review+"/"+d.lastPublished+"/"+d.pauseDays')"
chk "ctx.modules.mkt.summary(ctx)" 2 "$(node -e "
const m=require('./modules/mkt/server.js');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('$DATA_DIR/db.sqlite');
const col=c=>db.prepare('select data from docs where col=?').all(c).map(r=>JSON.parse(r.data));
console.log(m.summary({db:{mktPosts:col('mktPosts')},today:()=>'$T'}).review)" 2>/dev/null)"

kill $SP 2>/dev/null; wait $SP 2>/dev/null
echo; echo "Итого: $pass ✓, $fail ✗"; [ $fail -eq 0 ]
