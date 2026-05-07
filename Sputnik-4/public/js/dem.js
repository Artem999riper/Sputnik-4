// ═══════════════════════════════════════════════════════════
// DEM — Загрузка поверхности ArcticDEM + горизонтали
// Экспорт в DXF/SHP с перепроецированием через GDAL (сервер)
// ═══════════════════════════════════════════════════════════

let _demDrawing   = false;   // режим рисования bbox
let _demRect      = null;    // L.rectangle на карте
let _demStart     = null;    // первая точка bbox
let _demTmpLayer  = null;    // временный прямоугольник при рисовании
let _demBbox      = null;    // итоговый bbox {minLat,minLng,maxLat,maxLng}

// ── Проекции ───────────────────────────────────────────────
// WGS-84: метрическая проекция UTM (зоны выбираются по longitude)
// ГСК-2011: Гаусс-Крюгер по ГОСТ 32453-2017 (эллипсоид ГСК-2011 = GRS80)
//   EPSG: 20004-20032 (зона N → EPSG 2000N+3), ЦМ = 3*N° E
const DEM_PROJECTIONS = [
  // ── WGS-84 UTM (метрические, по зонам ХМАО-Югры / ЯНАО) ──
  {
    id:    'wgs84_utm42',
    label: 'WGS-84 UTM Зона 42N (66°–72° в.д.)',
    epsg:  32642,
    name:  'WGS84_UTM42N',
  },
  {
    id:    'wgs84_utm43',
    label: 'WGS-84 UTM Зона 43N (72°–78° в.д.)',
    epsg:  32643,
    name:  'WGS84_UTM43N',
  },
  {
    id:    'wgs84_utm44',
    label: 'WGS-84 UTM Зона 44N (78°–84° в.д.)',
    epsg:  32644,
    name:  'WGS84_UTM44N',
  },
  // ── ГСК-2011 Гаусс-Крюгер (ГОСТ 32453-2017, эллипсоид GRS80) ──
  // Зона 9: CM=27°, x_0=9500000
  // Зоны для ХМАО/ЯНАО: 12(CM=69°), 13(CM=75°), 14(CM=81°), 15(CM=87°)
  {
    id:    'gsk2011_z12',
    label: 'ГСК-2011 / ГК Зона 12 (ЦМ=69°, 66°–72° в.д.)',
    epsg:  null,
    proj4: '+proj=tmerc +lat_0=0 +lon_0=69 +k=1 +x_0=12500000 +y_0=0 ' +
           '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    name:  'GSK2011_GK12',
  },
  {
    id:    'gsk2011_z13',
    label: 'ГСК-2011 / ГК Зона 13 (ЦМ=75°, 72°–78° в.д.)',
    epsg:  null,
    proj4: '+proj=tmerc +lat_0=0 +lon_0=75 +k=1 +x_0=13500000 +y_0=0 ' +
           '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    name:  'GSK2011_GK13',
  },
  {
    id:    'gsk2011_z14',
    label: 'ГСК-2011 / ГК Зона 14 (ЦМ=81°, 78°–84° в.д.)',
    epsg:  null,
    proj4: '+proj=tmerc +lat_0=0 +lon_0=81 +k=1 +x_0=14500000 +y_0=0 ' +
           '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    name:  'GSK2011_GK14',
  },
  {
    id:    'gsk2011_z15',
    label: 'ГСК-2011 / ГК Зона 15 (ЦМ=87°, 84°–90° в.д.)',
    epsg:  null,
    proj4: '+proj=tmerc +lat_0=0 +lon_0=87 +k=1 +x_0=15500000 +y_0=0 ' +
           '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    name:  'GSK2011_GK15',
  },
  // ── МСК-86 (Красовский, трансформация ХМАО) ──
  {
    id:    'msk86_z3',
    label: 'МСК-86 Зона 3 (ЦМ=72°05′)',
    epsg:  null,
    proj4: '+proj=tmerc +lat_0=0 +lon_0=72.05 +k=1 +x_0=3500000 +y_0=-5811057.63 ' +
           '+ellps=krass +towgs84=23.57,-140.95,-79.8,0,0.35,0.79,-0.22 +units=m +no_defs',
    name:  'MSK86_Z3',
  },
  {
    id:    'msk86_z4',
    label: 'МСК-86 Зона 4 (ЦМ=78°05′)',
    epsg:  null,
    proj4: '+proj=tmerc +lat_0=0 +lon_0=78.05 +k=1 +x_0=4500000 +y_0=-5811057.63 ' +
           '+ellps=krass +towgs84=23.57,-140.95,-79.8,0,0.35,0.79,-0.22 +units=m +no_defs',
    name:  'MSK86_Z4',
  },
  {
    id:    'sk42_z4',
    label: 'СК-42 Зона 4 (CM=81°)',
    epsg:  28404,
    name:  'SK42_Z4',
  },
];

