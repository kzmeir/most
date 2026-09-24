#!/usr/bin/env node
// Применить даты и реквизиты договоров из data-dev/pm/contract_dates.json (вне git) к проектам модуля pm через API.
//   node modules/pm/tools/apply_contract_dates.js [--base http://127.0.0.1:3101] [--file data-dev/pm/contract_dates.json] [--cookie "sid=..."] [--dry]
// Нужны права руководителя (DEV_USER=owner на тестовом сервере или cookie сессии на рабочем).
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('--base', 'http://127.0.0.1:3101').replace(/\/$/, '');
const file = arg('--file', path.join(__dirname, '..', '..', '..', 'data-dev', 'pm', 'contract_dates.json')); // реальные данные договоров — вне git; формат: tools/contract_dates.example.json
const cookie = arg('--cookie', '');
const dry = process.argv.includes('--dry');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = (data.rows || []).map(r => { const o = {}; for (const k of Object.keys(r)) if (!k.startsWith('_')) o[k] = r[k]; return o; });
(async () => {
  if (dry) { console.log(JSON.stringify(rows, null, 1)); return; }
  const res = await fetch(base + '/api/pm/contract-dates', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', 'x-requested-with': 'fetch' }, cookie ? { cookie } : {}), body: JSON.stringify({ rows }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { console.error('Ошибка', res.status, j.error || j); process.exit(1); }
  for (const a of j.applied) console.log(`✓ ${a.name}: ${a.contractNo} · старт ${a.start || '—'} → по договору ${a.due || '—'}`);
  for (const m of j.missed) console.log(`✗ не найден проект: ${m}`);
  console.log(`Применено ${j.applied.length}, не найдено ${j.missed.length}`);
})().catch(e => { console.error(e.message); process.exit(1); });
