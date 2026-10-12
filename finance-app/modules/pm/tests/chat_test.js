'use strict';
// Переписка (WhatsApp) без сервера: приём пачки от моста, дубли, лимиты, сигнатуры файлов, привязка группы и перепроставление pid,
// права чтения, порции ленты, авто-событие в журнале, «→ В журнал», ключ ИИ, копия файлов в папку проекта (только внутрь подпапки, без перезаписи, «только чтение»).
// Запуск из finance-app: node modules/pm/tests/chat_test.js  (последняя строка — «ok» или «fail N»; вызывается и из api_test.sh)
// Всё пишется во временную папку data-dev/pm-chat-test-<pid> (в .gitignore); сетевые диски не трогаются — корень задаётся через BOARD_ROOTS.
const fs = require('fs'); const path = require('path');
const APP = path.join(__dirname, '..', '..', '..');
const tmp = path.join(APP, 'data-dev', `pm-chat-test-${process.pid}`); const DISK = path.join(tmp, 'disk'); const DATA = path.join(tmp, 'data');
fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(path.join(DISK, '101-Тест'), { recursive: true }); fs.mkdirSync(path.join(DISK, '102-Доска'), { recursive: true }); fs.mkdirSync(DATA, { recursive: true });
process.env.BOARD_ROOTS = `t|T:|${DISK}|rp,ep`;
const S = require('../server.js'); const PM = S.domain; const BOARD = require('../../board/server.js');
let pass = 0, fail = 0;
const chk = (name, want, got) => { if (String(want) === String(got)) { pass++; console.log(`  ✓ ${name} (${got})`); } else { fail++; console.log(`  ✗ ${name}: ожидалось ${want}, получено ${got}`); } };
const T = PM.today();

// ---- чистая логика ----
chk('расширение по типу и по имени', 'ogg/jpg/docx//pdf', [PM.chatFileExt('audio/ogg; codecs=opus', 'v'), PM.chatFileExt('', 'План.JPEG'), PM.chatFileExt('application/octet-stream', 'ТЗ.docx'), PM.chatFileExt('video/mp4', 'a.mp4'), PM.chatFileExt('application/pdf', 'a.exe')].join('/'));
chk('сигнатуры: docx (zip), doc (OLE), ogg, mp3, m4a, wav — да; docx с байтами PDF — нет', 'true/true/true/true/true/true/false',
  [PM.chatFileSig('docx', Buffer.from([0x50, 0x4b, 3, 4])), PM.chatFileSig('doc', Buffer.from([0xd0, 0xcf, 0x11, 0xe0])), PM.chatFileSig('ogg', Buffer.from('OggS')), PM.chatFileSig('mp3', Buffer.from('ID3')), PM.chatFileSig('m4a', Buffer.from('0000ftypM4A ')), PM.chatFileSig('wav', Buffer.from('RIFF0000WAVE')), PM.chatFileSig('docx', Buffer.from('%PDF-1.7'))].join('/'));
chk('имя файла: без пути, запрещённых символов, служебных имён; пустое → «файл»; чужое расширение не подменяет принятое', 'evil.pdf|План 1 этаж.jpg|файл.pdf|_con.pdf|x.exe.pdf',
  [PM.chatSafeName('..\\..\\evil.pdf', 'pdf'), PM.chatSafeName('C:\\a\\План: 1 этаж?.JPEG', 'jpg'), PM.chatSafeName('', 'pdf'), PM.chatSafeName('con.pdf', 'pdf'), PM.chatSafeName('x.exe', 'pdf')].join('|'));
chk('имя файла ≤ 120; подпапка: «..» и слэши → по умолчанию; нумерация', `120/${PM.CHAT_FOLDER_DEFAULT}/${PM.CHAT_FOLDER_DEFAULT}/Входящие WA/a (3).pdf`,
  [PM.chatSafeName('а'.repeat(300) + '.pdf', 'pdf').length, PM.chatFolderName('../x'), PM.chatFolderName('a\\b'), PM.chatFolderName('Входящие: WA'), PM.chatNumbered('a.pdf', 3)].join('/'));
const SP = [{ id: 'a', track: 'rp', name: 'ЖК «Северный квартал»', status: 'В работе' }, { id: 'b', track: 'ep', name: 'ЖК «Северный квартал»', status: 'Готово' }, { id: 'c', track: 'rp', name: 'Бизнес-центр Орион', status: 'В работе' }];
chk('подсказка проекта: «РП» в названии → РП, «эскиз» → ЭП, одно слово, посторонняя группа — нет', 'a/b/c/null',
  [PM.chatSuggest('MOST | Северный квартал РП', SP), PM.chatSuggest('Северного квартала эскиз', SP), PM.chatSuggest('Орион', SP), PM.chatSuggest('Семья', SP)].map(x => x ? x.pid : 'null').join('/'));
chk('сообщение: ts секундами и ISO, без extId, плохое время, будущее', '2026-10-01T03:00:00.000Z/2026-10-01T03:00:00.000Z/нет extId/нет времени ts/время ts в будущем',
  [PM.cleanChatMessage({ extId: 'x', ts: 1790823600 }).msg.ts, PM.cleanChatMessage({ extId: 'x', ts: '2026-10-01T08:00:00+05:00' }).msg.ts, PM.cleanChatMessage({ ts: 1 }).error, PM.cleanChatMessage({ extId: 'x', ts: 'вчера' }).error, PM.cleanChatMessage({ extId: 'x', ts: Date.now() + 3 * 864e5 }).error].join('/'));

