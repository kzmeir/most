'use strict';
// Пакетная сборка JSON для переноса досок Miro: по манифесту прогоняет miro_import.js для каждой доски и печатает сводку.
// Манифест (не в git, лежит рядом с данными): { "boards": [ { "slug": "mayak", "miro": "uXjVHKj4TjI=", "title": "ЭП Маяк Everest", "project": "Маяк" }, … ] }
// Для доски <slug> берутся все <dir>/<slug>/*.svg (области canvas_read_as_svg), все <dir>/<slug>/*.json (ответы canvas_search — размеры
// картинок и документов) и картинки <dir>/<slug>/miro-img-<id>.*; результат — <dir>/<slug>.json для загрузчика (tools/miro_upload.html).
// Запуск из finance-app:  node modules/board/tools/miro_build.js --manifest data-dev/board/miro/boards.json [--dir data-dev/board/miro] [--only mayak,dc-art]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2); const opt = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) { const k = args[i].slice(2); opt[k] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true'; }
if (!opt.manifest) { console.error('Укажите --manifest boards.json'); process.exit(1); }
const dir = opt.dir || path.dirname(opt.manifest); const only = opt.only ? new Set(opt.only.split(',')) : null;
const manifest = JSON.parse(fs.readFileSync(opt.manifest, 'utf8')); const importer = path.join(__dirname, 'miro_import.js');
const mb = n => (n / 1048576).toFixed(n < 1048576 ? 2 : 1); const rows = [];

for (const b of manifest.boards || []) {
  if (only && !only.has(b.slug)) continue;
  const bdir = path.join(dir, b.slug); const files = fs.existsSync(bdir) ? fs.readdirSync(bdir) : [];
  const svgs = files.filter(f => f.endsWith('.svg')); const bounds = files.filter(f => f.endsWith('.json')); const imgs = files.filter(f => f.startsWith('miro-img-')).length;
  if (!svgs.length) { rows.push({ title: b.title, project: b.project || '', status: 'нет SVG — доска не прочитана' }); continue; }
  const url = `https://miro.com/app/board/${b.miro}/`; const out = path.join(dir, b.slug + '.json');
  const a = []; for (const s of svgs) a.push('--svg', path.join(bdir, s)); for (const j of bounds) a.push('--bounds', path.join(bdir, j));
  a.push('--images-dir', bdir, '--title', b.title, '--url', url, '--project-name', b.project || '', '--out', out);
  console.log(`\n=== ${b.title} (${b.slug}): ${svgs.length} SVG, ${bounds.length} JSON размеров, ${imgs} файлов картинок`);
  try {
    const log = execFileSync(process.execPath, [importer, ...a], { encoding: 'utf8', maxBuffer: 256 * 1048576 }); process.stdout.write(log);
    const first = fs.existsSync(out) ? out : out.replace(/\.json$/, '.part1.json'); // большие доски конвертер режет на <slug>.partN.json
    const s = JSON.parse(fs.readFileSync(first, 'utf8')).summary; rows.push(Object.assign({ title: b.title, project: b.project || '', status: 'ok', file: path.basename(first) }, s));
  } catch (e) { console.error(String(e.stderr || e.message)); rows.push({ title: b.title, project: b.project || '', status: 'ошибка конвертации' }); }
}

console.log('\nСводка:');
console.log('Доска | Проект | Объектов | Заглушек (картинки без файла / виджеты) | Картинок | Размер, МБ (картинки) | Файлов JSON');
for (const r of rows) console.log(r.status === 'ok' ? `${r.title} | ${r.project || '—'} | ${r.objects} | ${r.placeholders} (${r.imagePlaceholders} / ${r.widgetPlaceholders}) | ${r.images} | ${mb(r.bytes)} (${mb(r.imageBytes)}) | ${r.parts || 1}` : `${r.title} | ${r.project || '—'} | ${r.status}`);
const okRows = rows.filter(r => r.status === 'ok');
console.log(`Итого: досок ${okRows.length}, объектов ${okRows.reduce((s, r) => s + r.objects, 0)}, заглушек ${okRows.reduce((s, r) => s + r.placeholders, 0)}, картинок ${okRows.reduce((s, r) => s + r.images, 0)}, ${mb(okRows.reduce((s, r) => s + r.bytes, 0))} МБ`);
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(rows, null, 1), 'utf8');
