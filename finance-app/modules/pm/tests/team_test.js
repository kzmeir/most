'use strict';
// «Квартал», «Офис проекта», переносы сроков с утверждением, проверка пунктов (принять / вернуть), напоминания — без сервера, на фикстурах.
// Запуск из finance-app: node modules/pm/tests/team_test.js  (последняя строка — «ok» или «fail N»; вызывается и из api_test.sh)
const S = require('../server.js'); const PM = S.domain; const TEAM = S.team;
let pass = 0, fail = 0;
const chk = (name, want, got) => { if (String(want) === String(got)) { pass++; console.log(`  ✓ ${name} (${got})`); } else { fail++; console.log(`  ✗ ${name}: ожидалось ${want}, получено ${got}`); } };
const T = PM.today(); const D = n => PM.addDays(T, n); let n = 0; const events = [];
const OWN = { id: 'u-own', role: 'owner', name: 'Владелец' }, PAR = { id: 'u-par', role: 'partner', name: 'Партнёр' }, PMU = { id: 'u-pm', role: 'pm', name: 'ПМ Первый' }, PM2 = { id: 'u-pm2', role: 'pm', name: 'ПМ Второй' },
  GIP = { id: 'u-gip', role: 'gip', name: 'ГИП Первый' }, ST = { id: 'u-st', role: 'staff', name: 'Сотрудник Ая' }, ST2 = { id: 'u-st2', role: 'staff', name: 'Сотрудник Бек' }, ST3 = { id: 'u-st3', role: 'staff', name: 'Сотрудник Вера' }, LEAD = { id: 'u-lead', role: 'lead', section: 'ОВ', name: 'Рук. ОВ' }, SEC = { id: 'u-sec', role: 'secretary', name: 'Секретарь' };
const old = new Date(Date.now() - 10 * 864e5).toISOString(), fresh = new Date(Date.now() - 1 * 864e5).toISOString();
const it = (id, pid, o) => Object.assign({ id, pid, stage: 1, stageName: 'Этап 1', title: 'Пункт ' + id, role: 'ГАП', section: 'АР', weeks: 1, done: false, na: false, due: D(10), assigneeId: '', contractor: '', note: '', history: [] }, o);
const db = {
  users: [OWN, PAR, PMU, PM2, GIP, ST, ST2, ST3, LEAD, SEC],
  pmProjects: [
    { id: 'p1', track: 'ep', name: 'ЭП Альфа', status: 'В работе', pmId: 'u-pm', gipId: '', start: D(-60), due: D(60), members: [] },
    { id: 'p2', track: 'rp', name: 'РП Бета', status: 'В работе', gipId: 'u-gip', pmId: '', start: D(-200), due: D(-5), members: [] },
    { id: 'p3', track: 'rp', name: 'РП Гамма (пауза)', status: 'На паузе', gipId: 'u-gip', start: D(-30), due: D(90), members: [] },
    { id: 'p4', track: 'rp', name: 'РП Дельта (готово)', status: 'Готово', gipId: 'u-gip', start: D(-30), due: D(90) },
  ],
  pmItems: [
    it('a1', 'p1', { assigneeId: 'u-st', due: D(-3), history: [{ at: old, by: 'u-st', field: 'note', from: '', to: 'x' }] }),
    it('a2', 'p1', { assigneeId: 'u-st', kstatus: 'review' }),
    it('a3', 'p1', { assigneeId: 'u-st2', history: [{ at: fresh, by: 'u-st2', field: 'kstatus', from: 'todo', to: 'doing' }] }),
    it('a4', 'p1', { role: 'ОВ', section: 'ОВ', due: D(5) }), // без исполнителя и без движения
    it('a5', 'p1', { stage: 2, stageName: 'Этап 2', due: D(40) }),
    it('a7', 'p1', { assigneeId: 'u-st3', stage: 2, stageName: 'Этап 2', due: D(50), history: [{ at: old, by: 'u-st3', field: 'kstatus', from: 'todo', to: 'doing' }] }),
    it('a6', 'p1', { done: true, doneAt: D(-20), assigneeId: 'u-st' }),
    it('b1', 'p2', { assigneeId: 'u-st', due: D(-1), stage: 1, stageName: 'Стадия 1', kstatus: 'review' }),
    it('b2', 'p2', { assigneeId: 'u-st', stage: 2, stageName: 'Стадия 2' }),
    it('b3', 'p2', { stage: 3, stageName: 'Стадия 3', contractor: 'ТОО КЖ-Проект', role: 'КЖ', section: 'КЖ' }),
  ],
  pmBlockers: [{ id: 'bl1', pid: 'p2', what: 'ИРД', status: 'open', since: D(-20) }],
  pmLog: [], projects: [], subcontracts: [], ops: [], contracts: [], settings: { pm: { staffOwnProjects: true } },
};
function call(user, method, p, body, qs) {
  let res; const ctx = { parts: ['pm', ...p.split('/')], method, body: body || {}, qs: qs || {}, user, db, D: {}, today: () => T, num: v => Number(v) || 0,
    pick: (o, keys) => Object.fromEntries(keys.filter(k => o && k in o).map(k => [k, o[k]])), modules: {}, emit: (name, data) => events.push({ name, data }),
    store: { id: () => 'n' + (n++), save() {}, audit() {}, DATA_DIR: '' }, ok: b => (res = { s: 200, b }), err: (s, m) => (res = { s, b: m }), send() {} };
  S.handle(ctx); return res;
}
const I = id => db.pmItems.find(i => i.id === id); const ev = name => events.filter(e => e.name === name).length;

