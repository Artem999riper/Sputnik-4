const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../database');

module.exports = (app, ctx) => {
  const { db, wrap } = ctx;

  app.get('/api/volumes', wrap((req, res) => {
    const d = db();
    const sid = req.query.site_id;
    const rows = sid
      ? all(d, 'SELECT * FROM volumes WHERE site_id=? ORDER BY created_at DESC', [sid])
      : all(d, 'SELECT * FROM volumes ORDER BY created_at DESC');
    rows.forEach(v => {
      v.boreholes_count = get(d, 'SELECT COUNT(*) c FROM boreholes WHERE volume_id=?', [v.id]).c;
      v.done_count = get(d, "SELECT COUNT(*) c FROM boreholes WHERE volume_id=? AND status='done'", [v.id]).c;
      v.task_points_count = get(d, 'SELECT COUNT(*) c FROM task_points WHERE volume_id=?', [v.id]).c;
    });
    res.json(rows);
  }));

  app.get('/api/volumes/:id', wrap((req, res) => {
    const d = db();
    const v = get(d, 'SELECT * FROM volumes WHERE id=?', [req.params.id]);
    if (!v) return res.status(404).json({ error: 'not found' });
    v.site = get(d, 'SELECT * FROM sites WHERE id=?', [v.site_id]);
    res.json(v);
  }));

  app.post('/api/volumes', wrap((req, res) => {
    const { site_id, kind, name, total_volume } = req.body || {};
    if (!site_id || !kind || !name) return res.status(400).json({ error: 'site_id, kind, name обязательны' });
    if (!['DRILLING', 'STATIC_PROBE', 'THERMOMETRY'].includes(kind))
      return res.status(400).json({ error: 'kind должен быть DRILLING / STATIC_PROBE / THERMOMETRY' });
    const id = uuidv4();
    run(db(), 'INSERT INTO volumes(id,site_id,kind,name,total_volume) VALUES(?,?,?,?,?)',
      [id, site_id, kind, name, Number(total_volume) || 0]);
    res.json({ id });
  }));

  app.put('/api/volumes/:id', wrap((req, res) => {
    const { name, total_volume } = req.body || {};
    run(db(), 'UPDATE volumes SET name=COALESCE(?,name), total_volume=COALESCE(?,total_volume) WHERE id=?',
      [name || null, total_volume != null ? Number(total_volume) : null, req.params.id]);
    res.json({ ok: true });
  }));

  app.delete('/api/volumes/:id', wrap((req, res) => {
    run(db(), 'DELETE FROM volumes WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  }));
};
