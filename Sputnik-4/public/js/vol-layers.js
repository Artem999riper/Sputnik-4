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
async function volLoad() {
  try { VL.all = await fetch(`${API}/volumes`).then(r => r.json()); } catch (e) {}
  try { if (typeof kmlPanelOpen !== 'undefined' && kmlPanelOpen) renderKmlPanel(); } catch (e) {}   // слой стал/перестал быть объёмом
  return VL.all;
}
const volByLayer = id => id ? VL.all.find(v => v.layer_id === id) : null;
function volMeasure(v) {
  let m = {}; try { m = JSON.parse((v && v.measure_json) || '{}') || {}; } catch (e) {}
  if (!m.main) m.main = 'count';
  if (!m.unit) m.unit = (v && v.unit) || 'шт';
  // второй показатель: source 'field' — сумма поля; 'fixed' — одинаково на объект; 'fact' — вписывают при выполнении
  const s2 = m.second;
  if (s2) {
    if (!s2.source) s2.source = 'field';
    if ((s2.source === 'field' && !s2.field) || (s2.source === 'fixed' && !(_vlNumLoose(s2.value) > 0))) m.second = null;
  }
  return m;
}
// число из текста поля: «10», «10,5», «10 м», «Н=12,5», «1 200 п.м.» — как на сервере (volume-sync.js num)
function _vlNumLoose(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = String(v).replace(/(\d)[\s\u00a0\u202f](?=\d{3}\b)/g, '$1').match(/-?\d+(?:[.,]\d+)?/);
  return t ? parseFloat(t[0].replace(',', '.')) : null;
}
// план и факт второго показателя для одного объекта слоя
function volPlan2Of(f, m) {
  const s2 = m && m.second; if (!s2) return null;
  if (s2.source === 'fixed') return _vlNumLoose(s2.value);
  if (s2.source === 'fact') return null;
  return _vlNumLoose(((f && f.properties) || {})[s2.field]);
}
function volFact2Of(f, m) {
  if (!m || !m.second) return null;
  const x = _vlNumLoose(((f && f.properties) || {})._fact2);
  return x != null ? x : (volPlan2Of(f, m) || 0);
}
// подпись второго показателя: «глубина», «по 10 на объект», «вписывают при выполнении»
const volSecondLabel = m => !m || !m.second ? '' : m.second.source === 'fixed' ? `по ${_vlN(m.second.value)} на объект` : m.second.source === 'fact' ? 'факт при выполнении' : m.second.field;
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
  if (m.second && v.layer_id) s += ` · ${_vlN(t.done2)}${v.amount2 != null ? ` / ${_vlN(v.amount2)}` : ''} ${esc(m.second.unit || '')}`;
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
        ${v.layer_id ? `<button class="btn bp bxs" onclick="volShowLayer('${v.id}');volMarkStart('${v.layer_id}')" title="Щелчками по объектам на карте отмечать выполнение (с текущими исполнителями)">✅ Отмечать</button>
          <button class="btn bs bxs" onclick="volShowLayer('${v.id}')" title="Показать слой и приблизить">🗺 На карте</button>
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
    <div class="vl-exec" onclick="volExecEdit()" title="Кто выполняет: подставляется при отметках на карте">Исполнители: <b>${esc(volExecLabel())}</b> ✏️</div>
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
  const cnt = {};
  (l ? kmlFields(l) : []).forEach(k => { cnt[k] = feats.filter(f => _vlNumLoose((f.properties || {})[k]) != null).length; });
  const all = Object.keys(cnt);
  const fields = all.filter(k => cnt[k] > 0).sort((a, b) => cnt[b] - cnt[a]);
  const depth = fields.find(k => /глуб|depth|^h$|^н$|^h_|забой|п\.?\s*м/i.test(k)) || '';
  const isBore = l && (/скв|бурен|шурф/i.test(l.name) || l.symbol === 'borehole' || /borehole/.test(l.symbol || ''));
  return { n: feats.length, t, main, fields, all, cnt, depth, feats, unit: main === 'length' ? 'км' : main === 'area' ? 'га' : isBore ? 'скв' : 'шт' };
}
const VL_DRAFT = {};
function volEditModal(volId, opts) {
  opts = opts || {};
  const v = volId ? ((currentObj?.volumes || []).find(x => x.id === volId) || VL.all.find(x => x.id === volId)) : null;
  const d = Object.assign({ name: '', category: 'geology', src: 'layer', layer_id: '', main: '', unit: '', s2: '', f2: '', v2: '', p2: '', u2: 'п.м.', amount: '', unitM: 'шт', plan_start: '', plan_end: '',
    site_id: (currentType === 'site' && currentObj) ? currentObj.id : '' }, opts.draft || {});
  if (v && !opts.draft) {
    const m = volMeasure(v);
    Object.assign(d, { name: v.name, category: v.category || 'geology', src: v.layer_id ? 'layer' : 'manual', layer_id: v.layer_id || '', main: m.main, unit: m.unit,
      s2: m.second ? m.second.source : 'none', f2: m.second ? m.second.field || '' : '', v2: m.second && m.second.value != null ? m.second.value : '', p2: m.second && m.second.plan != null ? m.second.plan : '',
      u2: m.second ? m.second.unit : 'п.м.', amount: v.amount, unitM: v.unit || 'шт', plan_start: v.plan_start || '', plan_end: v.plan_end || '', site_id: v.site_id });
  }
  if (opts.layerId) { d.src = 'layer'; d.layer_id = opts.layerId; }
  const l = (layers || []).find(x => x.id === d.layer_id);
  const info = _vlLayerInfo(l);
  if (l && !d.main) { d.main = info.main; d.unit = info.unit; d.f2 = info.depth; d.s2 = info.depth ? 'field' : 'none'; }
  if (!d.s2) d.s2 = d.f2 ? 'field' : 'none';
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
      ${_vlSecondHtml(d, info)}` : ''}`
    : `<div class="fgr"><div class="fg"><label>План</label><input id="vl-amount" type="number" step="any" min="0" value="${escAttr(d.amount)}"></div>
        <div class="fg"><label>Единица</label><input id="vl-unitm" list="vl-unitsm" value="${escAttr(d.unitM || 'шт')}"><datalist id="vl-unitsm"><option value="шт"><option value="отчёт"><option value="проба"><option value="п.м."><option value="км"><option value="га"><option value="чел.-дн."></datalist></div></div>`}
    <div class="fgr"><div class="fg"><label>Начало (план)</label><input id="vl-ps" type="date" value="${escAttr(d.plan_start)}"></div>
      <div class="fg"><label>Окончание (план)</label><input id="vl-pe" type="date" value="${escAttr(d.plan_end)}"></div></div>
    <div class="vl-hint">Сроки нужны для СМГ (план по дням) и прогноза окончания.</div>
  </div>`, [{ label: 'Отмена', cls: 'bs', fn: closeModal }, { label: v ? '💾 Сохранить' : '＋ Добавить', cls: 'bp', fn: _vlSave }]);
}
// блок «Второй показатель» окна объёма
function _vlSecondHtml(d, info) {
  const S = d.s2 || 'none', F = d.f2;
  const opt = (k, t, sub) => `<label><input type="radio" name="vl-s2" value="${k}" ${S === k ? 'checked' : ''} onchange="_vlRe({s2:'${k}'})"> ${t} <small>${sub}</small></label>`;
  let body = '';
  if (S === 'field') {
    const list = info.all.slice().sort((a, b) => (info.cnt[b] - info.cnt[a]) || a.localeCompare(b, 'ru'));
    const ex = F ? info.feats.map(f => (f.properties || {})[F]).filter(x => x != null && x !== '').slice(0, 3) : [];
    const sum = F ? info.feats.reduce((a, f) => a + (_vlNumLoose((f.properties || {})[F]) || 0), 0) : 0;
    body = `<div class="fg"><label>Поле слоя</label><select id="vl-f2" onchange="_vlRe({f2:this.value})"><option value="">— выберите поле —</option>${list.map(k =>
        `<option value="${escAttr(k)}" ${k === F ? 'selected' : ''}>${esc(k)} — числа у ${info.cnt[k]} из ${info.n}</option>`).join('')}</select></div>
      ${F ? `<div class="vl-hint">Например: ${ex.map(x => `«${esc(String(x).slice(0, 24))}»`).join(', ') || '—'} → план всего <b>${_vlN(sum)}</b>${info.cnt[F] < info.n ? ` · без числа: ${info.n - info.cnt[F]} (их план 0)` : ''}</div>` : ''}
      ${!info.all.length ? '<div class="vl-hint">В слое нет полей — выберите «Одинаково на объект» или «При выполнении».</div>' : ''}`;
  } else if (S === 'fixed') {
    body = `<div class="fg"><label>На каждый объект</label><input id="vl-v2" type="number" step="any" min="0" value="${escAttr(d.v2)}" placeholder="10"></div>
      <div class="vl-hint">План = это число × количество объектов (исключённые не считаются). Фактическое значение можно вписать при выполнении.</div>`;
  } else if (S === 'fact') {
    body = `<div class="fg"><label>План всего (необязательно)</label><input id="vl-p2" type="number" step="any" min="0" value="${escAttr(d.p2)}" placeholder="например 3000"></div>
      <div class="vl-hint">Значение вписывается при выполнении: ПКМ → «⚙️ Выполнить с параметрами» → «Факт». Быстрое «✅ Выполнить» засчитает 0.</div>`;
  }
  return `<div class="vl-sub">Второй показатель (например п.м.)</div>
    <div class="vl-src-pick vl-s2">${opt('none', '— нет —', '')}${opt('field', 'Из поля слоя', 'сумма по полю, число берётся из текста: «10 м» → 10')}
      ${opt('fixed', 'Одинаково на объект', 'все скважины по 10 м')}${opt('fact', 'При выполнении', 'глубина известна только после бурения')}</div>
    ${S !== 'none' ? `<div class="fgr"><div style="flex:1">${body}</div>
      <div class="fg" style="max-width:120px"><label>Единица</label><input id="vl-u2" list="vl-u2s" value="${escAttr(d.u2 || 'п.м.')}"><datalist id="vl-u2s"><option value="п.м."><option value="м"><option value="м³"><option value="шт"></datalist></div></div>` : ''}`;
}
function _vlRead() {
  const g = id => document.getElementById(id);
  const o = { name: g('vl-name')?.value.trim() || '', category: g('vl-cat')?.value || VL_DRAFT.category, src: (document.querySelector('input[name=vl-src]:checked') || {}).value || VL_DRAFT.src,
    plan_start: g('vl-ps')?.value || '', plan_end: g('vl-pe')?.value || '', site_id: g('vl-site')?.value || VL_DRAFT.site_id };
  if (g('vl-layer')) o.layer_id = g('vl-layer').value;
  if (g('vl-main')) o.main = g('vl-main').value;
  if (g('vl-unit')) o.unit = g('vl-unit').value.trim();
  if (document.querySelector('input[name=vl-s2]:checked')) o.s2 = document.querySelector('input[name=vl-s2]:checked').value;
  if (g('vl-f2')) o.f2 = g('vl-f2').value;
  if (g('vl-v2')) o.v2 = g('vl-v2').value;
  if (g('vl-p2')) o.p2 = g('vl-p2').value;
  if (g('vl-u2')) o.u2 = g('vl-u2').value.trim();
  if (g('vl-amount')) o.amount = g('vl-amount').value;
  if (g('vl-unitm')) o.unitM = g('vl-unitm').value.trim();
  return o;
}
function _vlRe(patch) { const d = Object.assign({}, VL_DRAFT, _vlRead(), patch); volEditModal(VL_DRAFT.volId, { draft: d }); }
function _vlSecondOf(d) {
  const u = d.u2 || 'п.м.';
  if (d.s2 === 'field' && d.f2) return { source: 'field', field: d.f2, unit: u };
  if (d.s2 === 'fixed' && _vlNumLoose(d.v2) > 0) return { source: 'fixed', value: _vlNumLoose(d.v2), unit: u };
  if (d.s2 === 'fact') return { source: 'fact', plan: _vlNumLoose(d.p2), unit: u };
  return null;
}
async function _vlSave() {
  const d = Object.assign({}, VL_DRAFT, _vlRead());
  if (!d.name) { toast('Укажите название', 'warn'); return; }
  if (!d.site_id) { toast('Выберите объект', 'warn'); return; }
  if (d.src === 'layer' && !d.layer_id) { toast('Выберите слой (или «Без карты»)', 'warn'); return; }
  if (d.src === 'layer' && d.s2 === 'field' && !d.f2) { toast('Выберите поле для второго показателя', 'warn'); return; }
  if (d.src === 'layer' && d.s2 === 'fixed' && !(_vlNumLoose(d.v2) > 0)) { toast('Впишите число на каждый объект', 'warn'); return; }
  const body = { name: d.name, category: d.category, plan_start: d.plan_start || null, plan_end: d.plan_end || null, user_name: un() };
  if (d.src === 'layer') {
    const l = (layers || []).find(x => x.id === d.layer_id);
    Object.assign(body, { layer_id: d.layer_id, color: l ? l.color : undefined,
      measure_json: { main: d.main || 'count', unit: d.unit || 'шт', second: _vlSecondOf(d) } });
  } else Object.assign(body, { layer_id: null, measure_json: null, amount: parseFloat(String(d.amount).replace(',', '.')) || 0, unit: d.unitM || 'шт', amount2: null });
  const url = VL_DRAFT.volId ? `${API}/volumes/${VL_DRAFT.volId}` : `${API}/sites/${d.site_id}/volumes`;
  const r = await fetch(url, { method: VL_DRAFT.volId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { toast(j.error || 'Ошибка сохранения', 'err'); return; }
  closeModal();
  await volAfterChange(d.site_id, d.layer_id);
  toast(VL_DRAFT.volId ? 'Объём сохранён' : `📦 Объём «${d.name}» добавлен${d.src === 'layer' ? ' — его слой теперь в «Слои карты» → вкладка «📦 Объёмы»' : ''}`, 'ok');
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
const VL_DONE_KEYS = ['_done', '_done_date', '_done_by', '_fact2', '_workers', '_machine', '_brigade', '_note'];
function _vlClearDone(p) { VL_DONE_KEYS.forEach(k => delete p[k]); if (String(p._color || '').toLowerCase() === KML_DONE_COLOR) delete p._color; if (p.comment === 'Выполнено') delete p.comment; }
function _vlSetDone(p, o) {
  _vlClearDone(p);
  p._done = 1; p._done_date = o.date || _vlToday(); p._done_by = typeof un === 'function' ? un() : '';
  if (o.fact2 != null && o.fact2 !== '') p._fact2 = o.fact2;
  if (o.workers) p._workers = o.workers;
  if (o.machine) p._machine = o.machine;
  if (o.brigade) p._brigade = o.brigade;
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
  if (was) _vlClearDone(p); else { _vlSetDone(p, volExecNow()); delete p._skip; }
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
async function volDoneDialog(layerId, idxs, after) {
  await volBrigades();
  const targets = Array.isArray(layerId) ? layerId : [{ layerId, idxs }];
  const first = targets[0], l0 = (layers || []).find(x => x.id === first.layerId); if (!l0) return;
  const v = volByLayer(first.layerId), m = v ? volMeasure(v) : null;
  const n = targets.reduce((s, t) => s + t.idxs.length, 0);
  const f0 = n === 1 ? _kaFeatures(l0)[first.idxs[0]] : null, p0 = (f0 && f0.properties) || {};
  const plan2 = m && m.second && f0 ? volPlan2Of(f0, m) : null;
  const machines = (pgkMachinery || []).slice().sort((a, b) => (DRILL_TYPES.includes(b.type) - DRILL_TYPES.includes(a.type)) || String(a.name).localeCompare(String(b.name), 'ru'));
  const nm = f0 ? (p0.name || p0.Name || `Объект ${first.idxs[0] + 1}`) : `${n} объект(ов)`;
  // исполнители: у выполненного — как отмечено, иначе — текущие по умолчанию (бригада + люди)
  const def = p0._done ? { brigade: p0._brigade || '', workers: p0._workers || '', machine: p0._machine || '' } : volExecNow();
  showModal(`✅ Выполнить — ${nm}`, `<div class="vl-form">
    ${v ? `<div class="vl-hint">Объём «${esc(v.name)}»${v.site_name ? ` · ${esc(v.site_name)}` : ''}</div>` : '<div class="vl-hint">Слой не привязан к объёму — отметка сохранится в слое, в объём не попадёт (📦 «Объём объекта…» в меню слоя).</div>'}
    <div class="fg"><label>Дата выполнения</label><input id="vd-date" type="date" value="${escAttr(p0._done_date || _vlToday())}"></div>
    ${m && m.second ? `<div class="fg"><label>Факт${m.second.source === 'field' ? ': ' + esc(m.second.field) : ''}, ${esc(m.second.unit || '')}${plan2 != null ? ` <span style="color:var(--tx3);text-transform:none">(план ${_vlN(plan2)})</span>` : ''}</label>
      <input id="vd-f2" type="number" step="any" min="0" value="${escAttr(p0._fact2 != null ? p0._fact2 : '')}" placeholder="${m.second.source === 'fact' ? 'впишите факт' : n > 1 ? 'пусто — плановое у каждого' : plan2 != null ? 'пусто — ' + _vlN(plan2) : ''}"></div>` : ''}
    <div class="fg"><label>Бригада</label><select id="vd-brig" onchange="_vdBrigade(this.value)"><option value="">— без бригады (отдельные люди) —</option>${VEX.list.map(b => `<option value="${escAttr(b.id)}" ${b.id === def.brigade ? 'selected' : ''}>${esc(b.name)} — ${volBrigadeWorkers(b).length} чел.${b.machine_name ? ' · ' + esc(b.machine_name) : ''}</option>`).join('')}</select>
      <div class="vl-hint">Объём засчитывается всем в бригаде, кроме водителя. Людей можно добавить или убрать галочками.</div></div>
    <div class="fg"><label>Исполнители</label>${_buildWorkerSelectHtml(def.workers || '')}</div>
    <div class="fg"><label>Буровая / техника</label><select id="vd-mach"><option value="">— не выбрана —</option>${machines.map(x => `<option value="${escAttr(x.id)}" ${x.id === def.machine ? 'selected' : ''}>${esc(x.name)}${x.type ? ` (${esc(x.type)})` : ''}</option>`).join('')}</select></div>
    <div class="fg"><label>Примечание</label><input id="vd-note" value="${escAttr(p0._note || '')}"></div>
    <label class="sc-chk"><input type="checkbox" id="vd-remember" checked> запомнить исполнителей для следующих отметок</label>
  </div>`, [{ label: 'Отмена', cls: 'bs', fn: closeModal },
    ...(f0 && f0.geometry && f0.geometry.type === 'LineString' && !p0._done ? [{ label: '📏 Только участок…', cls: 'bs', fn: () => { closeModal(); volSegStart(first.layerId, first.idxs[0]); } }] : []),
    { label: '✅ Выполнено', cls: 'bp', fn: async () => {
    const o = { date: document.getElementById('vd-date').value || _vlToday(), workers: _vpwSelected().ids, machine: document.getElementById('vd-mach').value,
      brigade: document.getElementById('vd-brig').value, note: document.getElementById('vd-note').value.trim() };
    if (document.getElementById('vd-remember').checked) volExecRemember(o);
    const f2 = document.getElementById('vd-f2'); if (f2 && f2.value !== '') o.fact2 = _vlNumLoose(f2.value);
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


// ═══ Вкладка «📦 Объёмы» панели «Слои карты» ═══════════════════════════
// Слои, которые являются объёмами, живут здесь (а не среди обычных слоёв):
// слева — объекты, справа — по разделам и видам работ, с выполнением.
const VLP = { site: 'ALL' };
const _vlpLayers = () => (layers || []).filter(l => !l.site_id && volByLayer(l.id));
function _vlpSites() {
  const by = {};
  VL.all.filter(v => v.layer_id && (layers || []).some(l => l.id === v.layer_id)).forEach(v => { (by[v.site_id] = by[v.site_id] || { id: v.site_id, name: v.site_name || 'Объект', vols: [] }).vols.push(v); });
  return Object.values(by).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
}
function volKmlRenderCats() {
  const el = document.getElementById('kml-cats'); if (!el) return;
  const ss = _vlpSites(), all = _vlpLayers();
  if (VLP.site !== 'ALL' && !ss.some(s => s.id === VLP.site)) VLP.site = 'ALL';
  const row = (id, label, ls, n) => `<div class="kml-cat-row ${VLP.site === id ? 'active' : ''}" onclick="VLP.site='${escAttr(id)}';renderKmlPanel()">
    <input type="checkbox" ${ls.some(l => l.visible) ? 'checked' : ''} onclick="event.stopPropagation()" onchange="volKmlBulkVis('${escAttr(id)}',this.checked)" style="cursor:pointer;flex-shrink:0">
    <span class="kml-cat-label" title="${escAttr(label)}">${label}</span><span class="kml-cat-count">${n}</span></div>`;
  const lsOf = s => s.vols.map(v => (layers || []).find(l => l.id === v.layer_id)).filter(Boolean);
  el.innerHTML = row('ALL', '📦 Все объекты', all, all.length)
    + ss.map(s => { const o = (sites || []).find(x => x.id === s.id); return row(s.id, `🏗 ${esc(s.name)}${o ? ` <small style="color:var(--tx3)">${o.completion_percent || 0}%</small>` : ''}`, lsOf(s), s.vols.length); }).join('')
    + `<div class="kml-cat-actions"><button class="btn bs bxs" onclick="volEditModal(null${VLP.site !== 'ALL' ? `,{draft:{site_id:'${escAttr(VLP.site)}'}}` : ''})">＋ Объём</button></div>
      <div class="vl-hint" style="padding:6px 8px">Слой попадает сюда, когда он — объём объекта (ПКМ по слою → «📦 Сделать объёмом объекта…»).</div>`;
}
function volKmlRenderPane() {
  const el = document.getElementById('kml-layers-pane'); if (!el) return;
  const ss = _vlpSites().filter(s => VLP.site === 'ALL' || s.id === VLP.site);
  if (!ss.length) {
    el.innerHTML = `<div class="kml-empty"><div style="font-size:28px;margin-bottom:6px">📦</div><div>Нет слоёв-объёмов</div>
      <div style="font-size:10px;color:var(--tx3);margin-top:4px">Откройте объект → «Объёмы» → «＋ Объём» и выберите слой,<br>или ПКМ по слою → «📦 Сделать объёмом объекта…»</div></div>`;
    return;
  }
  const secs = Object.assign({}, typeof VOL_SECTIONS !== 'undefined' ? VOL_SECTIONS : {});
  let html = '', shown = 0, vis = 0;
  ss.forEach(s => {
    const o = (sites || []).find(x => x.id === s.id);
    html += `<div class="vlp-site" onclick="selectSite('${escAttr(s.id)}')" title="Открыть объект">🏗 ${esc(s.name)}<span>${o ? `готовность ${o.completion_percent || 0}%` : ''}</span></div>`;
    const cats = [...new Set(s.vols.map(v => v.category || 'geology'))].sort((a, b) => Object.keys(secs).indexOf(a) - Object.keys(secs).indexOf(b));
    cats.forEach(c => {
      const sec = secs[c] || { icon: '•', label: c, color: '#6b7280' };
      html += `<div class="vlp-cat" style="--sc:${sec.color}">${sec.icon} ${esc(sec.label)}</div>`;
      s.vols.filter(v => (v.category || 'geology') === c).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru')).forEach(v => {
        const l = (layers || []).find(x => x.id === v.layer_id); if (!l) return;
        shown++; if (l.visible) vis++;
        const t = { done: +v.done || 0, done2: +v.done2 || 0, pct: v.amount > 0 ? Math.min(100, Math.round((+v.done || 0) / v.amount * 100)) : 0 };
        html += _kmlLayerRowHtml(l, {
          name: `<b>${esc(v.name)}</b>`, cls: 'vlp-row', noPin: true,
          sub: `<div class="vlp-prog"><div class="pbt"><div class="pbf" style="width:${t.pct}%;background:${t.pct >= 100 ? 'var(--grn)' : 'var(--acc)'}"></div></div>
            <b style="color:${t.pct >= 100 ? 'var(--grn)' : 'var(--acc)'}">${t.pct}%</b></div>${volLine(v, t)}${l.name !== v.name ? ` · <span title="Слой">🗂 ${esc(l.name)}</span>` : ''}`,
          btns: `<button class="kml-icon-btn" onclick="volMarkStart('${escAttr(l.id)}')" title="Отмечать выполнение щелчками на карте">✅</button>
            <button class="kml-icon-btn" onclick="kmlAttrTable('${escAttr(l.id)}')" title="Таблица: выполнено, дата, факт">📋</button>
            <button class="kml-icon-btn" onclick="volOpenEdit('${escAttr(v.id)}')" title="Изменить объём">✏️</button>`,
        });
      });
    });
  });
  el.innerHTML = `<div style="flex:1">${html}</div><div class="kml-pane-footer" style="display:flex;align-items:center;gap:8px"><span>Показано ${vis} / ${shown}</span>
    <span style="margin-left:auto;font-size:10px;color:var(--tx3)">выполнение — ПКМ по объекту на карте</span></div>`;
}
async function volKmlBulkVis(siteId, on) {
  const ids = VL.all.filter(v => v.layer_id && (siteId === 'ALL' || v.site_id === siteId)).map(v => v.layer_id);
  for (const l of (layers || []).filter(x => ids.includes(x.id) && !!x.visible !== on)) { try { await kmlToggleVis(l.id, on ? 1 : 0); } catch (e) {} }
  renderKmlPanel();
}
// изменить объём из панели слоёв: открыть его объект, затем окно объёма
async function volOpenEdit(volId) {
  const v = VL.all.find(x => x.id === volId); if (!v) return;
  if (!(currentType === 'site' && currentObj && currentObj.id === v.site_id)) { try { await selectSite(v.site_id); } catch (e) {} }
  volEditModal(volId);
}


// ═══ Исполнители: бригада и/или отдельные люди ═════════════════════════
// Бригада (вкладка «Бригады»): объём засчитывается всем её членам, кроме
// водителя (водитель — у машины бригады). Можно добавить отдельных людей.
// «Текущие исполнители» запоминаются (у каждого пользователя свои) и
// подставляются в быстрое «✅ Выполнить», выделение областью и режим отметки.
const VEX = Object.assign({ brigade: '', extra: [], machine: '', list: [], loaded: 0 },
  (() => { try { const o = JSON.parse(localStorage.getItem('vl_exec') || '{}'); return { brigade: o.brigade || '', extra: o.extra || [], machine: o.machine || '' }; } catch (e) { return {}; } })());
async function volBrigades(force) {
  if (!force && VEX.loaded && Date.now() - VEX.loaded < 60000) return VEX.list;
  try { VEX.list = await fetch(`${API}/pgk/brigades`).then(r => r.json()); VEX.loaded = Date.now(); } catch (e) {}
  return VEX.list;
}
const volBrigade = id => (VEX.list || []).find(b => b.id === id);
// члены бригады без водителя её машины
function volBrigadeWorkers(b) {
  if (!b) return [];
  const drv = b.machine_driver_id || ((pgkMachinery || []).find(m => m.id === b.machine_id) || {}).driver_id;
  return (b.member_ids || []).filter(id => id && id !== drv);
}
// текущие исполнители → {workers:'id,id', machine, brigade}
function volExecNow() {
  const b = volBrigade(VEX.brigade);
  const ids = [...new Set([...(b ? volBrigadeWorkers(b) : []), ...(VEX.extra || [])])];
  return { workers: ids.join(','), machine: VEX.machine || (b && b.machine_id) || '', brigade: b ? b.id : '' };
}
function volExecLabel() {
  const b = volBrigade(VEX.brigade), ex = (VEX.extra || []).map(id => ((pgkWorkers || []).find(w => w.id === id) || {}).name).filter(Boolean);
  const parts = []; if (b) parts.push(`👥 ${b.name} (${volBrigadeWorkers(b).length} чел.)`);
  if (ex.length) parts.push((b ? '+ ' : '👤 ') + (ex.length > 2 ? `${ex.slice(0, 2).join(', ')} и ещё ${ex.length - 2}` : ex.join(', ')));
  return parts.join(' ') || '— не выбраны —';
}
function _vexSave() { try { localStorage.setItem('vl_exec', JSON.stringify({ brigade: VEX.brigade, extra: VEX.extra, machine: VEX.machine })); } catch (e) {} if (VMK.on) _vmkBar(); }
// запомнить исполнителей из окна: бригада + те, кто сверх бригады
function volExecRemember(o) {
  const b = volBrigade(o.brigade), bw = new Set(b ? volBrigadeWorkers(b) : []);
  VEX.brigade = b ? b.id : '';
  VEX.extra = String(o.workers || '').split(',').filter(id => id && !bw.has(id));
  VEX.machine = o.machine && (!b || o.machine !== b.machine_id) ? o.machine : '';
  _vexSave();
}
// в окне: выбрали бригаду — отметить её людей (кроме водителя) и машину
function _vdBrigade(id) {
  const b = volBrigade(id), ids = new Set(b ? volBrigadeWorkers(b) : []);
  document.querySelectorAll('#f-vpworkers .vpw-cb').forEach(c => { if (b) c.checked = ids.has(c.value); });
  if (b && b.machine_id) { const m = document.getElementById('vd-mach'); if (m) m.value = b.machine_id; }
  _vpwUpdateCount();
}
// окно «Кто выполняет»: бригада, люди, техника — для быстрых отметок
async function volExecEdit() {
  await volBrigades(true);
  const cur = volExecNow();
  showModal('👥 Кто выполняет', `<div class="vl-form">
    <div class="vl-hint">Эти исполнители подставляются в «✅ Выполнить», выделение областью и режим отметки на карте.</div>
    <div class="fg"><label>Бригада</label><select id="vd-brig" onchange="_vdBrigade(this.value)"><option value="">— без бригады —</option>${VEX.list.map(b => `<option value="${escAttr(b.id)}" ${b.id === VEX.brigade ? 'selected' : ''}>${esc(b.name)} — ${volBrigadeWorkers(b).length} чел.${b.machine_name ? ' · ' + esc(b.machine_name) : ''}</option>`).join('')}</select>
      ${!VEX.list.length ? '<div class="vl-hint">Бригад пока нет — создайте на вкладке «Бригады» (машина, состав).</div>' : ''}</div>
    <div class="fg"><label>Исполнители</label>${_buildWorkerSelectHtml(cur.workers)}</div>
    <div class="fg"><label>Техника</label><select id="vd-mach"><option value="">— не выбрана —</option>${(pgkMachinery || []).map(x => `<option value="${escAttr(x.id)}" ${x.id === cur.machine ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
  </div>`, [{ label: '✕ Сбросить', cls: 'bs', fn: () => { VEX.brigade = ''; VEX.extra = []; VEX.machine = ''; _vexSave(); closeModal(); toast('Исполнители сброшены', 'ok'); } },
    { label: 'Отмена', cls: 'bs', fn: closeModal },
    { label: '💾 Готово', cls: 'bp', fn: () => { volExecRemember({ brigade: document.getElementById('vd-brig').value, workers: _vpwSelected().ids, machine: document.getElementById('vd-mach').value }); closeModal(); toast('Исполнители: ' + volExecLabel(), 'ok'); } }]);
}
const volBrigName = id => (volBrigade(id) || {}).name || '';

// ═══ Режим «✅ Отметка выполнения» на карте ═════════════════════════════
// Щелчок по объекту слоя-объёма — выполнено / снять (с текущими исполнителями
// и датой), Shift+щелчок или «спрашивать» — окно с параметрами. Esc — выход.
const VMK = { on: false, layer: null, ask: false, date: '', n: 0 };
const volMarkActive = layerId => VMK.on && !!volByLayer(layerId) && (!VMK.layer || VMK.layer === layerId);
async function volMarkStart(layerId) {
  await volBrigades();
  VMK.on = true; VMK.layer = layerId || null; VMK.n = 0;
  if (typeof switchView === 'function' && document.querySelector('.nt.on')?.dataset.v !== 'map') switchView('map');
  if (layerId) { const l = (layers || []).find(x => x.id === layerId); if (l && !l.visible) await kmlToggleVis(l.id, 1); }
  try { closeModal(); } catch (e) {}
  _vmkBar();
  document.addEventListener('keydown', _vmkKey, true);
  map.getContainer().classList.add('vmk-on');
}
function volMarkStop() {
  VMK.on = false; document.getElementById('vmk-bar')?.remove();
  document.removeEventListener('keydown', _vmkKey, true);
  map.getContainer().classList.remove('vmk-on');
  if (VMK.n) toast(`✅ Отмечено за сеанс: ${VMK.n}`, 'ok');
}
function _vmkKey(e) { if (e.key === 'Escape' && !document.getElementById('mov')?.classList.contains('open')) { e.stopImmediatePropagation(); volMarkStop(); } }
function _vmkBar() {
  let b = document.getElementById('vmk-bar');
  if (!b) { b = document.createElement('div'); b.id = 'vmk-bar'; document.body.appendChild(b); }
  const v = VMK.layer ? volByLayer(VMK.layer) : null;
  b.innerHTML = `<b>✅ Отметка выполнения</b>${v ? `<span class="vmk-v">${esc(v.name)}</span>` : '<span class="vmk-v">все объёмы</span>'}
    <span class="vmk-ex" onclick="volExecEdit()" title="Изменить бригаду / людей">${esc(volExecLabel())} ✏️</span>
    <label title="Дата выполнения">📅 <input type="date" value="${escAttr(VMK.date || _vlToday())}" onchange="VMK.date=this.value===_vlToday()?'':this.value"></label>
    <label title="Каждый щелчок — окно (факт. глубина и т.п.)"><input type="checkbox" ${VMK.ask ? 'checked' : ''} onchange="VMK.ask=this.checked"> спрашивать факт</label>
    <span class="vmk-n">${VMK.n ? '+' + VMK.n : ''}</span>
    <button onclick="volMarkStop()" title="Esc">✕ Готово</button>
    <div class="vmk-hint">щелчок по объекту — выполнено / снять · Shift+щелчок — с параметрами · Esc — выход</div>`;
}
async function volMarkClick(layerId, fIdx, oe) {
  if (VMK.ask || (oe && oe.shiftKey)) { await volDoneDialog(layerId, [fIdx], () => { VMK.n++; _vmkBar(); }); return; }
  const l = (layers || []).find(x => x.id === layerId); if (!l) return;
  let gj; try { gj = JSON.parse(l.geojson); } catch (e) { return; }
  const feats = gj.type === 'FeatureCollection' ? gj.features : [gj];
  const f = feats[fIdx]; if (!f) return;
  const p = f.properties = f.properties || {};
  const was = kmlIsDone(p);
  if (was) _vlClearDone(p); else { _vlSetDone(p, Object.assign(volExecNow(), { date: VMK.date || _vlToday() })); delete p._skip; }
  VMK.n += was ? -1 : 1; if (VMK.n < 0) VMK.n = 0; _vmkBar();
  try { await _vlSaveLayer(l, gj, was ? '↩️ Снято' : '✅ ' + (p.name || p.Name || 'Выполнено')); } catch (e) { toast('Ошибка сохранения', 'err'); }
}
setTimeout(() => volBrigades(), 1500);

// ═══ Участок линии: выполнено 10 км из 100 ══════════════════════════════
// ПКМ по линии → «📏 Выполнен участок…»: щёлкните начало и конец участка на
// линии (точки прилипают к линии). Линия делится на части: участок — выполнен
// (с датой и исполнителями), остальное — как было. Длина считается по частям,
// поэтому в объёме сразу «10 / 100 км». «✂ Разрезать здесь» — просто поделить.
const VSEG = { on: false, layerId: null, fIdx: -1, pts: [], tmp: null, mk: [] };
// [lng,lat] ↔ L.latLng; проекция точки на ломаную: {i, t, s(м от начала), ll}
function _vsegProject(coords, ll) {
  const P = c => map.latLngToLayerPoint([c[1], c[0]]), q = map.latLngToLayerPoint(ll);
  let best = null, acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = P(coords[i - 1]), b = P(coords[i]), dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    let t = L2 ? ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    const x = a.x + t * dx, y = a.y + t * dy, d = Math.hypot(q.x - x, q.y - y);
    const segM = map.distance([coords[i - 1][1], coords[i - 1][0]], [coords[i][1], coords[i][0]]);
    if (!best || d < best.d) best = { i, t, d, s: acc + t * segM, ll: [coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]), coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1])] };
    acc += segM;
  }
  return best;
}
// разрезать ломаную по проекциям (по возрастанию) → массив кусков координат
function _vsegCut(coords, cuts) {
  const out = []; let cur = [coords[0]], ci = 0;
  cuts = cuts.slice().sort((a, b) => a.s - b.s);
  for (let i = 1; i < coords.length; i++) {
    while (ci < cuts.length && cuts[ci].i === i) { cur.push(cuts[ci].ll); out.push(cur); cur = [cuts[ci].ll]; ci++; }
    cur.push(coords[i]);
  }
  out.push(cur);
  // выкинуть вырожденные куски (точка на вершине / в самом начале или конце)
  return out.map(c => c.filter((p, k) => !k || p[0] !== c[k - 1][0] || p[1] !== c[k - 1][1])).filter(c => c.length >= 2);
}
// куски с положением вдоль линии: [{c, s0, s1}] (м от начала)
function _vsegPieces(coords, cuts) {
  const D = (p, q) => map.distance([p[1], p[0]], [q[1], q[0]]);
  let acc = 0;
  return _vsegCut(coords, cuts).map(c => { const len = c.reduce((t, q, k) => k ? t + D(c[k - 1], q) : 0, 0); const r = { c, s0: acc, s1: acc + len }; acc += len; return r; });
}
function _vsegLine(layerId, fIdx) {
  const l = (layers || []).find(x => x.id === layerId); if (!l) return null;
  let gj; try { gj = JSON.parse(l.geojson); } catch (e) { return null; }
  const feats = gj.type === 'FeatureCollection' ? gj.features : [gj], f = feats[fIdx];
  if (!f || !f.geometry || f.geometry.type !== 'LineString') return null;
  return { l, gj, feats, f };
}
function volSegStart(layerId, fIdx, splitOnly) {
  const x = _vsegLine(layerId, fIdx);
  if (!x) { toast('Это не линия (для мультилиний — сначала разбейте на части)', 'warn'); return; }
  _vsegStop();
  Object.assign(VSEG, { on: true, layerId, fIdx, pts: [], split: !!splitOnly });
  const tot = x.f.geometry.coordinates.reduce((s, c, i, a) => i ? s + map.distance([a[i - 1][1], a[i - 1][0]], [c[1], c[0]]) : 0, 0);
  VSEG.total = tot;
  VSEG.hl = L.polyline(x.f.geometry.coordinates.map(c => [c[1], c[0]]), { color: '#0ea5e9', weight: 9, opacity: 0.35, interactive: false }).addTo(map);
  map.getContainer().style.cursor = 'crosshair';
  map.on('click', _vsegClick); map.on('mousemove', _vsegMove);
  document.addEventListener('keydown', _vsegKey, true);
  const bnr = document.getElementById('bnr');
  if (bnr) { bnr.className = 'show draw'; const t = document.getElementById('bnr-t'); if (t) t.textContent = splitOnly ? '✂ Щёлкните на линии место разреза · Esc — отмена' : `📏 Участок: щёлкните НАЧАЛО на линии (длина линии ${_vlN(tot / 1000)} км) · Esc — отмена`; }
}
function _vsegStop() {
  map.off('click', _vsegClick); map.off('mousemove', _vsegMove);
  document.removeEventListener('keydown', _vsegKey, true);
  [VSEG.tmp, VSEG.hl, ...VSEG.mk].forEach(x => { if (x) try { map.removeLayer(x); } catch (e) {} });
  Object.assign(VSEG, { on: false, tmp: null, hl: null, mk: [], pts: [] });
  map.getContainer().style.cursor = '';
  const bnr = document.getElementById('bnr'); if (bnr) bnr.className = '';
}
function _vsegKey(e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); _vsegStop(); toast('Отменено', 'ok'); } }
function _vsegMove(e) {
  if (!VSEG.on || !VSEG.pts.length) return;
  const x = _vsegLine(VSEG.layerId, VSEG.fIdx); if (!x) return;
  const p = _vsegProject(x.f.geometry.coordinates, e.latlng);
  const a = Math.min(VSEG.pts[0].s, p.s), b = Math.max(VSEG.pts[0].s, p.s);
  const mid = (_vsegPieces(x.f.geometry.coordinates, [VSEG.pts[0], p]).find(r => r.s0 >= a - 1 && r.s1 <= b + 1 && r.s1 - r.s0 > 0.5) || { c: [] }).c;
  if (VSEG.tmp) map.removeLayer(VSEG.tmp);
  VSEG.tmp = L.polyline(mid.map(c => [c[1], c[0]]), { color: '#16a34a', weight: 7, opacity: 0.9, interactive: false }).addTo(map);
  VSEG.tmp.bindTooltip(`${_vlN((b - a) / 1000)} км`, { permanent: true, direction: 'top', className: 'lm-tip' }).openTooltip(e.latlng);
}
function _vsegClick(e) {
  if (!VSEG.on) return;
  const x = _vsegLine(VSEG.layerId, VSEG.fIdx); if (!x) { _vsegStop(); return; }
  const p = _vsegProject(x.f.geometry.coordinates, e.latlng);
  VSEG.mk.push(L.circleMarker([p.ll[1], p.ll[0]], { radius: 7, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1, interactive: false }).addTo(map));
  VSEG.pts.push(p);
  if (VSEG.split) { const cut = VSEG.pts.slice(); _vsegStop(); _vsegApply(cut, null); return; }
  if (VSEG.pts.length === 1) { const t = document.getElementById('bnr-t'); if (t) t.textContent = '📏 Теперь щёлкните КОНЕЦ участка · Esc — отмена'; return; }
  const [p1, p2] = VSEG.pts, len = Math.abs(p2.s - p1.s);
  const lid = VSEG.layerId, fi = VSEG.fIdx, cut = [p1, p2];
  map.off('click', _vsegClick); map.off('mousemove', _vsegMove);
  showModal(`📏 Выполнен участок — ${_vlN(len / 1000)} км`, `<div class="vl-form">
    <div class="vl-hint">Линия будет разделена: участок <b>${_vlN(len / 1000)} км</b> — выполнен, остальное (${_vlN((VSEG.total - len) / 1000)} км) — как было.</div>
    <div class="fg"><label>Дата выполнения</label><input id="vs-date" type="date" value="${_vlToday()}"></div>
    <div class="vl-exec" onclick="volExecEdit()">Исполнители: <b>${esc(volExecLabel())}</b> ✏️</div>
    <div class="fg"><label>Примечание</label><input id="vs-note"></div>
  </div>`, [{ label: 'Отмена', cls: 'bs', fn: () => { closeModal(); _vsegStop(); } },
    { label: '✂ Только разрезать', cls: 'bs', fn: () => { closeModal(); _vsegStop(); _vsegApply(cut, null); } },
    { label: '✅ Участок выполнен', cls: 'bp', fn: () => { const o = Object.assign(volExecNow(), { date: document.getElementById('vs-date').value || _vlToday(), note: document.getElementById('vs-note').value.trim() }); closeModal(); _vsegStop(); _vsegApply(cut, o, lid, fi); } }]);
  VSEG.layerId = lid; VSEG.fIdx = fi;
}
// разрезать линию; если o задан — средний (между двумя точками) кусок выполнен
async function _vsegApply(cut, o, lid, fi) {
  lid = lid || VSEG.layerId; fi = fi == null ? VSEG.fIdx : fi;
  const x = _vsegLine(lid, fi); if (!x) return;
  const coords = x.f.geometry.coordinates;
  const parts = _vsegPieces(coords, cut);
  if (parts.length < 2 && !(o && parts.length === 1)) { toast('Точки совпали с концами линии — делить нечего', 'warn'); return; }
  const a = Math.min(...cut.map(c => c.s)), b = Math.max(...cut.map(c => c.s));
  const base = x.f.properties || {};
  const st = (typeof kmlStyleOf === 'function' && kmlStyleOf(x.l)) || {}, pkG = s => (+st.pkStart || 0) + (+base._pk0 || 0) + s;
  if (o && cut.length === 2 && typeof pkFmt === 'function') o = Object.assign({}, o, { note: [o.note, `${pkFmt(pkG(a))} — ${pkFmt(pkG(b))}`].filter(Boolean).join(' · ') });
  const pieces = parts.map((r, k) => {
    const p = JSON.parse(JSON.stringify(base));
    if (k > 0) { delete p._uid; }              // новый кусок — новый постоянный id (сервер выдаст)
    p._pk0 = (+base._pk0 || 0) + r.s0;          // место куска на всей трассе — для пикетажа
    if (!p._pk0) delete p._pk0;
    const inside = o && cut.length === 2 && r.s0 >= a - 1 && r.s1 <= b + 1;
    if (inside) { _vlSetDone(p, o); delete p._skip; }
    else if (o && p._done) { /* остальное — как было */ }
    return { type: 'Feature', properties: p, geometry: { type: 'LineString', coordinates: r.c } };
  });
  x.feats.splice(fi, 1, ...pieces);
  try { await _vlSaveLayer(x.l, x.gj, o ? `✅ Участок ${_vlN((b - a) / 1000)} км выполнен` : `✂ Линия разделена на ${pieces.length} части`); }
  catch (e) { toast('Ошибка сохранения', 'err'); }
}

// Участок по пикетам: «с ПК12+50 по ПК35» — без щелчков по карте
function _vsegAt(coords, sl) {
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = map.distance([coords[i - 1][1], coords[i - 1][0]], [coords[i][1], coords[i][0]]);
    if (acc + d >= sl || i === coords.length - 1) { const t = d ? Math.max(0, Math.min(1, (sl - acc) / d)) : 0;
      return { i, t, s: Math.min(sl, acc + d), ll: [coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]), coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1])] }; }
    acc += d;
  }
}
function volSegByPk(layerId, fIdx) {
  const x = _vsegLine(layerId, fIdx); if (!x) { toast('Это не линия', 'warn'); return; }
  const st = (typeof kmlStyleOf === 'function' && kmlStyleOf(x.l)) || {}, c = x.f.geometry.coordinates;
  const len = c.reduce((t, q, k) => k ? t + map.distance([c[k - 1][1], c[k - 1][0]], [q[1], q[0]]) : 0, 0);
  const g0 = (+st.pkStart || 0) + (+(x.f.properties || {})._pk0 || 0);
  showModal('📏 Выполнен участок по пикетам', `<div class="vl-form">
    <div class="vl-hint">Эта линия: <b>${pkFmt(g0)} — ${pkFmt(g0 + len)}</b> (${_vlN(len / 1000)} км). ПК — 100 м. Можно писать «12+50», «ПК35», «1250 м», «3,5 км».</div>
    <div class="fgr"><div class="fg"><label>С пикета</label><input id="vp-a" value="${escAttr(pkFmt(g0))}"></div>
      <div class="fg"><label>По пикет</label><input id="vp-b" placeholder="ПК35"></div></div>
    <div id="vp-len" class="vl-hint"></div>
    <div class="fg"><label>Дата выполнения</label><input id="vs-date" type="date" value="${_vlToday()}"></div>
    <div class="vl-exec" onclick="volExecEdit()">Исполнители: <b>${esc(volExecLabel())}</b> ✏️</div>
    <div class="fg"><label>Примечание</label><input id="vs-note"></div>
  </div>`, [{ label: 'Отмена', cls: 'bs', fn: closeModal }, { label: '✅ Участок выполнен', cls: 'bp', fn: () => {
    let A = pkParse(document.getElementById('vp-a').value), B = pkParse(document.getElementById('vp-b').value);
    if (A == null || B == null) { toast('Пикеты: например 12+50 и 35', 'warn'); return; }
    if (A > B) [A, B] = [B, A];
    const a = Math.max(0, A - g0), b = Math.min(len, B - g0);
    if (b - a < 0.5) { toast(`Участок вне линии (${pkFmt(g0)} — ${pkFmt(g0 + len)})`, 'warn'); return; }
    if (A < g0 - 0.5 || B > g0 + len + 0.5) toast('Часть участка за пределами этой линии — отмечено до её конца', 'warn');
    const o = Object.assign(volExecNow(), { date: document.getElementById('vs-date').value || _vlToday(), note: document.getElementById('vs-note').value.trim() });
    closeModal();
    _vsegApply([_vsegAt(c, a), _vsegAt(c, b)], o, layerId, fIdx);
  } }]);
  const upd = () => { const A = pkParse(document.getElementById('vp-a').value), B = pkParse(document.getElementById('vp-b').value), el = document.getElementById('vp-len');
    if (el) el.textContent = A != null && B != null ? `Длина участка: ${_vlN(Math.abs(B - A) / 1000)} км` : ''; };
  ['vp-a', 'vp-b'].forEach(id => document.getElementById(id).addEventListener('input', upd));
}
