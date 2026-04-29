const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');
const { required, wrap } = require('./validate');
const { trashAndDelete } = require('./realtime');

module.exports = (app, getDb, L) => {
  const db = () => getDb();

  // ── WORKERS ────────────────────────────────────────────────
  app.get('/api/pgk/workers', wrap((req, res) =>
    res.json(all(db(), 'SELECT * FROM pgk_workers ORDER BY name'))
  ));

  app.post('/api/pgk/workers', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const id = uuid();
    const { name, role, phone, base_id, machine_id, start_date, notes, user_name } = req.body;
    run(db(), 'INSERT INTO pgk_workers(id,name,role,phone,base_id,machine_id,start_date,notes)VALUES(?,?,?,?,?,?,?,?)',
      [id, name, role || '', phone || '', base_id || null, machine_id || null, start_date || null, notes || '']);
    L(null, base_id, 'Добавлен сотрудник', name, user_name);
    res.json({ id });
  }));

  app.put('/api/pgk/workers/:id', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const { name, role, phone, base_id, machine_id, start_date, notes, status } = req.body;
    run(db(), 'UPDATE pgk_workers SET name=?,role=?,phone=?,base_id=?,machine_id=?,start_date=?,notes=?,status=? WHERE id=?',
      [name, role || '', phone || '', base_id || null, machine_id || null, start_date || null, notes || '', status || 'home', req.params.id]);
    res.json({ success: true });
  }));

  app.delete('/api/pgk/workers/:id', wrap((req, res) => {
    const _restore = trashAndDelete(db(), 'pgk_workers', req.params.id);
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, _restore });
  }));

  app.put('/api/pgk/workers/:id/status', wrap((req, res) => {
    const err = required(['status'], req.body);
    if (err) return res.status(400).json({ error: err });
    run(db(), 'UPDATE pgk_workers SET status=? WHERE id=?', [req.body.status, req.params.id]);
    res.json({ ok: true });
  }));

  // Workers enriched with last shift data and volume totals
  app.get('/api/pgk/workers/summary', wrap((req, res) => {
    const d = db();
    const workers = all(d, `
      SELECT w.*, b.name as base_name,
        (SELECT ws.start_date FROM worker_shifts ws WHERE ws.worker_id=w.id
         ORDER BY COALESCE(ws.start_date,'') DESC LIMIT 1) as last_shift_start,
        (SELECT ws.end_date FROM worker_shifts ws WHERE ws.worker_id=w.id
         ORDER BY COALESCE(ws.start_date,'') DESC LIMIT 1) as last_shift_end
      FROM pgk_workers w LEFT JOIN bases b ON w.base_id=b.id ORDER BY w.name`);

    const today = new Date().toISOString().split('T')[0];
    for (const w of workers) {
      w.rest_days = w.last_shift_end
        ? Math.max(0, Math.floor((Date.now() - new Date(w.last_shift_end)) / 86400000))
        : null;
      if (w.last_shift_start) {
        const volEnd = w.last_shift_end || today;
        const r = all(d,
          `SELECT COALESCE(SUM(CAST(completed AS REAL)), 0) as total
           FROM vol_progress WHERE worker_ids LIKE ? AND work_date BETWEEN ? AND ? AND row_type != 'plan'`,
          [`%${w.id}%`, w.last_shift_start, volEnd]);
        w.last_shift_volume = r[0] ? r[0].total : 0;
      } else {
        w.last_shift_volume = null;
      }
    }
    res.json(workers);
  }));

  app.get('/api/pgk/workers/:id/shifts', wrap((req, res) =>
    res.json(all(db(), 'SELECT s.*,b.name as base_name FROM worker_shifts s LEFT JOIN bases b ON s.base_id=b.id WHERE s.worker_id=? ORDER BY s.start_date DESC', [req.params.id]))
  ));

  app.post('/api/pgk/workers/:id/shifts', wrap((req, res) => {
    const id = uuid();
    const { base_id, start_date, end_date, days, notes } = req.body;
    run(db(), 'INSERT INTO worker_shifts(id,worker_id,base_id,start_date,end_date,days,notes)VALUES(?,?,?,?,?,?,?)',
      [id, req.params.id, base_id || null, start_date || null, end_date || null, days || 0, notes || '']);
    res.json({ id });
  }));

  app.delete('/api/pgk/workers/shifts/:id', wrap((req, res) => {
    run(db(), 'DELETE FROM worker_shifts WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  }));

  app.get('/api/pgk/workers/:id/vol_progress', wrap((req, res) => {
    res.json(all(db(),
      `SELECT vp.work_date, vp.completed, vp.notes, vp.worker_ids, vp.machine_id, vp.act_number,
              v.name as vol_name, v.unit, v.category, s.name as site_name
       FROM vol_progress vp
       JOIN volumes v ON vp.volume_id = v.id
       JOIN sites s ON vp.site_id = s.id
       WHERE vp.worker_ids LIKE ? OR vp.machine_id LIKE ?
       ORDER BY vp.work_date DESC LIMIT 200`,
      ['%' + req.params.id + '%', '%' + req.params.id + '%']
    ));
  }));

  // ── MACHINERY ──────────────────────────────────────────────
  app.get('/api/pgk/machinery', wrap((req, res) =>
    res.json(all(db(), 'SELECT * FROM pgk_machinery ORDER BY name'))
  ));

  app.post('/api/pgk/machinery', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const id = uuid();
    const { name, type, vehicle_type, plate_number, base_id, status, lat, lng, drill_id, notes, user_name } = req.body;
    run(db(), 'INSERT INTO pgk_machinery(id,name,type,vehicle_type,plate_number,base_id,status,lat,lng,drill_id,notes)VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      [id, name, type || '', vehicle_type || '', plate_number || '', base_id || null, status || 'working', lat || null, lng || null, drill_id || null, notes || '']);
    L(null, base_id, 'Добавлена техника', name, user_name);
    res.json({ id });
  }));

  app.put('/api/pgk/machinery/:id', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const { name, type, vehicle_type, plate_number, base_id, status, lat, lng, drill_id, notes, user_name } = req.body;
    const d = db();
    const old = get(d, 'SELECT * FROM pgk_machinery WHERE id=?', [req.params.id]);
    run(d, 'UPDATE pgk_machinery SET name=?,type=?,vehicle_type=?,plate_number=?,base_id=?,status=?,lat=?,lng=?,drill_id=?,notes=? WHERE id=?',
      [name, type || '', vehicle_type || '', plate_number || '', base_id || null, status || 'working',
       lat || null, lng || null, drill_id || null, notes || '', req.params.id]);
    if (old && (old.lat !== (lat || null) || old.lng !== (lng || null))) {
      const coordStr = lat && lng ? `${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}` : 'убрана с карты';
      L(null, base_id || old.base_id || null, 'Техника перемещена', `${name} → ${coordStr}`, user_name || 'Система');
    }
    if (old && old.status !== (status || 'working')) {
      L(null, base_id || old.base_id || null, 'Статус техники', `${name}: ${old.status} → ${status}`, user_name || 'Система');
    }
    if (old && old.base_id !== (base_id || null)) {
      const newBase = base_id ? get(d, 'SELECT name FROM bases WHERE id=?', [base_id]) : null;
      L(null, base_id || null, 'Перевод техники', `${name} → ${newBase ? newBase.name : 'без базы'}`, user_name || 'Система');
    }
    res.json({ success: true });
  }));

  app.delete('/api/pgk/machinery/:id', wrap((req, res) => {
    const _restore = trashAndDelete(db(), 'pgk_machinery', req.params.id);
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, _restore });
  }));

  app.get('/api/pgk/machinery/:id/vol_progress', wrap((req, res) => {
    res.json(all(db(),
      `SELECT vp.work_date, vp.completed, vp.notes, vp.worker_ids, vp.machine_id, vp.act_number,
              v.name as vol_name, v.unit, v.category, s.name as site_name
       FROM vol_progress vp
       JOIN volumes v ON vp.volume_id = v.id
       JOIN sites s ON vp.site_id = s.id
       WHERE vp.machine_id = ?
       ORDER BY vp.work_date DESC LIMIT 200`,
      [req.params.id]
    ));
  }));

  app.get('/api/machinery/:id/history', wrap((req, res) => {
    const d = db();
    const m = get(d, 'SELECT * FROM pgk_machinery WHERE id=?', [req.params.id]);
    if (!m) return res.status(404).json({ machine: null, log: [] });
    const like  = '%' + req.params.id + '%';
    const likeN = '%' + m.name + '%';
    const byId   = all(d, 'SELECT * FROM activity_log WHERE details LIKE ? ORDER BY created_at DESC LIMIT 100', [like]);
    const byName = all(d, 'SELECT * FROM activity_log WHERE details LIKE ? ORDER BY created_at DESC LIMIT 100', [likeN]);
    const byAct  = all(d, "SELECT * FROM activity_log WHERE action LIKE '%ехник%' OR action LIKE '%машин%' OR action LIKE '%перемещ%' ORDER BY created_at DESC LIMIT 200");
    const seen = new Set();
    const log = [...byId, ...byName, ...byAct].filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return (r.details && (r.details.includes(req.params.id) || r.details.includes(m.name)))
          || (r.action && r.action.includes(m.name));
    }).sort((a, b) => a.created_at > b.created_at ? -1 : 1).slice(0, 100);
    res.json({ machine: m, log });
  }));

  // ── EQUIPMENT ──────────────────────────────────────────────
  app.get('/api/pgk/equipment', wrap((req, res) =>
    res.json(all(db(), 'SELECT * FROM pgk_equipment ORDER BY name'))
  ));

  app.post('/api/pgk/equipment', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const id = uuid();
    const { name, type, serial_number, base_id, status, responsible, notes } = req.body;
    run(db(), 'INSERT INTO pgk_equipment(id,name,type,serial_number,base_id,status,responsible,notes)VALUES(?,?,?,?,?,?,?,?)',
      [id, name, type || '', serial_number || '', base_id || null, status || 'working', responsible || '', notes || '']);
    res.json({ id });
  }));

  app.put('/api/pgk/equipment/:id', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const { name, type, serial_number, base_id, status, responsible, notes } = req.body;
    run(db(), 'UPDATE pgk_equipment SET name=?,type=?,serial_number=?,base_id=?,status=?,responsible=?,notes=? WHERE id=?',
      [name, type || '', serial_number || '', base_id || null, status || 'working', responsible || '', notes || '', req.params.id]);
    res.json({ success: true });
  }));

  app.delete('/api/pgk/equipment/:id', wrap((req, res) => {
    const _restore = trashAndDelete(db(), 'pgk_equipment', req.params.id);
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, _restore });
  }));
};
