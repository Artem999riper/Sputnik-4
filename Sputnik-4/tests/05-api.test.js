// API: создание / правка / удаление / отмена по всем основным разделам,
// журнал изменений с откатом, инвентаризация, перевод материалов, права.
// Сервер поднимается на ВРЕМЕННОЙ пустой базе (рабочая не затрагивается).
const test = require('node:test'), assert = require('node:assert');
const os = require('os');
const { startServer } = require('./helpers');

let S;
test.before(async () => { S = await startServer(); });
test.after(async () => { if (S) await S.stop(); });
const ok = (r, msg) => assert.ok(r.status >= 200 && r.status < 300, `${msg}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);

test('версия и статика', async () => {
  const v = await S.api('GET', '/api/version'); ok(v, 'version');
  assert.match(v.body.version, /^\d+\.\d+\.\d+$/); assert.strictEqual(v.body.needRestart, false);
  const r = await fetch(S.base + '/'); assert.strictEqual(r.headers.get('cache-control'), 'no-cache');
});

// Общая проверка раздела: создать → изменить → удалить → отменить удаление
const CRUD = [
  ['сотрудники', '/api/pgk/workers', { name: 'Тест Иван', role: 'геодезист' }, { name: 'Тест Иван', role: 'инженер' }, 'role'],
  ['техника', '/api/pgk/machinery', { name: 'ТРЭКОЛ-1', type: 'ТРЭКОЛ' }, { name: 'ТРЭКОЛ-1', type: 'БУРЛАК', status: 'idle' }, 'type'],
  ['оборудование', '/api/pgk/equipment', { name: 'Тахеометр', serial_number: 'SN-1' }, { name: 'Тахеометр', serial_number: 'SN-1', status: 'broken' }, 'status'],
  ['МТО', '/api/mto', { name: 'GNSS приёмник', category: 'Геодезия' }, { name: 'GNSS приёмник', category: 'Геодезия', condition: 'На ремонте' }, 'condition'],
  ['груз', '/api/cargo', { num: '0001', status: 'new', items: [{ name: 'Трубы', qty: 2 }] }, { num: '0001', status: 'transit', items: [] }, 'status'],
  ['задачи', '/api/gtasks', { title: 'Задача', responsibles: ['Иванов'] }, { title: 'Задача', priority: 'high', responsibles: ['Иванов'] }, 'priority'],
  ['объекты', '/api/sites', { name: 'Объект-1' }, { name: 'Объект-1', client: 'Заказчик' }, 'client'],
];
for (const [label, url, create, update, field] of CRUD) {
  test(`${label}: создание, правка, удаление и отмена удаления`, async () => {
    const c = await S.api('POST', url, create); ok(c, 'создание'); const id = c.body.id; assert.ok(id, 'id');
    ok(await S.api('PUT', `${url}/${id}`, update), 'правка');
    const del = await S.api('DELETE', `${url}/${id}`); ok(del, 'удаление'); assert.ok(del.body._restore, 'данные для отмены');
    const list1 = await S.api('GET', url); assert.ok(!JSON.stringify(list1.body).includes(id), 'удалено из списка');
    ok(await S.api('POST', '/api/restore', del.body._restore), 'отмена');
    const list2 = await S.api('GET', url);
    const arr = Array.isArray(list2.body) ? list2.body : (list2.body.rows || []);
    const row = arr.find(x => x.id === id); assert.ok(row, 'восстановлено');
    assert.strictEqual(String(row[field]), String(update[field]), `${field} сохранено`);
  });
}

test('оборудование: объект и поверка не теряются при правке без этих полей', async () => {
  const c = await S.api('POST', '/api/pgk/equipment', { name: 'Нивелир', site_id: 'S1', calib_date: '2030-01-01' });
  ok(await S.api('PUT', `/api/pgk/equipment/${c.body.id}`, { name: 'Нивелир', responsible: 'Петров' }), 'правка');
  const e = (await S.api('GET', '/api/pgk/equipment')).body.find(x => x.id === c.body.id);
  assert.strictEqual(e.site_id, 'S1'); assert.strictEqual(e.calib_date, '2030-01-01'); assert.strictEqual(e.responsible, 'Петров');
  const h = await S.api('GET', `/api/pgk/equipment/${c.body.id}/history`);
  assert.ok(h.body.some(x => x.field === 'responsible' && x.new_value === 'Петров'), 'история перемещений');
});

test('пакетная отмена удаления нескольких записей', async () => {
  const ids = []; for (let i = 0; i < 3; i++) ids.push((await S.api('POST', '/api/mto', { name: 'Позиция ' + i })).body.id);
  const items = []; for (const id of ids) items.push((await S.api('DELETE', `/api/mto/${id}`)).body._restore);
  const r = await S.api('POST', '/api/restore', { items }); ok(r, 'restore'); assert.strictEqual(r.body.restored, 3);
});

test('бригада: удаление с составом и отмена', async () => {
  const w = (await S.api('POST', '/api/pgk/workers', { name: 'Член бригады' })).body.id;
  const b = (await S.api('POST', '/api/pgk/brigades', { name: 'Бригада 1', member_ids: [w], base_ids: [], site_ids: [] })).body;
  const id = b.id || (await S.api('GET', '/api/pgk/brigades')).body.find(x => x.name === 'Бригада 1').id;
  const del = await S.api('DELETE', `/api/pgk/brigades/${id}`); ok(del, 'удаление'); assert.ok(del.body._restore);
  ok(await S.api('POST', '/api/restore', del.body._restore), 'отмена');
  const br = (await S.api('GET', '/api/pgk/brigades')).body.find(x => x.id === id);
  assert.ok(br && br.member_ids.includes(w), 'состав восстановлен');
});

test('материалы: частичный перевод на другую базу и объединение', async () => {
  const A = (await S.api('POST', '/api/bases', { name: 'База-A', lat: 61, lng: 72 })).body.id;
  const B = (await S.api('POST', '/api/bases', { name: 'База-B', lat: 61, lng: 72 })).body.id;
  const m = (await S.api('POST', `/api/bases/${A}/materials`, { name: 'Труба', amount: 10, unit: 'м' })).body.id;
  await S.api('POST', `/api/bases/${B}/materials`, { name: 'Труба', amount: 5, unit: 'м' });
  const r = await S.api('POST', `/api/materials/${m}/move`, { base_id: B, amount: 3 }); ok(r, 'перевод'); assert.strictEqual(r.body.merged, true);
  const bs = (await S.api('GET', '/api/bases')).body;
  const amt = (bn) => (bs.find(b => b.name === bn).materials || []).find(x => x.name === 'Труба').amount;
  assert.strictEqual(amt('База-A'), 7); assert.strictEqual(amt('База-B'), 8);
});

test('журнал изменений: запись «было → стало» и откат', async () => {
  const id = (await S.api('POST', '/api/pgk/equipment', { name: 'GNSS', status: 'working' })).body.id;
  await S.api('PUT', `/api/pgk/equipment/${id}`, { name: 'GNSS', status: 'broken' }, { 'X-User-Name': encodeURIComponent('Тестер') });
  const a = (await S.api('GET', `/api/audit?row=${id}`)).body.rows;
  const upd = a.find(x => x.kind === 'update'); assert.ok(upd, 'запись об изменении');
  assert.deepStrictEqual(JSON.parse(upd.before), { status: 'working' }); assert.strictEqual(upd.user_name, 'Тестер');
  ok(await S.api('POST', `/api/admin/audit/${upd.id}/rollback`, {}), 'откат');
  const e = (await S.api('GET', '/api/pgk/equipment')).body.find(x => x.id === id); assert.strictEqual(e.status, 'working');
  // удаление → откат восстанавливает
  await S.api('DELETE', `/api/pgk/equipment/${id}`);
  const d = (await S.api('GET', `/api/audit?row=${id}`)).body.rows.find(x => x.kind === 'delete');
  ok(await S.api('POST', `/api/admin/audit/${d.id}/rollback`, {}), 'откат удаления');
  assert.ok((await S.api('GET', '/api/pgk/equipment')).body.some(x => x.id === id));
});

test('инвентаризация: сессия, отметка, «не на своём месте»', async () => {
  const base = (await S.api('POST', '/api/bases', { name: 'Склад', lat: 61, lng: 72 })).body.id;
  const here = (await S.api('POST', '/api/pgk/equipment', { name: 'Рейка', base_id: base })).body.id;
  const there = (await S.api('POST', '/api/pgk/equipment', { name: 'Вешка' })).body.id;
  const sid = (await S.api('POST', '/api/inventory', { name: 'Инв', scope: { base_id: base } })).body.id;
  ok(await S.api('POST', `/api/inventory/${sid}/mark`, { equipment_id: here }), 'отметка');
  ok(await S.api('POST', `/api/inventory/${sid}/mark`, { equipment_id: there }), 'чужая');
  const d = (await S.api('GET', `/api/inventory/${sid}`)).body;
  assert.deepStrictEqual(d.expected.map(e => e.id), [here]); assert.deepStrictEqual(d.extra.map(e => e.id), [there]);
  ok(await S.api('POST', `/api/inventory/${sid}/close`, {}), 'закрытие');
  assert.strictEqual((await S.api('POST', `/api/inventory/${sid}/mark`, { equipment_id: here })).status, 400, 'в закрытую нельзя');
});

test('импорт DXF: предпросмотр слоёв', async () => {
  const dxf = ['0', 'SECTION', '2', 'ENTITIES', '0', 'CIRCLE', '8', 'Колодцы', '10', '3572529', '20', '983088', '40', '5', '0', 'ENDSEC', '0', 'EOF'].join('\n');
  const r = await S.api('POST', '/api/layers/import-dxf', { dxfText: dxf, preview: true }); ok(r, 'preview');
  assert.deepStrictEqual(r.body.layers.map(l => l.name), ['Колодцы']);
});

// Права проверяются для запросов не с самого сервера — нужен сетевой адрес машины
const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal);
test('права по разделам (запрет создания и удаления)', { skip: !lan && 'нет сетевого адреса' }, async () => {
  ok(await S.api('PUT', '/api/admin/acl', { name: 'Петров', caps: { 'equipment.delete': false, 'equipment.create': false } }), 'acl');
  const call = (m, u, b) => fetch(`http://${lan.address}:${S.port}${u}`, { method: m, headers: { 'Content-Type': 'application/json', 'X-User-Name': encodeURIComponent('Петров') }, body: b ? JSON.stringify(b) : undefined });
  assert.strictEqual((await call('POST', '/api/pgk/equipment', { name: 'X' })).status, 403, 'создание запрещено');
  const id = (await S.api('POST', '/api/pgk/equipment', { name: 'Y' })).body.id;
  assert.strictEqual((await call('PUT', `/api/pgk/equipment/${id}`, { name: 'Y2' })).status, 200, 'правка разрешена');
  assert.strictEqual((await call('DELETE', `/api/pgk/equipment/${id}`)).status, 403, 'удаление запрещено');
  assert.strictEqual((await call('POST', '/api/pgk/workers', { name: 'Z' })).status, 200, 'другой раздел не затронут');
});

