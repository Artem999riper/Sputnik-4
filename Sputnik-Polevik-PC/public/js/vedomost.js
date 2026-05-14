// Ведомости Excel — пробы и объёмы. Стиль идентичен Sputnik-4.

async function renderVedomost() {
  const screen = document.getElementById('screen');
  const sites = await api('/sites');
  const today = todayStr();
  const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
  const fromDef = monthAgo.toISOString().slice(0, 10);
  setPageActions('');
  screen.innerHTML = `
    <div style="max-width:520px">
      <h3>📊 Ведомости в Excel</h3>
      <div class="field-row">
        <div class="field"><label>С</label><input id="vd-from" type="date" value="${fromDef}"></div>
        <div class="field"><label>По</label><input id="vd-to" type="date" value="${today}"></div>
      </div>
      <div class="field"><label>Объект</label>
        <select id="vd-site"><option value="">— все —</option>
          ${sites.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        </select></div>
      <div class="field"><label>Формат координат</label>
        <select id="vd-coord">
          <option value="dd">WGS-84 (десятичные градусы)</option>
          <option value="dms">WGS-84 (DMS)</option>
          <option value="msk3">МСК-86 зона 3</option>
          <option value="msk4">МСК-86 зона 4</option>
        </select></div>
      <div style="display:flex;gap:10px">
        <button class="btn primary" style="flex:1" onclick="vedomostSamples()">📋 Пробы</button>
        <button class="btn primary" style="flex:1" onclick="vedomostVolumes()">📐 Объёмы</button>
      </div>
    </div>
  `;
}

function _vdQuery() {
  const p = new URLSearchParams();
  const from = document.getElementById('vd-from').value;
  const to   = document.getElementById('vd-to').value;
  const site = document.getElementById('vd-site').value;
  const coord = document.getElementById('vd-coord').value;
  if (from) p.set('from', from);
  if (to)   p.set('to', to);
  if (site) p.set('site_id', site);
  if (coord) p.set('coord', coord);
  return { qs: p.toString(), coord, site, from, to };
}

