'use strict';
// Журнал проекта (pmLog) без сервера: права на записи, задним числом, импорт пачкой, вложения (сигнатура, лимит 20 МБ), авто-события в ленте, поиск и CSV.
// Запуск из finance-app: node modules/pm/tests/log_test.js  (последняя строка — «ok» или «fail N»; вызывается и из api_test.sh)
const fs = require('fs'); const os = require('os'); const path = require('path');
const S = require('../server.js'); const PM = S.domain;
let pass = 0, fail = 0;
const chk = (name, want, got) => { if (String(want) === String(got)) { pass++; console.log(`  ✓ ${name} (${got})`); } else { fail++; console.log(`  ✗ ${name}: ожидалось ${want}, получено ${got}`); } };
const T = PM.today(); const past = PM.addDays(T, -200); const future = PM.addDays(T, 3);
const dmy = iso => iso.split('-').reverse().join('.');

// ---- чистая логика ----
chk('дата ДД.ММ.ГГГГ / ДД.ММ.ГГ / ISO', '2026-03-05/2026-03-05/2026-03-05', [PM.logDate('05.03.2026'), PM.logDate('5.3.26'), PM.logDate('2026-03-05')].join('/'));
chk('несуществующая дата отбрасывается', '', PM.logDate('31.02.2026'));
chk('cleanLog: без даты — сегодня', T, PM.cleanLog({ text: 'x' }, T).rec.date);
chk('cleanLog: задним числом — можно', past, PM.cleanLog({ text: 'x', date: dmy(past) }, T).rec.date);
chk('cleanLog: будущее — нельзя', true, /будущем/.test(PM.cleanLog({ text: 'x', date: future }, T).error));
chk('cleanLog: пустой текст — ошибка, неизвестный тип → «Заметка»', 'true/note', [!!PM.cleanLog({ text: ' ' }, T).error, PM.cleanLog({ text: 'a', type: 'zzz' }, T).rec.type].join('/'));
const pb = PM.parseLogBatch(`без даты в начале\n${dmy(past)} — Встреча: обсудили посадку\nпродолжение письма\n\n05.03.2026: Решение — фасад в кирпиче\n2026-03-07 просто заметка\n31.02.2026 — нет такой\n${dmy(future)} — будущее`, { today: T, type: 'client' });
chk('импорт: 3 записи, 3 ошибки', '3/3', `${pb.rows.length}/${pb.errors.length}`);
chk('импорт: тип из текста, продолжение строки, тип по умолчанию', `meeting|обсудили посадку\nпродолжение письма/decision|фасад в кирпиче/client|просто заметка`, pb.rows.map(r => `${r.type}|${r.text}`).join('/'));
chk('тип по метке: «Письмо заказчику:», «Звонок —», «Совещание:»; обычный текст с тире — без типа', 'client|отправили/client|договорились/meeting|ок/note|Отправили — письмо',
  [PM.logTypeFromText('Письмо заказчику: отправили'), PM.logTypeFromText('Звонок — договорились'), PM.logTypeFromText('Совещание: ок'), PM.logTypeFromText('Отправили — письмо')].map(x => x.join('|')).join('/'));
