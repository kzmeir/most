'use strict';
// Канбан модуля pm без сервера: колонка пункта ↔ «сделано» (domain.kanbanPatch / itemKanban), права на перетаскивание и событие pm.item.done при «Готово».
// Запуск из finance-app: node modules/pm/tests/kanban_test.js  (последняя строка — «ok» или «fail N»; вызывается и из api_test.sh)
const path = require('path');
const S = require('../server.js'); const PM = S.domain;
let CRM = null; try { CRM = require(path.join(__dirname, '../../crm/server.js')); } catch { /* модуль crm не подключён — проверка чтения события пропускается */ }
let pass = 0, fail = 0;
const chk = (name, want, got) => { if (String(want) === String(got)) { pass++; console.log(`  ✓ ${name} (${got})`); } else { fail++; console.log(`  ✗ ${name}: ожидалось ${want}, получено ${got}`); } };

// ---- чистая логика ----
chk('без kstatus и rmStatus — «К выполнению»', 'todo', PM.itemKanban({}));
chk('done сильнее kstatus', 'done', PM.itemKanban({ done: true, kstatus: 'doing' }));
chk('rmStatus дорожной карты → колонка', 'todo/doing/review/review', ['НЕ НАЧАТО', 'В РАБОТЕ', 'У ГАПа', 'У ЗАКАЗЧИКА'].map(l => PM.itemKanban({ rmStatus: l })).join('/'));
chk('kstatus сильнее rmStatus', 'review', PM.itemKanban({ rmStatus: 'В РАБОТЕ', kstatus: 'review' }));
chk('kanbanPatch: «Готово» = done', 'true/done', (p => p.done + '/' + p.kstatus)(PM.kanbanPatch({}, { kstatus: 'done' })));
chk('kanbanPatch: открытая колонка у сделанного — возврат', 'false/review', (p => p.done + '/' + p.kstatus)(PM.kanbanPatch({ done: true }, { kstatus: 'review' })));
chk('kanbanPatch: открытая колонка у несделанного done не трогает', 'false/doing', (p => ('done' in p) + '/' + p.kstatus)(PM.kanbanPatch({ done: false }, { kstatus: 'doing' })));
chk('kanbanPatch: галочка «сделано» → колонка «Готово»', 'true/done', (p => p.done + '/' + p.kstatus)(PM.kanbanPatch({}, { done: true })));
chk('kanbanPatch: снятие галочки → «В работе»', 'false/doing', (p => p.done + '/' + p.kstatus)(PM.kanbanPatch({ done: true, kstatus: 'done' }, { done: 'false' })));
chk('kanbanPatch: неизвестная колонка отброшена', 'false/false', (p => ('kstatus' in p) + '/' + ('done' in p))(PM.kanbanPatch({ done: true }, { kstatus: 'xxx' })));
chk('kanbanPatch: done:true вместе с открытой колонкой — побеждает «сделано»', 'true/done', (p => p.done + '/' + p.kstatus)(PM.kanbanPatch({}, { kstatus: 'doing', done: true })));
const P = { id: 'p1', track: 'rp', gipId: 'u-gip', pmId: '' };
chk('canMoveProject: owner, свой ГИП — да; чужой ГИП, lead, staff, бухгалтер — нет', 'true/true/false/false/false/false',
  [{ id: 'o', role: 'owner' }, { id: 'u-gip', role: 'gip' }, { id: 'x', role: 'gip' }, { id: 'l', role: 'lead', section: 'ОВ' }, { id: 's', role: 'staff' }, { id: 'a', role: 'accountant' }].map(u => PM.canMoveProject(u, P)).join('/'));

// ---- обработчик API в памяти: смена колонки пункта и событие ----
let n = 0; const events = [];
const db = { pmProjects: [Object.assign({ name: 'Канбан-тест', status: 'В работе' }, P)], pmItems: [
  { id: 'i1', pid: 'p1', stage: 1, stageName: 'Этап 1', title: 'Пункт ГИП', role: 'ГИП', section: '', done: false, na: false },
  { id: 'i2', pid: 'p1', stage: 1, stageName: 'Этап 1', title: 'Пункт ОВ', role: 'ОВ', section: 'ОВ', done: false, na: false },
  { id: 'i3', pid: 'p1', stage: 2, stageName: 'Этап 2', title: 'Пункт АР', role: 'ГАП', section: 'АР', done: false, na: false }],
  pmBlockers: [], users: [], projects: [], subcontracts: [], ops: [], contracts: [], settings: {},
  crmPayments: [{ id: 'pay1', pmProjectId: 'p1', stage: 1, status: 'Ожидается' }], crmLeads: [] };
