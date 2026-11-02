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
