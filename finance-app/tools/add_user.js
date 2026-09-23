#!/usr/bin/env node
'use strict';
/* Создать или обновить пользователя офисной версии из командной строки (без входа в интерфейс).
   Запуск в папке приложения:  node tools/add_user.js <логин> <пароль> [роль] ["Имя"]
   Роли: owner | partner | accountant | secretary | pm.  Пример:
     node tools/add_user.js aigerim Sekret2026 secretary "Айгерим"
   Если логин уже есть — обновляются пароль, роль и имя. Папка данных берётся из DATA_DIR (по умолчанию ./data). */
process.chdir(require('path').join(__dirname, '..'));
const store = require('../lib/store');
const auth = require('../lib/auth');
const D = require('../lib/domain');
const [login, password, role = 'secretary', name] = process.argv.slice(2);
if (!login || !password) { console.error('Использование: node tools/add_user.js <логин> <пароль> [роль] ["Имя"]'); process.exit(1); }
if (String(password).length < 6) { console.error('Пароль не короче 6 символов'); process.exit(1); }
if (!D.ROLES.includes(role)) { console.error('Роль должна быть одной из: ' + D.ROLES.join(', ')); process.exit(1); }
store.load();
const db = store.get();
const { salt, hash } = auth.hashPassword(password);
const lg = String(login).trim().toLowerCase();
const existing = db.users.find(u => u.login === lg);
if (existing) {
  store.update('users', existing.id, { salt, passHash: hash, role, name: name || existing.name, active: true });
  console.log(`Обновлён пользователь «${lg}»: роль ${D.ROLE_LABEL[role]}, пароль заменён.`);
} else {
  store.insert('users', { login: lg, name: name || login, role, salt, passHash: hash, active: true, createdAt: new Date().toISOString() });
  console.log(`Создан пользователь «${lg}»: роль ${D.ROLE_LABEL[role]}.`);
}
store.audit(existing ? existing.id : 'cli', existing ? 'update' : 'create', 'users', lg);
console.log('Адрес для входа в офисе: http://MostServer:3000  (или адрес туннеля из start-internet)');
