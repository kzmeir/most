'use strict';
// Модуль «Персонал»: /api/hr/*. Поток B. Контракт модулей — docs/ARCHITECTURE.md, задачи — modules/hr/README.md.
function handle(ctx) {
  const { parts, method, user, err } = ctx;
  if (!user) return err(401, 'Не авторизован');
  return err(404, 'Модуль «Персонал» в разработке');
}

module.exports = { id: 'hr', api: 'hr', collections: ['hrTimesheets', 'hrTeams'], handle };
