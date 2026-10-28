// ═══════════════════════════════════════════════════════════
// layer-attr.js — атрибуты слоёв KML:
//   • таблица атрибутов (панель снизу карты): сортировка, поиск, правка ячеек,
//     новое поле, переименование/удаление поля, щелчок по строке — к объекту;
//   • раскраска по атрибуту (значения или интервалы чисел) + легенда на карте;
//   • подписи по выбранному полю и их размер.
// Стиль хранится в kml_layers.style_json: {colorBy, mode, colors, classes, other, labelField, labelSize}
// ═══════════════════════════════════════════════════════════
const KML_PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#469990',
  '#9a6324', '#800000', '#808000', '#000075', '#fabed4', '#dcbeff', '#aaffc3', '#ffd8b1', '#a9a9a9', '#1d4ed8', '#be123c'];

function kmlStyleOf(l) {
  if (!l) return null;
  if (l._stSrc === l.style_json) return l._st;
  try { l._st = l.style_json ? JSON.parse(l.style_json) : null; } catch (e) { l._st = null; }
  l._stSrc = l.style_json;
  return l._st;
}
function _kaFeatures(l) {
  try { const gj = JSON.parse(l.geojson); return gj.type === 'FeatureCollection' ? (gj.features || []) : [gj]; } catch (e) { return []; }
}
// Поля слоя (служебные _… не показываем), по частоте
function kmlFields(l, feats) {
  const cnt = {};
  (feats || _kaFeatures(l)).forEach(f => Object.keys((f && f.properties) || {}).forEach(k => { if (!k.startsWith('_')) cnt[k] = (cnt[k] || 0) + 1; }));
  const keys = Object.keys(cnt).sort((a, b) => (a === 'name' ? -1 : b === 'name' ? 1 : cnt[b] - cnt[a]));
  return keys;
}
const _kaNum = v => { if (typeof v === 'number') return v; const n = parseFloat(String(v == null ? '' : v).replace(',', '.').replace(/\s/g, '')); return Number.isFinite(n) && /^-?[\d\s]*[.,]?\d+$/.test(String(v).trim()) ? n : NaN; };

// Цвет объекта по атрибуту (null — правило не задано или не подходит)
function kmlAttrColor(l, props) {
  const st = kmlStyleOf(l); if (!st || !st.colorBy) return null;
  const v = props ? props[st.colorBy] : undefined;
  if (st.mode === 'ranges') {
    const n = _kaNum(v); if (!Number.isFinite(n)) return st.other || null;
    const c = (st.classes || []).find((k, i, a) => n >= k.min && (n < k.max || (i === a.length - 1 && n <= k.max)));
    return c ? c.color : (st.other || null);
  }
  const key = v == null ? '' : String(v);
  return (st.colors && st.colors[key]) || st.other || null;
}
// Текст подписи объекта
function kmlLabelText(l, props) {
  const st = kmlStyleOf(l), p = props || {};
  const f = st && st.labelField;
  if (f) return p[f] == null ? '' : String(p[f]);
  return p.name || p.Name || '';
}
function kmlLabelSize(l) { const st = kmlStyleOf(l); return st && st.labelSize ? st.labelSize : 0; }

async function kmlSaveStyle(l, st) {
  const clean = st && Object.keys(st).length ? st : null;
  const r = await fetch(`${API}/layers/${l.id}/style`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ style: clean }) });
  if (!r.ok) return false;
  l.style_json = clean ? JSON.stringify(clean) : null;
  if (typeof kmlInvalidateLayerCache === 'function') kmlInvalidateLayerCache(l.id);
  try { renderLayerGroups(); } catch (e) {}
  return true;
}

