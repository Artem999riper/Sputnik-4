// ═══════════════════════════════════════════════════════════
// routes/dashboard.js — сводка для «📊 Дашборда» одним запросом (/api/dashboard):
//   • объекты: объёмы план/факт, темп за 7 дней, прогноз окончания, отставание
//     от срока договора, рамка объекта (по его слоям) для мини-карты;
//   • лента выполнения за сегодня и вчера (vol_progress — в т. ч. зеркало отметок слоёв);
//   • выполнение по неделям (13 недель) — доля плана по каждому объекту;
//   • «требует внимания»: просроченные задачи, открытые замечания камеральных отчётов,
//     документы сотрудников и поверка приборов (истекают ≤ 30 дн.), материалы ниже
//     минимума, неисправная техника, заявки на груз без движения;
//   • люди: на вахте сейчас по базам (и нормы баз), заезды и выезды на 7 дней.
// Недобур / перебур и незаполненные характеристики считает браузер (feat-sem.js).
// ═══════════════════════════════════════════════════════════
const { all, get } = require('../database');
const { wrap } = require('./validate');

const day = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return day(d); };
// понедельник недели даты
const monday = (s) => { const d = new Date(s + 'T00:00:00Z'); const w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return day(d); };
const ru = s => s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : '';
const parse = (s, def) => { try { return JSON.parse(s); } catch (e) { return def; } };

// рамка слоя [minLng, minLat, maxLng, maxLat] — кэш по длине и началу текста geojson
const _bbCache = new Map();
function layerBBox(id, gjText) {
  if (!gjText) return null;
  const key = gjText.length + ':' + gjText.slice(-64);
  const c = _bbCache.get(id); if (c && c.key === key) return c.bb;
  let bb = null;
  const gj = parse(gjText, null);
  const walk = (a) => {
    if (!Array.isArray(a)) return;
    if (typeof a[0] === 'number') {
      const x = a[0], y = a[1]; if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(y) > 90) return;
      if (!bb) bb = [x, y, x, y]; else { if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y; }
    } else a.forEach(walk);
  };
  const geom = (g) => { if (!g) return; if (g.type === 'GeometryCollection') (g.geometries || []).forEach(geom); else walk(g.coordinates); };
  if (gj) (gj.features || (gj.type === 'Feature' ? [gj] : [{ geometry: gj }])).forEach(f => geom(f && f.geometry));
  _bbCache.set(id, { key, bb });
  return bb;
}

