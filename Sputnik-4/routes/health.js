// ═══════════════════════════════════════════════════════════
// routes/health.js — здоровье программы для админа:
//   • журнал ошибок: ошибки сервера (маршруты API, необработанные исключения)
//     и браузеров пользователей — с временем, именем, адресом страницы;
//   • проверка базы: целостность SQLite и «битые» ссылки (сотрудник на
//     удалённой базе, факт удалённого объёма…) — при запуске и по кнопке,
//     с исправлением (перед исправлением — резервная копия).
// ═══════════════════════════════════════════════════════════
const { v4: uuid } = require('uuid');
const path = require('path');
const { all, get, run } = require('../database');
const { wrap } = require('./validate');

let _getDb = null;
const MAX_ROWS = 3000;
const _seen = new Map();   // ключ ошибки → время последней записи (не плодить одинаковые)
function _ensure(d) {
  d.exec(`CREATE TABLE IF NOT EXISTS error_log (id TEXT PRIMARY KEY, at TEXT NOT NULL, source TEXT NOT NULL, user_name TEXT DEFAULT '',
    message TEXT NOT NULL, stack TEXT DEFAULT '', url TEXT DEFAULT '', agent TEXT DEFAULT '', count INTEGER DEFAULT 1, last_at TEXT)`);
}
// Записать ошибку. source: 'server' | 'client'. Одинаковые за 10 минут — счётчик, а не новая строка.
function logError(source, message, o = {}) {
  try {
    const d = _getDb && _getDb(); if (!d) return;
    _ensure(d);
    const msg = String(message || 'Ошибка').slice(0, 1000), now = new Date().toISOString();
    const key = source + '|' + msg + '|' + (o.url || '');
    const prev = _seen.get(key);
    if (prev && Date.now() - prev.t < 600000) {
      run(d, 'UPDATE error_log SET count=count+1, last_at=? WHERE id=?', [now, prev.id]);
      prev.t = Date.now(); return;
    }
    const id = uuid();
    run(d, 'INSERT INTO error_log(id,at,source,user_name,message,stack,url,agent,last_at) VALUES(?,?,?,?,?,?,?,?,?)',
      [id, now, source, String(o.user || '').slice(0, 100), msg, String(o.stack || '').slice(0, 6000), String(o.url || '').slice(0, 500), String(o.agent || '').slice(0, 300), now]);
    _seen.set(key, { id, t: Date.now() });
    if (_seen.size > 500) _seen.delete(_seen.keys().next().value);
    const n = (get(d, 'SELECT COUNT(*) n FROM error_log') || {}).n || 0;
    if (n > MAX_ROWS) run(d, 'DELETE FROM error_log WHERE id IN (SELECT id FROM error_log ORDER BY at LIMIT ?)', [n - MAX_ROWS]);
  } catch (e) { /* журнал ошибок не должен ронять программу */ }
}
const _user = req => { try { return decodeURIComponent(req.get('X-User-Name') || ''); } catch (e) { return ''; } };

