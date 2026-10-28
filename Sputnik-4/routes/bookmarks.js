// ═══════════════════════════════════════════════════════════
// routes/bookmarks.js — закладки видов карты («Карьер 1Г», «Весь участок»):
// общие для всех пользователей, переход одним щелчком.
// ═══════════════════════════════════════════════════════════
const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');
const { required, wrap } = require('./validate');

module.exports = (app, getDb) => {
  const ready = new WeakSet();
  const db = () => {
    const d = getDb();
    if (!ready.has(d)) {
      d.exec(`CREATE TABLE IF NOT EXISTS map_bookmarks (id TEXT PRIMARY KEY, name TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL,
        zoom REAL NOT NULL, sort_order INTEGER DEFAULT 0, created_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime')))`);
      ready.add(d);
    }
    return d;
  };
  app.get('/api/bookmarks', wrap((req, res) => res.json(all(db(), 'SELECT * FROM map_bookmarks ORDER BY sort_order, name'))));
  app.post('/api/bookmarks', wrap((req, res) => {
    const err = required(['name', 'lat', 'lng', 'zoom'], req.body);
    if (err) return res.status(400).json({ error: err });
    const { name, lat, lng, zoom, user_name } = req.body;
    if (![lat, lng, zoom].every(v => Number.isFinite(+v))) return res.status(400).json({ error: 'Неверные координаты' });
    const id = uuid();
    const n = (get(db(), 'SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM map_bookmarks') || {}).n || 1;
    run(db(), 'INSERT INTO map_bookmarks(id,name,lat,lng,zoom,sort_order,created_by)VALUES(?,?,?,?,?,?,?)',
      [id, String(name).trim().slice(0, 120), +lat, +lng, +zoom, n, user_name || '']);
    res.json({ id });
  }));
  app.put('/api/bookmarks/:id', wrap((req, res) => {
    const b = get(db(), 'SELECT * FROM map_bookmarks WHERE id=?', [req.params.id]);
    if (!b) return res.status(404).json({ error: 'Не найдено' });
    const o = { ...b, ...req.body };
    run(db(), 'UPDATE map_bookmarks SET name=?,lat=?,lng=?,zoom=?,sort_order=? WHERE id=?',
      [String(o.name).trim().slice(0, 120), +o.lat, +o.lng, +o.zoom, +o.sort_order || 0, req.params.id]);
    res.json({ ok: true });
  }));
  app.delete('/api/bookmarks/:id', wrap((req, res) => {
    run(db(), 'DELETE FROM map_bookmarks WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  }));
};
