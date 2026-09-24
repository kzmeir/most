/* Модуль «Сервис» — экран «Состояние системы» (владелец, партнёр). Поток E. Помощники — docs/ARCHITECTURE.md.
   Уведомления сюда не входят — отложены решением директора (docs/ARCHITECTURE.md, «Решения директора»). */
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'sys',
  title: 'Сервис',
  nav: [{ id: 'sysstatus', label: 'Состояние системы', icon: '⚙' }],
  canOpen: u => !!u && (u.role === 'owner' || u.role === 'partner'),
  init(ui) {
    const { api, head, esc, fdate } = ui;
    const fmtSize = n => !n ? '0 КБ' : n > 1024 * 1024 * 1024 ? (n / 1024 / 1024 / 1024).toFixed(1) + ' ГБ' : n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' МБ' : Math.round(n / 1024) + ' КБ';
    const fmtHours = h => h < 1 ? Math.round(h * 60) + ' мин' : h < 48 ? Math.round(h) + ' ч' : Math.round(h / 24) + ' дн';
    const fmtUptime = s => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return (d ? d + ' дн ' : '') + (h ? h + ' ч ' : '') + m + ' мин'; };
    const TASK_RESULT = { 0: ['ok', 'успешно'], 267009: ['warn', 'выполняется'], 267011: ['neutral', 'ни разу не запускалась'] };

    ui.SECTIONS.sysstatus = async main => {
      const st = await api('/sys/status');
      const kv = (k, v) => `<div class="kv"><span>${esc(k)}</span><b>${v}</b></div>`;

      const backupBlock = st.lastBackup
        ? kv('Последний бэкап', `${esc(st.lastBackup.name)} · ${fmtSize(st.lastBackup.size)} · ${st.lastBackup.stale ? `<span class="chip crit">${fmtHours(st.lastBackup.ageHours)} назад — давно!</span>` : `<span class="chip ok">${fmtHours(st.lastBackup.ageHours)} назад</span>`}`)
        : kv('Последний бэкап', '<span class="chip crit">ни одного ещё не было</span>');
      const taskBlock = st.backupTask
        ? kv('Задача «MOST Финансы - бэкап»', `${fdate(st.backupTask.lastRunTime)} ${new Date(st.backupTask.lastRunTime).toLocaleTimeString('ru-RU')} · ${(() => { const r = TASK_RESULT[st.backupTask.lastTaskResult] || ['neutral', 'код ' + st.backupTask.lastTaskResult]; return `<span class="chip ${r[0]}">${esc(r[1])}</span>`; })()}`)
        : kv('Задача «MOST Финансы - бэкап»', '<span class="muted">не найдена или недоступна на этом компьютере</span>');

      const deployBlock = st.lastDeploy
        ? `<h2>Последняя выкладка</h2><div class="card"><p class="muted" style="margin-top:0">${esc(st.lastDeploy.file)}</p><pre style="white-space:pre-wrap;font-size:12px;margin:0">${esc(st.lastDeploy.lines.join('\n'))}</pre></div>`
        : `<h2>Последняя выкладка</h2><div class="card"><p class="muted" style="margin:0">Выкладок через tools/deploy-to-server ещё не было.</p></div>`;

      const versionBlock = st.deployedVersion
        ? kv('Выложенная версия', `${esc((st.deployedVersion.commit || '').slice(0, 12))} (${esc(st.deployedVersion.branch || '?')}), выложена ${esc(st.deployedVersion.deployed || '?')}`)
        : kv('Выложенная версия', '<span class="muted">файл VERSION не найден — выкладка через tools/deploy-to-server ещё не запускалась</span>');

      const diskBlock = st.disk
        ? kv('Место на диске', `свободно ${fmtSize(st.disk.freeBytes)} из ${fmtSize(st.disk.totalBytes)}${st.disk.freeBytes < 5 * 1024 ** 3 ? ' <span class="chip crit">мало места!</span>' : ''}`)
        : kv('Место на диске', '<span class="muted">не удалось определить</span>');

      const modulesRows = st.modules.map(m => `<tr><td>${esc(m.id)}</td><td>${m.on ? '<span class="chip ok">включён</span>' : '<span class="chip neutral">выключен</span>'}</td><td>${esc(m.site)}</td></tr>`);

      main.innerHTML =
        head('Состояние системы', 'Версия, база, бэкапы, выкладка, диск, модули. Только чтение.') +
        `<div class="card">
          ${kv('Версия кода', esc(st.version))}
          ${versionBlock}
          ${kv('Сайты', esc(st.site))}
          ${kv('Время работы процесса', fmtUptime(st.uptimeSeconds))}
          ${kv('База данных', `${esc(st.dbFile)} · ${fmtSize(st.dbSize)}`)}
          ${diskBlock}
          ${kv('Доступ из интернета', st.tunnelUrl ? `<a href="${esc(st.tunnelUrl)}" target="_blank" rel="noopener">${esc(st.tunnelUrl)}</a>` : '<span class="muted">туннель не запущен</span>')}
          ${kv('Режим разработки', st.devMode ? '<span class="chip warn">включён — DEV_USER задан!</span>' : '<span class="chip ok">выключен</span>')}
        </div>` +
        `<h2>Бэкапы (${st.backupsCount})</h2><div class="card">
          ${backupBlock}
          ${taskBlock}
        </div>` +
        deployBlock +
        `<h2>Модули</h2><div class="card">
          ${ui.tbl([{ t: 'Модуль' }, { t: 'Статус' }, { t: 'Сайт' }], modulesRows)}
        </div>`;
    };
  },
});
