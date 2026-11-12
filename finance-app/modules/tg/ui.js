/* Модуль «Telegram» (tg): подключение своего Telegram (все), настройки уведомлений (владелец, партнёр), токен бота (только владелец).
   Права проверяет сервер (modules/tg/server.js); здесь только показ. Помощники — docs/ARCHITECTURE.md. */
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'tg',
  title: 'Telegram',
  nav: [{ id: 'tgme', label: 'Telegram', icon: '✈' }],
  canOpen: u => !!u,
  help: [['Telegram', '<p>Бот бюро присылает в Telegram уведомления по вашим пунктам: назначения, сроки, возвраты, переносы; руководителям — сводки. Нажмите «Подключить», откройте бота и отправьте ему код: <code>/start КОД</code> (код действует 15 минут). В боте: /settings — какие уведомления получать, /stop — отключить. С 21:00 до 8:00 бот молчит — всё приходит утром.</p><p>Владелец вставляет токен бота (его выдаёт @BotFather) и включает типы уведомлений.</p>', 'tgme']],
  init(ui) {
    const { api, head, esc, toast, bind, ACT, route, fdate } = ui;
    if (!document.getElementById('tg-style')) document.head.insertAdjacentHTML('beforeend', `<style id="tg-style">
      .tg-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))}
      .tg-grid>*{min-width:0}
      .tg-card .kv b{overflow-wrap:anywhere;text-align:right}
      .tg-code{font-size:32px;font-weight:700;letter-spacing:6px;font-variant-numeric:tabular-nums;margin:8px 0}
      .tg-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}
      .tg-row input[type=text],.tg-row input[type=password],.tg-row input[type=url]{flex:1;min-width:0}
      .tg-types label{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--line,#eee);cursor:pointer}
      .tg-types label:last-child{border-bottom:0}
      .tg-types input{margin-top:3px;flex:none;width:auto}
      .tg-types span{min-width:0;overflow-wrap:anywhere}
      .tg-types .muted{font-size:12px}
      .tg-card h2{margin-top:0}
      @media (max-width:480px){.tg-grid{grid-template-columns:1fr}.tg-code{font-size:26px;letter-spacing:4px}}
    </style>`);
    const isOwner = u => u && u.role === 'owner';
    const isLead = u => u && ['owner', 'partner'].includes(u.role);
    const dt = s => s ? `${fdate(String(s).slice(0, 10))} ${new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' })}` : '—';
    const ROLE = { owner: 'Владелец', partner: 'Партнёр', accountant: 'Бухгалтер', secretary: 'Секретарь', pm: 'ПМ', gip: 'ГИП', lead: 'Рук. раздела', staff: 'Сотрудник' };

    ui.SECTIONS.tgme = async main => {
      const u = ui.state.user; const me = await api('/tg/me');
      const [adm, bot] = await Promise.all([isLead(u) ? api('/tg/admin').catch(() => null) : null, isOwner(u) ? api('/tg/bot').catch(() => null) : null]);
      const mine = `<div class="card tg-card"><h2>Мой Telegram</h2>${me.linked
        ? `<p><span class="chip ok">подключён</span> ${esc(me.linked.username ? '@' + me.linked.username : me.linked.firstName || '')} · с ${esc(dt(me.linked.linkedAt))}${me.linked.blocked ? ' <span class="chip warn">бот остановлен в Telegram — напишите боту /start</span>' : ''}</p>
           <div class="tg-row"><button class="btn" data-act="tgUnlink">Отключить</button>${isLead(u) ? ' <button class="btn" data-act="tgTest">Пробное сообщение себе</button>' : ''}</div>`
        : !me.botReady ? `<p class="muted">Бот ещё не подключён${isOwner(u) ? ' — вставьте токен ниже' : ' — его подключает директор'}.</p>`
        : me.code ? `<p>Откройте бота${me.botUsername ? ` <a href="${esc(me.code.deepLink)}" target="_blank" rel="noopener">@${esc(me.botUsername)}</a>` : ''} в Telegram и отправьте:</p><div class="tg-code">/start ${esc(me.code.code)}</div><p class="muted">Код одноразовый, действует до ${esc(dt(me.code.expiresAt))}. ${me.code.deepLink ? 'Можно просто открыть ссылку на бота — код подставится сам.' : ''}</p><div class="tg-row"><button class="btn" data-act="tgCode">Новый код</button> <button class="btn" data-act="tgReload">Я отправил — обновить</button></div>`
        : `<p>Уведомления по вашим пунктам — в личный Telegram. Тихие часы ${esc(me.quiet)}.</p><div class="tg-row"><button class="btn primary" data-act="tgCode">Подключить Telegram</button></div>`}
        ${me.linked ? `<h3>Мои уведомления</h3><div class="tg-types">${me.types.map(t => `<label><input type="checkbox" class="tg-pref" value="${esc(t.key)}"${t.on ? ' checked' : ''}${t.enabled ? '' : ' disabled'}><span>${esc(t.label)}${t.enabled ? '' : ' <span class="muted">— выключено в настройках бота</span>'}</span></label>`).join('')}</div>` : ''}</div>`;

      const botCard = bot ? `<div class="card tg-card"><h2>Бот</h2>
        <div class="kv"><span>Токен</span><b>${bot.tokenSet ? esc(bot.tokenMask) : '<span class="muted">не задан</span>'}</b></div>
        <div class="kv"><span>Бот</span><b>${bot.botUsername ? '@' + esc(bot.botUsername) + (bot.botName ? ' · ' + esc(bot.botName) : '') : '<span class="muted">не проверен</span>'}</b></div>
        <div class="kv"><span>Опрос</span><b>${bot.polling ? '<span class="chip ok">работает</span>' : !bot.moduleOn ? '<span class="chip neutral">модуль выключен</span>' : !bot.tokenSet ? '<span class="chip neutral">молчит — нет токена</span>' : !bot.allowed ? '<span class="chip warn">режим разработки без заглушки</span>' : '<span class="chip warn">не идёт</span>'}${bot.stub ? ' <span class="chip neutral">заглушка Bot API</span>' : ''}</b></div>
        <div class="kv"><span>Последний ответ</span><b>${esc(dt(bot.lastPollOk))}</b></div>
        ${bot.lastError ? `<div class="kv"><span>Ошибка</span><b class="neg">${esc(bot.lastError)}</b></div>` : ''}
        <div class="kv"><span>Очередь</span><b>ждут ${bot.queued}${bot.quiet ? ' (тихие часы)' : ''} · отправлено сегодня ${bot.sentToday} · не доставлено ${bot.failed}</b></div>
        <div class="tg-row"><input type="password" id="tg-token" autocomplete="off" placeholder="Новый токен от @BotFather: 123456789:AA…"><button class="btn primary" data-act="tgToken">Сохранить</button></div>
        <div class="tg-row"><button class="btn" data-act="tgCheck"${bot.tokenSet ? '' : ' disabled'}>Проверить</button>${bot.tokenSet ? ' <button class="btn" data-act="tgTokenClear">Убрать токен</button>' : ''}</div>
        <p class="muted">Токен целиком больше не показывается. Создать бота: @BotFather → /newbot. Бот работает из процесса ERP (опрос Telegram), входящие порты не нужны.</p></div>` : '';

      const S = adm && adm.settings;
      const setCard = adm ? `<div class="card tg-card"><h2>Уведомления бюро</h2><div class="tg-types">${adm.types.map(t => `<label><input type="checkbox" class="tg-type" value="${esc(t.key)}"${S.types[t.key] ? ' checked' : ''}><span>${esc(t.label)}${t.roles.length ? `<br><span class="muted">${esc(t.roles.map(r => ROLE[r] || r).join(', '))}</span>` : ''}</span></label>`).join('')}</div>
        <div class="field"><label>Адрес ERP в ссылках</label><input type="url" id="tg-erp" value="${esc(S.erpUrl)}"></div>
        <div class="field"><label>Адрес «Финансов» (ссылки на обращения)</label><input type="url" id="tg-fin" value="${esc(S.finUrl)}"></div>
        <div class="tg-row"><button class="btn primary" data-act="tgSaveSettings">Сохранить</button></div>
        <p class="muted">Тихие часы 21:00–8:00 по Алматы: всё ждёт утра. Финансов и бюджетов в сообщениях нет.</p></div>` : '';

      const linksCard = adm ? `<div class="card tg-card"><h2>Подключены — ${adm.links.length} из ${adm.people}</h2>${adm.links.length ? ui.tbl([{ t: 'Человек' }, { t: 'Telegram' }, { t: 'С' }, { t: '' }], adm.links.map(l => `<tr><td>${esc(l.name)} <span class="muted">${esc(ROLE[l.role] || l.role)}</span></td><td>${esc(l.username ? '@' + l.username : l.firstName)}${l.blocked ? ' <span class="chip warn">остановил бота</span>' : ''}</td><td>${esc(fdate(String(l.linkedAt).slice(0, 10)))}</td><td><button class="btn" data-act="tgUnlinkUser" data-id="${esc(l.userId)}">Отключить</button></td></tr>`)) : '<p class="muted">Пока никто не подключился.</p>'}</div>` : '';

      main.innerHTML = head('Telegram', 'Уведомления MOST ERP в Telegram') + `<div class="tg-grid">${mine}${botCard}${setCard}${linksCard}</div>`;
      main.querySelectorAll('.tg-pref').forEach(el => el.onchange = async () => { try { await api('/tg/me/prefs', { method: 'PUT', body: { type: el.value, on: el.checked } }); toast(el.checked ? 'Включено' : 'Выключено'); } catch (e) { toast(e.message); el.checked = !el.checked; } });
      bind(main);
    };
    ACT.tgReload = () => route();
    ACT.tgCode = async () => { try { await api('/tg/me/code', { method: 'POST' }); route(); } catch (e) { toast(e.message, 5000); } };
    ACT.tgUnlink = async () => { if (!confirm('Отключить Telegram? Уведомления перестанут приходить.')) return; await api('/tg/me', { method: 'DELETE' }); toast('Отключено'); route(); };
    ACT.tgUnlinkUser = async ({ id }) => { if (!confirm('Отключить Telegram этого человека?')) return; await api('/tg/links/' + encodeURIComponent(id), { method: 'DELETE' }); toast('Отключено'); route(); };
    ACT.tgTest = async () => { try { await api('/tg/admin/test', { method: 'POST' }); toast('Отправлено — проверьте Telegram'); } catch (e) { toast(e.message, 5000); } };
    ACT.tgToken = async () => { const v = document.getElementById('tg-token').value.trim(); if (!v) return toast('Вставьте токен'); try { await api('/tg/bot', { method: 'PUT', body: { token: v } }); toast('Токен сохранён — нажмите «Проверить»'); route(); } catch (e) { toast(e.message, 5000); } };
    ACT.tgTokenClear = async () => { if (!confirm('Убрать токен? Бот замолчит.')) return; await api('/tg/bot', { method: 'PUT', body: { token: '' } }); toast('Токен убран'); route(); };
    ACT.tgCheck = async () => { try { const r = await api('/tg/bot/check', { method: 'POST' }); toast('Бот на связи: @' + r.botUsername); route(); } catch (e) { toast(e.message, 6000); route(); } };
    ACT.tgSaveSettings = async () => {
      const types = {}; document.querySelectorAll('.tg-type').forEach(el => { types[el.value] = el.checked; });
      try { await api('/tg/admin/settings', { method: 'PUT', body: { types, erpUrl: document.getElementById('tg-erp').value, finUrl: document.getElementById('tg-fin').value } }); toast('Сохранено'); route(); } catch (e) { toast(e.message, 5000); }
    };
  },
});
