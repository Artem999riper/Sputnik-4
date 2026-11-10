// ═══════════════════════════════════════════════════════════
// routes/layer-history.js — корзина слоёв и версии слоя.
//
// Корзина (layer_trash): удалённый слой (вся строка kml_layers) хранится 7 дней,
//   его можно вернуть; потом удаляется сам (вместе с версиями).
// Версии (layer_versions): перед изменением геометрии или стиля слоя сохраняется
//   прежнее состояние — не чаще раза в 15 минут на слой («авто»), плюс версии,
//   сохранённые вручную с подписью. Хранятся 30 дней (ручные — 90), не больше
//   30 версий и ~150 МБ на слой. Возврат версии сначала сохраняет текущее состояние.
// misc.js вызывает toTrash() при удалении и snapshot() перед изменением.
// ═══════════════════════════════════════════════════════════
const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');
const { wrap } = require('./validate');

const TRASH_DAYS = 7, AUTO_MIN = 15, KEEP_N = 30, KEEP_DAYS = 30, KEEP_MANUAL_DAYS = 90, MAX_BYTES = 150 * 1024 * 1024;
const _inited = new WeakSet();
function init(d) {
  if (_inited.has(d)) return;
  d.exec(`CREATE TABLE IF NOT EXISTS layer_trash (id TEXT PRIMARY KEY, layer_id TEXT NOT NULL, name TEXT, row_json TEXT NOT NULL,
      n_features INTEGER DEFAULT 0, bytes INTEGER DEFAULT 0, deleted_by TEXT DEFAULT '', deleted_at TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS layer_versions (id TEXT PRIMARY KEY, layer_id TEXT NOT NULL, kind TEXT DEFAULT 'auto', note TEXT DEFAULT '',
      name TEXT, color TEXT, symbol TEXT, line_dash TEXT, style_json TEXT, geojson TEXT, n_features INTEGER DEFAULT 0, bytes INTEGER DEFAULT 0,
      user_name TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime')));
    CREATE INDEX IF NOT EXISTS idx_layer_versions ON layer_versions(layer_id, created_at);`);
  _inited.add(d);
}
const uname = req => { let n = (req && req.get && req.get('X-User-Name')) || ''; try { n = decodeURIComponent(n); } catch (e) {} return n.slice(0, 120); };
const nFeat = gj => { try { const g = JSON.parse(gj); return g.type === 'FeatureCollection' ? (g.features || []).length : 1; } catch (e) { return 0; } };

