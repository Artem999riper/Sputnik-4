// ═══════════════════════════════════════════════════════════
// coord-catalog.js — каталог координат: из слоя (ПКМ по слою) или выделенных
// объектов (меню выделения) — ведомость №, название, X, Y, H.
//   • система: МСК региона (одна зона на весь каталог — по центру объектов),
//     WGS-84 (градусы или ГМС), UTM;
//   • точки — по одной строке; линии/полигоны — по желанию все вершины;
//   • выгрузка в Excel, в текст для прибора (имя X Y H) или в буфер обмена.
// ═══════════════════════════════════════════════════════════
const CCAT = Object.assign({ crs: 'msk', pts: true, verts: true, num: 'name', sort: 'layer', prec: 2, sep: 'tab' },
  (() => { try { return JSON.parse(localStorage.getItem('ccat_opts') || '{}'); } catch (e) { return {}; } })(), { src: null });

// источник: [{name, feats:[feature]}]
function coordCatalogLayer(id) {
  const l = (layers || []).find(x => x.id === id); if (!l) return;
  let gj; try { gj = JSON.parse(l.geojson); } catch (e) { return; }
  const feats = gj.type === 'FeatureCollection' ? (gj.features || []) : (gj.type === 'Feature' ? [gj] : []);
  _ccatOpen({ title: `Слой «${l.name}»`, file: l.name, feats });
}
function coordCatalogSelection(ks) {
  ks = ks || (typeof kselToKs === 'function' ? kselToKs() : null);
  if (!ks || !ks.total) { toast('Ничего не выделено', 'warn'); return; }
  const feats = []; ks.entries.forEach(en => en.idxs.forEach(i => { if (en.gj.features[i]) feats.push(en.gj.features[i]); }));
  const nm = ks.entries.length === 1 ? ks.entries[0].rec.name : 'выделенное';
  _ccatOpen({ title: `Выделено: ${feats.length} объект(ов)`, file: nm, feats });
}

// строки каталога в WGS: {name, lat, lng, h, type}
function _ccatRows(src) {
  const rows = [], natural = (a, b) => String(a).localeCompare(String(b), 'ru', { numeric: true });
  let feats = src.feats.filter(f => f && f.geometry);
  if (CCAT.sort === 'name') feats = feats.slice().sort((a, b) => natural((a.properties || {}).name || '', (b.properties || {}).name || ''));
  feats.forEach((f, fi) => {
    const p = f.properties || {}, g = f.geometry, nm = String(p.name || p.Name || '').trim() || `Объект ${fi + 1}`;
    const add = (c, n, t) => rows.push({ name: n, lng: +c[0], lat: +c[1], h: c.length > 2 && c[2] != null && c[2] !== 0 ? +c[2] : null, type: t });
    if (g.type === 'Point') { if (CCAT.pts) add(g.coordinates, nm, 'точка'); return; }
    if (g.type === 'MultiPoint') { if (CCAT.pts) g.coordinates.forEach((c, k) => add(c, `${nm}-${k + 1}`, 'точка')); return; }
    if (!CCAT.verts) return;
    const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates
      : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
    const t = /Polygon/.test(g.type) ? 'полигон' : 'линия';
    let k = 0;
    parts.forEach(ring => {
      let cs = ring || [];
      // у замкнутого контура последняя вершина = первая — не повторять
      if (cs.length > 2 && cs[0][0] === cs[cs.length - 1][0] && cs[0][1] === cs[cs.length - 1][1]) cs = cs.slice(0, -1);
      cs.forEach(c => add(c, `${nm} в.${++k}`, t));
    });
  });
  if (CCAT.num === 'seq') rows.forEach((r, i) => { r.name = String(i + 1); });
  return rows;
}
// пересчёт в выбранную систему: {cols:[...], name, vals(row)→[...]}
function _ccatProj(rows) {
  const deg = v => v.toFixed(7), dms = (v, lat) => {
    const a = Math.abs(v), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = (mf - m) * 60;
    return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(3).padStart(6, '0')}″ ${lat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W')}`;
  };
  const H = r => r.h == null ? '' : r.h.toFixed(2);
  if (CCAT.crs === 'wgs' || CCAT.crs === 'dms') {
    const f = CCAT.crs === 'wgs' ? deg : dms;
    return { name: 'WGS-84' + (CCAT.crs === 'dms' ? ' (ГМС)' : ' (градусы)'), cols: ['Широта', 'Долгота', 'H, м'],
      vals: r => [CCAT.crs === 'wgs' ? +deg(r.lat) : f(r.lat, true), CCAT.crs === 'wgs' ? +deg(r.lng) : f(r.lng, false), H(r) === '' ? '' : +H(r)] };
  }
  const cLng = rows.length ? rows.reduce((s, r) => s + r.lng, 0) / rows.length : 0;
  let proj = null, name = '';
  if (CCAT.crs === 'utm') { const z = utmZoneFromLng(cLng); proj = _utmProj(z); name = `WGS-84 / UTM зона ${z}N`; }
  else {
    const reg = CCAT.reg || (typeof coordMskRegion !== 'undefined' ? coordMskRegion : '86');
    const z = typeof _mskFullPickZone === 'function' ? _mskFullPickZone(reg, cLng) : null;
    if (z) {
      const tw = (MSK_FULL.datums && MSK_FULL.datums['2008']) || [23.57, -140.95, -79.8, 0, 0.35, 0.79, -0.22];
      proj = `+proj=tmerc +lat_0=0 +lon_0=${z.lon} +k=1 +x_0=${z.x0} +y_0=${z.y0} +ellps=${MSK_FULL.ellps || 'krass'} +towgs84=${tw.join(',')} +units=m +no_defs`;
      name = `МСК-${reg} зона ${z.z}`;
    } else if (typeof _mskProj === 'function' && typeof _mskZone === 'function') { const z2 = _mskZone(cLng); proj = _mskProj(z2); name = `МСК зона ${z2}`; }
  }
  if (!proj) return null;
  const pr = +CCAT.prec;
  return { name, cols: ['X, м', 'Y, м', 'H, м'], vals: r => { const [e, n] = proj4('EPSG:4326', proj, [r.lng, r.lat]); return [+n.toFixed(pr), +e.toFixed(pr), H(r) === '' ? '' : +H(r)]; } };
}

