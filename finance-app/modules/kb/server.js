'use strict';
// Модуль «Знания»: /api/kb/*. Поток D. Контракт модулей — docs/ARCHITECTURE.md, задачи — modules/kb/README.md.
function handle(ctx) {
  const { parts, method, user, err } = ctx;
  if (!user) return err(401, 'Не авторизован');
  return err(404, 'Модуль «Знания» в разработке');
}

module.exports = { id: 'kb', api: 'kb', collections: ['kbNews', 'kbArticles', 'kbCourses', 'kbTests', 'kbAttempts', 'kbReads'], handle };