test('журнал: сводка по пользователям за день и фильтр по дню', async () => {
  const H = { 'X-User-Name': encodeURIComponent('Проверкин') };
  ok(await S.api('POST', '/api/bases', { name: 'База-аудит', lat: 66, lng: 75 }, H), 'база');
  const day = (await S.api('GET', '/api/audit/users')).body.date;
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  const u = (await S.api('GET', `/api/audit/users?date=${day}`)).body.users.find(x => x.user_name === 'Проверкин');
  assert.ok(u && u.changes >= 1 && u.by['База'] >= 1, JSON.stringify(u));
  const rows = (await S.api('GET', `/api/audit?user=${encodeURIComponent('Проверкин')}&date=${day}`)).body.rows;
  assert.ok(rows.some(r => r.name === 'База-аудит'));
  assert.strictEqual((await S.api('GET', `/api/audit?user=${encodeURIComponent('Проверкин')}&date=2000-01-01`)).body.rows.length, 0);
});

test('кто редактирует: начало, другие, окончание', async () => {
  let r = await S.api('POST', '/api/editing', { key: 'worker:1', cid: 'A', name: 'Соколов', action: 'begin' });
  assert.deepStrictEqual(r.body.others, []);
  r = await S.api('POST', '/api/editing', { key: 'worker:1', cid: 'B', name: 'Иванов', action: 'begin' });
  assert.deepStrictEqual(r.body.others.map(x => x.name), ['Соколов']);
  await S.api('POST', '/api/editing', { key: 'worker:1', cid: 'A', action: 'end' });
  r = await S.api('POST', '/api/editing', { key: 'worker:1', cid: 'B', name: 'Иванов', action: 'beat' });
  assert.deepStrictEqual(r.body.others, []);
  assert.strictEqual((await S.api('POST', '/api/editing', { cid: 'B' })).status, 400);
});

