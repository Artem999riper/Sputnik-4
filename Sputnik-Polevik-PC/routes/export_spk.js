// Сборка .spk архива в формате Android-приложения
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../database');
const { safeFolderName, buildBhFolderName, getCategorySubfolder } = require('../lib/safe_folder');

module.exports = (app, ctx) => {
  const { db, wrap, UPLOADS_DIR, TMP_DIR } = ctx;

  // ── EXPORT ──
  app.get('/api/export/spk', wrap((req, res) => {
    const d = db();
    const { from, to, site_id, brigade_id, geologist } = req.query;
    // Координаты: manual_lat/lng если заданы, иначе из связанной KML-точки
    let sql = `SELECT b.*,
      COALESCE(b.manual_lat, k.lat) AS resolved_lat,
      COALESCE(b.manual_lng, k.lng) AS resolved_lng
      FROM boreholes b
      LEFT JOIN kml_points k ON k.id = b.kml_point_id
      WHERE b.status='done'`;
    const p = [];
    if (from) { sql += ' AND b.drill_date>=?'; p.push(from); }
    if (to)   { sql += ' AND b.drill_date<=?'; p.push(to); }
    if (site_id) { sql += ' AND b.site_id=?'; p.push(site_id); }
    if (brigade_id) { sql += ' AND b.brigade_id=?'; p.push(brigade_id); }
    sql += ' ORDER BY b.drill_date, b.name';
    const boreholes = all(d, sql, p).map(b => ({
      ...b,
      manual_lat: b.resolved_lat,
      manual_lng: b.resolved_lng,
      lat: b.resolved_lat,
      lng: b.resolved_lng,
    }));
    if (!boreholes.length) return res.status(404).json({ error: 'Нет скважин для выгрузки' });

    const uuids = boreholes.map(b => b.uuid);
    const placeholders = uuids.map(() => '?').join(',');
    const layers  = all(d, `SELECT * FROM soil_layers WHERE borehole_uuid IN (${placeholders}) ORDER BY borehole_uuid, order_idx`, uuids);
    const layerIds = layers.map(l => l.uuid);
    const samples = layerIds.length
      ? all(d, `SELECT * FROM samples WHERE layer_uuid IN (${layerIds.map(() => '?').join(',')})`, layerIds)
      : [];
    const ugv  = all(d, `SELECT * FROM ugv WHERE borehole_uuid IN (${placeholders})`, uuids);
    const mmg  = all(d, `SELECT * FROM mmg WHERE borehole_uuid IN (${placeholders})`, uuids);
    const photos = all(d, `SELECT * FROM photos WHERE borehole_uuid IN (${placeholders})`, uuids);

    let brigade = null;
    if (brigade_id) {
      const br = get(d, 'SELECT * FROM brigades WHERE id=?', [brigade_id]);
      if (br) {
        const members = all(d, 'SELECT worker_id FROM brigade_members WHERE brigade_id=?', [brigade_id]).map(x => x.worker_id);
        brigade = { transport_id: br.transport_id, members };
      }
    }

    const manifest = {
      format_version: 1,
      app_version: 'polevik-pc-1.0',
      exported_at: new Date().toISOString(),
      period: { from: from || null, to: to || null },
      counts: { boreholes: boreholes.length, photos: photos.length },
      brigade,
      geologist_name: geologist || null,
    };

    const zip = new AdmZip();
    const stripDates = arr => arr.map(x => { const c = { ...x }; delete c.created_at; delete c.taken_at; return c; });
    zip.addFile('manifest.json',     Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    zip.addFile('boreholes.json',    Buffer.from(JSON.stringify(stripDates(boreholes), null, 2), 'utf8'));
    zip.addFile('soil_layers.json',  Buffer.from(JSON.stringify(layers, null, 2), 'utf8'));
    zip.addFile('samples.json',      Buffer.from(JSON.stringify(samples, null, 2), 'utf8'));
    zip.addFile('ugv.json',          Buffer.from(JSON.stringify(ugv, null, 2), 'utf8'));
    zip.addFile('mmg.json',          Buffer.from(JSON.stringify(mmg, null, 2), 'utf8'));

    photos.forEach(ph => {
      try {
        const full = path.join(__dirname, '..', ph.file_path);
        if (!fs.existsSync(full)) return;
        const ext = path.extname(ph.file_path).toLowerCase() || '.jpg';
        const fname = `${ph.borehole_uuid}_${ph.category}_${ph.uuid.slice(0, 8)}${ext}`;
        zip.addFile('photos/' + fname, fs.readFileSync(full));
      } catch (e) { console.warn('Photo skipped:', e.message); }
    });

    const buf = zip.toBuffer();
    const today = new Date().toISOString().slice(0, 10);
    const fname = `polevik_${today}_${boreholes.length}bh.spk`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
    res.send(buf);
  }));

  // ── IMPORT (для совместимости с Android-выгрузками) ──
  const upload = multer({
    storage: multer.diskStorage({
      destination: TMP_DIR,
      filename: (req, f, cb) => cb(null, 'spk_in_' + Date.now() + '.spk'),
    }),
    limits: { fileSize: 500 * 1024 * 1024 },
  });

  function safeJson(buf, fb) { try { return JSON.parse(buf.toString('utf8')); } catch (e) { return fb; } }

  app.post('/api/import/spk', upload.single('spk'), wrap((req, res) => {
    if (!req.file) return res.status(400).json({ error: '.spk не получен' });
    const target_volume_id = req.body?.volume_id || req.query.volume_id;
    const d = db();
    let zip;
    try { zip = new AdmZip(req.file.path); }
    catch (e) { try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ error: 'Не удалось открыть .spk: ' + e.message }); }

    const entries = zip.getEntries();
    const byName = {};
    entries.forEach(e => byName[e.entryName] = e);
    const manifest    = byName['manifest.json'] ? safeJson(byName['manifest.json'].getData(), {}) : {};
    const boreholes   = byName['boreholes.json'] ? safeJson(byName['boreholes.json'].getData(), []) : [];
    const layers      = byName['soil_layers.json'] ? safeJson(byName['soil_layers.json'].getData(), []) : [];
    const samples     = byName['samples.json'] ? safeJson(byName['samples.json'].getData(), []) : [];
    const ugv         = byName['ugv.json'] ? safeJson(byName['ugv.json'].getData(), []) : [];
    const mmg         = byName['mmg.json'] ? safeJson(byName['mmg.json'].getData(), []) : [];

    const stats = { boreholes: 0, layers: 0, samples: 0, ugv: 0, mmg: 0, photos: 0 };
    const tx = d.transaction(() => {
      boreholes.forEach(b => {
        if (!b.uuid) return;
        const exists = get(d, 'SELECT uuid FROM boreholes WHERE uuid=?', [b.uuid]);
        if (exists) return;
        run(d, `INSERT INTO boreholes(uuid,site_id,volume_id,kml_point_id,manual_lat,manual_lng,name,
                planned_depth_m,diameter_mm,work_type,geomorph_desc,description,drill_date,status,
                brigade_id,casing_length_m,brigade_snapshot)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [b.uuid, b.site_id || null, target_volume_id || b.volume_id || null,
           b.kml_point_id || null, b.manual_lat, b.manual_lng, b.name || null,
           Number(b.planned_depth_m) || 0, Number(b.diameter_mm) || 0,
           b.work_type || 'SEARCH', b.geomorph_desc || null, b.description || null,
           b.drill_date || null, b.status || 'done',
           b.brigade_id || null, Number(b.casing_length_m) || 0,
           b.brigade_snapshot ? (typeof b.brigade_snapshot === 'string' ? b.brigade_snapshot : JSON.stringify(b.brigade_snapshot)) : null]);
        stats.boreholes++;
      });
      layers.forEach(l => {
        if (!l.uuid || !l.borehole_uuid) return;
        const exists = get(d, 'SELECT uuid FROM soil_layers WHERE uuid=?', [l.uuid]);
        if (exists) return;
        run(d, `INSERT INTO soil_layers(uuid,borehole_uuid,order_idx,soil_type,state,description,depth_m,frozen_state)
                VALUES(?,?,?,?,?,?,?,?)`,
          [l.uuid, l.borehole_uuid, l.order_idx || 0, l.soil_type, l.state, l.description,
           Number(l.depth_m) || 0, l.frozen_state]);
        stats.layers++;
      });
      samples.forEach(s => {
        if (!s.uuid || !s.layer_uuid) return;
        const exists = get(d, 'SELECT uuid FROM samples WHERE uuid=?', [s.uuid]);
        if (exists) return;
        run(d, `INSERT INTO samples(uuid,layer_uuid,collection_type,packaging,depth_m,depth_top_m,depth_bottom_m)
                VALUES(?,?,?,?,?,?,?)`,
          [s.uuid, s.layer_uuid, s.collection_type, s.packaging,
           s.depth_m, s.depth_top_m, s.depth_bottom_m]);
        stats.samples++;
      });
      ugv.forEach(x => {
        if (!x.uuid || !x.borehole_uuid) return;
        const exists = get(d, 'SELECT uuid FROM ugv WHERE uuid=?', [x.uuid]);
        if (exists) return;
        run(d, 'INSERT INTO ugv(uuid,borehole_uuid,order_idx,depth_m) VALUES(?,?,?,?)',
          [x.uuid, x.borehole_uuid, x.order_idx || 0, Number(x.depth_m) || 0]);
        stats.ugv++;
      });
      mmg.forEach(x => {
        if (!x.uuid || !x.borehole_uuid) return;
        const exists = get(d, 'SELECT uuid FROM mmg WHERE uuid=?', [x.uuid]);
        if (exists) return;
        run(d, 'INSERT INTO mmg(uuid,borehole_uuid,order_idx,top_m,bottom_m,description) VALUES(?,?,?,?,?,?)',
          [x.uuid, x.borehole_uuid, x.order_idx || 0,
           Number(x.top_m) || 0, Number(x.bottom_m) || 0, x.description]);
        stats.mmg++;
      });
    });
    tx();

    // Распаковать фото
    entries.filter(e => e.entryName.startsWith('photos/') && !e.isDirectory).forEach(e => {
      const base = path.basename(e.entryName);
      const m = base.match(/^([0-9a-f-]+)_([a-z_]+)_([0-9a-f]+)\.(jpg|jpeg|png)$/i);
      if (!m) return;
      const [, bhUuid, category, hash, ext] = m;
      const bh = get(d, 'SELECT b.*, s.name AS site_name FROM boreholes b LEFT JOIN sites s ON s.id=b.site_id WHERE b.uuid=?', [bhUuid]);
      if (!bh) return;
      const subFolder = getCategorySubfolder(category);
      const targetDir = path.join(UPLOADS_DIR, safeFolderName(bh.site_name || ''), buildBhFolderName(bh), subFolder);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const full = path.join(targetDir, base);
      try { fs.writeFileSync(full, e.getData()); } catch (err) { return; }
      const rel = path.join('uploads', safeFolderName(bh.site_name || ''),
        buildBhFolderName(bh), subFolder, base).split(path.sep).join('/');
      const photoUuid = bhUuid + hash; // synthetic; better unique uuid:
      const pUuid = uuidv4();
      const exists = get(d, 'SELECT uuid FROM photos WHERE borehole_uuid=? AND file_path=?', [bhUuid, rel]);
      if (!exists) {
        run(d, 'INSERT INTO photos(uuid,borehole_uuid,category,file_path) VALUES(?,?,?,?)',
          [pUuid, bhUuid, category, rel]);
        stats.photos++;
      }
    });

    run(d, "INSERT INTO imports(kind,filename,manifest_json,counts_json) VALUES('spk',?,?,?)",
      [req.file.originalname || 'in.spk', JSON.stringify(manifest), JSON.stringify(stats)]);
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    res.json({ ok: true, stats, manifest });
  }));
};
