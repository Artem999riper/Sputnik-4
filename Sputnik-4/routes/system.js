// ═══════════════════════════════════════════════════════════
// routes/system.js — версия программы, перезапуск и обновление
//  • /api/server-info      — версия, сборка, «сервер устарел?» (код на диске новее запущенного)
//  • /api/admin/restart    — перезапуск (работает, если сервер запущен через start.bat / server-loop.bat)
//  • /api/admin/update/*   — обновление из git (pull) или из .zip-архива, с копией кода для отката
// ═══════════════════════════════════════════════════════════
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const STARTED_AT = new Date().toISOString();
// Не трогаем при обновлении и не кладём в копию кода
const KEEP = new Set(['survey.db', 'survey.db-journal', 'survey.db-wal', 'survey.db-shm', 'backups', 'node_modules', '.git', 'uploads']);

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; } }
function appVersion() { return readJson(path.join(ROOT, 'package.json')).version || '0.0.0'; }

// Папка .git — в папке программы или выше (программа может лежать подпапкой репозитория)
function gitDir() {
  let d = ROOT;
  for (let i = 0; i < 3; i++) { const g = path.join(d, '.git'); if (fs.existsSync(g)) return g; d = path.dirname(d); }
  return null;
}
// Коммит git без самого git: читаем .git/HEAD → ref → хэш
function gitCommit() {
  try {
    const gd = gitDir(); if (!gd) return { commit: '', branch: '' };
    const head = fs.readFileSync(path.join(gd, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return { commit: head.slice(0, 7), branch: '' };
    const ref = head.slice(5).trim();
    let sha = '';
    const rp = path.join(gd, ref);
    if (fs.existsSync(rp)) sha = fs.readFileSync(rp, 'utf8').trim();
    else {
      const packed = fs.readFileSync(path.join(gd, 'packed-refs'), 'utf8');
      const line = packed.split('\n').find(l => l.endsWith(' ' + ref));
      if (line) sha = line.split(' ')[0];
    }
    return { commit: sha.slice(0, 7), branch: ref.replace('refs/heads/', '') };
  } catch (e) { return { commit: '', branch: '' }; }
}

// Хэш содержимого файлов — чтобы понять, что код на диске поменялся
function listFiles(dir, re, out = []) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isFile() && re.test(e.name)) out.push(p);
  }
  return out;
}
function hashFiles(files) {
  const h = crypto.createHash('sha1');
  files.sort().forEach(f => { try { h.update(f.replace(ROOT, '')); h.update(fs.readFileSync(f)); } catch (e) {} });
  return h.digest('hex').slice(0, 10);
}
const serverFiles = () => [...listFiles(ROOT, /\.(js|json)$/), ...listFiles(path.join(ROOT, 'routes'), /\.js$/)]
  .filter(f => !/package-lock\.json$/.test(f));
const clientFiles = () => [path.join(ROOT, 'public', 'index.html'),
  ...listFiles(path.join(ROOT, 'public', 'js'), /\.js$/), ...listFiles(path.join(ROOT, 'public', 'css'), /\.css$/)];
const BOOT_HASH = hashFiles(serverFiles());
let _cache = { t: 0, server: BOOT_HASH, client: '' };
function currentHashes() {
  if (Date.now() - _cache.t > 5000) _cache = { t: Date.now(), server: hashFiles(serverFiles()), client: hashFiles(clientFiles()) };
  return _cache;
}

function run(cmd, args, opts = {}) {
  return new Promise(resolve => {
    execFile(cmd, args, { cwd: ROOT, timeout: opts.timeout || 120000, maxBuffer: 8 * 1024 * 1024, shell: process.platform === 'win32' && cmd === 'npm', windowsHide: true },
      (err, stdout, stderr) => resolve({ ok: !err, code: err ? (err.code || 1) : 0, out: String(stdout || ''), err: String(stderr || (err && err.message) || '') }));
  });
}
const npmCmd = () => process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Копия текущего кода (без БД, бэкапов, node_modules) — для отката
function codeSnapshot(BACKUP_DIR, label) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (KEEP.has(e.name) && (rel === '' || e.name === 'uploads')) continue;
      const p = path.join(dir, e.name), r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (e.isFile()) zip.addLocalFile(p, rel || '');
    }
  };
  walk(ROOT, '');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = `code_${label}_${ts}.zip`;
  zip.writeZip(path.join(BACKUP_DIR, name));
  return name;
}

