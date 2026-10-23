// ═══════════════════════════════════════════════════════════
// routes/audit.js — журнал изменений с откатом.
// Промежуточный обработчик запоминает для основных записей (сотрудники,
// техника, оборудование, материалы, МТО, груз, задачи, объекты, базы,
// объёмы, слои): кто, когда и что изменил — прежние и новые значения
// изменённых полей, удалённую запись целиком, созданную запись.
// Администратор может откатить любое изменение.
// ═══════════════════════════════════════════════════════════
const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');
const { wrap } = require('./validate');

// Записи по адресу запроса: таблица, подпись раздела, поле-название
const ROW = [
  [/^\/api\/pgk\/workers\/([^/]+)(\/status)?$/, 'pgk_workers', 'Сотрудник', 'name'],
  [/^\/api\/pgk\/machinery\/([^/]+)$/, 'pgk_machinery', 'Техника', 'name'],
  [/^\/api\/pgk\/equipment\/([^/]+)(\/group)?$/, 'pgk_equipment', 'Оборудование', 'name'],
  [/^\/api\/materials\/([^/]+)$/, 'materials', 'Материал', 'name'],
  [/^\/api\/mto\/([^/]+)$/, 'mto_items', 'МТО', 'name'],
  [/^\/api\/cargo\/([^/]+)$/, 'cargo_orders', 'Груз', 'num'],
  [/^\/api\/gtasks\/([^/]+)$/, 'global_tasks', 'Задача', 'title'],
  [/^\/api\/sites\/([^/]+)$/, 'sites', 'Объект', 'name'],
  [/^\/api\/bases\/([^/]+)$/, 'bases', 'База', 'name'],
  [/^\/api\/volumes\/([^/]+)$/, 'volumes', 'Объём', 'name'],
  [/^\/api\/layers\/([^/]+)(\/visible)?$/, 'kml_layers', 'Слой', 'name'],
];
const CREATE = [
  [/^\/api\/pgk\/workers$/, 'pgk_workers', 'Сотрудник', 'name'],
  [/^\/api\/pgk\/machinery$/, 'pgk_machinery', 'Техника', 'name'],
  [/^\/api\/pgk\/equipment$/, 'pgk_equipment', 'Оборудование', 'name'],
  [/^\/api\/bases\/[^/]+\/materials$/, 'materials', 'Материал', 'name'],
  [/^\/api\/mto$/, 'mto_items', 'МТО', 'name'],
  [/^\/api\/cargo$/, 'cargo_orders', 'Груз', 'num'],
  [/^\/api\/gtasks$/, 'global_tasks', 'Задача', 'title'],
  [/^\/api\/sites$/, 'sites', 'Объект', 'name'],
  [/^\/api\/bases$/, 'bases', 'База', 'name'],
  [/^\/api\/layers$/, 'kml_layers', 'Слой', 'name'],
];
const TABLES = new Set(ROW.map(r => r[1]));
const MAX_CELL = 3 * 1024 * 1024;   // поле больше 3 МБ (огромный слой) — не храним целиком

