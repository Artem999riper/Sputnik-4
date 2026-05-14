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

  app.get('/api/brigade/current', wrap((_, res) => {
    const d = db();
    const b = get(d, 'SELECT * FROM brigades ORDER BY created_at DESC LIMIT 1');
    res.json(b ? loadBrigade(d, b.id) : null);
  }));

  app.post('/api/brigade', wrap((req, res) => {
    const d = db();
    const { worker_ids = [], transport_id = null } = req.body || {};
    const id = uuidv4();
    const tx = d.transaction(() => {
      run(d, 'INSERT INTO brigades(id,transport_id) VALUES(?,?)', [id, transport_id]);
      const ins = d.prepare('INSERT INTO brigade_members(brigade_id,worker_id) VALUES(?,?)');
      worker_ids.forEach(wid => ins.run(id, String(wid)));
    });
    tx();
    res.json({ ok: true, brigade: loadBrigade(d, id) });
  }));

  app.get('/api/brigade/:id', wrap((req, res) => {
    const b = loadBrigade(db(), req.params.id);
    if (!b) return res.status(404).json({ error: 'not found' });
    res.json(b);
  }));
};
