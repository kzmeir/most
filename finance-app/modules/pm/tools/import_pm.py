#!/usr/bin/env python3
"""Импорт реестра проектов РП и бюджетов разделов в JSON для POST /api/pm/import (модуль pm).

Источники:
  --registry  MOST_Планирование_проектов.xlsx (Google Drive, fileId 1zkp4Lwq7p4y0dpEmPOw33zIrOyEAosMs):
              листы «Реестр» (20 объектов), «Блокеры», «Задачи» (карточки Trello), «Шаблон этапов» (79 пунктов).
  --budget    G:\\Мой диск\\Финансы\\Бюджеты проектов\\MOST_Проекты РП_Бюджет.xlsx — лист на проект: контракт, разделы, доля ГИПа.
  --db        db.json (необязательно) — проверить, что коды финансовых проектов существуют.
Результат — JSON (по умолчанию data-dev/pm/pm-import.json); в интерфейсе: Сводка → «Импорт» (только руководитель).
Реальные данные компании: результат не коммитить (data-dev/ в .gitignore).

Запуск:  python modules/pm/tools/import_pm.py [--registry ...] [--budget ...] [--out ...] [--db ...]
Нужен openpyxl (pip install openpyxl).
"""
import sys, json, re, argparse, datetime, pathlib
try:
    import openpyxl
except ImportError:
    sys.exit('Нужен openpyxl: python -m pip install openpyxl')
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

APP = pathlib.Path(__file__).resolve().parents[3]  # finance-app
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--registry', default=str(APP / 'data-dev' / 'pm' / 'MOST_Планирование_проектов.xlsx'))
ap.add_argument('--budget', default=r'G:\Мой диск\Финансы\Бюджеты проектов\MOST_Проекты РП_Бюджет.xlsx')
ap.add_argument('--db', default=str(APP / 'data-dev' / 'pm' / 'db.json'))
ap.add_argument('--out', default=str(APP / 'data-dev' / 'pm' / 'pm-import.json'))
ap.add_argument('--since', default='', help='дата, с которой висят блокеры без даты (по умолчанию — дата файла реестра)')
args = ap.parse_args()

# объект реестра → код финансового проекта (db.projects.id, как в операциях). Пусто — не привязывать.
FINANCE_MAP = {
    'Бц Толе би': 'Hayat Толе би',
    'Эверест Парк': 'Эверест ПАРК РП',
    'Спорт центр': '',
    'Азамат — Атлетик': 'ЖК Азамат РП',
    'Хаят Арена 1': 'Hayat Arena RP',
    'Дзюдо центр': 'ДЗЮДО ЦЕНТР',
    'Венеция 1 очередь': 'prj-011',
    'Туркестан': 'Туркестан РП',
    'АХБК 6 этажей': 'Шаляпина АХБК РП',
    'Эверест ФОК': 'ФОК РП',
    'Эверест Офис': 'Эверест офис',
    'Магнит 2 очередь': 'ЖК Айгерим РП',
    'Алмеу 1 очередь': 'Алмеу РП',
    'Алмеу 2 очередь': 'Алмеу РП',
    'Алмеу 3 очередь': 'Алмеу РП',
    'Меллиора 2': 'HM2',
    'Теректи': 'Теректи РП',
    'Жезказган': 'EDG Жезказган РП',
    'Алатауская': 'Эверест Алатауская трасса',
    'Монтеросса': 'Monte Rossa RP',
}
# лист бюджета → объект реестра
BUDGET_MAP = {'Venice 1': 'Венеция 1 очередь', 'БЦ Толе би': 'Бц Толе би', 'Everest Park': 'Эверест Парк', 'Дзюдо центр': 'Дзюдо центр',
              'Меллиора 2': 'Меллиора 2', 'Алатауская трасса': 'Алатауская', 'Хаят Арена 1': 'Хаят Арена 1', 'Теректи 1': 'Теректи'}
BUDGET_SKIP = {'Сводная', 'ФОТ'}
ROLES = ('ПМ', 'ГИП', 'ГАП', 'ГКП', 'ГП', 'ОВ', 'ВК', 'ЭЛ', 'СС', 'ГСВ', 'ТХ', 'Сметчик', 'Визуализатор', 'Заказчик')


