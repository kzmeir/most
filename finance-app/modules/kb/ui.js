/* Модуль «Знания» — экраны. Поток D. Помощники интерфейса приходят в init(ui) (см. docs/ARCHITECTURE.md). */
(window.MOST_MODULES = window.MOST_MODULES || []).push({
  id: 'kb',
  title: 'Знания',
  nav: [
    { id: 'kbnews', label: 'Новости', icon: '📰' },
    { id: 'kbbase', label: 'База знаний', icon: '📚' },
    { id: 'kbcourses', label: 'Обучение', icon: '🎓' },
    { id: 'kbtests', label: 'Тесты', icon: '✔' },
  ],
  canOpen: () => false, // скрыт, пока модуль не готов: заменить на проверку роли
  init(ui) {
    const todo = title => async main => { main.innerHTML = ui.head(title, 'Раздел в разработке.'); };
    Object.assign(ui.SECTIONS, { kbnews: todo('Новости'), kbbase: todo('База знаний'), kbcourses: todo('Обучение'), kbtests: todo('Тесты') });
  },
});
