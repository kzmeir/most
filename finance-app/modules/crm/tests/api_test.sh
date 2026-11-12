#!/bin/bash
# Проверка API и прав модуля crm по ролям (owner, partner, secretary, pm свой/чужой, accountant, staff, gip).
# Запуск из finance-app:  bash modules/crm/tests/api_test.sh
# Нужны node 22.5+ и curl. Сервер поднимается на порту 3198 с DEV_USER (роль — из cookie devrole), база — пустая data-dev/crm-test (в .gitignore).
# Тела запросов передаются файлом (-d @file): в Git Bash кириллица в аргументах curl портится (cp1251).
set -u
APP="$(cd "$(dirname "$0")/../../.." && pwd)"; cd "$APP"
export DATA_DIR="data-dev/crm-test"; export PORT=3198; export DEV_USER=owner
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
T=$(date +%F)

echo "== доступ к модулю =="
chk "staff 403" 403 "$(code STAFF GET /crm/leads)"
chk "accountant 403" 403 "$(code ACC GET /crm/leads)"
chk "gip 403" 403 "$(code GIP GET /crm/leads)"
chk "owner 200" 200 "$(code OWN GET /crm/leads)"
chk "secretary 200" 200 "$(code SEC GET /crm/leads)"
chk "pm 200" 200 "$(code PMR GET /crm/leads)"
chk "коллекция crmLeads через общий API закрыта" 404 "$(code OWN GET /crmLeads)"
chk "секретарю график платежей 403" 403 "$(code SEC GET /crm/payments)"
chk "ПМ график платежей 403" 403 "$(code PMR GET /crm/payments)"
chk "секретарь: права в meta" "true/false/true" "$(call SEC GET /crm/meta | js 'd.rights.editor+"/"+d.rights.payments+"/"+d.rights.docs')"

echo "== лиды =="
L1=$(call SEC POST /crm/leads '{"client":"ТОО Тест-Девелопмент","object":"ЖК Тестовый","objectType":"ЖК","track":"rp","area":10000,"rate":5300,"vatIncluded":false,"bin":"123456789012","nextDate":"2020-01-01","nextStep":"позвонить"}')
L1ID=$(echo "$L1" | js 'd.id'); chk "секретарь завёл лид, сумма = площадь × ставка" 53000000 "$(echo "$L1" | js 'd.calc.sum')"
chk "кириллица сохранилась" "ЖК Тестовый" "$(echo "$L1" | js 'd.object')"
chk "ПМ не заводит лиды" 403 "$(code PMR POST /crm/leads '{"object":"x"}')"
chk "ПМ не видит чужой лид" 0 "$(call PMR GET /crm/leads | js 'd.length')"
chk "ПМ: чужой лид 404" 404 "$(code PMR GET /crm/leads/$L1ID)"
chk "лид с просроченным контактом в счётчике" 1 "$(call SEC GET /crm/badges | js 'd.crmleads')"
chk "секретарю счётчик платежей не отдаётся" undefined "$(call SEC GET /crm/badges | js 'd.crmpay')"
chk "в «Договор» — только через подписание" 400 "$(code SEC PUT /crm/leads/$L1ID '{"status":"Договор"}')"
chk "КП отправлено" "КП отправлено" "$(call SEC PUT /crm/leads/$L1ID '{"status":"КП отправлено","nextDate":"2099-01-01"}' | js 'd.status')"
chk "отметка «КП у заказчика» (kpAt)" "$T" "$(call OWN GET /crm/leads/$L1ID | js 'd.kpAt')"
L2ID=$(call SEC POST /crm/leads '{"client":"ИП Вилла","object":"Коттедж","objectType":"Виллы / коттеджи","track":"ep","area":500,"rate":30000,"vatIncluded":true,"status":"КП отправлено"}' | js 'd.id')
chk "отказ без причины — 400" 400 "$(code SEC PUT /crm/leads/$L2ID '{"status":"Отказ"}')"
chk "отказ с причиной" "Цена" "$(call SEC PUT /crm/leads/$L2ID '{"status":"Отказ","reason":"Цена","reasonNote":"дорого"}' | js 'd.reason')"
chk "история: создан + отказ" 2 "$(call OWN GET /crm/leads/$L2ID | js 'd.history.length')"