// ---- обработчик API в памяти ----
let n = 0;
const P1 = { id: 'p1', track: 'rp', name: 'ЖК «Тестовый квартал»', status: 'В работе', gipId: 'u-gip', pmId: '', members: { team: ['u-mem'] }, folder: 'T:\\101-Тест', createdAt: '2026-01-10T05:00:00.000Z', createdBy: 'u-own' };
const P2 = { id: 'p2', track: 'ep', name: 'Бизнес-центр «Пример»', status: 'В работе', pmId: 'u-pm', gipId: '' };
const db = { pmProjects: [P1, P2], pmItems: [{ id: 'i1', pid: 'p1', stage: 1, stageName: 'Этап 1', title: 'Пункт сотрудника', role: 'ГАП', section: 'АР', done: false, na: false, assigneeId: 'u-st' }],
  pmBlockers: [], pmLog: [], pmChats: [], pmChatMessages: [], users: [], projects: [], subcontracts: [], ops: [], contracts: [], boards: [], boardConfig: [], settings: { pm: { staffOwnProjects: true } } };
let modules = { board: BOARD };
function call(user, method, pathStr, body, qs) {
  let res; const ctx = { parts: ['pm', ...pathStr.split('/')], method, body: body || {}, qs: qs || {}, user, db, D: {}, today: () => T, num: v => Number(v) || 0,
    pick: (o, keys) => Object.fromEntries(keys.filter(k => o && k in o).map(k => [k, o[k]])), modules, emit() {},
    store: { id: () => 'n' + (n++), save() {}, audit() {}, DATA_DIR: DATA }, ok: b => (res = { s: 200, b }), err: (s, m) => (res = { s, b: m }), send: (s, b, h) => (res = { s, b, h }) };
  S.handle(ctx); return res;
}
const OWN = { id: 'u-own', role: 'owner', name: 'Владелец' }, PART = { id: 'u-part', role: 'partner' }, GIP = { id: 'u-gip', role: 'gip' }, GIP2 = { id: 'u-gip2', role: 'gip' }, PMU = { id: 'u-pm', role: 'pm' }, PMX = { id: 'u-pmx', role: 'pm' },
  LEAD = { id: 'u-lead', role: 'lead', section: 'ОВ' }, STAFF = { id: 'u-st', role: 'staff' }, STAFF2 = { id: 'u-st2', role: 'staff' }, MEM = { id: 'u-mem', role: 'staff' }, ACC = { id: 'u-acc', role: 'accountant' }, SEC = { id: 'u-sec', role: 'secretary' },
  AI = { id: 'u-own', role: 'owner', name: 'Владелец', viaToken: 'tok1', tokenName: 'Мост WhatsApp' }; // ключ ИИ: действует от имени владельца
const b64 = buf => buf.toString('base64');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]); const PDF = Buffer.from('%PDF-1.7\n% вымышленный документ\n'); const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(32)]); const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(32)]);
const G1 = { extId: '120363000000000001@g.us', name: 'MOST | Тестовый квартал РП' }, G2 = { extId: '120363000000000002@g.us', name: 'Соседи по даче' };
const ts = (d, h, m) => `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}:00+05:00`;
const ingest = (u, chat, messages, extra) => call(u, 'POST', 'chats/ingest', Object.assign({ source: 'whatsapp', chat, messages }, extra));

// приём: права
const first = [{ extId: 'A1', ts: ts(1, 9), author: 'Заказчик Тестов', phone: '+7 700 000 00 01', text: 'Добрый день! Высылаю планировки.', kind: 'text' },
  { extId: 'A2', ts: ts(1, 9, 5), author: 'Заказчик Тестов', phone: '+7 700 000 00 01', text: 'План 1 этажа', kind: 'image', files: [{ name: 'plan.png', type: 'image/png', data: b64(PNG) }] },
  { extId: 'A3', ts: ts(1, 10), author: 'Архитектор Примеров', phone: '+7 700 000 00 02', text: 'Принято, ответим завтра', quoted: 'Высылаю планировки', kind: 'text' }];
