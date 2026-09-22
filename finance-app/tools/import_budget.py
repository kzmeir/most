"""Импорт таблицы «Бюджет МОСТ» (xlsx-экспорт Google Sheets) в данные приложения.

Запуск: python3 tools/import_budget.py <budget.xlsx> [--out seed] [--webseed web/dist/seed]

Листы → коллекции:
  Операции                          → ops (все годы), справочники accounts / categories / projects
  Реестр договоров                  → contracts
  Реестр договоров с подрядчиками   → subcontracts
  Реестр АВР                        → docs (акты/счета клиентам, статус «выполнен»)
  Коммерческие предложения          → proposals
  Наличные                          → ops (счёт «nal»)
Операции 2026 без категории/проекта получают автоподсказку по истории контрагента (auto=true).
"""
import sys, json, re, pathlib, collections, datetime as dt, shutil, argparse
import openpyxl

ap = argparse.ArgumentParser()
ap.add_argument('xlsx'); ap.add_argument('--out', default='seed'); ap.add_argument('--webseed', default='web/dist/seed')
args = ap.parse_args()
APP = pathlib.Path(__file__).resolve().parent.parent
OUT = (APP / args.out); OUT.mkdir(parents=True, exist_ok=True)
WEB = (APP / args.webseed)

wb = openpyxl.load_workbook(args.xlsx, data_only=True, read_only=True)

def num(v):
    if v is None: return 0.0
    if isinstance(v, (int, float)): return float(v)
    s = str(v).replace('₸', '').replace('\xa0', '').replace(' ', '').strip()
    if s in ('', '-', '—', ',00'): return 0.0
    if re.search(r',\d{1,2}$', s): s = s.replace('.', '').replace(',', '.')
    else: s = s.replace(',', '')
    try: return float(s)
    except ValueError: return 0.0
def txt(v): return '' if v is None else str(v).strip()
def yes(v): return txt(v).lower() in ('да', 'yes', 'true', '1')
def date(v):
    if isinstance(v, dt.datetime): return v.strftime('%Y-%m-%d')
    m = re.search(r'(\d{1,2})\.(\d{1,2})\.(\d{2,4})', txt(v))
    if m:
        d, mo, y = m.groups(); y = int(y); y = y + 2000 if y < 100 else y
        return f'{y:04d}-{int(mo):02d}-{int(d):02d}'
    return ''

# ---------- справочники ----------
ws = wb['Категории расходов']
categories, projects_ref, accounts = [], [], []
for r in ws.iter_rows(min_row=2, values_only=True):
    r = tuple(r) + (None,) * 6
    if txt(r[0]): categories.append({'id': txt(r[0]), 'name': txt(r[1]) or txt(r[0])})
    if txt(r[2]): projects_ref.append({'id': txt(r[2]), 'name': txt(r[3]) or txt(r[2])})
    if txt(r[4]): accounts.append({'id': txt(r[4])})
KIND = {'Перевод между счетами': 'transfer', 'Депозит': 'transfer', 'ETH': 'transfer',
        'Рабочий проект': 'income', 'Эскизный проект': 'income', 'Авторский надзор': 'income', 'Бартер': 'income',
        'Налоги': 'tax', 'НДС': 'tax', 'Расходы налоги по зп': 'tax', 'Расходы по зп': 'payroll',
        'MEIR': 'owner', 'ILYA': 'owner', 'ADIL': 'owner'}
for c in categories: c['kind'] = KIND.get(c['id'], 'expense')
COMPANY = {'MOST': 'MOST Architects', 'PROJECT осн': 'MOST Project', 'PROJECT': 'MOST Project', 'Халык': 'MOST Project',
           'PROJECT 0874 АР': 'MOST Project', 'PROJECT 2845офис': 'MOST Project', 'PROJECT 2890 ИНЖ': 'MOST Project', 'PROJECT 3388 ГИП': 'MOST Project',
           'PANA': 'ИП PANA Design', 'Most Design': 'ИП MOST Design', 'nal': 'Наличные', 'HomeCreditBank': 'MOST Project'}
NAMES = {'MOST': 'Kaspi · MOST Architects', 'PROJECT осн': 'Kaspi · MOST Project (основной)', 'PROJECT': 'MOST Project (старый)', 'Халык': 'Халык банк',
         'PANA': 'ИП PANA Design', 'Most Design': 'ИП MOST Design', 'nal': 'Наличные', 'HomeCreditBank': 'Home Credit Bank'}

