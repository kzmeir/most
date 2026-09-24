/* Модуль «Сервис» — экран «Состояние системы» (только владелец). Поток E. Помощники — docs/ARCHITECTURE.md.
   Уведомления сюда не входят — отложены решением директора (docs/ARCHITECTURE.md, «Решения директора»). */
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'sys',
  title: 'Сервис',
  nav: [{ id: 'sysstatus', label: 'Состояние системы', icon: '⚙' }],
  canOpen: u => !!u && u.role === 'owner',
  init(ui) {
    const { api, head, esc } = ui;
    const fmtSize = n => !n ? '0 КБ' : n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' МБ' : Math.round(n / 1024) + ' КБ';

    ui.SECTIONS.sysstatus = async main => {
      const st = await api('/sys/status');
      const kv = (k, v) => `<div class="kv"><span>${esc(k)}</span><b>${v}</b></div>`;
      main.innerHTML =
        head('Состояние системы', 'Версия, база, бэкапы, доступ из интернета.') +
        `<div class="card">
          ${kv('Версия', esc(st.version))}
          ${kv('База данных', `${esc(st.dbFile)} · ${fmtSize(st.dbSize)}`)}
          ${kv('Бэкапы', st.lastBackup ? `${st.backupsCount} шт., последний ${esc(st.lastBackup.name)} (${fmtSize(st.lastBackup.size)})` : `${st.backupsCount} шт. — ни одного ещё не было`)}
          ${kv('Доступ из интернета', st.tunnelUrl ? `<a href="${esc(st.tunnelUrl)}" target="_blank" rel="noopener">${esc(st.tunnelUrl)}</a>` : '<span class="muted">туннель не запущен</span>')}
          ${kv('Режим разработки', st.devMode ? '<span class="chip warn">включён — DEV_USER задан!</span>' : '<span class="chip ok">выключен</span>')}
        </div>`;
    };
  },
});
