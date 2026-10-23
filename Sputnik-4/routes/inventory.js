// ═══════════════════════════════════════════════════════════
// routes/inventory.js — инвентаризация оборудования.
// Сессия: что проверяем (место: база/объект/всё; группа) и где проверяем.
// Отметки: найдено (в т.ч. «не на своём месте») — по QR, S/N или галочке.
// ═══════════════════════════════════════════════════════════
const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');
const { wrap } = require('./validate');

module.exports = (app, getDb) => {
  const db = () => getDb();
  try {
    db().exec(`CREATE TABLE IF NOT EXISTS inventory_sessions (id TEXT PRIMARY KEY, name TEXT, created_at TEXT DEFAULT (datetime('now','localtime')),
      created_by TEXT DEFAULT '', status TEXT DEFAULT 'open', scope TEXT DEFAULT '{}', closed_at TEXT)`);
    db().exec(`CREATE TABLE IF NOT EXISTS inventory_marks (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, equipment_id TEXT NOT NULL,
      found_at TEXT DEFAULT (datetime('now','localtime')), found_by TEXT DEFAULT '', note TEXT DEFAULT '', UNIQUE(session_id, equipment_id))`);
  } catch (e) {}
  const uname = req => { let n = req.get('X-User-Name') || ''; try { n = decodeURIComponent(n); } catch (e) {} return n.slice(0, 120); };
  const scopeOf = s => { try { return JSON.parse(s.scope || '{}') || {}; } catch (e) { return {}; } };
  // Ожидаемый состав: оборудование, числящееся на месте проверки (и в группе, если задана)
  const expected = sc => all(db(), 'SELECT * FROM pgk_equipment ORDER BY name').filter(e =>
    (!sc.base_id || e.base_id === sc.base_id) && (!sc.site_id || e.site_id === sc.site_id) && (!sc.group_id || e.group_id === sc.group_id));

  app.get('/api/inventory', wrap((req, res) => {
    const rows = all(db(), 'SELECT * FROM inventory_sessions ORDER BY created_at DESC LIMIT 100');
    rows.forEach(r => {
      r.scope = scopeOf(r);
      r.found = (get(db(), 'SELECT COUNT(*) c FROM inventory_marks WHERE session_id=?', [r.id]) || {}).c || 0;
      r.expected = expected(r.scope).length;
    });
    res.json(rows);
  }));
  app.get('/api/inventory/active', wrap((req, res) => {
    const s = get(db(), "SELECT * FROM inventory_sessions WHERE status='open' ORDER BY created_at DESC LIMIT 1");
    res.json(s ? { ...s, scope: scopeOf(s) } : null);
  }));
  app.post('/api/inventory', wrap((req, res) => {
    const { name, scope } = req.body || {};
    const id = uuid();
    run(db(), 'INSERT INTO inventory_sessions(id,name,created_by,scope)VALUES(?,?,?,?)',
      [id, String(name || 'Инвентаризация').slice(0, 200), uname(req), JSON.stringify(scope || {})]);
    res.json({ id });
  }));
  app.get('/api/inventory/:id', wrap((req, res) => {
    const s = get(db(), 'SELECT * FROM inventory_sessions WHERE id=?', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Инвентаризация не найдена' });
    const sc = scopeOf(s);
    const exp = expected(sc), expIds = new Set(exp.map(e => e.id));
    const marks = all(db(), 'SELECT * FROM inventory_marks WHERE session_id=? ORDER BY found_at', [s.id]);
    const extraIds = marks.filter(m => !expIds.has(m.equipment_id)).map(m => m.equipment_id);
    const extra = extraIds.length ? all(db(), `SELECT * FROM pgk_equipment WHERE id IN (${extraIds.map(() => '?').join(',')})`, extraIds) : [];
    res.json({ session: { ...s, scope: sc }, expected: exp, extra, marks });
  }));
  // Отметить найденным / снять отметку
  app.post('/api/inventory/:id/mark', wrap((req, res) => {
    const s = get(db(), 'SELECT * FROM inventory_sessions WHERE id=?', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Инвентаризация не найдена' });
    if (s.status !== 'open') return res.status(400).json({ error: 'Инвентаризация уже закрыта' });
    const { equipment_id, found, note } = req.body || {};
    const eq = equipment_id && get(db(), 'SELECT id,name FROM pgk_equipment WHERE id=?', [equipment_id]);
    if (!eq) return res.status(404).json({ error: 'Оборудование не найдено' });
    if (found === false) run(db(), 'DELETE FROM inventory_marks WHERE session_id=? AND equipment_id=?', [s.id, eq.id]);
    else run(db(), `INSERT INTO inventory_marks(id,session_id,equipment_id,found_by,note)VALUES(?,?,?,?,?)
      ON CONFLICT(session_id,equipment_id) DO UPDATE SET note=excluded.note`, [uuid(), s.id, eq.id, uname(req), String(note || '')]);
    res.json({ ok: true, name: eq.name });
  }));
  app.post('/api/inventory/:id/close', wrap((req, res) => {
    run(db(), "UPDATE inventory_sessions SET status=?, closed_at=CASE WHEN ?='closed' THEN datetime('now','localtime') ELSE NULL END WHERE id=?",
      [req.body && req.body.reopen ? 'open' : 'closed', req.body && req.body.reopen ? 'open' : 'closed', req.params.id]);
    res.json({ ok: true });
  }));
  app.delete('/api/inventory/:id', wrap((req, res) => {
    run(db(), 'DELETE FROM inventory_marks WHERE session_id=?', [req.params.id]);
    run(db(), 'DELETE FROM inventory_sessions WHERE id=?', [req.params.id]);
    res.json({ success: true });
  }));
};
