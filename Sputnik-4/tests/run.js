// Запуск всех автотестов: node tests/run.js  (или npm test, или start.bat → 7)
// Тесты работают на временной копии — рабочая база survey.db не затрагивается.
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const files = fs.readdirSync(__dirname).filter(f => /\.test\.js$/.test(f)).sort().map(f => path.join(__dirname, f));
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status == null ? 1 : r.status);
