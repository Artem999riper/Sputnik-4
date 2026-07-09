// ═══════════════════════════════════════════════════════════
// routes/mto.js — МТО (материально-техническое обеспечение)
// Справка о технических средствах: приборы, техника, ПО и т.д.
// ═══════════════════════════════════════════════════════════
const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');
const { required, wrap } = require('./validate');
const { trashAndDelete } = require('./realtime');

module.exports = (app, getDb, L) => {
  const db = () => getDb();

  app.get('/api/mto', wrap((req, res) =>
    res.json(all(db(), 'SELECT * FROM mto_items ORDER BY sort_order, created_at'))
  ));

  app.post('/api/mto', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const id = uuid();
    const { category, name, quantity, year, condition, ownership, notes } = req.body;
    const d = db();
    const maxRow = get(d, 'SELECT MAX(sort_order) as mx FROM mto_items');
    run(d, 'INSERT INTO mto_items(id,category,name,quantity,year,condition,ownership,notes,sort_order)VALUES(?,?,?,?,?,?,?,?,?)',
      [id, category || '', name, quantity || '', year || '', condition || 'Исправен', ownership || '', notes || '',
       ((maxRow && maxRow.mx) || 0) + 1]);
    res.json({ id });
  }));

  // Массовый импорт: { items: [...], replace: bool } — атомарно, в транзакции
  app.post('/api/mto/bulk', wrap((req, res) => {
    const { items, replace } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items пуст' });
    const d = db();
    const startRow = get(d, 'SELECT MAX(sort_order) as mx FROM mto_items');
    let base = replace ? 0 : ((startRow && startRow.mx) || 0);
    const tx = d.transaction(() => {
      if (replace) run(d, 'DELETE FROM mto_items');
      items.forEach((it, i) => {
        if (!it || !String(it.name || '').trim()) return;
        run(d, 'INSERT INTO mto_items(id,category,name,quantity,year,condition,ownership,notes,sort_order)VALUES(?,?,?,?,?,?,?,?,?)',
          [uuid(), String(it.category || ''), String(it.name).trim(), String(it.quantity || ''),
           String(it.year || ''), String(it.condition || 'Исправен'), String(it.ownership || ''),
           String(it.notes || ''), base + i + 1]);
      });
    });
    tx();
    const cnt = get(d, 'SELECT COUNT(*) as c FROM mto_items');
    L(null, null, replace ? 'МТО: импорт с заменой' : 'МТО: импорт', `${items.length} позиций`, req.body.user_name);
    res.json({ ok: true, total: (cnt && cnt.c) || 0 });
  }));

  app.put('/api/mto/:id', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const { category, name, quantity, year, condition, ownership, notes } = req.body;
    run(db(), 'UPDATE mto_items SET category=?,name=?,quantity=?,year=?,condition=?,ownership=?,notes=? WHERE id=?',
      [category || '', name, quantity || '', year || '', condition || 'Исправен', ownership || '', notes || '', req.params.id]);
    res.json({ success: true });
  }));

  app.delete('/api/mto/:id', wrap((req, res) => {
    const _restore = trashAndDelete(db(), 'mto_items', req.params.id);
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, _restore });
  }));
};
