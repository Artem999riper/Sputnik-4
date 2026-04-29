const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');
const { wrap } = require('./validate');
const { trashAndDelete } = require('./realtime');

function tryJSON(str, fallback) {
  try { return JSON.parse(str); } catch(e) { return fallback; } }

module.exports = (app, getDb, L) => {
  const db = () => getDb();

  app.get('/api/cargo', wrap((req, res) => {
    res.json(all(db(), 'SELECT * FROM cargo_orders ORDER BY created_at DESC')
      .map(r => ({ ...r, items: tryJSON(r.items, []) })));
  }));

  app.post('/api/cargo', wrap((req, res) => {
    const id = uuid();
    const { num, base_id, from_desc, depart_date, eta_date, status, driver, vehicle,
            items, total_weight, notes, created_by, notify_workers } = req.body;
    const d = db();
    let orderNum = num;
    if (!orderNum) {
      const last = get(d, 'SELECT num FROM cargo_orders ORDER BY created_at DESC LIMIT 1');
      orderNum = String((last ? parseInt(last.num) || 0 : 0) + 1).padStart(4, '0');
    }
    const existing = get(d, 'SELECT id FROM cargo_orders WHERE num=?', [orderNum]);
    if (existing) return res.status(409).json({ error: `Заявка с номером №${orderNum} уже существует.` });

    try { d.run('ALTER TABLE cargo_orders ADD COLUMN notify_workers TEXT DEFAULT "[]"'); } catch(e) {}
    try { d.run('ALTER TABLE cargo_orders ADD COLUMN cargo_confirmations TEXT DEFAULT "[]"'); } catch(e) {}

    run(d, 'INSERT INTO cargo_orders(id,num,base_id,from_desc,depart_date,eta_date,status,driver,vehicle,items,total_weight,notes,created_by,notify_workers,cargo_confirmations)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id, orderNum, base_id || null, from_desc || '', depart_date || null, eta_date || null,
       status || 'new', driver || '', vehicle || '', JSON.stringify(items || []),
       total_weight || 0, notes || '', created_by || '',
       JSON.stringify(notify_workers || []), '[]']);

    (notify_workers || []).forEach(wName => {
      try {
        run(d, 'INSERT INTO notifications(id,recipient,type,title,body,ref_id,ref_type,is_read)VALUES(?,?,?,?,?,?,?,0)',
          [uuid(), wName, 'cargo_assigned', `📦 Новая заявка на перевозку №${orderNum}`,
           `${created_by || 'Система'} создал заявку. Требуется ваше подтверждение.`, id, 'cargo']);
      } catch(e) {}
    });
    L(null, base_id || null, 'Заявка на груз', `№${orderNum} создана`, created_by);
    res.json({ id, num: orderNum });
  }));

  app.post('/api/cargo/:id/confirm', wrap((req, res) => {
    const { worker_name, confirm } = req.body;
    if (!worker_name) return res.status(400).json({ error: 'Поле "worker_name" обязательно' });
    const d = db();
    const order = get(d, 'SELECT * FROM cargo_orders WHERE id=?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Not found' });
    let confs = tryJSON(order.cargo_confirmations, []);
    if (confirm && !confs.includes(worker_name)) confs.push(worker_name);
    if (!confirm) confs = confs.filter(x => x !== worker_name);
    run(d, 'UPDATE cargo_orders SET cargo_confirmations=? WHERE id=?', [JSON.stringify(confs), req.params.id]);
    const notifyWorkers = tryJSON(order.notify_workers, []);
    const allConfirmed = notifyWorkers.length > 0 && notifyWorkers.every(w => confs.includes(w));
    res.json({ confirmations: confs, allConfirmed });
  }));

  app.post('/api/cargo/:id/deliver', wrap((req, res) => {
    const { actual_arrive, notes: extraNotes, user_name } = req.body;
    const d = db();
    const order = get(d, 'SELECT * FROM cargo_orders WHERE id=?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Not found' });
    if (!order.base_id) return res.status(400).json({ error: 'Нет базы назначения' });
    const today = actual_arrive || new Date().toISOString().split('T')[0];
    let items = tryJSON(order.items, []);

    const pushed = [];
    items.forEach(item => {
      if (!item.name || !item.name.trim()) return;
      const normName = item.name.trim();
      const unit = (item.unit || 'шт').trim();
      const qty = parseFloat(item.qty) || 0;
      if (qty <= 0) return;
      const existing = get(d,
        'SELECT * FROM materials WHERE base_id=? AND LOWER(TRIM(name))=LOWER(?) AND LOWER(TRIM(unit))=LOWER(?)',
        [order.base_id, normName, unit]);
      if (existing) {
        const newAmt = (parseFloat(existing.amount) || 0) + qty;
        run(d, 'UPDATE materials SET amount=?,last_act_date=? WHERE id=?', [newAmt, today, existing.id]);
        run(d, 'INSERT INTO materials_log(id,material_id,base_id,prev_amount,new_amount,change_amount,act_date,notes,user_name)VALUES(?,?,?,?,?,?,?,?,?)',
          [uuid(), existing.id, order.base_id, existing.amount, newAmt, qty, today, `Груз заявка №${order.num}`, user_name || 'Система']);
        pushed.push({ name: normName, qty, action: 'updated', id: existing.id });
      } else {
        const newId = uuid();
        run(d, 'INSERT INTO materials(id,base_id,name,amount,unit,min_amount,notes,last_act_date)VALUES(?,?,?,?,?,0,?,?)',
          [newId, order.base_id, normName, qty, unit, `Из заявки №${order.num}`, today]);
        run(d, 'INSERT INTO materials_log(id,material_id,base_id,prev_amount,new_amount,change_amount,act_date,notes,user_name)VALUES(?,?,?,?,?,?,?,?,?)',
          [uuid(), newId, order.base_id, 0, qty, qty, today, `Груз заявка №${order.num}`, user_name || 'Система']);
        pushed.push({ name: normName, qty, action: 'created', id: newId });
      }
    });

    const updNotes = extraNotes ? (order.notes ? order.notes + ' | ' + extraNotes : extraNotes) : order.notes;
    run(d, 'UPDATE cargo_orders SET status=?,actual_arrive=?,notes=? WHERE id=?',
      ['delivered', today, updNotes || '', order.id]);

    // Auto-merge duplicates after delivery
    const mats = all(d, 'SELECT * FROM materials WHERE base_id=?', [order.base_id]);
    const groups = {};
    mats.forEach(m => {
      const key = m.name.trim().toLowerCase() + '||' + (m.unit || 'шт').trim().toLowerCase();
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    });
    Object.values(groups).forEach(grp => {
      if (grp.length < 2) return;
      const keep = grp[0];
      const totalAmount = grp.reduce((a, m) => a + (parseFloat(m.amount) || 0), 0);
      const maxMin = Math.max(...grp.map(m => parseFloat(m.min_amount) || 0));
      const notes = [...new Set(grp.map(m => m.notes).filter(Boolean))].join('; ');
      run(d, 'UPDATE materials SET amount=?,min_amount=?,notes=? WHERE id=?', [totalAmount, maxMin, notes, keep.id]);
      grp.slice(1).forEach(m => run(d, 'DELETE FROM materials WHERE id=?', [m.id]));
    });

    L(null, order.base_id, 'Груз доставлен', `Заявка №${order.num}: ${pushed.length} поз. → материалы`, user_name || 'Система');
    res.json({ ok: true, pushed });
  }));

  app.put('/api/cargo/:id', wrap((req, res) => {
    const { num, base_id, from_desc, depart_date, eta_date, actual_arrive, status,
            driver, vehicle, items, total_weight, notes, created_by } = req.body;
    const d = db();
    const existing = get(d, 'SELECT * FROM cargo_orders WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    run(d, 'UPDATE cargo_orders SET num=?,base_id=?,from_desc=?,depart_date=?,eta_date=?,actual_arrive=?,status=?,driver=?,vehicle=?,items=?,total_weight=?,notes=? WHERE id=?',
      [num || existing.num, base_id || null, from_desc || '', depart_date || null, eta_date || null,
       actual_arrive || null, status || existing.status, driver || '', vehicle || '',
       JSON.stringify(items || tryJSON(existing.items, [])), total_weight || 0, notes || '', req.params.id]);
    if (existing.status !== status) {
      L(null, base_id || null, 'Статус груза', `№${num || existing.num}: ${existing.status} → ${status}`, created_by || 'Система');
    }
    res.json({ success: true });
  }));

  app.delete('/api/cargo/:id', wrap((req, res) => {
    const _restore = trashAndDelete(db(), 'cargo_orders', req.params.id);
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, _restore });
  }));
};
