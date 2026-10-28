// ═══════════════════════════════════════════════════════════
// gis-tools.js — ГИС-операции над слоями (сервер, gis_ops.py):
// буфер, обрезка по слою, разность, отбор по пересечению, слияние.
// Результат — предпросмотр на карте и сохранение новым слоем.
// ═══════════════════════════════════════════════════════════
const GT = { res: null, prev: null };
const GT_OPS = [
  ['buffer', '⭕', 'Буфер', 'зона на N м вокруг объектов (охранная зона, коридор)'],
  ['clip', '✂️', 'Обрезать по слою', 'часть A, которая попадает в B (лицензия ∩ ООПТ)'],
  ['difference', '➖', 'Разность', 'A без того, что закрыто B'],
  ['select', '🎯', 'Отобрать по пересечению', 'объекты A целиком, которые задевают B'],
  ['dissolve', '🧩', 'Слить объекты', 'объединить контуры A в один (или по полю)'],
];
function gisToolsOpen(layerId, op) {
  const la = (layers || []).find(l => l.id === layerId) || (layers || [])[0];
  if (!la) { toast('Нет слоёв', 'warn'); return; }
  GT.op = op || GT.op || 'buffer'; GT.a = la.id;
  const lsel = (id, cur) => `<select id="${id}" style="width:100%">${layers.map(l => `<option value="${escAttr(l.id)}" ${l.id === cur ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>`;
  const fields = typeof kmlFields === 'function' ? kmlFields(la) : [];
  showModal('🧰 ГИС-операции', `<div style="min-width:min(560px,88vw);display:flex;flex-direction:column;gap:10px">
    <div class="dw-grid">${GT_OPS.map(([k, ic, t, sub]) => `<div class="dw-card${GT.op === k ? ' on' : ''}" onclick="GT.op='${k}';gisToolsOpen(document.getElementById('gt-a').value,'${k}')"><div class="dw-ic">${ic}</div><div><b>${t}</b><div class="dw-sub">${sub}</div></div></div>`).join('')}</div>
    <div class="fg" style="margin:0"><label>Слой A</label>${lsel('gt-a', la.id)}</div>
    ${['clip', 'difference', 'select'].includes(GT.op) ? `<div class="fg" style="margin:0"><label>Слой B</label>${lsel('gt-b', (layers.find(l => l.id !== la.id) || la).id)}</div>` : ''}
    ${GT.op === 'buffer' ? `<div style="display:flex;gap:10px;align-items:flex-end"><div class="fg" style="margin:0;flex:1"><label>Расстояние, м</label><input id="gt-d" type="number" min="0.1" step="any" value="${GT.d || 100}"></div>
      <label style="display:flex;gap:6px;align-items:center;font-size:12px;text-transform:none;font-weight:500;margin:0 0 6px"><input id="gt-u" type="checkbox" ${GT.u ? 'checked' : ''} style="width:auto;margin:0"> слить в одну зону</label></div>` : ''}
    ${GT.op === 'dissolve' ? `<div class="fg" style="margin:0"><label>Сливать по полю</label><select id="gt-f"><option value="">— всё в один контур —</option>${fields.map(f => `<option>${esc(f)}</option>`).join('')}</select></div>` : ''}
    <div id="gt-st" style="font-size:12px;min-height:16px"></div></div>`, [
    { label: 'Закрыть', cls: 'bs', fn: () => { gisToolsClear(); closeModal(); } },
    { label: '▶ Выполнить', cls: 'bs', fn: gisToolsRun },
    { label: '💾 Сохранить слоем', cls: 'bp', fn: gisToolsSave },
  ]);
  document.getElementById('mov').classList.add('side');
  const a = document.getElementById('gt-a'); if (a) a.onchange = () => gisToolsOpen(a.value, GT.op);
}
async function gisToolsRun() {
  const st = document.getElementById('gt-st');
  const body = { op: GT.op, layerA: document.getElementById('gt-a').value, layerB: document.getElementById('gt-b')?.value,
    distance: document.getElementById('gt-d')?.value, dissolve: document.getElementById('gt-u')?.checked, field: document.getElementById('gt-f')?.value };
  if (GT.op === 'buffer') { GT.d = +body.distance; GT.u = body.dissolve; }
  if (body.layerB && body.layerB === body.layerA) { st.innerHTML = '<span style="color:var(--red)">Слои A и B должны быть разными</span>'; return; }
  st.textContent = '⏳ Считаю…';
  try {
    const r = await fetch(`${API}/gis/op`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Ошибка сервера');
    GT.res = j; GT.body = body;
    gisToolsClear(true);
    GT.prev = L.geoJSON(j, { style: { color: '#f97316', weight: 3, dashArray: '6 4', fillColor: '#f97316', fillOpacity: 0.25 },
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 6, color: '#f97316', weight: 3 }) }).addTo(map);
    const s = j.stats || {};
    st.innerHTML = j.features.length ? `✅ Получено объектов: <b>${s.count}</b>${s.area_ha ? `, площадь <b>${s.area_ha.toLocaleString('ru-RU')} га</b>` : ''}${s.length_m ? `, длина <b>${Math.round(s.length_m).toLocaleString('ru-RU')} м</b>` : ''} — на карте оранжевым. Сохраните слоем.` : '⚠️ Результат пустой (объекты не пересекаются?)';
    try { const b = GT.prev.getBounds(); if (b.isValid() && typeof _dwFit === 'function') _dwFit([[[b.getWest(), b.getSouth()], [b.getEast(), b.getNorth()]]]); } catch (e) {}
  } catch (e) { st.innerHTML = '<span style="color:var(--red)">❌ ' + esc(e.message) + '</span>'; }
}
function gisToolsClear(keep) { if (GT.prev) { try { map.removeLayer(GT.prev); } catch (e) {} GT.prev = null; } if (!keep) GT.res = null; }
async function gisToolsSave() {
  if (!GT.res) { await gisToolsRun(); if (!GT.res) return; }
  if (!GT.res.features.length) { toast('Нечего сохранять', 'warn'); return; }
  const a = layers.find(l => l.id === GT.body.layerA), b = layers.find(l => l.id === GT.body.layerB);
  const t = { buffer: `Буфер ${GT.body.distance} м`, clip: `∩ ${b ? b.name : ''}`, difference: `− ${b ? b.name : ''}`, select: `в ${b ? b.name : ''}`, dissolve: 'слияние' }[GT.body.op];
  const name = (prompt('Название нового слоя:', `${a ? a.name : 'Слой'} — ${t}`) || '').trim(); if (!name) return;
  const r = await fetch(`${API}/layers`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color: '#f97316', geojson: JSON.stringify({ type: 'FeatureCollection', features: GT.res.features }) }) });
  if (!r.ok) return;
  gisToolsClear(); closeModal();
  layers = await fetch(`${API}/layers`).then(x => x.json()).catch(() => layers);
  try { renderLP(); renderLayerGroups(); if (typeof kmlPanelOpen !== 'undefined' && kmlPanelOpen) renderKmlPanel(); } catch (e) {}
  toast(`💾 Слой «${name}» создан`, 'ok');
}
