const path = require('path');
const fs   = require('fs');
const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');
const { required, wrap } = require('./validate');
const { trashAndDelete, broadcast } = require('./realtime');
const proj4 = require('proj4');

// ── DXF IMPORT HELPERS ─────────────────────────────────────
const _DXF_WGS84 = '+proj=longlat +datum=WGS84 +no_defs';
function _dxfMskProj(zone) {
  const lon_0 = 60.05 + 6 * (zone - 1), x_0 = zone * 1000000 + 500000;
  return `+proj=tmerc +lat_0=0 +lon_0=${lon_0} +k=1 +x_0=${x_0} +y_0=-5811057.63 +ellps=krass +towgs84=23.57,-140.95,-79.8,0,0.35,0.79,-0.22 +units=m +no_defs`;
}
function _dxfGskProj(zone) {
  const lon_0 = zone * 6 - 3, x_0 = zone * 1000000 + 500000;
  return `+proj=tmerc +lat_0=0 +lon_0=${lon_0} +k=1 +x_0=${x_0} +y_0=0 +a=6378136.5 +rf=298.2564151 +towgs84=0.013,-0.092,-0.03,-0.001738,0.003559,-0.004263,0.0074 +units=m +no_defs`;
}

function parseDXF(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    const val  = lines[i + 1] ? lines[i + 1].trim() : '';
    if (!isNaN(code)) pairs.push([code, val]);
  }

  const dxfLayers = new Map();
  let inEntities = false;
  const ENTITY_TYPES = new Set(['POINT','LINE','ARC','LWPOLYLINE','POLYLINE','VERTEX','SEQEND','TEXT','MTEXT','ATTRIB','INSERT']);
  let i = 0;
  while (i < pairs.length) {
    const [code, val] = pairs[i];
    if (code === 0 && val === 'SECTION') {
      i++;
      if (pairs[i] && pairs[i][0] === 2) {
        inEntities = pairs[i][1] === 'ENTITIES';
        i++;
      }
      continue;
    }
    if (code === 0 && val === 'ENDSEC') { inEntities = false; i++; continue; }
    if (!inEntities) { i++; continue; }

    if (code === 0 && ENTITY_TYPES.has(val)) {
      const type = val;
      const codes = [];
      i++;
      while (i < pairs.length && pairs[i][0] !== 0) { codes.push(pairs[i]); i++; }
      const layerName = codes.find(([c]) => c === 8)?.[1] || '0';
      const entity = { type, layer: layerName, codes };

      if (type === 'POLYLINE') {
        entity.vertices = [];
        while (i < pairs.length) {
          if (pairs[i][0] !== 0) { i++; continue; }
          if (pairs[i][1] === 'VERTEX') {
            i++;
            const vc = [];
            while (i < pairs.length && pairs[i][0] !== 0) { vc.push(pairs[i]); i++; }
            entity.vertices.push(vc);
          } else if (pairs[i][1] === 'SEQEND') {
            i++;
            while (i < pairs.length && pairs[i][0] !== 0) i++;
            break;
          } else { break; }
        }
      }
      if (type !== 'SEQEND' && type !== 'VERTEX') {
        if (!dxfLayers.has(layerName)) dxfLayers.set(layerName, []);
        dxfLayers.get(layerName).push(entity);
      }
    } else { i++; }
  }
  return dxfLayers;
}

function _dxfFindFirstX(dxfLayers) {
  for (const entities of dxfLayers.values()) {
    for (const ent of entities) {
      const p = ent.codes.find(([c]) => c === 10);
      if (p) { const x = parseFloat(p[1]); if (isFinite(x) && Math.abs(x) > 1000) return x; }
    }
  }
  return 3500000;
}

function makeDxfInverseTransform(crs, sampleX) {
  if (crs === 'wgs84') return (x, y) => [x, y];
  let zone;
  if      (crs === 'msk86_z3') zone = 3;
  else if (crs === 'msk86_z4') zone = 4;
  else if (crs === 'msk86')    zone = Math.round((sampleX || 3500000) / 1e6);
  else                          zone = Math.floor((sampleX || 3500000) / 1e6); // gsk2011
  const projStr = crs === 'gsk2011' ? _dxfGskProj(zone) : _dxfMskProj(zone);
  return (x, y) => { const [lng, lat] = proj4(projStr, _DXF_WGS84, [x, y]); return [lng, lat]; };
}

// Раскрыть «bulge» (выпуклость вершины полилинии) в точки дуги.
// Возвращает промежуточные точки между p1 и p2 (без самих концов).
function _bulgeArcPoints(x1, y1, x2, y2, bulge) {
  const theta = 4 * Math.atan(bulge);              // полный угол дуги (со знаком)
  const dx = x2 - x1, dy = y2 - y1;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-9 || !isFinite(theta) || Math.abs(theta) < 1e-6) return [];
  const R = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const apoth = Math.sqrt(Math.max(0, R * R - (chord / 2) * (chord / 2)));
  const nx = -dy / chord, ny = dx / chord;         // нормаль к хорде
  const sign = (bulge > 0 ? 1 : -1) * (Math.abs(theta) > Math.PI ? -1 : 1);
  const cx = mx + nx * apoth * sign;
  const cy = my + ny * apoth * sign;
  let a1 = Math.atan2(y1 - cy, x1 - cx);
  let a2 = Math.atan2(y2 - cy, x2 - cx);
  if (bulge > 0 && a2 < a1) a2 += 2 * Math.PI;     // CCW
  if (bulge < 0 && a2 > a1) a2 -= 2 * Math.PI;     // CW
  const sweep = a2 - a1;
  const nSeg = Math.max(2, Math.ceil(Math.abs(sweep) / (5 * Math.PI / 180)));
  const out = [];
  for (let k = 1; k < nSeg; k++) {
    const a = a1 + sweep * k / nSeg;
    out.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  return out;
}