test('календарь смен: вахты за период и правка дат', async () => {
  const wid = (await S.api('POST', '/api/pgk/workers', { name: 'Вахтовик' })).body.id;
  const sid = (await S.api('POST', `/api/pgk/workers/${wid}/shifts`, { start_date: '2026-03-01', end_date: '2026-03-30', days: 30 })).body.id;
  let list = (await S.api('GET', '/api/pgk/shifts?from=2026-03-15&to=2026-04-30')).body;
  assert.ok(list.some(s => s.id === sid));
  assert.ok(!(await S.api('GET', '/api/pgk/shifts?from=2026-05-01&to=2026-05-31')).body.some(s => s.id === sid));
  assert.strictEqual((await S.api('PUT', `/api/pgk/workers/shifts/${sid}`, { start_date: '2026-03-10', end_date: '2026-03-01' })).status, 400);
  ok(await S.api('PUT', `/api/pgk/workers/shifts/${sid}`, { start_date: '2026-03-05', end_date: '2026-03-14' }), 'правка');
  const s = (await S.api('GET', `/api/pgk/workers/${wid}/shifts`)).body[0];
  assert.strictEqual(s.start_date, '2026-03-05'); assert.strictEqual(s.days, 10);
});

test('общие настройки интерфейса: админ применяет ко всем', async () => {
  let r = await S.api('GET', '/api/ui-settings');
  const v0 = r.body.version;
  r = await S.api('PUT', '/api/ui-settings', { values: { cluster: false, theme: 'dark', 'bad key': 1, mlbl: 15 }, lock: true }, { 'X-User-Name': encodeURIComponent('Админов') });
  ok(r, 'применить');   // тесты идут с localhost — это админ
  r = (await S.api('GET', '/api/ui-settings')).body;
  assert.strictEqual(r.version, v0 + 1); assert.strictEqual(r.lock, true); assert.strictEqual(r.by, 'Админов');
  assert.deepStrictEqual(r.values, { cluster: false, theme: 'dark', mlbl: 15 });
  assert.strictEqual((await S.api('PUT', '/api/ui-settings', { values: [] })).status, 400);
  ok(await S.api('DELETE', '/api/ui-settings'), 'снять');
  r = (await S.api('GET', '/api/ui-settings')).body;
  assert.deepStrictEqual(r.values, {}); assert.strictEqual(r.version, v0 + 2);
});

