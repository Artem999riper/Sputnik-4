// ═══════════════════════════════════════════════════════════
// vol-layers.js — объёмы работ объекта на слоях KML.
//
// Объём = слой KML (план — объекты слоя, выполнение — отметки «выполнено»)
// или ручной объём (план числом, выполнение числом по дням).
// Показатели слоя: основной — штуки / длина / площадь, второй (необязательно) —
// сумма поля, например «глубина» → п.м. Считает сервер (routes/volume-sync.js),
// здесь — вкладка «Объёмы», окно объёма, отметка выполнения с параметрами.
// Свойства объекта слоя: _done, _done_date, _done_by, _fact2, _workers, _machine,
// _note, _skip (исключён из объёма), _uid.
// ═══════════════════════════════════════════════════════════
const VL = { all: [] };
async function volLoad() { try { VL.all = await fetch(`${API}/volumes`).then(r => r.json()); } catch (e) {} return VL.all; }
const volByLayer = id => id ? VL.all.find(v => v.layer_id === id) : null;
function volMeasure(v) {
  let m = {}; try { m = JSON.parse((v && v.measure_json) || '{}') || {}; } catch (e) {}
  if (!m.main) m.main = 'count';
  if (!m.unit) m.unit = (v && v.unit) || 'шт';
  if (m.second && !m.second.field) m.second = null;
  return m;
}
const _vlN = x => (Math.round((+x || 0) * 1000) / 1000).toLocaleString('ru-RU');
const _vlToday = () => new Date().toISOString().slice(0, 10);
const _vlFact = p => (p.row_type || 'fact') !== 'plan' && p.row_type !== 'act';
// Итоги объёма по строкам выполнения объекта
function volTotals(v, prog) {
  const rows = (prog || []).filter(p => p.volume_id === v.id && _vlFact(p));
  const done = rows.reduce((s, p) => s + (+p.completed || 0), 0), done2 = rows.reduce((s, p) => s + (+p.amount2 || 0), 0);
  const pct = v.amount > 0 ? Math.min(100, Math.round(done / v.amount * 100)) : 0;
  return { rows, done, done2, pct };
}
// Строка «12 / 20 скв · 96 / 180 п.м.»
function volLine(v, t) {
  const m = volMeasure(v);
  let s = `${_vlN(t.done)} / ${_vlN(v.amount)} ${esc(v.unit || m.unit)}`;
  if (m.second && v.layer_id) s += ` · ${_vlN(t.done2)} / ${_vlN(v.amount2)} ${esc(m.second.unit || '')}`;
  else if (!v.layer_id && t.done2) s += ` · ${_vlN(t.done2)}`;
  return s;
}

