'use strict';
// Модуль tg без сервера и без Telegram: fetch подменён заглушкой Bot API, база — в памяти, часы — свои.
// Запуск из finance-app: node modules/tg/tests/tg_test.js  (последняя строка — «ok» или «fail N»)
const path = require('path');
const TGS = require('../server.js'); const TG = TGS.domain;
const PMS = require(path.join(__dirname, '../../pm/server.js'));
let pass = 0, fail = 0;
const chk = (name, want, got) => { if (String(want) === String(got)) { pass++; console.log(`  ✓ ${name} (${got})`); } else { fail++; console.log(`  ✗ ${name}: ожидалось ${want}, получено ${got}`); } };

// ---- заглушка Bot API ----
const calls = []; let nextFail = null; let msgN = 100;
const TOKEN = '123456789:' + 'A'.repeat(35); // не настоящий: формат как у @BotFather, в сеть не уходит
async function fakeFetch(url, opts) {
  const m = String(url).match(/\/bot([^/]+)\/(\w+)$/); const method = m[2]; const body = JSON.parse(opts.body || '{}'); calls.push({ token: m[1], method, body });
  if (String(url).includes('api.telegram.org')) throw new Error('тест не должен ходить в настоящий Telegram');
  const res = j => ({ status: 200, json: async () => j });
  if (nextFail && nextFail.method === method) { const f = nextFail; nextFail = null; return { status: f.code, json: async () => ({ ok: false, error_code: f.code, description: f.desc || 'err', parameters: f.retry ? { retry_after: f.retry } : undefined }) }; }
  if (method === 'getMe') return res({ ok: true, result: { id: 1, is_bot: true, username: 'most_test_bot', first_name: 'MOST' } });
  if (method === 'sendMessage') return res({ ok: true, result: { message_id: ++msgN, chat: { id: body.chat_id } } });
  return res({ ok: true, result: true });
}
const sent = () => calls.filter(c => c.method === 'sendMessage');
const lastTo = chat => sent().filter(c => c.body.chat_id === chat).pop();

// ---- база в памяти ----
const db = {
  settings: { enabledModules: ['pm', 'tg'], pm: { staffOwnProjects: true } },
  users: [
    { id: 'u-own', login: 'meir', name: 'Мейр', role: 'owner' },
    { id: 'u-par', login: 'par', name: 'Партнёр', role: 'partner' },
    { id: 'u-gip', login: 'gip', name: 'Гип Гипов', role: 'gip' },
    { id: 'u-st', login: 'st', name: 'Сотрудник Первый', role: 'staff' },
    { id: 'u-st2', login: 'st2', name: 'Сотрудник Второй', role: 'staff' },
    { id: 'u-sec', login: 'sec', name: 'Секретарь', role: 'secretary' },
  ],
  pmProjects: [{ id: 'p1', track: 'rp', name: 'ЖК Тест', status: 'В работе', gipId: 'u-gip', pmId: '' }, { id: 'p2', track: 'ep', name: 'Вилла', status: 'В работе', gipId: 'u-gip', pmId: '' }],
  pmItems: [
    { id: 'i1', pid: 'p1', stage: 1, stageName: 'Этап 1', title: 'Планировки', role: 'ГАП', section: 'АР', done: false, na: false, assigneeId: 'u-st', due: '2026-10-15' },
    { id: 'i2', pid: 'p1', stage: 1, stageName: 'Этап 1', title: 'Фасады', role: 'ГАП', section: 'АР', done: false, na: false, assigneeId: 'u-st', due: '2026-10-10' },
    { id: 'i3', pid: 'p2', stage: 1, stageName: 'Этап 1', title: 'Концепция', role: 'ГАП', section: 'АР', done: false, na: false, assigneeId: 'u-st2', due: '' },
    { id: 'i4', pid: 'p2', stage: 1, stageName: 'Этап 1', title: 'Генплан', role: 'ГАП', section: 'АР', done: false, na: false, assigneeId: 'u-st', due: '' },
  ],
  pmBlockers: [{ id: 'b1', pid: 'p1', what: 'Нет ТУ на газ', status: 'open', since: '2026-09-01' }],
  pmLog: [], projects: [], subcontracts: [], ops: [], contracts: [], categories: [],
  crmInbox: [], tgConfig: [], tgLinks: [], tgCodes: [], tgOutbox: [], tgState: [],
};
let idn = 0; const audits = [];
const store = { get: () => db, save() {}, id: () => 'id' + (++idn), audit: (...a) => audits.push(a), DATA_DIR: '' };
let clock = Date.parse('2026-10-14T05:00:00Z'); // 10:00 Алматы, среда
const at = iso => { clock = Date.parse(iso); };
TGS.setEnv({ store, fetch: fakeFetch, now: () => clock, allowed: true, apiBase: 'http://stub.local', isOn: id => (db.settings.enabledModules || []).includes(id), modules: { pm: PMS, tg: TGS }, log() {}, sleep: async () => {} });