test('проверка базы: битые ссылки находятся и исправляются (с резервной копией)', async () => {
  ok(await S.api('POST', '/api/pgk/workers', { name: 'Сирота', base_id: 'нет-такой-базы' }), 'сотрудник');
  let r = (await S.api('GET', '/api/admin/dbcheck?run=1')).body;
  assert.strictEqual(r.integrity, 'ok');
  const it = r.issues.find(x => x.key === 'worker_base');
  assert.ok(it && it.count >= 1 && it.sample.includes('Сирота'), JSON.stringify(r.issues));
  r = (await S.api('POST', '/api/admin/dbcheck/fix', { keys: ['worker_base'] })).body;
  assert.ok(r.fixed >= 1 && /^backup_before_dbfix_/.test(r.backup), JSON.stringify(r));
  assert.ok(!r.check.issues.some(x => x.key === 'worker_base'));
  const w = (await S.api('GET', '/api/pgk/workers')).body.find(x => x.name === 'Сирота');
  assert.ok(w && !w.base_id, 'сотрудник остался, ссылка очищена');
});

test('журнал ошибок: ошибки браузера с именем пользователя, повторы — счётчиком', async () => {
  const H = { 'X-User-Name': encodeURIComponent('Ошибкин') };
  ok(await S.api('POST', '/api/client-errors', { message: 'TypeError: x is undefined', stack: 'at foo', url: '/#map' }, H), 'ошибка 1');
  ok(await S.api('POST', '/api/client-errors', { message: 'TypeError: x is undefined', url: '/#map' }, H), 'ошибка 2');
  let r = (await S.api('GET', '/api/admin/errors?source=client')).body;
  const e = r.rows.find(x => x.message === 'TypeError: x is undefined');
  assert.ok(e && e.user_name === 'Ошибкин' && e.count === 2 && e.stack === 'at foo', JSON.stringify(r.rows));
  assert.ok(r.last24 >= 1);
  ok(await S.api('DELETE', '/api/admin/errors'), 'очистить');
  assert.strictEqual((await S.api('GET', '/api/admin/errors')).body.rows.length, 0);
});