echo "== КП из реестра ядра =="
chk "owner завёл КП в ядре" 200 "$(code OWN POST /proposals '{"no":"99","title":"КП РП ЖК Импорт.docx","client":"ТОО Импорт","sum":12000000,"status":"У клиента","contact":"Иван"}')"
chk "импорт КП → 1 лид" 1 "$(call SEC POST /crm/import/proposals '{}' | js 'd.created')"
chk "повторный импорт — 0" 0 "$(call SEC POST /crm/import/proposals '{}' | js 'd.created')"
chk "лид из КП: статус и стадия" "КП отправлено/rp" "$(call OWN GET /crm/leads | js 'd.find(l=>l.proposalId).status+"/"+d.find(l=>l.proposalId).track')"

echo "== договор подписан =="
chk "секретарь не подписывает" 403 "$(code SEC POST /crm/leads/$L1ID/sign '{"contractNo":"1"}')"
chk "ПМ не подписывает (лид ему не виден)" 404 "$(code PMR POST /crm/leads/$L1ID/sign '{"contractNo":"1"}')"
S=$(call OWN POST /crm/leads/$L1ID/sign "{\"contractNo\":\"101-26-РП\",\"contractDate\":\"$T\",\"company\":\"ТОО MOST Project\",\"pmId\":\"dev-pm\",\"gipId\":\"dev-gip\",\"start\":\"$T\"}")
chk "статус Договор" "Договор" "$(echo "$S" | js 'd.status')"
PID=$(echo "$S" | js 'd.pmProjectId'); chk "создан проект РП в pm" "rp" "$(call OWN GET /pm/projects/$PID | js 'd.project.track')"
chk "имя проекта = объект" "ЖК Тестовый" "$(call OWN GET /pm/projects/$PID | js 'd.project.name')"
chk "график 30/30/30/10" "30/30/30/10" "$(echo "$S" | js 'd.payments.map(p=>p.share).join("/")')"
chk "суммы графика = сумма договора" 53000000 "$(echo "$S" | js 'd.payments.reduce((a,p)=>a+p.sum,0)')"
chk "платёж 2 привязан к этапу 4 проекта" "4/$PID" "$(echo "$S" | js 'd.payments[1].stage+"/"+d.payments[1].pmProjectId')"
chk "аванс: пора выставлять счёт" true "$(echo "$S" | js 'd.payments[0].ready')"
chk "повторное подписание — 409" 409 "$(code OWN POST /crm/leads/$L1ID/sign '{"contractNo":"1"}')"
chk "ПМ проекта видит свой лид" 1 "$(call PMR GET /crm/leads | js 'd.length')"
chk "ПМ: только чтение" 403 "$(code PMR PUT /crm/leads/$L1ID '{"note":"x"}')"
chk "ПМ не видит график в карточке" undefined "$(call PMR GET /crm/leads/$L1ID | js 'd.payments')"

echo "== этап проекта сделан → «пора выставлять акт» =="
chk "платёж 2 пока не готов" false "$(call OWN GET /crm/payments | js 'd.deals.find(x=>x.id==="'$L1ID'").payments[1].ready')"
for IT in $(call OWN GET /pm/projects/$PID | js 'd.items.filter(i=>i.stage===4).map(i=>i.id).join(" ")'); do call OWN PUT /pm/items/$IT '{"done":true}' > /dev/null; done
P2=$(call OWN GET /crm/payments | js 'JSON.stringify(d.deals.find(x=>x.id==="'$L1ID'").payments[1])')
chk "платёж 2 готов к акту" true "$(echo "$P2" | js 'd.ready')"
chk "событие pm.item.done записало readyAt" "$T" "$(echo "$P2" | js 'd.readyAt')"
chk "ожидаемая дата = сегодня + 10 дн." "$(node -e "console.log(new Date(Date.now()+10*864e5).toLocaleDateString('sv-SE',{timeZone:'Asia/Almaty'}))")" "$(echo "$P2" | js 'd.expected')"
P2ID=$(echo "$P2" | js 'd.id')
chk "акт выставлен → дата акта" "$T" "$(call OWN PUT /crm/payments/$P2ID '{"status":"Акт выставлен"}' | js 'd.actDate')"
chk "замена графика при выставленном акте — 409" 409 "$(code OWN POST /crm/leads/$L1ID/schedule '{"template":"rp"}')"
chk "оплачен" "Оплачен" "$(call OWN PUT /crm/payments/$P2ID '{"status":"Оплачен"}' | js 'd.status')"
chk "оплаченный не удаляется" 409 "$(code OWN DELETE /crm/payments/$P2ID)"
chk "партнёр видит график" 200 "$(code PART GET /crm/payments)"

