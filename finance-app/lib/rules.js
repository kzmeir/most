'use strict';
// Матрица прав: роль × коллекция × действие. Истина — здесь, на сервере.
const ROLES = ['owner', 'partner', 'accountant', 'pm'];
const ADMIN = ['owner', 'partner', 'accountant'];

// коллекции, которые ПМ видит (только чтение)
const PM_READ = ['docs', 'invoices', 'projects'];
// финансовые коллекции — только admin-роли
const ADMIN_ONLY = ['income', 'expenses', 'payroll', 'obligations', 'cash', 'taxes', 'audit'];

const ROLE_LABEL = { owner: 'Владелец', partner: 'Партнёр', accountant: 'Бухгалтер', pm: 'Проджект-менеджер' };

function can(role, collection, action) {
  if (!ROLES.includes(role)) return false;
  if (collection === 'users') return role === 'owner';
  if (collection === 'settings') return action === 'read' ? ADMIN.includes(role) : role === 'owner';
  if (ADMIN.includes(role)) return true; // admin-роли: всё
  // pm
  if (PM_READ.includes(collection)) return action === 'read';
  return false;
}
const isAdmin = role => ADMIN.includes(role);

module.exports = { ROLES, ADMIN, PM_READ, ADMIN_ONLY, ROLE_LABEL, can, isAdmin };
