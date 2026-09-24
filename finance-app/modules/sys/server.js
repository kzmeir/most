'use strict';
// Модуль «Сервис»: /api/sys/*. Поток E. Контракт модулей — docs/ARCHITECTURE.md, задачи — modules/sys/README.md.
function handle(ctx) {
  const { parts, method, user, err } = ctx;
  if (!user) return err(401, 'Не авторизован');
  return err(404, 'Модуль «Сервис» в разработке');
}

module.exports = { id: 'sys', api: 'sys', collections: ['sysOutbox'], handle };
