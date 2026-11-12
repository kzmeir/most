import time, json, glob, pathlib
from playwright.sync_api import sync_playwright
import os
SCR = os.environ.get('SCR', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tmp')); os.makedirs(SCR, exist_ok=True)
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
page_html = open(os.path.join(APP, 'web/dist/most-finance.html')).read()
html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}</style></head><body>' + page_html + '</body></html>'
open(f'{SCR}/web_wrapped.html', 'w').write(html)
# начальные данные для мок-базы = seed-документы
store = {}
for f in glob.glob(os.path.join(APP, 'web/dist/seed/*/*.json')):
    p = pathlib.Path(f); store[f'{p.parent.name}/{p.stem}'] = json.load(open(f))
MOCK = """
(() => {
  const SEEDS = %s; let store; try { store = JSON.parse(localStorage.getItem('mockdb')) || SEEDS; } catch { store = SEEDS; } const subs = [];
  let persistT = null; const persist = () => { clearTimeout(persistT); persistT = setTimeout(() => { try { localStorage.setItem('mockdb', JSON.stringify(store)); } catch {} }, 300); };
  const snap = (id, data) => ({ id, exists: data !== undefined, data: () => data, metadata: { fromCache: false, hasPendingWrites: false } });
  const notify = () => { persist(); subs.forEach(s => s()); };
  const docRef = path => ({ id: path.split('/').pop(), path,
    get: async () => snap(path.split('/').pop(), store[path]),
    set: async d => { store[path] = JSON.parse(JSON.stringify(d)); notify(); },
    update: async d => { if (!store[path]) throw { code: 'invalid_argument' }; Object.assign(store[path], d); notify(); },
    delete: async () => { delete store[path]; notify(); },
    onSnapshot: (next) => { const fire = () => next(snap(path.split('/').pop(), store[path])); subs.push(fire); setTimeout(fire, 5); return () => {}; } });
  const colRef = name => ({ path: name, doc: id => docRef(name + '/' + (id || Math.random().toString(16).slice(2))),
    get: async () => { const docs = Object.entries(store).filter(([k]) => k.startsWith(name + '/') && k.split('/').length === 2).map(([k, v]) => snap(k.split('/')[1], v)); return { docs, size: docs.length, empty: !docs.length }; },
    onSnapshot: (next) => { const fire = () => { const docs = Object.entries(store).filter(([k]) => k.startsWith(name + '/') && k.split('/').length === 2).map(([k, v]) => snap(k.split('/')[1], v)); next({ docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false }, docChanges: () => [] }); }; subs.push(fire); setTimeout(fire, 5); return () => {}; } });
  const db = { doc: docRef, collection: colRef };
  const ROLE = window.__MOCK_ROLE || 'owner';
  const people = { u_owner: 'Мейр', u_buh: 'Гульнара (бухгалтер)', u_pm: 'Арман (ПМ)' };
  const meId = ROLE === 'owner' ? 'u_owner' : ROLE === 'pm' ? 'u_pm' : 'u_buh';
  const user = { isOwner: async () => ROLE === 'owner', canEdit: async () => ROLE !== 'pm', can: async () => null,
    me: async () => ({ id: meId, name: people[meId], avatarUrl: '', color: '#000', email: null, isOwner: ROLE === 'owner', canEdit: ROLE !== 'pm' }),
    id: async () => meId, profiles: async ids => Object.fromEntries([].concat(ids).map(i => [i, { id: i, name: people[i] || '', avatarUrl: '', color: '#000', email: null, isMe: i === meId }])),
    search: async q => Object.entries(people).filter(([i, n]) => n.toLowerCase().includes((q || '').toLowerCase())).map(([i, n]) => ({ id: i, name: n, avatarUrl: '', color: '#000', email: null, isMe: i === meId })) };
  window.__saved = []; const downloads = { save: async r => { window.__saved.push({ filename: r.filename, size: r.data.length }); return { status: 'saved' }; } };
  window.__assets = []; const assets = ROLE === 'pm' ? null : { upload: async (blob, o) => { const id = ('a' + Math.random().toString(16).slice(2)).padEnd(32, '0').slice(0, 32); window.__assets.push({ id, size: blob.size, type: (o && o.type) || blob.type }); return { id, url: '/_blob/' + id, sizeBytes: blob.size, contentType: (o && o.type) || blob.type }; }, list: async () => ({ assets: [], usage: {} }), delete: async id => { window.__assets = window.__assets.filter(a => a.id !== id); return { deleted: true }; } };
  window.claude = { use: async name => new Promise(res => setTimeout(() => res(({ db, user, downloads, assets })[name] || null), 30)) };
  window.__store = store;
})();
""" % json.dumps(store, ensure_ascii=False)
fails = []
def ok(name, cond):
    print(('  ✓ ' if cond else '  ✗ ') + name)
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch(**({'executable_path': os.environ['CHROME']} if os.environ.get('CHROME') else {})); CTX = b.new_context()
    def open_as(role, w=1280):
        pg = CTX.new_page(); pg.set_viewport_size({'width': w, 'height': 820}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.add_init_script(f"window.__MOCK_ROLE='{role}';" + MOCK)
        pg.goto('file://' + SCR + '/web_wrapped.html'); return pg, errs
    pg, errs = open_as('owner')
    pg.wait_for_selector('#nav', timeout=10000); time.sleep(0.8)
    ok('owner nav has 14 items', pg.locator('#nav a').count() == 14)
    ok('owner name shown', 'Мейр' in pg.locator('.me').inner_text() and 'Владелец' in pg.locator('.me').inner_text())
    ok('no logout button', pg.locator('#logout').count() == 0)
    t = pg.locator('#main').inner_text(); print('   dashboard:', t[:220].replace('\n', ' | '))
    ok('dashboard shows invoices 7 471 884', '7\u00a0471\u00a0884' in t)
    ok('dashboard shows untagged', 'Не разнесено' in t)
    pg.screenshot(path=f'{SCR}/web-shot-dashboard.png')
    for sec in ['ops', 'docs', 'invoices', 'projects', 'contracts', 'subcontracts', 'proposals', 'payroll', 'obligations', 'settings']:
        pg.goto('file://' + SCR + '/web_wrapped.html#/' + sec); time.sleep(0.6)
        txt = pg.locator('#main').inner_text(); ok(f'section {sec}', 'Загрузка…' not in txt and len(txt) > 20)
    # доступ и роли
    ok('access block present', pg.locator('#acc-q').count() == 1 and 'Пользователи и роли' not in pg.locator('#main').inner_text())
    pg.fill('#acc-q', 'Гульнара'); time.sleep(0.4); ok('search hit shown', pg.locator('[data-act=accessAdd]').count() == 1)
    pg.click('[data-act=accessAdd]'); time.sleep(0.6)
    ok('role saved to meta/roles', pg.evaluate("window.__store['meta/roles'] && window.__store['meta/roles'].roles.u_buh === 'accountant'"))
    ok('owner id saved', pg.evaluate("window.__store['meta/roles'].owner === 'u_owner'"))
    pg.screenshot(path=f'{SCR}/web-shot-settings.png')
    # скачать базу → downloads.save
    pg.click('text=Скачать всю базу (JSON)'); time.sleep(0.5)
    ok('download via capability', pg.evaluate("window.__saved.length === 1 && window.__saved[0].filename.endsWith('.json') && window.__saved[0].size > 10000"))
    pg.click('text=Экспорт счетов'); time.sleep(0.4); ok('csv export via capability', pg.evaluate("window.__saved.length === 2 && window.__saved[1].filename === 'invoices-1c.csv'"))
    # очередь
    pg.goto('file://' + SCR + '/web_wrapped.html#/docs'); time.sleep(0.5); pg.click('[data-act=docAdd]'); pg.wait_for_selector('#modal form')
    pg.fill('#modal input[name=client]', 'Everest'); pg.fill('#modal textarea[name=description]', 'Акт по Алмеу'); pg.fill('#modal input[name=amount]', '46888030'); pg.click('#modal button[type=submit]'); time.sleep(0.7)
    ok('doc created with requester name', pg.locator('.q-card').count() >= 1 and 'Мейр' in pg.locator('.q-card').first.inner_text())
    ok('doc stored in db', pg.evaluate("Object.keys(window.__store).filter(k => k.startsWith('docs/')).length === 48"))
    # счёт → оплачен → расход
    pg.goto('file://' + SCR + '/web_wrapped.html#/invoices'); time.sleep(0.6); n0 = pg.locator('tbody tr').count()
    e0 = pg.evaluate("window.__store['opsm/2026-09'].items.length")
    pg.locator('tbody tr').first.locator('[data-act=invStatus][data-status=paid]').click(); time.sleep(0.7)
    e1 = pg.evaluate("window.__store['opsm/2026-09'].items.length")
    ok('paid → op added to month doc', e1 == e0 + 1 and pg.locator('tbody tr').count() == n0 - 1)
    # ops: inline edit in web
    pg.goto('file://' + SCR + '/web_wrapped.html#/ops?year=2026&untagged=1'); time.sleep(1.0)
    a0 = pg.evaluate("[].concat(...Object.keys(window.__store).filter(k=>k.startsWith('opsm/2026')).map(k=>window.__store[k].items)).filter(o=>o.auto).length")
    pg.locator('.cell-edit.auto').first.click(); time.sleep(0.3); pg.locator('tbody select').first.select_option(index=2); time.sleep(0.9)
    a1 = pg.evaluate("[].concat(...Object.keys(window.__store).filter(k=>k.startsWith('opsm/2026')).map(k=>window.__store[k].items)).filter(o=>o.auto).length")
    ok('web inline edit clears auto in month doc', a1 == a0 - 1)
    pg.screenshot(path=f'{SCR}/web-shot-ops.png')
    ok('audit written', pg.evaluate("(window.__store['meta/audit'].items||[]).length >= 3"))
    ok('owner: no JS errors', not errs); errs and print('   ', errs[:3])
    pg.goto('file://' + SCR + '/web_wrapped.html#/payroll?tab=employees'); time.sleep(0.8)
    ok('web employees tab', pg.locator('tbody tr').count() > 30)
    pg.goto('file://' + SCR + '/web_wrapped.html#/payroll'); time.sleep(0.8)
    ok('web payroll expanded lines', pg.locator('tr.row-detail tbody tr').count() > 30)
    r = pg.evaluate("window.__apiFetch('/ops/bulk', {method:'POST', body:{account:'MOST', items:[{date:'2026-09-10',debit:50000,credit:0,counterparty:'ТОО ПрофТорг',purpose:'За товары',opNo:'999'}]}}).then(r => r.json())")
    ok('web bulk import', r.get('imported') == 1)
    r = pg.evaluate("window.__apiFetch('/invoices/bulk', {method:'POST', body:{items:[{ref:0,company:'MOST Project',contractor:'ТОО Веб-Импорт',amount:77000,purpose:'тест'},{ref:1,company:'MOST Project',contractor:'ТОО Веб-Импорт',amount:77000,purpose:'тест'}]}}).then(r => r.json())")
    ok('web invoices bulk + dedupe', r.get('imported') == 1 and r.get('skipped') == 1 and r['items'][0].get('ref') == 0)
    iid = r['items'][0]['id']
    r = pg.evaluate("(id) => window.__apiFetch('/invoices/' + id + '/file', {method:'POST', body:{name:'счёт.png', type:'image/png', data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='}}).then(r => r.json())", iid)
    ok('web invoice file → asset id stored', bool(r.get('file')) and len(r['file']['key']) == 32 and pg.evaluate("window.__assets.length") == 1)
    ok('web invoice doc in store has file', pg.evaluate("(id) => !!(window.__store['invoices/' + id] && window.__store['invoices/' + id].file)", iid))
    pg.goto('file://' + SCR + '/web_wrapped.html#/invoices?status=all&text=Веб-Импорт'); time.sleep(0.8)
    ok('web file chip rendered', pg.locator('.file-chip').count() == 1)
    pg.click('tr.row-click'); time.sleep(0.4)
    ok('web preview uses /_blob/ url', pg.evaluate("(document.querySelector('#modal img.preview-img')||{}).getAttribute && document.querySelector('#modal img.preview-img').getAttribute('src').startsWith('/_blob/')"))
    pg.keyboard.press('Escape'); time.sleep(0.3)
    r = pg.evaluate("(id) => window.__apiFetch('/invoices/' + id, {method:'DELETE'}).then(r => r.status)", iid)
    ok('web delete invoice removes asset', r == 200 and pg.evaluate("window.__assets.length") == 0)
    pg.goto('file://' + SCR + '/web_wrapped.html#/ops?year=2026'); time.sleep(0.9)
    ok('web ops has opNo column', '№' in pg.locator('thead').inner_text())
    r = pg.evaluate("window.__apiFetch('/counterparties/rebuild', {method:'POST'}).then(r => r.json())"); ok('web counterparties rebuild', r.get('added', 0) > 300)
    r = pg.evaluate("window.__apiFetch('/ops/allocate', {method:'POST', body:{apply:true}}).then(r => r.json())"); ok('web allocate applied', r.get('applied', 0) >= 10)
    r = pg.evaluate("window.__apiFetch('/projects/Munar%20Tau/card').then(r => r.json())"); ok('web project card', r.get('admin') and r['fact']['n'] > 100)
    pg.goto('file://' + SCR + '/web_wrapped.html#/counterparties'); time.sleep(1.0); ok('web counterparties page', pg.locator('tbody tr').count() > 50)
    pg.goto('file://' + SCR + '/web_wrapped.html#/project?id=Munar%20Tau'); time.sleep(1.0); ok('web project card page', 'Маржа факт' in pg.locator('#main').inner_text())
    r = pg.evaluate("window.__apiFetch('/balances').then(r => r.json())"); ok('web balances', isinstance(r, list) and any(b['id'] == 'MOST' for b in r))
    r = pg.evaluate("window.__apiFetch('/ops/report?year=2026').then(r => r.json())"); ok('web report', len(r.get('months', [])) == 12 and r['total']['n'] > 100)
    r = pg.evaluate("window.__apiFetch('/obligations/invoices', {method:'POST', body:{ym:'2026-12'}}).then(r => r.json())"); ok('web obligation invoices', r.get('created', 0) >= 5)
    pg.goto('file://' + SCR + '/web_wrapped.html#/invoices?view=calendar'); time.sleep(0.8); ok('web payment calendar', pg.locator('.due-inline').count() >= 5)
    pg.goto('file://' + SCR + '/web_wrapped.html#/reports?year=2026'); time.sleep(0.9); ok('web reports page', 'По месяцам' in pg.locator('#main').inner_text())
    pg.click('text=Отчёты'); time.sleep(0.3)
    bk = pg.evaluate("window.__apiFetch('/backup').then(r => r.json())"); ok('web backup marks lastBackupAt', pg.evaluate("!!(window.__store['meta/settings'] && window.__store['meta/settings'].lastBackupAt)"))
    n_inv = pg.evaluate("Object.keys(window.__store).filter(k => k.startsWith('invoices/')).length")
    t0 = time.time(); r = pg.evaluate("(bk) => window.__apiFetch('/restore', {method:'POST', body:{data: bk}}).then(r => r.json())", bk); print('   restore took %.1fs' % (time.time() - t0)); time.sleep(1.0)
    ok('web restore ok', bool(r.get('restored')) and r['restored'].get('ops', 0) > 1000 and pg.evaluate("Object.keys(window.__store).filter(k => k.startsWith('invoices/')).length") == n_inv)
    ok('web logo svg', pg.evaluate("document.querySelector('.brand .logo svg').getAttribute('viewBox')") == '0 30 143 128')
    # бухгалтер
    pb, errs2 = open_as('accountant'); pb.wait_for_selector('#nav', timeout=10000); time.sleep(0.8)
    ok('accountant sees 14 items and label', pb.locator('#nav a').count() == 14 and 'Бухгалтер' in pb.locator('.me').inner_text())
    pb.goto('file://' + SCR + '/web_wrapped.html#/settings'); time.sleep(0.6)
    ok('accountant: no access block', pb.locator('#acc-q').count() == 0)
    pb.goto('file://' + SCR + '/web_wrapped.html#/docs'); time.sleep(0.6)
    pb.click('.q-card [data-act=docStatus][data-status=in_progress]'); time.sleep(0.6)
    ok('accountant moved doc to in_progress', 'В работе' in pb.locator('.q-card').first.inner_text())
    # ПМ
    pp, errs3 = open_as('pm'); pp.wait_for_selector('#nav', timeout=10000); time.sleep(0.8)
    ok('pm sees 7 nav items', pp.locator('#nav a').count() == 7)
    r = pp.evaluate("window.__apiFetch('/employees').then(r => r.status)"); ok('pm /employees → 403', r == 403)
    pp.goto('file://' + SCR + '/web_wrapped.html#/docs'); time.sleep(0.6)
    ok('pm read-only', pp.locator('[data-act=docAdd]').count() == 0 and pp.locator('[data-act=docStatus]').count() == 0)
    r = pp.evaluate("window.__apiFetch('/ops').then(r => r.status)"); ok('pm /ops → 403', r == 403)
    r = pp.evaluate("window.__apiFetch('/invoices/bulk', {method:'POST', body:{items:[{contractor:'x',amount:1}]}}).then(r => r.status)"); ok('pm invoices bulk → 403', r == 403)
    r = pp.evaluate("window.__apiFetch('/balances').then(r => r.status)"); ok('pm balances → 403', r == 403)
    r = pp.evaluate("window.__apiFetch('/restore', {method:'POST', body:{data:{ops:[]}}}).then(r => r.status)"); ok('pm restore → 403', r == 403)
    r = pp.evaluate("window.__apiFetch('/contracts').then(r => r.status)"); ok('pm /contracts → 200', r == 200)
    r = pp.evaluate("window.__apiFetch('/docs', {method:'POST', body:{client:'x'}}).then(r => r.status)"); ok('pm POST docs → 403', r == 403)
    pp.screenshot(path=f'{SCR}/web-shot-pm.png')
    # без аккаунта
    pn = b.new_context(viewport={'width': 1280, 'height': 820}).new_page()
    pn.add_init_script("window.claude = { use: async () => null };"); pn.goto('file://' + SCR + '/web_wrapped.html'); time.sleep(1.2)
    ok('no account → Нет доступа screen', 'Нет доступа' in pn.locator('#app').inner_text())
    # мобильная ширина
    pm_, _ = open_as('owner', 390); pm_.wait_for_selector('#main', timeout=10000); time.sleep(0.8)
    ok('mobile no horizontal scroll', pm_.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
    b.close()
print('\nFAILS:', fails or 'none')