const HDR_FILL = 'C3D69B';
const ROW_FILL = 'B9CCE4';
const TITLE_FILL = 'D9E1F2';
const BORDER = { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

function colLetter(c) { let s = '', n = c; do { s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; }
function ref(r, c) { return colLetter(c) + (r + 1); }

function styleSheet(ws, hdrCols, dataStart, dataLen, opts = {}) {
  function set(cr, st) { if (!ws[cr]) ws[cr] = { t: 's', v: '' }; ws[cr].s = st; }
  // Title row
  set(ref(0, 0), { font: { name: 'Times New Roman', bold: true, sz: 14 }, alignment: { horizontal: 'center', vertical: 'center' }, fill: { patternType: 'solid', fgColor: { rgb: TITLE_FILL } }, border: BORDER });
  for (let c = 0; c < hdrCols; c++)
    set(ref(1, c), { font: { name: 'Times New Roman', bold: true, sz: 11 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, fill: { patternType: 'solid', fgColor: { rgb: HDR_FILL } }, border: BORDER });
  for (let i = 0; i < dataLen; i++) {
    const r = dataStart + i;
    const fill = i % 2 === 0 ? { patternType: 'solid', fgColor: { rgb: ROW_FILL } } : { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } };
    for (let c = 0; c < hdrCols; c++)
      set(ref(r, c), { font: { name: 'Times New Roman', sz: 11 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, fill, border: BORDER });
  }
}

async function vedomostSamples() {
  const { qs, coord } = _vdQuery();
  const r = await api('/vedomost/samples?' + qs);
  if (!r.rows.length) return toast('Нет проб за период', 'warn');
  const isMsk = coord === 'msk3' || coord === 'msk4';
  const hdr = ['№', 'Дата', 'Скважина', 'Глубина, м', 'Тип отбора', 'Упаковка', 'Грунт', 'Мерзлота',
    isMsk ? 'X' : 'Широта', isMsk ? 'Y' : 'Долгота'];
  const aoa = [['Ведомость образцов — ' + new Date().toLocaleDateString('ru-RU')], hdr,
    ...r.rows.map((row, i) => [i + 1, row.date, row.borehole, row.depth, row.collection_type, row.packaging, row.soil_type, row.frozen_state, row.coord_lat, row.coord_lng])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 5 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  ws['!rows'] = [{ hpx: 32 }, { hpx: 36 }];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: hdr.length - 1 } }];
  ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
  styleSheet(ws, hdr.length, 2, r.rows.length);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Образцы');
  XLSX.writeFile(wb, `Ведомость_образцов_${todayStr()}.xlsx`);
  toast('Excel сохранён', 'ok');
}

async function vedomostVolumes() {
  const { qs, coord } = _vdQuery();
  const r = await api('/vedomost/volumes?' + qs);
  if (!r.rows.length) return toast('Нет данных за период', 'warn');
  const isMsk = coord === 'msk3' || coord === 'msk4';
  // Группируем по kind
  const groups = {};
  r.rows.forEach(row => { if (!groups[row.kind]) groups[row.kind] = []; groups[row.kind].push(row); });
  const hdr = ['№', 'Дата', 'Скважина', 'Объём', 'Глубина, м', 'Диаметр, мм', 'Тип работ',
    isMsk ? 'X' : 'Широта', isMsk ? 'Y' : 'Долгота'];
  const KIND_RU = { DRILLING: 'Бурение', STATIC_PROBE: 'Статическое зондирование', THERMOMETRY: 'Термометрия' };
  const aoa = [['Ведомость объёмов — ' + new Date().toLocaleDateString('ru-RU')], hdr];
  const groupRows = [];
  let n = 0;
  Object.entries(groups).forEach(([kind, rows]) => {
    const grIdx = aoa.length;
    aoa.push([KIND_RU[kind] || kind, '', '', '', '', '', '', '', '']);
    groupRows.push(grIdx);
    rows.forEach(row => {
      aoa.push([++n, row.date, row.borehole, row.volume_name, row.depth_m, row.diameter_mm, row.work_type, row.coord_lat, row.coord_lng]);
    });
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 5 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
  ws['!rows'] = [{ hpx: 32 }, { hpx: 36 }];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: hdr.length - 1 } }];
  groupRows.forEach(g => ws['!merges'].push({ s: { r: g, c: 0 }, e: { r: g, c: hdr.length - 1 } }));
  ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
  // Стили
  function set(cr, st) { if (!ws[cr]) ws[cr] = { t: 's', v: '' }; ws[cr].s = st; }
  set(ref(0, 0), { font: { name: 'Times New Roman', bold: true, sz: 14 }, alignment: { horizontal: 'center', vertical: 'center' }, fill: { patternType: 'solid', fgColor: { rgb: TITLE_FILL } }, border: BORDER });
  for (let c = 0; c < hdr.length; c++)
    set(ref(1, c), { font: { name: 'Times New Roman', bold: true, sz: 11 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, fill: { patternType: 'solid', fgColor: { rgb: HDR_FILL } }, border: BORDER });
  for (let r2 = 2; r2 < aoa.length; r2++) {
    if (groupRows.includes(r2)) {
      for (let c = 0; c < hdr.length; c++)
        set(ref(r2, c), { font: { name: 'Times New Roman', bold: true, sz: 11 }, alignment: { horizontal: 'left', vertical: 'center' }, fill: { patternType: 'solid', fgColor: { rgb: 'EBF1DE' } }, border: BORDER });
      continue;
    }
    const alt = r2 % 2 === 0;
    const fill = alt ? { patternType: 'solid', fgColor: { rgb: ROW_FILL } } : { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } };
    for (let c = 0; c < hdr.length; c++)
      set(ref(r2, c), { font: { name: 'Times New Roman', sz: 11 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, fill, border: BORDER });
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Объёмы');
  XLSX.writeFile(wb, `Ведомость_объёмов_${todayStr()}.xlsx`);
  toast('Excel сохранён', 'ok');
}
