// Список незаполненных done-скважин + сброс данных
const path = require('path');
const fs = require('fs');
const { all, get, run } = require('../database');

module.exports = (app, ctx) => {
  const { db, wrap, UPLOADS_DIR } = ctx;

  app.post('/api/reset', wrap((req, res) => {
    const d = db();
    d.exec(`DELETE FROM photos; DELETE FROM samples; DELETE FROM soil_layers;
            DELETE FROM ugv; DELETE FROM mmg; DELETE FROM boreholes;
            DELETE FROM task_points; DELETE FROM volumes;
            DELETE FROM brigade_members; DELETE FROM brigades;
            DELETE FROM kml_points; DELETE FROM sites;
            DELETE FROM workers; DELETE FROM transport;
            DELETE FROM custom_soil_types; DELETE FROM custom_soil_states;
            DELETE FROM imports;`);
    try {
      fs.readdirSync(UPLOADS_DIR).forEach(name => {
        if (name === '_tmp') return;
        const full = path.join(UPLOADS_DIR, name);
        try { fs.rmSync(full, { recursive: true, force: true }); } catch (e) {}
      });
    } catch (e) {}
    res.json({ ok: true });
  }));

  app.get('/api/validation/issues', wrap((_, res) => {
    const d = db();
    const done = all(d, "SELECT * FROM boreholes WHERE status='done'");
    const out = [];
    done.forEach(bh => {
      const issues = [];
      if (!bh.planned_depth_m || bh.planned_depth_m <= 0) issues.push('плановая глубина не указана');
      const photos = get(d, 'SELECT COUNT(*) c FROM photos WHERE borehole_uuid=?', [bh.uuid]).c;
      if (!photos) issues.push('нет фотографий');
      const badLayer = get(d, 'SELECT COUNT(*) c FROM soil_layers WHERE borehole_uuid=? AND (depth_m IS NULL OR depth_m<=0)', [bh.uuid]).c;
      if (badLayer) issues.push('слой без глубины подошвы');
      if (issues.length) out.push({ uuid: bh.uuid, name: bh.name || bh.uuid.slice(0, 6), issues });
    });
    res.json(out);
  }));
};