echo "== ожидаемые поступления (для прогноза денег) =="
EX=$(call OWN GET "/crm/expected?from=$T&to=2099-12-31")
chk "3 неоплаченных платежа" 3 "$(echo "$EX" | js 'd.length')"
chk "сумма без оплаченного" 37100000 "$(echo "$EX" | js 'd.reduce((a,e)=>a+e.amount,0)')"
chk "expectedPayments(ctx, from, to) из модуля" 3 "$(node -e "
const m=require('./modules/crm/server.js');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('$DATA_DIR/db.sqlite');
const col=c=>db.prepare('select data from docs where col=?').all(c).map(r=>JSON.parse(r.data));
const ctx={db:{crmLeads:col('crmLeads'),crmPayments:col('crmPayments'),pmItems:col('pmItems'),settings:{}},D:{},today:()=>'$T'};
console.log(m.expectedPayments(ctx,'$T','2099-12-31').length)" 2>/dev/null)"

echo "== воронка =="
F=$(call OWN GET /crm/funnel)
chk "договоров 1, отказов 1" "1/1" "$(echo "$F" | js 'd.won+"/"+d.lost')"
chk "конверсия КП → договор 50 %" 50 "$(echo "$F" | js 'd.conversion')"
chk "ставка ЖК без НДС по договорам" 5300 "$(echo "$F" | js 'd.rates.find(r=>r.type==="ЖК").won.rate')"
chk "ставка вилл без НДС (30 000 с НДС 16 %)" 25862 "$(echo "$F" | js 'd.rates.find(r=>r.type==="Виллы / коттеджи").kp.rate')"
chk "причина отказа Цена" 1 "$(echo "$F" | js 'd.reasons.find(r=>r.reason==="Цена").n')"

echo "== стадии: концепция — первый этап ЭП =="
chk "стадии лида: ЭП/РП/АН" "ep,rp,an" "$(call OWN GET /crm/meta | js 'Object.keys(d.tracks).join(",")')"
chk "шаблонов графика без концепции" "rp,ep,an" "$(call OWN GET /crm/meta | js 'Object.keys(d.payTemplates).join(",")')"
chk "порт ERP для ссылок на проекты" 3199 "$(call OWN GET /crm/meta | js 'd.erpPort')"
LC=$(call SEC POST /crm/leads '{"client":"ТОО Концепт","object":"Концепция ЖК","track":"concept","sum":9000000,"status":"Торг"}')
LCID=$(echo "$LC" | js 'd.id'); chk "стадия concept сохраняется как ЭП" ep "$(echo "$LC" | js 'd.track')"
SC=$(call OWN POST /crm/leads/$LCID/sign "{\"contractNo\":\"7-26-ЭП\",\"contractDate\":\"$T\",\"start\":\"$T\"}")
chk "подписан: проект ЭП в pm" ep "$(call OWN GET /pm/projects/$(echo "$SC" | js 'd.pmProjectId') | js 'd.project.track')"
chk "график ЭП привязан по кодам этапов D/F/H" "0/5/7/9" "$(echo "$SC" | js 'd.payments.map(p=>p.stage).join("/")')"
chk "коды и названия этапов сохранены в платежах" "D:5. D — Планировки|F:7. F — Финальный фасад (на весь комплекс)|H:9. H — Завершение проекта" "$(echo "$SC" | js 'd.payments.slice(1).map(p=>p.stageCode+":"+p.stageName).join("|")')"
chk "этап 5 — «D — Планировки», найден" "1/false" "$(echo "$SC" | js '(+/Планировки/.test(d.payments[1].stageInfo && d.payments[1].stageInfo.name || ""))+"/"+d.payments[1].stageMissing')"
chk "доли ЭП прежние" "30/30/30/10" "$(echo "$SC" | js 'd.payments.map(p=>p.share).join("/")')"
chk "старый график ЭП («Градсовет» на этапе 8) → этап не найден; перепривязанный — найден" "true/false/true/false" "$(node -e "
const C=require('./modules/crm/domain.js');const PM=require('./modules/pm/domain.js');const items=PM.itemsFromTemplate('ep','p1',{});const codes=C.stageCodes(items,PM.stageNames('ep'));
const st=p=>C.paymentState(p,{items,codes,today:'2026-09-25'}).stageMissing;
console.log([st({name:'Градсовет',stage:8}), st({name:'Аванс при подписании договора',stage:0}), st({name:'Платёж',stage:5,stageName:'5. Планы'}), st({name:'Платёж',stage:5,stageName:PM.stageNames('ep')[4],stageCode:'D'})].join('/'))")"
PSC=$(echo "$SC" | js 'd.payments[3].id')
chk "перепривязка строки: этап 8 → код G, название сохранено" "8/G/false" "$(call OWN PUT /crm/payments/$PSC '{"stage":8}' | js 'd.stage+"/"+d.stageCode+"/"+d.stageMissing')"

