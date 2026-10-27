// ═══════════════════════════════════════════════════════════
// site-report.js — отчёт для заказчика по объекту одной кнопкой:
// реквизиты, карта (подложка + объёмы + базы), объёмы план/факт за период и
// нарастающим итогом, диаграммы, журнал работ, персонал и техника, фото.
// Форматы: Word (.doc — MHTML с картинками) и PDF (печать в PDF из браузера).
// ═══════════════════════════════════════════════════════════
const SREP = { photos: [] };   // фото, добавленные в окне отчёта: [{name, dataUrl}]
const _srCat = { geology: 'Геология', geodesy: 'Геодезия' };
const _srN = (v, d = 2) => v == null || !Number.isFinite(+v) ? '—' : (+v).toLocaleString('ru-RU', { maximumFractionDigits: d });
const _srD = s => { if (!s) return '—'; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : s; };

async function openSiteReport(siteId) {
  siteId = siteId || (currentType === 'site' && currentObj ? currentObj.id : (sites[0] || {}).id);
  if (!siteId) { toast('Нет объектов', 'warn'); return; }
  SREP.photos = [];
  const s = sites.find(x => x.id === siteId) || {};
  const today = new Date().toISOString().slice(0, 10);
  let last = {}; try { last = JSON.parse(localStorage.getItem('srep_opts') || '{}'); } catch (e) {}
  const ck = (id, lbl, def) => `<label style="display:flex;gap:6px;align-items:center;font-size:12px;text-transform:none;font-weight:500;margin:0;padding:2px 0"><input type="checkbox" id="sr-${id}" ${(last[id] ?? def) ? 'checked' : ''} style="width:auto;margin:0"> ${lbl}</label>`;
  showModal('📄 Отчёт для заказчика', `<div style="min-width:min(520px,88vw);display:flex;flex-direction:column;gap:10px">
    <div class="fg" style="margin:0"><label>Объект</label><select id="sr-site" style="width:100%">${sites.map(x => `<option value="${escAttr(x.id)}" ${x.id === siteId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    <div style="display:flex;gap:8px">
      <div class="fg" style="margin:0;flex:1"><label>Период с</label><input id="sr-from" type="date" value="${(s.start_date || '').slice(0, 10)}"></div>
      <div class="fg" style="margin:0;flex:1"><label>по</label><input id="sr-to" type="date" value="${today}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 12px">
      ${ck('map', '🗺 Карта объекта', true)}${ck('sat', '🛰 Карта на спутнике (иначе схема)', true)}
      ${ck('vol', '📦 Объёмы: план / факт', true)}${ck('chart', '📊 Диаграммы', true)}
      ${ck('log', '📒 Журнал работ за период', true)}${ck('team', '👷 Персонал и техника', true)}
      ${ck('tasks', '✅ Задачи и замечания', false)}${ck('photo', '📷 Фото', true)}
    </div>
    <div style="font-size:12px"><b>Фото в отчёт:</b> фото объекта добавятся сами; ещё —
      <label class="btn bs bxs" style="display:inline-flex;margin:0">📎 Выбрать файлы<input type="file" accept="image/*" multiple style="display:none" onchange="_srAddPhotos(this)"></label>
      <span id="sr-ph-n" style="color:var(--tx3)"></span></div>
    <div class="fg" style="margin:0"><label>Комментарий в отчёт (необязательно)</label><textarea id="sr-note" rows="2" placeholder="Например: работы ведутся по графику, задержка из-за погоды…">${esc(last.note || '')}</textarea></div>
    <div id="sr-status" style="font-size:11px;color:var(--acc);font-weight:700;min-height:14px"></div>
  </div>`, [
    { label: 'Отмена', cls: 'bs', fn: closeModal },
    { label: '🖨 PDF', cls: 'bs', fn: () => _srRun('pdf') },
    { label: '📄 Word', cls: 'bp', fn: () => _srRun('doc') },
  ]);
}
function _srAddPhotos(inp) {
  const files = [...inp.files].slice(0, 30);
  let left = files.length;
  files.forEach(f => {
    const rd = new FileReader();
    rd.onload = () => _srShrink(rd.result, 1400).then(u => { SREP.photos.push({ name: f.name.replace(/\.[^.]+$/, ''), dataUrl: u }); if (--left === 0) { const n = document.getElementById('sr-ph-n'); if (n) n.textContent = `добавлено: ${SREP.photos.length}`; } });
    rd.readAsDataURL(f);
  });
}
// Уменьшить фото до maxPx по длинной стороне (JPEG) — отчёт не раздувается
function _srShrink(src, maxPx) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, maxPx / Math.max(im.width, im.height));
      const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      try { res(c.toDataURL('image/jpeg', 0.85)); } catch (e) { res(null); }
    };
    im.onerror = () => res(null);
    im.src = src;
  });
}

// ── Сбор данных ────────────────────────────────────────────
async function _srCollect(siteId, from, to) {
  const o = await fetch(`${API}/sites/${siteId}`).then(r => r.json());
  const fact = (o.vol_progress || []).filter(p => (p.row_type || 'fact') !== 'plan' && !p.hidden);
  const inP = d => (!from || d >= from) && (!to || d <= to);
  const vols = (o.volumes || []).map(v => {
    const rows = fact.filter(p => p.volume_id === v.id);
    const total = rows.filter(p => !to || p.work_date <= to).reduce((s, p) => s + (+p.completed || 0), 0);
    const period = rows.filter(p => inP(p.work_date)).reduce((s, p) => s + (+p.completed || 0), 0);
    const plan = +v.amount || 0;
    return { ...v, plan, total, period, pct: plan ? total / plan * 100 : null, left: plan ? Math.max(0, plan - total) : null };
  });
  const log = fact.filter(p => inP(p.work_date)).sort((a, b) => a.work_date < b.work_date ? 1 : -1);
  const photos = await fetch(`${API}/photos?entity_type=site&entity_id=${encodeURIComponent(siteId)}`).then(r => r.json()).catch(() => []);
  return { o, vols, fact, log, photos };
}

// ── Карта: подложка с сервера + объёмы и базы, рисуем сами ─
async function _srMapImage(o, sat) {
  const feats = [];
  (o.volumes || []).forEach(v => { try { const g = JSON.parse(v.geojson); (g.type === 'FeatureCollection' ? g.features : [g.type === 'Feature' ? g : { type: 'Feature', geometry: g }]).forEach(f => f && f.geometry && feats.push({ f, color: v.color || '#1a56db', kind: 'vol' })); } catch (e) {} });
  (o.vol_progress || []).forEach(p => { if (!p.geojson || p.hidden) return; try { const g = JSON.parse(p.geojson); (g.type === 'FeatureCollection' ? g.features : [g.type === 'Feature' ? g : { type: 'Feature', geometry: g }]).forEach(f => f && f.geometry && feats.push({ f, color: '#16a34a', kind: 'fact' })); } catch (e) {} });
  (layers || []).forEach(l => {
    const g = l.group_id && typeof kmGroups === 'object' ? kmGroups[l.group_id] : null;
    const ids = g ? (g.site_ids || (g.site_id ? [g.site_id] : [])) : [];
    if (l.site_id !== o.id && !ids.includes(o.id)) return;
    try { const gj = JSON.parse(l.geojson); (gj.features || []).forEach(f => f && f.geometry && !(f.properties || {})._hidden && feats.push({ f, color: (f.properties || {})._color || l.color || '#7c3aed', kind: 'kml' })); } catch (e) {}
  });
  const bases = (o.bases || []).filter(b => b && b.lat && b.lng);
  const pts = [];
  const walk = c => { if (typeof c[0] === 'number') pts.push(c); else c.forEach(walk); };
  feats.forEach(x => walk(x.f.geometry.coordinates || []));
  bases.forEach(b => pts.push([b.lng, b.lat]));
  if (!pts.length) return null;
  let minLng = Math.min(...pts.map(p => p[0])), maxLng = Math.max(...pts.map(p => p[0])), minLat = Math.min(...pts.map(p => p[1])), maxLat = Math.max(...pts.map(p => p[1]));
  const padX = Math.max((maxLng - minLng) * 0.08, 0.002), padY = Math.max((maxLat - minLat) * 0.08, 0.001);
  minLng -= padX; maxLng += padX; minLat -= padY; maxLat += padY;
  const W = 1600, H = 1000;
  const wx = (lng, z) => (lng + 180) / 360 * 256 * 2 ** z;
  const wy = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * 2 ** z; };
  let z = 18;
  while (z > 3 && (wx(maxLng, z) - wx(minLng, z) > W || wy(minLat, z) - wy(maxLat, z) > H)) z--;
  const cx = (wx(minLng, z) + wx(maxLng, z)) / 2, cy = (wy(minLat, z) + wy(maxLat, z)) / 2;
  const x0 = cx - W / 2, y0 = cy - H / 2;
  const P = (lng, lat) => [wx(lng, z) - x0, wy(lat, z) - y0];
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = sat ? '#3f4a3c' : '#eef2f0'; g.fillRect(0, 0, W, H);
  // подложка — тайлы через сервер (без ограничений CORS у холста)
  try {
    const tl = [Math.floor(x0 / 256), Math.floor(y0 / 256)], br = [Math.floor((x0 + W) / 256), Math.floor((y0 + H) / 256)];
    const inv = (px, py) => ({ lng: px / (256 * 2 ** z) * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * py / (256 * 2 ** z)))) * 180 / Math.PI });
    const a = inv(x0, y0 + H), b = inv(x0 + W, y0);
    const r = await fetch(`${API}/export-tiles`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bbox: { minLng: a.lng, minLat: a.lat, maxLng: b.lng, maxLat: b.lat }, minZoom: z, maxZoom: z, source: sat ? 'sat' : 'map' }) }).then(r => r.json());
    const jobs = [];
    for (let tx = tl[0]; tx <= br[0]; tx++) for (let ty = tl[1]; ty <= br[1]; ty++) {
      const b64 = r && r.tiles && r.tiles[`${z}/${tx}/${ty}`]; if (!b64) continue;
      jobs.push(new Promise(ok => { const im = new Image(); im.onload = () => { g.drawImage(im, tx * 256 - x0, ty * 256 - y0); ok(); }; im.onerror = ok; im.src = (b64.startsWith('/9j') ? 'data:image/jpeg;base64,' : 'data:image/png;base64,') + b64; }));
    }
    await Promise.all(jobs);
  } catch (e) {}
  // объекты
  const drawGeom = (geom, color, kind) => {
    const t = geom.type, c = geom.coordinates;
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = kind === 'fact' ? 7 : 5;
    const path = ring => { ring.forEach((p, i) => { const [x, y] = P(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); };
    if (/Polygon/.test(t)) {
      (t === 'Polygon' ? [c] : c).forEach(poly => { g.beginPath(); poly.forEach(r => { path(r); g.closePath(); }); g.globalAlpha = kind === 'kml' ? 0.12 : 0.28; g.fill('evenodd'); g.globalAlpha = 1; g.stroke(); });
    } else if (/LineString/.test(t)) {
      (t === 'LineString' ? [c] : c).forEach(l => { g.beginPath(); path(l); g.stroke(); });
    } else if (/Point/.test(t)) {
      (t === 'Point' ? [c] : c).forEach(p => { const [x, y] = P(p[0], p[1]); g.beginPath(); g.arc(x, y, kind === 'fact' ? 11 : 10, 0, 7); g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke(); });
    } else if (t === 'GeometryCollection') (geom.geometries || []).forEach(x => drawGeom(x, color, kind));
  };
  ['kml', 'vol', 'fact'].forEach(k => feats.filter(x => x.kind === k).forEach(x => drawGeom(x.f.geometry, x.color, k)));
  g.font = 'bold 34px sans-serif';
  bases.forEach(b => {
    const [x, y] = P(b.lng, b.lat);
    g.fillStyle = '#7c3aed'; g.beginPath(); g.arc(x, y, 16, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
    g.lineWidth = 8; g.strokeStyle = 'rgba(255,255,255,.92)'; g.strokeText(b.name || '', x + 24, y + 12); g.fillStyle = '#3b0764'; g.fillText(b.name || '', x + 24, y + 12);
  });
  // масштабная линейка и север
  const mpp = 156543.034 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180) / 2 ** z;
  const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].find(m => m / mpp > 260) || 50000;
  const len = nice / mpp;
  g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(20, H - 96, len + 48, 76);
  g.fillStyle = '#111'; g.fillRect(44, H - 44, len, 8); g.fillRect(44, H - 56, 4, 22); g.fillRect(44 + len - 4, H - 56, 4, 22);
  g.font = 'bold 30px sans-serif'; g.fillText(nice >= 1000 ? nice / 1000 + ' км' : nice + ' м', 50, H - 62);
  g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(W - 96, 20, 76, 100);
  g.fillStyle = '#111'; g.beginPath(); g.moveTo(W - 58, 30); g.lineTo(W - 80, 82); g.lineTo(W - 58, 70); g.lineTo(W - 36, 82); g.closePath(); g.fill();
  g.font = 'bold 28px sans-serif'; g.fillText('С', W - 68, 112);
  return cv.toDataURL('image/jpeg', 0.88);
}

// ── Диаграммы (Chart.js без анимации → PNG) ────────────────
async function _srChart(cfg, w = 1100, h = 460) {
  if (typeof Chart === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.style.cssText = 'position:fixed;left:-99999px;top:0'; document.body.appendChild(cv);
  const ch = new Chart(cv.getContext('2d'), { ...cfg, options: { ...(cfg.options || {}), animation: false, responsive: false, devicePixelRatio: 1,
    plugins: { ...((cfg.options || {}).plugins || {}), legend: { labels: { font: { size: 22 } }, ...(((cfg.options || {}).plugins || {}).legend || {}) } } },
    plugins: [{ id: 'bg', beforeDraw: c => { const x = c.ctx; x.save(); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.restore(); } }] });
  const url = cv.toDataURL('image/png');
  ch.destroy(); cv.remove();
  return url;
}
async function _srCharts(d, from, to) {
  const out = [];
  const vols = d.vols.filter(v => v.plan > 0);
  if (vols.length) out.push({ title: 'Выполнение по видам работ, % от плана', url: await _srChart({ type: 'bar',
    data: { labels: vols.map(v => v.name.length > 38 ? v.name.slice(0, 36) + '…' : v.name), datasets: [{ label: '% выполнения', data: vols.map(v => Math.min(100, +(v.pct || 0).toFixed(1))), backgroundColor: vols.map(v => v.pct >= 100 ? '#16a34a' : '#2563eb') }] },
    options: { indexAxis: 'y', scales: { x: { min: 0, max: 100, ticks: { font: { size: 22 } } }, y: { ticks: { font: { size: 22 } } } }, plugins: { legend: { display: false } } } }, 1100, Math.max(260, 80 + vols.length * 56)) });
  // нарастающий итог: средний % по видам работ на каждую дату
  const dates = [...new Set(d.fact.map(p => p.work_date).filter(Boolean))].sort().filter(x => !to || x <= to);
  if (vols.length && dates.length > 1) {
    const acc = Object.fromEntries(vols.map(v => [v.id, 0]));
    const series = dates.map(dt => {
      d.fact.filter(p => p.work_date === dt && acc[p.volume_id] != null).forEach(p => { acc[p.volume_id] += +p.completed || 0; });
      return +(vols.reduce((s, v) => s + Math.min(100, acc[v.id] / v.plan * 100), 0) / vols.length).toFixed(1);
    });
    out.push({ title: 'Ход работ нарастающим итогом, % (среднее по видам работ)', url: await _srChart({ type: 'line',
      data: { labels: dates.map(_srD), datasets: [{ label: 'Выполнено, %', data: series, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.15)', fill: true, tension: 0.2, pointRadius: dates.length > 60 ? 0 : 6, borderWidth: 4 }] },
      options: { scales: { y: { min: 0, max: 100, ticks: { font: { size: 22 } } }, x: { ticks: { font: { size: 20 }, maxTicksLimit: 10 } } } } }) });
  }
  return out.filter(c => c.url);
}

// ── Сборка HTML отчёта ─────────────────────────────────────
function _srHtml(d, opt, imgs) {
  const o = d.o, img = k => imgs[k] ? `<img src="${imgs[k].src}" style="width:100%;max-width:17cm" alt="">` : '';
  const row = (k, v) => v ? `<tr><td class="k">${k}</td><td>${v}</td></tr>` : '';
  const per = `${opt.from ? _srD(opt.from) : 'начала работ'} — ${_srD(opt.to)}`;
  const st = ({ active: 'В работе', paused: 'Приостановлен', done: 'Завершён' })[o.status] || o.status || '';
  let h = `<h1>Отчёт о ходе работ</h1>
    <p class="sub">${esc(o.name)} · за период ${per}</p>
    <table class="kv">${row('Объект', esc(o.name))}${row('Заказчик', esc(o.client || ''))}${row('Договор', esc(o.contract_number || ''))}
      ${row('Адрес / район', esc(o.address || ''))}${row('Сроки по договору', o.start_date || o.end_date ? `${_srD(o.start_date)} — ${_srD(o.end_date)}` : '')}
      ${row('Ожидаемое окончание', o.estimated_end ? _srD(o.estimated_end) : '')}${row('Статус', esc(st))}
      ${row('Готовность объекта', o.completion_percent != null ? `<b>${_srN(o.completion_percent, 0)} %</b>` : '')}</table>`;
  if (opt.note) h += `<p class="note">${esc(opt.note).replace(/\n/g, '<br>')}</p>`;
  if (opt.map && imgs.map) h += `<h2>Карта объекта</h2>${img('map')}<p class="cap">Объёмы работ — цветом видов работ, выполненное — зелёным, базы — фиолетовым.</p>`;
  if (opt.vol && d.vols.length) {
    h += `<h2>Объёмы работ</h2><table class="t"><tr><th>№</th><th>Вид работ</th><th>Ед.</th><th>План</th><th>За период</th><th>Всего выполнено</th><th>%</th><th>Осталось</th></tr>`;
    let cat = null, i = 0;
    d.vols.forEach(v => {
      if (v.category !== cat) { cat = v.category; h += `<tr class="cat"><td colspan="8">${esc(_srCat[cat] || cat || 'Прочее')}</td></tr>`; }
      h += `<tr><td>${++i}</td><td>${esc(v.name)}</td><td>${esc(v.unit || '')}</td><td class="n">${_srN(v.plan)}</td><td class="n">${_srN(v.period)}</td><td class="n"><b>${_srN(v.total)}</b></td><td class="n">${v.pct == null ? '—' : _srN(v.pct, 1)}</td><td class="n">${v.left == null ? '—' : _srN(v.left)}</td></tr>`;
    });
    h += '</table>';
  }
  if (opt.chart && imgs.charts.length) imgs.charts.forEach((c, i) => { h += `<h2>${esc(c.title)}</h2>${img('chart' + i)}`; });
  if (opt.log) {
    const L = d.log.slice(0, 200), vname = id => (d.vols.find(v => v.id === id) || {}).name || '';
    const wname = ids => String(ids || '').split(',').map(x => x.trim()).filter(Boolean).map(id => ((typeof pgkWorkers !== 'undefined' ? pgkWorkers : []).find(w => w.id === id) || {}).name || '').filter(Boolean).join(', ');
    h += `<h2>Журнал работ за период</h2>` + (L.length ? `<table class="t"><tr><th>Дата</th><th>Вид работ</th><th>Выполнено</th><th>Исполнители</th><th>Акт</th><th>Примечание</th></tr>
      ${L.map(p => { const v = d.vols.find(x => x.id === p.volume_id) || {}; return `<tr><td>${_srD(p.work_date)}</td><td>${esc(vname(p.volume_id))}</td><td class="n">${_srN(p.completed)} ${esc(v.unit || '')}</td><td>${esc(wname(p.worker_ids))}</td><td>${esc(p.act_number || '')}</td><td>${esc(p.notes || '')}</td></tr>`; }).join('')}</table>
      ${d.log.length > L.length ? `<p class="cap">Показаны последние ${L.length} записей из ${d.log.length}.</p>` : ''}` : '<p>За период записей нет.</p>');
  }
  if (opt.team && (o.bases || []).length) {
    h += `<h2>Персонал и техника</h2>`;
    (o.bases || []).forEach(b => {
      const W = (b.workers || []).filter(w => w.status !== 'fired'), M = b.machinery || [];
      h += `<h3>🏕 ${esc(b.name)}</h3><table class="t"><tr><th style="width:50%">Персонал (${W.length})</th><th>Техника (${M.length})</th></tr><tr><td>${W.map(w => `${esc(w.name)}${w.role ? ' — ' + esc(w.role) : ''}`).join('<br>') || '—'}</td><td>${M.map(m => `${esc(m.name)}${m.plate_number ? ' ' + esc(m.plate_number) : ''}${m.type ? ' (' + esc(m.type) + ')' : ''}`).join('<br>') || '—'}</td></tr></table>`;
    });
  }
  if (opt.tasks && (o.tasks || []).length) {
    h += `<h2>Задачи и замечания</h2><table class="t"><tr><th>Задача</th><th>Ответственный</th><th>Срок</th><th>Статус</th></tr>${o.tasks.map(t => `<tr><td>${esc(t.title)}</td><td>${esc(t.responsible || '')}</td><td>${_srD(t.due_date)}</td><td>${t.status === 'done' ? 'Выполнена' : 'В работе'}</td></tr>`).join('')}</table>`;
  }
  if (opt.photo && imgs.photos.length) {
    h += `<h2>Фотоматериалы</h2><table class="ph">`;
    for (let i = 0; i < imgs.photos.length; i += 2) h += `<tr>${[0, 1].map(k => { const p = imgs.photos[i + k]; return p ? `<td><img src="${p.src}" style="width:8cm" alt=""><br><span class="cap">${esc(p.cap || '')}</span></td>` : '<td></td>'; }).join('')}</tr>`;
    h += '</table>';
  }
  h += `<p class="foot">Составил: ${esc(typeof un === 'function' ? un() : '')} · ${new Date().toLocaleDateString('ru-RU')} · ПурГеоКом «Спутник»</p>`;
  return h;
}
const _SR_CSS = `body{font-family:'Times New Roman',serif;font-size:12pt;color:#000}
  h1{font-size:18pt;margin:0 0 2pt} h2{font-size:14pt;margin:16pt 0 6pt;border-bottom:1px solid #999;padding-bottom:2pt} h3{font-size:12pt;margin:10pt 0 4pt}
  .sub{color:#444;margin:0 0 10pt} .note{border-left:3px solid #2563eb;padding:4pt 8pt;background:#f1f5ff}
  table.kv td{padding:2pt 8pt 2pt 0;vertical-align:top} table.kv td.k{color:#555;white-space:nowrap}
  table.t{border-collapse:collapse;width:100%;font-size:10.5pt} table.t th,table.t td{border:1px solid #888;padding:3pt 5pt;vertical-align:top}
  table.t th{background:#e5e7eb} table.t td.n{text-align:right;white-space:nowrap} table.t tr.cat td{background:#f3f4f6;font-weight:bold}
  table.ph td{padding:4pt;text-align:center;vertical-align:top} .cap{font-size:9.5pt;color:#555} .foot{margin-top:20pt;font-size:9.5pt;color:#666}
  img{page-break-inside:avoid} h2{page-break-after:avoid}`;

async function _srRun(fmt) {
  const st = t => { const e = document.getElementById('sr-status'); if (e) e.textContent = t; };
  const siteId = document.getElementById('sr-site').value;
  const opt = { from: document.getElementById('sr-from').value, to: document.getElementById('sr-to').value || new Date().toISOString().slice(0, 10), note: document.getElementById('sr-note').value.trim() };
  ['map', 'sat', 'vol', 'chart', 'log', 'team', 'tasks', 'photo'].forEach(k => { opt[k] = !!document.getElementById('sr-' + k)?.checked; });
  try { const { from, to, ...keep } = opt; localStorage.setItem('srep_opts', JSON.stringify(keep)); } catch (e) {}
  document.querySelectorAll('#mft .btn').forEach(b => b.disabled = true);
  try {
    st('⏳ Собираю данные…');
    const d = await _srCollect(siteId, opt.from, opt.to);
    const imgs = { charts: [], photos: [] };
    if (opt.map) { st('⏳ Карта…'); const u = await _srMapImage(d.o, opt.sat); if (u) imgs.map = { src: u }; }
    if (opt.chart) { st('⏳ Диаграммы…'); imgs.charts = await _srCharts(d, opt.from, opt.to); imgs.charts.forEach((c, i) => { imgs['chart' + i] = { src: c.url }; }); }
    if (opt.photo) {
      st('⏳ Фото…');
      for (const p of d.photos.slice(0, 40)) { const u = await _srShrink(`/uploads/${encodeURIComponent(p.filename)}`, 1400); if (u) imgs.photos.push({ src: u, cap: p.caption || '' }); }
      SREP.photos.forEach(p => p.dataUrl && imgs.photos.push({ src: p.dataUrl, cap: p.name }));
    }
    const body = _srHtml(d, opt, imgs);
    const fname = `Отчёт_${d.o.name}_${opt.to}`.replace(/[\\/:*?"<>|]+/g, '_');
    if (fmt === 'doc') { _srWord(body, fname); st('✅ Word-файл сохранён'); }
    else { _srPrint(body, fname); st('✅ Открыто окно печати — выберите «Сохранить как PDF»'); }
  } catch (e) { console.error('[report]', e); st('❌ ' + e.message); toast('Ошибка отчёта: ' + e.message, 'err'); }
  finally { document.querySelectorAll('#mft .btn').forEach(b => b.disabled = false); }
}
// PDF: печать из скрытого фрейма (без всплывающих окон)
function _srPrint(body, title) {
  const fr = document.createElement('iframe');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(fr);
  const doc = fr.contentDocument;
  doc.open(); doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:15mm 15mm 15mm 20mm}${_SR_CSS}</style></head><body>${body}</body></html>`); doc.close();
  const go = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) {} setTimeout(() => fr.remove(), 60000); };
  const ims = [...doc.images]; let left = ims.length;
  if (!left) setTimeout(go, 100); else ims.forEach(im => { if (im.complete) { if (--left === 0) setTimeout(go, 100); } else im.onload = im.onerror = () => { if (--left === 0) setTimeout(go, 100); }; });
}
// Word: MHTML (.doc) — картинки внутри файла, Word открывает как обычный документ
function _srWord(body, fname) {
  const parts = [];
  let n = 0;
  const html = body.replace(/src="data:(image\/[a-z]+);base64,([^"]+)"/g, (m, mime, b64) => {
    const name = `img${++n}.${mime === 'image/png' ? 'png' : 'jpg'}`;
    parts.push({ name, mime, b64 });
    return `src="${name}"`;
  });
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(fname)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>@page WordSection1{size:21cm 29.7cm;margin:1.5cm 1.5cm 1.5cm 2cm}div.WordSection1{page:WordSection1}${_SR_CSS}</style></head>
<body><div class="WordSection1">${html}</div></body></html>`;
  const B = '----=_NextPart_PGK_' + Date.now();
  const b64utf8 = s => { const bytes = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); };
  const wrap76 = s => s.replace(/.{1,76}/g, '$&\r\n');
  let mht = `MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="${B}"; type="text/html"\r\n\r\n` +
    `--${B}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\nContent-Location: file:///C:/report.htm\r\n\r\n${wrap76(b64utf8(doc))}\r\n`;
  parts.forEach(p => { mht += `--${B}\r\nContent-Type: ${p.mime}\r\nContent-Transfer-Encoding: base64\r\nContent-Location: file:///C:/${p.name}\r\n\r\n${wrap76(p.b64)}\r\n`; });
  mht += `--${B}--\r\n`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([mht], { type: 'application/msword' }));
  a.download = fname + '.doc';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast('📄 Отчёт сохранён: ' + a.download, 'ok');
}
