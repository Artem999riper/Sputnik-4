const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../database');

module.exports = (app, ctx) => {
  const { db, wrap } = ctx;

  function loadBrigade(d, id) {
    const b = get(d, 'SELECT * FROM brigades WHERE id=?', [id]);
    if (!b) return null;
    b.transport = b.transport_id ? get(d, 'SELECT * FROM transport WHERE id=?', [b.transport_id]) : null;
    b.members = all(d, `SELECT w.* FROM brigade_members m
                        JOIN workers w ON w.id=m.worker_id
                        WHERE m.brigade_id=? ORDER BY w.name`, [id]);
    return b;
  }

  function makeLabel(d, transportId, workerIds) {
    const parts = [];
    if (transportId) {
      const t = get(d, 'SELECT name, plate FROM transport WHERE id=?', [transportId]);
      if (t) parts.push(t.name + (t.plate ? ' ' + t.plate : ''));
    }
    if (workerIds.length) {
      const first = get(d, 'SELECT name FROM workers WHERE id=?', [workerIds[0]]);
      if (first) parts.push(first.name + (workerIds.length > 1 ? ` +${workerIds.length - 1}` : ''));
    }
    return parts.join(' · ') || 'Бригада';
  }

  // Список всех карточек
  app.get('/api/brigades', wrap((_, res) => {
    const d = db();
    const rows = all(d, 'SELECT * FROM brigades ORDER BY created_at DESC');
    res.json(rows.map(b => loadBrigade(d, b.id)));
  }));

  // Активная карточка (совместимость)
  app.get('/api/brigade/current', wrap((_, res) => {
    const d = db();
    const b = get(d, 'SELECT * FROM brigades WHERE is_active=1 ORDER BY created_at DESC LIMIT 1')
           || get(d, 'SELECT * FROM brigades ORDER BY created_at DESC LIMIT 1');
    res.json(b ? loadBrigade(d, b.id) : null);
  }));

  // Создать новую карточку (становится активной)
  app.post('/api/brigade', wrap((req, res) => {
    const d = db();
    const { worker_ids = [], transport_id = null } = req.body || {};
    const id = uuidv4();
    const label = makeLabel(d, transport_id, worker_ids);
    const tx = d.transaction(() => {
      run(d, 'UPDATE brigades SET is_active=0 WHERE is_active=1');
      run(d, 'INSERT INTO brigades(id,transport_id,is_active,label) VALUES(?,?,1,?)', [id, transport_id, label]);
      const ins = d.prepare('INSERT INTO brigade_members(brigade_id,worker_id) VALUES(?,?)');
      worker_ids.forEach(wid => ins.run(id, String(wid)));
    });
    tx();
    res.json({ ok: true, brigade: loadBrigade(d, id) });
  }));

  // Активировать карточку
  app.patch('/api/brigade/:id/activate', wrap((req, res) => {
    const d = db();
    const tx = d.transaction(() => {
      run(d, 'UPDATE brigades SET is_active=0 WHERE is_active=1');
      run(d, 'UPDATE brigades SET is_active=1 WHERE id=?', [req.params.id]);
    });
    tx();
    const b = loadBrigade(d, req.params.id);
    if (!b) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true, brigade: b });
  }));

  // Удалить карточку
  app.delete('/api/brigade/:id', wrap((req, res) => {
    const d = db();
    const b = get(d, 'SELECT * FROM brigades WHERE id=?', [req.params.id]);
    if (!b) return res.status(404).json({ error: 'not found' });
    run(d, 'DELETE FROM brigades WHERE id=?', [req.params.id]);
    // Если удалили активную — активируем самую свежую оставшуюся
    if (b.is_active) {
      const next = get(d, 'SELECT id FROM brigades ORDER BY created_at DESC LIMIT 1');
      if (next) run(d, 'UPDATE brigades SET is_active=1 WHERE id=?', [next.id]);
    }
    res.json({ ok: true });
  }));

  app.get('/api/brigade/:id', wrap((req, res) => {
    const b = loadBrigade(db(), req.params.id);
    if (!b) return res.status(404).json({ error: 'not found' });
    res.json(b);
  }));
};
