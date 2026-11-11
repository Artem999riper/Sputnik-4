// ═══════════════════════════════════════════════════════════
// routes/usage.js — «📈 Активность» для админа: кто какими функциями пользуется
// и какую нагрузку даёт серверу.
//  • middleware считает каждый запрос к API: человек (X-User-Name), функция
//    (по адресу и методу — понятным названием), отдано байт, время сервера, мс;
//    итоги по дням — в таблице usage_daily (хранится 180 дней), запись раз в минуту;
//  • действия, которые делаются только в браузере (отчёт заказчику, каталог
//    координат, экспорт в CSV/GPX…), браузер сообщает через POST /api/usage;
//  • «сейчас»: запросы и трафик каждого за последние 5 минут + загрузка
//    процессора и памяти сервера (замер раз в 5 с).
// ═══════════════════════════════════════════════════════════
const os = require('os');
const { all, get, run } = require('../database');
const { wrap } = require('./validate');

const ANAL = { contours: 'горизонтали', slope: 'уклоны', flow: 'линии стока', watershed: 'водосбор', compare: 'сравнение со съёмкой', aspect: 'экспозиция' };
const W = m => m !== 'GET';
// [метод ('ANY' | 'W' — любой кроме GET | конкретный), путь, название или функция(req)]
const RULES = [
  ['POST', /^\/api\/layers-get$/, 'Просмотр и обновление данных'],          // докачка слоёв — это чтение
  ['W', /^\/api\/(ui-settings|notifications\/read|app-settings\/)/, 'Просмотр и обновление данных'],
  ['W', /^\/api\/dem\/(jobs\/|tiles|download-geoid)/, 'Рельеф: очередь и кэш'],
  ['DELETE', /^\/api\/photos\//, 'Фото: удаление'],
  ['POST', /^\/api\/restore$/, 'Отмена удаления'],
  ['POST', /^\/api\/dem\/jobs$/, r => { const b = r.body || {}, p = b.params || {}; return b.kind === 'batch' ? 'Рельеф: пакетная выгрузка' : p.satelliteOnly ? 'Подложка: выгрузка' : 'Рельеф: выгрузка (горизонтали, DXF)'; }],
  ['POST', /^\/api\/dem\/export(-batch)?$/, 'Рельеф: выгрузка (горизонтали, DXF)'],
  ['POST', /^\/api\/dem\/analysis$/, r => 'Анализ рельефа: ' + (ANAL[(r.body || {}).mode] || 'другое')],
  ['POST', /^\/api\/dem\/flood$/, 'Зона затопления'],
  ['GET', /^\/api\/elevation\/point$/, 'Отметка высоты в точке'],
  ['POST', /^\/api\/elevation\/profile$/, 'Профиль высот'],
  ['POST', /^\/api\/export-tiles$/, 'Подложка: выгрузка тайлов'],
  ['ANY', /^\/api\/situation\//, 'Ситуация из OSM'],
  ['POST', /^\/api\/gis\/op$/, 'ГИС-операции (буфер, обрезка…)'],
  ['POST', /^\/api\/layers\/export-(\w+)$/, r => 'Экспорт слоёв: ' + r.path.split('-').pop().toUpperCase()],
  ['POST', /^\/api\/layers\/import-(\w+)$/, r => 'Импорт слоёв: ' + r.path.split('-').pop().toUpperCase()],
  ['POST', /^\/api\/layers$/, 'Слои: создание и импорт'],
  ['PUT', /^\/api\/layers\/[^/]+\/style$/, 'Слои: стиль'],
  ['PUT', /^\/api\/layers\/[^/]+$/, 'Слои: правка объектов'],
  ['DELETE', /^\/api\/layers\/[^/]+$/, 'Слои: удаление'],
  ['W', /^\/api\/layers(-trash|\/[^/]+\/versions)/, 'Слои: корзина и версии'],
  ['W', /^\/api\/layers\/order$/, 'Слои: порядок'],
  ['PATCH', /^\/api\/layers\/[^/]+\/visible$/, 'Слои: видимость для всех'],
  ['POST', /^\/api\/(volumes\/[^/]+|sites\/[^/]+)\/progress$/, 'Объёмы: выполнение вручную'],
  ['W', /^\/api\/(volumes|vol_progress)/, 'Объёмы: правка'],
  ['GET', /^\/api\/dashboard$/, 'Дашборд'],
  ['GET', /^\/api\/search$/, 'Поиск'],
  ['W', /^\/api\/(sites|kameral|remarks|progress|tasks)/, 'Объекты: правка'],
  ['W', /^\/api\/(pgk|bases|materials|equip|mto|spare|fuel|inventory|mat_groups)/, 'Сотрудники, техника, материалы: правка'],
  ['W', /^\/api\/(cargo|gtasks)/, 'Грузы и задачи: правка'],
  ['ANY', /^\/api\/field\//, 'Полевые данные'],
  ['POST', /^\/api\/photos\/upload$/, 'Фото: загрузка'],
  ['W', /^\/api\/backups\//, 'Резервные копии'],
  ['ANY', /^\/api\/admin\//, 'Администрирование'],
];
// действия только в браузере — допустимые названия (POST /api/usage)
const CLIENT = new Set(['Отчёт для заказчика', 'Каталог координат', 'Ведомость выработок', 'Экспорт: CSV', 'Экспорт: GPX', 'Экспорт: GeoJSON',
  'Ситуация по подложке (снимок/топокарта)', 'Таблица атрибутов', 'Пересчёт координат', 'Печать / снимок карты']);
const SKIP = /^\/api\/(events|ping|version|client-errors|editing|usage|presence|me\/caps)(\/|$)/;

function classify(req) {
  const m = req.method, p = req.path;
  for (const [mm, re, lab] of RULES) {
    if (mm === 'ANY' || mm === m || (mm === 'W' && W(m))) { if (re.test(p)) return typeof lab === 'function' ? lab(req) : lab; }
  }
  return m === 'GET' ? 'Просмотр и обновление данных' : 'Прочие изменения';
}
const uname = req => { let n = req.get('X-User-Name') || ''; try { n = decodeURIComponent(n); } catch (e) {} n = n.trim().slice(0, 120); return n; };
const dayOf = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

module.exports = (app, getDb, { isLoopback, isAdmin }) => {
  const ACC = new Map();      // day|user|feature → {n, bytes, ms}
  const LIVE = new Map();     // user → [[t, bytes, ms], …] за последние 5 мин
  const LAST = new Map();     // user → {t, feature}
  const add = (user, feature, bytes, ms) => {
    const k = dayOf() + '|' + user + '|' + feature, a = ACC.get(k) || { n: 0, bytes: 0, ms: 0 };
    a.n++; a.bytes += bytes; a.ms += ms; ACC.set(k, a);
    const L = LIVE.get(user) || []; L.push([Date.now(), bytes, ms]); LIVE.set(user, L);
    if (!/^Просмотр/.test(feature)) LAST.set(user, { t: Date.now(), feature });
  };
  let inited = false;
  const init = d => {
    if (inited) return; inited = true;
    d.exec(`CREATE TABLE IF NOT EXISTS usage_daily (day TEXT NOT NULL, user_name TEXT NOT NULL, feature TEXT NOT NULL,
      n INTEGER DEFAULT 0, bytes INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, PRIMARY KEY(day, user_name, feature))`);
    d.exec("DELETE FROM usage_daily WHERE day < date('now','localtime','-180 days')");
  };
  const flush = () => {
    if (!ACC.size) return;
    const d = getDb(); if (!d) return;
    try {
      init(d);
      const st = d.prepare(`INSERT INTO usage_daily(day,user_name,feature,n,bytes,ms) VALUES(?,?,?,?,?,?)
        ON CONFLICT(day,user_name,feature) DO UPDATE SET n=n+excluded.n, bytes=bytes+excluded.bytes, ms=ms+excluded.ms`);
      const rows = [...ACC.entries()]; ACC.clear();
      d.transaction(() => rows.forEach(([k, a]) => { const [day, u, f] = k.split('|'); st.run(day, u, f, a.n, a.bytes, Math.round(a.ms)); }))();
    } catch (e) { console.warn('[usage] запись не удалась:', e.message); }
  };
  setInterval(flush, 60000).unref();
  process.on('exit', flush);

  // ── загрузка сервера: замер раз в 5 с ──
  const SRV = { cpu: 0, nodeCpu: 0 };
  let pc = process.cpuUsage(), pt = process.hrtime.bigint(), sc = os.cpus();
  setInterval(() => {
    const now = process.hrtime.bigint(), dt = Number(now - pt) / 1000;          // мкс
    const u = process.cpuUsage(pc); pc = process.cpuUsage(); pt = now;
    SRV.nodeCpu = Math.round((u.user + u.system) / dt / os.cpus().length * 100);
    const c2 = os.cpus(); let idle = 0, tot = 0;
    c2.forEach((c, i) => { const a = c.times, b = (sc[i] || c).times; const t = (a.user + a.nice + a.sys + a.irq + a.idle) - (b.user + b.nice + b.sys + b.irq + b.idle); tot += t; idle += a.idle - b.idle; });
    sc = c2; SRV.cpu = tot > 0 ? Math.round((1 - idle / tot) * 100) : 0;
    const lim = Date.now() - 5 * 60000;
    for (const [k, L] of LIVE) { const f = L.filter(x => x[0] >= lim); if (f.length) LIVE.set(k, f); else LIVE.delete(k); }
  }, 5000).unref();

  // ── учёт каждого запроса ──
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') || SKIP.test(req.path)) return next();
    const t0 = process.hrtime.bigint();
    let bytes = 0;
    const w = res.write, e = res.end;
    res.write = function (chunk, ...a) { if (chunk) bytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length || 0; return w.call(this, chunk, ...a); };
    res.end = function (chunk, ...a) { if (chunk && typeof chunk !== 'function') bytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length || 0; return e.call(this, chunk, ...a); };
    res.on('finish', () => {
      try {
        const user = uname(req) || (isLoopback(req) ? 'Компьютер-сервер' : '(без имени)');
        add(user, classify(req), bytes, Number(process.hrtime.bigint() - t0) / 1e6);
      } catch (er) {}
    });
    next();
  });

  // действия, которые выполняются только в браузере
  app.post('/api/usage', (req, res) => {
    const f = String((req.body || {}).f || '');
    if (CLIENT.has(f)) add(uname(req) || (isLoopback(req) ? 'Компьютер-сервер' : '(без имени)'), f, 0, 0);
    res.json({ ok: true });
  });

  const adminOnly = (req, res) => { if (isAdmin(req)) return true; res.status(403).json({ error: 'Только для админа' }); return false; };

  // сводка по людям за период: ?days=1|7|30|90
  app.get('/api/admin/usage', wrap((req, res) => {
    if (!adminOnly(req, res)) return;
    flush();
    const d = getDb(); init(d);
    const days = Math.max(1, Math.min(180, parseInt(req.query.days) || 7));
    const from = `date('now','localtime','-${days - 1} days')`;
    const rows = all(d, `SELECT user_name, feature, SUM(n) n, SUM(bytes) bytes, SUM(ms) ms FROM usage_daily WHERE day >= ${from} GROUP BY user_name, feature`);
    const users = {};
    rows.forEach(r => {
      const u = users[r.user_name] = users[r.user_name] || { name: r.user_name, n: 0, bytes: 0, ms: 0, actions: 0, top: [] };
      u.n += r.n; u.bytes += r.bytes; u.ms += r.ms;
      if (!/^Просмотр/.test(r.feature)) { u.actions += r.n; u.top.push({ f: r.feature, n: r.n }); }
    });
    // выгрузки рельефа и подложки: сколько и сколько минут их обрабатывал сервер
    let jobs = []; try { jobs = all(d, `SELECT user_name, COUNT(*) n, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) ok,
      SUM(MAX(0, (julianday(COALESCE(finished_at, datetime('now','localtime'))) - julianday(started_at)) * 86400)) sec
      FROM dem_jobs WHERE started_at IS NOT NULL AND date(created_at) >= ${from} GROUP BY user_name`); } catch (e) {}
    jobs.forEach(j => { const u = users[j.user_name || '(без имени)'] = users[j.user_name || '(без имени)'] || { name: j.user_name || '(без имени)', n: 0, bytes: 0, ms: 0, actions: 0, top: [] }; u.jobs = j.n; u.jobsOk = j.ok; u.jobSec = Math.round(j.sec || 0); });
    // время в программе (сеансы)
    let ses = []; try { ses = all(d, `SELECT user_name, SUM((julianday(COALESCE(ended_at,last_seen)) - julianday(started_at)) * 1440) min FROM user_sessions WHERE date(started_at) >= ${from} GROUP BY user_name`); } catch (e) {}
    ses.forEach(s => { if (users[s.user_name]) users[s.user_name].online_min = Math.round(s.min || 0); });
    const list = Object.values(users).map(u => ({ ...u, top: u.top.sort((a, b) => b.n - a.n).slice(0, 4) })).sort((a, b) => b.ms + b.bytes / 1e4 + (b.jobSec || 0) * 1000 - (a.ms + a.bytes / 1e4 + (a.jobSec || 0) * 1000));
    res.json({ days, users: list, total: { n: list.reduce((s, u) => s + u.n, 0), bytes: list.reduce((s, u) => s + u.bytes, 0), ms: list.reduce((s, u) => s + u.ms, 0) } });
  }));

  // профиль человека: функции, по дням, выгрузки
  app.get('/api/admin/usage/user', wrap((req, res) => {
    if (!adminOnly(req, res)) return;
    flush();
    const d = getDb(); init(d);
    const name = String(req.query.name || ''), days = Math.max(1, Math.min(180, parseInt(req.query.days) || 30));
    const from = `date('now','localtime','-${days - 1} days')`;
    const features = all(d, `SELECT feature, SUM(n) n, SUM(bytes) bytes, SUM(ms) ms, MAX(day) last FROM usage_daily WHERE user_name=? AND day >= ${from} GROUP BY feature ORDER BY n DESC`, [name]);
    const byDay = all(d, `SELECT day, SUM(n) n, SUM(bytes) bytes, SUM(ms) ms, SUM(CASE WHEN feature NOT LIKE 'Просмотр%' THEN n ELSE 0 END) actions FROM usage_daily WHERE user_name=? AND day >= ${from} GROUP BY day ORDER BY day`, [name]);
    let jobs = []; try { jobs = all(d, `SELECT id, kind, title, status, file_size, created_at, started_at, finished_at, params_json FROM dem_jobs WHERE user_name=? AND date(created_at) >= ${from} ORDER BY created_at DESC LIMIT 50`, [name])
      .map(j => { let p = {}; try { p = JSON.parse(j.params_json || '{}'); } catch (e) {} const sec = j.started_at ? Math.round((Date.parse((j.finished_at || new Date().toISOString()).replace(' ', 'T')) - Date.parse(j.started_at.replace(' ', 'T'))) / 1000) : null;
        return { title: j.title, kind: j.kind === 'batch' ? 'пакет' : p.satelliteOnly ? 'подложка' : 'рельеф', status: j.status, size: j.file_size, at: j.created_at, sec }; }); } catch (e) {}
    let sessions = []; try { sessions = all(d, `SELECT started_at, COALESCE(ended_at,last_seen) ended, ip FROM user_sessions WHERE user_name=? AND date(started_at) >= ${from} ORDER BY started_at DESC LIMIT 30`, [name]); } catch (e) {}
    res.json({ name, days, features, byDay, jobs, sessions });
  }));

  // «сейчас»: нагрузка сервера и каждого за 5 минут
  app.get('/api/admin/usage/live', wrap((req, res) => {
    if (!adminOnly(req, res)) return;
    const users = [...LIVE.entries()].map(([name, L]) => {
      const span = Math.max(1, Math.min(5, (Date.now() - L[0][0]) / 60000));
      const last = LAST.get(name);
      return { name, span: +span.toFixed(1), rpm: +(L.length / span).toFixed(1), kbpm: Math.round(L.reduce((s, x) => s + x[1], 0) / 1024 / span), cpuMsPm: Math.round(L.reduce((s, x) => s + x[2], 0) / span), last: last && Date.now() - last.t < 600000 ? last.feature : '' };
    }).sort((a, b) => b.kbpm - a.kbpm);
    let jobs = []; try { jobs = all(getDb(), "SELECT user_name, title, pct, text FROM dem_jobs WHERE status='running'"); } catch (e) {}
    res.json({ server: { cpu: SRV.cpu, nodeCpu: SRV.nodeCpu, memUsedPct: Math.round((1 - os.freemem() / os.totalmem()) * 100), memTotalGb: +(os.totalmem() / 1073741824).toFixed(1),
      rssMb: Math.round(process.memoryUsage().rss / 1048576), cores: os.cpus().length, uptimeMin: Math.round(process.uptime() / 60) }, users, jobs });
  }));
};
module.exports._classify = classify;
