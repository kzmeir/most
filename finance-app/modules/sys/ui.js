/* Модуль «Сервис» — экраны. Поток E. Помощники интерфейса приходят в init(ui) (см. docs/ARCHITECTURE.md). */
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'sys',
  title: 'Сервис',
  nav: [
    { id: 'sysstatus', label: 'Состояние системы', icon: '⚙' },
  ],
  canOpen: () => false, // скрыт, пока модуль не готов: заменить на проверку роли
  init(ui) {
    const todo = title => async main => { main.innerHTML = ui.head(title, 'Раздел в разработке.'); };
    Object.assign(ui.SECTIONS, { sysstatus: todo('Состояние системы') });
  },
});
