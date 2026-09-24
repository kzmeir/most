/* Модуль «Коммерция» — чистая логика (Node: require, браузер: window.MostCRM). Поток C.
   Воронка лидов, график платежей 30/30/30/10 с привязкой к этапам проекта pm, шаблоны документов, права. Без доступа к базе. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.MostCRM = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const num = v => { const n = Number(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (d, n) => { if (!d) return ''; const t = new Date(d + 'T00:00:00Z'); if (isNaN(t)) return ''; return new Date(t.getTime() + n * 864e5).toISOString().slice(0, 10); };
  const days = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);

  // ---- справочники ----
  const STATUSES = ['Новый', 'Расчёт', 'КП отправлено', 'Торг', 'Договор', 'Отказ'];
  const OPEN = s => !['Договор', 'Отказ'].includes(s);
  const KP_STAGE = ['КП отправлено', 'Торг', 'Договор']; // КП уже у заказчика
  // решение директора 24.09.2026: концепция — первый этап ЭП; старые лиды со стадией concept считаются ЭП
  const TRACKS = { ep: 'ЭП', rp: 'РП', an: 'АН' };
  const normTrack = t => t === 'concept' ? 'ep' : TRACKS[t] ? t : 'rp';
  const trackName = t => TRACKS[normTrack(t)];
  const SOURCES = ['Повторный заказчик', 'Рекомендация', 'Входящий звонок', 'Сайт / соцсети', 'Тендер', 'Прочее'];
  const OBJECT_TYPES = ['ЖК', 'Бизнес-центр / офисы', 'Коммерция / ТРЦ', 'Виллы / коттеджи', 'Социальный объект', 'Интерьер', 'Прочее'];
  const REASONS = ['Цена', 'Сроки', 'Выбрали другого', 'Проект заморожен', 'Нет ответа', 'Не наш профиль', 'Прочее'];
  const PAY_STATUS = ['Ожидается', 'Акт выставлен', 'Оплачен'];
  const COMPANIES = ['ТОО MOST Project', 'ТОО MOST Architects', 'ИП MOST Design', 'ИП PANA Design'];

  // ---- права: руководители — всё; секретарь — лиды и документы; ПМ — лиды своих объектов (чтение) ----
  const isLeader = u => !!u && ['owner', 'partner'].includes(u.role);
  const canOpen = u => !!u && (isLeader(u) || ['secretary', 'pm'].includes(u.role));
  const canEditLeads = u => !!u && (isLeader(u) || u.role === 'secretary');
  const canPayments = isLeader;
  const canDocs = u => !!u && (isLeader(u) || u.role === 'secretary');
  const canEditTemplates = isLeader;
  const canSign = isLeader; // «договор подписан» создаёт проект в pm и график платежей
  // свой объект ПМ: ответственный по лиду или ПМ/ГИП связанного проекта
  const ownLead = (u, lead, pmProjects) => { if (!u || !lead) return false; if (lead.respId === u.id) return true; const p = lead.pmProjectId && (pmProjects || []).find(x => x.id === lead.pmProjectId); return !!p && (p.pmId === u.id || p.gipId === u.id); };
  const canSeeLead = (u, lead, pmProjects) => canEditLeads(u) || (!!u && u.role === 'pm' && ownLead(u, lead, pmProjects));

  // ---- лид: сумма, ставка ₸/м² без НДС ----
  function leadCalc(l, vatRate) {
    const vat = vatRate == null ? 0.16 : num(vatRate) >= 1 ? num(vatRate) / 100 : num(vatRate);
    const area = num(l.area), rate = num(l.rate); const sum = num(l.sum) || Math.round(area * rate);
    const inc = l.vatIncluded === true || l.vatIncluded === 'true';
    const noVat = inc ? sum / (1 + vat) : sum; const withVat = inc ? sum : sum * (1 + vat);
    const rateNoVat = area ? noVat / area : (inc ? rate / (1 + vat) : rate);
    return { area, rate, sum, vatIncluded: inc, noVat: Math.round(noVat), withVat: Math.round(withVat), rateNoVat: Math.round(rateNoVat) };
  }

  // ---- воронка: по статусам, конверсия КП → договор, причины отказов, средняя ставка по типам объектов ----
  function funnel(leads, opts) {
    opts = opts || {}; const vat = opts.vatRate; const from = opts.from || '';
    const list = (leads || []).filter(l => !from || String(l.createdAt || '').slice(0, 10) >= from);
    const by = STATUSES.map(s => { const xs = list.filter(l => l.status === s); return { status: s, n: xs.length, sum: xs.reduce((a, l) => a + leadCalc(l, vat).noVat, 0) }; });
    const won = list.filter(l => l.status === 'Договор'), lost = list.filter(l => l.status === 'Отказ');
    const kpWon = won.length, kpLost = lost.filter(l => l.kpAt).length; // отказ до КП — не провал КП
    const reasons = REASONS.map(r => { const xs = lost.filter(l => (l.reason || 'Прочее') === r); return { reason: r, n: xs.length, sum: xs.reduce((a, l) => a + leadCalc(l, vat).noVat, 0) }; }).filter(x => x.n);
    const rates = OBJECT_TYPES.map(t => {
      const agg = xs => { const w = xs.filter(l => num(l.area) > 0 && leadCalc(l, vat).sum > 0); const area = w.reduce((a, l) => a + num(l.area), 0); return { n: w.length, area, rate: area ? Math.round(w.reduce((a, l) => a + leadCalc(l, vat).noVat, 0) / area) : 0 }; };
      const xs = list.filter(l => (l.objectType || 'Прочее') === t);
      return { type: t, kp: agg(xs.filter(l => l.kpAt || KP_STAGE.includes(l.status))), won: agg(xs.filter(l => l.status === 'Договор')) };
    }).filter(r => r.kp.n || r.won.n);
    const open = list.filter(l => OPEN(l.status));
    return { total: list.length, byStatus: by, won: won.length, lost: lost.length, open: open.length, openSum: open.reduce((a, l) => a + leadCalc(l, vat).noVat, 0), wonSum: won.reduce((a, l) => a + leadCalc(l, vat).noVat, 0),
      conversion: kpWon + kpLost ? Math.round(kpWon / (kpWon + kpLost) * 100) : null, conversionAll: won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) : null, reasons, rates };
  }
  // лид ждёт действия: следующий контакт наступил (или не назначен у нового лида старше 3 дней)
  const leadOverdue = (l, t) => OPEN(l.status) && (l.nextDate ? l.nextDate <= t : l.status === 'Новый' && String(l.createdAt || '').slice(0, 10) <= addDays(t, -3));

  // ---- статус КП ядра → статус лида ----
  const KP_STATUS = { 'У клиента': 'КП отправлено', 'Выполнено': 'Договор', 'Отказ': 'Отказ', 'В работе': 'Расчёт' };
  function leadFromProposal(p, kpCalc) {
    const c = p.kp && kpCalc ? kpCalc(p.kp) : null; const kp = p.kp || {};
    const track = kp.template && (TRACKS[kp.template] || kp.template === 'concept') ? normTrack(kp.template) : /(^|\W)рп(\W|$)|рабоч/i.test(p.title || '') ? 'rp' : /(^|\W)эп(\W|$)|эскиз/i.test(p.title || '') ? 'ep' : /концеп/i.test(p.title || '') ? 'ep' : 'rp';
    const status = KP_STATUS[p.status] || 'КП отправлено';
    return { client: p.client || kp.client || '', contact: p.contact || '', object: kp.object || String(p.title || '').replace(/\.(docx?|pdf)/gi, '').trim(), address: kp.address || '', track, source: 'Прочее',
      area: c ? c.area : 0, rate: c ? c.rate : 0, sum: num(p.sum) || (c ? c.total : 0), vatIncluded: c ? c.vatIncluded : false, status, proposalId: p.id, kpAt: KP_STAGE.includes(status) || status === 'Отказ' ? (kp.date || today()) : '' };
  }

  // ---- график платежей: шаблон 30/30/30/10, привязка к этапам проекта (stage — номер этапа pm; 0 — при подписании) ----
  const PAY_TEMPLATES = {
  // match — часть названия этапа pm: при создании графика номер этапа берётся по названию (шаблоны pm меняются), stage — запасной номер
    rp: [{ name: 'Аванс при подписании договора', share: 30, stage: 0 }, { name: 'Этап 2. Финальные планы', share: 30, stage: 4, match: 'Финальные планы' }, { name: 'Комплектация для экспертизы', share: 30, stage: 7, match: 'Комплектация' }, { name: 'Выдача на стройку', share: 10, stage: 9, match: 'Выдача' }],
    ep: [{ name: 'Аванс при подписании договора', share: 30, stage: 0 }, { name: 'Планы согласованы', share: 30, stage: 5, match: 'Планы' }, { name: 'ЭП согласован с заказчиком', share: 30, stage: 7, match: 'согласование ЭП' }, { name: 'Градсовет', share: 10, stage: 8, match: 'Градсовет' }],
    an: [{ name: 'Аванс при подписании договора', share: 30, stage: 0 }, { name: 'Платёж 2', share: 30, stage: '' }, { name: 'Платёж 3', share: 30, stage: '' }, { name: 'Окончательный расчёт', share: 10, stage: '' }],
  };
  // суммы по долям: последний платёж добирает округление
  // stageNames — названия этапов проекта pm (если проект уже есть): строка шаблона с match получает номер найденного этапа
  const stageByName = (names, match) => { if (!match || !names || !names.length) return -1; const m = String(match).toLowerCase(); const i = names.findIndex(n => String(n).toLowerCase().includes(m)); return i < 0 ? -1 : i + 1; };
  function schedule(total, tpl, stageNames) {
    total = Math.round(num(total)); const rows = (tpl || PAY_TEMPLATES.rp).map((r, i) => { const byName = stageByName(stageNames, r.match); return { n: i + 1, name: r.name, share: num(r.share), stage: byName > 0 ? byName : r.stage === '' || r.stage == null ? '' : num(r.stage), sum: Math.round(total * num(r.share) / 100) }; });
    const sh = rows.reduce((a, r) => a + r.share, 0); if (rows.length && sh === 100) rows[rows.length - 1].sum += total - rows.reduce((a, r) => a + r.sum, 0);
    return rows;
  }
  // этап проекта pm: плановое окончание (макс. срок пунктов), готов ли (все пункты сделаны / не требуются), дата готовности
  function stageState(items, stage) {
    const its = (items || []).filter(i => i.stage === stage && !i.na); if (!its.length) return null;
    const done = its.every(i => i.done); const plan = its.map(i => i.due || '').filter(Boolean).sort().pop() || '';
    const doneAt = done ? its.map(i => i.doneAt || '').filter(Boolean).sort().pop() || '' : '';
    return { stage, name: its[0].stageName || `Этап ${stage}`, done, plan, doneAt, total: its.length, left: its.filter(i => !i.done).length };
  }
  // платёж по графику: ожидаемая дата и признак «пора выставлять акт». term — дней на оплату после акта (settings.paymentTermDays)
  function paymentState(pay, ctx) {
    ctx = ctx || {}; const t = ctx.today || today(); const term = ctx.term == null ? 10 : num(ctx.term);
    const st = pay.stage === 0 || pay.stage === '' || pay.stage == null ? null : stageState(ctx.items, num(pay.stage));
    let expected = pay.due || '', basis = pay.due ? 'срок вручную' : '';
    if (!expected && pay.actDate) { expected = addDays(pay.actDate, term); basis = 'акт + ' + term + ' дн.'; }
    if (!expected && pay.stage === 0 && ctx.signDate) { expected = addDays(ctx.signDate, term); basis = 'подписание + ' + term + ' дн.'; }
    if (!expected && st) { const d = st.done ? (st.doneAt || t) : st.plan; if (d) { expected = addDays(d, term); basis = st.done ? 'этап сделан + ' + term + ' дн.' : 'план этапа + ' + term + ' дн.'; } }
    const status = PAY_STATUS.includes(pay.status) ? pay.status : 'Ожидается';
    const ready = status === 'Ожидается' && (pay.stage === 0 ? true : !!(st && st.done));
    const late = status !== 'Оплачен' && !!expected && expected < t;
    return { expected, basis, ready, late, stageInfo: st, status };
  }

  // ---- ожидаемые поступления для прогноза денег: неоплаченные платежи графика с датой в [from, to]; просроченные — на from (late) ----
  function expected(payments, resolve, from, to, opts) {
    opts = opts || {}; const out = [];
    for (const p of payments || []) {
      if (p.status === 'Оплачен' || !num(p.sum)) continue;
      const r = resolve(p) || {}; const s = paymentState(p, r); if (!s.expected) continue;
      let date = s.expected; const late = !!from && date < from; if (late) { if (opts.late === false) continue; date = from; }
      if (to && date > to) continue;
      out.push({ date, planned: s.expected, late, amount: num(p.sum), withVat: p.vatIncluded !== false, status: s.status, invoiced: s.status === 'Акт выставлен', label: `${r.client || ''} · ${p.name}`.replace(/^ · /, ''), client: r.client || '', object: r.object || '', paymentId: p.id, leadId: p.leadId || '', contractId: p.contractId || '', pmProjectId: p.pmProjectId || '', stage: p.stage, basis: s.basis });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  // ---- сумма прописью (тенге) ----
  function words(n) {
    n = Math.floor(Math.abs(num(n))); if (!n) return 'ноль';
    const u = [['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'], ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']];
    const teen = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
    const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
    const hund = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
    const groups = [[['', '', ''], 0], [['тысяча', 'тысячи', 'тысяч'], 1], [['миллион', 'миллиона', 'миллионов'], 0], [['миллиард', 'миллиарда', 'миллиардов'], 0]];
    const form = (x, f) => { const a = x % 100, b = x % 10; return a > 10 && a < 20 ? f[2] : b === 1 ? f[0] : b > 1 && b < 5 ? f[1] : f[2]; };
    const out = []; let g = 0;
    while (n > 0 && g < groups.length) { const x = n % 1000; if (x) { const w = [hund[Math.floor(x / 100)]]; const d = x % 100; if (d >= 10 && d < 20) w.push(teen[d - 10]); else { w.push(tens[Math.floor(d / 10)]); w.push(u[groups[g][1]][d % 10]); } w.push(form(x, groups[g][0])); out.unshift(w.filter(Boolean).join(' ')); } n = Math.floor(n / 1000); g++; }
    return out.join(' ');
  }
  const moneyStr = n => Math.round(num(n)).toLocaleString('ru-RU').replace(/ /g, ' ');
  const inWords = n => { const s = words(n); return s.charAt(0).toUpperCase() + s.slice(1) + ' тенге'; };
  const fdate = d => { const p = String(d || '').slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(d || ''); };

  // ---- шаблоны документов: текст с полями {{поле}}. Договор и ДС — печать; АВР и счёт — данные для бухгалтера (выписывает в 1С) ----
  const FIELDS = [
    ['заказчик', 'Заказчик'], ['бин', 'БИН/ИИН заказчика'], ['контакт', 'Контактное лицо'], ['объект', 'Объект'], ['адрес', 'Адрес объекта'], ['стадия', 'Стадия (ЭП/РП…)'],
    ['площадь', 'Площадь, м²'], ['ставка', 'Ставка, ₸/м²'], ['сумма', 'Сумма договора'], ['сумма_прописью', 'Сумма договора прописью'], ['ндс', 'НДС: «с НДС» / «без НДС»'],
    ['сумма_без_ндс', 'Сумма без НДС'], ['сумма_ндс', 'Сумма НДС'], ['компания', 'Наша компания'], ['номер_договора', '№ договора'], ['дата_договора', 'Дата договора'],
    ['дата', 'Сегодня'], ['график', 'График платежей (таблица)'], ['этап', 'Этап оплаты'], ['доля', 'Доля этапа, %'], ['сумма_этапа', 'Сумма этапа'], ['сумма_этапа_прописью', 'Сумма этапа прописью'],
    ['сумма_этапа_без_ндс', 'Сумма этапа без НДС'], ['ндс_этапа', 'НДС этапа'],
  ];
  const DEFAULT_TEMPLATES = [
    { id: 'tpl-contract', kind: 'print', title: 'Договор на проектирование', body: `<h2 style="text-align:center">ДОГОВОР № {{номер_договора}}<br>на выполнение проектных работ</h2>
<p style="display:flex;justify-content:space-between"><span>г. Алматы</span><span>{{дата_договора}}</span></p>
<p><b>{{заказчик}}</b>, именуемое в дальнейшем «Заказчик», с одной стороны, и <b>{{компания}}</b>, именуемое в дальнейшем «Исполнитель», с другой стороны, заключили настоящий договор о нижеследующем.</p>
<h3>1. Предмет договора</h3>
<p>1.1. Исполнитель выполняет проектные работы стадии «{{стадия}}» по объекту: {{объект}}, расположенному по адресу: {{адрес}}, общей площадью {{площадь}} м², а Заказчик принимает и оплачивает их.</p>
<h3>2. Стоимость работ и порядок оплаты</h3>
<p>2.1. Стоимость работ составляет <b>{{сумма}} ({{сумма_прописью}})</b> {{ндс}} из расчёта {{ставка}} ₸/м².</p>
<p>2.2. Оплата производится поэтапно в течение 10 (десяти) банковских дней с даты подписания договора (аванс) и актов выполненных работ по этапам:</p>
{{график}}
<h3>3. Сроки</h3>
<p>3.1. Сроки этапов исчисляются с даты поступления аванса и передачи Заказчиком исходных данных в полном объёме.</p>
<h3>4. Реквизиты и подписи сторон</h3>
<table style="width:100%"><tr><td style="width:50%;vertical-align:top"><b>Заказчик</b><br>{{заказчик}}<br>БИН {{бин}}<br><br>_______________</td><td style="vertical-align:top"><b>Исполнитель</b><br>{{компания}}<br><br><br>_______________</td></tr></table>` },
    { id: 'tpl-ds', kind: 'print', title: 'Дополнительное соглашение', body: `<h2 style="text-align:center">ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ № ___<br>к договору № {{номер_договора}} от {{дата_договора}}</h2>
<p style="display:flex;justify-content:space-between"><span>г. Алматы</span><span>{{дата}}</span></p>
<p><b>{{заказчик}}</b> («Заказчик») и <b>{{компания}}</b> («Исполнитель») договорились о следующем:</p>
<p>1. Изложить стоимость работ по объекту {{объект}} в размере <b>{{сумма}} ({{сумма_прописью}})</b> {{ндс}}.</p>
<p>2. Изложить график платежей в следующей редакции:</p>
{{график}}
<p>3. Остальные условия договора остаются без изменений.</p>
<table style="width:100%"><tr><td style="width:50%">Заказчик<br><br>_______________</td><td>Исполнитель<br><br>_______________</td></tr></table>` },
    { id: 'tpl-avr', kind: '1c', title: 'Данные для АВР (бухгалтеру в 1С)', body: `<h2>Данные для акта выполненных работ</h2>
<p class="muted">Официальный АВР выписывает бухгалтер в 1С. Здесь — что в него внести.</p>
<table class="kv"><tr><th>Исполнитель</th><td>{{компания}}</td></tr><tr><th>Заказчик</th><td>{{заказчик}}, БИН {{бин}}</td></tr><tr><th>Договор</th><td>№ {{номер_договора}} от {{дата_договора}}</td></tr>
<tr><th>Работы</th><td>Проектные работы, стадия «{{стадия}}», {{этап}} ({{доля}} %) по объекту: {{объект}}</td></tr>
<tr><th>Сумма</th><td><b>{{сумма_этапа}}</b> ({{сумма_этапа_прописью}}) {{ндс}}</td></tr><tr><th>Без НДС / НДС</th><td>{{сумма_этапа_без_ндс}} / {{ндс_этапа}}</td></tr></table>` },
    { id: 'tpl-invoice', kind: '1c', title: 'Данные для счёта на оплату (бухгалтеру в 1С)', body: `<h2>Данные для счёта на оплату</h2>
<p class="muted">Счёт выписывает бухгалтер в 1С. Здесь — что в него внести.</p>
<table class="kv"><tr><th>Поставщик</th><td>{{компания}}</td></tr><tr><th>Покупатель</th><td>{{заказчик}}, БИН {{бин}}</td></tr><tr><th>Основание</th><td>Договор № {{номер_договора}} от {{дата_договора}}</td></tr>
<tr><th>Назначение</th><td>Оплата: {{этап}} ({{доля}} %), проектные работы по объекту {{объект}}</td></tr>
<tr><th>К оплате</th><td><b>{{сумма_этапа}}</b> ({{сумма_этапа_прописью}}) {{ндс}}</td></tr><tr><th>Без НДС / НДС</th><td>{{сумма_этапа_без_ндс}} / {{ндс_этапа}}</td></tr></table>` },
  ];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // данные для подстановки: лид (договор) + график + выбранный платёж
  function docData(lead, pays, pay, vatRate) {
    const c = leadCalc(lead || {}, vatRate); const vat = vatRate == null ? 0.16 : num(vatRate) >= 1 ? num(vatRate) / 100 : num(vatRate);
    const pl = (pays || []).slice().sort((a, b) => num(a.n) - num(b.n));
    const table = pl.length ? `<table class="grid"><tr><th>№</th><th>Этап</th><th>Доля</th><th>Сумма, ₸</th></tr>${pl.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${num(p.share)} %</td><td style="text-align:right">${moneyStr(p.sum)}</td></tr>`).join('')}<tr><td></td><td><b>Итого</b></td><td>${pl.reduce((a, p) => a + num(p.share), 0)} %</td><td style="text-align:right"><b>${moneyStr(pl.reduce((a, p) => a + num(p.sum), 0))}</b></td></tr></table>` : '<p>—</p>';
    const ps = pay ? num(pay.sum) : 0; const psNo = c.vatIncluded ? ps / (1 + vat) : ps; const psVat = c.vatIncluded ? ps - psNo : 0;
    const vatStr = c.vatIncluded ? `с учётом НДС ${Math.round(vat * 100)} %` : 'без НДС';
    return { 'заказчик': lead.client || '', 'бин': lead.bin || '', 'контакт': lead.contact || '', 'объект': lead.object || '', 'адрес': lead.address || '', 'стадия': trackName(lead.track),
      'площадь': moneyStr(c.area), 'ставка': moneyStr(c.rate), 'сумма': moneyStr(c.sum), 'сумма_прописью': inWords(c.sum), 'ндс': vatStr,
      'сумма_без_ндс': moneyStr(c.noVat), 'сумма_ндс': moneyStr(c.vatIncluded ? c.sum - c.noVat : 0), 'компания': lead.company || '', 'номер_договора': lead.contractNo || '', 'дата_договора': fdate(lead.contractDate), 'дата': fdate(today()),
      'график': table, 'этап': pay ? pay.name : '', 'доля': pay ? num(pay.share) : '', 'сумма_этапа': moneyStr(ps), 'сумма_этапа_прописью': inWords(ps), 'сумма_этапа_без_ндс': moneyStr(psNo), 'ндс_этапа': moneyStr(psVat) };
  }
  // подстановка: значения экранируются, кроме готовой таблицы графика
  const fill = (body, data) => String(body || '').replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (m, k) => k in data ? (k === 'график' ? data[k] : esc(data[k])) : m);
  const DOC_CSS = 'body{font:14px/1.5 "Times New Roman",serif;max-width:800px;margin:30px auto;padding:0 20px;color:#000}h2{font-size:17px}h3{font-size:15px;margin:18px 0 6px}table.grid{border-collapse:collapse;width:100%;margin:8px 0}table.grid td,table.grid th{border:1px solid #000;padding:4px 6px;font-size:13px}table.kv{border-collapse:collapse}table.kv th{text-align:left;padding:4px 16px 4px 0;vertical-align:top;font-weight:600}table.kv td{padding:4px 0}.muted{color:#666}@media print{.noprint{display:none}}';
  const docPage = (title, html) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_CSS}</style></head><body><p class="noprint"><button onclick="print()">Печать / PDF</button></p>${html}</body></html>`;
  // строка для 1С (CSV с «;», UTF-8 с BOM): бухгалтер загружает или переносит вручную
  const CSV_1C = ['Вид', 'Дата', 'Организация', 'Контрагент', 'БИН', 'Договор', 'Дата договора', 'Содержание', 'Сумма', 'НДС', 'Сумма без НДС'];
  function csv1c(rows) {
    const q = v => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + [CSV_1C, ...rows.map(r => CSV_1C.map(k => r[k]))].map(r => r.map(q).join(';')).join('\r\n');
  }
  const row1c = (kind, d) => ({ 'Вид': kind, 'Дата': d['дата'], 'Организация': d['компания'], 'Контрагент': d['заказчик'], 'БИН': d['бин'], 'Договор': d['номер_договора'], 'Дата договора': d['дата_договора'], 'Содержание': `Проектные работы, ${d['стадия']}, ${d['этап']} (${d['доля']} %), ${d['объект']}`, 'Сумма': d['сумма_этапа'].replace(/\s/g, ''), 'НДС': d['ндс_этапа'].replace(/\s/g, ''), 'Сумма без НДС': d['сумма_этапа_без_ндс'].replace(/\s/g, '') });

  return { STATUSES, OPEN, KP_STAGE, TRACKS, normTrack, trackName, SOURCES, OBJECT_TYPES, REASONS, PAY_STATUS, COMPANIES, PAY_TEMPLATES, FIELDS, DEFAULT_TEMPLATES, KP_STATUS,
    isLeader, canOpen, canEditLeads, canPayments, canDocs, canEditTemplates, canSign, canSeeLead, ownLead,
    stageByName, leadCalc, funnel, leadOverdue, leadFromProposal, schedule, stageState, paymentState, expected, words, inWords, moneyStr, fdate, docData, fill, docPage, csv1c, row1c, num, today, addDays, days };
});
