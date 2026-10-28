// ═══════════════════════════════════════════════════════════
// routes/ui-settings.js — общие настройки интерфейса от админа.
// Админ нажимает «Применить ко всем»: его набор настроек становится
// общим для сервера. У всех пользователей личные настройки сбрасываются
// на общие (номер версии вырос); с «запретить менять» — их нельзя изменить.
// Хранится в app_settings под ключом ui_defaults.
// ═══════════════════════════════════════════════════════════
const { get, run } = require('../database');
const { wrap } = require('./validate');

module.exports = (app, getDb, { isAdmin, broadcast }) => {
  const db = () => getDb();
  const read = () => {
    const r = get(db(), "SELECT value FROM app_settings WHERE key='ui_defaults'");
    try { return r ? JSON.parse(r.value) : null; } catch (e) { return null; }
  };
  app.get('/api/ui-settings', wrap((req, res) => res.json(read() || { values: {}, lock: false, version: 0 })));
  app.put('/api/ui-settings', wrap((req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Только для админа' });
    const { values, lock } = req.body || {};
    if (!values || typeof values !== 'object' || Array.isArray(values)) return res.status(400).json({ error: 'Нет настроек' });
    const clean = {};
    for (const [k, v] of Object.entries(values)) if (/^[a-zA-Z_]{1,30}$/.test(k) && ['boolean', 'number', 'string'].includes(typeof v)) clean[k] = v;
    const cur = read() || { version: 0 };
    let by = ''; try { by = decodeURIComponent(req.get('X-User-Name') || ''); } catch (e) {}
    const o = { values: clean, lock: !!lock, version: (cur.version || 0) + 1, by, at: new Date().toISOString() };
    run(db(), "INSERT OR REPLACE INTO app_settings(key,value)VALUES('ui_defaults',?)", [JSON.stringify(o)]);
    broadcast({ type: 'ui-settings', version: o.version });
    res.json(o);
  }));
  app.delete('/api/ui-settings', wrap((req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Только для админа' });
    const cur = read() || { version: 0 };
    const o = { values: {}, lock: false, version: (cur.version || 0) + 1 };
    run(db(), "INSERT OR REPLACE INTO app_settings(key,value)VALUES('ui_defaults',?)", [JSON.stringify(o)]);
    broadcast({ type: 'ui-settings', version: o.version });
    res.json(o);
  }));
};