// ── Форматы экспорта ───────────────────────────────────────
const DEM_FORMATS = [
  { id: 'dxf',     label: 'DXF (AutoCAD, Robur)',   ext: '.zip'  },
  { id: 'geotiff', label: 'GeoTIFF (растр ЦМР)',    ext: '.tif'  },
];

// ── Открыть панель DEM ─────────────────────────────────────
function openDEMPanel() {
  const projOpts = DEM_PROJECTIONS.map(p =>
    `<option value="${p.id}">${p.label}</option>`
  ).join('');

  showModal('🏔 Выгрузка рельефа ArcticDEM',
    `<div style="font-size:11px;color:var(--tx2);margin-bottom:10px;line-height:1.6;
                 background:var(--accl);border:1.5px solid var(--accm);border-radius:var(--rs);
                 padding:8px 11px">
      <b>Результат:</b> ZIP архив с DXF (горизонтали + точки) и JPEG спутником
    </div>
    <div class="fgr">
      <div class="fg s2">
        <label>1. Область на карте</label>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn bp bsm" style="flex:1" onclick="demStartDraw()">
            ✏️ Нарисовать прямоугольник
          </button>
          <button class="btn bs bsm" onclick="demClearDraw()">✕</button>
        </div>
        <div id="dem-bbox-info" style="margin-top:5px;font-size:10px;color:var(--tx3)">
          Область не выбрана
        </div>
      </div>

      <div class="fg">
        <label>Система координат</label>
        <select id="dem-proj" style="width:100%;font-size:12px;padding:5px 8px;
          border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
          ${projOpts}
        </select>
        <div id="dem-proj-hint" style="font-size:10px;color:var(--grn);margin-top:3px"></div>
      </div>

      <div class="fg">
        <label>Шаг горизонталей (м)</label>
        <input id="dem-interval" type="number" value="2" min="0.5" max="50" step="0.5"
          style="font-size:12px;padding:5px 8px;border:1.5px solid var(--bd);
                 border-radius:var(--rs);background:var(--s2);width:100%">
      </div>

      <div class="fg">
        <label>Шаг сетки точек высот (м)</label>
        <select id="dem-grid-step" style="width:100%;font-size:12px;padding:5px 8px;
          border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
          <option value="10">10 м (детально)</option>
          <option value="20" selected>20 м (рекомендуется)</option>
          <option value="50">50 м</option>
          <option value="100">100 м (обзорно)</option>
          <option value="0">Без точек</option>
        </select>
      </div>
      <div class="fg">
        <label>Разброс точек в плане (м) — имитация пикетажа</label>
        <div style="display:flex;gap:8px;align-items:center">
          <div style="flex:1">
            <div style="font-size:10px;color:var(--t2);margin-bottom:3px">от (мин.)</div>
            <input id="dem-jitter-min" type="number" value="0.5" min="0" max="50" step="0.1"
              style="width:100%;font-size:12px;padding:5px 8px;border:1.5px solid var(--bd);
                     border-radius:var(--rs);background:var(--s2);box-sizing:border-box">
          </div>
          <div style="padding-top:16px;color:var(--t2);font-size:13px">—</div>
          <div style="flex:1">
            <div style="font-size:10px;color:var(--t2);margin-bottom:3px">до (макс.)</div>
            <input id="dem-jitter-max" type="number" value="2" min="0" max="50" step="0.1"
              style="width:100%;font-size:12px;padding:5px 8px;border:1.5px solid var(--bd);
                     border-radius:var(--rs);background:var(--s2);box-sizing:border-box">
          </div>
        </div>
        <div style="font-size:10px;color:var(--t2);margin-top:4px">
          0 / 0 — строгая сетка &nbsp;|&nbsp; точки смещаются от мин. до макс. в случайном направлении
        </div>
      </div>

      <div class="fg s2">
        <label>Дополнительно</label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;
               padding:6px 9px;background:var(--s2);border:1.5px solid var(--bd);
               border-radius:var(--rs);font-size:11px;margin-bottom:5px">
          <input type="checkbox" id="dem-satellite" checked
            style="width:14px;height:14px;accent-color:var(--acc)">
          <span>🛰 Добавить спутник <b>JPEG + JGW</b> (геопривязка)</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;
               padding:6px 9px;background:var(--s2);border:1.5px solid var(--bd);
               border-radius:var(--rs);font-size:11px">
          <input type="checkbox" id="dem-bsv77" checked
            style="width:14px;height:14px;accent-color:var(--acc)">
          <span>📐 Перевести в <b>БСВ-77</b> (EGM2008)</span>
        </label>
      </div>
    </div>

    <div id="dem-size-warn" style="display:none;background:var(--ylwl);border:1.5px solid #fde68a;
      border-radius:var(--rs);padding:7px 10px;font-size:11px;color:var(--ylw);margin-top:6px">
    </div>
    <div id="dem-progress" style="display:none;margin-top:10px">
      <div style="font-size:11px;font-weight:700;color:var(--acc);margin-bottom:5px"
           id="dem-progress-text">⏳ Подготовка...</div>
      <div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden">
        <div id="dem-progress-bar"
             style="height:6px;background:var(--acc);border-radius:3px;width:0%;transition:width .4s">
        </div>
      </div>
    </div>`,
    [
      { label: 'Закрыть', cls: 'bs', fn: () => { demCancelDraw(); closeModal(); } },
      { label: '⬇️ Выгрузить', cls: 'bp', fn: demExport },
    ]
  );
}


