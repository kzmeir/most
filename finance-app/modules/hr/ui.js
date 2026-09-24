/* Модуль «Персонал» — экраны. Поток B. Помощники интерфейса приходят в init(ui) (см. docs/ARCHITECTURE.md). */
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'hr',
  title: 'Персонал',
  nav: [
    { id: 'hrtime', label: 'Табель', icon: '⏱' },
    { id: 'hrload', label: 'Загрузка', icon: '▥' },
    { id: 'hrteams', label: 'Команды', icon: '👥' },
  ],
  canOpen: () => false, // скрыт, пока модуль не готов: заменить на проверку роли
  init(ui) {
    const todo = title => async main => { main.innerHTML = ui.head(title, 'Раздел в разработке.'); };
    Object.assign(ui.SECTIONS, { hrtime: todo('Табель'), hrload: todo('Загрузка'), hrteams: todo('Команды') });
  },
});
