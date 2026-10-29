// ═══════════════════════════════════════════════════════════
// routes/volume-sync.js — объёмы работ на слоях KML.
//
// Объём объекта (volumes) может быть привязан к слою (layer_id). Тогда:
//   • план считается по объектам слоя: штуки / длина / площадь + второй
//     показатель — сумма поля (например «глубина» → п.м.);
//   • выполнение — объекты слоя с отметкой _done (дата _done_date, факт. значение
//     второго показателя _fact2, сотрудники _workers, техника _machine);
//   • _skip — объект исключён из объёма (не план и не факт).
// Строки vol_progress с source='kml' — ЗЕРКАЛО выполненных объектов: их строит
// syncLayer() при каждом сохранении слоя, руками они не правятся. Поэтому СМГ,
// прогноз, отчёты, объёмы сотрудника читают vol_progress как раньше.
// Ручные объёмы (без слоя) и ручные строки (source='manual') работают как прежде.
// ═══════════════════════════════════════════════════════════
const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');

// ── геометрия (WGS-84, сфера) ───────────────────────────────
const R = 6378137, rad = d => d * Math.PI / 180;
function dist(a, b) {   // [lng,lat] → м
  const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));   // радиус как у карты (Leaflet) — длины совпадают с линейкой
}
function ringArea(c) {  // м², как L.GeometryUtil.geodesicArea
  let a = 0; const n = c.length; if (n < 3) return 0;
  for (let i = 0; i < n; i++) { const p = c[i], q = c[(i + 1) % n]; a += rad(q[0] - p[0]) * (2 + Math.sin(rad(p[1])) + Math.sin(rad(q[1]))); }
  return Math.abs(a * R * R / 2);
}
const lineLen = c => { let d = 0; for (let i = 1; i < c.length; i++) d += dist(c[i - 1], c[i]); return d; };
function geomLength(g) {
  if (!g) return 0;
  if (g.type === 'LineString') return lineLen(g.coordinates);
  if (g.type === 'MultiLineString') return g.coordinates.reduce((s, c) => s + lineLen(c), 0);
  if (g.type === 'GeometryCollection') return (g.geometries || []).reduce((s, x) => s + geomLength(x), 0);
  return 0;
}
function geomArea(g) {
  if (!g) return 0;
  const poly = p => ringArea(p[0] || []) - p.slice(1).reduce((s, r) => s + ringArea(r), 0);
  if (g.type === 'Polygon') return poly(g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.reduce((s, p) => s + poly(p), 0);
  if (g.type === 'GeometryCollection') return (g.geometries || []).reduce((s, x) => s + geomArea(x), 0);
  return 0;
}
function geomCenter(g) {
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  const pts = []; const walk = a => { if (typeof a[0] === 'number') pts.push(a); else a.forEach(walk); };
  try { if (g.type === 'GeometryCollection') (g.geometries || []).forEach(x => x.coordinates && walk(x.coordinates)); else walk(g.coordinates); } catch (e) {}
  if (!pts.length) return null;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

// ── единицы ─────────────────────────────────────────────────
const isMeters = u => /^\s*(п\.?\s*м\.?|пог\.?\s*м\.?|м\.?|m|метр\S*)\s*$/i.test(String(u || ''));
function lenIn(m, unit) { return /км|km/i.test(unit || '') ? m / 1000 : m; }
function areaIn(m2, unit) { const u = String(unit || ''); return /км/i.test(u) ? m2 / 1e6 : /м²|м2|кв\.?\s*м/i.test(u) ? m2 : m2 / 1e4; }
// число из значения поля: «10», «10,5», «10 м», «Н=12,5», «глуб. 1 200.0 п.м.» → первое число в тексте
const num = v => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = String(v).replace(/(\d)[\s\u00a0\u202f](?=\d{3}\b)/g, '$1').match(/-?\d+(?:[.,]\d+)?/);
  if (!t) return null;
  const n = parseFloat(t[0].replace(',', '.')); return Number.isFinite(n) ? n : null;
};
const r3 = v => Math.round(v * 1000) / 1000;

function parseMeasure(v) {
  let m = {}; try { m = JSON.parse(v.measure_json || '{}') || {}; } catch (e) {}
  if (!m.main) m.main = 'count';
  if (!m.unit) m.unit = m.main === 'length' ? 'км' : m.main === 'area' ? 'га' : (v.unit || 'шт');
  // второй показатель: source 'field' — сумма поля; 'fixed' — одинаково на объект (value);
  // 'fact' — только то, что вписали при выполнении (_fact2), план — общим числом (plan)
  const s2 = m.second;
  if (s2) {
    if (!s2.source) s2.source = 'field';
    if (s2.source === 'field' && !s2.field) m.second = null;
    else if (s2.source === 'fixed' && !(num(s2.value) > 0)) m.second = null;
    else if (s2.source === 'fixed') s2.value = num(s2.value);
    else if (s2.source === 'fact') s2.plan = num(s2.plan);
  }
  return m;
}
const featsOf = gj => !gj ? [] : gj.type === 'FeatureCollection' ? (gj.features || []) : gj.type === 'Feature' ? [gj] : [];
// значение объекта по основному показателю
function mainOf(f, m) {
  if (m.main === 'length') return lenIn(geomLength(f.geometry), m.unit);
  if (m.main === 'area') return areaIn(geomArea(f.geometry), m.unit);
  return 1;
}
function secondPlanOf(f, m) {
  const s2 = m.second; if (!s2) return 0;
  if (s2.source === 'fixed') return s2.value;
  if (s2.source === 'fact') return 0;
  return num((f.properties || {})[s2.field]) || 0;
}
function secondFactOf(f, m) {
  if (!m.second) return null;
  const x = num((f.properties || {})._fact2); return x != null ? x : secondPlanOf(f, m);
}
const today = () => new Date().toISOString().slice(0, 10);

// ── пересчёт % объекта ─────────────────────────────────────
function recalcSite(db, siteId) {
  if (!siteId) return null;
  const vols = all(db, 'SELECT id, amount FROM volumes WHERE site_id=?', [siteId]);
  const sums = {}; all(db, "SELECT volume_id, SUM(completed) s FROM vol_progress WHERE site_id=? AND COALESCE(row_type,'fact') NOT IN ('plan','act') GROUP BY volume_id", [siteId])
    .forEach(r => { sums[r.volume_id] = r.s || 0; });
  const ps = vols.filter(v => (v.amount || 0) > 0).map(v => Math.min(100, (sums[v.id] || 0) / v.amount * 100));
  if (!ps.length) return null;
  const pct = Math.round(ps.reduce((a, b) => a + b, 0) / ps.length);
  run(db, 'UPDATE sites SET completion_percent=? WHERE id=?', [pct, siteId]);
  return pct;
}

// ── объём ← слой ────────────────────────────────────────────
// Возвращает geojson-строку, если пришлось дописать _uid (слой надо пересохранить).
function syncVolume(db, vol) {
  const m = parseMeasure(vol);
  const layer = vol.layer_id ? get(db, 'SELECT id, geojson FROM kml_layers WHERE id=?', [vol.layer_id]) : null;
  run(db, "DELETE FROM vol_progress WHERE volume_id=? AND source='kml'", [vol.id]);
  if (!layer) { if (vol.layer_id) run(db, 'UPDATE volumes SET amount=0, amount2=0 WHERE id=?', [vol.id]); recalcSite(db, vol.site_id); return; }
  let gj; try { gj = JSON.parse(layer.geojson); } catch (e) { gj = null; }
  const feats = featsOf(gj);
  let changed = false, plan = 0, plan2 = 0;
  const ins = db.prepare(`INSERT INTO vol_progress(id,volume_id,site_id,work_date,completed,amount2,notes,geojson,worker_ids,machine_id,row_type,source,feature_uid)
    VALUES(?,?,?,?,?,?,?,?,?,?,'fact','kml',?)`);
  const brig = {}; try { all(db, 'SELECT id, name FROM pgk_brigades').forEach(b => { brig[b.id] = b.name; }); } catch (e) {}
  feats.forEach((f, i) => {
    if (!f || !f.geometry) return;
    const p = f.properties = f.properties || {};
    if (!p._uid) { p._uid = uuid().slice(0, 12); changed = true; }
    if (p._skip) return;
    const mv = mainOf(f, m);
    plan += mv; plan2 += secondPlanOf(f, m);
    if (!p._done) return;
    const nm = p.name || p.Name || `Объект ${i + 1}`;
    ins.run(`kml:${vol.id}:${p._uid}`, vol.id, vol.site_id, String(p._done_date || today()).slice(0, 10), r3(mv),
      m.second ? r3(secondFactOf(f, m)) : null, nm + (p._brigade && brig[p._brigade] ? ` · ${brig[p._brigade]}` : '') + (p._note ? `: ${p._note}` : ''),
      JSON.stringify({ type: 'Feature', properties: { name: nm }, geometry: f.geometry }),
      String(p._workers || ''), p._machine || null, p._uid);
  });
  const p2 = !m.second ? null : m.second.source === 'fact' ? (m.second.plan != null ? r3(m.second.plan) : null) : r3(plan2);
  run(db, 'UPDATE volumes SET amount=?, amount2=?, unit=? WHERE id=?', [r3(plan), p2, m.unit, vol.id]);
  recalcSite(db, vol.site_id);
  if (changed) {
    const txt = JSON.stringify(gj && gj.type === 'FeatureCollection' ? gj : { type: 'FeatureCollection', features: feats });
    run(db, 'UPDATE kml_layers SET geojson=? WHERE id=?', [txt, layer.id]);
    return txt;
  }
}
// После сохранения слоя: пересчитать все объёмы, которые на нём построены
function syncLayer(db, layerId) {
  let txt;
  all(db, 'SELECT * FROM volumes WHERE layer_id=?', [layerId]).forEach(v => { const t = syncVolume(db, v); if (t) txt = t; });
  return txt;
}
function syncVolumeId(db, volId) { const v = get(db, 'SELECT * FROM volumes WHERE id=?', [volId]); if (v) return syncVolume(db, v); }

// ═══ Перенос старых объёмов в слои (один раз) ═══════════════════════════
const SEM_LABEL = { borehole: 'Скважина', steel_angle: 'Металлический уголок', ggs: 'Пункт ГГС', ogs: 'Пункт ОГС', repere: 'Репер', benchmark: 'Марка', pit: 'Шурф', other: 'Другое' };
const DONE_COLOR = '#7ed321';
function _semProps(sem) {
  const o = {}; if (!sem) return o;
  if (sem.type) o['тип'] = SEM_LABEL[sem.type] || sem.type;
  const d = sem.data || {};
  if (num(d.depth) != null) o['глубина'] = num(d.depth);
  if (num(d.diam) != null) o['диаметр'] = num(d.diam);
  if (num(d.ugv) != null) o['УГВ'] = num(d.ugv);
  if (d.note) o['примечание'] = d.note;
  return o;
}
function _groupFor(db, site) {
  const row = get(db, "SELECT value FROM app_settings WHERE key='kml_groups'");
  let G = { groups: {}, order: [] }; try { if (row) G = Object.assign(G, JSON.parse(row.value)); } catch (e) {}
  G.groups = G.groups || {}; G.order = G.order || [];
  let g = Object.values(G.groups).find(x => x && x._volSite === site.id);
  if (!g) {
    g = { id: 'g' + uuid().slice(0, 8), name: `📦 ${site.name}`, collapsed: true, site_ids: [], _volSite: site.id };
    G.groups[g.id] = g; G.order.push(g.id);
    run(db, "INSERT OR REPLACE INTO app_settings(key,value) VALUES('kml_groups',?)", [JSON.stringify(G)]);
  }
  return g.id;
}
function migrate(db) {
  const flag = get(db, "SELECT value FROM app_settings WHERE key='volumes_kml_v1'");
  if (flag) return { skipped: true };
  const stat = { layers: 0, done: 0, added: 0, manual: 0, bound: 0, colorDone: 0 };
  const tx = db.transaction(() => {
    // 1) объекты слоёв, выполненные «по цвету» (старый способ) → _done
    const factRows = {};
    all(db, 'SELECT id, work_date, worker_ids, machine_id FROM vol_progress').forEach(r => { factRows[r.id] = r; });
    for (const l of all(db, 'SELECT id, geojson, style_json, created_at FROM kml_layers')) {
      let gj; try { gj = JSON.parse(l.geojson); } catch (e) { continue; }
      let ch = false;
      featsOf(gj).forEach(f => {
        const p = f && f.properties; if (!p) return;
        const byColor = String(p._color || '').toLowerCase() === DONE_COLOR;
        if (!(byColor || p._done)) return;
        p._done = 1;
        const fr = p._fact && factRows[p._fact];
        if (!p._done_date) p._done_date = fr ? fr.work_date : String(l.created_at || today()).slice(0, 10);
        if (fr && fr.worker_ids && !p._workers) p._workers = fr.worker_ids;
        if (fr && fr.machine_id && !p._machine) p._machine = fr.machine_id;
        if (byColor) delete p._color;
        if (p.comment === 'Выполнено') delete p.comment;
        ch = true; stat.colorDone++;
      });
      // 2) слой со связью «факт → объём»: объём без своей геометрии становится объёмом этого слоя
      let st = {}; try { st = JSON.parse(l.style_json || '{}') || {}; } catch (e) {}
      const cfg = st.fact;
      if (cfg && cfg.volumeId) {
        const v = get(db, 'SELECT * FROM volumes WHERE id=?', [cfg.volumeId]);
        if (v && !v.layer_id && !featsOf(_json(v.geojson)).length) {
          const second = cfg.field ? { field: cfg.field, unit: isMeters(v.unit) ? v.unit : 'п.м.' } : null;
          const main = 'count', unit = second && isMeters(v.unit) ? 'шт' : (v.unit || 'шт');
          run(db, 'UPDATE volumes SET layer_id=?, measure_json=? WHERE id=?', [l.id, JSON.stringify({ main, unit, second }), v.id]);
          // факты, пришедшие из этого слоя, теперь строятся из отметок
          featsOf(gj).forEach(f => { const p = f && f.properties; if (p && p._fact) { run(db, 'DELETE FROM vol_progress WHERE id=?', [p._fact]); delete p._fact; ch = true; } });
          stat.bound++;
        }
      }
      if (cfg) { delete st.fact; run(db, 'UPDATE kml_layers SET style_json=? WHERE id=?', [JSON.stringify(st), l.id]); }
      featsOf(gj).forEach(f => { if (f && f.properties && f.properties._fact) { delete f.properties._fact; ch = true; } });
      if (ch) run(db, 'UPDATE kml_layers SET geojson=? WHERE id=?', [JSON.stringify(gj), l.id]);
    }
    // 3) объёмы со своей геометрией → слой
    for (const v of all(db, 'SELECT * FROM volumes WHERE layer_id IS NULL OR layer_id=\'\'')) {
      const plan = featsOf(_json(v.geojson)).filter(f => f && f.geometry);
      if (!plan.length) { stat.manual++; continue; }
      const site = get(db, 'SELECT id, name FROM sites WHERE id=?', [v.site_id]) || { id: v.site_id, name: 'Объект' };
      let volSem = null;
      if (String(v.notes || '').startsWith('__SEM__:')) { try { volSem = JSON.parse(String(v.notes).slice(8).split('\n')[0]); } catch (e) {} }
      const points = plan.every(f => /Point/.test(f.geometry.type));
      const lines = plan.every(f => /LineString/.test(f.geometry.type));
      const feats = plan.map((f, i) => {
        const p0 = f.properties || {};
        const p = Object.assign({ name: p0.name || (points ? `${v.name} ${i + 1}` : v.name) }, _semProps(volSem), _semProps(p0.sem));
        if (p0.color) p._color = p0.color;
        p._uid = uuid().slice(0, 12);
        return { type: 'Feature', properties: p, geometry: f.geometry };
      });
      const meters = isMeters(v.unit);
      const hasDepth = feats.some(f => f.properties['глубина'] != null);
      let measure;
      if (points) measure = { main: 'count', unit: meters ? (volSem && volSem.type === 'pit' ? 'шурф' : 'скв') : (v.unit || 'шт'), second: (meters || hasDepth) ? { field: 'глубина', unit: meters ? v.unit : 'п.м.' } : null };
      else if (lines) measure = { main: 'length', unit: /км|km/i.test(v.unit || '') ? 'км' : (meters ? v.unit : 'км'), second: null };
      else measure = { main: 'area', unit: /га/i.test(v.unit || '') ? 'га' : /км/i.test(v.unit || '') ? 'км²' : /м/i.test(v.unit || '') ? 'м²' : 'га', second: null };
      // факты: точки — к ближайшей плановой точке (до 30 м) или новым выполненным объектом
      const facts = all(db, "SELECT * FROM vol_progress WHERE volume_id=? AND COALESCE(row_type,'fact')='fact' ORDER BY work_date", [v.id]);
      for (const fr of facts) {
        const fg = featsOf(_json(fr.geojson)).find(f => f && f.geometry);
        if (!points || !fg || !/Point/.test(fg.geometry.type)) {
          // без точки (или линия/полигон): остаётся ручной строкой
          if (points && measure.second && meters) run(db, 'UPDATE vol_progress SET amount2=completed, completed=0 WHERE id=?', [fr.id]);
          continue;
        }
        const c = fg.geometry.coordinates;
        let best = null, bd = 30;
        feats.forEach(f => { if (f.properties._done) return; const d = dist(c, f.geometry.coordinates); if (d < bd) { bd = d; best = f; } });
        const semF = _semProps((fg.properties || {}).sem);
        if (!best) {
          best = { type: 'Feature', properties: Object.assign({ name: (fg.properties || {}).name || `${v.name} — факт ${fr.work_date}` }, semF, { _uid: uuid().slice(0, 12) }), geometry: fg.geometry };
          feats.push(best); stat.added++;
        }
        const p = best.properties;
        p._done = 1; p._done_date = fr.work_date;
        if (fr.worker_ids) p._workers = fr.worker_ids;
        if (fr.machine_id) p._machine = fr.machine_id;
        if (measure.second) { const f2 = meters ? num(fr.completed) : num(semF['глубина']); if (f2 != null) p._fact2 = f2; }
        const nt = String(fr.notes || '').trim(); if (nt) p._note = nt.slice(0, 300);
        run(db, 'DELETE FROM vol_progress WHERE id=?', [fr.id]);
        stat.done++;
      }
      const lid = uuid();
      run(db, `INSERT INTO kml_layers(id,name,geojson,color,visible,site_id,symbol,group_id,line_dash,show_labels,fill_opacity)
        VALUES(?,?,?,?,?,NULL,?,?,?,?,?)`, [lid, `${site.name} — ${v.name}`, JSON.stringify({ type: 'FeatureCollection', features: feats }),
        v.color || '#1a56db', v.visible === 0 ? 0 : 1, points && (/скв|шурф/.test(measure.unit) || feats.some(f => /Скважина|Шурф/.test(f.properties['тип'] || ''))) ? 'borehole' : 'point', _groupFor(db, site), 'solid', points ? 1 : 0, v.fill_opacity != null ? v.fill_opacity : 0.25]);
      run(db, 'UPDATE volumes SET layer_id=?, measure_json=? WHERE id=?', [lid, JSON.stringify(measure), v.id]);
      stat.layers++;
    }
    run(db, "INSERT OR REPLACE INTO app_settings(key,value) VALUES('volumes_kml_v1',?)", [JSON.stringify({ at: new Date().toISOString(), ...stat })]);
  });
  tx();
  for (const v of all(db, "SELECT * FROM volumes WHERE layer_id IS NOT NULL AND layer_id<>''")) syncVolume(db, v);
  return stat;
}
function _json(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function needsMigration(db) {
  if (get(db, "SELECT value FROM app_settings WHERE key='volumes_kml_v1'")) return false;
  return !!(get(db, 'SELECT 1 FROM volumes LIMIT 1') || get(db, 'SELECT 1 FROM kml_layers LIMIT 1'));
}

module.exports = { syncLayer, syncVolume, syncVolumeId, recalcSite, migrate, needsMigration, parseMeasure, geomLength, geomArea, geomCenter, dist };
