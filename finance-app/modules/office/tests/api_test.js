// Самодостаточная проверка API «Документы и канцелярия» разными ролями.
//   node modules/office/tests/api_test.js   (или bash modules/office/tests/api_test.sh)
// Сам поднимает сервер на пустой временной базе (порт 3109, DEV_USER=owner) с тестовыми пользователями и проектами pm,
// прогоняет проверки, гасит сервер и удаляет базу. Рабочую базу и рабочий сервер не трогает. Роли — cookie devrole.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..'); // finance-app
const PORT = 3109;
const BASE = `http://127.0.0.1:${PORT}`;
const USERS = [['dev-owner', 'owner', 'Владелец (тест)'], ['dev-partner', 'partner', 'Партнёр (тест)'], ['dev-secretary', 'secretary', 'Секретарь (тест)'], ['dev-accountant', 'accountant', 'Бухгалтер (тест)'],
  ['dev-gip', 'gip', 'ГИП (тест)'], ['dev-pm', 'pm', 'ПМ (тест)'], ['dev-lead', 'lead', 'Руководитель АР (тест)', 'АР'], ['dev-staff', 'staff', 'Сотрудник (тест)']];
const PROJECTS = [{ id: 'p-mine', track: 'rp', name: 'ЖК Тестовый (ГИП)', gipId: 'dev-gip', pmId: '', status: 'В работе' }, { id: 'p-other', track: 'rp', name: 'БЦ Чужой', gipId: 'someone', pmId: '', status: 'В работе' }];
let fails = 0;
const check = (cond, msg) => { console.log((cond ? '  ok  ' : '  FAIL') + ' ' + msg); if (!cond) fails++; };
async function call(role, method, p, body) {
  const r = await fetch(BASE + '/api/office' + p, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: `devrole=${role}` }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || ''; const data = ct.includes('json') ? await r.json().catch(() => null) : await r.text();
  return { status: r.status, data, ct };
}
async function startServer() {
  try { await fetch(BASE + '/api/status'); throw new Error(`Порт ${PORT} занят другим сервером — остановите его (свой тестовый процесс по PID) и повторите`); } catch (e) { if (/занят/.test(e.message)) throw e; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-office-test-'));
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users: USERS.map(([id, role, name, section]) => ({ id, login: id, name, role, section: section || '', active: true })), pmProjects: PROJECTS, pmItems: [], pmBlockers: [] }));
  const env = Object.assign({}, process.env, { DATA_DIR: dir, DEV_USER: 'owner', PORT: String(PORT) }); delete env.DEV_SPLIT; delete env.ERP_PORT; delete env.TRUST_PROXY;
  const proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; proc.stdout.on('data', x => { log += x; }); proc.stderr.on('data', x => { log += x; });
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 250)); try { if ((await fetch(BASE + '/api/status')).ok) return { proc, dir }; } catch { } if (proc.exitCode !== null) break; }
  proc.kill(); throw new Error(`Сервер не запустился на порту ${PORT}:\n${log}`);
}
function stopServer(srv) { if (!srv) return; try { srv.proc.kill(); } catch { } setTimeout(() => { try { fs.rmSync(srv.dir, { recursive: true, force: true }); } catch { } }, 500); }
const b64 = s => Buffer.from(s).toString('base64');