// слой удалён — положить копию строки в корзину
function toTrash(d, row, req) {
  if (!row) return;
  init(d);
  run(d, 'INSERT INTO layer_trash(id,layer_id,name,row_json,n_features,bytes,deleted_by) VALUES(?,?,?,?,?,?,?)',
    [uuid(), row.id, row.name || '', JSON.stringify(row), nFeat(row.geojson), (row.geojson || '').length, uname(req)]);
}
// сохранить ТЕКУЩЕЕ состояние слоя как версию; kind 'auto' — не чаще раза в AUTO_MIN минут
function snapshot(d, layerId, req, kind = 'auto', note = '') {
  init(d);
  const l = get(d, 'SELECT * FROM kml_layers WHERE id=?', [layerId]); if (!l) return null;
  if (kind === 'auto') {
    const last = get(d, "SELECT created_at FROM layer_versions WHERE layer_id=? AND kind IN ('auto','before') ORDER BY created_at DESC LIMIT 1", [layerId]);
    if (last && get(d, `SELECT 1 x WHERE datetime(?) > datetime('now','localtime','-${AUTO_MIN} minutes')`, [last.created_at])) return null;
  }
  const id = uuid();
  run(d, `INSERT INTO layer_versions(id,layer_id,kind,note,name,color,symbol,line_dash,style_json,geojson,n_features,bytes,user_name)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, layerId, kind, String(note || '').slice(0, 200), l.name, l.color, l.symbol, l.line_dash, l.style_json, l.geojson,
    nFeat(l.geojson), (l.geojson || '').length, uname(req)]);
  prune(d, layerId);
  return id;
}
function prune(d, layerId) {
  run(d, `DELETE FROM layer_versions WHERE layer_id=? AND ((kind!='manual' AND created_at < datetime('now','localtime','-${KEEP_DAYS} days'))
    OR (kind='manual' AND created_at < datetime('now','localtime','-${KEEP_MANUAL_DAYS} days')))`, [layerId]);
  const vs = all(d, 'SELECT id, kind, bytes FROM layer_versions WHERE layer_id=? ORDER BY created_at DESC', [layerId]);
  let bytes = 0;
  vs.forEach((v, i) => { bytes += v.bytes || 0; if (i >= KEEP_N || (i > 0 && bytes > MAX_BYTES)) run(d, 'DELETE FROM layer_versions WHERE id=?', [v.id]); });
}
function purge(d) {
  init(d);
  const old = all(d, `SELECT id, layer_id FROM layer_trash WHERE deleted_at < datetime('now','localtime','-${TRASH_DAYS} days')`);
  old.forEach(t => {
    run(d, 'DELETE FROM layer_trash WHERE id=?', [t.id]);
    if (!get(d, 'SELECT 1 x FROM kml_layers WHERE id=?', [t.layer_id]) && !get(d, 'SELECT 1 x FROM layer_trash WHERE layer_id=?', [t.layer_id]))
      run(d, 'DELETE FROM layer_versions WHERE layer_id=?', [t.layer_id]);
  });
  // слой уже вернули другим путём (отмена удаления) — запись корзины не нужна
  run(d, 'DELETE FROM layer_trash WHERE layer_id IN (SELECT id FROM kml_layers)');
  return old.length;
}

function routes(app, getDb, { VS, broadcast }) {
  const db = () => { const d = getDb(); init(d); return d; };
  try { purge(db()); } catch (e) {}
  setInterval(() => { try { purge(db()); } catch (e) {} }, 6 * 3600 * 1000).unref();

  // ── корзина ──
  app.get('/api/layers-trash', wrap((req, res) => {
    const d = db(); purge(d);
    res.json(all(d, `SELECT id, layer_id, name, n_features, bytes, deleted_by, deleted_at,
      CAST(julianday(deleted_at, '+${TRASH_DAYS} days') - julianday('now','localtime') AS REAL) days_left FROM layer_trash ORDER BY deleted_at DESC`)
      .map(r => { let color = ''; try { color = JSON.parse(get(d, 'SELECT row_json FROM layer_trash WHERE id=?', [r.id]).row_json).color || ''; } catch (e) {} return { ...r, color, days_left: Math.max(0, Math.ceil(r.days_left)) }; }));
  }));
  app.post('/api/layers-trash/:id/restore', wrap((req, res) => {
    const d = db(), t = get(d, 'SELECT * FROM layer_trash WHERE id=?', [req.params.id]);
    if (!t) return res.status(404).json({ error: 'В корзине нет такого слоя' });
    const row = JSON.parse(t.row_json);
    if (get(d, 'SELECT 1 x FROM kml_layers WHERE id=?', [row.id])) { run(d, 'DELETE FROM layer_trash WHERE id=?', [t.id]); return res.json({ ok: true, id: row.id, already: true }); }
    const cols = all(d, 'PRAGMA table_info(kml_layers)').map(c => c.name).filter(c => c in row);
    run(d, `INSERT INTO kml_layers(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`, cols.map(c => row[c]));
    run(d, 'DELETE FROM layer_trash WHERE id=?', [t.id]);
    try { VS && VS.syncLayer(d, row.id); } catch (e) {}
    res.json({ ok: true, id: row.id, name: row.name });
  }));
  app.delete('/api/layers-trash/:id', wrap((req, res) => {
    const d = db(), t = get(d, 'SELECT layer_id FROM layer_trash WHERE id=?', [req.params.id]);
    if (!t) return res.status(404).json({ error: 'Нет такой записи' });
    run(d, 'DELETE FROM layer_trash WHERE id=?', [req.params.id]);
    if (!get(d, 'SELECT 1 x FROM kml_layers WHERE id=?', [t.layer_id])) run(d, 'DELETE FROM layer_versions WHERE layer_id=?', [t.layer_id]);
    res.json({ ok: true });
  }));

  // ── версии ──
  app.get('/api/layers/:id/versions', wrap((req, res) => {
    res.json(all(db(), 'SELECT id, kind, note, name, n_features, bytes, user_name, created_at FROM layer_versions WHERE layer_id=? ORDER BY created_at DESC', [req.params.id]));
  }));
  app.get('/api/layers/:id/versions/:vid', wrap((req, res) => {
    const v = get(db(), 'SELECT * FROM layer_versions WHERE id=? AND layer_id=?', [req.params.vid, req.params.id]);
    if (!v) return res.status(404).json({ error: 'Версия не найдена' });
    res.json(v);
  }));
  app.post('/api/layers/:id/versions', wrap((req, res) => {
    const d = db();
    if (!get(d, 'SELECT 1 x FROM kml_layers WHERE id=?', [req.params.id])) return res.status(404).json({ error: 'Слой не найден' });
    res.json({ ok: true, id: snapshot(d, req.params.id, req, 'manual', (req.body || {}).note || '') });
  }));
  app.post('/api/layers/:id/versions/:vid/restore', wrap((req, res) => {
    const d = db(), v = get(d, 'SELECT * FROM layer_versions WHERE id=? AND layer_id=?', [req.params.vid, req.params.id]);
    if (!v) return res.status(404).json({ error: 'Версия не найдена' });
    if (!get(d, 'SELECT 1 x FROM kml_layers WHERE id=?', [req.params.id])) return res.status(404).json({ error: 'Слой не найден' });
    const dt = String(v.created_at || ''), when = dt.length >= 16 ? `${dt.slice(8, 10)}.${dt.slice(5, 7)}.${dt.slice(2, 4)} ${dt.slice(11, 16)}` : dt;
    snapshot(d, req.params.id, req, 'before', 'перед возвратом версии от ' + when);   // текущее — тоже версия, можно вернуть обратно
    run(d, 'UPDATE kml_layers SET geojson=?, style_json=?, color=COALESCE(?,color), symbol=COALESCE(?,symbol), line_dash=COALESCE(?,line_dash) WHERE id=?',
      [v.geojson, v.style_json, v.color, v.symbol, v.line_dash, req.params.id]);
    let synced = null; try { synced = VS && VS.syncLayer(d, req.params.id); } catch (e) {}
    res.json({ ok: true, geojson: synced || v.geojson });
  }));
  app.delete('/api/layers/:id/versions/:vid', wrap((req, res) => {
    run(db(), 'DELETE FROM layer_versions WHERE id=? AND layer_id=?', [req.params.vid, req.params.id]);
    res.json({ ok: true });
  }));
}
module.exports = { routes, toTrash, snapshot, purge, init, TRASH_DAYS };
