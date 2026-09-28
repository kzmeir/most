// «Материалы» доски: пути (обход каталогов), категории, исключения, лимиты скана, подбор папки, раскладка без дублей.
// Запуск из finance-app:  node modules/board/tests/materials_test.js
// Фейковая «сетевая папка» создаётся в data-dev/board-mat-test (в .gitignore); реальные сетевые диски не трогаются.
'use strict';
const fs = require('fs');
const path = require('path');
const BD = require('../domain');
const MAT = require('../materials');

let pass = 0, fail = 0;
const chk = (name, want, got) => { const a = JSON.stringify(want), b = JSON.stringify(got); if (a === b) { pass++; console.log(`  ✓ ${name} (${b})`); } else { fail++; console.log(`  ✗ ${name}: ожидалось ${a}, получено ${b}`); } };

const APP = path.resolve(__dirname, '..', '..', '..'); const BASE = path.join(APP, 'data-dev', 'board-mat-test');
fs.rmSync(BASE, { recursive: true, force: true });
const SHARE = path.join(BASE, 'share'); const OUT = path.join(BASE, 'outside');
const put = (rel, data) => { const p = path.join(SHARE, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data == null ? 'x' : data); };
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');
put('Проект А/04-Render/07-07-2026/01.jpg', JPG); put('Проект А/04-Render/02.png', JPG); put('Проект А/04-Render/textures/wood.jpg', JPG); put('Проект А/04-Render/AutoSave/as.jpg', JPG);
put('Проект А/05-Reference/ref1.webp', JPG); put('Проект А/05-Reference/Thumbs.db', 'db'); put('Проект А/06-PDF/Посадка.pdf', PDF); put('Проект А/12 - Презентация/Материалы/фон.jpg', JPG);
put('Проект А/00-ИРД/sputnik.jpg', JPG); put('Проект А/00-ИРД/АПЗ.pdf', PDF); put('Проект А/03-SKP/model.skp', 'skp'); put('Проект А/backup/old.jpg', JPG); put('Проект А/maps/m.png', JPG);
put('Проект А/10-Солярис/инсоляция.jpg', JPG); put('Проект А/Итоговая презентация.pdf', PDF); put('Проект А/~$temp.jpg', JPG); put('Проект А/.hidden.jpg', JPG); put('Проект А/пусто.jpg', '');
put('Проект А/a/b/c/d/e/f/g/глубоко.jpg', JPG);
for (let i = 0; i < 30; i++) put(`Большой/${String(i).padStart(2, '0')}.jpg`, JPG);
put('111-2025-Теректы 4,16 Га/04-Render/r.jpg', JPG); put('Архив/045_2020_ASP-Аспан парк/x.jpg', JPG); put('_Рассмотрение/2026/Эверест_Теректы 4,16 Га/x.jpg', JPG);
fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'secret.jpg'), JPG);
const ROOTS = [MAT.cleanRoot({ id: 't', alias: 'T:', path: SHARE, tracks: 'ep' })];

