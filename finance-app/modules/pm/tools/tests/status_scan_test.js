'use strict';
// Тест чистой логики сканера статусов РП (без файловой системы). Запуск: node modules/pm/tools/tests/status_scan_test.js
const S = require('../status_scan');
let pass = 0, fail = 0;
const chk = (name, exp, got) => { if (JSON.stringify(exp) === JSON.stringify(got)) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}: ожидалось ${JSON.stringify(exp)}, получено ${JSON.stringify(got)}`); } };
const T = Date.parse('2026-11-19T00:00:00Z');
const day = n => T - n * 864e5;
// скан: дисциплины с датой последнего значимого файла
const scan = (discDates, markers) => {
  const byDisc = {}; let newest = 0;
  for (const [d, iso] of Object.entries(discDates)) { const t = Date.parse(iso + 'T00:00:00Z'); byDisc[d] = { files: 5, meaningful: 5, newest: t, newestName: 'x.dwg' }; if (t > newest) newest = t; }
  return { byDisc, markers: markers || {}, filesSeen: 50, newestAny: newest, newestMeaning: newest };
};

console.log('== дисциплина по имени папки (нумерация на диске плавает) ==');
chk('01-AR -> АР', 'АР', S.disciplineOf('01-AR'));
chk('03-KJ -> КЖ', 'КЖ', S.disciplineOf('03-KJ'));
chk('08-APT APS -> СС', 'СС', S.disciplineOf('08-APT APS'));
chk('000-ИРД -> ИРД', 'ИРД', S.disciplineOf('000-ИРД'));
chk('11-Smeta -> Смета', 'Смета', S.disciplineOf('11-Smeta'));
chk('Отдел продаж -> null', null, S.disciplineOf('Отдел продаж'));

console.log('== реальный этап по артефактам ==');
chk('ИРД есть -> этап 1', 1, S.inferStage(scan({ 'ИРД': '2026-01-01' })).stage);
chk('КЖ+АР -> этап 3 (схема КЖ)', 3, S.inferStage(scan({ 'КЖ': '2026-02-01', 'АР': '2026-02-01', 'ГП': '2026-02-01' })).stage);
chk('+ОВ+ВК -> этап 4 (финальные планы)', 4, S.inferStage(scan({ 'КЖ': '2026-02-01', 'АР': '2026-02-01', 'ОВ': '2026-03-01', 'ВК': '2026-03-01' })).stage);
chk('+ЭЛ+СС -> этап 5 (проект)', 5, S.inferStage(scan({ 'КЖ': '2026-02-01', 'АР': '2026-02-01', 'ОВ': '2026-03-01', 'ВК': '2026-03-01', 'ЭЛ': '2026-04-01', 'СС': '2026-04-01' })).stage);
chk('Смета -> этап 7 (комплектация)', 7, S.inferStage(scan({ 'АР': '2026-02-01', 'КЖ': '2026-02-01', 'Смета': '2026-05-01' })).stage);
chk('маркер «замечания» внутри НЕ поднимает до экспертизы (здесь маркера нет)', 4, S.inferStage(scan({ 'АР': '2026-02-01', 'КЖ': '2026-02-01', 'ОВ': '2026-03-01', 'ВК': '2026-03-01' })).stage);
chk('маркер экспертизы + смета -> этап 8', 8, S.inferStage(scan({ 'АР': '2026-02-01', 'Смета': '2026-05-01' }, { 'экспертиза': true })).stage);

console.log('== аномалии / правило движения ==');
const a = (sc, erp) => S.analyzeScan(sc, erp, T).anomalies.join(' | ');
chk('ERP 0%, а на диске этап 5 -> «статус занижен»', true, /занижен/.test(a(scan({ 'АР': '2025-12-15', 'КЖ': '2025-12-15', 'ОВ': '2025-12-15', 'ВК': '2025-12-15', 'ЭЛ': '2025-12-15', 'СС': '2025-12-15' }), { progress: { pct: 0, stageName: '1. ИРД' }, status: 'Ждём заказчика' })));
chk('пауза -> авто-красный', true, /авто-красный/.test(a(scan({ 'ИРД': '2024-05-01' }), { progress: { pct: 0, stageName: '1. ИРД' }, status: 'На паузе' })));
chk('«Ждём заказчика» давно без даты -> додолбить', true, /додолбить/.test(a(scan({ 'АР': '2026-08-01' }), { progress: { pct: 10, stageName: '3. Схема КЖ' }, status: 'Ждём заказчика' })));
chk('ERP 96%/экспертиза, а на диске свежий этап 5 -> проверьте статус/фазу', true, /проверьте статус/.test(a(scan({ 'АР': '2026-11-17', 'КЖ': '2026-07-01', 'ОВ': '2026-11-06', 'ВК': '2026-10-16', 'ЭЛ': '2026-06-25', 'СС': '2026-06-04' }), { progress: { pct: 96, stageName: '8. Этап 6. Экспертиза', stage: 8 }, status: 'Ждём заказчика' })));
chk('90%+ и стоит >30 дн -> авто-эскалация', true, /эскалаци/.test(a(scan({ 'АР': '2026-09-01', 'Смета': '2026-09-01' }, { 'экспертиза': true }), { progress: { pct: 96, stageName: '8. Экспертиза', stage: 8 }, status: 'Ждём заказчика' })));
chk('в норме (свежая работа, В работе) -> без аномалий', '', a(scan({ 'АР': '2026-11-18', 'ОВ': '2026-11-10', 'ВК': '2026-11-10', 'КЖ': '2026-10-01' }), { progress: { pct: 36, stageName: '4. Финальные планы', stage: 4 }, status: 'В работе' }));

console.log('== дней без движения и чей ход ==');
const r = S.analyzeScan(scan({ 'АР': '2026-11-09' }), { progress: { pct: 10 }, status: 'В работе' }, T);
chk('дней без движения = 10', 10, r.daysIdle);
chk('ход наш при раннем проектировании', true, /наш/.test(S.analyzeScan(scan({ 'АР': '2026-02-01', 'КЖ': '2026-02-01', 'ОВ': '2026-03-01', 'ВК': '2026-03-01' }), {}, T).whoseTurn));
chk('ход заказчика на экспертизе', true, /заказчик|госорган/.test(S.analyzeScan(scan({ 'Смета': '2026-05-01' }, { 'экспертиза': true }), {}, T).whoseTurn));

console.log(`\nИтого: ${pass} ✓, ${fail} ✗`);
process.exit(fail ? 1 : 0);