chk('приём: ГИП, ПМ, бухгалтер, сотрудник — 403', '403/403/403/403', [ingest(GIP, G1, first).s, ingest(PMU, G1, first).s, ingest(ACC, G1, first).s, ingest(STAFF, G1, first).s].join('/'));
chk('приём до первой удачной пачки: групп нет', 0, db.pmChats.length);
const r1 = ingest(AI, G1, first);
chk('приём по ключу ИИ (от имени владельца): 200, принято 3, файл 1', '200/3/0/0/1', [r1.s, r1.b.accepted, r1.b.duplicates, r1.b.rejected.length, r1.b.files].join('/'));
const C1 = db.pmChats[0];
chk('неизвестная группа создана непривязанной', 'whatsapp/120363000000000001@g.us//false/3/true', [C1.source, C1.extId, C1.pid, C1.muted, C1.count, r1.b.chat.created].join('/'));
chk('сообщение: pid пуст, автор, телефон как пришёл, цитата, ts в UTC', '/Архитектор Примеров/+7 700 000 00 02/Высылаю планировки/2026-10-01T05:00:00.000Z', (m => [m.pid, m.author, m.phone, m.quoted, m.ts].join('/'))(db.pmChatMessages.find(m => m.extId === 'A3')));
const F1 = db.pmChatMessages.find(m => m.extId === 'A2').files[0];
chk('файл: на диске DATA_DIR/pm-files/chats/<chatId>/, ключ по шаблону, без группы-проекта savedTo пуст', 'true/true/', [fs.existsSync(path.join(DATA, 'pm-files', 'chats', C1.id, F1.key)), PM.CHAT_KEY_RE.test(F1.key), F1.savedTo].join('/'));
// дубли, правка, удаление
const r2 = ingest(OWN, G1, first);
chk('повторная отправка той же пачки: дубли 3, новых 0, сообщений 3, файл не задвоился', '0/3/3/1', [r2.b.accepted, r2.b.duplicates, db.pmChatMessages.length, fs.readdirSync(path.join(DATA, 'pm-files', 'chats', C1.id)).length].join('/'));
const r3 = ingest(PART, G1, [{ extId: 'A1', ts: ts(1, 9), text: 'Добрый день! Высылаю планировки и ТЗ.', editedAt: ts(1, 9, 30) }, { extId: 'A3', ts: ts(1, 10), deleted: true }, { extId: 'A4', ts: ts(1, 11), author: 'Заказчик Тестов', text: 'Новое' }]);
chk('правка и удаление: обновлено 2, принято 1', '2/1/0', [r3.b.updated, r3.b.accepted, r3.b.duplicates].join('/'));
chk('правка: новый текст и editedAt; удалённое помечено', 'Добрый день! Высылаю планировки и ТЗ./true/true', [db.pmChatMessages.find(m => m.extId === 'A1').text, !!db.pmChatMessages.find(m => m.extId === 'A1').editedAt, db.pmChatMessages.find(m => m.extId === 'A3').deleted].join('/'));
chk('extId уникален в пределах чата: тот же extId в другой группе — новое сообщение', '1/5', (r => [r.b.accepted, db.pmChatMessages.length].join('/'))(ingest(OWN, G2, [{ extId: 'A1', ts: ts(2, 9), author: 'Сосед', text: 'Кто поливает?' }])));
const C2 = db.pmChats[1];
// плохие запросы и сообщения
chk('source не whatsapp, нет chat.extId, пустой messages — 400', '400/400/400', [call(OWN, 'POST', 'chats/ingest', { source: 'telegram', chat: G1, messages: first }).s, ingest(OWN, { name: 'x' }, first).s, ingest(OWN, G1, []).s].join('/'));
const bad = ingest(OWN, G1, [{ ts: ts(2, 9), text: 'без id' }, { extId: 'B2', ts: 'когда-то', text: 'x' }, { extId: 'B3', ts: Date.now() + 5 * 864e5, text: 'x' }, { extId: 'B4', ts: ts(2, 9), text: '  ' }, { extId: 'B5', ts: ts(2, 9, 1), text: 'хорошее' }]);
chk('отклонено 4 с причинами, принято 1', '1/нет extId|нет времени ts|время ts в будущем|пустое сообщение', [bad.b.accepted, bad.b.rejected.map(x => x.reason).join('|')].join('/'));
// лимиты
chk('201 сообщение — 413, ничего не принято', `413/${db.pmChatMessages.length}`, [ingest(OWN, G1, Array.from({ length: 201 }, (_, i) => ({ extId: 'L' + i, ts: ts(2, 10), text: 'x' }))).s, db.pmChatMessages.length].join('/'));
const mb13 = b64(Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(13 * 1048576)]));
chk('больше 25 МБ за запрос — 413', 413, ingest(OWN, G1, [{ extId: 'S1', ts: ts(2, 10), text: 'a', files: [{ name: 'a.pdf', type: 'application/pdf', data: mb13 }] }, { extId: 'S2', ts: ts(2, 10), text: 'b', files: [{ name: 'b.pdf', type: 'application/pdf', data: mb13 }] }]).s);
const big = Buffer.alloc(PM.CHAT_MAX_FILE + 10); big.write('%PDF-1.7');
const rb = ingest(OWN, G1, [{ extId: 'S3', ts: ts(2, 10, 1), author: 'Заказчик Тестов', text: 'Большой файл', kind: 'doc', files: [{ name: 'big.pdf', type: 'application/pdf', data: b64(big) }] }]);
chk('файл больше 20 МБ: сообщение принято без файла, причина в filesRejected', '1/0/true', [rb.b.accepted, db.pmChatMessages.find(m => m.extId === 'S3').files.length, /20 МБ/.test(rb.b.filesRejected[0].reason)].join('/'));
// сигнатуры и типы
const rs = ingest(OWN, G1, [{ extId: 'T1', ts: ts(2, 11), author: 'Заказчик Тестов', text: 'Документы', kind: 'doc', files: [
  { name: 'ТЗ.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: b64(DOCX) }, { name: 'договор.pdf', type: 'application/pdf', data: b64(PDF) },
  { name: 'поддельный.pdf', type: 'application/pdf', data: b64(PNG) }, { name: 'голос.ogg', type: 'audio/ogg; codecs=opus', data: b64(OGG) }, { name: 'ролик.mp4', type: 'video/mp4', data: b64(PNG) },
  { name: 'setup.exe', type: 'application/x-msdownload', data: b64(PNG) }, { name: 'пусто.png', type: 'image/png', data: '' }] }]);
chk('принято 3 файла (docx, pdf, ogg), отклонено 4 (сигнатура, видео, exe, пустой)', '3/4/docx,pdf,ogg', [rs.b.files, rs.b.filesRejected.length, db.pmChatMessages.find(m => m.extId === 'T1').files.map(f => f.key.split('.').pop()).join(',')].join('/'));
chk('причины отказа файлов', 'true/true/true/true', [/не совпадает/.test(rs.b.filesRejected[0].reason), /не принимается/.test(rs.b.filesRejected[1].reason), /не принимается/.test(rs.b.filesRejected[2].reason), /пустой/.test(rs.b.filesRejected[3].reason)].join('/'));
chk('досылка файла к уже принятому сообщению без файлов — обновление, не дубль', '1/1', (r => [r.b.updated, db.pmChatMessages.find(m => m.extId === 'S3').files.length].join('/'))(ingest(OWN, G1, [{ extId: 'S3', ts: ts(2, 10, 1), text: 'Большой файл', files: [{ name: 'small.pdf', type: 'application/pdf', data: b64(PDF) }] }])));
// состояние моста
chk('состояние моста: чужой — 403, плохое — 400, по ключу ИИ — 200', '403/400/200', [call(GIP, 'POST', 'chats/ingest-status', { state: 'connected' }).s, call(OWN, 'POST', 'chats/ingest-status', { state: 'ok' }).s, call(AI, 'POST', 'chats/ingest-status', { state: 'qr', info: 'ждёт сканирования' }).s].join('/'));
// список групп и привязка
const lo = call(OWN, 'GET', 'chats').b;
chk('список руководителя: 2 группы, состояние моста, подсказка проекта по названию, последнее сообщение', '2/qr/ждёт QR-код/Мост WhatsApp/p1/true', [lo.chats.length, lo.bridge.state, lo.bridge.label, lo.bridge.by, (lo.chats.find(c => c.id === C1.id).suggest || {}).pid, !!lo.chats.find(c => c.id === C1.id).last].join('/'));
chk('список: посторонняя группа без подсказки; счётчики сообщений и файлов', 'null/7/5', [String(lo.chats.find(c => c.id === C2.id).suggest), lo.chats.find(c => c.id === C1.id).count, lo.chats.find(c => c.id === C1.id).files].join('/'));
chk('список: бухгалтер, руководитель раздела, сотрудник, ПМ без проектов — 403; ГИП и ПМ проекта — 200 без JID и текста', '403/403/403/403/200/200/false', [call(ACC, 'GET', 'chats').s, call(LEAD, 'GET', 'chats').s, call(STAFF, 'GET', 'chats').s, call(PMX, 'GET', 'chats').s, call(GIP, 'GET', 'chats').s, call(PMU, 'GET', 'chats').s, call(GIP, 'GET', 'chats').b.chats.some(c => 'extId' in c || 'last' in c)].join('/'));
chk('до привязки: переписки в проекте нет, файл непривязанной группы — только руководителю', '0/403/200', [call(GIP, 'GET', 'projects/p1/chat').b.all, call(GIP, 'GET', `chats/${C1.id}/files/${F1.key}`).s, call(OWN, 'GET', `chats/${C1.id}/files/${F1.key}`).s].join('/'));
chk('привязка: ПМ — к чужому проекту 403, «не грузить» от ГИП 403, бухгалтер 403, несуществующий проект 400', '403/403/403/400', [call(PMU, 'PUT', 'chats/' + C1.id, { pid: 'p1' }).s, call(GIP, 'PUT', 'chats/' + C1.id, { muted: true }).s, call(ACC, 'PUT', 'chats/' + C1.id, { pid: 'p1' }).s, call(OWN, 'PUT', 'chats/' + C1.id, { pid: 'нет' }).s].join('/'));
const bd = call(GIP, 'PUT', 'chats/' + C1.id, { pid: 'p1' });
chk('ГИП привязал к своему проекту: всем сообщениям группы проставлен pid', '200/7/7/0', [bd.s, bd.b.moved, db.pmChatMessages.filter(m => m.pid === 'p1').length, db.pmChatMessages.filter(m => m.chatId === C2.id && m.pid).length].join('/'));
chk('ГИП: отвязать — 403; ПМ: перепривязать чужую группу к своему проекту — 403', '403/403', [call(GIP, 'PUT', 'chats/' + C1.id, { pid: '' }).s, call(PMU, 'PUT', 'chats/' + C1.id, { pid: 'p2' }).s].join('/'));
call(OWN, 'PUT', 'chats/' + C1.id, { pid: 'p2' });
chk('владелец перепривязал: pid у всех сообщений — новый проект', '7/0', [db.pmChatMessages.filter(m => m.pid === 'p2').length, db.pmChatMessages.filter(m => m.pid === 'p1').length].join('/'));
call(OWN, 'PUT', 'chats/' + C1.id, { pid: 'p1' });
chk('новое сообщение привязанной группы получает pid проекта', 'p1', (ingest(OWN, G1, [{ extId: 'N1', ts: ts(3, 9), author: 'Заказчик Тестов', text: 'Ждём замечания' }]), db.pmChatMessages.find(m => m.extId === 'N1').pid));
// «не грузить»
call(OWN, 'PUT', 'chats/' + C2.id, { muted: true });
chk('«не грузить»: сообщения не принимаются, мост получает счётчик muted', '0/2/1', (r => [r.b.accepted, r.b.muted, db.pmChatMessages.filter(m => m.chatId === C2.id).length].join('/'))(ingest(OWN, G2, [{ extId: 'M1', ts: ts(3, 9), text: 'x' }, { extId: 'M2', ts: ts(3, 9), text: 'y' }])));
// права чтения
const rd = u => call(u, 'GET', 'projects/p1/chat').s; const rf = u => call(u, 'GET', `chats/${C1.id}/files/${F1.key}`).s;
chk('читают: владелец, партнёр, ГИП проекта, любой ГИП (РП)', '200/200/200/200', [rd(OWN), rd(PART), rd(GIP), rd(GIP2)].join('/'));
chk('не читают (настройка выключена): чужой ПМ, руководитель раздела, участник, исполнитель, бухгалтер, секретарь', '403/403/403/403/403/403', [rd(PMU), rd(LEAD), rd(MEM), rd(STAFF), rd(ACC), rd(SEC)].join('/'));
chk('файл без права чтения не отдаётся; с правом — тип image/png, nosniff', '403/403/403/200/image/png/nosniff', [rf(MEM), rf(ACC), rf(PMU), rf(GIP), call(GIP, 'GET', `chats/${C1.id}/files/${F1.key}`).h['Content-Type'], call(GIP, 'GET', `chats/${C1.id}/files/${F1.key}`).h['X-Content-Type-Options']].join('/'));
chk('чужой ключ файла — 404; docx отдаётся только на скачивание', '404/true', [call(GIP, 'GET', `chats/${C1.id}/files/zzz-zzz.png`).s, /^attachment/.test(call(GIP, 'GET', `chats/${C1.id}/files/${db.pmChatMessages.find(m => m.extId === 'T1').files[0].key}`).h['Content-Disposition'])].join('/'));
chk('карточка: canChat и счётчик (без удалённого) — ГИП да, участник нет', 'true/7/false/false', (a => [a.canChat, a.chatN, call(MEM, 'GET', 'projects/p1').b.canChat, 'chatN' in call(MEM, 'GET', 'projects/p1').b].join('/'))(call(GIP, 'GET', 'projects/p1').b));
chk('настройка chatForMembers: ГИП — 403, владелец — 200', '403/200/true', [call(GIP, 'PUT', 'settings', { chatForMembers: true }).s, call(OWN, 'PUT', 'settings', { chatForMembers: true }).s, db.settings.pm.chatForMembers].join('/'));
chk('включено: участник и исполнитель пункта читают; чужой сотрудник, руководитель раздела, бухгалтер, секретарь, чужой ПМ — нет', '200/200/403/403/403/403/403', [rd(MEM), rd(STAFF), rd(STAFF2), rd(LEAD), rd(ACC), rd(SEC), rd(PMU)].join('/'));
chk('включено: файл участнику отдаётся, бухгалтеру — нет', '200/403', [rf(MEM), rf(ACC)].join('/'));
call(OWN, 'PUT', 'settings', { chatForMembers: false });
// лента: удалённое без текста, порции, поиск, только файлы, дата
const feed = call(GIP, 'GET', 'projects/p1/chat').b;
chk('лента: по времени, удалённое сообщение без текста и файлов, ссылка на файл', 'true/true//true', [feed.messages.every((m, i, a) => !i || a[i - 1].ts <= m.ts), feed.messages.find(m => m.ts === '2026-10-01T05:00:00.000Z').deleted, feed.messages.find(m => m.deleted).text, /^\/api\/pm\/chats\/.+\/files\//.test(feed.messages.find(m => m.files.length).files[0].url)].join('/'));
ingest(OWN, G1, Array.from({ length: 150 }, (_, i) => ({ extId: 'P' + i, ts: `2026-10-0${4 + Math.floor(i / 50)}T0${3 + Math.floor((i % 50) / 10)}:${String(i % 50 % 10 * 5).padStart(2, '0')}:00Z`, author: i % 2 ? 'Заказчик Тестов' : 'Архитектор Примеров', text: `Сообщение ${i}` })));
const pg = call(GIP, 'GET', 'projects/p1/chat').b;
chk('порции: последние 100, есть «раньше», позже нет', '100/true/false/158', [pg.messages.length, pg.moreBefore, pg.moreAfter, pg.total].join('/'));
const pg2 = call(GIP, 'GET', 'projects/p1/chat', null, { before: pg.messages[0].id }).b;
chk('«показать раньше»: остальные 58, без пересечения, дальше нет', '58/false/true', [pg2.messages.length, pg2.moreBefore, pg2.messages[pg2.messages.length - 1].ts <= pg.messages[0].ts].join('/'));
const pd = call(GIP, 'GET', 'projects/p1/chat', null, { date: '2026-10-05' }).b;
chk('переход на дату: с первого сообщения дня, есть раньше и позже', '2026-10-05/true/true', [PM.almatyDate(pd.messages[0].ts), pd.moreBefore, pd.moreAfter === (pd.total - pd.messages.length - 59 > 0)].join('/'));
chk('поиск по тексту и автору; только файлы', '1/3', [call(GIP, 'GET', 'projects/p1/chat', null, { q: 'ждём замечания тестов' }).b.total, call(GIP, 'GET', 'projects/p1/chat', null, { files: '1' }).b.total].join('/'));
// авто-событие в журнале
const lg = call(GIP, 'GET', 'projects/p1/log').b.events.filter(e => e.type === 'chat');
chk('журнал: одна строка на день и группу', '6/true', [lg.length, new Set(lg.map(e => e.date)).size === lg.length].join('/'));
chk('журнал: текст события и ссылка на дату', 'WhatsApp «MOST | Тестовый квартал РП»: 3 сообщения, 1 файл/2026-10-01/true', (e => [e.text, e.chatDate, e.chatId === C1.id].join('/'))(lg.find(e => e.date === '2026-10-01')));
chk('журнал: 50 сообщений за день, 0 файлов; участник без права чтения событий переписки не видит', 'true/0', [/: 50 сообщений, 0 файлов$/.test(lg.find(e => e.date === '2026-10-05').text), call(MEM, 'GET', 'projects/p1/log').b.events.filter(e => e.type === 'chat').length].join('/'));
// «→ В журнал»
const mImg = db.pmChatMessages.find(m => m.extId === 'A2'), mDoc = db.pmChatMessages.find(m => m.extId === 'T1');
chk('в журнал: бухгалтер и участник без права чтения — 403; удалённое сообщение — 404', '403/403/404', [call(ACC, 'POST', `chats/messages/${mImg.id}/to-log`, { type: 'decision' }).s, call(MEM, 'POST', `chats/messages/${mImg.id}/to-log`, { type: 'note' }).s, call(GIP, 'POST', `chats/messages/${db.pmChatMessages.find(m => m.extId === 'A3').id}/to-log`, {}).s].join('/'));
const tl = call(GIP, 'POST', `chats/messages/${mImg.id}/to-log`, { type: 'decision' });
chk('в журнал: запись с типом, датой сообщения, автором в тексте и ссылкой на сообщение', '200/decision/2026-10-01/Заказчик Тестов: План 1 этажа/chat/true', [tl.s, tl.b.type, tl.b.date, tl.b.text, tl.b.source, tl.b.chatRef.msgId === mImg.id && tl.b.chatRef.date === '2026-10-01'].join('/'));
chk('в журнал: картинка скопирована в папку вложений журнала', '1/true', [tl.b.files.length, fs.existsSync(path.join(DATA, 'pm-files', 'p1', tl.b.files[0].key))].join('/'));
chk('в журнал повторно — 409; в ленте переписки отметка inLog', '409/true', [call(GIP, 'POST', `chats/messages/${mImg.id}/to-log`, { type: 'note' }).s, call(GIP, 'GET', 'projects/p1/chat', null, { date: '2026-10-01', limit: 3 }).b.messages.find(m => m.id === mImg.id).inLog].join('/'));
const tl2 = call(OWN, 'POST', `chats/messages/${mDoc.id}/to-log`, { type: 'client' });
chk('в журнал: PDF вложением, docx и аудио — списком в тексте', '1/true', [tl2.b.files.length, /Файлы в переписке: ТЗ\.docx, голос\.ogg/.test(tl2.b.text)].join('/'));

// ---- копия файлов в папку проекта (корень T: → временная папка data-dev) ----
const SUB = path.join(DISK, '101-Тест', PM.CHAT_FOLDER_DEFAULT); const tree = dir => fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(String).sort() : [];
chk('до «Досохранить»: в папке проекта пусто, в списке групп — сколько не сохранено', '0/5/T:\\101-Тест', (c => [tree(path.join(DISK, '101-Тест')).length, c.unsaved, c.folder].join('/'))(call(OWN, 'GET', 'chats').b.chats.find(c => c.id === C1.id)));
chk('«Досохранить»: бухгалтер и ПМ чужого проекта — 403', '403/403', [call(ACC, 'POST', 'chats/save-files', { chatId: C1.id }).s, call(PMU, 'POST', 'chats/save-files', { chatId: C1.id }).s].join('/'));
const sv = call(GIP, 'POST', 'chats/save-files', { chatId: C1.id });
chk('«Досохранить» (ГИП проекта): 5 файлов сохранено, ошибок нет', '200/5/0', [sv.s, sv.b.saved, sv.b.failed].join('/'));
chk('файлы лежат в <папка проекта>/<подпапка>/<дата>/<имя>', 'true/true/true', [fs.existsSync(path.join(SUB, '2026-10-01', 'plan.png')), fs.existsSync(path.join(SUB, '2026-10-02', 'ТЗ.docx')), fs.existsSync(path.join(SUB, '2026-10-02', 'голос.ogg'))].join('/'));
chk('у файла — отображаемый путь savedTo', `T:\\101-Тест\\${PM.CHAT_FOLDER_DEFAULT}\\2026-10-01\\plan.png`, mImg.files[0].savedTo);
chk('повтор «Досохранить»: ничего не копируется, дублей на диске нет', '0/5', [call(OWN, 'POST', 'chats/save-files', { chatId: C1.id }).b.saved, tree(SUB).filter(x => /\.\w+$/.test(x)).length].join('/'));
// приём сразу в папку: выход из подпапки именем файла, одинаковые имена
const ev = ingest(OWN, G1, [{ extId: 'E1', ts: ts(9, 9), author: 'Заказчик Тестов', text: 'Файл', kind: 'doc', files: [{ name: '..\\..\\..\\evil.pdf', type: 'application/pdf', data: b64(PDF) }] },
  { extId: 'E2', ts: ts(9, 9, 1), author: 'Заказчик Тестов', text: 'Ещё', kind: 'doc', files: [{ name: '/etc/C:evil.pdf', type: 'application/pdf', data: b64(PDF) }, { name: 'evil.pdf', type: 'application/pdf', data: b64(PDF) }] }]);
chk('приём привязанной группы: файлы сразу в папке проекта', '2/3/0', [ev.b.accepted, ev.b.savedToFolder, ev.b.saveFailed].join('/'));
chk('имя с «..» и абсолютным путём не выводит из подпапки; одинаковые имена — « (2)», без перезаписи', 'C evil.pdf,evil (2).pdf,evil.pdf', tree(path.join(SUB, '2026-10-09')).join(','));
chk('вне подпапки проекта ничего не появилось', '101-Тест,102-Доска/' + PM.CHAT_FOLDER_DEFAULT, [fs.readdirSync(DISK).sort().join(','), fs.readdirSync(path.join(DISK, '101-Тест')).join(',')].join('/'));
chk('повторная отправка того же сообщения файл не копирует', '1/3', [ingest(OWN, G1, [{ extId: 'E1', ts: ts(9, 9), text: 'Файл', files: [{ name: 'evil.pdf', type: 'application/pdf', data: b64(PDF) }] }]).b.duplicates, tree(path.join(SUB, '2026-10-09')).length].join('/'));
chk('журнал: «(в папке проекта: K)» в строке дня', true, /3 файла \(в папке проекта: 3\)$/.test(call(GIP, 'GET', 'projects/p1/log').b.events.find(e => e.type === 'chat' && e.date === '2026-10-09').text));
chk('лента: у файла savedTo', true, call(GIP, 'GET', 'projects/p1/chat', null, { date: '2026-10-09' }).b.messages[0].files[0].savedTo.endsWith('\\2026-10-09\\evil.pdf'));
// существующий файл не перезаписывается
fs.mkdirSync(path.join(SUB, '2026-10-10'), { recursive: true }); fs.writeFileSync(path.join(SUB, '2026-10-10', 'смета.pdf'), 'чужой файл');
ingest(OWN, G1, [{ extId: 'E3', ts: ts(10, 9), author: 'Заказчик Тестов', text: 'Смета', files: [{ name: 'смета.pdf', type: 'application/pdf', data: b64(PDF) }] }]);
chk('существующий файл с тем же именем цел, новый — « (2)»', 'чужой файл/true', [fs.readFileSync(path.join(SUB, '2026-10-10', 'смета.pdf'), 'utf8'), fs.existsSync(path.join(SUB, '2026-10-10', 'смета (2).pdf'))].join('/'));
// подпапка из настроек: попытка выхода → имя по умолчанию
chk('настройка подпапки: «..\\..\\x» → по умолчанию; обычное имя принимается (только владелец/партнёр)', `${PM.CHAT_FOLDER_DEFAULT}/Входящие WA/403`, [call(OWN, 'PUT', 'settings', { chatFolderName: '..\\..\\x' }).b.chatFolderName, call(PART, 'PUT', 'settings', { chatFolderName: 'Входящие WA' }).b.chatFolderName, call(GIP, 'PUT', 'settings', { chatFolderName: 'x' }).s].join('/'));
ingest(OWN, G1, [{ extId: 'E4', ts: ts(10, 10), author: 'Заказчик Тестов', text: 'В новую подпапку', files: [{ name: 'a.png', type: 'image/png', data: b64(PNG) }] }]);
chk('файл — в подпапке из настроек', true, fs.existsSync(path.join(DISK, '101-Тест', 'Входящие WA', '2026-10-10', 'a.png')));
call(OWN, 'PUT', 'settings', { chatFolderName: '' });
// диск только для чтения: приём не падает, у файла savedError, потом «Повторить»
const realCopy = fs.copyFileSync; fs.copyFileSync = (src, dst, mode) => { if (String(dst).startsWith(DISK)) throw Object.assign(new Error('EROFS: read-only file system'), { code: 'EROFS' }); return realCopy(src, dst, mode); };
const ro = ingest(OWN, G1, [{ extId: 'R1', ts: ts(11, 9), author: 'Заказчик Тестов', text: 'При диске только для чтения', files: [{ name: 'ro.pdf', type: 'application/pdf', data: b64(PDF) }] }]);
const fro = db.pmChatMessages.find(m => m.extId === 'R1').files[0];
chk('только чтение: приём 200, сообщение и файл в ERP, savedError с причиной, в папке файла нет', '200/1/1/true/true//false', [ro.s, ro.b.accepted, ro.b.saveFailed, fs.existsSync(path.join(DATA, 'pm-files', 'chats', C1.id, fro.key)), /только для чтения/.test(fro.savedError), fro.savedTo, fs.existsSync(path.join(SUB, '2026-10-11', 'ro.pdf'))].join('/'));
chk('настройки «WhatsApp»: счётчик «не удалось сохранить»', '1/1', (d => [d.saveFailed, d.chats.find(c => c.id === C1.id).saveErrors].join('/'))(call(OWN, 'GET', 'chats').b));
chk('«Повторить» при том же сбое: не падает, ошибка в ответе', '200/0/1/true', (r => [r.s, r.b.saved, r.b.failed, /только для чтения/.test(r.b.errors[0])].join('/'))(call(OWN, 'POST', 'chats/save-files', {})));
fs.copyFileSync = realCopy;
chk('«Повторить» после восстановления записи: сохранён, ошибка снята, счётчик 0', '1/true/false/0', (r => [r.b.saved, fs.existsSync(path.join(SUB, '2026-10-11', 'ro.pdf')), 'savedError' in fro, call(OWN, 'GET', 'chats').b.saveFailed].join('/'))(call(OWN, 'POST', 'chats/save-files', {})));
// папка проекта: вне корней, нет на диске, выключено, нет модуля board, папка доски
const one = (id, d) => ingest(OWN, G1, [{ extId: id, ts: ts(d, 9), author: 'Заказчик Тестов', text: id, files: [{ name: id + '.pdf', type: 'application/pdf', data: b64(PDF) }] }]);
const fileOf = id => db.pmChatMessages.find(m => m.extId === id).files[0];
P1.folder = 'T:\\..\\..\\Windows'; one('O1', 12);
chk('папка проекта с «..»: файл не копируется, ошибки нет (savedTo пуст)', '//true', [fileOf('O1').savedTo, fileOf('O1').savedError || '', !fs.existsSync(path.join(tmp, 'Windows'))].join('/'));
P1.folder = 'C:\\Windows\\Temp'; one('O2', 12);
chk('папка проекта вне разрешённых корней: пропуск', '/', [fileOf('O2').savedTo, fileOf('O2').savedError || ''].join('/'));
P1.folder = 'T:\\'; one('O6', 12);
chk('папка проекта — корень диска: запись запрещена, пропуск', '/1', [fileOf('O6').savedTo, fs.readdirSync(DISK).filter(x => !['101-Тест', '102-Доска'].includes(x)).length + 1].join('/'));
P1.folder = 'T:\\999-Нет такой'; const miss = one('O3', 12);
chk('папки проекта нет на диске: приём 200, savedError, папка не создаётся', '200/1/true/false', [miss.s, miss.b.saveFailed, /недоступна/.test(fileOf('O3').savedError), fs.existsSync(path.join(DISK, '999-Нет такой'))].join('/'));
P1.folder = 'T:\\101-Тест'; call(OWN, 'PUT', 'settings', { chatFilesToFolder: false }); one('O4', 13);
chk('выключатель chatFilesToFolder: файл не копируется; «Досохранить» — 400', '/false/400', [fileOf('O4').savedTo, fs.existsSync(path.join(SUB, '2026-10-13')), call(OWN, 'POST', 'chats/save-files', {}).s].join('/'));
call(OWN, 'PUT', 'settings', { chatFilesToFolder: true }); modules = {}; one('O5', 13);
chk('модуль board недоступен: приём работает, savedTo пуст', '/', [fileOf('O5').savedTo, fileOf('O5').savedError || ''].join('/'));
modules = { board: BOARD }; P1.folder = ''; db.boards.push({ id: 'b1', pmProjectId: 'p1', folder: { root: 't', rel: '102-Доска' } });
const viaBoard = call(OWN, 'POST', 'chats/save-files', { pid: 'p1' });
chk('папка не задана в проекте — берётся папка доски проекта; досохранены пропущенные ранее', 'true/true/true', [viaBoard.b.saved >= 5, fs.existsSync(path.join(DISK, '102-Доска', PM.CHAT_FOLDER_DEFAULT, '2026-10-13', 'O5.pdf')), fileOf('O1').savedTo.startsWith('T:\\102-Доска\\')].join('/'));
chk('в корне диска по-прежнему только две папки проектов', '101-Тест,102-Доска', fs.readdirSync(DISK).sort().join(','));
// удаление проекта: группы отвязаны, сообщения остаются
const total = db.pmChatMessages.length; call(OWN, 'DELETE', 'projects/p1');
chk('удаление проекта: группа снова не привязана, сообщения на месте без pid', `/${total}/0`, [C1.pid, db.pmChatMessages.length, db.pmChatMessages.filter(m => m.pid === 'p1').length].join('/'));

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
console.log(`  итого: ${pass} ✓, ${fail} ✗`);
console.log(fail ? `fail ${fail}` : 'ok');
process.exitCode = fail ? 1 : 0;
