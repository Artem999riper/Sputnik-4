// ═══════════════════════════════════════════════════════════
// coord-catalog.js — каталог координат (ведомость): из слоя (ПКМ по слою),
// выделенных объектов (меню выделения) или таблицы атрибутов («🛠 Инструменты»):
// №, название, X, Y, H + выбранные атрибуты (глубина, отметка устья…), строка «Итого».
//   • система — любая из общего списка (МСК, СК-42/95, ГСК, УТМ, УХТА-B/C, свои);
//     для широты/долготы — градусы или ГМС; одна зона на весь каталог — по центру объектов;
//   • точки — по одной строке; линии/полигоны — по желанию все вершины;
//   • выгрузка: Excel, Word (.docx — собирается на сервере), текст для прибора, буфер обмена.
// ═══════════════════════════════════════════════════════════
const CCAT = Object.assign({ pts: true, verts: true, num: 'name', sort: 'layer', prec: 2, geoFmt: 'deg', attrs: [] },
  (() => { try { return JSON.parse(localStorage.getItem('ccat_opts') || '{}'); } catch (e) { return {}; } })(), { src: null });

// источник: {title, file, feats:[feature]}
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
// из таблицы атрибутов: выделенные строки, а без выделения — показанные (в порядке таблицы)
function coordCatalogTable() {
  const l = typeof _katLayer === 'function' ? _katLayer() : null; if (!l) return;
  const sc = _katScope(), all = _kaFeatures(l);
  const feats = sc.idxs.map(i => all[i]).filter(Boolean);
  if (!feats.length) { toast('В таблице нет строк', 'warn'); return; }
  _ccatOpen({ title: `Слой «${l.name}» — ${sc.what}`, file: l.name, feats, ordered: true });
}