// Превратить вершины [{x,y,bulge}] в плотную ломаную (в координатах DXF),
// раскрывая дуги по bulge.
function _densifyVerts(verts, closed) {
  const out = [];
  const n = verts.length;
  const lim = closed ? n : n - 1;
  for (let i = 0; i < lim; i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    out.push([a.x, a.y]);
    if (a.bulge && Math.abs(a.bulge) > 1e-9)
      for (const p of _bulgeArcPoints(a.x, a.y, b.x, b.y, a.bulge)) out.push(p);
  }
  if (!closed) out.push([verts[n - 1].x, verts[n - 1].y]);
  return out;
}

function dxfEntitiesToFeatures(entities, inv) {
  const features = [];
  const gF = (c, code) => { const p = c.find(([k]) => k === code); return p ? parseFloat(p[1]) : 0; };
  const gAll = (c, code) => c.filter(([k]) => k === code).map(([, v]) => parseFloat(v));
  const gS = (c, code) => { const p = c.find(([k]) => k === code); return p ? p[1] : ''; };
  const safeInv = (x, y) => { try { const r = inv(x, y); return (isFinite(r[0]) && isFinite(r[1])) ? r : null; } catch (_) { return null; } };

  for (const ent of entities) {
    const c = ent.codes;
    const name = gS(c, 1);
    switch (ent.type) {
      case 'POINT': case 'INSERT': {
        const xy = safeInv(gF(c, 10), gF(c, 20));
        if (xy) features.push({ type:'Feature', geometry:{ type:'Point', coordinates:xy }, properties:{ name } });
        break;
      }
      case 'LINE': {
        const a = safeInv(gF(c, 10), gF(c, 20)), b = safeInv(gF(c, 11), gF(c, 21));
        if (a && b) features.push({ type:'Feature', geometry:{ type:'LineString', coordinates:[a, b] }, properties:{ name } });
        break;
      }
      case 'LWPOLYLINE': {
        // Считываем вершины по порядку, сохраняя bulge (код 42) каждой вершины
        const verts = [];
        let cur = null;
        for (const [k, v] of c) {
          if (k === 10) { if (cur) verts.push(cur); cur = { x: parseFloat(v), y: 0, bulge: 0 }; }
          else if (k === 20 && cur) cur.y = parseFloat(v);
          else if (k === 42 && cur) cur.bulge = parseFloat(v);
        }
        if (cur) verts.push(cur);
        if (verts.length < 2) break;
        const closed = !!(gF(c, 70) & 0x01);
        const pts = _densifyVerts(verts, closed && verts.length >= 3)
          .map(([x, y]) => safeInv(x, y)).filter(Boolean);
        if (pts.length < 2) break;
        if (closed && pts.length >= 3) {
          pts.push(pts[0]);
          features.push({ type:'Feature', geometry:{ type:'Polygon', coordinates:[pts] }, properties:{ name } });
        } else {
          features.push({ type:'Feature', geometry:{ type:'LineString', coordinates:pts }, properties:{ name } });
        }
        break;
      }
      case 'POLYLINE': {
        if (!ent.vertices || ent.vertices.length < 2) break;
        const verts = ent.vertices.map(vc => ({
          x: parseFloat(vc.find(([k]) => k === 10)?.[1] || 0),
          y: parseFloat(vc.find(([k]) => k === 20)?.[1] || 0),
          bulge: parseFloat(vc.find(([k]) => k === 42)?.[1] || 0),
        }));
        const closed = !!(gF(c, 70) & 0x01);
        const pts = _densifyVerts(verts, closed && verts.length >= 3)
          .map(([x, y]) => safeInv(x, y)).filter(Boolean);
        if (pts.length < 2) break;
        if (closed && pts.length >= 3) {
          pts.push(pts[0]);
          features.push({ type:'Feature', geometry:{ type:'Polygon', coordinates:[pts] }, properties:{ name } });
        } else {
          features.push({ type:'Feature', geometry:{ type:'LineString', coordinates:pts }, properties:{ name } });
        }
        break;
      }
      case 'ARC': {
        // Approximate arc as line segments (≤5° per segment)
        const cx = gF(c, 10), cy = gF(c, 20), r = gF(c, 40);
        if (r <= 0) break;
        let a0 = gF(c, 50), a1 = gF(c, 51);
        if (a1 <= a0) a1 += 360; // arcs are CCW
        const span = a1 - a0;
        const nSeg = Math.max(8, Math.ceil(span / 5));
        const arcPts = [];
        for (let j = 0; j <= nSeg; j++) {
          const ang = (a0 + span * j / nSeg) * Math.PI / 180;
          const xy = safeInv(cx + r * Math.cos(ang), cy + r * Math.sin(ang));
          if (xy) arcPts.push(xy);
        }
        if (arcPts.length >= 2)
          features.push({ type:'Feature', geometry:{ type:'LineString', coordinates:arcPts }, properties:{ name } });
        break;
      }
      case 'TEXT': case 'MTEXT': case 'ATTRIB': {
        // Text / block-attribute label → named Point
        const txt = (gS(c, 1) || '').replace(/\\[pPfFhHwWqQaAlLkKoOcCtTb];?|[{}]/g, '').trim();
        const xy = safeInv(gF(c, 10), gF(c, 20));
        if (xy) features.push({ type:'Feature', geometry:{ type:'Point', coordinates:xy }, properties:{ name: txt } });
        break;
      }
    }
  }
  return features;
}

