/* Управление проектами (ЭП и РП): шаблоны этапов из регламентов MOST, права, план сроков, сводки.
   Источники: \\MostServer\Материалы для проектирования\Регламенты — «Регламент проектирования… РП.docx» (роли, сроки, критерии),
   «Дорожная карта проекта\Эскизный проект (ЭП)_06-10-2025.xmind» (путь ЭП). Сроки ЭП — допущение, правятся в проекте. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MostPM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TRACKS = { ep: 'Эскизный проект', rp: 'Рабочий проект' };
  const STATUS = ['В работе', 'Ждём заказчика', 'Ждём госорган', 'На паузе', 'Готово', 'Отменён'];
  const RISK = ['Низкий', 'Средний', 'Высокий'];
  // роль в пункте → раздел руководителя, который его ведёт
  const SECTIONS = ['АР', 'КЖ', 'ГП', 'ОВ', 'ВК', 'ЭЛ', 'СС', 'ГСВ', 'ТХ', 'Смета', 'Визуализация'];
  const ROLE_SECTION = { 'ГАП': 'АР', 'ГКП': 'КЖ', 'ГП': 'ГП', 'ОВ': 'ОВ', 'ВК': 'ВК', 'ЭЛ': 'ЭЛ', 'СС': 'СС', 'ГСВ': 'ГСВ', 'ТХ': 'ТХ', 'Сметчик': 'Смета', 'Визуализатор': 'Визуализация' };
  const ITEM_ROLES = ['ПМ', 'ГИП', 'ГАП', 'ГКП', 'ГП', 'ОВ', 'ВК', 'ЭЛ', 'СС', 'ГСВ', 'ТХ', 'Сметчик', 'Визуализатор', 'Заказчик'];
  const HOLDERS = ['Заказчик', 'Госорган / Экспертиза', 'Смежник', 'Внутри студии'];

  // пункт: [название, роль, недель, критерий приёмки, необязательный]
  const I = (t, role, w, crit, opt) => ({ t, role, w, crit: crit || '', opt: !!opt });
  const TEMPLATES = {
    ep: [
      { name: '1. ИРД', items: [I('Гос. акт на участок', 'Заказчик', 1), I('АПЗ', 'Заказчик', 3, 'АПЗ получено (14 рабочих дней)'), I('Топосъёмка со штампом, координаты участка', 'Заказчик', 2), I('Выкопировка ПДП', 'Заказчик', 1)] },
      { name: '2. Анализ участка и ЗНП', items: [I('Красные линии', 'ГАП', 1), I('Водоохранная зона', 'ГАП', 1), I('Тектонические разломы', 'ГАП', 1), I('Существующие сети и отступы от сетей (СЗЗ)', 'ГП', 1), I('Анализ соседних зданий на СЗЗ', 'ГАП', 1), I('Склон', 'ГП', 1, '', true), I('ЗНП для ЭП', 'ПМ', 1, 'Задание на проектирование подписано заказчиком')] },
      { name: '3. Посадка', items: [I('Посадка', 'ГАП', 2), I('Задание на геологию', 'ГИП', 1), I('ТП, котельная, КПП', 'ГП', 1), I('Площадка ТБО', 'ГП', 1), I('Согласование посадки и ГП с заказчиком, корректировки', 'ПМ', 1, 'Посадка и ГП согласованы заказчиком')] },
      { name: '4. Планы', items: [I('Концепт-презентация', 'ГАП', 1), I('Планы', 'ГАП', 3), I('Расчёт инсоляции', 'ГАП', 1), I('Согласование коммерческих помещений с отделом продаж', 'ПМ', 1), I('Согласование квартирографии и площадей с отделом продаж', 'ПМ', 1, 'Квартирография согласована ОП'), I('Корректировки по комментариям', 'ГАП', 1), I('Расчёт нагрузок', 'ГИП', 1)] },
      { name: '5. Фасады', items: [I('Фасады', 'ГАП', 3), I('Проверка инсоляции', 'ГАП', 1), I('Согласование фасадов с заказчиком, корректировки', 'ПМ', 1), I('Согласование материалов и RAL', 'ПМ', 1, 'Материалы и RAL согласованы заказчиком')] },
      { name: '6. Рендеры и согласование ЭП', items: [I('Рендеры', 'Визуализатор', 2), I('Дополнительные рендеры для отдела продаж', 'Визуализатор', 1, '', true), I('ЭП согласован с заказчиком', 'ПМ', 1, 'Подписанный альбом ЭП / письмо заказчика')] },
      { name: '7. Градсовет', items: [I('Презентационные материалы для градсовета', 'ГАП', 1), I('Уточнение сейсмики у КазНИИСА', 'ГИП', 2), I('Градсовет', 'ПМ', 3), I('ЭП согласован с городом', 'ПМ', 1, 'Протокол / заключение градсовета')] },
      { name: '8. Передача в РП', items: [I('Совещание передачи в РП: ГИП, ГАП, ГП, ГКП, главспецы ОВ/ВК/ЭЛ, АПТ', 'ПМ', 1, 'Протокол передачи, назначен ГИП РП')] },
    ],
    rp: [
      { name: '1. ИРД (ТУ, геология)', items: [I('Расчёт нагрузок для ТУ', 'ГИП', 1, 'Расчёт передан заказчику для получения ТУ'), I('ТУ — технические условия', 'Заказчик', 3, 'ТУ получены (14 рабочих дней, контроль ГИП)'), I('Задание на проектирование РП', 'ГИП', 1, 'ЗнП подписано заказчиком'), I('Геология: балльность, грунты, отчёт, разрезы; согласование с КазНИИСА', 'Заказчик', 4, 'Геологический отчёт получен'), I('Топосъёмка с регистрацией (сети, красные линии, СЗЗ, разломы, водоохранная зона, ЛЭП, деревья, координаты)', 'ГИП', 2, 'Топосъёмка зарегистрирована'), I('СТУ (КЖ, основание, пожарная безопасность)', 'ГИП', 2, 'Все нужные СТУ учтены', true)] },
      { name: '2. ГПР / График чертежей', items: [I('ГПР и график выдачи чертежей (со всеми главспецами)', 'ГИП', 1, 'ГПР выдан заказчику')] },
      { name: '3. Этап 1. Схема КЖ', items: [I('ГП1. Рельеф и посадка', 'ГП', 1, 'План организации рельефа с отметками, координаты осей'), I('Предварительная схема КЖ', 'ГКП', 1, 'Планы типовых этажей со схемой конструктива'), I('КЖ1. Расчёт схемы КЖ', 'ГКП', 2, 'Расчётные схемы с учётом сейсмики, геологии, СТУ'), I('АР1. Планировочное задание смежникам', 'ГАП', 2, 'Планы всех этажей, по которым могут работать инженеры'), I('Согласование с заказчиком: бетон, арматура (кг/м³, на 1 м² продаваемой), планировки', 'ГИП', 2, 'Подписанная «Карточка основных проектных решений» и планы'), I('Котельная или ЦТС', 'ГИП', 1, 'Решение по теплу в ЗнП, подписано заказчиком'), I('Согласование опалубочных чертежей АР и КЖ', 'ГАП', 2, 'Опалубка подписана ГАП и ГКП'), I('Расположение ТП', 'ГАП', 1, 'ТП на ГП согласована заказчиком'), I('Расположение КПП', 'ГАП', 1, 'КПП на ГП согласовано заказчиком')] },
      { name: '4. Этап 2. Финальные планы', items: [I('КЖ2. Котлован', 'ГКП', 2, 'Чертежи котлована выданы с основанием по геологии'), I('КЖ2. Фундамент', 'ГКП', 2, 'Чертежи фундамента с выпусками'), I('ВК1. Планы', 'ВК', 2), I('ОВ1. Планы', 'ОВ', 2), I('ЭЛ1. Планы', 'ЭЛ', 2), I('СС1. Планы', 'СС', 2), I('ГСВ1. Планы', 'ГСВ', 2), I('ТХ', 'ТХ', 2, 'Задания от ТХ для АР', true), I('АР2. Чертежи АР без спецификаций (готовая модель)', 'ГАП', 2, 'Модель Revit оформлена по листам'), I('Контрольная проверка опалубки', 'ГАП', 0.4, 'Наложение опалубки на АР: проёмы, шахты, лестницы'), I('Выдача планировочных решений отделу продаж', 'ГАП', 2, 'Планы с площадями подписаны отделом продаж')] },
      { name: '5. Этап 3. Проект', items: [I('Согласование с заказчиком инженерии: разводка ОВ/ВК/ЭЛ/СС, оборудование', 'ГИП', 1, 'Подпись заказчика'), I('Согласование с заказчиком АР: материалы, узлы', 'ГАП', 1, 'Подпись заказчика'), I('КЖ3. Армирование', 'ГКП', 2), I('АР3. Полная комплектация чертежей АР', 'ГАП', 2), I('ВК2. Схемы', 'ВК', 2), I('ОВ2. Схемы', 'ОВ', 2), I('ЭЛ2. Схемы, планы', 'ЭЛ', 2), I('СС2. Схемы', 'СС', 2), I('ГП2. Полный проект', 'ГП', 2)] },
      { name: '6. Этап 4. Отверстия', items: [I('Задания от инженеров: сбор в один файл, согласование смежниками', 'ГИП', 2), I('Выдача задания конструкторам', 'ГИП', 1, 'Задание подписано на файлах'), I('Проверка отверстий в КЖ (АР, инженеры, ГИП)', 'ГИП', 1), I('ПОС (начало работы)', 'ГИП', 1), I('ОВОС (начало работы)', 'ГИП', 1)] },
      { name: '7. Этап 5. Комплектация (экспертиза)', items: [I('АР4. Подпорные стены, крыльца, козырьки, приямки, навесы, входные группы', 'ГАП', 1), I('КЖ4. Подпорные стены, КМ, крыльца, навесы, приямки', 'ГКП', 1), I('ВК3. Полный комплект чертежей и спецификаций', 'ВК', 1), I('ОВ3. Полный комплект чертежей и спецификаций', 'ОВ', 1), I('ЭЛ3. Полный комплект чертежей и спецификаций', 'ЭЛ', 1), I('СС3. Полный комплект чертежей и спецификаций', 'СС', 1), I('ГСВ3. Полный комплект чертежей и спецификаций', 'ГСВ', 1), I('Акт приёмки-передачи, подписанный заказчиком', 'ГИП', 1, 'Подписанный акт'),
        I('Письмо-согласование РП', 'Заказчик', 1), I('Письмо о финансировании', 'Заказчик', 1), I('Информация о заказчике', 'Заказчик', 1), I('Письмо о вывозе грунта', 'Заказчик', 1), I('Письмо о вывозе мусора и ТБО', 'Заказчик', 1), I('Письмо о начале СМР', 'Заказчик', 1), I('Протокол дозиметрии', 'Заказчик', 1), I('Протокол радона и гамма-фона', 'Заказчик', 1), I('Письмо об отсутствии скотомогильников и сибиреязвенных очагов', 'Заказчик', 1), I('Согласование аэропорта', 'Заказчик', 1, '', true), I('Согласование БАБИ', 'Заказчик', 1, '', true), I('Лесопатология', 'Заказчик', 1, '', true),
        I('ПИР, общая пояснительная записка (ОПЗ)', 'ГИП', 1), I('Паспорт проекта, расчёт инсоляции (оформление)', 'ГАП', 1), I('Энергетический паспорт', 'ОВ', 1), I('Смета', 'Сметчик', 6, 'Полный комплект альбома для экспертизы')] },
      { name: '8. Этап 6. Экспертиза', items: [I('Прохождение комплектации', 'ГИП', 2), I('Замечания экспертизы и ответы', 'ГИП', 3, 'Положительное заключение')] },
      { name: '9. Этап 7. На стройку / Выдача', items: [I('Чертежи на стройку, выдача окончательного проекта заказчику', 'ГИП', 2, 'Акт приёма-передачи подписан')] },
    ],
  };
  const stageNames = track => (TEMPLATES[track] || []).map(s => s.name);

  // ---- права ----
  const LEADERS = ['owner', 'partner'];
  const PM_ROLES = ['owner', 'partner', 'accountant', 'secretary', 'pm', 'gip', 'lead'];
  const canOpen = u => !!u && PM_ROLES.includes(u.role);
  const isLeader = u => !!u && LEADERS.includes(u.role);
  const isManager = (u, p) => !!u && !!p && (isLeader(u) || p.gipId === u.id || p.pmId === u.id);
  const canCreate = u => !!u && (isLeader(u) || u.role === 'pm' || u.role === 'gip');
  const canEditItem = (u, p, it) => isManager(u, p) || (!!u && u.role === 'lead' && !!u.section && itemSection(it) === u.section) || (!!u && !!it && it.assigneeId === u.id);
  const canBudget = (u, p) => isLeader(u) || (!!u && !!u.seeBudget && !!p && (p.gipId === u.id || p.pmId === u.id));
  const itemSection = it => (it && (it.section || ROLE_SECTION[it.role])) || '';

  // ---- даты ----
  const iso = d => d.toISOString().slice(0, 10);
  const addDays = (a, n) => iso(new Date(new Date(a + 'T00:00:00Z').getTime() + Math.round(n) * 864e5));
  const today = () => new Date().toISOString().slice(0, 10);
  const days = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);

  // пункты проекта из шаблона
  function itemsFromTemplate(track, pid) {
    const out = []; let order = 0;
    (TEMPLATES[track] || []).forEach((s, si) => s.items.forEach(x => out.push({ pid, stage: si + 1, stageName: s.name, title: x.t, role: x.role, section: ROLE_SECTION[x.role] || '', weeks: x.w, crit: x.crit, optional: x.opt, done: false, na: false, due: '', assigneeId: '', note: '', order: order++ })));
    return out;
  }
  // план: этапы последовательно, пункты этапа параллельно; длительность этапа = самый длинный пункт.
  // fitTo — растянуть/сжать до даты по договору.
  function plan(items, start, fitTo) {
    const stages = [...new Set(items.map(i => i.stage))].sort((a, b) => a - b);
    const len = st => Math.max(0.2, ...items.filter(i => i.stage === st && !i.na).map(i => Number(i.weeks) || 1));
    const total = stages.reduce((s, st) => s + len(st), 0) * 7;
    const k = fitTo && start && fitTo > start ? days(start, fitTo) / total : 1;
    let cur = 0; const out = {};
    for (const st of stages) { for (const it of items.filter(i => i.stage === st)) out[it.id] = addDays(start, (cur + (Number(it.weeks) || 1) * 7) * k); cur += len(st) * 7; }
    return { due: out, end: addDays(start, total * k), weeks: Math.round(total * k / 7) };
  }
  function progress(items) {
    const act = items.filter(i => !i.na); const done = act.filter(i => i.done).length;
    const st = [...new Set(act.map(i => i.stage))].sort((a, b) => a - b);
    const cur = st.find(s => act.some(i => i.stage === s && !i.done));
    const curItem = act.find(i => i.stage === cur);
    return { total: act.length, done, pct: act.length ? Math.round(done / act.length * 100) : 0, stage: cur || (st.length ? st[st.length - 1] : 0), stageName: curItem ? curItem.stageName : (act.length ? 'Готово' : '—') };
  }
  // строка реестра
  function summary(p, items, blockers, t) {
    t = t || today(); const mine = items.filter(i => i.pid === p.id); const pr = progress(mine);
    const open = mine.filter(i => !i.done && !i.na);
    const overdue = open.filter(i => i.due && i.due < t);
    const bl = blockers.filter(b => b.pid === p.id && b.status !== 'closed');
    const next = open.filter(i => i.due).sort((a, b) => a.due.localeCompare(b.due))[0] || null;
    const deadline = p.forecast || p.due || '';
    return Object.assign({}, p, { progress: pr, overdueN: overdue.length, blockersN: bl.length, blockerMaxDays: bl.reduce((m, b) => Math.max(m, days(b.since || String(b.createdAt || '').slice(0, 10) || t, t)), 0), next, late: !!(p.due && p.due < t && p.status !== 'Готово'), hot: !!(deadline && deadline >= t && days(t, deadline) <= 14 && p.status !== 'Готово') });
  }
  function dashboard(projects, items, blockers, t) {
    t = t || today(); const rows = projects.map(p => summary(p, items, blockers, t)); const active = rows.filter(r => !['Готово', 'Отменён'].includes(r.status));
    const byTrack = {}; for (const tr of Object.keys(TRACKS)) { const l = active.filter(r => r.track === tr); byTrack[tr] = { n: l.length, funnel: stageNames(tr).map((name, i) => ({ name, n: l.filter(r => r.progress.stage === i + 1).length })) }; }
    const load = {}; for (const r of active) for (const k of ['gipId', 'pmId']) if (r[k]) { const x = load[r[k]] || (load[r[k]] = { ep: 0, rp: 0, overdue: 0 }); x[r.track]++; x.overdue += r.overdueN; }
    const byStatus = {}; for (const r of active) byStatus[r.status || 'В работе'] = (byStatus[r.status || 'В работе'] || 0) + 1;
    const openBl = blockers.filter(b => b.status !== 'closed');
    return { rows, active: active.length, byStatus, byTrack, late: active.filter(r => r.late).length, hot: active.filter(r => r.hot).length, overdueItems: active.reduce((s, r) => s + r.overdueN, 0), blockers: openBl.length, blockersOld: openBl.filter(b => days(b.since || String(b.createdAt || '').slice(0, 10) || t, t) > 14).length, load };
  }
  // бюджет: план по разделам из карточки, факт — расходы по проекту из операций
  function budgetCalc(b) {
    b = b || {}; const num = v => Number(v) || 0; const secs = (b.sections || []).map(s => ({ name: s.name, sum: num(s.sum), executor: s.executor || '' }));
    const contract = num(b.contract), cost = secs.reduce((s, x) => s + x.sum, 0), target = contract * (1 - (b.marginTarget == null ? 0.3 : num(b.marginTarget)));
    const gross = contract - cost, gip = contract * (b.gipShare == null ? 0 : num(b.gipShare)) || num(b.gipSum);
    return { contract, sections: secs, cost, target, over: target - cost, gross, grossPct: contract ? gross / contract : null, gip, net: gross - gip, netPct: contract ? (gross - gip) / contract : null };
  }

  return { TRACKS, STATUS, RISK, SECTIONS, ROLE_SECTION, ITEM_ROLES, HOLDERS, TEMPLATES, stageNames, PM_ROLES, canOpen, isLeader, isManager, canCreate, canEditItem, canBudget, itemSection, itemsFromTemplate, plan, progress, summary, dashboard, budgetCalc, addDays, days };
});