echo "== договор из реестра → график =="
chk "owner завёл договор в ядре" 200 "$(code OWN POST /contracts '{"name":"Старый договор","code":"Старый","title":"Договор 55-25-ЭП от 01.03.2025","clientShort":"Хаят","sum":20000000,"paid":6000000,"remaining":14000000,"company":"ТОО MOST Architects"}')"
CT=$(call OWN GET /crm/meta | js 'd.contracts.find(c=>c.name==="Старый договор").id')
chk "секретарь не заводит график" 403 "$(code SEC POST /crm/import/contract "{\"contractId\":\"$CT\"}")"
I=$(call OWN POST /crm/import/contract "{\"contractId\":\"$CT\",\"track\":\"ep\"}")
chk "сделка: № и дата из названия" "55-25-ЭП/2025-03-01" "$(echo "$I" | js 'd.contractNo+"/"+d.contractDate')"
chk "график на остаток 14 млн" 14000000 "$(echo "$I" | js 'd.pay.sum')"
chk "повторно — 409" 409 "$(code OWN POST /crm/import/contract "{\"contractId\":\"$CT\"}")"

echo "== документы =="
chk "секретарь видит шаблоны" 4 "$(call SEC GET /crm/templates | js 'd.length')"
chk "секретарь не меняет шаблоны" 403 "$(code SEC PUT /crm/templates/tpl-contract '{"title":"x"}')"
chk "ПМ документы 403" 403 "$(code PMR GET /crm/templates)"
R=$(call SEC POST /crm/docs/render "{\"templateId\":\"tpl-contract\",\"leadId\":\"$L1ID\"}")
chk "договор: сумма прописью" 1 "$(echo "$R" | js '+d.html.includes("Пятьдесят три миллиона тенге")')"
chk "договор: номер и график" 1 "$(echo "$R" | js '+(d.html.includes("101-26-РП") && d.html.includes("Выдача на стройку"))')"
chk "АВР без этапа — 400" 400 "$(code SEC POST /crm/docs/render "{\"templateId\":\"tpl-avr\",\"leadId\":\"$L1ID\"}")"
P1ID=$(call OWN GET /crm/leads/$L1ID | js 'd.payments[0].id')
A=$(call SEC POST /crm/docs/render "{\"templateId\":\"tpl-avr\",\"leadId\":\"$L1ID\",\"paymentId\":\"$P1ID\"}")
chk "АВР: CSV для 1С" 1 "$(echo "$A" | js '+(d.csv.includes("АВР;") && d.csv.includes("15900000"))')"
chk "owner изменил шаблон" "Мой договор" "$(call OWN PUT /crm/templates/tpl-contract '{"title":"Мой договор","body":"<p>{{заказчик}} {{нет_поля}}</p>"}' | js 'd.title')"
chk "поле подставлено, неизвестное оставлено" 1 "$(call SEC POST /crm/docs/render "{\"templateId\":\"tpl-contract\",\"leadId\":\"$L1ID\"}" | js '+(d.html.includes("ТОО Тест-Девелопмент {{нет_поля}}"))')"
chk "сброс шаблона" "Договор на проектирование" "$(call OWN DELETE /crm/templates/tpl-contract > /dev/null; call OWN GET /crm/templates | js 'd.find(x=>x.id==="tpl-contract").title')"
chk "HTML в данных экранируется" 0 "$(call SEC PUT /crm/leads/$L1ID '{"client":"<script>x</script>"}' > /dev/null; call SEC POST /crm/docs/render "{\"templateId\":\"tpl-contract\",\"leadId\":\"$L1ID\"}" | js '+d.html.includes("<script>x")')"

