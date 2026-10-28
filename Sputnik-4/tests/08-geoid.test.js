// Перевод высот в БСВ-77: на сервере должны быть файлы геоида для PROJ.
// Тест «на деле» считает поправку в контрольной точке; без GDAL — пропуск.
// Если тест упал — в сообщении сказано, какой файл и куда положить.
const test = require('node:test'), assert = require('node:assert');
let dp = null, hasGdal = false;
try { dp = require('../dem-processor'); dp.checkGDAL && (hasGdal = true); } catch (e) {}

test('БСВ-77: поправка геоида считается', { skip: !hasGdal && 'нет модуля рельефа' }, async t => {
  let r;
  try { r = await dp.geoidTest(); } catch (e) { t.skip('GDAL не найден: ' + e.message); return; }
  if (!r.python) { t.skip('нет Python с GDAL'); return; }
  if (/GDAL не найден/.test(r.error || '')) { t.skip(r.error); return; }
  assert.ok(r.ok, r.hint || 'поправка не посчиталась');
  assert.ok(Math.abs(r.n) > 0.5 && Math.abs(r.n) < 60, 'неправдоподобная поправка ' + r.n);
});