// ── Начать рисование bbox ──────────────────────────────────
function demStartDraw() {
  closeModal();
  _demDrawing = true;
  _demStart   = null;
  if (_demRect) { try { map.removeLayer(_demRect); } catch(e) {} _demRect = null; }
  if (_demTmpLayer) { try { map.removeLayer(_demTmpLayer); } catch(e) {} _demTmpLayer = null; }

  map.getContainer().style.cursor = 'crosshair';

  // Показываем подсказку
  const bnr = document.getElementById('bnr');
  if (bnr) {
    bnr.className = 'show draw';
    document.getElementById('bnr-t').textContent = '🏔 Кликните — первый угол области выгрузки DEM';
    bnr.style.display = 'flex';
  }

  map.once('click', _demFirstClick);
}

function _demFirstClick(e) {
  if (!_demDrawing) return;
  _demStart = e.latlng;
  document.getElementById('bnr-t').textContent = '🏔 Кликните — второй угол области';

  // Рисуем временный прямоугольник при движении мыши
  map.on('mousemove', _demMouseMove);
  map.once('click', _demSecondClick);
}

function _demMouseMove(e) {
  if (!_demStart) return;
  const bounds = L.latLngBounds(_demStart, e.latlng);
  if (_demTmpLayer) {
    _demTmpLayer.setBounds(bounds);
  } else {
    _demTmpLayer = L.rectangle(bounds, {
      color: '#f59e0b', weight: 2, dashArray: '6 4',
      fillColor: '#f59e0b', fillOpacity: 0.15,
    }).addTo(map);
  }
}

function _demSecondClick(e) {
  map.off('mousemove', _demMouseMove);
  if (_demTmpLayer) { try { map.removeLayer(_demTmpLayer); } catch(e2) {} _demTmpLayer = null; }

  const b = L.latLngBounds(_demStart, e.latlng);
  _demBbox = {
    minLat: b.getSouth(), maxLat: b.getNorth(),
    minLng: b.getWest(),  maxLng: b.getEast(),
  };

  // Рисуем финальный прямоугольник
  _demRect = L.rectangle(b, {
    color: '#f59e0b', weight: 2.5,
    fillColor: '#f59e0b', fillOpacity: 0.18,
  }).addTo(map);

  _demDrawing = false;
  map.getContainer().style.cursor = '';
  const bnr = document.getElementById('bnr');
  if (bnr) { bnr.className = ''; bnr.style.display = 'none'; }

  // Считаем площадь
  const latDist = (b.getNorth() - b.getSouth()) * 111320;
  const lngDist = (b.getEast()  - b.getWest())  * 111320 *
                  Math.cos(b.getCenter().lat * Math.PI / 180);
  const areaSqKm = (latDist * lngDist) / 1e6;

  // Открываем панель снова с обновлёнными данными
  openDEMPanel();

  setTimeout(() => {
    const info = document.getElementById('dem-bbox-info');
    if (info) {
      info.style.color = 'var(--grn)';
      info.textContent =
        `✅ Выбрано: ${latDist.toFixed(0)}м × ${lngDist.toFixed(0)}м` +
        ` ≈ ${areaSqKm.toFixed(1)} км²`;
    }

    // Автовыбор подходящей зоны проекции по центральному меридиану
    const centerLng = (b.getWest() + b.getEast()) / 2;
    const projSel = document.getElementById('dem-proj');
    if (projSel) {
      let suggested = null;
      if (centerLng >= 66 && centerLng < 72)  suggested = 'gsk2011_z12';
      else if (centerLng >= 72 && centerLng < 78)  suggested = 'gsk2011_z13';
      else if (centerLng >= 78 && centerLng < 84)  suggested = 'gsk2011_z14';
      else if (centerLng >= 84 && centerLng < 90)  suggested = 'gsk2011_z15';
      if (suggested) {
        projSel.value = suggested;
        const hint = document.getElementById('dem-proj-hint');
        if (hint) hint.textContent = `💡 Авто: ${projSel.options[projSel.selectedIndex]?.text||''}`;
      }
    }
    // Предупреждение о большой площади
    const warn = document.getElementById('dem-size-warn');
    if (warn && areaSqKm > 100) {
      warn.style.display = 'block';
      warn.textContent =
        `⚠️ Большая область (${areaSqKm.toFixed(0)} км²). ` +
        `Загрузка может занять несколько минут. ` +
        `Рекомендуется не более 100 км² для шага 2м.`;
    }
  }, 100);
}