// ── Проверка ссылок: [ключ, что не так, таблица, поле, на что ссылается, исправление] ──
// fix: 'null' — очистить ссылку; 'delete' — удалить «сиротскую» запись
const REFS = [
  ['worker_base', 'Сотрудник числится на удалённой базе', 'pgk_workers', 'base_id', 'bases', 'null'],
  ['worker_mach', 'Сотрудник закреплён за удалённой техникой', 'pgk_workers', 'machine_id', 'pgk_machinery', 'null'],
  ['mach_base', 'Техника на удалённой базе', 'pgk_machinery', 'base_id', 'bases', 'null'],
  ['mach_driver', 'У техники водитель — удалённый сотрудник', 'pgk_machinery', 'driver_id', 'pgk_workers', 'null'],
  ['eq_base', 'Оборудование на удалённой базе', 'pgk_equipment', 'base_id', 'bases', 'null'],
  ['eq_site', 'Оборудование на удалённом объекте', 'pgk_equipment', 'site_id', 'sites', 'null'],
  ['eq_group', 'Оборудование в удалённой группе', 'pgk_equipment', 'group_id', 'equipment_groups', 'null'],
  ['mat_base', 'Материалы удалённой базы', 'materials', 'base_id', 'bases', 'delete'],
  ['sb_site', 'Связь «объект — база» с удалённым объектом', 'site_bases', 'site_id', 'sites', 'delete'],
  ['sb_base', 'Связь «объект — база» с удалённой базой', 'site_bases', 'base_id', 'bases', 'delete'],
  ['vol_site', 'Объём удалённого объекта', 'volumes', 'site_id', 'sites', 'delete'],
  ['vol_layer', 'Объём ссылается на удалённый слой', 'volumes', 'layer_id', 'kml_layers', 'null'],
  ['vp_vol', 'Выполнение удалённого объёма', 'vol_progress', 'volume_id', 'volumes', 'delete'],
  ['shift_worker', 'Вахта удалённого сотрудника', 'worker_shifts', 'worker_id', 'pgk_workers', 'delete'],
  ['shift_base', 'Вахта на удалённой базе', 'worker_shifts', 'base_id', 'bases', 'null'],
  ['layer_site', 'Слой удалённого объекта', 'kml_layers', 'site_id', 'sites', 'delete'],
  ['task_site', 'Задача удалённого объекта', 'site_tasks', 'site_id', 'sites', 'delete'],
  ['brm_worker', 'В бригаде — удалённый сотрудник', 'pgk_brigade_members', 'worker_id', 'pgk_workers', 'delete'],
  ['brm_brig', 'Состав удалённой бригады', 'pgk_brigade_members', 'brigade_id', 'pgk_brigades', 'delete'],
  ['brb_base', 'Бригада на удалённой базе', 'pgk_brigade_bases', 'base_id', 'bases', 'delete'],
  ['brs_site', 'Бригада на удалённом объекте', 'pgk_brigade_sites', 'site_id', 'sites', 'delete'],
  ['fb_vol', 'Полевая скважина ссылается на удалённый объём', 'field_boreholes', 'volume_id', 'volumes', 'null'],
];
const _cols = (d, t) => { try { return d.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name); } catch (e) { return []; } };
const _has = (d, t, c) => _cols(d, t).includes(c);
function _orphanSql(t, c, ref) { return `FROM ${t} WHERE ${c} IS NOT NULL AND ${c}<>'' AND ${c} NOT IN (SELECT id FROM ${ref})`; }
function dbCheck(d) {
  const res = { at: new Date().toISOString(), integrity: 'ok', issues: [] };
  try {
    const r = d.prepare('PRAGMA integrity_check').all().map(x => Object.values(x)[0]);
    res.integrity = r.length === 1 && r[0] === 'ok' ? 'ok' : r.slice(0, 20).join('; ');
  } catch (e) { res.integrity = 'не удалось проверить: ' + e.message; }
  for (const [key, label, t, c, ref, fix] of REFS) {
    if (!_has(d, t, c) || !_cols(d, ref).includes('id')) continue;
    const n = (get(d, `SELECT COUNT(*) n ${_orphanSql(t, c, ref)}`) || {}).n || 0;
    if (!n) continue;
    const nameCol = _cols(d, t).includes('name') ? 'name' : null;
    const sample = nameCol ? all(d, `SELECT ${nameCol} AS name ${_orphanSql(t, c, ref)} LIMIT 5`).map(x => x.name).filter(Boolean) : [];
    res.issues.push({ key, label, table: t, count: n, fix, sample });
  }
  return res;
}
function dbFix(d, keys) {
  let fixed = 0;
  const tx = d.transaction(() => {
    for (const [key, , t, c, ref, fix] of REFS) {
      if (keys && !keys.includes(key)) continue;
      if (!_has(d, t, c) || !_cols(d, ref).includes('id')) continue;
      const info = fix === 'delete' ? d.prepare(`DELETE ${_orphanSql(t, c, ref)}`).run() : d.prepare(`UPDATE ${t} SET ${c}=NULL WHERE ${c} IS NOT NULL AND ${c}<>'' AND ${c} NOT IN (SELECT id FROM ${ref})`).run();
      fixed += info.changes || 0;
    }
  });
  tx();
  return fixed;
}

