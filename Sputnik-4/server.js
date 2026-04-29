const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { v4: uuid } = require('uuid');
const { getDb, run, get } = require('./database');
const realtime = require('./routes/realtime');

// ── OPTIONAL MODULES ──────────────────────────────────────────────────────────
let demProcessor = null;
try { demProcessor = require('./dem-processor'); }
catch(e) { console.warn('dem-processor не загружен:', e.message); }

let upload = null;
try {
  const multer = require('multer');
  const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  upload = multer({
    storage: multer.diskStorage({
      destination: UPLOADS_DIR,
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, 'photo_' + Date.now() + '_' + Math.random().toString(36).slice(2) + ext);
      },
    }),
    limits: { fileSize: 15 * 1024 * 1024 },
  });
} catch(e) { console.warn('multer не установлен — загрузка фото отключена.'); }

// ── EXPRESS SETUP ──────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
// Глобальный лимит — 8 MB для обычных JSON запросов.
// Для KML/GeoJSON слоёв отдельный лимит 50 MB (применяется до глобального).
app.use('/api/layers', express.json({ limit: '50mb' }));
app.use('/api/sites', express.json({ limit: '50mb' }));
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── SHARED STATE ───────────────────────────────────────────────────────────────
let db;
const getDbInstance = () => db;

const L = (sid, bid, act, det, usr) => {
  try {
    run(db, 'INSERT INTO activity_log(id,site_id,base_id,action,details,user_name)VALUES(?,?,?,?,?,?)',
      [uuid(), sid || null, bid || null, act, det || '', usr || 'Система']);
  } catch(e) {}
};

// ── BACKUP ─────────────────────────────────────────────────────────────────────
const BACKUP_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

const BACKUP_DEFAULTS = { interval_hours: 2, max_count: 10 };
let autoBackupTimer = null;

function doBackup(destPath) {
  const DB_PATH  = path.join(__dirname, 'survey.db');
  const WAL_PATH = DB_PATH + '-wal';
  const SHM_PATH = DB_PATH + '-shm';
  try { run(db, 'PRAGMA wal_checkpoint(TRUNCATE)'); } catch(e) {}
  fs.copyFileSync(DB_PATH, destPath);
  const walSize = fs.existsSync(WAL_PATH) ? fs.statSync(WAL_PATH).size : 0;
  if (walSize > 32) {
    try { fs.copyFileSync(WAL_PATH, destPath + '-wal'); } catch(e) {}
    try { fs.copyFileSync(SHM_PATH, destPath + '-shm'); } catch(e) {}
  }
  return fs.statSync(destPath).size;
}

function getBackupSettings() {
  let h = BACKUP_DEFAULTS.interval_hours;
  let m = BACKUP_DEFAULTS.max_count;
  try {
    const r1 = get(db, "SELECT value FROM app_settings WHERE key='backup_interval_hours'");
    if (r1 && r1.value) { const v = parseFloat(r1.value); if (v > 0) h = v; }
    const r2 = get(db, "SELECT value FROM app_settings WHERE key='backup_max_count'");
    if (r2 && r2.value) { const v = parseInt(r2.value); if (v > 0) m = v; }
  } catch (e) {}
  return { interval_hours: h, max_count: m };
}

function setBackupSettings({ interval_hours, max_count }) {
  if (interval_hours != null) {
    run(db, "INSERT INTO app_settings(key,value) VALUES('backup_interval_hours',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [String(interval_hours)]);
  }
  if (max_count != null) {
    run(db, "INSERT INTO app_settings(key,value) VALUES('backup_max_count',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [String(max_count)]);
  }
  scheduleAutoBackup();
}

function rotateAutoBackups(maxCount) {
  const autoFiles = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup_auto_') && f.endsWith('.db'))
    .map(f => ({ f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
    .sort((a, b) => a.mtime - b.mtime);
  while (autoFiles.length > maxCount) {
    const old = autoFiles.shift().f;
    try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch(e) {}
    try { fs.unlinkSync(path.join(BACKUP_DIR, old + '-wal')); } catch(e) {}
    try { fs.unlinkSync(path.join(BACKUP_DIR, old + '-shm')); } catch(e) {}
  }
}

function performAutoBackup() {
  try {
    const DB_PATH = path.join(__dirname, 'survey.db');
    if (!fs.existsSync(DB_PATH)) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fname = `backup_auto_${ts}.db`;
    const dest  = path.join(BACKUP_DIR, fname);
    const size  = doBackup(dest);
    const { max_count } = getBackupSettings();
    rotateAutoBackups(max_count);
    console.log(`  📦  Автобэкап: ${fname} (${(size / 1024).toFixed(0)} КБ, max=${max_count})`);
  } catch (e) { console.warn('Auto-backup failed:', e.message); }
}

function scheduleAutoBackup() {
  if (autoBackupTimer) { clearInterval(autoBackupTimer); autoBackupTimer = null; }
  const { interval_hours } = getBackupSettings();
  if (interval_hours <= 0) { console.log('  ⏸  Автобэкап отключён (interval=0)'); return; }
  const ms = interval_hours * 3600 * 1000;
  autoBackupTimer = setInterval(performAutoBackup, ms);
  console.log(`  ⏱  Автобэкап каждые ${interval_hours} ч`);
}

// ── ROUTES ─────────────────────────────────────────────────────────────────────
const routeBases = require('./routes/bases');
const routeSites = require('./routes/sites');
const routePgk   = require('./routes/pgk');
const routeCargo = require('./routes/cargo');
const routeTasks = require('./routes/tasks');
const routeMisc  = require('./routes/misc');

// ── START ──────────────────────────────────────────────────────────────────────
getDb().then(database => {
  db = database;

  // SSE + Undo инфраструктура (middleware транслирует все мутации)
  realtime.attachSse(app);
  realtime.attachUndo(app, getDbInstance);

  routeBases(app, getDbInstance, L);
  routeSites(app, getDbInstance, L);
  routePgk  (app, getDbInstance, L);
  routeCargo(app, getDbInstance, L);
  routeTasks(app, getDbInstance, L);
  routeMisc (app, getDbInstance, L, {
    upload, demProcessor, BACKUP_DIR, doBackup,
    getBackupSettings, setBackupSettings, performAutoBackup,
  });

  app.listen(PORT, () => {
    console.log(`\n  ✅  ПурГеоКом запущен: http://localhost:${PORT}\n`);
    try { require('child_process').exec(`start http://localhost:${PORT}`); } catch(e) {}
  });

  // Запустить периодический автобэкап и сделать первый через 3 секунды (если бэкапов ещё нет)
  scheduleAutoBackup();
  setTimeout(() => {
    try {
      const hasAuto = fs.readdirSync(BACKUP_DIR).some(f => f.startsWith('backup_auto_') && f.endsWith('.db'));
      if (!hasAuto) performAutoBackup();
    } catch(e) {}
  }, 3000);

}).catch(err => console.error('Ошибка запуска:', err));