// строки каталога в WGS: {name, lat, lng, h, type, p (атрибуты — у точки и первой вершины)}
function _ccatRows(src) {
  const rows = [], natural = (a, b) => String(a).localeCompare(String(b), 'ru', { numeric: true });
  let feats = src.feats.filter(f => f && f.geometry);
  if (CCAT.sort === 'name') feats = feats.slice().sort((a, b) => natural((a.properties || {}).name || '', (b.properties || {}).name || ''));
  feats.forEach((f, fi) => {
    const p = f.properties || {}, g = f.geometry, nm = String(p.name || p.Name || '').trim() || `Объект ${fi + 1}`;
    let first = true;
    const add = (c, n, t) => { rows.push({ name: n, lng: +c[0], lat: +c[1], h: c.length > 2 && c[2] != null && c[2] !== 0 ? +c[2] : null, type: t, p: first ? p : null }); first = false; };
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
// пересчёт в выбранную систему: {name, cols:[a, b, h], geo, vals(row)→[a, b, h]}
function _ccatProj(rows) {
  const st = CCAT.st || { sys: 'msk' };
  const H = r => r.h == null ? '' : +r.h.toFixed(2);
  const c = rows.length ? [rows.reduce((s, r) => s + r.lng, 0) / rows.length, rows.reduce((s, r) => s + r.lat, 0) / rows.length] : [75, 62];
  let R; try { R = crsExportResolve(st, c[0], c[1]); } catch (e) { return { err: e.message }; }
  const dms = (v, lat) => {
    const a = Math.abs(v), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = (mf - m) * 60;
    return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(4).padStart(7, '0')}″ ${lat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W')}`;
  };
  if (R.geo) {
    const fmt = CCAT.geoFmt === 'dms' ? dms : (v => +v.toFixed(8));
    return { name: R.name + (CCAT.geoFmt === 'dms' ? ' (ГМС)' : ' (градусы)'), geo: true, cols: ['Широта', 'Долгота', 'H, м'],
      vals: r => { const w = R.proj ? proj4('EPSG:4326', R.proj, [r.lng, r.lat]) : [r.lng, r.lat]; return [fmt(w[1], true), fmt(w[0], false), H(r)]; } };
  }
  const pr = +CCAT.prec;
  return { name: R.name, cols: ['X, м', 'Y, м', 'H, м'], vals: r => { const [e, n] = proj4('EPSG:4326', R.proj, [r.lng, r.lat]); return [+n.toFixed(pr), +e.toFixed(pr), H(r)]; } };
}
const _ccatFields = src => { const s = new Set(); src.feats.forEach(f => Object.keys((f && f.properties) || {}).forEach(k => { if (!k.startsWith('_') && k !== 'name' && k !== 'Name') s.add(k); })); return [...s]; };

function _ccatOpen(src) {
  CCAT.src = src;
  if (src.ordered) CCAT.sort = 'layer';
  const hasPts = src.feats.some(f => f.geometry && /Point/.test(f.geometry.type)), hasLines = src.feats.some(f => f.geometry && !/Point/.test(f.geometry.type));
  const sel = (id, opts, cur) => `<select id="ccat-${id}" onchange="_ccatSet()">${opts.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const ck = (id, l, on, dis) => `<label style="display:flex;gap:6px;align-items:center;font-size:12px;text-transform:none;font-weight:500;margin:0;${dis ? 'opacity:.45' : ''}"><input type="checkbox" id="ccat-${id}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''} onchange="_ccatSet()" style="width:auto;margin:0"> ${l}</label>`;
  const flds = _ccatFields(src);
  CCAT.attrs = (CCAT.attrs || []).filter(a => flds.includes(a));
  if (!CCAT.attrs.length) CCAT.attrs = flds.filter(f => /глубин|отметк|^h$|абс/i.test(f)).slice(0, 3);
  const st0 = (typeof crspRecall === 'function' && crspRecall('ccat')) || { sys: 'msk' };
  showModal('📋 Каталог координат', `<div style="min-width:min(620px,90vw);display:flex;flex-direction:column;gap:8px">
    <div style="font-size:12px;color:var(--tx2)">${esc(src.title)}</div>
    <div class="fg" style="margin:0"><label>Система координат</label>${crspHtml('ccat', st0, { onChange: '_ccatSet' })}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <div class="fg" style="margin:0;width:120px" id="ccat-precw"><label>Точность</label>${sel('prec', [[1, '0,1 м'], [2, '0,01 м'], [3, '0,001 м']], CCAT.prec)}</div>
      <div class="fg" style="margin:0;width:150px;display:none" id="ccat-gfw"><label>Широта / долгота</label>${sel('gf', [['deg', 'градусы'], ['dms', 'гр° мин′ сек″']], CCAT.geoFmt)}</div>
      <div class="fg" style="margin:0;flex:1;min-width:150px"><label>Нумерация</label>${sel('num', [['name', 'по названиям объектов'], ['seq', 'сквозная 1, 2, 3…']], CCAT.num)}</div>
      ${src.ordered ? '' : `<div class="fg" style="margin:0;flex:1;min-width:150px"><label>Порядок</label>${sel('sort', [['layer', 'как в слое'], ['name', 'по названию (1, 2, 10…)']], CCAT.sort)}</div>`}
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap">${ck('pts', 'Точки', CCAT.pts, !hasPts)}${ck('verts', 'Вершины линий и полигонов', CCAT.verts, !hasLines)}</div>
    ${flds.length ? `<div><div style="font-size:11px;color:var(--tx3);margin-bottom:3px">Столбцы атрибутов (числовые — с суммой в «Итого»):</div><div style="display:flex;gap:4px 12px;flex-wrap:wrap;max-height:64px;overflow:auto">${flds.map(f => `<label style="display:flex;gap:4px;align-items:center;font-size:12px;font-weight:500;text-transform:none;margin:0"><input type="checkbox" class="ccat-attr" value="${escAttr(f)}" ${CCAT.attrs.includes(f) ? 'checked' : ''} onchange="_ccatSet()" style="width:auto;margin:0"> ${esc(f)}</label>`).join('')}</div></div>` : ''}
    <div id="ccat-prev" style="max-height:260px;overflow:auto;border:1px solid var(--bd);border-radius:8px"></div>
  </div>`, [
    { label: 'Закрыть', cls: 'bs', fn: closeModal },
    { label: '📋 Копировать', cls: 'bs', fn: () => _ccatOut('copy') },
    { label: '📄 Для прибора', cls: 'bs', fn: () => _ccatOut('txt') },
    { label: '📝 Word', cls: 'bs', fn: () => _ccatOut('docx') },
    { label: '📊 Excel', cls: 'bp', fn: () => _ccatOut('xlsx') },
  ]);
  _ccatSet(true);
}
function _ccatSet(init) {
  const g = id => document.getElementById('ccat-' + id);
  CCAT.st = crspRead('ccat');
  if (!init) {
    CCAT.prec = +g('prec').value; CCAT.geoFmt = g('gf').value; CCAT.num = g('num').value; if (g('sort')) CCAT.sort = g('sort').value;
    if (!g('pts').disabled) CCAT.pts = g('pts').checked; if (!g('verts').disabled) CCAT.verts = g('verts').checked;
    CCAT.attrs = [...document.querySelectorAll('.ccat-attr:checked')].map(e => e.value);
  }
  const geo = typeof crsIsGeo === 'function' && crsIsGeo(CCAT.st);
  if (g('precw')) g('precw').style.display = geo ? 'none' : '';
  if (g('gfw')) g('gfw').style.display = geo ? '' : 'none';
  try {
    crspRemember('ccat', CCAT.st);
    localStorage.setItem('ccat_opts', JSON.stringify({ prec: CCAT.prec, geoFmt: CCAT.geoFmt, num: CCAT.num, sort: CCAT.sort, pts: CCAT.pts, verts: CCAT.verts, attrs: CCAT.attrs }));
  } catch (e) {}
  _ccatPreview();
}
// итоговая таблица: {sys, head, body:[[№, название, a, b, (h), …атрибуты, тип]], foot, withH}
function _ccatTable() {
  const rows = _ccatRows(CCAT.src), P = _ccatProj(rows);
  if (!P || P.err) return { err: (P && P.err) || 'Не удалось определить систему' };
  const withH = rows.some(r => r.h != null), at = CCAT.attrs || [];
  const head = ['№', 'Название', ...P.cols.slice(0, withH ? 3 : 2), ...at, 'Тип'];
  const val = v => { if (v == null || v === '') return ''; const n = typeof v === 'number' ? v : (/^-?\d+([.,]\d+)?$/.test(String(v).trim()) ? parseFloat(String(v).replace(',', '.')) : NaN); return Number.isFinite(n) ? n : String(v); };
  const body = rows.map((r, i) => { const v = P.vals(r); return [i + 1, r.name, v[0], v[1], ...(withH ? [v[2]] : []), ...at.map(a => r.p ? val(r.p[a]) : ''), r.type]; });
  // Итого: число строк и суммы числовых атрибутов
  const off = withH ? 5 : 4, foot = head.map(() => '');
  foot[1] = `Итого: ${body.length}`;
  at.forEach((a, k) => { const vs = body.map(r => r[off + k]).filter(v => v !== ''); const ns = vs.filter(v => typeof v === 'number'); if (ns.length && ns.length >= vs.length * 0.8) foot[off + k] = Math.round(ns.reduce((s, v) => s + v, 0) * 1000) / 1000; });
  return { sys: P.name, geo: !!P.geo, head, body, foot, withH, off };
}
const _ccatNf = (v, T) => typeof v === 'number' ? v.toLocaleString('ru-RU', { maximumFractionDigits: T.geo ? 8 : 3, useGrouping: false }) : String(v);
function _ccatPreview() {
  const el = document.getElementById('ccat-prev'); if (!el) return;
  const T = _ccatTable();
  if (T.err) { el.innerHTML = `<div style="padding:10px;color:var(--red);font-size:12px">${esc(T.err)}</div>`; return; }
  if (!T.body.length) { el.innerHTML = '<div style="padding:10px;color:var(--tx3);font-size:12px">Нет точек — включите «Точки» или «Вершины»</div>'; return; }
  const N = 200, nf = v => esc(_ccatNf(v, T));
  el.innerHTML = `<div style="font-size:11px;padding:5px 8px;background:var(--s2);border-bottom:1px solid var(--bd)"><b>${esc(T.sys)}</b> · строк: ${T.body.length}${T.body.length > N ? ` (показаны первые ${N})` : ''}</div>
    <table class="ccat-t"><thead><tr>${T.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${T.body.slice(0, N).map(r => `<tr>${r.map((c, j) => `<td${j >= 2 && j < r.length - 1 ? ' class="n"' : ''}>${j === 0 ? c : nf(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr>${T.foot.map(c => `<td style="font-weight:700;background:var(--s2)">${nf(c)}</td>`).join('')}</tr></tfoot></table>`;
}
async function _ccatOut(kind) {
  const T = _ccatTable(); if (T.err || !T.body.length) { toast(T.err || 'Каталог пуст', 'warn'); return; }
  const date = new Date().toISOString().slice(0, 10), fn = `Каталог координат — ${String(CCAT.src.file || '').replace(/[\\/:*?"<>|]/g, '_')}`;
  const dec = v => typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  const lines = [CCAT.src.title, 'Система координат: ' + T.sys, 'Дата: ' + new Date().toLocaleDateString('ru-RU')];
  if (kind === 'xlsx') {
    if (typeof XLSX === 'undefined') { toast('Excel недоступен', 'err'); return; }
    const aoa = [['Каталог координат'], ...lines.map(x => [x]), [], T.head, ...T.body, T.foot];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = T.head.map((h, i) => ({ wch: i === 0 ? 5 : i === 1 ? 28 : h === 'Тип' ? 9 : 16 }));
    const fmt = T.geo ? '0.00000000' : '0.' + '0'.repeat(+CCAT.prec);
    const r0 = 6;   // шапка таблицы — строка 5 (с нуля)
    for (let r = r0; r < aoa.length; r++) for (let c = 2; c < 4; c++) { const a = ws[XLSX.utils.encode_cell({ r, c })]; if (a && a.t === 'n') a.z = fmt; }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Каталог');
    XLSX.writeFile(wb, `${fn} ${date}.xlsx`); toast('Каталог сохранён в Excel', 'ok'); return;
  }
  if (kind === 'docx') {
    const widths = T.head.map((h, i) => i === 0 ? 0.5 : i === 1 ? 2.2 : h === 'Тип' ? 0.9 : i < T.off ? 1.4 : 1.1);
    const body = { file: `${fn} ${date}`, title: 'Каталог координат', lines, head: T.head, landscape: T.head.length > 7, widths,
      rows: T.body.map(r => r.map((c, j) => j === 0 ? String(c) : _ccatNf(c, T))), foot: T.foot.map(c => _ccatNf(c, T)) };
    try {
      const r = await fetch(`${API}/export/docx-table`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || r.status); }
      const blob = await r.blob(), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `${fn} ${date}.docx`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      toast('Каталог сохранён в Word', 'ok');
    } catch (e) { toast('Не удалось сделать Word: ' + e.message, 'err'); }
    return;
  }
  const end = T.withH ? 5 : 4;
  if (kind === 'copy') {
    const txt = [T.head.slice(1, -1).join('\t'), ...T.body.map(r => r.slice(1, -1).map(dec).join('\t')), T.foot.slice(1, -1).map(dec).join('\t')].join('\n');
    _ccatCopy(txt); return;
  }
  // текст для прибора: имя X Y H — без шапки, через табуляцию (подходит большинству приборов и Credo)
  const txt = T.body.map(r => [r[1], ...r.slice(2, end)].map((c, j) => j ? dec(c) : String(c).replace(/\s+/g, '_')).join('\t'));
  const blob = new Blob([txt.join('\r\n') + '\r\n'], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${fn} ${date}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Файл для прибора сохранён: название, X, Y' + (T.withH ? ', H' : '') + ' через табуляцию', 'ok');
}
// буфер обмена: по http (не https) navigator.clipboard недоступен — запасной способ
function _ccatCopy(txt) {
  const fb = () => { const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); toast(ok ? 'Скопировано — вставьте в Excel или Word' : 'Не удалось скопировать', ok ? 'ok' : 'err'); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(() => toast('Скопировано — вставьте в Excel или Word', 'ok'), fb); else fb();
}
