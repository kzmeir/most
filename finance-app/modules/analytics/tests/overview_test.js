'use strict';
// Корректность сумм панели на маленьком наборе данных (без HTTP) и работа без модулей hr/crm.
// Запуск из finance-app: node modules/analytics/tests/overview_test.js  (вызывается из api_test.sh)
const path = require('path');
const APP = path.join(__dirname, '..', '..', '..');
const D = require(path.join(APP, 'lib', 'domain.js'));
const AN = require(path.join(APP, 'modules', 'analytics', 'server.js'));
const mod = id => require(path.join(APP, 'modules', id, 'server.js'));
delete process.env.DEV_USER; // модули включаются только через settings.enabledModules

const T = '2026-09-15'; const ym = T.slice(0, 7);
const addD = n => new Date(new Date(T + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
function makeDb(enabled) {
  return {
    settings: { enabledModules: enabled, paymentTermDays: 10, payDay: 10, vatRate: 0.16 },
    users: [{ id: 'u-gip', name: 'ГИП Тест', role: 'gip' }], employees: [], payroll: [], obligations: [], invoices: [], vacations: [],
    categories: [{ id: 'Доход', kind: 'income' }, { id: 'Субподряд', kind: 'expense' }, { id: 'Перевод', kind: 'transfer' }],
    accounts: [{ id: 'a1', name: 'Счёт 1', company: 'MOST Project' }, { id: 'a2', name: 'Счёт 2', company: 'MOST Architects' }, { id: 'a3', name: 'Счёт 3', company: 'MOST Architects' }],
    cash: [{ id: 'c1', account: 'a1', balance: 1000000, asOf: '2026-09-01' }, { id: 'c2', account: 'a2', balance: 500000, asOf: '2026-09-01' }], // a3 — без опорного остатка
    ops: [
      { id: 'o1', date: '2026-09-05', account: 'a1', credit: 3000000, debit: 0, category: 'Доход', project: 'P1' },
      { id: 'o2', date: '2026-09-06', account: 'a1', credit: 0, debit: 800000, category: 'Субподряд', project: 'P1' },
      { id: 'o3', date: '2026-09-07', account: 'a2', credit: 0, debit: 200000, category: 'Перевод' }, // перевод — не расход в месяцах, но уменьшает остаток счёта
      { id: 'o4', date: '2026-08-20', account: 'a1', credit: 0, debit: 100000, category: 'Субподряд' }, // до опорного остатка — в остаток не входит
    ],
    docs: [
      { id: 'd1', type: 'avr', client: 'ТОО Должник', amount: 2000000, status: 'done', actDate: addD(-40) }, // > 30 дней
      { id: 'd2', type: 'avr', client: 'ТОО Свежий', amount: 700000, status: 'done', actDate: addD(-5) },
      { id: 'd3', type: 'avr', client: 'ТОО Оплатил', amount: 999999, status: 'done', actDate: addD(-60), paid: true },
    ],
    contracts: [], proposals: [], counterparties: [],
    projects: [{ id: 'P1', name: 'Проект 1', client: 'ТОО А', contractNoVat: 10000000, status: 'В работе' }, { id: 'P2', name: 'Проект 2', contractNoVat: 0 }, { id: 'ДЗЮДО ЦЕНТР', name: 'Дзюдо центр РП', contractNoVat: 4000000, status: 'В работе' }, { id: 'Dom Ministr', name: 'Dom Ministr', status: 'archive' }],
    subcontracts: [{ id: 's1', project: 'P1', contractor: 'ИП Смежник', sum: 2500000, paid: 1000000 }, { id: 's2', project: 'Проект 1', contractor: 'ТОО КЖ', sum: 500000, paid: 0 }, { id: 's3', project: 'Дзюдо Центр', contractor: 'ИП ОВ', sum: 900000, paid: 100000 }, { id: 's4', project: 'Дзюдо Центр', contractor: 'ИП ВК', sum: 100000, paid: 0 }, { id: 's5', project: 'Дом министра', contractor: 'ИП ЭЛ', sum: 50000, paid: 0 }, { id: 's6', project: 'Непонятный объект', contractor: 'ИП Х', sum: 10000, paid: 0 }],
    pmProjects: [{ id: 'pm1', name: 'РП Проект 1', track: 'rp', status: 'В работе', start: '2026-01-10', due: '2026-08-31', gipId: 'u-gip', projectId: 'P1' }, { id: 'pm2', name: 'Концепция старая', track: 'concept', status: 'В работе', start: '2026-09-01', due: '2027-03-01' }],
    pmItems: [{ id: 'i1', pid: 'pm1', stage: 1, stageName: '1. ИРД', title: 'Пункт', role: 'ГИП', weeks: 2, due: '2026-03-01', done: false }, { id: 'i2', pid: 'pm1', stage: 2, stageName: '2', title: 'Пункт 2', role: 'ОВ', section: 'ОВ', weeks: 1, due: '2026-09-20', done: false }],
    pmBlockers: [{ id: 'b1', pid: 'pm1', what: 'ИРД', holder: 'Заказчик', since: addD(-30), status: 'open' }],
    crmLeads: [{ id: 'l1', client: 'ТОО Лид', object: 'ЖК', status: 'КП отправлено', kpAt: addD(-20), createdAt: addD(-25) + 'T00:00:00Z', area: 1000, rate: 5000, vatIncluded: false, objectType: 'ЖК', history: [] }],
    crmPayments: [], crmTemplates: [], hrTeams: [], hrTimesheets: [], hrPeople: [],
  };
}
const ctxOf = (db, mods) => ({ db, D, modules: mods, today: () => T, userName: id => (db.users.find(u => u.id === id) || {}).name || '' });

let pass = 0, fail = 0;
const chk = (name, exp, got) => { if (JSON.stringify(exp) === JSON.stringify(got)) { pass++; console.log(`  ✓ ${name} (${JSON.stringify(got)})`); } else { fail++; console.log(`  ✗ ${name}: ожидалось ${JSON.stringify(exp)}, получено ${JSON.stringify(got)}`); } };

console.log('== суммы на маленьком наборе ==');
const all = { pm: mod('pm'), crm: mod('crm'), hr: mod('hr') };
const d = AN.overview(ctxOf(makeDb(['pm', 'crm', 'hr']), all), { today: T });
chk('без ошибок блоков', {}, d.errors);
chk('остаток: a1 1 000 000 + 3 000 000 − 800 000; a2 500 000 − 200 000', 3500000, d.money.balances.total);
chk('счёт без опорного остатка не учтён', 1, d.money.balances.unknown);
chk('остаток MOST Project', 3200000, d.money.balances.byCompany.find(c => c.company === 'MOST Project').balance);
chk('дебиторка: неоплаченные акты', 2700000, d.money.receivables.total);
chk('дебиторка старше 30 дней', 2000000, d.money.receivables.over30);
chk('должник старше 30 дней', 'ТОО Должник', d.money.receivables.topOver[0].client);
const cur = d.money.months.find(x => x.ym === ym);
chk('12 месяцев', 12, d.money.months.length);
chk('выручка месяца', 3000000, cur.income);
chk('расходы месяца без переводов', 800000, cur.expense);
const mr = d.money.margin.rows.find(r => r.id === 'P1');
chk('маржа: субподряд по id и по названию проекта', 3000000, mr.subs);
chk('маржа = 10 000 000 − 3 000 000 − ФОТ 0', 7000000, mr.margin);
chk('маржа %', 70, mr.pct);
chk('проекты без суммы договора не в марже', 2, d.money.margin.projects);
const dz = d.money.margin.rows.find(r => r.id === 'ДЗЮДО ЦЕНТР');
chk('без привязанного субподряда маржа не считается', [false, null, null], [dz.subsLinked, dz.margin, dz.pct]);
chk('оценка «не больше» = договор − ФОТ', 4000000, dz.upper);
chk('с привязанным субподрядом 1 проект', 1, d.money.margin.withSubs);
chk('непривязанный субподряд: шт., сумма, названий', [4, 1060000, 3], [d.money.margin.unlinkedSubs.n, d.money.margin.unlinkedSubs.sum, d.money.margin.unlinkedSubs.names]);
console.log('== предложения привязки субподряда ==');
const sl = AN.subLinkSuggestions(makeDb([]));
chk('групп по названию объекта', 3, sl.items.length);
chk('сначала крупные', 'Дзюдо Центр', sl.items[0].project);
chk('Дзюдо Центр → Дзюдо центр РП (high)', ['ДЗЮДО ЦЕНТР', 'high'], [sl.items[0].best.id, sl.items[0].best.level]);
chk('группа: 2 договора, id и подрядчики', [2, ['s3', 's4'], ['ИП ОВ', 'ИП ВК']], [sl.items[0].n, sl.items[0].subcontractIds, sl.items[0].contractors]);
chk('Дом министра → Dom Ministr (латиница)', 'Dom Ministr', sl.items.find(i => i.project === 'Дом министра').best.id);
chk('непохожее — без кандидата', null, sl.items.find(i => i.project === 'Непонятный объект').best);
const dbT = makeDb([]);
dbT.projects.push({ id: 'Туркестан РП', name: 'Туркестан РП', status: 'archive', contractNoVat: 0 }, { id: 'prj-t', name: 'Туркестан (гостиница)', status: 'В работе', contractNoVat: 8000000 }, { id: 'Unex RP', name: 'Unex RP', status: 'archive' }, { id: 'prj-x', name: 'Туркестан старый', status: 'archive', contractNoVat: 5000000 });
dbT.subcontracts.push({ id: 't1', project: 'Туркестан РП', contractor: 'ИП КЖ', sum: 3000000, paid: 0 }, { id: 't2', project: 'Туркестан РП', contractor: 'ИП ОВ', sum: 1000000, paid: 500000 }, { id: 'u1', project: 'Unex RP', contractor: 'ИП А', sum: 9000000, paid: 0 });
const tw = AN.subLinkSuggestions(dbT);
chk('двойник: архивный → активный с договором', [['Туркестан РП', 'prj-t']], tw.twins.map(t => [t.archivedProject.id, t.activeCandidate.id]));
chk('двойник: договоры субподряда и сумма', [2, 4000000, ['t1', 't2']], [tw.twins[0].n, tw.twins[0].sum, tw.twins[0].subcontractIds]);
chk('двойник: архивные кандидаты не предлагаются', false, tw.twins[0].candidates.some(c => c.status === 'archive'));
chk('архив без похожего активного — не в списке', false, tw.twins.some(t => t.archivedProject.id === 'Unex RP'));
chk('сводка двойников', { n: 2, sum: 4000000, projects: 1 }, tw.twinsSummary);
chk('опечатка: Теректы ↔ Теректи', true, require(path.join(APP, 'modules', 'analytics', 'domain.js')).matchScore('ТЕРЕКТЫ', 'Теректи РП').score >= 0.85);
chk('разные номера не склеиваются: НОВА-23 / НОВА 24', true, require(path.join(APP, 'modules', 'analytics', 'domain.js')).matchScore('НОВА-23', 'НОВА 24').score < 0.65);
chk('прогноз: 13 недель от остатка', [13, 3500000], [d.money.forecast.weeks.length, d.money.forecast.start]);
chk('проекты: активных 2', 2, d.projects.active);
chk('старая концепция — среди ЭП', ['ep', 'rp'], d.projects.portfolio.map(x => x.track).sort());
const p1 = d.projects.list.find(x => x.id === 'pm1');
chk('срок по договору прошёл', true, p1.late);
chk('зона Пульса посчитана', true, !!p1.zone);
chk('блокер > 14 дней', ['ИРД', 30], [d.projects.blockers[0].what, d.projects.blockers[0].days]);
chk('загрузка ГИП', [{ name: 'ГИП Тест', gip: 1 }], d.projects.load.map(x => ({ name: x.name, gip: x.gip })));
chk('продажи: КП в работе', [1, 5000000], [d.sales.kp.n, d.sales.kp.sum]);
chk('КП без ответа > 14 дней', 1, d.sales.noAnswer.length);
chk('люди: блок есть (hr включён)', true, !!d.people);
chk('сигналы: дебиторка, срок, блокеры, КП', true, ['Дебиторка', 'Срок по договору', 'Блокеры', 'КП без ответа'].every(k => d.signals.some(s => s.title.includes(k))));
chk('сигналов не больше 7', true, d.signals.length <= 7);

console.log('== периоды ==');
const dm = AN.overview(ctxOf(makeDb(['pm', 'crm', 'hr']), all), { today: T, period: 'month' });
chk('месяц: ряд по неделям с 1-го числа', ['week', '2026-09-01', 3], [dm.money.period.unit, dm.money.series[0].from, dm.money.series.length]);
chk('месяц: выручка / расходы / итог', [3000000, 800000, 2200000], [dm.money.period.income, dm.money.period.expense, dm.money.period.net]);
const dq = AN.overview(ctxOf(makeDb(['pm', 'crm', 'hr']), all), { today: T, period: 'quarter' });
chk('квартал: месяцы июль–сентябрь', ['2026-07', '2026-08', '2026-09'], dq.money.series.map(x => x.ym));
chk('квартал: расходы до опорного остатка тоже в периоде (август)', 900000, dq.money.period.expense);
const dy = AN.overview(ctxOf(makeDb(['pm', 'crm', 'hr']), all), { today: T, period: 'year' });
chk('год: 9 месяцев с января', 9, dy.money.series.length);
chk('по умолчанию — 12 месяцев', ['12m', 12], [d.period.period, d.money.series.length]);
chk('неизвестный период → 12 месяцев', '12m', AN.overview(ctxOf(makeDb(['pm']), all), { today: T, period: 'decade' }).period.period);
const dbS = makeDb(['pm', 'crm', 'hr']); dbS.crmLeads.push({ id: 'l0', client: 'Старый', object: 'Старый', status: 'Отказ', reason: 'Цена', kpAt: '2025-01-10', createdAt: '2025-01-05T00:00:00Z', history: [] });
chk('продажи за период: лид от 21.08 не в сентябре; лид 2025-01 не в 12 мес.', [0, 1], [AN.overview(ctxOf(dbS, all), { today: T, period: 'month' }).sales.funnel.total, AN.overview(ctxOf(dbS, all), { today: T, period: '12m' }).sales.funnel.total]);

console.log('== история сигналов по неделям ==');
const A2 = require(path.join(APP, 'modules', 'analytics', 'domain.js'));
chk('ISO-неделя', ['2026-W38', '2026-W53', '2025-W01'], [A2.isoWeek(T), A2.isoWeek('2027-01-01'), A2.isoWeek('2024-12-30')]);
chk('у сигналов постоянные ключи', true, d.signals.every(x => x.key));
const df = A2.diffSignals([{ key: 'a', level: 'warn', title: 'A' }, { key: 'b', level: 'crit', title: 'B' }], [{ key: 'b', level: 'warn', title: 'B' }, { key: 'c', level: 'crit', title: 'C' }]);
chk('diff: ушли / новые / остались (с прежним уровнем)', [['a'], ['c'], ['b'], 'crit'], [df.gone.map(x => x.key), df.added.map(x => x.key), df.kept.map(x => x.key), df.kept[0].was]);
// handle: снимок текущей недели и сравнение с прошлой
const dbH = makeDb(['pm', 'crm', 'hr']); dbH.analyticsSnapshots = [{ id: '2026-W37', week: '2026-W37', signals: [{ key: 'cash-gap', level: 'crit', title: 'Кассовый разрыв' }, { key: 'receivables-30', level: 'warn', title: 'Дебиторка' }] }];
let saved = 0; const audits = [];
const hctx = Object.assign(ctxOf(dbH, all), { parts: ['analytics', 'overview'], method: 'GET', qs: {}, user: { id: 'u1', role: 'owner' }, store: { save: () => saved++, audit: (...x) => audits.push(x) }, ok: b => ({ ok: true, body: b }), err: (st, m) => ({ ok: false, status: st, m }) });
const r1 = AN.handle(hctx);
chk('снимок текущей недели создан и сохранён', [2, '2026-W38', 1], [dbH.analyticsSnapshots.length, r1.body.history.week, saved]);
chk('сравнение с прошлой неделей', '2026-W37', r1.body.history.prevWeek);
chk('ушёл кассовый разрыв, дебиторка осталась', [true, true], [r1.body.history.diff.gone.some(x => x.key === 'cash-gap'), r1.body.history.diff.kept.some(x => x.key === 'receivables-30')]);
chk('новые — например, прошедший срок', true, r1.body.history.diff.added.some(x => x.key === 'contract-late'));
AN.handle(hctx); chk('повторное открытие без изменений — без записи', 1, saved);
chk('полный список сигналов в ответ не уходит', undefined, r1.body.allSignals);
const r2 = AN.handle(Object.assign({}, hctx, { user: { id: 'u2', role: 'accountant' } }));
chk('бухгалтеру — 403, снимок не пишется', [403, 1], [r2.status, saved]);
const hist = AN.handle(Object.assign({}, hctx, { parts: ['analytics', 'history'] }));
chk('история: недели по убыванию', ['2026-W38', '2026-W37'], hist.body.map(x => x.week));

console.log('== без hr и crm ==');
const d2 = AN.overview(ctxOf(makeDb(['pm']), all), { today: T });
chk('без ошибок', {}, d2.errors);
chk('модули', { pm: true, crm: false, hr: false }, d2.modules);
chk('продаж и людей нет', [null, null], [d2.sales, d2.people]);
chk('маржа без ФОТ', false, d2.money.margin.withLabor);
chk('сигнал КП без ответа не появляется', false, d2.signals.some(s => s.title.includes('КП')));
const d3 = AN.overview(ctxOf(makeDb([]), { pm: all.pm }), { today: T });
chk('модули не подключены вовсе — только деньги', [true, null, null, null], [!!d3.money, d3.projects, d3.sales, d3.people]);

// ---- дебиторка: разрез по заказчику и сверка с поступлениями из выписок ----
console.log('== дебиторка: группы-заказчики и сверка с выписками ==');
const recDb = {
  settings: { vatRate: 0.16 },
  categories: [{ id: 'Доход', kind: 'income' }, { id: 'Перевод', kind: 'transfer' }],
  counterparties: [
    { id: 'cp-qpc', name: 'ТОО QPC', aliases: ['QPC'] },
    { id: 'cp-md', name: 'ТОО MD Invest', aliases: ['MD Invest'] },
    { id: 'cp-nomad', name: 'ТОО Nomad Arena', aliases: [] },
  ],
  // clientShort = группа «Эверест» для нескольких юрлиц — как в реестре договоров
  contracts: [
    { id: 'c1', code: 'EV-1', name: 'Эверест башня', client: 'ТОО QPC', clientShort: 'Эверест', sum: 100000000, closed: false, remaining: 0, toPay: 0 },
    { id: 'c2', code: 'EV-2', name: 'Эверест парк', client: 'ТОО MD Invest', clientShort: 'Эверест', sum: 50000000, closed: false, remaining: 0, toPay: 0 },
    { id: 'c3', code: 'NM-1', name: 'Номад', client: 'ТОО Nomad Arena', clientShort: 'Эверест', sum: 20000000, closed: false, remaining: 5000000, toPay: 0 },
  ],
  docs: [
    { id: 'a1', type: 'avr', client: 'ТОО QPC', amount: 10000000, status: 'done', actDate: '2024-02-10' },       // покрыт платежом QPC
    { id: 'a2', type: 'avr', client: 'ТОО MD Invest', amount: 8000000, status: 'done', actDate: '2024-03-01' },  // покрыт платежом MD
    { id: 'a3', type: 'avr', client: 'ТОО Nomad Arena', amount: 12000000, status: 'done', actDate: '2024-03-06' }, // платежей нет — реальная неоплата
  ],
  ops: [
    { id: 'p1', date: '2024-06-01', credit: 10000000, debit: 0, category: 'Доход', counterparty: 'ТОО QPC' },
    { id: 'p2', date: '2024-07-01', credit: 8000000, debit: 0, category: 'Доход', counterparty: 'MD Invest' },
    { id: 'p3', date: '2024-05-01', credit: 99000000, debit: 0, category: 'Перевод', counterparty: 'ТОО Nomad Arena' }, // перевод — не поступление
  ],
  projects: [],
};
const rec = D.receivables(recDb, '2026-11-09');
chk('сверка включена (есть ops)', true, rec.totals.matched);
chk('все три юрлица сведены в одного заказчика «Эверест»', ['Эверест'], rec.byCustomer.map(g => g.group));
chk('у «Эверест» три юрлица внутри', 3, rec.byCustomer[0].entities.length);
chk('начислено по актам (raw)', 30000000, rec.totals.acts);
chk('найдено оплат по выписке: 2 акта', [2, 18000000], [rec.totals.paidFoundN, rec.totals.paidFound]);
chk('реально не оплачено = только Номад', 12000000, rec.totals.real);
chk('перевод не считается поступлением', 18000000, rec.byCustomer[0].received);
chk('акт QPC помечен «платёж найден»', true, rec.acts.find(a => a.id === 'a1').paidFound);
chk('акт Номад без платежа — не помечен', false, rec.acts.find(a => a.id === 'a3').paidFound);
const recNo = D.receivables({ docs: recDb.docs, contracts: recDb.contracts, counterparties: recDb.counterparties }, '2026-11-09');
chk('без ops: сверки нет, разрез по заказчику сохраняется', [false, 'Эверест', 30000000], [recNo.totals.matched, recNo.byCustomer[0].group, recNo.totals.real]);

// ---- единый справочник: группа у контрагента — источник правды, автопривязка заказчика проекта ----
console.log('== единый справочник заказчиков и автопривязка ==');
// засев групп из clientShort договоров
const seedDb = { counterparties: recDb.counterparties.map(c => Object.assign({}, c)), contracts: recDb.contracts };
const upd = D.seedCustomerGroups(seedDb);
chk('засев групп из договоров: QPC, MD, Nomad получают «Эверест»', [3, 'Эверест'], [upd.length, upd[0].group]);
for (const u of upd) seedDb.counterparties.find(c => c.id === u.id).group = u.group;
chk('повторный засев ничего не меняет (идемпотентно)', 0, D.seedCustomerGroups(seedDb).length);
// теперь группа берётся из справочника даже без clientShort на договоре
const noShort = { counterparties: seedDb.counterparties, contracts: recDb.contracts.map(c => Object.assign({}, c, { clientShort: '' })) };
chk('группа из counterparties.group (без clientShort)', 'Эверест', D.customerGroups(noShort).groupOf({ client: 'ТОО QPC' }));
// ручное переопределение группы у контрагента имеет приоритет над clientShort
const over = { counterparties: recDb.counterparties.map(c => c.id === 'cp-nomad' ? Object.assign({}, c, { group: 'Прочее' }) : Object.assign({}, c)), contracts: recDb.contracts };
chk('counterparties.group приоритетнее clientShort договора', 'Прочее', D.customerGroups(over).groupOf({ client: 'ТОО Nomad Arena' }));
// автопривязка заказчика проекта по цепочке проект → договор → контрагент
const pcDb = { counterparties: seedDb.counterparties, contracts: [{ id: 'k1', code: 'PRX', name: 'Проект Икс', client: 'ТОО QPC', clientShort: 'Эверест', closed: false }], projects: [{ id: 'PRX', name: 'Проект Икс' }] };
const pc = D.projectClient({ id: 'PRX', name: 'Проект Икс' }, pcDb);
chk('заказчик проекта автоматически из договора', ['ТОО QPC', 'Эверест', 'contract'], [pc.client, pc.group, pc.source]);
chk('проект без договора — заказчика нет (ручного не требуем)', ['', '', ''], (x => [x.client, x.group, x.source])(D.projectClient({ id: 'NONE', name: 'Пусто' }, pcDb)));

console.log(`\nИтого overview: ${pass} ✓, ${fail} ✗`);
process.exit(fail ? 1 : 0);
