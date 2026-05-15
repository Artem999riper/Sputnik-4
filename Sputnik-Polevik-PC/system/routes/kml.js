// Импорт точек из KML — простой парсер, без полноценной XML-зависимости
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../database');

function parseKmlPoints(xml) {
  const points = [];
  const placemarkRe = /<Placemark[\s\S]*?<\/Placemark>/g;
  const nameRe = /<name>([\s\S]*?)<\/name>/;
  const coordRe = /<coordinates>([\s\S]*?)<\/coordinates>/;
  const matches = xml.match(placemarkRe) || [];
  matches.forEach(p => {
    const nm = nameRe.exec(p);
    const c = coordRe.exec(p);
    if (!c) return;
    const first = c[1].trim().split(/\s+/)[0];
    const [lng, lat] = first.split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      points.push({ name: (nm ? nm[1] : '').trim() || 'Точка', lat, lng });
    }
  });
  return points;
}

module.exports = (app, ctx) => {
  const { db, wrap, TMP_DIR } = ctx;
  const upload = multer({
    storage: multer.diskStorage({
      destination: TMP_DIR,
      filename: (req, f, cb) => cb(null, 'kml_' + Date.now() + '.kml'),
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  // Импорт KML точек как kml_points для конкретного объекта
  app.post('/api/kml/import', upload.single('kml'), wrap((req, res) => {
    if (!req.file) return res.status(400).json({ error: 'KML не получен' });
    const site_id = req.query.site_id || req.body?.site_id;
    if (!site_id) return res.status(400).json({ error: 'site_id обязателен' });
    const xml = fs.readFileSync(req.file.path, 'utf8');
    const pts = parseKmlPoints(xml);
    const d = db();
    const ins = d.prepare('INSERT INTO kml_points(id,site_id,name,lat,lng) VALUES(?,?,?,?,?)');
    const tx = d.transaction(() => pts.forEach(p => ins.run(uuidv4(), site_id, p.name, p.lat, p.lng)));
    tx();
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    res.json({ ok: true, count: pts.length });
  }));

  app.get('/api/kml-points', wrap((req, res) => {
    const d = db();
    const sid = req.query.site_id;
    res.json(sid
      ? all(d, 'SELECT * FROM kml_points WHERE site_id=? ORDER BY name', [sid])
      : all(d, 'SELECT * FROM kml_points ORDER BY name'));
  }));

  // Парсинг KML для preview (не сохраняя)
  app.post('/api/kml/parse', upload.single('kml'), wrap((req, res) => {
    if (!req.file) return res.status(400).json({ error: 'KML не получен' });
    const xml = fs.readFileSync(req.file.path, 'utf8');
    const pts = parseKmlPoints(xml);
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    res.json({ points: pts });
  }));
};

module.exports.parseKmlPoints = parseKmlPoints;
