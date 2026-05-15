const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../database');

module.exports = (app, ctx) => {
  const { db, wrap } = ctx;

  app.get('/api/task-points', wrap((req, res) => {
    const d = db();
    const { volume_id } = req.query;
    if (!volume_id) return res.json(all(d, 'SELECT * FROM task_points ORDER BY name'));
    res.json(all(d, 'SELECT * FROM task_points WHERE volume_id=? ORDER BY name', [volume_id]));
  }));

  app.put('/api/task-points/:uuid', wrap((req, res) => {
    const d = db();
    const u = req.params.uuid;
    const t = req.body || {};
    const exists = get(d, 'SELECT uuid FROM task_points WHERE uuid=?', [u]);
    const params = [
      t.volume_id || null,
      t.site_id || null,
      t.name || null,
      t.lat != null && t.lat !== '' ? Number(t.lat) : null,
      t.lng != null && t.lng !== '' ? Number(t.lng) : null,
      t.kml_point_id || null,
      t.completed_date || null,
      Number(t.planned_depth_m) || 0,
      t.notes || null,
      t.brigade_snapshot ? (typeof t.brigade_snapshot === 'string' ? t.brigade_snapshot : JSON.stringify(t.brigade_snapshot)) : null,
    ];
    if (exists) {
      run(d, `UPDATE task_points SET volume_id=?,site_id=?,name=?,lat=?,lng=?,kml_point_id=?,
              completed_date=?,planned_depth_m=?,notes=?,brigade_snapshot=? WHERE uuid=?`,
        [...params, u]);
    } else {
      run(d, `INSERT INTO task_points(volume_id,site_id,name,lat,lng,kml_point_id,completed_date,
              planned_depth_m,notes,brigade_snapshot,uuid) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        [...params, u]);
    }
    res.json({ ok: true });
  }));

  app.delete('/api/task-points/:uuid', wrap((req, res) => {
    run(db(), 'DELETE FROM task_points WHERE uuid=?', [req.params.uuid]);
    res.json({ ok: true });
  }));

  app.patch('/api/task-points/:uuid/complete', wrap((req, res) => {
    run(db(), 'UPDATE task_points SET completed_date=? WHERE uuid=?',
      [req.body?.completed_date || null, req.params.uuid]);
    res.json({ ok: true });
  }));

  // Bulk создание из KML точек
  app.post('/api/task-points/bulk', wrap((req, res) => {
    const { volume_id, site_id, points } = req.body || {};
    if (!volume_id || !Array.isArray(points)) return res.status(400).json({ error: 'volume_id,points' });
    const d = db();
    const ins = d.prepare(`INSERT INTO task_points(uuid,volume_id,site_id,name,lat,lng,kml_point_id,planned_depth_m)
                           VALUES(?,?,?,?,?,?,?,?)`);
    const tx = d.transaction(() => {
      points.forEach(p => {
        ins.run(uuidv4(), volume_id, site_id || null, p.name || null,
          p.lat != null ? Number(p.lat) : null,
          p.lng != null ? Number(p.lng) : null,
          p.kml_point_id || null,
          Number(p.planned_depth_m) || 0);
      });
    });
    tx();
    res.json({ ok: true, count: points.length });
  }));
};
