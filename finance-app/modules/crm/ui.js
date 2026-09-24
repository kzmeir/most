/* Модуль «Коммерция» — экраны. Поток C. Помощники интерфейса приходят в init(ui) (см. docs/ARCHITECTURE.md). */
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'crm',
  title: 'Коммерция',
  nav: [
    { id: 'crmleads', label: 'Лиды и воронка', icon: '◔' },
    { id: 'crmpay', label: 'График платежей', icon: '₸' },
    { id: 'crmdocs', label: 'Шаблоны документов', icon: '📝' },
  ],
  canOpen: () => false, // скрыт, пока модуль не готов: заменить на проверку роли
  init(ui) {
    const todo = title => async main => { main.innerHTML = ui.head(title, 'Раздел в разработке.'); };
    Object.assign(ui.SECTIONS, { crmleads: todo('Лиды и воронка'), crmpay: todo('График платежей'), crmdocs: todo('Шаблоны документов') });
  },
});
