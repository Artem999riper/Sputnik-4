// ═══════════════════════════════════════════════════════════
// routes/field.js
// API для интеграции с Android-приложением «Спутник Полевик»
// v2: импорт привязывается к конкретному объёму (volume_id)
// ═══════════════════════════════════════════════════════════

const path = require('path');
const fs   = require('fs');
const AdmZip = require('adm-zip');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');
const { wrap } = require('./validate');
const { broadcast } = require('./realtime');

// ── Лимиты безопасности импорта .spk ─────────────────────────
const MAX_ARCHIVE_SIZE   = 500 * 1024 * 1024;
const MAX_UNCOMPRESSED   = 1024 * 1024 * 1024;
const MAX_FILES          = 10000;
const MAX_DESCRIPTION    = 10 * 1024;
const ALLOWED_IMG_EXT    = new Set(['.jpg', '.jpeg', '.png']);

// ── Папки ──────────────────────────────────────────────────
const FIELD_UPLOADS = path.join(__dirname, '..', 'public', 'uploads', 'field');
if (!fs.existsSync(FIELD_UPLOADS)) fs.mkdirSync(FIELD_UPLOADS, { recursive: true });
const TMP_DIR = path.join(__dirname, '..', 'public', 'uploads', '_field_tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const spkUpload = multer({
  storage: multer.diskStorage({
    destination: TMP_DIR,
    filename: (req, file, cb) => cb(null, 'spk_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.spk'),
  }),
  limits: { fileSize: MAX_ARCHIVE_SIZE },
});

// ── Утилиты ─────────────────────────────────────────────────
function safeJson(str, fb) { try { return JSON.parse(str); } catch(e) { return fb; } }
function clipStr(s, max) { return typeof s === 'string' ? s.slice(0, max) : ''; }
function safeNum(v, lo, hi) {
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n < lo || n > hi) return null;
  return n;
}
function isSafeZipPath(name) {
  if (!name) return false;
  if (name.includes('..')) return false;
  if (path.isAbsolute(name)) return false;
  if (name.startsWith('/') || name.includes('\\..\\') || name.includes('/../')) return false;
  return true;
}

