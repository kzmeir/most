/* Модуль «Коммерция» — экраны. Поток C. Помощники интерфейса приходят в init(ui) (см. docs/ARCHITECTURE.md).
   Логика — modules/crm/domain.js (window.MostCRM). Данные — только /api/crm/* (на сайте ERP финансовых API нет). */
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'crm',
  title: 'Коммерция',
  nav: [
    { id: 'crmleads', label: 'Лиды и воронка', icon: '◔' },
    { id: 'crmpay', label: 'График платежей', icon: '₸', can: u => !!window.MostCRM && window.MostCRM.canPayments(u) },
    { id: 'crmdocs', label: 'Документы', icon: '📝', can: u => !!window.MostCRM && window.MostCRM.canDocs(u) },
  ],
  routes: ['crmlead'], // карточка лида / сделки: #/crmlead?id=…
  canOpen: u => !!window.MostCRM && window.MostCRM.canOpen(u),
  help: [
    ['Как устроена коммерция', `
<p>Путь заказа: <b>лид</b> (обращение) → <b>расчёт</b> → <b>КП отправлено</b> → <b>торг</b> → <b>договор</b> или <b>отказ</b> с причиной. Подписанный договор сразу превращается в проект в модуле «Проекты» и получает <b>график платежей</b> 30/30/30/10, привязанный к этапам проекта.</p>
<ul>
<li><b>Руководители</b> видят и меняют всё: воронку, подписание договоров, графики платежей, шаблоны документов.</li>
<li><b>Секретарь</b> заводит и ведёт лиды, заполняет документы по шаблонам.</li>
<li><b>ПМ</b> видит лиды своих объектов (где он ответственный или ПМ/ГИП проекта) — только чтение.</li>
<li>Главная учётная система — <b>1С</b>: официальные АВР, счета и ЭСФ выписывает бухгалтер в 1С. Здесь — управленческий учёт: что и когда выставлять, и данные для бухгалтера.</li>
<li>Уведомлений нет: цифра у «Лиды и воронка» — лиды, по которым наступил срок следующего контакта; у «График платежей» — платежи, по которым пора выставлять акт, и просроченные.</li>
</ul>`],
    ['Лиды и воронка', `
<ol>
<li><b>+ Лид</b> — новое обращение: заказчик, объект, тип объекта, стадия (ЭП / РП / АН; концепция — первый этап ЭП), площадь и ставка ₸/м² (сумма посчитается сама), с НДС или без, источник, ответственный, дата и шаг следующего контакта.</li>
<li><b>Из реестра КП</b> — заводит лиды по КП из «Финансов», которые ещё не связаны с лидом (статус КП переносится: «У клиента» → «КП отправлено», «Отказ» → «Отказ»).</li>
<li>Вид <b>Канбан</b> — колонки по статусам; <b>Таблица</b> — все поля. Щелчок по лиду открывает карточку.</li>
<li>Внизу — <b>аналитика</b>: конверсия КП → договор (отказы до отправки КП не считаются), причины отказов, средняя ставка ₸/м² <b>без НДС</b> по типам объектов — по отправленным КП и по подписанным договорам. Период — «за всё время» или с начала года.</li>
</ol>`, 'crmleads'],
    ['Карточка лида и подписание договора', `
<ul>
<li>Кнопки статусов переводят лид по воронке; для <b>отказа</b> обязательна причина — из них строится аналитика.</li>
<li><b>Договор подписан</b> (руководитель): № и дата договора, компания, сумма, связь с договором из реестра «Финансов» (если он уже заведён). Затем — создать новый проект в «Проектах» (стадия берётся из лида, назначьте ПМ/ГИП и даты) или привязать существующий. Автоматически создаётся график платежей по шаблону стадии.</li>
<li><b>📄 КП (.docx)</b> — коммерческое предложение в Word по шаблону MOST: шапка компании, объект, база расчёта (площади и коэффициенты), стоимость со ставкой ₸/м², НДС — <b>как выбрано явно</b> (ставка с НДС или без), этапы и доли оплаты (ЭП — концепт-проект 20 % / ЭП 80 %, РП — 30/30/30/10), что не входит, состав работ, сроки, условия, подпись директора без печати — место «М.П.». «Пересчитать» показывает итог без сохранения; «Сохранить и скачать» присваивает номер (КП-26-015), пишет дату, площадь, ставку и сумму в лид и сохраняет редакцию — все редакции видны в карточке и скачиваются повторно.</li>
<li>После подписания в карточке виден график платежей и ссылка на проект. «Коммерция» работает на сайте «Финансы», а карточка проекта открывается в новой вкладке на сайте MOST ERP.</li>
</ul>`],
    ['График платежей', `
<ol>
<li>По каждой сделке — строки графика: этап оплаты, доля %, сумма, <b>привязка к этапу проекта</b>, ожидаемая дата и статус «Ожидается → Акт выставлен → Оплачен».</li>
<li><b>Ожидаемая дата</b>: срок, заданный вручную; иначе дата акта + срок оплаты; аванс — подписание + срок оплаты; иначе окончание этапа проекта (плановое или фактическое) + срок оплаты (по умолчанию 10 дней, «Настройки» в «Финансах»).</li>
<li>Когда все пункты этапа в проекте отмечены сделанными, у платежа появляется <b>«пора выставлять акт»</b>: передайте бухгалтеру данные (раздел «Документы» → «Данные для АВР»), после выставления в 1С нажмите «Акт выставлен», после поступления денег — «Оплачен».</li>
<li><b>Шаблоны графиков</b>: РП — аванс 30 %, финальные планы 30 %, комплектация для экспертизы 30 %, выдача 10 %; ЭП (включая концепцию как первый этап) — аванс 30 %, планы 30 %, ЭП согласован 30 %, градсовет 10 %. Этапы привязываются к этапам проекта по названию. «Изменить график» — свои доли и этапы (пока ничего не выставлено).</li>
<li><b>+ По договору из реестра</b> — завести график по уже подписанному договору из «Финансов» (на остаток к оплате).</li>
<li>Вверху — ожидаемые поступления по месяцам на полгода; эти же данные передаются в прогноз денег «Финансов».</li>
</ol>`, 'crmpay'],
    ['Документы', `
<ol>
<li><b>Договор</b> и <b>дополнительное соглашение</b> — заполняются данными сделки (заказчик, объект, сумма и сумма прописью, НДС, график платежей) и открываются для печати или сохранения в PDF.</li>
<li><b>Данные для АВР</b> и <b>для счёта</b> — не сам документ, а то, что бухгалтер вносит в 1С по выбранному этапу оплаты; кнопка «CSV для 1С» скачивает строку для загрузки или переноса.</li>
<li>Руководитель может изменить текст шаблона или создать свой. Поля пишутся в двойных фигурных скобках: <code>{{заказчик}}</code>, <code>{{сумма}}</code>, <code>{{сумма_прописью}}</code>, <code>{{график}}</code> — список полей показан в форме шаблона. «Сбросить» возвращает встроенный текст.</li>
</ol>`, 'crmdocs'],
  ],
  onNav() { if (this._badges) this._badges(); },
  init(ui) {
    const M = this; const CR = window.MostCRM;
    const { esc, api, fdate, today, toast, modal, closeModal, formHtml, tbl, empty, chip, sel, head, bind, params, route, money, qsOf, $ } = ui;
    if (!document.getElementById('crm-style')) document.head.insertAdjacentHTML('beforeend', `<style id="crm-style">
.crm-kpi .card .val{font-size:20px}.crm-kpi .card .foot{margin-top:6px}
.crm-boardw{overflow-x:auto;width:0;min-width:100%;margin-bottom:18px}.crm-sc{width:0;min-width:100%}.crm-board{display:grid;grid-template-columns:repeat(6,minmax(170px,1fr));gap:10px;padding-bottom:6px}
.crm-col{background:var(--panel-2);border-radius:var(--r);padding:8px;min-height:120px}.crm-col h3{margin:2px 4px 8px;font-size:13px;display:flex;justify-content:space-between;gap:6px}.crm-col h3 small{color:var(--ink-faint);font-weight:500}
.crm-card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-bottom:8px;cursor:pointer;font-size:12.5px}.crm-card:hover{border-color:var(--accent)}.crm-card b{display:block;font-size:13px;margin-bottom:2px}.crm-card .m{color:var(--ink-soft)}.crm-card.over{box-shadow:inset 3px 0 0 var(--crit)}
.crm-row{cursor:pointer}.crm-over{color:var(--crit);font-weight:600}
.crm-kv{display:grid;grid-template-columns:170px 1fr;gap:6px 14px;font-size:13.5px}.crm-kv b{color:var(--ink-soft);font-weight:500}@media(max-width:600px){.crm-kv{grid-template-columns:1fr}.crm-kv b{margin-bottom:-4px}}
.crm-hist{font-size:12.5px;color:var(--ink-soft);margin:0;padding-left:18px}.crm-hist li{margin-bottom:3px}
.crm-deal{padding:0;margin-bottom:14px}.crm-deal>.h{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--line)}.crm-deal>.h .grow{flex:1;min-width:200px}.crm-deal .tbl{border:0;box-shadow:none;border-radius:0 0 var(--r) var(--r)}
.crm-sched td input,.crm-sched td select{width:100%;min-width:60px}.crm-sched td{padding:4px}
.crm-bars .r{display:grid;grid-template-columns:130px 1fr 110px;gap:8px;align-items:center;font-size:13px;margin-bottom:6px}
.crm-kpv{font-size:12.5px;margin-bottom:4px}.crm-fields{font-size:12px;color:var(--ink-soft);columns:2;margin:6px 0 10px}.crm-fields code{font-size:11.5px}
</style>`);

    // ---- общие помощники ----
    let META = null;
    const meta = async force => { if (!META || force) META = await api('/crm/meta'); return META; };
    const people = () => ui.state.people || [];
    const pname = id => { const p = people().find(x => x.id === id); return p ? p.name : ''; };
    const userOpts = roles => [['', '—'], ...people().filter(p => !roles || roles.includes(p.role)).map(p => [p.id, p.name + (p.roleLabel ? ` · ${p.roleLabel}` : '')])];
    const mln = n => { n = Number(n) || 0; return Math.abs(n) >= 1e6 ? (n / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн' : new Intl.NumberFormat('ru-RU').format(Math.round(n)); };
    const ST_CHIP = { 'Новый': ['neutral', 'Новый'], 'Расчёт': ['accent', 'Расчёт'], 'КП отправлено': ['warn', 'КП отправлено'], 'Торг': ['warn', 'Торг'], 'Договор': ['ok', 'Договор'], 'Отказ': ['crit', 'Отказ'] };
    const PAY_CHIP = { 'Ожидается': ['neutral', 'Ожидается'], 'Акт выставлен': ['warn', 'Акт выставлен'], 'Оплачен': ['ok', 'Оплачен'] };
    const TRACK = t => CR.trackName(t); // старая стадия concept показывается как ЭП
    // «Коммерция» на сайте «Финансы», карточки проектов — на сайте MOST ERP (порт ERP отдаёт /api/crm/meta)
    const pmpHref = id => (window.MOST_SITE === 'fin' ? `${location.protocol}//${location.hostname}:${(META && META.erpPort) || 3001}/#/pmp?id=` : '#/pmp?id=') + encodeURIComponent(id);
    const pmpLink = (id, text) => `<a href="${pmpHref(id)}"${window.MOST_SITE === 'fin' ? ' target="_blank" rel="noopener" title="Откроется на сайте MOST ERP"' : ''}>${text}</a>`;
    const rerender = async () => { const y = window.scrollY; await route(); window.scrollTo(0, y); };
    let badgeAt = 0;
    const badges = async force => { if (!force && Date.now() - badgeAt < 60000) return; badgeAt = Date.now(); try { const b = await api('/crm/badges'); ui.setBadge('crmleads', b.crmleads); if ('crmpay' in b) ui.setBadge('crmpay', b.crmpay); } catch { /* нет доступа */ } };
    M._badges = () => badges(false);
    const leadLink = id => `#/crmlead?id=${encodeURIComponent(id)}`;
    const openHtml = html => { const w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), '_blank'); if (!w) toast('Разрешите всплывающие окна для печати'); };
    const download = (text, name, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };

    // ---- форма лида ----
    const leadFields = (m, l) => [
      { name: 'client', label: 'Заказчик', half: true }, { name: 'contact', label: 'Контактное лицо', half: true },
      { name: 'phone', label: 'Телефон / почта', half: true }, { name: 'bin', label: 'БИН/ИИН заказчика', half: true },
      { name: 'object', label: 'Объект', required: true },
      { name: 'address', label: 'Адрес / участок', half: true }, { name: 'objectType', label: 'Тип объекта', type: 'select', options: m.objectTypes, half: true },
      { name: 'track', label: 'Стадия', type: 'select', options: Object.entries(m.tracks), half: true }, { name: 'source', label: 'Источник', type: 'select', options: [...m.sources, ...(l && l.source && !m.sources.includes(l.source) ? [l.source] : [])], half: true },
      { name: 'area', label: 'Площадь, м²', type: 'number', step: 'any', half: true }, { name: 'rate', label: 'Ставка, ₸/м²', type: 'number', step: 'any', half: true },
      { name: 'sum', label: 'Сумма (пусто — площадь × ставка)', type: 'number', step: 'any', half: true }, { name: 'vatIncluded', label: 'НДС', type: 'select', options: [['false', 'Без НДС'], ['true', 'С НДС']], half: true },
      { name: 'respId', label: 'Ответственный', type: 'select', options: userOpts(['owner', 'partner', 'secretary', 'pm', 'gip']), half: true }, { name: 'proposalId', label: 'КП из реестра', type: 'select', options: [['', '—'], ...(m.proposals || []).filter(p => !p.used || (l && l.proposalId === p.id)).map(p => [p.id, `${p.no ? '№ ' + p.no + ' · ' : ''}${ui.cut(p.title, 50)} · ${p.client}`])], half: true },
      { name: 'nextDate', label: 'Следующий контакт', type: 'date', half: true }, { name: 'nextStep', label: 'Что сделать', half: true },
      { name: 'note', label: 'Заметка', type: 'textarea' },
    ];
    const leadVals = l => Object.assign({}, l, { vatIncluded: l.vatIncluded ? 'true' : 'false', sum: l.sum || '', area: l.area || '', rate: l.rate || '' });
    const editLead = async l => {
      const m = await meta(); const isNew = !l;
      modal(isNew ? 'Новый лид' : `Лид № ${l.no}`, formHtml(leadFields(m, l), isNew ? { respId: ui.state.user.id, track: 'rp', objectType: 'ЖК', vatIncluded: 'false', source: m.sources[0] } : leadVals(l)), async v => {
        const r = await api(isNew ? '/crm/leads' : '/crm/leads/' + l.id, { method: isNew ? 'POST' : 'PUT', body: v }); toast(isNew ? 'Лид заведён' : 'Сохранено'); badges(true);
        if (isNew) location.hash = leadLink(r.id); else rerender();
      });
    };
    const setStatus = async (l, st) => {
      const m = await meta();
      if (st === 'Отказ') return modal('Отказ', formHtml([{ name: 'reason', label: 'Причина', type: 'select', options: m.reasons }, { name: 'reasonNote', label: 'Подробности', type: 'textarea' }], { reason: l.reason || m.reasons[0] }, 'Отметить отказ'), async v => { await api('/crm/leads/' + l.id, { method: 'PUT', body: Object.assign(v, { status: 'Отказ' }) }); toast('Отказ отмечен'); badges(true); rerender(); });
      modal(`Статус: ${st}`, formHtml([{ name: 'statusNote', label: 'Комментарий (в историю)' }, { name: 'nextDate', label: 'Следующий контакт', type: 'date', half: true }, { name: 'nextStep', label: 'Что сделать', half: true }], { nextDate: l.nextDate, nextStep: l.nextStep }, 'Перевести'), async v => { await api('/crm/leads/' + l.id, { method: 'PUT', body: Object.assign(v, { status: st }) }); toast('Статус: ' + st); badges(true); rerender(); });
    };

    // ---- «Договор подписан» ----
    // ---- КП в Word по шаблону MOST ----
    const lines = t => String(t || '').split('\n').map(x => x.trim()).filter(Boolean);
    const cols = t => lines(t).map(x => x.split('|').map(y => y.trim()));
    const numv = v => Number(String(v == null ? '' : v).replace(/\s/g, '').replace('%', '').replace(',', '.')) || 0;
    const kpToForm = p => ({ company: p.company, object: p.object, client: p.client, address: p.address, subject: p.subject, stage: p.stage, rate: p.rate, vatIncluded: p.vatIncluded ? 'true' : 'false',
      areas: p.areas.map(a => `${a.name} | ${a.area} | ${a.k}`).join('\n'), stages: p.stages.map(x => [x.name, x.share, x.term].filter((v, i) => i < 2 || v).join(' | ')).join('\n'),
      terms: p.terms.map(x => `${x.name} | ${x.term}`).join('\n'), termsNote: p.termsNote, scope: p.scope.map(([t, it]) => ['# ' + t, ...it].join('\n')).join('\n'),
      excluded: p.excluded.map(([a, b]) => `${a} | ${b}`).join('\n'), conditions: p.conditions.join('\n') });
    const kpFromForm = v => { const scope = []; for (const x of lines(v.scope)) { if (x.startsWith('#')) scope.push([x.replace(/^#+\s*/, ''), []]); else { if (!scope.length) scope.push(['', []]); scope[scope.length - 1][1].push(x.replace(/^[—–-]\s*/, '')); } }
      return { company: v.company, object: v.object, client: v.client, address: v.address, subject: v.subject, stage: v.stage, rate: numv(v.rate), vatIncluded: v.vatIncluded === 'true' ? true : v.vatIncluded === 'false' ? false : null,
        areas: cols(v.areas).map(([name, area, k]) => ({ name, area: numv(area), k: numv(k) || 1 })), stages: cols(v.stages).map(([name, share, term]) => ({ name, share: numv(share), term: term || '' })),
        terms: cols(v.terms).map(([name, term]) => ({ name, term: term || '' })), termsNote: v.termsNote || '', scope, excluded: cols(v.excluded).map(([a, b]) => [a, b || '']), conditions: lines(v.conditions) }; };
    const kpHref = (l, v) => `/api/crm/leads/${encodeURIComponent(l.id)}/kp/${v}/docx`;
    const kpVersions = (l, vs) => vs && vs.length ? vs.slice().reverse().map(v => `<div class="crm-kpv"><a href="${kpHref(l, v.v)}" title="Скачать эту редакцию">⬇ ${esc(v.no)} ред. ${v.v}</a> · ${fdate(v.date)} · ${money(v.cost)} ${v.vatIncluded ? 'с НДС' : 'без НДС'} <span class="faint">(с НДС ${money(v.gross)}; ${mln(v.area)} м² × ${mln(v.rate)} ₸)</span></div>`).join('') : '<div class="faint">КП ещё не формировалось</div>';
    const kpCalcHtml = c => `<div class="card" style="margin:8px 0">${c.problems.length ? `<div class="crit-text" style="margin-bottom:6px">${esc(c.problems.join('; '))}</div>` : ''}<div class="kv"><span>Площадь</span><b>${mln(c.area)} м²</b><span>Стоимость ${esc(c.vatTag)}</span><b>${money(c.cost)}</b><span>Без НДС / НДС</span><b>${money(c.net)} / ${money(c.vat)}</b><span>Итого с НДС</span><b>${money(c.gross)}</b>${c.stages.map(x => `<span>${esc(x.name)} — ${x.share} %</span><b>${money(x.gross)} с НДС</b>`).join('')}</div></div>`;
    const kpDialog = async l => {
      const d = await api(`/crm/leads/${encodeURIComponent(l.id)}/kp`); const f = kpToForm(d.params); const hasKp = (d.versions || []).length > 0; // НДС в первый раз выбирается явно, дальше — как в прошлой редакции
      const ta = (name, label, rows, hint) => `<div class="field"><label>${esc(label)}${hint ? ` <span class="faint">${esc(hint)}</span>` : ''}</label><textarea name="${name}" rows="${rows}">${esc(f[name] || '')}</textarea></div>`;
      const inp = (name, label) => `<div class="field"><label>${esc(label)}</label><input name="${name}" value="${esc(f[name] == null ? '' : f[name])}"></div>`;
      modal(`КП в Word · ${l.client || l.object}${d.no ? ' · ' + d.no : ''}`, `<form>
<div class="form-row"><div class="field"><label>Компания-исполнитель</label>${sel('crm-kp-co', d.companies, f.company)}</div><div class="field"><label>НДС — как указано в ставке <b class="crit-text">*</b></label><select name="vatIncluded" required><option value="">— выберите явно —</option><option value="false"${hasKp && f.vatIncluded === 'false' ? ' selected' : ''}>Ставка без НДС (НДС сверху)</option><option value="true"${hasKp && f.vatIncluded === 'true' ? ' selected' : ''}>Ставка с НДС (НДС внутри)</option></select></div></div>
<div class="form-row">${inp('object', 'Объект')}${inp('rate', 'Ставка, ₸/м²')}</div><div class="form-row">${inp('client', 'Заказчик')}${inp('address', 'Адрес')}</div><div class="form-row">${inp('subject', 'Предмет (строка под заголовком)')}${inp('stage', 'Стадия')}</div>
${ta('areas', 'Площади', 3, 'название | м² | коэф.')}${ta('stages', 'Этапы и доли оплаты', 4, 'название | доля % | срок — сумма долей 100 %')}${ta('terms', 'Сроки (если отдельно от оплаты)', 3, 'этап | срок')}${ta('termsNote', 'Примечание к срокам', 2)}
${ta('scope', 'Состав работ', 8, '# группа, далее пункты — по строке')}${ta('excluded', 'Не входит в стоимость', 4, 'наименование | условие')}${ta('conditions', 'Условия', 3, 'по строке')}
<div id="crm-kp-calc">${kpCalcHtml(d.calc)}</div><div class="error"></div>
<div class="actions"><button type="button" class="btn" id="crm-kp-recalc">Пересчитать</button><button type="submit" class="btn primary">Сохранить и скачать КП (.docx)</button></div>
<div class="label" style="margin-top:12px">Редакции КП</div>${kpVersions(l, d.versions)}<p class="faint" style="margin-top:8px">Печать и подпись не вставляются — в документе место «М.П.». Номер КП присваивается при первом сохранении, каждое изменение — новая редакция.</p></form>`);
      $('#modal .modal-card').style.maxWidth = '900px';
      const form = $('#modal-body form'); const read = () => Object.assign(Object.fromEntries(new FormData(form).entries()), { company: $('#crm-kp-co').value });
      $('#crm-kp-recalc').onclick = async () => { try { const r = await api(`/crm/leads/${encodeURIComponent(l.id)}/kp/calc`, { method: 'POST', body: { params: kpFromForm(read()) } }); $('#crm-kp-calc').innerHTML = kpCalcHtml(r.calc); form.querySelector('.error').textContent = ''; } catch (e) { form.querySelector('.error').textContent = e.message; } };
      form.onsubmit = async e => { e.preventDefault(); const v = read(); if (!v.vatIncluded) { form.querySelector('.error').textContent = 'Укажите явно: ставка с НДС или без НДС'; return; }
        try { const r = await api(`/crm/leads/${encodeURIComponent(l.id)}/kp`, { method: 'POST', body: { params: kpFromForm(v) } }); const a = document.createElement('a'); a.href = kpHref(l, r.v); document.body.appendChild(a); a.click(); a.remove(); closeModal(); toast(r.reused ? `Без изменений — скачана редакция ${r.v}` : `${r.no} ред. ${r.v} сохранено`, 4000); rerender(); } catch (er) { form.querySelector('.error').textContent = er.message; } };
    };


    const signLead = async l => {
      const m = await meta(true); const lead = ['owner', 'partner', 'pm', 'gip'];
      const f = [
        { name: 'contractNo', label: '№ договора', required: true, half: true }, { name: 'contractDate', label: 'Дата договора', type: 'date', required: true, half: true },
        { name: 'company', label: 'Наша компания', type: 'select', options: m.companies, half: true }, { name: 'contractId', label: 'Договор в реестре «Финансов» (если уже заведён)', type: 'select', options: [['', '— нет —'], ...m.contracts.filter(c => !c.deal).map(c => [c.id, `${ui.cut(c.name, 40)} · ${c.client}${c.sum ? ' · ' + mln(c.sum) : ''}`])], half: true },
        { name: 'sum', label: 'Сумма договора, ₸', type: 'number', step: 'any', half: true }, { name: 'vatIncluded', label: 'НДС', type: 'select', options: [['false', 'Без НДС'], ['true', 'С НДС']], half: true },
        { name: 'track', label: 'Стадия (шаблон проекта и графика)', type: 'select', options: Object.entries(m.tracks), half: true }, { name: 'bin', label: 'БИН/ИИН заказчика', half: true },
        { name: 'mode', label: 'Проект в «Проектах»', type: 'select', options: [['new', 'Создать новый проект'], ['link', 'Привязать существующий'], ['none', 'Без проекта']], half: true }, { name: 'pmProjectId', label: 'Существующий проект', type: 'select', options: [['', '—'], ...(m.pmProjects || []).map(p => [p.id, `${TRACK(p.track)} · ${p.name}`])], half: true },
        { name: 'projectName', label: 'Название нового проекта', half: true }, { name: 'start', label: 'Старт проекта', type: 'date', half: true },
        { name: 'pmId', label: 'ПМ (концепция, ЭП)', type: 'select', options: userOpts(lead), half: true }, { name: 'gipId', label: 'ГИП (РП, АН)', type: 'select', options: userOpts(lead), half: true },
        { name: 'due', label: 'Срок по договору (разложить план под него)', type: 'date', half: true },
      ];
      const sch = (m.payTemplates[l.track] || m.payTemplates.rp).map(r => `${r.share} %`).join(' / ');
      modal('Договор подписан', `<p class="sub">Будет создан график платежей ${esc(sch)} (можно изменить потом в «Графике платежей»).</p>` + formHtml(f, { contractDate: l.contractDate || today(), contractNo: l.contractNo, company: l.company || m.companies[0], sum: l.calc.sum || '', vatIncluded: l.vatIncluded ? 'true' : 'false', track: l.track, bin: l.bin, projectName: l.object, start: today(), mode: 'new' }, 'Подписан — создать проект и график'), async v => {
        const body = Object.assign({}, v, { createProject: v.mode === 'new', pmProjectId: v.mode === 'link' ? v.pmProjectId : '' }); if (v.mode === 'link' && !v.pmProjectId) throw new Error('Выберите проект');
        const r = await api(`/crm/leads/${l.id}/sign`, { method: 'POST', body }); toast(r.pm ? 'Договор подписан, проект создан' : 'Договор подписан'); badges(true); rerender();
      });
    };

    // ---- редактор графика (строки: этап, доля, этап проекта, срок) ----
    const stageOpts = names => [['', 'без привязки'], ['0', '0 · при подписании'], ...names.map((n, i) => [String(i + 1), n])];
    const editSchedule = async (deal, names) => {
      const m = await meta(); const rows0 = deal.payments && deal.payments.length ? deal.payments : m.payTemplates[deal.track] || m.payTemplates.rp;
      const rowHtml = r => `<tr><td><input name="name" value="${esc(r.name)}" required></td><td style="width:80px"><input name="share" type="number" step="any" value="${esc(r.share)}"></td><td>${`<select name="stage">${stageOpts(names).map(([v, t]) => `<option value="${v}"${String(r.stage) === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`}</td><td style="width:140px"><input name="due" type="date" value="${esc(r.due || '')}"></td><td><button type="button" class="btn sm danger" data-x>✕</button></td></tr>`;
      modal('График платежей: ' + (deal.object || deal.client), `<form><div class="filters">${sel('crm-tpl', Object.keys(m.payTemplates).map(k => [k, 'Шаблон ' + TRACK(k)]), deal.track, 'Заменить по шаблону…')}<button type="button" class="btn sm" id="crm-add">+ строка</button></div>
<div class="tbl"><table class="crm-sched"><thead><tr><th>Этап оплаты</th><th>%</th><th>Этап проекта</th><th>Срок вручную</th><th></th></tr></thead><tbody id="crm-rows">${rows0.map(rowHtml).join('')}</tbody></table></div>
<p class="sub" id="crm-sum"></p><div class="error"></div><button class="btn primary block" type="submit">Сохранить график</button></form>`);
      $('#modal .modal-card').style.maxWidth = '820px';
      const form = $('#modal-body form'); const body = $('#crm-rows');
      const upd = () => { const s = [...body.querySelectorAll('[name=share]')].reduce((a, i) => a + (Number(i.value) || 0), 0); $('#crm-sum').innerHTML = `Сумма долей: <b class="${Math.abs(s - 100) > 0.01 ? 'crit-text' : 'ok-text'}">${s} %</b> · сумма договора ${money(deal.calc.sum)}`; };
      const wire = () => { body.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { b.closest('tr').remove(); upd(); }); body.querySelectorAll('[name=share]').forEach(i => i.oninput = upd); upd(); };
      wire(); $('#crm-add').onclick = () => { body.insertAdjacentHTML('beforeend', rowHtml({ name: 'Платёж', share: 0, stage: '' })); wire(); };
      $('#crm-tpl').onchange = e => { if (!e.target.value) return; body.innerHTML = m.payTemplates[e.target.value].map(rowHtml).join(''); wire(); };
      form.onsubmit = async e => { e.preventDefault(); const rows = [...body.querySelectorAll('tr')].map(tr => ({ name: tr.querySelector('[name=name]').value, share: Number(tr.querySelector('[name=share]').value) || 0, stage: tr.querySelector('[name=stage]').value, due: tr.querySelector('[name=due]').value }));
        try { await api(`/crm/leads/${deal.id}/schedule`, { method: 'POST', body: { rows } }); closeModal(); toast('График сохранён'); badges(true); rerender(); } catch (er) { form.querySelector('.error').textContent = er.message; } };
    };
    const editPayment = async (p, names) => {
      const m = await meta();
      modal('Платёж: ' + p.name, formHtml([{ name: 'name', label: 'Этап оплаты', required: true }, { name: 'share', label: 'Доля, %', type: 'number', step: 'any', half: true }, { name: 'sum', label: 'Сумма, ₸', type: 'number', step: 'any', half: true },
        { name: 'stage', label: 'Этап проекта', type: 'select', options: stageOpts(names), half: true }, { name: 'due', label: 'Срок вручную', type: 'date', half: true },
        { name: 'status', label: 'Статус', type: 'select', options: m.payStatus, half: true }, { name: 'actDate', label: 'Дата акта', type: 'date', half: true }, { name: 'paidDate', label: 'Дата оплаты', type: 'date', half: true }, { name: 'note', label: 'Заметка', half: true }],
      Object.assign({}, p, { stage: String(p.stage) })), async v => { await api('/crm/payments/' + p.id, { method: 'PUT', body: v }); toast('Сохранено'); badges(true); rerender(); });
    };
    // таблица графика одной сделки
    const payTable = (deal, names) => {
      const ps = deal.payments || []; if (!ps.length) return empty('Графика нет');
      const stName = s => s === '' || s == null ? '—' : Number(s) === 0 ? 'при подписании' : (names[Number(s) - 1] || `этап ${s}`);
      return '<div class="crm-sc">' + tbl([{ t: '№' }, { t: 'Этап оплаты' }, { t: '%', cls: 'num' }, { t: 'Сумма', cls: 'num' }, { t: 'Этап проекта' }, { t: 'Ожидается' }, { t: 'Статус' }, { t: '' }], ps.map(p => `<tr>
<td>${p.n}</td><td><b>${esc(p.name)}</b>${p.note ? `<div class="faint">${esc(p.note)}</div>` : ''}</td><td class="num">${p.share}</td><td class="num">${money(p.sum)}</td>
<td>${esc(stName(p.stage))}${p.stageInfo ? `<div class="faint">${p.stageInfo.done ? 'этап сделан' + (p.stageInfo.doneAt ? ' ' + fdate(p.stageInfo.doneAt) : '') : `осталось пунктов: ${p.stageInfo.left} из ${p.stageInfo.total}`}</div>` : ''}</td>
<td class="${p.late ? 'crm-over' : ''}">${p.expected ? fdate(p.expected) : '—'}<div class="faint">${esc(p.basis || '')}</div></td>
<td>${chip(p.status, PAY_CHIP)}${p.ready ? ' ' + chip('r', { r: ['accent', 'пора выставлять акт'] }) : ''}${p.actDate ? `<div class="faint">акт ${fdate(p.actDate)}</div>` : ''}${p.paidDate ? `<div class="faint">оплачен ${fdate(p.paidDate)}</div>` : ''}</td>
<td><div class="actions">${p.status === 'Ожидается' ? `<button class="btn sm" data-act="crmPaySt" data-id="${p.id}" data-st="Акт выставлен" title="Бухгалтер выставил акт в 1С">Акт</button>` : ''}${p.status !== 'Оплачен' ? `<button class="btn sm" data-act="crmPaySt" data-id="${p.id}" data-st="Оплачен">Оплачен</button>` : ''}<button class="btn sm" data-act="crmPayEdit" data-id="${p.id}" data-lead="${deal.id}">✎</button>${p.status !== 'Оплачен' ? `<button class="btn sm danger" data-act="crmPayDel" data-id="${p.id}">✕</button>` : ''}</div></td></tr>`),
      `<tr><td></td><td><b>Итого</b></td><td class="num">${ps.reduce((a, p) => a + Number(p.share || 0), 0)}</td><td class="num"><b>${money(ps.reduce((a, p) => a + Number(p.sum || 0), 0))}</b></td><td colspan="4" class="faint">оплачено ${money(ps.filter(p => p.status === 'Оплачен').reduce((a, p) => a + Number(p.sum || 0), 0))}</td></tr>`) + '</div>';
    };
    let DEALS = {}; // id сделки → { deal, names } для кнопок графика
    ui.ACT.crmPaySt = async ({ id, st }) => { await api('/crm/payments/' + id, { method: 'PUT', body: { status: st } }); toast(st); badges(true); rerender(); };
    ui.ACT.crmPayDel = async ({ id }) => { if (!confirm('Удалить строку графика?')) return; await api('/crm/payments/' + id, { method: 'DELETE' }); toast('Удалено'); rerender(); };
    ui.ACT.crmPayEdit = ({ id, lead }) => { const d = DEALS[lead]; const p = d && d.deal.payments.find(x => x.id === id); if (p) editPayment(p, d.names); };
    ui.ACT.crmSched = ({ id }) => { const d = DEALS[id]; if (d) editSchedule(d.deal, d.names); };
    ui.ACT.crmPayAdd = async ({ id }) => { const d = DEALS[id]; if (!d) return; modal('Новый платёж', formHtml([{ name: 'name', label: 'Этап оплаты', required: true }, { name: 'sum', label: 'Сумма, ₸', type: 'number', step: 'any', half: true }, { name: 'share', label: 'Доля, % (для справки)', type: 'number', step: 'any', half: true }, { name: 'stage', label: 'Этап проекта', type: 'select', options: stageOpts(d.names), half: true }, { name: 'due', label: 'Срок', type: 'date', half: true }], { name: 'Дополнительный платёж', stage: '' }), async v => { await api('/crm/payments', { method: 'POST', body: Object.assign(v, { leadId: id }) }); toast('Добавлено'); rerender(); }); };
    ui.ACT.crmLink = async ({ id }) => { const m = await meta(true); modal('Проект сделки', formHtml([{ name: 'pmProjectId', label: 'Проект в «Проектах»', type: 'select', options: [['', '— без проекта —'], ...(m.pmProjects || []).map(p => [p.id, `${TRACK(p.track)} · ${p.name}`])] }], { pmProjectId: (DEALS[id] && DEALS[id].deal.pmProjectId) || '' }), async v => { await api(`/crm/leads/${id}/project`, { method: 'PUT', body: v }); toast('Привязано'); rerender(); }); };

    // ---- раздел «Лиды и воронка» ----
    ui.SECTIONS.crmleads = async main => {
      const q = params(); const view = q.get('view') || 'board'; const period = q.get('period') || 'all';
      const from = period === 'year' ? today().slice(0, 4) + '-01-01' : '';
      const [m, rows, fn] = await Promise.all([meta(true), api('/crm/leads'), api('/crm/funnel' + (from ? '?from=' + from : ''))]);
      const f = { st: q.get('st') || '', type: q.get('type') || '', text: (q.get('text') || '').toLowerCase(), mine: q.get('mine') === '1' };
      const list = rows.filter(l => (!f.st || (f.st === 'open' ? CR.OPEN(l.status) : l.status === f.st)) && (!f.type || l.objectType === f.type) && (!f.mine || l.respId === ui.state.user.id) && (!f.text || `${l.client} ${l.object} ${l.contact} ${l.no}`.toLowerCase().includes(f.text)));
      const go = o => { location.hash = '#/crmleads?' + qsOf(Object.assign({ view, period, st: f.st, type: f.type, text: q.get('text') || '', mine: f.mine ? '1' : '' }, o)); };
      const btns = m.rights.editor ? `<button class="btn" data-act="crmImportKp" title="Завести лиды по КП из «Финансов», которые ещё не связаны">Из реестра КП</button><button class="btn primary" data-act="crmNewLead">+ Лид</button>` : '';
      const card = l => `<div class="crm-card${l.overdue ? ' over' : ''}" data-open="${esc(l.id)}"><b>${esc(l.client || '—')}</b><div>${esc(ui.cut(l.object, 60))}</div><div class="m">${esc(TRACK(l.track))} · ${esc(l.objectType || '')}</div><div class="m">${l.calc.sum ? mln(l.calc.sum) + (l.vatIncluded ? ' с НДС' : ' без НДС') : ''}${l.calc.rateNoVat ? ` · ${mln(l.calc.rateNoVat)} ₸/м²` : ''}</div>${l.nextDate && CR.OPEN(l.status) ? `<div class="${l.overdue ? 'crm-over' : 'm'}">↻ ${fdate(l.nextDate)} ${esc(ui.cut(l.nextStep || '', 30))}</div>` : ''}${l.status === 'Отказ' && l.reason ? `<div class="m">✕ ${esc(l.reason)}</div>` : ''}</div>`;
      const board = `<div class="crm-boardw"><div class="crm-board">${m.statuses.map(s => { const xs = list.filter(l => l.status === s); return `<div class="crm-col"><h3>${esc(s)} <small>${xs.length}${xs.length ? ' · ' + mln(xs.reduce((a, l) => a + l.calc.noVat, 0)) : ''}</small></h3>${xs.map(card).join('') || '<div class="faint" style="font-size:12px;padding:4px">—</div>'}</div>`; }).join('')}</div></div>`;
      const table = list.length ? '<div class="crm-sc">' + tbl([{ t: '№' }, { t: 'Заказчик / объект' }, { t: 'Стадия' }, { t: 'Тип' }, { t: 'Площадь', cls: 'num' }, { t: '₸/м² без НДС', cls: 'num' }, { t: 'Сумма', cls: 'num' }, { t: 'Статус' }, { t: 'Контакт' }, { t: 'Ответственный' }], list.map(l => `<tr class="crm-row" data-open="${esc(l.id)}"><td>${l.no}</td><td><b>${esc(l.client || '—')}</b><div class="faint">${esc(ui.cut(l.object, 70))}</div></td><td>${esc(TRACK(l.track))}</td><td>${esc(l.objectType || '')}</td><td class="num">${l.area ? mln(l.area) : '—'}</td><td class="num">${l.calc.rateNoVat ? mln(l.calc.rateNoVat) : '—'}</td><td class="num">${l.calc.sum ? mln(l.calc.sum) : '—'}<div class="faint">${l.calc.sum ? (l.vatIncluded ? 'с НДС' : 'без НДС') : ''}</div></td><td>${chip(l.status, ST_CHIP)}${l.reason ? `<div class="faint">${esc(l.reason)}</div>` : ''}</td><td class="${l.overdue ? 'crm-over' : ''}">${l.nextDate ? fdate(l.nextDate) : ''}<div class="faint">${esc(ui.cut(l.nextStep || '', 30))}</div></td><td>${esc(l.respName || pname(l.respId))}</td></tr>`)) + '</div>' : empty('Лидов нет');
      const pct = v => v == null ? '—' : v + ' %';
      const maxN = Math.max(1, ...fn.byStatus.map(x => x.n));
      const analytics = `<h2>Аналитика ${period === 'year' ? 'с начала года' : 'за всё время'}</h2><div class="grid g3">
<div class="card"><div class="label">Воронка по статусам</div><div class="crm-bars">${fn.byStatus.map(x => `<div class="r"><span>${esc(x.status)}</span><div class="bar"><i style="width:${Math.round(x.n / maxN * 100)}%"></i></div><span class="num">${x.n} · ${mln(x.sum)}</span></div>`).join('')}</div><div class="faint">суммы без НДС</div></div>
<div class="card"><div class="label">Причины отказов</div>${fn.reasons.length ? `<div class="kv">${fn.reasons.map(r => `<span>${esc(r.reason)}</span><b>${r.n} · ${mln(r.sum)}</b>`).join('')}</div>` : '<div class="faint">отказов нет</div>'}</div>
<div class="card"><div class="label">Средняя ставка без НДС, ₸/м²</div>${fn.rates.length ? `<div class="tbl-inner"><table style="width:100%;font-size:13px"><tr><th style="text-align:left">Тип</th><th class="num">КП</th><th class="num">Договоры</th></tr>${fn.rates.map(r => `<tr><td>${esc(r.type)}</td><td class="num">${r.kp.n ? mln(r.kp.rate) + ` <span class="faint">(${r.kp.n})</span>` : '—'}</td><td class="num">${r.won.n ? mln(r.won.rate) + ` <span class="faint">(${r.won.n})</span>` : '—'}</td></tr>`).join('')}</table></div>` : '<div class="faint">нет лидов с площадью и суммой</div>'}<div class="faint" style="margin-top:6px">взвешено по площади</div></div></div>`;
      main.innerHTML = head('Лиды и воронка', `${rows.length} лидов · в работе ${fn.open} на ${mln(fn.openSum)} ₸ без НДС`, btns) +
        `<div class="grid g4 crm-kpi" style="margin-bottom:14px">
<div class="card"><div class="label">В работе</div><div class="val">${fn.open}</div><div class="foot">${mln(fn.openSum)} ₸ без НДС</div></div>
<div class="card"><div class="label">Конверсия КП → договор</div><div class="val">${pct(fn.conversion)}</div><div class="foot">всех закрытых лидов: ${pct(fn.conversionAll)}</div></div>
<div class="card"><div class="label">Договоры</div><div class="val">${fn.won}</div><div class="foot">${mln(fn.wonSum)} ₸ без НДС</div></div>
<div class="card"><div class="label">Отказы</div><div class="val">${fn.lost}</div><div class="foot">${fn.reasons[0] ? 'чаще всего: ' + esc(fn.reasons.slice().sort((a, b) => b.n - a.n)[0].reason) : '—'}</div></div></div>` +
        `<div class="tabs"><a href="#/crmleads?${qsOf({ view: 'board', period })}" class="${view === 'board' ? 'active' : ''}">Канбан</a><a href="#/crmleads?${qsOf({ view: 'table', period })}" class="${view === 'table' ? 'active' : ''}">Таблица</a></div>` +
        `<div class="filters">${sel('crm-st', [['open', 'В работе'], ...m.statuses], f.st, 'Все статусы')}${sel('crm-type', m.objectTypes, f.type, 'Все типы')}${sel('crm-period', [['all', 'Аналитика: всё время'], ['year', 'Аналитика: с начала года']], period)}${sel('crm-mine', [['', 'Все ответственные'], ['1', 'Мои']], f.mine ? '1' : '')}<input id="crm-text" placeholder="Поиск: заказчик, объект, №" value="${esc(q.get('text') || '')}"></div>` +
        (view === 'table' ? table : board) + analytics;
      main.querySelectorAll('[data-open]').forEach(el => el.onclick = () => { location.hash = leadLink(el.dataset.open); });
      $('#crm-st').onchange = e => go({ st: e.target.value }); $('#crm-type').onchange = e => go({ type: e.target.value }); $('#crm-period').onchange = e => go({ period: e.target.value }); $('#crm-mine').onchange = e => go({ mine: e.target.value });
      $('#crm-text').onkeydown = e => { if (e.key === 'Enter') go({ text: e.target.value.trim() }); };
      ui.ACT.crmNewLead = () => editLead(null);
      ui.ACT.crmImportKp = async () => { const r = await api('/crm/import/proposals', { method: 'POST', body: {} }); toast(r.created ? `Заведено лидов: ${r.created}` : 'Новых КП нет'); rerender(); };
      bind(main); badges(true);
    };

    // ---- карточка лида ----
    ui.SECTIONS.crmlead = async main => {
      const id = params().get('id'); const [m, l] = await Promise.all([meta(), api('/crm/leads/' + encodeURIComponent(id))]);
      const names = l.stageNames || []; DEALS = { [l.id]: { deal: l, names } };
      const kv = (k, v) => v ? `<b>${esc(k)}</b><span>${v}</span>` : '';
      const next = m.statuses.filter(s => s !== l.status && s !== 'Договор');
      const btns = [l.canEdit ? `<button class="btn" data-act="crmEditLead">✎ Изменить</button>` : '', l.canEdit ? `<button class="btn" data-act="crmKp" title="Коммерческое предложение в Word по шаблону MOST">📄 КП (.docx)</button>` : '', m.rights.docs ? `<a class="btn" href="#/crmdocs?lead=${encodeURIComponent(l.id)}">📝 Документы</a>` : '', m.rights.sign && l.status !== 'Договор' ? `<button class="btn primary" data-act="crmSign">✓ Договор подписан</button>` : ''].join('');
      const stBtns = l.canEdit && (l.status !== 'Договор' || m.rights.leader) ? `<div class="actions" style="margin:0 0 14px;flex-wrap:wrap">${next.map(s => `<button class="btn sm${s === 'Отказ' ? ' danger' : ''}" data-act="crmSt" data-st="${esc(s)}">→ ${esc(s)}</button>`).join('')}</div>` : '';
      main.innerHTML = head(`${l.client || '—'} · ${l.object || ''}`, `Лид № ${l.no} · ${chip(l.status, ST_CHIP)} · ${esc(TRACK(l.track))} · <a href="#/crmleads">← к воронке</a>`, btns) + stBtns +
        `<div class="grid g2"><div class="card"><div class="crm-kv">
${kv('Заказчик', esc(l.client))}${kv('БИН/ИИН', esc(l.bin))}${kv('Контакт', esc([l.contact, l.phone].filter(Boolean).join(' · ')))}${kv('Объект', esc(l.object))}${kv('Адрес', esc(l.address))}
${kv('Тип объекта', esc(l.objectType))}${kv('Стадия', esc(TRACK(l.track)))}${kv('Площадь', l.area ? mln(l.area) + ' м²' : '')}${kv('Ставка', l.rate ? `${mln(l.rate)} ₸/м² ${l.vatIncluded ? 'с НДС' : 'без НДС'}` : '')}
${kv('Сумма', l.calc.sum ? `<b>${money(l.calc.sum)}</b> ${l.vatIncluded ? 'с НДС' : 'без НДС'}${l.vatIncluded || l.area ? ` <span class="faint">(без НДС ${money(l.calc.noVat)}${l.area ? `, ${mln(l.calc.rateNoVat)} ₸/м²` : ''})</span>` : ''}` : '')}
${kv('Источник', esc(l.source))}${kv('Ответственный', esc(l.respName || pname(l.respId)))}${kv('Следующий контакт', l.nextDate && CR.OPEN(l.status) ? `<span class="${l.overdue ? 'crm-over' : ''}">${fdate(l.nextDate)}</span> ${esc(l.nextStep || '')}` : '')}
${kv('Отказ', l.status === 'Отказ' ? esc([l.reason, l.reasonNote].filter(Boolean).join(': ')) : '')}${kv('КП', l.proposal ? `${esc(l.proposal.title)} · ${money(l.proposal.sum)} · ${esc(l.proposal.status)}` : '')}
${kv('Договор', l.contractNo || l.contract ? `№ ${esc(l.contractNo || '—')} от ${fdate(l.contractDate)} · ${esc(l.company || '')}${l.contract ? ` <span class="faint">(реестр: ${esc(l.contract.name)})</span>` : ''}` : '')}
${kv('Проект', l.pm ? `${pmpLink(l.pm.id, `${esc(TRACK(l.pm.track))} · ${esc(l.pm.name)}`)} · ${esc(l.pm.status)}` : '')}${kv('Заметка', esc(l.note))}
</div></div><div class="card"><div class="label">Коммерческое предложение${l.kpNo ? ' · ' + esc(l.kpNo) : ''}</div>${kpVersions(l, l.kpVersions)}<div class="label" style="margin-top:12px">История</div><ol class="crm-hist">${(l.history || []).slice().reverse().map(h => `<li>${fdate(h.at)} · <b>${esc(h.status)}</b>${h.note ? ' — ' + esc(h.note) : ''} <span class="faint">${esc(h.byName || '')}</span></li>`).join('') || '<li>—</li>'}</ol></div></div>` +
        (m.rights.payments && (l.status === 'Договор' || (l.payments || []).length) ? `<h2>График платежей</h2><div class="actions" style="margin-bottom:8px"><button class="btn sm" data-act="crmSched" data-id="${l.id}">Изменить график</button><button class="btn sm" data-act="crmPayAdd" data-id="${l.id}">+ платёж</button><button class="btn sm" data-act="crmLink" data-id="${l.id}">Проект…</button>${m.rights.leader ? '<button class="btn sm danger" data-act="crmDelLead">Удалить лид</button>' : ''}</div>` + payTable(l, names) : (m.rights.leader ? `<div class="actions" style="margin-top:14px"><button class="btn sm danger" data-act="crmDelLead">Удалить лид</button></div>` : ''));
      ui.ACT.crmKp = () => kpDialog(l); ui.ACT.crmEditLead = () => editLead(l); ui.ACT.crmSt = ({ st }) => setStatus(l, st); ui.ACT.crmSign = () => signLead(l);
      ui.ACT.crmDelLead = async () => { if (!confirm('Удалить лид вместе с графиком платежей?')) return; await api('/crm/leads/' + l.id, { method: 'DELETE' }); toast('Удалено'); location.hash = '#/crmleads'; };
      bind(main);
    };

    // ---- раздел «График платежей» ----
    ui.SECTIONS.crmpay = async main => {
      const q = params(); const fs = q.get('st') || 'open';
      const [m, d] = await Promise.all([meta(true), api('/crm/payments')]);
      DEALS = Object.fromEntries(d.deals.map(x => [x.id, { deal: x, names: x.stageNames || [] }]));
      const all = d.deals.flatMap(x => x.payments.map(p => Object.assign({ deal: x }, p)));
      const ready = all.filter(p => p.ready), late = all.filter(p => p.late);
      const months = {}; for (const e of d.expected) { const k = e.date.slice(0, 7); months[k] = (months[k] || 0) + e.amount; }
      const mk = Object.keys(months).sort(); const maxM = Math.max(1, ...Object.values(months));
      const deals = d.deals.filter(x => fs === 'all' || (fs === 'open' ? x.payments.some(p => p.status !== 'Оплачен') || !x.payments.length : fs === 'ready' ? x.payments.some(p => p.ready || p.late) : !x.payments.some(p => p.status !== 'Оплачен') && x.payments.length));
      main.innerHTML = head('График платежей', `${d.deals.length} сделок · ожидается ${money(all.filter(p => p.status !== 'Оплачен').reduce((a, p) => a + Number(p.sum || 0), 0))} · срок оплаты после акта ${d.term} дн.`, `<button class="btn" data-act="crmFromContract">+ По договору из реестра</button>`) +
        `<div class="grid g3 crm-kpi" style="margin-bottom:14px">
<div class="card"><div class="label">Пора выставлять акт</div><div class="val">${ready.length}</div><div class="foot">${money(ready.reduce((a, p) => a + Number(p.sum || 0), 0))}</div></div>
<div class="card"><div class="label">Просрочены</div><div class="val ${late.length ? 'crit-text' : ''}">${late.length}</div><div class="foot">${money(late.reduce((a, p) => a + Number(p.sum || 0), 0))}</div></div>
<div class="card"><div class="label">Ожидается за 6 месяцев</div><div class="val">${mln(d.expected.reduce((a, e) => a + e.amount, 0))}</div><div class="foot">по графикам, включая просроченные</div></div></div>` +
        (mk.length ? `<div class="card" style="margin-bottom:14px"><div class="label">Ожидаемые поступления по месяцам</div><div class="crm-bars">${mk.map(k => `<div class="r"><span>${esc(ui.mname ? ui.mname(k) : k)}</span><div class="bar"><i style="width:${Math.round(months[k] / maxM * 100)}%"></i></div><span class="num">${mln(months[k])}</span></div>`).join('')}</div></div>` : '') +
        `<div class="filters">${sel('crm-pst', [['open', 'С неоплаченными'], ['ready', 'Пора выставлять / просрочено'], ['paid', 'Оплачены полностью'], ['all', 'Все']], fs)}</div>` +
        (deals.length ? deals.map(x => `<div class="card crm-deal"><div class="h"><div class="grow"><a href="${leadLink(x.id)}"><b>${esc(x.client || '—')}</b> · ${esc(x.object || '')}</a><div class="faint">${esc(TRACK(x.track))} · договор № ${esc(x.contractNo || '—')} от ${fdate(x.contractDate)} · ${money(x.calc.sum)} ${x.vatIncluded ? 'с НДС' : 'без НДС'}${x.pm ? ` · проект: ${pmpLink(x.pm.id, esc(x.pm.name))}` : ' · <span class="warn-text">без проекта — этапы не отслеживаются</span>'}</div></div>
<div class="actions"><button class="btn sm" data-act="crmSched" data-id="${x.id}">Изменить график</button><button class="btn sm" data-act="crmPayAdd" data-id="${x.id}">+ платёж</button><button class="btn sm" data-act="crmLink" data-id="${x.id}">Проект…</button></div></div>${payTable(x, x.stageNames || [])}</div>`).join('') : empty('Сделок нет — отметьте «Договор подписан» в карточке лида или заведите график по договору из реестра'));
      $('#crm-pst').onchange = e => { location.hash = '#/crmpay?' + qsOf({ st: e.target.value }); };
      ui.ACT.crmFromContract = () => modal('График по договору из реестра', formHtml([
        { name: 'contractId', label: 'Договор («Финансы» → Договоры)', type: 'select', required: true, options: [['', '—'], ...m.contracts.filter(c => !c.deal).map(c => [c.id, `${ui.cut(c.name, 50)} · ${c.client}${c.sum ? ' · ' + mln(c.sum) : ''}`])] },
        { name: 'track', label: 'Стадия (шаблон графика)', type: 'select', options: Object.entries(m.tracks), half: true }, { name: 'sum', label: 'Сумма графика (пусто — остаток по договору)', type: 'number', step: 'any', half: true },
        { name: 'pmProjectId', label: 'Проект в «Проектах»', type: 'select', options: [['', '—'], ...(m.pmProjects || []).map(p => [p.id, `${TRACK(p.track)} · ${p.name}`])] }], { track: 'rp' }, 'Завести график'),
      async v => { const r = await api('/crm/import/contract', { method: 'POST', body: v }); toast('График заведён'); location.hash = leadLink(r.id); });
      bind(main); badges(true);
    };

    // ---- раздел «Документы» ----
    ui.SECTIONS.crmdocs = async main => {
      const q = params(); const [m, tpls, leads] = await Promise.all([meta(true), api('/crm/templates'), api('/crm/leads')]);
      const deals = leads.slice().sort((a, b) => (b.status === 'Договор') - (a.status === 'Договор') || String(b.contractDate || b.createdAt).localeCompare(String(a.contractDate || a.createdAt)));
      main.innerHTML = head('Документы', 'Договор и ДС — печать и PDF; АВР и счёт — данные для бухгалтера (официальные документы выписываются в 1С)', m.rights.templates ? '<button class="btn" data-act="crmTplNew">+ Шаблон</button>' : '') +
        tbl([{ t: 'Шаблон' }, { t: 'Вид' }, { t: '' }], tpls.map(x => `<tr><td><b>${esc(x.title)}</b>${x.changed ? ' <span class="faint">изменён</span>' : ''}${x.builtin ? '' : ' <span class="faint">свой</span>'}</td><td>${x.kind === '1c' ? chip('1c', { '1c': ['warn', 'данные для 1С'] }) : chip('p', { p: ['accent', 'печать / PDF'] })}</td>
<td><div class="actions"><button class="btn sm primary" data-act="crmFill" data-id="${esc(x.id)}">Заполнить</button>${m.rights.templates ? `<button class="btn sm" data-act="crmTplEdit" data-id="${esc(x.id)}">✎</button>${x.builtin ? (x.changed ? `<button class="btn sm" data-act="crmTplDel" data-id="${esc(x.id)}" title="Вернуть встроенный текст">Сбросить</button>` : '') : `<button class="btn sm danger" data-act="crmTplDel" data-id="${esc(x.id)}">✕</button>`}` : ''}</div></td></tr>`));
      const fieldsHint = `<div class="crm-fields">${m.fields.map(([k, t]) => `<div><code>{{${esc(k)}}}</code> — ${esc(t)}</div>`).join('')}</div>`;
      const tplForm = x => modal(x ? 'Шаблон: ' + x.title : 'Новый шаблон', `<form><div class="field"><label>Название</label><input name="title" required value="${esc(x ? x.title : '')}"></div><div class="field"><label>Вид</label><select name="kind"><option value="print"${!x || x.kind !== '1c' ? ' selected' : ''}>Печать / PDF (договор, ДС, письмо)</option><option value="1c"${x && x.kind === '1c' ? ' selected' : ''}>Данные для 1С (АВР, счёт — по этапу оплаты)</option></select></div>
<div class="field"><label>Текст (HTML; поля — в двойных фигурных скобках)</label><textarea name="body" rows="16" style="font-family:ui-monospace,Consolas,monospace;font-size:12px">${esc(x ? x.body : '')}</textarea></div>${fieldsHint}<div class="error"></div><button class="btn primary block" type="submit">Сохранить</button></form>`,
      async v => { await api(x ? '/crm/templates/' + x.id : '/crm/templates', { method: x ? 'PUT' : 'POST', body: v }); toast('Шаблон сохранён'); rerender(); });
      ui.ACT.crmTplNew = () => { tplForm(null); $('#modal .modal-card').style.maxWidth = '860px'; };
      ui.ACT.crmTplEdit = ({ id }) => { tplForm(tpls.find(x => x.id === id)); $('#modal .modal-card').style.maxWidth = '860px'; };
      ui.ACT.crmTplDel = async ({ id }) => { const x = tpls.find(y => y.id === id); if (!confirm(x.builtin ? 'Вернуть встроенный текст шаблона?' : 'Удалить шаблон?')) return; await api('/crm/templates/' + id, { method: 'DELETE' }); toast('Готово'); rerender(); };
      ui.ACT.crmFill = async ({ id }) => {
        const x = tpls.find(y => y.id === id); if (!deals.length) return toast('Нет лидов');
        const pre = q.get('lead') && deals.some(d => d.id === q.get('lead')) ? q.get('lead') : deals[0].id;
        modal('Заполнить: ' + x.title, `<form><div class="field"><label>Сделка / лид</label><select name="leadId" id="crm-fl">${deals.map(d => `<option value="${esc(d.id)}"${d.id === pre ? ' selected' : ''}>${esc(`№ ${d.no} · ${d.client || '—'} · ${ui.cut(d.object, 40)} · ${d.status}`)}</option>`).join('')}</select></div>
<div class="field"><label>Этап оплаты${x.kind === '1c' ? '' : ' (необязательно)'}</label><select name="paymentId" id="crm-fp"></select></div><div class="error"></div>
<div class="actions"><button class="btn primary" type="submit">Открыть для печати</button>${x.kind === '1c' ? '<button class="btn" type="button" id="crm-csv">CSV для 1С</button>' : ''}</div></form>`);
        const form = $('#modal-body form'); const fl = $('#crm-fl'), fp = $('#crm-fp');
        const loadPays = async () => { fp.innerHTML = '<option value="">…</option>'; try { const l = await api('/crm/leads/' + encodeURIComponent(fl.value)); const ps = l.payments || []; fp.innerHTML = (x.kind === '1c' ? '' : '<option value="">—</option>') + ps.map(p => `<option value="${esc(p.id)}"${p.ready ? ' selected' : ''}>${esc(`${p.n}. ${p.name} · ${p.share} % · ${mln(p.sum)} · ${p.status}${p.ready ? ' · пора выставлять' : ''}`)}</option>`).join('') || '<option value="">графика нет</option>'; } catch (e) { fp.innerHTML = '<option value="">—</option>'; } };
        fl.onchange = loadPays; await loadPays();
        const render = async () => api('/crm/docs/render', { method: 'POST', body: { templateId: x.id, leadId: fl.value, paymentId: fp.value } });
        form.onsubmit = async e => { e.preventDefault(); try { const r = await render(); openHtml(r.html); } catch (er) { form.querySelector('.error').textContent = er.message; } };
        const csv = $('#crm-csv'); if (csv) csv.onclick = async () => { try { const r = await render(); download(r.csv, `1С ${r.title}.csv`.replace(/[\\/:*?"<>|]/g, ' '), 'text/csv;charset=utf-8'); } catch (er) { form.querySelector('.error').textContent = er.message; } };
      };
      bind(main);
      if (q.get('lead') && !tpls.length) toast('Шаблонов нет');
    };
  },
});
