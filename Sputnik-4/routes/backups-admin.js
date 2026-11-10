// ═══════════════════════════════════════════════════════════
// routes/backups-admin.js — Администрирование → «💾 Резервные копии»:
// список ВСЕХ копий (не только последних 20), занятое место, удаление выбранных
// и «удалить старше N дней» (самые свежие копии всегда остаются). Только админ.
// ═══════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const { wrap } = require('./validate');

const KIND = n => /^backup_auto_/.test(n) ? 'auto' : /^backup_\d/.test(n) ? 'manual' : 'other';
// только имя файла копии в папке (никаких «..\» и подпапок)
const okName = n => typeof n === 'string' && /^[\w.\-]+\.db$/.test(n) && path.basename(n) === n;

module.exports = (app, getDb, { isAdmin, BACKUP_DIR }) => {
  const admin = (req, res) => { if (isAdmin(req)) return true; res.status(403).json({ error: 'Только для админа' }); return false; };
  const list = () => {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).map(f => {
      const p = path.join(BACKUP_DIR, f); let st; try { st = fs.statSync(p); } catch (e) { return null; }
      let extra = 0; for (const s of ['-wal', '-shm']) { try { extra += fs.statSync(p + s).size; } catch (e) {} }
      return { name: f, size: st.size + extra, date: st.mtime.toISOString(), kind: KIND(f) };
    }).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
  };
  const remove = name => {
    let n = 0;
    for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(path.join(BACKUP_DIR, name + s)); if (!s) n++; } catch (e) {} }
    return n;
  };

  app.get('/api/admin/backups', wrap((req, res) => {
    if (!admin(req, res)) return;
    const all = list();
    let free = null;
    try { if (fs.statfsSync) { const s = fs.statfsSync(BACKUP_DIR); free = s.bavail * s.bsize; } } catch (e) {}
    res.json({ dir: BACKUP_DIR, items: all, total: all.reduce((a, f) => a + f.size, 0), free });
  }));

  // удалить выбранные: {names:[…]}; самую свежую копию удалить нельзя — без неё нечем восстановиться
  app.post('/api/admin/backups/delete', wrap((req, res) => {
    if (!admin(req, res)) return;
    const names = Array.isArray(req.body && req.body.names) ? req.body.names : [];
    if (names.some(n => !okName(n))) return res.status(400).json({ error: 'Неверное имя файла' });
    const all = list(), newest = all[0] && all[0].name;
    let n = 0, freed = 0, kept = '';
    for (const nm of names) {
      if (nm === newest && all.length) { kept = nm; continue; }
      const f = all.find(x => x.name === nm); if (!f) continue;
      n += remove(nm); freed += f.size;
    }
    console.log(`  🗑  Удалено резервных копий: ${n} (${(freed / 1048576).toFixed(1)} МБ)`);
    res.json({ ok: true, deleted: n, freed, kept });
  }));

  // удалить старше N дней, оставив не меньше keep самых свежих: {days, keep}
  app.post('/api/admin/backups/cleanup', wrap((req, res) => {
    if (!admin(req, res)) return;
    const days = parseFloat((req.body || {}).days), keep = Math.max(1, parseInt((req.body || {}).keep) || 3);
    if (!(days >= 0)) return res.status(400).json({ error: 'Укажите число дней' });
    const lim = Date.now() - days * 86400000;
    const all = list();
    const victims = all.slice(keep).filter(f => Date.parse(f.date) < lim);
    let n = 0, freed = 0;
    for (const f of victims) { n += remove(f.name); freed += f.size; }
    console.log(`  🗑  Очистка копий старше ${days} дн.: удалено ${n} (${(freed / 1048576).toFixed(1)} МБ)`);
    res.json({ ok: true, deleted: n, freed, left: all.length - n });
  }));
};
