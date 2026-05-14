// Ведомости Excel — пробы и объёмы
// Используем простую генерацию XLSX через docx? Нет, используем
// сборку XLSX вручную через fflate? Слишком сложно. Используем
// серверный генератор: возвращаем JSON, а клиент генерирует через xlsx-js-style.
// Это позволяет переиспользовать стиль из Sputnik-4 без второй копии кода.
const { all, get } = require('../database');
const { toMsk, formatDms, parseCoord } = require('../lib/proj');

module.exports = (app, ctx) => {
  const { db, wrap } = ctx;

  function fmtCoord(lat, lng, mode) {
    if (lat == null || lng == null) return { lat: '', lng: '' };
    if (mode === 'dms')   return { lat: formatDms(+lat, true), lng: formatDms(+lng, false) };
    if (mode === 'msk3') { const r = toMsk(+lat, +lng, 3); return r ? { x: r.x.toFixed(2), y: r.y.toFixed(2) } : { lat: '', lng: '' }; }
    if (mode === 'msk4') { const r = toMsk(+lat, +lng, 4); return r ? { x: r.x.toFixed(2), y: r.y.toFixed(2) } : { lat: '', lng: '' }; }
    return { lat: (+lat).toFixed(6), lng: (+lng).toFixed(6) };
  }

  // Возвращает данные для ведомости проб
  app.get('/api/vedomost/samples', wrap((req, res) => {
    const d = db();
    const { from, to, site_id, coord = 'dd' } = req.query;
    let sql = "SELECT b.* FROM boreholes b WHERE b.status='done'";
    const p = [];
    if (from) { sql += ' AND b.drill_date>=?'; p.push(from); }
    if (to)   { sql += ' AND b.drill_date<=?'; p.push(to); }
    if (site_id) { sql += ' AND b.site_id=?'; p.push(site_id); }
    sql += ' ORDER BY b.drill_date, b.name';
    const boreholes = all(d, sql, p);
    const rows = [];
    boreholes.forEach(bh => {
      const layers = all(d, 'SELECT * FROM soil_layers WHERE borehole_uuid=? ORDER BY order_idx', [bh.uuid]);
      layers.forEach(l => {
        const samples = all(d, 'SELECT * FROM samples WHERE layer_uuid=? ORDER BY depth_m', [l.uuid]);
        samples.forEach(s => {
          const lat = bh.manual_lat;
          const lng = bh.manual_lng;
          const c = fmtCoord(lat, lng, coord);
          const depth = s.depth_top_m != null && s.depth_bottom_m != null
            ? `${s.depth_top_m}-${s.depth_bottom_m}`
            : (s.depth_m != null ? String(s.depth_m) : '');
          rows.push({
            date: bh.drill_date || '',
            borehole: bh.name || '',
            depth,
            collection_type: s.collection_type || '',
            packaging: s.packaging || '',
            soil_type: l.soil_type || '',
            frozen_state: l.frozen_state || '',
            coord_lat: c.lat || c.x || '',
            coord_lng: c.lng || c.y || '',
          });
        });
      });
    });
    res.json({ rows, coord_mode: coord });
  }));

  // Ведомость объёмов
  app.get('/api/vedomost/volumes', wrap((req, res) => {
    const d = db();
    const { from, to, site_id, coord = 'dd' } = req.query;
    let sql = `SELECT b.*, v.kind AS vol_kind, v.name AS vol_name
               FROM boreholes b JOIN volumes v ON v.id=b.volume_id
               WHERE b.status='done'`;
    const p = [];
    if (from) { sql += ' AND b.drill_date>=?'; p.push(from); }
    if (to)   { sql += ' AND b.drill_date<=?'; p.push(to); }
    if (site_id) { sql += ' AND b.site_id=?'; p.push(site_id); }
    sql += ' ORDER BY v.kind, b.drill_date, b.name';
    const rows = all(d, sql, p).map(bh => {
      const c = fmtCoord(bh.manual_lat, bh.manual_lng, coord);
      const totalDepth = bh.casing_length_m || bh.planned_depth_m || 0;
      return {
        kind: bh.vol_kind,
        date: bh.drill_date || '',
        borehole: bh.name || '',
        volume_name: bh.vol_name,
        depth_m: totalDepth,
        diameter_mm: bh.diameter_mm || '',
        work_type: bh.work_type || '',
        coord_lat: c.lat || c.x || '',
        coord_lng: c.lng || c.y || '',
      };
    });
    res.json({ rows, coord_mode: coord });
  }));
};
