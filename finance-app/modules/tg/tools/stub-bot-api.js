'use strict';
// Заглушка Telegram Bot API для проверки модуля tg на своём компьютере — без настоящего Telegram.
// Запуск: node modules/tg/tools/stub-bot-api.js [порт=3199], затем сервер ERP с TG_API_BASE=http://127.0.0.1:3199.
// Принимает любой токен формата @BotFather. Служебное: GET /_sent — что «отправил» бот; POST /_inject {chatId, text} или {chatId, data} — написать боту / нажать кнопку.
const http = require('http');
const PORT = Number(process.argv[2]) || 3199;
const sent = []; const queue = []; const waiters = []; let uid = 1, mid = 1;
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const wake = () => { while (waiters.length) waiters.shift()(); };
http.createServer((req, res) => {
  let raw = ''; req.on('data', c => { raw += c; }); req.on('end', () => {
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { return json(res, 400, { ok: false, error_code: 400, description: 'bad json' }); }
    if (req.url === '/_sent') return json(res, 200, sent);
    if (req.url === '/_inject' && req.method === 'POST') {
      const chat = { id: Number(body.chatId) || 1001, type: body.type || 'private' }; const from = { id: chat.id, username: body.username || 'tester', first_name: 'Тест' };
      queue.push(body.data ? { update_id: uid++, callback_query: { id: 'cq' + uid, data: body.data, from, message: { message_id: body.messageId || 1, chat } } } : { update_id: uid++, message: { message_id: mid++, chat, from, text: String(body.text || '') } });
      wake(); return json(res, 200, { ok: true });
    }
    const m = req.url.match(/^\/bot(\d{5,15}:[\w-]{30,64})\/(\w+)$/); if (!m) return json(res, 404, { ok: false, error_code: 404, description: 'Not Found' });
    const method = m[2];
    if (method === 'getMe') return json(res, 200, { ok: true, result: { id: 1, is_bot: true, first_name: 'MOST (заглушка)', username: 'most_stub_bot' } });
    if (method === 'getUpdates') {
      const give = () => { const off = Number(body.offset) || 0; while (queue.length && queue[0].update_id < off) queue.shift(); json(res, 200, { ok: true, result: queue.slice() }); };
      if (queue.some(u => u.update_id >= (Number(body.offset) || 0))) return give();
      const t = setTimeout(() => { const i = waiters.indexOf(fn); if (i >= 0) waiters.splice(i, 1); give(); }, Math.min(25, Number(body.timeout) || 0) * 1000); const fn = () => { clearTimeout(t); give(); }; waiters.push(fn); return;
    }
    if (method === 'sendMessage') { const msg = { message_id: mid++, chat: { id: body.chat_id }, text: body.text, reply_markup: body.reply_markup || null, at: new Date().toISOString() }; sent.push(msg); console.log(`→ ${body.chat_id}: ${String(body.text).replace(/\n/g, ' | ').slice(0, 160)}`); return json(res, 200, { ok: true, result: msg }); }
    if (['answerCallbackQuery', 'editMessageReplyMarkup'].includes(method)) { sent.push({ method, body, at: new Date().toISOString() }); return json(res, 200, { ok: true, result: true }); }
    return json(res, 400, { ok: false, error_code: 400, description: 'method not in stub: ' + method });
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Заглушка Bot API: http://127.0.0.1:${PORT}`));