console.log('— переносы сроков');
const due0 = I('a1').due;
chk('сотрудник-исполнитель: без причины — 400', 400, call(ST, 'POST', 'items/a1/shift', { due: D(7) }).s);
chk('без даты — 400', 400, call(ST, 'POST', 'items/a1/shift', { reason: 'x' }).s);
chk('дата в прошлом — 400', 400, call(ST, 'POST', 'items/a1/shift', { due: D(-1), reason: 'x' }).s);
chk('чужой пункт (сотрудник Бек) — 403', 403, call(ST2, 'POST', 'items/a1/shift', { due: D(7), reason: 'x' }).s);
chk('секретарь — 403', 403, call(SEC, 'POST', 'items/a1/shift', { due: D(7), reason: 'x' }).s);
chk('владелец не запрашивает — меняет сам (400)', 400, call(OWN, 'POST', 'items/a1/shift', { due: D(7), reason: 'x' }).s);
let r = call(ST, 'POST', 'items/a1/shift', { due: D(7), reason: 'Ждём топосъёмку от заказчика' });
chk('запрос исполнителя принят', 200, r.s);
chk('до утверждения срок не меняется', due0, I('a1').due);
chk('в ответе — бейдж «запрошен перенос»', `pending/${D(7)}`, `${r.b.shift && r.b.shift.status}/${r.b.shift && r.b.shift.to}`);
chk('событие pm.shift.requested', 1, ev('pm.shift.requested'));
chk('второй запрос, пока не решено — 409', 409, call(ST, 'POST', 'items/a1/shift', { due: D(9), reason: 'ещё' }).s);
const sid = I('a1').shifts[0].id;
chk('автор не утверждает свой запрос — 403', 403, call(ST, 'POST', `items/a1/shift/${sid}`, { action: 'approve' }).s);
chk('чужой ПМ не утверждает — 403', 403, call(PM2, 'POST', `items/a1/shift/${sid}`, { action: 'approve' }).s);
chk('отклонить без комментария — 400', 400, call(PMU, 'POST', `items/a1/shift/${sid}`, { action: 'reject' }).s);
chk('ждут решения у ПМ проекта: 1 перенос', 1, call(PMU, 'GET', 'decisions', null, { track: 'ep' }).b.shifts.length);
chk('у сотрудника — в «моих запросах»', 1, call(ST, 'GET', 'decisions', null, { track: 'ep' }).b.mine.length);
chk('счётчик в меню ЭП у ПМ: перенос + пункт на проверке', 2, call(PMU, 'GET', 'badges').b.byTrack.ep.dec);
r = call(PMU, 'POST', `items/a1/shift/${sid}`, { action: 'approve', comment: 'Согласовано' });
chk('ПМ проекта утвердил', 200, r.s);
chk('утверждение меняет срок', D(7), I('a1').due);
chk('история пункта: срок с пометкой «перенос по запросу»', 'true', I('a1').history.some(h => h.field === 'due' && h.to === D(7) && /перенос по запросу/.test(h.note || '')));
chk('статистика переносов: 1 раз, +10 дн.', '1/10', (s => `${s.n}/${s.days}`)(PM.shiftStats(I('a1'))));
chk('событие pm.shift.decided', 1, ev('pm.shift.decided'));
chk('повторное решение — 409', 409, call(OWN, 'POST', `items/a1/shift/${sid}`, { action: 'reject', comment: 'x' }).s);
// запрос ПМ своего проекта — утверждает только владелец / партнёр
r = call(PMU, 'POST', 'items/a3/shift', { due: D(20), reason: 'Перераспределили людей' }); const sid3 = I('a3').shifts[0].id;
chk('ПМ запросил перенос пункта своего проекта', 200, r.s);
chk('ГИП (не руководитель ЭП) не решает — 403', 403, call(GIP, 'POST', `items/a3/shift/${sid3}`, { action: 'approve' }).s);
chk('у ПМ этот запрос не в «ждут решения»', 0, call(PMU, 'GET', 'decisions', null, { track: 'ep' }).b.shifts.length);
chk('партнёр видит его в «ждут решения»', 1, call(PAR, 'GET', 'decisions', null, { track: 'ep' }).b.shifts.length);
chk('партнёр отклонил с комментарием — срок прежний', `200/${D(10)}/rejected`, (x => `${x.s}/${I('a3').due}/${I('a3').shifts[0].status}`)(call(PAR, 'POST', `items/a3/shift/${sid3}`, { action: 'reject', comment: 'Срок заказчика не двигается' })));
// РП: любой ГИП — руководитель РП, но запрос ГИПа утверждает владелец
r = call(ST, 'POST', 'items/b2/shift', { due: D(30), reason: 'Замечания экспертизы' }); const sidB = I('b2').shifts[0].id;
chk('ГИП утверждает запрос исполнителя РП', `200/${D(30)}`, (x => `${x.s}/${I('b2').due}`)(call(GIP, 'POST', `items/b2/shift/${sidB}`, { action: 'approve' })));
// отмена автором
r = call(ST, 'POST', 'items/a1/shift', { due: D(12), reason: 'Ещё неделя' }); const sidC = I('a1').shifts.find(s => s.status === 'pending').id;
chk('автор отменил свой запрос', `200/cancelled/${D(7)}`, (x => `${x.s}/${I('a1').shifts.find(s => s.id === sidC).status}/${I('a1').due}`)(call(ST, 'POST', `items/a1/shift/${sidC}`, { action: 'cancel' })));
// прямая правка срока руководителем — «перенос без запроса»
call(OWN, 'PUT', 'items/a1', { due: D(15) });
chk('прямая правка срока работает', D(15), I('a1').due);
chk('в истории переносов — «без запроса»', 'direct/8', (s => `${s.status}/${s.days}`)(I('a1').shifts[I('a1').shifts.length - 1]));
chk('в истории пункта — пометка «перенос без запроса»', 'true', I('a1').history.some(h => h.field === 'due' && h.note === 'перенос без запроса'));
chk('первый срок пункта — не перенос', 0, (call(PMU, 'PUT', 'items/a5', { due: D(41) }), call(PMU, 'PUT', 'items/a4', { note: 'x' }), (I('a4').shifts || []).length));
chk('статистика: 2 переноса, +18 дн., 1 без запроса', '2/18/1', (s => `${s.n}/${s.days}/${s.direct}`)(PM.shiftStats(I('a1'))));
const feed = PM.projectFeed(db.pmProjects[0], db.pmItems, [], [], {});
chk('журнал проекта: события переносов', 'true/true/true', [feed.some(e => e.type === 'shift' && /Запрошен перенос/.test(e.text)), feed.some(e => e.type === 'shift' && /утверждён/.test(e.text)), feed.some(e => e.type === 'shift' && /без запроса/.test(e.text))].join('/'));

