'use strict';
// Правка на месте (одно поле — один PUT) без сервера: те же права, что у окон правки. Интерфейс рисует поле только при праве, сервер проверяет ещё раз.
// Запуск из finance-app: node modules/pm/tests/inline_test.js  (последняя строка — «ok» или «fail N»; вызывается и из api_test.sh)
const S = require('../server.js'); const PM = S.domain;
let pass = 0, fail = 0;
const chk = (name, want, got) => { if (String(want) === String(got)) { pass++; console.log(`  ✓ ${name} (${got})`); } else { fail++; console.log(`  ✗ ${name}: ожидалось ${want}, получено ${got}`); } };
const T = PM.today(); let n = 0;
const db = { pmProjects: [{ id: 'p1', track: 'ep', name: 'ЭП-тест', status: 'В работе', risk: 'Низкий', pmId: 'u-pm', gipId: '' }], pmItems: [
  { id: 'i1', pid: 'p1', stage: 1, stageName: 'Этап 1', title: 'Посадка', role: 'ПМ', section: '', done: false, na: false, note: '' },
  { id: 'i2', pid: 'p1', stage: 1, stageName: 'Этап 1', title: 'ОВ: нагрузки', role: 'ОВ', section: 'ОВ', done: false, na: false },
  { id: 'i3', pid: 'p1', stage: 1, stageName: 'Этап 1', title: 'Рендеры', role: 'ГАП', section: 'АР', done: false, na: false, assigneeId: 'u-st' }],
  pmBlockers: [], pmLog: [{ id: 'l1', pid: 'p1', date: T, type: 'note', text: 'Было', files: [], by: 'u-st' }], users: [], projects: [], subcontracts: [], ops: [], contracts: [], settings: { pm: { staffOwnProjects: true } } };
function call(user, method, p, body) {
  let res; const ctx = { parts: ['pm', ...p.split('/')], method, body: body || {}, qs: {}, user, db, D: {}, today: () => T, num: v => Number(v) || 0,
    pick: (o, keys) => Object.fromEntries(keys.filter(k => o && k in o).map(k => [k, o[k]])), modules: {}, emit() {},
    store: { id: () => 'n' + (n++), save() {}, audit() {}, DATA_DIR: '' }, ok: b => (res = { s: 200, b }), err: (s, m) => (res = { s, b: m }), send() {} };
  S.handle(ctx); return res;
}
const OWN = { id: 'u-own', role: 'owner' }, PMU = { id: 'u-pm', role: 'pm' }, PM2 = { id: 'u-pm2', role: 'pm' }, SEC = { id: 'u-sec', role: 'secretary' }, LEAD = { id: 'u-lead', role: 'lead', section: 'ОВ' }, STAFF = { id: 'u-st', role: 'staff' };
const P = () => db.pmProjects[0]; const I = id => db.pmItems.find(i => i.id === id);
// шапка проекта: каждое поле отдельно
for (const [f, v] of [['name', 'ЭП-тест 2'], ['client', 'ТОО «Пример»'], ['status', 'Ждём заказчика'], ['risk', 'Средний'], ['start', '2026-09-01'], ['due', '2027-02-01'], ['address', 'Алматы, ул. Примерная, 1'], ['area', '1200'], ['folder', 'S:\\001-2026-Пример']])
  chk(`ПМ своего проекта: ${f} на месте`, v, (call(PMU, 'PUT', 'projects/p1', { [f]: v }), P()[f]));
chk('ПМ: ГИП/ПМ на месте не меняет (только руководитель)', '/u-pm', (call(PMU, 'PUT', 'projects/p1', { gipId: 'u-x', pmId: 'u-pm2' }), `${P().gipId}/${P().pmId}`));
chk('руководитель: ГИП на месте', 'u-gip', (call(OWN, 'PUT', 'projects/p1', { gipId: 'u-gip' }), P().gipId));
chk('пустое название не сохраняется', 'ЭП-тест 2', (call(OWN, 'PUT', 'projects/p1', { name: '  ' }), P().name));
chk('неизвестный статус не сохраняется', 'Ждём заказчика', (call(OWN, 'PUT', 'projects/p1', { status: 'xxx' }), P().status));
chk('секретарь, чужой ПМ — 403', '403/403', [call(SEC, 'PUT', 'projects/p1', { client: 'x' }).s, call(PM2, 'PUT', 'projects/p1', { address: 'x' }).s].join('/'));
chk('история карточки: статус и сроки записаны для журнала', 'true/true', [P().history.some(h => h.field === 'status' && h.to === 'Ждём заказчика'), P().history.some(h => h.field === 'due')].join('/'));
// пункты: название / срок / исполнитель / заметка
chk('ПМ: название пункта на месте', 'Посадка (вариант 2)', (call(PMU, 'PUT', 'items/i1', { title: 'Посадка (вариант 2)' }), I('i1').title));
chk('ПМ: срок, исполнитель, заметка на месте', '2026-12-01/u-st/Ждём топосъёмку', (call(PMU, 'PUT', 'items/i1', { due: '2026-12-01' }), call(PMU, 'PUT', 'items/i1', { assigneeId: 'u-st' }), call(PMU, 'PUT', 'items/i1', { note: 'Ждём топосъёмку' }), [I('i1').due, I('i1').assigneeId, I('i1').note].join('/')));
chk('руководитель раздела ОВ: срок своего пункта — да, название — нет', '2026-11-11/ОВ: нагрузки', (call(LEAD, 'PUT', 'items/i2', { due: '2026-11-11' }), call(LEAD, 'PUT', 'items/i2', { title: 'чужое' }), `${I('i2').due}/${I('i2').title}`));
chk('руководитель раздела ОВ: пункт АР — 403', 403, call(LEAD, 'PUT', 'items/i3', { note: 'x' }).s);
chk('сотрудник: заметка своего пункта — да; срок и название — нет', 'Готовлю/(пусто)/Рендеры', (call(STAFF, 'PUT', 'items/i3', { note: 'Готовлю' }), call(STAFF, 'PUT', 'items/i3', { due: '2026-10-10', title: 'x' }), [I('i3').note, I('i3').due || '(пусто)', I('i3').title].join('/')));
chk('секретарь: пункт — 403', 403, call(SEC, 'PUT', 'items/i1', { note: 'x' }).s);
chk('история пункта: название и срок записаны', 'true/true', [I('i1').history.some(h => h.field === 'title'), I('i1').history.some(h => h.field === 'due')].join('/'));
// журнал: текст своей записи
chk('сотрудник: текст своей записи на месте', 'Стало', (call(STAFF, 'PUT', 'log/l1', { text: 'Стало' }), db.pmLog[0].text));
chk('пустой текст записи — 400, секретарь — 403', '400/403', [call(STAFF, 'PUT', 'log/l1', { text: ' ' }).s, call(SEC, 'PUT', 'log/l1', { text: 'x' }).s].join('/'));

console.log(`  итого: ${pass} ✓, ${fail} ✗`);
console.log(fail ? `fail ${fail}` : 'ok');
process.exitCode = fail ? 1 : 0;
