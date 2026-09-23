#!/usr/bin/env node
'use strict';
/* Запускает сервер MOST Финансы и туннель Cloudflare, перезапускает их при падении,
   вытаскивает публичный адрес из вывода cloudflared и пишет его в data/tunnel-url.txt
   (его показывает раздел «Настройки» и экран входа). Запуск: node tools/serve-internet.js
   Постоянный адрес: положите имя именованного туннеля в файл tunnel.txt рядом с server.js. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..');
const DATA = process.env.DATA_DIR || path.join(APP, 'data');
const PORT = process.env.PORT || '3000';
fs.mkdirSync(DATA, { recursive: true });
const URL_FILE = path.join(DATA, 'tunnel-url.txt');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function keepAlive(name, cmd, args, opts, onLine) {
  let delay = 2000;
  const start = () => {
    log(`${name}: запуск`);
    let child;
    try { child = spawn(cmd, args, Object.assign({ stdio: ['ignore', 'pipe', 'pipe'] }, opts)); }
    catch (e) { log(`${name}: не удалось запустить (${e.message}). Повтор через ${delay / 1000} с`); return setTimeout(start, delay); }
    const handle = buf => { for (const line of String(buf).split(/\r?\n/)) { if (!line.trim()) continue; console.log(`[${name}] ${line}`); if (onLine) onLine(line); } };
    child.stdout.on('data', handle); child.stderr.on('data', handle);
    child.on('error', e => log(`${name}: ошибка ${e.message}`));
    child.on('exit', code => { log(`${name}: завершился (код ${code}). Перезапуск через ${delay / 1000} с`); setTimeout(start, delay); delay = Math.min(delay * 2, 60000); });
    setTimeout(() => { delay = 2000; }, 60000);
  };
  start();
}

// 1) сервер
keepAlive('server', process.execPath, [path.join(APP, 'server.js')], { env: Object.assign({}, process.env, { TRUST_PROXY: '1', PORT, DATA_DIR: DATA }) });

// 2) туннель
const tunnelName = fs.existsSync(path.join(APP, 'tunnel.txt')) ? fs.readFileSync(path.join(APP, 'tunnel.txt'), 'utf8').trim() : '';
const exe = process.platform === 'win32' && fs.existsSync(path.join(APP, 'cloudflared.exe')) ? path.join(APP, 'cloudflared.exe') : 'cloudflared';
const args = tunnelName ? ['tunnel', 'run', tunnelName] : ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'];
setTimeout(() => keepAlive('tunnel', exe, args, {}, line => {
  const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m) { fs.writeFileSync(URL_FILE, m[0] + '\n'); log(`ПУБЛИЧНЫЙ АДРЕС: ${m[0]} — отправьте сотрудникам вместе с логином и паролем`); }
  if (/not found|ENOENT|не является внутренней/i.test(line)) log('cloudflared не установлен: winget install Cloudflare.cloudflared (Windows) или brew install cloudflared (macOS)');
}), 1500);
if (tunnelName) { log(`Именованный туннель «${tunnelName}»: адрес задан в Cloudflare (см. README)`); try { fs.writeFileSync(URL_FILE, ''); } catch { } }
process.on('SIGINT', () => process.exit(0));
