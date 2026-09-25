/* Модуль «ИИ-панель» — экраны. Поток F. Помощники интерфейса приходят в init(ui) (см. docs/ARCHITECTURE.md).
   Логика — modules/ai/domain.js (window.MostAI). Данные — только /api/ai/*. ИИ ничего не меняет сам: черновик → «Применить» / «Скачать .docx». */
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'ai',
  title: 'ИИ',
  nav: [
    { id: 'ai', label: 'ИИ-панель', icon: '✦' },
    { id: 'aiadmin', label: 'Журнал и настройки', icon: '⚙', can: u => !!window.MostAI && window.MostAI.canAdmin(u) },
  ],
  canOpen: u => !!window.MostAI && window.MostAI.canUse(u),
  help: [
    ['Как устроена ИИ-панель', `
<p>Панель отвечает на запросы руководителей по данным системы: составляет план работ, ЗнП, ТЗ, протоколы, письма, отвечает на вопросы по проектам и финансам. Работает на Claude (Claude Code под аккаунтом директора; позже — ключ Claude API).</p>
<ul>
<li><b>ИИ ничего не меняет сам.</b> Ответ — черновик. «Применить» переносит план в проект (сроки и новые пункты — вы выбираете, какие) или создаёт новый проект; «Скачать .docx» — документ Word в стиле MOST. Перед отправкой заказчику документ обязательно проверьте.</li>
<li><b>Проекты</b> (сайт MOST ERP): выберите проект и команду — план работ, ЗнП, ТЗ на раздел, протокол по заметкам, письмо заказчику, «что горит», свободный вопрос. Без проекта — сводка «что горит», просрочки раздела, план по новому проекту.</li>
<li><b>Финансы</b> (только сайт «Финансы»): дебиторка, прогноз денег, субподрядчики по проекту, вопросы — только чтение.</li>
<li>Данные собирает сервер: по проекту — стадия, пункты, сроки, договор, блокеры и регламенты из «Знаний». Зарплаты и личные данные сотрудников не передаются; суммы договоров — только в финансовой панели.</li>
<li>Запросы выполняются по очереди, по одному; ответ — от нескольких секунд до нескольких минут. Страницу можно не держать открытой: ответ сохранится в «Мои черновики».</li>
<li>Пилот — только руководители (владелец и партнёр).</li>
</ul>`, 'ai'],
    ['Журнал и настройки', `
<p>Владелец видит журнал запросов (кто, когда, команда, длительность, ошибка — без текста ответа) и задаёт настройки: способ подключения (<b>cli</b> — Claude Code на сервере, <b>api</b> — ключ Claude API из переменной окружения ANTHROPIC_API_KEY, <b>mock</b> — заглушка для проверки), путь к claude.exe (если не найден сам), модель, таймаут, длину очереди.</p>
<p>Если панель пишет «Claude Code не выполнил вход» — на сервере под учётной записью, от которой запущена программа, откройте терминал, запустите claude и войдите аккаунтом директора. «Проверить подключение» задаёт короткий тестовый вопрос.</p>`, 'aiadmin'],
  ],
  onNav(ui, id) {
    // кнопка «✦ ИИ» в шапке карточки проекта pm (без правки модуля pm): ведёт в панель с выбранным проектом
    if (!['pmp', 'ep/p', 'rp/p'].includes(id) || !window.MostAI || !window.MostAI.canUse(ui.state.user) || window.MOST_SITE === 'fin') return;
    let n = 0; const tick = () => { const h = document.querySelector('.main .head'); const pid = ui.params().get('id');
      if (h && pid && !h.querySelector('.ai-pmbtn')) h.insertAdjacentHTML('beforeend', `<a class="btn sm ai-pmbtn" href="#/ai?scope=pm&pid=${encodeURIComponent(pid)}" title="ИИ-панель по этому проекту">✦ ИИ</a>`);
      else if (!h && ++n < 30) setTimeout(tick, 100); };
    setTimeout(tick, 50);
  },
  init(ui) {
    const AI = window.MostAI;
    const { esc, api, fdate, toast, modal, formHtml, tbl, empty, chip, sel, head, bind, params, qsOf, $ } = ui;
    if (!document.getElementById('ai-style')) document.head.insertAdjacentHTML('beforeend', `<style id="ai-style">
.ai-wrap{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:14px}@media(max-width:980px){.ai-wrap{grid-template-columns:minmax(0,1fr)}}
.ai-cmds{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}.ai-cmds .btn.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.ai-hint{font-size:12.5px;color:var(--ink-soft);margin:-4px 0 10px}
.ai-q textarea{width:100%;min-height:90px;resize:vertical}
.ai-out{margin-top:14px}.ai-out h2{margin:0 0 4px}.ai-out .sum{font-size:14px;margin:0 0 12px;padding:10px 12px;background:var(--accent-soft);border-radius:8px}
.ai-doc{font-size:13.5px;line-height:1.55}.ai-doc h3{font-size:15px;margin:16px 0 6px}.ai-doc h4{font-size:13.5px;margin:12px 0 4px;color:var(--accent)}.ai-doc p{margin:0 0 8px}.ai-doc ul,.ai-doc ol{margin:0 0 8px;padding-left:20px}
.ai-doc .tbl{margin:6px 0 12px}.ai-doc td{vertical-align:top;white-space:pre-wrap}
.ai-wait{display:flex;align-items:center;gap:10px;padding:14px;border:1px dashed var(--line);border-radius:10px;margin-top:14px;font-size:14px}.ai-dot{width:10px;height:10px;border-radius:50%;background:var(--accent);animation:aip 1s infinite alternate}@keyframes aip{from{opacity:.25}to{opacity:1}}
.ai-side .card{padding:10px 12px;margin-bottom:10px}.ai-side h3{font-size:13px;margin:0 0 8px}.ai-hist a{display:block;padding:5px 0;border-bottom:1px solid var(--line);text-decoration:none;color:inherit;font-size:12.5px}.ai-hist a:last-child{border:0}.ai-hist a b{display:block;font-weight:600}.ai-hist a.cur b{color:var(--accent)}
.ai-apply label{display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-bottom:1px solid var(--line);font-size:13px}.ai-apply input{margin-top:3px}
.ai-sc{width:0;min-width:100%}
</style>`);

    const me = () => ui.state.user || {};
    const inline = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    const blocksHtml = bs => (bs || []).map(b => b.h ? `<h3>${inline(b.h)}</h3>` : b.h2 ? `<h4>${inline(b.h2)}</h4>` : b.ul ? `<ul>${b.ul.map(s => `<li>${inline(s)}</li>`).join('')}</ul>` : b.ol ? `<ol>${b.ol.map(s => `<li>${inline(s)}</li>`).join('')}</ol>`
      : b.table ? `<div class="ai-sc">${tbl((b.table.head || []).map(t => ({ t })), (b.table.rows || []).map(r => `<tr>${r.map(v => `<td>${inline(v)}</td>`).join('')}</tr>`))}</div>` : b.p != null ? `<p>${inline(b.p).replace(/\n/g, '<br>')}</p>` : '').join('');
    const SCOPE_LABEL = { pmall: 'Проекты: сводка', pm: 'Проект', fin: 'Финансы' };
    let POLL = null; const stopPoll = () => { if (POLL) { clearTimeout(POLL); POLL = null; } };
    const go = o => { location.hash = '#/ai?' + qsOf(o); };

    // ---- панель ----
    ui.SECTIONS.ai = async main => {
      stopPoll();
      const q = params(); const [st, cm] = await Promise.all([api('/ai/status'), api('/ai/commands')]);
      const scopes = cm.scopes.filter(s => s !== 'pm'); // pm — это «Проекты» с выбранным проектом
      let scope = q.get('scope') || (cm.scopes.includes('pmall') ? 'pmall' : 'fin'); if (!cm.scopes.includes(scope)) scope = cm.scopes[0];
      const pid = scope === 'pm' ? q.get('pid') || '' : '';
      const projects = cm.scopes.includes('pm') ? await api('/ai/projects').catch(() => []) : [];
      const list = cm.commands[scope] || []; const cmdId = list.some(c => c.id === q.get('cmd')) ? q.get('cmd') : (list[0] || {}).id; const cmd = list.find(c => c.id === cmdId) || {};
      const drafts = await api('/ai/drafts').catch(() => []);
      const draftId = q.get('draft'); const jobId = q.get('job');
      const back = st.backend === 'cli' ? (st.cli && st.cli.found ? '' : '<div class="notice warn">Claude Code на сервере не найден — владельцу: «Журнал и настройки».</div>') : st.backend === 'api' ? (st.api && st.api.keySet ? '' : '<div class="notice warn">Не задан ключ Claude API (ANTHROPIC_API_KEY).</div>') : '<div class="notice">Режим проверки (mock): ответы-заглушки.</div>';
      const busy = st.queue.running ? `Сейчас выполняется запрос${st.queue.queued ? `, в очереди ${st.queue.queued}` : ''}.` : '';
      const projSel = cm.scopes.includes('pm') ? `<div class="field"><label>Проект (для команд по объекту)</label>${sel('ai-pid', projects.map(p => [p.id, `${p.active ? '' : '(закрыт) '}${p.name}${p.client ? ' · ' + p.client : ''}`]), pid, '— без проекта: сводка по всем —')}</div>` : '';
      main.innerHTML = head('ИИ-панель', `${esc(SCOPE_LABEL[scope] || '')}${busy ? ' · ' + esc(busy) : ''}`) + back +
        (scopes.length > 1 || cm.scopes.includes('fin') && cm.scopes.includes('pmall') ? `<div class="tabs">${cm.scopes.includes('pmall') ? `<a href="#/ai?scope=${pid ? 'pm&pid=' + encodeURIComponent(pid) : 'pmall'}" class="${scope !== 'fin' ? 'active' : ''}">Проекты</a>` : ''}${cm.scopes.includes('fin') ? '<a href="#/ai?scope=fin" class="' + (scope === 'fin' ? 'active' : '') + '">Финансы</a>' : ''}</div>` : '') +
        `<div class="ai-wrap"><div><div class="card ai-q">${scope !== 'fin' ? projSel : '<p class="sub" style="margin-top:0">Только чтение: ответы по данным «Финансов» (без зарплат сотрудников).</p>'}
<div class="ai-cmds">${list.map(c => `<button class="btn sm${c.id === cmdId ? ' on' : ''}" data-cmd="${c.id}">${esc(c.label)}</button>`).join('')}</div>${cmd.hint ? `<div class="ai-hint">${esc(cmd.hint)}</div>` : ''}
${cmd.param === 'section' ? `<div class="field"><label>Раздел</label>${sel('ai-param', cm.sections, q.get('param') || '', cmdId === 'overdue' ? 'Все разделы' : '—')}</div>` : ''}
${cmd.text ? `<div class="field"><label>${cmd.text === 'req' ? 'Текст запроса' : 'Уточнения (необязательно)'}</label><textarea id="ai-text" placeholder="${esc(cmd.id === 'protocol' ? 'Вставьте заметки совещания…' : cmd.id === 'letter' ? 'О чём письмо…' : cmd.id === 'newplan' ? 'Объект, заказчик, стадия, площадь, срок по договору…' : 'Например: учесть экспертизу в январе')}"></textarea></div>` : ''}
<div class="actions"><button class="btn primary" id="ai-go">✦ Спросить</button></div></div><div id="ai-out" class="ai-out"></div></div>
<div class="ai-side"><div class="card"><h3>Мои черновики</h3><div class="ai-hist">${drafts.length ? drafts.map(d => `<a href="#/ai?${qsOf({ scope: d.scope, pid: d.pid, cmd: d.cmd, draft: d.id })}" class="${d.id === draftId ? 'cur' : ''}"><b>${esc(ui.cut(d.title || d.label, 60))}</b>${esc(d.pname ? ui.cut(d.pname, 40) + ' · ' : '')}${fdate(d.createdAt)} ${String(d.createdAt).slice(11, 16)}${d.applied ? ' · применён' : ''}</a>`).join('') : '<div class="faint" style="font-size:12.5px">пока нет</div>'}</div></div></div></div>`;
      const cur = () => ({ scope: $('#ai-pid') && $('#ai-pid').value ? 'pm' : (scope === 'fin' ? 'fin' : 'pmall'), pid: $('#ai-pid') ? $('#ai-pid').value : '' });
      if ($('#ai-pid')) $('#ai-pid').onchange = e => go({ scope: e.target.value ? 'pm' : 'pmall', pid: e.target.value });
      main.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => go(Object.assign(cur(), { cmd: b.dataset.cmd })));
      $('#ai-go').onclick = async () => {
        const c = cur(); const body = { scope: c.scope, pid: c.pid, cmd: cmdId, text: $('#ai-text') ? $('#ai-text').value : '', param: $('#ai-param') ? $('#ai-param').value : '' };
        if (!list.some(x => x.id === cmdId)) return toast('Выберите команду');
        try { $('#ai-go').disabled = true; const j = await api('/ai/ask', { method: 'POST', body }); go(Object.assign(c, { cmd: cmdId, job: j.id })); } catch (e) { $('#ai-go').disabled = false; toast(e.message, 5000); }
      };
      if (jobId) watch(jobId, main, c => go(c)); else if (draftId) showDraft(draftId);
    };
    // ожидание ответа: опрос задачи раз в 2 с
    const watch = (id, main, go2) => {
      const out = $('#ai-out'); const t0 = Date.now();
      const tick = async () => {
        if (!document.body.contains(out)) return stopPoll();
        let j; try { j = await api('/ai/jobs/' + id); } catch (e) { out.innerHTML = `<div class="notice warn">${esc(e.message)}</div>`; return; }
        if (j.status === 'done') { const q = params(); q.delete('job'); q.set('draft', j.draftId); location.hash = '#/ai?' + q.toString(); return; }
        if (j.status === 'error') { out.innerHTML = `<div class="notice warn"><b>Не получилось.</b> ${esc(j.error)}</div>`; return; }
        const sec = Math.round((Date.now() - new Date(j.startedAt || j.createdAt).getTime()) / 1000);
        out.innerHTML = `<div class="ai-wait"><span class="ai-dot"></span><span>${j.status === 'queued' ? `В очереди: ${j.position}-й. Выполняется по одному запросу.` : `Готовлю ответ… ${sec} с`}</span>${j.status === 'queued' ? `<button class="btn sm" id="ai-cancel">Отменить</button>` : ''}</div>`;
        const cb = $('#ai-cancel'); if (cb) cb.onclick = async () => { await api('/ai/jobs/' + id, { method: 'DELETE' }).catch(e => toast(e.message)); stopPoll(); out.innerHTML = '<div class="faint">Отменено</div>'; };
        POLL = setTimeout(tick, Date.now() - t0 > 60000 ? 4000 : 2000);
      };
      tick();
    };
    const showDraft = async id => {
      const out = $('#ai-out'); let d; try { d = await api('/ai/drafts/' + id); } catch (e) { out.innerHTML = `<div class="notice warn">${esc(e.message)}</div>`; return; }
      const planHtml = d.plan ? `<div class="card ai-apply" style="margin-top:12px"><h3 style="margin-top:0">Применить в проект «${esc(d.pname)}»</h3>
${(d.plan.dues || []).length ? `<div class="label">Сроки пунктов</div>${d.plan.dues.map((x, i) => `<label><input type="checkbox" data-due="${i}"${x.missing || x.done ? '' : ' checked'}${x.missing ? ' disabled' : ''}><span><b>${esc(x.title || 'пункт не найден')}</b> <span class="faint">${esc(x.stageName || '')}</span><br>${x.oldDue ? fdate(x.oldDue) : '—'} → <b>${fdate(x.due)}</b>${x.why ? ` · ${esc(x.why)}` : ''}${x.done ? ' · уже сделан' : ''}</span></label>`).join('')}` : ''}
${(d.plan.items || []).length ? `<div class="label" style="margin-top:10px">Новые пункты</div>${d.plan.items.map((x, i) => `<label><input type="checkbox" data-item="${i}" checked><span><b>${esc(x.title)}</b> · этап ${x.stage} · ${esc(x.role)} · ${x.weeks} нед.${x.due ? ' · до ' + fdate(x.due) : ''}${x.crit ? `<br><span class="faint">${esc(x.crit)}</span>` : ''}</span></label>`).join('')}` : ''}
<div class="actions" style="margin-top:10px"><button class="btn primary" id="ai-apply"${d.applied ? ' disabled' : ''}>${d.applied ? 'Применено ' + fdate(d.applied.at) : 'Применить выбранное'}</button></div></div>` : '';
      const projHtml = d.project ? `<div class="card" style="margin-top:12px"><h3 style="margin-top:0">Новый проект</h3><div class="kv"><span>Название</span><b>${esc(d.project.name)}</b><span>Стадия</span><b>${esc({ concept: 'Концепция', ep: 'ЭП', rp: 'РП', an: 'АН' }[d.project.track])}</b><span>Заказчик</span><b>${esc(d.project.client || '—')}</b><span>Старт — срок</span><b>${fdate(d.project.start) || '—'} — ${fdate(d.project.due) || '—'}</b></div>
<div class="actions" style="margin-top:10px">${d.applied ? `<a class="btn" href="#/ep/p?id=${encodeURIComponent(d.applied.pmProjectId)}">Открыть проект</a>` : '<button class="btn primary" id="ai-apply">Создать проект в «Проектах»</button>'}</div></div>` : '';
      out.innerHTML = `<div class="card"><div class="head" style="margin:0 0 6px"><div class="grow"><h2>${esc(d.title)}</h2><p class="sub" style="margin:0">${esc(d.label)}${d.pname ? ' · ' + esc(d.pname) : ''} · ${fdate(d.createdAt)} ${String(d.createdAt).slice(11, 16)}${d.backend === 'mock' ? ' · заглушка' : ''}</p></div>
<div class="actions"><a class="btn" href="/api/ai/drafts/${encodeURIComponent(d.id)}/docx">⬇ Скачать .docx</a><button class="btn" id="ai-copy">Копировать</button><button class="btn danger" id="ai-del" title="Удалить черновик">✕</button></div></div>
${d.question ? `<p class="faint" style="margin:0 0 8px">Запрос: ${esc(ui.cut(d.question, 300))}</p>` : ''}${d.summary ? `<p class="sum">${inline(d.summary)}</p>` : ''}<div class="ai-doc">${blocksHtml(d.blocks) || '<p class="faint">Пустой ответ</p>'}</div>
<p class="faint" style="margin-top:10px;font-size:12px">Черновик ИИ: проверьте цифры и формулировки перед использованием.</p></div>${planHtml}${projHtml}`;
      $('#ai-copy').onclick = async () => { const t = out.querySelector('.ai-doc').innerText; try { await navigator.clipboard.writeText((d.title ? d.title + '\n\n' : '') + (d.summary ? d.summary + '\n\n' : '') + t); toast('Скопировано'); } catch { toast('Не удалось скопировать'); } };
      $('#ai-del').onclick = async () => { if (!confirm('Удалить черновик?')) return; await api('/ai/drafts/' + d.id, { method: 'DELETE' }); const q = params(); q.delete('draft'); location.hash = '#/ai?' + q.toString(); };
      const ab = $('#ai-apply'); if (ab && !d.applied) ab.onclick = async () => {
        const body = d.plan ? { dues: [...out.querySelectorAll('[data-due]:checked')].map(x => Number(x.dataset.due)), items: [...out.querySelectorAll('[data-item]:checked')].map(x => Number(x.dataset.item)) } : {};
        if (d.plan && !body.dues.length && !body.items.length) return toast('Ничего не выбрано');
        ab.disabled = true; try { const r = await api(`/ai/drafts/${d.id}/apply`, { method: 'POST', body }); toast(`Применено: ${r.ok}${r.errors.length ? `, ошибок ${r.errors.length}` : ''}`, 4000); if (r.pmProjectId) location.hash = '#/pmp?id=' + encodeURIComponent(r.pmProjectId); else showDraft(d.id); } catch (e) { ab.disabled = false; toast(e.message, 5000); }
      };
    };

    // ---- журнал и настройки (владелец) ----
    ui.SECTIONS.aiadmin = async main => {
      stopPoll();
      const [cfg, st, lg] = await Promise.all([api('/ai/config'), api('/ai/status?version=1'), api('/ai/log')]);
      const f = [{ name: 'backend', label: 'Подключение', type: 'select', options: [['cli', 'Claude Code на сервере (аккаунт директора)'], ['api', 'Claude API (ключ ANTHROPIC_API_KEY в окружении)'], ['mock', 'Заглушка (проверка без Claude)']], half: true },
        { name: 'cliPath', label: 'Путь к claude.exe (пусто — найти самому)', half: true }, { name: 'model', label: 'Модель для Claude Code (пусто — по умолчанию)', half: true }, { name: 'apiModel', label: 'Модель для Claude API', half: true },
        { name: 'timeoutSec', label: 'Таймаут, с', type: 'number', half: true }, { name: 'maxQueue', label: 'Очередь, запросов', type: 'number', half: true }];
      const cli = st.cli ? (st.cli.found ? `найден: <code>${esc(st.cli.path)}</code>${st.cli.version ? ' · ' + esc(st.cli.version) : ''}` : '<span class="crit-text">не найден</span>') : '';
      main.innerHTML = head('Журнал и настройки ИИ', `Подключение: <b>${esc(cfg.backend)}</b>${cli ? ' · Claude Code ' + cli : ''}${st.api ? ' · ключ API ' + (st.api.keySet ? 'задан' : '<span class="crit-text">не задан</span>') : ''}`, '<button class="btn" id="ai-check">Проверить подключение</button>') +
        `<div class="grid g3" style="margin-bottom:14px"><div class="card"><div class="label">Запросов за 7 дней</div><div class="val">${lg.week.n}</div></div><div class="card"><div class="label">Ошибок</div><div class="val">${lg.week.errors}</div></div><div class="card"><div class="label">Среднее время</div><div class="val">${lg.week.avgSec} с</div></div></div>
<div class="card" style="margin-bottom:14px">${formHtml(f, cfg, 'Сохранить настройки')}</div><div id="ai-chk"></div><h2>Журнал запросов</h2>` +
        (lg.rows.length ? `<div class="ai-sc">${tbl([{ t: 'Когда' }, { t: 'Кто' }, { t: 'Команда' }, { t: 'Проект' }, { t: 'Подключение' }, { t: 'Время', cls: 'num' }, { t: 'Итог' }], lg.rows.map(l => `<tr><td>${fdate(l.at)} ${String(l.at).slice(11, 16)}</td><td>${esc(l.user || '')}</td><td>${esc(l.scope)} · ${esc(l.cmd)}${l.param ? ' ' + esc(l.param) : ''}</td><td>${esc(l.pname || '')}</td><td>${esc(l.backend)}</td><td class="num">${Math.round(l.ms / 100) / 10} с</td><td>${l.status === 'done' ? chip('ok', { ok: ['ok', 'готово'] }) : chip('e', { e: ['crit', 'ошибка'] }) + `<div class="faint">${esc(ui.cut(l.error, 120))}</div>`}</td></tr>`))}</div>` : empty('Запросов ещё не было'));
      main.querySelector('form').onsubmit = async e => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target).entries()); try { await api('/ai/config', { method: 'PUT', body: v }); toast('Сохранено'); ui.route(); } catch (er) { e.target.querySelector('.error').textContent = er.message; } };
      $('#ai-check').onclick = async () => {
        const box = $('#ai-chk'); box.innerHTML = '<div class="ai-wait"><span class="ai-dot"></span>Задаю тестовый вопрос…</div>';
        try { const j = await api('/ai/ask', { method: 'POST', body: { scope: st.scopes.includes('pmall') ? 'pmall' : 'fin', cmd: 'ask', text: 'Проверка связи: ответь одной фразой «Связь есть» и укажи, сколько данных получил.', force: true } });
          const t0 = Date.now(); const poll = async () => { const r = await api('/ai/jobs/' + j.id); if (r.status === 'done') box.innerHTML = `<div class="notice">✓ Работает (${Math.round((Date.now() - t0) / 1000)} с): ${esc((r.draft && (r.draft.summary || r.draft.title)) || '')}</div>`; else if (r.status === 'error') box.innerHTML = `<div class="notice warn">✗ ${esc(r.error)}</div>`; else setTimeout(poll, 2000); }; poll();
        } catch (e) { box.innerHTML = `<div class="notice warn">✗ ${esc(e.message)}</div>`; }
      };
      bind(main);
    };
  },
});
