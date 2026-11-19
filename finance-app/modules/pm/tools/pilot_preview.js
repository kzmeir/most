'use strict';
// Прогон сканера по списку проектов и сравнение с ERP — READ-ONLY, ничего не пишет.
// Вход: JSON-массив [{id, name, folder, status, progress:{pct,stageName,stage}, health:{zone}, dueNote, next}]
//   где folder — путь к папке проекта на Z: (реальные данные компании держим вне git).
// Запуск: node modules/pm/tools/pilot_preview.js --in projects_with_folders.json [--md out.md]
const fs = require('fs');
const S = require('./status_scan');

function run(list, today) {
  return list.map(p => {
    let scan = null, err = null;
    if (p.folder && fs.existsSync(p.folder)) { try { scan = S.analyze(p.folder, p, today); } catch (e) { err = e.message; } }
    else err = p.folder ? 'папка не найдена: ' + p.folder : 'папка не задана';
    return { name: p.name, erp: { status: p.status, pct: (p.progress || {}).pct, stageName: (p.progress || {}).stageName, zone: (p.health || {}).zone }, scan, err };
  });
}
function md(rows) {
  let s = '# Пилот-превью сканера статусов РП (READ-ONLY)\n\nЧто сканер БЫ выставил по артефактам на диске против того, что сейчас в ERP. Ничего не записано.\n\n';
  s += '| Проект | ERP: статус / % / этап | Диск: этап / дней без движения / чей ход | Расхождение / аномалии |\n|---|---|---|---|\n';
  for (const r of rows) {
    const e = `${r.erp.status} · ${r.erp.pct}% · ${r.erp.stageName || '—'}`;
    if (!r.scan) { s += `| **${r.name}** | ${e} | — (${r.err}) | папка не прочитана |\n`; continue; }
    const d = `этап ${r.scan.stage} (${r.scan.stageName}) · ${r.scan.daysIdle == null ? '—' : r.scan.daysIdle} дн. · ${r.scan.whoseTurn}`;
    const a = r.scan.anomalies.length ? r.scan.anomalies.join('; ') : '—';
    s += `| **${r.name}** | ${e} | ${d} | ${a} |\n`;
  }
  s += '\n## Разделы с артефактами (по проектам)\n';
  for (const r of rows) { if (!r.scan) continue; s += `- **${r.name}**: ${r.scan.disciplines.map(x => `${x.discipline}(${x.files}, ${x.newest})`).join(', ') || '—'}${r.scan.markers.length ? ' · маркеры: ' + r.scan.markers.join(', ') : ''}\n`; }
  return s;
}

if (require.main === module) {
  const args = process.argv.slice(2); const ii = args.indexOf('--in');
  if (ii < 0) { console.error('node pilot_preview.js --in projects.json [--md out.md]'); process.exit(2); }
  const list = JSON.parse(fs.readFileSync(args[ii + 1], 'utf8').replace(/^﻿/, ''));
  const rows = run(Array.isArray(list) ? list : list.items || []);
  const out = md(rows);
  const mi = args.indexOf('--md'); if (mi >= 0 && args[mi + 1]) { fs.writeFileSync(args[mi + 1], out); console.error('записано: ' + args[mi + 1]); }
  else process.stdout.write(out);
}
module.exports = { run, md };
