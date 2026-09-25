'use strict';
// Массовое скачивание картинок досок Miro через REST API v2 (только чтение) — для конвертера miro_import.js (--images-dir).
// Коннектор Miro отдаёт ссылку на картинку по одной за вызов (image_get_url), на 21 доске их ~5900 — поэтому пакетно: нужен
// личный токен доступа Miro (Miro → Settings → Your apps → Create new app → Install app and get OAuth token; права boards:read).
// Токен положите в файл (не в git!) и запустите из finance-app:
//   node modules/board/tools/miro_images.js --token-file data-dev/board/miro-token.txt --board uXjVHKj4TjI= --dir data-dev/board/miro/mayak [--max 5000]
// Файлы сохраняются как miro-img-<itemId>.<png|jpg|webp|gif> (расширение по сигнатуре файла); уже скачанные пропускаются.
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2); const opt = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) { const k = args[i].slice(2); opt[k] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true'; }
const token = opt.token || (opt['token-file'] && fs.readFileSync(opt['token-file'], 'utf8').trim()); const board = opt.board; const dir = opt.dir || '.';
if (!token || !board) { console.error('Нужны --token-file <файл с токеном> (или --token) и --board <id доски, например uXjVHKj4TjI=>'); process.exit(1); }
const API = 'https://api.miro.com/v2'; const H = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
const extOf = b => b[0] === 0x89 && b[1] === 0x50 ? 'png' : b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : b.subarray(0, 4).toString() === 'RIFF' ? 'webp' : b.subarray(0, 3).toString() === 'GIF' ? 'gif' : '';

(async () => {
  fs.mkdirSync(dir, { recursive: true }); const have = new Set(fs.readdirSync(dir).filter(n => n.startsWith('miro-img-')).map(n => n.split('.')[0].slice(9)));
  let cursor = ''; let n = 0, done = 0, skipped = 0, failed = 0; const max = Number(opt.max) || 100000;
  while (n < max) {
    const url = `${API}/boards/${encodeURIComponent(board)}/items?type=image&limit=50${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`;
    const r = await fetch(url, { headers: H }); if (!r.ok) { console.error(`Miro API ${r.status}: ${(await r.text()).slice(0, 300)}`); process.exit(1); }
    const d = await r.json();
    for (const it of d.data || []) {
      n++; const id = String(it.id); if (have.has(id)) { skipped++; continue; }
      const src = it.data && it.data.imageUrl; if (!src) { failed++; continue; }
      try {
        // imageUrl требует токен; format=original — полный размер
        const rr = await fetch(src + (src.includes('?') ? '&' : '?') + 'format=original', { headers: { Authorization: 'Bearer ' + token }, redirect: 'follow' }); if (!rr.ok) throw new Error('HTTP ' + rr.status);
        const buf = Buffer.from(await rr.arrayBuffer()); const ext = extOf(buf); if (!ext) throw new Error('не картинка');
        fs.writeFileSync(path.join(dir, `miro-img-${id}.${ext}`), buf); done++; if (done % 20 === 0) console.log(`скачано ${done}…`);
      } catch (e) { failed++; console.error(`  ${id}: ${e.message}`); }
    }
    cursor = d.cursor || ''; if (!cursor) break;
  }
  console.log(`Готово: картинок в Miro ${n}, скачано ${done}, уже было ${skipped}, не удалось ${failed}. Папка: ${dir}`);
})().catch(e => { console.error(e.message); process.exit(1); });