module.exports = (app, getDb, L) => {
  const db = () => getDb();

  // ── Экспорт справочников для полевика ──────────────────────
  app.get('/api/field/refs/export', wrap((req, res) => {
    const d = db();
    const workers = all(d, "SELECT id, name, role, phone FROM pgk_workers WHERE COALESCE(status,'')!='fired' ORDER BY name");
    const transport = all(d, "SELECT id, type, name, plate_number AS plate FROM pgk_machinery ORDER BY name");
    const sites = all(d,
      `SELECT s.id, s.name,
              (SELECT b.lat FROM bases b JOIN site_bases sb ON sb.base_id=b.id
                WHERE sb.site_id=s.id LIMIT 1) AS lat,
              (SELECT b.lng FROM bases b JOIN site_bases sb ON sb.base_id=b.id
                WHERE sb.site_id=s.id LIMIT 1) AS lng
       FROM sites s
       WHERE COALESCE(s.status,'active')='active'
       ORDER BY s.name`);
    const kmlLayers = all(d, "SELECT id, name, geojson, site_id FROM kml_layers WHERE site_id IS NOT NULL AND site_id<>''");
    const kml_points = [];
    for (const layer of kmlLayers) {
      const gj = safeJson(layer.geojson, null);
      if (!gj || !gj.features) continue;
      for (const f of gj.features) {
        if (!f.geometry || f.geometry.type !== 'Point') continue;
        const [lng, lat] = f.geometry.coordinates || [];
        if (typeof lat !== 'number' || typeof lng !== 'number') continue;
        kml_points.push({
          id: (f.properties && f.properties.id) || `${layer.id}_${kml_points.length}`,
          site_id: layer.site_id,
          layer_id: layer.id,
          name: (f.properties && (f.properties.name || f.properties.Name)) || '—',
          lat, lng,
        });
      }
    }
    res.json({ version: 1, exported_at: new Date().toISOString(), workers, transport, sites, kml_points });
  }));

  // ── Список загруженных архивов ─────────────────────────────
  app.get('/api/field/imports', wrap((req, res) => {
    res.json(all(db(), 'SELECT id, filename, imported_at, imported_by, counts_json, status, manifest_json FROM field_imports ORDER BY imported_at DESC').map(r => ({
      ...r,
      counts: safeJson(r.counts_json, {}),
      manifest: safeJson(r.manifest_json, {}),
    })));
  }));

  app.get('/api/field/imports/:id', wrap((req, res) => {
    const r = get(db(), 'SELECT * FROM field_imports WHERE id=?', [req.params.id]);
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json({ ...r, manifest: safeJson(r.manifest_json, {}), counts: safeJson(r.counts_json, {}) });
  }));

  // ── Удалить один импорт ───────────────────────────────────
  app.delete('/api/field/imports/:id', wrap((req, res) => {
    const d = db();
    const imp = get(d, 'SELECT id FROM field_imports WHERE id=?', [req.params.id]);
    if (!imp) return res.status(404).json({ error: 'Not found' });
    run(d, 'DELETE FROM field_imports WHERE id=?', [req.params.id]);
    broadcast({ type: 'change', url: '/api/field/imports', method: 'DELETE', t: Date.now() });
    res.json({ ok: true, id: req.params.id });
  }));

  // ── Удалить все импорты ────────────────────────────────────
  app.delete('/api/field/imports', wrap((req, res) => {
    const d = db();
    run(d, 'DELETE FROM field_imports');
    broadcast({ type: 'change', url: '/api/field/imports', method: 'DELETE', t: Date.now() });
    res.json({ ok: true });
  }));

  // ── Полевые скважины, привязанные к объёму ─────────────────
  app.get('/api/field/boreholes/by-volume', wrap((req, res) => {
    const { volume_id } = req.query;
    if (!volume_id) return res.status(400).json({ error: 'volume_id required' });
    const rows = all(db(),
      `SELECT b.*,
              (SELECT p.file_path FROM field_photos p WHERE p.borehole_uuid=b.uuid ORDER BY p.taken_at LIMIT 1) AS photo_path
         FROM field_boreholes b
        WHERE b.volume_id=?
        ORDER BY b.drill_date DESC, b.name`, [volume_id]);
    res.json(rows);
  }));

  // ── Карточка одной скважины (с богатой семантикой) ────────
  app.get('/api/field/boreholes/:uuid', wrap((req, res) => {
    const d = db();
    const u = req.params.uuid;
    const bh = get(d, 'SELECT * FROM field_boreholes WHERE uuid=?', [u]);
    if (!bh) return res.status(404).json({ error: 'Not found' });
    const layers = all(d, 'SELECT * FROM field_soil_layers WHERE borehole_uuid=? ORDER BY order_idx, depth_m', [u]);
    const layerUuids = layers.map(l => l.uuid);
    const samples = layerUuids.length
      ? all(d, `SELECT * FROM field_samples WHERE layer_uuid IN (${layerUuids.map(() => '?').join(',')})`, layerUuids)
      : [];
    const ugv = all(d, 'SELECT * FROM field_ugv WHERE borehole_uuid=? ORDER BY order_idx, depth_m', [u]);
    const mmg = all(d, 'SELECT * FROM field_mmg WHERE borehole_uuid=? ORDER BY order_idx, top_m', [u]);
    const photos = all(d, 'SELECT * FROM field_photos WHERE borehole_uuid=? ORDER BY taken_at', [u]);
    // Связанный vol_progress (если есть)
    const vp = bh.vol_progress_id ? get(d, 'SELECT * FROM vol_progress WHERE id=?', [bh.vol_progress_id]) : null;
    res.json({ ...bh, layers, samples, ugv, mmg, photos, vol_progress: vp });
  }));

  // ── Удаление скважины (+ связанный vol_progress) ──────────
  app.delete('/api/field/boreholes/:uuid', wrap((req, res) => {
    const d = db();
    const u = req.params.uuid;
    const bh = get(d, 'SELECT * FROM field_boreholes WHERE uuid=?', [u]);
    if (!bh) return res.status(404).json({ error: 'Not found' });
    const layers = all(d, 'SELECT * FROM field_soil_layers WHERE borehole_uuid=?', [u]);
    const layerUuids = layers.map(l => l.uuid);
    const samples = layerUuids.length
      ? all(d, `SELECT * FROM field_samples WHERE layer_uuid IN (${layerUuids.map(() => '?').join(',')})`, layerUuids)
      : [];
    const ugv = all(d, 'SELECT * FROM field_ugv WHERE borehole_uuid=?', [u]);
    const mmg = all(d, 'SELECT * FROM field_mmg WHERE borehole_uuid=?', [u]);
    const photos = all(d, 'SELECT * FROM field_photos WHERE borehole_uuid=?', [u]);
    run(d, 'DELETE FROM field_samples WHERE layer_uuid IN (SELECT uuid FROM field_soil_layers WHERE borehole_uuid=?)', [u]);
    run(d, 'DELETE FROM field_soil_layers WHERE borehole_uuid=?', [u]);
    run(d, 'DELETE FROM field_ugv WHERE borehole_uuid=?', [u]);
    run(d, 'DELETE FROM field_mmg WHERE borehole_uuid=?', [u]);
    run(d, 'DELETE FROM field_photos WHERE borehole_uuid=?', [u]);
    // Удалить связанный факт объёма, если был
    if (bh.vol_progress_id) {
      run(d, 'DELETE FROM vol_progress WHERE id=?', [bh.vol_progress_id]);
    } else {
      run(d, 'DELETE FROM vol_progress WHERE field_borehole_uuid=?', [u]);
    }
    run(d, 'DELETE FROM field_boreholes WHERE uuid=?', [u]);
    L(bh.site_id, null, 'Полевая скважина удалена', bh.name || u, req.body && req.body.user_name);
    broadcast({ type: 'change', url: `/api/field/boreholes/${u}`, method: 'DELETE', t: Date.now() });
    res.json({ deleted: { borehole: bh, layers, samples, ugv, mmg, photos } });
  }));

  // ── Предпросмотр .spk (без импорта) ─────────────────────────
  // POST /api/field/preview-spk (multipart, file=spk)
  app.post('/api/field/preview-spk', spkUpload.single('spk'), wrap((req, res) => {
    const d = db();
    if (!req.file) return res.status(400).json({ error: 'Файл не передан' });
    const tmpPath = req.file.path;
    const cleanup = () => { try { fs.unlinkSync(tmpPath); } catch(e) {} };

    let zip;
    try { zip = new AdmZip(tmpPath); }
    catch(e) { cleanup(); return res.status(400).json({ error: 'Архив повреждён' }); }

    const readJson = (name) => {
      const e = zip.getEntry(name);
      if (!e) return null;
      try { return JSON.parse(e.getData().toString('utf8')); } catch { return null; }
    };

    const manifest = readJson('manifest.json');
    if (!manifest) { cleanup(); return res.status(400).json({ error: 'manifest.json не найден' }); }

    const boreholes = readJson('boreholes.json') || [];
    const photoEntries = zip.getEntries().filter(e => e.entryName.startsWith('photos/')).length;
    cleanup();

    const brigade = (manifest.brigade && typeof manifest.brigade === 'object') ? manifest.brigade : {};
    const memberIds = Array.isArray(brigade.members) ? brigade.members.filter(x => typeof x === 'string') : [];
    const workerNames = memberIds.length
      ? all(d, `SELECT name FROM pgk_workers WHERE id IN (${memberIds.map(() => '?').join(',')})`, memberIds).map(w => w.name)
      : [];
    const machineRow = brigade.transport_id
      ? get(d, 'SELECT name, type FROM pgk_machinery WHERE id=?', [brigade.transport_id]) : null;

    // Группируем по датам для чекбоксов
    const byDate = {};
    for (const b of boreholes) {
      if (!b || !b.uuid) continue;
      const d_ = b.drill_date || '—';
      if (!byDate[d_]) byDate[d_] = [];
      byDate[d_].push({ uuid: b.uuid, name: b.name || `Скв-${b.uuid.slice(0, 6)}`, planned_depth_m: b.planned_depth_m || 0, work_type: b.work_type });
    }

    res.json({
      filename: (Buffer.from(req.file.originalname || 'unknown.spk', 'latin1').toString('utf8')).slice(0, 200),
      exported_at: manifest.exported_at,
      total_boreholes: boreholes.length,
      total_photos: photoEntries,
      by_date: byDate,
      worker_names: workerNames,
      machine_name: machineRow ? (machineRow.name || machineRow.type || '') : '',
    });
  }));

  // ── Импорт .spk в КОНКРЕТНЫЙ объём ──────────────────────────
  // POST /api/field/import-to-volume?volume_id=X (multipart, file=spk)
  app.post('/api/field/import-to-volume', spkUpload.single('spk'), wrap((req, res) => {
    const d = db();
    if (!req.file) return res.status(400).json({ error: 'Файл .spk не передан' });
    const volumeId = req.query.volume_id || req.body.volume_id;
    const tmpPath = req.file.path;
    const cleanup = () => { try { fs.unlinkSync(tmpPath); } catch(e) {} };

    // Фильтр по выбранным UUID (если переданы)
    let allowedUuids = null;
    try {
      const raw = req.body.filter_uuids;
      if (raw) allowedUuids = new Set(JSON.parse(raw));
    } catch(e) {}

    if (!volumeId) { cleanup(); return res.status(400).json({ error: 'volume_id обязателен' }); }
    const volume = get(d, 'SELECT id, site_id, name, amount, unit FROM volumes WHERE id=?', [volumeId]);
    if (!volume) { cleanup(); return res.status(404).json({ error: 'Объём не найден' }); }
    const siteId = volume.site_id;

    let zip;
    try { zip = new AdmZip(tmpPath); }
    catch(e) { cleanup(); return res.status(400).json({ error: 'Архив повреждён или не распознан' }); }

    const entries = zip.getEntries();
    if (entries.length > MAX_FILES) {
      cleanup();
      return res.status(400).json({ error: `Слишком много файлов (${entries.length} > ${MAX_FILES})` });
    }
    let totalUncompressed = 0;
    for (const e of entries) {
      if (!isSafeZipPath(e.entryName)) {
        cleanup(); return res.status(400).json({ error: `Опасный путь в архиве: ${e.entryName}` });
      }
      totalUncompressed += e.header.size;
      if (totalUncompressed > MAX_UNCOMPRESSED) {
        cleanup(); return res.status(400).json({ error: 'Архив превышает 1 ГБ распакованного' });
      }
    }

    const readJson = (name) => {
      const e = zip.getEntry(name);
      if (!e) return null;
      try { return JSON.parse(e.getData().toString('utf8')); } catch(err) { return null; }
    };

    const manifest = readJson('manifest.json');
    if (!manifest || !manifest.format_version) {
      cleanup(); return res.status(400).json({ error: 'Отсутствует или повреждён manifest.json' });
    }

    const boreholes  = readJson('boreholes.json')  || [];
    const soilLayers = readJson('soil_layers.json') || [];
    const samples    = readJson('samples.json')    || [];
    const ugv        = readJson('ugv.json')        || [];
    const mmg        = readJson('mmg.json')        || [];
    if (!Array.isArray(boreholes)) {
      cleanup(); return res.status(400).json({ error: 'boreholes.json должен быть массивом' });
    }

    // ── Бригада из manifest ────────────────────────────────────
    const brigade = (manifest.brigade && typeof manifest.brigade === 'object') ? manifest.brigade : {};
    const memberIds = Array.isArray(brigade.members) ? brigade.members.filter(x => typeof x === 'string') : [];
    const transportId = typeof brigade.transport_id === 'string' ? brigade.transport_id : null;

    // Резолвим имена работников и техники для notes
    const workerNames = memberIds.length
      ? all(d, `SELECT id, name FROM pgk_workers WHERE id IN (${memberIds.map(() => '?').join(',')})`, memberIds)
      : [];
    const machineRow = transportId ? get(d, 'SELECT id, name, type, plate_number FROM pgk_machinery WHERE id=?', [transportId]) : null;
    const noteParts = [];
    if (workerNames.length) noteParts.push('Бригада: ' + workerNames.map(w => w.name).join(', '));
    if (machineRow) noteParts.push('Техника: ' + (machineRow.name || machineRow.type || 'без имени'));
    const sharedNote = noteParts.join(' · ');
    const workerIdsCsv = memberIds.join(',');

    const importId = uuid();
    const importedFromSpk = (Buffer.from(req.file.originalname || 'unknown.spk', 'latin1').toString('utf8')).slice(0, 200);
    const counts = { added: 0, skipped: 0, errors: 0, photos_added: 0, vol_progress_added: 0 };

    // ── Скважины + создание vol_progress в выбранном объёме ───
    for (const bh of boreholes) {
      if (!bh || !bh.uuid) { counts.errors++; continue; }
      if (allowedUuids && !allowedUuids.has(bh.uuid)) continue; // фильтр выбора
      try {
        const exists = get(d, 'SELECT uuid, vol_progress_id FROM field_boreholes WHERE uuid=?', [bh.uuid]);
        const lat = safeNum(bh.lat, -90, 90);
        const lng = safeNum(bh.lng, -180, 180);
        const depth = safeNum(bh.planned_depth_m, 0, 10000);
        const drillDate = clipStr(bh.drill_date, 30) || new Date().toISOString().slice(0, 10);
        const name = clipStr(bh.name, 200) || `Скв-${bh.uuid.slice(0, 6)}`;

        // GeoJSON для vol_progress (точка с богатой семантикой)
        const geojson = (lat != null && lng != null) ? JSON.stringify({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lng, lat] },
            properties: {
              name,
              field_borehole_uuid: bh.uuid,
              sem: {
                type: 'borehole_field',
                uuid: bh.uuid,
                data: {
                  depth: depth || 0,
                  diam: safeNum(bh.diameter_mm, 0, 10000) || 0,
                  work_type: clipStr(bh.work_type, 50),
                  drill_date: drillDate,
                },
              },
            },
          }],
        }) : null;

        let vpId;
        if (exists && exists.vol_progress_id) {
          // Повторный импорт той же скважины — обновляем vol_progress
          vpId = exists.vol_progress_id;
          run(d, `UPDATE vol_progress SET volume_id=?, site_id=?, work_date=?, completed=?,
                                          notes=?, geojson=?, worker_ids=?, machine_id=?,
                                          field_borehole_uuid=?
                  WHERE id=?`,
            [volumeId, siteId, drillDate, depth || 0, sharedNote, geojson, workerIdsCsv, transportId, bh.uuid, vpId]);
          counts.skipped++;
        } else {
          vpId = uuid();
          run(d, `INSERT INTO vol_progress (id, volume_id, site_id, work_date, completed, notes,
                                            geojson, worker_ids, machine_id, row_type, field_borehole_uuid)
                  VALUES (?,?,?,?,?,?,?,?,?,'fact',?)`,
            [vpId, volumeId, siteId, drillDate, depth || 0, sharedNote, geojson, workerIdsCsv, transportId, bh.uuid]);
          counts.vol_progress_added++;
        }

        if (exists) {
          run(d, `UPDATE field_boreholes
                     SET site_id=?, lat=?, lng=?, kml_point_id=?, name=?, planned_depth_m=?, diameter_mm=?,
                         work_type=?, geomorph_desc=?, description=?, drill_date=?, brigade_info=?,
                         imported_from_spk=?, volume_id=?, vol_progress_id=?
                   WHERE uuid=?`,
            [siteId, lat, lng, bh.kml_point_id || null, name, depth, safeNum(bh.diameter_mm, 0, 10000),
             clipStr(bh.work_type, 50), clipStr(bh.geomorph_desc, MAX_DESCRIPTION),
             clipStr(bh.description, MAX_DESCRIPTION), drillDate,
             JSON.stringify({ members: memberIds, transport_id: transportId }).slice(0, 5000),
             importedFromSpk, volumeId, vpId, bh.uuid]);
        } else {
          run(d, `INSERT INTO field_boreholes
            (uuid, site_id, lat, lng, kml_point_id, name, planned_depth_m, diameter_mm,
             work_type, geomorph_desc, description, drill_date, brigade_info,
             imported_at, imported_from_spk, volume_id, vol_progress_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,?,?)`,
            [bh.uuid, siteId, lat, lng, bh.kml_point_id || null, name, depth,
             safeNum(bh.diameter_mm, 0, 10000), clipStr(bh.work_type, 50),
             clipStr(bh.geomorph_desc, MAX_DESCRIPTION), clipStr(bh.description, MAX_DESCRIPTION),
             drillDate, JSON.stringify({ members: memberIds, transport_id: transportId }).slice(0, 5000),
             importedFromSpk, volumeId, vpId]);
          counts.added++;
        }
      } catch(e) {
        console.error('[field import] borehole error:', e.message);
        counts.errors++;
      }
    }

    // ── Слои/пробы/УГВ/ММГ (upsert) ───────────────────────────
    for (const l of soilLayers) {
      if (!l || !l.uuid || !l.borehole_uuid) continue;
      try {
        const has = get(d, 'SELECT uuid FROM field_soil_layers WHERE uuid=?', [l.uuid]);
        if (has) {
          run(d, `UPDATE field_soil_layers SET order_idx=?, soil_type=?, state=?, description=?, depth_m=?
                                              WHERE uuid=?`,
            [parseInt(l.order_idx) || 0, clipStr(l.soil_type, 50), clipStr(l.state, 50),
             clipStr(l.description, MAX_DESCRIPTION), safeNum(l.depth_m, 0, 1000), l.uuid]);
        } else {
          run(d, `INSERT INTO field_soil_layers (uuid, borehole_uuid, order_idx, soil_type, state, description, depth_m)
                  VALUES (?,?,?,?,?,?,?)`,
            [l.uuid, l.borehole_uuid, parseInt(l.order_idx) || 0,
             clipStr(l.soil_type, 50), clipStr(l.state, 50),
             clipStr(l.description, MAX_DESCRIPTION), safeNum(l.depth_m, 0, 1000)]);
        }
      } catch(e) {}
    }
    for (const s of samples) {
      if (!s || !s.uuid || !s.layer_uuid) continue;
      if (get(d, 'SELECT uuid FROM field_samples WHERE uuid=?', [s.uuid])) continue;
      try {
        run(d, `INSERT INTO field_samples (uuid, layer_uuid, collection_type, packaging, depth_m)
                VALUES (?,?,?,?,?)`,
          [s.uuid, s.layer_uuid, clipStr(s.collection_type, 50),
           clipStr(s.packaging, 50), safeNum(s.depth_m, 0, 1000)]);
      } catch(e) {}
    }
    for (const u of ugv) {
      if (!u || !u.uuid || !u.borehole_uuid) continue;
      if (get(d, 'SELECT uuid FROM field_ugv WHERE uuid=?', [u.uuid])) continue;
      try {
        run(d, `INSERT INTO field_ugv (uuid, borehole_uuid, order_idx, depth_m) VALUES (?,?,?,?)`,
          [u.uuid, u.borehole_uuid, parseInt(u.order_idx) || 0, safeNum(u.depth_m, 0, 1000)]);
      } catch(e) {}
    }
    for (const m of mmg) {
      if (!m || !m.uuid || !m.borehole_uuid) continue;
      if (get(d, 'SELECT uuid FROM field_mmg WHERE uuid=?', [m.uuid])) continue;
      try {
        run(d, `INSERT INTO field_mmg (uuid, borehole_uuid, order_idx, top_m, bottom_m, description)
                VALUES (?,?,?,?,?,?)`,
          [m.uuid, m.borehole_uuid, parseInt(m.order_idx) || 0,
           safeNum(m.top_m, 0, 1000), safeNum(m.bottom_m, 0, 1000),
           clipStr(m.description, MAX_DESCRIPTION)]);
      } catch(e) {}
    }

    // ── Фото ─────────────────────────────────────────────────
    const photoEntries = entries.filter(e => e.entryName.startsWith('photos/') && !e.isDirectory);
    for (const pe of photoEntries) {
      const ext = path.extname(pe.entryName).toLowerCase();
      if (!ALLOWED_IMG_EXT.has(ext)) continue;
      const baseName = path.basename(pe.entryName);
      const m = baseName.match(/^([0-9a-f-]{36})_([a-z_]+)_([0-9a-f]+)\.(jpg|jpeg|png)$/i);
      if (!m) continue;
      const [, bhUuid, category] = m;
      const bhExists = get(d, 'SELECT uuid FROM field_boreholes WHERE uuid=?', [bhUuid]);
      if (!bhExists) continue;
      const targetDir = path.join(FIELD_UPLOADS, bhUuid);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const targetPath = path.join(targetDir, baseName);
      try {
        // Skip if same file already exists (re-import idempotent)
        if (!fs.existsSync(targetPath)) {
          fs.writeFileSync(targetPath, pe.getData());
        }
        // Avoid duplicate field_photos rows on re-import
        const filePathRel = `uploads/field/${bhUuid}/${baseName}`;
        const exists = get(d, 'SELECT uuid FROM field_photos WHERE borehole_uuid=? AND file_path=?', [bhUuid, filePathRel]);
        if (!exists) {
          run(d, `INSERT INTO field_photos (uuid, borehole_uuid, category, file_path, taken_at)
                  VALUES (?,?,?,?,datetime('now'))`,
            [uuid(), bhUuid, category, filePathRel]);
          counts.photos_added++;
        }
      } catch(e) {
        console.error('[field import] photo error:', e.message);
      }
    }

    // ── Лог импорта ──────────────────────────────────────────
    const enrichedManifest = { ...manifest, volume_id: volumeId, site_id: siteId };
    run(d, `INSERT INTO field_imports (id, filename, imported_at, imported_by, manifest_json, counts_json, status)
            VALUES (?,?,datetime('now'),?,?,?,?)`,
      [importId, importedFromSpk, (req.body && req.body.user_name) || 'Система',
       JSON.stringify(enrichedManifest).slice(0, 50000),
       JSON.stringify(counts),
       counts.errors > 0 ? 'partial' : 'ok']);

    L(siteId, null, 'Импорт .spk',
      `${importedFromSpk} → ${volume.name || volumeId}: +${counts.added} новых, ${counts.skipped} обновлено, ${counts.photos_added} фото`,
      (req.body && req.body.user_name) || 'Система');

    broadcast({ type: 'change', url: '/api/field/import-to-volume', method: 'POST', t: Date.now() });
    cleanup();
    res.json({ import_id: importId, volume_id: volumeId, ...counts });
  }));
};
