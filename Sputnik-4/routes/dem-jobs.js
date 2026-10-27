// ═══════════════════════════════════════════════════════════
// dem-jobs.js — выгрузки рельефа: общий запуск одной области и пакета (по KML)
// + очередь на сервере. Задание выполняется в фоне (по одному — GDAL тяжёлый),
// окно можно закрыть; готовый ZIP лежит в папке exports рядом с базой
// и доступен в «Мои выгрузки» 14 дней. После перезапуска сервера незавершённые
// задания продолжаются.
// ═══════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');
const { wrap } = require('./validate');

const KEEP_DAYS = 14;
const DB_PATH = process.env.PGK_DB || path.join(__dirname, '..', 'survey.db');
const EXPORT_DIR = process.env.PGK_EXPORT_DIR || path.join(path.dirname(DB_PATH), 'exports');

// Параметры из запроса → параметры processDEM (те же умолчания, что и раньше в маршрутах)
function demParams(b) {
  return {
    format: b.format || 'dxf', interval: parseFloat(b.interval) || 2, useGeoid: b.useGeoid !== false,
    gridStep: (b.gridStep !== undefined && b.gridStep !== null && b.gridStep !== '') ? parseInt(b.gridStep) : 20,
    jitterMin: parseFloat(b.jitterMin) || 0, jitterMax: parseFloat(b.jitterMax) || 0,
    exportSatellite: b.exportSatellite !== false, satelliteOnly: !!b.satelliteOnly,
    satZoom: parseInt(b.satZoom) || 0, satMPP: parseFloat(b.satMPP) || 0,
    satSourceUrl: b.satSourceUrl || null, satSourceSubdomains: b.satSourceSubdomains || [],
  };
}

// Пакет участков → ZIP (Buffer): папка на участок + «Отчёт.txt». onProgress(pct, text)
async function runDemBatch(demProcessor, b, onProgress) {
  const items = Array.isArray(b.items) ? b.items.filter(it => it && it.bbox && it.bbox.minLat != null) : [];
  if (!items.length) throw Object.assign(new Error('Нет участков для выгрузки'), { status: 400 });
  if (items.length > 200) throw Object.assign(new Error('Слишком много участков (макс. 200)'), { status: 400 });
  const AdmZip = require('adm-zip');
  const out = new AdmZip();
  const report = [`Пакетная выгрузка рельефа — ${new Date().toLocaleString('ru-RU')}`, `Участков: ${items.length}`, ''];
  const used = new Set();
  const safe = n => { let s0 = String(n || 'Участок').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'Участок', s1 = s0, k = 2; while (used.has(s1.toLowerCase())) s1 = `${s0}_${k++}`; used.add(s1.toLowerCase()); return s1; };
  const P = demParams(b);
  let ok = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i], folder = safe(it.name || `Участок ${i + 1}`);
    const pref = `Участок ${i + 1}/${items.length} «${folder}»`;
    let tmpDir = null;
    try {
      onProgress(Math.round(i / items.length * 100), `${pref}: начинаю…`);
      const r = await demProcessor.processDEM({
        ...P, format: 'dxf', cacheOnly: false,
        bbox: it.bbox, clip: it.clip || null, projId: it.projId, proj4: it.proj4, epsg: it.epsg, projName: it.projName,
        onProgress: (pct, text) => onProgress(Math.round((i + pct / 100) / items.length * 100), `${pref}: ${text}`),
      });
      tmpDir = r.tmpDir;
      if (/\.zip$/i.test(r.file)) new AdmZip(r.file).getEntries().forEach(en => { if (!en.isDirectory) out.addFile(`${folder}/${en.entryName}`, en.getData()); });
      else out.addLocalFile(r.file, folder);
      report.push(`✅ ${folder} — ${it.projName || it.projId || ''}` +
        (r.interval != null && r.interval !== r.requestedInterval ? ` · шаг горизонталей ${r.interval} м вместо ${r.requestedInterval} м (плоский участок)` : '') +
        (r.geoid === false ? ' · ⚠ высоты НЕ в БСВ-77 (нет файлов геоида)' : ''));
      ok++;
    } catch (e) {
      report.push(`❌ ${folder} — ${e.message || e}`);
      console.error('[DEM batch]', folder, e.message);
    } finally { if (tmpDir) demProcessor.cleanupTmp(tmpDir); }
  }
  if (!ok) throw new Error('Ни один участок не выгружен:\n' + report.slice(3).join('\n'));
  report.push('', `Выгружено: ${ok} из ${items.length}`);
  out.addFile('Отчёт.txt', Buffer.from('\uFEFF' + report.join('\r\n'), 'utf8'));
  onProgress(100, `Готово: ${ok} из ${items.length}`);
  return { buf: out.toBuffer(), ok, total: items.length, report };
}

