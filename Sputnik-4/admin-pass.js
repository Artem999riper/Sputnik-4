// admin-pass.js — показать/сбросить пароль администратора (для start.bat).
//   node admin-pass.js        → показать текущий пароль (если сохранён)
//   node admin-pass.js reset  → сбросить пароль (задать заново в панели)
const path = require('path');
let Database;
try { Database = require('better-sqlite3'); }
catch (e) { console.log('\n  Сначала выполните "npm install" (не найден better-sqlite3).\n'); process.exit(1); }

const dbPath = path.join(__dirname, 'survey.db');
let db;
try { db = new Database(dbPath); }
catch (e) { console.log('\n  Не удалось открыть базу survey.db:', e.message, '\n'); process.exit(1); }

const getVal = (k) => { try { const r = db.prepare('SELECT value FROM app_settings WHERE key=?').get(k); return r ? r.value : null; } catch (e) { return null; } };
const arg = (process.argv[2] || '').toLowerCase().replace(/^-+/, '');

if (arg === 'reset') {
  try { db.prepare("DELETE FROM app_settings WHERE key IN ('admin_pw','admin_pw_plain','admin_token')").run(); } catch (e) {}
  db.close();
  console.log('\n  ======================================================');
  console.log('  Пароль администратора СБРОШЕН.');
  console.log('  Откройте приложение с ПК-сервера (http://localhost:3000),');
  console.log('  нажмите кнопку со щитом -> Настройки и задайте новый пароль.');
  console.log('  ======================================================\n');
  process.exit(0);
}

const plain = getVal('admin_pw_plain');
const hash = getVal('admin_pw');
db.close();
console.log('');
if (plain) {
  console.log('  ======================================================');
  console.log('  Пароль администратора:  ' + plain);
  console.log('  ======================================================');
} else if (hash) {
  console.log('  Пароль администратора задан, но сохранён только в зашифрованном');
  console.log('  виде (задан до обновления) - показать его нельзя.');
  console.log('  Сбросьте его пунктом меню "Reset admin password" и задайте новый.');
} else {
  console.log('  Пароль администратора НЕ задан.');
  console.log('  С ПК-сервера (localhost) вход в админ-панель открыт без пароля.');
}
console.log('');
