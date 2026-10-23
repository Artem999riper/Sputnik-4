// Общие помощники автотестов: запуск сервера на ВРЕМЕННОЙ базе, загрузка
// браузерных скриптов в песочницу Node, HTTP-запросы к API.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

function freePort() {
  return new Promise((res, rej) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
}
// Сервер с пустой временной базой; рабочая survey.db и бэкапы не затрагиваются
async function startServer() {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgk_test_'));
  const env = { ...process.env, PORT: String(port), PGK_DB: path.join(dir, 'test.db'), PGK_BACKUP_DIR: path.join(dir, 'backups'), PGK_NO_BROWSER: '1' };
  fs.mkdirSync(env.PGK_BACKUP_DIR);
  const proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; proc.stdout.on('data', d => { log += d; }); proc.stderr.on('data', d => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(base + '/api/version'); if (r.ok) break; } catch (e) {}
    await new Promise(r => setTimeout(r, 150));
    if (i === 99) { proc.kill(); throw new Error('Сервер не запустился:\n' + log); }
  }
  const api = async (method, url, body, headers) => {
    const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(headers || {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { j = t; }
    return { status: r.status, body: j };
  };
  const stop = () => new Promise(res => { proc.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} res(); }); proc.kill(); });
  return { base, port, api, stop, log: () => log, dir };
}
// Браузерные скрипты (public/js) — в песочницу с заглушками DOM
function loadBrowser(files, extra) {
  const noop = () => {};
  const el = () => null;
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, TextEncoder, TextDecoder, URLSearchParams,
    document: { addEventListener: noop, getElementById: el, querySelector: el, querySelectorAll: () => [], createElement: () => ({ style: {}, appendChild: noop, addEventListener: noop }), body: { appendChild: noop } },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    esc: s => String(s == null ? '' : s), escAttr: s => String(s == null ? '' : s), toast: noop,
    location: { origin: 'http://localhost:3000', hash: '' }, addEventListener: noop, fetch: async () => ({ ok: false, json: async () => ({}) }),
    ...(extra || {}),
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { ctx, get: name => vm.runInContext(name, ctx) };
}
module.exports = { ROOT, startServer, loadBrowser };
