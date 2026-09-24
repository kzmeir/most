'use strict';
// Модуль «Коммерция»: /api/crm/*. Поток C. Контракт модулей — docs/ARCHITECTURE.md, задачи — modules/crm/README.md.
function handle(ctx) {
  const { parts, method, user, err } = ctx;
  if (!user) return err(401, 'Не авторизован');
  return err(404, 'Модуль «Коммерция» в разработке');
}

module.exports = { id: 'crm', api: 'crm', collections: ['crmLeads', 'crmPayments', 'crmTemplates'], handle };
