// SQLite через better-sqlite3 — собственная БД polevik.db
let Database;
try { Database = require('better-sqlite3'); }
catch (e) {
  console.error('\n❌ better-sqlite3 не установлен. Выполните: npm install\n');
  process.exit(1);
}
const path = require('path');

const DB_PATH = path.join(__dirname, 'polevik.db');
let _db = null;

async function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      role TEXT, phone TEXT,
      imported_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS transport (
      id TEXT PRIMARY KEY, type TEXT, name TEXT NOT NULL, plate TEXT,
      imported_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      lat REAL, lng REAL,
      imported_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS kml_points (
      id TEXT PRIMARY KEY,
      site_id TEXT REFERENCES sites(id) ON DELETE CASCADE,
      name TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL,
      imported_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS brigades (
      id TEXT PRIMARY KEY,
      transport_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS brigade_members (
      brigade_id TEXT NOT NULL REFERENCES brigades(id) ON DELETE CASCADE,
      worker_id TEXT NOT NULL,
      PRIMARY KEY (brigade_id, worker_id)
    );
    CREATE TABLE IF NOT EXISTS volumes (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      total_volume REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS task_points (
      uuid TEXT PRIMARY KEY,
      volume_id TEXT NOT NULL REFERENCES volumes(id) ON DELETE CASCADE,
      site_id TEXT,
      name TEXT,
      lat REAL, lng REAL,
      kml_point_id TEXT,
      completed_date TEXT,
      planned_depth_m REAL DEFAULT 0,
      notes TEXT,
      brigade_snapshot TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS boreholes (
      uuid TEXT PRIMARY KEY,
      site_id TEXT,
      volume_id TEXT REFERENCES volumes(id) ON DELETE CASCADE,
      kml_point_id TEXT,
      manual_lat REAL, manual_lng REAL,
      name TEXT,
      planned_depth_m REAL DEFAULT 0,
      diameter_mm REAL DEFAULT 0,
      work_type TEXT DEFAULT 'SEARCH',
      geomorph_desc TEXT,
      description TEXT,
      drill_date TEXT,
      status TEXT DEFAULT 'draft',
      brigade_id TEXT,
      casing_length_m REAL DEFAULT 0,
      brigade_snapshot TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS soil_layers (
      uuid TEXT PRIMARY KEY,
      borehole_uuid TEXT NOT NULL REFERENCES boreholes(uuid) ON DELETE CASCADE,
      order_idx INTEGER DEFAULT 0,
      soil_type TEXT, state TEXT, description TEXT,
      depth_m REAL DEFAULT 0,
      frozen_state TEXT
    );
    CREATE TABLE IF NOT EXISTS samples (
      uuid TEXT PRIMARY KEY,
      layer_uuid TEXT NOT NULL REFERENCES soil_layers(uuid) ON DELETE CASCADE,
      collection_type TEXT, packaging TEXT,
      depth_m REAL, depth_top_m REAL, depth_bottom_m REAL
    );
    CREATE TABLE IF NOT EXISTS ugv (
      uuid TEXT PRIMARY KEY,
      borehole_uuid TEXT NOT NULL REFERENCES boreholes(uuid) ON DELETE CASCADE,
      order_idx INTEGER DEFAULT 0,
      depth_m REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS mmg (
      uuid TEXT PRIMARY KEY,
      borehole_uuid TEXT NOT NULL REFERENCES boreholes(uuid) ON DELETE CASCADE,
      order_idx INTEGER DEFAULT 0,
      top_m REAL DEFAULT 0,
      bottom_m REAL DEFAULT 0,
      description TEXT
    );
    CREATE TABLE IF NOT EXISTS photos (
      uuid TEXT PRIMARY KEY,
      borehole_uuid TEXT NOT NULL REFERENCES boreholes(uuid) ON DELETE CASCADE,
      category TEXT,
      file_path TEXT,
      taken_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS custom_soil_types (
      name TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS custom_soil_states (
      name TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      filename TEXT,
      imported_at TEXT DEFAULT (datetime('now')),
      manifest_json TEXT,
      counts_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bh_volume ON boreholes(volume_id);
    CREATE INDEX IF NOT EXISTS idx_bh_status ON boreholes(status);
    CREATE INDEX IF NOT EXISTS idx_bh_drill_date ON boreholes(drill_date);
    CREATE INDEX IF NOT EXISTS idx_layers_bh ON soil_layers(borehole_uuid);
    CREATE INDEX IF NOT EXISTS idx_samples_layer ON samples(layer_uuid);
    CREATE INDEX IF NOT EXISTS idx_photos_bh ON photos(borehole_uuid);
    CREATE INDEX IF NOT EXISTS idx_tp_volume ON task_points(volume_id);
    CREATE INDEX IF NOT EXISTS idx_kml_site ON kml_points(site_id);
  `);

  return _db;
}

function all(db, sql, p = []) {
  try { return db.prepare(sql).all(...p); }
  catch (e) { console.error('SQL all:', e.message, sql.slice(0, 80)); return []; }
}
function get(db, sql, p = []) {
  try { return db.prepare(sql).get(...p) || null; }
  catch (e) { console.error('SQL get:', e.message, sql.slice(0, 80)); return null; }
}
function run(db, sql, p = []) {
  try { return db.prepare(sql).run(...p); }
  catch (e) { console.error('SQL run:', e.message, sql.slice(0, 80)); throw e; }
}

module.exports = { getDb, all, get, run };
