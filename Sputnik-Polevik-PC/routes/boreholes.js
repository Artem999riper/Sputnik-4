// CRUD для скважин со встроенным сохранением слоёв, проб, УГВ, ММГ
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../database');
const { safeFolderName, buildBhFolderName } = require('../lib/safe_folder');

function loadFull(d, uuid) {
  const bh = get(d, 'SELECT * FROM boreholes WHERE uuid=?', [uuid]);
  if (!bh) return null;
  bh.soil_layers = all(d, 'SELECT * FROM soil_layers WHERE borehole_uuid=? ORDER BY order_idx', [uuid]);
  bh.soil_layers.forEach(l => {
    l.samples = all(d, 'SELECT * FROM samples WHERE layer_uuid=? ORDER BY depth_m', [l.uuid]);
  });
  bh.ugv = all(d, 'SELECT * FROM ugv WHERE borehole_uuid=? ORDER BY order_idx', [uuid]);
  bh.mmg = all(d, 'SELECT * FROM mmg WHERE borehole_uuid=? ORDER BY order_idx', [uuid]);
  bh.photos = all(d, 'SELECT * FROM photos WHERE borehole_uuid=? ORDER BY taken_at', [uuid]);
  return bh;
}

module.exports = (app, ctx) => {
  const { db, wrap, UPLOADS_DIR } = ctx;

  app.get('/api/boreholes', wrap((req, res) => {
    const d = db();
    const { volume_id, status, q } = req.query;
    let sql = 'SELECT * FROM boreholes WHERE 1=1';
    const p = [];
    if (volume_id) { sql += ' AND volume_id=?'; p.push(volume_id); }
    if (status)    { sql += ' AND status=?';    p.push(status); }
    if (q) { sql += ' AND LOWER(name) LIKE ?'; p.push('%' + String(q).toLowerCase() + '%'); }
    sql += ' ORDER BY drill_date DESC, created_at DESC';
    const rows = all(d, sql, p);
    rows.forEach(bh => {
      bh.photos_count = get(d, 'SELECT COUNT(*) c FROM photos WHERE borehole_uuid=?', [bh.uuid]).c;
      bh.layers_count = get(d, 'SELECT COUNT(*) c FROM soil_layers WHERE borehole_uuid=?', [bh.uuid]).c;
    });
    res.json(rows);
  }));

  app.get('/api/boreholes/:uuid', wrap((req, res) => {
    const d = db();
    const bh = loadFull(d, req.params.uuid);
    if (!bh) return res.status(404).json({ error: 'not found' });
    res.json(bh);
  }));

  // Создание / полное обновление со вложенными сущностями
  app.put('/api/boreholes/:uuid', wrap((req, res) => {
    const d = db();
    const u = req.params.uuid;
    const b = req.body || {};
    const tx = d.transaction(() => {
      const exists = get(d, 'SELECT uuid FROM boreholes WHERE uuid=?', [u]);
      const params = [
        b.site_id || null,
        b.volume_id || null,
        b.kml_point_id || null,
        b.manual_lat != null && b.manual_lat !== '' ? Number(b.manual_lat) : null,
        b.manual_lng != null && b.manual_lng !== '' ? Number(b.manual_lng) : null,
        b.name || null,
        Number(b.planned_depth_m) || 0,
        Number(b.diameter_mm) || 0,
        b.work_type || 'SEARCH',
        b.geomorph_desc || null,
        b.description || null,
        b.drill_date || null,
        b.status || 'draft',
        b.brigade_id || null,
        Number(b.casing_length_m) || 0,
        b.brigade_snapshot ? (typeof b.brigade_snapshot === 'string' ? b.brigade_snapshot : JSON.stringify(b.brigade_snapshot)) : null,
      ];
      if (exists) {
        run(d, `UPDATE boreholes SET site_id=?,volume_id=?,kml_point_id=?,manual_lat=?,manual_lng=?,
                name=?,planned_depth_m=?,diameter_mm=?,work_type=?,geomorph_desc=?,description=?,
                drill_date=?,status=?,brigade_id=?,casing_length_m=?,brigade_snapshot=? WHERE uuid=?`,
          [...params, u]);
      } else {
        run(d, `INSERT INTO boreholes(site_id,volume_id,kml_point_id,manual_lat,manual_lng,name,
                planned_depth_m,diameter_mm,work_type,geomorph_desc,description,drill_date,status,
                brigade_id,casing_length_m,brigade_snapshot,uuid) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [...params, u]);
      }

      // Слои + пробы — replace целиком
      if (Array.isArray(b.soil_layers)) {
        run(d, 'DELETE FROM soil_layers WHERE borehole_uuid=?', [u]);
        const lIns = d.prepare(`INSERT INTO soil_layers(uuid,borehole_uuid,order_idx,soil_type,state,
                                description,depth_m,frozen_state) VALUES(?,?,?,?,?,?,?,?)`);
        const sIns = d.prepare(`INSERT INTO samples(uuid,layer_uuid,collection_type,packaging,
                                depth_m,depth_top_m,depth_bottom_m) VALUES(?,?,?,?,?,?,?)`);
        b.soil_layers.forEach((l, i) => {
          const lid = l.uuid || uuidv4();
          lIns.run(lid, u, l.order_idx != null ? l.order_idx : i,
            l.soil_type || null, l.state || null, l.description || null,
            Number(l.depth_m) || 0, l.frozen_state || null);
          (l.samples || []).forEach(s => {
            sIns.run(s.uuid || uuidv4(), lid,
              s.collection_type || null, s.packaging || null,
              s.depth_m != null ? Number(s.depth_m) : null,
              s.depth_top_m != null ? Number(s.depth_top_m) : null,
              s.depth_bottom_m != null ? Number(s.depth_bottom_m) : null);
          });
        });
      }
      if (Array.isArray(b.ugv)) {
        run(d, 'DELETE FROM ugv WHERE borehole_uuid=?', [u]);
        const ins = d.prepare('INSERT INTO ugv(uuid,borehole_uuid,order_idx,depth_m) VALUES(?,?,?,?)');
        b.ugv.forEach((x, i) => ins.run(x.uuid || uuidv4(), u, i, Number(x.depth_m) || 0));
      }
      if (Array.isArray(b.mmg)) {
        run(d, 'DELETE FROM mmg WHERE borehole_uuid=?', [u]);
        const ins = d.prepare('INSERT INTO mmg(uuid,borehole_uuid,order_idx,top_m,bottom_m,description) VALUES(?,?,?,?,?,?)');
        b.mmg.forEach((x, i) => ins.run(x.uuid || uuidv4(), u, i,
          Number(x.top_m) || 0, Number(x.bottom_m) || 0, x.description || null));
      }
    });
    tx();
    res.json({ ok: true, borehole: loadFull(d, u) });
  }));

  app.delete('/api/boreholes/:uuid', wrap((req, res) => {
    const d = db();
    const u = req.params.uuid;
    const bh = get(d, 'SELECT b.*, s.name AS site_name FROM boreholes b LEFT JOIN sites s ON s.id=b.site_id WHERE b.uuid=?', [u]);
    if (!bh) return res.status(404).json({ error: 'not found' });
    run(d, 'DELETE FROM boreholes WHERE uuid=?', [u]);
    try {
      const dir = path.join(UPLOADS_DIR, safeFolderName(bh.site_name || ''), buildBhFolderName(bh));
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) { console.warn('Не удалось удалить папку фото:', e.message); }
    res.json({ ok: true });
  }));

  app.post('/api/boreholes/:uuid/finalize', wrap((req, res) => {
    const d = db();
    const u = req.params.uuid;
    const bh = loadFull(d, u);
    if (!bh) return res.status(404).json({ error: 'not found' });
    const issues = [];
    if (!bh.planned_depth_m || bh.planned_depth_m <= 0) issues.push('плановая глубина не указана');
    if (!bh.photos.length) issues.push('нет фотографий');
    if (bh.soil_layers.some(l => !l.depth_m || l.depth_m <= 0)) issues.push('слой без глубины подошвы');
    if (issues.length && !req.body?.force) return res.status(400).json({ error: 'validation', issues });
    run(d, "UPDATE boreholes SET status='done' WHERE uuid=?", [u]);
    res.json({ ok: true, issues });
  }));

  app.post('/api/boreholes/:uuid/reopen', wrap((req, res) => {
    run(db(), "UPDATE boreholes SET status='draft' WHERE uuid=?", [req.params.uuid]);
    res.json({ ok: true });
  }));

  // Custom soil refs
  app.get('/api/custom-soil-types',  wrap((_, res) => res.json(all(db(), 'SELECT name FROM custom_soil_types ORDER BY name').map(x => x.name))));
  app.get('/api/custom-soil-states', wrap((_, res) => res.json(all(db(), 'SELECT name FROM custom_soil_states ORDER BY name').map(x => x.name))));
  app.post('/api/custom-soil-types',  wrap((req, res) => {
    if (!req.body?.name) return res.status(400).json({ error: 'name' });
    run(db(), 'INSERT OR IGNORE INTO custom_soil_types(name) VALUES(?)', [String(req.body.name)]);
    res.json({ ok: true });
  }));
  app.post('/api/custom-soil-states', wrap((req, res) => {
    if (!req.body?.name) return res.status(400).json({ error: 'name' });
    run(db(), 'INSERT OR IGNORE INTO custom_soil_states(name) VALUES(?)', [String(req.body.name)]);
    res.json({ ok: true });
  }));
};

module.exports.loadFull = loadFull;
