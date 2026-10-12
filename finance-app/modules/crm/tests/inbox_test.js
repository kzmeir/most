'use strict';
// Проверка «Обращений» (WhatsApp) модуля crm: приём, дубли, телефоны, привязка к сделке, создание сделки, «не заказ», группы, права, файлы, ключ ИИ.
// Запуск из finance-app:  node modules/crm/tests/inbox_test.js
// Поднимает два своих сервера на пустых базах (в .gitignore): 3196 — DEV_USER (роль из cookie devrole), 3194 — обычный режим (вход паролем, ключ ИИ).
// Все имена и телефоны — вымышленные.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const APP = path.resolve(__dirname, '..', '..', '..');
const C = require('../domain');
const INBOX = require('../inbox');

let pass = 0, fail = 0;
const chk = (name, want, got) => { const a = typeof want === 'string' ? want : JSON.stringify(want), b = typeof got === 'string' ? got : JSON.stringify(got); if (a === b) { pass++; console.log(`  ✓ ${name} (${b})`); } else { fail++; console.log(`  ✗ ${name}: ожидалось ${a}, получено ${b}`); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [];
async function start(dir, port, env) {
  const data = path.join(APP, 'data-dev', dir); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
  const e = Object.assign({}, process.env, { DATA_DIR: path.join('data-dev', dir), PORT: String(port), NAME_PORT: '0' }, env); if (!env.DEV_USER) delete e.DEV_USER; delete e.DEV_SPLIT;
  const p = spawn(process.execPath, ['server.js'], { cwd: APP, env: e, stdio: ['ignore', fs.openSync(path.join(data, 'server.log'), 'w'), fs.openSync(path.join(data, 'server.err'), 'w')] }); procs.push(p);
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/api/status`); if (r.ok) return data; } catch { } await sleep(250); }
  throw new Error('сервер не поднялся: ' + dir);
}
const client = (port, headers) => async (method, p, body, extra) => {
  const r = await fetch(`http://127.0.0.1:${port}/api${p}`, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers, extra), body: body == null ? undefined : JSON.stringify(body), redirect: 'manual' });
  const buf = Buffer.from(await r.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { }
  return { status: r.status, json: json || {}, buf, headers: r.headers };
};
const role = r => client(3196, { 'X-Requested-With': 'fetch', Cookie: 'devrole=' + r });

// образцы файлов (минимальные, только сигнатуры)
const F = {
  png: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('test-image')]),
  jpg: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('JFIF test')]),
  pdf: Buffer.from('%PDF-1.4\n% тест\n%%EOF\n'),
  docx: Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from('word/document.xml')]),
  xls: Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.from('workbook')]),
  dwg: Buffer.from('AC1027\0\0\0\0\0 drawing'),
  ogg: Buffer.from('OggS\0\x02 opus voice'),
  exe: Buffer.from('MZ\x90\0 not a document'),
};
const file = (name, kind, type) => ({ name, type: type || '', data: F[kind].toString('base64') });
const T0 = Math.floor(Date.now() / 1000) - 3600;
const msg = (extId, text, o) => Object.assign({ extId, ts: T0 + Number(String(extId).replace(/\D/g, '').slice(-4) || 0), fromMe: false, text, kind: 'text' }, o);
const pack = (contact, messages) => ({ source: 'whatsapp', contact, messages });

