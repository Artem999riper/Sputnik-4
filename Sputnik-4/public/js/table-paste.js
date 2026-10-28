// ═══════════════════════════════════════════════════════════
// table-paste.js — вставка строк из Excel (Ctrl+V) в таблицы
// Сотрудники / Техника / Оборудование / Материалы.
// Скопировали в Excel несколько строк → Ctrl+V на вкладке → окно:
// какой столбец Excel в какое поле, предпросмотр, «пропускать уже
// существующие» → строки добавляются (с отменой).
// Одно значение (без табуляции и переводов строки) при выбранной ячейке
// таблицы — вставляется в эту ячейку.
// ═══════════════════════════════════════════════════════════
const TP_CFG = {
  workers: { title: 'сотрудников', list: () => pgkWorkers, url: () => '/pgk/workers', del: id => `/pgk/workers/${id}`,
    fields: [['name', 'Ф.И.О.', /ф\.?\s*и\.?\s*о|фио|имя|сотрудник/], ['role', 'Должность', /должн|профес/], ['phone', 'Телефон', /тел/],
      ['base', 'База', /баз/], ['start_date', 'Дата заезда', /заезд|начал/], ['notes', 'Примечания', /примеч|коммент|заметк/]] },
  machinery: { title: 'техники', list: () => pgkMachinery, url: () => '/pgk/machinery', del: id => `/pgk/machinery/${id}`,
    fields: [['name', 'Название', /назв|наимен|техник|марк/], ['type', 'Тип', /тип|вид/], ['plate_number', 'Госномер', /номер|г\/н|гос/],
      ['base', 'База', /баз/], ['notes', 'Примечания', /примеч|коммент/]] },
  equipment: { title: 'оборудования', list: () => pgkEquipment, url: () => '/pgk/equipment', del: id => `/pgk/equipment/${id}`,
    fields: [['name', 'Название', /назв|наимен|оборуд|прибор/], ['type', 'Тип', /тип|вид/], ['serial_number', 'Заводской №', /завод|серийн|s\/n|зав/],
      ['base', 'База', /баз/], ['responsible', 'Ответственный', /ответств/], ['calib_date', 'Поверка до', /повер|калиб/], ['notes', 'Примечания', /примеч|коммент/]] },
  materials: { title: 'материалов', list: () => bases.flatMap(b => b.materials || []), url: b => `/bases/${b}/materials`, del: id => `/materials/${id}`, needBase: true,
    fields: [['name', 'Название', /назв|наимен|материал/], ['category', 'Группа', /групп|катег/], ['amount', 'Количество', /кол|остат/],
      ['unit', 'Ед. изм.', /ед/], ['weight', 'Вес', /вес|масс/], ['min_amount', 'Мин. остаток', /мин/], ['base', 'База', /баз/], ['notes', 'Примечания', /примеч|коммент/]] },
};
const TP = {};
function _tpKind() {
  const pg = document.querySelector('#workers-page.show,#machinery-page.show,#equipment-page.show,#materials-page.show');
  return pg ? pg.id.replace('-page', '') : null;
}
function _tpParse(txt) {
  // TSV из Excel: учитываем ячейки в кавычках с переводами строк
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"' && cur === '') { q = true; continue; }
    if (c === '\t') { row.push(cur); cur = ''; continue; }
    if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; continue; }
    cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.map(r => r.map(x => x.trim())).filter(r => r.some(Boolean));
}
function _tpDate(s) {
  const m = String(s || '').match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}
