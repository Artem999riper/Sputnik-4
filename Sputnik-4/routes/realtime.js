// ═══════════════════════════════════════════════════════════
// realtime.js — SSE broadcast + stateless undo
//
//   • /api/events        — Server-Sent Events для push-обновлений
//   • broadcast()        — рассылка всем SSE-клиентам
//   • trashAndDelete()   — читает строку, удаляет, возвращает данные для restore
//   • POST /api/restore  — принимает { table, row, children } и восстанавливает
//
// Undo stateless: сервер возвращает удалённую строку в ответе DELETE.
// Клиент держит данные в замыкании toast (10 с) и отправляет назад на restore.
// Не требует сервер-сайд состояния — переживает рестарты и кластерный режим.
// ═══════════════════════════════════════════════════════════
const { run, get, all } = require('../database');

const RESTORABLE_TABLES = new Set([
  'bases','sites','volumes','vol_progress','progress_items',
  'kameral_reports','kameral_remarks','site_tasks','global_tasks',
  'pgk_workers','pgk_machinery','pgk_equipment','materials',
  'cargo_orders','kml_layers','site_bases',
]);

// ── SSE ────────────────────────────────────────────────────

const sseClients = new Set();

function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of [...sseClients]) {
    try { client.write(payload); }
    catch (e) { sseClients.delete(client); }
  }
}

function attachSse(app) {
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders && res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: 'connected', t: Date.now() })}\n\n`);
    sseClients.add(res);
    const ping = setInterval(() => {
      try { res.write(':ping\n\n'); } catch (e) {}
    }, 25_000);
    req.on('close', () => { clearInterval(ping); sseClients.delete(res); });
  });

  // Транслируем событие после любого успешного мутирующего запроса
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'OPTIONS' || !req.url.startsWith('/api/')) return next();
    if (req.url === '/api/events') return next();
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        broadcast({ type: 'change', method: req.method, url: req.url, t: Date.now() });
      }
    });
    next();
  });
}

// ── STATELESS UNDO ─────────────────────────────────────────

// Удалить строку + опционально каскадные дочерние.
// Возвращает объект { table, row, children } для клиента, или null если строка не найдена.
function trashAndDelete(db, table, id, opts) {
  const row = get(db, `SELECT * FROM ${table} WHERE id=?`, [id]);
  if (!row) return null;
  const children = [];
  if (opts && Array.isArray(opts.children)) {
    for (const child of opts.children) {
      const rows = all(db, `SELECT * FROM ${child.table} WHERE ${child.fkColumn}=?`, [id]);
      rows.forEach(cr => children.push({ table: child.table, row: cr }));
      try { run(db, `DELETE FROM ${child.table} WHERE ${child.fkColumn}=?`, [id]); } catch (e) {}
    }
  }
  run(db, `DELETE FROM ${table} WHERE id=?`, [id]);
  return { table, row, children };
}

// Восстановить запись (и дочерние) из данных, переданных клиентом.
function restoreFromData(db, data) {
  const { table, row, children } = data;
  if (!RESTORABLE_TABLES.has(table)) return { ok: false, reason: 'invalid_table' };
  const cols = Object.keys(row).filter(c => row[c] !== undefined);
  const ph = cols.map(() => '?').join(',');
  const vals = cols.map(c => row[c]);
  try {
    run(db, `INSERT INTO ${table}(${cols.join(',')}) VALUES(${ph})`, vals);
  } catch (e) {
    return { ok: false, reason: e.message };
  }
  if (Array.isArray(children)) {
    for (const child of children) {
      if (!RESTORABLE_TABLES.has(child.table)) continue;
      const ccols = Object.keys(child.row).filter(c => child.row[c] !== undefined);
      const cph = ccols.map(() => '?').join(',');
      const cvals = ccols.map(c => child.row[c]);
      try { run(db, `INSERT INTO ${child.table}(${ccols.join(',')}) VALUES(${cph})`, cvals); } catch (e) {}
    }
  }
  return { ok: true, table, id: row.id };
}

function attachUndo(app, getDb) {
  app.post('/api/restore', (req, res) => {
    const { table, row, children } = req.body || {};
    if (!table || !row) return res.status(400).json({ error: 'Не переданы данные для восстановления' });
    const result = restoreFromData(getDb(), { table, row, children: children || [] });
    if (!result.ok) return res.status(422).json({ error: 'Не удалось восстановить: ' + result.reason });
    res.json(result);
  });
}

module.exports = { attachSse, attachUndo, broadcast, trashAndDelete };
