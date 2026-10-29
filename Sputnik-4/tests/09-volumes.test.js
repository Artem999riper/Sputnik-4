// Объёмы на слоях KML: план и выполнение считаются по объектам слоя,
// ручные объёмы, пересчёт % объекта, перенос старых объёмов в слои.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { startServer } = require('./helpers');

let S;
test.before(async () => { S = await startServer(); });
test.after(async () => { if (S) await S.stop(); });
const ok = (r, msg) => assert.ok(r.status >= 200 && r.status < 300, `${msg}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
const pt = (lng, lat, props) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lng, lat] } });
const fc = features => JSON.stringify({ type: 'FeatureCollection', features });

async function site(name) { const r = await S.api('POST', '/api/sites', { name, lat: 66, lng: 75 }); ok(r, 'site'); return r.body.id; }
async function siteData(id) { return (await S.api('GET', `/api/sites/${id}`)).body; }

test('объём на слое: план и выполнение из объектов, глубина, исключение, %', async () => {
  const sid = await site('Объект-слой');
  const feats = [pt(75, 66, { name: 'С1', глубина: 10 }), pt(75.001, 66, { name: 'С2', глубина: 10 }), pt(75.002, 66, { name: 'С3', глубина: '10,0' })];
  const lid = (await S.api('POST', '/api/layers', { name: 'Скважины', geojson: fc(feats) })).body.id;
  const r = await S.api('POST', `/api/sites/${sid}/volumes`, { name: 'Бурение', layer_id: lid, measure_json: { main: 'count', unit: 'скв', second: { field: 'глубина', unit: 'п.м.' } } });
  ok(r, 'объём'); const vid = r.body.id;
  let d = await siteData(sid), v = d.volumes.find(x => x.id === vid);
  assert.strictEqual(v.amount, 3); assert.strictEqual(v.amount2, 30); assert.strictEqual(v.unit, 'скв');
  // объектам раздан постоянный _uid
  let layer = (await S.api('GET', `/api/layers/${lid}`)).body;
  const g = JSON.parse(layer.geojson); assert.ok(g.features.every(f => f.properties._uid));
  // второй объём на том же слое — нельзя
  assert.strictEqual((await S.api('POST', `/api/sites/${sid}/volumes`, { name: 'Дубль', layer_id: lid })).status, 400);
  // выполнить 2 скважины, одну — с фактической глубиной 12
  Object.assign(g.features[0].properties, { _done: 1, _done_date: '2026-05-03', _fact2: 12, _workers: 'w1,w2' });
  Object.assign(g.features[1].properties, { _done: 1, _done_date: '2026-05-04' });
  ok(await S.api('PUT', `/api/layers/${lid}`, { name: 'Скважины', geojson: JSON.stringify(g) }), 'отметка');
  d = await siteData(sid);
  let rows = d.vol_progress.filter(p => p.volume_id === vid);
  assert.strictEqual(rows.length, 2);
  assert.ok(rows.every(p => p.source === 'kml'));
  assert.strictEqual(rows.reduce((s, p) => s + p.completed, 0), 2);
  assert.strictEqual(rows.reduce((s, p) => s + p.amount2, 0), 22);
  assert.strictEqual(rows.find(p => p.amount2 === 12).worker_ids, 'w1,w2');
  assert.strictEqual(d.completion_percent, 67);
  // строку из слоя руками не изменить и не удалить
  assert.strictEqual((await S.api('PUT', `/api/vol_progress/${rows[0].id}`, { completed: 5 })).status, 400);
  assert.strictEqual((await S.api('DELETE', `/api/vol_progress/${rows[0].id}`)).status, 400);
  // снять отметку и исключить третью скважину
  delete g.features[1].properties._done; g.features[2].properties._skip = 1;
  ok(await S.api('PUT', `/api/layers/${lid}`, { name: 'Скважины', geojson: JSON.stringify(g) }), 'снять');
  d = await siteData(sid); v = d.volumes.find(x => x.id === vid);
  assert.strictEqual(v.amount, 2); assert.strictEqual(v.amount2, 20);
  assert.strictEqual(d.vol_progress.filter(p => p.volume_id === vid).length, 1);
  assert.strictEqual(d.completion_percent, 50);
  // удалить слой — объём обнулён; отвязать — строки из слоя уходят
  ok(await S.api('PUT', `/api/volumes/${vid}`, { layer_id: null }), 'отвязать');
  d = await siteData(sid);
  assert.strictEqual(d.vol_progress.filter(p => p.volume_id === vid).length, 0);
  assert.strictEqual(d.volumes.find(x => x.id === vid).name, 'Бурение');   // частичная правка не стёрла поля
});

test('объём на линиях: длина в км', async () => {
  const sid = await site('Объект-линии');
  const ln = { type: 'Feature', properties: { name: 'Профиль' }, geometry: { type: 'LineString', coordinates: [[75, 66], [75, 66.01]] } };
  const lid = (await S.api('POST', '/api/layers', { name: 'Профили', geojson: fc([ln]) })).body.id;
  const vid = (await S.api('POST', `/api/sites/${sid}/volumes`, { name: 'Нивелирование', layer_id: lid, measure_json: { main: 'length', unit: 'км' } })).body.id;
  const v = (await siteData(sid)).volumes.find(x => x.id === vid);
  assert.ok(Math.abs(v.amount - 1.113) < 0.01, String(v.amount));
});

test('ручной объём: выполнение числом, люди и техника сохраняются при правке', async () => {
  const sid = await site('Объект-ручной');
  const vid = (await S.api('POST', `/api/sites/${sid}/volumes`, { name: 'Камеральная обработка', amount: 10, unit: 'отч.' })).body.id;
  const pid = (await S.api('POST', `/api/volumes/${vid}/progress`, { site_id: sid, work_date: '2026-05-01', completed: 4 })).body.id;
  assert.strictEqual((await siteData(sid)).completion_percent, 40);
  ok(await S.api('PUT', `/api/vol_progress/${pid}`, { worker_ids: 'a,b', machine_id: 'm1' }), 'правка');
  const p = (await siteData(sid)).vol_progress.find(x => x.id === pid);
  assert.strictEqual(p.worker_ids, 'a,b'); assert.strictEqual(p.machine_id, 'm1'); assert.strictEqual(p.completed, 4);
  assert.strictEqual(p.source, 'manual');
});

test('объёмы сотрудника: точное совпадение id', async () => {
  const sid = await site('Объект-люди');
  const vid = (await S.api('POST', `/api/sites/${sid}/volumes`, { name: 'Работа', amount: 10 })).body.id;
  const w1 = (await S.api('POST', '/api/pgk/workers', { name: 'Один' })).body.id;
  await S.api('POST', `/api/volumes/${vid}/progress`, { site_id: sid, work_date: '2026-05-01', completed: 3, worker_ids: w1 + 'x' });
  await S.api('POST', `/api/volumes/${vid}/progress`, { site_id: sid, work_date: '2026-05-02', completed: 2, worker_ids: 'q,' + w1 });
  const list = (await S.api('GET', `/api/pgk/workers/${w1}/vol_progress`)).body;
  assert.strictEqual(list.length, 1); assert.strictEqual(list[0].completed, 2); assert.ok(list[0].id);
});

test('перенос старых объёмов в слои', async () => {
  // база в старом формате: сначала сервер создаёт схему, затем пишем данные «как раньше»
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgk_mig_'));
  let S2 = await startServer({ dir, keep: true });
  await S2.stop();
  const Database = require('better-sqlite3');
  const db = new Database(path.join(dir, 'test.db'));
  db.prepare("DELETE FROM app_settings WHERE key='volumes_kml_v1'").run();
  db.prepare("INSERT INTO sites(id,name) VALUES('s1','Старый объект')").run();
  const plan = fc([pt(75, 66, { sem: { type: 'borehole', data: { depth: 8 } } }), pt(75.01, 66, { sem: { type: 'borehole', data: { depth: 8 } } })]);
  db.prepare("INSERT INTO volumes(id,site_id,category,name,amount,unit,geojson) VALUES('v1','s1','geology','Бурение',16,'п.м.',?)").run(plan);
  db.prepare("INSERT INTO volumes(id,site_id,category,name,amount,unit) VALUES('v2','s1','geology','Отчёт',1,'шт')").run();
  const fpt = JSON.stringify(pt(75.00005, 66, { sem: { type: 'borehole', data: { depth: 9 } } }));
  db.prepare("INSERT INTO vol_progress(id,volume_id,site_id,work_date,completed,geojson,worker_ids) VALUES('p1','v1','s1','2026-04-10',9,?,'w9')").run(fpt);
  db.prepare("INSERT INTO vol_progress(id,volume_id,site_id,work_date,completed) VALUES('p2','v1','s1','2026-04-11',3)").run();
  db.prepare("INSERT INTO vol_progress(id,volume_id,site_id,work_date,completed) VALUES('p3','v2','s1','2026-04-12',1)").run();
  db.close();
  S2 = await startServer({ dir });
  try {
    let d;
    for (let i = 0; i < 40; i++) { d = (await S2.api('GET', '/api/sites/s1')).body; if (d.volumes.find(v => v.id === 'v1').layer_id) break; await new Promise(r => setTimeout(r, 150)); }
    const v1 = d.volumes.find(v => v.id === 'v1'), v2 = d.volumes.find(v => v.id === 'v2');
    assert.ok(v1.layer_id, 'объём с точками стал слоем');
    assert.ok(!v2.layer_id, 'объём без геометрии остался ручным');
    const m = JSON.parse(v1.measure_json);
    assert.strictEqual(m.main, 'count'); assert.strictEqual(m.second.field, 'глубина');
    assert.strictEqual(v1.amount, 2); assert.strictEqual(v1.amount2, 16);
    const layer = (await S2.api('GET', `/api/layers/${v1.layer_id}`)).body;
    const f = JSON.parse(layer.geojson).features;
    assert.strictEqual(f.length, 2);
    const done = f.find(x => x.properties._done);
    assert.strictEqual(done.properties._done_date, '2026-04-10'); assert.strictEqual(done.properties._fact2, 9);
    assert.strictEqual(done.properties._workers, 'w9'); assert.strictEqual(done.properties['тип'], 'Скважина');
    const rows = d.vol_progress.filter(p => p.volume_id === 'v1');
    assert.strictEqual(rows.filter(p => p.source === 'kml').length, 1);
    const man = rows.find(p => p.id === 'p2'); assert.ok(man, 'факт без точки остался'); assert.strictEqual(man.amount2, 3);
    assert.ok(d.vol_progress.find(p => p.id === 'p3'));
    assert.ok(fs.readdirSync(path.join(dir, 'backups')).some(n => n.startsWith('backup_before_volumes_kml_')), 'резервная копия');
    assert.ok(JSON.parse((await S2.api('GET', '/api/app-settings/volumes_kml_v1')).body.value ? JSON.stringify((await S2.api('GET', '/api/app-settings/volumes_kml_v1')).body.value) : 'null'));
  } finally { await S2.stop(); }
});

test('второй показатель: число из текста поля, одинаково на объект, при выполнении', async () => {
  const sid = await site('Объект-п.м.');
  const feats = [pt(75, 66, { name: 'А', глуб: '10 м' }), pt(75.001, 66, { name: 'Б', глуб: 'Н=12,5' }), pt(75.002, 66, { name: 'В', глуб: 'нет данных' })];
  const lid = (await S.api('POST', '/api/layers', { name: 'Текстовые глубины', geojson: fc(feats) })).body.id;
  const vid = (await S.api('POST', `/api/sites/${sid}/volumes`, { name: 'Бурение', layer_id: lid, measure_json: { main: 'count', unit: 'скв', second: { source: 'field', field: 'глуб', unit: 'п.м.' } } })).body.id;
  let v = (await siteData(sid)).volumes.find(x => x.id === vid);
  assert.strictEqual(v.amount2, 22.5);
  // одинаково на объект: 8 × 3, исключённый не считается
  ok(await S.api('PUT', `/api/volumes/${vid}`, { measure_json: { main: 'count', unit: 'скв', second: { source: 'fixed', value: 8, unit: 'п.м.' } } }), 'fixed');
  v = (await siteData(sid)).volumes.find(x => x.id === vid); assert.strictEqual(v.amount2, 24);
  const g = JSON.parse((await S.api('GET', `/api/layers/${lid}`)).body.geojson);
  g.features[2].properties._skip = 1;
  Object.assign(g.features[0].properties, { _done: 1, _done_date: '2026-06-01' });
  ok(await S.api('PUT', `/api/layers/${lid}`, { name: 'Текстовые глубины', geojson: JSON.stringify(g) }), 'отметка');
  let d = await siteData(sid); v = d.volumes.find(x => x.id === vid);
  assert.strictEqual(v.amount2, 16); assert.strictEqual(d.vol_progress.find(p => p.volume_id === vid).amount2, 8);
  // при выполнении: план — общим числом, факт — только вписанный
  ok(await S.api('PUT', `/api/volumes/${vid}`, { measure_json: { main: 'count', unit: 'скв', second: { source: 'fact', plan: 100, unit: 'п.м.' } } }), 'fact');
  d = await siteData(sid); v = d.volumes.find(x => x.id === vid);
  assert.strictEqual(v.amount2, 100); assert.strictEqual(d.vol_progress.find(p => p.volume_id === vid).amount2, 0);
  g.features[0].properties._fact2 = 14.5;
  ok(await S.api('PUT', `/api/layers/${lid}`, { name: 'Текстовые глубины', geojson: JSON.stringify(g) }), 'факт');
  d = await siteData(sid);
  assert.strictEqual(d.vol_progress.find(p => p.volume_id === vid).amount2, 14.5);
});
