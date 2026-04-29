const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');
const { required, wrap } = require('./validate');
const { trashAndDelete } = require('./realtime');

module.exports = (app, getDb, L) => {
  const db = () => getDb();

  // ── BASES ──────────────────────────────────────────────────
  app.get('/api/bases', wrap((req, res) => {
    const d = db();
    const bases = all(d, 'SELECT * FROM bases ORDER BY name');
    res.json(bases.map(b => ({
      ...b,
      workers:   all(d, 'SELECT * FROM pgk_workers WHERE base_id=?', [b.id]),
      machinery: all(d, 'SELECT * FROM pgk_machinery WHERE base_id=?', [b.id]),
      equipment: all(d, 'SELECT * FROM pgk_equipment WHERE base_id=?', [b.id]),
      materials: all(d, 'SELECT * FROM materials WHERE base_id=?', [b.id]),
    })));
  }));

  app.get('/api/bases/:id', wrap((req, res) => {
    const d = db();
    const b = get(d, 'SELECT * FROM bases WHERE id=?', [req.params.id]);
    if (!b) return res.status(404).json({ error: 'Не найдено' });
    res.json({
      ...b,
      workers:   all(d, 'SELECT * FROM pgk_workers WHERE base_id=?', [b.id]),
      machinery: all(d, 'SELECT * FROM pgk_machinery WHERE base_id=?', [b.id]),
      equipment: all(d, 'SELECT * FROM pgk_equipment WHERE base_id=?', [b.id]),
      materials: all(d, 'SELECT * FROM materials WHERE base_id=?', [b.id]),
    });
  }));

  app.post('/api/bases', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const id = uuid();
    const { name, lat, lng, description, user_name } = req.body;
    run(db(), 'INSERT INTO bases(id,name,lat,lng,description)VALUES(?,?,?,?,?)', [id, name, lat, lng, description || '']);
    L(null, id, 'Создана база', name, user_name);
    res.json({ id });
  }));

  app.put('/api/bases/:id', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const { name, lat, lng, description, user_name } = req.body;
    run(db(), 'UPDATE bases SET name=?,lat=?,lng=?,description=? WHERE id=?', [name, lat, lng, description || '', req.params.id]);
    L(null, req.params.id, 'Обновлена база', name, user_name);
    res.json({ success: true });
  }));

  app.delete('/api/bases/:id', wrap((req, res) => {
    const d = db();
    ['pgk_workers', 'pgk_machinery', 'pgk_equipment', 'materials'].forEach(t =>
      run(d, `UPDATE ${t} SET base_id=NULL WHERE base_id=?`, [req.params.id])
    );
    const _restore = trashAndDelete(d, 'bases', req.params.id, {
      children: [{ table: 'site_bases', fkColumn: 'base_id' }],
    });
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, _restore });
  }));

  // ── MATERIALS ──────────────────────────────────────────────
  app.post('/api/bases/:id/materials', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const id = uuid();
    const { name, amount, unit, min_amount, notes, category } = req.body;
    run(db(), 'INSERT INTO materials(id,base_id,name,amount,unit,min_amount,notes,category)VALUES(?,?,?,?,?,?,?,?)',
      [id, req.params.id, name, amount || 0, unit || 'шт', min_amount || 0, notes || '', category || '']);
    res.json({ id });
  }));

  app.put('/api/materials/:id', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const { name, amount, unit, min_amount, notes, category } = req.body;
    run(db(), 'UPDATE materials SET name=?,amount=?,unit=?,min_amount=?,notes=?,category=? WHERE id=?',
      [name, amount || 0, unit || 'шт', min_amount || 0, notes || '', category || '', req.params.id]);
    res.json({ success: true });
  }));

  app.delete('/api/materials/:id', wrap((req, res) => {
    const _restore = trashAndDelete(db(), 'materials', req.params.id);
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, _restore });
  }));

  app.get('/api/materials/summary', wrap((req, res) => {
    const rows = all(db(), 'SELECT m.*,b.name as base_name FROM materials m JOIN bases b ON m.base_id=b.id ORDER BY m.name,b.name');
    const map = {};
    rows.forEach(r => {
      if (!map[r.name]) map[r.name] = { name: r.name, unit: r.unit, total: 0, bases: [] };
      map[r.name].total += r.amount;
      map[r.name].bases.push({ base_name: r.base_name, amount: r.amount, unit: r.unit, id: r.id });
    });
    res.json(Object.values(map));
  }));

  // ── MATERIALS ACTUALIZATION ────────────────────────────────
  app.get('/api/materials/:id/log', wrap((req, res) =>
    res.json(all(db(), 'SELECT * FROM materials_log WHERE material_id=? ORDER BY created_at DESC LIMIT 50', [req.params.id]))
  ));

  app.post('/api/materials/:id/actualize', wrap((req, res) => {
    const err = required(['new_amount'], req.body);
    if (err) return res.status(400).json({ error: err });
    const { new_amount, act_date, notes, user_name } = req.body;
    const d = db();
    const mat = get(d, 'SELECT * FROM materials WHERE id=?', [req.params.id]);
    if (!mat) return res.status(404).json({ error: 'Not found' });
    const prev = mat.amount || 0;
    const change = parseFloat(new_amount) - prev;
    const logId = uuid();
    const today = act_date || new Date().toISOString().split('T')[0];
    run(d, 'INSERT INTO materials_log(id,material_id,base_id,prev_amount,new_amount,change_amount,act_date,notes,user_name)VALUES(?,?,?,?,?,?,?,?,?)',
      [logId, req.params.id, mat.base_id, prev, new_amount, change, today, notes || '', user_name || 'Система']);
    run(d, 'UPDATE materials SET amount=?,last_act_date=? WHERE id=?', [new_amount, today, req.params.id]);
    res.json({ ok: true, change });
  }));

  // ── MERGE DUPLICATE MATERIALS ──────────────────────────────
  app.post('/api/bases/:id/materials/merge', wrap((req, res) => {
    const d = db();
    const mats = all(d, 'SELECT * FROM materials WHERE base_id=?', [req.params.id]);
    const groups = {};
    mats.forEach(m => {
      const key = m.name.trim().toLowerCase() + '||' + (m.unit || 'шт').trim().toLowerCase();
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    });
    let merged = 0;
    Object.values(groups).forEach(grp => {
      if (grp.length < 2) return;
      const keep = grp[0];
      const totalAmount = grp.reduce((a, m) => a + (parseFloat(m.amount) || 0), 0);
      const maxMin = Math.max(...grp.map(m => parseFloat(m.min_amount) || 0));
      const notes = [...new Set(grp.map(m => m.notes).filter(Boolean))].join('; ');
      run(d, 'UPDATE materials SET amount=?,min_amount=?,notes=? WHERE id=?', [totalAmount, maxMin, notes, keep.id]);
      grp.slice(1).forEach(m => run(d, 'DELETE FROM materials WHERE id=?', [m.id]));
      merged += grp.length - 1;
    });
    res.json({ ok: true, merged });
  }));
};
