'use strict';
// Сканер реальных статусов РП по папке проекта (Z:\№-год-название\<разделы>) + данным ERP.
// READ-ONLY: ничего не пишет в ERP. Сопоставляет артефакты на диске с 81-пунктным роадмапом РП
// (modules/pm/domain.js, TEMPLATES.rp) и выдаёт: какие разделы начаты, реальный этап (консервативно),
// «дней без движения», «чей ход», аномалии (ERP говорит одно — на диске другое).
//
// Запуск:  node modules/pm/tools/status_scan.js "Z:\109-2025-...\" [--erp pm_project.json] [--json]
// Чистые функции экспортируются для теста (tests/status_scan_test.js).
const fs = require('fs');
const path = require('path');

// раздел проекта (дисциплина) по имени папки — по ТОКЕНУ, а не по числовому префиксу:
// на диске нумерация плавает (01-AR, 02-GP, 03-KJ… vs стандарт 02-AR, 04-KJ…), поэтому смотрим на букву раздела.
const DISCIPLINES = [
  ['ИРД', /(^|[^a-zа-я])(ирд|irp|ird)([^a-zа-я]|$)/i],
  ['Задания', /задан|заданиj|task/i],
  ['АР', /(^|[\s_\-\d])(ar|ар)([\s_\-]|$)/i],
  ['ГП', /(^|[\s_\-\d])(gp|гп)([\s_\-]|$)/i],
  ['КЖ', /(^|[\s_\-\d])(kj|kzh|кж)([\s_\-]|$)/i],
  ['ОВ', /(^|[\s_\-\d])(ov|ов|овик)([\s_\-]|$)/i],
  ['ВК', /(^|[\s_\-\d])(vk|вк)([\s_\-]|$)/i],
  ['ЭЛ', /(^|[\s_\-\d])(el|эл|эом|eom)([\s_\-]|$)/i],
  ['СС', /(^|[\s_\-\d])(ss|сс|апс|aps|apt|слаботоч)([\s_\-]|$)/i],
  ['ПОС', /(^|[\s_\-\d])(pos|пос)([\s_\-]|$)/i],
  ['ОВОС', /(ovos|овос)/i],
  ['Смета', /(smeta|смет)/i],
  ['ТХ', /(^|[\s_\-\d])(th|тх|технолог)([\s_\-]|$)/i],
  ['ГСВ', /(^|[\s_\-\d])(gsv|гсв)([\s_\-]|$)/i],
];
// маркеры поздних этапов — только по ПАПКАМ ВЕРХНЕГО УРОВНЯ (раздел проекта), не по внутренним
// («Замечания» внутри АР — это нормоконтроль, а не стадия экспертизы, поэтому его НЕ берём).
const STAGE_MARKERS = [
  ['экспертиза', /^\d*[\s_\-]*(эксперт|экспертиз|на\s*эксперт|госэксперт|expertise)/i],
  ['на стройку', /^\d*[\s_\-]*(на\s*строй|в\s*производ|на\s*площад|issued|for\s*construction|выдача\s*на)/i],
];
// расширения-результаты (деливеры) и мусор, который не считаем «движением»
const MEANINGFUL = new Set(['.dwg', '.dxf', '.pdf', '.rvt', '.rfa', '.ifc', '.docx', '.doc', '.xlsx', '.xls', '.rtf', '.pln', '.skp', '.jpg', '.jpeg', '.png', '.zip', '.rar']);
const JUNK = new Set(['.err', '.dat', '.slog', '.log', '.tmp', '.lock', '.bak', '.ini', '.db', '.py', '.pyc', '.001', '.sv$', '.bak1']);
const isJunk = name => name.startsWith('~$') || name.startsWith('.') || JUNK.has(path.extname(name).toLowerCase()) || /^acad|^atemp|editingperms|thumbs\.db/i.test(name);

function disciplineOf(folderName) {
  const n = String(folderName || '');
  for (const [disc, re] of DISCIPLINES) if (re.test(n)) return disc;
  return null;
}