module.exports = (app, getDb, L, { upload, demProcessor, BACKUP_DIR, doBackup, getBackupSettings, setBackupSettings, performAutoBackup }) => {
  const db = () => getDb();

  // Инициализация пути к dem_tiles из сохранённых настроек
  if (demProcessor && demProcessor.setDemTilesDir) {
    try {
      const saved = get(db(), "SELECT value FROM app_settings WHERE key='dem_tiles_dir'");
      if (saved) demProcessor.setDemTilesDir(saved.value.replace(/^"|"$/g, ''));
    } catch(_) {}
  }

  // ── APP SETTINGS (shared key-value store) ──────────────────
  app.get('/api/app-settings/:key', wrap((req, res) => {
    const row = get(db(), 'SELECT value FROM app_settings WHERE key=?', [req.params.key]);
    if (!row) return res.json({ value: null });
    try { res.json({ value: JSON.parse(row.value) }); } catch(e) { res.json({ value: row.value }); }
  }));

  app.put('/api/app-settings/:key', wrap((req, res) => {
    const { value } = req.body;
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    run(db(), 'INSERT OR REPLACE INTO app_settings(key,value)VALUES(?,?)', [req.params.key, str]);
    res.json({ ok: true });
  }));

  // ── KML LAYERS (global) ────────────────────────────────────
  app.get('/api/layers', wrap((req, res) =>
    res.json(all(db(), 'SELECT * FROM kml_layers ORDER BY created_at DESC'))
  ));

  app.post('/api/layers', wrap((req, res) => {
    const err = required(['name', 'geojson'], req.body);
    if (err) return res.status(400).json({ error: err });
    const id = uuid();
    const { name, geojson, color, symbol, group_id, line_dash } = req.body;
    run(db(), 'INSERT INTO kml_layers(id,name,geojson,color,visible,symbol,group_id,line_dash)VALUES(?,?,?,?,1,?,?,?)',
      [id, name, geojson, color || '#1a56db', symbol || '', group_id || '', line_dash || 'solid']);
    res.json({ id });
  }));

  app.get('/api/layers/:id', wrap((req, res) => {
    const l = get(db(), 'SELECT * FROM kml_layers WHERE id=?', [req.params.id]);
    if (!l) return res.status(404).json({ error: 'Not found' });
    res.json(l);
  }));

  app.put('/api/layers/:id', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const { name, color, visible, symbol, group_id, line_dash, geojson, min_zoom, max_zoom, size, show_labels, fill_opacity } = req.body;
    const vis  = visible === false ? 0 : (visible ? 1 : 0);
    const minZ = min_zoom != null ? parseInt(min_zoom) : 0;
    const maxZ = max_zoom != null ? parseInt(max_zoom) : 20;
    const sz   = size != null ? parseFloat(size) : 1;
    const lbl  = show_labels ? 1 : 0;
    const existing = get(db(), 'SELECT fill_opacity FROM kml_layers WHERE id=?', [req.params.id]);
    const fillOp = fill_opacity != null ? Math.max(0, Math.min(1, parseFloat(fill_opacity)))
      : (existing && existing.fill_opacity != null ? existing.fill_opacity : 0.2);
    if (geojson !== undefined) {
      run(db(), 'UPDATE kml_layers SET name=?,color=?,visible=?,symbol=?,group_id=?,line_dash=?,min_zoom=?,max_zoom=?,size=?,geojson=?,show_labels=?,fill_opacity=? WHERE id=?',
        [name, color || '#1a56db', vis, symbol || '', group_id || '', line_dash || 'solid', minZ, maxZ, sz, geojson, lbl, fillOp, req.params.id]);
    } else {
      run(db(), 'UPDATE kml_layers SET name=?,color=?,visible=?,symbol=?,group_id=?,line_dash=?,min_zoom=?,max_zoom=?,size=?,show_labels=?,fill_opacity=? WHERE id=?',
        [name, color || '#1a56db', vis, symbol || '', group_id || '', line_dash || 'solid', minZ, maxZ, sz, lbl, fillOp, req.params.id]);
    }
    res.json({ success: true });
  }));

  // Узкий эндпоинт только для видимости слоя (гейтится правом layerToggleGlobal
  // отдельно от общей правки слоёв). Полный PUT остаётся для стиля/геометрии.
  app.patch('/api/layers/:id/visible', wrap((req, res) => {
    const vis = req.body && req.body.visible ? 1 : 0;
    run(db(), 'UPDATE kml_layers SET visible=? WHERE id=?', [vis, req.params.id]);
    res.json({ ok: true, visible: vis });
  }));

  app.delete('/api/layers/:id', wrap((req, res) => {
    const _restore = trashAndDelete(db(), 'kml_layers', req.params.id);
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, _restore });
  }));

  // ── ACTIVITY LOG ───────────────────────────────────────────
  app.get('/api/log', wrap((req, res) => {
    const { user, today } = req.query;
    let sql = `SELECT l.*,s.name as site_name,b.name as base_name FROM activity_log l
      LEFT JOIN sites s ON l.site_id=s.id LEFT JOIN bases b ON l.base_id=b.id`;
    const p = [], where = [];
    if (user) { where.push('l.user_name=?'); p.push(user); }
    if (today === '1') { where.push("date(l.created_at)=date('now')"); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY l.created_at DESC LIMIT 200';
    res.json(all(db(), sql, p));
  }));

  app.get('/api/log/users', wrap((req, res) =>
    res.json(all(db(), 'SELECT DISTINCT user_name FROM activity_log ORDER BY user_name').map(r => r.user_name))
  ));

  // ── GLOBAL SEARCH ──────────────────────────────────────────
  app.get('/api/search', wrap((req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ sites: [], bases: [], workers: [], machinery: [], tasks: [] });
    const like = '%' + q + '%';
    const d = db();
    res.json({
      sites:     all(d, 'SELECT id,name,client,status,completion_percent FROM sites WHERE name LIKE ? OR client LIKE ? OR address LIKE ? LIMIT 8', [like, like, like]),
      bases:     all(d, 'SELECT id,name,lat,lng FROM bases WHERE name LIKE ? OR description LIKE ? LIMIT 8', [like, like]),
      workers:   all(d, 'SELECT id,name,role,phone,base_id FROM pgk_workers WHERE name LIKE ? OR role LIKE ? OR phone LIKE ? LIMIT 8', [like, like, like]),
      machinery: all(d, 'SELECT id,name,type,plate_number,base_id,status FROM pgk_machinery WHERE name LIKE ? OR plate_number LIKE ? OR type LIKE ? LIMIT 8', [like, like, like]),
      tasks:     all(d, 'SELECT t.id,t.title,t.status,t.due_date,s.name as site_name FROM site_tasks t LEFT JOIN sites s ON t.site_id=s.id WHERE t.title LIKE ? OR t.description LIKE ? OR t.responsible LIKE ? LIMIT 8', [like, like, like]),
    });
  }));

  // ── PERSONNEL REPORT ───────────────────────────────────────
  app.get('/api/report/personnel', wrap((req, res) => {
    const d = db();
    const workers   = all(d, 'SELECT w.*, b.name as base_name, b.lat as base_lat, b.lng as base_lng FROM pgk_workers w LEFT JOIN bases b ON w.base_id=b.id ORDER BY b.name, w.name');
    const machinery = all(d, 'SELECT * FROM pgk_machinery ORDER BY base_id, name');
    const bases     = all(d, 'SELECT * FROM bases');
    const report = bases.map(b => ({
      base: b,
      workers: workers.filter(w => w.base_id === b.id).map(w => {
        const days = w.start_date ? Math.floor((Date.now() - new Date(w.start_date)) / 86400000) : null;
        const machine = machinery.find(m => m.id === w.machine_id);
        return { ...w, days_in_field: days, machine_name: machine ? machine.name : null };
      }),
      machinery: machinery.filter(m => m.base_id === b.id),
    }));
    res.json({ report, no_base: workers.filter(w => !w.base_id), total_workers: workers.length, total_machinery: machinery.length });
  }));

  // ── PHOTOS ─────────────────────────────────────────────────
  app.get('/api/photos', wrap((req, res) => {
    const entity_type = req.query.entity_type || req.query.ref_type;
    const entity_id   = req.query.entity_id   || req.query.ref_id;
    if (!entity_type || !entity_id) return res.json([]);
    res.json(all(db(), 'SELECT * FROM photos WHERE entity_type=? AND entity_id=? ORDER BY created_at DESC', [entity_type, entity_id]));
  }));

  app.post('/api/photos/upload', (req, res) => {
    if (!upload) return res.status(503).json({ error: 'multer not installed' });
    upload.single('photo')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No file' });
      const { entity_type, entity_id, caption } = req.body;
      const id = uuid();
      try {
        run(db(), 'INSERT INTO photos(id,entity_type,entity_id,filename,caption)VALUES(?,?,?,?,?)',
          [id, entity_type, entity_id, req.file.filename, caption || '']);
        res.json({ id, url: '/photos/' + req.file.filename });
      } catch(e) {
        console.error('[API Error] POST /api/photos/upload', e.message);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
      }
    });
  });

  app.delete('/api/photos/:id', wrap((req, res) => {
    const ph = get(db(), 'SELECT * FROM photos WHERE id=?', [req.params.id]);
    if (ph) { try { fs.unlinkSync(path.join(__dirname, '..', 'public', 'photos', ph.filename)); } catch(e) {} }
    run(db(), 'DELETE FROM photos WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  }));

  // ── BACKUP ─────────────────────────────────────────────────
  app.get('/api/backups', wrap((req, res) => {
    const files = fs.existsSync(BACKUP_DIR)
      ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db'))
          .map(f => { const st = fs.statSync(path.join(BACKUP_DIR, f)); return { name: f, size: st.size, date: st.mtime }; })
          .sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20)
      : [];
    res.json(files);
  }));

  app.post('/api/backups/create', wrap(async (req, res) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fname = `backup_${ts}.db`;
    try {
      const size = await doBackup(path.join(BACKUP_DIR, fname));
      res.json({ ok: true, name: fname, size });
    } catch (e) {
      console.error('[backup] create failed:', e.message);
      res.status(500).json({ error: 'Бэкап не создан: ' + e.message });
    }
  }));

  // ── BACKUP SETTINGS ────────────────────────────────────────
  app.get('/api/backups/settings', wrap((req, res) => {
    res.json(getBackupSettings ? getBackupSettings() : { interval_hours: 2, max_count: 10 });
  }));

  app.put('/api/backups/settings', wrap((req, res) => {
    if (!setBackupSettings) return res.status(501).json({ error: 'Не доступно' });
    const { interval_hours, max_count } = req.body;
    const ih = (interval_hours != null) ? parseFloat(interval_hours) : null;
    const mc = (max_count != null) ? parseInt(max_count) : null;
    if (ih != null && (isNaN(ih) || ih < 0 || ih > 168))
      return res.status(400).json({ error: 'interval_hours: 0–168' });
    if (mc != null && (isNaN(mc) || mc < 1 || mc > 200))
      return res.status(400).json({ error: 'max_count: 1–200' });
    setBackupSettings({ interval_hours: ih, max_count: mc });
    res.json({ ok: true, ...getBackupSettings() });
  }));

  app.post('/api/backups/run-auto', wrap(async (req, res) => {
    if (!performAutoBackup) return res.status(501).json({ error: 'Не доступно' });
    const r = await performAutoBackup();
    if (r && r.ok === false) return res.status(500).json({ error: 'Автобэкап не создан: ' + r.error });
    res.json({ ok: true, ...(r || {}) });
  }));

  app.post('/api/backups/restore/:name', wrap((req, res) => {
    const src = path.join(BACKUP_DIR, req.params.name);
    if (!fs.existsSync(src)) return res.status(404).json({ error: 'Not found' });
    fs.copyFileSync(src, path.join(__dirname, '..', 'survey.db'));
    try { fs.unlinkSync(path.join(__dirname, '..', 'survey.db-wal')); } catch(e) {}
    try { fs.unlinkSync(path.join(__dirname, '..', 'survey.db-shm')); } catch(e) {}
    if (fs.existsSync(src + '-wal')) fs.copyFileSync(src + '-wal', path.join(__dirname, '..', 'survey.db-wal'));
    res.json({ ok: true, message: 'Восстановлено. Перезапустите сервер.' });
  }));

  // ── LAYER EXPORT (DXF) ─────────────────────────────────────
  const { buildLayersDXF, saveDXF } = require('../dxf-writer');
  const { makeTransform, pickMsk86Zone, pickGsk2011Zone } = require('../coord-transform');

  function geojsonBboxCenter(layers) {
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity, found = false;
    function visit(coord) {
      if (!Array.isArray(coord)) return;
      if (typeof coord[0] === 'number' && typeof coord[1] === 'number') {
        const [lng, lat] = coord;
        if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        found = true;
      } else { coord.forEach(visit); }
    }
    for (const l of layers) {
      let gj = l.geojson;
      if (typeof gj === 'string') { try { gj = JSON.parse(gj); } catch (e) { continue; } }
      if (!gj) continue;
      const feats = gj.type === 'FeatureCollection' ? (gj.features || [])
        : gj.type === 'Feature' ? [gj] : [];
      feats.forEach(f => f && f.geometry && visit(f.geometry.coordinates));
    }
    if (!found) return { centerLng: 72, centerLat: 65 };
    return { centerLng: (minLng + maxLng) / 2, centerLat: (minLat + maxLat) / 2 };
  }

  function hexToDxfColor(hex) {
    if (!hex || typeof hex !== 'string') return 7;
    const h = hex.replace('#', '');
    if (h.length < 3) return 7;
    const r = parseInt(h.slice(0, 2), 16), g_ = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    if (r > 200 && g_ < 100 && b < 100) return 1;
    if (r < 100 && g_ > 150 && b < 100) return 3;
    if (r < 100 && g_ < 100 && b > 150) return 5;
    if (r > 200 && g_ > 200 && b < 100) return 2;
    if (r < 100 && g_ > 150 && b > 150) return 4;
    if (r > 200 && g_ < 100 && b > 150) return 6;
    return 7;
  }

  // ── KML export helper ──────────────────────────────────────
  function buildLayersKML(rows) {
    const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    function hexToKmlColor(hex, a) {
      const h = (hex||'#1a56db').replace('#','').padStart(6,'0');
      const aa = (a||255).toString(16).padStart(2,'0');
      return `${aa}${h.slice(4,6)}${h.slice(2,4)}${h.slice(0,2)}`;
    }
    function ringCoords(ring) {
      return ring.map(c=>`${c[0]},${c[1]},0`).join(' ');
    }
    function geoToKml(geo) {
      if (!geo) return '';
      const alt = '<altitudeMode>clampToGround</altitudeMode>';
      if (geo.type==='Point') {
        const [ln,lt]=geo.coordinates;
        return `<Point>${alt}<coordinates>${ln},${lt},0</coordinates></Point>`;
      }
      if (geo.type==='LineString') {
        return `<LineString>${alt}<coordinates>${ringCoords(geo.coordinates)}</coordinates></LineString>`;
      }
      if (geo.type==='MultiLineString') {
        const parts=geo.coordinates.map(l=>`<LineString>${alt}<coordinates>${ringCoords(l)}</coordinates></LineString>`);
        return `<MultiGeometry>${parts.join('')}</MultiGeometry>`;
      }
      if (geo.type==='Polygon') {
        const outer=`<outerBoundaryIs><LinearRing>${alt}<coordinates>${ringCoords(geo.coordinates[0])}</coordinates></LinearRing></outerBoundaryIs>`;
        const inner=geo.coordinates.slice(1).map(r=>`<innerBoundaryIs><LinearRing>${alt}<coordinates>${ringCoords(r)}</coordinates></LinearRing></innerBoundaryIs>`).join('');
        return `<Polygon>${outer}${inner}</Polygon>`;
      }
      if (geo.type==='MultiPolygon') {
        const polys=geo.coordinates.map(poly=>{
          const outer=`<outerBoundaryIs><LinearRing>${alt}<coordinates>${ringCoords(poly[0])}</coordinates></LinearRing></outerBoundaryIs>`;
          const inner=poly.slice(1).map(r=>`<innerBoundaryIs><LinearRing>${alt}<coordinates>${ringCoords(r)}</coordinates></LinearRing></innerBoundaryIs>`).join('');
          return `<Polygon>${outer}${inner}</Polygon>`;
        });
        return `<MultiGeometry>${polys.join('')}</MultiGeometry>`;
      }
      return '';
    }
    const styles = rows.map((r,i)=>{
      const lc=hexToKmlColor(r.color,255), fc=hexToKmlColor(r.color,80);
      return `<Style id="s${i}">
  <IconStyle><color>${lc}</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>
  <LineStyle><color>${lc}</color><width>2.5</width></LineStyle>
  <PolyStyle><color>${fc}</color></PolyStyle>
  <LabelStyle><color>${lc}</color><scale>0.85</scale></LabelStyle>
</Style>`;
    }).join('\n');
    const folders = rows.map((r,i)=>{
      let gj; try{gj=JSON.parse(r.geojson);}catch(_){gj=null;}
      const features=(gj?.features||[gj]).filter(Boolean);
      const marks=features.map((f,fi)=>{
        const g=geoToKml(f?.geometry);
        if(!g)return '';
        const nm=esc(f?.properties?.name||f?.properties?.Name||`Объект ${fi+1}`);
        const desc=f?.properties?.description||f?.properties?.Description||'';
        return `<Placemark><name>${nm}</name>${desc?`<description>${esc(desc)}</description>`:''}<styleUrl>#s${i}</styleUrl>${g}</Placemark>`;
      }).filter(Boolean).join('\n');
      return `<Folder><name>${esc(r.name||'Слой')}</name>${marks}</Folder>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>Экспорт слоёв</name>\n${styles}\n${folders}\n</Document>\n</kml>`;
  }

  app.post('/api/layers/export-kml', wrap((req, res) => {
    const { layerIds } = req.body || {};
    if (!Array.isArray(layerIds) || !layerIds.length)
      return res.status(400).json({ error: 'layerIds required' });
    const rows = all(db(), `SELECT id,name,geojson,color FROM kml_layers WHERE id IN (${layerIds.map(()=>'?').join(',')})`, layerIds);
    if (!rows.length) return res.status(404).json({ error: 'Слои не найдены' });
    const kml = buildLayersKML(rows);
    res.setHeader('Content-Type','application/vnd.google-earth.kml+xml; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="layers.kml"');
    res.send(kml);
  }));

  app.post('/api/layers/import-dxf', wrap((req, res) => {
    const { dxfText, crs } = req.body || {};
    if (!dxfText) return res.status(400).json({ error: 'dxfText required' });
    const dxfLayers = parseDXF(dxfText);
    if (!dxfLayers.size) return res.status(422).json({ error: 'Нет слоёв в DXF' });
    const sampleX = _dxfFindFirstX(dxfLayers);
    let inv;
    try { inv = makeDxfInverseTransform(crs || 'msk86', sampleX); }
    catch (e) { return res.status(400).json({ error: 'Неизвестная СК: ' + crs }); }
    const COLORS = ['#1a56db','#e02424','#057a55','#d97706','#7e3af2','#0694a2'];
    const created = [];
    let ci = 0;
    for (const [layerName, entities] of dxfLayers) {
      const features = dxfEntitiesToFeatures(entities, inv);
      if (!features.length) continue;
      const id = uuid();
      const color = COLORS[ci++ % COLORS.length];
      run(db(), 'INSERT INTO kml_layers(id,name,geojson,color,visible,symbol,group_id,line_dash)VALUES(?,?,?,?,1,?,?,?)',
        [id, layerName, JSON.stringify({ type:'FeatureCollection', features }), color, '', '', 'solid']);
      created.push({ id, name: layerName, features: features.length });
    }
    if (!created.length) return res.status(422).json({ error: 'Нет геометрии в DXF' });
    res.json({ layers: created });
  }));

  app.post('/api/layers/export-dxf', wrap(async (req, res) => {
    const { layerIds, crs, filename } = req.body || {};
    if (!Array.isArray(layerIds) || !layerIds.length) {
      return res.status(400).json({ error: 'layerIds required' });
    }
    const d = db();
    const placeholders = layerIds.map(() => '?').join(',');
    const rows = all(d, `SELECT id, name, geojson, color FROM kml_layers WHERE id IN (${placeholders})`, layerIds);
    if (!rows.length) return res.status(404).json({ error: 'Слои не найдены' });

    const { centerLng } = geojsonBboxCenter(rows);
    const crsKey = crs || 'wgs84';
    const transform = makeTransform(crsKey, centerLng);

    let zoneInfo = '';
    if (crsKey === 'msk86') zoneInfo = `_z${pickMsk86Zone(centerLng)}`;
    else if (crsKey === 'msk86_z3') zoneInfo = '_z3';
    else if (crsKey === 'msk86_z4') zoneInfo = '_z4';
    else if (crsKey === 'gsk2011') zoneInfo = `_z${pickGsk2011Zone(centerLng)}`;

    const layers = rows.map(r => ({
      name: r.name,
      color: hexToDxfColor(r.color),
      geojson: r.geojson,
    }));
    const dxfStr = buildLayersDXF({ layers, transform });

    const safeName = (filename || `layers_${crsKey}${zoneInfo}.dxf`)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    const tmpPath = path.join(__dirname, '..', 'public', 'uploads', `_dxf_${Date.now()}_${Math.random().toString(36).slice(2)}.dxf`);
    saveDXF(tmpPath, dxfStr);
    const stat = fs.statSync(tmpPath);
    res.setHeader('Content-Type', 'application/dxf');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    const stream = fs.createReadStream(tmpPath);
    stream.pipe(res);
    stream.on('end', () => { try { fs.unlinkSync(tmpPath); } catch (e) {} });
    stream.on('error', () => { try { fs.unlinkSync(tmpPath); } catch (e) {} });
  }));

  // ── DEM EXPORT ─────────────────────────────────────────────
  app.get('/api/dem/status', async (req, res) => {
    if (!demProcessor) return res.json({ available: false, reason: 'dem-processor не загружен' });
    res.json(await demProcessor.checkGDAL());
  });

  // Диагностика и ручной запуск скачивания геоид-гридов
  app.post('/api/dem/download-geoid-grids', async (req, res) => {
    if (!demProcessor) return res.status(503).json({ error: 'no processor' });
    demProcessor._resetGeoidCheck();
    const before = await demProcessor.checkGDAL();
    await demProcessor._downloadGeoidGrids();
    const after = await demProcessor.checkGDAL();
    res.json({ before: before.geoid_grids, after: after.geoid_grids });
  });

  app.get('/api/dem/tiles-info', (req, res) => {
    if (!demProcessor) return res.json({ dir: '', tiles: [], exists: false });
    res.json(demProcessor.getDemTilesInfo());
  });

  // GET /api/dem/tiles-bbox — bbox каждого кэшированного тайла (из имени файла)
  app.get('/api/dem/tiles-bbox', (req, res) => {
    if (!demProcessor) return res.json([]);
    const info = demProcessor.getDemTilesInfo();
    const result = (info.tiles || []).map(t => {
      const m = t.name.match(/^dem_([-\d.]+)_([-\d.]+)_([-\d.]+)_([-\d.]+)\.tif$/i);
      if (!m) return null;
      return {
        file: t.name,
        size: t.size,
        bbox: { minLng: parseFloat(m[1]), minLat: parseFloat(m[2]), maxLng: parseFloat(m[3]), maxLat: parseFloat(m[4]) },
      };
    }).filter(Boolean);
    res.json(result);
  });

  app.delete('/api/dem/tiles', (req, res) => {
    if (!demProcessor) return res.json({ deleted: 0 });
    const info = demProcessor.getDemTilesInfo();
    let deleted = 0;
    for (const t of (info.tiles || [])) {
      try { fs.unlinkSync(require('path').join(info.dir, t.name)); deleted++; } catch(_) {}
    }
    res.json({ deleted });
  });

  // GET /api/dem/tiles-dir — текущий путь к папке тайлов
  app.get('/api/dem/tiles-dir', (req, res) => {
    const dir = demProcessor ? demProcessor.getDemTilesDir() : '';
    res.json({ dir });
  });

  // PUT /api/dem/tiles-dir — сменить путь, создать папку, сохранить в настройках
  app.put('/api/dem/tiles-dir', wrap((req, res) => {
    if (!demProcessor) return res.status(503).json({ error: 'dem-processor не загружен' });
    const rawDir = (req.body.dir || '').trim();
    if (!rawDir) return res.status(400).json({ error: 'Путь не указан' });
    const resolved = path.resolve(rawDir);
    try {
      if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true });
    } catch(e) {
      return res.status(400).json({ error: `Не удалось создать папку: ${e.message}` });
    }
    demProcessor.setDemTilesDir(resolved);
    run(db(), "INSERT OR REPLACE INTO app_settings(key,value) VALUES('dem_tiles_dir',?)", [resolved]);
    res.json({ ok: true, dir: resolved });
  }));

  app.get('/api/elevation/point', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat и lng обязательны' });
    if (!demProcessor || !demProcessor.getElevationAtPoint) return res.json({ elevation: null, error: 'no_processor' });
    try {
      const result = await demProcessor.getElevationAtPoint(lat, lng);
      res.json(result);
    } catch(e) {
      res.json({ elevation: null, error: e.message });
    }
  });

  // POST /api/elevation/profile  body: [{lat,lng}, ...]
  // Возвращает { values:[<число|null>...], geoidApplied:bool } или null если нет тайлов
  app.post('/api/elevation/profile', async (req, res) => {
    if (!demProcessor || !demProcessor.getElevationProfile) return res.json(null);
    const points = req.body;
    if (!Array.isArray(points) || points.length === 0) return res.status(400).json({ error: 'points required' });
    try {
      const elevs = await demProcessor.getElevationProfile(points);
      res.json(elevs);
    } catch(e) {
      console.error('[/api/elevation/profile]', e.message);
      res.json(null);
    }
  });

  app.get('/api/dem/geoid-n', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat и lng обязательны' });
    if (!demProcessor || !demProcessor.computeGeoidN) return res.json({ n: null });
    try {
      const n = await demProcessor.computeGeoidN(lat, lng);
      res.json({ n });
    } catch(e) {
      res.json({ n: null });
    }
  });

  app.post('/api/dem/export', async (req, res) => {
    if (!demProcessor) return res.status(503).json({ error: 'DEM процессор не доступен' });
    const { bbox, projId, proj4, epsg, projName, format, interval, useGeoid, gridStep, jitterMin, jitterMax, exportSatellite, satelliteOnly, cacheOnly, satZoom, satSourceUrl, satSourceSubdomains } = req.body;
    if (!bbox || !bbox.minLat) return res.status(400).json({ error: 'Не указана область (bbox)' });
    let tmpDir = null;
    try {
      const result = await demProcessor.processDEM({
        bbox, projId, proj4, epsg, projName,
        format: format || 'dxf',
        interval: parseFloat(interval) || 2,
        useGeoid: useGeoid !== false,
        gridStep: (gridStep !== undefined && gridStep !== null && gridStep !== '') ? parseInt(gridStep) : 20,
        jitterMin: parseFloat(jitterMin) || 0,
        jitterMax: parseFloat(jitterMax) || 0,
        exportSatellite: exportSatellite !== false,
        satelliteOnly: !!satelliteOnly,
        cacheOnly: !!cacheOnly,
        satZoom: parseInt(satZoom) || 0,
        satSourceUrl: satSourceUrl || null,
        satSourceSubdomains: satSourceSubdomains || [],
        onProgress: (pct, text) => {
          console.log(`[DEM] ${pct}% - ${text}`);
          broadcast({ type: 'dem_progress', pct, text });
        },
      });
      tmpDir = result.tmpDir;

      // Режим «только кэш»: файл не отдаём, отвечаем JSON
      if (result.cacheOnly) {
        demProcessor.cleanupTmp(tmpDir);
        return res.json({ ok: true, cacheOnly: true, cached: result.cached });
      }

      const stat = fs.statSync(result.file);
      res.setHeader('Content-Type', result.mime || 'application/octet-stream');
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(result.file)}"`);
      run(db(), `INSERT INTO app_settings(key,value) VALUES('dem_export_count',1)
        ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)`, []);
      const stream = fs.createReadStream(result.file);
      stream.pipe(res);
      stream.on('end', () => demProcessor.cleanupTmp(tmpDir));
      stream.on('error', (err) => { demProcessor.cleanupTmp(tmpDir); console.error('[DEM] Stream error:', err); });
    } catch (err) {
      if (tmpDir) demProcessor.cleanupTmp(tmpDir);
      res.status(500).json({
        error: err.message || 'Ошибка обработки DEM',
        hint: (err.message.includes('GDAL') || err.message.includes('gdalwarp'))
          ? 'Проверьте установку GDAL (OSGeo4W).' : null,
      });
    }
  });

  // ── Офлайн тайлы для HTML-экспорта ───────────────────────
  app.post('/api/export-tiles', async (req, res) => {
    const { bbox, minZoom, maxZoom, source } = req.body || {};
    if (!bbox || minZoom == null || maxZoom == null)
      return res.status(400).json({ error: 'bad_params' });

    function lng2t(lng, z) { return Math.floor((lng + 180) / 360 * (1 << z)); }
    function lat2t(lat, z) {
      const r = lat * Math.PI / 180;
      return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << z));
    }

    const list = [];
    for (let z = Math.max(0, minZoom); z <= Math.min(20, maxZoom); z++) {
      const x1 = lng2t(bbox.minLng, z), x2 = lng2t(bbox.maxLng, z);
      const y1 = lat2t(bbox.maxLat, z), y2 = lat2t(bbox.minLat, z);
      for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++)
          list.push({ z, x, y });
    }

    const MAX = 1500;
    if (list.length > MAX)
      return res.json({ error: 'too_many_tiles', count: list.length, max: MAX });

    const isSat = source === 'sat';
    const tiles = {};
    const BATCH = 8;
    for (let i = 0; i < list.length; i += BATCH) {
      await Promise.all(list.slice(i, i + BATCH).map(async ({ z, x, y }) => {
        const url = isSat
          ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
          : `https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!r.ok) return;
          const buf = await r.arrayBuffer();
          tiles[`${z}/${x}/${y}`] = Buffer.from(buf).toString('base64');
        } catch (e) { /* skip failed tile */ }
      }));
    }

    res.json({ tiles, count: Object.keys(tiles).length });
  });
};
