/* Модуль «Аналитика» — чистая логика (Node: require, браузер: window.MostAnalytics). Поток H.
   Панель директора: права, пороги и сигналы недели по уже собранным блокам (деньги, проекты, продажи, люди). Без доступа к базе. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.MostAnalytics = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const canOpen = u => !!u && ['owner', 'partner'].includes(u.role);
  const num = v => Number(v) || 0;
  // пороги сигналов
  const LIMITS = { receivableDays: 30, blockerDays: 14, kpNoAnswerDays: 14, overload: 1.1, dueSoonDays: 14, maxSignals: 7 };
  const ZONE_LABEL = { blue: 'профицит', green: 'по плану', yellow: 'готовить план изменений', red: 'применять план изменений', black: 'пересогласовать срок или объём' };
  const ZONE_ORDER = ['black', 'red', 'yellow', 'green', 'blue'];
  const money = n => Math.round(num(n)).toLocaleString('ru-RU').replace(/\u00a0/g, ' ') + ' ₸';
  const mln = n => { n = num(n); return Math.abs(n) >= 1e6 ? (n / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн ₸' : money(n); };
  const fdate = d => { const p = String(d || '').slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}` : ''; };

  // сигналы недели: 5–7 главных проблем, самые тяжёлые сверху. d — ответ /api/analytics/overview (без signals)
  // link: { site: 'fin' | 'erp', hash } — интерфейс строит адрес (ERP — другой порт)
  function signals(d) {
    const out = []; const add = (level, weight, title, text, link) => out.push({ level, weight, title, text, link: link || null });
    const m = d.money || {};
    if (m.forecast && m.forecast.gap) { const g = m.forecast.gap; add('crit', 100, `Кассовый разрыв с ${fdate(g.from)}`, `Прогноз остатка ${mln(g.balance)} на неделе ${fdate(g.from)}–${fdate(g.to)}; минимум ${mln(m.forecast.min)}.`, { site: 'fin', hash: '#/forecast' }); }
    if (m.receivables) {
      const r = m.receivables; const over = num(r.over30);
      if (over > 0) add(r.over90 > 0 ? 'crit' : 'warn', 80 + Math.min(15, over / 1e7), `Дебиторка старше ${LIMITS.receivableDays} дней: ${mln(over)}`, (r.topOver || []).slice(0, 3).map(x => `${x.client} — ${mln(x.sum)} (${x.maxAge} дн.)`).join('; ') + (r.over90 ? `. Старше 90 дней: ${mln(r.over90)}.` : ''), { site: 'fin', hash: '#/receivables' });
    }
    const p = d.projects || {};
    for (const x of (p.list || []).filter(x => x.zone === 'black' || x.zone === 'red').slice(0, 3))
      add(x.zone === 'black' ? 'crit' : 'warn', x.zone === 'black' ? 90 : 75, `${x.name}: ${x.zone === 'black' ? 'буфер исчерпан' : 'красная зона'}`, `Буфер съеден на ${Math.round(num(x.consumption) * 100)} %, выполнено ${Math.round(num(x.progress) * 100)} %${x.due ? `, срок по договору ${fdate(x.due)}` : ''} — ${ZONE_LABEL[x.zone]}.`, { site: 'erp', hash: `#/pmp?id=${encodeURIComponent(x.id)}` });
    const late = (p.list || []).filter(x => x.late); if (late.length) add('crit', 85, `Срок по договору прошёл: ${late.length} ${plural(late.length, 'проект', 'проекта', 'проектов')}`, late.slice(0, 4).map(x => `${x.name} (${fdate(x.due)})`).join(', '), { site: 'erp', hash: '#/pm' });
    if ((p.blockers || []).length) add('warn', 60, `Блокеры дольше ${LIMITS.blockerDays} дней: ${p.blockers.length}`, p.blockers.slice(0, 3).map(b => `${b.project}: ${b.what} (${b.days} дн., ${b.holder || '—'})`).join('; '), { site: 'erp', hash: '#/pmbl' });
    const ppl = d.people;
    if (ppl && ppl.sections) for (const s of ppl.sections.filter(s => s.capacity > 0 && s.load >= LIMITS.overload).slice(0, 2))
      add(s.load >= 1.5 ? 'crit' : 'warn', 55 + Math.min(20, (s.load - 1) * 40), `Раздел ${s.section} перегружен: ${Math.round(s.load * 100)} %`, `План ${Math.round(s.plan)} ч против ёмкости ${Math.round(s.capacity)} ч на ${ppl.weeks} нед.${s.overdue ? `, долг по просроченным пунктам ${Math.round(s.overdue)} ч` : ''}.`, { site: 'erp', hash: '#/hrload' });
    const s = d.sales;
    if (s && s.noAnswer && s.noAnswer.length) add('warn', 50, `КП без ответа дольше ${LIMITS.kpNoAnswerDays} дней: ${s.noAnswer.length}`, s.noAnswer.slice(0, 3).map(x => `${x.client || x.object} — ${mln(x.sum)} (${x.days} дн.)`).join('; '), { site: 'fin', hash: '#/crmleads?st=КП отправлено' });
    if (m.taxes && m.taxes.length) { const t = m.taxes[0]; add('info', 20, `Налоги: ${fdate(t.date)} — ${t.title}`, m.taxes.slice(0, 3).map(x => `${fdate(x.date)} ${x.title}`).join('; '), { site: 'fin', hash: '#/taxes' }); }
    const rank = { crit: 2, warn: 1, info: 0 };
    return out.sort((a, b) => rank[b.level] - rank[a.level] || b.weight - a.weight).slice(0, LIMITS.maxSignals).map(({ weight, ...x }) => x);
  }
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };

  // ---- сопоставление свободного текста subcontracts.project с проектами финансов ----
  // Нормализация: регистр, ё→е, латиница → кириллица по звучанию (Hayat → хаят, Monte Rossa → монте росса), без кавычек и служебных слов.
  const LAT = [['sch', 'щ'], ['sh', 'ш'], ['ch', 'ч'], ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'], ['yu', 'ю'], ['ya', 'я'], ['yo', 'е'], ['ay', 'ай'], ['ey', 'ей'], ['oy', 'ой'], ['a', 'а'], ['b', 'б'], ['c', 'к'], ['d', 'д'], ['e', 'е'], ['f', 'ф'], ['g', 'г'], ['h', 'х'], ['i', 'и'], ['j', 'дж'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'], ['q', 'к'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['v', 'в'], ['w', 'в'], ['x', 'кс'], ['y', 'и'], ['z', 'з']];
  const toCyr = w => { let s = w, out = ''; while (s) { const p = LAT.find(([l]) => s.startsWith(l)); if (p) { out += p[1]; s = s.slice(p[0].length); } else { out += s[0]; s = s.slice(1); } } return out; };
  const STOP = new Set(['жк', 'рп', 'эп', 'бц', 'тоо', 'ип', 'ао', 'рд', 'псд', 'проект', 'проекта', 'очередь', 'очереди', 'оч', 'и', 'на', 'по', 'в', 'для', 'доп', 'работы', 'кп', 'ан', 'ер', 'рп', 'га']);
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'`“”„()\[\],.;:!?/\\|+&№#-]+/g, ' ').replace(/([а-яa-z])(\d)/g, '$1 $2').replace(/(\d)([а-яa-z])/g, '$1 $2').trim();
  const tokens = s => norm(s).split(/\s+/).filter(Boolean).map(w => /[a-z]/.test(w) ? toCyr(w) : w).filter(w => !STOP.has(w) && !(w.length === 1 && !/\d/.test(w)));
  // Левенштейн → сходство 0..1
  function sim(a, b) {
    if (a === b) return 1; if (!a || !b) return 0;
    const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return 1 - prev[n] / Math.max(m, n);
  }
  // слово к слову: точное, начало (≥ 4 букв — «алатауская» / «алатау»), опечатка (сходство ≥ 0,75); цифры — только точно
  const wordSim = (a, b) => { if (a === b) return 1; if (/\d/.test(a) || /\d/.test(b)) return 0; const s = Math.min(a.length, b.length); if (s >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.9; const r = sim(a, b); return r >= 0.75 ? r : 0; };
  // оценка пары «текст субподряда — проект»: покрытие слов с обеих сторон + склейка без пробелов (монтеросса / монте росса)
  function matchScore(text, cand) {
    const A = tokens(text), B = tokens(cand); if (!A.length || !B.length) return { score: 0, why: '' };
    const best = (xs, ys) => xs.map(x => Math.max(0, ...ys.map(y => wordSim(x, y))));
    const ab = best(A, B), ba = best(B, A); const cover = xs => xs.reduce((s, v) => s + v, 0) / xs.length;
    let score = 0.6 * cover(ab) + 0.4 * cover(ba); let why = ab.every(v => v === 1) ? 'все слова совпадают' : ab.some(v => v === 1) ? 'совпадают слова' : ab.some(v => v > 0) ? 'похожие слова' : '';
    const digits = xs => xs.filter(w => /\d/.test(w)).sort().join(' '); // «НОВА 23» и «НОВА 24» — разные объекты
    const glued = digits(A) === digits(B) ? sim(A.join(''), B.join('')) : 0; if (glued >= 0.8 && glued > score) { score = glued; why = 'одно и то же написание'; }
    return { score: Math.round(score * 100) / 100, why };
  }
  // кандидаты для одного текста: projects [{ id, name, status, contractNoVat }] → лучшие (активные с договором — выше при равной оценке)
  function suggestProjects(text, projects, limit) {
    const rows = [];
    for (const p of projects || []) {
      const a = matchScore(text, p.name), b = p.id !== p.name ? matchScore(text, p.id) : { score: 0 }; const m = a.score >= b.score ? a : b; if (m.score < 0.45) continue;
      const bonus = (p.status !== 'archive' ? 0.03 : 0) + (num(p.contractNoVat) ? 0.02 : 0);
      rows.push({ id: p.id, name: p.name || p.id, status: p.status || '', contractNoVat: num(p.contractNoVat), score: m.score, rank: m.score + bonus, why: m.why, by: a.score >= b.score ? 'name' : 'id' });
    }
    return rows.sort((x, y) => y.rank - x.rank).slice(0, limit || 3).map(({ rank, ...r }) => Object.assign(r, { level: r.score >= 0.85 ? 'high' : r.score >= 0.65 ? 'medium' : 'low' }));
  }

  return { canOpen, LIMITS, ZONE_LABEL, ZONE_ORDER, signals, money, mln, fdate, plural, num, tokens, sim, matchScore, suggestProjects };
});
