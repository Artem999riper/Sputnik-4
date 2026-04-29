const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');
const { required, wrap } = require('./validate');
const { trashAndDelete } = require('./realtime');

function gtJSON(str, fb) { try { return JSON.parse(str); } catch(e) { return fb; } }

module.exports = (app, getDb, L) => {
  const db = () => getDb();

  // ── GLOBAL TASKS ───────────────────────────────────────────
  app.get('/api/gtasks', wrap((req, res) => {
    res.json(all(db(), 'SELECT * FROM global_tasks ORDER BY created_at DESC').map(r => ({
      ...r,
      responsibles:  gtJSON(r.responsibles, []),
      confirmations: gtJSON(r.confirmations, []),
    })));
  }));

  app.post('/api/gtasks', wrap((req, res) => {
    const err = required(['title'], req.body);
    if (err) return res.status(400).json({ error: err });
    const id = uuid();
    const { title, description, priority, category, due_date, site_id, base_id, created_by, responsibles, notes } = req.body;
    const d = db();
    run(d, `INSERT INTO global_tasks(id,title,description,priority,category,due_date,site_id,base_id,created_by,status,responsibles,confirmations,notes)
            VALUES(?,?,?,?,?,?,?,?,?,'open',?,'[]',?)`,
      [id, title, description || '', priority || 'normal', category || 'general',
       due_date || null, site_id || null, base_id || null, created_by || '',
       JSON.stringify(responsibles || []), notes || '']);
    L(site_id || null, base_id || null, 'Задача создана', title, created_by);
    (responsibles || []).forEach(r => {
      if (r) run(d, 'INSERT INTO notifications(id,recipient,type,title,body,ref_id,ref_type)VALUES(?,?,?,?,?,?,?)',
        [uuid(), r, 'task_assigned', '📋 Вам назначена задача', title, id, 'gtask']);
    });
    res.json({ id });
  }));

  app.put('/api/gtasks/:id', wrap((req, res) => {
    const d = db();
    const existing = get(d, 'SELECT * FROM global_tasks WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { title, description, priority, category, due_date, site_id, base_id, responsibles, notes, user_name } = req.body;
    const newResp = responsibles || gtJSON(existing.responsibles, []);
    const oldResp = gtJSON(existing.responsibles, []);
    run(d, 'UPDATE global_tasks SET title=?,description=?,priority=?,category=?,due_date=?,site_id=?,base_id=?,responsibles=?,notes=? WHERE id=?',
      [title || existing.title, description || '', priority || 'normal', category || 'general',
       due_date || null, site_id || null, base_id || null,
       JSON.stringify(newResp), notes || '', req.params.id]);
    L(site_id || null, base_id || null, 'Задача изменена', title || existing.title, user_name || '');
    newResp.filter(r => !oldResp.includes(r)).forEach(r => {
      if (r) run(d, 'INSERT INTO notifications(id,recipient,type,title,body,ref_id,ref_type)VALUES(?,?,?,?,?,?,?)',
        [uuid(), r, 'task_assigned', '📋 Вам назначена задача', title || existing.title, req.params.id, 'gtask']);
    });
    res.json({ success: true });
  }));

  app.post('/api/gtasks/:id/confirm', wrap((req, res) => {
    const err = required(['worker_name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const { worker_name, confirm } = req.body;
    const d = db();
    const task = get(d, 'SELECT * FROM global_tasks WHERE id=?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Not found' });
    let confirmations = gtJSON(task.confirmations, []);
    const responsibles = gtJSON(task.responsibles, []);
    if (confirm) { if (!confirmations.includes(worker_name)) confirmations.push(worker_name); }
    else { confirmations = confirmations.filter(n => n !== worker_name); }
    const allConfirmed = responsibles.length > 0 && responsibles.every(r => confirmations.includes(r));
    const newStatus = confirmations.length > 0 ? 'inprog' : 'open';
    run(d, 'UPDATE global_tasks SET confirmations=?,status=? WHERE id=?',
      [JSON.stringify(confirmations), newStatus, req.params.id]);
    res.json({ ok: true, status: newStatus, confirmations, allConfirmed });
  }));

  app.post('/api/gtasks/:id/close', wrap((req, res) => {
    const { user_name } = req.body;
    const d = db();
    const task = get(d, 'SELECT * FROM global_tasks WHERE id=?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Not found' });
    const responsibles = gtJSON(task.responsibles, []);
    const confirmations = gtJSON(task.confirmations, []);
    const allConfirmed = responsibles.length === 0 || responsibles.every(r => confirmations.includes(r));
    if (!allConfirmed) return res.status(400).json({ error: 'Не все ответственные подтвердили' });
    const closedAt = new Date().toISOString().split('T')[0];
    run(d, 'UPDATE global_tasks SET status=?,closed_at=? WHERE id=?', ['done', closedAt, req.params.id]);
    L(task.site_id, task.base_id, 'Задача завершена', task.title, user_name || 'Система');
    res.json({ ok: true });
  }));

  app.delete('/api/gtasks/:id', wrap((req, res) => {
    const d = db();
    const t = get(d, 'SELECT * FROM global_tasks WHERE id=?', [req.params.id]);
    const _restore = trashAndDelete(d, 'global_tasks', req.params.id);
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    if (t) L(t.site_id, t.base_id, 'Задача удалена', t.title, '');
    res.json({ success: true, _restore });
  }));

  // ── NOTIFICATIONS ──────────────────────────────────────────
  app.get('/api/notifications', wrap((req, res) => {
    const { user } = req.query;
    if (!user) return res.json([]);
    res.json(all(db(), 'SELECT * FROM notifications WHERE recipient=? AND is_read=0 ORDER BY created_at DESC LIMIT 50', [user]));
  }));

  app.post('/api/notifications/read', wrap((req, res) => {
    const { ids, user } = req.body;
    const d = db();
    if (ids && ids.length) {
      ids.forEach(id => run(d, 'UPDATE notifications SET is_read=1 WHERE id=? AND recipient=?', [id, user]));
    } else if (user) {
      run(d, 'UPDATE notifications SET is_read=1 WHERE recipient=?', [user]);
    }
    res.json({ ok: true });
  }));
};