function demClearDraw() {
  if (_demRect) { try { map.removeLayer(_demRect); } catch(e) {} _demRect = null; }
  _demBbox = null;
  const info = document.getElementById('dem-bbox-info');
  if (info) { info.style.color = 'var(--tx3)'; info.textContent = 'Область не выбрана'; }
  const warn = document.getElementById('dem-size-warn');
  if (warn) warn.style.display = 'none';
}

function demCancelDraw() {
  _demDrawing = false;
  map.off('mousemove', _demMouseMove);
  if (_demTmpLayer) { try { map.removeLayer(_demTmpLayer); } catch(e) {} _demTmpLayer = null; }
  map.getContainer().style.cursor = '';
  const bnr = document.getElementById('bnr');
  if (bnr) { bnr.className = ''; bnr.style.display = 'none'; }
}

// ── Выгрузка ───────────────────────────────────────────────
async function demExport() {
  if (!_demBbox) { toast('Сначала нарисуйте область на карте', 'err'); return; }

  const projId   = document.getElementById('dem-proj')?.value;
  const interval = parseFloat(document.getElementById('dem-interval')?.value) || 2;
  const gridStepRaw = document.getElementById('dem-grid-step')?.value ?? '20';
  const gridStep = (gridStepRaw === '' || gridStepRaw === null) ? 20 : parseInt(gridStepRaw, 10);
  const jitterMin = parseFloat(document.getElementById('dem-jitter-min')?.value ?? '0') || 0;
  const jitterMax = parseFloat(document.getElementById('dem-jitter-max')?.value ?? '0') || 0;
  const exportSatellite = document.getElementById('dem-satellite')?.checked !== false;
  const useGeoid = document.getElementById('dem-bsv77')?.checked !== false;

  const proj = DEM_PROJECTIONS.find(p => p.id === projId);
  const fmt  = { id: 'dxf', ext: '.zip' };

  // Показываем прогресс
  const progWrap = document.getElementById('dem-progress');
  const progText = document.getElementById('dem-progress-text');
  const progBar  = document.getElementById('dem-progress-bar');
  if (progWrap) progWrap.style.display = 'block';

  const setProgress = (pct, text) => {
    if (progText) progText.textContent = text;
    if (progBar)  progBar.style.width  = pct + '%';
  };

  // Блокируем кнопку
  const btns = document.querySelectorAll('#mft .btn');
  btns.forEach(b => b.disabled = true);

  try {
    setProgress(10, '⏳ Запрос к ArcticDEM...');

    const res = await fetch(`${API}/dem/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bbox:     _demBbox,
        projId:   proj.id,
        proj4:    proj.proj4 || null,
        epsg:     proj.epsg  || null,
        projName: proj.name  || null,
        format:   'dxf',
        interval,
        gridStep,
        jitterMin,
        jitterMax,
        useGeoid,
        exportSatellite,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Ошибка сервера');
    }

    setProgress(90, '⏳ Получение файла...');

    // Скачиваем файл
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');

    // Формируем имя файла
    const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const projLbl = proj.name || proj.id.toUpperCase();
    a.href     = url;
    a.download = `ArcticDEM_${date}_${projLbl}_${interval}m.zip`;
    a.click();
    URL.revokeObjectURL(url);

    setProgress(100, '✅ Файл готов!');
    toast(`✅ Файл выгружен: ${a.download}`, 'ok');

    setTimeout(() => {
      if (progWrap) progWrap.style.display = 'none';
      btns.forEach(b => b.disabled = false);
    }, 1500);

  } catch (err) {
    setProgress(0, '');
    if (progWrap) progWrap.style.display = 'none';
    btns.forEach(b => b.disabled = false);
    toast('❌ ' + err.message, 'err');
    console.error('DEM export error:', err);
  }
}