# ---------- операции ----------
ws = wb['Операции']
ops = []
for r in ws.iter_rows(min_row=2, values_only=True):
    r = tuple(r) + (None,) * 12
    if isinstance(r[2], dt.datetime) and not isinstance(r[3], dt.datetime): r = r[:2] + (r[3], r[2]) + r[4:]  # сдвинутые строки ноя.2023–фев.2024
    if not isinstance(r[3], dt.datetime): continue
    acc = txt(r[10]) or 'nal'
    debit, credit, purpose, comment = round(num(r[4]), 2), round(num(r[5]), 2), txt(r[7]), txt(r[11])
    if not debit and not credit and isinstance(r[7], (int, float)): debit, purpose, comment = round(float(r[7]), 2), '', (comment + ' сумма без признака дебет/кредит').strip()
    ops.append({'date': r[3].strftime('%Y-%m-%d'), 'account': acc, 'debit': debit, 'credit': credit,
                'counterparty': txt(r[6]), 'purpose': purpose, 'project': txt(r[8]), 'category': txt(r[9]), 'comment': comment,
                'opNo': txt(r[2]).replace('.0', ''), 'source': 'budget'})
ws = wb['Наличные']
for r in ws.iter_rows(min_row=2, values_only=True):
    r = tuple(r) + (None,) * 20
    if isinstance(r[1], dt.datetime) and num(r[2]):
        ops.append({'date': r[1].strftime('%Y-%m-%d'), 'account': 'nal', 'debit': round(num(r[2]), 2), 'credit': 0, 'counterparty': '', 'purpose': txt(r[3]),
                    'project': txt(r[4]), 'category': '', 'comment': '', 'opNo': '', 'source': 'budget'})
ops.sort(key=lambda o: o['date'])
for i, o in enumerate(ops): o['id'] = f"op-{o['date'].replace('-', '')}-{i+1:05d}"
for o in ops:
    if o['account'] not in [a['id'] for a in accounts]: accounts.append({'id': o['account']})
for a in accounts: a['company'] = COMPANY.get(a['id'], ''); a['name'] = NAMES.get(a['id'], a['id']); a['active'] = a['id'] in ('MOST', 'PROJECT осн', 'Халык', 'PANA', 'Most Design', 'nal')
cat_ids = {c['id'] for c in categories}
for o in ops:
    if o['category'] and o['category'] not in cat_ids: categories.append({'id': o['category'], 'name': o['category'], 'kind': KIND.get(o['category'], 'expense')}); cat_ids.add(o['category'])
proj_ids = {p['id'] for p in projects_ref}
for o in ops:
    if o['project'] and o['project'] not in proj_ids: projects_ref.append({'id': o['project'], 'name': o['project']}); proj_ids.add(o['project'])

# ---------- автоподсказки для неразнесённых ----------
OWN = re.compile(r'most\s*(project|architects)|мост', re.I)
def norm(s): return re.sub(r'[«»"\'“”]|тоо|ип|ао|\s+', '', s.lower())
hist_cat, hist_proj = collections.defaultdict(collections.Counter), collections.defaultdict(list)
for o in ops:
    if o['category']: hist_cat[norm(o['counterparty'])][o['category']] += 1
    if o['project']: hist_proj[norm(o['counterparty'])].append((o['date'], o['project']))
auto_n = 0
for o in ops:
    if o['category']: continue
    p, cp = o['purpose'].lower(), o['counterparty']
    cat = ''
    if OWN.search(cp) and ('депозит' in p): cat = 'Депозит'
    elif OWN.search(cp): cat = 'Перевод между счетами'
    elif re.search(r'угд|государственная корпорация|правительство для граждан|департамент государственных доходов', cp, re.I):
        cat = 'НДС' if 'ндс' in p and 'в т.ч' not in p else ('Расходы налоги по зп' if re.search(r'опв|ипн|осмс|восмс|социальн', p) else 'Налоги')
    elif re.search(r'kaspi bank', cp, re.I) and re.search(r'комисси|вознагражд', p): cat = 'Банк'
    elif re.search(r'заработн|зарплат|аванс сотрудник', p): cat = 'Расходы по зп'
    elif o['credit'] and re.search(r'авторск', p): cat = 'Авторский надзор'
    elif o['credit'] and re.search(r'эскиз', p): cat = 'Эскизный проект'
    elif o['credit'] and re.search(r'рабоч|\bрп\b|проектн', p): cat = 'Рабочий проект'
    else:
        h = hist_cat.get(norm(cp))
        if h:
            top, n = h.most_common(1)[0]
            if n >= 2 and n / sum(h.values()) >= 0.6: cat = top
    if cat: o['category'] = cat; o['auto'] = True; auto_n += 1
    if not o['project'] and cat in ('Перевод между счетами', 'Депозит'): o['project'] = cat