async function main() {
  console.log('== чистая логика: телефон и ключевые слова ==');
  chk('8 → 7 для KZ', '77015550102', C.normPhone('8 (701) 555-01-02'));
  chk('+7 со знаками', '77015550102', C.normPhone('+7 701 555 01 02'));
  chk('10 цифр без кода страны', '77015550102', C.normPhone('7015550102'));
  chk('JID с номером устройства', '77015550102', C.normPhone('77015550102:12@s.whatsapp.net'));
  chk('иностранный номер не трогаем', '971501234567', C.normPhone('+971 50 123 4567'));
  chk('мусор — пусто', '', C.normPhone('доб. 123'));
  chk('телефоны из свободного поля лида', ['77015550102', '77272500000'], C.phonesIn('+7 701 555-01-02, 8(727)2500000, zakaz@example.kz'));
  chk('вид телефона', '+7 701 555 01 02', C.fmtPhone('77015550102'));
  chk('RU: проект коттеджа на участке, стоимость', ['проект', 'эскиз', 'участок', 'га', 'коттедж', 'стоимость'], C.inboxScore('Здравствуйте! Нужен эскизный проект коттеджа на участке 12 соток, сколько стоит?').words);
  chk('RU: КП на РП ЖК, м2, сроки', ['рабочий проект', 'м²', 'ЖК', 'КП', 'сроки'], C.inboxScore('Скиньте КП на РП ЖК 45000 м2, сроки?').words);
  chk('KZ: тұрғын үй жобасы, бағасы', ['проект', 'ЖК', 'стоимость'], C.inboxScore('Сәлеметсіз бе, тұрғын үй жобасы керек, бағасы қанша?').words);
  chk('обычная переписка — 0', 0, C.inboxScore(['Привет, как дела?', 'Ценю вашу работу, доктор']).score);
  chk('слово внутри другого не считается', 0, C.inboxScore('спроектировать оценку').score);
  chk('подсветка: куски текста', 'КП|ЖК', C.inboxMark('Нужно КП на ЖК').filter(x => x.hit).map(x => x.t).join('|'));
  chk('уровни: 0 / 1 / 2+', '/warm/hot', [0, 1, 3].map(C.inboxLevel).join('/'));
  chk('время: секунды, миллисекунды, ISO', '2026-10-01T06:00:00.000Z|2026-10-01T06:00:00.000Z|2026-10-01T06:00:00.000Z', [1790834400, 1790834400000, '2026-10-01T12:00:00+06:00'].map(INBOX.isoTs).join('|'));
  chk('время: мусор и далёкое будущее — пусто', '|', [INBOX.isoTs('вчера'), INBOX.isoTs(4102444800)].join('|'));

  await start('crm-inbox-test', 3196, { DEV_USER: 'owner' });
  const OWN = role('owner'), PART = role('partner'), SEC = role('secretary'), PMR = role('pm'), ACC = role('accountant'), STAFF = role('staff'), GIP = role('gip');
  const A = { extId: '77015550102@s.whatsapp.net', phone: '8 (701) 555-01-02', name: 'Тестов Арман' };
  const batch = pack(A, [msg('A-0001', 'Здравствуйте! Нужен эскизный проект гостиницы на участке 2 га, сколько стоит?'), msg('A-0002', 'Да, отправим расчёт', { fromMe: true }), msg('A-0003', 'Какие сроки и когда будет КП?')]);

  console.log('== права на приём ==');
  chk('сотрудник 403', 403, (await STAFF('POST', '/crm/inbox/ingest', batch)).status);
  chk('бухгалтер 403', 403, (await ACC('POST', '/crm/inbox/ingest', batch)).status);
  chk('ГИП 403', 403, (await GIP('POST', '/crm/inbox/ingest', batch)).status);
  chk('секретарь не принимает 403', 403, (await SEC('POST', '/crm/inbox/ingest', batch)).status);
  chk('ПМ не принимает 403', 403, (await PMR('POST', '/crm/inbox/ingest', batch)).status);
  chk('пока ничего не сохранено', 0, (await OWN('GET', '/crm/inbox')).json.items.length);
  chk('GET на приём — 405', 405, (await OWN('GET', '/crm/inbox/ingest')).status);

  console.log('== приём и дубли ==');
  let r = await OWN('POST', '/crm/inbox/ingest', batch); const DA = r.json.inboxId;
  chk('владелец: принято 3, диалог создан, статус new', '200/true/new/3/0', [r.status, r.json.created, r.json.status, r.json.added, r.json.duplicates].join('/'));
  chk('счёт «похоже на заказ» по входящим', ['проект', 'эскиз', 'участок', 'га', 'гостиница', 'стоимость', 'КП', 'сроки'], r.json.words);
  r = await OWN('POST', '/crm/inbox/ingest', batch);
  chk('повтор той же пачки — ничего не добавлено', '200/false/0/3', [r.status, r.json.created, r.json.added, r.json.duplicates].join('/'));
  r = await PART('POST', '/crm/inbox/ingest', pack(A, [msg('A-0003', 'Какие сроки и когда будет КП?'), msg('A-0004', 'Площадь около 8000 м2'), msg('A-0004', 'Площадь около 8000 м2')]));
  chk('партнёр: старое + новое + повтор внутри запроса → +1', '200/1/2', [r.status, r.json.added, r.json.duplicates].join('/'));
  let d = (await SEC('GET', '/crm/inbox/' + DA)).json;
  chk('диалог: телефон нормализован (8 → 7), имя, счётчики', '77015550102/+7 701 555 01 02/Тестов Арман/4/3', [d.phone, d.phoneText, d.name, d.count, d.unread].join('/'));
  chk('первое входящее и лента по времени', 'Здравствуйте! Нужен эскизный проект гостиницы на участке 2 га, сколько стоит?|A-0001,A-0002,A-0003,A-0004', d.firstText + '|' + d.messages.map(m => m.extId).join(','));
  chk('исходящее помечено fromMe', true, d.messages[1].fromMe);
  chk('кириллица сохранилась', 'Площадь около 8000 м2', d.messages[3].text);
  chk('уровень hot, м² добавился в слова', 'hot/true', d.level + '/' + d.words.includes('м²'));
  chk('тот же телефон с другим JID (…@lid) — тот же диалог', DA, (await OWN('POST', '/crm/inbox/ingest', pack({ extId: '123456789012345@lid', phone: '+7 701 555 01 02', name: 'Тестов Арман' }, [msg('A-0005', 'Ещё вопрос по договору')]))).json.inboxId);
  r = await OWN('POST', '/crm/inbox/ingest', pack({ extId: '77075550199:7@s.whatsapp.net', name: 'Проверкина Дана' }, [msg('B-0001', 'Добрый день')]));
  const DB = r.json.inboxId; d = (await OWN('GET', '/crm/inbox/' + DB)).json;
  chk('телефон из JID, номер устройства отброшен, счёт 0', '77075550199/77075550199@s.whatsapp.net/0/', [d.phone, d.extId, d.score, d.level].join('/'));
  r = await OWN('POST', '/crm/inbox/ingest', pack({ extId: '999000111222333@lid', name: 'Без Номера' }, [msg('L-0001', 'Сәлеметсіз бе, үй жобасы керек')]));
  const DL = r.json.inboxId; chk('JID …@lid без телефона — диалог без номера', '200/', r.status + '/' + (await OWN('GET', '/crm/inbox/' + DL)).json.phone);

  console.log('== отказы приёма ==');
  r = await OWN('POST', '/crm/inbox/ingest', pack({ extId: '120363000000000001@g.us', name: 'Группа проекта' }, [msg('G-0001', 'Нужен проект')]));
  chk('группа @g.us — 400 с понятной ошибкой', '400/true', r.status + '/' + /Групповые чаты.*pm/.test(r.json.error || ''));
  chk('рассылка status@broadcast — 400', 400, (await OWN('POST', '/crm/inbox/ingest', pack({ extId: 'status@broadcast' }, [msg('S-0001', 'x')]))).status);
  chk('группа не сохранилась', 3, (await OWN('GET', '/crm/inbox')).json.items.length);
  chk('другой источник — 400', 400, (await OWN('POST', '/crm/inbox/ingest', Object.assign({}, batch, { source: 'telegram' }))).status);
  chk('нет contact.extId — 400', 400, (await OWN('POST', '/crm/inbox/ingest', pack({ phone: '77015550102' }, [msg('X-0001', 'x')]))).status);
  chk('нет сообщений — 400', 400, (await OWN('POST', '/crm/inbox/ingest', pack(A, []))).status);
  chk('сообщение без extId — 400', 400, (await OWN('POST', '/crm/inbox/ingest', pack(A, [{ ts: T0, text: 'x' }]))).status);
  chk('сообщение без времени — 400, пачка не принята частично', '400/5', (await OWN('POST', '/crm/inbox/ingest', pack(A, [msg('A-0100', 'новое'), { extId: 'A-0101', text: 'x' }]))).status + '/' + (await OWN('GET', '/crm/inbox/' + DA)).json.count);
  chk('101 сообщение — 413', 413, (await OWN('POST', '/crm/inbox/ingest', pack(A, Array.from({ length: 101 }, (_, i) => msg('M-' + String(i).padStart(4, '0'), 'x'))))).status);
  chk('100 сообщений — принято', '200/100', await OWN('POST', '/crm/inbox/ingest', pack({ extId: '77055550100@s.whatsapp.net', name: 'Сотня Сообщений' }, Array.from({ length: 100 }, (_, i) => msg('H-' + String(i).padStart(4, '0'), 'сообщение ' + i)))).then(x => x.status + '/' + x.json.added));

  console.log('== файлы: типы, сигнатуры, лимиты ==');
  r = await OWN('POST', '/crm/inbox/ingest', pack(A, [
    msg('F-0001', 'Вот участок и ТЗ', { kind: 'image', files: [file('участок.png', 'png'), file('фото', 'jpg', 'image/jpeg')] }),
    msg('F-0002', '', { kind: 'doc', files: [file('ТЗ на проектирование.pdf', 'pdf'), file('Задание.docx', 'docx'), file('Площади.xls', 'xls'), file('Генплан.dwg', 'dwg')] }),
    msg('F-0003', '', { kind: 'audio', files: [file('', 'ogg', 'audio/ogg; codecs=opus')] }),
    msg('F-0004', 'смотрите вложение', { kind: 'doc', files: [file('setup.exe', 'exe'), file('поддельный.pdf', 'exe'), file('пустой.pdf', 'pdf', '')].map((f, i) => i === 2 ? Object.assign(f, { data: '' }) : f) }),
  ]));
  chk('принято 4 сообщения, 7 файлов, 3 отклонены', '200/4/7/3', [r.status, r.json.added, r.json.files, r.json.rejectedFiles.length].join('/'));
  chk('причины отказа по файлам', 'setup.exe: тип файла не принимается|поддельный.pdf: содержимое не совпадает с расширением|пустой.pdf: пустой файл', r.json.rejectedFiles.map(x => `${x.name}: ${x.reason}`).join('|'));
  d = (await SEC('GET', '/crm/inbox/' + DA)).json; const fm = id => d.messages.find(m => m.extId === id);
  chk('картинки: признак image, расширение из MIME', 'участок.png:true,фото.jpg:true', fm('F-0001').files.map(f => f.name + ':' + f.image).join(','));
  chk('документы: pdf, docx, xls, dwg', 'pdf,docx,xls,dwg', fm('F-0002').files.map(f => f.kind).join(','));
  chk('голосовое без имени → файл.ogg', 'файл.ogg/audio', fm('F-0003').files[0].name + '/' + fm('F-0003').kind);
  chk('сообщение с отклонёнными файлами сохранено, причины видны', 'смотрите вложение/3/true', [fm('F-0004').text, fm('F-0004').files.length, fm('F-0004').files.every(f => f.rejected && !f.key)].join('/'));
  chk('sha и путь на диске наружу не отдаются', 'undefined/undefined', fm('F-0001').files[0].sha + '/' + fm('F-0001').files[0].type);
  const K = fm('F-0001').files[0].key, KP = fm('F-0002').files[0].key, KD = fm('F-0002').files[3].key;
  chk('файл лежит в DATA_DIR/crm-files/inbox/<id диалога>/', true, fs.existsSync(path.join(APP, 'data-dev', 'crm-inbox-test', 'crm-files', 'inbox', DA, K)));
  r = await SEC('GET', `/crm/inbox/${DA}/files/${K}`);
  chk('скачать PNG: тип, содержимое, nosniff', 'image/png/true/nosniff/inline', [r.headers.get('content-type'), r.buf.equals(F.png), r.headers.get('x-content-type-options'), String(r.headers.get('content-disposition')).split(';')[0]].join('/'));
  r = await SEC('GET', `/crm/inbox/${DA}/files/${KP}`);
  chk('PDF: имя файла в UTF-8', true, String(r.headers.get('content-disposition')).includes("filename*=UTF-8''%D0%A2%D0%97"));
  chk('DWG отдаётся вложением', 'attachment', String((await SEC('GET', `/crm/inbox/${DA}/files/${KD}`)).headers.get('content-disposition')).split(';')[0]);
  chk('чужой ключ / обход каталога — 404', '404/404/404', [(await OWN('GET', `/crm/inbox/${DB}/files/${K}`)).status, (await OWN('GET', `/crm/inbox/${DA}/files/..%2F..%2F..%2Fdb.sqlite`)).status, (await OWN('GET', `/crm/inbox/${DA}/files/zzz-00000000.png`)).status].join('/'));
  chk('бухгалтеру файл не отдаётся', 403, (await ACC('GET', `/crm/inbox/${DA}/files/${K}`)).status);
  const big = Buffer.alloc(20 * 1024 * 1024 + 16); F.png.copy(big);
  r = await OWN('POST', '/crm/inbox/ingest', pack(A, [msg('F-0005', 'большой файл', { kind: 'image', files: [{ name: 'огромный.png', data: big.toString('base64') }] })]));
  chk('файл > 20 МБ отклонён, сообщение принято', '200/1/0/файл больше 20 МБ', [r.status, r.json.added, r.json.files, (r.json.rejectedFiles[0] || {}).reason].join('/'));
  chk('11 файлов в сообщении — 400', 400, (await OWN('POST', '/crm/inbox/ingest', pack(A, [msg('F-0006', 'x', { files: Array.from({ length: 11 }, (_, i) => file(i + '.png', 'png')) })]))).status);
  // лимит 25 МБ на запрос: тело такого размера ядро не пропускает (JSON ≤ 32 МБ), поэтому проверяем обработчик напрямую
  { let st = 0, m = ''; const part = 'A'.repeat(Math.ceil(13 * 1024 * 1024 * 4 / 3));
    INBOX.handle({ parts: ['crm', 'inbox', 'ingest'], method: 'POST', user: { id: 'u', role: 'owner' }, db: { crmInbox: [], crmInboxMessages: [], crmLeads: [] }, store: { id: () => 'x', save() { }, audit() { }, DATA_DIR: 'nowhere' }, qs: {}, ok: () => { st = 200; }, err: (s, t) => { st = s; m = t; },
      body: pack(A, [msg('Z-0001', 'a', { files: [{ name: 'a.png', data: part }] }), msg('Z-0002', 'b', { files: [{ name: 'b.png', data: part }] })]) }, { editor: true });
    chk('файлов больше 25 МБ в запросе — 413, ничего не записано', '413/true', st + '/' + /25 МБ/.test(m)); }

  console.log('== привязка к существующей сделке по телефону ==');
  const L1 = (await SEC('POST', '/crm/leads', { client: 'ТОО Вымышленный Девелопмент', contact: 'Образцов Тимур, 8 702 555-03-04', phone: 'timur@example.kz', object: 'ЖК Образцовый', objectType: 'ЖК', track: 'rp' })).json;
  const L2 = (await SEC('POST', '/crm/leads', { client: 'ИП Отказной', phone: '+7 (703) 555-05-06', object: 'Коттедж', status: 'Отказ', reason: 'Цена' })).json;
  const L3 = (await SEC('POST', '/crm/leads', { client: 'ТОО Подписанный Заказчик', phone: '+7 704 555 07 08', object: 'БЦ', sum: 5000000 })).json;
  await OWN('POST', `/crm/leads/${L3.id}/sign`, { contractNo: '9-26-РП', contractDate: C.today(), createProject: false });
  const leadsBefore = (await OWN('GET', '/crm/leads')).json.length; const newBefore = (await OWN('GET', '/crm/badges')).json.crminbox;
  r = await OWN('POST', '/crm/inbox/ingest', pack({ extId: '77025550304@s.whatsapp.net', name: 'Тимур' }, [msg('C-0001', 'Добрый день, когда будет договор?'), msg('C-0002', 'Жду КП')]));
  const DC = r.json.inboxId;
  chk('телефон из сделки в работе → переписка привязана, не «новое»', `200/lead/${L1.id}`, [r.status, r.json.status, r.json.leadId].join('/'));
  chk('новая сделка не создана, счётчик новых не вырос', `${leadsBefore}/${newBefore}`, (await OWN('GET', '/crm/leads')).json.length + '/' + (await OWN('GET', '/crm/badges')).json.crminbox);
  let lead = (await OWN('GET', '/crm/leads/' + L1.id)).json;
  chk('в карточке сделки — блок переписки с сообщениями', `1/${DC}/2/Жду КП`, [lead.whatsapp.length, lead.whatsapp[0].id, lead.whatsapp[0].count, lead.whatsapp[0].messages[1].text].join('/'));
  chk('в истории сделки — запись о привязке', true, lead.history.some(h => /WhatsApp: переписка.*привязана по номеру/.test(h.note)));
  chk('в списке диалог виден со сделкой', `lead/auto/${L1.no}`, await OWN('GET', '/crm/inbox?status=lead').then(x => { const i = x.json.items.find(y => y.id === DC); return [i.status, i.linkedBy, i.lead.no].join('/'); }));
  r = await OWN('POST', '/crm/inbox/ingest', pack({ extId: '77035550506@s.whatsapp.net', name: 'Отказной' }, [msg('D-0001', 'Здравствуйте, хочу заказать проект дома')]));
  const DD = r.json.inboxId; chk('телефон только в сделке с отказом → обычное новое обращение', 'new/', r.json.status + '/' + r.json.leadId);
  r = await OWN('POST', '/crm/inbox/ingest', pack({ extId: '77045550708@s.whatsapp.net', name: 'Подписанный' }, [msg('E-0001', 'Когда выдадите планы?')]));
  chk('телефон в сделке с подписанным договором → к ней же', `lead/${L3.id}`, r.json.status + '/' + r.json.leadId);

  console.log('== списки, счётчики, чтение ==');
  let list = (await SEC('GET', '/crm/inbox')).json;
  chk('секретарь видит всё; счётчики по статусам', '7/{"new":5,"lead":2,"ignored":0}', list.items.length + '/' + JSON.stringify(list.counts));
  chk('фильтр по статусу', 5, (await SEC('GET', '/crm/inbox?status=new')).json.items.length);
  chk('порядок — по последнему сообщению', true, list.items.every((x, i) => !i || list.items[i - 1].lastAt >= x.lastAt));
  chk('бейдж в меню: новых обращений', 5, (await SEC('GET', '/crm/badges')).json.crminbox);
  chk('в сводке воронки — обращения', { new: 5, lead: 2, ignored: 0 }, (await OWN('GET', '/crm/funnel')).json.inbox);
  chk('права в meta: секретарь разбирает, но не принимает', 'true/false', await SEC('GET', '/crm/meta').then(x => x.json.rights.inbox + '/' + x.json.rights.ingest));
  chk('источник WhatsApp в справочнике, первый пункт прежний', 'true/Повторный заказчик', await OWN('GET', '/crm/meta').then(x => x.json.sources.includes('WhatsApp') + '/' + x.json.sources[0]));
  chk('отметка «прочитано»', '0', String((await SEC('POST', `/crm/inbox/${DA}/read`, {})).json.unread));
  chk('бухгалтер / сотрудник / ГИП: список 403', '403/403/403', [(await ACC('GET', '/crm/inbox')).status, (await STAFF('GET', '/crm/inbox')).status, (await GIP('GET', '/crm/inbox')).status].join('/'));
  chk('ПМ: чужие обращения не видит (список пуст, диалог 404, действия 404)', '0/null/404/404', [(await PMR('GET', '/crm/inbox')).json.items.length, JSON.stringify((await PMR('GET', '/crm/inbox')).json.counts), (await PMR('GET', '/crm/inbox/' + DA)).status, (await PMR('POST', `/crm/inbox/${DA}/lead`, {})).status].join('/'));
  chk('коллекции через общий API закрыты', '404/404', (await OWN('GET', '/crmInbox')).status + '/' + (await OWN('GET', '/crmInboxMessages')).status);
  chk('нет такого диалога — 404', 404, (await OWN('GET', '/crm/inbox/нет-такого')).status);

  console.log('== «Создать сделку» ==');
  r = await SEC('POST', `/crm/inbox/${DA}/lead`, { object: 'Гостиница на участке 2 га', objectType: 'Гостиница' });
  const LA = r.json.lead;
  chk('лид: заказчик = имя, телефон, источник WhatsApp, статус Новый', 'Тестов Арман/Тестов Арман/+7 701 555 01 02/WhatsApp/Новый/Гостиница', [LA.client, LA.contact, LA.phone, LA.source, LA.status, LA.objectType].join('/'));
  chk('заметка = первые входящие сообщения', true, /^WhatsApp \+7 701 555 01 02:\n/.test(LA.note) && LA.note.includes('Нужен эскизный проект гостиницы') && LA.note.includes('Какие сроки') && !LA.note.includes('Да, отправим расчёт'));
  chk('диалог → статус lead и привязан', `lead/${LA.id}/${LA.no}`, [r.json.inbox.status, r.json.inbox.leadId, r.json.inbox.lead.no].join('/'));
  chk('повторно — 409', 409, (await SEC('POST', `/crm/inbox/${DA}/lead`, {})).status);
  chk('бейдж уменьшился', 4, (await SEC('GET', '/crm/badges')).json.crminbox);
  lead = (await OWN('GET', '/crm/leads/' + LA.id)).json;
  chk('карточка сделки: последние 5 сообщений из переписки', '5/большой файл', lead.whatsapp[0].messages.length + '/' + lead.whatsapp[0].messages[4].text);
  chk('история сделки: создан из обращения', 'создан из обращения WhatsApp', lead.history[0].note);
  r = await OWN('POST', '/crm/inbox/ingest', pack(A, [msg('A-0900', 'Спасибо, жду')]));
  chk('новые сообщения контакта идут в ту же сделку', `lead/${LA.id}/1`, [r.json.status, r.json.leadId, r.json.added].join('/'));
  chk('лид из диалога без телефона (JID …@lid): заказчик = имя', 'Без Номера//WhatsApp', await SEC('POST', `/crm/inbox/${DL}/lead`, {}).then(x => x.json.lead.client + '/' + x.json.lead.phone + '/' + x.json.lead.source));
  try { const M = require('../../mkt/domain'); const by = M.leadsBySource((await OWN('GET', '/crm/leads')).json, C.today().slice(0, 7)); chk('маркетинг (mkt.leadsBySource): источник WhatsApp в статистике', 2, (by.bySource.find(x => x.source === 'WhatsApp') || {}).n); } catch (e) { console.log('  · mkt/domain недоступен — пропущено: ' + e.message); }
  chk('воронка: лиды из обращений в статусе «Новый»', true, (await OWN('GET', '/crm/funnel')).json.byStatus.find(s => s.status === 'Новый').n >= 2);

  console.log('== «Привязать к сделке…» и «Не заказ» ==');
  chk('привязка без сделки — 400; к несуществующей — 404', '400/404', (await SEC('POST', `/crm/inbox/${DB}/link`, {})).status + '/' + (await SEC('POST', `/crm/inbox/${DB}/link`, { leadId: 'нет' })).status);
  r = await SEC('POST', `/crm/inbox/${DB}/link`, { leadId: L1.id });
  chk('привязано к выбранной сделке', `lead/${L1.id}`, r.json.status + '/' + r.json.leadId);
  chk('у сделки теперь две переписки', 2, (await OWN('GET', '/crm/leads/' + L1.id)).json.whatsapp.length);
  chk('отвязать → снова новое', 'new/', await SEC('POST', `/crm/inbox/${DB}/link`, { leadId: '' }).then(x => x.json.status + '/' + x.json.leadId));
  r = await SEC('POST', `/crm/inbox/${DD}/ignore`, { ignored: true });
  chk('«Не заказ» → ignored', 'ignored', r.json.status);
  const nb = (await SEC('GET', '/crm/badges')).json.crminbox;
  r = await OWN('POST', '/crm/inbox/ingest', pack({ extId: '77035550506@s.whatsapp.net', name: 'Отказной' }, [msg('D-0002', 'Алло, нужен проект, срочно КП!')]));
  chk('новое сообщение не воскрешает «Не заказ», но сохраняется', `ignored/1/${nb}`, [r.json.status, r.json.added, (await SEC('GET', '/crm/badges')).json.crminbox].join('/'));
  chk('в новых его нет, во вкладке «Не заказ» есть, сообщений 2', 'false/true/2', [(await SEC('GET', '/crm/inbox?status=new')).json.items.some(x => x.id === DD), (await SEC('GET', '/crm/inbox?status=ignored')).json.items.some(x => x.id === DD), (await SEC('GET', '/crm/inbox/' + DD)).json.count].join('/'));
  chk('снять «Не заказ» у обычного диалога — 400', 400, (await SEC('POST', `/crm/inbox/${DB}/ignore`, { ignored: false })).status);
  chk('вернуть вручную → new', 'new', (await SEC('POST', `/crm/inbox/${DD}/ignore`, { ignored: false })).json.status);
  chk('ПМ разбирать не может даже свою переписку: чужая — 404', 404, (await PMR('POST', `/crm/inbox/${DB}/ignore`, {})).status);

  console.log('== ПМ: переписка своих сделок (чтение) ==');
  await OWN('PUT', '/crm/leads/' + L1.id, { respId: 'dev-pm' });
  chk('ПМ видит диалог своей сделки, чужие — нет', `1/${DC}`, await PMR('GET', '/crm/inbox').then(x => x.json.items.length + '/' + x.json.items[0].id));
  chk('ПМ: лента читается, действия — 403', '200/403/403', [(await PMR('GET', '/crm/inbox/' + DC)).status, (await PMR('POST', `/crm/inbox/${DC}/ignore`, {})).status, (await PMR('POST', `/crm/inbox/${DC}/link`, { leadId: '' })).status].join('/'));
  chk('ПМ: в карточке своей сделки — переписка', 1, (await PMR('GET', '/crm/leads/' + L1.id)).json.whatsapp.length);

  console.log('== удаление сделки ==');
  chk('сделку удалили — переписка вернулась в новые', '200/new/', await OWN('DELETE', '/crm/leads/' + L1.id).then(async x => { const y = (await OWN('GET', '/crm/inbox/' + DC)).json; return [x.status, y.status, y.leadId].join('/'); }));
  chk('сообщения на месте', 2, (await OWN('GET', '/crm/inbox/' + DC)).json.messages.length);

  console.log('== ключ ИИ (обычный режим, вход паролем) ==');
  await start('crm-inbox-test2', 3194, {});
  const pw = crypto.randomBytes(12).toString('hex'); const anon = client(3194, { 'X-Requested-With': 'fetch' });
  r = await anon('POST', '/setup', { login: 'testowner', password: pw, name: 'Тестовый Владелец' });
  const cookie = String(r.headers.get('set-cookie') || '').split(';')[0]; const OW2 = client(3194, { 'X-Requested-With': 'fetch', Cookie: cookie });
  await OW2('PUT', '/settings', { enabledModules: ['crm', 'pm'] });
  const token = (await OW2('POST', '/tokens', { name: 'мост WhatsApp (тест)' })).json.token;
  const AI = client(3194, { Authorization: 'Bearer ' + token }); // без X-Requested-With — как служба-мост
  chk('без входа — 401', 401, (await anon('POST', '/crm/inbox/ingest', batch)).status);
  chk('неверный ключ — 401', 401, (await client(3194, { 'X-Requested-With': 'fetch', Authorization: 'Bearer most_' + '0'.repeat(64) })('POST', '/crm/inbox/ingest', batch)).status);
  r = await AI('POST', '/crm/inbox/ingest', batch);
  chk('ключ ИИ: приём работает', '200/true/3', [r.status, r.json.created, r.json.added].join('/'));
  chk('ключ ИИ: повтор — не дубль', '0/3', await AI('POST', '/crm/inbox/ingest', batch).then(x => x.json.added + '/' + x.json.duplicates));
  chk('ключ ИИ: группа отклонена', 400, (await AI('POST', '/crm/inbox/ingest', pack({ extId: '120363000000000002@g.us' }, [msg('G-0002', 'x')]))).status);
  chk('ключ ИИ: читает обращения', 1, (await AI('GET', '/crm/inbox?status=new')).json.items.length);
  const made = await AI('POST', `/crm/inbox/${r.json.inboxId}/lead`, {});
  chk('ключ ИИ: создаёт сделку из обращения', '200/WhatsApp', made.status + '/' + made.json.lead.source);
  chk('ключ ИИ: удалять нельзя', 403, (await AI('DELETE', '/crm/leads/' + made.json.lead.id)).status);
  await OW2('POST', '/users', { login: 'testsec', password: pw, role: 'secretary', name: 'Тестовый Секретарь' });
  const sc = String((await anon('POST', '/login', { login: 'testsec', password: pw })).headers.get('set-cookie') || '').split(';')[0];
  chk('секретарь (вход паролем): приём 403, чтение 200', '403/200', await (async () => { const S2 = client(3194, { 'X-Requested-With': 'fetch', Cookie: sc }); return (await S2('POST', '/crm/inbox/ingest', batch)).status + '/' + (await S2('GET', '/crm/inbox')).status; })());
}

main().catch(e => { fail++; console.error('ОШИБКА ТЕСТА:', e); }).finally(() => {
  for (const p of procs) { try { p.kill(); } catch { } } // только свои процессы
  console.log(`\nИтого: ${pass} ✓, ${fail} ✗`); setTimeout(() => process.exit(fail ? 1 : 0), 300);
});
