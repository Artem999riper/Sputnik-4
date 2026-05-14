// Загрузка фото в подпапки категорий (раскладка как в Sputnik-4)
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../database');
const { safeFolderName, buildBhFolderName, getCategorySubfolder } = require('../lib/safe_folder');

const ALLOWED = new Set(['.jpg', '.jpeg', '.png']);
const PHOTO_LIMITS = { vyrabotka: 2, drilling: 5, core_box: 5, journal: 4 };

module.exports = (app, ctx) => {
  const { db, wrap, UPLOADS_DIR, TMP_DIR } = ctx;

  const upload = multer({
    storage: multer.diskStorage({
      destination: TMP_DIR,
      filename: (req, file, cb) => cb(null, 'photo_' + Date.now() + '_' + Math.random().toString(36).slice(2) +
        path.extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  app.post('/api/boreholes/:uuid/photos', upload.array('photos', 20), wrap((req, res) => {
    const d = db();
    const u = req.params.uuid;
    const category = String(req.query.category || req.body?.category || 'vyrabotka');
    if (!PHOTO_LIMITS.hasOwnProperty(category))
      return res.status(400).json({ error: 'Неизвестная категория: ' + category });

    const bh = get(d, 'SELECT b.*, s.name AS site_name FROM boreholes b LEFT JOIN sites s ON s.id=b.site_id WHERE b.uuid=?', [u]);
    if (!bh) {
      (req.files || []).forEach(f => { try { fs.unlinkSync(f.path); } catch (_) {} });
      return res.status(404).json({ error: 'Скважина не найдена' });
    }

    const existing = get(d, 'SELECT COUNT(*) c FROM photos WHERE borehole_uuid=? AND category=?', [u, category]).c;
    const limit = PHOTO_LIMITS[category];
    const remaining = Math.max(0, limit - existing);
    const accepted = (req.files || []).slice(0, remaining);
    const rejected = (req.files || []).slice(remaining);
    rejected.forEach(f => { try { fs.unlinkSync(f.path); } catch (_) {} });

    const subFolder = getCategorySubfolder(category);
    const targetDir = path.join(UPLOADS_DIR, safeFolderName(bh.site_name || ''),
                                buildBhFolderName(bh), subFolder);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const saved = [];
    accepted.forEach(f => {
      const ext = path.extname(f.originalname).toLowerCase();
      if (!ALLOWED.has(ext)) {
        try { fs.unlinkSync(f.path); } catch (_) {}
        return;
      }
      const photoUuid = uuidv4();
      const fname = `${u}_${category}_${photoUuid.slice(0, 8)}${ext}`;
      const full = path.join(targetDir, fname);
      try { fs.renameSync(f.path, full); }
      catch (e) { fs.copyFileSync(f.path, full); try { fs.unlinkSync(f.path); } catch (_) {} }
      const rel = path.join('uploads', safeFolderName(bh.site_name || ''),
        buildBhFolderName(bh), subFolder, fname).split(path.sep).join('/');
      run(d, 'INSERT INTO photos(uuid,borehole_uuid,category,file_path) VALUES(?,?,?,?)',
        [photoUuid, u, category, rel]);
      saved.push({ uuid: photoUuid, file_path: rel });
    });
    res.json({ ok: true, saved, rejected_count: rejected.length, limit, existing: existing + saved.length });
  }));

  app.delete('/api/photos/:uuid', wrap((req, res) => {
    const d = db();
    const p = get(d, 'SELECT * FROM photos WHERE uuid=?', [req.params.uuid]);
    if (!p) return res.status(404).json({ error: 'not found' });
    run(d, 'DELETE FROM photos WHERE uuid=?', [req.params.uuid]);
    try {
      const full = path.join(__dirname, '..', p.file_path);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch (e) {}
    res.json({ ok: true });
  }));

  app.get('/api/photo-limits', (_, res) => res.json(PHOTO_LIMITS));
};

module.exports.PHOTO_LIMITS = PHOTO_LIMITS;
