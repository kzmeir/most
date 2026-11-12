'use strict';
// Приём переписки по «ключу ИИ» на настоящем сервере (без DEV_USER): мост шлёт Authorization: Bearer most_… без cookie и без X-Requested-With.
// Сервер поднимается на портах 3198 (Финансы) / 3197 (ERP) с пустой базой data-dev/pm-test-token (в .gitignore); владелец и пароль — случайные, только для этого прогона.
// Запуск из finance-app: node modules/pm/tests/chat_token_test.js  (последняя строка — «ok» или «fail N»; вызывается и из api_test.sh)
const fs = require('fs'); const path = require('path'); const crypto = require('crypto'); const { spawn } = require('child_process');
const APP = path.join(__dirname, '..', '..', '..'); const DATA = path.join(APP, 'data-dev', 'pm-test-token');
const FIN = 'http://127.0.0.1:3198/api', ERP = 'http://127.0.0.1:3197/api';
let pass = 0, fail = 0;
const chk = (name, want, got) => { if (String(want) === String(got)) { pass++; console.log(`  ✓ ${name} (${got})`); } else { fail++; console.log(`  ✗ ${name}: ожидалось ${want}, получено ${got}`); } };
const req = async (url, method, headers, body) => { const r = await fetch(url, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch { /* не JSON */ } return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] }; };

(async () => {
  fs.rmSync(DATA, { recursive: true, force: true }); fs.mkdirSync(DATA, { recursive: true });
  const env = Object.assign({}, process.env, { DATA_DIR: DATA, PORT: '3198', ERP_PORT: '3197', NAME_PORT: '0' }); delete env.DEV_USER; delete env.DEV_SPLIT; delete env.TRUST_PROXY;
  const srv = spawn(process.execPath, ['server.js'], { cwd: APP, env, stdio: 'ignore' });
  try {
    let up = false; for (let i = 0; i < 40 && !up; i++) { await new Promise(r => setTimeout(r, 250)); try { up = (await fetch(FIN + '/status')).ok; } catch { /* ещё не поднялся */ } }
    if (!up) throw new Error('сервер не поднялся на 3198');
    const X = { 'X-Requested-With': 'fetch' }; const password = crypto.randomBytes(12).toString('hex');
    const su = await req(FIN + '/setup', 'POST', X, { login: 'owner', password, name: 'Тестовый владелец' }); const C = Object.assign({ Cookie: su.cookie }, X);
    await req(FIN + '/settings', 'PUT', C, { enabledModules: ['pm'] });
    const tk = await req(FIN + '/tokens', 'POST', C, { name: 'Мост WhatsApp (тест)' }); const A = { Authorization: 'Bearer ' + ((tk.j && tk.j.token) || '') };
    chk('ключ ИИ выдан владельцу', '200/true', [tk.s, /^most_[a-f0-9]{64}$/.test((tk.j && tk.j.token) || '')].join('/'));
    const batch = { source: 'whatsapp', chat: { extId: '120363000000000009@g.us', name: 'Тестовая группа' }, messages: [{ extId: 'K1', ts: new Date().toISOString(), author: 'Тест Тестов', phone: '+7 700 000 00 09', text: 'Сообщение по ключу ИИ' }] };
    chk('приём без ключа и без cookie и с неверным ключом — отказ (403: ядро не видит ни ключа, ни заголовка fetch)', '403/403', [(await req(ERP + '/pm/chats/ingest', 'POST', {}, batch)).s, (await req(ERP + '/pm/chats/ingest', 'POST', { Authorization: 'Bearer most_' + '0'.repeat(64) }, batch)).s].join('/'));
    const r1 = await req(ERP + '/pm/chats/ingest', 'POST', A, batch);
    chk('приём по ключу ИИ (без cookie и X-Requested-With): 200, принято 1, группа создана непривязанной', '200/1/true/', [r1.s, r1.j && r1.j.accepted, r1.j && r1.j.chat.created, r1.j && r1.j.chat.pid].join('/'));
    chk('повтор по ключу — дубль', '0/1', (r => [r.j.accepted, r.j.duplicates].join('/'))(await req(ERP + '/pm/chats/ingest', 'POST', A, batch)));
    chk('состояние моста по ключу — 200; список групп по ключу — 200, мост «подключён»', '200/200/connected/Мост WhatsApp (тест)', await (async () => { const a = await req(ERP + '/pm/chats/ingest-status', 'POST', A, { state: 'connected', info: 'тест' }); const b = await req(ERP + '/pm/chats', 'GET', A); return [a.s, b.s, b.j.bridge.state, b.j.bridge.by].join('/'); })());
    const chatId = r1.j.chat.id;
    chk('ключу ИИ запрещено: настройки модуля (PUT) и удаление — 403; привязка группы (PUT) разрешена, но проекта нет — 400', '403/403/400', [(await req(ERP + '/pm/settings', 'PUT', A, { chatForMembers: true })).s, (await req(ERP + '/pm/chats/' + chatId, 'DELETE', A)).s, (await req(ERP + '/pm/chats/' + chatId, 'PUT', A, { pid: 'нет' })).s].join('/'));
    chk('коллекции переписки через общий API закрыты', '404/404', [(await req(FIN + '/pmChats', 'GET', C)).s, (await req(FIN + '/pmChatMessages', 'GET', C)).s].join('/'));
    chk('без X-Requested-With по cookie — 403 (CSRF), по ключу — не требуется', 403, (await req(ERP + '/pm/chats/ingest', 'POST', { Cookie: su.cookie }, batch)).s);
  } catch (e) { fail++; console.log('  ✗ ' + e.message); }
  finally { srv.kill(); await new Promise(r => setTimeout(r, 400)); try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* база ещё занята */ } }
  console.log(`  итого: ${pass} ✓, ${fail} ✗`); console.log(fail ? `fail ${fail}` : 'ok'); process.exitCode = fail ? 1 : 0;
})();
