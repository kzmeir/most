/* Модуль «Управление проектами» — экраны. Поток A. Помощники интерфейса приходят в init(ui) (см. docs/ARCHITECTURE.md). */
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'pm',
  title: 'Проекты',
  nav: [
    { id: 'pm', label: 'Сводка', icon: '◎' },
    { id: 'pmep', label: 'Эскизные проекты', icon: '✎' },
    { id: 'pmrp', label: 'Рабочие проекты', icon: '▤' },
    { id: 'pmmy', label: 'Мои задачи', icon: '☑' },
    { id: 'pmbl', label: 'Блокеры', icon: '⛔' },
  ],
  routes: ['pmp'], // карточка проекта: #/pmp?id=…
  canOpen: u => !!window.MostPM && window.MostPM.canOpen(u),
  init(ui) {
    const todo = title => async main => { main.innerHTML = ui.head(title, 'Раздел в разработке.'); };
    Object.assign(ui.SECTIONS, { pm: todo('Сводка по проектам'), pmep: todo('Эскизные проекты'), pmrp: todo('Рабочие проекты'), pmmy: todo('Мои задачи'), pmbl: todo('Блокеры'), pmp: todo('Карточка проекта') });
  },
});
