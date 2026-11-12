/* Модуль «Telegram» (tg): чистая логика без сервера — типы уведомлений, время по Алматы, тихие часы, код привязки,
   тексты сообщений. UMD: в Node — module.exports, в браузере — window.MostTG. Финансового содержимого в сообщениях нет. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MostTG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TZ = 'Asia/Almaty';
  // типы уведомлений: [ключ, подпись, значок, кому по ролям (пусто — всем), включено по умолчанию]
  const TYPES = [
    ['assigned', 'Назначили исполнителем пункта', '📌', [], true],
    ['due', 'Срок пункта завтра / просрочен (утром)', '⏰', [], true],
    ['reviewed', 'Пункт вернули с замечанием / приняли', '↩', [], true],
    ['shift', 'Перенос срока: запрос и решение', '📅', [], true],
    ['remind', 'Напоминания руководителя', '🔔', [], true],
    ['blockers', 'Блокеры старше 14 дней (раз в неделю)', '⛔', ['owner', 'partner', 'pm', 'gip'], true],
    ['inbox', 'Новые обращения WhatsApp («Коммерция»)', '✉', ['owner', 'partner', 'secretary'], true],
    ['morning', 'Утренняя сводка директору (9:00)', '☀', ['owner'], true],
    ['daily', 'Ежедневный отчёт исполнителя (18:00 будни)', '✎', [], false],
    ['weekly', 'Итог недели (пятница 17:00)', '▦', ['owner', 'partner'], true],
  ];
  const TYPE_KEYS = TYPES.map(t => t[0]);
  const typeOf = k => TYPES.find(t => t[0] === k) || null;
  const typeLabel = k => (typeOf(k) || [k, k])[1];
  const typeIcon = k => (typeOf(k) || [k, k, ''])[2];
  const roleFits = (k, role) => { const t = typeOf(k); return !!t && (!t[3].length || t[3].includes(role)); };
  const DEFAULTS = { types: Object.fromEntries(TYPES.map(t => [t[0], t[4]])), erpUrl: 'http://192.168.50.51:3001', finUrl: 'http://192.168.50.51:3000' };
  const QUIET_FROM = 21, QUIET_TO = 8; // 21:00–8:00 по Алматы — ничего не шлём, всё ждёт утра
  const CODE_TTL_MIN = 15;

  // настройки модуля с умолчаниями
  function settingsOf(cfg) {
    cfg = cfg || {}; const types = Object.assign({}, DEFAULTS.types);
    for (const k of TYPE_KEYS) if (cfg.types && k in cfg.types) types[k] = !!cfg.types[k];
    return { types, erpUrl: cleanUrl(cfg.erpUrl) || DEFAULTS.erpUrl, finUrl: cleanUrl(cfg.finUrl) || DEFAULTS.finUrl };
  }
  function cleanUrl(v) { const s = String(v || '').trim().replace(/\/+$/, ''); return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s.slice(0, 200) : ''; }

  // ---- время по Алматы ----
  const FMT = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }) : null;
  const WD = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  // момент → { date: 'ГГГГ-ММ-ДД', hour, minute, dow: 1 (пн) … 7 (вс) } по Алматы
  function almaty(ms) {
    const p = Object.fromEntries(FMT.formatToParts(new Date(ms == null ? Date.now() : ms)).map(x => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute), dow: WD[p.weekday] || 0 };
  }
  const isQuiet = hour => hour >= QUIET_FROM || hour < QUIET_TO;
  const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  // ISO-неделя: '2026-W42'
  function isoWeek(d) {
    const x = new Date(d + 'T00:00:00Z'); const wd = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - wd);
    const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); const w = Math.ceil(((x - y0) / 864e5 + 1) / 7);
    return `${x.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
  }
  const weekStart = d => { const wd = new Date(d + 'T00:00:00Z').getUTCDay() || 7; return addDays(d, 1 - wd); };
  const fdate = d => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}` : ''; };

  // ---- токен и код ----
  const TOKEN_RE = /^\d{5,15}:[A-Za-z0-9_-]{30,64}$/;
  const maskToken = t => (t ? '…' + String(t).slice(-4) : '');
  const newCode = rnd => String(Math.floor((rnd != null ? rnd : Math.random()) * 1e6)).padStart(6, '0');

  // ---- тексты (HTML-разметка Telegram) ----
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const link = (url, label) => url ? `<a href="${esc(url)}">${esc(label || 'Открыть в ERP')}</a>` : '';
  const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
  const MAX_LEN = 3900; // лимит Telegram 4096
  const fit = s => (s.length > MAX_LEN ? s.slice(0, MAX_LEN - 20) + '\n…(сокращено)' : s);
  const itemLine = (it, pname) => `• ${esc(cut(it.title, 90))}${pname ? ` — <i>${esc(cut(pname, 50))}</i>` : ''}${it.due ? ` (срок ${fdate(it.due)})` : ''}`;

  // утренний список сроков исполнителю: rows = [{ item, project, url }]
  function dueDigest(tomorrow, overdue, listUrl) {
    const parts = [`${typeIcon('due')} <b>Сроки пунктов</b>`];
    if (overdue.length) parts.push(`Просрочено — ${overdue.length}:\n` + overdue.slice(0, 10).map(r => itemLine(r.item, r.project && r.project.name)).join('\n') + (overdue.length > 10 ? `\n…и ещё ${overdue.length - 10}` : ''));
    if (tomorrow.length) parts.push(`Срок завтра — ${tomorrow.length}:\n` + tomorrow.slice(0, 10).map(r => itemLine(r.item, r.project && r.project.name)).join('\n') + (tomorrow.length > 10 ? `\n…и ещё ${tomorrow.length - 10}` : ''));
    if (listUrl) parts.push(link(listUrl, 'Мои задачи в ERP'));
    return fit(parts.join('\n\n'));
  }
  // утренняя сводка директору: s = { overdue, overdueProjects, review, shifts, blockers, blockersOld, inboxNew, inboxTotal }
  function morning(s, urls) {
    const lines = [`${typeIcon('morning')} <b>Сводка на ${fdate(s.date)}</b>`,
      `Просрочено пунктов: <b>${s.overdue}</b>${s.overdue ? ` (в ${s.overdueProjects} ${plural(s.overdueProjects, 'проекте', 'проектах', 'проектах')})` : ''}`,
      `Ждут решения: на проверке <b>${s.review}</b>${s.shifts ? `, переносы срока <b>${s.shifts}</b>` : ''}`,
      `Блокеры: открыто <b>${s.blockers}</b>${s.blockersOld ? `, старше 14 дней <b>${s.blockersOld}</b>` : ''}`];
    if (s.inboxTotal != null) lines.push(`Обращения WhatsApp: новых за сутки <b>${s.inboxNew}</b>, не разобрано <b>${s.inboxTotal}</b>`);
    const l = [urls.ep && link(urls.ep, 'ЭП'), urls.rp && link(urls.rp, 'РП'), urls.inbox && s.inboxTotal ? link(urls.inbox, 'Обращения') : ''].filter(Boolean);
    if (l.length) lines.push(l.join(' · '));
    return fit(lines.join('\n'));
  }
  // итог недели: rows = [{ name, url, done, overdue, shifts, returns, silent: [имена] }]
  function weekly(week, rows, silentAll) {
    const out = [`${typeIcon('weekly')} <b>Итог недели ${esc(week.replace('-W', ', неделя '))}</b>`];
    if (!rows.length) out.push('Движения по проектам не было.');
    for (const r of rows) {
      const bits = [`сделано ${r.done}`, r.overdue ? `просрочено ${r.overdue}` : '', r.shifts ? `переносов ${r.shifts}` : '', r.returns ? `возвратов ${r.returns}` : ''].filter(Boolean).join(', ');
      out.push(`<b>${esc(cut(r.name, 60))}</b>: ${bits}${r.silent && r.silent.length ? `\nмолчат: ${esc(r.silent.join(', '))}` : ''}${r.url ? ' ' + link(r.url, '→') : ''}`);
    }
    if (silentAll && silentAll.length) out.push(`Без отметок за неделю: ${esc(silentAll.join(', '))}`);
    return fit(out.join('\n\n'));
  }
  // ежедневный отчёт: вопрос и кнопки по открытым пунктам (≤ 8)
  const REPORT_MAX = 8;
  const KS = { d: ['doing', 'В работе'], r: ['review', 'На проверку'], x: ['done', 'Готово'] };
  function reportAsk(rows) {
    const list = rows.slice(0, REPORT_MAX);
    const text = [`${typeIcon('daily')} <b>Что сделали сегодня?</b>`, 'Отметьте пункты кнопками и/или напишите ответ одним сообщением — он попадёт в журнал проекта.', '',
      ...list.map((r, i) => `${i + 1}. ${esc(cut(r.item.title, 80))} — <i>${esc(cut(r.project.name, 40))}</i>`)].join('\n');
    const keyboard = list.map((r, i) => Object.keys(KS).map(k => ({ text: `${i + 1} · ${KS[k][1]}`, callback_data: `ks:${r.item.id}:${k}` })));
    return { text: fit(text), keyboard };
  }
  // разбор callback_data: ks:<item>:<d|r|x> — колонка пункта; lg:<pid|all> — проект для текста отчёта; pf:<тип> — переключить уведомление
  function parseCallback(s) {
    const m = String(s || '').match(/^(ks|lg|pf):([\w-]{1,40})(?::([drx]))?$/); if (!m) return null;
    if (m[1] === 'ks') return m[3] ? { kind: 'ks', itemId: m[2], kstatus: KS[m[3]][0], label: KS[m[3]][1] } : null;
    if (m[1] === 'pf') return TYPE_KEYS.includes(m[2]) ? { kind: 'pf', type: m[2] } : null;
    return { kind: 'lg', pid: m[2] };
  }
  // команда из текста: /start 123456, /stop, /settings, /help (в том числе /start@bot)
  function parseCommand(text) {
    const m = String(text || '').trim().match(/^\/([a-z]+)(?:@\w+)?(?:\s+(.*))?$/i); if (!m) return null;
    return { cmd: m[1].toLowerCase(), arg: String(m[2] || '').trim() };
  }

  return { TZ, TYPES, TYPE_KEYS, typeOf, typeLabel, typeIcon, roleFits, DEFAULTS, settingsOf, cleanUrl, QUIET_FROM, QUIET_TO, CODE_TTL_MIN, almaty, isQuiet, addDays, isoWeek, weekStart, fdate,
    TOKEN_RE, maskToken, newCode, esc, link, cut, plural, fit, itemLine, dueDigest, morning, weekly, REPORT_MAX, KS, reportAsk, parseCallback, parseCommand };
});