console.log('— проверка пунктов');
chk('сотрудник не принимает — 403', 403, call(ST, 'POST', 'items/a2/review', { action: 'accept' }).s);
chk('вернуть без замечания — 400', 400, call(PMU, 'POST', 'items/a2/review', { action: 'return' }).s);
r = call(PMU, 'POST', 'items/a2/review', { action: 'return', comment: 'Нет разреза 2-2' });
chk('возврат: колонка «В работе», возвратов 1', 'doing/1', `${I('a2').kstatus}/${I('a2').returns}`);
chk('замечание в истории пункта', 'Нет разреза 2-2', (I('a2').history.find(h => h.field === 'review') || {}).note);
chk('замечание в журнале проекта', 'true', PM.projectFeed(db.pmProjects[0], db.pmItems, [], [], {}).some(e => e.type === 'review' && /Нет разреза 2-2/.test(e.text)));
chk('пункт не на проверке — 409', 409, call(PMU, 'POST', 'items/a2/review', { action: 'accept' }).s);
call(ST, 'PUT', 'items/a2', { kstatus: 'review' });
r = call(PMU, 'POST', 'items/a2/review', { action: 'accept' });
chk('принять: сделано, колонка «Готово»', 'true/done/done', `${I('a2').done}/${I('a2').kstatus}/${r.b.kcol}`);
chk('события pm.item.reviewed ×2 и pm.item.done', '2/1', `${ev('pm.item.reviewed')}/${ev('pm.item.done')}`);