// ── Раздел в окне «Стиль слоя» ─────────────────────────────
// Встраивается в kmlOpenStyleModal: kmlAttrStyleHtml(l) → HTML, kmlAttrStyleRead() → стиль
let _kas = null;   // {layer, feats, fields, st}
let _kasPreset = null;   // из таблицы атрибутов: «раскрасить по этому полю»
function kmlAttrStyleHtml(l) {
  const feats = _kaFeatures(l), fields = kmlFields(l, feats);
  const st = Object.assign({}, kmlStyleOf(l) || {}, _kasPreset || {});
  _kasPreset = null;
  _kas = { layer: l, feats, fields, st };
  const opt = (v, t, cur) => `<option value="${escAttr(v)}" ${v === cur ? 'selected' : ''}>${esc(t)}</option>`;
  return `<div style="border:1.5px solid var(--bd);border-radius:var(--r);padding:8px 10px;margin-bottom:12px">
    <div style="font-size:11px;font-weight:700;margin-bottom:6px">🏷 Подписи</div>
    <div style="display:flex;gap:8px;align-items:center;font-size:12px;flex-wrap:wrap">
      <span>Поле:</span><select id="kas-lfield" style="flex:1;min-width:140px">${opt('', 'Название (name)', st.labelField || '')}${fields.filter(f => f !== 'name').map(f => opt(f, f, st.labelField)).join('')}</select>
      <span>Размер:</span><input id="kas-lsize" type="number" min="8" max="32" step="1" value="${st.labelSize || 11}" style="width:64px"> px
    </div>
    <div style="font-size:10px;color:var(--tx3);margin-top:3px">Включить/выключить подписи — ПКМ по слою → «Показать подписи».</div>
    <div style="font-size:11px;font-weight:700;margin:10px 0 6px">🌈 Раскраска по атрибуту</div>
    <div style="display:flex;gap:8px;align-items:center;font-size:12px;flex-wrap:wrap">
      <span>Поле:</span><select id="kas-field" style="flex:1;min-width:140px" onchange="_kasRebuild(true)">${opt('', '— один цвет для всего слоя —', st.colorBy || '')}${fields.map(f => opt(f, f, st.colorBy)).join('')}</select>
      <select id="kas-mode" onchange="_kasRebuild(true)" style="width:auto">${opt('values', 'по значениям', st.mode || 'values')}${opt('ranges', 'интервалы чисел', st.mode)}</select>
      <span id="kas-n-wrap" style="display:none">классов <input id="kas-n" type="number" min="2" max="12" value="${(st.classes || []).length || 5}" style="width:52px" onchange="_kasRebuild(true)"></span>
      <button class="btn bs bxs" type="button" onclick="_kasShuffle()" title="Другие цвета">🎲</button>
    </div>
    <div id="kas-classes" style="max-height:200px;overflow:auto;margin-top:6px"></div>
  </div>`;
}
function _kasAfterOpen() { const cur = kmlStyleOf(_kas.layer) || {}; _kasRebuild(cur.colorBy !== _kas.st.colorBy); }
function _kasValues(field) {
  const m = new Map();
  _kas.feats.forEach(f => { const v = f.properties ? f.properties[field] : undefined; const k = v == null ? '' : String(v); m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function _kasGrad(i, n) {   // жёлтый → тёмно-красный
  const a = [254, 217, 118], b = [189, 0, 38], t = n > 1 ? i / (n - 1) : 0;
  return '#' + a.map((x, k) => Math.round(x + (b[k] - x) * t).toString(16).padStart(2, '0')).join('');
}
function _kasRebuild(reset) {
  const field = document.getElementById('kas-field')?.value || '';
  const modeSel = document.getElementById('kas-mode'), box = document.getElementById('kas-classes');
  if (!box) return;
  const st = _kas.st;
  if (!field) { box.innerHTML = ''; document.getElementById('kas-n-wrap').style.display = 'none'; return; }
  const vals = _kasValues(field);
  const nums = vals.map(([v]) => _kaNum(v)).filter(Number.isFinite);
  const numeric = nums.length >= Math.max(2, vals.filter(([v]) => v !== '').length * 0.8);
  modeSel.querySelector('option[value="ranges"]').disabled = !numeric;
  if (!numeric) modeSel.value = 'values';
  if (reset && field !== st.colorBy && numeric && vals.length > 12) modeSel.value = 'ranges';
  const mode = modeSel.value;
  document.getElementById('kas-n-wrap').style.display = mode === 'ranges' ? '' : 'none';
  if (mode === 'ranges') {
    const n = Math.max(2, Math.min(12, parseInt(document.getElementById('kas-n').value) || 5));
    const keep = !reset && st.colorBy === field && st.mode === 'ranges' && st.classes && st.classes.length === n;
    let classes;
    if (keep) classes = st.classes;
    else {
      const mn = Math.min(...nums), mx = Math.max(...nums), w = (mx - mn) / n || 1;
      const r = x => Math.round(x * 1000) / 1000;
      classes = Array.from({ length: n }, (_, i) => ({ min: r(mn + w * i), max: r(i === n - 1 ? mx : mn + w * (i + 1)), color: _kasGrad(i, n) }));
    }
    box.innerHTML = classes.map((c, i) => `<div class="kas-row" style="display:flex;gap:6px;align-items:center;font-size:12px;padding:2px 0">
      <input type="color" value="${c.color}" data-i="${i}" style="width:34px;height:22px;padding:1px">
      от <input type="number" step="any" value="${c.min}" data-min="${i}" style="width:90px"> до <input type="number" step="any" value="${c.max}" data-max="${i}" style="width:90px"></div>`).join('');
    return;
  }
  const top = vals.slice(0, 40);
  const colors = (!reset && st.colorBy === field && st.mode !== 'ranges' && st.colors) ? st.colors : {};
  box.innerHTML = top.map(([v, c], i) => `<div class="kas-row" style="display:flex;gap:6px;align-items:center;font-size:12px;padding:2px 0">
      <input type="color" value="${colors[v] || KML_PALETTE[i % KML_PALETTE.length]}" data-v="${escAttr(v)}" style="width:34px;height:22px;padding:1px">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v === '' ? '<i style="color:var(--tx3)">(пусто)</i>' : esc(v)}</span><span style="color:var(--tx3);font-size:10px">${c}</span></div>`).join('')
    + (vals.length > top.length ? `<div style="display:flex;gap:6px;align-items:center;font-size:12px;padding:2px 0"><input type="color" id="kas-other" value="${st.other || '#a9a9a9'}" style="width:34px;height:22px;padding:1px"> <span>остальные ${vals.length - top.length} значений</span></div>` : '');
}
function _kasShuffle() {
  const rows = document.querySelectorAll('#kas-classes input[type=color][data-v]');
  const off = Math.floor(Math.random() * KML_PALETTE.length);
  rows.forEach((el, i) => { el.value = KML_PALETTE[(i + off) % KML_PALETTE.length]; });
}
function kmlAttrStyleRead() {
  const st = {};
  const lf = document.getElementById('kas-lfield')?.value; if (lf) st.labelField = lf;
  const ls = parseInt(document.getElementById('kas-lsize')?.value); if (ls && ls !== 11) st.labelSize = Math.max(8, Math.min(32, ls));
  const field = document.getElementById('kas-field')?.value;
  if (field) {
    st.colorBy = field; st.mode = document.getElementById('kas-mode').value;
    if (st.mode === 'ranges') {
      st.classes = [...document.querySelectorAll('#kas-classes input[type=color][data-i]')].map(el => {
        const i = el.dataset.i;
        return { color: el.value, min: parseFloat(document.querySelector(`[data-min="${i}"]`).value), max: parseFloat(document.querySelector(`[data-max="${i}"]`).value) };
      });
    } else {
      st.colors = {};
      document.querySelectorAll('#kas-classes input[type=color][data-v]').forEach(el => { st.colors[el.dataset.v] = el.value; });
      const o = document.getElementById('kas-other'); if (o) st.other = o.value;
    }
  }
  return st;
}

// ── Легенда на карте ───────────────────────────────────────
let _kaLegend = null;
function kmlRenderLegend() {
  if (!window.map) return;
  if (!kmlRenderLegend._z) { kmlRenderLegend._z = true; map.on('zoomend', () => setTimeout(kmlRenderLegend, 0)); }
  const shown = (layers || []).filter(l => { const st = kmlStyleOf(l); return st && st.colorBy && lGroups[l.id] && map.hasLayer(lGroups[l.id]); });
  if (!shown.length) { if (_kaLegend) { _kaLegend.remove(); _kaLegend = null; } return; }
  if (!_kaLegend) {
    _kaLegend = L.control({ position: 'bottomleft' });
    _kaLegend.onAdd = () => { const d = L.DomUtil.create('div', 'kml-legend'); L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); return d; };
    _kaLegend.addTo(map);
  }
  let collapsed = false; try { collapsed = localStorage.getItem('kml_legend_min') === '1'; } catch (e) {}
  const el = _kaLegend.getContainer();
  const sw = c => `<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${c};border:1px solid rgba(0,0,0,.25);flex-shrink:0"></span>`;
  el.innerHTML = `<div class="kml-legend-h" onclick="try{localStorage.setItem('kml_legend_min','${collapsed ? 0 : 1}')}catch(e){};kmlRenderLegend()">🌈 Легенда ${collapsed ? '▸' : '▾'}</div>` + (collapsed ? '' : shown.map(l => {
    const st = kmlStyleOf(l);
    const rows = st.mode === 'ranges'
      ? (st.classes || []).map(c => `<div class="kml-legend-r">${sw(c.color)} ${(+c.min).toLocaleString('ru-RU')} – ${(+c.max).toLocaleString('ru-RU')}</div>`)
      : Object.entries(st.colors || {}).slice(0, 15).map(([v, c]) => `<div class="kml-legend-r">${sw(c)} ${v === '' ? '<i>(пусто)</i>' : esc(v)}</div>`);
    const more = st.mode !== 'ranges' && Object.keys(st.colors || {}).length > 15 ? `<div class="kml-legend-r" style="color:#6b7280">… ещё ${Object.keys(st.colors).length - 15}</div>` : '';
    return `<div class="kml-legend-l"><b>${esc(l.name)}</b> <span style="color:#6b7280">· ${esc(st.colorBy)}</span></div>${rows.join('')}${more}`;
  }).join(''));
}

// ── Таблица атрибутов (панель снизу карты) ─────────────────
const KAT = { layerId: null, sort: null, dir: 1, q: '', sel: -1, hl: null, max: 1500 };
function kmlAttrTable(layerId) {
  KAT.layerId = layerId; KAT.sort = null; KAT.dir = 1; KAT.q = ''; KAT.sel = -1;
  let p = document.getElementById('kat-panel');
  if (!p) {
    p = document.createElement('div'); p.id = 'kat-panel';
    document.body.appendChild(p);
  }
  p.classList.add('open'); document.body.classList.add('kat-open');
  _katRender();
}
function kmlAttrTableClose() {
  const p = document.getElementById('kat-panel'); if (p) p.classList.remove('open');
  document.body.classList.remove('kat-open');
  _katHl(null); KAT.layerId = null;
}
function _katLayer() { return (layers || []).find(l => l.id === KAT.layerId); }
function _katSize(f) {
  const g = f && f.geometry; if (!g) return { v: null, t: '' };
  try {
    const ll = c => ({ lat: c[1], lng: c[0] });
    if (/Polygon/.test(g.type) && typeof _geoArea === 'function') {
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      const a = polys.reduce((s, p) => s + _geoArea(p[0].slice(0, -1).map(ll)) - p.slice(1).reduce((h, r) => h + _geoArea(r.slice(0, -1).map(ll)), 0), 0);
      return { v: a, t: a >= 1e4 ? (a / 1e4).toLocaleString('ru-RU', { maximumFractionDigits: 3 }) + ' га' : Math.round(a).toLocaleString('ru-RU') + ' м²' };
    }
    if (/LineString/.test(g.type) && typeof _geoDist === 'function') {
      const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
      let d = 0; lines.forEach(c => { for (let i = 1; i < c.length; i++) d += _geoDist(ll(c[i - 1]), ll(c[i])); });
      return { v: d, t: d >= 1000 ? (d / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 3 }) + ' км' : Math.round(d).toLocaleString('ru-RU') + ' м' };
    }
  } catch (e) {}
  return { v: null, t: '' };
}
function _katRender() {
  const p = document.getElementById('kat-panel'), l = _katLayer();
  if (!p || !l) { kmlAttrTableClose(); return; }
  const feats = _kaFeatures(l), fields = kmlFields(l, feats);
  const ic = t => /Point/.test(t) ? '📍' : /LineString/.test(t) ? '〰' : /Polygon/.test(t) ? '⬡' : '•';
  let rows = feats.map((f, i) => ({ f, i, sz: _katSize(f) }));
  const q = KAT.q.trim().toLowerCase();
  if (q) rows = rows.filter(r => fields.some(k => String((r.f.properties || {})[k] ?? '').toLowerCase().includes(q)));
  if (KAT.sort) {
    const k = KAT.sort, d = KAT.dir;
    const val = r => k === '#size' ? r.sz.v : (r.f.properties || {})[k];
    rows.sort((a, b) => {
      const va = val(a), vb = val(b), na = _kaNum(va), nb = _kaNum(vb);
      if (va == null || va === '') return 1; if (vb == null || vb === '') return -1;
      if (Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * d;
      return String(va).localeCompare(String(vb), 'ru', { numeric: true }) * d;
    });
  }
  const total = rows.length; rows = rows.slice(0, KAT.max);
  const arrow = k => KAT.sort === k ? (KAT.dir > 0 ? ' ▲' : ' ▼') : '';
  const st = kmlStyleOf(l) || {};
  p.innerHTML = `<div class="kat-hd">
      <b>📋 ${esc(l.name)}</b><span style="color:var(--tx3)">${q ? `${total} из ${feats.length}` : feats.length} объект(ов)</span>
      <input id="kat-q" placeholder="🔍 Поиск по всем полям…" value="${escAttr(KAT.q)}" oninput="KAT.q=this.value;_katRender();setTimeout(()=>{const e=document.getElementById('kat-q');if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length);}},0)">
      <button class="btn bs bxs" onclick="_katAddField()">＋ Поле</button>
      <span style="color:var(--tx3);font-size:10px">щелчок — к объекту · двойной щелчок — изменить · ПКМ по заголовку — поле</span>
      <button class="kml-panel-close" onclick="kmlAttrTableClose()" title="Закрыть">✕</button></div>
    <div class="kat-body"><table class="kat-tbl"><thead><tr><th>#</th><th></th>
      ${fields.map(k => `<th onclick="_katSort('${escAttr(k)}')" oncontextmenu="event.preventDefault();_katFieldMenu(event,'${escAttr(k)}')" title="${esc(k)}">${esc(k)}${st.colorBy === k ? ' 🌈' : ''}${st.labelField === k ? ' 🏷' : ''}${arrow(k)}</th>`).join('')}
      <th onclick="_katSort('#size')">Площадь / длина${arrow('#size')}</th></tr></thead><tbody>
      ${rows.map(r => {
        const pr = r.f.properties || {}, c = kmlAttrColor(l, pr);
        return `<tr data-i="${r.i}" class="${r.i === KAT.sel ? 'on' : ''}${pr._hidden ? ' hid' : ''}" onclick="_katPick(${r.i})">
          <td>${r.i + 1}</td><td>${c ? `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${c};margin-right:3px"></span>` : ''}${ic(r.f.geometry && r.f.geometry.type)}</td>
          ${fields.map(k => `<td ondblclick="event.stopPropagation();_katEdit(this,${r.i},'${escAttr(k)}')">${esc(pr[k] == null ? '' : String(pr[k]))}</td>`).join('')}
          <td style="color:var(--tx2)">${r.sz.t}</td></tr>`;
      }).join('')}
      </tbody></table>${total > KAT.max ? `<div style="padding:6px;color:var(--tx3);font-size:11px">Показаны первые ${KAT.max} из ${total} — уточните поиск.</div>` : ''}</div>`;
}
function _katSort(k) { if (KAT.sort === k) KAT.dir = -KAT.dir; else { KAT.sort = k; KAT.dir = 1; } _katRender(); }
function _katHl(f) {
  if (KAT.hl) { try { map.removeLayer(KAT.hl); } catch (e) {} KAT.hl = null; }
  if (!f || !f.geometry) return;
  KAT.hl = L.geoJSON(f, { interactive: false, style: { color: '#facc15', weight: 4, fillColor: '#facc15', fillOpacity: 0.25 },
    pointToLayer: (_, ll) => L.circleMarker(ll, { radius: 12, color: '#facc15', weight: 3, fillOpacity: 0.15, interactive: false }) }).addTo(map);
}
function _katPick(i) {
  const l = _katLayer(); if (!l) return;
  const f = _kaFeatures(l)[i]; KAT.sel = i;
  document.querySelectorAll('#kat-panel tr.on').forEach(t => t.classList.remove('on'));
  const tr = document.querySelector(`#kat-panel tr[data-i="${i}"]`); if (tr) tr.classList.add('on');
  _katHl(f);
  try {
    const b = KAT.hl.getBounds(); const p = document.getElementById('kat-panel');
    const bottom = p ? p.getBoundingClientRect().height + 30 : 60;
    if (b.isValid()) {
      if (b.getNorthEast().equals(b.getSouthWest())) map.flyTo(b.getCenter(), Math.max(map.getZoom(), 16), { duration: 0.6 });
      else map.flyToBounds(b, { paddingTopLeft: [40, 60], paddingBottomRight: [40, bottom], maxZoom: 17, duration: 0.6 });
    }
  } catch (e) {}
}
async function _katSave(l, mutate, msg) {
  let gj; try { gj = JSON.parse(l.geojson); } catch (e) { toast('Ошибка разбора слоя', 'err'); return; }
  const feats = gj.type === 'FeatureCollection' ? gj.features : [gj];
  if (mutate(feats) === false) return;
  await _kmlSaveGeojson(l, gj);
  if (typeof kmlInvalidateLayerCache === 'function') kmlInvalidateLayerCache(l.id);
  try { renderLayerGroups(); } catch (e) {}
  _katRender();
  if (msg) toast(msg, 'ok');
}
function _katEdit(td, i, k) {
  const l = _katLayer(); if (!l) return;
  const f = _kaFeatures(l)[i]; const old = (f.properties || {})[k];
  const inp = document.createElement('input');
  inp.value = old == null ? '' : String(old); inp.className = 'kat-inp';
  td.innerHTML = ''; td.appendChild(inp); inp.focus(); inp.select();
  let done = false;
  const save = () => {
    if (done) return; done = true;
    const nv = inp.value;
    if (nv === (old == null ? '' : String(old))) { _katRender(); return; }
    const val = typeof old === 'number' && Number.isFinite(_kaNum(nv)) ? _kaNum(nv) : nv;
    _katSave(l, fs => { fs[i].properties = fs[i].properties || {}; fs[i].properties[k] = val; }, 'Сохранено');
  };
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { e.stopPropagation(); done = true; _katRender(); } };
  inp.onblur = save;
}
async function _katAddField() {
  const l = _katLayer(); if (!l) return;
  const nm = (prompt('Название нового поля:') || '').trim(); if (!nm) return;
  if (nm.startsWith('_')) { toast('Название не может начинаться с «_»', 'err'); return; }
  await _katSave(l, fs => { fs.forEach(f => { f.properties = f.properties || {}; if (!(nm in f.properties)) f.properties[nm] = ''; }); }, `Поле «${nm}» добавлено`);
}
function _katFieldMenu(e, k) {
  const l = _katLayer(); if (!l) return;
  const st = Object.assign({}, kmlStyleOf(l) || {});
  window._ctxKeepUntil = Date.now() + 300;
  showCtx(e.clientX, e.clientY, [
    { i: '🏷', l: `<b>${esc(k)}</b>`, html: true, f: null }, { sep: true },
    { i: '🌈', l: 'Раскрасить по этому полю…', f: () => { _kasPreset = { colorBy: k }; kmlOpenStyleModal(l.id); } },
    { i: '🏷', l: st.labelField === k ? 'Подписи — снова по названию' : 'Подписи по этому полю', f: async () => {
      if (st.labelField === k) delete st.labelField; else st.labelField = k;
      if (await kmlSaveStyle(l, st)) { if (!layerLabels[l.id] && st.labelField) toggleLayerLabels(l.id); _katRender(); toast('Подписи обновлены', 'ok'); }
    } },
    { sep: true },
    { i: '✏️', l: 'Переименовать поле', f: async () => {
      const nn = (prompt('Новое название поля:', k) || '').trim(); if (!nn || nn === k) return;
      await _katSave(l, fs => { fs.forEach(f => { const p = f.properties || {}; if (k in p) { p[nn] = p[k]; delete p[k]; } }); }, 'Поле переименовано');
      if (st.colorBy === k || st.labelField === k) { if (st.colorBy === k) st.colorBy = nn; if (st.labelField === k) st.labelField = nn; await kmlSaveStyle(l, st); }
    } },
    { i: '🗑', l: 'Удалить поле', cls: 'dan', f: async () => {
      if (!await confirmDlg(`Удалить поле «${k}» у всех объектов слоя?`)) return;
      await _katSave(l, fs => { fs.forEach(f => { if (f.properties) delete f.properties[k]; }); }, 'Поле удалено');
      if (st.colorBy === k || st.labelField === k) { if (st.colorBy === k) delete st.colorBy; if (st.labelField === k) delete st.labelField; await kmlSaveStyle(l, st); }
    } },
  ]);
}

// ── Общий поиск: объекты слоёв KML по названию и атрибутам ─────────────────
const _kaCache = new Map();   // layerId → {src, feats}
function _kaFeatsCached(l) {
  const c = _kaCache.get(l.id);
  if (c && c.src === l.geojson) return c.feats;
  const feats = _kaFeatures(l); _kaCache.set(l.id, { src: l.geojson, feats }); return feats;
}
function kmlSearch(q, max = 15) {
  q = String(q || '').trim().toLowerCase(); if (q.length < 2) return [];
  const out = [];
  for (const l of (layers || [])) {
    const feats = _kaFeatsCached(l);
    for (let i = 0; i < feats.length && out.length < max; i++) {
      const p = (feats[i] && feats[i].properties) || {};
      const nm = String(p.name || p.Name || '');
      let hit = nm.toLowerCase().includes(q) ? { k: '', v: nm } : null;
      if (!hit) for (const k in p) { if (k.startsWith('_') || p[k] == null || typeof p[k] === 'object') continue; const v = String(p[k]); if (v.toLowerCase().includes(q)) { hit = { k, v }; break; } }
      if (hit) out.push({ layerId: l.id, idx: i, layer: l.name, name: nm || `Объект ${i + 1}`, field: hit.k, value: hit.v, type: feats[i].geometry && feats[i].geometry.type });
    }
    if (out.length >= max) break;
  }
  return out;
}
function kmlSearchHtml(q) {
  const r = kmlSearch(q); window._gsKml = r;
  const ic = t => /Point/.test(t || '') ? '📍' : /Line/.test(t || '') ? '〰' : '⬡';
  return r.map((x, i) => `<div class="gsr" onclick="gsearchClear();kmlSearchGo(${i})">
    <span class="gsr-ico">${ic(x.type)}</span><div style="flex:1;min-width:0"><div class="gsr-nm">${esc(x.name)}</div>
    <div class="gsr-sub">${esc(x.layer)}${x.field ? ` · ${esc(x.field)}: ${esc(x.value.length > 60 ? x.value.slice(0, 60) + '…' : x.value)}` : ''}</div></div><span class="gsr-type">Слой</span></div>`).join('');
}
function kmlSearchGo(i) {
  const x = (window._gsKml || [])[i]; if (!x) return;
  if (typeof switchView === 'function') switchView('map');
  const l = (layers || []).find(z => z.id === x.layerId); if (!l) return;
  const f = _kaFeatsCached(l)[x.idx];
  KAT.layerId = x.layerId; _katHl(f);       // жёлтая подсветка, как в таблице атрибутов
  setTimeout(() => { if (!document.getElementById('kat-panel')?.classList.contains('open')) KAT.layerId = null; }, 0);
  try { const b = KAT.hl.getBounds(); if (b.getNorthEast().equals(b.getSouthWest())) map.flyTo(b.getCenter(), Math.max(map.getZoom(), 16), { duration: 0.7 }); else map.flyToBounds(b, { padding: [60, 60], maxZoom: 17, duration: 0.7 }); } catch (e) {}
  setTimeout(() => { if (!document.getElementById('kat-panel')?.classList.contains('open')) _katHl(null); }, 6000);
}