// обойти дерево один раз: собрать по каждой дисциплине кол-во и самую свежую дату значимого файла,
// плюс встреченные маркеры этапов. Ограничение глубины и числа файлов — чтобы не зависнуть на сетевой папке.
function scanTree(root, opts) {
  opts = opts || {}; const maxDepth = opts.maxDepth || 6; const maxFiles = opts.maxFiles || 200000;
  const byDisc = {}; const markers = {}; let filesSeen = 0; let newestAny = 0, newestMeaning = 0;
  const topDisc = {}; // имя папки верхнего уровня → дисциплина (фиксируем на входе в неё)
  function walk(dir, depth, curDisc) {
    if (depth > maxDepth || filesSeen > maxFiles) return;
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth <= 1) for (const [m, re] of STAGE_MARKERS) if (re.test(e.name)) markers[m] = true; // только разделы верхнего уровня
        const d = depth === 0 ? disciplineOf(e.name) : (curDisc || disciplineOf(e.name));
        walk(full, depth + 1, d);
      } else if (e.isFile()) {
        filesSeen++;
        let st; try { st = fs.statSync(full); } catch (e2) { continue; }
        const t = st.mtimeMs; const junk = isJunk(e.name); const meaning = !junk && MEANINGFUL.has(path.extname(e.name).toLowerCase());
        if (t > newestAny) newestAny = t; if (meaning && t > newestMeaning) newestMeaning = t;
        if (curDisc) {
          const b = byDisc[curDisc] || (byDisc[curDisc] = { files: 0, meaningful: 0, newest: 0, newestName: '' });
          b.files++; if (meaning) { b.meaningful++; if (t > b.newest) { b.newest = t; b.newestName = e.name; } }
        }
      }
    }
  }
  walk(root, 0, null);
  return { byDisc, markers, filesSeen, newestAny, newestMeaning };
}

// этапы РП (из domain.js TEMPLATES.rp): какие дисциплины впервые дают артефакты на каждом этапе.
// Консервативно: этап «достигнут», если есть значимые файлы по его опорным дисциплинам.
const STAGE_RULES = [
  { stage: 1, name: 'ИРД', need: ['ИРД'], anyOf: ['ИРД', 'Задания'] },
  { stage: 3, name: 'Этап 1. Схема КЖ', need: ['КЖ', 'АР'], anyOf: ['ГП'] },
  { stage: 4, name: 'Этап 2. Финальные планы', need: ['ОВ', 'ВК'], anyOf: ['ЭЛ', 'СС'] },
  { stage: 5, name: 'Этап 3. Проект', need: ['ЭЛ', 'СС'], anyOf: [] },
  { stage: 7, name: 'Этап 5. Комплектация (экспертиза)', need: ['Смета'], anyOf: [] },
];
const has = (byDisc, d) => !!(byDisc[d] && byDisc[d].meaningful > 0);

function inferStage(scan) {
  const { byDisc, markers } = scan; let best = { stage: 0, name: '—', basis: 'артефактов не найдено' };
  for (const r of STAGE_RULES) {
    if (r.need.every(d => has(byDisc, d))) best = { stage: r.stage, name: r.name, basis: 'есть файлы: ' + r.need.join(', ') + (r.anyOf.filter(d => has(byDisc, d)).length ? ' (+' + r.anyOf.filter(d => has(byDisc, d)).join(', ') + ')' : '') };
  }
  // маркер экспертизы доверяем только если есть смета (экспертиза идёт после комплектации) и этап уже не ниже 4
  if (markers['экспертиза'] && (has(byDisc, 'Смета') || best.stage >= 4)) best = { stage: 8, name: 'Этап 6. Экспертиза', basis: 'раздел верхнего уровня «экспертиза»' + (has(byDisc, 'Смета') ? ' + смета' : '') };
  if (markers['на стройку']) best = { stage: 9, name: 'Этап 7. На стройку / Выдача', basis: 'раздел верхнего уровня «на стройку/выдача»' };
  return best;
}

const DAY = 864e5;
const fmt = t => t ? new Date(t).toISOString().slice(0, 10) : '—';

// «чей ход»: если самые свежие артефакты — поздних этапов (экспертиза/на стройку/письма ИРД),
// ход за заказчиком/госорганом; иначе работа у нас (наш ход).
function whoseTurn(scan, stage) {
  if (stage >= 8) return 'заказчик/госорган (экспертиза, письма, финансирование)';
  if (stage <= 1) return scan.byDisc['ИРД'] ? 'заказчик (ИРД: ТУ, геология, топосъёмка)' : 'наш (запуск)';
  return 'наш (проектирование)';
}

