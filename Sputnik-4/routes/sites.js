const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');
const { required, wrap } = require('./validate');
const VS = require('./volume-sync');
const { trashAndDelete } = require('./realtime');

module.exports = (app, getDb, L) => {
  const db = () => getDb();

  // ── SITES ──────────────────────────────────────────────────
  app.get('/api/sites', wrap((req, res) => {
    const d = db();
    const sites = all(d, 'SELECT * FROM sites ORDER BY created_at DESC');
    sites.forEach(s => {
      s.open_tasks = (all(d, "SELECT COUNT(*) as cnt FROM site_tasks WHERE site_id=? AND status!='done'", [s.id])[0] || {}).cnt || 0;
    });
    res.json(sites);
  }));

  app.get('/api/sites/:id', wrap((req, res) => {
    const d = db();
    const s = get(d, 'SELECT * FROM sites WHERE id=?', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Не найдено' });

    const bids = all(d, 'SELECT base_id FROM site_bases WHERE site_id=?', [req.params.id]).map(r => r.base_id);
    const bases = bids.map(bid => {
      const b = get(d, 'SELECT * FROM bases WHERE id=?', [bid]);
      if (!b) return null;
      return {
        ...b,
        workers:   all(d, 'SELECT * FROM pgk_workers WHERE base_id=?', [bid]),
        machinery: all(d, 'SELECT * FROM pgk_machinery WHERE base_id=?', [bid]),
        equipment: all(d, 'SELECT * FROM pgk_equipment WHERE base_id=?', [bid]),
        materials: all(d, 'SELECT * FROM materials WHERE base_id=?', [bid]),
      };
    }).filter(Boolean);

    const kameral = all(d, 'SELECT * FROM kameral_reports WHERE site_id=? ORDER BY created_at', [req.params.id])
      .map(k => ({ ...k, remarks: all(d, 'SELECT * FROM kameral_remarks WHERE report_id=? ORDER BY created_at', [k.id]) }));

    res.json({
      ...s, bases,
      progress:     all(d, 'SELECT * FROM progress_items WHERE site_id=?', [req.params.id]),
      volumes:      all(d, 'SELECT * FROM volumes WHERE site_id=? ORDER BY category,name', [req.params.id]),
      log:          all(d, 'SELECT * FROM activity_log WHERE site_id=? ORDER BY created_at DESC LIMIT 50', [req.params.id]),
      kameral,
      tasks:        all(d, 'SELECT * FROM site_tasks WHERE site_id=? ORDER BY due_date ASC, created_at DESC', [req.params.id]),
      vol_progress: all(d, 'SELECT * FROM vol_progress WHERE site_id=? ORDER BY work_date', [req.params.id]),
    });
  }));

  app.post('/api/sites', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const id = uuid();
    const { name, client, contract_number, start_date, end_date, estimated_end, status, completion_percent, notes, address, user_name } = req.body;
    run(db(), 'INSERT INTO sites(id,name,client,contract_number,start_date,end_date,estimated_end,status,completion_percent,notes,address)VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      [id, name, client || '', contract_number || '', start_date || '', end_date || '', estimated_end || '', status || 'active', completion_percent || 0, notes || '', address || '']);
    L(id, null, 'Создан объект', name, user_name);
    res.json({ id });
  }));

  app.put('/api/sites/:id', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const { name, client, contract_number, start_date, end_date, estimated_end, status, completion_percent, notes, address, user_name } = req.body;
    run(db(), 'UPDATE sites SET name=?,client=?,contract_number=?,start_date=?,end_date=?,estimated_end=?,status=?,completion_percent=?,notes=?,address=? WHERE id=?',
      [name, client || '', contract_number || '', start_date || '', end_date || '', estimated_end || '', status, completion_percent || 0, notes || '', address || '', req.params.id]);
    L(req.params.id, null, 'Обновлён объект', name, user_name);
    res.json({ success: true });
  }));

  // Запись в журнал объекта (напр. «Простой из-за погоды»)
  app.post('/api/sites/:id/log', wrap((req, res) => {
    const { action, details, user_name } = req.body || {};
    if (!action) return res.status(400).json({ error: 'action обязателен' });
    if (!get(db(), 'SELECT id FROM sites WHERE id=?', [req.params.id])) return res.status(404).json({ error: 'Not found' });
    L(req.params.id, null, String(action).slice(0, 120), String(details || '').slice(0, 1000), user_name);
    res.json({ success: true });
  }));

  app.delete('/api/sites/:id', wrap((req, res) => {
    const d = db();
    // Всё удаление объекта — одной транзакцией: падение посередине
    // не оставит объект без замечаний/журнала, но с объёмами
    const _restore = d.transaction(() => {
      // remarks → удаляем без сохранения (зависят от уже удалённых reports)
      all(d, 'SELECT id FROM kameral_reports WHERE site_id=?', [req.params.id])
        .forEach(r => run(d, 'DELETE FROM kameral_remarks WHERE report_id=?', [r.id]));
      run(d, 'DELETE FROM activity_log WHERE site_id=?', [req.params.id]);
      return trashAndDelete(d, 'sites', req.params.id, {
        children: [
          { table: 'site_bases',      fkColumn: 'site_id' },
          { table: 'progress_items',  fkColumn: 'site_id' },
          { table: 'volumes',         fkColumn: 'site_id' },
          { table: 'site_tasks',      fkColumn: 'site_id' },
          { table: 'kameral_reports', fkColumn: 'site_id' },
          { table: 'vol_progress',    fkColumn: 'site_id' },
          { table: 'kml_layers',      fkColumn: 'site_id' },
          { table: 'photos',          fkColumn: 'entity_id' },
        ],
      });
    })();
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, _restore });
  }));

  app.put('/api/sites/:id/bases', wrap((req, res) => {
    const { base_ids, user_name } = req.body;
    const d = db();
    // DELETE + INSERT атомарно: падение посередине не оставит объект без баз
    d.transaction(() => {
      run(d, 'DELETE FROM site_bases WHERE site_id=?', [req.params.id]);
      (base_ids || []).forEach(bid => {
        try { run(d, 'INSERT INTO site_bases(site_id,base_id)VALUES(?,?)', [req.params.id, bid]); } catch (e) {}
      });
    })();
    L(req.params.id, null, 'Назначены базы', `${(base_ids || []).length} баз`, user_name);
    res.json({ success: true });
  }));

  // ── VOLUMES ────────────────────────────────────────────────
  app.get('/api/sites/:id/volumes', wrap((req, res) => {
    res.json(all(db(), 'SELECT * FROM volumes WHERE site_id=? ORDER BY category,name', [req.params.id]));
  }));

  // Объём: ручной (план числом) или на слое KML (layer_id + measure_json — план и факт
  // считаются по объектам слоя, см. volume-sync.js)
  const _measure = m => m == null ? null : (typeof m === 'string' ? m : JSON.stringify(m));
  const _layerBusy = (layerId, selfId) => layerId ? get(db(), 'SELECT id, name FROM volumes WHERE layer_id=? AND id<>?', [layerId, selfId || '']) : null;
  // Все объёмы (кратко) — клиенту, чтобы по слою знать, объём ли он и чего
  app.get('/api/volumes', wrap((req, res) => {
    res.json(all(db(), `SELECT v.id, v.site_id, v.name, v.category, v.layer_id, v.measure_json, v.unit, v.amount, v.amount2, v.color, v.plan_start, v.plan_end,
        s.name AS site_name, COALESCE(f.done, 0) AS done, COALESCE(f.done2, 0) AS done2
      FROM volumes v LEFT JOIN sites s ON s.id = v.site_id
      LEFT JOIN (SELECT volume_id, SUM(completed) AS done, SUM(amount2) AS done2 FROM vol_progress
                 WHERE COALESCE(row_type,'fact')='fact' GROUP BY volume_id) f ON f.volume_id = v.id
      ORDER BY s.name, v.name`));
  }));

  app.post('/api/sites/:id/volumes', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const id = uuid();
    const { category, name, amount, unit, color, fill_opacity, plan_start, plan_end, notes, layer_id, measure_json, amount2 } = req.body;
    const busy = _layerBusy(layer_id);
    if (busy) return res.status(400).json({ error: `Этот слой уже объём «${busy.name}»` });
    if (layer_id && !get(db(), 'SELECT id FROM kml_layers WHERE id=?', [layer_id])) return res.status(400).json({ error: 'Слой не найден' });
    run(db(), 'INSERT INTO volumes(id,site_id,category,name,amount,unit,color,fill_opacity,plan_start,plan_end,notes,layer_id,measure_json,amount2)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id, req.params.id, category || 'geology', name, amount || 0, unit || 'шт',
       color || '#1a56db', fill_opacity !== undefined ? fill_opacity : 0.25, plan_start || null, plan_end || null, notes || '',
       layer_id || null, _measure(measure_json), amount2 != null ? amount2 : null]);
    const txt = VS.syncVolumeId(db(), id);
    if (!layer_id) VS.recalcSite(db(), req.params.id);
    res.json({ id, layerChanged: !!txt });
  }));

  // Частичная правка: поля, которых нет в запросе, не меняются
  app.put('/api/volumes/:id', wrap((req, res) => {
    const ex = get(db(), 'SELECT * FROM volumes WHERE id=?', [req.params.id]);
    if (!ex) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    const pick = k => b[k] !== undefined ? b[k] : ex[k];
    const name = pick('name'); if (!name) return res.status(400).json({ error: 'Не указано название' });
    const layer_id = b.layer_id !== undefined ? (b.layer_id || null) : ex.layer_id;
    const busy = _layerBusy(layer_id, ex.id);
    if (busy) return res.status(400).json({ error: `Этот слой уже объём «${busy.name}»` });
    run(db(), 'UPDATE volumes SET category=?,name=?,amount=?,unit=?,color=?,fill_opacity=?,plan_start=?,plan_end=?,notes=?,layer_id=?,measure_json=?,amount2=? WHERE id=?',
      [pick('category') || 'geology', name, pick('amount') || 0, pick('unit') || 'шт', pick('color') || '#1a56db',
       pick('fill_opacity') != null ? pick('fill_opacity') : 0.25, pick('plan_start') || null, pick('plan_end') || null, pick('notes') || '',
       layer_id, b.measure_json !== undefined ? _measure(b.measure_json) : ex.measure_json, pick('amount2'), req.params.id]);
    VS.syncVolumeId(db(), req.params.id);   // отвязали слой — зеркальные строки уйдут; ручной — пересчёт %
    res.json({ success: true });
  }));

  app.patch('/api/volumes/:id/visible', wrap((req, res) => {
    const vis = req.body.visible ? 1 : 0;
    run(db(), 'UPDATE volumes SET visible=? WHERE id=?', [vis, req.params.id]);
    res.json({ ok: true });
  }));

  app.delete('/api/volumes/:id', wrap((req, res) => {
    const v = get(db(), 'SELECT site_id FROM volumes WHERE id=?', [req.params.id]);
    const _restore = trashAndDelete(db(), 'volumes', req.params.id, {
      children: [{ table: 'vol_progress', fkColumn: 'volume_id' }],
    });
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    if (v) VS.recalcSite(db(), v.site_id);
    res.json({ success: true, _restore });
  }));

  // ── VOL_PROGRESS ───────────────────────────────────────────
  // source='kml' — строки, построенные из отметок «выполнено» в слое: руками не правятся
  app.get('/api/sites/:id/vol_progress', wrap((req, res) =>
    res.json(all(db(), 'SELECT * FROM vol_progress WHERE site_id=? ORDER BY work_date DESC', [req.params.id]))
  ));

  app.post('/api/volumes/:id/progress', wrap((req, res) => {
    const pid = uuid();
    const { site_id, work_date, completed, notes, geojson, worker_ids, amount2 } = req.body;
    const { cell_color = '', machine_id = null, act_number = '', row_type = 'fact' } = req.body;
    if (!work_date) return res.status(400).json({ error: 'Не указана дата' });
    const vol = get(db(), 'SELECT site_id FROM volumes WHERE id=?', [req.params.id]);
    if (!vol) return res.status(404).json({ error: 'Объём не найден' });
    run(db(), "INSERT INTO vol_progress(id,volume_id,site_id,work_date,completed,amount2,notes,geojson,worker_ids,machine_id,act_number,cell_color,row_type,source)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'manual')",
      [pid, req.params.id, site_id || vol.site_id, work_date, completed || 0, amount2 != null && amount2 !== '' ? amount2 : null, notes || '', geojson || null,
       worker_ids || '', machine_id || null, act_number || '', cell_color || '', row_type]);
    VS.recalcSite(db(), site_id || vol.site_id);
    res.json({ id: pid });
  }));

  app.put('/api/vol_progress/:id', wrap((req, res) => {
    const d = db();
    const existing = get(d, 'SELECT * FROM vol_progress WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.source === 'kml') return res.status(400).json({ error: 'Это выполнение из слоя — меняйте отметку на объекте слоя' });
    const b = req.body, pick = k => b[k] !== undefined ? b[k] : existing[k];
    const hidden = b.hidden !== undefined ? (b.hidden ? 1 : 0) : (existing.hidden || 0);
    run(d, 'UPDATE vol_progress SET work_date=?,completed=?,amount2=?,notes=?,geojson=?,act_date=?,cell_color=?,row_type=?,hidden=?,worker_ids=?,machine_id=? WHERE id=?',
      [pick('work_date'), pick('completed') || 0, pick('amount2'), pick('notes') || '', pick('geojson'), pick('act_date') || null,
       pick('cell_color') || '', pick('row_type') || 'fact', hidden, pick('worker_ids') || '', pick('machine_id') || null, req.params.id]);
    VS.recalcSite(d, existing.site_id);
    res.json({ success: true });
  }));

  app.delete('/api/vol_progress/:id', wrap((req, res) => {
    const ex = get(db(), 'SELECT site_id, source FROM vol_progress WHERE id=?', [req.params.id]);
    if (ex && ex.source === 'kml') return res.status(400).json({ error: 'Это выполнение из слоя — снимите отметку на объекте слоя' });
    const _restore = trashAndDelete(db(), 'vol_progress', req.params.id);
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    if (ex) VS.recalcSite(db(), ex.site_id);
    res.json({ success: true, _restore });
  }));

  // ── PROGRESS ITEMS ─────────────────────────────────────────
  app.post('/api/sites/:id/progress', wrap((req, res) => {
    const err = required(['work_type'], req.body);
    if (err) return res.status(400).json({ error: err });
    const id = uuid();
    const { work_type, completed, total, unit, notes } = req.body;
    run(db(), 'INSERT INTO progress_items(id,site_id,work_type,completed,total,unit,notes)VALUES(?,?,?,?,?,?,?)',
      [id, req.params.id, work_type, completed || 0, total || 0, unit || 'шт', notes || '']);
    res.json({ id });
  }));

  app.put('/api/progress/:id', wrap((req, res) => {
    const err = required(['work_type'], req.body);
    if (err) return res.status(400).json({ error: err });
    const { work_type, completed, total, unit, notes, site_id, user_name } = req.body;
    run(db(), 'UPDATE progress_items SET work_type=?,completed=?,total=?,unit=?,notes=? WHERE id=?',
      [work_type, completed || 0, total || 0, unit || 'шт', notes || '', req.params.id]);
    if (site_id) L(site_id, null, 'Прогресс', `${work_type}:${completed}/${total}`, user_name);
    res.json({ success: true });
  }));

  app.delete('/api/progress/:id', wrap((req, res) => {
    const _restore = trashAndDelete(db(), 'progress_items', req.params.id);
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, _restore });
  }));

  // ── КАМЕРАЛЬНЫЕ РАБОТЫ ─────────────────────────────────────
  app.post('/api/sites/:id/kameral', wrap((req, res) => {
    const id = uuid();
    const { specialist_name, specialist_role, completion_percent, revision, report_link, notes, user_name } = req.body;
    run(db(), 'INSERT INTO kameral_reports(id,site_id,specialist_name,specialist_role,completion_percent,revision,report_link,notes)VALUES(?,?,?,?,?,?,?,?)',
      [id, req.params.id, specialist_name || '', specialist_role || '', completion_percent || 0, revision || 'Р0', report_link || '', notes || '']);
    L(req.params.id, null, 'Камеральные работы', `${specialist_name} добавлен`, user_name);
    res.json({ id });
  }));

  app.put('/api/kameral/:id', wrap((req, res) => {
    const { specialist_name, specialist_role, completion_percent, revision, report_link, notes, site_id, user_name } = req.body;
    run(db(), 'UPDATE kameral_reports SET specialist_name=?,specialist_role=?,completion_percent=?,revision=?,report_link=?,notes=? WHERE id=?',
      [specialist_name || '', specialist_role || '', completion_percent || 0, revision || 'Р0', report_link || '', notes || '', req.params.id]);
    if (site_id) L(site_id, null, 'Камеральные', `${specialist_name} обновлён`, user_name);
    res.json({ success: true });
  }));

  app.delete('/api/kameral/:id', wrap((req, res) => {
    const _restore = trashAndDelete(db(), 'kameral_reports', req.params.id, {
      children: [{ table: 'kameral_remarks', fkColumn: 'report_id' }],
    });
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, _restore });
  }));

  app.post('/api/kameral/:id/remarks', wrap((req, res) => {
    const err = required(['text'], req.body);
    if (err) return res.status(400).json({ error: err });
    const rid = uuid();
    const { text, link } = req.body;
    run(db(), 'INSERT INTO kameral_remarks(id,report_id,text,link,status)VALUES(?,?,?,?,?)',
      [rid, req.params.id, text, link || '', 'open']);
    res.json({ id: rid });
  }));

  app.put('/api/remarks/:id', wrap((req, res) => {
    const { text, link, status } = req.body;
    run(db(), 'UPDATE kameral_remarks SET text=?,link=?,status=? WHERE id=?',
      [text || '', link || '', status || 'open', req.params.id]);
    res.json({ success: true });
  }));

  app.delete('/api/remarks/:id', wrap((req, res) => {
    const _restore = trashAndDelete(db(), 'kameral_remarks', req.params.id);
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, _restore });
  }));

  // ── SITE TASKS ─────────────────────────────────────────────
  app.post('/api/sites/:id/tasks', wrap((req, res) => {
    const err = required(['title'], req.body);
    if (err) return res.status(400).json({ error: err });
    const id = uuid();
    const { title, description, responsible, due_date, priority, user_name } = req.body;
    run(db(), 'INSERT INTO site_tasks(id,site_id,title,description,responsible,due_date,priority,status)VALUES(?,?,?,?,?,?,?,?)',
      [id, req.params.id, title, description || '', responsible || '', due_date || null, priority || 'normal', 'open']);
    L(req.params.id, null, 'Создана задача', title, user_name);
    res.json({ id });
  }));

  app.put('/api/tasks/:id', wrap((req, res) => {
    const err = required(['title'], req.body);
    if (err) return res.status(400).json({ error: err });
    const { title, description, responsible, due_date, priority, status, closed_by, closed_at } = req.body;
    run(db(), 'UPDATE site_tasks SET title=?,description=?,responsible=?,due_date=?,priority=?,status=?,closed_by=?,closed_at=? WHERE id=?',
      [title, description || '', responsible || '', due_date || null, priority || 'normal', status || 'open', closed_by || null, closed_at || null, req.params.id]);
    res.json({ success: true });
  }));

  app.delete('/api/tasks/:id', wrap((req, res) => {
    const _restore = trashAndDelete(db(), 'site_tasks', req.params.id);
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, _restore });
  }));

  // ── KML LAYERS PER SITE ────────────────────────────────────
  app.get('/api/sites/:id/layers', wrap((req, res) =>
    res.json(all(db(), 'SELECT * FROM kml_layers WHERE site_id=? ORDER BY created_at DESC', [req.params.id]))
  ));

  app.post('/api/sites/:id/layers', wrap((req, res) => {
    const err = required(['name', 'geojson'], req.body);
    if (err) return res.status(400).json({ error: err });
    const id = uuid();
    const { name, geojson, color } = req.body;
    try { db().run('ALTER TABLE kml_layers ADD COLUMN site_id TEXT'); } catch(e) {}
    run(db(), 'INSERT INTO kml_layers(id,site_id,name,geojson,color,visible)VALUES(?,?,?,?,?,1)',
      [id, req.params.id, name, geojson, color || '#1a56db']);
    res.json({ id });
  }));
};