module.exports = (app, getDb, { isAdmin, BACKUP_DIR, broadcast }) => {
  _getDb = getDb;
  const db = () => { const d = getDb(); _ensure(d); return d; };
  const admin = (req, res) => { if (isAdmin(req)) return true; res.status(403).json({ error: 'Только для админа' }); return false; };
  const save = r => run(db(), "INSERT OR REPLACE INTO app_settings(key,value) VALUES('dbcheck_last',?)", [JSON.stringify(r)]);

  // ── ошибки из браузеров (не чаще 30 в минуту с одного клиента) ──
  const rate = new Map();
  app.post('/api/client-errors', (req, res) => {
    const cid = req.get('X-Client-Id') || req.ip, now = Date.now();
    const r = rate.get(cid) || { t: now, n: 0 }; if (now - r.t > 60000) { r.t = now; r.n = 0; }
    r.n++; rate.set(cid, r);
    if (r.n <= 30) {
      const b = req.body || {};
      logError('client', b.message, { stack: b.stack, url: b.url, user: _user(req), agent: req.get('User-Agent') });
    }
    res.json({ ok: true });
  });
  app.get('/api/admin/errors', wrap((req, res) => {
    if (!admin(req, res)) return;
    const q = req.query, where = [], p = [];
    if (q.source) { where.push('source=?'); p.push(q.source); }
    if (q.q) { where.push('(message LIKE ? OR user_name LIKE ? OR url LIKE ?)'); p.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`); }
    const rows = all(db(), `SELECT * FROM error_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY COALESCE(last_at,at) DESC LIMIT 500`, p);
    const day = new Date(Date.now() - 864e5).toISOString();
    res.json({ rows, last24: (get(db(), 'SELECT COUNT(*) n FROM error_log WHERE COALESCE(last_at,at) >= ?', [day]) || {}).n || 0 });
  }));
  app.delete('/api/admin/errors', wrap((req, res) => {
    if (!admin(req, res)) return;
    run(db(), 'DELETE FROM error_log'); _seen.clear();
    res.json({ ok: true });
  }));

  // ── проверка базы ──
  app.get('/api/admin/dbcheck', wrap((req, res) => {
    if (!admin(req, res)) return;
    if (req.query.run) { const r = dbCheck(db()); save(r); return res.json(r); }
    const row = get(db(), "SELECT value FROM app_settings WHERE key='dbcheck_last'");
    let r = null; try { r = row ? JSON.parse(row.value) : null; } catch (e) {}
    res.json(r || dbCheck(db()));
  }));
  app.post('/api/admin/dbcheck/fix', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const keys = Array.isArray(req.body && req.body.keys) ? req.body.keys : null;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backup = `backup_before_dbfix_${ts}.db`;
    try { await getDb().backup(path.join(BACKUP_DIR, backup)); }
    catch (e) { return res.status(500).json({ error: 'Не удалось сделать резервную копию — исправление отменено: ' + e.message }); }
    const fixed = dbFix(db(), keys);
    const r = dbCheck(db()); save(r);
    broadcast({ type: 'change', path: '/api/admin/dbcheck' });
    res.json({ fixed, backup, check: r });
  }));

  // ── Сотрудники: очистить список — остаются ФИО и должность, статус «Дома» ──
  // Удаляются все вахты (и плановые), снимаются база, техника, дата заезда, примечания.
  // Перед этим — резервная копия базы.
  app.post('/api/admin/workers-reset', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const keepFired = !(req.body && req.body.fired);   // по умолчанию уволенные остаются уволенными
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backup = `backup_before_workers_reset_${ts}.db`;
    try { await getDb().backup(path.join(BACKUP_DIR, backup)); }
    catch (e) { return res.status(500).json({ error: 'Не удалось сделать резервную копию — очистка отменена: ' + e.message }); }
    const d = db(); let n = 0, sh = 0;
    d.transaction(() => {
      sh = d.prepare('DELETE FROM worker_shifts').run().changes;
      n = d.prepare(`UPDATE pgk_workers SET start_date=NULL, base_id=NULL, machine_id=NULL, notes='',
        status=CASE WHEN ? AND status='fired' THEN 'fired' ELSE 'home' END`).run(keepFired ? 1 : 0).changes;
    })();
    broadcast({ type: 'change', path: '/api/pgk/workers' });
    res.json({ ok: true, workers: n, shifts: sh, backup });
  }));

  // проверка при запуске (через 5 с, чтобы не задерживать старт)
  setTimeout(() => {
    try {
      const r = dbCheck(db()); save(r);
      const n = r.issues.reduce((s, x) => s + x.count, 0);
      if (r.integrity !== 'ok' || n) console.log(`  🩺  Проверка базы: ${r.integrity !== 'ok' ? 'ЦЕЛОСТНОСТЬ НАРУШЕНА; ' : ''}битых ссылок: ${n} — Администрирование → «🩺 Проверка базы»`);
      else console.log('  🩺  Проверка базы: всё в порядке');
    } catch (e) { logError('server', 'Проверка базы: ' + e.message, { stack: e.stack }); }
  }, 5000);
};
module.exports.logError = logError;
module.exports.dbCheck = dbCheck;
module.exports.dbFix = dbFix;
