// ═══════════════════════════════════════════════════════════
// editing.js — «кто сейчас редактирует»: клиент сообщает, что открыл на правку
// объект (ключ вида «worker:<id>», «layer:<id>», «feat:<слой>:<№>»), и раз в 20 с
// подтверждает; остальные, открывшие тот же ключ, видят предупреждение.
// Хранится только в памяти: запись старше 60 с или закрытая вкладка — снимается.
// ═══════════════════════════════════════════════════════════
const TTL = 60000;
module.exports = (app, { broadcast, presenceEvents }) => {
  const ed = new Map();      // key → Map(cid → {name, at})
  const list = key => [...(ed.get(key) || new Map()).entries()].map(([cid, v]) => ({ cid, name: v.name }));
  const notify = key => broadcast({ type: 'editing', key, who: list(key) });
  const sweep = () => {
    const now = Date.now();
    for (const [key, m] of ed) {
      let ch = false;
      for (const [cid, v] of m) if (now - v.at > TTL) { m.delete(cid); ch = true; }
      if (!m.size) ed.delete(key);
      if (ch) notify(key);
    }
  };
  setInterval(sweep, 15000).unref();
  if (presenceEvents) presenceEvents.on('close', (meta, left) => {
    if (left || !meta.clientId) return;
    for (const [key, m] of ed) if (m.delete(meta.clientId)) { if (!m.size) ed.delete(key); notify(key); }
  });
  // body: { key, cid, name, action: 'begin' | 'beat' | 'end' } → { others:[{cid,name}] }
  app.post('/api/editing', (req, res) => {
    const { key, cid, name, action } = req.body || {};
    if (!key || !cid || typeof key !== 'string' || key.length > 200) return res.status(400).json({ error: 'key и cid обязательны' });
    let m = ed.get(key);
    const had = !!(m && m.has(cid));
    if (action === 'end') {
      if (m && m.delete(cid)) { if (!m.size) ed.delete(key); notify(key); }
      return res.json({ others: [] });
    }
    if (!m) { m = new Map(); ed.set(key, m); }
    m.set(cid, { name: String(name || 'Пользователь').slice(0, 120), at: Date.now() });
    if (!had) notify(key);
    res.json({ others: list(key).filter(x => x.cid !== cid) });
  });
  app.get('/api/editing', (req, res) => {
    sweep();
    res.json([...ed.keys()].map(key => ({ key, who: list(key) })));
  });
};
