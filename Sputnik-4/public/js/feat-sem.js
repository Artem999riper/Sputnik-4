// ═══════════════════════════════════════════════════════════
// feat-sem.js — характеристики (семантика) объектов слоя-объёма: тип точки
// (скважина, шурф, пункт ГГС/ОГС, репер, марка, уголок…) и её данные —
// глубина, диаметр, отметка устья, УГВ, ММГ, дата бурения, бурильщик, разрез.
// Хранятся обычными атрибутами объекта с русскими именами («тип», «глубина»,
// «УГВ»…) — как при переносе старых объёмов, поэтому видны в таблице атрибутов,
// подписях, выгрузках KML/DXF/Excel и годятся как поле второго показателя.
// Открывается: ПКМ по объекту → «🏷 Характеристики…», меню выделенного,
// кнопка в окне «Выполнить с параметрами».
// ═══════════════════════════════════════════════════════════
const FSEM_TYPES = {
  borehole:    { icon: '⚫', label: 'Скважина', drill: true },
  pit:         { icon: '🟤', label: 'Шурф', drill: true },
  ggs:         { icon: '🔺', label: 'Пункт ГГС' },
  ogs:         { icon: '🔵', label: 'Пункт ОГС' },
  repere:      { icon: '📍', label: 'Репер' },
  benchmark:   { icon: '🗿', label: 'Марка' },
  steel_angle: { icon: '📐', label: 'Металлический уголок' },
  other:       { icon: '📌', label: 'Другое' },
};
// поля: k — имя атрибута, t — n (число) / d (дата) / s (строка) / x (многострочный)
const FSEM_FIELDS = [
  { k: 'глубина',       l: 'Глубина, м',            t: 'n', drill: true },
  { k: 'диаметр',       l: 'Диаметр, мм',           t: 'n', drill: true },
  { k: 'отметка устья', l: 'Отметка устья, м',      t: 'n', drill: true },
  { k: 'УГВ',           l: 'УГВ появившийся, м',    t: 's', drill: true, ph: 'не встречен' },
  { k: 'УГВ уст.',      l: 'УГВ установившийся, м', t: 's', drill: true },
  { k: 'ММГ',           l: 'Кровля ММГ, м',         t: 's', drill: true, ph: 'не встречены' },
  { k: 'дата бурения',  l: 'Дата бурения',          t: 'd', drill: true },
  { k: 'бурильщик',     l: 'Бурильщик / исполнитель', t: 's', drill: true },
  { k: 'разрез',        l: 'Описание разреза (ИГЭ, литология)', t: 'x', drill: true, ph: '0,0–0,3 почвенно-растительный слой; 0,3–2,5 суглинок тугопластичный…' },
  { k: 'примечание',    l: 'Примечание',            t: 'x', ph: 'Номер пункта, класс, год закладки, сохранность…' },
];
const _fsemTypeKey = p => { const t = String((p && p['тип']) || '').trim().toLowerCase(); return Object.keys(FSEM_TYPES).find(k => FSEM_TYPES[k].label.toLowerCase() === t) || (t ? 'other' : ''); };
// тип по умолчанию: геология — скважина, иначе — по названию объекта
function _fsemDefType(v, p) {
  const nm = String((p && (p.name || p.Name)) || '').toLowerCase();
  if (/^\s*(шурф|ш-|пт-)/.test(nm)) return 'pit';
  if (/ггс/.test(nm)) return 'ggs';
  if (/огс/.test(nm)) return 'ogs';
  if (/репер|рп-/.test(nm)) return 'repere';
  if (v && v.category === 'geology') return 'borehole';
  return '';
}
// краткая строка для подсказки на карте
function featSemLine(p) {
  if (!p) return '';
  const t = p['тип'] ? String(p['тип']) : '', out = [];
  if (p['глубина'] != null && p['глубина'] !== '') out.push(`гл. ${p['глубина']} м`);
  if (p['УГВ'] != null && p['УГВ'] !== '') out.push(`УГВ ${p['УГВ']}`);
  if (p['ММГ'] != null && p['ММГ'] !== '') out.push(`ММГ ${p['ММГ']}`);
  if (p['дата бурения']) out.push(fmt(p['дата бурения']));
  return t || out.length ? `🏷 ${esc(t)}${t && out.length ? ': ' : ''}${esc(out.join(' · '))}` : '';
}