# проект по последней истории контрагента (только для 2026 и не переводов)
auto_p = 0
for o in ops:
    if o['project'] or not o['counterparty'] or o['category'] in ('Перевод между счетами', 'Депозит', 'Банк', 'Налоги', 'НДС', 'Расходы налоги по зп', 'Расходы по зп'): continue
    h = sorted(hist_proj.get(norm(o['counterparty']), []))
    if h and h[-1][0] >= '2025-06-01': o['project'] = h[-1][1]; o['autoProject'] = True; auto_p += 1

# ---------- реестры ----------
ws = wb['Реестр договоров']
contracts = []
for i, r in enumerate(ws.iter_rows(min_row=2, values_only=True)):
    r = tuple(r) + (None,) * 20
    if not txt(r[3]) or not num(r[7]): continue
    contracts.append({'id': f'ct-{len(contracts)+1:03d}', 'code': txt(r[0]), 'name': txt(r[1]), 'dept': txt(r[2]), 'title': txt(r[3]), 'clientShort': txt(r[4]), 'client': txt(r[5]),
                      'company': txt(r[6]).replace('«', '').replace('»', ''), 'sum': num(r[7]), 'paid': num(r[8]), 'remaining': num(r[9]), 'toPay': num(r[10]), 'toClose': num(r[11]), 'closedActs': num(r[12]),
                      'link': txt(r[13]), 'note': txt(r[14]), 'signed': yes(r[15]), 'closed': yes(r[16]), 'source': 'budget'})
ws = wb['Реестр договоров с подрядчиками']
subcontracts = []
for r in ws.iter_rows(min_row=2, values_only=True):
    r = tuple(r) + (None,) * 20
    if not txt(r[3]): continue
    subcontracts.append({'id': f'sc-{len(subcontracts)+1:03d}', 'project': txt(r[0]), 'section': txt(r[1]), 'title': txt(r[3]), 'company': txt(r[4]).replace('«', '').replace('»', ''), 'contractor': txt(r[5]),
                         'sum': num(r[6]), 'paid': num(r[7]), 'byBudget': num(r[8]), 'remaining': num(r[9]), 'toPay': num(r[10]), 'closedActs': num(r[11]), 'link': txt(r[12]), 'note': txt(r[13]),
                         'signed': yes(r[14]), 'closed': yes(r[15]), 'source': 'budget'})
ws = wb['Реестр АВР']
docs = []
for r in ws.iter_rows(min_row=2, values_only=True):
    r = tuple(r) + (None,) * 20
    if not (txt(r[1]) or txt(r[0])) or not (num(r[5]) or num(r[6])): continue
    d = date(r[2])
    docs.append({'id': f'avr-{len(docs)+1:03d}', 'type': 'act', 'number': txt(r[1]), 'actDate': d, 'project': txt(r[0]), 'client': txt(r[3]), 'company': txt(r[4]), 'amount': num(r[5]) or num(r[6]),
                 'invoiceAmount': num(r[6]), 'signed': yes(r[7]), 'paid': yes(r[8]), 'paidAt': date(r[9]), 'description': txt(r[10]), 'status': 'done', 'createdAt': (d or '2024-01-01') + 'T09:00:00Z', 'doneAt': (d or '2024-01-01') + 'T09:00:00Z', 'source': 'budget'})
ws = wb['Коммерческие предложения']
proposals = []
for r in ws.iter_rows(min_row=2, values_only=True):
    r = tuple(r) + (None,) * 20
    if not txt(r[1]).strip(): continue
    proposals.append({'id': f'kp-{len(proposals)+1:03d}', 'no': txt(r[0]).replace('.0', ''), 'title': txt(r[1]), 'client': txt(r[2]), 'sum': num(r[3]), 'status': txt(r[4]), 'contact': txt(r[5]), 'source': 'budget'})

# ---------- проекты: объединяем справочник с ранее собранными ----------
old_projects = json.load(open(OUT / 'projects.json')) if (OUT / 'projects.json').exists() else []
projects = []
seen = set()
for p in old_projects:
    projects.append(p); seen.add(p.get('name', '')); seen.add(p.get('id', ''))
for p in projects_ref:
    if p['id'] in seen or p['name'] in seen: continue
    projects.append({'id': p['id'], 'name': p['name'], 'client': '', 'contractNoVat': 0, 'targetCost': 0, 'status': 'archive'}); seen.add(p['id'])

