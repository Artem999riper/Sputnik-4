const path = require('path');
const fs = require('fs');
const { all, get, run } = require('../database');
const { safeFolderName } = require('../lib/safe_folder');

module.exports = (app, ctx) => {
  const { db, wrap, UPLOADS_DIR } = ctx;

  app.get('/api/sites', wrap((_, res) => {
    const d = db();
    const rows = all(d, 'SELECT * FROM sites ORDER BY name');
    rows.forEach(s => {
      s.volumes_count = get(d, 'SELECT COUNT(*) c FROM volumes WHERE site_id=?', [s.id]).c;
      s.boreholes_count = get(d,
        'SELECT COUNT(*) c FROM boreholes WHERE volume_id IN (SELECT id FROM volumes WHERE site_id=?)',
        [s.id]).c;
    });
    res.json(rows);
  }));

  app.delete('/api/sites/:id', wrap((req, res) => {
    const d = db();
    const site = get(d, 'SELECT * FROM sites WHERE id=?', [req.params.id]);
    if (!site) return res.status(404).json({ error: 'not found' });
    run(d, 'DELETE FROM sites WHERE id=?', [req.params.id]);
    // Удалить uploads/<site_safe>
    try {
      const dir = path.join(UPLOADS_DIR, safeFolderName(site.name));
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) { console.warn('Не удалось удалить папку фото:', e.message); }
    res.json({ ok: true });
  }));
};