// targets: [{layerId, idxs:[…]}] либо (layerId, idx)
function featSemDialog(layerId, idx) {
  const targets = Array.isArray(layerId) ? layerId : [{ layerId, idxs: [idx] }];
  const n = targets.reduce((s, t) => s + t.idxs.length, 0); if (!n) return;
  const l0 = (layers || []).find(x => x.id === targets[0].layerId); if (!l0) return;
  const v = typeof volByLayer === 'function' ? volByLayer(l0.id) : null, m = v ? volMeasure(v) : null;
  const f0 = n === 1 ? _kaFeatures(l0)[targets[0].idxs[0]] : null, p0 = (f0 && f0.properties) || {};
  const multi = n > 1;
  const cur = _fsemTypeKey(p0) || (multi ? '' : _fsemDefType(v, p0));
  const nm = f0 ? (p0.name || p0.Name || `Объект ${targets[0].idxs[0] + 1}`) : `${n} объект(ов)`;
  // поле «глубина» служит планом второго показателя объёма — подсказать
  const depthIsPlan = m && m.second && m.second.source === 'field' && m.second.field === 'глубина';
  const val = k => p0[k] != null ? String(p0[k]) : k === 'дата бурения' && p0._done_date ? String(p0._done_date).slice(0, 10) : '';   // дата бурения — по умолчанию дата выполнения
  const fld = f => {
    const id = 'fs-' + FSEM_FIELDS.indexOf(f), ph = multi ? 'не менять' : (f.ph || '');
    const lbl = f.l + (f.k === 'глубина' && depthIsPlan ? ' <small style="color:var(--acc)">(план п.м. объёма)</small>' : '');
    const inp = f.t === 'x' ? `<textarea id="${id}" rows="${f.k === 'разрез' ? 4 : 2}" placeholder="${escAttr(ph)}">${esc(multi ? '' : val(f.k))}</textarea>`
      : `<input id="${id}" ${f.t === 'n' ? 'type="text" inputmode="decimal"' : f.t === 'd' ? 'type="date"' : ''} value="${escAttr(multi ? '' : val(f.k))}" placeholder="${escAttr(ph)}">`;
    return `<div class="fg ${f.t === 'x' || f.k === 'бурильщик' ? 's2' : ''}" data-drill="${f.drill ? 1 : 0}"><label>${lbl}</label>${inp}</div>`;
  };
  const fact2 = m && m.second && !multi && p0._done ? `<div class="fg"><label>Факт, ${esc(m.second.unit || '')} (в объём)</label><input id="fs-f2" inputmode="decimal" value="${escAttr(p0._fact2 != null ? p0._fact2 : '')}" placeholder="${escAttr(String(volPlan2Of(f0, m) || ''))}"></div>` : '';
  showModal(`🏷 Характеристики — ${esc(nm)}`, `<div class="vl-form" style="min-width:min(520px,88vw)">
    ${v ? `<div class="vl-hint">Объём «${esc(v.name)}»${v.site_name ? ` · ${esc(v.site_name)}` : ''}${multi ? ` · заполненные поля запишутся всем ${n} объектам, пустые — не изменятся` : ''}</div>` : ''}
    <div class="fg"><label>Тип объекта</label><div class="fsem-types" id="fs-types">
      ${Object.entries(FSEM_TYPES).map(([k, t]) => `<button type="button" data-k="${k}" class="${cur === k ? 'on' : ''}" onclick="_fsemPick('${k}')">${t.icon} ${t.label}</button>`).join('')}
      ${multi ? `<button type="button" data-k="" class="${cur ? '' : 'on'}" onclick="_fsemPick('')">не менять</button>` : ''}
    </div></div>
    <div class="fsem-grid">${FSEM_FIELDS.map(fld).join('')}${fact2}</div>
    ${!multi && f0 && f0.geometry && f0.geometry.type === 'Point' && f0.geometry.coordinates[2] && !p0['отметка устья'] ? `<div class="vl-hint">В координатах точки есть высота ${(+f0.geometry.coordinates[2]).toFixed(2)} м — <a href="#" onclick="event.preventDefault();document.getElementById('fs-2').value='${(+f0.geometry.coordinates[2]).toFixed(2)}'">подставить как отметку устья</a></div>` : ''}
  </div>`, [
    { label: 'Отмена', cls: 'bs', fn: closeModal },
    ...(!multi && Object.keys(p0).some(k => FSEM_FIELDS.some(f => f.k === k) || k === 'тип') ? [{ label: '🧹 Очистить', cls: 'bs', fn: () => _fsemSave(targets, true) }] : []),
    { label: '💾 Сохранить', cls: 'bp', fn: () => _fsemSave(targets) },
  ]);
  FSEM_CUR = cur; _fsemPick(cur);
}
let FSEM_CUR = '';
function _fsemPick(k) {
  FSEM_CUR = k;
  document.querySelectorAll('#fs-types button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  // поля бурения — только для скважины/шурфа (и «не менять» при групповой правке)
  const drill = !k || (FSEM_TYPES[k] && FSEM_TYPES[k].drill);
  document.querySelectorAll('.fsem-grid [data-drill="1"]').forEach(e => { e.style.display = drill ? '' : 'none'; });
}
async function _fsemSave(targets, clear) {
  const multi = targets.reduce((s, t) => s + t.idxs.length, 0) > 1;
  const drill = !FSEM_CUR || (FSEM_TYPES[FSEM_CUR] && FSEM_TYPES[FSEM_CUR].drill);
  const vals = {}; let bad = null;
  FSEM_FIELDS.forEach((f, i) => {
    const e = document.getElementById('fs-' + i); if (!e) return;
    let s = String(e.value || '').trim();
    if (f.drill && !drill) { if (!multi) vals[f.k] = null; return; }   // не скважина — поля бурения убрать
    if (!s) { if (!multi) vals[f.k] = null; return; }
    if (f.t === 'n') { const x = parseFloat(s.replace(',', '.').replace(/\s/g, '')); if (!isFinite(x)) { bad = bad || f.l; return; } s = x; }
    else if (/^УГВ|^ММГ/.test(f.k) && /^-?\d+([.,]\d+)?$/.test(s)) s = parseFloat(s.replace(',', '.'));
    vals[f.k] = s;
  });
  if (bad && !clear) { toast(`«${bad}» — нужно число`, 'err'); return; }
  const f2el = document.getElementById('fs-f2');
  const f2 = f2el ? String(f2el.value || '').trim() : null;
  closeModal();
  let cnt = 0;
  for (const t of targets) {
    const l = (layers || []).find(x => x.id === t.layerId); if (!l) continue;
    let gj; try { gj = JSON.parse(l.geojson); } catch (e) { continue; }
    const feats = gj.type === 'FeatureCollection' ? gj.features : [gj];
    t.idxs.forEach(i => {
      const f = feats[i]; if (!f) return;
      const p = f.properties = f.properties || {};
      if (clear) { delete p['тип']; FSEM_FIELDS.forEach(x => delete p[x.k]); cnt++; return; }
      if (FSEM_CUR) p['тип'] = FSEM_TYPES[FSEM_CUR].label; else if (!multi) delete p['тип'];
      Object.entries(vals).forEach(([k, x]) => { if (x == null) delete p[k]; else p[k] = x; });
      if (f2 != null) { if (f2 === '') delete p._fact2; else { const x = parseFloat(f2.replace(',', '.')); if (isFinite(x)) p._fact2 = x; } }
      cnt++;
    });
    try { await _vlSaveLayer(l, gj, clear ? '🧹 Характеристики очищены' : `🏷 Характеристики сохранены${cnt > 1 ? ` (${cnt})` : ''}`); } catch (e) { toast('Ошибка сохранения', 'err'); }
  }
}

// ═══ Заготовки описания разреза (свои у каждого объекта, app_settings sec_tpl_<объект>) ═══
const FSEM_TPL = { key: '', list: [] };
async function _fsemTplLoad(siteId) {
  FSEM_TPL.key = 'sec_tpl_' + (siteId || 'all'); FSEM_TPL.list = [];
  try { const j = await fetch(`${API}/app-settings/${encodeURIComponent(FSEM_TPL.key)}`).then(r => r.json()); FSEM_TPL.list = Array.isArray(j && j.value) ? j.value : []; } catch (e) {}
  _fsemTplRender();
}
async function _fsemTplSave() {
  try { await fetch(`${API}/app-settings/${encodeURIComponent(FSEM_TPL.key)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: FSEM_TPL.list }) }); } catch (e) { toast('Заготовки не сохранились', 'err'); }
}
function _fsemTplRender() {
  const el = document.getElementById('fs-tpl'); if (!el) return;
  el.innerHTML = FSEM_TPL.list.map((t, i) => `<span class="fsem-chip" title="Вставить: ${escAttr(t)}" onclick="_fsemTplIns(${i})">${esc(t.length > 42 ? t.slice(0, 40) + '…' : t)}<b onclick="event.stopPropagation();_fsemTplDel(${i})" title="Убрать заготовку">×</b></span>`).join('')
    + `<button type="button" class="fsem-chip add" onclick="_fsemTplAdd()" title="Выделите часть текста разреза (или оставьте курсор в строке) и нажмите — она станет заготовкой этого объекта">＋ в заготовки</button>`;
}
function _fsemTplIns(i) {
  const ta = document.getElementById('fs-8'), t = FSEM_TPL.list[i]; if (!ta || t == null) return;
  const a = ta.selectionStart != null ? ta.selectionStart : ta.value.length, b = ta.selectionEnd != null ? ta.selectionEnd : a;
  const before = ta.value.slice(0, a), sep = before && !/[\n;]\s*$/.test(before) ? '\n' : '';
  ta.value = before + sep + t + ta.value.slice(b);
  const pos = (before + sep + t).length; ta.focus(); ta.setSelectionRange(pos, pos);
}
function _fsemTplAdd() {
  const ta = document.getElementById('fs-8'); if (!ta) return;
  let t = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
  if (!t) { const a = ta.selectionStart || 0, s = ta.value.lastIndexOf('\n', a - 1) + 1, e = ta.value.indexOf('\n', a); t = ta.value.slice(s, e < 0 ? undefined : e).trim(); }
  if (!t) { toast('Напишите или выделите текст слоя в описании разреза', 'warn'); return; }
  if (FSEM_TPL.list.includes(t)) { toast('Такая заготовка уже есть', 'warn'); return; }
  FSEM_TPL.list.push(t); _fsemTplRender(); _fsemTplSave(); toast('Заготовка добавлена', 'ok');
}
function _fsemTplDel(i) { FSEM_TPL.list.splice(i, 1); _fsemTplRender(); _fsemTplSave(); }
(function () {
  // окно характеристик: после открытия — подгрузить заготовки объекта
  const o = featSemDialog;
  window.featSemDialog = featSemDialog = function (layerId) {
    const r = o.apply(this, arguments);
    const t0 = Array.isArray(layerId) ? layerId[0] : { layerId };
    const v = t0 && typeof volByLayer === 'function' ? volByLayer(t0.layerId) : null;
    const ta = document.getElementById('fs-8');
    if (ta && !document.getElementById('fs-tpl')) { const d = document.createElement('div'); d.id = 'fs-tpl'; d.className = 'fsem-tpl'; ta.after(d); }
    _fsemTplLoad(v && v.site_id);
    return r;
  };
})();

// ═══ Условные знаки по типу (если у объекта нет своего значка) ═══
const FSEM_SYM = { pit: { sym: 'pit', color: '#92400e' }, ggs: { sym: 'triangle_up', color: '#e02424' }, ogs: { sym: 'station', color: '#1a56db' },
  repere: { sym: 'benchmark', color: '#7c3aed' }, benchmark: { sym: 'square', color: '#d97706' }, steel_angle: { sym: 'diamond', color: '#475569' } };
(function () {
  const go = () => {
    if (typeof kmlFeatureDivIcon !== 'function') return setTimeout(go, 300);
    const o = kmlFeatureDivIcon;
    window.kmlFeatureDivIcon = kmlFeatureDivIcon = function (l, p) {
      let q = p;
      const k = p && p['тип'] && !p._sym ? _fsemTypeKey(p) : '';
      if (k && FSEM_SYM[k]) {
        q = Object.assign({}, p, { _sym: FSEM_SYM[k].sym });
        if (!p._done && !p._skip && (!p._color || p._color === l.color)) q._color = FSEM_SYM[k].color;
      }
      const icon = o.call(this, l, q);
      // недобур / перебур — красный «!» у значка
      const dv = l && p && p._done ? featSemDev(l, p) : null;
      if (dv && icon.options && icon.options.html) {
        const sz = (icon.options.iconSize || [28, 28])[0];
        icon.options.html = `<div style="position:relative" title="${dv.d < 0 ? 'Недобур' : 'Перебур'} ${Math.abs(dv.d).toFixed(0)}%">${icon.options.html}<b style="position:absolute;right:-8px;top:-8px;background:#dc2626;color:#fff;border-radius:50%;width:14px;height:14px;font-size:10px;line-height:14px;text-align:center">!</b></div>`;
      }
      return icon;
    };
  };
  go();
})();

// ═══ Контроль: без характеристик, недобур / перебур ═══
const featSemTol = () => { const x = +(localStorage.getItem('drill_tol') || 10); return x > 0 ? x : 10; };
const _fsemHas = p => !!(p['тип'] || FSEM_FIELDS.some(f => f.k !== 'глубина' && p[f.k] != null && p[f.k] !== ''));
// отклонение факта от плана, %: {plan, fact, d} или null
function featSemDev(l, p) {
  const v = typeof volByLayer === 'function' ? volByLayer(l.id) : null; if (!v) return null;
  const m = volMeasure(v); if (!m || !m.second || p._fact2 == null || p._fact2 === '') return null;
  const plan = volPlan2Of({ properties: p }, m), fact = _vlNumLoose(p._fact2);
  if (!(plan > 0) || fact == null) return null;
  const d = (fact - plan) / plan * 100;
  return Math.abs(d) > featSemTol() + 1e-9 ? { plan, fact, d } : null;
}
// для слоя-объёма: {miss:[idx], under:[idx], over:[idx], on} — on: контроль характеристик включён
function featSemCheck(l, v) {
  const out = { miss: [], under: [], over: [], on: false };
  let fs; try { const gj = JSON.parse(l.geojson); fs = gj.features || []; } catch (e) { return out; }
  out.on = (v && v.category === 'geology') || fs.some(f => f && f.properties && f.properties['тип']);
  fs.forEach((f, i) => {
    const p = (f && f.properties) || {}; if (p._skip || !p._done) return;
    if (out.on && !_fsemHas(p)) out.miss.push(i);
    const dv = featSemDev(l, p); if (dv) (dv.d < 0 ? out.under : out.over).push(i);
  });
  return out;
}
// значки для строки объёма во вкладке «Объёмы»
function featSemBadges(l, v) {
  const c = featSemCheck(l, v), id = escAttr(l.id), b = [];
  if (c.miss.length) b.push(`<a href="#" class="fsem-warn" onclick="event.preventDefault();event.stopPropagation();featSemSelect('${id}','miss')" title="Выполнены, но характеристики не заполнены — выделить на карте">🏷 без характеристик: ${c.miss.length}</a>`);
  const m = v ? volMeasure(v) : null;
  if (m && m.second && !c.under.length && !c.over.length) b.push(`<a href="#" class="fsem-warn ok" onclick="event.preventDefault();event.stopPropagation();featSemDevList('${id}')" title="Факт в пределах ±${featSemTol()}% от плана — открыть список и допуск">✓ недобура / перебура нет</a>`);
  if (c.under.length || c.over.length) b.push(`<a href="#" class="fsem-warn red" onclick="event.preventDefault();event.stopPropagation();featSemDevList('${id}')" title="Факт отличается от плана больше чем на ${featSemTol()}%">⚠ ${c.under.length ? `недобур ${c.under.length}` : ''}${c.under.length && c.over.length ? ' · ' : ''}${c.over.length ? `перебур ${c.over.length}` : ''}</a>`);
  return b.length ? `<div class="fsem-badges">${b.join('')}</div>` : '';
}
// выделить объекты (Shift-выделение) и показать — дальше «Действия → Характеристики всем выделенным»
function featSemSelect(lid, kind, idxs) {
  const l = (layers || []).find(x => x.id === lid); if (!l) return;
  if (!idxs) { const c = featSemCheck(l, volByLayer(lid)); idxs = kind === 'miss' ? c.miss : c.under.concat(c.over); }
  if (!idxs.length) { toast('Таких объектов нет', 'ok'); return; }
  if (!lvis(l)) kmlToggleVis(lid, 1);
  KSEL.m.clear(); idxs.forEach(i => kselToggle(lid, i, true)); kselRender();
  try { const gj = JSON.parse(l.geojson), fs = idxs.map(i => gj.features[i]).filter(Boolean); const b = L.geoJSON({ type: 'FeatureCollection', features: fs }).getBounds(); if (b.isValid()) map.fitBounds(b.pad(0.3), { maxZoom: 16 }); } catch (e) {}
  toast(kind === 'miss' ? `Выделено без характеристик: ${idxs.length} — «⚙️ Действия → 🏷 Характеристики всем выделенным»` : `Выделено с отклонением: ${idxs.length}`, 'ok');
}
function featSemDevList(lid) {
  const l = (layers || []).find(x => x.id === lid); if (!l) return;
  const v = volByLayer(lid), m = v ? volMeasure(v) : null, u = (m && m.second && m.second.unit) || 'м';
  const c = featSemCheck(l, v), fs = _kaFeatures(l);
  const rows = c.under.concat(c.over).map(i => ({ i, p: fs[i].properties, dv: featSemDev(l, fs[i].properties) })).sort((a, b) => a.dv.d - b.dv.d);
  showModal(`⚠ Недобур / перебур — ${esc(v ? v.name : l.name)}`, `<div style="min-width:min(520px,88vw)">
    <div class="vl-hint" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">Допуск: ± <input id="fs-tol" type="number" min="1" max="100" step="1" value="${featSemTol()}" style="width:60px"> % от плана
      <button class="btn bs bxs" onclick="localStorage.setItem('drill_tol',document.getElementById('fs-tol').value);kmlInvalidateLayerCache();renderLayerGroups();try{renderKmlPanel()}catch(e){};featSemDevList('${escAttr(lid)}')">Применить</button></div>
    ${rows.length ? `<table class="ccat-t"><thead><tr><th>Объект</th><th>План, ${esc(u)}</th><th>Факт, ${esc(u)}</th><th>Откл.</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.p.name || r.p.Name || 'Объект ' + (r.i + 1))}</td><td class="n">${_vlN(r.dv.plan)}</td><td class="n">${_vlN(r.dv.fact)}</td>
        <td class="n" style="color:#dc2626;font-weight:700">${r.dv.d > 0 ? '+' : ''}${r.dv.d.toFixed(0)}% ${r.dv.d < 0 ? 'недобур' : 'перебур'}</td>
        <td style="white-space:nowrap"><button class="kml-icon-btn" onclick="closeModal();kmlZoomToFeature('${escAttr(lid)}',${r.i})" title="Показать">🔍</button><button class="kml-icon-btn" onclick="closeModal();featSemDialog('${escAttr(lid)}',${r.i})" title="Характеристики и факт">🏷</button><button class="kml-icon-btn" onclick="closeModal();volDoneDialog('${escAttr(lid)}',[${r.i}])" title="Изменить выполнение">⚙️</button></td></tr>`).join('')}
    </tbody></table>` : '<div class="vl-hint">При этом допуске отклонений нет.</div>'}</div>`,
    [{ label: 'Закрыть', cls: 'bs', fn: closeModal }, ...(rows.length ? [{ label: '⬚ Выделить на карте', cls: 'bp', fn: () => { closeModal(); featSemSelect(lid, 'dev', rows.map(r => r.i)); } }] : [])]);
}

// ═══ Ведомость выработок (Excel): по слою-объёму или по всем объёмам объекта ═══
function featSemReport(layerIds, title) {
  if (typeof XLSX === 'undefined') { toast('Excel недоступен', 'err'); return; }
  const src = [];
  layerIds.forEach(id => {
    const l = (layers || []).find(x => x.id === id); if (!l) return;
    const v = volByLayer(id), m = v ? volMeasure(v) : null;
    _kaFeatures(l).forEach((f, i) => { if (f && f.geometry && !(f.properties || {})._skip) src.push({ l, v, m, f, i }); });
  });
  if (!src.length) { toast('Нет объектов', 'warn'); return; }
  // координаты: МСК региона, одна зона — по центру всех объектов
  const first = f => { let c = f.geometry.coordinates; while (Array.isArray(c[0])) c = c[0]; return c; };
  const cLng = src.reduce((s, x) => s + +first(x.f)[0], 0) / src.length;
  const P = typeof _mgMskProj === 'function' ? _mgMskProj(cLng) : null;
  const xy = c => { if (!P) return ['', '']; const [e, n] = proj4('EPSG:4326', P.proj, [+c[0], +c[1]]); return [+n.toFixed(2), +e.toFixed(2)]; };
  const numOr = x => { const n = _vlNumLoose(x); return n != null && /^-?\d+([.,]\d+)?$/.test(String(x).trim()) ? n : (x == null ? '' : x); };
  const natural = (a, b) => String(a).localeCompare(String(b), 'ru', { numeric: true });
  src.sort((a, b) => natural(a.v ? a.v.name : '', b.v ? b.v.name : '') || natural((a.f.properties || {}).name || '', (b.f.properties || {}).name || ''));
  const head = ['№', 'Выработка', 'Тип', 'Объём', 'X, м', 'Y, м', 'Отметка устья, м', 'Глубина план, м', 'Глубина факт, м', 'Выполнено', 'УГВ появ., м', 'УГВ уст., м', 'Кровля ММГ, м', 'Дата бурения', 'Бурильщик', 'Описание разреза', 'Примечание'];
  const body = src.map((x, k) => {
    const p = x.f.properties || {}, c = first(x.f), [X, Y] = xy(c);
    const plan = x.m && x.m.second ? volPlan2Of(x.f, x.m) : _vlNumLoose(p['глубина']);
    const fact = p._done ? (x.m && x.m.second ? volFact2Of(x.f, x.m) : _vlNumLoose(p._fact2)) : null;
    const h = p['отметка устья'] != null ? p['отметка устья'] : (c[2] ? +(+c[2]).toFixed(2) : '');
    return [k + 1, p.name || p.Name || `Объект ${x.i + 1}`, p['тип'] || '', x.v ? x.v.name : x.l.name, X, Y, h, plan == null ? '' : plan, fact == null ? '' : fact,
      p._done ? (p._done_date ? new Date(String(p._done_date).slice(0, 10) + 'T12:00:00').toLocaleDateString('ru-RU') : 'да') : '',
      numOr(p['УГВ']), numOr(p['УГВ уст.']), numOr(p['ММГ']), p['дата бурения'] ? new Date(String(p['дата бурения']).slice(0, 10) + 'T12:00:00').toLocaleDateString('ru-RU') : '',
      p['бурильщик'] || '', p['разрез'] || '', p['примечание'] || ''];
  });
  const done = src.filter(x => (x.f.properties || {})._done).length;
  const aoa = [['Ведомость горных выработок'], [title || ''], [`Система координат: ${P ? P.name : '—'}`, '', '', `Дата: ${new Date().toLocaleDateString('ru-RU')}`], [`Всего: ${src.length}, выполнено: ${done}`], [], head, ...body];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [5, 14, 12, 18, 13, 13, 10, 10, 10, 11, 10, 10, 10, 11, 18, 50, 28].map(w => ({ wch: w }));
  for (let r = 6; r < aoa.length; r++) {
    [4, 5].forEach(c => { const a = ws[XLSX.utils.encode_cell({ r, c })]; if (a && a.t === 'n') a.z = '0.00'; });
    const a = ws[XLSX.utils.encode_cell({ r, c: 15 })]; if (a) a.s = { alignment: { wrapText: true, vertical: 'top' } };
  }
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Ведомость');
  XLSX.writeFile(wb, `Ведомость выработок — ${String(title || '').replace(/[\\/:*?"<>|]/g, '_')} ${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast(`Ведомость: ${src.length} выработок`, 'ok');
}
// все слои-объёмы объекта, где есть выработки (геология или заданный тип)
function featSemSiteReport(siteId) {
  const vs = (VL.all || []).filter(v => v.site_id === siteId && v.layer_id && (layers || []).some(l => l.id === v.layer_id));
  const ids = vs.sort((a, b) => (b.category === 'geology') - (a.category === 'geology')).map(v => v.layer_id);
  if (!ids.length) { toast('У объекта нет объёмов на слоях', 'warn'); return; }
  const s = (sites || []).find(x => x.id === siteId);
  featSemReport(ids, s ? s.name : '');
}
