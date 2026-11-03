// ═══════════════════════════════════════════════════════════
// dem-situation.js — «Ситуация» в мастере выгрузки рельефа (шаг «Параметры»):
// контуры воды, болот, леса, здания, дороги, ЛЭП, трубы — из OpenStreetMap,
// в DXF по шаблону ПурГеоКом (слои и блоки условных знаков Osnova, situation.js).
//   • «👁 Загрузить и показать» — слой «Ситуация (OSM)» на карте: можно удалить
//     лишнее, дорисовать, поменять «класс» в таблице атрибутов; при выгрузке
//     берётся этот слой со всеми правками. Без него сервер скачает OSM сам.
// ═══════════════════════════════════════════════════════════
const SITW = { classes: null, groups: null, busy: false };
if (DW.sit == null) DW.sit = false;
if (!DW.sitScale) DW.sitScale = 2000;
if (DW.sitTpl == null) DW.sitTpl = true;
async function _sitClasses() {
  if (SITW.classes) return;
  try { const j = await fetch(`${API}/situation/classes`).then(r => r.json()); SITW.classes = j.classes; SITW.groups = j.groups; } catch (e) {}
}
const _sitLayer = () => DW.sitLayerId && (layers || []).find(l => l.id === DW.sitLayerId);
function sitWizardHtml() {
  if (!SITW.groups) { _sitClasses().then(() => { if (DW.step === 3 && document.getElementById('sit-box')) document.getElementById('sit-box').outerHTML = sitWizardHtml(); }); }
  const G = SITW.groups || {}, on = new Set(DW.sitGroups || Object.keys(G)), l = _sitLayer();
  let n = 0; if (l) { try { n = (JSON.parse(l.geojson).features || []).length; } catch (e) {} }
  return `<div class="fg s2" id="sit-box"><div class="sit-box${DW.sit ? ' on' : ''}">
    <label class="sit-h"><input type="checkbox" ${DW.sit ? 'checked' : ''} onchange="DW.sit=this.checked;_dwSave();_sitRe()"> 🌲 Добавить ситуацию в DXF
      <small>контуры воды, болот, леса, кустарника, здания, дороги, ЛЭП, трубы — из OpenStreetMap, условными знаками шаблона ПурГеоКом</small></label>
    ${DW.sit ? `<div class="sit-row">
        <label>Масштаб плана <select onchange="DW.sitScale=+this.value;_dwSave()">${[500, 1000, 2000, 5000].map(s => `<option value="${s}" ${DW.sitScale === s ? 'selected' : ''}>1 : ${s.toLocaleString('ru-RU')}</option>`).join('')}</select></label>
        <span class="sit-hint">размер знаков и шаг заполнения — по масштабу</span></div>
      <div class="sit-groups">${Object.entries(G).map(([k, t]) => `<label><input type="checkbox" ${on.has(k) ? 'checked' : ''} onchange="_sitGroup('${k}',this.checked)"> ${esc(t)}</label>`).join('') || '<span class="sit-hint">⏳ список…</span>'}</div>
      <label class="sit-chk"><input type="checkbox" ${DW.sitTpl ? 'checked' : ''} onchange="DW.sitTpl=this.checked;_dwSave()"> горизонтали — на слои шаблона «Горизонтали основные / утолщенные» (каждая 5-я)</label>
      <div class="sit-row">
        <button class="btn bs bsm" type="button" onclick="sitPreview()" ${SITW.busy ? 'disabled' : ''}>${SITW.busy ? '⏳ Загрузка из OSM…' : l ? '🔄 Загрузить заново' : '👁 Загрузить и показать на карте'}</button>
        <button class="btn bs bsm" type="button" onclick="sitFromImagery()" ${SITW.busy ? 'disabled' : ''} title="Оконтурить по выбранной подложке там, где ещё пусто: вода, лес, болото…">🛰 Дополнить по подложке</button>
        <select title="С какой подложки брать контуры" onchange="DW.sitSrc=this.value;_dwSave();_sitRe()">${[['sat', '🛰 спутник Esri'], ['auto', '📜 топокарта — авто (подробная из доступных)'], ['ggc250', '📜 ГГЦ 1:25 000'], ['ggc500', '📜 ГГЦ 1:50 000'], ['ggc1000', '📜 ГГЦ 1:100 000'], ['ggc2000', '📜 ГГЦ 1:200 000'], ['gsh250', '📜 Генштаб 1:25 000'], ['gsh500', '📜 Генштаб 1:50 000'], ['gsh1000', '📜 Генштаб 1:100 000']].map(([v, t]) => `<option value="${v}" ${(DW.sitSrc || 'sat') === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
                ${l ? `<button class="btn bs bsm" type="button" onclick="kmlZoomTo('${escAttr(l.id)}')">🔍 Показать</button><button class="btn bs bsm" type="button" onclick="kmlAttrTable('${escAttr(l.id)}')">📋 Таблица</button><button class="btn bs bsm" type="button" onclick="sitDropLayer()" title="Не использовать слой — при выгрузке скачать OSM заново">✕</button>` : ''}
      </div>
      <div class="sit-hint" id="sit-status">${l ? `✅ Слой «${esc(l.name)}» — ${n} объектов: при выгрузке возьмётся он, со всеми вашими правками (удалённое не попадёт, дорисованное — попадёт; класс объекта — поле «класс» в таблице).`
        : 'Можно сразу выгружать — ситуация скачается на сервере. Или сначала загрузите на карту, проверьте и поправьте.'}</div>
      <div class="sit-groups" title="Что распознавать по снимку">${[[1, 'вода'], [2, 'лес'], [3, 'луг'], [5, 'болото (всё открытое, не лес и не вода)'], [4, 'открытый грунт']].map(([c, t]) => `<label><input type="checkbox" ${(DW.sitImg || [1, 2, 3, 4, 5]).includes(c) ? 'checked' : ''} onchange="_sitImgCls(${c},this.checked)"> 🛰 ${t}</label>`).join('')}</div>
      <div class="sit-hint">${(DW.sitSrc || 'sat') === 'sat' ? '«🛰 Дополнить по подложке» — по снимку Esri по цвету и фактуре: примерно (±2–5 м, тени, облака, сезон снимка). Ручьи и дороги по снимку не распознаются.'
        : '«🛰 Дополнить по подложке» — по топокарте: лес — зелёная заливка, вода — голубая, болото — синяя штриховка, пески — розовые с точками; точность — как у карты (1:50 000 ≈ 10–25 м), состояние на год съёмки карты. Луга на топокарте нет.'}
        Добавляется только там, где ещё пусто (OSM и уже добавленное главнее). Контуры с разных подложек накапливаются — например, одна карта покрывает часть области, другая — остальное.</div>
      <div class="sit-hint">Точность OpenStreetMap — 5–20 м, для ориентира. Где ничего не нарисовано (глухая тайга, тундра), ситуации не будет.</div>` : ''}
  </div></div>`;
}
function _sitRe() { const b = document.getElementById('sit-box'); if (b) b.outerHTML = sitWizardHtml(); }
function _sitGroup(k, on) {
  const s = new Set(DW.sitGroups || Object.keys(SITW.groups || {}));
  if (on) s.add(k); else s.delete(k);
  DW.sitGroups = [...s]; _dwSave();
}
async function sitPreview() {
  const b = typeof _dwBbox === 'function' ? _dwBbox() : null;
  if (!b) { toast('Сначала выберите область', 'err'); return; }
  await _sitClasses();
  SITW.busy = true; _sitRe();
  try {
    const r = await fetch(`${API}/situation/osm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bbox: b }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Ошибка сервера');
    const C = Object.fromEntries((SITW.classes || []).map(c => [c.k, c]));
    // на карте — цвет класса; видимое поле «класс» можно менять в таблице атрибутов
    j.features.forEach(f => { const c = C[f.properties._sit]; if (c) { f.properties['класс'] = c.n; f.properties._color = c.c; } });
    const old = _sitLayer();
    const name = `Ситуация (OSM) ${new Date().toLocaleDateString('ru-RU')}`;
    const gj = JSON.stringify({ type: 'FeatureCollection', features: j.features });
    if (old) {
      // контуры «по снимку» при перезагрузке OSM сохраняются
      let keep = []; try { keep = (JSON.parse(old.geojson).features || []).filter(f => (f.properties || {})._src === 'снимок'); } catch (e) {}
      const G = JSON.parse(gj); G.features = G.features.concat(keep);
      await _kmlSaveGeojson(old, G);
      if (typeof kmlInvalidateLayerCache === 'function') kmlInvalidateLayerCache(old.id);
    } else {
      const rr = await fetch(`${API}/layers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color: '#16a34a', geojson: gj }) }).then(x => x.json());
      layers = await fetch(`${API}/layers`).then(x => x.json()).catch(() => layers);
      DW.sitLayerId = rr.id; _dwSave();
    }
    try { renderLayerGroups(); if (kmlPanelOpen) renderKmlPanel(); } catch (e) {}
    const st = Object.entries(j.stats || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${(C[k] || {}).n || k}: ${n}`).join(', ');
    toast(j.features.length ? `🌲 Ситуация: ${j.features.length} объектов` : 'В OpenStreetMap здесь ничего не нарисовано', j.features.length ? 'ok' : 'warn');
    SITW.busy = false; _sitRe();
    const s = document.getElementById('sit-status'); if (s && st) s.innerHTML += `<br>${esc(st)}`;
  } catch (e) { SITW.busy = false; _sitRe(); toast('❌ Ситуация: ' + e.message, 'err'); }
}
function sitDropLayer() { DW.sitLayerId = ''; _dwSave(); _sitRe(); toast('Слой не будет использован (сам слой остался на карте — удалить можно в «Слоях»)', 'ok'); }
// параметры для сервера: features — из слоя на карте (если есть), иначе сервер скачает OSM
function sitParams() {
  if (!DW.sit) return null;
  const o = { on: true, scale: DW.sitScale || 2000, groups: DW.sitGroups || null, tplContours: DW.sitTpl !== false };
  const l = _sitLayer();
  if (l) { try { o.features = (JSON.parse(l.geojson).features || []).filter(f => f && f.geometry && !(f.properties || {})._hidden); } catch (e) {} }
  return o;
}
function sitSummary() {
  if (!DW.sit) return '';
  const l = _sitLayer(), G = SITW.groups || {}, gs = DW.sitGroups ? DW.sitGroups.map(k => (G[k] || k).replace(/\s*\(.*$/, '')).join(', ') : 'всё';
  return `1 : ${(DW.sitScale || 2000).toLocaleString('ru-RU')}, ${esc(gs)}; ${l ? `из слоя «${esc(l.name)}»` : 'из OpenStreetMap'}`;
}

function _sitImgCls(c, on) { const s = new Set(DW.sitImg || [1, 2, 3, 4, 5]); if (on) s.add(c); else s.delete(c); DW.sitImg = [...s]; _dwSave(); }
const _SIT_IMG_GROUP = { lake: 'water', river_area: 'water', forest: 'veg', meadow: 'veg', bog: 'wet', bare: 'soil', sand: 'soil' };
// По снимку: распознать, отбросить то, что уже есть в слое (OSM) той же группы, дописать в слой «Ситуация»
async function sitFromImagery() {
  const b = typeof _dwBbox === 'function' ? _dwBbox() : null;
  if (!b) { toast('Сначала выберите область', 'err'); return; }
  if (typeof satRecognize !== 'function') return;
  await _sitClasses();
  SITW.busy = true; _sitRe();
  const st = t => { const e = document.getElementById('sit-status'); if (e) e.textContent = '⏳ ' + t; };
  try {
    const res = await satRecognize(b, { classes: DW.sitImg || [1, 2, 3, 4, 5], source: DW.sitSrc || 'sat', onProgress: st });
    const C = Object.fromEntries((SITW.classes || []).map(c => [c.k, c]));
    let l = _sitLayer(), old = [];
    if (l) { try { old = JSON.parse(l.geojson).features || []; } catch (e) {} }
    // прежний результат с этой же подложки заменяется, с других — остаётся
    const same = f => (f.properties || {})._src === 'снимок' && ((f.properties || {})._base || 'Спутник Esri') === res.source;
    old = old.filter(f => !same(f));
    // уже нарисованное (OSM и правки) той же группы — главнее снимка
    const grpOf = f => { const k = f.properties._sit; return _SIT_IMG_GROUP[k] || (C[k] && C[k].g); };
    const polys = old.filter(f => f.geometry && /Polygon/.test(f.geometry.type)).map(f => ({ g: grpOf(f), rings: f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map(p => p[0]) }));
    const inside = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], q = r[j]; if ((a[1] > y) !== (q[1] > y) && x < (q[0] - a[0]) * (y - a[1]) / (q[1] - a[1]) + a[0]) c = !c; } return c; };
    let dropped = 0;
    const add = res.features.filter(f => {
      const g = _SIT_IMG_GROUP[f.properties._sit], o = f.geometry.coordinates[0];
      // проверочные точки — несколько вершин контура, сдвинутых к центру
      const cx = o.reduce((s, p) => s + p[0], 0) / o.length, cy = o.reduce((s, p) => s + p[1], 0) / o.length;
      const pts = [0, 0.25, 0.5, 0.75].map(t => { const p = o[Math.floor(t * (o.length - 1))]; return [p[0] * 0.7 + cx * 0.3, p[1] * 0.7 + cy * 0.3]; });
      const hit = polys.some(P => P.g === g && P.rings.some(r => pts.filter(([x, y]) => inside(x, y, r)).length >= 2));
      if (hit) dropped++;
      return !hit;
    });
    add.forEach(f => { const c = C[f.properties._sit]; if (c) { f.properties['класс'] = c.n; f.properties._color = c.c; } });
    const gj = { type: 'FeatureCollection', features: old.concat(add) };
    if (l) { await _kmlSaveGeojson(l, gj); if (typeof kmlInvalidateLayerCache === 'function') kmlInvalidateLayerCache(l.id); }
    else {
      const rr = await fetch(`${API}/layers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Ситуация ${new Date().toLocaleDateString('ru-RU')}`, color: '#16a34a', geojson: JSON.stringify(gj) }) }).then(x => x.json());
      layers = await fetch(`${API}/layers`).then(x => x.json()).catch(() => layers);
      DW.sitLayerId = rr.id; _dwSave();
    }
    try { renderLayerGroups(); if (kmlPanelOpen) renderKmlPanel(); } catch (e) {}
    const by = {}; add.forEach(f => { const n = (C[f.properties._sit] || {}).n || f.properties._sit; by[n] = (by[n] || 0) + 1; });
    SITW.busy = false; _sitRe();
    const s = document.getElementById('sit-status');
    if (s) s.innerHTML += `<br>🛰 ${esc(res.source)} (z${res.zoom}, ~${res.mpp.toFixed(1)} м/пикс${res.cover < 0.98 ? `, покрыто ${Math.round(res.cover * 100)} %` : ''}): ${Object.entries(by).map(([k, n]) => `${esc(k)}: ${n}`).join(', ') || 'ничего'}${dropped ? `; уже было в OSM — пропущено ${dropped}` : ''}. Прежний результат с этой подложки заменён.`;
    toast(`🛰 ${res.source}: добавлено контуров ${add.length}`, 'ok');
  } catch (e) { SITW.busy = false; _sitRe(); toast('❌ Снимок: ' + e.message, 'err'); }
}