// Копирование распакованной версии поверх текущей (кроме БД/бэкапов/node_modules/uploads)
function copyOver(srcRoot) {
  let n = 0;
  const walk = (src, dst, rel) => {
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      if (rel === '' && KEEP.has(e.name)) continue;
      if (e.name === 'uploads' && rel === 'public') continue;
      const s = path.join(src, e.name), d = path.join(dst, e.name);
      if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); walk(s, d, rel ? rel + '/' + e.name : e.name); }
      else if (e.isFile()) { fs.copyFileSync(s, d); n++; }
    }
  };
  walk(srcRoot, ROOT, '');
  return n;
}
// В архиве ищем папку, где лежат server.js и package.json (архив GitHub кладёт всё в подпапку)
function findRoot(dir, depth = 0) {
  if (fs.existsSync(path.join(dir, 'server.js')) && fs.existsSync(path.join(dir, 'package.json'))) return dir;
  if (depth > 3) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { const r = findRoot(path.join(dir, e.name), depth + 1); if (r) return r; }
  }
  return null;
}
const depsOf = p => JSON.stringify((readJson(p).dependencies) || {});

module.exports = (app, { isAdmin, BACKUP_DIR, performAutoBackup }) => {
  const admin = (req, res) => { if (isAdmin(req)) return true; res.status(403).json({ error: 'Только для админа' }); return false; };
  const canRestart = () => process.env.PGK_LOOP === '1';
  const restartSoon = () => {
    try { fs.writeFileSync(path.join(BACKUP_DIR, '.restart'), STARTED_AT); } catch (e) {}
    setTimeout(() => process.exit(0), 600);
  };

  app.get('/api/version', (req, res) => {
    const h = currentHashes(), g = gitCommit();
    res.json({
      version: appVersion(), commit: g.commit, branch: g.branch, startedAt: STARTED_AT,
      serverBuild: BOOT_HASH, diskBuild: h.server, clientBuild: h.client,
      needRestart: h.server !== BOOT_HASH, canRestart: canRestart(), node: process.version,
      git: !!gitDir(),
    });
  });

  app.post('/api/admin/restart', (req, res) => {
    if (!admin(req, res)) return;
    if (!canRestart()) return res.status(400).json({ error: 'Сервер запущен не через start.bat — закройте окно сервера и запустите start.bat заново' });
    res.json({ ok: true });
    console.log('  🔄  Перезапуск по запросу администратора…');
    restartSoon();
  });

  // ── git ────────────────────────────────────────────────────
  app.get('/api/admin/update/check', async (req, res) => {
    if (!admin(req, res)) return;
    if (!gitDir()) return res.json({ git: false });
    const f = await run('git', ['fetch', '--quiet'], { timeout: 60000 });
    if (!f.ok) return res.json({ git: true, error: 'git fetch: ' + (f.err || f.out).trim().slice(0, 300) });
    const c = await run('git', ['rev-list', '--count', 'HEAD..@{u}']);
    const l = await run('git', ['log', '--pretty=format:%h %ad %s', '--date=short', 'HEAD..@{u}', '-n', '30']);
    res.json({ git: true, behind: parseInt(c.out, 10) || 0, log: l.out.split('\n').filter(Boolean) });
  });

  app.post('/api/admin/update/git', async (req, res) => {
    if (!admin(req, res)) return;
    try { if (performAutoBackup) await performAutoBackup(); } catch (e) {}
    let snap = ''; try { snap = codeSnapshot(BACKUP_DIR, 'before_git'); } catch (e) {}
    const before = depsOf(path.join(ROOT, 'package.json'));
    const p = await run('git', ['pull', '--ff-only'], { timeout: 120000 });
    if (!p.ok) return res.status(500).json({ error: 'git pull: ' + (p.err || p.out).trim().slice(0, 500) });
    let npm = null;
    if (depsOf(path.join(ROOT, 'package.json')) !== before) npm = await run(npmCmd(), ['install', '--no-audit', '--no-fund'], { timeout: 600000 });
    res.json({ ok: true, out: p.out.trim().slice(-800), npm: npm ? (npm.ok ? 'установлены' : 'ошибка: ' + npm.err.slice(0, 300)) : null, snapshot: snap, restarting: canRestart() });
    if (canRestart()) restartSoon();
  });

  // ── zip ────────────────────────────────────────────────────
  let upload = null;
  try {
    const multer = require('multer');
    upload = multer({ dest: path.join(os.tmpdir(), 'pgk_update'), limits: { fileSize: 400 * 1024 * 1024 } });
  } catch (e) {}
  app.post('/api/admin/update/zip', (req, res, next) => {
    if (!admin(req, res)) return;
    if (!upload) return res.status(500).json({ error: 'multer не установлен' });
    upload.single('file')(req, res, async err => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pgk_upd_'));
      try {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(req.file.path);
        // защита от путей вида ../../ в архиве
        for (const en of zip.getEntries()) {
          const target = path.resolve(tmp, en.entryName);
          if (!target.startsWith(path.resolve(tmp) + path.sep) && target !== path.resolve(tmp)) throw new Error('Недопустимый путь в архиве: ' + en.entryName);
        }
        zip.extractAllTo(tmp, true);
        const root = findRoot(tmp);
        if (!root) throw new Error('В архиве не найдена программа (нет server.js и package.json)');
        try { if (performAutoBackup) await performAutoBackup(); } catch (e) {}
        const snap = codeSnapshot(BACKUP_DIR, 'before_zip');
        const before = depsOf(path.join(ROOT, 'package.json'));
        const n = copyOver(root);
        let npm = null;
        if (depsOf(path.join(ROOT, 'package.json')) !== before) npm = await run(npmCmd(), ['install', '--no-audit', '--no-fund'], { timeout: 600000 });
        res.json({ ok: true, files: n, version: appVersion(), snapshot: snap, npm: npm ? (npm.ok ? 'установлены' : 'ошибка: ' + npm.err.slice(0, 300)) : null, restarting: canRestart() });
        if (canRestart()) restartSoon();
      } catch (e) {
        res.status(400).json({ error: e.message });
      } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
    });
  });

  // ── откат на сохранённую копию кода ────────────────────────
  app.get('/api/admin/update/snapshots', (req, res) => {
    if (!admin(req, res)) return;
    let list = [];
    try {
      list = fs.readdirSync(BACKUP_DIR).filter(f => /^code_.*\.zip$/.test(f))
        .map(f => ({ name: f, size: fs.statSync(path.join(BACKUP_DIR, f)).size, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
        .sort((a, b) => b.mtime - a.mtime).slice(0, 20);
    } catch (e) {}
    res.json(list);
  });
  app.post('/api/admin/update/rollback', async (req, res) => {
    if (!admin(req, res)) return;
    const name = String((req.body || {}).name || '');
    if (!/^code_[\w-]+\.zip$/.test(name)) return res.status(400).json({ error: 'Неверное имя копии' });
    const p = path.join(BACKUP_DIR, name);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'Копия не найдена' });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pgk_rb_'));
    try {
      const AdmZip = require('adm-zip');
      new AdmZip(p).extractAllTo(tmp, true);
      const snap = codeSnapshot(BACKUP_DIR, 'before_rollback');
      const before = depsOf(path.join(ROOT, 'package.json'));
      const n = copyOver(tmp);
      let npm = null;
      if (depsOf(path.join(ROOT, 'package.json')) !== before) npm = await run(npmCmd(), ['install', '--no-audit', '--no-fund'], { timeout: 600000 });
      res.json({ ok: true, files: n, snapshot: snap, npm: npm ? (npm.ok ? 'установлены' : 'ошибка') : null, restarting: canRestart() });
      if (canRestart()) restartSoon();
    } catch (e) { res.status(500).json({ error: e.message }); }
    finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }
  });
};
module.exports.BOOT_HASH = BOOT_HASH;