def txt(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def norm(s):
    return re.sub(r'\s+', ' ', txt(s)).lower().replace('ё', 'е')


def date(v):
    if v is None or v == '':
        return ''
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%Y-%m-%d')
    s = txt(v)
    m = re.match(r'^(\d{1,2})\.(\d{1,2})\.(\d{4})', s)
    if m:
        return f'{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}'
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', s)
    return m.group(0) if m else ''


def num(v):
    if v is None or v == '':
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = txt(v).replace('\u00a0', '').replace(' ', '').replace(',', '.').rstrip('%')
    try:
        return float(s)
    except ValueError:
        return 0.0


def pct(v):
    if v is None or v == '':
        return None
    if isinstance(v, (int, float)):
        return float(v) if v <= 1 else float(v) / 100
    s = txt(v)
    n = num(s)
    return n / 100 if s.endswith('%') or n > 1 else n


def rows_of(ws):
    return [list(r) for r in ws.iter_rows(values_only=True)]


def find_header(rows, *labels):
    """строка, где встречаются все подписи; вернуть (индекс строки, {подпись: колонка})"""
    want = [norm(l) for l in labels]
    for i, r in enumerate(rows):
        cells = [norm(c) for c in r]
        if all(any(c.startswith(w) for c in cells) for w in want):
            return i, {norm(c): j for j, c in enumerate(r) if txt(c)}
    return -1, {}


def col(hmap, label):
    w = norm(label)
    for k, j in hmap.items():
        if k.startswith(w):
            return j
    return None


def cell(r, j):
    return r[j] if j is not None and j < len(r) else None


notes = []
reg_path = pathlib.Path(args.registry)
if not reg_path.exists():
    sys.exit(f'Нет файла реестра: {reg_path}')
wb = openpyxl.load_workbook(reg_path, data_only=True, read_only=True)


def sheet(name):
    return next((wb[s] for s in wb.sheetnames if norm(s).startswith(norm(name))), None)


# --- Реестр ---
ws = sheet('Реестр') or sys.exit('Нет листа «Реестр»')
rows = rows_of(ws)
hi, h = find_header(rows, '№', 'Объект', 'Стадия', 'Статус')
if hi < 0:
    sys.exit('В листе «Реестр» не найдена шапка (№, Объект, Стадия, Статус)')
C = {k: col(h, k) for k in ['Объект', 'ГИП', 'Заказчик', 'Стадия', 'Статус', 'Дата старта', 'Дата по договору', 'Прогноз', '% готов', 'Риск', 'Комментарий']}
projects = {}
order = []
for r in rows[hi + 1:]:
    name = txt(cell(r, C['Объект']))
    if not name or name.upper().startswith('ПРИМЕР'):
        continue
    p = {'name': name, 'track': 'rp', 'client': txt(cell(r, C['Заказчик'])), 'gipName': txt(cell(r, C['ГИП'])), 'stageName': txt(cell(r, C['Стадия'])),
         'status': txt(cell(r, C['Статус'])) or 'В работе', 'start': date(cell(r, C['Дата старта'])), 'due': date(cell(r, C['Дата по договору'])),
         'forecast': date(cell(r, C['Прогноз'])), 'risk': txt(cell(r, C['Риск'])) or 'Низкий', 'comment': txt(cell(r, C['Комментарий'])),
         'projectId': FINANCE_MAP.get(name, ''), 'tasks': [], 'blockers': []}
    m = re.match(r'^(\d+)\s*\.', p['stageName'])
    p['stage'] = int(m.group(1)) if m else 0
    pc = pct(cell(r, C['% готов']))
    if pc is not None:
        p['pctRegistry'] = round(pc, 3)
    if name not in FINANCE_MAP:
        notes.append(f'Реестр: объект «{name}» не описан в FINANCE_MAP — без привязки к финансам')
    projects[norm(name)] = p
    order.append(norm(name))


def proj(name):
    k = norm(name)
    if k in projects:
        return projects[k]
    for kk, p in projects.items():
        if k and (k in kk or kk in k):
            return p
    return None


# --- Блокеры ---
ws = sheet('Блокеры')
if ws:
    rows = rows_of(ws)
    hi, h = find_header(rows, 'Объект', 'Чего ждём', 'Кто держит')
    C = {k: col(h, k) for k in ['Объект', 'Чего ждём', 'Кто держит', 'Ответственный', 'Ожидаемая дата', 'Статус', 'Последний контакт', 'Комментарий']}
    for r in (rows[hi + 1:] if hi >= 0 else []):
        name = txt(cell(r, C['Объект']))
        what = txt(cell(r, C['Чего ждём']))
        if not name or not what:
            continue
        p = proj(name)
        if not p:
            notes.append(f'Блокеры: объект «{name}» не найден в реестре — пропущен')
            continue
        p['blockers'].append({'what': what, 'holder': txt(cell(r, C['Кто держит'])) or 'Заказчик', 'ownerName': txt(cell(r, C['Ответственный'])),
                              'expected': date(cell(r, C['Ожидаемая дата'])), 'status': txt(cell(r, C['Статус'])) or 'Открыт',
                              'lastContact': date(cell(r, C['Последний контакт'])), 'comment': txt(cell(r, C['Комментарий']))})
else:
    notes.append('Нет листа «Блокеры»')

# --- Задачи (Trello) ---
ws = sheet('Задачи')
if ws:
    rows = rows_of(ws)
    hi, h = find_header(rows, 'Объект', 'Этап', 'Задача')
    C = {k: col(h, k) for k in ['Объект', 'Этап', 'Задача', 'Ответственный', 'Статус', 'Срок', 'Комментарий']}
    for r in (rows[hi + 1:] if hi >= 0 else []):
        name = txt(cell(r, C['Объект']))
        title = txt(cell(r, C['Задача']))
        if not name or not title:
            continue
        p = proj(name)
        if not p:
            notes.append(f'Задачи: объект «{name}» не найден в реестре — пропущена «{title}»')
            continue
        role = txt(cell(r, C['Ответственный'])) or 'ГИП'
        p['tasks'].append({'title': title, 'stage': txt(cell(r, C['Этап'])), 'role': role if role in ROLES else 'ГИП',
                           'status': txt(cell(r, C['Статус'])), 'due': date(cell(r, C['Срок'])), 'comment': txt(cell(r, C['Комментарий']))})
else:
    notes.append('Нет листа «Задачи»')

# --- Шаблон этапов (справочно, для сверки с domain.js) ---
template = []
ws = sheet('Шаблон')
if ws:
    rows = rows_of(ws)
    hi, h = find_header(rows, '№', 'Этап', 'Пункт')
    C = {k: col(h, k) for k in ['№', 'Этап', 'Пункт', 'Ответственный']}
    for r in (rows[hi + 1:] if hi >= 0 else []):
        if not txt(cell(r, C['Пункт'])):
            continue
        n = num(cell(r, C['№']))
        template.append({'n': int(n) if n else len(template) + 1, 'stage': txt(cell(r, C['Этап'])), 'title': txt(cell(r, C['Пункт'])), 'who': txt(cell(r, C['Ответственный']))})

# --- Бюджеты разделов ---
budgets = {}
bpath = pathlib.Path(args.budget)
if bpath.exists():
    wb2 = openpyxl.load_workbook(bpath, data_only=True, read_only=True)
    for sn in wb2.sheetnames:
        if sn in BUDGET_SKIP:
            continue
        rows = rows_of(wb2[sn])
        b = {'sheet': sn, 'sections': []}
        in_sec = False
        for r in rows:
            lab = txt(cell(r, 1))
            val = cell(r, 2)
            if not lab:
                continue
            L = norm(lab)
            if L.startswith('тип объекта'):
                b['objectType'] = txt(val)
            elif L.startswith('контракт с ндс'):
                b['contractVat'] = num(val)
            elif L.startswith('без ндс'):
                b['contract'] = num(val)
            elif L.startswith('площадь общая'):
                b['area'] = num(val)
            elif L.startswith('длительность'):
                b['months'] = num(val)
            elif L.startswith('целевая маржа'):
                b['marginTarget'] = pct(val)
            elif L.startswith('доля гипа'):
                b['gipSum'] = num(val)
            elif L.startswith('раздел'):
                in_sec = True
            elif L.startswith('итого себестоимость'):
                in_sec = False
                b['costSheet'] = num(val)
            elif in_sec and not lab.startswith('*'):
                b['sections'].append({'name': lab, 'sum': round(num(val)), 'executor': txt(cell(r, 4))})
        if not b.get('contract') and not b['sections']:
            notes.append(f'Бюджет: лист «{sn}» пустой — пропущен')
            continue
        target = BUDGET_MAP.get(sn)
        p = proj(target) if target else None
        if not p:
            notes.append(f'Бюджет: лист «{sn}» не сопоставлен с объектом реестра (BUDGET_MAP) — пропущен')
            continue
        p['budget'] = {k: b.get(k) for k in ['contract', 'contractVat', 'area', 'months', 'marginTarget', 'gipSum', 'objectType']}
        p['budget']['sections'] = b['sections']
        p['budget']['note'] = f'из {bpath.name}, лист «{sn}»'
        budgets[sn] = p['name']
else:
    notes.append(f'Файл бюджета не найден: {bpath} — бюджеты не импортированы')

# --- проверка кодов финансовых проектов ---
dbp = pathlib.Path(args.db)
if dbp.exists():
    try:
        ids = {x['id'] for x in json.loads(dbp.read_text(encoding='utf-8')).get('projects', [])}
        for p in projects.values():
            if p['projectId'] and p['projectId'] not in ids:
                notes.append(f'Финансы: код «{p["projectId"]}» для «{p["name"]}» не найден в db.projects — привязка снята')
                p['projectId'] = ''
    except Exception as e:  # noqa: BLE001
        notes.append(f'db.json не прочитан: {e}')

since = args.since or datetime.datetime.fromtimestamp(reg_path.stat().st_mtime).strftime('%Y-%m-%d')
out = {'source': f'{reg_path.name} + {bpath.name}', 'generated': datetime.datetime.now().isoformat(timespec='seconds'), 'since': since, 'mode': 'skip',
       'projects': [projects[k] for k in order], 'template': template, 'budgets': budgets, 'notes': notes}
outp = pathlib.Path(args.out)
outp.parent.mkdir(parents=True, exist_ok=True)
outp.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
P = out['projects']
print(f'Проектов: {len(P)}; задач Trello: {sum(len(p["tasks"]) for p in P)}; блокеров: {sum(len(p["blockers"]) for p in P)}; '
      f'бюджетов: {len(budgets)}; пунктов шаблона в реестре: {len(template)}')
print(f'С привязкой к финансам: {sum(1 for p in P if p["projectId"])} из {len(P)}')
for n in notes:
    print(' -', n)
print('→', outp)
