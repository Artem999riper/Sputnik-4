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
        ${l ? `<button class="btn bs bsm" type="button" onclick="kmlZoomTo('${escAttr(l.id)}')">🔍 Показать</button><button class="btn bs bsm" type="button" onclick="kmlAttrTable('${escAttr(l.id)}')">📋 Таблица</button><button class="btn bs bsm" type="button" onclick="sitDropLayer()" title="Не использовать слой — при выгрузке скачать OSM заново">✕</button>` : ''}
      </div>
      <div class="sit-hint" id="sit-status">${l ? `✅ Слой «${esc(l.name)}» — ${n} объектов: при выгрузке возьмётся он, со всеми вашими правками (удалённое не попадёт, дорисованное — попадёт; класс объекта — поле «класс» в таблице).`
        : 'Можно сразу выгружать — ситуация скачается на сервере. Или сначала загрузите на карту, проверьте и поправьте.'}</div>
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
      await _kmlSaveGeojson(old, JSON.parse(gj));
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