test('план вахт: плановая вахта не попадает в «последний выезд» сотрудника', async () => {
  const wid = (await S.api('POST', '/api/pgk/workers', { name: 'Плановик' })).body.id;
  ok(await S.api('POST', `/api/pgk/workers/${wid}/shifts`, { start_date: '2026-03-01', end_date: '2026-03-20', days: 20 }), 'факт');
  const pid = (await S.api('POST', `/api/pgk/workers/${wid}/shifts`, { start_date: '2099-01-01', end_date: '2099-01-30', days: 30, planned: 1 })).body.id;
  let w = (await S.api('GET', '/api/pgk/workers/summary')).body.find(x => x.id === wid);
  assert.strictEqual(w.last_shift_end, '2026-03-20');
  ok(await S.api('PUT', `/api/pgk/workers/shifts/${pid}`, { planned: 0 }), 'стал фактом');
  w = (await S.api('GET', '/api/pgk/workers/summary')).body.find(x => x.id === wid);
  assert.strictEqual(w.last_shift_end, '2099-01-30');
});

test('очистить список сотрудников: остаются ФИО и должность, все «Дома», вахт нет', async () => {
  const bid = (await S.api('POST', '/api/bases', { name: 'База-сброс', lat: 66, lng: 75 })).body.id;
  const a = (await S.api('POST', '/api/pgk/workers', { name: 'Сбросов', role: 'Бурильщик', base_id: bid, start_date: '2026-10-01', notes: 'заметка' })).body.id;
  ok(await S.api('POST', `/api/pgk/workers/${a}/shifts`, { start_date: '2026-09-01', end_date: '2026-09-10', days: 10 }), 'вахта');
  const r = (await S.api('POST', '/api/admin/workers-reset', {})).body;
  assert.ok(r.ok && /^backup_before_workers_reset_/.test(r.backup), JSON.stringify(r));
  const w = (await S.api('GET', '/api/pgk/workers')).body.find(x => x.id === a);
  assert.deepStrictEqual([w.name, w.role, w.status, w.base_id, w.start_date, w.notes], ['Сбросов', 'Бурильщик', 'home', null, null, '']);
  assert.strictEqual((await S.api('GET', `/api/pgk/workers/${a}/shifts`)).body.length, 0);
});

test('документы сотрудника: добавить, изменить, истекающие, удалить с отменой', async () => {
  const wid = (await S.api('POST', '/api/pgk/workers', { name: 'Документов' })).body.id;
  const soon = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  const id = (await S.api('POST', `/api/pgk/workers/${wid}/docs`, { title: 'Медосмотр', expires: soon })).body.id;
  ok(await S.api('POST', `/api/pgk/workers/${wid}/docs`, { title: 'Допуск', expires: '2099-01-01' }), 'второй');
  assert.strictEqual((await S.api('GET', `/api/pgk/workers/${wid}/docs`)).body.length, 2);
  assert.ok((await S.api('GET', '/api/pgk/worker-docs/expiring?days=30')).body.some(d => d.id === id && d.worker_name === 'Документов'));
  ok(await S.api('PUT', `/api/pgk/worker-docs/${id}`, { number: 'А-1' }), 'правка');
  assert.strictEqual((await S.api('GET', `/api/pgk/workers/${wid}/docs`)).body.find(d => d.id === id).number, 'А-1');
  const del = await S.api('DELETE', `/api/pgk/worker-docs/${id}`); ok(del, 'удалить');
  ok(await S.api('POST', '/api/restore', del.body._restore), 'отмена');
  assert.strictEqual((await S.api('GET', `/api/pgk/workers/${wid}/docs`)).body.length, 2);
});