function _tpBase(name) {
  const n = String(name || '').toLowerCase().replace(/^база\s*/, '').trim(); if (!n) return null;
  const b = bases.find(x => x.name.toLowerCase().replace(/^база\s*/, '').trim() === n) || bases.find(x => x.name.toLowerCase().includes(n));
  return b ? b.id : null;
}
document.addEventListener('paste', ev => {
  const a = document.activeElement;
  if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
  if (document.getElementById('mov')?.classList.contains('open')) return;
  const kind = _tpKind(); if (!kind) return;
  const txt = (ev.clipboardData || window.clipboardData).getData('text/plain') || '';
  if (!txt.trim()) return;
  const multi = /\t/.test(txt.trim()) || /[\r\n]/.test(txt.trim());
  if (!multi) {
    // одно значение — в текущую ячейку
    const td = typeof TK !== 'undefined' && TK._kcTd && TK._kcTd();
    if (td && td.classList.contains('td-editable')) {
      ev.preventDefault(); td.click();
      const inp = td.querySelector('input:not([type=checkbox])');
      if (inp) { inp.value = txt.trim(); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); }
    }
    return;
  }
  ev.preventDefault();
  tpOpen(kind, _tpParse(txt));
});
function tpOpen(kind, rows) {
  const cfg = TP_CFG[kind]; if (!cfg || !rows.length) return;
  const nc = Math.max(...rows.map(r => r.length));
  // первая строка — заголовки?
  const hdrMap = rows[0].map(h => { const l = h.toLowerCase(); const f = cfg.fields.find(([, , re]) => re.test(l)); return f ? f[0] : null; });
  const hasHdr = hdrMap.filter(Boolean).length >= Math.min(2, nc) || (nc === 1 && hdrMap[0]);
  const map = [];
  for (let i = 0; i < nc; i++) map.push(hasHdr ? (hdrMap[i] || '') : (cfg.fields[i] ? cfg.fields[i][0] : ''));
  Object.assign(TP, { kind, rows, hasHdr, map, nc });
  _tpRender();
}
function _tpRender() {
  const cfg = TP_CFG[TP.kind], data = TP.hasHdr ? TP.rows.slice(1) : TP.rows;
  const opt = cur => `<option value="">— пропустить —</option>` + cfg.fields.map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const prev = data.slice(0, 6);
  const names = new Set(cfg.list().map(x => String(x.name || '').trim().toLowerCase()));
  const nameCol = TP.map.indexOf('name');
  const dup = nameCol >= 0 ? data.filter(r => names.has(String(r[nameCol] || '').trim().toLowerCase())).length : 0;
  const baseCol = TP.map.indexOf('base');
  const unknownBases = baseCol >= 0 ? [...new Set(data.map(r => r[baseCol]).filter(v => v && !_tpBase(v)))] : [];
  showModal(`📋 Вставка ${cfg.title} из Excel`, `<div style="min-width:min(760px,90vw);display:flex;flex-direction:column;gap:8px;font-size:12px">
    <div>Строк: <b>${data.length}</b>. Укажите, какой столбец во что записать.</div>
    <label style="display:flex;gap:6px;align-items:center;text-transform:none;font-weight:500;margin:0"><input type="checkbox" id="tp-hdr" ${TP.hasHdr ? 'checked' : ''} style="width:auto;margin:0" onchange="TP.hasHdr=this.checked;_tpRender()"> первая строка — заголовки</label>
    <div style="overflow:auto;max-height:46vh;border:1px solid var(--bd);border-radius:6px">
      <table class="wt-tbl" style="font-size:11px;min-width:100%"><thead><tr>${TP.map.map((m, i) => `<th class="no-sort" style="text-transform:none;letter-spacing:0"><select data-i="${i}" onchange="TP.map[${i}]=this.value;_tpRender()" style="font-size:11px;width:100%;min-width:110px">${opt(m)}</select>${TP.hasHdr ? `<div style="font-weight:500;color:var(--tx3);margin-top:2px">${esc(TP.rows[0][i] || '')}</div>` : ''}</th>`).join('')}</tr></thead>
      <tbody>${prev.map(r => `<tr>${TP.map.map((m, i) => `<td style="${m ? '' : 'color:var(--tx3);text-decoration:line-through'}">${esc(r[i] || '')}</td>`).join('')}</tr>`).join('')}
      ${data.length > prev.length ? `<tr><td colspan="${TP.nc}" style="color:var(--tx3);text-align:center">… ещё ${data.length - prev.length}</td></tr>` : ''}</tbody></table>
    </div>
    ${nameCol < 0 ? '<div style="color:var(--red)">⚠️ Укажите столбец с названием (Ф.И.О.) — без него строки не добавить.</div>' : ''}
    ${dup ? `<label style="display:flex;gap:6px;align-items:center;text-transform:none;font-weight:500;margin:0"><input type="checkbox" id="tp-skip" checked style="width:auto;margin:0"> пропускать уже существующие (${dup})</label>` : ''}
    ${unknownBases.length ? `<div style="color:#a16207">⚠️ Не найдены базы: ${unknownBases.slice(0, 6).map(esc).join(', ')}${unknownBases.length > 6 ? '…' : ''} — будут без базы${cfg.needBase ? ' (возьмётся база ниже)' : ''}.</div>` : ''}
    ${cfg.needBase ? `<div class="fg" style="margin:0"><label>База${baseCol >= 0 ? ' (если в строке не указана)' : ''}</label><select id="tp-base">${bases.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>` : ''}
  </div>`, [{ label: 'Отмена', cls: 'bs', fn: closeModal }, { label: `✅ Добавить`, cls: 'bp', fn: _tpRun }]);
}
async function _tpRun() {
  const cfg = TP_CFG[TP.kind], data = TP.hasHdr ? TP.rows.slice(1) : TP.rows;
  const nameCol = TP.map.indexOf('name');
  if (nameCol < 0) { toast('Укажите столбец с названием', 'warn'); return; }
  const skip = document.getElementById('tp-skip')?.checked;
  const defBase = document.getElementById('tp-base')?.value;
  if (cfg.needBase && !defBase && !bases.length) { toast('Сначала создайте базу', 'warn'); return; }
  const names = new Set(cfg.list().map(x => String(x.name || '').trim().toLowerCase()));
  closeModal();
  const created = []; let skipped = 0, failed = 0;
  for (const r of data) {
    const o = { user_name: typeof un === 'function' ? un() : '' };
    TP.map.forEach((f, i) => { if (f && r[i] != null && r[i] !== '') o[f] = r[i]; });
    if (!o.name) { skipped++; continue; }
    if (skip && names.has(o.name.trim().toLowerCase())) { skipped++; continue; }
    let baseId = null;
    if (o.base) { baseId = _tpBase(o.base); delete o.base; }
    ['start_date', 'calib_date'].forEach(k => { if (o[k]) o[k] = _tpDate(o[k]); });
    ['amount', 'weight', 'min_amount'].forEach(k => { if (o[k] != null) o[k] = parseFloat(String(o[k]).replace(/\s/g, '').replace(',', '.')) || 0; });
    if (!cfg.needBase && baseId) o.base_id = baseId;
    const b = cfg.needBase ? (baseId || defBase) : null;
    try {
      const res = await fetch(API + cfg.url(b), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.id) { created.push(j.id); names.add(o.name.trim().toLowerCase()); } else failed++;
    } catch (e) { failed++; }
  }
  try { if (TP.kind === 'materials' && typeof loadAll === 'function') await loadAll(); await loadPGK(); renderPGK(); } catch (e) {}
  const msg = `📋 Добавлено: ${created.length}${skipped ? `, пропущено ${skipped}` : ''}${failed ? `, ошибок ${failed}` : ''}`;
  if (created.length) TK.undoBar(msg, async () => {
    for (const id of created) await fetch(API + cfg.del(id), { method: 'DELETE' }).catch(() => {});
    try { if (TP.kind === 'materials' && typeof loadAll === 'function') await loadAll(); await loadPGK(); renderPGK(); } catch (e) {}
  });
  else toast(msg, failed ? 'err' : 'warn');
}