console.log('— офис проекта');
const off = TEAM.office(db.pmProjects[0], db.pmItems, { t: T, days: 5, limit: 2, users: db.users, logs: [{ pid: 'p1', by: 'u-pm', createdAt: fresh }], projects: db.pmProjects });
const pp = id => off.people.find(x => x.id === id) || {};
chk('сотрудник Ая: открыто 1, просрочено 0 (срок перенесён), сегодня просила перенос — не молчит', `1/0/false`, `${pp('u-st').open}/${pp('u-st').overdue}/${pp('u-st').silent}`);
chk('сотрудник Вера: последнее изменение 10 дн. назад — молчит', 'true/10', `${pp('u-st3').silent}/${pp('u-st3').quietDays}`);
chk('сотрудник Бек: есть движение вчера — не молчит', 'false/1', `${pp('u-st2').silent}/${pp('u-st2').quietDays}`);
chk('ПМ без своих пунктов — не молчит, роль «ПМ проекта»', 'false/ПМ проекта', `${pp('u-pm').silent}/${pp('u-pm').roles.join(',')}`);
chk('перегрузка Аи по всем активным проектам (порог 2): 3 пункта (ЭП + РП) — да', '3/true', `${pp('u-st').allOpen}/${pp('u-st').overload}`);
const off1 = TEAM.office(db.pmProjects[0], db.pmItems, { t: T, days: 5, limit: 3, users: db.users, logs: [], projects: db.pmProjects });
chk('порог 3 — не перегружена', 'false', off1.people.find(x => x.id === 'u-st').overload);
chk('пустой раздел ОВ: нет исполнителя', 'true', off.empty.some(x => x.kind === 'section' && x.name === 'ОВ' && x.noOwner));
chk('кто чаще переносит — Ая первая (2 переноса)', 'u-st/2', `${off.shifters[0].id}/${off.shifters[0].shiftN}`);
chk('API офиса: ПМ своего — 200, чужой ПМ — 403, сотрудник — 403', '200/403/403', [call(PMU, 'GET', 'projects/p1/office').s, call(PM2, 'GET', 'projects/p1/office').s, call(ST, 'GET', 'projects/p1/office').s].join('/'));
chk('настройки: порог перегрузки меняет владелец, 0 — 400, ПМ — 403', '200/400/403/12', [call(OWN, 'PUT', 'settings', { overloadLimit: 12 }).s, call(OWN, 'PUT', 'settings', { overloadLimit: 0 }).s, call(PMU, 'PUT', 'settings', { overloadLimit: 3 }).s, PM.pmSettings(db).overloadLimit].join('/'));

console.log('— квартал');
const q = call(OWN, 'GET', 'quarter', null, { track: 'rp' });
chk('квартал РП: только активные проекты РП', 'p2,p3', q.b.rows.map(x => x.id).sort().join(','));
const b2 = q.b.rows.find(x => x.id === 'p2');
chk('здание: этажей 3, просрочено 1, на проверке 1, блокеров 1, срок прошёл', '3/1/1/1/true', [b2.stages, b2.overdueN, b2.reviewN, b2.blockersN, b2.late].join('/'));
chk('зона фасада и бюджет не отдаётся', 'true/false', [['green', 'yellow', 'red', 'black', 'blue', 'none'].includes(b2.zone), 'budget' in b2].join('/'));
chk('квартал ЭП: перенос ждёт решения → 0 (все решены)', '1/0', (x => `${x.rows.length}/${x.rows[0].shiftsN}`)(call(OWN, 'GET', 'quarter', null, { track: 'ep' }).b));
chk('квартал: сотрудник, руководитель раздела и секретарь — 403', '403/403/403', [call(ST, 'GET', 'quarter').s, call(LEAD, 'GET', 'quarter').s, call(SEC, 'GET', 'quarter').s].join('/'));

console.log('— напоминание');
chk('напомнить: чужой ПМ — 403', 403, call(PM2, 'POST', 'projects/p2/remind', {}).s);
r = call(GIP, 'POST', 'projects/p2/remind', { text: 'До пятницы' });
chk('ГИП напомнил: запись журнала «Напоминание…»', 'true/remind', `${/^Напоминание исполнителям: Сотрудник Ая/.test(r.b.log.text)}/${db.pmLog[db.pmLog.length - 1].source}`);
chk('событие pm.remind с исполнителями', 'u-st', (events.filter(e => e.name === 'pm.remind').pop() || { data: {} }).data.userIds.join(','));

console.log(`  итого: ${pass} ✓, ${fail} ✗`);
console.log(fail ? `fail ${fail}` : 'ok');
process.exitCode = fail ? 1 : 0;
