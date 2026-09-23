#!/bin/bash
# Сквозной тест API: права, очередь, счёт→расход, бэкап, seed, 1С
set -u
APP="$(cd "$(dirname "$0")/.." && pwd)"
SCR="${SCR:-$APP/tests/tmp}"; mkdir -p "$SCR"
export DATA_DIR="$SCR/testdata"
export PORT=3777
rm -rf "$DATA_DIR"
cd "$APP"
node server.js > $SCR/server.log 2>&1 &
SP=$!
sleep 1.2
B=http://localhost:$PORT/api
H='-H Content-Type:application/json -H X-Requested-With:fetch'
CO=$SCR/c_owner.txt
CA=$SCR/c_acc.txt
CP=$SCR/c_pm.txt
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
pass=0; fail=0
chk() { local name="$1" exp="$2" got="$3"; if [ "$exp" = "$got" ]; then echo "  ✓ $name ($got)"; pass=$((pass+1)); else echo "  ✗ $name: ожидалось $exp, получено $got"; fail=$((fail+1)); fi; }

echo "== status/setup =="
chk "status needsSetup" 'true' "$(curl -s $B/status | python3 -c 'import sys,json;print(str(json.load(sys.stdin)["needsSetup"]).lower())')"
chk "setup owner" 200 "$(code -c $CO $H -X POST $B/setup -d '{"login":"meir","password":"secret123","name":"Мейр"}')"
chk "setup again forbidden" 403 "$(code $H -X POST $B/setup -d '{"login":"x","password":"secret123"}')"
chk "me owner" 200 "$(code -b $CO $B/me)"
chk "CSRF без заголовка" 403 "$(code -b $CO -H Content-Type:application/json -X POST $B/projects -d '{"name":"x"}')"

echo "== users =="
chk "create accountant" 200 "$(code -b $CO $H -X POST $B/users -d '{"login":"buh","password":"secret123","name":"Бухгалтер","role":"accountant"}')"
chk "create pm" 200 "$(code -b $CO $H -X POST $B/users -d '{"login":"pm","password":"secret123","name":"ПМ","role":"pm"}')"
chk "login accountant" 200 "$(code -c $CA $H -X POST $B/login -d '{"login":"buh","password":"secret123"}')"
chk "login pm" 200 "$(code -c $CP $H -X POST $B/login -d '{"login":"pm","password":"secret123"}')"
chk "wrong password" 401 "$(code $H -X POST $B/login -d '{"login":"pm","password":"nope"}')"

echo "== seed =="
chk "seed by owner" 200 "$(code -b $CO $H -X POST $B/seed)"
chk "seed by accountant forbidden" 403 "$(code -b $CA $H -X POST $B/seed)"
chk "invoices count 16" 16 "$(curl -s -b $CO $B/invoices | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')"

echo "== права PM =="
chk "pm GET docs" 200 "$(code -b $CP $B/docs)"
chk "pm GET invoices" 200 "$(code -b $CP $B/invoices)"
chk "pm GET projects" 200 "$(code -b $CP $B/projects)"
chk "pm GET ops = 403" 403 "$(code -b $CP $B/ops)"
chk "pm GET contracts = 200" 200 "$(code -b $CP $B/contracts)"
chk "pm GET subcontracts = 200" 200 "$(code -b $CP $B/subcontracts)"
chk "pm GET proposals = 403" 403 "$(code -b $CP $B/proposals)"
chk "pm GET payroll = 403" 403 "$(code -b $CP $B/payroll)"
chk "pm GET dashboard = 403" 403 "$(code -b $CP $B/dashboard)"
chk "pm GET users = 403" 403 "$(code -b $CP $B/users)"
chk "pm POST docs = 403" 403 "$(code -b $CP $H -X POST $B/docs -d '{"client":"x"}')"
chk "pm PUT invoices = 403" 403 "$(code -b $CP $H -X PUT $B/invoices/none -d '{"status":"paid"}')"
chk "accountant GET users = 403" 403 "$(code -b $CA $B/users)"
chk "accountant GET ops = 200" 200 "$(code -b $CA "$B/ops?year=2026")"
chk "ops months list" true "$(curl -s -b $CA $B/ops/months | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str(len(d)>90).lower())')"
chk "ops filter untagged" true "$(curl -s -b $CA "$B/ops?year=2026&untagged=1" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str(d["total"]>100 and d["total"]<1200).lower())')"
chk "ops summary has Алмеу" true "$(curl -s -b $CA $B/ops/summary | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str(any("Алмеу" in k for k in d)).lower())')"