# ---------- проверка остатков ----------
bal = collections.defaultdict(float)
for o in ops: bal[o['account']] += o['credit'] - o['debit']
print('Остатки по счетам (кредит − дебет за всё время):')
for a, v in sorted(bal.items(), key=lambda x: -abs(x[1])): print(f'  {a:20} {v:>16,.0f}')
by_year = collections.Counter(o['date'][:4] for o in ops)
print('Операций по годам:', dict(sorted(by_year.items())))
un_cat = sum(1 for o in ops if not o['category']); un_pr = sum(1 for o in ops if not o['project'] and o['category'] not in ('Перевод между счетами', 'Депозит', 'Банк', 'Налоги', 'НДС', 'Расходы налоги по зп', 'Расходы по зп'))
print(f'Автокатегория: {auto_n}, автопроект: {auto_p}; без категории осталось: {un_cat}, без проекта: {un_pr}')
months = collections.Counter(o['date'][:7] for o in ops)
big = max(months.items(), key=lambda x: x[1]); print('Месяцев:', len(months), 'самый большой:', big, 'байт:', len(json.dumps([o for o in ops if o['date'][:7] == big[0]], ensure_ascii=False)))

# ---------- запись ----------
def dump(name, data): json.dump(data, open(OUT / f'{name}.json', 'w'), ensure_ascii=False)
dump('ops', ops); dump('accounts', accounts); dump('categories', categories); dump('projects', projects)
dump('contracts', contracts); dump('subcontracts', subcontracts); dump('docs', docs); dump('proposals', proposals)
for old in ('income', 'expenses', 'taxes'): (OUT / f'{old}.json').unlink(missing_ok=True)
print('seed:', {k: len(v) for k, v in [('ops', ops), ('accounts', accounts), ('categories', categories), ('projects', projects), ('contracts', contracts), ('subcontracts', subcontracts), ('docs', docs), ('proposals', proposals)]})

# веб-база: операции месячными документами opsm/YYYY-MM, остальное по одному документу
shutil.rmtree(WEB, ignore_errors=True)
for ym in months:
    (WEB / 'opsm').mkdir(parents=True, exist_ok=True)
    json.dump({'ym': ym, 'items': [o for o in ops if o['date'][:7] == ym]}, open(WEB / 'opsm' / f'{ym}.json', 'w'), ensure_ascii=False)
def doc_id_of(i):
    # id документа в базе артефакта: только [A-Za-z0-9_-.~:@+]; иначе FNV-1a хэш (та же функция в web/db-server.js)
    i = str(i)
    if re.match(r'^[A-Za-z0-9_\-.~:@+]{1,200}$', i): return i
    h = 0x811c9dc5
    for b in i.encode('utf-8'): h = ((h ^ b) * 0x01000193) & 0xffffffff
    return 'k-' + format(h, '08x')
manifest = [{'collection': 'opsm', 'doc_id': ym, 'path': str(WEB / 'opsm' / f'{ym}.json')} for ym in sorted(months)]
for name, data in [('accounts', accounts), ('categories', categories), ('projects', projects), ('contracts', contracts), ('subcontracts', subcontracts), ('docs', docs), ('proposals', proposals)]:
    (WEB / name).mkdir(parents=True, exist_ok=True)
    for d in data:
        did = doc_id_of(d['id']); json.dump(d, open(WEB / name / f'{did}.json', 'w'), ensure_ascii=False); manifest.append({'collection': name, 'doc_id': did, 'path': str(WEB / name / f'{did}.json')})
for name in ('invoices', 'obligations', 'payroll', 'cash', 'employees', 'vacations'):
    f = OUT / f'{name}.json'
    if f.exists():
        (WEB / name).mkdir(parents=True, exist_ok=True)
        for d in json.load(open(f)): json.dump(d, open(WEB / name / f"{d['id']}.json", 'w'), ensure_ascii=False)
json.dump(manifest, open(WEB / 'manifest.json', 'w'), ensure_ascii=False, indent=0)
(WEB / 'meta').mkdir(parents=True, exist_ok=True)
settings = json.load(open(OUT / 'settings.json')) if (OUT / 'settings.json').exists() else {}
settings.setdefault('companies', ['MOST Project', 'MOST Architects']); settings['defaultAccounts'] = {'MOST Project': 'PROJECT осн', 'MOST Architects': 'MOST'}
json.dump(settings, open(OUT / 'settings.json', 'w'), ensure_ascii=False); json.dump(settings, open(WEB / 'meta' / 'settings.json', 'w'), ensure_ascii=False)
print('web seed docs:', sum(1 for _ in WEB.rglob('*.json')))