(async () => {
  console.log('== обход каталогов запрещён ==');
  chk('cleanRel: «..» — отказ', null, BD.cleanRel('Проект А/../../outside'));
  chk('cleanRel: «..» с обратными слэшами — отказ', null, BD.cleanRel('a\\..\\..\\b'));
  chk('cleanRel: «...» — отказ', null, BD.cleanRel('a/.../b'));
  chk('cleanRel: диск внутри пути — отказ', null, BD.cleanRel('a/C:/Windows'));
  chk('cleanRel: NUL — отказ', null, BD.cleanRel('a\u0000b'));
  chk('cleanRel: нормализация слэшей и «.»', 'Проект А/04-Render', BD.cleanRel('\\Проект А\\.\\04-Render\\'));
  chk('parseUserPath: алиас T:', { root: 't', rel: 'Проект А/04-Render' }, MAT.parseUserPath(ROOTS, 'T:\\Проект А\\04-Render'));
  chk('parseUserPath: полный путь корня', { root: 't', rel: 'Проект А' }, MAT.parseUserPath(ROOTS, path.join(SHARE, 'Проект А')));
  chk('parseUserPath: «..» из корня наружу — отказ', null, MAT.parseUserPath(ROOTS, 'T:\\..\\outside'));
  chk('parseUserPath: чужой диск — отказ', null, MAT.parseUserPath(ROOTS, 'C:\\Windows\\System32'));
  chk('parseUserPath: префикс-обманка (share2) — отказ', null, MAT.parseUserPath(ROOTS, SHARE + '2\\x'));
  chk('absOf: «..» — отказ', null, MAT.absOf(ROOTS, 't', '../outside/secret.jpg'));
  chk('absOf: неизвестный корень — отказ', null, MAT.absOf(ROOTS, 'z', 'x'));
  chk('absOf: внутри корня', path.join(SHARE, 'Проект А'), MAT.absOf(ROOTS, 't', 'Проект А'));
  chk('insideReal: папка внутри корня', true, await MAT.insideReal(ROOTS, 't', path.join(SHARE, 'Проект А')));
  let linkOk = false; try { fs.symlinkSync(OUT, path.join(SHARE, 'ссылка-наружу'), 'junction'); linkOk = true; } catch { }
  if (linkOk) chk('insideReal: junction наружу — отказ', false, await MAT.insideReal(ROOTS, 't', path.join(SHARE, 'ссылка-наружу')));
  chk('cleanItem: srcPath с «..» не сохраняется', undefined, BD.cleanItem({ type: 'image', props: { srcRoot: 't', srcPath: '../x.jpg' } }, 'b').props.srcPath);
  chk('cleanItem: srcPath сохраняется', 'Проект А/04-Render/02.png', BD.cleanItem({ type: 'image', props: { srcRoot: 't', srcPath: 'Проект А/04-Render/02.png', srcSize: 22, srcMtime: 5 } }, 'b').props.srcPath);
  chk('cleanRoot: путь с «..» — отказ', null, MAT.cleanRoot({ id: 'x', path: 'C:\\a\\..\\b' }));
  chk('BOARD_ROOTS разбирается', ['y', 'z'], MAT.parseRootsEnv('y|Y:|\\\\SynologyMost\\MOST-2025|ep;z|Z:|\\\\MostServer\\Projects|rp').map(r => r.id));

  console.log('== категории и исключения ==');
  const cat = rel => BD.matCategory(rel);
  chk('04-Render → Рендеры', 'render', cat('04-Render/07-07-2026/01.jpg'));
  chk('05-Reference → Референсы', 'ref', cat('05-Reference/a.jpg'));
  chk('06-PDF → Презентации', 'present', cat('06-PDF/Анализ/a.pdf'));
  chk('12 - Презентация/Материалы → Презентации (верхняя папка решает)', 'present', cat('12 - Презентация/Материалы/render.jpg'));
  chk('08-Градсовет → Презентации', 'present', cat('08-Градсовет/x.pdf'));
  chk('00-ИРД → ИРД / Документы', 'docs', cat('00-ИРД/sputnik.jpg'));
  chk('11-Задания → ИРД / Документы', 'docs', cat('11-Задания/x.jpg'));
  chk('PDF без подсказок → Презентации / PDF', 'present', cat('x.pdf'));
  chk('картинка без подсказок → Прочее', 'other', cat('10-Солярис/инсоляция.jpg'));
  chk('по имени файла: «…_Презентация_…»', 'present', cat('Теректы_Презентация_02-09-2026.jpg'));
  chk('«Туркестан» не путается с «ТУ»', 'other', cat('Туркестан/x.jpg'));
  chk('исключаются textures, maps, backup, AutoSave', [true, true, true, true, true], ['textures', 'Maps', 'backup', 'AutoSave', 'Текстуры'].map(BD.excludedDir));
  chk('не исключаются разделы проекта', [false, false, false], ['04-Render', 'cadmapper-almaty', 'Материалы'].map(BD.excludedDir));
  chk('исключаются Thumbs.db, ~$, скрытые, чужие расширения', [true, true, true, true, false, false], ['Thumbs.db', '~$a.jpg', '.a.jpg', 'm.skp', 'a.JPEG', 'b.pdf'].map(BD.excludedFile));

  console.log('== скан и лимиты ==');
  const s = await MAT.scanFolder(path.join(SHARE, 'Проект А'));
  const rels = s.files.map(f => f.rel).sort();
  chk('скан: только jpg/png/webp/pdf, без исключённых и пустых', ['00-ИРД/sputnik.jpg', '00-ИРД/АПЗ.pdf', '04-Render/02.png', '04-Render/07-07-2026/01.jpg', '05-Reference/ref1.webp', '06-PDF/Посадка.pdf', '10-Солярис/инсоляция.jpg', '12 - Презентация/Материалы/фон.jpg', 'Итоговая презентация.pdf'], rels);
  chk('скан: глубже 6 уровней не идёт, отмечено', 1, s.deep);
  const s2 = await MAT.scanFolder(path.join(SHARE, 'Проект А'), { depth: 10 });
  chk('скан: с глубиной 10 файл на 8-м уровне найден', true, s2.files.some(f => f.rel.endsWith('глубоко.jpg')));
  const s3 = await MAT.scanFolder(path.join(SHARE, 'Большой'), { files: 10 });
  chk('лимит файлов: 10 из 30, truncated=files', [10, 'files'], [s3.files.length, s3.truncated]);
  const s4 = await MAT.scanFolder(path.join(SHARE, 'Проект А'), { dirs: 3 });
  chk('лимит каталогов: truncated=dirs', 'dirs', s4.truncated);
  const s5 = await MAT.scanFolder(path.join(SHARE, 'нет такой'));
  chk('несуществующая папка: пусто, ошибка записана', [0, 1], [s5.files.length, s5.errors.length]);

  console.log('== подбор папки проекта ==');
  const ctx = { db: { boardConfig: [{ id: 'roots', roots: ROOTS }] } };
  const c1 = await MAT.candidates(ctx, { name: 'Теректи', track: 'ep' });
  chk('«Теректи» → две папки Теректы (номерная и в _Рассмотрение)', ['111-2025-Теректы 4,16 Га', '_Рассмотрение/2026/Эверест_Теректы 4,16 Га'].sort(), c1.map(c => c.rel).sort());
  const c2 = await MAT.candidates(ctx, { name: 'Что-то', no: '111', track: 'ep' });
  chk('по номеру 111 — первая «111-2025-…»', '111-2025-Теректы 4,16 Га', c2[0] && c2[0].rel);
  chk('латиница/кириллица: «Aspan park» → «Аспан парк»', true, BD.scoreCandidates({ name: 'Aspan park' }, [{ name: '045_2020_ASP-Аспан парк' }, { name: 'Другое' }]).length === 1);

  console.log('== раскладка: повторно без дублей ==');
  const f = (n, c, p) => ({ f: 'f' + n, root: 't', path: p || `P/${c}/${n}.jpg`, cat: c });
  const files = [f(1, 'render'), f(2, 'render'), f(3, 'render'), f(4, 'ref'), f(5, 'present'), f(6, 'other')];
  const plan1 = BD.layoutPlan(files, []);
  chk('первый запуск: 4 рамки-категории, 6 ячеек', [4, 6], [plan1.frames.filter(x => x.op === 'create').length, plan1.places.length]);
  chk('рамки помечены matCat', ['render', 'ref', 'present', 'other'], plan1.frames.map(x => x.item.props.matCat));
  const items = plan1.frames.map(x => x.item).concat(plan1.places.map((p, i) => ({ id: 'i' + i, type: 'image', x: p.x, y: p.y, w: p.w, h: p.h, props: { srcRoot: 't', srcPath: files.find(ff => ff.f === p.f).path } })));
  const ids = new Set(); const overlap = plan1.places.some((a, i) => plan1.places.some((b, j) => i !== j && BD.intersects(a, b))); plan1.places.forEach(p => ids.add(p.f));
  chk('ячейки не пересекаются, каждый файл один раз', [false, 6], [overlap, ids.size]);
  const plan2 = BD.layoutPlan(files, items);
  chk('второй запуск: ничего нового — 0 рамок, 0 ячеек, пропущено 6', [0, 0, 6], [plan2.frames.length, plan2.places.length, plan2.skipped]);
  const plan3 = BD.layoutPlan(files.concat([f(7, 'render')]), items);
  const rf = plan1.frames.find(x => x.item.props.matCat === 'render').item;
  chk('новый файл — в существующую рамку «Рендеры», новых рамок нет', [1, rf.id, 0], [plan3.places.length, plan3.places[0].frameId, plan3.frames.filter(x => x.op === 'create').length]);
  chk('новый файл не ложится на занятые ячейки', false, items.some(it => it.type !== 'frame' && BD.intersects(plan3.places[0], it)));
  const many = Array.from({ length: 20 }, (_, i) => f(100 + i, 'ref'));
  const plan4 = BD.layoutPlan(many, items);
  const rfr = plan4.frames.find(x => x.item.props.matCat === 'ref');
  chk('рамка «Референсы» растёт, чтобы вместить 20 новых', true, !!rfr && rfr.op === 'grow' && plan4.places.every(p => BD.contains(rfr.item, p)));
  chk('лимит одного запуска (maxPlace) и остаток', [5, 15], (p => [p.places.length, p.rest])(BD.layoutPlan(many, items, { maxPlace: 5 })));

  if (linkOk) try { fs.rmSync(path.join(SHARE, 'ссылка-наружу'), { recursive: false, force: true }); } catch { }
  console.log(`\nИтого: ✓ ${pass}, ✗ ${fail}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
