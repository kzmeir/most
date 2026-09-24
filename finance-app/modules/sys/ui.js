/* Модуль «Сервис» — экран «Состояние системы» (только владелец). Поток E. Помощники — docs/ARCHITECTURE.md. */
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'sys',
  title: 'Сервис',
  nav: [{ id: 'sysstatus', label: 'Состояние системы', icon: '⚙' }],
  canOpen: u => !!u && u.role === 'owner',
  init(ui) {
    const { api, head, tbl, empty, formHtml, toast, bind, ACT, fdate, esc, state, route } = ui;
    const fmtSize = n => !n ? '0 КБ' : n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' МБ' : Math.round(n / 1024) + ' КБ';
    const peopleLabel = id => { const p = state.people.find(x => x.id === id); return p ? p.name : id; };
    const STATUS_CHIP = { pending: ['warn', 'ожидает'], sent: ['ok', 'отправлено'], failed: ['crit', 'ошибка'], skipped: ['neutral', 'пропущено'] };
    const chipOf = s => { const m = STATUS_CHIP[s] || ['neutral', s]; return `<span class="chip ${m[0]}">${esc(m[1])}</span>`; };

    ui.SECTIONS.sysstatus = async main => {
      const [st, outbox, settings] = await Promise.all([
        api('/sys/status'),
        api('/sys/outbox').catch(() => []),
        api('/sys/settings').catch(() => ({ hasToken: false, tokenTail: '', chats: {} })),
      ]);
      const kv = (k, v) => `<div class="kv"><span>${esc(k)}</span><b>${v}</b></div>`;
      main.innerHTML =
        head('Состояние системы', 'Версия, база, бэкапы, доступ из интернета, очередь уведомлений.', '<button class="btn primary" data-act="sysNotifyTest">Тест уведомления себе</button>') +
        `<div class="card">
          ${kv('Версия', esc(st.version))}
          ${kv('База данных', `${esc(st.dbFile)} · ${fmtSize(st.dbSize)}`)}
          ${kv('Бэкапы', st.lastBackup ? `${st.backupsCount} шт., последний ${esc(st.lastBackup.name)} (${fmtSize(st.lastBackup.size)})` : `${st.backupsCount} шт. — ни одного ещё не было`)}
          ${kv('Доступ из интернета', st.tunnelUrl ? `<a href="${esc(st.tunnelUrl)}" target="_blank" rel="noopener">${esc(st.tunnelUrl)}</a>` : '<span class="muted">туннель не запущен</span>')}
          ${kv('Режим разработки', st.devMode ? '<span class="chip warn">включён — DEV_USER задан!</span>' : '<span class="chip ok">выключен</span>')}
        </div>` +
        `<h2>Очередь уведомлений Telegram</h2><div class="card">
          <p class="muted" style="margin-top:0">Ожидают: ${st.outbox.pending} · отправлено: ${st.outbox.sent} · ошибка: ${st.outbox.failed} · пропущено: ${st.outbox.skipped} · всего: ${st.outbox.total}</p>
          ${outbox.length ? tbl(
            [{ t: 'Когда' }, { t: 'Кому' }, { t: 'Текст' }, { t: 'Статус' }, { t: '' }],
            outbox.slice(0, 40).map(o => `<tr><td class="nowrap">${esc(fdate(o.createdAt))}</td><td>${esc(peopleLabel(o.userId))}</td><td>${esc(o.text)}${o.lastError ? `<div class="faint">${esc(o.lastError)}</div>` : ''}</td><td>${chipOf(o.status)}</td><td>${o.status !== 'sent' ? `<button class="btn sm" data-act="sysOutboxRetry" data-id="${esc(o.id)}">Повторить</button>` : ''}</td></tr>`)
          ) : empty('Уведомлений ещё не было')}
        </div>` +
        `<h2>Бот Telegram</h2><div class="card">
          <p class="muted" style="margin-top:0">Создайте бота через <b>@BotFather</b> (команда /newbot), вставьте токен ниже. Chat ID сотрудника — написать боту /start и посмотреть в <b>@userinfobot</b>, либо в ответе Telegram-бота.</p>
          ${formHtml([{ name: 'telegramToken', label: settings.hasToken ? `Токен бота (сохранён, оканчивается на …${esc(settings.tokenTail)})` : 'Токен бота' }], {}, 'Сохранить токен')}
        </div>` +
        `<h2>Chat ID сотрудников</h2><div class="card">
          <p class="muted" style="margin-top:0">По одной паре в строке: <code>id_пользователя chat_id</code>. ID пользователей — в столбце ниже.</p>
          ${tbl([{ t: 'Пользователь' }, { t: 'ID' }, { t: 'Chat ID сейчас' }], state.people.map(p => `<tr><td>${esc(p.name)}</td><td><code>${esc(p.id)}</code></td><td>${esc(settings.chats[p.id] || '—')}</td></tr>`))}
          ${formHtml([{ name: 'chats', label: 'Добавить / изменить', type: 'textarea' }], {}, 'Сохранить chat ID')}
        </div>`;

      const forms = main.querySelectorAll('form');
      forms[0].onsubmit = async e => {
        e.preventDefault();
        await api('/sys/settings', { method: 'PUT', body: { telegramToken: new FormData(e.target).get('telegramToken') } });
        toast('Токен сохранён'); route();
      };
      forms[1].onsubmit = async e => {
        e.preventDefault();
        const raw = String(new FormData(e.target).get('chats') || '');
        const chats = {};
        for (const line of raw.split('\n')) { const [id, chatId] = line.trim().split(/\s+/); if (id && chatId) chats[id] = chatId; }
        if (!Object.keys(chats).length) return toast('Укажите хотя бы одну пару id_пользователя chat_id');
        await api('/sys/settings', { method: 'PUT', body: { chats } });
        toast('Chat ID сохранены'); route();
      };
      bind(main);
    };

    ACT.sysNotifyTest = async () => { const r = await api('/sys/notify/test', { method: 'POST', body: {} }); toast('Отправлено в очередь: ' + r.sent); route(); };
    ACT.sysOutboxRetry = async ({ id }) => { await api(`/sys/outbox/${id}/retry`, { method: 'POST', body: {} }); toast('Повтор запущен'); route(); };
  },
});