echo "== КП в Word =="
LK=$(call SEC POST /crm/leads '{"client":"ТОО Эверест","object":"ЖК на участке 7,5 га","objectType":"ЖК","track":"ep","area":90000,"rate":500}' | js 'd.id')
chk "параметры КП: ЭП — концепт 20 % / ЭП 80 %" "20/80" "$(call SEC GET /crm/leads/$LK/kp | js 'd.params.stages.map(s=>s.share).join("/")')"
chk "параметры КП: компания ЭП по умолчанию" "ТОО MOST Architects" "$(call SEC GET /crm/leads/$LK/kp | js 'd.params.company')"
chk "без явного НДС — 400" 400 "$(code SEC POST /crm/leads/$LK/kp '{"params":{"rate":500}}')"
chk "пересчитать: 90 000 м² × 500 с НДС = 45 млн, этап 1 — 9 млн" "45000000/9000000/38793103" "$(call SEC POST /crm/leads/$LK/kp/calc '{"params":{"vatIncluded":true}}' | js 'd.calc.gross+"/"+d.calc.stages[0].gross+"/"+d.calc.net')"
chk "пересчитать без НДС: НДС сверху" "52200000" "$(call SEC POST /crm/leads/$LK/kp/calc '{"params":{"vatIncluded":false}}' | js 'd.calc.gross')"
chk "пересчитать не пишет в лид" 0 "$(call OWN GET /crm/leads/$LK | js '(d.kpVersions||[]).length')"
chk "доли не 100 % — 400" 400 "$(code SEC POST /crm/leads/$LK/kp '{"params":{"vatIncluded":true,"stages":[{"name":"А","share":50}]}}')"
K1=$(call SEC POST /crm/leads/$LK/kp '{"params":{"vatIncluded":true}}')
YY=$(date +%y)
chk "редакция 1 и номер КП" "1/КП-$YY-001" "$(echo "$K1" | js 'd.v+"/"+d.no')"
chk "в лид: номер, дата, сумма с НДС, отметка КП" "КП-$YY-001/$T/45000000/true/$T" "$(call OWN GET /crm/leads/$LK | js 'd.kpNo+"/"+d.kpDate+"/"+d.sum+"/"+d.vatIncluded+"/"+d.kpAt')"
chk "те же параметры — редакция не множится" "true/1" "$(call SEC POST /crm/leads/$LK/kp '{"params":{"vatIncluded":true}}' | js 'd.reused+"/"+d.v')"
K2=$(call SEC POST /crm/leads/$LK/kp '{"params":{"vatIncluded":true,"rate":600}}')
chk "новая ставка — редакция 2, номер тот же" "2/КП-$YY-001/54000000" "$(echo "$K2" | js 'd.v+"/"+d.no+"/"+d.gross')"
chk "история версий в лиде" "1:45000000,2:54000000" "$(call OWN GET /crm/leads/$LK | js 'd.kpVersions.map(v=>v.v+":"+v.gross).join(",")')"
chk "в истории лида — запись о КП" 1 "$(call OWN GET /crm/leads/$LK | js '+d.history.some(h=>/КП КП-/.test(h.note))')"
chk "второй лид — следующий номер" "КП-$YY-002" "$(call SEC POST /crm/leads/$L1ID/kp '{"params":{"vatIncluded":false}}' | js 'd.no')"
curl -s "${SEC[@]}" -D "$DATA_DIR/kph.txt" -o "$DATA_DIR/kp1.docx" "$B/crm/leads/$LK/kp/1/docx"
chk "скачать редакцию 1: тип Word" 1 "$(grep -ci 'wordprocessingml' "$DATA_DIR/kph.txt")"
chk "имя файла с номером КП" 1 "$(grep -c "filename\*=UTF-8''%D0%9A%D0%9F-$YY-001" "$DATA_DIR/kph.txt")"
chk "docx: ZIP и XML корректны, логотип — единственная картинка, «М.П.», сумма редакции 1" ok "$(python -c "
import zipfile,sys;from xml.dom import minidom;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None
[minidom.parseString(z.read(n)) for n in z.namelist() if n.endswith(('.xml','.rels'))]
media=[n for n in z.namelist() if n.startswith('word/media/')];assert media==['word/media/logo.png'],media
d=z.read('word/document.xml').decode();assert 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ' in d and 'М.П.' in d and '45 000 000 ₸' in d and 'Концепт-проект' in d and 'с НДС' in d;print('ok')" "$DATA_DIR/kp1.docx" 2>&1 | tail -1)"
chk "несуществующая редакция — 404" 404 "$(code SEC GET /crm/leads/$LK/kp/9/docx)"
chk "ПМ: чужой лид — КП не скачать" 404 "$(code PMR GET /crm/leads/$LK/kp/1/docx)"
chk "ПМ: свой лид — скачать можно" 200 "$(code PMR GET /crm/leads/$L1ID/kp/1/docx)"
chk "ПМ: сформировать КП нельзя" 403 "$(code PMR POST /crm/leads/$L1ID/kp '{"params":{"vatIncluded":false}}')"
chk "бухгалтеру — нет доступа" 403 "$(code ACC GET /crm/leads/$LK/kp)"

