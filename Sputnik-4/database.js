// ═══════════════════════════════════════════════════════════
// database.js — SQLite через better-sqlite3
//
// Преимущества перед sql.js:
//   • Нет ограничения на размер базы (sql.js грузил всё в RAM)
//   • Запись в файл напрямую, без export() на каждый INSERT
//   • В 10–100 раз быстрее на больших объёмах
//   • Поддерживает WAL-режим (Write-Ahead Logging)
//
// Установка: npm install better-sqlite3
// (один раз, в папке с server.js)
// ═══════════════════════════════════════════════════════════

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.error('\n❌ Не установлен better-sqlite3!');
  console.error('   Выполните: npm install better-sqlite3');
  console.error('   Затем перезапустите сервер.\n');
  process.exit(1);
}

const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, 'survey.db');
let _db = null;

async function getDb() {
  if (_db) return _db;

  _db = new Database(DB_PATH);

  // WAL-режим: параллельные чтения, быстрая запись, не блокирует файл
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS bases (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      lat REAL NOT NULL, lng REAL NOT NULL,
      description TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pgk_workers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      role TEXT, phone TEXT, base_id TEXT, machine_id TEXT,
      notes TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pgk_machinery (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      type TEXT, plate_number TEXT, base_id TEXT,
      status TEXT DEFAULT 'working', lat REAL, lng REAL,
      notes TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pgk_equipment (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      type TEXT, serial_number TEXT, base_id TEXT,
      status TEXT DEFAULT 'working',
      notes TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY, base_id TEXT NOT NULL,
      name TEXT NOT NULL, amount REAL DEFAULT 0,
      unit TEXT DEFAULT 'шт', min_amount REAL DEFAULT 0, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      client TEXT, contract_number TEXT,
      start_date TEXT, end_date TEXT, estimated_end TEXT,
      status TEXT DEFAULT 'active', completion_percent INTEGER DEFAULT 0,
      notes TEXT, address TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS site_bases (
      site_id TEXT NOT NULL, base_id TEXT NOT NULL,
      PRIMARY KEY(site_id, base_id)
    );
    CREATE TABLE IF NOT EXISTS progress_items (
      id TEXT PRIMARY KEY, site_id TEXT NOT NULL,
      work_type TEXT NOT NULL, completed REAL DEFAULT 0,
      total REAL DEFAULT 0, unit TEXT DEFAULT 'шт', notes TEXT
    );
    CREATE TABLE IF NOT EXISTS volumes (
      id TEXT PRIMARY KEY, site_id TEXT NOT NULL,
      category TEXT NOT NULL, name TEXT NOT NULL,
      amount REAL DEFAULT 0, unit TEXT DEFAULT 'шт',
      geojson TEXT, color TEXT DEFAULT '#1a56db', notes TEXT
    );
    CREATE TABLE IF NOT EXISTS kml_layers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      geojson TEXT NOT NULL, color TEXT DEFAULT '#1a56db',
      visible INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS kameral_reports (
      id TEXT PRIMARY KEY, site_id TEXT NOT NULL,
      specialist_name TEXT, specialist_role TEXT,
      completion_percent INTEGER DEFAULT 0,
      revision TEXT DEFAULT 'Р0',
      report_link TEXT, notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS kameral_remarks (
      id TEXT PRIMARY KEY, report_id TEXT NOT NULL,
      text TEXT NOT NULL, link TEXT,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY, site_id TEXT, base_id TEXT,
      action TEXT NOT NULL, details TEXT,
      user_name TEXT DEFAULT 'Система',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const ta = (sql) => { try { _db.exec(sql); } catch (e) {} };

  ta('ALTER TABLE pgk_workers ADD COLUMN machine_id TEXT');
  ta('ALTER TABLE pgk_workers ADD COLUMN base_id TEXT');
  ta('ALTER TABLE pgk_machinery ADD COLUMN base_id TEXT');
  ta('ALTER TABLE pgk_machinery ADD COLUMN lat REAL');
  ta('ALTER TABLE pgk_machinery ADD COLUMN lng REAL');
  ta('ALTER TABLE kml_layers ADD COLUMN visible INTEGER DEFAULT 1');
  ta('ALTER TABLE pgk_workers ADD COLUMN start_date TEXT');
  ta("CREATE TABLE IF NOT EXISTS vol_progress (id TEXT PRIMARY KEY, volume_id TEXT NOT NULL, site_id TEXT NOT NULL, work_date TEXT NOT NULL, completed REAL DEFAULT 0, notes TEXT DEFAULT '', geojson TEXT, created_at TEXT DEFAULT (datetime('now')))");
  ta("CREATE TABLE IF NOT EXISTS site_tasks (id TEXT PRIMARY KEY, site_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT DEFAULT '', responsible TEXT DEFAULT '', due_date TEXT, priority TEXT DEFAULT 'normal', status TEXT DEFAULT 'open', created_at TEXT DEFAULT (datetime('now')))");
  ta("ALTER TABLE volumes ADD COLUMN plan_start TEXT");
  ta("ALTER TABLE volumes ADD COLUMN plan_end TEXT");
  ta("ALTER TABLE volumes ADD COLUMN fill_opacity REAL DEFAULT 0.25");
  ta("ALTER TABLE progress_items ADD COLUMN volume_id TEXT");
  ta("ALTER TABLE progress_items ADD COLUMN work_date TEXT");
  ta("ALTER TABLE vol_progress ADD COLUMN geojson TEXT");
  ta("ALTER TABLE vol_progress ADD COLUMN worker_ids TEXT DEFAULT ''");
  ta("ALTER TABLE vol_progress ADD COLUMN drill_ids TEXT DEFAULT ''");
  ta("ALTER TABLE vol_progress ADD COLUMN act_date TEXT");
  ta("ALTER TABLE vol_progress ADD COLUMN machine_id TEXT");
  ta("ALTER TABLE vol_progress ADD COLUMN act_number TEXT DEFAULT ''");
  ta("ALTER TABLE vol_progress ADD COLUMN cell_color TEXT DEFAULT ''");
  ta("ALTER TABLE vol_progress ADD COLUMN row_type TEXT DEFAULT 'fact'");
  ta("ALTER TABLE site_tasks ADD COLUMN closed_by TEXT");
  ta("ALTER TABLE site_tasks ADD COLUMN closed_at TEXT");
  ta("ALTER TABLE kml_layers ADD COLUMN site_id TEXT");
  ta("ALTER TABLE pgk_workers ADD COLUMN status TEXT DEFAULT 'home'");
  ta("ALTER TABLE pgk_machinery ADD COLUMN vehicle_type TEXT");
  ta("ALTER TABLE pgk_machinery ADD COLUMN drill_id TEXT");
  ta("CREATE TABLE IF NOT EXISTS worker_shifts (id TEXT PRIMARY KEY, worker_id TEXT NOT NULL, base_id TEXT, start_date TEXT, end_date TEXT, days INTEGER DEFAULT 0, notes TEXT, created_at TEXT DEFAULT (datetime('now')))");
  ta("CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, filename TEXT NOT NULL, caption TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))");
  ta("ALTER TABLE photos ADD COLUMN entity_type TEXT");
  ta("ALTER TABLE photos ADD COLUMN entity_id TEXT");
  ta("ALTER TABLE photos ADD COLUMN filename TEXT");
  ta("CREATE TABLE IF NOT EXISTS backups (id TEXT PRIMARY KEY, filename TEXT NOT NULL, size INTEGER, created_at TEXT DEFAULT (datetime('now')))");
  ta("CREATE TABLE IF NOT EXISTS machine_moves (id TEXT PRIMARY KEY, machine_id TEXT NOT NULL, base_id TEXT, lat REAL, lng REAL, notes TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))");
  ta("ALTER TABLE pgk_equipment ADD COLUMN responsible TEXT DEFAULT ''");
  ta("CREATE TABLE IF NOT EXISTS materials_log (id TEXT PRIMARY KEY, material_id TEXT NOT NULL, base_id TEXT NOT NULL, prev_amount REAL DEFAULT 0, new_amount REAL DEFAULT 0, change_amount REAL DEFAULT 0, act_date TEXT, notes TEXT DEFAULT '', user_name TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))");
  ta("ALTER TABLE materials ADD COLUMN initial_amount REAL DEFAULT 0");
  ta("ALTER TABLE materials ADD COLUMN last_act_date TEXT");
  ta("ALTER TABLE materials ADD COLUMN category TEXT DEFAULT ''");
  ta(`CREATE TABLE IF NOT EXISTS global_tasks (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '',
    priority TEXT DEFAULT 'normal', category TEXT DEFAULT 'general',
    due_date TEXT, site_id TEXT, base_id TEXT, created_by TEXT DEFAULT '',
    status TEXT DEFAULT 'open', responsibles TEXT DEFAULT '[]',
    confirmations TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')),
    closed_at TEXT, notes TEXT DEFAULT ''
  )`);
  ta(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, recipient TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'task_assigned',
    title TEXT NOT NULL, body TEXT DEFAULT '',
    ref_id TEXT, ref_type TEXT DEFAULT 'gtask',
    is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
  )`);
  ta(`CREATE TABLE IF NOT EXISTS cargo_orders (
    id TEXT PRIMARY KEY, num TEXT NOT NULL, base_id TEXT,
    from_desc TEXT DEFAULT '', depart_date TEXT, eta_date TEXT,
    actual_arrive TEXT, status TEXT DEFAULT 'new',
    driver TEXT DEFAULT '', vehicle TEXT DEFAULT '',
    items TEXT DEFAULT '[]', total_weight REAL DEFAULT 0,
    notes TEXT DEFAULT '', created_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  ta("ALTER TABLE kml_layers ADD COLUMN symbol TEXT DEFAULT 'point'");
  ta("ALTER TABLE kml_layers ADD COLUMN group_id TEXT DEFAULT ''");
  ta("ALTER TABLE kml_layers ADD COLUMN line_dash TEXT DEFAULT 'solid'");
  ta("ALTER TABLE kml_layers ADD COLUMN min_zoom INTEGER DEFAULT 0");
  ta("ALTER TABLE kml_layers ADD COLUMN max_zoom INTEGER DEFAULT 20");
  ta("ALTER TABLE kml_layers ADD COLUMN size REAL DEFAULT 1");
  ta("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");

  return _db;
}

// ── API совместимый с sql.js ───────────────────────────────

function all(db, sql, p = []) {
  try {
    return db.prepare(sql).all(...p);
  } catch (e) {
    console.error('SQL all:', e.message, sql.slice(0, 80));
    return [];
  }
}

function get(db, sql, p = []) {
  try {
    return db.prepare(sql).get(...p) || null;
  } catch (e) {
    console.error('SQL get:', e.message, sql.slice(0, 80));
    return null;
  }
}

function run(db, sql, p = []) {
  try {
    db.prepare(sql).run(...p);
  } catch (e) {
    console.error('SQL run:', e.message);
    throw e;
  }
}

// saveDb — не нужен (better-sqlite3 пишет напрямую),
// оставлен как no-op для обратной совместимости
function saveDb() {}

module.exports = { getDb, all, get, run, saveDb };