function analyze(folder, erp, today) {
  const scan = scanTree(folder);
  return Object.assign({ folder }, analyzeScan(scan, erp, today));
}
// пост-обработка готового скана — без файловой системы, чтобы покрывать тестами
function analyzeScan(scan, erp, today) {
  today = today || Date.now();
  const st = inferStage(scan);
  const newest = scan.newestMeaning || scan.newestAny;
  const daysIdle = newest ? Math.round((today - newest) / DAY) : null;
  const turn = whoseTurn(scan, st.stage);
  const disciplines = Object.entries(scan.byDisc).filter(([, v]) => v.meaningful > 0).map(([d, v]) => ({ discipline: d, files: v.meaningful, newest: fmt(v.newest) }))
    .sort((a, b) => b.newest.localeCompare(a.newest));
  const anomalies = [];
  const erpPct = erp && erp.progress ? Number(erp.progress.pct) || 0 : null;
  const erpStageName = erp && erp.progress ? (erp.progress.stageName || '') : '';
  const erpStageNum = Number(String(erpStageName).match(/^(\d+)/) ? String(erpStageName).match(/^(\d+)/)[1] : (erp && erp.progress ? erp.progress.stage : 0)) || 0;
  const returnDate = erp && erp.next && erp.next.due ? erp.next.due : ''; // явная дата возврата/следующего шага
  if (erp) {
    if (erpPct === 0 && st.stage >= 3) anomalies.push(`в ERP 0 %, а на диске артефакты этапа ${st.stage} (${st.name}) — статус занижен`);
    if (st.stage >= 8 && erpStageNum > 0 && erpStageNum < 7) anomalies.push(`на диске признаки экспертизы/выдачи, а в ERP ранний этап «${erpStageName}»`);
    // обратное расхождение: ERP почти готов/экспертиза, а на диске СВЕЖАЯ работа более раннего этапа
    if (erpPct >= 90 && erpStageNum >= 7 && st.stage > 0 && st.stage < 7 && daysIdle != null && daysIdle <= 21)
      anomalies.push(`ERP ${erpPct}% (${erpStageName}), но на диске свежая работа этапа ${st.stage} (${daysIdle} дн. назад) — проверьте статус/фазу (возможно, другая очередь)`);
    if (daysIdle != null && daysIdle > 45 && erp.status === 'В работе') anomalies.push(`статус «В работе», но на диске ${daysIdle} дн. без новых файлов — реально ли движемся?`);
    // правило движения: пауза только с явной причиной И датой возврата. Структурной «даты возврата» в pm пока нет,
    // поэтому любая пауза без неё — авто-красный; это и есть сигнал ГИПу завести причину и дату.
    if (erp.status === 'На паузе') anomalies.push(`пауза без явной даты возврата${daysIdle != null ? ` (${daysIdle} дн. тишины)` : ''} → по правилу движения авто-красный: нужна причина и дата возврата`);
    // молчание заказчика ≠ пауза: это задача ГИПу додолбить, с датой
    if (erp.status === 'Ждём заказчика' && !returnDate && daysIdle != null && daysIdle > 30) anomalies.push(`«Ждём заказчика» ${daysIdle} дн. без даты — это задача ГИПу додолбить заказчика (поставьте дату), а не пассивная пауза`);
    if (erpPct >= 90 && erp.status && erp.status.indexOf('Готово') < 0 && daysIdle != null && daysIdle > 30) anomalies.push(`${erpPct} % и ${daysIdle} дн. без движения → авто-эскалация`);
  }
  return {
    stage: st.stage, stageName: st.name, stageBasis: st.basis,
    pctEvidence: Math.round(st.stage / 9 * 100), daysIdle, lastMovement: fmt(newest), whoseTurn: turn,
    disciplines, markers: Object.keys(scan.markers), filesSeen: scan.filesSeen,
    erp: erp ? { status: erp.status, pct: erpPct, stageName: erpStageName, zone: erp.health && erp.health.zone } : null,
    anomalies,
  };
}

module.exports = { disciplineOf, scanTree, inferStage, analyze, analyzeScan, whoseTurn, DISCIPLINES, STAGE_RULES };

// --- CLI ---
if (require.main === module) {
  const args = process.argv.slice(2); const folder = args.find(a => !a.startsWith('--'));
  if (!folder) { console.error('Укажите папку проекта: node status_scan.js "Z:\\\\109-2025-...\\"  [--erp file.json] [--json]'); process.exit(2); }
  let erp = null; const ei = args.indexOf('--erp'); if (ei >= 0 && args[ei + 1]) { try { erp = JSON.parse(fs.readFileSync(args[ei + 1], 'utf8').replace(/^\uFEFF/, '')); } catch (e) { console.error('не прочитал --erp:', e.message); } }
  const r = analyze(folder, erp);
  if (args.includes('--json')) { console.log(JSON.stringify(r, null, 1)); process.exit(0); }
  console.log(`\nПапка: ${r.folder}`);
  console.log(`Реальный этап (по артефактам): ${r.stage}. ${r.stageName}  [${r.stageBasis}]`);
  console.log(`Последнее движение: ${r.lastMovement}  ·  дней без движения: ${r.daysIdle == null ? '—' : r.daysIdle}`);
  console.log(`Чей ход: ${r.whoseTurn}`);
  console.log(`Разделы с артефактами: ${r.disciplines.map(d => `${d.discipline}(${d.files}, ${d.newest})`).join(', ') || '—'}`);
  if (r.markers.length) console.log(`Маркеры: ${r.markers.join(', ')}`);
  if (r.erp) console.log(`ERP сейчас: ${r.erp.status} · ${r.erp.pct}% · «${r.erp.stageName}» · зона ${r.erp.zone || '—'}`);
  if (r.anomalies.length) { console.log('АНОМАЛИИ:'); for (const a of r.anomalies) console.log('  ⚠ ' + a); } else console.log('Аномалий не найдено.');
}