function attach(res, name) {
  const ascii = String(name).replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_') || 'file';
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`);
}

module.exports = (app, getDb, { demProcessor, broadcast }) => {
  const db = () => getDb();
  const fileOf = id => path.join(EXPORT_DIR, `${id}.zip`);
  const pub = j => { const { params_json, ...r } = j; return r; };
  // Продолжить прерванные перезапуском; удалить старые
  try { run(db(), "UPDATE dem_jobs SET status='queued', pct=0, text='Продолжу после перезапуска сервера' WHERE status='running'"); } catch (e) {}
  const sweep = () => {
    try {
      const old = all(db(), `SELECT id FROM dem_jobs WHERE status IN ('done','error','cancelled') AND created_at < datetime('now','localtime','-${KEEP_DAYS} days')`);
      old.forEach(j => { try { fs.rmSync(fileOf(j.id), { force: true }); } catch (e) {} run(db(), 'DELETE FROM dem_jobs WHERE id=?', [j.id]); });
    } catch (e) {}
  };
  sweep();

  let busy = false;
  const cancelled = new Set();
  const notify = j => broadcast({ type: 'dem_job', id: j.id, status: j.status, pct: j.pct, text: j.text, title: j.title, user_name: j.user_name, error: j.error || null });
  async function tick() {
    if (busy || !demProcessor) return;
    const job = get(db(), "SELECT * FROM dem_jobs WHERE status='queued' ORDER BY created_at, rowid LIMIT 1");
    if (!job) return;
    busy = true;
    let last = 0;
    const prog = (pct, text) => {
      broadcast({ type: 'dem_progress', pct, text, job: job.id });
      const now = Date.now(); if (now - last < 1000 && pct < 100) return; last = now;
      run(db(), 'UPDATE dem_jobs SET pct=?, text=? WHERE id=?', [Math.max(0, Math.min(100, Math.round(pct))), String(text || '').slice(0, 300), job.id]);
      notify({ ...job, status: 'running', pct: Math.round(pct), text });
    };
    run(db(), "UPDATE dem_jobs SET status='running', started_at=datetime('now','localtime'), pct=0, text='Запуск…' WHERE id=?", [job.id]);
    notify({ ...job, status: 'running', pct: 0, text: 'Запуск…' });
    try {
      fs.mkdirSync(EXPORT_DIR, { recursive: true });
      const params = JSON.parse(job.params_json || '{}');
      let note = '';
      if (job.kind === 'batch') {
        const r = await runDemBatch(demProcessor, params, prog);
        fs.writeFileSync(fileOf(job.id), r.buf);
        note = `участков ${r.ok} из ${r.total}`;
      } else {
        const r = await demProcessor.processDEM({ ...demParams(params), cacheOnly: false,
          bbox: params.bbox, clip: params.clip || null, projId: params.projId, proj4: params.proj4, epsg: params.epsg, projName: params.projName, onProgress: prog });
        try { fs.copyFileSync(r.file, fileOf(job.id)); } finally { demProcessor.cleanupTmp(r.tmpDir); }
        const n = [];
        if (r.interval != null && r.interval !== r.requestedInterval) n.push(`шаг горизонталей ${r.interval} м вместо ${r.requestedInterval} м`);
        if (r.geoid === false && params.useGeoid !== false && !params.satelliteOnly) n.push('⚠ высоты НЕ в БСВ-77');
        note = n.join('; ');
      }
      if (cancelled.has(job.id)) { cancelled.delete(job.id); try { fs.rmSync(fileOf(job.id), { force: true }); } catch (e) {} run(db(), 'DELETE FROM dem_jobs WHERE id=?', [job.id]); notify({ ...job, status: 'cancelled' }); }
      else {
        const size = fs.statSync(fileOf(job.id)).size;
        run(db(), "UPDATE dem_jobs SET status='done', pct=100, text='Готово', file_size=?, note=?, finished_at=datetime('now','localtime') WHERE id=?", [size, note, job.id]);
        notify({ ...job, status: 'done', pct: 100, text: 'Готово' });
      }
    } catch (e) {
      const msg = String(e.message || e).slice(0, 1000);
      run(db(), "UPDATE dem_jobs SET status='error', error=?, text='Ошибка', finished_at=datetime('now','localtime') WHERE id=?", [msg, job.id]);
      notify({ ...job, status: 'error', pct: 0, text: 'Ошибка', error: msg });
    } finally {
      busy = false;
      sweep();
      setImmediate(tick);
    }
  }
  setTimeout(tick, 1500);

  // Поставить в очередь: { kind:'dem'|'batch', title, params, user_name }
  app.post('/api/dem/jobs', wrap((req, res) => {
    if (!demProcessor) return res.status(503).json({ error: 'DEM процессор не доступен' });
    const b = req.body || {};
    const kind = b.kind === 'batch' ? 'batch' : 'dem';
    const p = b.params || {};
    if (kind === 'dem' && !(p.bbox && p.bbox.minLat != null)) return res.status(400).json({ error: 'Не указана область (bbox)' });
    if (kind === 'batch' && !(Array.isArray(p.items) && p.items.length)) return res.status(400).json({ error: 'Нет участков для выгрузки' });
    const id = uuid();
    const fname = String(b.file_name || (kind === 'batch' ? 'ArcticDEM_пакет.zip' : 'ArcticDEM.zip')).replace(/[\\/:*?"<>|]+/g, '_');
    run(db(), 'INSERT INTO dem_jobs(id,kind,title,params_json,file_name,user_name) VALUES(?,?,?,?,?,?)',
      [id, kind, String(b.title || '').slice(0, 300), JSON.stringify(p), fname, String(b.user_name || '').slice(0, 100)]);
    const pos = get(db(), "SELECT COUNT(*) n FROM dem_jobs WHERE status IN ('queued','running')").n;
    setImmediate(tick);
    res.json({ id, position: pos });
  }));

  // Список: ?user=<имя> — только свои; без параметра — все (последние 100)
  app.get('/api/dem/jobs', wrap((req, res) => {
    const u = req.query.user;
    const rows = u ? all(db(), 'SELECT * FROM dem_jobs WHERE user_name=? ORDER BY created_at DESC, rowid DESC LIMIT 100', [u])
      : all(db(), 'SELECT * FROM dem_jobs ORDER BY created_at DESC, rowid DESC LIMIT 100');
    res.json(rows.map(pub));
  }));

  app.get('/api/dem/jobs/:id/file', (req, res) => {
    const j = get(db(), 'SELECT * FROM dem_jobs WHERE id=?', [req.params.id]);
    if (!j || j.status !== 'done' || !fs.existsSync(fileOf(j.id))) return res.status(404).json({ error: 'Файл не найден (возможно, удалён по сроку)' });
    res.setHeader('Content-Type', 'application/zip');
    attach(res, j.file_name || 'export.zip');
    fs.createReadStream(fileOf(j.id)).pipe(res);
  });

  // Удалить готовое / отменить ожидающее / снять выполняющееся
  app.delete('/api/dem/jobs/:id', wrap((req, res) => {
    const j = get(db(), 'SELECT * FROM dem_jobs WHERE id=?', [req.params.id]);
    if (!j) return res.status(404).json({ error: 'Not found' });
    if (j.status === 'running') { cancelled.add(j.id); run(db(), "UPDATE dem_jobs SET text='Отменяется…' WHERE id=?", [j.id]); return res.json({ ok: true, cancelling: true }); }
    try { fs.rmSync(fileOf(j.id), { force: true }); } catch (e) {}
    run(db(), 'DELETE FROM dem_jobs WHERE id=?', [j.id]);
    notify({ ...j, status: 'cancelled' });
    res.json({ ok: true });
  }));
};
module.exports.runDemBatch = runDemBatch;
module.exports.demParams = demParams;
module.exports._EXPORT_DIR = EXPORT_DIR;
