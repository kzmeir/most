'use strict';
// Состав команд из листа «ФОТ» таблицы бюджетов (G:\Мой диск\Финансы\Бюджеты проектов\MOST_Проекты РП_Бюджет.xlsx, блок «СОСТАВ КОМАНД»)
// → JSON для «Команды → Импорт из ФОТ» (POST /api/hr/import). Имена в листе короткие («Таня», «Стас», «Худайберганов»), поэтому
// сотрудники из базы подбираются по совпадению слов ФИО (с опечатками до 1 буквы) и окладу. Резульат проверьте глазами: unmatched / ambiguous.
// Запуск из finance-app:  node modules/hr/tools/import_fot.js [--xlsx <путь>] [--db data-dev/hr/db.sqlite] [--out data-dev/hr/hr-import.json]
const fs = require('fs');
const path = require('path');
const X = require('../../../lib/xlsx.js');

const args = process.argv.slice(2); const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const XLSX = arg('--xlsx', 'G:/Мой диск/Финансы/Бюджеты проектов/MOST_Проекты РП_Бюджет.xlsx');
const DB = arg('--db', 'data-dev/hr/db.sqlite');
const OUT = arg('--out', 'data-dev/hr/hr-import.json');
// команда в листе → команда и раздел модуля
const TEAMS = { 'АР': ['АР', 'АР'], 'ГИП': ['ГИП', 'ГИП'], 'ОВ': ['ОВ', 'ОВ'], 'ВК': ['ВК', 'ВК'], 'ГП': ['ГП', 'ГП'], 'АДМ': ['Офис (АДМ)', 'Офис'], 'КЖ': ['КЖ', 'КЖ'] };
const NICK = { 'таня': 'татьяна', 'стас': 'станислав', 'мейр': 'мейір', 'дима': 'дмитрий', 'саша': 'александр' };

const lower = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
const tokens = s => lower(s).split(/[\s\-–,()/]+/).filter(t => t.length >= 2).map(t => NICK[t] || t);
function lev(a, b) { const m = a.length, n = b.length; if (Math.abs(m - n) > 1) return 9; const d = Array.from({ length: m + 1 }, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
function tokenScore(a, b) { if (a === b) return 2; if (a.length >= 4 && (b.startsWith(a) || a.startsWith(b))) return 0.75; if (a.length >= 5 && b.length >= 5 && lev(a, b) <= 1) return 1.5; return 0; }
function score(sheetName, emp) { const et = tokens(emp.name); let s = 0; for (const t of tokens(sheetName)) s += Math.max(0, ...et.map(e => tokenScore(t, e))); return s; }

function readEmployees(file) {
  const { DatabaseSync } = require('node:sqlite'); const sql = new DatabaseSync(file, { readOnly: true });
  return sql.prepare("SELECT data FROM docs WHERE col = 'employees' ORDER BY ord").all().map(r => JSON.parse(r.data));
}

(async () => {
  if (!fs.existsSync(XLSX)) { console.error('Нет файла ' + XLSX); process.exit(1); }
  if (!fs.existsSync(DB)) { console.error('Нет базы ' + DB + ' (скопируйте бэкап в data-dev/hr/db.sqlite)'); process.exit(1); }
  const emps = readEmployees(DB); const book = await X.parse(fs.readFileSync(XLSX));
  const sheet = book.sheets.find(s => /ФОТ/i.test(s.name)); if (!sheet) { console.error('Нет листа «ФОТ»'); process.exit(1); }
  const rows = sheet.rows; const hdr = rows.findIndex(r => r.some(c => /^имя$/i.test(String(c || '').trim())) && r.some(c => /команда/i.test(String(c || ''))));
  if (hdr < 0) { console.error('Не найден блок «СОСТАВ КОМАНД» (строка с колонками Имя / Должность / Оклад / Команда)'); process.exit(1); }
  const h = rows[hdr].map(c => lower(c)); const col = re => h.findIndex(c => re.test(c)); const cName = col(/^имя/), cPos = col(/должност/), cSal = col(/оклад/), cTeam = col(/команда/);
  const teams = {}; const unmatched = [], ambiguous = [], resigned = [], used = new Map();
  for (let i = hdr + 1; i < rows.length; i++) {
    const r = rows[i]; const name = String(r[cName] || '').trim(); if (!name) { if (rows.slice(i, i + 3).every(x => !String(x[cName] || '').trim())) break; continue; }
    const position = String(r[cPos] || '').trim(), salary = Number(r[cSal]) || 0, teamCell = String(r[cTeam] || '').trim();
    const ranked = emps.map(e => ({ e, s: score(name, e) + (salary && Number(e.salary) === salary ? 0.5 : 0) + (e.status !== 'resigned' ? 0.25 : 0) })).filter(x => x.s >= 1.25).sort((a, b) => b.s - a.s);
    const rec = { sheetName: name, position, salarySheet: salary, team: teamCell };
    if (!ranked.length) { unmatched.push(rec); continue; }
    if (ranked[1] && ranked[1].s === ranked[0].s) { ambiguous.push(Object.assign(rec, { candidates: ranked.slice(0, 3).map(x => `${x.e.id} ${x.e.name}`) })); continue; }
    const e = ranked[0].e; Object.assign(rec, { employeeId: e.id, name: e.name, salaryDb: Number(e.salary) || 0, status: e.status || 'active' });
    if (used.has(e.id)) { ambiguous.push(Object.assign(rec, { note: `уже сопоставлен с «${used.get(e.id)}»` })); continue; } used.set(e.id, name);
    if (e.status === 'resigned') { resigned.push(rec); continue; }
    for (const part of teamCell.split('/').map(x => x.trim()).filter(Boolean)) {
      const [tn, sec] = TEAMS[part] || [part, '']; const t = teams[tn] || (teams[tn] = { name: tn, section: sec, members: [] });
      t.members.push({ employeeId: e.id, name: e.name, position, sheetName: name, salarySheet: salary, salaryDb: Number(e.salary) || 0 });
    }
  }
  const out = { source: path.basename(XLSX) + ' → лист «ФОТ», блок «СОСТАВ КОМАНД»', generated: new Date().toISOString().slice(0, 19), mode: 'merge', teams: Object.values(teams), unmatched, ambiguous, resigned, notInSheet: emps.filter(e => e.status !== 'resigned' && !used.has(e.id)).map(e => ({ employeeId: e.id, name: e.name, salaryDb: Number(e.salary) || 0 })) };
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');
  console.log(`Команд: ${out.teams.length} (${out.teams.map(t => `${t.name} ${t.members.length}`).join(', ')}). Не найдены в базе: ${unmatched.length}; неоднозначно: ${ambiguous.length}; уволены: ${resigned.length}; в базе, но не в листе: ${out.notInSheet.length}.`);
  for (const t of out.teams) for (const m of t.members) if (m.salarySheet && m.salaryDb && m.salarySheet !== m.salaryDb) console.log(`  оклад отличается: ${m.sheetName} → ${m.name}: лист ${m.salarySheet}, база ${m.salaryDb}`);
  for (const u of unmatched) console.log('  не найден: ' + u.sheetName + ' (' + u.team + ')'); for (const u of ambiguous) console.log('  неоднозначно: ' + u.sheetName + ' → ' + (u.candidates || [u.note]).join(' | '));
  console.log('Файл: ' + OUT + ' — загрузите его в «Команды → Импорт из ФОТ».');
})().catch(e => { console.error(e.message); process.exit(1); });