echo "== готовое КП (внешняя редакция: PDF/DOCX + итоговые цифры) =="
# тело с файлами собирает node из файла-скрипта (кириллица в аргументах Git Bash портится): kpbody '<JSON полей>' имя:вид …  (вид: pdf | docx | exe)
cat > "$DATA_DIR/kpbody.js" <<'EOF'
const f = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
const mk = { pdf: Buffer.from('%PDF-1.4\n% КП тест\n%%EOF\n'), docx: Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from('word/document.xml')]), exe: Buffer.from('MZ\x90\x00 not a pdf') };
const names = { hotel: 'КП_Жамакаев_Отель_РП_28-09-2026' };
f.files = process.argv.slice(3).map(s => { const [n, k, ext] = s.split(':'); return { name: (names[n] || n) + '.' + (ext || k), data: mk[k].toString('base64') }; });
process.stdout.write(JSON.stringify(f));
EOF
kpbody() { printf '%s' "$1" > "$DATA_DIR/fields.json"; node "$DATA_DIR/kpbody.js" "$DATA_DIR/fields.json" "${@:2}" > "$BODY"; }
kpost() { local -n R=$1; curl -s "${R[@]}" "${H[@]}" -X POST "$B$2" -d @"$BODY"; }
kpostc() { local -n R=$1; curl -s -o /dev/null -w '%{http_code}' "${R[@]}" "${H[@]}" -X POST "$B$2" -d @"$BODY"; }
HN=$([ "$YY" = 26 ] && echo 003 || echo 001)  # КП-26-001/002 уже выданы выше, если тест идёт в 2026 г.
LH=$(call SEC POST /crm/leads '{"client":"Radisson Hotel Almaty","object":"Гостиница с подземным паркингом, ул. Жамакаева/Шукшина","objectType":"Гостиница","track":"rp"}' | js 'd.id')
HOTEL='{"date":"28.09.2026","area":9455,"net":159979625,"vat":25596740,"gross":185576365,"extraNet":20500000,"extraGross":23780000,"comment":"РП по ставке + фиксированные разделы; изыскания и КазНИИСА — вне КП"}'
kpbody "$HOTEL"; chk "ПМ не загружает (чужой лид)" 404 "$(kpostc PMR /crm/leads/$LH/kp/external)"
kpbody "$HOTEL" hotel:pdf; chk "ПМ не загружает и в свой лид" 403 "$(kpostc PMR /crm/leads/$L1ID/kp/external)"
chk "бухгалтеру — нет доступа" 403 "$(kpostc ACC /crm/leads/$LH/kp/external)"
kpbody "$HOTEL"; chk "без файлов — 400" 400 "$(kpostc SEC /crm/leads/$LH/kp/external)"
kpbody "$HOTEL" x:exe; chk "EXE — 400" 400 "$(kpostc SEC /crm/leads/$LH/kp/external)"
kpbody "$HOTEL" x:exe:pdf; chk "подделка под PDF — 400" 400 "$(kpostc SEC /crm/leads/$LH/kp/external)"
kpbody '{"net":100,"vat":16,"gross":120}' hotel:pdf; chk "итог не сходится — 400" 400 "$(kpostc SEC /crm/leads/$LH/kp/external)"
kpbody '{"area":100}' hotel:pdf; chk "без суммы — 400" 400 "$(kpostc SEC /crm/leads/$LH/kp/external)"
chk "до загрузки лид в статусе «Новый»" "Новый" "$(call OWN GET /crm/leads/$LH | js 'd.status')"
kpbody "$HOTEL" hotel:pdf hotel:docx; X=$(kpost SEC /crm/leads/$LH/kp/external)
chk "редакция 1: готовый файл, следующий номер КП-26" "1/external/КП-26-$HN/false" "$(echo "$X" | js 'd.v+"/"+d.source+"/"+d.no+"/"+d.reused')"
chk "итог КП: без НДС / НДС 16 % / с НДС" "159979625/25596740/16/185576365" "$(echo "$X" | js 'd.net+"/"+d.vat+"/"+d.vatPct+"/"+d.gross')"
chk "сопутствующие вне КП без/с НДС" "20500000/23780000" "$(echo "$X" | js 'd.extraNet+"/"+d.extraGross')"
chk "ставка ₸/м² без НДС = итог / площадь" "9455/16920" "$(echo "$X" | js 'd.area+"/"+d.rate')"
chk "файлы PDF и DOCX с именами" "pdf:КП_Жамакаев_Отель_РП_28-09-2026.pdf,docx:КП_Жамакаев_Отель_РП_28-09-2026.docx" "$(echo "$X" | js 'd.files.map(f=>f.kind+":"+f.name).join(",")')"
LHD=$(call OWN GET /crm/leads/$LH)
chk "в лид: №, дата, сумма без НДС (сопутствующие не входят), площадь, КП отправлено" "КП-26-$HN/2026-09-28/159979625/false/9455/КП отправлено/2026-09-28" "$(echo "$LHD" | js 'd.kpNo+"/"+d.kpDate+"/"+d.sum+"/"+d.vatIncluded+"/"+d.area+"/"+d.status+"/"+d.kpAt')"
chk "в лиде: ставка без НДС и сумма с НДС" "16920/185576365" "$(echo "$LHD" | js 'd.calc.rateNoVat+"/"+d.calc.withVat')"
chk "в истории — запись о готовом КП" 1 "$(echo "$LHD" | js '+d.history.some(h=>/готовый файл/.test(h.note)&&/20 500 000/.test(h.note))')"
chk "sha и путь на диске наружу не отдаются" "undefined/undefined" "$(echo "$LHD" | js 'd.kpVersions[0].files[0].sha+"/"+d.kpVersions[0].files[0].type')"
chk "повтор той же публикации — редакция не множится" "true/1/1" "$(kpbody "$HOTEL" hotel:pdf hotel:docx; kpost SEC /crm/leads/$LH/kp/external | js 'd.reused+"/"+d.v+"/"+d.lead.kpVersions.length')"
FKEY=$(echo "$LHD" | js 'd.kpVersions[0].files[0].key'); DKEY=$(echo "$LHD" | js 'd.kpVersions[0].files[1].key')
curl -s "${OWN[@]}" -D "$DATA_DIR/kpxh.txt" -o "$DATA_DIR/kpx.pdf" "$B/crm/leads/$LH/kp/1/files/$FKEY"
chk "скачать PDF: тип и содержимое" "1/%PDF-" "$(grep -ci 'content-type: application/pdf' "$DATA_DIR/kpxh.txt")/$(head -c 5 "$DATA_DIR/kpx.pdf")"
chk "имя файла в UTF-8" 1 "$(grep -c "filename\*=UTF-8''%D0%9A%D0%9F_" "$DATA_DIR/kpxh.txt")"
chk "файл лежит в DATA_DIR/crm-files/<лид>/" yes "$([ -f "$DATA_DIR/crm-files/$LH/$FKEY" ] && echo yes || echo no)"
chk "…/kp/1/docx внешней редакции → её DOCX" "302" "$(code SEC GET /crm/leads/$LH/kp/1/docx)"
chk "чужой ключ / мусор — 404" "404/404" "$(code OWN GET /crm/leads/$LH/kp/1/files/..%2F..%2Fdb.sqlite)/$(code OWN GET /crm/leads/$LK/kp/1/files/$FKEY)"
chk "ПМ: чужой лид — файл не скачать" 404 "$(code PMR GET /crm/leads/$LH/kp/1/files/$FKEY)"
F2=$(call OWN GET /crm/funnel)
chk "аналитика: ставка «Гостиница» по КП = 16 920 ₸/м² без НДС" "16920/1" "$(echo "$F2" | js 'd.rates.find(r=>r.type==="Гостиница").kp.rate+"/"+d.rates.find(r=>r.type==="Гостиница").kp.n')"
chk "аналитика: лид в работе на сумму КП без НДС" 1 "$(echo "$F2" | js '+(d.byStatus.find(s=>s.status==="КП отправлено").sum>=159979625)')"
kpbody "{\"no\":\"КП-26-$HN\",\"net\":1000000}" hotel:pdf; chk "номер КП другого лида — 409" 409 "$(kpostc SEC /crm/leads/$L1ID/kp/external)"
kpbody '{"net":170000000,"area":9455,"date":"2026-09-29"}' hotel:pdf; X2=$(kpost SEC /crm/leads/$LH/kp/external)
chk "новая редакция: тот же номер, НДС досчитан, ред. 2" "2/КП-26-$HN/197200000" "$(echo "$X2" | js 'd.v+"/"+d.no+"/"+d.gross')"
chk "КП из ERP после готового — ред. 3, номер тот же" "3/КП-26-$HN/erp" "$(call SEC POST /crm/leads/$LH/kp '{"params":{"vatIncluded":false,"rate":16000}}' | js 'd.v+"/"+d.no+"/"+d.source')"
chk "секретарь не удаляет редакцию" 403 "$(code SEC DELETE /crm/leads/$LH/kp/2)"
chk "редакцию из ERP не удалить" 409 "$(code OWN DELETE /crm/leads/$LH/kp/3)"
K2KEY=$(call OWN GET /crm/leads/$LH | js 'd.kpVersions[1].files[0].key')
chk "owner удалил ред. 2 — файл удалён, остались 1 и 3" "1,3/no" "$(call OWN DELETE /crm/leads/$LH/kp/2 | js 'd.kpVersions.map(v=>v.v).join(",")')/$([ -f "$DATA_DIR/crm-files/$LH/$K2KEY" ] && echo yes || echo no)"
chk "удалили лид — папка файлов удалена" "200/no" "$(code OWN DELETE /crm/leads/$LH)/$([ -d "$DATA_DIR/crm-files/$LH" ] && echo yes || echo no)"

echo "== удаление =="
chk "секретарь не удаляет" 403 "$(code SEC DELETE /crm/leads/$L2ID)"
chk "owner удаляет" 200 "$(code OWN DELETE /crm/leads/$L2ID)"

kill $SP 2>/dev/null; wait $SP 2>/dev/null
echo; echo "Итого: $pass ✓, $fail ✗"; [ $fail -eq 0 ]
