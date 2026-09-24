/* Модуль «Аналитика» — панель директора. Поток H. Помощники интерфейса приходят в init(ui) (см. docs/ARCHITECTURE.md).
   Данные — один запрос /api/analytics/overview; графики — чистый SVG на переменных темы. Только чтение. */
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'analytics',
  title: 'Аналитика',
  nav: [{ id: 'analytics', label: 'Панель директора', icon: '◧' }],
  canOpen: u => !!window.MostAnalytics && window.MostAnalytics.canOpen(u),
  help: [
    ['Панель директора', `
<p>Одна страница о состоянии бюро: деньги, проекты, продажи, люди. Только чтение — всё вводится в своих разделах. Видят владелец и партнёр.</p>
<ul>
<li><b>Период</b> (месяц / квартал / год / 12 месяцев) меняет выручку и расходы (для месяца — по неделям) и продажи; остатки, дебиторка и прогноз всегда на сегодня.</li>
<li><b>Панель в PDF</b> — печатная версия для совещаний: светлая тема, A4 альбом, без меню, с датой и периодом. В окне печати выберите «Сохранить как PDF».</li>
<li><b>Было / стало</b> — раз в неделю сохраняется снимок сигналов; панель показывает, какие проблемы ушли, какие появились и какие остались с прошлой недели.</li>
<li><b>Сигналы недели</b> (сверху) — до 7 главных проблем: кассовый разрыв в прогнозе, дебиторка старше 30 дней, проекты в красной и чёрной зоне буфера, прошедшие сроки по договору, блокеры дольше 14 дней, перегруженные разделы, КП без ответа дольше 14 дней, ближайшие налоги. Щелчок — переход в раздел.</li>
<li><b>Деньги</b>: остаток на счетах (по опорным остаткам — счета без остатка не учтены, их число показано), дебиторка по возрасту, прогноз на 13 недель с поступлениями по графикам платежей «Коммерции», выручка и расходы по месяцам за год (без переводов), маржа проектов: договор без НДС − субподряд − ФОТ по табелям (если включён «Персонал»). Если к проекту не привязан ни один договор субподряда, маржа не считается: показана серая оценка «не больше», а над таблицей — сколько субподрядов ещё не привязано.</li>
<li><b>Проекты</b>: портфель по стадиям и статусам, буфер по Методу Пульса — точка проекта на графике «выполнено / съедено буфера» (зелёная, жёлтая, красная, чёрная зона), горящие проекты, блокеры, загрузка ГИП и ПМ. Карточки проектов открываются на сайте MOST ERP.</li>
<li><b>Продажи</b> (если включена «Коммерция»): воронка, КП в работе, конверсия, средняя ставка ₸/м² без НДС по типам объектов, КП без ответа.</li>
<li><b>Люди</b> (если включён «Персонал»): план загрузки разделов на 6 недель против ёмкости команд, фактические часы за 12 недель по разделам и проектам, себестоимость часа.</li>
</ul>`, 'analytics'],
  ],
  init(ui) {
    const AN = window.MostAnalytics; const { esc, api, fdate, head, tbl, empty, chip } = ui;
    if (!document.getElementById('an-style')) document.head.insertAdjacentHTML('beforeend', `<style id="an-style">
.an-sig{display:grid;gap:8px;margin-bottom:18px}.an-sig a{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel);text-decoration:none;color:inherit}.an-sig a:hover{border-color:var(--accent)}
.an-sig i{flex:none;width:9px;height:9px;border-radius:50%;margin-top:6px;background:var(--ink-faint)}.an-sig .crit i{background:var(--crit)}.an-sig .warn i{background:var(--warn)}.an-sig b{display:block;font-size:14px}.an-sig span{font-size:12.5px;color:var(--ink-soft)}
.an-h{display:flex;align-items:baseline;gap:10px;margin:22px 0 10px}.an-h h2{margin:0}.an-h .faint{font-size:12.5px}
.an-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:12px}.an-kpi a{text-decoration:none;color:inherit}.an-kpi .card{height:100%}.an-kpi .val{font-size:20px}.an-kpi .card:hover{border-color:var(--accent)}
.an-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-bottom:12px}@media(max-width:900px){.an-2{grid-template-columns:minmax(0,1fr)}}
.an-chart svg{width:100%;height:auto;display:block}.an-chart .label{margin-bottom:8px}
.an-leg{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--ink-soft);margin-top:6px}.an-leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.an-sc{width:0;min-width:100%}.an-sc .tbl{margin:0}
.an-bar{display:grid;grid-template-columns:120px 1fr 90px;gap:8px;align-items:center;font-size:12.5px;margin-bottom:6px}.an-bar .t{height:10px;background:var(--panel-2);border-radius:5px;overflow:hidden;position:relative}.an-bar .t i{position:absolute;left:0;top:0;bottom:0;background:var(--accent);border-radius:5px}.an-bar .t i.over{background:var(--crit)}
.an-zone{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:0}
.an-z-blue{background:#5b8def}.an-z-green{background:var(--ok)}.an-z-yellow{background:var(--warn)}.an-z-red{background:var(--crit)}.an-z-black{background:var(--ink)}
.an-muted{color:var(--ink-faint);font-size:12.5px}
.an-per{display:flex;gap:4px;flex-wrap:wrap;margin:-4px 0 14px}.an-per a{padding:5px 12px;border:1px solid var(--line);border-radius:999px;text-decoration:none;color:var(--ink-soft);font-size:13px}.an-per a.on{background:var(--accent);border-color:var(--accent);color:#fff}
.an-hist{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:18px}@media(max-width:900px){.an-hist{grid-template-columns:minmax(0,1fr)}}.an-hist .card{padding:10px 12px}.an-hist ul{margin:4px 0 0;padding-left:16px;font-size:12.5px}.an-hist .gone li{color:var(--ok);text-decoration:line-through}.an-hist .added li{color:var(--crit)}
.an-print{display:none}
@media print{
 :root{--paper:#fff;--panel:#fff;--panel-2:#f1f1f0;--ink:#000;--ink-soft:#555;--ink-faint:#888;--line:#d9d9d9;--accent:#ff4d23;--ok:#2f7d4f;--ok-bg:#e6f2ea;--warn:#9a6a12;--warn-bg:#f6ecd6;--crit:#c0341d;--crit-bg:#fbe3dd;--shadow:none}
 @page{size:A4 landscape;margin:10mm}
 html,body{background:#fff!important;color:#000}
 .side,.topbar,.modsw,#nav,.an-per,.an-noprint,.head .btn,.head a.btn,.an-h .btn,#toast{display:none!important}
 .shell{display:block!important}.main{padding:0!important;margin:0!important;max-width:none!important;width:auto!important}
 .an-print{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid var(--accent);padding-bottom:4px;margin-bottom:8px;font-size:11pt}
 .card,.an-sig a,.an-2>div,.an-kpi>*{break-inside:avoid;box-shadow:none}
 .an-h{break-after:avoid;margin-top:12px}.an-sc{width:auto;min-width:0}.tbl{overflow:visible!important}
 a{color:inherit;text-decoration:none}
 body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>`);
    const mln = AN.mln; const num = AN.num;
    const zoneDot = z => z ? `<span class="an-zone an-z-${esc(z)}" title="${esc(AN.ZONE_LABEL[z] || '')}"></span>` : '';
    let ERP = 3001;
    const href = l => !l ? '' : l.site === 'erp' && window.MOST_SITE !== 'erp' && window.MOST_SITE !== 'all' ? `${location.protocol}//${location.hostname}:${ERP}/${l.hash}` : l.hash;
    const ext = l => l && l.site === 'erp' && window.MOST_SITE === 'fin' ? ' target="_blank" rel="noopener"' : '';
    const pmp = id => ({ site: 'erp', hash: `#/pmp?id=${encodeURIComponent(id)}` });
    const tile = (label, val, foot, link, cls) => { const inner = `<div class="card"><div class="label">${esc(label)}</div><div class="val${cls ? ' ' + cls : ''}">${val}</div>${foot ? `<div class="foot">${foot}</div>` : ''}</div>`; return link ? `<a href="${href(link)}"${ext(link)}>${inner}</a>` : `<div>${inner}</div>`; };
    const sec = (title, sub, link) => `<div class="an-h"><h2>${esc(title)}</h2>${sub ? `<span class="faint">${sub}</span>` : ''}${link ? `<a class="btn sm" href="${href(link)}"${ext(link)} style="margin-left:auto">Подробнее →</a>` : ''}</div>`;
    const sc = html => `<div class="an-sc">${html}</div>`;
    const short = n => { n = num(n); const a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toFixed(1) + ' млрд' : a >= 1e6 ? Math.round(n / 1e6) + ' млн' : a >= 1e3 ? Math.round(n / 1e3) + ' тыс' : String(Math.round(n)); };
    const MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

    // ---- SVG: столбцы «выручка / расходы» по месяцам ----
    function barsSvg(months, unit) {
      const W = 640, H = 220, L = 46, B = 26, T = 10; const max = Math.max(1, ...months.flatMap(m => [m.income, m.expense]));
      const bw = (W - L - 10) / months.length; const y = v => T + (H - T - B) * (1 - v / max);
      const grid = [0, 0.25, 0.5, 0.75, 1].map(f => `<line x1="${L}" x2="${W - 4}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y(max * f) + 4}" text-anchor="end" font-size="10" fill="var(--ink-faint)">${short(max * f)}</text>`).join('');
      const bars = months.map((m, i) => { const x = L + i * bw + bw * 0.12, w = bw * 0.36; const [yy, mm] = (m.ym || m.from).split('-'); const lbl = unit === 'week' ? fdate(m.from).slice(0, 5) : MON[Number(mm) - 1]; const tip = unit === 'week' ? `${fdate(m.from)}–${fdate(m.to)}` : `${MON[Number(mm) - 1]} ${yy}`;
        return `<g><title>${tip}: выручка ${mln(m.income)}, расходы ${mln(m.expense)}</title><rect x="${x}" y="${y(m.income)}" width="${w}" height="${H - B - y(m.income)}" rx="2" fill="var(--accent)"/><rect x="${x + w + 2}" y="${y(m.expense)}" width="${w}" height="${H - B - y(m.expense)}" rx="2" fill="var(--ink-faint)" opacity=".75"/><text x="${x + w}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--ink-soft)">${lbl}</text></g>`; }).join('');
      return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Выручка и расходы по месяцам">${grid}${bars}</svg><div class="an-leg"><span><i style="background:var(--accent)"></i>выручка</span><span><i style="background:var(--ink-faint)"></i>расходы</span></div>`;
    }
    // ---- SVG: прогноз остатка по неделям ----
    function forecastSvg(f) {
      const ws = f.weeks; const W = 640, H = 220, L = 52, B = 26, T = 12; const vals = [f.start, ...ws.map(w => w.balance)];
      const max = Math.max(1, ...vals), min = Math.min(0, ...vals); const x = i => L + (W - L - 10) * i / Math.max(1, ws.length); const y = v => T + (H - T - B) * (max - v) / (max - min || 1);
      const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const zero = `<line x1="${L}" x2="${W - 6}" y1="${y(0)}" y2="${y(0)}" stroke="var(--crit)" stroke-dasharray="4 3" stroke-width="1"/>`;
      const grid = [max, (max + min) / 2, min].map(v => `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--ink-faint)">${short(v)}</text><line x1="${L}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/>`).join('');
      const dots = ws.map((w, i) => `<circle cx="${x(i + 1)}" cy="${y(w.balance)}" r="3.5" fill="${w.balance < 0 ? 'var(--crit)' : 'var(--accent)'}"><title>${fdate(w.from)}–${fdate(w.to)}: поступления ${mln(w.inflow)}, платежи ${mln(w.outflow)}, остаток ${mln(w.balance)}</title></circle>`).join('');
      const labels = ws.map((w, i) => i % 2 ? '' : `<text x="${x(i + 1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--ink-soft)">${fdate(w.from).slice(0, 5)}</text>`).join('');
      return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Прогноз остатка по неделям">${grid}${zero}<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"/>${dots}${labels}</svg><div class="an-leg"><span><i style="background:var(--accent)"></i>остаток на конец недели</span><span><i style="background:var(--crit)"></i>ниже нуля — разрыв</span></div>`;
    }
    // ---- SVG: буфер Пульса (выполнено по X, съедено буфера по Y, диагональные зоны) ----
    function pulseSvg(list) {
      const W = 420, H = 300, L = 40, B = 30, T = 10, R = 10; const yMax = 1.3, yMin = -0.3;
      const X = v => L + (W - L - R) * Math.min(1, Math.max(0, v)); const Y = v => T + (H - T - B) * (yMax - Math.min(yMax, Math.max(yMin, v))) / (yMax - yMin);
      const band = (f0, f1, col) => `<polygon points="${X(0)},${Y(f0(0))} ${X(1)},${Y(f0(1))} ${X(1)},${Y(f1(1))} ${X(0)},${Y(f1(0))}" fill="${col}" opacity=".16"/>`;
      const lo = x => 0.1 + 0.5 * x, hi = x => 0.4 + 0.6 * x;
      const zones = band(() => yMin, lo, 'var(--ok)') + band(lo, hi, 'var(--warn)') + band(hi, () => 1, 'var(--crit)') + band(() => 1, () => yMax, 'var(--ink)');
      const axes = `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line)"/><line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" stroke="var(--line)"/>` +
        [0, 0.5, 1].map(v => `<text x="${X(v)}" y="${H - 12}" text-anchor="middle" font-size="10" fill="var(--ink-soft)">${v * 100} %</text>`).join('') + [0, 0.5, 1].map(v => `<text x="${L - 5}" y="${Y(v) + 4}" text-anchor="end" font-size="10" fill="var(--ink-soft)">${v * 100}%</text>`).join('') +
        `<text x="${(L + W) / 2}" y="${H - 1}" text-anchor="middle" font-size="10" fill="var(--ink-faint)">выполнено объёма</text>`;
      const col = { blue: '#5b8def', green: 'var(--ok)', yellow: 'var(--warn)', red: 'var(--crit)', black: 'var(--ink)' };
      const dots = list.filter(p => p.zone).map(p => `<a href="${href(pmp(p.id))}"${ext(pmp(p.id))}><circle cx="${X(p.progress)}" cy="${Y(p.consumption)}" r="6" fill="${col[p.zone] || 'var(--accent)'}" stroke="var(--panel)" stroke-width="1.5"><title>${esc(p.name)}: выполнено ${Math.round(p.progress * 100)} %, буфер ${Math.round(p.consumption * 100)} % — ${esc(AN.ZONE_LABEL[p.zone] || '')}</title></circle></a>`).join('');
      return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Буферы проектов по Методу Пульса">${zones}${axes}${dots}</svg><div class="an-leg">${['green', 'yellow', 'red', 'black'].map(z => `<span>${zoneDot(z)}${esc(AN.ZONE_LABEL[z])}</span>`).join('')}</div>`;
    }
    const bar = (label, v, max, text, over) => `<div class="an-bar"><span>${esc(label)}</span><div class="t"><i class="${over ? 'over' : ''}" style="width:${Math.min(100, max ? v / max * 100 : 0)}%"></i></div><span class="num">${text}</span></div>`;

    ui.SECTIONS.analytics = async main => {
      main.innerHTML = head('Панель директора', 'Собираю данные…');
      const per = ui.params().get('period') || '12m';
      const d = await api('/analytics/overview?period=' + encodeURIComponent(per)); ERP = d.erpPort || ERP;
      const parts = [];
      // сигналы
      const h = d.history; const hl = xs => xs.length ? `<ul>${xs.slice(0, 8).map(x => `<li>${esc(x.title)}</li>`).join('')}${xs.length > 8 ? `<li>… ещё ${xs.length - 8}</li>` : ''}</ul>` : '<div class="an-muted">—</div>';
      const histHtml = h && h.diff ? `<div class="an-h"><h2>Было / стало</h2><span class="faint">неделя ${esc(h.week)} против ${esc(h.prevWeek)}</span></div><div class="an-hist"><div class="card gone"><div class="label">Ушли (${h.diff.gone.length})</div>${hl(h.diff.gone)}</div><div class="card added"><div class="label">Новые (${h.diff.added.length})</div>${hl(h.diff.added)}</div><div class="card"><div class="label">Остались (${h.diff.kept.length})</div>${hl(h.diff.kept)}</div></div>`
        : h ? `<p class="an-muted an-noprint" style="margin:-8px 0 16px">История сигналов ведётся с недели ${esc(h.week)}: сравнение «было / стало» появится на следующей неделе.</p>` : '';
      parts.push(d.signals.length ? `<div class="an-sig">${d.signals.map(s => `<a class="${esc(s.level)}" href="${href(s.link) || '#/analytics'}"${ext(s.link)}><i></i><div><b>${esc(s.title)}</b><span>${esc(s.text)}</span></div></a>`).join('')}</div>` : '<div class="notice">Главных проблем на этой неделе нет.</div>'); parts.push(histHtml);
      // деньги
      const m = d.money;
      if (m) {
        const b = m.balances, r = m.receivables, f = m.forecast;
        parts.push(sec('Деньги', `остатки по опорным остаткам${b.unknown ? ` · без остатка ${b.unknown} из ${b.accounts} счетов` : ''}`, { site: 'fin', hash: '#/dashboard' }) +
          `<div class="an-kpi">${tile('Остаток на счетах', mln(b.total), b.byCompany.filter(c => c.balance).map(c => `${esc(c.company)}: ${mln(c.balance)}`).join('<br>') || '—', { site: 'fin', hash: '#/dashboard' })}
${tile('Дебиторка', mln(r.total), `${r.n} актов · старше 30 дн. <b class="${r.over30 ? 'crit-text' : ''}">${mln(r.over30)}</b>`, { site: 'fin', hash: '#/receivables' })}
${tile('Минимум остатка за 13 недель', mln(f.min), f.gap ? `<span class="crit-text">разрыв с ${fdate(f.gap.from)}</span>` : 'разрыва нет', { site: 'fin', hash: '#/forecast' }, f.min < 0 ? 'crit-text' : '')}
${tile(`Выручка за ${m.period.label}`, mln(m.period.income), `расходы ${mln(m.period.expense)} · итог <b class="${m.period.net < 0 ? 'crit-text' : 'ok-text'}">${mln(m.period.net)}</b>`, { site: 'fin', hash: '#/reports' })}
${tile('Поступления / платежи 13 нед.', `${mln(f.inflow)}`, `платежи ${mln(f.outflow)}${f.fromSchedules ? ` · по графикам «Коммерции» ${mln(f.fromSchedules)}` : ''}`, { site: 'fin', hash: '#/forecast' })}</div>
<div class="an-2"><div class="card an-chart"><div class="label">Прогноз остатка на 13 недель</div>${forecastSvg(f)}</div><div class="card an-chart"><div class="label">Выручка и расходы: ${esc(m.period.label)}${m.period.unit === 'week' ? ' (по неделям)' : ''}</div>${barsSvg(m.series, m.period.unit)}</div></div>
<div class="an-2"><div class="card"><div class="label">Дебиторка по возрасту</div>${r.buckets.map(x => bar(x.label, x.sum, Math.max(...r.buckets.map(y => y.sum)), mln(x.sum), x.from > 90)).join('')}${r.topOver.length ? `<div class="label" style="margin-top:10px">Должники старше 30 дней</div>${r.topOver.slice(0, 6).map(x => `<div class="an-muted">${esc(x.client)} — <b>${mln(x.sum)}</b> · ${x.n} акт., до ${x.maxAge} дн.</div>`).join('')}` : ''}</div>
<div class="card"><div class="label">Налоги и бюджет на 30 дней</div>${m.taxes.length ? m.taxes.map(t => `<div class="an-muted"><b>${fdate(t.date)}</b> ${esc(t.title)}${t.note ? ` · ${esc(t.note)}` : ''}</div>`).join('') : '<div class="an-muted">нет</div>'}</div></div>` +
          `<div class="card" style="padding:0;margin-bottom:12px"><div class="label" style="padding:12px 14px 0">Маржа проектов: договор без НДС − субподряд${m.margin.withLabor ? ' − ФОТ по табелям' : ' (ФОТ не учтён: модуль «Персонал» выключен)'} · ${m.margin.projects} проектов, с привязанным субподрядом ${m.margin.withSubs}</div>` +
          (m.margin.unlinkedSubs && m.margin.unlinkedSubs.n ? `<div class="notice warn" style="margin:8px 14px">Не привязано к проектам: <b>${m.margin.unlinkedSubs.n} из ${m.margin.unlinkedSubs.total}</b> договоров субподряда на <b>${mln(m.margin.unlinkedSubs.sum)}</b> (${m.margin.unlinkedSubs.names} разных названий объекта). Пока субподряд не привязан, маржа проекта не считается — показана только оценка «не больше».</div>` : '') +
          (m.margin.rows.length ? sc(tbl([{ t: 'Проект' }, { t: 'Договор без НДС', cls: 'num' }, { t: 'Субподряд', cls: 'num' }, ...(m.margin.withLabor ? [{ t: 'ФОТ', cls: 'num' }] : []), { t: 'Маржа', cls: 'num' }, { t: '%', cls: 'num' }],
            m.margin.rows.map(x => `<tr><td><b>${esc(x.name)}</b>${x.client ? `<div class="faint">${esc(x.client)}</div>` : ''}${x.pm.map(p => ` <a class="faint" href="${href(pmp(p.id))}"${ext(pmp(p.id))}>↗ ${esc(p.name)}</a>`).join('')}</td><td class="num">${mln(x.contract)}</td><td class="num">${x.subsLinked ? mln(x.subs) : '<span class="an-muted">не привязан</span>'}</td>${m.margin.withLabor ? `<td class="num">${x.labor ? mln(x.labor) : '—'}</td>` : ''}${x.subsLinked ? `<td class="num">${mln(x.margin)}</td><td class="num ${x.pct < 30 ? 'crit-text' : x.pct < 50 ? 'warn-text' : ''}">${x.pct}</td>` : `<td class="num an-muted" title="Субподряд не привязан — маржа не больше этой суммы">≤ ${mln(x.upper)}</td><td class="num an-muted">—</td>`}</tr>`))) : empty('Нет проектов с суммой договора')) + '</div>');
      }
      // проекты
      const p = d.projects;
      if (p) {
        const z = p.zones || {};
        parts.push(sec('Проекты', `${p.active} активных · ${p.portfolio.map(x => `${esc(x.label)} ${x.total}`).join(' · ')}`, { site: 'erp', hash: '#/pm' }) +
          `<div class="an-kpi">${['black', 'red', 'yellow', 'green'].map(k => tile(`${AN.ZONE_LABEL[k].replace(/^./, c => c.toUpperCase())}`, `${zoneDot(k)}${z[k] || 0}`, '', { site: 'erp', hash: '#/pm' })).join('')}
${tile('Срок по договору прошёл', p.list.filter(x => x.late).length, `в ближайшие 14 дн.: ${p.list.filter(x => x.soon).length}`, { site: 'erp', hash: '#/pm' }, p.list.some(x => x.late) ? 'crit-text' : '')}
${tile('Просроченные пункты', p.overdueItems, `блокеров > 14 дн.: ${p.blockers.length}`, { site: 'erp', hash: '#/pmbl' })}</div>
<div class="an-2"><div class="card an-chart"><div class="label">Буферы по Методу Пульса — щелчок по точке открывает проект</div>${pulseSvg(p.list)}</div>
<div class="card"><div class="label">Портфель по статусам</div>${p.portfolio.map(x => `<div style="margin-bottom:8px"><b>${esc(x.label)}</b> <span class="an-muted">${x.total}</span><div class="an-muted">${Object.entries(x.byStatus).map(([s, n]) => `${esc(s)}: ${n}`).join(' · ')}</div></div>`).join('')}
${p.load.length ? `<div class="label" style="margin-top:12px">Загрузка ГИП и ПМ (активные проекты)</div>${p.load.slice(0, 8).map(x => bar(x.name, x.gip + x.pm, Math.max(...p.load.map(y => y.gip + y.pm)), `${x.gip + x.pm}${x.red ? ` · <span class="crit-text">${x.red} в красной</span>` : ''}`)).join('')}` : '<div class="an-muted" style="margin-top:12px">ГИП и ПМ в проектах не назначены — загрузку не посчитать.</div>'}</div></div>` +
          `<div class="card" style="padding:0;margin-bottom:12px"><div class="label" style="padding:12px 14px 0">Горящие проекты</div>` + (p.burning.length ? sc(tbl([{ t: 'Проект' }, { t: 'Зона' }, { t: 'Готово', cls: 'num' }, { t: 'Срок по договору' }, { t: 'Прогноз' }, { t: 'Просрочено', cls: 'num' }, { t: 'ГИП / ПМ' }],
            p.burning.map(x => `<tr><td><a href="${href(pmp(x.id))}"${ext(pmp(x.id))}><b>${esc(x.name)}</b></a><div class="faint">${esc(x.trackLabel)} · ${esc(x.stageName || '')}</div></td><td>${zoneDot(x.zone)}${x.zone ? Math.round(x.consumption * 100) + ' %' : '—'}</td><td class="num">${x.pct || 0} %</td><td class="${x.late ? 'crit-text' : x.soon ? 'warn-text' : ''}">${fdate(x.due) || '—'}</td><td class="${x.forecastLate ? 'crit-text' : ''}">${fdate(x.forecast) || '—'}</td><td class="num">${x.overdue || ''}</td><td>${esc([x.gip, x.pm].filter(Boolean).join(' / ') || '—')}</td></tr>`))) : empty('Горящих нет')) + '</div>' +
          (p.blockers.length ? `<div class="card" style="margin-bottom:12px"><div class="label">Блокеры дольше 14 дней</div>${p.blockers.slice(0, 10).map(b => `<div class="an-muted"><a href="${href({ site: 'erp', hash: `#/pmp?id=${encodeURIComponent(b.pid)}&tab=blockers` })}"${ext({ site: 'erp' })}><b>${esc(b.project)}</b></a>: ${esc(b.what)} — ${esc(b.holder || '—')}, <b>${b.days} дн.</b></div>`).join('')}</div>` : ''));
      } else parts.push(sec('Проекты') + '<div class="an-muted">Модуль «Проекты» выключен.</div>');
      // продажи
      const s = d.sales;
      if (s) {
        const fn = s.funnel; const maxN = Math.max(1, ...fn.byStatus.map(x => x.n));
        parts.push(sec('Продажи', `${esc(s.period.label)}: лидов ${fn.total}, договоров ${fn.won} на ${mln(fn.wonSum)} · с начала года: договоров ${s.year.won} на ${mln(s.year.wonSum)}`, { site: 'fin', hash: '#/crmleads' }) +
          `<div class="an-kpi">${tile('КП в работе', s.kp.n, mln(s.kp.sum) + ' без НДС', { site: 'fin', hash: '#/crmleads?st=open' })}${tile('Конверсия КП → договор', fn.conversion == null ? '—' : fn.conversion + ' %', `всех закрытых: ${fn.conversionAll == null ? '—' : fn.conversionAll + ' %'}`, { site: 'fin', hash: '#/crmleads' })}
${tile('В работе всего', fn.open, mln(fn.openSum) + ' без НДС', { site: 'fin', hash: '#/crmleads' })}${tile('КП без ответа > 14 дн.', s.noAnswer.length, s.noAnswer.length ? mln(s.noAnswer.reduce((a, x) => a + x.sum, 0)) : '—', { site: 'fin', hash: '#/crmleads' }, s.noAnswer.length ? 'warn-text' : '')}</div>
<div class="an-2"><div class="card"><div class="label">Воронка</div>${fn.byStatus.map(x => bar(x.status, x.n, maxN, `${x.n} · ${mln(x.sum)}`)).join('')}${fn.reasons.length ? `<div class="label" style="margin-top:10px">Причины отказов</div><div class="an-muted">${fn.reasons.map(x => `${esc(x.reason)}: ${x.n}`).join(' · ')}</div>` : ''}</div>
<div class="card"><div class="label">Средняя ставка без НДС, ₸/м²</div>${s.rates.length ? s.rates.map(x => `<div class="an-muted"><b>${esc(x.type)}</b>: КП ${x.kp.n ? Math.round(x.kp.rate).toLocaleString('ru-RU') : '—'} · договоры ${x.won.n ? Math.round(x.won.rate).toLocaleString('ru-RU') : '—'}</div>`).join('') : '<div class="an-muted">нет лидов с площадью и суммой</div>'}
${s.noAnswer.length ? `<div class="label" style="margin-top:10px">КП без ответа</div>${s.noAnswer.slice(0, 6).map(x => `<div class="an-muted"><a href="#/crmlead?id=${encodeURIComponent(x.id)}">${esc(x.client || x.object)}</a> — ${mln(x.sum)}, ${x.days} дн.</div>`).join('')}` : ''}</div></div>`);
      }
      // люди
      const pp = d.people;
      if (pp) {
        const f = pp.fact; const withCap = pp.sections.filter(x => x.capacity > 0);
        parts.push(sec('Люди', `${pp.employees} сотрудников · план на ${pp.weeks} нед.`, { site: 'erp', hash: '#/hrload' }) +
          `<div class="an-kpi">${tile('Часов за 12 недель', f ? Math.round(f.hours).toLocaleString('ru-RU') : '—', f ? `сданные и принятые табели` : 'табелей нет', { site: 'erp', hash: '#/hrreview' })}${tile('Себестоимость часа', f && f.perHour ? AN.money(f.perHour) : '—', f ? `ФОТ по табелям ${mln(f.cost)}` : '', { site: 'erp', hash: '#/hrcost' })}
${tile('Разделов перегружено', withCap.filter(x => x.load >= AN.LIMITS.overload).length, `из ${withCap.length} с командами`, { site: 'erp', hash: '#/hrload' })}</div>
<div class="an-2"><div class="card"><div class="label">План загрузки против ёмкости (6 недель)</div>${pp.sections.length ? pp.sections.map(x => x.capacity ? bar(x.section, x.plan, x.capacity, `${Math.round(x.load * 100)} %`, x.load >= AN.LIMITS.overload) : `<div class="an-bar"><span>${esc(x.section)}</span><span class="an-muted">нет команды в «Персонале»</span><span class="num">${x.plan} ч</span></div>`).join('') : '<div class="an-muted">нет плановых пунктов со сроками</div>'}</div>
<div class="card"><div class="label">Факт часов за 12 недель</div>${f && f.bySection.length ? f.bySection.slice(0, 8).map(x => bar(x.section, x.hours, f.bySection[0].hours, `${Math.round(x.hours)} ч`)).join('') + `<div class="label" style="margin-top:10px">По проектам</div>` + f.byProject.slice(0, 8).map(x => bar(x.name, x.hours, f.byProject[0].hours, `${x.hours} ч`)).join('') : '<div class="an-muted">табелей нет</div>'}</div></div>`);
      }
      const errs = Object.entries(d.errors || {});
      main.innerHTML = `<div class="an-print"><b>MOST · Панель директора</b><span>на ${fdate(d.today)} · период: ${esc(d.period.label)}</span></div>` + head('Панель директора', `на ${fdate(d.today)} · только чтение`, '<button class="btn" id="an-print" title="Печать или сохранение в PDF: светлая тема, A4 альбом">⎙ Панель в PDF</button><button class="btn" id="an-reload">Обновить</button>') +
        `<div class="an-per">${Object.entries(AN.PERIODS).map(([k, v]) => `<a href="#/analytics?period=${k}" class="${d.period.period === k ? 'on' : ''}">${esc(v)}</a>`).join('')}<span class="an-muted" style="align-self:center;margin-left:6px">период для выручки, расходов и продаж: ${esc(d.period.label)}</span></div>` + parts.join('') + (errs.length ? `<div class="notice warn">Не удалось посчитать: ${errs.map(([k, v]) => `${esc(k)} — ${esc(v)}`).join('; ')}</div>` : '');
      document.getElementById('an-reload').onclick = () => ui.route();
      document.getElementById('an-print').onclick = () => { const t = document.title; document.title = `MOST — панель директора ${d.today} (${d.period.label})`; window.print(); setTimeout(() => { document.title = t; }, 500); };
    };
  },
});
