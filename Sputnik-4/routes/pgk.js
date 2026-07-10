const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');
const { required, wrap } = require('./validate');
const { trashAndDelete } = require('./realtime');
const { generateEquipActDocx } = require('./equip_act');

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
    const d = db();
    // Каскад: вахты и фото сотрудника удаляются вместе с ним (и восстанавливаются undo)
    const _restore = d.transaction(() => trashAndDelete(d, 'pgk_workers', req.params.id, {
      children: [
        { table: 'worker_shifts', fkColumn: 'worker_id' },
        { table: 'photos',        fkColumn: 'entity_id' },
      ],
    }))();
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
    const { name, type, vehicle_type, plate_number, base_id, status, lat, lng, drill_id, driver_id, notes, user_name } = req.body;
    const d = db();
    const old = get(d, 'SELECT * FROM pgk_machinery WHERE id=?', [req.params.id]);
    run(d, 'UPDATE pgk_machinery SET name=?,type=?,vehicle_type=?,plate_number=?,base_id=?,status=?,lat=?,lng=?,drill_id=?,driver_id=?,notes=? WHERE id=?',
      [name, type || '', vehicle_type || '', plate_number || '', base_id || null, status || 'working',
       lat || null, lng || null, drill_id || null, driver_id || null, notes || '', req.params.id]);
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
    const d = db();
    const _restore = d.transaction(() => {
      // отвязываем сотрудников от удаляемой машины
      run(d, 'UPDATE pgk_workers SET machine_id=NULL WHERE machine_id=?', [req.params.id]);
      return trashAndDelete(d, 'pgk_machinery', req.params.id, {
        children: [
          { table: 'machine_moves', fkColumn: 'machine_id' },
          { table: 'photos',        fkColumn: 'entity_id' },
        ],
      });
    })();
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
    const { name, type, serial_number, base_id, status, responsible, notes, group_id } = req.body;
    const d = db();
    run(d, 'INSERT INTO pgk_equipment(id,name,type,serial_number,base_id,status,responsible,notes,group_id)VALUES(?,?,?,?,?,?,?,?,?)',
      [id, name, type || '', serial_number || '', base_id || null, status || 'working', responsible || '', notes || '', group_id || '']);
    if (responsible) {
      run(d, 'INSERT INTO equipment_responsible_history(id,equipment_id,responsible)VALUES(?,?,?)', [uuid(), id, responsible]);
    }
    res.json({ id });
  }));

  app.put('/api/pgk/equipment/:id', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const { name, type, serial_number, base_id, status, responsible, notes, group_id } = req.body;
    const d = db();
    const prev = get(d, 'SELECT responsible FROM pgk_equipment WHERE id=?', [req.params.id]);
    run(d, 'UPDATE pgk_equipment SET name=?,type=?,serial_number=?,base_id=?,status=?,responsible=?,notes=?,group_id=? WHERE id=?',
      [name, type || '', serial_number || '', base_id || null, status || 'working', responsible || '', notes || '', group_id || '', req.params.id]);
    if (responsible && (!prev || prev.responsible !== responsible)) {
      run(d, 'INSERT INTO equipment_responsible_history(id,equipment_id,responsible)VALUES(?,?,?)', [uuid(), req.params.id, responsible]);
    }
    res.json({ success: true });
  }));

  app.delete('/api/pgk/equipment/:id', wrap((req, res) => {
    const d = db();
    const _restore = d.transaction(() => trashAndDelete(d, 'pgk_equipment', req.params.id, {
      children: [
        { table: 'equipment_responsible_history', fkColumn: 'equipment_id' },
        { table: 'photos',                        fkColumn: 'entity_id' },
      ],
    }))();
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, _restore });
  }));

  app.put('/api/pgk/equipment/:id/group', wrap((req, res) => {
    run(db(), 'UPDATE pgk_equipment SET group_id=? WHERE id=?', [req.body.group_id || null, req.params.id]);
    res.json({ success: true });
  }));

  app.get('/api/equip_groups', wrap((req, res) =>
    res.json(all(db(), 'SELECT * FROM equipment_groups ORDER BY sort_order, name'))
  ));
  app.post('/api/equip_groups', wrap((req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Название обязательно' });
    const id = uuid();
    run(db(), 'INSERT INTO equipment_groups(id,name)VALUES(?,?)', [id, name]);
    res.json({ id });
  }));
  app.put('/api/equip_groups/:id', wrap((req, res) => {
    run(db(), 'UPDATE equipment_groups SET name=? WHERE id=?', [req.body.name, req.params.id]);
    res.json({ success: true });
  }));
  app.delete('/api/equip_groups/:id', wrap((req, res) => {
    const d = db();
    run(d, "UPDATE pgk_equipment SET group_id='' WHERE group_id=?", [req.params.id]);
    run(d, 'DELETE FROM equipment_groups WHERE id=?', [req.params.id]);
    res.json({ success: true });
  }));

  app.get('/api/mat_groups', wrap((req, res) =>
    res.json(all(db(), 'SELECT * FROM materials_groups ORDER BY sort_order, name'))
  ));
  app.post('/api/mat_groups', wrap((req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Название обязательно' });
    const id = uuid();
    run(db(), 'INSERT INTO materials_groups(id,name)VALUES(?,?)', [id, name]);
    res.json({ id });
  }));
  app.put('/api/mat_groups/:id', wrap((req, res) => {
    run(db(), 'UPDATE materials_groups SET name=? WHERE id=?', [req.body.name, req.params.id]);
    res.json({ success: true });
  }));
  app.delete('/api/mat_groups/:id', wrap((req, res) => {
    run(db(), 'DELETE FROM materials_groups WHERE id=?', [req.params.id]);
    res.json({ success: true });
  }));

  app.get('/api/equip_responsible_history/:id', wrap((req, res) =>
    res.json(all(db(), 'SELECT * FROM equipment_responsible_history WHERE equipment_id=? ORDER BY assigned_at DESC', [req.params.id]))
  ));
  app.post('/api/equip_responsible_history', wrap((req, res) => {
    const { equipment_id, responsible, notes } = req.body;
    if (!equipment_id || !responsible) return res.status(400).json({ error: 'equipment_id и responsible обязательны' });
    const id = uuid();
    run(db(), 'INSERT INTO equipment_responsible_history(id,equipment_id,responsible,notes)VALUES(?,?,?,?)',
      [id, equipment_id, responsible, notes || '']);
    res.json({ id });
  }));

  // ── FUEL RESERVES ─────────────────────────────────────────
  app.get('/api/fuel_reserves', wrap((req, res) =>
    res.json(all(db(), 'SELECT * FROM fuel_reserves ORDER BY base_id, fuel_type'))
  ));
  app.post('/api/fuel_reserves/transaction', wrap((req, res) => {
    const { base_id, fuel_type, delta, notes } = req.body;
    if (!base_id || !fuel_type) return res.status(400).json({ error: 'base_id и fuel_type обязательны' });
    const d = db();
    const existing = get(d, 'SELECT * FROM fuel_reserves WHERE base_id=? AND fuel_type=?', [base_id, fuel_type]);
    if (existing) {
      const newAmt = Math.max(0, (existing.amount || 0) + (delta || 0));
      run(d, "UPDATE fuel_reserves SET amount=?,notes=?,updated_at=datetime('now') WHERE id=?", [newAmt, notes || existing.notes || '', existing.id]);
      res.json({ id: existing.id, amount: newAmt });
    } else {
      const id = uuid();
      const newAmt = Math.max(0, delta || 0);
      run(d, "INSERT INTO fuel_reserves(id,base_id,fuel_type,amount,notes)VALUES(?,?,?,?,?)", [id, base_id, fuel_type, newAmt, notes || '']);
      res.json({ id, amount: newAmt });
    }
  }));
  app.delete('/api/fuel_reserves/:id', wrap((req, res) => {
    run(db(), 'DELETE FROM fuel_reserves WHERE id=?', [req.params.id]);
    res.json({ success: true });
  }));
  app.get('/api/fuel_transactions', wrap((req, res) => {
    const { base_id, fuel_type } = req.query;
    let sql = 'SELECT * FROM fuel_transactions WHERE 1=1';
    const params = [];
    if (base_id) { sql += ' AND base_id=?'; params.push(base_id); }
    if (fuel_type) { sql += ' AND fuel_type=?'; params.push(fuel_type); }
    sql += ' ORDER BY created_at DESC LIMIT 100';
    res.json(all(db(), sql, params));
  }));
  app.post('/api/fuel_transactions', wrap((req, res) => {
    const { base_id, fuel_type, delta, notes, op_date } = req.body;
    if (!base_id || !fuel_type || delta === undefined) return res.status(400).json({ error: 'base_id, fuel_type, delta обязательны' });
    const d = db();
    const id = uuid();
    run(d, 'INSERT INTO fuel_transactions(id,base_id,fuel_type,delta,notes,op_date)VALUES(?,?,?,?,?,?)',
      [id, base_id, fuel_type, delta, notes || '', op_date || new Date().toISOString().split('T')[0]]);
    // Update reserve
    const existing = get(d, 'SELECT * FROM fuel_reserves WHERE base_id=? AND fuel_type=?', [base_id, fuel_type]);
    if (existing) {
      const newAmt = Math.max(0, (existing.amount || 0) + delta);
      run(d, "UPDATE fuel_reserves SET amount=?,updated_at=datetime('now') WHERE id=?", [newAmt, existing.id]);
      res.json({ id, amount: newAmt });
    } else {
      const rid = uuid();
      const newAmt = Math.max(0, delta);
      run(d, "INSERT INTO fuel_reserves(id,base_id,fuel_type,amount)VALUES(?,?,?,?)", [rid, base_id, fuel_type, newAmt]);
      res.json({ id, amount: newAmt });
    }
  }));

  // ── SPARE PARTS GROUPS ────────────────────────────────────
  app.get('/api/spare_groups', wrap((req, res) =>
    res.json(all(db(), 'SELECT * FROM spare_parts_groups ORDER BY sort_order, name'))
  ));
  app.post('/api/spare_groups', wrap((req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Название обязательно' });
    const id = uuid();
    run(db(), 'INSERT INTO spare_parts_groups(id,name)VALUES(?,?)', [id, name]);
    res.json({ id });
  }));
  app.put('/api/spare_groups/:id', wrap((req, res) => {
    run(db(), 'UPDATE spare_parts_groups SET name=? WHERE id=?', [req.body.name, req.params.id]);
    res.json({ success: true });
  }));
  app.delete('/api/spare_groups/:id', wrap((req, res) => {
    const d = db();
    run(d, 'UPDATE spare_parts SET group_id=NULL WHERE group_id=?', [req.params.id]);
    run(d, 'DELETE FROM spare_parts_groups WHERE id=?', [req.params.id]);
    res.json({ success: true });
  }));

  // ── SPARE PARTS ───────────────────────────────────────────
  app.get('/api/spare_parts', wrap((req, res) =>
    res.json(all(db(), 'SELECT * FROM spare_parts ORDER BY name'))
  ));
  app.post('/api/spare_parts', wrap((req, res) => {
    const { name, group_id, quantity, unit, location, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Название обязательно' });
    const id = uuid();
    run(db(), 'INSERT INTO spare_parts(id,group_id,name,quantity,unit,location,notes)VALUES(?,?,?,?,?,?,?)',
      [id, group_id || null, name, quantity || 0, unit || 'шт', location || '', notes || '']);
    res.json({ id });
  }));
  app.put('/api/spare_parts/:id', wrap((req, res) => {
    const { name, group_id, quantity, unit, location, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Название обязательно' });
    run(db(), 'UPDATE spare_parts SET name=?,group_id=?,quantity=?,unit=?,location=?,notes=? WHERE id=?',
      [name, group_id || null, quantity || 0, unit || 'шт', location || '', notes || '', req.params.id]);
    res.json({ success: true });
  }));
  app.delete('/api/spare_parts/:id', wrap((req, res) => {
    run(db(), 'DELETE FROM spare_parts WHERE id=?', [req.params.id]);
    res.json({ success: true });
  }));

  // ── BRIGADES (ПГК) ─────────────────────────────────────────
  app.get('/api/pgk/brigades', wrap((req, res) => {
    const d = db();
    const rows = all(d, `
      SELECT b.*,
        m.name AS machine_name, m.type AS machine_type,
        m.plate_number AS machine_plate, m.driver_id AS machine_driver_id,
        (SELECT GROUP_CONCAT(worker_id) FROM pgk_brigade_members WHERE brigade_id=b.id) AS member_ids,
        (SELECT GROUP_CONCAT(base_id)   FROM pgk_brigade_bases   WHERE brigade_id=b.id) AS base_ids,
        (SELECT GROUP_CONCAT(site_id)   FROM pgk_brigade_sites   WHERE brigade_id=b.id) AS site_ids
      FROM pgk_brigades b
      LEFT JOIN pgk_machinery m ON m.id = b.machine_id
      ORDER BY b.name`);
    rows.forEach(r => {
      r.member_ids = r.member_ids ? r.member_ids.split(',') : [];
      r.base_ids   = r.base_ids   ? r.base_ids.split(',')   : [];
      r.site_ids   = r.site_ids   ? r.site_ids.split(',')   : [];
    });
    res.json(rows);
  }));

  app.post('/api/pgk/brigades', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const id = uuid();
    const { name, machine_id, member_ids = [], base_ids = [], site_ids = [], notes } = req.body;
    const d = db();
    const tx = d.transaction(() => {
      run(d, "INSERT INTO pgk_brigades(id,name,machine_id,notes,updated_at) VALUES(?,?,?,?,datetime('now'))",
        [id, name, machine_id || null, notes || '']);
      (member_ids || []).filter(Boolean).forEach(wid =>
        run(d, 'INSERT OR IGNORE INTO pgk_brigade_members(brigade_id,worker_id) VALUES(?,?)', [id, wid]));
      (base_ids || []).filter(Boolean).forEach(bid =>
        run(d, 'INSERT OR IGNORE INTO pgk_brigade_bases(brigade_id,base_id) VALUES(?,?)', [id, bid]));
      (site_ids || []).filter(Boolean).forEach(sid =>
        run(d, 'INSERT OR IGNORE INTO pgk_brigade_sites(brigade_id,site_id) VALUES(?,?)', [id, sid]));
    });
    tx();
    res.json({ id });
  }));

  app.put('/api/pgk/brigades/:id', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const id = req.params.id;
    const { name, machine_id, member_ids = [], base_ids = [], site_ids = [], notes } = req.body;
    const d = db();
    const exists = get(d, 'SELECT id FROM pgk_brigades WHERE id=?', [id]);
    if (!exists) return res.status(404).json({ error: 'Not found' });
    const tx = d.transaction(() => {
      run(d, "UPDATE pgk_brigades SET name=?,machine_id=?,notes=?,updated_at=datetime('now') WHERE id=?",
        [name, machine_id || null, notes || '', id]);
      run(d, 'DELETE FROM pgk_brigade_members WHERE brigade_id=?', [id]);
      run(d, 'DELETE FROM pgk_brigade_bases   WHERE brigade_id=?', [id]);
      run(d, 'DELETE FROM pgk_brigade_sites   WHERE brigade_id=?', [id]);
      (member_ids || []).filter(Boolean).forEach(wid =>
        run(d, 'INSERT OR IGNORE INTO pgk_brigade_members(brigade_id,worker_id) VALUES(?,?)', [id, wid]));
      (base_ids || []).filter(Boolean).forEach(bid =>
        run(d, 'INSERT OR IGNORE INTO pgk_brigade_bases(brigade_id,base_id) VALUES(?,?)', [id, bid]));
      (site_ids || []).filter(Boolean).forEach(sid =>
        run(d, 'INSERT OR IGNORE INTO pgk_brigade_sites(brigade_id,site_id) VALUES(?,?)', [id, sid]));
    });
    tx();
    res.json({ success: true });
  }));

  app.delete('/api/pgk/brigades/:id', wrap((req, res) => {
    const id = req.params.id;
    const d = db();
    const row = get(d, 'SELECT * FROM pgk_brigades WHERE id=?', [id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const tx = d.transaction(() => {
      run(d, 'DELETE FROM pgk_brigade_members WHERE brigade_id=?', [id]);
      run(d, 'DELETE FROM pgk_brigade_bases   WHERE brigade_id=?', [id]);
      run(d, 'DELETE FROM pgk_brigade_sites   WHERE brigade_id=?', [id]);
      run(d, 'DELETE FROM pgk_brigades        WHERE id=?', [id]);
    });
    tx();
    res.json({ success: true });
  }));

  // ── АКТ ПРИЁМА-ПЕРЕДАЧИ ОБОРУДОВАНИЯ ──────────────────────
  app.get('/api/pgk/equipment/act', wrap(async (req, res) => {
    const responsible = req.query.responsible;
    if (!responsible) return res.status(400).json({ error: 'responsible обязателен' });
    const d = db();
    const items = all(d, "SELECT * FROM pgk_equipment WHERE responsible=? ORDER BY name", [responsible]);
    if (!items.length) return res.status(404).json({ error: 'У этого сотрудника нет закреплённого оборудования' });
    const buf = await generateEquipActDocx(responsible, items);
    const fname = `Акт_${responsible.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
    res.send(buf);
  }));
};
