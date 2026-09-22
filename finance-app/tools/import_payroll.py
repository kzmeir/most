"""Импорт ведомости ЗП (xls: лист на месяц, блоки MOST Project / MOST Architects) → seed/employees.json, seed/payroll.json.

Запуск: python3 tools/import_payroll.py <ведомость.xls> [--year 2026]
Колонки блока: №, ФИО, ИИН, ЗП на руки (оклад), ЗП <месяц> (факт), Примечание[, компания].
"""
import sys, json, re, pathlib, argparse, collections
import xlrd

ap = argparse.ArgumentParser(); ap.add_argument('xls'); ap.add_argument('--year', type=int, default=2026); ap.add_argument('--out', default='seed')
args = ap.parse_args()
APP = pathlib.Path(__file__).resolve().parent.parent; OUT = APP / args.out; OUT.mkdir(exist_ok=True)
MONTHS = {'январь': 1, 'февраль': 2, 'март': 3, 'апрель': 4, 'май': 5, 'июнь': 6, 'июль': 7, 'август': 8, 'сентябрь': 9, 'октябрь': 10, 'ноябрь': 11, 'декабрь': 12}
wb = xlrd.open_workbook(args.xls)
txt = lambda v: '' if v is None else str(v).strip()
def num(v):
    try: return float(v)
    except (TypeError, ValueError): return 0.0

employees = {}  # key: ИИН или имя
payroll = {}    # ym -> {lines}
order = []
for sh in wb.sheets():
    m = MONTHS.get(sh.name.strip().lower())
    if not m: continue
    ym = f'{args.year}-{m:02d}'; order.append(ym)
    lines = []; block = 0; company = 'MOST Project'
    for r in range(sh.nrows):
        row = [sh.cell_value(r, c) for c in range(sh.ncols)]
        name = txt(row[1]) if len(row) > 1 else ''
        if name.startswith('Фамилия'):
            block += 1; company = 'MOST Project' if block == 1 else 'MOST Architects'; continue
        if txt(row[2]).startswith('Всего') or name.lower().startswith('доплат'): continue
        if not name or not re.search(r'[А-Яа-яӘәҚқҢңӨөҰұҮүҺһІіA-Za-z]', name) or len(row) < 5: continue
        iin = re.sub(r'\D', '', txt(row[2]))
        if len(iin) != 12 and not num(row[3]) and not num(row[4]): continue
        if name.lower().startswith('доп') or 'дни' in txt(row[2]).lower(): continue
        oklad, actual = round(num(row[3])), round(num(row[4]), 2)
        note = txt(row[5]) if len(row) > 5 else ''
        extra = txt(row[6]) if len(row) > 6 else ''
        comp = 'MOST Architects' if 'ARCHITECTS' in (note + extra).upper() else company
        nkey = re.sub(r'\s+', ' ', name.lower()).strip()
        key = next((k for k, v in employees.items() if (iin and v['iin'] == iin) or v['nkey'] == nkey), None) or (iin or nkey)
        e = employees.setdefault(key, {'id': f'emp-{len(employees)+1:03d}', 'name': name, 'nkey': nkey, 'iin': iin, 'company': comp, 'salary': oklad, 'firstMonth': ym, 'lastMonth': ym, 'months': 0})
        if iin and not e['iin']: e['iin'] = iin
        e['salary'] = oklad or e['salary']; e['lastMonth'] = max(e['lastMonth'], ym); e['firstMonth'] = min(e['firstMonth'], ym); e['months'] += 1
        if comp == 'MOST Architects': e['company'] = comp
        lines.append({'employeeId': e['id'], 'company': comp, 'salary': oklad, 'amount': actual, 'note': re.sub(r'\s+', ' ', note + (' · ' + extra if extra and 'ARCHITECTS' not in extra.upper() else '')).strip(' ·')})
    payroll[ym] = lines

last = max(order)
emps = []
for e in employees.values():
    emps.append({'id': e['id'], 'name': e['name'], 'iin': e['iin'], 'company': e['company'], 'position': '', 'salary': e['salary'],
                 'hired': e['firstMonth'] + '-01' if e['firstMonth'] > min(order) else '', 'status': 'active' if e['lastMonth'] == last else 'resigned',
                 'resigned': '' if e['lastMonth'] == last else e['lastMonth'] + '-28', 'vacationDays': 24, 'note': ''})
pay = []
for ym in sorted(payroll):
    ls = payroll[ym]
    pay.append({'id': ym, 'project': round(sum(l['amount'] for l in ls if l['company'] == 'MOST Project'), 2), 'architects': round(sum(l['amount'] for l in ls if l['company'] == 'MOST Architects'), 2), 'lines': ls})
json.dump(emps, open(OUT / 'employees.json', 'w'), ensure_ascii=False); json.dump(pay, open(OUT / 'payroll.json', 'w'), ensure_ascii=False)
print('employees', len(emps), 'active', sum(1 for e in emps if e['status'] == 'active'), '| payroll months', [(p['id'], len(p['lines']), round(p['project'] + p['architects'])) for p in pay])
