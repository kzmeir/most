/* Модуль «Документы и канцелярия» — экраны. Поток I. Помощники интерфейса приходят в init(ui) (docs/ARCHITECTURE.md). Логика — modules/office/domain.js (window.MostOffice). */
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'office',
  title: 'Документы',
  nav: [
    { id: 'officeletters', label: 'Письма', icon: '✉' },
    { id: 'officeissues', label: 'Выдача документации', icon: '📦', can: u => !!window.MostOffice && (window.MostOffice.isReader(u) || window.MostOffice.isProjectRole(u)) },
    { id: 'officeorders', label: 'Приказы', icon: '📜' },
    { id: 'officetemplates', label: 'Шаблоны и бланки', icon: '🖨', can: u => !!window.MostOffice && window.MostOffice.isClerk(u) },
  ],
  routes: ['officeletter', 'officeissue', 'officeorder'],
  canOpen: u => !!u,
  help: [
    ['Что такое «Документы»', `
<p>Документооборот бюро: входящие и исходящие письма, выдача документации заказчику, приказы и бланки. Акты, счета и ЭСФ сюда не вносим — их выписывает бухгалтер в 1С.</p>
<p>Номера присваиваются сами — по компании MOST и году: <code>ВХ-MP-2026-001</code> — входящее, <code>ИСХ-MP-2026-001</code> — исходящее, <code>НК-…</code> — накладная, <code>ПР-…</code> — приказ (MP — MOST Project, MA — MOST Architects, MD — ИП MOST Design, PD — ИП PANA Design).</p>
<p>Цифры в меню: у «Писем» — сколько писем ждут ответа (у сотрудника — только его), у «Приказов» — с чем нужно ознакомиться.</p>`],
    ['Письма', `
<ol>
<li><b>Пришло письмо</b> — «+ Входящее»: компания MOST, от кого, тема, их номер и дата, проект (если есть), ответственный и <b>срок ответа</b>. Прикрепите скан (PDF, DOCX, XLSX, JPG, PNG до 20 МБ).</li>
<li>Ответственный видит письмо у себя, ставит «В работе».</li>
<li><b>Отвечаем</b> — в карточке входящего кнопка «Ответить»: создаётся исходящее «в ответ на №», а входящее само становится «Ответ отправлен».</li>
<li>Исходящее печатается <b>на бланке</b> компании («Печать на бланке» → «Печать / PDF»). Печать и подпись ставятся на бумаге — в системе только место «М.П.».</li>
</ol>
<p>Красным — просроченные (срок прошёл, ответа нет). Фильтры: «Ждут ответа», «Просрочено», «Мои».</p>
<p><b>Кто что может:</b> регистрируют и правят письма владелец, партнёр и секретарь; ГИП и ПМ — по своим проектам; ответственный меняет статус, пишет заметку и прикрепляет файлы; бухгалтер только читает; удаляет только руководитель.</p>`, 'officeletters'],
    ['Выдача документации', `
<ol>
<li>«+ Накладная»: проект, стадия, кому передаём, способ (бумага / электронно).</li>
<li>Комплекты — по строке: <code>Марка | Наименование | Листов | Изм. | Экз.</code>, например <code>АР | Архитектурные решения | 45 | 1 | 2</code>.</li>
<li>«Печать накладной» — два экземпляра на подпись: «Передал» и «Принял».</li>
<li>Когда заказчик расписался — «Отметка о получении»: дата и кто принял.</li>
</ol>
<p>Выдачу оформляют канцелярия и ГИП/ПМ своего проекта. Файлы для заказчика кладём по статье «Как выдавать документацию заказчику» в «Знаниях».</p>`, 'officeissues'],
    ['Приказы', `
<ol>
<li>Руководитель или секретарь: «+ Приказ» — тип (назначение ГИП/ПМ, отпуск, премия, прочее), заголовок, текст (подставляется стандартный — поправьте), кого ознакомить.</li>
<li>Сотрудник видит приказ у себя и нажимает <b>«Ознакомлен»</b> — отметка с датой.</li>
<li>«Печать» — приказ на бланке со списком ознакомленных для бумажных подписей.</li>
</ol>
<p>В приказах — только Ф.И.О.; ИИН и другие персональные данные не вносим. Приказ видят руководители, секретарь, бухгалтер и те, кого в нём ознакомили.</p>`, 'officeorders'],
    ['Шаблоны и бланки', `
<p><b>Реквизиты компаний</b> — наименование, город, адрес, контакты, БИН, руководитель — попадают в шапку бланков. Правит руководитель.</p>
<p><b>Шаблоны</b> письма, накладной и приказа — HTML с полями: <code>{{поле}}</code> — текст, <code>{{{поле}}}</code> — готовый блок (текст письма, таблица). Реквизиты — <code>{{c.fullName}}</code>, <code>{{c.director}}</code> и т. п. Печать и подпись в шаблоны не вставляем. «Вернуть стандартный» восстанавливает исходный вариант.</p>`, 'officetemplates'],
  ],
  init(ui) {
    const { api, esc, fdate, head, tbl, empty, chip, modal, formHtml, toast, bind, params, route, ACT, SECTIONS, $ } = ui;
    const O = window.MostOffice;
    let S = { companies: [], projects: [] };

    document.head.insertAdjacentHTML('beforeend', `<style>
.office-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}.office-bar input[type=search]{flex:1;min-width:180px}.office-bar select{width:auto;flex:0 0 auto}.office-nowrap{white-space:nowrap}
.office-card{max-width:900px}.office-kv{display:grid;grid-template-columns:170px 1fr;gap:6px 12px;font-size:13.5px}.office-kv span{color:var(--ink-soft)}
.office-files{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}.office-files a{font-size:12.5px}
tr.office-over td{color:var(--crit)}.office-text{white-space:pre-wrap;line-height:1.5}
.office-editor textarea{width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12px;min-height:260px}.office-hint{font-size:12px;color:var(--ink-soft);margin:4px 0 8px;white-space:pre-line}
</style>`);

    async function loadSummary() { try { S = Object.assign(S, await api('/office/summary')); } catch { } ui.setBadge('officeletters', S.waiting || 0); ui.setBadge('officeorders', S.ordersToAck || 0); return S; }
    const section = fn => async main => { await loadSummary(); await fn(main); };
    const peopleOpts = first => [...(first ? [['', first]] : []), ...ui.state.people.map(p => [p.id, p.name])];
    const companyOpts = () => S.companies.map(c => [c, c]);
    const projectOpts = (first, onlyMine) => [...(first ? [['', first]] : []), ...S.projects.filter(p => !onlyMine || p.mine || S.canClerk).map(p => [p.id, p.name])];
    const wide = w => { const c = $('#modal .modal-card'); if (c) c.style.maxWidth = w; };
    const printUrl = (kind, id) => `/api/office/print/${kind}/${id}`;
    ACT.officePrint = ({ kind, id }) => window.open(printUrl(kind, id), '_blank');
    const ST = { new: ['warn', 'Новое'], work: ['accent', 'В работе'], answered: ['ok', 'Ответ отправлен'], closed: ['neutral', 'Закрыто'], draft: ['neutral', 'Черновик'], sent: ['ok', 'Отправлено'] };

    // ---------- письма ----------
    const letterForm = (dir, v = {}) => [
      { name: 'company', label: 'Компания MOST', type: 'select', options: companyOpts(), half: true },
      { name: 'date', label: dir === 'in' ? 'Дата регистрации' : 'Дата', type: 'date', half: true },
      { name: 'correspondent', label: dir === 'in' ? 'От кого' : 'Кому (адресат для бланка)', required: true },
      { name: 'subject', label: 'Тема', required: true },
      ...(dir === 'in' ? [{ name: 'theirNo', label: 'Их исх. №', half: true }, { name: 'theirDate', label: 'Их дата', type: 'date', half: true }, { name: 'due', label: 'Срок ответа', type: 'date', half: true }] : []),
      { name: 'responsibleId', label: 'Ответственный', type: 'select', options: peopleOpts('—'), half: true },
      { name: 'pid', label: 'Проект', type: 'select', options: projectOpts('— без проекта —', !S.canClerk) },
      ...(dir === 'out' ? [{ name: 'text', label: 'Текст письма (для бланка; абзацы — с новой строки)', type: 'textarea' }] : []),
    ];
    const letterModal = (dir, v, onSave) => { modal(dir === 'in' ? 'Входящее письмо' : 'Исходящее письмо', formHtml(letterForm(dir, v), v), onSave); const ta = $('#modal-body textarea[name=text]'); if (ta) ta.rows = 10; wide('760px'); };

    SECTIONS.officeletters = section(async main => {
      const p = params(); const dir = p.get('dir') || 'in'; const f = { dir, waiting: p.get('waiting') || '', overdue: p.get('overdue') || '', mine: p.get('mine') || '', q: p.get('q') || '', company: p.get('company') || '' };
      const list = await api('/office/letters?' + ui.qsOf(f));
      const canNew = S.canClerk || S.canProject;
      const btns = canNew ? `<button class="btn" data-act="officeNew" data-dir="in">+ Входящее</button> <button class="btn primary" data-act="officeNew" data-dir="out">+ Исходящее</button>` : '';
      const tab = (d, l) => `<a href="#/officeletters?dir=${d}" class="${dir === d ? 'active' : ''}">${l}</a>`;
      const flag = (k, l) => `<label class="chip ${f[k] ? 'accent' : 'neutral'}" style="cursor:pointer"><input type="checkbox" data-flag="${k}" ${f[k] ? 'checked' : ''} style="display:none">${l}</label>`;
      main.innerHTML = head('Письма', `Ждут ответа: ${S.waiting || 0}${S.overdue ? ` · <span style="color:var(--crit)">просрочено ${S.overdue}</span>` : ''}`, btns) +
        `<div class="tabs">${tab('in', 'Входящие')}${tab('out', 'Исходящие')}</div>
        <div class="office-bar"><input type="search" id="office-q" placeholder="Номер, тема, корреспондент, проект…" value="${esc(f.q)}">${ui.sel('office-co', companyOpts(), f.company, 'Все компании')}${dir === 'in' ? flag('waiting', 'Ждут ответа') + flag('overdue', 'Просрочено') : ''}${flag('mine', 'Мои')}</div>` +
        (list.length ? tbl([{ t: '№' }, { t: 'Дата' }, { t: dir === 'in' ? 'От кого' : 'Кому' }, { t: 'Тема' }, { t: 'Проект' }, { t: 'Ответственный' }, { t: dir === 'in' ? 'Срок' : '' }, { t: 'Статус' }],
          list.map(l => `<tr class="${l.overdue ? 'office-over' : ''}" style="cursor:pointer" data-act="officeOpen" data-id="${l.id}"><td class="office-nowrap"><b>${esc(l.no)}</b></td><td>${fdate(l.date)}</td><td>${esc(ui.cut(l.correspondent, 40))}</td><td>${esc(ui.cut(l.subject, 60))}${(l.files || []).length ? ' 📎' : ''}</td><td>${esc(ui.cut(l.project, 30))}</td><td>${esc(l.responsible || '—')}</td><td>${dir === 'in' && l.due ? fdate(l.due) + (l.waiting && l.daysLeft != null ? ` <span class="faint">(${l.daysLeft < 0 ? 'просрочено ' + -l.daysLeft + ' дн.' : l.daysLeft + ' дн.'})</span>` : '') : ''}</td><td>${chip(l.status, ST)}</td></tr>`)) : empty('Писем нет'));
      const go = extra => location.hash = '#/officeletters?' + ui.qsOf(Object.assign({}, f, { q: $('#office-q').value.trim(), company: $('#office-co').value }, extra || {}));
      $('#office-q').onkeydown = e => { if (e.key === 'Enter') go(); }; $('#office-co').onchange = () => go();
      main.querySelectorAll('input[data-flag]').forEach(i => i.onchange = () => go({ [i.dataset.flag]: i.checked ? '1' : '' }));
      ACT.officeOpen = ({ id }) => location.hash = '#/officeletter?id=' + id;
      ACT.officeNew = ({ dir: d }) => letterModal(d, { company: S.companies[0], date: ui.today() }, async v => { const l = await api('/office/letters', { method: 'POST', body: Object.assign(v, { dir: d }) }); toast('Зарегистрировано: ' + l.no); location.hash = '#/officeletter?id=' + l.id; });
      bind(main);
    });

    SECTIONS.officeletter = section(async main => {
      const l = await api('/office/letters/' + params().get('id'));
      const statuses = O.LETTER_STATUS[l.dir];
      const btns = [
        l.dir === 'in' && (S.canClerk || S.canProject) ? '<button class="btn primary" data-act="officeReply">↩ Ответить</button>' : '',
        l.dir === 'out' ? `<button class="btn" data-act="officePrint" data-kind="letter" data-id="${l.id}">🖨 Печать на бланке</button>` : '',
        l.canEdit ? '<button class="btn" data-act="officeEdit">✎ Изменить</button>' : '',
        l.canDelete ? '<button class="btn danger" data-act="officeDel">✕</button>' : ''].join(' ');
      const kv = (k, v) => v ? `<span>${k}</span><div>${v}</div>` : '';
      main.innerHTML = head(`${l.no} · ${l.dir === 'in' ? 'входящее' : 'исходящее'}`, `<a href="#/officeletters?dir=${l.dir}">← к письмам</a>`, btns) +
        `<div class="card office-card"><div class="office-kv">
          ${kv('Тема', `<b>${esc(l.subject)}</b>`)}${kv('Компания MOST', esc(l.company))}${kv('Дата', fdate(l.date))}
          ${kv(l.dir === 'in' ? 'От кого' : 'Кому', esc(l.correspondent))}${kv('Их номер и дата', l.theirNo ? esc(l.theirNo) + (l.theirDate ? ' от ' + fdate(l.theirDate) : '') : '')}
          ${kv('Проект', esc(l.project))}${kv('Ответственный', esc(l.responsible))}
          ${kv('Срок ответа', l.due ? fdate(l.due) + (l.overdue ? ' <span class="chip crit">просрочено</span>' : '') : '')}
          ${kv('В ответ на', l.replyToNo ? `<a href="#/officeletter?id=${l.replyTo}">${esc(l.replyToNo)}</a>` : '')}
          ${kv('Ответы', l.answers.map(x => `<a href="#/officeletter?id=${x.id}">${esc(x.no)}</a> от ${fdate(x.date)}`).join(', '))}
          <span>Статус</span><div>${l.canWork ? ui.sel('office-status', statuses, l.status) : chip(l.status, ST)}</div>
        </div>
        ${l.text ? `<h4 style="margin:14px 0 6px">Текст</h4><div class="office-text">${esc(l.text)}</div>` : ''}
        <h4 style="margin:14px 0 6px">Заметка исполнителя</h4>${l.canWork ? `<textarea id="office-note" rows="3" style="width:100%">${esc(l.note || '')}</textarea><button class="btn sm" id="office-note-save" style="margin-top:6px">Сохранить заметку</button>` : `<div class="office-text">${esc(l.note || '—')}</div>`}
        <h4 style="margin:14px 0 6px">Файлы</h4><div class="office-files">${(l.files || []).map(f => `<span class="chip neutral"><a href="/api/office/letters/${l.id}/files/${f.key}" target="_blank">📎 ${esc(f.name)}</a> <span class="faint">${Math.round(f.size / 1024)} КБ</span>${l.canEdit ? ` <a href="#" data-act="officeFileDel" data-key="${f.key}" title="Удалить">✕</a>` : ''}</span>`).join('') || '<span class="faint">нет</span>'}</div>
        ${l.canWork ? '<div style="margin-top:8px"><input type="file" id="office-file" accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"> <span class="faint">PDF, DOCX, XLSX, JPG, PNG до 20 МБ</span></div>' : ''}
        </div>`;
      const st = $('#office-status'); if (st) st.onchange = async () => { await api('/office/letters/' + l.id, { method: 'PUT', body: { status: st.value } }); toast('Статус изменён'); route(); };
      const ns = $('#office-note-save'); if (ns) ns.onclick = async () => { await api('/office/letters/' + l.id, { method: 'PUT', body: { note: $('#office-note').value } }); toast('Сохранено'); };
      const fi = $('#office-file'); if (fi) fi.onchange = () => { const file = fi.files[0]; if (!file) return; if (file.size > O.MAX_FILE) return toast('Файл больше 20 МБ'); const r = new FileReader(); r.onload = async () => { try { await api(`/office/letters/${l.id}/files`, { method: 'POST', body: { name: file.name, data: r.result } }); toast('Файл прикреплён'); route(); } catch (e) { toast(e.message, 5000); } }; r.readAsDataURL(file); };
      ACT.officeFileDel = async ({ key }) => { if (!confirm('Удалить файл?')) return; await api(`/office/letters/${l.id}/files/${key}`, { method: 'DELETE' }); route(); };
      ACT.officeEdit = () => letterModal(l.dir, l, async v => { await api('/office/letters/' + l.id, { method: 'PUT', body: v }); toast('Сохранено'); route(); });
      ACT.officeDel = async () => { if (!confirm(`Удалить письмо ${l.no}? Номер не освободится.`)) return; await api('/office/letters/' + l.id, { method: 'DELETE' }); location.hash = '#/officeletters?dir=' + l.dir; };
      ACT.officeReply = () => letterModal('out', { company: l.company, date: ui.today(), correspondent: l.correspondent, subject: 'Ответ: ' + l.subject, pid: l.pid, responsibleId: l.responsibleId }, async v => { const o = await api('/office/letters', { method: 'POST', body: Object.assign(v, { dir: 'out', replyTo: l.id }) }); toast('Исходящее ' + o.no); location.hash = '#/officeletter?id=' + o.id; });
      bind(main);
    });

    // ---------- выдача документации ----------
    const issueForm = () => [
      { name: 'pid', label: 'Проект', type: 'select', options: projectOpts('— выберите —', !S.canClerk), required: true },
      { name: 'company', label: 'Компания MOST', type: 'select', options: companyOpts(), half: true },
      { name: 'date', label: 'Дата', type: 'date', half: true },
      { name: 'stage', label: 'Стадия (ЭП, РП, «на стройку»…)', half: true },
      { name: 'method', label: 'Способ', type: 'select', options: O.ISSUE_METHOD, half: true },
      { name: 'recipient', label: 'Кому (организация, должность, Ф.И.О.)', required: true },
      { name: 'items', label: 'Комплекты — по строке: Марка | Наименование | Листов | Изм. | Экз.', type: 'textarea', required: true },
      { name: 'note', label: 'Примечание' },
    ];
    const issueModal = (v, onSave) => { modal('Накладная', formHtml(issueForm(), Object.assign({}, v, { items: typeof v.items === 'string' ? v.items : O.itemsToText(v.items) })), onSave); const ta = $('#modal-body textarea[name=items]'); if (ta) { ta.rows = 8; ta.placeholder = 'АР | Архитектурные решения | 45 | 1 | 2'; } wide('820px'); };
    SECTIONS.officeissues = section(async main => {
      const list = await api('/office/issues' + (params().get('pid') ? '?pid=' + encodeURIComponent(params().get('pid')) : ''));
      const btn = S.canClerk || S.canProject ? '<button class="btn primary" data-act="officeIssueNew">+ Накладная</button>' : '';
      main.innerHTML = head('Выдача документации', 'Реестр накладных: что, кому и когда передали', btn) + (list.length ? tbl([{ t: '№' }, { t: 'Дата' }, { t: 'Проект' }, { t: 'Стадия' }, { t: 'Кому' }, { t: 'Комплектов', cls: 'num' }, { t: 'Способ' }, { t: 'Получено' }],
        list.map(x => `<tr style="cursor:pointer" data-act="officeIssueOpen" data-id="${x.id}"><td class="office-nowrap"><b>${esc(x.no)}</b></td><td>${fdate(x.date)}</td><td>${esc(ui.cut(x.project, 40))}</td><td>${esc(x.stage || '')}</td><td>${esc(ui.cut(x.recipient, 40))}</td><td class="num">${(x.items || []).length}</td><td>${esc(x.methodLabel)}</td><td>${x.received ? `<span class="chip ok">${fdate(x.received.at)}</span>` : '<span class="chip warn">нет отметки</span>'}</td></tr>`)) : empty('Накладных пока нет'));
      ACT.officeIssueOpen = ({ id }) => location.hash = '#/officeissue?id=' + id;
      ACT.officeIssueNew = () => issueModal({ company: S.companies[0], date: ui.today(), method: 'paper', items: '' }, async v => { const x = await api('/office/issues', { method: 'POST', body: v }); toast('Накладная ' + x.no); location.hash = '#/officeissue?id=' + x.id; });
      bind(main);
    });
    SECTIONS.officeissue = section(async main => {
      const x = await api('/office/issues/' + params().get('id'));
      const btns = [`<button class="btn primary" data-act="officePrint" data-kind="issue" data-id="${x.id}">🖨 Печать накладной</button>`, x.canEdit ? '<button class="btn" data-act="officeIssueRec">✓ Отметка о получении</button> <button class="btn" data-act="officeIssueEdit">✎</button>' : '', x.canDelete ? '<button class="btn danger" data-act="officeIssueDel">✕</button>' : ''].join(' ');
      main.innerHTML = head('Накладная ' + x.no, '<a href="#/officeissues">← к реестру</a>', btns) +
        `<div class="card office-card"><div class="office-kv"><span>Проект</span><div><b>${esc(x.project)}</b></div><span>Стадия</span><div>${esc(x.stage || '—')}</div><span>Компания</span><div>${esc(x.company)}</div><span>Дата</span><div>${fdate(x.date)}</div><span>Кому</span><div>${esc(x.recipient)}</div><span>Способ</span><div>${esc(x.methodLabel)}</div><span>Получено</span><div>${x.received ? `${fdate(x.received.at)}${x.received.by ? ' — ' + esc(x.received.by) : ''}` : '<span class="chip warn">нет отметки</span>'}</div>${x.note ? `<span>Примечание</span><div>${esc(x.note)}</div>` : ''}</div></div>` +
        tbl([{ t: 'Марка' }, { t: 'Наименование' }, { t: 'Листов', cls: 'num' }, { t: 'Изм.' }, { t: 'Экз.', cls: 'num' }], (x.items || []).map(i => `<tr><td>${esc(i.mark)}</td><td>${esc(i.title)}</td><td class="num">${esc(i.sheets)}</td><td>${esc(i.rev)}</td><td class="num">${esc(i.copies)}</td></tr>`));
      ACT.officeIssueEdit = () => issueModal(x, async v => { await api('/office/issues/' + x.id, { method: 'PUT', body: v }); toast('Сохранено'); route(); });
      ACT.officeIssueRec = () => modal('Отметка о получении', formHtml([{ name: 'at', label: 'Дата получения', type: 'date', half: true }, { name: 'by', label: 'Кто принял', half: true }], x.received || { at: ui.today() }, 'Отметить'), async v => { await api('/office/issues/' + x.id, { method: 'PUT', body: { received: v } }); toast('Отмечено'); route(); });
      ACT.officeIssueDel = async () => { if (!confirm('Удалить накладную ' + x.no + '?')) return; await api('/office/issues/' + x.id, { method: 'DELETE' }); location.hash = '#/officeissues'; };
      bind(main);
    });

    // ---------- приказы ----------
    let orderBodies = null;
    const orderModal = (v, onSave) => {
      const people = ui.state.people;
      const checks = `<div class="field"><label>Кого ознакомить</label><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:4px;max-height:200px;overflow:auto">${people.map(p => `<label style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" name="acq" value="${p.id}" style="width:auto" ${(v.acquaint || []).includes(p.id) ? 'checked' : ''}>${esc(p.name)}</label>`).join('')}</div></div>`;
      const html = formHtml([{ name: 'type', label: 'Тип', type: 'select', options: O.ORDER_TYPES, half: true }, { name: 'company', label: 'Компания MOST', type: 'select', options: companyOpts(), half: true }, { name: 'date', label: 'Дата', type: 'date', half: true }, { name: 'title', label: 'Заголовок («О назначении …»)', required: true }, { name: 'text', label: 'Текст приказа (только Ф.И.О., без ИИН)', type: 'textarea' }], v, 'Сохранить').replace('<div class="error">', checks + '<div class="error">');
      modal('Приказ', html, async vals => { vals.acquaint = [...document.querySelectorAll('#modal-body input[name=acq]:checked')].map(i => i.value); delete vals.acq; await onSave(vals); });
      const ta = $('#modal-body textarea[name=text]'); if (ta) ta.rows = 9; wide('820px');
      const typeSel = $('#modal-body select[name=type]'); if (typeSel && !v.id) typeSel.onchange = () => { if (orderBodies && ta && (!ta.value.trim() || Object.values(orderBodies).includes(ta.value))) ta.value = orderBodies[typeSel.value] || ''; };
    };
    SECTIONS.officeorders = section(async main => {
      const list = await api('/office/orders');
      const btn = S.canClerk ? '<button class="btn primary" data-act="officeOrderNew">+ Приказ</button>' : '';
      main.innerHTML = head('Приказы', S.ordersToAck ? `Ждут вашего ознакомления: ${S.ordersToAck}` : 'Приказы и внутренние документы', btn) + (list.length ? tbl([{ t: '№' }, { t: 'Дата' }, { t: 'Тип' }, { t: 'Заголовок' }, { t: 'Ознакомлены' }, { t: '' }],
        list.map(x => { const n = x.people.filter(p => p.at).length; return `<tr style="cursor:pointer" data-act="officeOrderOpen" data-id="${x.id}"><td class="office-nowrap"><b>${esc(x.no)}</b></td><td>${fdate(x.date)}</td><td>${esc(x.typeLabel)}</td><td>${esc(ui.cut(x.title, 70))}</td><td>${n} из ${x.people.length}</td><td>${x.mustAck ? (x.acked ? '<span class="chip ok">вы ознакомлены</span>' : '<span class="chip warn">ознакомьтесь</span>') : ''}</td></tr>`; })) : empty('Приказов нет'));
      ACT.officeOrderOpen = ({ id }) => location.hash = '#/officeorder?id=' + id;
      ACT.officeOrderNew = async () => { if (!orderBodies) { try { orderBodies = (await api('/office/templates')).orderBodies; } catch { orderBodies = O.ORDER_BODY; } } orderModal({ type: 'other', company: S.companies[0], date: ui.today(), text: (orderBodies || O.ORDER_BODY).other, acquaint: [] }, async v => { const x = await api('/office/orders', { method: 'POST', body: v }); toast('Приказ ' + x.no); location.hash = '#/officeorder?id=' + x.id; }); };
      bind(main);
    });
    SECTIONS.officeorder = section(async main => {
      const x = await api('/office/orders/' + params().get('id'));
      const btns = [x.mustAck && !x.acked ? '<button class="btn primary" data-act="officeAck">✓ Ознакомлен</button>' : '', `<button class="btn" data-act="officePrint" data-kind="order" data-id="${x.id}">🖨 Печать</button>`, x.canEdit ? '<button class="btn" data-act="officeOrderEdit">✎</button>' : '', x.canDelete ? '<button class="btn danger" data-act="officeOrderDel">✕</button>' : ''].join(' ');
      main.innerHTML = head(`Приказ ${x.no}`, `<a href="#/officeorders">← к приказам</a> · ${esc(x.typeLabel)} · ${fdate(x.date)} · ${esc(x.company)}`, btns) +
        `<div class="card office-card"><h3 style="margin:0 0 10px">${esc(x.title)}</h3><div class="office-text">${esc(x.text || '')}</div></div>` +
        `<h3 style="margin-top:18px">Ознакомление</h3>` + (x.people.length ? tbl([{ t: 'Сотрудник' }, { t: 'Дата ознакомления' }], x.people.map(p => `<tr><td>${esc(p.name)}</td><td>${p.at ? `<span class="chip ok">${new Date(p.at).toLocaleDateString('ru-RU')}</span>` : '<span class="faint">—</span>'}</td></tr>`)) : empty('Список не задан'));
      ACT.officeAck = async () => { await api(`/office/orders/${x.id}/ack`, { method: 'POST' }); toast('Отмечено: ознакомлен'); route(); };
      ACT.officeOrderEdit = () => orderModal(x, async v => { await api('/office/orders/' + x.id, { method: 'PUT', body: v }); toast('Сохранено'); route(); });
      ACT.officeOrderDel = async () => { if (!confirm('Удалить приказ ' + x.no + '?')) return; await api('/office/orders/' + x.id, { method: 'DELETE' }); location.hash = '#/officeorders'; };
      bind(main);
    });

    // ---------- шаблоны и реквизиты ----------
    SECTIONS.officetemplates = section(async main => {
      const r = await api('/office/templates'); orderBodies = r.orderBodies;
      main.innerHTML = head('Шаблоны и бланки', r.canEdit ? 'Реквизиты компаний и HTML-шаблоны печатных форм' : 'Правит руководитель; здесь можно посмотреть') +
        `<h3>Реквизиты компаний</h3>` + tbl([{ t: 'Компания' }, { t: 'Код' }, { t: 'На бланке' }, { t: 'Руководитель' }, { t: '' }], r.companies.map(c => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.code)}</td><td>${esc(c.data.fullName)}${c.data.address ? '<br><span class="faint">' + esc(c.data.address) + '</span>' : ''}</td><td>${esc(c.data.director || '—')}</td><td>${r.canEdit ? `<button class="btn sm" data-act="officeCo" data-name="${esc(c.name)}">✎</button>` : ''}</td></tr>`)) +
        `<h3 style="margin-top:18px">Шаблоны</h3>` + tbl([{ t: 'Шаблон' }, { t: '' }, { t: '' }], r.templates.map(tp => `<tr><td><b>${esc(tp.title)}</b></td><td>${tp.custom ? '<span class="chip accent">свой вариант</span>' : '<span class="chip neutral">стандартный</span>'}</td><td>${r.canEdit ? `<button class="btn sm" data-act="officeTpl" data-kind="${tp.kind}">✎ Изменить</button>` : ''}</td></tr>`)) +
        `<p class="office-hint">Печать и подпись в шаблоны не вставляем — на бланке остаётся место «М.П.». Поля: {{no}}, {{dateLong}}, {{correspondent}}, {{subject}}, {{{body}}}, {{c.fullName}}, {{c.director}} и др.</p>`;
      ACT.officeCo = ({ name }) => { const c = r.companies.find(z => z.name === name); modal('Реквизиты: ' + name, formHtml(r.fields.map(([k, l]) => ({ name: k, label: l })), c.data), async v => { await api('/office/templates/company', { method: 'PUT', body: { company: name, data: v } }); toast('Сохранено'); route(); }); wide('640px'); };
      ACT.officeTpl = ({ kind }) => {
        const tp = r.templates.find(z => z.kind === kind);
        modal(tp.title, `<form class="office-editor"><div class="office-hint">{{поле}} — текст, {{{поле}}} — готовый блок. Скрипты и обработчики событий запрещены.</div><textarea name="html">${esc(tp.html)}</textarea><div class="error"></div><div style="display:flex;gap:8px;margin-top:8px"><button class="btn primary" type="submit">Сохранить</button><button class="btn" type="button" id="office-tpl-reset">Вернуть стандартный</button></div></form>`, async v => { await api('/office/templates/' + kind, { method: 'PUT', body: { html: v.html } }); toast('Шаблон сохранён'); route(); });
        wide('960px');
        $('#office-tpl-reset').onclick = async () => { if (!confirm('Вернуть стандартный шаблон?')) return; await api('/office/templates/' + kind, { method: 'PUT', body: { reset: true } }); ui.closeModal(); toast('Возвращён стандартный'); route(); };
      };
      bind(main);
    });

    setTimeout(() => { if (ui.state.user) loadSummary(); }, 1200);
    setInterval(() => { if (ui.state.user) loadSummary(); }, 300000);
  },
});
