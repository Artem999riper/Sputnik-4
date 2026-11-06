// Дашборд: сводка /api/dashboard — объёмы, темп и прогноз, отставание от срока, лента, внимание, люди
const test = require('node:test'), assert = require('node:assert');
const { startServer } = require('./helpers');
let S;
test.before(async () => { S = await startServer(); });
test.after(async () => { if (S) await S.stop(); });
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

test('дашборд: прогноз по темпу, отставание, лента за сегодня, задачи и вахты', async () => {
  const s = (await S.api('POST', '/api/sites', { name: 'Объект-дш', end_date: day(5), status: 'active' })).body;
  const v = (await S.api('POST', `/api/sites/${s.id}/volumes`, { name: 'Скважины', amount: 20, unit: 'скв' })).body;
  // 7 скважин за неделю → темп 1/день, осталось 13 → прогноз через 13 дней > срока через 5
  for (let i = 0; i < 7; i++) assert.strictEqual((await S.api('POST', `/api/volumes/${v.id}/progress`, { work_date: day(-i), completed: 1 })).status, 200);
  await S.api('POST', `/api/sites/${s.id}/tasks`, { title: 'Просроченная задача', due_date: day(-1) });
  const r = await S.api('GET', '/api/dashboard');
  assert.strictEqual(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  const ds = r.body.sites.find(x => x.id === s.id);
  assert.ok(ds, 'объект в сводке');
  const dv = ds.volumes[0];
  assert.strictEqual(dv.done, 7); assert.strictEqual(dv.last7, 7);
  assert.strictEqual(Math.round(ds.pct), 35);
  assert.strictEqual(dv.forecast, day(13));
  assert.strictEqual(ds.late, true);
  assert.ok(r.body.attention.some(a => a.kind === 'late' && a.site_id === s.id));
  assert.ok(r.body.attention.some(a => a.kind === 'task' && a.sev === 2), 'просроченная задача');
  assert.ok(r.body.feed.some(f => f.site_id === s.id && f.date === r.body.today && f.done === 1), 'лента за сегодня');
  assert.strictEqual(r.body.weeks.length, 13);
  assert.ok(ds.weekly.reduce((a, b) => a + b, 0) > 34.9, 'по неделям — 35 % плана');
  assert.ok(r.body.people && Array.isArray(r.body.people.onShift));
});
