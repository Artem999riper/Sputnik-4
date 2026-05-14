// Ведомости Excel — пробы и объёмы
// Данные возвращаются JSON, клиент генерирует Excel через xlsx-js-style
const { all, get } = require('../database');
const { toMsk, formatDms } = require('../lib/proj');

module.exports = (app, ctx) => {
  const { db, wrap } = ctx;

  function fmtCoord(lat, lng, mode) {
    if (lat == null || lng == null) return { lat: '', lng: '' };
    if (mode === 'dms')  return { lat: formatDms(+lat, true), lng: formatDms(+lng, false) };
    if (mode === 'msk3') { const r = toMsk(+lat, +lng, 3); return r ? { lat: r.x.toFixed(2), lng: r.y.toFixed(2) } : { lat: '', lng: '' }; }
    if (mode === 'msk4') { const r = toMsk(+lat, +lng, 4); return r ? { lat: r.x.toFixed(2), lng: r.y.toFixed(2) } : { lat: '', lng: '' }; }
    return { lat: (+lat).toFixed(6), lng: (+lng).toFixed(6) };
  }

  // Общий запрос: koordinаты = manual если заданы, иначе из KML-точки
  function bhCoordSql(extra = '') {
    return `SELECT b.*,
      COALESCE(b.manual_lat, k.lat) AS lat,
      COALESCE(b.manual_lng, k.lng) AS lng
      ${extra}
      FROM boreholes b
      LEFT JOIN kml_points k ON k.id = b.kml_point_id`;
  }

  // Ведомость проб
  app.get('/api/vedomost/samples', wrap((req, res) => {
    const d = db();
    const { from, to, site_id, coord = 'dd' } = req.query;
    let sql = bhCoordSql(', s.name AS site_name') +
      " LEFT JOIN sites s ON s.id=b.site_id WHERE b.status='done'";
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
          const c = fmtCoord(bh.lat, bh.lng, coord);
          const depth = (s.depth_top_m != null && s.depth_bottom_m != null)
            ? `${s.depth_top_m}-${s.depth_bottom_m}`
            : (s.depth_m != null ? String(s.depth_m) : '');
          const collShort = s.collection_type === 'Монолит' ? 'мон' : s.collection_type === 'Нарушенный' ? 'нар' : (s.collection_type || '');
          rows.push({
            date: bh.drill_date || '',
            borehole: bh.name || '',
            depth,
            collection_type: collShort,
            packaging: s.packaging || '',
            soil_type: l.soil_type || '',
            frozen_state: l.frozen_state || '',
            coord_lat: c.lat,
            coord_lng: c.lng,
          });
        });
      });
    });
    const siteName = site_id ? get(d, 'SELECT name FROM sites WHERE id=?', [site_id])?.name || '' : '';
    res.json({ rows, coord_mode: coord, site_name: siteName });
  }));

  // Ведомость объёмов
  app.get('/api/vedomost/volumes', wrap((req, res) => {
    const d = db();
    const { from, to, site_id, coord = 'dd' } = req.query;
    let sql = bhCoordSql(', v.kind AS vol_kind, v.name AS vol_name, s.name AS site_name') +
      ` JOIN volumes v ON v.id=b.volume_id
         LEFT JOIN sites s ON s.id=b.site_id
         WHERE b.status='done'`;
    const p = [];
    if (from) { sql += ' AND b.drill_date>=?'; p.push(from); }
    if (to)   { sql += ' AND b.drill_date<=?'; p.push(to); }
    if (site_id) { sql += ' AND b.site_id=?'; p.push(site_id); }
    sql += ' ORDER BY b.brigade_snapshot, b.drill_date, b.name';
    const boreholes = all(d, sql, p);
    const rows = boreholes.map(bh => {
      const c = fmtCoord(bh.lat, bh.lng, coord);
      return {
        brigade_snapshot: bh.brigade_snapshot || '',
        date: bh.drill_date || '',
        borehole: bh.name || '',
        volume_name: bh.vol_name || '',
        kind: bh.vol_kind || '',
        depth_m: Number(bh.casing_length_m) || Number(bh.planned_depth_m) || 0,
        casing_m: Number(bh.casing_length_m) || 0,
        description: bh.description || '',
        coord_lat: c.lat,
        coord_lng: c.lng,
      };
    });
    const siteName = site_id ? get(d, 'SELECT name FROM sites WHERE id=?', [site_id])?.name || '' : '';
    res.json({ rows, coord_mode: coord, site_name: siteName });
  }));
};