// ---- обработчик API ----
async function call(user, method, p, body) {
  let res; const ctx = { parts: ['tg', ...p.split('/').filter(Boolean)], method, body: body || {}, qs: {}, user, ok: b => (res = { s: 200, b }), err: (s, m) => (res = { s, b: m }), send() {} };
  await TGS.handle(ctx); return res;
}
const OWN = { id: 'u-own', role: 'owner' }, PAR = { id: 'u-par', role: 'partner' }, ST = { id: 'u-st', role: 'staff' }, AI = { id: 'u-own', role: 'owner', viaToken: 't1' };
const msg = (chatId, text, type) => ({ update_id: ++idn, message: { message_id: 1, chat: { id: chatId, type: type || 'private' }, from: { id: chatId, username: 'user' + chatId, first_name: 'U' }, text } });
const cb = (chatId, data) => ({ update_id: ++idn, callback_query: { id: 'cq' + (++idn), data, from: { id: chatId }, message: { message_id: 5, chat: { id: chatId, type: 'private' } } } });

(async () => {
  console.log('домен');
  chk('время по Алматы: 04:00Z = 9:00', '2026-10-14/9/3', (t => `${t.date}/${t.hour}/${t.dow}`)(TG.almaty(Date.parse('2026-10-14T04:00:00Z'))));
  chk('тихие часы: 21, 7 — да; 8, 20 — нет', 'true/true/false/false', [21, 7, 8, 20].map(TG.isQuiet).join('/'));
  chk('маска токена', '…AAAA', TG.maskToken(TOKEN));
  chk('код — 6 цифр', true, /^\d{6}$/.test(TG.newCode()));
  chk('разбор кнопки ks', 'i1/review', (c => c.itemId + '/' + c.kstatus)(TG.parseCallback('ks:i1:r')));
  chk('мусорная кнопка — null', 'null', String(TG.parseCallback('ks:../../x:z')));

  console.log('токен и права');
  chk('без токена модуль молчит: в очередь не ставит', false, TGS.enqueue('u-own', 'morning', 'x', 'текст'));
  chk('партнёр не видит раздел бота', 403, (await call(PAR, 'GET', 'bot')).s);
  chk('ключ ИИ: чтение бота — 403', 403, (await call(AI, 'GET', 'bot')).s);
  chk('ключ ИИ: смена токена — 403', 403, (await call(AI, 'PUT', 'bot', { token: TOKEN })).s);
  chk('ключ ИИ: настройки — 403', 403, (await call(AI, 'PUT', 'admin/settings', { types: { daily: true } })).s);
  chk('кривой токен — 400', 400, (await call(OWN, 'PUT', 'bot', { token: 'abc' })).s);
  const put = await call(OWN, 'PUT', 'bot', { token: TOKEN });
  chk('владелец сохранил токен; в ответе только маска', '200/…AAAA/false', [put.s, put.b.tokenMask, JSON.stringify(put.b).includes(TOKEN)].join('/'));
  chk('токен не в журнале действий', false, JSON.stringify(audits).includes(TOKEN));
  const chkr = await call(OWN, 'POST', 'bot/check');
  chk('«Проверить» — getMe заглушки', '200/most_test_bot', chkr.s + '/' + chkr.b.botUsername);
  const adm = await call(PAR, 'GET', 'admin');
  chk('партнёр видит настройки, токена нет в ответе', '200/false', adm.s + '/' + JSON.stringify(adm.b).includes(TOKEN));
  chk('сотрудник — не в настройки', 403, (await call(ST, 'GET', 'admin')).s);
  chk('ключ ИИ: свой статус читать можно, токена там нет', '200/false', (r => r.s + '/' + JSON.stringify(r.b).includes(TOKEN))(await call(AI, 'GET', 'me')));

  console.log('привязка');
  const code = (await call(ST, 'POST', 'me/code')).b;
  chk('код выдан, ссылка на бота', true, /^\d{6}$/.test(code.code) && code.deepLink === `https://t.me/most_test_bot?start=${code.code}`);
  await TGS.processUpdate(msg(-500, `/start ${code.code}`, 'group'));
  chk('группа — игнор (ни ответа, ни привязки)', '0/0', [sent().length, db.tgLinks.length].join('/'));
  await TGS.processUpdate(msg(701, '/start 000000'));
  chk('неверный код — отказ', 'true/0', [/не подошёл/.test(lastTo(701).body.text), db.tgLinks.length].join('/'));
  await TGS.processUpdate(msg(701, `/start ${code.code}`));
  chk('верный код — chat_id привязан к пользователю', 'u-st/701', db.tgLinks.map(l => l.userId + '/' + l.chatId).join(','));
  chk('ответ бота — подключено', true, /подключён/.test(lastTo(701).body.text));
  chk('код одноразовый', 0, db.tgCodes.length);
  await TGS.processUpdate(msg(702, `/start ${code.code}`));
  chk('повтор кода с другого чата — отказ', 1, db.tgLinks.length);
  const c2 = (await call(OWN, 'POST', 'me/code')).b.code; at('2026-10-14T05:16:00Z');
  await TGS.processUpdate(msg(900, `/start ${c2}`));
  chk('код старше 15 минут — отказ', 'false', String(db.tgLinks.some(l => l.userId === 'u-own')));
  const c3 = (await call(OWN, 'POST', 'me/code')).b.code; await TGS.processUpdate(msg(900, c3));
  chk('просто 6 цифр — тоже привязка', true, db.tgLinks.some(l => l.userId === 'u-own' && l.chatId === 900));
  for (const [u, chat] of [[{ id: 'u-gip', role: 'gip' }, 800], [{ id: 'u-st2', role: 'staff' }, 702], [PAR, 901]]) { const c = (await call(u, 'POST', 'me/code')).b.code; await TGS.processUpdate(msg(chat, `/start ${c}`)); }
  chk('подключены 5 человек', 5, db.tgLinks.length);
  const me = await call(ST, 'GET', 'me'); chk('статус «мой Telegram»', 'user701', me.b.linked.username);

  console.log('события pm и очередь');
  const ob = () => db.tgOutbox; const q = () => ob().filter(m => m.status === 'queued');
  TGS.on['pm.item.done']({ user: { id: 'u-gip' } }, { item: Object.assign(db.pmItems[0], { done: true, doneAt: '2026-10-14', doneBy: 'u-gip' }), project: db.pmProjects[0] });
  chk('pm.item.done (принял ГИП) → исполнителю «Пункт принят»', 'u-st/reviewed', q().map(m => m.userId + '/' + m.type).join(','));
  TGS.on['pm.item.done']({ user: { id: 'u-gip' } }, { item: db.pmItems[0], project: db.pmProjects[0] });
  chk('повтор события — без дубля', 1, ob().length);
  Object.assign(db.pmItems[0], { done: false, doneAt: '', doneBy: '' });
  at('2026-10-14T16:30:00Z'); // 21:30 Алматы
  chk('тихие часы: ничего не отправлено', '0/1', [await TGS.flushOutbox(), q().length].join('/'));
  at('2026-10-15T03:05:00Z'); // 8:05
  chk('утром — отправлено', '1/0', [await TGS.flushOutbox(), q().length].join('/'));
  chk('сообщение ушло в чат исполнителя, со ссылкой на ERP', true, /Пункт принят/.test(lastTo(701).body.text) && lastTo(701).body.text.includes('http://192.168.50.51:3001/#/rp/p?id=p1'));
  TGS.on['pm.item.reviewed']({ user: { id: 'u-gip' } }, { item: Object.assign(db.pmItems[1], { returns: 1 }), project: db.pmProjects[0], result: 'returned', comment: 'Нет размеров' });
  chk('pm.item.reviewed (возврат) → исполнителю с замечанием', true, q().some(m => m.userId === 'u-st' && /вернули/.test(m.text) && /Нет размеров/.test(m.text)));
  TGS.on['pm.shift.requested']({ user: { id: 'u-st' } }, { item: db.pmItems[1], project: db.pmProjects[0], shift: { id: 's1', from: '2026-10-10', to: '2026-10-20', reason: 'ждём ТУ', by: 'u-st' } });
  chk('pm.shift.requested → ГИПу проекта', true, q().some(m => m.userId === 'u-gip' && /перенос/.test(m.text)));
  TGS.on['pm.shift.decided']({ user: { id: 'u-gip' } }, { item: db.pmItems[1], project: db.pmProjects[0], shift: { id: 's1', to: '2026-10-20', by: 'u-st' }, approved: true });
  chk('pm.shift.decided → автору запроса', true, q().some(m => m.userId === 'u-st' && /согласован/.test(m.text)));
  TGS.on['pm.remind']({ user: { id: 'u-gip' } }, { item: db.pmItems[2], project: db.pmProjects[1], text: 'Жду к пятнице' });
  chk('pm.remind → исполнителю пункта', true, q().some(m => m.userId === 'u-st2' && /Жду к пятнице/.test(m.text)));

  console.log('настройки человека');
  chk('выключил «Напоминания» у себя', 200, (await call({ id: 'u-st2', role: 'staff' }, 'PUT', 'me/prefs', { type: 'remind', on: false })).s);
  TGS.on['pm.remind']({ user: { id: 'u-gip' } }, { id: 'r2', item: db.pmItems[2], project: db.pmProjects[1], text: 'Второе' });
  chk('…и больше их не получает', false, q().some(m => /Второе/.test(m.text)));
  await TGS.processUpdate(msg(702, '/settings'));
  chk('/settings в боте — кнопки уведомлений', true, (lastTo(702).body.reply_markup.inline_keyboard || []).some(r => /○ Напоминания/.test(r[0].text)));
  await TGS.processUpdate(cb(702, 'pf:remind'));
  chk('кнопка в /settings включает обратно', false, db.tgLinks.find(l => l.userId === 'u-st2').off.includes('remind'));

  console.log('сверка пунктов (назначения без события)');
  TGS.scanItems(); db.pmItems[2].assigneeId = 'u-gip'; db.pmItems[2].updatedBy = 'u-own'; TGS.scanItems();
  chk('новый исполнитель → «Вам назначен пункт»', true, q().some(m => m.userId === 'u-gip' && /назначен/.test(m.text) && /Назначил: Мейр/.test(m.text)));
  const nq = ob().length; TGS.scanItems(); chk('повторная сверка — без дубля', nq, ob().length);
  db.pmItems[2].assigneeId = 'u-st2';

  console.log('расписание и отсутствие дублей');
  await TGS.flushOutbox(); calls.length = 0;
  at('2026-10-15T04:01:00Z'); await TGS.tick(); // 9:01, четверг
  chk('9:00 — сроки исполнителю (завтра и просрочено)', true, sent().some(c => c.body.chat_id === 701 && /Просрочено — 1/.test(c.body.text) && /Фасады/.test(c.body.text)));
  chk('9:00 — сводка директору, без денег', true, sent().some(c => c.body.chat_id === 900 && /Сводка/.test(c.body.text) && /Блокеры: открыто <b>1<\/b>, старше 14 дней <b>1<\/b>/.test(c.body.text) && !/₸|тенге|бюджет/i.test(c.body.text)));
  const n1 = sent().length; TGS.RUN.inboxAt = 0; // «перезапуск»: память процесса сброшена, журнал в базе остался
  await TGS.tick(); TGS.runMorning(TG.almaty(clock)); await TGS.flushOutbox();
  chk('после перезапуска и повторного прогона — без дублей', n1, sent().length);
  at('2026-10-19T04:00:30Z'); await TGS.tick(); // понедельник 9:00
  chk('понедельник — блокеры старше 14 дней ГИПу', true, sent().some(c => c.body.chat_id === 800 && /Блокеры старше 14 дней/.test(c.body.text) && /Нет ТУ на газ/.test(c.body.text)));

  console.log('лимиты Telegram');
  calls.length = 0; TGS.enqueue('u-own', 'remind', 'lim1', 'раз'); TGS.enqueue('u-own', 'remind', 'lim2', 'два'); nextFail = { method: 'sendMessage', code: 429, retry: 7 };
  const s429 = await TGS.flushOutbox();
  chk('429: ничего не потеряно, пауза retry_after', `0/2/true`, [s429, q().length, TGS.RUN.pausedUntil > Date.now() + 5000].join('/'));
  chk('во время паузы не шлём', 0, await TGS.flushOutbox()); TGS.RUN.pausedUntil = 0;
  chk('после паузы — ушли', 2, await TGS.flushOutbox());
  nextFail = { method: 'sendMessage', code: 403, desc: 'Forbidden: bot was blocked by the user' }; TGS.enqueue('u-par', 'weekly', 'blk', 'x'); await TGS.flushOutbox();
  chk('403 (бот остановлен) — отметка у человека', true, db.tgLinks.find(l => l.userId === 'u-par').blocked);
  await TGS.processUpdate(msg(901, '/help')); chk('написал боту — снова доставляем', false, db.tgLinks.find(l => l.userId === 'u-par').blocked);
  TGS.setEnv({ fetch: async () => { throw new Error('getaddrinfo ENOTFOUND'); } }); TGS.enqueue('u-own', 'remind', 'net', 'сеть');
  let crashed = false; try { await TGS.flushOutbox(); await TGS.tick(); } catch (e) { crashed = true; }
  chk('нет сети — не падаем, сообщение ждёт', 'false/true', [crashed, q().some(m => m.key.startsWith('net|'))].join('/'));
  TGS.setEnv({ fetch: fakeFetch }); await TGS.flushOutbox();

  console.log('ежедневный отчёт исполнителя');
  at('2026-10-19T13:00:30Z'); calls.length = 0; await TGS.tick(); // понедельник 18:00
  chk('по умолчанию выключен', false, sent().some(c => /Что сделали сегодня/.test(c.body.text)));
  chk('владелец включил', 200, (await call(OWN, 'PUT', 'admin/settings', { types: { daily: true } })).s);
  delete db.tgState[0].ran.daily; await TGS.tick();
  const ask = sent().find(c => c.body.chat_id === 701 && /Что сделали сегодня/.test(c.body.text));
  chk('18:00 — вопрос с кнопками по открытым пунктам', true, !!ask && ask.body.reply_markup.inline_keyboard.some(r => r.some(b => b.callback_data === 'ks:i2:r')));
  await TGS.processUpdate(cb(701, 'ks:i2:r'));
  chk('кнопка «На проверку» → kstatus через pm, история с автором', 'review/u-st', db.pmItems[1].kstatus + '/' + (db.pmItems[1].history || []).filter(h => h.field === 'kstatus').pop().by);
  await TGS.processUpdate(cb(702, 'ks:i2:x'));
  chk('чужой пункт: pm отказал (права не обойдены)', 'review/false', db.pmItems[1].kstatus + '/' + !!db.pmItems[1].done);
  chk('…и человек видит отказ', true, calls.filter(c => c.method === 'answerCallbackQuery').pop().body.text.length > 0);
  await TGS.processUpdate(cb(701, 'ks:i1:x'));
  chk('«Готово» → done через pm', 'true/u-st', db.pmItems[0].done + '/' + db.pmItems[0].doneBy);
  await TGS.processUpdate(msg(701, 'Доделал фасады, отправил ГИПу'));
  chk('текст при двух проектах — бот спрашивает проект', true, /В какой проект/.test(lastTo(701).body.text));
  await TGS.processUpdate(cb(701, 'lg:p1'));
  const rec = db.pmLog.pop();
  chk('ответ → журнал проекта: «Заметка», автор — человек', 'p1/note/u-st/Доделал фасады, отправил ГИПу', rec && [rec.pid, rec.type, rec.by, rec.text].join('/'));
  await TGS.processUpdate(cb(702, 'lg:p2'));
  chk('кнопка проекта без текста — ничего не пишет', 0, db.pmLog.length);

  console.log('обращения WhatsApp и итог недели');
  db.settings.enabledModules.push('crm'); const CRM = { on: {} }; TGS.setEnv({ modules: { pm: PMS, tg: TGS, crm: CRM } });
  TGS.pollInbox(); db.crmInbox.push({ id: 'd1', name: 'Айгерим', status: 'new', createdAt: new Date(clock + 1000).toISOString() });
  TGS.pollInbox();
  chk('новое обращение → владельцу и партнёру (у секретаря нет Telegram)', 'u-own,u-par', q().filter(m => m.type === 'inbox').map(m => m.userId).sort().join(','));
  chk('ссылка — на «Финансы»', true, q().find(m => m.type === 'inbox').text.includes('http://192.168.50.51:3000/#/crmdialog?id=d1'));
  TGS.pollInbox(); chk('повторный опрос — без дублей', 2, ob().filter(m => m.type === 'inbox').length);
  at('2026-10-23T12:00:30Z'); calls.length = 0; await TGS.tick(); // пятница 17:00
  const wk = sent().find(c => c.body.chat_id === 900 && /Итог недели/.test(c.body.text));
  chk('пятница 17:00 — итог недели директору', true, !!wk && /ЖК Тест/.test(wk.body.text));
  chk('итог недели — не исполнителю', false, sent().some(c => c.body.chat_id === 701 && /Итог недели/.test(c.body.text)));

  console.log('отвязка');
  await TGS.processUpdate(msg(702, '/stop'));
  chk('/stop — отвязан', false, db.tgLinks.some(l => l.userId === 'u-st2'));
  chk('отвязка из ERP', '200/false', [(await call(ST, 'DELETE', 'me')).s, db.tgLinks.some(l => l.userId === 'u-st')].join('/'));
  chk('руководитель отключает другого', '200/false', [(await call(PAR, 'DELETE', 'links/u-gip')).s, db.tgLinks.some(l => l.userId === 'u-gip')].join('/'));
  chk('сотрудник чужих не отключает', 403, (await call(ST, 'DELETE', 'links/u-own')).s);
  chk('после отвязки — в очередь не ставим', false, TGS.enqueue('u-st', 'remind', 'after', 'x'));
  chk('никаких запросов к api.telegram.org', true, calls.every(c => c.token === TOKEN));

  console.log(fail ? `fail ${fail}` : `ok (${pass})`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log('fail exception'); process.exit(1); });