// ── Вкладка «Объёмы» ────────────────────────────────────────
let volOpen = {};
function tabVolumes(pb) {
  const o = currentObj, vols = o?.volumes || [], prog = o?.vol_progress || [];
  const cards = v => {
    const t = volTotals(v, prog), m = volMeasure(v), layer = v.layer_id && (layers || []).find(l => l.id === v.layer_id);
    const open = volOpen[v.id];
    const last = t.rows.slice().sort((a, b) => a.work_date < b.work_date ? 1 : -1);
    const src = v.layer_id
      ? (layer ? `<span class="vl-src" title="План и выполнение — по объектам слоя">🗺 ${esc(layer.name)}</span>` : '<span class="vl-src vl-bad">⚠ слой удалён</span>')
      : '<span class="vl-src" title="Выполнение вводится числом">✍ без карты</span>';
    return `<div class="vl-card">
      <div class="vl-hd" onclick="volOpen['${v.id}']=!volOpen['${v.id}'];renderTab()">
        <i class="vl-dot" style="background:${v.color || (layer && layer.color) || '#1a56db'}"></i>
        <b class="vl-nm">${esc(v.name)}</b>
        <span class="vl-pct" style="color:${t.pct >= 100 ? 'var(--grn)' : 'var(--acc)'}">${t.pct}%</span>
        <span class="vl-arr">${open ? '▲' : '▼'}</span>
      </div>
      <div class="vl-line">${volLine(v, t)}</div>
      <div class="pbt"><div class="pbf" style="width:${t.pct}%;background:${t.pct >= 100 ? 'var(--grn)' : 'var(--acc)'}"></div></div>
      <div class="vl-meta">${src}${v.plan_start ? `<span>📅 ${fmt(v.plan_start)}${v.plan_end ? ' — ' + fmt(v.plan_end) : ''}</span>` : ''}</div>
      <div class="vl-btns">
        ${v.layer_id ? `<button class="btn bp bxs" onclick="volShowLayer('${v.id}')" title="Показать слой и приблизить">🗺 На карте</button>
          <button class="btn bs bxs" onclick="volShowLayer('${v.id}',true)" title="Таблица атрибутов: выполнено, дата, факт">📋 Таблица</button>`
        : `<button class="btn bp bxs" onclick="volAddProgress('${v.id}')">＋ Выполнение</button>`}
        <button class="btn bs bxs" onclick="volEditModal('${v.id}')" title="Изменить объём">✏️</button>
        <button class="btn bd bxs" onclick="volDelete('${v.id}')" title="Удалить объём (слой останется)">🗑</button>
      </div>
      ${open ? `<div class="vl-rows">${last.length ? last.slice(0, 200).map(p => `<div class="vl-row">
          <span class="vl-d">${fmt(p.work_date)}</span>
          <span class="vl-a">+${_vlN(p.completed)}${p.amount2 ? ` · ${_vlN(p.amount2)} ${esc((m.second || {}).unit || '')}` : ''}</span>
          <span class="vl-n" title="${escAttr(p.notes || '')}">${esc(p.notes || '')}</span>
          ${p.source === 'kml' ? `<button class="btn bg bxs" title="Показать объект на карте" onclick="volZoomFeature('${v.layer_id}','${escAttr(p.feature_uid || '')}')">🔍</button>`
            : `<button class="btn bg bxs" onclick="volEditProgress('${p.id}')">✏️</button><button class="btn bg bxs" onclick="volDelProgress('${p.id}')">🗑</button>`}
        </div>`).join('') : '<div class="vl-empty">Пока ничего не выполнено</div>'}</div>` : ''}
    </div>`;
  };
  const secs = Object.entries(VOL_SECTIONS).map(([cat, sec]) => {
    const list = vols.filter(v => (v.category || 'geology') === cat); if (!list.length) return '';
    return `<div class="vl-sec" style="--sc:${sec.color}"><span>${sec.icon} ${sec.label}</span><small>${list.length}</small></div>${list.map(cards).join('')}`;
  }).join('') + (() => { const other = vols.filter(v => !VOL_SECTIONS[v.category || 'geology']); return other.length ? `<div class="vl-sec"><span>Прочее</span></div>${other.map(cards).join('')}` : ''; })();
  pb.innerHTML = `<div class="vl-top">
      <div><h4 style="font-size:13px;font-weight:800">📋 Объёмы (${vols.length})</h4>
        <div style="font-size:10px;color:var(--tx2)">Готовность объекта: <b>${o.completion_percent || 0}%</b></div></div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn bg bsm" onclick="volEditModal()">＋ Объём</button>
        <button class="btn bs bsm" onclick="openDailyProgressModal()" title="Выполнение за день">📆 За день</button>
      </div></div>
    ${vols.length ? secs : `<div class="empty"><div class="empty-i">📋</div>Нет объёмов<div style="font-size:11px;margin-top:6px;color:var(--tx3)">Объём — это слой KML (скважины, профили, площадки) или ручной объём без карты.<br>Выполнение отмечается прямо на объектах слоя: ПКМ → «✅ Выполнить».</div></div>`}`;
}
function tabProgress(pb) { tabVolumes(pb); }

async function volShowLayer(volId, table) {
  const v = (currentObj?.volumes || []).find(x => x.id === volId) || VL.all.find(x => x.id === volId); if (!v) return;
  const l = (layers || []).find(x => x.id === v.layer_id); if (!l) { toast('Слой не найден', 'err'); return; }
  if (!l.visible && typeof kmlToggleVis === 'function') await kmlToggleVis(l.id, 1);
  if (table) { kmlAttrTable(l.id); return; }
  setTimeout(() => { try { const g = lGroups[l.id]; const b = g && g.getBounds && g.getBounds(); if (b && b.isValid()) map.flyToBounds(b, { padding: [50, 50], maxZoom: 17, duration: 0.6 }); } catch (e) {} }, 200);
}
function volZoomFeature(layerId, uid) {
  const l = (layers || []).find(x => x.id === layerId); if (!l || !uid) return;
  const feats = _kaFeatures(l), i = feats.findIndex(f => (f.properties || {})._uid === uid);
  if (i < 0) { toast('Объект не найден в слое', 'warn'); return; }
  if (typeof KAT !== 'undefined') { const keep = KAT.layerId; KAT.layerId = layerId; _katHl(feats[i]); if (!document.getElementById('kat-panel')?.classList.contains('open')) KAT.layerId = keep; }
  try { const b = KAT.hl.getBounds(); if (b.getNorthEast().equals(b.getSouthWest())) map.flyTo(b.getCenter(), Math.max(map.getZoom(), 17), { duration: 0.6 }); else map.flyToBounds(b, { padding: [60, 60], maxZoom: 17 }); } catch (e) {}
  setTimeout(() => { if (!document.getElementById('kat-panel')?.classList.contains('open')) _katHl(null); }, 5000);
}