module.exports = (app, getDb) => {
  app.get('/api/dashboard', wrap((req, res) => {
    const d = getDb();
    const now = new Date(), today = day(new Date(now.getTime() - now.getTimezoneOffset() * 60000)),   // местная дата сервера
      yest = addDays(today, -1), wk = addDays(today, -6), in7 = addDays(today, 7), in30 = addDays(today, 30);
    const WEEKS = 13, w0 = addDays(monday(today), -7 * (WEEKS - 1));
    const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(w0, 7 * i));

    const workers = all(d, 'SELECT id, name, role, base_id, status, start_date FROM pgk_workers');
    const wName = Object.fromEntries(workers.map(w => [String(w.id), w.name]));
    const bases = all(d, 'SELECT id, name, lat, lng FROM bases');
    const bName = Object.fromEntries(bases.map(b => [b.id, b.name]));
    const names = (ids) => String(ids || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean).map(x => wName[x] || x);

    // ── объекты и объёмы ──
    const sites = all(d, 'SELECT id, name, client, contract_number, status, start_date, end_date, estimated_end, completion_percent FROM sites ORDER BY name');
    const vols = all(d, 'SELECT id, site_id, category, name, amount, unit, amount2, measure_json, layer_id, plan_start, plan_end, color FROM volumes');
    const FACT = "COALESCE(row_type,'fact') NOT IN ('plan','act')";
    const tot = Object.fromEntries(all(d, `SELECT volume_id, SUM(completed) c, SUM(COALESCE(amount2,0)) c2, MAX(work_date) last FROM vol_progress WHERE ${FACT} GROUP BY volume_id`).map(r => [r.volume_id, r]));
    const last7 = Object.fromEntries(all(d, `SELECT volume_id, SUM(completed) c, SUM(COALESCE(amount2,0)) c2 FROM vol_progress WHERE ${FACT} AND work_date>=? AND work_date<=? GROUP BY volume_id`, [wk, today]).map(r => [r.volume_id, r]));
    const last28 = Object.fromEntries(all(d, `SELECT volume_id, SUM(completed) c FROM vol_progress WHERE ${FACT} AND work_date>=? AND work_date<=? GROUP BY volume_id`, [addDays(today, -27), today]).map(r => [r.volume_id, r]));
    const weekly = all(d, `SELECT volume_id, site_id, work_date, SUM(completed) c, SUM(COALESCE(amount2,0)) c2 FROM vol_progress WHERE ${FACT} AND work_date>=? GROUP BY volume_id, work_date`, [w0]);
    const layerRows = all(d, 'SELECT id, site_id, geojson FROM kml_layers WHERE site_id IS NOT NULL OR id IN (SELECT layer_id FROM volumes WHERE layer_id IS NOT NULL)');
    const lById = Object.fromEntries(layerRows.map(l => [l.id, l]));

    const volOut = {};
    vols.forEach(v => {
      const m = parse(v.measure_json || '{}', {}) || {};
      const t = tot[v.id] || {}, l7 = last7[v.id] || {}, l28 = last28[v.id] || {};
      const plan = +v.amount || 0, done = +t.c || 0, left = Math.max(0, plan - done);
      // темп — средний за 7 дней, а если за неделю ничего — за 4 недели
      const rate = (+l7.c || 0) > 0 ? (+l7.c) / 7 : (+l28.c || 0) / 28;
      const fc = left <= 0 ? null : rate > 0 ? addDays(today, Math.ceil(left / rate)) : 'never';
      (volOut[v.site_id] = volOut[v.site_id] || []).push({
        id: v.id, name: v.name, category: v.category, color: v.color, unit: v.unit || m.unit || 'шт',
        plan, done, last7: +l7.c || 0, plan2: v.amount2, done2: +t.c2 || 0, last7_2: +l7.c2 || 0,
        unit2: m.second ? (m.second.unit || '') : '', layer_id: v.layer_id, last: t.last || null,
        plan_end: v.plan_end || null, forecast: fc, pct: plan > 0 ? Math.min(100, done / plan * 100) : 0,
      });
    });
    const sitesOut = sites.map(s => {
      const vs = volOut[s.id] || [];
      const withPlan = vs.filter(v => v.plan > 0);
      const pct = withPlan.length ? withPlan.reduce((a, v) => a + v.pct, 0) / withPlan.length : (+s.completion_percent || 0);
      // прогноз объекта — самый поздний по объёмам; 'never' — работы стоят
      let fc = null;
      for (const v of withPlan) { if (v.forecast === 'never') { fc = 'never'; break; } if (v.forecast && (!fc || v.forecast > fc)) fc = v.forecast; }
      const deadline = s.end_date || s.estimated_end || null;
      const late = !!(deadline && s.status === 'active' && withPlan.some(v => v.pct < 100) && (fc === 'never' ? today > addDays(deadline, -30) : fc && fc > deadline));
      let bb = null;
      const lids = new Set(layerRows.filter(l => l.site_id === s.id).map(l => l.id)); vs.forEach(v => v.layer_id && lids.add(v.layer_id));
      lids.forEach(id => { const l = lById[id]; const b = l && layerBBox(id, l.geojson); if (b) bb = bb ? [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])] : b.slice(); });
      const lastWork = vs.reduce((a, v) => (v.last && (!a || v.last > a) ? v.last : a), null);
      return { id: s.id, name: s.name, client: s.client, status: s.status, start_date: s.start_date, deadline, pct, forecast: fc, late, lastWork,
        last7: vs.reduce((a, v) => a + (v.plan > 0 ? v.last7 / v.plan * 100 : 0), 0) / (withPlan.length || 1), volumes: vs, bbox: bb };
    });

    // ── по неделям: доля плана объекта (средняя по объёмам с планом) ──
    const volPlan = Object.fromEntries(vols.map(v => [v.id, { plan: +v.amount || 0, site: v.site_id }]));
    const nPlan = {}; vols.forEach(v => { if (+v.amount > 0) nPlan[v.site_id] = (nPlan[v.site_id] || 0) + 1; });
    const wSite = {};   // site → [pct по неделям]
    weekly.forEach(r => {
      const vp = volPlan[r.volume_id]; if (!vp || !vp.plan) return;
      const i = weeks.indexOf(monday(r.work_date)); if (i < 0) return;
      const a = wSite[vp.site] = wSite[vp.site] || new Array(WEEKS).fill(0);
      a[i] += (+r.c || 0) / vp.plan * 100 / (nPlan[vp.site] || 1);
    });

    // ── лента: сегодня и вчера ──
    const feed = all(d, `SELECT p.site_id, p.volume_id, p.work_date, SUM(p.completed) c, SUM(COALESCE(p.amount2,0)) c2, GROUP_CONCAT(p.worker_ids, ',') w, COUNT(*) n
      FROM vol_progress p WHERE ${FACT.replace(/row_type/g, 'p.row_type')} AND p.work_date>=? GROUP BY p.site_id, p.volume_id, p.work_date ORDER BY p.work_date DESC`, [yest])
      .map(r => {
        const v = vols.find(x => x.id === r.volume_id) || {}, m = parse(v.measure_json || '{}', {}) || {};
        return { site_id: r.site_id, volume_id: r.volume_id, date: r.work_date, done: +r.c || 0, done2: +r.c2 || 0, unit: v.unit || 'шт', unit2: m.second ? m.second.unit || '' : '',
          volume: v.name || '', layer_id: v.layer_id || null, who: [...new Set(names(r.w))].slice(0, 8) };
      });

    // ── требует внимания ──
    const att = [];
    all(d, "SELECT t.id, t.title, t.due_date, t.site_id, s.name site FROM site_tasks t LEFT JOIN sites s ON s.id=t.site_id WHERE t.status!='done' AND t.due_date IS NOT NULL AND t.due_date<>'' AND t.due_date<=?", [addDays(today, 3)])
      .forEach(t => att.push({ kind: 'task', sev: t.due_date < today ? 2 : 1, date: t.due_date, title: t.title, sub: t.site || '', site_id: t.site_id, id: t.id }));
    all(d, "SELECT id, title, due_date, site_id FROM global_tasks WHERE status NOT IN ('done','closed') AND due_date IS NOT NULL AND due_date<>'' AND due_date<=?", [addDays(today, 3)])
      .forEach(t => att.push({ kind: 'gtask', sev: t.due_date < today ? 2 : 1, date: t.due_date, title: t.title, sub: 'Задачи', site_id: t.site_id, id: t.id }));
    all(d, "SELECT r.site_id, s.name site, COUNT(*) n FROM kameral_remarks m JOIN kameral_reports r ON r.id=m.report_id LEFT JOIN sites s ON s.id=r.site_id WHERE COALESCE(m.status,'open')!='done' AND COALESCE(m.status,'open')!='closed' GROUP BY r.site_id")
      .forEach(r => att.push({ kind: 'remarks', sev: 1, title: `Открытых замечаний к отчётам: ${r.n}`, sub: r.site || '', site_id: r.site_id, n: r.n }));
    all(d, "SELECT dd.id, dd.title, dd.expires, w.id wid, w.name FROM worker_docs dd JOIN pgk_workers w ON w.id=dd.worker_id WHERE COALESCE(w.status,'')!='fired' AND dd.expires IS NOT NULL AND dd.expires<>'' AND dd.expires<=? ORDER BY dd.expires", [in30])
      .forEach(x => att.push({ kind: 'doc', sev: x.expires < today ? 2 : 1, date: x.expires, title: `${x.name}: ${x.title}`, sub: x.expires < today ? 'истёк' : 'истекает', worker_id: x.wid }));
    all(d, "SELECT id, name, serial_number, calib_date FROM pgk_equipment WHERE calib_date IS NOT NULL AND calib_date<>'' AND calib_date<=? AND COALESCE(status,'')!='written_off' ORDER BY calib_date", [in30])
      .forEach(x => att.push({ kind: 'calib', sev: x.calib_date < today ? 2 : 1, date: x.calib_date, title: `Поверка: ${x.name}${x.serial_number ? ' № ' + x.serial_number : ''}`, sub: x.calib_date < today ? 'просрочена' : 'подходит срок', equip_id: x.id }));
    all(d, 'SELECT m.id, m.name, m.amount, m.min_amount, m.unit, m.base_id FROM materials m WHERE m.min_amount>0 AND m.amount<m.min_amount')
      .forEach(x => att.push({ kind: 'mat', sev: x.amount <= 0 ? 2 : 1, title: `${x.name}: ${+x.amount} из ${+x.min_amount} ${x.unit || ''}`, sub: bName[x.base_id] || 'материалы', base_id: x.base_id }));
    all(d, "SELECT id, name, plate_number, base_id FROM pgk_machinery WHERE status='broken'")
      .forEach(x => att.push({ kind: 'mach', sev: 2, title: `Неисправна: ${x.name}${x.plate_number ? ' ' + x.plate_number : ''}`, sub: bName[x.base_id] || 'техника', id: x.id }));
    try {
      all(d, "SELECT id, num, eta_date, base_id FROM cargo_orders WHERE status='transit' AND eta_date IS NOT NULL AND eta_date<>'' AND eta_date<?", [today])
        .forEach(x => att.push({ kind: 'cargo', sev: 1, date: x.eta_date, title: `Груз № ${x.num} опаздывает`, sub: `ожидался ${ru(x.eta_date)}${bName[x.base_id] ? ' · ' + bName[x.base_id] : ''}`, id: x.id }));
    } catch (e) {}
    sitesOut.filter(s => s.late).forEach(s => att.push({ kind: 'late', sev: 2, title: `Отстаёт от срока: ${s.name}`, sub: s.forecast === 'never' ? `работы стоят, срок ${ru(s.deadline)}` : `прогноз ${ru(s.forecast)}, срок ${ru(s.deadline)}`, site_id: s.id }));
    sitesOut.filter(s => s.status === 'active' && s.volumes.some(v => v.plan > 0 && v.pct < 100) && (!s.lastWork || s.lastWork < addDays(today, -7)))
      .forEach(s => { if (!s.late) att.push({ kind: 'idle', sev: 1, title: `Нет выполнения больше недели: ${s.name}`, sub: s.lastWork ? 'последнее ' + ru(s.lastWork) : 'ещё не начинали', site_id: s.id }); });
    att.sort((a, b) => b.sev - a.sev || String(a.date || '9').localeCompare(String(b.date || '9')));

    // ── люди ──
    const norms = parse((get(d, "SELECT value FROM app_settings WHERE key='base_norms'") || {}).value || '{}', {}) || {};
    const onShift = workers.filter(w => w.start_date && w.status !== 'fired')
      .map(w => ({ id: w.id, name: w.name, role: w.role, base_id: w.base_id, base: bName[w.base_id] || 'без базы', since: w.start_date, days: Math.max(0, Math.round((Date.parse(today) - Date.parse(w.start_date)) / 86400000)) + 1 }));
    const byBase = {}; onShift.forEach(w => { (byBase[w.base_id || ''] = byBase[w.base_id || ''] || []).push(w); });
    const basesOut = Object.keys(byBase).concat(Object.keys(norms).filter(id => +norms[id] > 0 && !byBase[id]))
      .map(id => ({ id, name: bName[id] || 'без базы', n: (byBase[id] || []).length, norm: +norms[id] || 0 })).sort((a, b) => b.n - a.n);
    const shifts = all(d, `SELECT s.worker_id, s.base_id, s.start_date, s.end_date, s.planned FROM worker_shifts s
      WHERE (s.start_date>=? AND s.start_date<=?) OR (s.end_date>=? AND s.end_date<=?)`, [today, in7, today, in7]);
    const arrive = [], leave = [];
    shifts.forEach(s => {
      const w = wName[String(s.worker_id)]; if (!w) return;
      if (s.start_date >= today && s.start_date <= in7) arrive.push({ name: w, date: s.start_date, base: bName[s.base_id] || '', planned: !!s.planned });
      if (s.end_date && s.end_date >= today && s.end_date <= in7) leave.push({ name: w, date: s.end_date, base: bName[s.base_id] || '', planned: !!s.planned });
    });
    arrive.sort((a, b) => a.date.localeCompare(b.date)); leave.sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      today, weeks, sites: sitesOut.map(s => Object.assign(s, { weekly: wSite[s.id] || new Array(WEEKS).fill(0) })),
      feed, attention: att,
      people: { onShift: onShift.sort((a, b) => b.days - a.days), bases: basesOut, arrive, leave, total: workers.filter(w => w.status !== 'fired').length },
      basesGeo: bases.filter(b => Number.isFinite(b.lat) && Number.isFinite(b.lng)).map(b => ({ id: b.id, name: b.name, lat: b.lat, lng: b.lng, n: (byBase[b.id] || []).length })),
    });
  }));
};
module.exports._test = { monday, addDays, layerBBox };
