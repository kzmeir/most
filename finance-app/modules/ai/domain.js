/* Модуль «ИИ-панель» — чистая логика (Node: require, браузер: window.MostAI). Поток F.
   Права, команды по местам панели, разбор ответа модели в блоки документа и черновик плана работ. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.MostAI = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // пилот — только руководители
  const canUse = u => !!u && ['owner', 'partner'].includes(u.role);
  const canAdmin = u => !!u && u.role === 'owner';
  const BACKENDS = ['cli', 'api', 'mock'];
  const SECTIONS = ['АР', 'КЖ', 'ОВ', 'ВК', 'ЭЛ', 'СС', 'ГП', 'АПТ', 'ПОС', 'ОВОС', 'Смета'];

  // команды: scope 'pm' — карточка проекта, 'pmall' — сводка проектов, 'fin' — финансы (только чтение).
  // text — нужен ли ввод, param — выбор раздела, doc — можно скачать .docx, apply — что делает «Применить»
  const COMMANDS = {
    pm: [
      { id: 'plan', label: 'План работ', hint: 'Сроки пунктов и недостающие пункты под дату по договору; «Применить» — в карточку проекта', apply: 'plan', doc: true, text: 'opt' },
      { id: 'znp', label: 'Задание на проектирование (ЗнП)', hint: 'По форме MOST (приложение к договору), по данным проекта', doc: true, text: 'opt' },
      { id: 'tz', label: 'ТЗ на раздел', hint: 'Техническое задание смежнику / субподрядчику на раздел', doc: true, param: 'section', text: 'opt' },
      { id: 'protocol', label: 'Протокол совещания', hint: 'Вставьте заметки — получится протокол с решениями, ответственными и сроками', doc: true, text: 'req' },
      { id: 'letter', label: 'Письмо заказчику', hint: 'Опишите, о чём письмо (запрос ИРД, согласование, перенос срока…)', doc: true, text: 'req' },
      { id: 'fire', label: 'Что горит по объекту', hint: 'Просрочки, блокеры, риск срока по договору' },
      { id: 'ask', label: 'Вопрос по проекту', hint: 'Свободный вопрос по данным проекта', text: 'req', doc: true },
    ],
    pmall: [
      { id: 'fireall', label: 'Что горит', hint: 'Сводка по всем активным проектам: сроки, просрочки, блокеры' },
      { id: 'overdue', label: 'Что просрочено у раздела', hint: 'Просроченные пункты раздела по всем проектам', param: 'section' },
      { id: 'newplan', label: 'План работ по новому проекту', hint: 'Опишите объект, стадию, сроки — «Применить» создаст проект в «Проектах»', apply: 'project', text: 'req', doc: true },
      { id: 'ask', label: 'Вопрос по проектам', text: 'req', doc: true },
    ],
    fin: [
      { id: 'receivables', label: 'Дебиторка', hint: 'Кто и сколько должен; можно уточнить заказчика', text: 'opt', doc: true },
      { id: 'forecast', label: 'Прогноз денег', hint: 'Поступления и платежи на 8 недель вперёд', text: 'opt', doc: true },
      { id: 'subs', label: 'Субподрядчики по проекту', hint: 'Сколько ушло субподрядчикам — укажите проект', text: 'req', doc: true },
      { id: 'ask', label: 'Вопрос по финансам', hint: 'Только чтение: ответ текстом и таблицей', text: 'req', doc: true },
    ],
  };
  const command = (scope, id) => (COMMANDS[scope] || []).find(c => c.id === id) || null;

  // строки ЗнП по форме MOST («Шаблон ЗНП для заказчика»): перечень основных данных и требований
  const ZNP_ROWS = ['Основание для проектирования', 'Вид строительства', 'Стадийность проектирования', 'Особые условия строительства', 'Основные технико-экономические показатели',
    'Назначения и типы встроенных объектов гражданского назначения', 'Основные требования к объёмно-планировочному решению и инженерному оборудованию', 'Площадка строительства',
    'Основные требования к инженерному оборудованию', 'Требования и объём разработки организации строительства', 'Выделение очередей', 'Требования по обеспечению условий жизнедеятельности МГН',
    'Требования к благоустройству площадки и малым архитектурным формам', 'Требования по инженерно-техническим мероприятиям ГО и ЧС', 'Требования к демонстрационным материалам',
    'Требования по энергосбережению', 'Утеплитель покрытия', 'Требования к использованию подвала', 'Мероприятия по уменьшению рисков криминальных проявлений',
    'Требования к конструктивным решениям и материалам', 'Требования к режиму безопасности и охране труда', 'Требования к разработке сметной документации', 'Условия проектирования',
    'Требования к комплектности ПСД', 'Требования по телефонизации'];

  // ---- ответ модели → { title, summary, blocks, plan, project } ----
  const strip = s => String(s || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  function parseAnswer(text) {
    const raw = String(text || '').trim(); let j = null;
    try { j = JSON.parse(strip(raw)); } catch (e) { const a = raw.indexOf('{'), b = raw.lastIndexOf('}'); if (a >= 0 && b > a) { try { j = JSON.parse(raw.slice(a, b + 1)); } catch (e2) { j = null; } } }
    if (!j || typeof j !== 'object' || Array.isArray(j)) return { title: '', summary: '', blocks: mdBlocks(raw), raw: true };
    return { title: str(j.title, 200), summary: str(j.summary, 2000), blocks: cleanBlocks(j.blocks), plan: cleanPlan(j.plan), project: cleanProject(j.project) };
  }
  const str = (v, n) => String(v == null ? '' : v).slice(0, n || 20000);
  function cleanBlocks(bs) {
    const out = [];
    for (const b of Array.isArray(bs) ? bs : []) {
      if (!b || typeof b !== 'object') continue;
      if (b.h) out.push({ h: str(b.h, 300) }); else if (b.h2) out.push({ h2: str(b.h2, 300) });
      else if (Array.isArray(b.ul)) out.push({ ul: b.ul.map(s => str(s, 3000)) }); else if (Array.isArray(b.ol)) out.push({ ol: b.ol.map(s => str(s, 3000)) });
      else if (b.table && typeof b.table === 'object') out.push({ table: { head: (b.table.head || []).map(s => str(s, 200)), rows: (b.table.rows || []).filter(Array.isArray).slice(0, 500).map(r => r.map(s => str(s, 5000))) } });
      else if (b.p != null) out.push({ p: str(b.p, 10000) });
    }
    return out;
  }
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  function cleanPlan(p) {
    if (!p || typeof p !== 'object') return null;
    const items = (Array.isArray(p.items) ? p.items : []).map(i => ({ stage: Math.max(1, Math.round(Number(i.stage) || 1)), title: str(i.title, 300).trim(), role: str(i.role, 40), weeks: Math.max(0.2, Number(i.weeks) || 1), crit: str(i.crit, 300), due: DATE.test(i.due) ? i.due : '' })).filter(i => i.title);
    const dues = (Array.isArray(p.dues) ? p.dues : []).map(d => ({ id: str(d.id, 80), due: DATE.test(d.due) ? d.due : '', why: str(d.why, 300) })).filter(d => d.id && d.due);
    return items.length || dues.length ? { items, dues } : null;
  }
  function cleanProject(p) {
    if (!p || typeof p !== 'object' || !p.name) return null;
    return { name: str(p.name, 200).trim(), track: ['concept', 'ep', 'rp', 'an'].includes(p.track) ? p.track : 'rp', client: str(p.client, 200), address: str(p.address, 300), area: str(p.area, 30), start: DATE.test(p.start) ? p.start : '', due: DATE.test(p.due) ? p.due : '' };
  }
  // запасной разбор простого markdown (если модель ответила не JSON)
  function mdBlocks(text) {
    const out = []; let list = null; let tbl = null;
    const flush = () => { if (list) { out.push(list); list = null; } if (tbl) { out.push({ table: tbl }); tbl = null; } };
    for (const line of String(text || '').split(/\r?\n/)) {
      const l = line.trim(); if (!l) { flush(); continue; }
      let m;
      if (/^\|.*\|$/.test(l)) { if (/^\|[\s:|-]+\|$/.test(l)) continue; const cells = l.slice(1, -1).split('|').map(s => s.trim()); if (list) { out.push(list); list = null; } if (!tbl) tbl = { head: cells, rows: [] }; else tbl.rows.push(cells); continue; }
      if (tbl) { out.push({ table: tbl }); tbl = null; }
      if ((m = l.match(/^#{1,2}\s+(.*)/))) { flush(); out.push({ h: m[1] }); }
      else if ((m = l.match(/^#{3,6}\s+(.*)/))) { flush(); out.push({ h2: m[1] }); }
      else if ((m = l.match(/^[-*•]\s+(.*)/))) { if (!list || !list.ul) { flush(); list = { ul: [] }; } list.ul.push(m[1]); }
      else if ((m = l.match(/^\d+[.)]\s+(.*)/))) { if (!list || !list.ol) { flush(); list = { ol: [] }; } list.ol.push(m[1]); }
      else { flush(); out.push({ p: l }); }
    }
    flush(); return out;
  }
  // имя файла .docx: «ЗнП — ЖК Тест — 2026-09-24.docx»
  const fileName = (title, date) => (String(title || 'Документ').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Документ') + (date ? ' — ' + date : '') + '.docx';

  return { canUse, canAdmin, BACKENDS, SECTIONS, COMMANDS, command, ZNP_ROWS, parseAnswer, mdBlocks, cleanBlocks, cleanPlan, cleanProject, fileName };
});
