// Проверка API «Знаний» разными ролями на тестовом сервере (DEV_USER). Запуск:
//   set DATA_DIR=data-dev\kb& set DEV_USER=owner& set PORT=3104& node server.js
//   node modules/kb/tools/api_check.js [http://localhost:3104] [путь к kb-import.json]
// Роли переключаются cookie devrole/devsection. В базе должны быть пользователи dev-staff (АР), u-kj (КЖ) — см. README.
'use strict';
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:3104';
const IMPORT = process.argv[3] || 'data-dev/kb/kb-import.json';
let fails = 0;
const check = (cond, msg) => { console.log((cond ? '  ok  ' : '  FAIL') + ' ' + msg); if (!cond) fails++; };
async function call(role, method, path, body, section) {
  const r = await fetch(BASE + '/api/kb' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: `devrole=${role}` + (section ? `; devsection=${encodeURIComponent(section)}` : '') }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => null); return { status: r.status, data };
}

(async () => {
  console.log('Стартовое наполнение и импорт');
  check((await call('staff', 'POST', '/seed')).status === 403, 'сотрудник не может загрузить стартовое наполнение');
  const seed = await call('owner', 'POST', '/seed'); check(seed.status === 200, 'владелец загрузил стартовое: ' + JSON.stringify(seed.data));
  if (fs.existsSync(IMPORT)) { const imp = JSON.parse(fs.readFileSync(IMPORT, 'utf8')); const r = await call('secretary', 'POST', '/import', imp); check(r.status === 200, 'секретарь импортировал регламенты: ' + JSON.stringify(r.data)); const r2 = await call('secretary', 'POST', '/import', imp); check(r2.data && r2.data.added === 0, 'повторный импорт не дублирует'); }
  check((await call('gip', 'POST', '/import', { articles: [{ title: 'x' }] })).status === 403, 'ГИП не может импортировать');

  console.log('Новости');
  check((await call('staff', 'POST', '/news', { title: 'Нельзя' })).status === 403, 'сотрудник не публикует новости');
  const n = await call('secretary', 'POST', '/news', { title: 'Субботник', text: 'В пятницу' }); check(n.status === 200, 'секретарь опубликовал новость');
  let s = await call('staff', 'GET', '/summary'); const before = s.data.unreadNews; check(before >= 1, 'у сотрудника есть непрочитанные: ' + before);
  await call('staff', 'POST', `/news/${n.data.id}/read`); s = await call('staff', 'GET', '/summary'); check(s.data.unreadNews === before - 1, 'после «Прочитал» счётчик уменьшился');
  const nl = await call('staff', 'GET', '/news'); check(nl.data.every(x => x.readers === undefined), 'сотрудник не видит список прочитавших');
  const nl2 = await call('partner', 'GET', '/news'); check(nl2.data.some(x => x.readers && x.readers.length), 'партнёр видит, кто прочитал');

  console.log('База знаний');
  const list = await call('staff', 'GET', '/articles?q=' + encodeURIComponent('топосъемка')); check(list.data.items.length >= 1, 'поиск «топосъемка» (ё/е) нашёл: ' + list.data.items.map(x => x.title).join('; '));
  check((await call('staff', 'POST', '/articles', { title: 'x' })).status === 403, 'сотрудник не пишет статьи');
  const sec = await call('staff', 'GET', '/articles?section=' + encodeURIComponent('Документы для подписи')); check(sec.data.items.length === 3, 'три документа для подписи');
  const nda = sec.data.items[0]; await call('staff', 'POST', `/articles/${nda.id}/sign`);
  const sg = await call('staff', 'GET', '/signs'); check(sg.data.mine.filter(x => x.signed).length === 1 && !sg.data.matrix, 'сотрудник ознакомлен с 1 документом, сводную не видит');
  const sgl = await call('lead', 'GET', '/signs', null, 'АР'); check(sgl.data.matrix && sgl.data.matrix.rows.every(r => r.id !== 'u-kj'), 'рук. АР видит сводную только своего раздела');

  console.log('Тесты');
  const tl = await call('staff', 'GET', '/tests'); const test = tl.data[0]; check(!!test, 'тест есть: ' + (test && test.title));
  const pub = await call('staff', 'GET', '/tests/' + test.id); check(pub.data.questions.every(q => q.correct === undefined), 'правильные ответы не уходят в браузер');
  check((await call('staff', 'GET', `/tests/${test.id}?edit=1`)).status === 403, 'сотрудник не открывает редактор теста');
  const bad = await call('staff', 'POST', `/tests/${test.id}/attempt`, { answers: {} }); check(bad.data.score === 0 && !bad.data.passed, 'пустая попытка — 0 %, не сдан');
  const full = await call('owner', 'GET', `/tests/${test.id}?edit=1`); const answers = Object.fromEntries(full.data.questions.map(q => [q.id, q.correct]));
  const good = await call('staff', 'POST', `/tests/${test.id}/attempt`, { answers }); check(good.data.score === 100 && good.data.passed && good.data.left === 1, 'верные ответы — 100 %, сдан, осталась 1 попытка');
  await call('staff', 'POST', `/tests/${test.id}/attempt`, { answers });
  check((await call('staff', 'POST', `/tests/${test.id}/attempt`, { answers })).status === 403, 'после 3 попыток — отказ');
  const hist = await call('staff', 'GET', '/attempts'); check(hist.data.length === 3 && hist.data.every(x => x.userId === 'dev-staff'), 'история: 3 свои попытки');
  check((await call('lead', 'POST', '/tests', { title: 'Тест АР', text: '? Вопрос\n+ да\n- нет' }, 'АР')).status === 200, 'рук. раздела создаёт тест');
  const e1 = await call('owner', 'POST', '/tests', { title: 'Ошибка', text: '? Без верного\n- a\n- b' }); check(e1.status === 400, 'тест без верного ответа отклонён: ' + (e1.data && e1.data.error));
  check((await call('secretary', 'POST', '/tests', { title: 'x', text: '? q\n+ a\n- b' })).status === 403, 'секретарь не составляет тесты');

  console.log('Обучение');
  const cl = await call('staff', 'GET', '/courses'); const course = cl.data[0]; check(!!course && course.steps > 10, 'программа стажировки: шагов ' + (course && course.steps));
  const cg = await call('owner', 'GET', '/courses/' + course.id); check(Array.isArray(cg.data.missing), 'ненайденные ссылки программы: ' + JSON.stringify(cg.data.missing));
  check((await call('lead', 'POST', '/enrolls', { courseId: course.id, userId: 'u-kj' }, 'АР')).status === 403, 'рук. АР не назначает новичка КЖ');
  const en = await call('lead', 'POST', '/enrolls', { courseId: course.id, userId: 'dev-staff', mentorId: 'dev-partner' }, 'АР'); check(en.status === 200 && en.data.mentor === 'Партнёр (тест)', 'рук. АР назначил обучение с наставником-партнёром'); // у dev-руководителей один id, поэтому наставник — не lead
  const card = await call('staff', 'GET', '/enrolls/' + en.data.id); check(card.data.pct > 0, `прогресс учитывает подпись и тест: ${card.data.pct}% (${card.data.doneN}/${card.data.total})`);
  const task = card.data.weeks[0].steps.find(x => x.kind === 'task'); const st = await call('staff', 'PUT', `/enrolls/${en.data.id}/steps/${task.id}`, { done: true }); check(st.data.doneN === card.data.doneN + 1, 'новичок отметил задание');
  check((await call('lead', 'GET', '/enrolls', null, 'КЖ')).data.length === 0, 'рук. КЖ не видит новичка АР');
  check((await call('gip', 'GET', '/enrolls/' + en.data.id)).status === 404, 'посторонний ГИП не видит карточку');
  check((await call('gip', 'PUT', `/enrolls/${en.data.id}/steps/${task.id}`, { done: false })).status === 404, 'посторонний не отмечает шаги');

  console.log(fails ? `\nОшибок: ${fails}` : '\nВсе проверки пройдены'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