chk('импорт: причины ошибок', 'нет даты в начале строки/нет такой даты/дата в будущем', pb.errors.map(e => e.reason).join('/'));
chk('сигнатуры: PNG, JPG, PDF, WebP, GIF — да; PNG с байтами PDF — нет', 'true/true/true/true/true/false',
  [PM.logFileSig('png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d])), PM.logFileSig('jpg', Buffer.from([0xff, 0xd8, 0xff])), PM.logFileSig('pdf', Buffer.from('%PDF-1.7')), PM.logFileSig('webp', Buffer.from('RIFF0000WEBPVP8 ')), PM.logFileSig('gif', Buffer.from('GIF89a')), PM.logFileSig('png', Buffer.from('%PDF-1.7'))].join('/'));

// ---- обработчик API в памяти ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pmlog-'));
let n = 0;
const P = { id: 'p1', track: 'rp', name: 'Журнал-тест', status: 'В работе', gipId: 'u-gip', pmId: '', members: { team: ['u-mem'] }, createdAt: '2026-01-10T05:00:00.000Z', createdBy: 'u-own' };
const db = { pmProjects: [P, { id: 'p2', track: 'rp', name: 'Чужой', status: 'В работе', gipId: 'u-x' }], pmItems: [
  { id: 'i1', pid: 'p1', stage: 1, stageName: 'Этап 1', title: 'Пункт ГИП', role: 'ГИП', section: '', done: false, na: false },
  { id: 'i2', pid: 'p1', stage: 1, stageName: 'Этап 1', title: 'Пункт ОВ', role: 'ОВ', section: 'ОВ', done: false, na: false },
  { id: 'i3', pid: 'p1', stage: 2, stageName: 'Этап 2', title: 'Пункт сотрудника', role: 'ГАП', section: 'АР', done: false, na: false, assigneeId: 'u-st' }],
  pmBlockers: [], pmLog: [], users: [], projects: [], subcontracts: [], ops: [], contracts: [], settings: { pm: { staffOwnProjects: true } } };
function call(user, method, pathStr, body) {
  let res; const ctx = { parts: ['pm', ...pathStr.split('/')], method, body: body || {}, qs: {}, user, db, D: {}, today: () => T, num: v => Number(v) || 0,
    pick: (o, keys) => Object.fromEntries(keys.filter(k => o && k in o).map(k => [k, o[k]])), modules: {}, emit() {},
    store: { id: () => 'n' + (n++), save() {}, audit() {}, DATA_DIR: tmp }, ok: b => (res = { s: 200, b }), err: (s, m) => (res = { s, b: m }), send: (s, b, h) => (res = { s, b, h }) };
  S.handle(ctx); return res;
}
const OWN = { id: 'u-own', role: 'owner' }, GIP = { id: 'u-gip', role: 'gip' }, OTHER = { id: 'u-x', role: 'pm' } /* чужой ПМ: любой ГИП теперь правит все РП (01.10.2026) */, LEAD = { id: 'u-lead', role: 'lead', section: 'ОВ' }, LEAD2 = { id: 'u-lead2', role: 'lead', section: 'ЭЛ' },
  STAFF = { id: 'u-st', role: 'staff' }, STAFF2 = { id: 'u-st2', role: 'staff' }, MEM = { id: 'u-mem', role: 'staff' }, ACC = { id: 'u-acc', role: 'accountant' };

// права на добавление
const add = (u, body) => call(u, 'POST', 'projects/p1/log', Object.assign({ text: 'Запись ' + u.id }, body));
chk('добавляют: руководитель, свой ГИП, руководитель раздела с пунктом, сотрудник со своим пунктом, участник', '200/200/200/200/200', [add(OWN).s, add(GIP).s, add(LEAD).s, add(STAFF).s, add(MEM).s].join('/'));
chk('не добавляют: чужой ПМ, руководитель раздела без пунктов, бухгалтер; чужой сотрудник — проект не виден', '403/403/403/403', [add(OTHER).s, add(LEAD2).s, add(ACC).s, add(STAFF2).s].join('/'));
const back = add(GIP, { date: dmy(past), type: 'meeting', text: 'Встреча с заказчиком', participants: 'Заказчик, ГИП' });
chk('задним числом: дата, тип, участники, автор', `${past}/meeting/Заказчик, ГИП/u-gip`, [back.b.date, back.b.type, back.b.participants, back.b.by].join('/'));
chk('будущая дата — 400', 400, add(GIP, { date: future }).s);
const staffRec = db.pmLog.find(r => r.by === 'u-st');
// правка и удаление
chk('правит автор (сотрудник) — 200; чужую запись сотрудник — 403', '200/403', [call(STAFF, 'PUT', 'log/' + staffRec.id, { text: 'Поправил' }).s, call(STAFF, 'PUT', 'log/' + back.b.id, { text: 'x' }).s].join('/'));
chk('руководитель раздела не правит чужую запись; ГИП проекта — правит любую', '403/200', [call(LEAD, 'PUT', 'log/' + staffRec.id, { text: 'x' }).s, call(GIP, 'PUT', 'log/' + staffRec.id, { type: 'decision' }).s].join('/'));
chk('правка: дату можно сдвинуть назад, тип сохранился, текст автора на месте', `${past}/decision/Поправил`, (r => [r.b.date, r.b.type, r.b.text].join('/'))(call(STAFF, 'PUT', 'log/' + staffRec.id, { date: past })));
chk('правка с будущей датой — 400', 400, call(GIP, 'PUT', 'log/' + back.b.id, { date: future }).s);
// импорт пачкой
const bt = call(GIP, 'POST', 'projects/p1/log/batch', { text: `${dmy(past)} — Решение: принять вариант 2\n05.03.2026 — Письмо: отправили концепцию\nпродолжение`, type: 'note' });
chk('импорт пачкой текстом: 2 записи', '200/2', `${bt.s}/${bt.b.added}`);
chk('импорт пачкой строками: будущее — 400, ничего не добавлено', `400/${db.pmLog.length}`, [call(GIP, 'POST', 'projects/p1/log/batch', { rows: [{ date: past, text: 'ок' }, { date: future, text: 'нет' }] }).s, db.pmLog.length].join('/'));
chk('импорт пачкой: чужой ПМ — 403', 403, call(OTHER, 'POST', 'projects/p1/log/batch', { rows: [{ date: past, text: 'x' }] }).s);
// вложения
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
const up = call(GIP, 'POST', `log/${back.b.id}/files`, { name: 'фото.png', type: 'image/png', data: png.toString('base64') });
chk('вложение PNG: 200, ключ, файл на диске', `200/true/true`, [up.s, PM.LOG_KEY_RE.test(up.b.key || ''), fs.existsSync(path.join(tmp, 'pm-files', 'p1', up.b.key || 'x'))].join('/'));
chk('PDF с байтами картинки — 400 (сигнатура)', true, (r => r.s === 400 && /не совпадает/.test(r.b))(call(GIP, 'POST', `log/${back.b.id}/files`, { name: 'a.pdf', type: 'application/pdf', data: png.toString('base64') })));
chk('тип не из списка (docx) — 400', 400, call(GIP, 'POST', `log/${back.b.id}/files`, { name: 'a.docx', type: 'application/msword', data: png.toString('base64') }).s);
const big = Buffer.alloc(PM.LOG_MAX_FILE + 10); big.write('%PDF-1.7');
chk('больше 20 МБ — 400', true, (r => r.s === 400 && /20 МБ/.test(r.b))(call(GIP, 'POST', `log/${back.b.id}/files`, { name: 'big.pdf', type: 'application/pdf', data: big.toString('base64') })));
chk('вложение в чужую запись (сотрудник) — 403', 403, call(STAFF, 'POST', `log/${back.b.id}/files`, { name: 'p.png', type: 'image/png', data: png.toString('base64') }).s);
const got = call(STAFF, 'GET', `log/${back.b.id}/files/${up.b.key}`);
chk('файл отдаётся участнику проекта с типом image/png', '200/image/png', [got.s, got.h && got.h['Content-Type']].join('/'));
chk('чужой ключ — 404; сотрудник чужого проекта — 403', '404/403', [call(GIP, 'GET', `log/${back.b.id}/files/zzz-zzz.png`).s, call(STAFF2, 'GET', `log/${back.b.id}/files/${up.b.key}`).s].join('/'));
// авто-события: статус и срок проекта (история карточки), пункт сделан/возвращён, блокер открыт/снят, ретро
call(GIP, 'PUT', 'projects/p1', { status: 'Ждём заказчика', due: '2027-01-31' });
call(GIP, 'PUT', 'items/i1', { done: true }); call(GIP, 'PUT', 'items/i1', { done: false });
const bl = call(GIP, 'POST', 'blockers', { pid: 'p1', what: 'Топосъёмка от заказчика', holder: 'Заказчик', since: past }); call(GIP, 'PUT', 'blockers/' + bl.b.id, { status: 'closed' });
call(GIP, 'POST', 'projects/p1/retro', { interpret: 'буфер ест ИРД' });
const feed = call(GIP, 'GET', 'projects/p1/log').b;
const types = new Set(feed.events.filter(e => e.kind === 'auto').map(e => e.type));
chk('лента: события статус, сроки, сделано, возврат, блокер, блокер снят, ретро, проект заведён', 'true', ['status', 'dates', 'done', 'undone', 'blocker', 'blocker-closed', 'retro', 'created'].every(k => types.has(k)));
chk('лента: статус «В работе → Ждём заказчика»', true, feed.events.some(e => e.type === 'status' && /В работе → Ждём заказчика/.test(e.text)));
chk('лента: новые сверху, блокер на дату «с»', 'true/true', [feed.events.every((e, i, a) => !i || a[i - 1].date >= e.date), feed.events.some(e => e.type === 'blocker' && e.date === past)].join('/'));
chk('лента: записи с правом правки и ссылкой на файл', 'true/true', [feed.events.find(e => e.id === back.b.id).canEdit, /\/api\/pm\/log\/.+\/files\//.test(feed.events.find(e => e.id === back.b.id).files[0].url)].join('/'));
chk('лента сотрудника: чужую запись править нельзя, свою можно', 'false/true', (f => [f.find(e => e.id === back.b.id).canEdit, f.find(e => e.id === staffRec.id).canEdit].join('/'))(call(STAFF, 'GET', 'projects/p1/log').b.events));
chk('карточка: счётчик записей и право добавлять', `${db.pmLog.length}/true`, (c => `${c.logN}/${c.canLog}`)(call(GIP, 'GET', 'projects/p1').b));
// массовые отметки сворачиваются
const bulkItems = Array.from({ length: 8 }, (_, i) => ({ id: 'b' + i, pid: 'px', title: 'П' + i, history: [{ at: '2026-02-01T05:00:00Z', by: 'u', field: 'done', from: false, to: true, note: 'по реестру' }] }));
chk('массовые отметки (импорт) — одним событием', '1/8', (f => `${f.length}/${(f[0].titles || []).length}`)(PM.projectFeed({ id: 'px' }, bulkItems, [], [], {}).filter(e => e.type === 'done')));
// фильтр и CSV
chk('фильтр «Только записи»', true, PM.filterFeed(feed.events, { mode: 'log' }).every(e => e.kind === 'log'));
chk('поиск: по тексту и по участникам', '1/1', [PM.filterFeed(feed.events, { q: 'встреча заказчиком' }).length, PM.filterFeed(feed.events, { q: 'заказчик, гип' }).length].join('/'));
const csv = PM.feedCsv(PM.filterFeed(feed.events, { mode: 'log' }), id => ({ 'u-gip': 'Иван ГИП' })[id] || '');
chk('CSV: заголовок, «;», кавычки при переносе строки', 'true/true/true', [csv.startsWith('Дата;Источник;Тип;Запись'), csv.includes(`${dmy(past)};запись;Встреча;Встреча с заказчиком;Заказчик, ГИП;Иван ГИП;фото.png`), csv.includes('"отправили концепцию\nпродолжение"')].join('/'));
// удаление записи — файл тоже
call(GIP, 'DELETE', 'log/' + back.b.id);
chk('удаление записи удаляет вложение с диска', 'false/false', [db.pmLog.some(r => r.id === back.b.id), fs.existsSync(path.join(tmp, 'pm-files', 'p1', up.b.key))].join('/'));
chk('удалить чужую запись сотрудник не может', 403, call(STAFF, 'DELETE', 'log/' + db.pmLog.find(r => r.by === 'u-gip').id).s);
// удаление проекта — записи и папка
call(OWN, 'DELETE', 'projects/p1');
chk('удаление проекта: записи журнала и папка вложений удалены', '0/false', [db.pmLog.filter(r => r.pid === 'p1').length, fs.existsSync(path.join(tmp, 'pm-files', 'p1'))].join('/'));

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
console.log(`  итого: ${pass} ✓, ${fail} ✗`);
console.log(fail ? `fail ${fail}` : 'ok');
process.exitCode = fail ? 1 : 0;