echo "== очередь =="
DOC=$(curl -s -b $CO $H -X POST $B/docs -d '{"type":"act","client":"Everest","project":"Almeu (ЖК Алмеу РП, 69-23-РП)","amount":46888030,"description":"Акт по Алмеу"}')
DID=$(echo "$DOC" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
chk "doc status new" new "$(echo "$DOC" | python3 -c 'import sys,json;print(json.load(sys.stdin)["status"])')"
chk "doc requestedByName" "Мейр" "$(echo "$DOC" | python3 -c 'import sys,json;print(json.load(sys.stdin)["requestedByName"])')"
chk "accountant → in_progress" in_progress "$(curl -s -b $CA $H -X PUT $B/docs/$DID -d '{"status":"in_progress"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["status"])')"
chk "accountant → done sets doneAt" true "$(curl -s -b $CA $H -X PUT $B/docs/$DID -d '{"status":"done"}' | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str(bool(d.get("doneAt"))).lower())')"
chk "pm sees doc (read)" 200 "$(code -b $CP $B/docs/$DID)"

echo "== счёт → операция =="
INV=$(curl -s -b $CO $H -X POST $B/invoices -d '{"company":"MOST Project","contractor":"Тест-Подрядчик","amount":123456,"purpose":"тест"}')
IID=$(echo "$INV" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
EXP0=$(curl -s -b $CO "$B/ops?year=2026" | python3 -c 'import sys,json;print(json.load(sys.stdin)["total"])')
chk "mark paid" paid "$(curl -s -b $CA $H -X PUT $B/invoices/$IID -d '{"status":"paid"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["status"])')"
EXP1=$(curl -s -b $CO "$B/ops?year=2026" | python3 -c 'import sys,json;print(json.load(sys.stdin)["total"])')
chk "op created (+1)" $((EXP0+1)) "$EXP1"
curl -s -b $CA $H -X PUT $B/invoices/$IID -d '{"status":"paid"}' >/dev/null
EXP2=$(curl -s -b $CO "$B/ops?year=2026" | python3 -c 'import sys,json;print(json.load(sys.stdin)["total"])')
chk "no duplicate op on re-paid" "$EXP1" "$EXP2"

echo "== операции =="
OP=$(curl -s -b $CA $H -X POST $B/ops -d '{"date":"2026-09-22","account":"PROJECT осн","debit":100000,"counterparty":"Тест","purpose":"тест","project":"Алмеу РП","category":"Расходы на офис"}')
OID=$(echo "$OP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
chk "op created" 100000 "$(echo "$OP" | python3 -c 'import sys,json;print(int(json.load(sys.stdin)["debit"]))')"
AUTO=$(curl -s -b $CA "$B/ops?year=2026&untagged=1" | python3 -c 'import sys,json;d=json.load(sys.stdin);a=[o for o in d["items"] if o.get("auto")];print(a[0]["id"] if a else "")')
chk "auto flag cleared on category set" false "$(curl -s -b $CA $H -X PUT $B/ops/$AUTO -d '{"category":"Расходы на офис"}' | python3 -c 'import sys,json;print(str(json.load(sys.stdin).get("auto")).lower())')"
chk "op delete" 200 "$(code -b $CA $H -X DELETE $B/ops/$OID)"
chk "pm POST ops = 403" 403 "$(code -b $CP $H -X POST $B/ops -d '{"debit":1}')"
chk "contracts count 217" 217 "$(curl -s -b $CO $B/contracts | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')"
chk "dashboard untagged>0" true "$(curl -s -b $CO $B/dashboard | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str(d["untagged"]["all"]>0 and d["year"]["income"]>0).lower())')"

echo "== выписка / сотрудники =="
BULK=$(curl -s -b $CA $H -X POST $B/ops/bulk -d '{"account":"MOST","items":[{"date":"2026-09-10","debit":50000,"credit":0,"counterparty":"ТОО \"ПрофТорг\"","purpose":"За товары","opNo":"999"},{"date":"2026-09-10","debit":0,"credit":1000000,"counterparty":"ТОО \"MOST ARCHITECTS\"","purpose":"Перевод с Депозита","opNo":"998"}],"cash":{"company":"MOST Architects","account":"MOST","balance":11329.19,"asOf":"2026-09-09"}}')
chk "bulk imported 2" 2 "$(echo "$BULK" | python3 -c 'import sys,json;print(json.load(sys.stdin)["imported"])')"
chk "bulk auto-tagged transfer" "Депозит" "$(curl -s -b $CA "$B/ops?ym=2026-09&source=statement" | python3 -c 'import sys,json;d=json.load(sys.stdin);print([o["category"] for o in d["items"] if o["credit"]][0])')"
chk "cash updated from statement" true "$(curl -s -b $CA $B/cash | python3 -c 'import sys,json;print(str(any(abs(c["balance"]-11329.19)<1 and c["asOf"]=="2026-09-09" for c in json.load(sys.stdin))).lower())')"
chk "pm bulk = 403" 403 "$(code -b $CP $H -X POST $B/ops/bulk -d '{"items":[{"debit":1}]}')"
chk "employees seeded" true "$(curl -s -b $CA $B/employees | python3 -c 'import sys,json;print(str(len(json.load(sys.stdin))>30).lower())')"
chk "pm employees = 403" 403 "$(code -b $CP $B/employees)"
VAC=$(curl -s -b $CA $H -X POST $B/vacations -d '{"employeeId":"emp-001","type":"vacation","from":"2026-03-16","to":"2026-03-29","days":11}')
chk "vacation created" 11 "$(echo "$VAC" | python3 -c 'import sys,json;print(json.load(sys.stdin)["days"])')"
chk "payroll month has lines" true "$(curl -s -b $CA $B/payroll | python3 -c 'import sys,json;print(str(all(len(m.get("lines",[]))>30 for m in json.load(sys.stdin))).lower())')"

echo "== дашборд/бэкап/1С =="
chk "dashboard admin" 200 "$(code -b $CO $B/dashboard)"
FL=$(curl -s -b $CO $B/dashboard | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["fixedLoad"]["total"])')
echo "  постоянная нагрузка: $FL"
chk "backup POST" 200 "$(code -b $CA $H -X POST $B/backup)"
chk "backup file exists" true "$(ls $DATA_DIR/backups/ | grep -q manual && echo true || echo false)"
chk "auto backup exists" true "$(ls $DATA_DIR/backups/ | grep -q auto && echo true || echo false)"
chk "backup GET json" 200 "$(code -b $CO $B/backup)"
chk "export invoices csv" 200 "$(code -b $CA $B/export/1c/invoices.csv)"
chk "csv has BOM" true "$(curl -s -b $CA $B/export/1c/invoices.csv | python3 -c 'import sys;print(str(sys.stdin.buffer.read()[:3]==b"\xef\xbb\xbf").lower())')"
chk "export ops csv" 200 "$(code -b $CA "$B/export/1c/ops.csv?ym=2026-08")"
IMP=$(curl -s -b $CA $H -X POST $B/import/1c/invoices -d '{"csv":"Дата;Компания;Контрагент;Сумма;Назначение;Проект;Статус\n2026-09-22;MOST Project;Импорт1С;1000;тест;;open"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["imported"])')
chk "import 1c csv" 1 "$IMP"
chk "static index" 200 "$(code http://localhost:$PORT/)"
chk "static app.js" 200 "$(code http://localhost:$PORT/app.js)"
chk "path traversal blocked" 403 "$(code "http://localhost:$PORT/../server.js")"
chk "data dir not in git" true "$(cd $APP && git check-ignore -q data/db.json && echo true || echo false)"

echo "== счета: импорт списком и файл счёта =="
BULK=$(curl -s -b $CA $H -X POST $B/invoices/bulk -d '{"items":[{"ref":0,"company":"MOST Project","contractor":"ТОО Импорт","amount":123456,"purpose":"тест импорта"},{"ref":1,"company":"MOST Architects","contractor":"ИП Файл","amount":5000,"purpose":"pdf"}]}')
chk "invoices bulk imported 2" 2 "$(echo "$BULK" | python3 -c 'import sys,json;print(json.load(sys.stdin)["imported"])')"
chk "invoices bulk ref echoed" 1 "$(echo "$BULK" | python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][1]["ref"])')"
INVF=$(echo "$BULK" | python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][1]["id"])')
chk "invoices bulk dedupe" 2 "$(curl -s -b $CA $H -X POST $B/invoices/bulk -d '{"items":[{"company":"MOST Project","contractor":"ТОО Импорт","amount":123456,"purpose":"тест импорта"},{"company":"MOST Architects","contractor":"ИП Файл","amount":5000,"purpose":"pdf"}]}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["skipped"])')"
chk "pm bulk = 403" 403 "$(code -b $CP $H -X POST $B/invoices/bulk -d '{"items":[{"contractor":"x","amount":1}]}')"
PNG=$(python3 -c 'import base64,zlib,struct;raw=b"\x00\xff\x00\x00\xff";sig=b"\x89PNG\r\n\x1a\n";
def ch(t,d):return struct.pack(">I",len(d))+t+d+struct.pack(">I",zlib.crc32(t+d)&0xffffffff)
print(base64.b64encode(sig+ch(b"IHDR",struct.pack(">IIBBBBB",1,1,8,2,0,0,0))+ch(b"IDAT",zlib.compress(b"\x00\xff\x00\x00"))+ch(b"IEND",b"")).decode())')
UP=$(curl -s -b $CA $H -X POST "$B/invoices/$INVF/file" -d "{\"name\":\"счёт.png\",\"type\":\"image/png\",\"data\":\"$PNG\"}")
KEY=$(echo "$UP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["file"]["key"])')
chk "file attached" true "$(test -n "$KEY" && echo true || echo false)"
chk "file stored on disk" true "$(test -f $DATA_DIR/files/$KEY && echo true || echo false)"
chk "file GET accountant" 200 "$(code -b $CA $B/files/$KEY)"
chk "file content-type" "image/png" "$(curl -s -o /dev/null -w '%{content_type}' -b $CA $B/files/$KEY)"
chk "file GET pm (read-only) 200" 200 "$(code -b $CP $B/files/$KEY)"
chk "file GET no auth 401" 401 "$(code $B/files/$KEY)"
chk "pm attach = 403" 403 "$(code -b $CP $H -X POST "$B/invoices/$INVF/file" -d "{\"name\":\"x.png\",\"type\":\"image/png\",\"data\":\"$PNG\"}")"
chk "bad type = 400" 400 "$(code -b $CA $H -X POST "$B/invoices/$INVF/file" -d "{\"name\":\"x.exe\",\"type\":\"application/x-msdownload\",\"data\":\"$PNG\"}")"
chk "file traversal 404" 404 "$(code -b $CA "$B/files/..%2F..%2Fdb.json")"
chk "file DELETE" 200 "$(code -b $CA $H -X DELETE "$B/invoices/$INVF/file")"
chk "file gone" 404 "$(code -b $CA $B/files/$KEY)"
chk "export ops csv has opNo" true "$(curl -s -b $CA "$B/export/1c/ops.csv?ym=2026-08" | head -1 | grep -q '№ операции' && echo true || echo false)"

echo "== остатки, календарь, обязательные, отчёт, восстановление =="
chk "balances admin" 200 "$(code -b $CA $B/balances)"
chk "balances pm 403" 403 "$(code -b $CP $B/balances)"
chk "balances have anchor for MOST" true "$(curl -s -b $CA $B/balances | python3 -c 'import sys,json;b=[x for x in json.load(sys.stdin) if x["id"]=="MOST"][0];print(str(b["anchor"] is not None and b["balance"] is not None).lower())')"
chk "report months=12" 12 "$(curl -s -b $CA "$B/ops/report?year=2026" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["months"]))')"
chk "report pm 403" 403 "$(code -b $CP "$B/ops/report?year=2026")"
APPR=$(curl -s -b $CA $H -X POST $B/invoices -d '{"company":"MOST Project","contractor":"ТОО Согласование","amount":1000,"dueDate":"2026-09-01"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
chk "accountant cannot approve" 403 "$(code -b $CA $H -X PUT $B/invoices/$APPR -d '{"approved":true}')"
chk "owner approves" true "$(curl -s -b $CO $H -X PUT $B/invoices/$APPR -d '{"approved":true}' | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str(d["approved"] and bool(d["approvedBy"])).lower())')"
chk "accountant may set dueDate" 200 "$(code -b $CA $H -X PUT $B/invoices/$APPR -d '{"dueDate":"2026-10-01"}')"
OBL=$(curl -s -b $CA $H -X POST $B/obligations/invoices -d '{"ym":"2026-10"}')
chk "obligation invoices created" true "$(echo "$OBL" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str(d["created"]>=5 and all(i["dueDate"].startswith("2026-10") for i in d["items"])).lower())')"
chk "obligation invoices idempotent" 0 "$(curl -s -b $CA $H -X POST $B/obligations/invoices -d '{"ym":"2026-10"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["created"])')"
chk "installment monthsLeft decremented" 8 "$(curl -s -b $CA $B/obligations | python3 -c 'import sys,json;print([o for o in json.load(sys.stdin) if o["kind"]=="Рассрочка"][0]["monthsLeft"])')"
CT=$(curl -s -b $CA $B/contracts | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["id"])')
chk "contract file attach" 200 "$(code -b $CA $H -X POST "$B/contracts/$CT/file" -d "{\"name\":\"договор.png\",\"type\":\"image/png\",\"data\":\"$PNG\"}")"
CKEY=$(curl -s -b $CA $B/contracts/$CT | python3 -c 'import sys,json;print(json.load(sys.stdin)["file"]["key"])')
chk "contract file GET pm 200" 200 "$(code -b $CP $B/files/$CKEY)"
chk "contract file key prefixed" true "$(case "$CKEY" in contracts-*) echo true;; *) echo false;; esac)"
BK=$(curl -s -b $CO $B/backup)
N0=$(echo "$BK" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["invoices"]))')
curl -s -b $CA $H -X POST $B/invoices -d '{"company":"MOST Project","contractor":"После бэкапа","amount":5}' >/dev/null
chk "restore accountant 403" 403 "$(code -b $CA $H -X POST $B/restore -d '{"data":{"ops":[]}}')"
chk "restore bad file 400" 400 "$(code -b $CO $H -X POST $B/restore -d '{"data":{"foo":1}}')"
echo "$BK" | python3 -c 'import sys,json;print(json.dumps({"data":json.load(sys.stdin)}))' > $SCR/restore.json
chk "restore owner" 200 "$(code -b $CO $H -X POST $B/restore --data-binary @$SCR/restore.json)"
chk "restore reverted invoices count" "$N0" "$(curl -s -b $CA $B/invoices | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')"
chk "restore made safety backup" true "$(ls $DATA_DIR/backups/ | grep -q before-restore && echo true || echo false)"
chk "login still works after restore" 200 "$(code -b $CA $B/me)"

echo "== контрагенты, связки, разнесение, карточка, секретарь =="
chk "counterparties rebuild" true "$(curl -s -b $CA $H -X POST $B/counterparties/rebuild | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str(d["added"]>300 and d["total"]>300).lower())')"
chk "counterparties rebuild idempotent" 0 "$(curl -s -b $CA $H -X POST $B/counterparties/rebuild | python3 -c 'import sys,json;print(json.load(sys.stdin)["added"])')"
chk "counterparties stats admin" 200 "$(code -b $CA $B/counterparties/stats)"
chk "pm reads counterparties" 200 "$(code -b $CP $B/counterparties)"
chk "pm stats 403" 403 "$(code -b $CP $B/counterparties/stats)"
AL=$(curl -s -b $CA $H -X POST $B/ops/allocate -d '{"apply":false}')
chk "allocate proposals found" true "$(echo "$AL" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str(len(d["proposals"])>=20 and all(p["project"] and p["contractId"] for p in d["proposals"])).lower())')"
FIRST=$(echo "$AL" | python3 -c 'import sys,json;print(json.load(sys.stdin)["proposals"][0]["id"])')
chk "allocate apply one" 1 "$(curl -s -b $CA $H -X POST $B/ops/allocate -d "{\"apply\":true,\"ids\":[\"$FIRST\"]}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["applied"])')"
chk "allocated op has contract + auto flag" true "$(curl -s -b $CA $B/ops/$FIRST | python3 -c 'import sys,json;o=json.load(sys.stdin);print(str(bool(o.get("contractId")) and o.get("autoProject")==True and bool(o.get("project"))).lower())')"
chk "contracts facts" true "$(curl -s -b $CA $B/contracts/facts | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str(len(d)>200 and any(v["paidFact"]>0 for v in d.values())).lower())')"
PID=$(curl -s -b $CA $B/projects | python3 -c 'import sys,json;print([p for p in json.load(sys.stdin) if p["id"]=="Munar Tau"][0]["id"])')
CARD=$(curl -s -b $CA "$B/projects/$(python3 -c "import urllib.parse;print(urllib.parse.quote('$PID'))")/card")
chk "project card admin has fact" true "$(echo "$CARD" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str(d["admin"] and d["fact"]["n"]>100 and len(d["contracts"])>=1).lower())')"
chk "project card pm no ops" true "$(curl -s -b $CP "$B/projects/$(python3 -c "import urllib.parse;print(urllib.parse.quote('$PID'))")/card" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str((not d["admin"]) and d["fact"]["n"]==0 and len(d["contracts"])>=1).lower())')"
STG=$(curl -s -b $CA $H -X POST $B/stages -d "{\"projectId\":\"$PID\",\"name\":\"РП\",\"kind\":\"Рабочий проект\",\"planSum\":50000000,\"planCost\":20000000,\"progress\":40,\"status\":\"work\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
chk "stage created, in card" true "$(curl -s -b $CA "$B/projects/$(python3 -c "import urllib.parse;print(urllib.parse.quote('$PID'))")/card" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str(len(d["stages"])==1 and d["plan"]["income"]==50000000 and d["progress"]==40).lower())')"
curl -s -b $CO $H -X POST $B/users -d '{"login":"sec","password":"secret123","role":"secretary","name":"Секретарь"}' >/dev/null
CS=$SCR/c_sec.txt; curl -s -c $CS $H -X POST $B/login -d '{"login":"sec","password":"secret123"}' >/dev/null
chk "secretary login" 200 "$(code -b $CS $B/me)"
chk "secretary dashboard 403" 403 "$(code -b $CS $B/dashboard)"
chk "secretary ops 200" 200 "$(code -b $CS $B/ops)"
chk "secretary payroll 200" 200 "$(code -b $CS $B/payroll)"
chk "secretary creates doc" 200 "$(code -b $CS $H -X POST $B/docs -d '{"client":"Тест","type":"act","amount":100}')"
chk "secretary creates invoice" 200 "$(code -b $CS $H -X POST $B/invoices -d '{"company":"MOST Project","contractor":"Секр","amount":100}')"
chk "secretary edits contract" 200 "$(code -b $CS $H -X PUT $B/contracts/ct-001 -d '{"note":"x"}')"
chk "secretary proposals" 200 "$(code -b $CS $B/proposals)"
chk "secretary cannot approve" 403 "$(code -b $CS $H -X PUT $B/invoices/$APPR -d '{"approved":false}')"
chk "secretary settings read 200" 200 "$(code -b $CS $B/settings)"
chk "secretary settings write 403" 403 "$(code -b $CS $H -X PUT $B/settings -d '{"vatRate":0.16}')"
chk "secretary users 403" 403 "$(code -b $CS $B/users)"
chk "secretary reports 200" 200 "$(code -b $CS "$B/ops/report?year=2026")"
CP1=$(curl -s -b $CA $B/counterparties | python3 -c 'import sys,json;l=json.load(sys.stdin);print(l[0]["id"],l[1]["id"])')
set -- $CP1
chk "counterparty merge" 200 "$(code -b $CA $H -X POST $B/counterparties/$1/merge -d "{\"into\":\"$2\"}")"
chk "merged source gone" 404 "$(code -b $CA $B/counterparties/$1)"

echo
echo "PASS=$pass FAIL=$fail"
kill $SP 2>/dev/null
