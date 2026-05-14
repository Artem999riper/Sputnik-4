// Импорт/экспорт справочника refs.json (workers, transport, sites, kml_points)
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { all, get, run } = require('../database');

module.exports = (app, ctx) => {
  const { db, wrap, TMP_DIR } = ctx;
  const upload = multer({
    storage: multer.diskStorage({
      destination: TMP_DIR,
      filename: (req, file, cb) => cb(null, 'refs_' + Date.now() + '.json'),
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  app.get('/api/refs/export', wrap((req, res) => {
    const d = db();
    res.json({
      version: 1,
      workers:    all(d, 'SELECT id,name,role,phone FROM workers ORDER BY name'),
      transport:  all(d, 'SELECT id,type,name,plate FROM transport ORDER BY name'),
      sites:      all(d, 'SELECT id,name,lat,lng FROM sites ORDER BY name'),
      kml_points: all(d, 'SELECT id,site_id,name,lat,lng FROM kml_points ORDER BY name'),
    });
  }));

  app.get('/api/refs/counts', wrap((req, res) => {
    const d = db();
    res.json({
      workers:    get(d, 'SELECT COUNT(*) c FROM workers').c,
      transport:  get(d, 'SELECT COUNT(*) c FROM transport').c,
      sites:      get(d, 'SELECT COUNT(*) c FROM sites').c,
      kml_points: get(d, 'SELECT COUNT(*) c FROM kml_points').c,
      brigades:   get(d, 'SELECT COUNT(*) c FROM brigades').c,
      volumes:    get(d, 'SELECT COUNT(*) c FROM volumes').c,
      boreholes:  get(d, 'SELECT COUNT(*) c FROM boreholes').c,
      done_boreholes: get(d, "SELECT COUNT(*) c FROM boreholes WHERE status='done'").c,
    });
  }));

  app.post('/api/refs/import', upload.single('refs'), wrap((req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл refs.json не получен' });
    let json;
    try {
      const raw = fs.readFileSync(req.file.path, 'utf8');
      json = JSON.parse(raw);
    } catch (e) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ error: 'Невалидный JSON: ' + e.message });
    }
    const d = db();
    const tx = d.transaction(() => {
      d.exec('DELETE FROM kml_points; DELETE FROM sites; DELETE FROM workers; DELETE FROM transport;');
      const wIns = d.prepare('INSERT INTO workers(id,name,role,phone) VALUES(?,?,?,?)');
      (json.workers || []).forEach(w => {
        if (!w.id || !w.name) return;
        wIns.run(String(w.id), String(w.name), w.role || null, w.phone || null);
      });
      const tIns = d.prepare('INSERT INTO transport(id,type,name,plate) VALUES(?,?,?,?)');
      (json.transport || []).forEach(t => {
        if (!t.id || !t.name) return;
        tIns.run(String(t.id), t.type || null, String(t.name), t.plate || null);
      });
      const sIns = d.prepare('INSERT INTO sites(id,name,lat,lng) VALUES(?,?,?,?)');
      (json.sites || []).forEach(s => {
        if (!s.id || !s.name) return;
        sIns.run(String(s.id), String(s.name),
          Number.isFinite(+s.lat) ? +s.lat : null,
          Number.isFinite(+s.lng) ? +s.lng : null);
      });
      const kIns = d.prepare('INSERT INTO kml_points(id,site_id,name,lat,lng) VALUES(?,?,?,?,?)');
      (json.kml_points || []).forEach(k => {
        if (!k.id || !k.name || !Number.isFinite(+k.lat) || !Number.isFinite(+k.lng)) return;
        kIns.run(String(k.id), k.site_id ? String(k.site_id) : null,
          String(k.name), +k.lat, +k.lng);
      });
    });
    tx();

    const counts = {
      workers:    (json.workers || []).length,
      transport:  (json.transport || []).length,
      sites:      (json.sites || []).length,
      kml_points: (json.kml_points || []).length,
    };
    run(d, "INSERT INTO imports(kind,filename,manifest_json,counts_json) VALUES('refs',?,?,?)",
      [req.file.originalname || 'refs.json', JSON.stringify(json.version || 1), JSON.stringify(counts)]);
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    res.json({ ok: true, counts });
  }));

  app.get('/api/workers',   wrap((_, res) => res.json(all(db(), 'SELECT * FROM workers ORDER BY name'))));
  app.get('/api/transport', wrap((_, res) => res.json(all(db(), 'SELECT * FROM transport ORDER BY name'))));
};