const today = () => PM.today();
function call(user, method, pathStr, body) {
  let res; const ctx = { parts: ['pm', ...pathStr.split('/')], method, body: body || {}, qs: {}, user, db, D: {}, today, num: v => Number(v) || 0,
    pick: (o, keys) => Object.fromEntries(keys.filter(k => o && k in o).map(k => [k, o[k]])), modules: {},
    store: { id: () => 'n' + (n++), save() {}, audit() {} }, ok: b => (res = { s: 200, b }), err: (s, m) => (res = { s, b: m }), send() {} };
  ctx.emit = (name, data) => { events.push(`${name}:${data.item.id}`); if (CRM && CRM.on && CRM.on[name]) CRM.on[name](Object.assign({}, ctx, { module: 'crm' }), data); };
  S.handle(ctx); return res;
}
const GIP = { id: 'u-gip', role: 'gip' }, LEAD = { id: 'u-lead', role: 'lead', section: 'ОВ' }, OTHER = { id: 'u-x', role: 'gip' }, STAFF = { id: 'u-st', role: 'staff' };
chk('ГИП: i1 → «В работе» — без события', '200/doing/false/0', (r => [r.s, r.b.kcol, r.b.done, events.length].join('/'))(call(GIP, 'PUT', 'items/i1', { kstatus: 'doing' })));
chk('ГИП: i1 → «На проверке» — без события', '200/review/0', (r => [r.s, r.b.kcol, events.length].join('/'))(call(GIP, 'PUT', 'items/i1', { kstatus: 'review' })));
const r1 = call(GIP, 'PUT', 'items/i1', { kstatus: 'done' });
chk('ГИП: i1 → «Готово» = сделано: done, doneAt сегодня (Алматы), doneBy, событие pm.item.done', `200/true/${today()}/u-gip/pm.item.done:i1`, [r1.s, r1.b.done, r1.b.doneAt, r1.b.doneBy, events.join(',')].join('/'));
chk('crm: этап 1 ещё не закрыт — платёж не готов к акту', 'нет', CRM ? (db.crmPayments[0].readyAt ? 'да' : 'нет') : 'нет');
chk('чужой ГИП: 403, события нет', '403/1', [call(OTHER, 'PUT', 'items/i2', { kstatus: 'done' }).s, events.length].join('/'));
chk('руководитель раздела ОВ: пункт АР — 403', 403, call(LEAD, 'PUT', 'items/i3', { kstatus: 'doing' }).s);
chk('сотрудник (модуль выключен) — 403', 403, call(STAFF, 'PUT', 'items/i2', { kstatus: 'done' }).s);
const r2 = call(LEAD, 'PUT', 'items/i2', { kstatus: 'done' });
chk('руководитель раздела ОВ: свой пункт → «Готово», событие', '200/true/pm.item.done:i1,pm.item.done:i2', [r2.s, r2.b.done, events.join(',')].join('/'));
if (CRM) chk('crm (onItemDone): этап 1 закрыт через канбан — у платежа readyAt сегодня', today(), db.crmPayments[0].readyAt || '');
const r3 = call(GIP, 'PUT', 'items/i1', { kstatus: 'doing' });
chk('возврат из «Готово»: done снят, returns 1, doneAt пуст, событие не шлётся', '200/false/1//2', [r3.s, r3.b.done, r3.b.returns, r3.b.doneAt, events.length].join('/'));
chk('история пункта: колонка и «сделано» записаны', 'true/true', (h => [h.some(e => e.field === 'kstatus' && e.to === 'doing'), h.some(e => e.field === 'done' && e.to === false)].join('/'))(db.pmItems[0].history || []));
chk('галочка «сделано» по-старому: колонка «Готово», событие', 'done/3', (r => [r.b.kcol, events.length].join('/'))(call(GIP, 'PUT', 'items/i1', { done: true })));
// статус проекта (канбан проектов) — тем же PUT, права менеджера
chk('проект: свой ГИП двигает в «Ждём заказчика»', '200/Ждём заказчика', (r => r.s + '/' + (r.b.project || {}).status)(call(GIP, 'PUT', 'projects/p1', { status: 'Ждём заказчика' })));
chk('проект: чужой ГИП и руководитель раздела — 403', '403/403', [call(OTHER, 'PUT', 'projects/p1', { status: 'Готово' }).s, call(LEAD, 'PUT', 'projects/p1', { status: 'Готово' }).s].join('/'));
chk('проект: неизвестный статус не меняется', 'Ждём заказчика', (call(GIP, 'PUT', 'projects/p1', { status: 'Куда-то' }).b.project || {}).status);

console.log(fail ? `fail ${fail}` : 'ok');
process.exitCode = fail ? 1 : 0;