async function main() {
  const Y = new Date().toISOString().slice(0, 4); const today = new Date().toISOString().slice(0, 10); const past = `${Y}-01-05`;

  console.log('Письма: регистрация и нумерация');
  check((await call('staff', 'POST', '/letters', { dir: 'in', correspondent: 'x', subject: 'x' })).status === 403, 'сотрудник не регистрирует письма');
  check((await call('accountant', 'POST', '/letters', { dir: 'in', correspondent: 'x', subject: 'x' })).status === 403, 'бухгалтер только читает');
  const in1 = await call('secretary', 'POST', '/letters', { dir: 'in', company: 'MOST Project', correspondent: 'Госэкспертиза', subject: 'Замечания по РП', theirNo: '15-02', due: past, responsibleId: 'dev-staff', pid: 'p-mine' });
  check(in1.status === 200 && in1.data.no === `ВХ-MP-${Y}-001` && in1.data.status === 'new', 'секретарь зарегистрировал входящее: ' + (in1.data && in1.data.no));
  const in2 = await call('secretary', 'POST', '/letters', { dir: 'in', company: 'MOST Project', correspondent: 'Заказчик', subject: 'Запрос' });
  check(in2.data.no === `ВХ-MP-${Y}-002`, 'нумерация идёт подряд: ' + in2.data.no);
  const inA = await call('secretary', 'POST', '/letters', { dir: 'in', company: 'MOST Architects', correspondent: 'Акимат', subject: 'АПЗ' });
  check(inA.data.no === `ВХ-MA-${Y}-001`, 'у другой компании свой счётчик: ' + inA.data.no);
  const out1 = await call('secretary', 'POST', '/letters', { dir: 'out', company: 'MOST Project', correspondent: 'Госэкспертиза', subject: 'Ответы на замечания', text: 'Направляем ответы.\nПриложение: 1 файл.', replyTo: in1.data.id, responsibleId: 'dev-gip' });
  check(out1.data.no === `ИСХ-MP-${Y}-001`, 'исходящие — свой счётчик: ' + out1.data.no);
  const in1after = await call('secretary', 'GET', '/letters/' + in1.data.id);
  check(in1after.data.status === 'answered' && in1after.data.answers.length === 1, 'ответ «в ответ на» закрыл ожидание входящего');
  check(!!(await call('secretary', 'POST', '/letters', { dir: 'in', company: 'Чужая', correspondent: 'x', subject: 'x' })).data.error, 'чужая компания не принимается');

  console.log('Письма: права ГИП/ПМ и ответственного');
  check((await call('gip', 'POST', '/letters', { dir: 'out', pid: 'p-other', correspondent: 'x', subject: 'x' })).status === 403, 'ГИП не регистрирует письмо по чужому проекту');
  const gOut = await call('gip', 'POST', '/letters', { dir: 'out', pid: 'p-mine', company: 'MOST Project', correspondent: 'Заказчик', subject: 'Состав РП' });
  check(gOut.status === 200, 'ГИП регистрирует письмо по своему проекту');
  check((await call('gip', 'PUT', '/letters/' + gOut.data.id, { pid: 'p-other' })).status === 403, 'ГИП не переносит письмо в чужой проект');
  const inX = await call('secretary', 'POST', '/letters', { dir: 'in', company: 'MOST Project', correspondent: 'Посторонний', subject: 'Не для ГИПа' });
  check((await call('gip', 'POST', '/letters', { dir: 'out', pid: 'p-mine', company: 'MOST Project', correspondent: 'x', subject: 'x', replyTo: inX.data.id })).status === 400 && (await call('secretary', 'GET', '/letters/' + inX.data.id)).data.status === 'new', 'нельзя «ответить» на невидимое письмо и закрыть его');
  const gList = await call('gip', 'GET', '/letters');
  check(gList.data.every(l => l.pid === 'p-mine' || l.responsibleId === 'dev-gip'), `ГИП видит только письма своих проектов и свои (${gList.data.length})`);
  check((await call('pm', 'GET', '/letters/' + in2.data.id)).status === 404, 'посторонний ПМ не видит письмо');
  const sList = await call('staff', 'GET', '/letters');
  check(sList.data.length === 1 && sList.data[0].id === in1.data.id, 'сотрудник видит только письмо, где он ответственный');
  const sEdit = await call('staff', 'PUT', '/letters/' + in2.data.id, { status: 'work' });
  check(sEdit.status === 404, 'сотрудник не трогает чужие письма');
  const in3 = await call('secretary', 'POST', '/letters', { dir: 'in', company: 'MOST Project', correspondent: 'ГАСК', subject: 'Предписание', due: past, responsibleId: 'dev-staff' });
  const sWork = await call('staff', 'PUT', '/letters/' + in3.data.id, { status: 'work', subject: 'Подменил тему' });
  check(sWork.status === 200 && sWork.data.status === 'work' && sWork.data.subject === 'Предписание', 'ответственный меняет статус, но не тему');
  const sum = await call('staff', 'GET', '/summary');
  check(sum.data.waiting === 1 && sum.data.overdue === 1, `у сотрудника: ждёт ответа ${sum.data.waiting}, просрочено ${sum.data.overdue}`);
  const sumS = await call('secretary', 'GET', '/summary');
  check(sumS.data.waiting >= 3 && sumS.data.overdue >= 1, `у секретаря: ждёт ${sumS.data.waiting}, просрочено ${sumS.data.overdue}`);
  check((await call('secretary', 'GET', '/letters?overdue=1')).data.every(l => l.overdue), 'фильтр «просрочено»');
  check((await call('secretary', 'PUT', '/letters/' + in2.data.id, { date: `${Number(Y) - 1}-12-31` })).status === 400, 'год даты зарегистрированного письма не меняется');

  console.log('Письма: вложения');
  const pdf = await call('staff', 'POST', `/letters/${in3.data.id}/files`, { name: 'Предписание.pdf', data: b64('%PDF-1.4\n%тест\n') });
  check(pdf.status === 200 && pdf.data.files.length === 1, 'ответственный прикрепил PDF');
  check((await call('staff', 'POST', `/letters/${in3.data.id}/files`, { name: 'fake.pdf', data: b64('MZ исполняемый файл') })).status === 400, 'подделка под PDF отклонена');
  check((await call('staff', 'POST', `/letters/${in3.data.id}/files`, { name: 'virus.exe', data: b64('MZ') })).status === 400, 'EXE не принимается');
  const docx = await call('secretary', 'POST', `/letters/${in3.data.id}/files`, { name: 'Ответ.docx', data: b64('PK\u0003\u0004 тест') });
  check(docx.status === 200, 'DOCX принят (zip-сигнатура)');
  const key = pdf.data.files[0].key; const dl = await call('staff', 'GET', `/letters/${in3.data.id}/files/${key}`);
  check(dl.status === 200 && dl.ct.includes('pdf'), 'файл скачивается');
  check((await call('pm', 'GET', `/letters/${in3.data.id}/files/${key}`)).status === 404, 'посторонний не скачивает');
  check((await call('staff', 'DELETE', `/letters/${in3.data.id}/files/${key}`)).status === 403, 'ответственный не удаляет файлы');

  console.log('Письма: удаление');
  check((await call('secretary', 'DELETE', '/letters/' + in2.data.id)).status === 403, 'секретарь не удаляет');
  check((await call('owner', 'DELETE', '/letters/' + in2.data.id)).status === 200, 'владелец удаляет');
  check((await call('accountant', 'GET', '/letters')).data.length >= 4, 'бухгалтер читает все письма');

  console.log('Печать письма на бланке');
  const pr = await call('secretary', 'GET', '/print/letter/' + out1.data.id);
  check(pr.status === 200 && pr.ct.includes('text/html') && pr.data.includes(out1.data.no) && pr.data.includes('М.П.') && pr.data.includes('на № 15-02'), 'бланк: номер, «на №», место М.П.');
  check((await call('secretary', 'GET', '/print/letter/' + in1.data.id)).status === 400, 'входящее на бланке не печатается');

  console.log('Выдача документации (накладные)');
  const items = 'АР | Архитектурные решения | 45 | 1 | 2\nКЖ | Конструкции железобетонные | 60 | 0 | 2';
  check((await call('gip', 'POST', '/issues', { pid: 'p-other', recipient: 'x', items })).status === 403, 'ГИП не оформляет выдачу по чужому проекту');
  const is1 = await call('gip', 'POST', '/issues', { pid: 'p-mine', company: 'MOST Project', stage: 'РП', recipient: 'ТОО «Заказчик», технадзор', method: 'both', items });
  check(is1.status === 200 && is1.data.no === `НК-MP-${Y}-001` && is1.data.items.length === 2, 'ГИП оформил накладную: ' + (is1.data && is1.data.no));
  check((await call('gip', 'POST', '/issues', { pid: 'p-mine', recipient: 'x', items: '' })).status === 400, 'без комплектов нельзя');
  const rec = await call('gip', 'PUT', '/issues/' + is1.data.id, { received: { at: today, by: 'Инженер технадзора' } });
  check(rec.data.status === 'received' && rec.data.received.at === today, 'отметка о получении');
  const ip = await call('gip', 'GET', '/print/issue/' + is1.data.id);
  check(ip.status === 200 && ip.data.includes('Архитектурные решения') && ip.data.includes('Принял'), 'печатная накладная с таблицей и подписями');
  check((await call('staff', 'GET', '/issues')).data.length === 0, 'сотрудник не видит накладные');
  check((await call('accountant', 'GET', '/issues')).data.length === 1, 'бухгалтер видит накладные');
  check((await call('gip', 'GET', '/issues?pid=p-mine')).data.length === 1, 'история выдач по проекту');

  console.log('Приказы и ознакомление');
  check((await call('gip', 'POST', '/orders', { title: 'x' })).status === 403, 'ГИП не оформляет приказы');
  const o1 = await call('secretary', 'POST', '/orders', { company: 'MOST Project', type: 'appoint', title: 'О назначении ГИП проекта', text: 'Назначить ГИП.', acquaint: ['dev-staff', 'dev-gip'] });
  check(o1.status === 200 && o1.data.no === `ПР-MP-${Y}-001` && o1.data.people.length === 2, 'секретарь оформил приказ: ' + (o1.data && o1.data.no));
  check((await call('staff', 'GET', '/summary')).data.ordersToAck === 1, 'у сотрудника приказ ждёт ознакомления');
  check((await call('pm', 'GET', '/orders/' + o1.data.id)).status === 404, 'кого нет в списке — не видит приказ');
  check((await call('pm', 'POST', `/orders/${o1.data.id}/ack`)).status === 404, 'и не может отметиться');
  const ack = await call('staff', 'POST', `/orders/${o1.data.id}/ack`);
  check(ack.status === 200 && ack.data.acked && !!ack.data.people.find(p => p.id === 'dev-staff').at, 'сотрудник ознакомлен, дата сохранена');
  check((await call('staff', 'GET', '/summary')).data.ordersToAck === 0, 'счётчик ознакомления обнулился');
  const op = await call('secretary', 'GET', '/print/order/' + o1.data.id);
  check(op.status === 200 && op.data.includes('ПРИКАЗ') && op.data.includes('Сотрудник (тест)'), 'печать приказа со списком ознакомления');
  check((await call('secretary', 'DELETE', '/orders/' + o1.data.id)).status === 403, 'секретарь не удаляет приказ');

  console.log('Шаблоны и реквизиты');
  check((await call('staff', 'GET', '/templates')).status === 403, 'сотрудник не видит шаблоны');
  const tpl = await call('secretary', 'GET', '/templates');
  check(tpl.status === 200 && tpl.data.templates.length === 3 && !tpl.data.canEdit, 'секретарь видит шаблоны, но не правит');
  check((await call('secretary', 'PUT', '/templates/company', { company: 'MOST Project', data: { address: 'x' } })).status === 403, 'секретарь не меняет реквизиты');
  const co = await call('owner', 'PUT', '/templates/company', { company: 'MOST Project', data: { fullName: 'ТОО «MOST Project»', city: 'г. Алматы', address: 'ул. Тестовая, 1', director: 'Иванов И.И.', directorTitle: 'Директор' } });
  check(co.status === 200 && co.data.address === 'ул. Тестовая, 1', 'владелец задал реквизиты');
  check((await call('secretary', 'GET', '/print/letter/' + out1.data.id)).data.includes('ул. Тестовая, 1'), 'реквизиты попали на бланк');
  check((await call('owner', 'PUT', '/templates/letter', { html: '<p onclick="x()">{{no}}</p>' })).status === 400, 'скрипты в шаблоне запрещены');
  const own = await call('owner', 'PUT', '/templates/letter', { html: '<p>СВОЙ БЛАНК {{no}}</p>' });
  check(own.status === 200 && (await call('secretary', 'GET', '/print/letter/' + out1.data.id)).data.includes('СВОЙ БЛАНК ' + out1.data.no), 'свой шаблон письма применяется');
  await call('owner', 'PUT', '/templates/letter', { reset: true });
  check((await call('secretary', 'GET', '/print/letter/' + out1.data.id)).data.includes('Исх. №'), 'возврат к стандартному шаблону');
}

(async () => {
  let srv = null;
  try { srv = await startServer(); await main(); }
  catch (e) { console.error(e); fails = fails || 1; }
  finally { stopServer(srv); }
  console.log(fails ? `\nОшибок: ${fails}` : '\nВсе проверки пройдены');
  setTimeout(() => process.exit(fails ? 1 : 0), 700);
})();
