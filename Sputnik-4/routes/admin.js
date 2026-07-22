// ═══════════════════════════════════════════════════════════
// routes/admin.js — админ-панель: идентификация, права (ACL),
// присутствие, enforcement middleware.
//
// Модель доверия: заголовки X-Client-Id / X-User-Name ставит клиент,
// поэтому права по людям — «кооперативный» контроль (защита от
// случайного вмешательства коллег), а не от злоумышленника.
// Админ-пароль защищён по-настоящему (соль+scrypt хэш, токен от сервера).
// ═══════════════════════════════════════════════════════════
const crypto = require('crypto');
const { all, get, run } = require('../database');
const { wrap } = require('./validate');

// Возможности, которыми управляет админ (ключ → человекочитаемое имя)
const CAPS = {
  delete:            'удаление',
  kmlEdit:           'правка слоёв KML',
  volumes:           'объёмы и факты',
  refs:              'справочники (МТО/ПГК)',
  layerToggleGlobal: 'переключение слоёв для всех',
};

// (method, regexp) → нужная возможность. Первое совпадение выигрывает.
// Узкий PATCH видимости стоит ДО общего правила слоёв.
const RULES = [
  { m: 'PATCH',  re: /^\/api\/layers\/[^/]+\/visible/, cap: 'layerToggleGlobal' },
  { m: 'ANY',    re: /^\/api\/layers(\/|\?|$)/,          cap: 'kmlEdit' },
  { m: 'ANY',    re: /^\/api\/(volumes|vol_progress)(\/|\?|$)/, cap: 'volumes' },
  { m: 'ANY',    re: /^\/api\/sites\/[^/]+\/(volumes|progress)(\/|\?|$)/, cap: 'volumes' },
  { m: 'ANY',    re: /^\/api\/(mto|materials|equip_groups|mat_groups|spare_groups|spare_parts|fuel_reserves|fuel_transactions)(\/|\?|$)/, cap: 'refs' },
  { m: 'ANY',    re: /^\/api\/pgk\//,                    cap: 'refs' },
  { m: 'ANY',    re: /^\/api\/bases\/[^/]+\/materials/,  cap: 'refs' },
  { m: 'DELETE', re: /^\/api\//,                          cap: 'delete' },
];

module.exports = (app, getDb, L, { broadcast, getPresence }) => {
  const db = () => getDb();

  // ── helpers ──────────────────────────────────────────────
  const setting = (key) => { const r = get(db(), 'SELECT value FROM app_settings WHERE key=?', [key]); return r ? r.value : null; };
  const setSetting = (key, val) => run(db(), 'INSERT OR REPLACE INTO app_settings(key,value)VALUES(?,?)', [key, val]);

  const isLoopback = (req) => {
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  };
  const isAdmin = (req) => {
    if (isLoopback(req)) return true;
    const tok = req.get('X-Admin-Token');
    const stored = setting('admin_token');
    return !!tok && !!stored && tok === stored;
  };
  const adminPwSet = () => !!setting('admin_pw');

  // Соль+scrypt хэш пароля → строка "salt:hash"
  const hashPw = (pw) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const h = crypto.scryptSync(String(pw), salt, 32).toString('hex');
    return salt + ':' + h;
  };
  const verifyPw = (pw, stored) => {
    if (!stored || stored.indexOf(':') < 0) return false;
    const [salt, h] = stored.split(':');
    const cand = crypto.scryptSync(String(pw), salt, 32).toString('hex');
    const a = Buffer.from(h, 'hex'), b = Buffer.from(cand, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };

  // ACL: { users: { "<clientId>": { name, caps:{cap:bool} } } }
  const readAcl = () => { try { return JSON.parse(setting('acl') || '{}') || {}; } catch (e) { return {}; } };
  // Возвращает caps для клиента (по умолчанию всё разрешено)
  const capsFor = (clientId) => {
    const acl = readAcl();
    const u = acl.users && acl.users[clientId];
    const caps = {};
    for (const k of Object.keys(CAPS)) caps[k] = !(u && u.caps && u.caps[k] === false);
    return caps;
  };

  // ── enforcement middleware ───────────────────────────────
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') return next();
    if (!req.url.startsWith('/api/')) return next();
    if (req.url.startsWith('/api/admin/') || req.url.startsWith('/api/me/') || req.url === '/api/events') return next();
    if (isAdmin(req)) return next();
    const method = req.method;
    for (const rule of RULES) {
      if ((rule.m === 'ANY' || rule.m === method) && rule.re.test(req.url)) {
        const clientId = req.get('X-Client-Id') || '';
        const caps = capsFor(clientId);
        if (caps[rule.cap] === false) {
          return res.status(403).json({ error: 'Недостаточно прав: ' + (CAPS[rule.cap] || rule.cap) });
        }
        break; // правило найдено и пройдено — дальше не матчим
      }
    }
    next();
  });

  // ── идентификация клиента: обновляем реестр known_clients ──
  app.use((req, res, next) => {
    const cid = req.get('X-Client-Id');
    if (cid) {
      let nm = req.get('X-User-Name') || '';
      try { nm = decodeURIComponent(nm); } catch (e) {}
      nm = nm.slice(0, 120);
      try {
        run(db(), `INSERT INTO known_clients(client_id,name,first_seen,last_seen)
          VALUES(?,?,datetime('now'),datetime('now'))
          ON CONFLICT(client_id) DO UPDATE SET last_seen=datetime('now'), name=CASE WHEN excluded.name!='' THEN excluded.name ELSE known_clients.name END`,
          [cid, nm]);
      } catch (e) {}
    }
    next();
  });

  // ── свои права (любой клиент) ────────────────────────────
  app.get('/api/me/caps', wrap((req, res) => {
    const clientId = req.get('X-Client-Id') || '';
    res.json({ isAdmin: isAdmin(req), loopback: isLoopback(req), pwSet: adminPwSet(), caps: capsFor(clientId) });
  }));

  // ── логин админа паролем ─────────────────────────────────
  app.post('/api/admin/login', wrap((req, res) => {
    const { password } = req.body || {};
    if (isLoopback(req)) {
      // с ПК-сервера — авто-админ; выдаём/создаём токен без пароля
      let tok = setting('admin_token');
      if (!tok) { tok = crypto.randomBytes(24).toString('hex'); setSetting('admin_token', tok); }
      return res.json({ ok: true, token: tok });
    }
    if (!adminPwSet()) return res.status(400).json({ error: 'Пароль админа ещё не задан (задайте его с ПК-сервера)' });
    if (!verifyPw(password, setting('admin_pw'))) return res.status(403).json({ error: 'Неверный пароль' });
    const tok = setting('admin_token');
    res.json({ ok: true, token: tok });
  }));

  // ── задать / сменить пароль (только админ) ───────────────
  app.post('/api/admin/password', wrap((req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Только для админа' });
    const { password } = req.body || {};
    if (!password || String(password).length < 4) return res.status(400).json({ error: 'Минимум 4 символа' });
    setSetting('admin_pw', hashPw(password));
    let tok = setting('admin_token');
    if (!tok) { tok = crypto.randomBytes(24).toString('hex'); setSetting('admin_token', tok); }
    res.json({ ok: true, token: tok });
  }));

  // ── реестр пользователей + их права (админ) ──────────────
  app.get('/api/admin/clients', wrap((req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Только для админа' });
    const rows = all(db(), 'SELECT * FROM known_clients ORDER BY last_seen DESC');
    const acl = readAcl();
    const online = {};
    (getPresence ? getPresence() : []).forEach(p => { online[p.clientId] = p; });
    res.json({
      caps: CAPS,
      clients: rows.map(r => ({
        client_id: r.client_id, name: r.name, first_seen: r.first_seen, last_seen: r.last_seen,
        caps: (acl.users && acl.users[r.client_id] && acl.users[r.client_id].caps) || {},
        online: !!online[r.client_id],
      })),
    });
  }));

  // ── сохранить права (админ) ──────────────────────────────
  app.put('/api/admin/acl', wrap((req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Только для админа' });
    const { client_id, name, caps } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'client_id обязателен' });
    const acl = readAcl();
    if (!acl.users) acl.users = {};
    const clean = {};
    for (const k of Object.keys(CAPS)) if (caps && caps[k] === false) clean[k] = false;
    if (Object.keys(clean).length) acl.users[client_id] = { name: name || '', caps: clean };
    else delete acl.users[client_id]; // пусто → полный доступ (не храним запись)
    setSetting('acl', JSON.stringify(acl));
    if (broadcast) broadcast({ type: 'acl', client_id, t: Date.now() });
    res.json({ ok: true });
  }));

  // ── кто сейчас онлайн (админ) ────────────────────────────
  app.get('/api/presence', wrap((req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Только для админа' });
    res.json(getPresence ? getPresence() : []);
  }));

  // ── последние действия из журнала (админ) ────────────────
  app.get('/api/admin/activity', wrap((req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Только для админа' });
    res.json(all(db(), 'SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 60'));
  }));

  return { isAdmin, isLoopback, capsFor };
};
