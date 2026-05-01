// ═══════════════════════════════════════════════════════════
// routes/field.js
// API для интеграции с Android-приложением «Спутник Полевик»
// ═══════════════════════════════════════════════════════════

const path = require('path');
const fs   = require('fs');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');
const { wrap } = require('./validate');

// ── Лимиты безопасности импорта .spk ─────────────────────────
const MAX_ARCHIVE_SIZE   = 500 * 1024 * 1024; // 500 МБ архив
const MAX_UNCOMPRESSED   = 1024 * 1024 * 1024; // 1 ГБ распакованного
const MAX_FILES          = 10000;
const MAX_DESCRIPTION    = 10 * 1024;
const ALLOWED_IMG_EXT    = new Set(['.jpg', '.jpeg', '.png']);

// ── Папка для полевых фото ──────────────────────────────────
const FIELD_UPLOADS = path.join(__dirname, '..', 'public', 'uploads', 'field');
if (!fs.existsSync(FIELD_UPLOADS)) fs.mkdirSync(FIELD_UPLOADS, { recursive: true });

// ── Multer для приёма .spk (хранение во временной папке) ────
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
    // KML-точки (скважины из слоёв, привязанных к объектам)
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
    res.json({
      version: 1,
      exported_at: new Date().toISOString(),
      workers,
      transport,
      sites,
      kml_points,
    });
  }));

  // ── Список загруженных архивов ─────────────────────────────
  app.get('/api/field/imports', wrap((req, res) => {
    res.json(all(db(), 'SELECT id, filename, imported_at, imported_by, counts_json, status FROM field_imports ORDER BY imported_at DESC').map(r => ({
      ...r,
      counts: safeJson(r.counts_json, {}),
    })));
  }));

  app.get('/api/field/imports/:id', wrap((req, res) => {
    const r = get(db(), 'SELECT * FROM field_imports WHERE id=?', [req.params.id]);
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json({ ...r, manifest: safeJson(r.manifest_json, {}), counts: safeJson(r.counts_json, {}) });
  }));

  // ── Список полевых скважин ─────────────────────────────────
  app.get('/api/field/boreholes', wrap((req, res) => {
    const { site_id } = req.query;
    const sql = site_id
      ? 'SELECT * FROM field_boreholes WHERE site_id=? ORDER BY drill_date DESC'
      : 'SELECT * FROM field_boreholes ORDER BY drill_date DESC';
    res.json(all(db(), sql, site_id ? [site_id] : []));
  }));

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
    res.json({ ...bh, layers, samples, ugv, mmg, photos });
  }));

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
    run(d, 'DELETE FROM field_boreholes WHERE uuid=?', [u]);
    L(bh.site_id, null, 'Полевая скважина удалена', bh.name || u, req.body && req.body.user_name);
    res.json({ deleted: { borehole: bh, layers, samples, ugv, mmg, photos } });
  }));

  // ── Импорт .spk ────────────────────────────────────────────
  app.post('/api/field/import', spkUpload.single('spk'), wrap((req, res) => {
    const d = db();
    if (!req.file) return res.status(400).json({ error: 'Файл .spk не передан' });
    const tmpPath = req.file.path;

    const cleanup = () => { try { fs.unlinkSync(tmpPath); } catch(e) {} };

    let zip;
    try {
      zip = new AdmZip(tmpPath);
    } catch(e) {
      cleanup();
      return res.status(400).json({ error: 'Архив повреждён или не распознан' });
    }

    const entries = zip.getEntries();
    if (entries.length > MAX_FILES) {
      cleanup();
      return res.status(400).json({ error: `Слишком много файлов в архиве (${entries.length} > ${MAX_FILES})` });
    }

    let totalUncompressed = 0;
    for (const e of entries) {
      if (!isSafeZipPath(e.entryName)) {
        cleanup();
        return res.status(400).json({ error: `Опасный путь в архиве: ${e.entryName}` });
      }
      totalUncompressed += e.header.size;
      if (totalUncompressed > MAX_UNCOMPRESSED) {
        cleanup();
        return res.status(400).json({ error: 'Архив превышает лимит распакованного размера (1 ГБ)' });
      }
    }

    // Парсим JSON-файлы
    const readJson = (name) => {
      const e = zip.getEntry(name);
      if (!e) return null;
      try { return JSON.parse(e.getData().toString('utf8')); } catch(err) { return null; }
    };

    const manifest = readJson('manifest.json');
    if (!manifest || !manifest.format_version) {
      cleanup();
      return res.status(400).json({ error: 'Отсутствует или повреждён manifest.json' });
    }

    const boreholes  = readJson('boreholes.json')  || [];
    const soilLayers = readJson('soil_layers.json') || [];
    const samples    = readJson('samples.json')    || [];
    const ugv        = readJson('ugv.json')        || [];
    const mmg        = readJson('mmg.json')        || [];

    if (!Array.isArray(boreholes)) {
      cleanup();
      return res.status(400).json({ error: 'boreholes.json должен быть массивом' });
    }

    const importId = uuid();
    const importedFromSpk = (req.file.originalname || 'unknown.spk').slice(0, 200);
    const counts = { added: 0, skipped: 0, errors: 0, photos_added: 0 };

    // ── Скважины ─────────────────────────────────────────────
    for (const bh of boreholes) {
      if (!bh || !bh.uuid) { counts.errors++; continue; }
      const exists = get(d, 'SELECT uuid FROM field_boreholes WHERE uuid=?', [bh.uuid]);
      if (exists) { counts.skipped++; continue; }
      try {
        run(d, `INSERT INTO field_boreholes
          (uuid, site_id, lat, lng, kml_point_id, name, planned_depth_m, diameter_mm,
           work_type, geomorph_desc, description, drill_date, brigade_info,
           imported_at, imported_from_spk)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?)`,
          [
            bh.uuid,
            bh.site_id || null,
            safeNum(bh.lat, -90, 90),
            safeNum(bh.lng, -180, 180),
            bh.kml_point_id || null,
            clipStr(bh.name, 200),
            safeNum(bh.planned_depth_m, 0, 1000),
            safeNum(bh.diameter_mm, 0, 10000),
            clipStr(bh.work_type, 50),
            clipStr(bh.geomorph_desc, MAX_DESCRIPTION),
            clipStr(bh.description, MAX_DESCRIPTION),
            clipStr(bh.drill_date, 30),
            JSON.stringify(bh.brigade_info || {}).slice(0, 5000),
            importedFromSpk,
          ]);

        // Авто-привязка к vol_progress (если site_id задан и глубина есть)
        if (bh.site_id && bh.planned_depth_m) {
          try {
            const vol = get(d, "SELECT id FROM volumes WHERE site_id=? AND name LIKE '%бурение%' LIMIT 1", [bh.site_id]);
            if (vol) {
              run(d, `INSERT INTO vol_progress (id, volume_id, site_id, work_date, completed, notes, row_type)
                      VALUES (?,?,?,?,?,?, 'fact')`,
                [uuid(), vol.id, bh.site_id, bh.drill_date || new Date().toISOString().slice(0, 10),
                 bh.planned_depth_m, `Полевая скважина ${bh.name || bh.uuid.slice(0, 8)}`]);
            }
          } catch(e) {}
        }
        counts.added++;
      } catch(e) {
        console.error('[field import] borehole error:', e.message);
        counts.errors++;
      }
    }

    // ── Слои грунта ──────────────────────────────────────────
    for (const l of soilLayers) {
      if (!l || !l.uuid || !l.borehole_uuid) continue;
      if (get(d, 'SELECT uuid FROM field_soil_layers WHERE uuid=?', [l.uuid])) continue;
      try {
        run(d, `INSERT INTO field_soil_layers
          (uuid, borehole_uuid, order_idx, soil_type, state, description, depth_m)
          VALUES (?,?,?,?,?,?,?)`,
          [
            l.uuid, l.borehole_uuid,
            parseInt(l.order_idx) || 0,
            clipStr(l.soil_type, 50),
            clipStr(l.state, 50),
            clipStr(l.description, MAX_DESCRIPTION),
            safeNum(l.depth_m, 0, 1000),
          ]);
      } catch(e) {}
    }

    // ── Пробы ────────────────────────────────────────────────
    for (const s of samples) {
      if (!s || !s.uuid || !s.layer_uuid) continue;
      if (get(d, 'SELECT uuid FROM field_samples WHERE uuid=?', [s.uuid])) continue;
      try {
        run(d, `INSERT INTO field_samples (uuid, layer_uuid, collection_type, packaging, depth_m)
                VALUES (?,?,?,?,?)`,
          [s.uuid, s.layer_uuid,
           clipStr(s.collection_type, 50),
           clipStr(s.packaging, 50),
           safeNum(s.depth_m, 0, 1000)]);
      } catch(e) {}
    }

    // ── УГВ ──────────────────────────────────────────────────
    for (const u of ugv) {
      if (!u || !u.uuid || !u.borehole_uuid) continue;
      if (get(d, 'SELECT uuid FROM field_ugv WHERE uuid=?', [u.uuid])) continue;
      try {
        run(d, `INSERT INTO field_ugv (uuid, borehole_uuid, order_idx, depth_m) VALUES (?,?,?,?)`,
          [u.uuid, u.borehole_uuid, parseInt(u.order_idx) || 0, safeNum(u.depth_m, 0, 1000)]);
      } catch(e) {}
    }

    // ── ММГ ──────────────────────────────────────────────────
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
      const m = baseName.match(/^([0-9a-f-]{36})_([a-z_]+)_(\d+)\.(jpg|jpeg|png)$/i);
      if (!m) continue;
      const [, bhUuid, category, idx] = m;

      // Проверяем что скважина с таким UUID есть
      const bhExists = get(d, 'SELECT uuid FROM field_boreholes WHERE uuid=?', [bhUuid]);
      if (!bhExists) continue;

      const targetDir = path.join(FIELD_UPLOADS, bhUuid);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const targetPath = path.join(targetDir, baseName);
      try {
        fs.writeFileSync(targetPath, pe.getData());
        const photoUuid = uuid();
        run(d, `INSERT INTO field_photos (uuid, borehole_uuid, category, file_path, taken_at)
                VALUES (?,?,?,?,datetime('now'))`,
          [photoUuid, bhUuid, category, `uploads/field/${bhUuid}/${baseName}`]);
        counts.photos_added++;
      } catch(e) {
        console.error('[field import] photo error:', e.message);
      }
    }

    // ── Лог импорта ──────────────────────────────────────────
    run(d, `INSERT INTO field_imports (id, filename, imported_at, imported_by, manifest_json, counts_json, status)
            VALUES (?,?,datetime('now'),?,?,?,?)`,
      [importId, importedFromSpk, (req.body && req.body.user_name) || 'Система',
       JSON.stringify(manifest).slice(0, 50000),
       JSON.stringify(counts),
       counts.errors > 0 ? 'partial' : 'ok']);

    L(null, null, 'Импорт .spk', `${importedFromSpk}: +${counts.added} скважин, ${counts.skipped} пропущено`,
      (req.body && req.body.user_name) || 'Система');

    cleanup();
    res.json({ import_id: importId, ...counts });
  }));
};