function _ccatOpen(src) {
  CCAT.src = src;
  const regs = typeof MSK_FULL !== 'undefined' && MSK_FULL && MSK_FULL.regions ? Object.keys(MSK_FULL.regions) : [];
  if (!CCAT.reg) CCAT.reg = typeof coordMskRegion !== 'undefined' ? coordMskRegion : (regs[0] || '86');
  const hasPts = src.feats.some(f => f.geometry && /Point/.test(f.geometry.type)), hasLines = src.feats.some(f => f.geometry && !/Point/.test(f.geometry.type));
  const sel = (id, opts, cur) => `<select id="ccat-${id}" onchange="_ccatSet()">${opts.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const ck = (id, l, on, dis) => `<label style="display:flex;gap:6px;align-items:center;font-size:12px;text-transform:none;font-weight:500;margin:0;${dis ? 'opacity:.45' : ''}"><input type="checkbox" id="ccat-${id}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''} onchange="_ccatSet()" style="width:auto;margin:0"> ${l}</label>`;
  showModal('📋 Каталог координат', `<div style="min-width:min(560px,90vw);display:flex;flex-direction:column;gap:8px">
    <div style="font-size:12px;color:var(--tx2)">${esc(src.title)}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <div class="fg" style="margin:0;flex:1;min-width:150px"><label>Система координат</label>${sel('crs', [['msk', 'МСК (X, Y в метрах)'], ['wgs', 'WGS-84, градусы'], ['dms', 'WGS-84, гр° мин′ сек″'], ['utm', 'UTM (WGS-84)']], CCAT.crs)}</div>
      <div class="fg" style="margin:0;width:110px;${CCAT.crs === 'msk' ? '' : 'display:none'}" id="ccat-regw"><label>Регион МСК</label>${sel('reg', regs.map(r => [r, 'МСК-' + r]), CCAT.reg)}</div>
      <div class="fg" style="margin:0;width:110px;${/msk|utm/.test(CCAT.crs) ? '' : 'display:none'}" id="ccat-precw"><label>Точность</label>${sel('prec', [[1, '0,1 м'], [2, '0,01 м'], [3, '0,001 м']], CCAT.prec)}</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <div class="fg" style="margin:0;flex:1;min-width:150px"><label>Нумерация</label>${sel('num', [['name', 'по названиям объектов'], ['seq', 'сквозная 1, 2, 3…']], CCAT.num)}</div>
      <div class="fg" style="margin:0;flex:1;min-width:150px"><label>Порядок</label>${sel('sort', [['layer', 'как в слое'], ['name', 'по названию (1, 2, 10…)']], CCAT.sort)}</div>
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap">${ck('pts', 'Точки', CCAT.pts, !hasPts)}${ck('verts', 'Вершины линий и полигонов', CCAT.verts, !hasLines)}</div>
    <div id="ccat-prev" style="max-height:260px;overflow:auto;border:1px solid var(--bd);border-radius:8px"></div>
  </div>`, [
    { label: 'Закрыть', cls: 'bs', fn: closeModal },
    { label: '📋 Копировать', cls: 'bs', fn: () => _ccatOut('copy') },
    { label: '📄 Текст для прибора', cls: 'bs', fn: () => _ccatOut('txt') },
    { label: '📊 Excel', cls: 'bp', fn: () => _ccatOut('xlsx') },
  ]);
  _ccatPreview();
}
function _ccatSet() {
  const g = id => document.getElementById('ccat-' + id);
  CCAT.crs = g('crs').value; if (g('reg')) CCAT.reg = g('reg').value; CCAT.prec = +g('prec').value;
  CCAT.num = g('num').value; CCAT.sort = g('sort').value;
  if (!g('pts').disabled) CCAT.pts = g('pts').checked; if (!g('verts').disabled) CCAT.verts = g('verts').checked;
  document.getElementById('ccat-regw').style.display = CCAT.crs === 'msk' ? '' : 'none';
  document.getElementById('ccat-precw').style.display = /msk|utm/.test(CCAT.crs) ? '' : 'none';
  try { localStorage.setItem('ccat_opts', JSON.stringify({ crs: CCAT.crs, reg: CCAT.reg, prec: CCAT.prec, num: CCAT.num, sort: CCAT.sort, pts: CCAT.pts, verts: CCAT.verts })); } catch (e) {}
  _ccatPreview();
}
// итоговая таблица: {sys, head, body:[[№, название, a, b, h, тип]]}
function _ccatTable() {
  const rows = _ccatRows(CCAT.src), P = _ccatProj(rows);
  if (!P) return null;
  const withH = rows.some(r => r.h != null);
  const head = ['№', 'Название', ...P.cols.slice(0, withH ? 3 : 2), 'Тип'];
  const body = rows.map((r, i) => { const v = P.vals(r); return [i + 1, r.name, v[0], v[1], ...(withH ? [v[2]] : []), r.type]; });
  return { sys: P.name, head, body, withH };
}
function _ccatPreview() {
  const el = document.getElementById('ccat-prev'); if (!el) return;
  const T = _ccatTable();
  if (!T) { el.innerHTML = '<div style="padding:10px;color:var(--red);font-size:12px">Не удалось определить зону МСК — выберите регион или другую систему</div>'; return; }
  if (!T.body.length) { el.innerHTML = '<div style="padding:10px;color:var(--tx3);font-size:12px">Нет точек — включите «Точки» или «Вершины»</div>'; return; }
  const nf = v => typeof v === 'number' ? v.toLocaleString('ru-RU', { minimumFractionDigits: CCAT.crs === 'wgs' ? 7 : +CCAT.prec, maximumFractionDigits: CCAT.crs === 'wgs' ? 7 : 3, useGrouping: false }) : esc(String(v));
  const N = 200;
  el.innerHTML = `<div style="font-size:11px;padding:5px 8px;background:var(--s2);border-bottom:1px solid var(--bd)"><b>${esc(T.sys)}</b> · строк: ${T.body.length}${T.body.length > N ? ` (показаны первые ${N})` : ''}</div>
    <table class="ccat-t"><thead><tr>${T.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${T.body.slice(0, N).map(r => `<tr>${r.map((c, j) => `<td${j >= 2 && j < r.length - 1 ? ' class="n"' : ''}>${j === 0 ? c : nf(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function _ccatOut(kind) {
  const T = _ccatTable(); if (!T || !T.body.length) { toast('Каталог пуст', 'warn'); return; }
  const date = new Date().toISOString().slice(0, 10), fn = `Каталог координат — ${String(CCAT.src.file || '').replace(/[\\/:*?"<>|]/g, '_')}`;
  const dec = v => typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  if (kind === 'xlsx') {
    if (typeof XLSX === 'undefined') { toast('Excel недоступен', 'err'); return; }
    const aoa = [['Каталог координат'], [CCAT.src.title], ['Система координат: ' + T.sys], ['Дата: ' + new Date().toLocaleDateString('ru-RU')], [], T.head, ...T.body];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = T.head.map((h, i) => ({ wch: i === 0 ? 5 : i === 1 ? 28 : h === 'Тип' ? 9 : 16 }));
    const fmt = CCAT.crs === 'wgs' ? '0.0000000' : '0.' + '0'.repeat(+CCAT.prec);
    for (let r = 6; r < aoa.length; r++) for (let c = 2; c < T.head.length - 1; c++) { const a = ws[XLSX.utils.encode_cell({ r, c })]; if (a && a.t === 'n') a.z = (T.withH && c === T.head.length - 2) ? '0.00' : fmt; }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Каталог');
    XLSX.writeFile(wb, `${fn} ${date}.xlsx`); toast('Каталог сохранён в Excel', 'ok'); return;
  }
  // текст: имя X Y H — без шапки, через табуляцию (подходит большинству приборов и Credo)
  const lines = T.body.map(r => [r[1], ...r.slice(2, T.withH ? 5 : 4)].map((c, j) => j ? dec(c) : String(c).replace(/\s+/g, '_')).join('\t'));
  if (kind === 'copy') {
    const txt = [T.head.slice(1, -1).join('\t'), ...T.body.map(r => [r[1], ...r.slice(2, T.withH ? 5 : 4)].map((c, j) => j ? dec(c) : c).join('\t'))].join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Скопировано — вставьте в Excel или Word', 'ok'), () => {
      const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Скопировано', 'ok'); } catch (e) {} ta.remove();
    });
    return;
  }
  const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${fn} ${date}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Файл для прибора сохранён: название, X, Y' + (T.withH ? ', H' : '') + ' через табуляцию', 'ok');
}