// ── Окно объёма: создать / изменить ─────────────────────────
// Что считать по геометрии слоя и какие поля похожи на глубину
function _vlLayerInfo(l) {
  const feats = l ? _kaFeatures(l).filter(f => f && f.geometry) : [];
  const t = { pt: 0, ln: 0, pg: 0 };
  feats.forEach(f => { const g = f.geometry.type; if (/Point/.test(g)) t.pt++; else if (/Line/.test(g)) t.ln++; else if (/Polygon/.test(g)) t.pg++; });
  const main = t.ln > t.pt && t.ln >= t.pg ? 'length' : t.pg > t.pt && t.pg > t.ln ? 'area' : 'count';
  const fields = l ? kmlFields(l).filter(k => feats.some(f => Number.isFinite(_kaNum((f.properties || {})[k])))) : [];
  const depth = fields.find(k => /глуб|depth|^h$|^н$|^h_|забой/i.test(k)) || '';
  const isBore = l && (/скв|бурен|шурф/i.test(l.name) || l.symbol === 'borehole' || /borehole/.test(l.symbol || ''));
  return { n: feats.length, t, main, fields, depth, unit: main === 'length' ? 'км' : main === 'area' ? 'га' : isBore ? 'скв' : 'шт' };
}
const VL_DRAFT = {};
function volEditModal(volId, opts) {
  opts = opts || {};
  const v = volId ? ((currentObj?.volumes || []).find(x => x.id === volId) || VL.all.find(x => x.id === volId)) : null;
  const d = Object.assign({ name: '', category: 'geology', src: 'layer', layer_id: '', main: '', unit: '', f2: '', u2: 'п.м.', amount: '', unitM: 'шт', plan_start: '', plan_end: '',
    site_id: (currentType === 'site' && currentObj) ? currentObj.id : '' }, opts.draft || {});
  if (v && !opts.draft) {
    const m = volMeasure(v);
    Object.assign(d, { name: v.name, category: v.category || 'geology', src: v.layer_id ? 'layer' : 'manual', layer_id: v.layer_id || '', main: m.main, unit: m.unit,
      f2: m.second ? m.second.field : '', u2: m.second ? m.second.unit : 'п.м.', amount: v.amount, unitM: v.unit || 'шт', plan_start: v.plan_start || '', plan_end: v.plan_end || '', site_id: v.site_id });
  }
  if (opts.layerId) { d.src = 'layer'; d.layer_id = opts.layerId; }
  const l = (layers || []).find(x => x.id === d.layer_id);
  const info = _vlLayerInfo(l);
  if (l && !d.main) { d.main = info.main; d.unit = info.unit; d.f2 = info.depth; }
  if (l && !d.name) d.name = l.name;
  Object.assign(VL_DRAFT, d, { volId: volId || null });
  const busy = id => { const x = VL.all.find(z => z.layer_id === id); return x && x.id !== volId ? x : null; };
  const lopts = (layers || []).filter(x => !x.site_id).map(x => { const b = busy(x.id); return `<option value="${escAttr(x.id)}" ${x.id === d.layer_id ? 'selected' : ''} ${b ? 'disabled' : ''}>${esc(x.name)}${b ? ` — уже объём «${esc(b.name)}»` : ''}</option>`; }).join('');
  const sopt = (sites || []).map(s => `<option value="${escAttr(s.id)}" ${s.id === d.site_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const unitOpts = { count: ['скв', 'шт', 'шурф', 'т.н.', 'пункт', 'пикет'], length: ['км', 'м', 'п.м.'], area: ['га', 'м²', 'км²'] };
  showModal(v ? `✏️ Объём — ${v.name}` : '＋ Объём объекта', `<div class="vl-form">
    ${!(currentType === 'site' && currentObj) || opts.layerId ? `<div class="fg"><label>Объект</label><select id="vl-site">${sopt}</select></div>` : ''}
    <div class="fg"><label>Название (вид работ) *</label><input id="vl-name" value="${escAttr(d.name)}" placeholder="Бурение скважин"></div>
    <div class="fg"><label>Раздел</label><select id="vl-cat">${Object.entries(VOL_SECTIONS).map(([k, s]) => `<option value="${k}" ${d.category === k ? 'selected' : ''}>${s.icon} ${s.label}</option>`).join('')}</select></div>
    <div class="vl-src-pick">
      <label><input type="radio" name="vl-src" value="layer" ${d.src === 'layer' ? 'checked' : ''} onchange="_vlRe({src:'layer'})"> 🗺 Слой KML <small>план и выполнение — по объектам слоя</small></label>
      <label><input type="radio" name="vl-src" value="manual" ${d.src === 'manual' ? 'checked' : ''} onchange="_vlRe({src:'manual'})"> ✍ Без карты <small>камералка, отчёт, лаборатория</small></label>
    </div>
    ${d.src === 'layer' ? `
      <div class="fg"><label>Слой</label><div style="display:flex;gap:4px">
        <select id="vl-layer" style="flex:1" onchange="_vlRe({layer_id:this.value,main:'',name:document.getElementById('vl-name').value})"><option value="">— выберите слой —</option>${lopts}</select>
        <button class="btn bs bsm" onclick="_vlImport()" title="Загрузить KML, SHP, DXF, CSV, Excel…">📥 Файл</button>
        <button class="btn bs bsm" onclick="_vlNewLayer()" title="Пустой слой — нарисовать объекты на карте">✏️ Новый</button></div></div>
      ${l ? `<div class="vl-hint">В слое ${info.n} объект(ов): ${[info.t.pt && info.t.pt + ' точ.', info.t.ln && info.t.ln + ' лин.', info.t.pg && info.t.pg + ' полиг.'].filter(Boolean).join(', ') || '—'}</div>
      <div class="fgr"><div class="fg"><label>Считать</label><select id="vl-main" onchange="_vlRe({main:this.value,unit:''})">
          <option value="count" ${d.main === 'count' ? 'selected' : ''}>штуки (объекты)</option>
          <option value="length" ${d.main === 'length' ? 'selected' : ''}>длину линий</option>
          <option value="area" ${d.main === 'area' ? 'selected' : ''}>площадь полигонов</option></select></div>
        <div class="fg"><label>Единица</label><input id="vl-unit" list="vl-units" value="${escAttr(d.unit || unitOpts[d.main || 'count'][0])}"><datalist id="vl-units">${(unitOpts[d.main || 'count']).map(u => `<option value="${u}">`).join('')}</datalist></div></div>
      <div class="fgr"><div class="fg"><label>Второй показатель — сумма поля</label><select id="vl-f2"><option value="">— нет —</option>${info.fields.map(k => `<option ${k === d.f2 ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
        <div class="fg"><label>Единица</label><input id="vl-u2" list="vl-u2s" value="${escAttr(d.u2 || 'п.м.')}"><datalist id="vl-u2s"><option value="п.м."><option value="м"><option value="м³"><option value="шт"></datalist></div></div>
      ${!info.fields.length && d.main === 'count' ? '<div class="vl-hint">Чтобы считать погонные метры, добавьте в слой числовое поле «глубина» (таблица атрибутов → ＋ Поле).</div>' : ''}` : ''}`
    : `<div class="fgr"><div class="fg"><label>План</label><input id="vl-amount" type="number" step="any" min="0" value="${escAttr(d.amount)}"></div>
        <div class="fg"><label>Единица</label><input id="vl-unitm" list="vl-unitsm" value="${escAttr(d.unitM || 'шт')}"><datalist id="vl-unitsm"><option value="шт"><option value="отчёт"><option value="проба"><option value="п.м."><option value="км"><option value="га"><option value="чел.-дн."></datalist></div></div>`}
    <div class="fgr"><div class="fg"><label>Начало (план)</label><input id="vl-ps" type="date" value="${escAttr(d.plan_start)}"></div>
      <div class="fg"><label>Окончание (план)</label><input id="vl-pe" type="date" value="${escAttr(d.plan_end)}"></div></div>
    <div class="vl-hint">Сроки нужны для СМГ (план по дням) и прогноза окончания.</div>
  </div>`, [{ label: 'Отмена', cls: 'bs', fn: closeModal }, { label: v ? '💾 Сохранить' : '＋ Добавить', cls: 'bp', fn: _vlSave }]);
}
function _vlRead() {
  const g = id => document.getElementById(id);
  const o = { name: g('vl-name')?.value.trim() || '', category: g('vl-cat')?.value || VL_DRAFT.category, src: (document.querySelector('input[name=vl-src]:checked') || {}).value || VL_DRAFT.src,
    plan_start: g('vl-ps')?.value || '', plan_end: g('vl-pe')?.value || '', site_id: g('vl-site')?.value || VL_DRAFT.site_id };
  if (g('vl-layer')) o.layer_id = g('vl-layer').value;
  if (g('vl-main')) o.main = g('vl-main').value;
  if (g('vl-unit')) o.unit = g('vl-unit').value.trim();
  if (g('vl-f2')) o.f2 = g('vl-f2').value;
  if (g('vl-u2')) o.u2 = g('vl-u2').value.trim();
  if (g('vl-amount')) o.amount = g('vl-amount').value;
  if (g('vl-unitm')) o.unitM = g('vl-unitm').value.trim();
  return o;
}
function _vlRe(patch) { const d = Object.assign({}, VL_DRAFT, _vlRead(), patch); volEditModal(VL_DRAFT.volId, { draft: d }); }
async function _vlSave() {
  const d = Object.assign({}, VL_DRAFT, _vlRead());
  if (!d.name) { toast('Укажите название', 'warn'); return; }
  if (!d.site_id) { toast('Выберите объект', 'warn'); return; }
  if (d.src === 'layer' && !d.layer_id) { toast('Выберите слой (или «Без карты»)', 'warn'); return; }
  const body = { name: d.name, category: d.category, plan_start: d.plan_start || null, plan_end: d.plan_end || null, user_name: un() };
  if (d.src === 'layer') {
    const l = (layers || []).find(x => x.id === d.layer_id);
    Object.assign(body, { layer_id: d.layer_id, color: l ? l.color : undefined,
      measure_json: { main: d.main || 'count', unit: d.unit || 'шт', second: d.f2 ? { field: d.f2, unit: d.u2 || 'п.м.' } : null } });
  } else Object.assign(body, { layer_id: null, measure_json: null, amount: parseFloat(String(d.amount).replace(',', '.')) || 0, unit: d.unitM || 'шт', amount2: null });
  const url = VL_DRAFT.volId ? `${API}/volumes/${VL_DRAFT.volId}` : `${API}/sites/${d.site_id}/volumes`;
  const r = await fetch(url, { method: VL_DRAFT.volId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { toast(j.error || 'Ошибка сохранения', 'err'); return; }
  closeModal();
  await volAfterChange(d.site_id, d.layer_id);
  toast(VL_DRAFT.volId ? 'Объём сохранён' : `📦 Объём «${d.name}» добавлен`, 'ok');
}
// Загрузить файл слоем и вернуться в окно объёма с этим слоем
function _vlImport() {
  const draft = Object.assign({}, VL_DRAFT, _vlRead()), volId = VL_DRAFT.volId;
  const before = new Set((layers || []).map(l => l.id));
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.kml,.kmz,.shp,.zip,.dxf,.csv,.txt,.xlsx,.xls,.tab,.mif,.gpx';
  inp.onchange = () => {
    if (!inp.files.length) return;
    closeModal();
    importLayer({ target: { files: inp.files, value: '' } });
    let n = 0; const t = setInterval(() => {
      const nl = (layers || []).find(l => !before.has(l.id));
      if (nl) { clearInterval(t); setTimeout(() => volEditModal(volId, { draft: Object.assign(draft, { layer_id: nl.id, main: '', name: draft.name || nl.name }) }), 300); }
      else if (++n > 240) clearInterval(t);
    }, 500);
  };
  inp.click();
}
async function _vlNewLayer() {
  const draft = Object.assign({}, VL_DRAFT, _vlRead());
  const name = (prompt('Название нового слоя:', draft.name || 'Скважины') || '').trim(); if (!name) return;
  const r = await fetch(`${API}/layers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color: '#1a56db', symbol: 'borehole', geojson: JSON.stringify({ type: 'FeatureCollection', features: [] }) }) });
  const j = await r.json().catch(() => ({})); if (!j.id) { toast('Не удалось создать слой', 'err'); return; }
  layers = await fetch(`${API}/layers`).then(x => x.json()).catch(() => layers);
  try { renderLayerGroups(); if (typeof kmlPanelOpen !== 'undefined' && kmlPanelOpen) renderKmlPanel(); } catch (e) {}
  volEditModal(VL_DRAFT.volId, { draft: Object.assign(draft, { layer_id: j.id, main: 'count', unit: 'скв', name: draft.name || name }) });
  toast(`Слой «${name}» создан — после сохранения рисуйте точки: ✏️ Точка → слой «${name}»`, 'ok');
}
async function volDelete(volId) {
  const v = (currentObj?.volumes || []).find(x => x.id === volId); if (!v) return;
  if (!await confirmDlg(`Удалить объём «${v.name}»?${v.layer_id ? '\nСлой и отметки на нём останутся.' : '\nЗаписи выполнения тоже удалятся.'}`)) return;
  await apiDelUndo(`/volumes/${volId}`, 'Объём удалён', async () => volAfterChange(v.site_id));
}
// «📦 Объём объекта…» из меню слоя
async function volBindLayer(layerId) {
  await volLoad();
  const v = volByLayer(layerId);
  if (v) { if (currentType !== 'site' || currentObj?.id !== v.site_id) { try { await selectSite(v.site_id); } catch (e) {} } volEditModal(v.id); return; }
  volEditModal(null, { layerId });
}
// После любой правки объёма/слоя: обновить список объёмов, объект, вкладку, СМГ
async function volAfterChange(siteId) {
  await volLoad();
  if (currentType === 'site' && currentObj && (!siteId || currentObj.id === siteId)) {
    try { await refreshCurrent(); } catch (e) {}
    if (typeof renderTab === 'function' && currentTab === 'volumes') renderTab();
    try { renderSiteStatsOverlay(currentObj); } catch (e) {}
  }
  try { if (typeof loadAll === 'function' && siteId) { const s = (sites || []).find(x => x.id === siteId); if (s) { const fr = await fetch(`${API}/sites/${siteId}`).then(r => r.json()); s.completion_percent = fr.completion_percent; renderSidebar(); } } } catch (e) {}
  try { if (document.getElementById('smg-page')?.classList.contains('show') && typeof smgLoadAndRender === 'function' && smgSiteId) smgLoadAndRender(); } catch (e) {}
}
// изменился слой (у нас или у другого пользователя) — если это объём, обновить
function volOnLayersChanged(layerId) {
  const v = layerId ? volByLayer(layerId) : null;
  if (layerId && !v) return;
  volAfterChange(v ? v.site_id : null);
}

// ── Отметка «выполнено» на объектах слоя ────────────────────
const VL_DONE_KEYS = ['_done', '_done_date', '_done_by', '_fact2', '_workers', '_machine', '_note'];
function _vlClearDone(p) { VL_DONE_KEYS.forEach(k => delete p[k]); if (String(p._color || '').toLowerCase() === KML_DONE_COLOR) delete p._color; if (p.comment === 'Выполнено') delete p.comment; }
function _vlSetDone(p, o) {
  _vlClearDone(p);
  p._done = 1; p._done_date = o.date || _vlToday(); p._done_by = typeof un === 'function' ? un() : '';
  if (o.fact2 != null && o.fact2 !== '') p._fact2 = o.fact2;
  if (o.workers) p._workers = o.workers;
  if (o.machine) p._machine = o.machine;
  if (o.note) p._note = o.note;
}
const kmlIsDone = p => !!(p && (p._done || String(p._color || '').toLowerCase() === KML_DONE_COLOR));
// сохранить слой с изменёнными объектами + сообщение об объёме
async function _vlSaveLayer(l, gj, msg) {
  await _kmlSaveGeojson(l, gj);
  if (typeof kmlInvalidateLayerCache === 'function') kmlInvalidateLayerCache(l.id);
  try { renderLayerGroups(); } catch (e) {}
  try { if (document.getElementById('kat-panel')?.classList.contains('open') && KAT.layerId === l.id) _katRender(); } catch (e) {}
  const v = volByLayer(l.id);
  if (v) {
    await volAfterChange(v.site_id);
    const fresh = VL.all.find(x => x.id === v.id) || v;
    let vp = []; try { vp = currentObj && currentObj.id === v.site_id ? currentObj.vol_progress : (await fetch(`${API}/sites/${v.site_id}`).then(r => r.json())).vol_progress; } catch (e) {}
    toast(`${msg} · ${fresh.name}: ${volLine(fresh, volTotals(fresh, vp)).replace(/<[^>]+>/g, '')}`, 'ok');
  } else toast(msg, 'ok');
}
// ПКМ → «Выполнить» / «Снять выполнено»; force — окно с параметрами
async function kmlToggleDone(layerId, fIdx, force) {
  if (force) { volDoneDialog(layerId, [fIdx]); return; }
  const l = (layers || []).find(x => x.id === layerId); if (!l) return;
  let gj; try { gj = JSON.parse(l.geojson); } catch (e) { toast('Ошибка разбора слоя', 'err'); return; }
  const feats = gj.type === 'FeatureCollection' ? gj.features : [gj];
  const f = feats[fIdx]; if (!f) return;
  const p = f.properties = f.properties || {};
  const was = kmlIsDone(p);
  if (was) _vlClearDone(p); else { _vlSetDone(p, {}); delete p._skip; }
  try { await _vlSaveLayer(l, gj, was ? '↩️ Отметка «выполнено» снята' : '✅ Выполнено'); } catch (e) { toast('Ошибка сохранения', 'err'); }
}
async function kmlToggleSkip(layerId, fIdx) {
  const l = (layers || []).find(x => x.id === layerId); if (!l) return;
  let gj; try { gj = JSON.parse(l.geojson); } catch (e) { return; }
  const feats = gj.type === 'FeatureCollection' ? gj.features : [gj];
  const p = feats[fIdx] && (feats[fIdx].properties = feats[fIdx].properties || {}); if (!p) return;
  const was = !!p._skip;
  if (was) delete p._skip; else { p._skip = 1; _vlClearDone(p); }
  try { await _vlSaveLayer(l, gj, was ? '↩️ Объект снова в объёме' : '🚫 Объект исключён из объёма'); } catch (e) { toast('Ошибка сохранения', 'err'); }
}
// Окно «Выполнить с параметрами» для одного или многих объектов
// targets: [{layerId, idxs:[…]}] либо (layerId, idxs)
function volDoneDialog(layerId, idxs, after) {
  const targets = Array.isArray(layerId) ? layerId : [{ layerId, idxs }];
  const first = targets[0], l0 = (layers || []).find(x => x.id === first.layerId); if (!l0) return;
  const v = volByLayer(first.layerId), m = v ? volMeasure(v) : null;
  const n = targets.reduce((s, t) => s + t.idxs.length, 0);
  const f0 = n === 1 ? _kaFeatures(l0)[first.idxs[0]] : null, p0 = (f0 && f0.properties) || {};
  const plan2 = m && m.second && f0 ? _kaNum(p0[m.second.field]) : null;
  const machines = (pgkMachinery || []).slice().sort((a, b) => (DRILL_TYPES.includes(b.type) - DRILL_TYPES.includes(a.type)) || String(a.name).localeCompare(String(b.name), 'ru'));
  const nm = f0 ? (p0.name || p0.Name || `Объект ${first.idxs[0] + 1}`) : `${n} объект(ов)`;
  showModal(`✅ Выполнить — ${nm}`, `<div class="vl-form">
    ${v ? `<div class="vl-hint">Объём «${esc(v.name)}»${v.site_name ? ` · ${esc(v.site_name)}` : ''}</div>` : '<div class="vl-hint">Слой не привязан к объёму — отметка сохранится в слое, в объём не попадёт (📦 «Объём объекта…» в меню слоя).</div>'}
    <div class="fg"><label>Дата выполнения</label><input id="vd-date" type="date" value="${escAttr(p0._done_date || _vlToday())}"></div>
    ${m && m.second ? `<div class="fg"><label>Факт: ${esc(m.second.field)}, ${esc(m.second.unit || '')}${plan2 != null ? ` <span style="color:var(--tx3);text-transform:none">(план ${_vlN(plan2)})</span>` : ''}</label>
      <input id="vd-f2" type="number" step="any" min="0" value="${escAttr(p0._fact2 != null ? p0._fact2 : '')}" placeholder="${n > 1 ? 'пусто — плановое у каждого' : plan2 != null ? 'пусто — ' + _vlN(plan2) : ''}"></div>` : ''}
    <div class="fg"><label>Сотрудники</label>${_buildWorkerSelectHtml(p0._workers || '')}</div>
    <div class="fg"><label>Буровая / техника</label><select id="vd-mach"><option value="">— не выбрана —</option>${machines.map(x => `<option value="${escAttr(x.id)}" ${x.id === p0._machine ? 'selected' : ''}>${esc(x.name)}${x.type ? ` (${esc(x.type)})` : ''}</option>`).join('')}</select></div>
    <div class="fg"><label>Примечание</label><input id="vd-note" value="${escAttr(p0._note || '')}"></div>
  </div>`, [{ label: 'Отмена', cls: 'bs', fn: closeModal }, { label: '✅ Выполнено', cls: 'bp', fn: async () => {
    const o = { date: document.getElementById('vd-date').value || _vlToday(), workers: _vpwSelected().ids, machine: document.getElementById('vd-mach').value,
      note: document.getElementById('vd-note').value.trim() };
    const f2 = document.getElementById('vd-f2'); if (f2 && f2.value !== '') o.fact2 = _kaNum(f2.value);
    closeModal();
    for (const t of targets) {
      const l = (layers || []).find(x => x.id === t.layerId); if (!l) continue;
      let gj; try { gj = JSON.parse(l.geojson); } catch (e) { continue; }
      const feats = gj.type === 'FeatureCollection' ? gj.features : [gj];
      t.idxs.forEach(i => { const f = feats[i]; if (!f) return; f.properties = f.properties || {}; _vlSetDone(f.properties, o); delete f.properties._skip; });
      try { await _vlSaveLayer(l, gj, `✅ Выполнено: ${t.idxs.length}`); } catch (e) { toast('Ошибка сохранения', 'err'); }
    }
    if (typeof after === 'function') after();
  } }]);
}

// ── Ручные объёмы: выполнение числом ────────────────────────
function _buildWorkerSelectHtml(selectedIds) {
  const workers = (pgkWorkers && pgkWorkers.length ? pgkWorkers : (currentObj?.workers || [])).filter(w => w.status !== 'fired' || String(selectedIds || '').split(',').includes(String(w.id)));
  const sel = new Set(String(selectedIds || '').split(',').filter(Boolean));
  return `<input id="f-vpwsearch" type="text" placeholder="🔍 Поиск сотрудника…" autocomplete="off" class="vl-ws" oninput="filterVolWorkers()">
  <div id="f-vpworkers" class="vl-wl">${workers.map(w => `<label class="vpw-row" data-text="${escAttr((w.name + ' ' + (w.role || '')).toLowerCase())}">
      <input type="checkbox" class="vpw-cb" value="${escAttr(String(w.id))}" data-name="${escAttr(w.name)}" ${sel.has(String(w.id)) ? 'checked' : ''} onchange="_vpwUpdateCount()">
      <span>${esc(w.name)}${w.role ? ` <i>${esc(w.role)}</i>` : ''}</span></label>`).join('') || '<div style="padding:8px;font-size:11px;color:var(--tx3)">Нет сотрудников</div>'}</div>
  <div id="f-vpwcount" class="vl-wc">${sel.size ? 'Выбрано: ' + sel.size : 'Отметьте исполнителей галочками'}</div>`;
}
function filterVolWorkers() {
  const q = (document.getElementById('f-vpwsearch')?.value || '').toLowerCase();
  document.querySelectorAll('#f-vpworkers .vpw-row').forEach(r => { r.style.display = !q || (r.dataset.text || '').includes(q) ? '' : 'none'; });
}
function _vpwUpdateCount() { const n = document.querySelectorAll('#f-vpworkers .vpw-cb:checked').length; const el = document.getElementById('f-vpwcount'); if (el) el.textContent = n ? 'Выбрано: ' + n : 'Отметьте исполнителей галочками'; }
function _vpwSelected() { const c = [...document.querySelectorAll('#f-vpworkers .vpw-cb:checked')]; return { ids: c.map(x => x.value).join(','), names: c.map(x => x.dataset.name).join(', ') }; }
function _vlProgressModal(v, p) {
  const t = volTotals(v, currentObj?.vol_progress);
  const machines = (pgkMachinery || []);
  showModal(`${p ? '✏️' : '＋'} Выполнение — ${v.name}`, `<div class="vl-form">
    <div class="vl-hint">План: <b>${_vlN(v.amount)} ${esc(v.unit)}</b> · выполнено: <b>${_vlN(t.done)} ${esc(v.unit)}</b></div>
    <div class="fgr"><div class="fg"><label>Дата *</label><input id="vp-d" type="date" value="${escAttr(p ? p.work_date : _vlToday())}"></div>
      <div class="fg"><label>Выполнено, ${esc(v.unit)} *</label><input id="vp-c" type="number" step="any" min="0" value="${escAttr(p ? p.completed : '')}"></div></div>
    <div class="fg"><label>Сотрудники</label>${_buildWorkerSelectHtml(p ? p.worker_ids : '')}</div>
    <div class="fg"><label>Техника</label><select id="vp-m"><option value="">— не выбрана —</option>${machines.map(x => `<option value="${escAttr(x.id)}" ${p && x.id === p.machine_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    <div class="fg"><label>Примечание</label><input id="vp-n" value="${escAttr(p ? p.notes || '' : '')}"></div>
  </div>`, [{ label: 'Отмена', cls: 'bs', fn: closeModal }, { label: '💾 Сохранить', cls: 'bp', fn: async () => {
    const work_date = document.getElementById('vp-d').value, completed = _kaNum(document.getElementById('vp-c').value);
    if (!work_date || !Number.isFinite(completed)) { toast('Укажите дату и количество', 'warn'); return; }
    const body = { site_id: v.site_id, work_date, completed, worker_ids: _vpwSelected().ids, machine_id: document.getElementById('vp-m').value || null, notes: document.getElementById('vp-n').value.trim(), user_name: un() };
    const r = await fetch(p ? `${API}/vol_progress/${p.id}` : `${API}/volumes/${v.id}/progress`, { method: p ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.error || 'Ошибка сохранения', 'err'); return; }
    closeModal(); volOpen[v.id] = true; await volAfterChange(v.site_id); toast('Сохранено', 'ok');
  } }]);
}
function volAddProgress(volId) { const v = (currentObj?.volumes || []).find(x => x.id === volId); if (v) _vlProgressModal(v, null); }
function volEditProgress(pid) {
  const p = (currentObj?.vol_progress || []).find(x => x.id === pid); if (!p) return;
  const v = (currentObj.volumes || []).find(x => x.id === p.volume_id); if (v) _vlProgressModal(v, p);
}
async function volDelProgress(pid) {
  const p = (currentObj?.vol_progress || []).find(x => x.id === pid); if (!p) return;
  await apiDelUndo(`/vol_progress/${pid}`, 'Запись удалена', async () => volAfterChange(p.site_id));
}

// ── «Выполнение за день» (мини-панель объекта) ─────────────
function openDailyProgressModal() {
  if (!currentObj || currentType !== 'site') { toast('Откройте объект', 'err'); return; }
  const vols = currentObj.volumes || [], prog = currentObj.vol_progress || [], day = _vlToday();
  const manual = vols.filter(v => !v.layer_id), lay = vols.filter(v => v.layer_id);
  showModal(`📆 Выполнение за день — ${currentObj.name}`, `<div class="vl-form">
    ${lay.length ? `<div class="vl-sub">🗺 Объёмы на слоях — отметьте объекты на карте (ПКМ → «✅ Выполнить» или выделите областью)</div>
      ${lay.map(v => { const today = prog.filter(p => p.volume_id === v.id && p.work_date === day && _vlFact(p)); const t = volTotals(v, prog);
        return `<div class="vl-day"><span>${esc(v.name)}</span><small>${volLine(v, t)}</small><b>${today.length ? `сегодня +${today.length}` : ''}</b>
          <button class="btn bs bxs" onclick="closeModal();volShowLayer('${v.id}')">🗺</button></div>`; }).join('')}` : ''}
    ${manual.length ? `<div class="vl-sub">✍ Объёмы без карты</div>
      <div class="fg"><label>Дата</label><input id="dp-date" type="date" value="${day}" style="max-width:170px"></div>
      ${manual.map(v => { const t = volTotals(v, prog); return `<div class="vl-day"><span>${esc(v.name)}</span><small>${volLine(v, t)}</small>
        <input type="number" step="any" min="0" class="dp-inp" data-vol="${escAttr(v.id)}" placeholder="0"><i>${esc(v.unit)}</i></div>`; }).join('')}` : ''}
    ${!vols.length ? '<div class="empty">Нет объёмов</div>' : ''}
  </div>`, [{ label: 'Закрыть', cls: 'bs', fn: closeModal }, ...(manual.length ? [{ label: '💾 Записать', cls: 'bp', fn: async () => {
    const work_date = document.getElementById('dp-date').value || day;
    const list = [...document.querySelectorAll('.dp-inp')].map(i => ({ id: i.dataset.vol, c: _kaNum(i.value) })).filter(e => e.c > 0);
    if (!list.length) { toast('Впишите хотя бы одно значение', 'warn'); return; }
    closeModal();
    for (const e of list) await fetch(`${API}/volumes/${e.id}/progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ site_id: currentObj.id, work_date, completed: e.c, user_name: un() }) });
    await volAfterChange(currentObj.id); toast(`✅ Записано: ${list.length}`, 'ok');
  } }] : [])]);
}

// сервер мог раздать объектам _uid — принять слой из ответа (иначе следующее сохранение их потеряет)
(function () {
  const of = window.fetch;
  window.fetch = function (u, o) {
    const p = of.apply(this, arguments);
    const m = typeof u === 'string' && o && /PUT/i.test(o.method || '') && u.match(/\/api\/layers\/([^/?]+)$/);
    if (m) p.then(r => r.clone().json().then(j => {
      if (!j || !j.geojson) return;
      const l = (layers || []).find(x => x.id === m[1]); if (!l) return;
      l.geojson = j.geojson; if (typeof kmlInvalidateLayerCache === 'function') kmlInvalidateLayerCache(l.id);
      if (typeof _luBase !== 'undefined' && _luBase) _luBase[l.id] = j.geojson;
    }).catch(() => {}).then(() => { if (r.ok) _vlLayerSaved(m[1]); }), () => {});
    return p;
  };
})();
// слой сохранён (любой правкой: отметка, атрибуты, вершины, Ctrl+Z) — объём на нём пересчитан сервером
const _vlSavedT = {};
function _vlLayerSaved(id) { if (!volByLayer(id)) return; clearTimeout(_vlSavedT[id]); _vlSavedT[id] = setTimeout(() => volOnLayersChanged(id), 400); }
setTimeout(volLoad, 300);
