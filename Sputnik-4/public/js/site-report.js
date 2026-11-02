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
      <div style="grid-column:span 2;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;padding:2px 0 4px 20px">
        <div class="fg" style="margin:0;flex:1;min-width:190px"><label>Как показать карту</label><select id="sr-mapmode" onchange="_srSheetsHint()">
          ${[['parts', 'Обзорная + участки с объёмами крупно'], ['only', 'Только участки с объёмами'], ['one', 'Одна общая карта']].map(([v, l]) => `<option value="${v}" ${(last.mapmode || 'parts') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="fg" style="margin:0;width:150px"><label>Масштаб участков</label><select id="sr-scale" onchange="_srSheetsHint()">
          ${[['auto', 'авто'], [5000, '1 : 5 000'], [10000, '1 : 10 000'], [25000, '1 : 25 000'], [50000, '1 : 50 000'], [100000, '1 : 100 000']].map(([v, l]) => `<option value="${v}" ${String(last.scale || 'auto') === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div id="sr-sheets" style="font-size:11px;color:var(--tx2);width:100%"></div>
      </div>
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
  document.getElementById('sr-site').addEventListener('change', _srSheetsHint);
  _srSheetsHint();
}
// подсказка «будет N участков» (по объёмам выбранного объекта)
async function _srSheetsHint() {
  const el = document.getElementById('sr-sheets'), md = document.getElementById('sr-mapmode'); if (!el || !md) return;
  document.getElementById('sr-scale').disabled = md.value === 'one';
  if (md.value === 'one') { el.textContent = 'Весь объект одной картинкой.'; return; }
  try {
    const o = await fetch(`${API}/sites/${document.getElementById('sr-site').value}`).then(r => r.json());
    const sh = _srSheets(o, document.getElementById('sr-scale').value);
    el.innerHTML = !sh.sheets.length ? '⚠ У объекта нет объёмов на карте — будет одна общая карта.'
      : `Участков: <b>${sh.sheets.length}</b>, масштаб <b>${sh.scales.map(x => '1 : ' + x.toLocaleString('ru-RU')).join(', ')}</b> (при ширине картинки 17 см) — только там, где есть объёмы; пустые места между ними не попадут.${sh.scales.length > 1 ? ' В «авто» у каждого места свой масштаб.' : ''}${sh.capped ? ' ⚠ Участков слишком много — показаны первые ' + sh.sheets.length + ', выберите масштаб мельче.' : ''}`;
  } catch (e) { el.textContent = ''; }
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
  const fact = (o.vol_progress || []).filter(p => (p.row_type || 'fact') === 'fact' && !p.hidden);
  const inP = d => (!from || d >= from) && (!to || d <= to);
  const vols = (o.volumes || []).map(v => {
    const rows = fact.filter(p => p.volume_id === v.id);
    const total = rows.filter(p => !to || p.work_date <= to).reduce((s, p) => s + (+p.completed || 0), 0);
    const period = rows.filter(p => inP(p.work_date)).reduce((s, p) => s + (+p.completed || 0), 0);
    const plan = +v.amount || 0;
    // второй показатель объёма-слоя (например п.м. по полю «глубина»)
    const m2 = v.layer_id && typeof volMeasure === 'function' ? volMeasure(v).second : null;
    const total2 = rows.filter(p => !to || p.work_date <= to).reduce((s, p) => s + (+p.amount2 || 0), 0);
    return { ...v, plan, total, period, m2, total2, pct: plan ? total / plan * 100 : null, left: plan ? Math.max(0, plan - total) : null };
  });
  const log = fact.filter(p => inP(p.work_date)).sort((a, b) => a.work_date < b.work_date ? 1 : -1);
  const photos = await fetch(`${API}/photos?entity_type=site&entity_id=${encodeURIComponent(siteId)}`).then(r => r.json()).catch(() => []);
  return { o, vols, fact, log, photos };
}

// ── Участки карты: только там, где есть объёмы ─────────────
// Точки объёмов (вершины + сгущённые линии) → в метрах → «острова» (клетки сетки с шагом G,
// соседние клетки — один остров) → каждый остров режется вдоль своей главной оси на листы
// одного размера (17 × 10,6 см в выбранном масштабе). Возвращает {scale, sheets:[{minLng,…}], capped}
const SR_PRINT_W = 0.17, SR_ASPECT = 1000 / 1600, SR_MAX_SHEETS = 24;
function _srVolGeoms(o) {
  const out = [];
  (o.volumes || []).forEach(v => {
    const l = v.layer_id && (layers || []).find(x => x.id === v.layer_id); if (!l) return;
    try { (JSON.parse(l.geojson).features || []).forEach(f => { const p = (f && f.properties) || {}; if (f && f.geometry && !p._skip && !p._hidden) out.push({ f, v }); }); } catch (e) {}
  });
  return out;
}
function _srSheets(o, scaleSel) {
  const gs = _srVolGeoms(o);
  const all = []; gs.forEach(x => all.push(..._pfPtsAny(x.f.geometry)));
  if (!all.length) return { scale: 0, sheets: [] };
  const lat0 = all.reduce((s, c) => s + c[1], 0) / all.length, kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
  const M = c => [c[0] * kx, c[1] * ky], G2L = (x, y) => [x / kx, y / ky];
  // точки в метрах; линии сгущены (шаг ≥ 20 м, не больше ~20 000 точек)
  let len = 0; gs.forEach(x => { const g = x.f.geometry; if (/Line|Polygon/.test(g.type)) { const pp = _pfPtsAny(g); for (let i = 1; i < pp.length; i++) { const a = M(pp[i]), b = M(pp[i - 1]); len += Math.hypot(a[0] - b[0], a[1] - b[1]); } } });
  const step = Math.max(20, len / 20000), P = [];
  gs.forEach(x => {
    const g = x.f.geometry, lines = /LineString|Polygon/.test(g.type) ? (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' || g.type === 'Polygon' ? g.coordinates : g.coordinates.flat()) : null;
    if (!lines) { _pfPtsAny(g).forEach(c => { const m = M(c); m.f = 1; P.push(m); }); return; }
    lines.forEach(ln => ln.forEach((c, i) => {
      const a = M(c); P.push(a); if (!i) return;
      const b = M(ln[i - 1]), d = Math.hypot(a[0] - b[0], a[1] - b[1]), n = Math.floor(d / step);
      for (let k = 1; k < n; k++) P.push([b[0] + (a[0] - b[0]) * k / n, b[1] + (a[1] - b[1]) * k / n]);
    }));
  });
  // острова: занятые клетки сетки с шагом gap, соседи по 8 направлениям — вместе
  const islands = (pts, gap) => {
    const cell = new Map(), key = (i, j) => i + ':' + j;
    pts.forEach(p => { const k = key(Math.floor(p[0] / gap), Math.floor(p[1] / gap)); (cell.get(k) || cell.set(k, []).get(k)).push(p); });
    const seen = new Set(), out = [];
    for (const k0 of cell.keys()) {
      if (seen.has(k0)) continue;
      const st = [k0], ip = []; seen.add(k0);
      while (st.length) {
        const k = st.pop(); ip.push(...cell.get(k)); const [i, j] = k.split(':').map(Number);
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const n = key(i + di, j + dj); if (cell.has(n) && !seen.has(n)) { seen.add(n); st.push(n); } }
      }
      out.push(ip);
    }
    return out;
  };
  // точки → листы одного масштаба: каждый остров режется вдоль главной оси, пока рамка помещается в лист
  const make = (scale, pts) => {
    const Sw = SR_PRINT_W * scale, Sh = Sw * SR_ASPECT, out = [];
    islands(pts, Sw * 0.35).forEach(ip => {
      const cx = ip.reduce((s, p) => s + p[0], 0) / ip.length, cy = ip.reduce((s, p) => s + p[1], 0) / ip.length;
      let sxx = 0, syy = 0, sxy = 0; ip.forEach(p => { const dx = p[0] - cx, dy = p[1] - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
      const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
      const T = p => p[0] * ux + p[1] * uy;
      const sorted = ip.slice().sort((a, b) => T(a) - T(b)), t0 = T(sorted[0]), t1 = T(sorted[sorted.length - 1]);
      // поля по краям листа (≈12–15 %): подписи и масштабная линейка не закрывают объекты
      const fits = b => b[2] - b[0] <= Sw * 0.76 && b[3] - b[1] <= Sh * 0.7;
      // делим вдоль главной оси на n равных отрезков — наименьшее n, при котором каждый влезает в лист
      let done = false;
      for (let n = 1; n <= 12 && !done; n++) {
        const boxes = Array.from({ length: n }, () => null);
        sorted.forEach(p => { const k = Math.min(n - 1, Math.floor((T(p) - t0) / ((t1 - t0) || 1) * n)), b = boxes[k];
          boxes[k] = b ? [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])] : [p[0], p[1], p[0], p[1]]; });
        const bs = boxes.filter(Boolean);
        if (bs.every(fits)) { bs.forEach(b => out.push({ x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, Sw, Sh, scale })); done = true; }
      }
      // широкое во все стороны (площадь больше листа) — сеткой, только клетки, где что-то есть
      if (!done) {
        const cw = Sw * 0.76, ch = Sh * 0.7, occ = new Set();
        ip.forEach(p => occ.add(Math.floor(p[0] / cw) + ':' + Math.floor(p[1] / ch)));
        occ.forEach(k => { const [i, j] = k.split(':').map(Number); out.push({ x: (i + 0.5) * cw, y: (j + 0.5) * ch, Sw, Sh, scale }); });
      }
    });
    return out;
  };
  const SC = [2000, 5000, 10000, 25000, 50000, 100000, 200000, 500000];
  let sheets;
  if (+scaleSel) sheets = make(+scaleSel, P);
  else {
    // авто: места, разнесённые больше чем на 3 км, — отдельно; у каждого свой масштаб
    // плотность: медиана расстояний до ближайшего соседа среди точечных объектов — на бумаге ≥ 6 мм,
    // чтобы подписи читались; первый (самый крупный) масштаб, где место целиком на одном листе
    // или (не крупнее плотности) занимает не больше 10 листов
    sheets = [];
    islands(P, 3000).forEach(ip => {
      const fp = ip.filter(p => p.f).slice(0, 1500);
      let dens = 0;
      if (fp.length >= 5) {
        const nn = fp.map(a => { let m = Infinity; for (const b of fp) if (b !== a) { const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d > 0.5 && d < m) m = d; } return m; }).filter(isFinite).sort((a, b) => a - b);
        if (nn.length) dens = nn[Math.floor(nn.length / 2)] / 0.006;
      }
      const floor = SC.filter(sc => sc <= dens).pop() || 0;
      let r = null;
      for (const sc of SC) { r = make(sc, ip); if (r.length === 1 || (sc >= floor && r.length <= 10)) break; }
      sheets.push(...r);
    });
  }
  // порядок: с запада на восток (а в одной полосе — с севера на юг)
  sheets.sort((a, b) => Math.abs(a.x - b.x) > Math.max(a.Sw, b.Sw) * 0.5 ? a.x - b.x : b.y - a.y);
  const capped = sheets.length > SR_MAX_SHEETS;
  sheets = sheets.slice(0, SR_MAX_SHEETS).map(c => { const [w, sLat] = G2L(c.x - c.Sw / 2, c.y - c.Sh / 2), [e, nLat] = G2L(c.x + c.Sw / 2, c.y + c.Sh / 2); return { minLng: w, minLat: sLat, maxLng: e, maxLat: nLat, scale: c.scale }; });
  const scs = [...new Set(sheets.map(x => x.scale))].sort((a, b) => a - b);
  return { scale: scs[0] || 0, scales: scs, sheets, capped };
}
// что из объёмов попало на участок: «Бурение: 12, выполнено 8»
function _srSheetCaption(o, b) {
  const by = new Map(), inB = c => c[0] >= b.minLng && c[0] <= b.maxLng && c[1] >= b.minLat && c[1] <= b.maxLat;
  _srVolGeoms(o).forEach(x => { if (!_pfPtsAny(x.f.geometry).some(inB)) return; const r = by.get(x.v) || by.set(x.v, { n: 0, d: 0 }).get(x.v); r.n++; if (x.f.properties && x.f.properties._done) r.d++; });
  return [...by].map(([v, r]) => `${esc(v.name)}: ${r.n}${r.d ? `, выполнено ${r.d}` : ''}`).join(' · ');
}

const _pfPtsAny = g => { const o = []; const w = c => { if (typeof c[0] === 'number') o.push(c); else c.forEach(w); }; if (g && g.coordinates) w(g.coordinates); return o; };
// ── Карта: подложка с сервера + объёмы и базы, рисуем сами ─
// opt: {box — рамка участка (иначе весь объект), frames — рамки участков для обзорной, labels — подписи объектов}
async function _srMapImage(o, sat, opt) {
  opt = opt || {};
  const feats = [];
  // объёмы — слои KML: выполненные объекты зелёным, остальные цветом объёма, исключённые — не рисуем
  const volLayerIds = new Set();
  (o.volumes || []).forEach(v => {
    const l = v.layer_id && (layers || []).find(x => x.id === v.layer_id); if (!l) return;
    volLayerIds.add(l.id);
    try { (JSON.parse(l.geojson).features || []).forEach(f => { const p = (f && f.properties) || {}; if (!f || !f.geometry || p._skip || p._hidden) return;
      feats.push({ f, color: p._done ? '#16a34a' : (v.color || l.color || '#1a56db'), kind: p._done ? 'fact' : 'vol' }); }); } catch (e) {}
  });
  (layers || []).forEach(l => {
    const g = l.group_id && typeof kmGroups === 'object' ? kmGroups[l.group_id] : null;
    const ids = g ? (g.site_ids || (g.site_id ? [g.site_id] : [])) : [];
    if (volLayerIds.has(l.id) || (l.site_id !== o.id && !ids.includes(o.id))) return;
    try { const gj = JSON.parse(l.geojson); (gj.features || []).forEach(f => f && f.geometry && !(f.properties || {})._hidden && feats.push({ f, color: (f.properties || {})._color || l.color || '#7c3aed', kind: 'kml' })); } catch (e) {}
  });
  const bases = (o.bases || []).filter(b => b && b.lat && b.lng);
  // заметки на карте (слой «Заметки») — добавим те, что попали в область объекта (после расчёта рамки)
  const notes = [];
  (layers || []).forEach(l => { const st = typeof kmlStyleOf === 'function' ? kmlStyleOf(l) : null; if (!st || !st.notes || !l.visible) return;
    try { (JSON.parse(l.geojson).features || []).forEach(f => f && f.geometry && f.properties && f.properties._note && notes.push(f)); } catch (e) {} });
  const pts = [];
  const walk = c => { if (typeof c[0] === 'number') pts.push(c); else c.forEach(walk); };
  feats.forEach(x => walk(x.f.geometry.coordinates || []));
  bases.forEach(b => pts.push([b.lng, b.lat]));
  if (!pts.length && !opt.box) return null;
  let minLng, maxLng, minLat, maxLat;
  if (opt.box) ({ minLng, maxLng, minLat, maxLat } = opt.box);
  else {
    (opt.frames || []).forEach(b => { pts.push([b.minLng, b.minLat], [b.maxLng, b.maxLat]); });
    minLng = Math.min(...pts.map(p => p[0])); maxLng = Math.max(...pts.map(p => p[0])); minLat = Math.min(...pts.map(p => p[1])); maxLat = Math.max(...pts.map(p => p[1]));
    const padX = Math.max((maxLng - minLng) * (opt.frames && opt.frames.length ? 0.12 : 0.08), 0.002), padY = Math.max((maxLat - minLat) * (opt.frames && opt.frames.length ? 0.14 : 0.08), 0.001);
    minLng -= padX; maxLng += padX; minLat -= padY; maxLat += padY;
  }
  const W = 1600, H = 1000;
  const wx = (lng, z) => (lng + 180) / 360 * 256 * 2 ** z;
  const wy = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * 2 ** z; };
  // дробный масштаб: рамка ровно вписывается в картинку; тайлы — ближайшего уровня, растянутые
  const fit = Math.min(W / (wx(maxLng, 0) - wx(minLng, 0)), H / (wy(minLat, 0) - wy(maxLat, 0)));
  const z = Math.max(2, Math.min(19, Math.log2(fit) - (opt.box ? 0 : 0.0001)));
  const zt = Math.max(2, Math.min(18, Math.round(z))), ts = 256 * 2 ** (z - zt);
  const cx = (wx(minLng, z) + wx(maxLng, z)) / 2, cy = (wy(minLat, z) + wy(maxLat, z)) / 2;
  const x0 = cx - W / 2, y0 = cy - H / 2;
  const P = (lng, lat) => [wx(lng, z) - x0, wy(lat, z) - y0];
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = sat ? '#3f4a3c' : '#eef2f0'; g.fillRect(0, 0, W, H);
  // подложка — тайлы через сервер (без ограничений CORS у холста)
  try {
    const tl = [Math.floor(x0 / ts), Math.floor(y0 / ts)], br = [Math.floor((x0 + W) / ts), Math.floor((y0 + H) / ts)];
    const inv = (px, py) => ({ lng: px / (256 * 2 ** z) * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * py / (256 * 2 ** z)))) * 180 / Math.PI });
    const a = inv(x0, y0 + H), b = inv(x0 + W, y0);
    const r = await fetch(`${API}/export-tiles`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bbox: { minLng: a.lng, minLat: a.lat, maxLng: b.lng, maxLat: b.lat }, minZoom: zt, maxZoom: zt, source: sat ? 'sat' : 'map' }) }).then(r => r.json());
    const jobs = [];
    for (let tx = tl[0]; tx <= br[0]; tx++) for (let ty = tl[1]; ty <= br[1]; ty++) {
      const b64 = r && r.tiles && r.tiles[`${zt}/${tx}/${ty}`]; if (!b64) continue;
      // +0,5 px — без щелей между растянутыми тайлами
      jobs.push(new Promise(ok => { const im = new Image(); im.onload = () => { g.drawImage(im, tx * ts - x0, ty * ts - y0, ts + 0.5, ts + 0.5); ok(); }; im.onerror = ok; im.src = (b64.startsWith('/9j') ? 'data:image/jpeg;base64,' : 'data:image/png;base64,') + b64; }));
    }
    await Promise.all(jobs);
  } catch (e) {}
  // объекты
  // размер точек по густоте: при плотном ряде большие точки с белой обводкой сливаются в полосу
  const ptXY = []; feats.forEach(x => { if (/Point/.test(x.f.geometry.type)) _pfPtsAny(x.f.geometry).forEach(c => { const q = P(c[0], c[1]); if (q[0] > -20 && q[0] < W + 20 && q[1] > -20 && q[1] < H + 20) ptXY.push(q); }); });
  let ptK = opt.labels ? 0.75 : 1;
  if (ptXY.length > 20) {
    const smp = ptXY.length > 600 ? ptXY.filter((_, i) => i % Math.ceil(ptXY.length / 600) === 0) : ptXY;
    const nn = smp.map(a => { let m = Infinity; for (const b of ptXY) if (b !== a) { const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d > 0.3 && d < m) m = d; } return m; }).filter(isFinite).sort((a, b) => a - b);
    const med = nn.length ? nn[Math.floor(nn.length / 2)] : 99;
    ptK = Math.max(0.35, Math.min(ptK, med / 24));
  }
  const drawGeom = (geom, color, kind) => {
    const t = geom.type, c = geom.coordinates;
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = kind === 'fact' ? 7 : 5;
    const path = ring => { ring.forEach((p, i) => { const [x, y] = P(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); };
    if (/Polygon/.test(t)) {
      (t === 'Polygon' ? [c] : c).forEach(poly => { g.beginPath(); poly.forEach(r => { path(r); g.closePath(); }); g.globalAlpha = kind === 'kml' ? 0.12 : 0.28; g.fill('evenodd'); g.globalAlpha = 1; g.stroke(); });
    } else if (/LineString/.test(t)) {
      (t === 'LineString' ? [c] : c).forEach(l => { g.beginPath(); path(l); g.stroke(); });
    } else if (/Point/.test(t)) {
      (t === 'Point' ? [c] : c).forEach(p => { const [x, y] = P(p[0], p[1]); g.beginPath(); g.arc(x, y, (kind === 'fact' ? 11 : 10) * ptK, 0, 7); g.fill(); g.lineWidth = Math.max(1, 3 * ptK); g.strokeStyle = '#fff'; g.stroke(); });
    } else if (t === 'GeometryCollection') (geom.geometries || []).forEach(x => drawGeom(x, color, kind));
  };
  ['kml', 'vol', 'fact'].forEach(k => feats.filter(x => x.kind === k).forEach(x => drawGeom(x.f.geometry, x.color, k)));
  // подписи объектов объёмов на участке: без наложений — подпись ставится справа/слева,
  // сверху/снизу от точки, где не задевает уже поставленные, точки и служебные плашки
  if (opt.labels) {
    const vis = feats.filter(x => x.kind !== 'kml' && x.f.properties && (x.f.properties.name || x.f.properties.Name)).map(x => { const c = _pfPtsAny(x.f.geometry)[0]; return c && { t: String(x.f.properties.name || x.f.properties.Name), xy: P(c[0], c[1]) }; })
      .filter(x => x && x.xy[0] > 0 && x.xy[0] < W && x.xy[1] > 0 && x.xy[1] < H);
    const busy = [[0, H - 100, 560, H], [W - 100, 0, W, 124]];          // масштаб и «С»
    vis.forEach(x => { const r = 10 * ptK + 2; busy.push([x.xy[0] - r, x.xy[1] - r, x.xy[0] + r, x.xy[1] + r]); });
    const hit = r => busy.some(b => r[0] < b[2] && r[2] > b[0] && r[1] < b[3] && r[3] > b[1]);
    g.font = 'bold 26px sans-serif'; g.lineJoin = 'round';
    let shown = 0;
    vis.forEach(x => {
      const w = g.measureText(x.t).width, h = 27, [px, py] = x.xy;
      const o2 = 10 * ptK + 6, cand = [[px + o2, py - o2 - h], [px + o2, py + o2], [px - o2 - w, py - o2 - h], [px - o2 - w, py + o2], [px + o2, py - h / 2], [px - o2 - w, py - h / 2], [px - w / 2, py - o2 - h], [px - w / 2, py + o2]];
      const pos = cand.map(([lx, ly]) => [lx - 3, ly - 2, lx + w + 3, ly + h + 2]).find(r => r[0] >= 0 && r[2] <= W && r[1] >= 0 && r[3] <= H && !hit(r));
      if (!pos) return;
      busy.push(pos); shown++;
      g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,.95)'; g.strokeText(x.t, pos[0] + 3, pos[1] + 23); g.fillStyle = '#111'; g.fillText(x.t, pos[0] + 3, pos[1] + 23);
    });
    opt.labStat = { shown, total: vis.length };
  }
  // рамки участков на обзорной карте с номерами
  (opt.frames || []).forEach((b, i) => {
    let [ax, ay] = P(b.minLng, b.maxLat), [bx, by] = P(b.maxLng, b.minLat);
    // крупный участок на обзорной крошечный — рамка не меньше 44 px
    if (bx - ax < 44) { const c = (ax + bx) / 2; ax = c - 22; bx = c + 22; }
    if (by - ay < 44) { const c = (ay + by) / 2; ay = c - 22; by = c + 22; }
    g.lineWidth = 4; g.strokeStyle = '#f59e0b'; g.setLineDash([14, 8]); g.strokeRect(ax, ay, bx - ax, by - ay); g.setLineDash([]);
    const t = String(i + 1); g.font = 'bold 34px sans-serif';
    const tw = g.measureText(t).width + 18; g.fillStyle = '#f59e0b'; g.fillRect(ax, ay, tw, 44); g.fillStyle = '#fff'; g.fillText(t, ax + 9, ay + 34);
  });
  // заметки: стрелки/выноски линиями, текст — крупно с белой обводкой
  const inBox = c => c[0] >= minLng && c[0] <= maxLng && c[1] >= minLat && c[1] <= maxLat;
  notes.filter(f => _pfPtsAny(f.geometry).some(inBox)).forEach(f => {
    const p = f.properties, col = p._color || '#dc2626';
    if (f.geometry.type === 'Point') {
      const [x, y] = P(f.geometry.coordinates[0], f.geometry.coordinates[1]);
      g.font = `bold ${Math.round((+p._size || 16) * 2.2)}px sans-serif`; g.lineWidth = 9; g.strokeStyle = 'rgba(255,255,255,.95)'; g.fillStyle = col;
      String(p.name || '').split('\n').forEach((t, i) => { const yy = y + i * (+p._size || 16) * 2.5; g.strokeText(t, x, yy); g.fillText(t, x, yy); });
    } else { g.lineWidth = Math.max(4, (+p._w || 3) * 2); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = col; (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates).forEach(l => { g.beginPath(); l.forEach((c, i) => { const [x, y] = P(c[0], c[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }); }
  });
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
  // ничего не выполнено — пустую диаграмму в отчёт не ставим
  if (vols.length && vols.some(v => v.pct > 0)) out.push({ title: 'Выполнение по видам работ, % от плана', ratio: Math.max(260, 80 + vols.length * 56) / 1100, url: await _srChart({ type: 'bar',
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
    out.push({ title: 'Ход работ нарастающим итогом, % (среднее по видам работ)', ratio: 460 / 1100, url: await _srChart({ type: 'line',
      data: { labels: dates.map(_srD), datasets: [{ label: 'Выполнено, %', data: series, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.15)', fill: true, tension: 0.2, pointRadius: dates.length > 60 ? 0 : 6, borderWidth: 4 }] },
      options: { scales: { y: { min: 0, max: 100, ticks: { font: { size: 22 } } }, x: { ticks: { font: { size: 20 }, maxTicksLimit: 10 } } } } }) });
  }
  return out.filter(c => c.url);
}

// ── Сборка HTML отчёта ─────────────────────────────────────
// Вёрстка под Word и печать: разделы с номерами, картинки — фиксированной ширины 17 см
// (атрибуты width/height — Word иначе берёт исходный размер), рисунок с подписью —
// в одной ячейке таблицы, чтобы не разрывался страницей; участки — по два на страницу.
const SR_IMG_W = 642;   // 17 см при 96 точках на дюйм
function _srHtml(d, opt, imgs) {
  const o = d.o;
  let fig = 0, sec = 0;
  const figure = (src, cap, ratio, title) => { fig++; const h = Math.round(SR_IMG_W * (ratio || SR_ASPECT));
    return `<table class="fig"><tr><td>${title ? `<p class="ft">${title}</p>` : ''}<img src="${src}" width="${SR_IMG_W}" height="${h}" style="width:17cm;height:${(17 * (ratio || SR_ASPECT)).toFixed(2)}cm" alt=""><p class="cap">Рисунок ${fig}${cap ? ' — ' + cap : ''}</p></td></tr></table>`; };
  const H2 = t => `<h2>${++sec}. ${t}</h2>`;
  const row = (k, v) => v ? `<tr><td class="k">${k}</td><td>${v}</td></tr>` : '';
  const per = `${opt.from ? _srD(opt.from) : 'начала работ'} — ${_srD(opt.to)}`;
  const st = ({ active: 'В работе', paused: 'Приостановлен', done: 'Завершён' })[o.status] || o.status || '';
  const catName = c => (typeof VOL_SECTIONS !== 'undefined' && VOL_SECTIONS[c] && VOL_SECTIONS[c].label) || _srCat[c] || 'Прочее';
  let h = `<table class="hdr"><tr><td class="org">ПурГеоКом</td><td class="dt">${new Date().toLocaleDateString('ru-RU')}</td></tr></table>
    <h1>Отчёт о ходе работ</h1>
    <p class="sub">${esc(o.name)}<br>за период ${per}</p>`;
  h += H2('Общие сведения') + `<table class="kv">${row('Объект', esc(o.name))}${row('Заказчик', esc(o.client || ''))}${row('Договор', esc(o.contract_number || ''))}
      ${row('Адрес / район', esc(o.address || ''))}${row('Сроки по договору', o.start_date || o.end_date ? `${_srD(o.start_date)} — ${_srD(o.end_date)}` : '')}
      ${row('Ожидаемое окончание', o.estimated_end ? _srD(o.estimated_end) : '')}${row('Статус', esc(st))}
      ${row('Готовность объекта', o.completion_percent != null ? `<b>${_srN(o.completion_percent, 0)} %</b>` : '')}
      ${(() => { if (typeof siteForecast !== 'function') return ''; const f = siteForecast(o, opt.to); if (!f.finish || f.allDone) return '';
        return row('Прогноз окончания (по темпу)', `${_srD(f.finish)}${f.lateDays != null ? (f.lateDays > 0 ? ` — <b>позже срока на ${f.lateDays} дн.</b>` : ` — в срок, запас ${-f.lateDays} дн.`) : ''}`); })()}</table>`;
  if (opt.note) h += `<p class="note">${esc(opt.note).replace(/\n/g, '<br>')}</p>`;
  if (opt.vol && d.vols.length) {
    h += H2('Объёмы работ') + `<table class="t"><tr><th style="width:5%">№</th><th>Вид работ</th><th style="width:8%">Ед.</th><th style="width:11%">План</th><th style="width:11%">За период</th><th style="width:12%">Всего</th><th style="width:7%">%</th><th style="width:11%">Осталось</th></tr>`;
    let cat = null, i = 0;
    d.vols.slice().sort((a, b) => String(a.category).localeCompare(String(b.category))).forEach(v => {
      if (v.category !== cat) { cat = v.category; h += `<tr class="cat"><td colspan="8">${esc(catName(cat))}</td></tr>`; }
      h += `<tr><td class="c">${++i}</td><td>${esc(v.name)}</td><td class="c">${esc(v.unit || '')}</td><td class="n">${_srN(v.plan)}</td><td class="n">${_srN(v.period)}</td><td class="n"><b>${_srN(v.total)}</b></td><td class="n">${v.pct == null ? '—' : _srN(v.pct, 1)}</td><td class="n">${v.left == null ? '—' : _srN(v.left)}</td></tr>`;
      if (v.m2) h += `<tr class="sub2"><td></td><td>в т. ч. ${esc(v.m2.unit || '')}</td><td class="c">${esc(v.m2.unit || '')}</td><td class="n">${_srN(+v.amount2 || 0)}</td><td class="n"></td><td class="n">${_srN(v.total2)}</td><td class="n">${+v.amount2 ? _srN(v.total2 / v.amount2 * 100, 1) : '—'}</td><td class="n">${+v.amount2 ? _srN(Math.max(0, v.amount2 - v.total2)) : '—'}</td></tr>`;
    });
    h += '</table>';
  }
  const legend = 'объёмы работ — цветом видов работ, выполненное — зелёным, базы — фиолетовым';
  if (opt.map && (imgs.map || imgs.sheets.length)) {
    h += `<h2 class="pb">${++sec}. Карта объекта</h2>`;
    if (imgs.map) h += figure(imgs.map.src, `обзорная карта объекта; ${legend}${imgs.sheets.length ? '; оранжевыми рамками с номерами — участки, показанные ниже крупнее' : ''}`);
    else h += `<p class="cap">Условные обозначения: ${legend}.</p>`;
    imgs.sheets.forEach((x, i) => {
      const lab = x.lab && x.lab.total && x.lab.shown < x.lab.total ? `; подписаны ${x.lab.shown} из ${x.lab.total} — остальные мешали бы друг другу` : '';
      // по два участка на страницу: новая страница перед каждым нечётным (кроме первого, если нет обзорной)
      h += `${i % 2 === 0 && (i > 0 || imgs.map) ? '<br class="pg" style="page-break-before:always" clear="all">' : ''}` +
        figure(x.src, `${x.cap || 'объёмы работ'}${lab}`, null, `Участок ${i + 1}${imgs.sheets.length > 1 ? ` из ${imgs.sheets.length}` : ''} · масштаб 1 : ${x.scale.toLocaleString('ru-RU')}`);
    });
  }
  if (opt.chart && imgs.charts.length) {
    h += `<h2 class="pb">${++sec}. Диаграммы</h2>`;
    imgs.charts.forEach((c, i) => { h += figure(imgs['chart' + i].src, esc(c.title), c.ratio); });
  }
  if (opt.log) {
    const L = d.log.slice(0, 200), vname = id => (d.vols.find(v => v.id === id) || {}).name || '';
    const wname = ids => String(ids || '').split(',').map(x => x.trim()).filter(Boolean).map(id => ((typeof pgkWorkers !== 'undefined' ? pgkWorkers : []).find(w => w.id === id) || {}).name || '').filter(Boolean).join(', ');
    h += H2('Журнал работ за период') + (L.length ? `<table class="t"><tr><th style="width:12%">Дата</th><th>Вид работ</th><th style="width:16%">Выполнено</th><th>Исполнители</th><th style="width:9%">Акт</th><th>Примечание</th></tr>
      ${L.map(p => { const v = d.vols.find(x => x.id === p.volume_id) || {}; return `<tr><td>${_srD(p.work_date)}</td><td>${esc(vname(p.volume_id))}</td><td class="n">${_srN(p.completed)} ${esc(v.unit || '')}${p.amount2 != null && v.m2 ? ` · ${_srN(p.amount2)} ${esc(v.m2.unit || '')}` : ''}</td><td>${esc(wname(p.worker_ids))}</td><td>${esc(p.act_number || '')}</td><td>${esc(p.notes || '')}</td></tr>`; }).join('')}</table>
      ${d.log.length > L.length ? `<p class="cap">Показаны последние ${L.length} записей из ${d.log.length}.</p>` : ''}` : '<p>За период записей нет.</p>');
    const dt = (o.log || []).filter(x => x.action === 'Простой из-за погоды');
    if (dt.length) h += `<h3>Простои из-за погоды</h3><table class="t"><tr><th>Запись</th><th style="width:30%">Кто отметил</th></tr>${dt.map(x => `<tr><td>${esc(x.details || '')}</td><td>${esc(x.user_name || '')}</td></tr>`).join('')}</table>`;
  }
  // персонал и техника — только базы, где кто-то есть
  const bases = (o.bases || []).map(b => ({ b, W: (b.workers || []).filter(w => w.status !== 'fired'), M: b.machinery || [] })).filter(x => x.W.length || x.M.length);
  if (opt.team && bases.length) {
    h += H2('Персонал и техника') + `<table class="t"><tr><th style="width:22%">База</th><th>Персонал</th><th>Техника</th></tr>${bases.map(({ b, W, M }) => `<tr><td><b>${esc(b.name)}</b><br><span class="cap">${W.length} чел. · ${M.length} ед.</span></td>
      <td>${W.map(w => `${esc(w.name)}${w.role ? ' — ' + esc(w.role) : ''}`).join('<br>') || '—'}</td><td>${M.map(m => `${esc(m.name)}${m.plate_number ? ' ' + esc(m.plate_number) : ''}${m.type ? ' (' + esc(m.type) + ')' : ''}`).join('<br>') || '—'}</td></tr>`).join('')}</table>`;
  }
  if (opt.tasks && (o.tasks || []).length) {
    h += H2('Задачи и замечания') + `<table class="t"><tr><th>Задача</th><th style="width:22%">Ответственный</th><th style="width:13%">Срок</th><th style="width:14%">Статус</th></tr>${o.tasks.map(t => `<tr><td>${esc(t.title)}</td><td>${esc(t.responsible || '')}</td><td>${_srD(t.due_date)}</td><td>${t.status === 'done' ? 'Выполнена' : 'В работе'}</td></tr>`).join('')}</table>`;
  }
  if (opt.photo && imgs.photos.length) {
    h += `<h2 class="pb">${++sec}. Фотоматериалы</h2><table class="ph">`;
    for (let i = 0; i < imgs.photos.length; i += 2) h += `<tr>${[0, 1].map(k => { const p = imgs.photos[i + k]; if (!p) return '<td></td>'; fig++; return `<td><img src="${p.src}" width="302" style="width:8cm" alt=""><p class="cap">Фото ${fig}${p.cap ? ' — ' + esc(p.cap) : ''}</p></td>`; }).join('')}</tr>`;
    h += '</table>';
  }
  h += `<p class="foot">Составил: ${esc(typeof un === 'function' ? un() : '')} · ${new Date().toLocaleDateString('ru-RU')} · ПурГеоКом «Спутник»</p>`;
  return h;
}
const _SR_CSS = `body{font-family:'Times New Roman',serif;font-size:12pt;color:#000}
  table.hdr{width:100%;border-bottom:2px solid #1e3a8a;margin-bottom:14pt} table.hdr td{padding:0 0 3pt} .org{font-weight:bold;color:#1e3a8a;font-size:13pt} .dt{text-align:right;color:#555;font-size:10pt}
  h1{font-size:20pt;margin:0 0 4pt;text-align:center} .sub{text-align:center;color:#333;margin:0 0 14pt;font-size:13pt}
  h2{font-size:14pt;margin:16pt 0 6pt;border-bottom:1px solid #999;padding-bottom:2pt;page-break-after:avoid} h2.pb{page-break-before:always}
  h3{font-size:12pt;margin:10pt 0 4pt;page-break-after:avoid}
  .note{border-left:3px solid #1e3a8a;padding:4pt 8pt;background:#f1f5ff}
  table.kv{border-collapse:collapse} table.kv td{padding:2pt 12pt 2pt 0;vertical-align:top} table.kv td.k{color:#555;white-space:nowrap}
  table.t{border-collapse:collapse;width:100%;font-size:10.5pt} table.t th,table.t td{border:1px solid #888;padding:3pt 5pt;vertical-align:top}
  table.t th{background:#e5e7eb;font-weight:bold;text-align:center} table.t td.n{text-align:right;white-space:nowrap} table.t td.c{text-align:center}
  table.t tr.cat td{background:#f3f4f6;font-weight:bold} table.t tr.sub2 td{color:#444;font-size:9.5pt;border-top:none}
  table.fig{width:100%;border-collapse:collapse;margin:6pt 0 10pt;page-break-inside:avoid} table.fig td{padding:0;text-align:center} table.fig tr{page-break-inside:avoid}
  .ft{font-weight:bold;text-align:left;margin:0 0 3pt}
  table.ph{width:100%} table.ph td{padding:4pt;text-align:center;vertical-align:top;width:50%;page-break-inside:avoid}
  .cap{font-size:9.5pt;color:#444;margin:3pt 0 0} .foot{margin-top:20pt;font-size:9.5pt;color:#666;border-top:1px solid #ccc;padding-top:4pt}
  img{page-break-inside:avoid}`;

async function _srRun(fmt) {
  const st = t => { const e = document.getElementById('sr-status'); if (e) e.textContent = t; };
  const siteId = document.getElementById('sr-site').value;
  const opt = { from: document.getElementById('sr-from').value, to: document.getElementById('sr-to').value || new Date().toISOString().slice(0, 10), note: document.getElementById('sr-note').value.trim() };
  ['map', 'sat', 'vol', 'chart', 'log', 'team', 'tasks', 'photo'].forEach(k => { opt[k] = !!document.getElementById('sr-' + k)?.checked; });
  opt.mapmode = document.getElementById('sr-mapmode').value; opt.scale = document.getElementById('sr-scale').value;
  try { const { from, to, ...keep } = opt; localStorage.setItem('srep_opts', JSON.stringify(keep)); } catch (e) {}
  document.querySelectorAll('#mft .btn').forEach(b => b.disabled = true);
  try {
    st('⏳ Собираю данные…');
    const d = await _srCollect(siteId, opt.from, opt.to);
    const imgs = { charts: [], photos: [] };
    imgs.sheets = [];
    if (opt.map) {
      const sh = opt.mapmode === 'one' ? { sheets: [] } : _srSheets(d.o, opt.scale);
      if (opt.mapmode !== 'only' || !sh.sheets.length) { st('⏳ Карта…'); const u = await _srMapImage(d.o, opt.sat, { frames: sh.sheets }); if (u) imgs.map = { src: u }; }
      for (let i = 0; i < sh.sheets.length; i++) {
        st(`⏳ Участок ${i + 1} из ${sh.sheets.length}…`);
        const mo = { box: sh.sheets[i], labels: true }, u = await _srMapImage(d.o, opt.sat, mo);
        if (u) imgs.sheets.push({ src: u, cap: _srSheetCaption(d.o, sh.sheets[i]), scale: sh.sheets[i].scale, lab: mo.labStat });
      }
    }
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