module.exports = (app, getDb, { isAdmin, broadcast, restoreFromData, trashAndDelete }) => {
  const db = () => getDb();
  try {
    db().exec(`CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, at TEXT DEFAULT (datetime('now','localtime')),
      user_name TEXT DEFAULT '', kind TEXT, tbl TEXT, row_id TEXT, label TEXT, name TEXT, before TEXT, after TEXT, undone INTEGER DEFAULT 0)`);
    db().exec('CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at)');
  } catch (e) {}
  const uname = req => { let n = req.get('X-User-Name') || ''; try { n = decodeURIComponent(n); } catch (e) {} return n.slice(0, 120) || (req.body && req.body.user_name) || ''; };
  const save = (o) => {
    try {
      run(db(), 'INSERT INTO audit_log(id,user_name,kind,tbl,row_id,label,name,before,after)VALUES(?,?,?,?,?,?,?,?,?)',
        [uuid(), o.user || '', o.kind, o.tbl, o.row_id, o.label, String(o.name || '').slice(0, 200), o.before ? JSON.stringify(o.before) : null, o.after ? JSON.stringify(o.after) : null]);
      if (Math.random() < 0.02) run(db(), "DELETE FROM audit_log WHERE at < datetime('now','localtime','-120 days')");
    } catch (e) {}
  };
  const clip = row => { const o = {}; for (const k of Object.keys(row || {})) { const v = row[k]; o[k] = (typeof v === 'string' && v.length > MAX_CELL) ? '[слишком большое значение не сохранено]' : v; } return o; };

  // ── запись изменений ─────────────────────────────────────
  app.use((req, res, next) => {
    const m = req.method;
    if (m !== 'PUT' && m !== 'PATCH' && m !== 'DELETE' && m !== 'POST') return next();
    const p = req.path;
    let rule = null, id = null, kind = null;
    if (m === 'POST') { rule = CREATE.find(r => r[0].test(p)); kind = 'create'; }
    else { rule = ROW.find(r => r[0].test(p)); if (rule) { id = decodeURIComponent(p.match(rule[0])[1]); kind = m === 'DELETE' ? 'delete' : 'update'; } }
    if (!rule) return next();
    const [, tbl, label, nameCol] = rule;
    let before = null;
    if (id) { try { before = get(db(), `SELECT * FROM ${tbl} WHERE id=?`, [id]); } catch (e) {} if (!before) return next(); }
    const oj = res.json.bind(res);
    res.json = body => { res._auditBody = body; return oj(body); };
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const user = uname(req);
      try {
        if (kind === 'update') {
          const after = get(db(), `SELECT * FROM ${tbl} WHERE id=?`, [id]); if (!after) return;
          const b = {}, a = {};
          for (const k of Object.keys(after)) if (String(after[k]) !== String(before[k])) { b[k] = before[k]; a[k] = after[k]; }
          if (!Object.keys(a).length) return;
          save({ user, kind, tbl, row_id: id, label, name: after[nameCol] || before[nameCol], before: clip(b), after: clip(a) });
        } else if (kind === 'delete') {
          const r = res._auditBody && res._auditBody._restore;
          save({ user, kind, tbl, row_id: id, label, name: before[nameCol], before: r || { table: tbl, row: clip(before), children: [] } });
        } else {
          const nid = res._auditBody && (res._auditBody.id || (res._auditBody.layer && res._auditBody.layer.id));
          if (!nid) return;
          const row = get(db(), `SELECT * FROM ${tbl} WHERE id=?`, [nid]);
          if (row) save({ user, kind, tbl, row_id: nid, label, name: row[nameCol], after: clip(row) });
        }
      } catch (e) {}
    });
    next();
  });

  // ── просмотр ─────────────────────────────────────────────
  app.get('/api/audit', wrap((req, res) => {
    const lim = Math.min(1000, parseInt(req.query.limit) || 300);
    const where = [], args = [];
    if (req.query.user) { where.push('user_name=?'); args.push(req.query.user); }
    if (req.query.tbl) { where.push('tbl=?'); args.push(req.query.tbl); }
    if (req.query.row) { where.push('row_id=?'); args.push(req.query.row); }
    if (req.query.q) { where.push('(name LIKE ? OR label LIKE ?)'); args.push('%' + req.query.q + '%', '%' + req.query.q + '%'); }
    const rows = all(db(), `SELECT id,at,user_name,kind,tbl,row_id,label,name,undone,
        CASE WHEN length(before)>20000 THEN substr(before,1,20000) ELSE before END AS before,
        CASE WHEN length(after)>20000 THEN substr(after,1,20000) ELSE after END AS after
      FROM audit_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY at DESC, rowid DESC LIMIT ${lim}`, args);
    const users = all(db(), "SELECT DISTINCT user_name FROM audit_log WHERE user_name!='' ORDER BY user_name").map(r => r.user_name);
    res.json({ rows, users });
  }));

  // ── откат ────────────────────────────────────────────────
  app.post('/api/admin/audit/:id/rollback', wrap((req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Откат доступен администратору' });
    const e = get(db(), 'SELECT * FROM audit_log WHERE id=?', [req.params.id]);
    if (!e) return res.status(404).json({ error: 'Запись журнала не найдена' });
    if (!TABLES.has(e.tbl)) return res.status(400).json({ error: 'Таблица не поддерживается' });
    const d = db(), force = !!(req.body && req.body.force), user = uname(req);
    const B = e.before ? JSON.parse(e.before) : null, A = e.after ? JSON.parse(e.after) : null;
    if (e.kind === 'update') {
      const cur = get(d, `SELECT * FROM ${e.tbl} WHERE id=?`, [e.row_id]);
      if (!cur) return res.status(409).json({ error: 'Запись уже удалена — сначала откатите удаление' });
      const cols = Object.keys(B || {}).filter(k => k !== 'id' && k in cur && B[k] !== '[слишком большое значение не сохранено]');
      if (!cols.length) return res.status(400).json({ error: 'Нечего откатывать' });
      const changedSince = cols.filter(k => String(cur[k]) !== String(A[k]));
      if (changedSince.length && !force) return res.status(409).json({ conflict: true, fields: changedSince, error: 'После этого изменения поля менялись ещё раз' });
      const before2 = {}; cols.forEach(k => { before2[k] = cur[k]; });
      run(d, `UPDATE ${e.tbl} SET ${cols.map(k => k + '=?').join(',')} WHERE id=?`, [...cols.map(k => B[k]), e.row_id]);
      save({ user, kind: 'rollback', tbl: e.tbl, row_id: e.row_id, label: e.label, name: e.name, before: before2, after: B });
    } else if (e.kind === 'delete') {
      if (get(d, `SELECT id FROM ${e.tbl} WHERE id=?`, [e.row_id])) return res.status(409).json({ error: 'Запись уже существует (восстановлена ранее)' });
      const r = restoreFromData(d, B);
      if (!r.ok) return res.status(422).json({ error: 'Не удалось восстановить: ' + r.reason });
      save({ user, kind: 'rollback', tbl: e.tbl, row_id: e.row_id, label: e.label, name: e.name, after: { восстановлено: true } });
    } else if (e.kind === 'create') {
      const cur = get(d, `SELECT id FROM ${e.tbl} WHERE id=?`, [e.row_id]);
      if (!cur) return res.status(409).json({ error: 'Запись уже удалена' });
      const r = trashAndDelete(d, e.tbl, e.row_id);
      save({ user, kind: 'rollback', tbl: e.tbl, row_id: e.row_id, label: e.label, name: e.name, before: r });
    } else return res.status(400).json({ error: 'Этот тип записи не откатывается' });
    run(d, 'UPDATE audit_log SET undone=1 WHERE id=?', [e.id]);
    if (broadcast) broadcast({ type: 'change', method: 'PUT', url: '/api/audit', t: Date.now() });
    res.json({ ok: true });
  }));
};
