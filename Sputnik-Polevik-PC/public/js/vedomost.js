// Ведомости Excel — пробы и объёмы в формате Android

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
      <div class="field"><label>Геолог</label><input id="vd-geo" placeholder="ФИО геолога"></div>
      <div style="display:flex;gap:10px">
        <button class="btn primary" style="flex:1" onclick="vedomostSamples()">📋 Пробы</button>
        <button class="btn primary" style="flex:1" onclick="vedomostVolumes()">📐 Объёмы</button>
      </div>
    </div>
  `;
}

function _vdQuery() {
  const p = new URLSearchParams();
  const from  = document.getElementById('vd-from').value;
  const to    = document.getElementById('vd-to').value;
  const site  = document.getElementById('vd-site').value;
  const coord = document.getElementById('vd-coord').value;
  if (from)  p.set('from', from);
  if (to)    p.set('to', to);
  if (site)  p.set('site_id', site);
  if (coord) p.set('coord', coord);
  return { qs: p.toString(), coord, from, to, geo: document.getElementById('vd-geo')?.value || '' };
}

// ── Стили ────────────────────────────────────────────────────
const _BD = { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } };

function _hdrSt(fill)   { return { font: { name: 'Times New Roman', sz: 11, bold: true }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, fill: { patternType: 'solid', fgColor: { rgb: fill } }, border: _BD }; }
function _bodySt(fill, left) { return { font: { name: 'Times New Roman', sz: 11 }, alignment: { horizontal: left ? 'left' : 'center', vertical: 'center', wrapText: true }, fill: fill ? { patternType: 'solid', fgColor: { rgb: fill } } : undefined, border: _BD }; }
function _txtSt()       { return { font: { name: 'Times New Roman', sz: 11 }, alignment: { horizontal: 'left', vertical: 'center' } }; }

function _colLetter(c) { let s = '', n = c; do { s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; }
function _cr(r, c) { return _colLetter(c) + (r + 1); }
function _setCell(ws, r, c, v, style) {
  const ref = _cr(r, c);
  if (!ws[ref]) ws[ref] = { t: typeof v === 'number' ? 'n' : 's', v: v ?? '' };
  else { ws[ref].t = typeof v === 'number' ? 'n' : 's'; ws[ref].v = v ?? ''; }
  ws[ref].s = style;
}

// ── Ведомость проб ────────────────────────────────────────────
async function vedomostSamples() {
  const { qs, coord, geo } = _vdQuery();
  const r = await api('/vedomost/samples?' + qs);
  if (!r.rows.length) return toast('Нет проб за период', 'warn');

  const siteName = r.site_name || '—';
  const geoName = geo || '—';

  const aoa = [];
  aoa.push(['Ведомость образцов грунтов, отобранных при бурении инженерно-геологических выработок', '', '', '', '', '', '', '', '']);
  aoa.push(['', '', '', '', '', '', '', '', '']);
  aoa.push([`На объекте (участке) ${siteName}`, '', '', '', '', '', '', '', '']);
  aoa.push(['направляемых в лабораторию ________________________________', '', '', '', '', '', '', '', '']);
  aoa.push(['(наименование лаборатории)', '', '', '', '', '', '', '', '']);
  aoa.push(['организация-исполнитель: ________________________________', '', '', '', '', '', '', '', '']);
  aoa.push(['№ п/п', 'Геолог', 'Дата отбора образцов', 'Наименование и номер выработки', 'Глубина отбора образца, м', '', 'Вид образца\n(монолит, нарушенной структуры)', 'талый/мерзлый', 'Наименование грунта']);

  const dataStart = aoa.length;
  r.rows.forEach((row, i) => {
    aoa.push([i + 1, geoName, row.date, row.borehole, row.depth, '', row.collection_type, row.frozen_state, row.soil_type]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 6 }, { wch: 22 }, { wch: 14 }, { wch: 30 }];
  ws['!rows'] = [{ hpx: 32 }, {}, { hpx: 20 }, { hpx: 20 }, { hpx: 16 }, { hpx: 20 }, { hpx: 44 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 8 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 8 } },
    { s: { r: 5, c: 0 }, e: { r: 5, c: 8 } },
    { s: { r: 6, c: 4 }, e: { r: 6, c: 5 } },
  ];
  for (let i = 0; i < r.rows.length; i++)
    ws['!merges'].push({ s: { r: dataStart + i, c: 4 }, e: { r: dataStart + i, c: 5 } });
  ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: dataStart }];

  _setCell(ws, 0, 0, aoa[0][0], { font: { name: 'Times New Roman', sz: 13, bold: true }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: _BD });
  [2, 3, 4, 5].forEach(row => _setCell(ws, row, 0, aoa[row][0], _txtSt()));
  for (let c = 0; c < 9; c++) _setCell(ws, 6, c, aoa[6][c], _hdrSt('C3D69B'));
  for (let i = 0; i < r.rows.length; i++) {
    const row = dataStart + i;
    const fill = i % 2 === 0 ? 'B9CCE4' : 'FFFFFF';
    for (let c = 0; c < 9; c++) _setCell(ws, row, c, aoa[row][c], _bodySt(fill, c === 8));
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Образцы');
  XLSX.writeFile(wb, `Ведомость_образцов_${todayStr()}.xlsx`);
  toast('Excel сохранён', 'ok');
}

// ── Ведомость объёмов ─────────────────────────────────────────
function _parseSnap(json) {
  if (!json) return { transportLabel: '', memberNames: [] };
  try { const o = JSON.parse(json); return { transportLabel: o.transportLabel || '', memberNames: o.memberNames || [] }; }
  catch { return { transportLabel: '', memberNames: [] }; }
}

async function vedomostVolumes() {
  const { qs, coord } = _vdQuery();
  const r = await api('/vedomost/volumes?' + qs);
  if (!r.rows.length) return toast('Нет данных за период', 'warn');

  const isMsk = coord === 'msk3' || coord === 'msk4';
  const coordsTitle = isMsk ? `Координаты МСК-86 (зона ${coord.slice(-1)}), м` : 'Координаты WGS-84';
  const coordSubA = isMsk ? 'X (Север)' : 'Широта';
  const coordSubB = isMsk ? 'Y (Восток)' : 'Долгота';

  // Группируем по brigade_snapshot
  const groups = [];
  let lastSnap = undefined, curGroup = null;
  r.rows.forEach(row => {
    if (row.brigade_snapshot !== lastSnap) {
      lastSnap = row.brigade_snapshot;
      curGroup = { snap: _parseSnap(row.brigade_snapshot), rows: [] };
      groups.push(curGroup);
    }
    curGroup.rows.push(row);
  });

  // Суммы по людям
  const personDepths = {};
  groups.forEach(({ snap, rows }) => {
    const total = rows.reduce((s, row) => s + (Number(row.depth_m) || 0), 0);
    snap.memberNames.forEach(name => { personDepths[name] = (personDepths[name] || 0) + total; });
  });

  const aoa = [];
  // Строки 0,1: шапка таблицы; строка 2: объект
  aoa.push(['п/п', 'Имя скважины', 'Дата бурения', coordsTitle, '', 'Общая глубина, м', 'Обсад, м', 'Описание из шапки']);
  aoa.push(['', '', '', coordSubA, coordSubB, '', '', '']);
  aoa.push([`Объект: ${r.site_name || '—'}`, '', '', '', '', '', '', '']);

  const groupRowIdxs = [];
  const dataRanges = [];
  let seq = 0;

  groups.forEach(({ snap, rows }) => {
    const brigLabel = (snap.transportLabel ? `Борт: ${snap.transportLabel}  ` : '') +
      `Бригада: ${snap.memberNames.join(', ') || '—'}`;
    groupRowIdxs.push(aoa.length);
    aoa.push([brigLabel, '', '', '', '', '', '', '']);

    const firstData = aoa.length;
    rows.forEach(row => {
      seq++;
      aoa.push([seq, row.borehole, row.date, row.coord_lat, row.coord_lng,
        Number(row.depth_m) || '', Number(row.casing_m) || '', row.description]);
    });
    if (rows.length) dataRanges.push([firstData, aoa.length - 1]);
  });

  const totalRowIdx = aoa.length;
  const totalDepth = dataRanges.reduce((s, [f, t]) => {
    for (let i = f; i <= t; i++) s += Number(aoa[i][5]) || 0;
    return s;
  }, 0);
  const totalCasing = dataRanges.reduce((s, [f, t]) => {
    for (let i = f; i <= t; i++) s += Number(aoa[i][6]) || 0;
    return s;
  }, 0);
  aoa.push(['ИТОГО:', '', '', '', '', totalDepth || '', totalCasing || '', '']);
  aoa.push([]);
  Object.entries(personDepths).forEach(([name, depth]) => {
    const d = depth % 1 === 0 ? depth : +depth.toFixed(1);
    aoa.push([name, '', '', '', '', `${d} м`, '', '']);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 11 }, { wch: 32 }];
  ws['!rows'] = [{ hpx: 36 }, { hpx: 28 }, { hpx: 20 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
    { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
    { s: { r: 0, c: 3 }, e: { r: 0, c: 4 } },
    { s: { r: 0, c: 5 }, e: { r: 1, c: 5 } },
    { s: { r: 0, c: 6 }, e: { r: 1, c: 6 } },
    { s: { r: 0, c: 7 }, e: { r: 1, c: 7 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
    { s: { r: totalRowIdx, c: 0 }, e: { r: totalRowIdx, c: 4 } },
  ];
  groupRowIdxs.forEach(gi => ws['!merges'].push({ s: { r: gi, c: 0 }, e: { r: gi, c: 7 } }));
  ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

  // Стили
  for (let c = 0; c < 8; c++) {
    _setCell(ws, 0, c, aoa[0][c], _hdrSt('C3D69B'));
    _setCell(ws, 1, c, aoa[1][c], _hdrSt('C3D69B'));
  }
  _setCell(ws, 2, 0, aoa[2][0], { font: { name: 'Times New Roman', sz: 11, bold: true }, alignment: { horizontal: 'left', vertical: 'center' }, border: _BD });

  groupRowIdxs.forEach(gi => {
    for (let c = 0; c < 8; c++)
      _setCell(ws, gi, c, aoa[gi][c], { font: { name: 'Times New Roman', sz: 11, bold: true }, alignment: { horizontal: 'left', vertical: 'center' }, fill: { patternType: 'solid', fgColor: { rgb: 'D9E1F2' } }, border: _BD });
  });

  for (let i = 3; i < totalRowIdx; i++) {
    if (groupRowIdxs.includes(i)) continue;
    const fill = i % 2 === 0 ? 'B9CCE4' : 'FFFFFF';
    for (let c = 0; c < 8; c++) _setCell(ws, i, c, aoa[i]?.[c] ?? '', _bodySt(fill, c === 7));
  }

  for (let c = 0; c < 8; c++) _setCell(ws, totalRowIdx, c, aoa[totalRowIdx][c], _hdrSt('C3D69B'));

  for (let i = totalRowIdx + 2; i < aoa.length; i++) {
    if (!aoa[i]?.length) continue;
    for (let c = 0; c < 8; c++) _setCell(ws, i, c, aoa[i][c] ?? '', _bodySt('FFFFFF', c !== 5));
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Объёмы');
  XLSX.writeFile(wb, `Ведомость_объёмов_${todayStr()}.xlsx`);
  toast('Excel сохранён', 'ok');
}
