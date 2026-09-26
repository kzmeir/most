/* Модуль «Маркетинг» — экраны. Помощники интерфейса приходят в init(ui) (см. docs/ARCHITECTURE.md).
   Логика — modules/mkt/domain.js (window.MostMKT). Данные — только /api/mkt/*. */
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'mkt',
  title: 'Маркетинг',
  nav: [
    { id: 'mktreview', label: 'На утверждение', icon: '✓', can: u => !!window.MostMKT && window.MostMKT.canApprove(u) },
    { id: 'mktplan', label: 'Контент-план', icon: '▤' },
    { id: 'mktconsent', label: 'Согласия заказчиков', icon: '§' },
    { id: 'mktmonth', label: 'Итоги месяца', icon: '◔' },
  ],
  routes: ['mktpost'], // карточка поста: #/mktpost?id=…
  canOpen: u => !!window.MostMKT && window.MostMKT.canOpen(u),
  help: [
    ['Как устроен маркетинг', `
<p>Путь поста: <b>черновик</b> → <b>на утверждении</b> → <b>утверждён</b> → <b>опубликован</b>. Директор может вернуть пост <b>на правку</b> (с комментарием) или <b>отклонить</b>.</p>
<ul>
<li><b>Владелец и партнёр</b> утверждают посты, загружают черновики от ИИ.</li>
<li><b>Секретарь</b> (помощник по маркетингу) ведёт контент-план, загружает картинки, отмечает публикации, согласия и итоги месяца.</li>
<li>Правила текста — статья «Голос бренда и правила постов» в «Знаниях». Подсказки по клише и ставкам показываются в карточке поста.</li>
<li><b>Правило согласий:</b> пост о проекте нельзя утвердить и отметить опубликованным, пока у проекта нет отметки «можно публиковать». Пост без проекта (о команде, процессе) — можно.</li>
</ul>`],
    ['На утверждение', `<p>Карточки постов, которые ждут решения: картинки листаются пальцем, под ними текст. <b>ОК</b> — утвердить, <b>Правка</b> — вернуть с комментарием (обязателен), <b>Нет</b> — отклонить. Экран рассчитан на телефон.</p>`, 'mktreview'],
    ['Контент-план', `
<ol>
<li><b>+ Пост</b>: дата публикации, каналы, рубрика, проект (если пост о проекте), заголовок, текст, картинки. Порядок картинок = порядок слайдов карусели; менять стрелками в карточке поста.</li>
<li>Фильтры — рубрика, статус, период. Посты сгруппированы по неделям.</li>
<li>В карточке: <b>Отправить на утверждение</b>, после утверждения — <b>Опубликовано</b> со ссылкой на пост.</li>
<li>Цифра в меню — посты на правке и утверждённые, у которых дата уже прошла.</li>
</ol>`, 'mktplan'],
    ['Согласия заказчиков', `<p>По каждому проекту из «Проектов»: можно публиковать / нельзя (NDA) / не спрашивали, что именно можно (рендеры, чертежи, фото стройки), дата письма, заметка. Кто и когда отметил — видно в таблице.</p>`, 'mktconsent'],
    ['Итоги месяца', `<p>Вручную: подписчики и охват по каналам, отклики на вакансии, заметка. Автоматически: опубликованные посты по рубрикам и лиды из «Коммерции» по источникам за месяц.</p>`, 'mktmonth'],
  ],
  onNav() { if (this._badges) this._badges(); },
  init(ui) {
    const MOD = this; const MK = window.MostMKT;
    const { esc, api, fdate, toast, modal, formHtml, tbl, empty, chip, sel, head, bind, params, route, $ } = ui;
    if (!document.getElementById('mkt-style')) document.head.insertAdjacentHTML('beforeend', `<style id="mkt-style">
.mkt-revs{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;align-items:start}@media(max-width:520px){.mkt-revs{grid-template-columns:1fr}}
.mkt-rev{padding:0;overflow:hidden}.mkt-rev .b{padding:12px 14px}.mkt-rev h3{margin:6px 0;font-size:16px}
.mkt-car{position:relative;background:var(--panel-2)}.mkt-track{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}.mkt-track::-webkit-scrollbar{display:none}
.mkt-track img{flex:0 0 100%;width:100%;aspect-ratio:4/5;object-fit:contain;scroll-snap-align:center;background:var(--panel-2);display:block}
.mkt-n{position:absolute;top:8px;right:8px;background:rgba(0,0,0,.6);color:#fff;font-size:11.5px;padding:2px 8px;border-radius:999px}
.mkt-car button{position:absolute;top:50%;transform:translateY(-50%);border:0;background:rgba(0,0,0,.45);color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px}.mkt-car .l{left:6px}.mkt-car .r{right:6px}@media(hover:none){.mkt-car button{display:none}}
.mkt-noimg{padding:28px;text-align:center;color:var(--ink-faint);font-size:13px}
.mkt-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12.5px;color:var(--ink-soft)}
.mkt-text{white-space:pre-wrap;font-size:14px;line-height:1.5;margin:6px 0 8px;overflow-wrap:anywhere}
.mkt-warn{font-size:12.5px;border-radius:8px;padding:7px 10px;margin:6px 0;background:var(--warn-bg);color:var(--warn)}.mkt-warn.crit{background:var(--crit-bg);color:var(--crit)}
.mkt-btns{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:0 14px 14px}.mkt-btns .btn{justify-content:center;padding:12px 8px;font-size:15px}.mkt-btns .ok{background:var(--ok);border-color:var(--ok);color:#fff}
.mkt-week{margin:18px 0 8px;font-size:13px;color:var(--ink-soft);font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.mkt-row{display:grid;grid-template-columns:56px 1fr auto;gap:10px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-bottom:8px;cursor:pointer;text-decoration:none;color:inherit}.mkt-row:hover{border-color:var(--accent)}
.mkt-row .th{width:56px;height:56px;border-radius:6px;background:var(--panel-2);object-fit:cover}.mkt-row b{display:block;font-size:14px}.mkt-row .m{font-size:12px;color:var(--ink-soft)}.mkt-row .st{text-align:right;display:grid;gap:4px;justify-items:end}
.mkt-ch{display:flex;flex-wrap:wrap;gap:6px 14px;margin-bottom:12px}.mkt-ch label{display:inline-flex;gap:6px;align-items:center;font-size:13.5px}.mkt-ch input{width:auto}
.mkt-hint{font-size:12px;color:var(--ink-soft);margin:-6px 0 12px}
.mkt-imgs{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.mkt-imgs figure{margin:0;width:92px;text-align:center;font-size:11px}.mkt-imgs img{width:92px;height:92px;object-fit:cover;border-radius:6px;display:block;background:var(--panel-2)}.mkt-imgs .btn{padding:2px 7px;margin:3px 1px 0}
.mkt-post{display:grid;grid-template-columns:minmax(0,420px) 1fr;gap:18px;align-items:start}@media(max-width:820px){.mkt-post{grid-template-columns:1fr}}
.mkt-acts{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.mkt-hist{font-size:12.5px;color:var(--ink-soft);margin:0;padding-left:18px}.mkt-hist li{margin-bottom:3px}
.mkt-filters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}.mkt-filters select{width:auto;min-width:140px}
.mkt-sc{width:0;min-width:100%}.mkt-mt input{min-width:90px}.mkt-mt td{padding:5px 8px}
</style>`);

    let META = null;
    const meta = async force => { if (!META || force) META = await api('/mkt/meta'); return META; };
    const ST_CHIP = { draft: ['neutral', 'Черновик'], review: ['warn', 'На утверждении'], approved: ['accent', 'Утверждён'], published: ['ok', 'Опубликован'], rework: ['crit', 'На правке'], rejected: ['neutral', 'Отклонён'] };
    const CS_CHIP = { yes: ['ok', 'Можно публиковать'], no: ['crit', 'Нельзя (NDA)'], unknown: ['neutral', 'Не спрашивали'] };
    const ACT_LABEL = { create: 'создан', edit: 'изменён', submit: 'на утверждение', approve: 'утверждён', rework: 'на правку', reject: 'отклонён', publish: 'опубликован', reopen: 'в черновик' };
    const dtm = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }; // время по Алматы
    const nposts = n => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'пост' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'поста' : 'постов'}`;
    const chans = p => (p.channels || []).map(c => MK.CHANNELS[c] || c).join(', ');
    const rerender = async () => { const y = window.scrollY; await route(); window.scrollTo(0, y); };
    let badgeAt = 0;
    const badges = async force => { if (!force && Date.now() - badgeAt < 60000) return; badgeAt = Date.now(); try { const b = await api('/mkt/badges'); ui.setBadge('mktreview', b.mktreview); ui.setBadge('mktplan', b.mktplan); } catch { /* нет доступа */ } };
    MOD._badges = () => badges(false);
    const postLink = id => `#/mktpost?id=${encodeURIComponent(id)}`;
    const fileB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = () => rej(new Error('Не удалось прочитать ' + f.name)); r.readAsDataURL(f); });
    const upload = async (id, files) => { let n = 0; for (const f of files) { if (f.size > MK.MAX_IMAGE) { toast(`${f.name}: больше ${MK.MAX_IMAGE / 1048576} МБ`); continue; } await api(`/mkt/posts/${id}/images`, { method: 'POST', body: { name: f.name, type: f.type, data: await fileB64(f) } }); n++; } return n; };

    // ---- карусель: слайды листаются пальцем, на компьютере — стрелками ----
    const carousel = p => { const im = p.images || []; if (!im.length) return '<div class="mkt-car"><div class="mkt-noimg">Без картинок</div></div>';
      return `<div class="mkt-car"><div class="mkt-track">${im.map(i => `<img src="${esc(i.url)}" alt="${esc(i.name || '')}" loading="lazy">`).join('')}</div>${im.length > 1 ? `<span class="mkt-n">1 / ${im.length}</span><button class="l" type="button" aria-label="Назад">‹</button><button class="r" type="button" aria-label="Вперёд">›</button>` : ''}</div>`; };
    const bindCars = root => root.querySelectorAll('.mkt-car').forEach(c => { const tr = c.querySelector('.mkt-track'), n = c.querySelector('.mkt-n'); if (!tr || !n) return; const tot = tr.children.length;
      tr.onscroll = () => { n.textContent = `${Math.round(tr.scrollLeft / tr.clientWidth) + 1} / ${tot}`; };
      c.querySelector('.l').onclick = () => tr.scrollBy({ left: -tr.clientWidth, behavior: 'smooth' }); c.querySelector('.r').onclick = () => tr.scrollBy({ left: tr.clientWidth, behavior: 'smooth' }); });
    const metaLine = p => `<div class="mkt-meta">${chip(p.status, ST_CHIP)}<span>${fdate(p.date)}</span><span>· ${esc(p.rubric)}</span><span>· ${esc(chans(p))}</span></div>`;
    const warns = p => [p.project ? `<div class="mkt-meta" style="margin-top:6px">Проект: <b>${esc(p.project.name)}</b>${p.consent ? ' ' + chip(p.consent.status, CS_CHIP) : ''}${p.consent && p.consent.what.length ? ` <span>${esc(p.consent.what.map(w => MK.CONSENT_WHAT[w]).join(', '))}</span>` : ''}</div>` : '',
      p.block && ['review', 'approved'].includes(p.status) ? `<div class="mkt-warn crit">${esc(p.block)}</div>` : '',
      p.comment && ['rework', 'rejected', 'review'].includes(p.status) ? `<div class="mkt-warn">Замечание: ${esc(p.comment)}</div>` : '',
      (p.lint || []).length ? `<div class="mkt-warn">Голос бренда: ${esc(p.lint.join('; '))}</div>` : ''].join('');

    // ---- действия со статусом ----
    const act = async (id, action, body) => { await api(`/mkt/posts/${id}/${action}`, { method: 'POST', body: body || {} }); toast(ACT_LABEL[action] ? 'Пост ' + ACT_LABEL[action] : 'Готово'); badges(true); rerender(); };
    ui.ACT.mktOk = ({ id }) => act(id, 'approve');
    ui.ACT.mktRework = ({ id }) => modal('Вернуть на правку', formHtml([{ name: 'comment', label: 'Что поправить', type: 'textarea', required: true }], {}, 'Вернуть на правку'), v => act(id, 'rework', v));
    ui.ACT.mktReject = ({ id }) => modal('Отклонить пост', formHtml([{ name: 'comment', label: 'Причина (необязательно)', type: 'textarea' }], {}, 'Отклонить'), v => act(id, 'reject', v));
    ui.ACT.mktSubmit = ({ id }) => act(id, 'submit');
    ui.ACT.mktReopen = ({ id }) => act(id, 'reopen');
    ui.ACT.mktPublish = ({ id }) => modal('Опубликовано', formHtml([{ name: 'url', label: 'Ссылка на пост', type: 'url' }, { name: 'date', label: 'Дата публикации', type: 'date' }], { date: ui.today() }, 'Отметить опубликованным'), v => act(id, 'publish', v));
    ui.ACT.mktDel = async ({ id }) => { if (!confirm('Удалить пост вместе с картинками?')) return; await api('/mkt/posts/' + id, { method: 'DELETE' }); toast('Удалено'); badges(true); if (location.hash.startsWith('#/mktpost')) location.hash = '#/mktplan'; else rerender(); };

    // ---- форма поста ----
    const editPost = async p => {
      const m = await meta(true); const isNew = !p; const v = p || { date: m.today, channels: ['instagram'], rubric: m.rubrics[0], pmProjectId: '' };
      const projOpts = [['', '— без проекта (команда, процесс) —'], ...m.pmProjects.map(x => [x.id, `${x.name}${x.client ? ' · ' + x.client : ''} — ${m.consent[x.consent]}`])];
      const html = `<form>
<div class="form-row">${ui.field({ name: 'date', label: 'Дата публикации', type: 'date', required: true }, v.date)}${ui.field({ name: 'rubric', label: 'Рубрика', type: 'select', options: m.rubrics }, v.rubric)}</div>
<div class="mkt-hint" id="mkt-rh">${esc(m.hints[v.rubric] || '')}</div>
<div class="field"><label>Каналы</label><div class="mkt-ch">${Object.entries(m.channels).map(([k, l]) => `<label><input type="checkbox" name="ch" value="${k}"${(v.channels || []).includes(k) ? ' checked' : ''}> ${esc(l)}</label>`).join('')}</div></div>
${ui.field({ name: 'pmProjectId', label: 'Проект', type: 'select', options: projOpts }, v.pmProjectId)}
${ui.field({ name: 'title', label: 'Заголовок (для плана)' }, v.title)}
<div class="field"><label>Текст</label><textarea name="text" rows="9">${esc(v.text || '')}</textarea></div>
<div class="mkt-hint">${esc(m.rules.join(' · '))}</div>
${M_FILES()}
<div class="error"></div><button class="btn primary block" type="submit">${isNew ? 'Создать черновик' : 'Сохранить'}</button></form>`;
      modal(isNew ? 'Новый пост' : 'Пост', html, async f => {
        const files = [...($('#modal-body input[type=file]') || {}).files || []];
        const body = { date: f.date, rubric: f.rubric, pmProjectId: f.pmProjectId, title: f.title, text: f.text, channels: [...document.querySelectorAll('#modal-body input[name=ch]:checked')].map(x => x.value) };
        const r = await api(isNew ? '/mkt/posts' : '/mkt/posts/' + p.id, { method: isNew ? 'POST' : 'PUT', body });
        const n = files.length ? await upload(r.id, files) : 0; toast((isNew ? 'Черновик создан' : 'Сохранено') + (n ? ` · картинок: ${n}` : '')); badges(true);
        if (isNew) location.hash = postLink(r.id); else rerender();
      });
      $('#modal .modal-card').style.maxWidth = '640px';
      const rs = $('#modal-body select[name=rubric]'); rs.onchange = () => { $('#mkt-rh').textContent = m.hints[rs.value] || ''; };
    };
    const M_FILES = () => `<div class="field"><label>Картинки (PNG, JPG, WebP, до ${MK.MAX_IMAGE / 1048576} МБ; порядок выбора = порядок слайдов)</label><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple></div>`;

    // ---- «На утверждение» ----
    ui.SECTIONS.mktreview = async main => {
      const list = await api('/mkt/review'); const m = await meta();
      main.innerHTML = head('На утверждение', list.length ? `${nposts(list.length)} ${list.length % 10 === 1 && list.length % 100 !== 11 ? 'ждёт' : 'ждут'} решения` : 'Все посты рассмотрены') +
        (list.length ? `<div class="mkt-revs">${list.map(p => `<div class="card mkt-rev">${carousel(p)}<div class="b">${metaLine(p)}${p.title ? `<h3>${esc(p.title)}</h3>` : ''}<div class="mkt-text">${esc(p.text)}</div>${warns(p)}<div class="mkt-meta"><a href="${postLink(p.id)}">Карточка и история</a></div></div>
${m.rights.approve ? `<div class="mkt-btns"><button class="btn ok" data-act="mktOk" data-id="${p.id}"${p.block ? ' disabled title="' + esc(p.block) + '"' : ''}>ОК</button><button class="btn" data-act="mktRework" data-id="${p.id}">Правка</button><button class="btn danger" data-act="mktReject" data-id="${p.id}">Нет</button></div>` : ''}</div>`).join('')}</div>` : empty('Новых постов на утверждение нет'));
      bind(main); bindCars(main); badges(true);
    };

    // ---- контент-план ----
    ui.SECTIONS.mktplan = async main => {
      const m = await meta(true); const q = params(); const f = { rubric: q.get('rubric') || '', status: q.get('status') || '', period: q.get('period') || 'cur' };
      const from = f.period === 'cur' ? MK.weekStart(m.today) : ''; const [all, sum] = await Promise.all([api('/mkt/posts?' + ui.qsOf({ rubric: f.rubric, status: f.status })), api('/mkt/summary')]);
      const list = all.filter(p => !from || (p.date || '') >= from || ['draft', 'rework', 'review', 'approved'].includes(p.status)); // в текущем — ещё и всё незакрытое из прошлого
      const weeks = new Map(); for (const p of list) { const w = MK.weekStart(p.date || m.today); if (!weeks.has(w)) weeks.set(w, []); weeks.get(w).push(p); }
      const pause = sum.pauseDays != null && sum.pauseDays > 7 ? `<div class="notice warn">Последняя публикация ${fdate(sum.lastPublished)} — пауза ${sum.pauseDays} дн. Правило: не дольше недели.</div>` : '';
      main.innerHTML = head('Контент-план', `${nposts(list.length)} · на утверждении ${sum.review} · на правке ${sum.rework} · утверждено ${sum.approved}`, m.rights.editor ? '<button class="btn primary" data-act="mktNew">+ Пост</button>' : '') + pause +
        `<div class="mkt-filters">${sel('mkt-f-rubric', m.rubrics, f.rubric, 'Все рубрики')}${sel('mkt-f-status', Object.entries(m.statuses), f.status, 'Все статусы')}${sel('mkt-f-period', [['cur', 'С этой недели и незакрытые'], ['all', 'Все даты']], f.period)}</div>` +
        (list.length ? [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([w, ps]) => `<div class="mkt-week">Неделя ${fdate(w)} – ${fdate(MK.addDays(w, 6))}${w === MK.weekStart(m.today) ? ' · текущая' : ''}</div>` +
          ps.map(p => `<a class="mkt-row" href="${postLink(p.id)}">${p.images.length ? `<img class="th" src="${esc(p.images[0].url)}" alt="" loading="lazy">` : '<div class="th"></div>'}<div><b>${esc(p.title || ui.cut(p.text, 60) || 'Без заголовка')}</b><div class="m">${fdate(p.date)} · ${esc(p.rubric)} · ${esc(chans(p))}${p.images.length ? ` · ${p.images.length} карт.` : ''}${p.project ? ' · ' + esc(p.project.name) : ''}</div>${p.block && ['review', 'approved'].includes(p.status) ? '<div class="m crit-text">нет согласия заказчика</div>' : ''}</div><div class="st">${chip(p.status, ST_CHIP)}${p.status === 'approved' && p.date < m.today ? '<span class="chip crit">дата прошла</span>' : ''}</div></a>`).join('')).join('') : empty('Постов нет'));
      const go = () => { location.hash = '#/mktplan?' + ui.qsOf({ rubric: $('#mkt-f-rubric').value, status: $('#mkt-f-status').value, period: $('#mkt-f-period').value === 'cur' ? '' : 'all' }); };
      ['#mkt-f-rubric', '#mkt-f-status', '#mkt-f-period'].forEach(s => { $(s).onchange = go; });
      ui.ACT.mktNew = () => editPost(null); bind(main);
    };

    // ---- карточка поста ----
    ui.SECTIONS.mktpost = async main => {
      const id = params().get('id'); const [p, m] = await Promise.all([api('/mkt/posts/' + encodeURIComponent(id)), meta()]); const R = m.rights;
      const editable = R.editor && MK.EDITABLE.includes(p.status);
      const btns = [editable ? '<button class="btn" data-act="mktEdit">✎ Изменить</button>' : '', editable ? `<label class="btn">+ Картинки<input type="file" id="mkt-add" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden></label>` : '',
        R.editor && ['draft', 'rework'].includes(p.status) ? `<button class="btn primary" data-act="mktSubmit" data-id="${p.id}">Отправить на утверждение</button>` : '',
        R.approve && p.status === 'review' ? `<button class="btn primary" data-act="mktOk" data-id="${p.id}"${p.block ? ' disabled' : ''}>ОК</button><button class="btn" data-act="mktRework" data-id="${p.id}">Правка</button><button class="btn danger" data-act="mktReject" data-id="${p.id}">Нет</button>` : '',
        R.editor && p.status === 'approved' ? `<button class="btn primary" data-act="mktPublish" data-id="${p.id}"${p.block ? ' disabled' : ''}>Опубликовано</button>` : '', R.approve && p.status === 'approved' ? `<button class="btn" data-act="mktRework" data-id="${p.id}">Правка</button>` : '',
        R.editor && p.status === 'rejected' ? `<button class="btn" data-act="mktReopen" data-id="${p.id}">В черновик</button>` : '',
        (R.leader || (R.editor && ['draft', 'rework', 'rejected'].includes(p.status))) ? `<button class="btn danger" data-act="mktDel" data-id="${p.id}">Удалить</button>` : ''].join('');
      const imgs = editable && p.images.length ? `<div class="mkt-imgs">${p.images.map((i, n) => `<figure><img src="${esc(i.url)}" alt=""><button class="btn sm" data-act="mktMv" data-n="${n}" data-d="-1"${n ? '' : ' disabled'}>←</button><button class="btn sm" data-act="mktMv" data-n="${n}" data-d="1"${n < p.images.length - 1 ? '' : ' disabled'}>→</button><button class="btn sm danger" data-act="mktRm" data-n="${n}">✕</button></figure>`).join('')}</div>` : '';
      main.innerHTML = head(p.title || 'Пост', `<a href="#/mktplan">← к контент-плану</a>`) +
        `<div class="mkt-post"><div class="card mkt-rev">${carousel(p)}</div><div>${metaLine(p)}${warns(p)}<div class="mkt-text">${esc(p.text)}</div>${p.publishedUrl ? `<p><a href="${esc(p.publishedUrl)}" target="_blank" rel="noopener">Открыть публикацию ↗</a> · ${fdate(p.publishedAt)}</p>` : ''}<div class="mkt-acts">${btns}</div>${imgs}
<h3 style="font-size:14px;margin:14px 0 6px">История</h3><ol class="mkt-hist">${(p.history || []).map(h => `<li>${dtm(h.at)}${h.byName ? ' · ' + esc(h.byName) : ''} · ${esc(ACT_LABEL[h.action] || h.action)}${h.note ? ': ' + esc(h.note) : ''}</li>`).join('')}</ol></div></div>`;
      const order = async keys => { await api('/mkt/posts/' + p.id, { method: 'PUT', body: { images: keys } }); rerender(); };
      ui.ACT.mktEdit = () => editPost(p);
      ui.ACT.mktMv = ({ n, d }) => { const k = p.images.map(i => i.key); const a = Number(n), b = a + Number(d); [k[a], k[b]] = [k[b], k[a]]; order(k); };
      ui.ACT.mktRm = ({ n }) => { if (!confirm('Убрать картинку из поста?')) return; order(p.images.map(i => i.key).filter((_, i) => i !== Number(n))); };
      const add = $('#mkt-add'); if (add) add.onchange = async () => { try { const n = await upload(p.id, [...add.files]); toast(`Картинок добавлено: ${n}`); } catch (e) { toast(e.message); } rerender(); };
      bind(main); bindCars(main);
    };

    // ---- согласия заказчиков ----
    ui.SECTIONS.mktconsent = async main => {
      const [rows, m] = await Promise.all([api('/mkt/consents'), meta(true)]); const n = s => rows.filter(r => r.status === s).length;
      main.innerHTML = head('Согласия заказчиков', `Можно: ${n('yes')} · NDA: ${n('no')} · не спрашивали: ${n('unknown')}. Пост о проекте утверждается только при «можно публиковать».`) +
        (rows.length ? '<div class="mkt-sc">' + tbl([{ t: 'Проект' }, { t: 'Статус' }, { t: 'Что можно' }, { t: 'Дата' }, { t: 'Заметка' }, { t: 'Отметил' }, { t: 'Постов' }, { t: '' }], rows.map(r => `<tr${m.rights.consents ? ` class="row-click" data-act="mktCs" data-id="${r.project.id}"` : ''}><td><b>${esc(r.project.name)}</b><div class="faint" style="font-size:12px">${esc(r.project.client)}</div></td><td>${chip(r.status, CS_CHIP)}</td><td>${esc(r.what.map(w => m.what[w]).join(', '))}</td><td>${fdate(r.date)}</td><td>${esc(ui.cut(r.note, 60))}</td><td>${esc(r.byName)}</td><td>${r.posts || ''}</td><td>${m.rights.consents ? '<span class="btn sm">✎</span>' : ''}</td></tr>`)) + '</div>' : empty('Проектов в «Проектах» пока нет'));
      ui.ACT.mktCs = ({ id }) => { const r = rows.find(x => x.project.id === id);
        modal(r.project.name, `<form>${ui.field({ name: 'status', label: 'Публикация', type: 'select', options: Object.entries(m.consent) }, r.status)}<div class="field"><label>Что можно</label><div class="mkt-ch">${Object.entries(m.what).map(([k, l]) => `<label><input type="checkbox" name="what" value="${k}"${r.what.includes(k) ? ' checked' : ''}> ${esc(l)}</label>`).join('')}</div></div>${ui.field({ name: 'date', label: 'Дата согласия / письма', type: 'date' }, r.date || ui.today())}${ui.field({ name: 'note', label: 'Заметка (письмо, условия, кого отметить)', type: 'textarea' }, r.note)}<div class="error"></div><button class="btn primary block" type="submit">Сохранить</button></form>`,
          async v => { v.what = [...document.querySelectorAll('#modal-body input[name=what]:checked')].map(x => x.value); await api('/mkt/consents/' + encodeURIComponent(id), { method: 'PUT', body: v }); toast('Сохранено'); rerender(); }); };
      bind(main);
    };

    // ---- итоги месяца ----
    ui.SECTIONS.mktmonth = async main => {
      const [all, m] = await Promise.all([api('/mkt/metrics'), meta()]); const mon = params().get('m') || all[0].month; const cur = all.find(x => x.month === mon) || all[0];
      const man = cur.manual || { channels: {}, vacancyResponses: 0, note: '' }; const ro = m.rights.editor ? '' : ' disabled';
      const bars = (arr, k) => { const mx = Math.max(1, ...arr.map(x => x.n)); return arr.length ? arr.map(x => `<div style="display:grid;grid-template-columns:minmax(120px,40%) 1fr 30px;gap:8px;align-items:center;font-size:13px;margin-bottom:6px"><span>${esc(x[k])}</span><div class="bar"><i style="width:${Math.round(x.n / mx * 100)}%"></i></div><b>${x.n}</b></div>`).join('') : '<div class="faint" style="font-size:13px">Нет данных</div>'; };
      main.innerHTML = head('Итоги месяца', ui.mname(cur.month), sel('mkt-mon', all.map(x => [x.month, ui.mname(x.month)]), cur.month)) +
        `<div class="grid g2" style="margin-bottom:14px"><div class="card"><div class="label">Опубликовано постов<b>${cur.published.total}</b></div>${bars(cur.published.byRubric, 'rubric')}</div><div class="card"><div class="label">Лиды из «Коммерции» по источникам<b>${cur.leads.total}</b></div>${bars(cur.leads.bySource, 'source')}</div></div>` +
        `<div class="card"><div class="label">Вручную: подписчики и охват за ${esc(ui.mname(cur.month).toLowerCase())}</div><form id="mkt-mf"><div class="tbl mkt-mt" style="box-shadow:none"><table style="min-width:0"><thead><tr><th>Канал</th><th>Подписчики</th><th>Охват</th></tr></thead><tbody>${Object.entries(m.channels).map(([k, l]) => { const c = (man.channels || {})[k] || {}; return `<tr><td>${esc(l)}</td><td><input type="number" min="0" name="${k}.followers" value="${c.followers || ''}"${ro}></td><td><input type="number" min="0" name="${k}.reach" value="${c.reach || ''}"${ro}></td></tr>`; }).join('')}</tbody></table></div>
<div class="form-row" style="margin-top:10px">${ui.field({ name: 'vacancyResponses', label: 'Отклики на вакансии', type: 'number', min: 0 }, man.vacancyResponses || '')}${ui.field({ name: 'note', label: 'Заметка' }, man.note)}</div>${m.rights.editor ? '<button class="btn primary" type="submit">Сохранить</button>' : ''}${cur.manual && cur.manual.updatedAt ? ` <span class="faint" style="font-size:12px">изменено ${fdate(MK.almaty(cur.manual.updatedAt))}</span>` : ''}</form></div>` +
        `<h3 style="font-size:14px;margin:18px 0 8px">За год</h3><div class="mkt-sc">` + tbl([{ t: 'Месяц' }, { t: 'Постов', cls: 'amt' }, { t: 'Лидов', cls: 'amt' }, { t: 'Instagram, подп.', cls: 'amt' }, { t: 'Охват Instagram', cls: 'amt' }, { t: 'Отклики', cls: 'amt' }],
          all.map(x => `<tr class="row-click" data-m="${x.month}"><td>${esc(ui.mname(x.month))}</td><td class="amt">${x.published.total || ''}</td><td class="amt">${x.leads.total || ''}</td><td class="amt">${(x.manual && x.manual.channels.instagram.followers) || ''}</td><td class="amt">${(x.manual && x.manual.channels.instagram.reach) || ''}</td><td class="amt">${(x.manual && x.manual.vacancyResponses) || ''}</td></tr>`)) + '</div>';
      $('#mkt-mon').onchange = e => { location.hash = '#/mktmonth?m=' + e.target.value; };
      main.querySelectorAll('tr[data-m]').forEach(tr => { tr.onclick = () => { location.hash = '#/mktmonth?m=' + tr.dataset.m; }; });
      $('#mkt-mf').onsubmit = async e => { e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target).entries()); const body = { channels: {}, vacancyResponses: fd.vacancyResponses, note: fd.note };
        for (const k of Object.keys(m.channels)) body.channels[k] = { followers: fd[k + '.followers'], reach: fd[k + '.reach'] };
        try { await api('/mkt/metrics/' + cur.month, { method: 'PUT', body }); toast('Сохранено'); rerender(); } catch (er) { toast(er.message); } };
    };
  },
});
