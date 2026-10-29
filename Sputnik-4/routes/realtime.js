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
  'cargo_orders','kml_layers','site_bases','mto_items',
  'worker_shifts','worker_docs','machine_moves','materials_log','photos',
  'equipment_responsible_history','fuel_reserves','fuel_transactions',
  'equipment_history','pgk_brigades','pgk_brigade_members','pgk_brigade_bases','pgk_brigade_sites',
]);

// ── SSE ────────────────────────────────────────────────────

// res → { clientId, name, ip, connectedAt } — метаданные для присутствия
const sseClients = new Map();
// Открытие/закрытие вкладок — для журнала сеансов (routes/audit.js)
const presenceEvents = new (require('events'))();

function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of [...sseClients.keys()]) {
    try { client.write(payload); }
    catch (e) { sseClients.delete(client); }
  }
}

// Сводка присутствия: по clientId (склеивает вкладки одного человека)
function getPresence() {
  const byCid = {};
  const named = {};   // ip → имена (чтобы подсказать, чья «старая вкладка»)
  for (const meta of sseClients.values()) if (meta.name && meta.clientId && !meta.aux) (named[meta.ip] = named[meta.ip] || new Set()).add(meta.name);
  for (const meta of sseClients.values()) {
    if (meta.aux) continue;   // служебный канал (прогресс рельефа/затопления) — не человек
    const cid = meta.clientId || ('anon-' + meta.ip);
    // stale = старая версия страницы (нет clientId → не шлёт идентификацию)
    if (!byCid[cid]) byCid[cid] = { clientId: cid, name: meta.name || '', ip: meta.ip, connectedAt: meta.connectedAt, tabs: 0, stale: !meta.clientId };
    byCid[cid].tabs++;
    if (meta.connectedAt < byCid[cid].connectedAt) byCid[cid].connectedAt = meta.connectedAt;
    if (!byCid[cid].name && meta.name) byCid[cid].name = meta.name;
  }
  const lo = ip => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  Object.values(byCid).forEach(p => { if (p.stale) { p.guess = named[p.ip] ? [...named[p.ip]].join(', ') : ''; p.local = lo(p.ip); } });
  return Object.values(byCid).sort((a, b) => a.connectedAt - b.connectedAt);
}

function attachSse(app) {
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders && res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: 'connected', t: Date.now() })}\n\n`);
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || '';
    let nm = (req.query.name || '').toString();
    try { nm = decodeURIComponent(nm); } catch (e) {}
    const meta = {
      clientId: (req.query.cid || '').toString().slice(0, 64),
      name: nm.slice(0, 120),
      aux: req.query.aux === '1',
      ip, connectedAt: Date.now(),
    };
    sseClients.set(res, meta);
    try { presenceEvents.emit('open', meta); } catch (e) {}
    broadcast({ type: 'presence', t: Date.now() });
    const ping = setInterval(() => {
      try { res.write(':ping\n\n'); } catch (e) {}
    }, 25_000);
    req.on('close', () => {
      clearInterval(ping); sseClients.delete(res);
      const left = meta.clientId ? [...sseClients.values()].filter(m => m.clientId === meta.clientId).length : 0;
      try { presenceEvents.emit('close', meta, left); } catch (e) {}
      broadcast({ type: 'presence', t: Date.now() });
    });
  });

  // Транслируем событие после любого успешного мутирующего запроса
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'OPTIONS' || !req.url.startsWith('/api/')) return next();
    if (req.url === '/api/events' || req.url.startsWith('/api/editing')) return next();   // «кто редактирует» — не изменение данных
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

// после восстановления слоя/объёма/выполнения — пересчитать объёмы (volume-sync.js)
function _afterRestore(db, table, row) {
  try {
    const VS = require('./volume-sync');
    if (table === 'kml_layers') VS.syncLayer(db, row.id);
    else if (table === 'volumes') VS.syncVolumeId(db, row.id);
    else if (table === 'vol_progress') VS.recalcSite(db, row.site_id);
  } catch (e) {}
}
function attachUndo(app, getDb) {
  app.post('/api/restore', (req, res) => {
    // Пакетное восстановление (массовое удаление): { items:[{table,row,children}, …] }
    if (Array.isArray(req.body && req.body.items)) {
      let ok = 0; const errors = [];
      for (const it of req.body.items) {
        if (!it || !it.table || !it.row) continue;
        const r = restoreFromData(getDb(), { table: it.table, row: it.row, children: it.children || [] });
        if (r.ok) { ok++; _afterRestore(getDb(), it.table, it.row); } else errors.push(r.reason);
      }
      if (!ok && errors.length) return res.status(422).json({ error: 'Не удалось восстановить: ' + errors[0] });
      return res.json({ ok: true, restored: ok });
    }
    const { table, row, children } = req.body || {};
    if (!table || !row) return res.status(400).json({ error: 'Не переданы данные для восстановления' });
    const result = restoreFromData(getDb(), { table, row, children: children || [] });
    if (!result.ok) return res.status(422).json({ error: 'Не удалось восстановить: ' + result.reason });
    _afterRestore(getDb(), table, row);
    res.json(result);
  });
}

module.exports = { attachSse, attachUndo, broadcast, trashAndDelete, getPresence, restoreFromData, presenceEvents };
