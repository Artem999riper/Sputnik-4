// ═══════════════════════════════════════════════════════════
// DEM — Загрузка поверхности ArcticDEM + горизонтали
// Экспорт в DXF/SHP с перепроецированием через GDAL (сервер)
// ═══════════════════════════════════════════════════════════

let _demDrawing   = false;   // режим рисования bbox
let _demRect      = null;    // L.rectangle на карте
let _demStart     = null;    // первая точка bbox
let _demTmpLayer  = null;    // временный прямоугольник при рисовании
let _demBbox      = null;    // итоговый bbox {minLat,minLng,maxLat,maxLng}
let _demLastBbox  = (() => { try { return JSON.parse(localStorage.getItem('dem_last_bbox')); } catch(e) { return null; } })();

// ── Источники тайлов для подложки ─────────────────────────
const DEM_SAT_SOURCES = [
  { id:'esri',       label:'Esri World Imagery (спутник)',
    url:'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    subdomains:[] },
  { id:'google_sat', label:'Google Спутник',
    url:'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    subdomains:['0','1','2','3'] },
  { id:'google_hyb', label:'Google Гибрид (спутник + подписи)',
    url:'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    subdomains:['0','1','2','3'] },
  { id:'osm',        label:'Карта (OpenStreetMap)',
    url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains:['a','b','c'] },
  { id:'topo',       label:'OpenTopoMap (тopo + горизонтали)',
    url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains:['a','b','c'] },
];

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
          ${_demLastBbox ? `<button class="btn bs bsm" style="white-space:nowrap" onclick="demRestoreLast()" title="Восстановить предыдущую область">↩ Предыдущее</button>` : ''}
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
          <input type="checkbox" id="dem-cache-only"
            style="width:14px;height:14px;accent-color:var(--acc)"
            onchange="_demToggleCacheOnly()">
          <span>📦 Только кэш <b>ArcticDEM (.tif)</b> — без DXF и спутника</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;
               padding:6px 9px;background:var(--s2);border:1.5px solid var(--bd);
               border-radius:var(--rs);font-size:11px;margin-bottom:5px">
          <input type="checkbox" id="dem-sat-only"
            style="width:14px;height:14px;accent-color:var(--acc)"
            onchange="_demToggleSatOnly()">
          <span>🛰 Только спутник <b>JPEG + JGW</b> (без горизонталей и пикетов)</span>
        </label>
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
        <div id="dem-geoid-status" style="font-size:10px;margin-top:4px;padding:5px 8px;
          border-radius:var(--rs);background:var(--s2);border:1px solid var(--bd)">
          <span style="color:var(--tx3)">⏳ Проверяю геоид-гриды...</span>
          <button onclick="demCheckGeoid()" style="float:right;font-size:9px;padding:1px 6px;
            background:var(--s3);border:1px solid var(--bd);border-radius:3px;cursor:pointer;color:var(--tx2)">
            Обновить
          </button>
        </div>
        <div id="dem-tile-cache" style="font-size:10px;margin-top:4px;padding:5px 8px;
          border-radius:var(--rs);background:var(--s2);border:1px solid var(--bd)">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
            <span id="dem-tile-cache-info" style="color:var(--tx3)">⏳ Кэш тайлов...</span>
            <div style="display:flex;gap:4px">
              <button onclick="demToggleTileCoverage()" id="dem-tile-show-btn"
                style="font-size:9px;padding:1px 7px;background:var(--s3);border:1px solid var(--bd);
                border-radius:3px;cursor:pointer;color:var(--tx2);white-space:nowrap;display:none">
                🗺 Показать
              </button>
              <button onclick="demClearTileCache()" id="dem-tile-cache-btn"
                style="font-size:9px;padding:1px 7px;background:var(--s3);border:1px solid var(--bd);
                border-radius:3px;cursor:pointer;color:var(--tx2);white-space:nowrap;display:none">
                🗑 Очистить
              </button>
            </div>
          </div>
          <div style="margin-top:5px;border-top:1px solid var(--bd);padding-top:5px">
            <div style="display:flex;align-items:center;gap:4px">
              <span style="color:var(--tx3);flex-shrink:0">📁 Папка:</span>
              <span id="dem-tiles-dir-label" style="flex:1;overflow:hidden;text-overflow:ellipsis;
                white-space:nowrap;color:var(--tx2);font-family:monospace">—</span>
              <button onclick="demToggleTilesDirEdit()"
                style="font-size:9px;padding:1px 7px;background:var(--s3);border:1px solid var(--bd);
                border-radius:3px;cursor:pointer;color:var(--tx2);white-space:nowrap;flex-shrink:0">
                ✏️ Изменить
              </button>
            </div>
            <div id="dem-tiles-dir-edit" style="display:none;margin-top:5px">
              <div style="display:flex;gap:4px">
                <input id="dem-tiles-dir-input" type="text" placeholder="Например: D:\\DEM_Cache или /mnt/data/dem_tiles"
                  style="flex:1;font-size:10px;padding:3px 6px;border:1.5px solid var(--bd);
                  border-radius:3px;background:var(--s1)">
                <button onclick="demSaveTilesDir()"
                  style="font-size:9px;padding:2px 10px;background:var(--acc);color:#fff;border:none;
                  border-radius:3px;cursor:pointer;white-space:nowrap">
                  Сохранить
                </button>
              </div>
              <div style="font-size:9px;color:var(--tx3);margin-top:3px">
                Папка будет создана автоматически. Сервер перезапускать не нужно.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="fg" id="dem-sat-source-row">
        <label>Источник подложки</label>
        <select id="dem-sat-source" style="width:100%;font-size:12px;padding:5px 8px;
          border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
          ${DEM_SAT_SOURCES.map(s=>`<option value="${s.id}">${s.label}</option>`).join('')}
        </select>
      </div>

      <div class="fg" id="dem-sat-zoom-row">
        <label>Масштаб подложки (зум тайлов)</label>
        <select id="dem-sat-zoom" style="width:100%;font-size:12px;padding:5px 8px;
          border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
          <option value="0">Авто (подобрать под область)</option>
          <option value="11">z=11 (~80 м/пкс, широкий охват)</option>
          <option value="12">z=12 (~40 м/пкс, обзорный--)</option>
          <option value="13">z=13 (~20 м/пкс, обзорный)</option>
          <option value="14">z=14 (~10 м/пкс, обзорный+)</option>
          <option value="15">z=15 (~5 м/пкс, стандарт)</option>
          <option value="16">z=16 (~2.5 м/пкс, детальный)</option>
          <option value="17">z=17 (~1.2 м/пкс, макс. детализация)</option>
        </select>
        <div style="font-size:10px;color:var(--tx3);margin-top:3px">
          Чем выше зум — тем крупнее файл и дольше загрузка
        </div>
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
  setTimeout(demRefreshTileCache, 100);
  setTimeout(_demLoadTilesDir, 120);
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
  _demLastBbox = _demBbox;
  try { localStorage.setItem('dem_last_bbox', JSON.stringify(_demLastBbox)); } catch(e2) {}

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
        `Загрузка может занять несколько минут.`;
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

function demRestoreLast() {
  if (!_demLastBbox) return;
  _demBbox = _demLastBbox;
  if (_demRect) { try { map.removeLayer(_demRect); } catch(e) {} _demRect = null; }
  const b = L.latLngBounds(
    [_demBbox.minLat, _demBbox.minLng],
    [_demBbox.maxLat, _demBbox.maxLng]
  );
  _demRect = L.rectangle(b, {
    color: '#f59e0b', weight: 2.5,
    fillColor: '#f59e0b', fillOpacity: 0.18,
  }).addTo(map);
  map.fitBounds(b, {padding:[20,20]});
  const latDist = (_demBbox.maxLat - _demBbox.minLat) * 111320;
  const lngDist = (_demBbox.maxLng - _demBbox.minLng) * 111320 *
                  Math.cos((_demBbox.minLat + _demBbox.maxLat) / 2 * Math.PI / 180);
  const areaSqKm = (latDist * lngDist) / 1e6;
  setTimeout(() => {
    const info = document.getElementById('dem-bbox-info');
    if (info) {
      info.style.color = 'var(--grn)';
      info.textContent = `✅ Восстановлено: ${latDist.toFixed(0)}м × ${lngDist.toFixed(0)}м ≈ ${areaSqKm.toFixed(1)} км²`;
    }
    const warn = document.getElementById('dem-size-warn');
    if (warn && areaSqKm > 100) {
      warn.style.display = 'block';
      warn.textContent = `⚠️ Большая область (${areaSqKm.toFixed(0)} км²). Загрузка может занять несколько минут.`;
    }
  }, 50);
}

function demCancelDraw() {
  _demDrawing = false;
  map.off('mousemove', _demMouseMove);
  if (_demTmpLayer) { try { map.removeLayer(_demTmpLayer); } catch(e) {} _demTmpLayer = null; }
  map.getContainer().style.cursor = '';
  const bnr = document.getElementById('bnr');
  if (bnr) { bnr.className = ''; bnr.style.display = 'none'; }
}

// ── Переключение режима "только спутник" ───────────────────
function _demToggleCacheOnly() {
  const cacheOnly = document.getElementById('dem-cache-only')?.checked;
  // В режиме «только кэш» все прочие опции неактуальны — гасим их
  ['dem-sat-only','dem-satellite','dem-bsv77'].forEach(id => {
    const cb = document.getElementById(id);
    if (cb) cb.disabled = !!cacheOnly;
    const row = cb?.closest('label');
    if (row) row.style.opacity = cacheOnly ? '0.35' : '1';
  });
  ['dem-interval','dem-grid-step','dem-jitter-min','dem-jitter-max','dem-sat-source','dem-sat-zoom','dem-proj'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !!cacheOnly;
    const row = el?.closest('.fg');
    if (row) row.style.opacity = cacheOnly ? '0.35' : '1';
  });
  if (cacheOnly && document.getElementById('dem-sat-only')) document.getElementById('dem-sat-only').checked = false;
  const desc = document.querySelector('#mft .fgr > div:first-child b');
  if (desc) desc.textContent = cacheOnly
    ? 'Результат: только .tif в кэш ArcticDEM (для профиля и отметок высот)'
    : 'Результат: ZIP архив с DXF (горизонтали + точки) и JPEG спутником';
}

function _demToggleSatOnly() {
  const satOnly = document.getElementById('dem-sat-only')?.checked;
  const dxfFields = ['dem-interval','dem-grid-step','dem-jitter-min','dem-jitter-max'];
  const dxfRowIds = ['dem-interval','dem-grid-step','dem-jitter-min'];
  dxfRowIds.forEach(id => {
    const row = document.getElementById(id)?.closest('.fg');
    if (row) row.style.opacity = satOnly ? '0.35' : '1';
  });
  // Блок с разбросом — ищем fg с двумя jitter-полями
  document.querySelectorAll('.fg').forEach(row => {
    if (row.querySelector('#dem-jitter-min')) row.style.opacity = satOnly ? '0.35' : '1';
  });
  dxfFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !!satOnly;
  });
  // Чекбокс "добавить спутник" неактуален в режиме satOnly — скрываем его
  const satRow = document.querySelector('label:has(#dem-satellite)');
  if (satRow) satRow.style.display = satOnly ? 'none' : '';
  const bsvRow = document.querySelector('label:has(#dem-bsv77)');
  if (bsvRow) bsvRow.style.display = satOnly ? 'none' : '';
  // Обновляем описание в шапке
  const desc = document.querySelector('#mft .fgr > div:first-child b');
  if (desc) desc.textContent = satOnly
    ? 'Результат: ZIP архив с JPEG спутником и геопривязкой (без DXF)'
    : 'Результат: ZIP архив с DXF (горизонтали + точки) и JPEG спутником';
}

// ── Выгрузка ───────────────────────────────────────────────
async function demExport() {
  if (!_demBbox) { toast('Сначала нарисуйте область на карте', 'err'); return; }

  const projId      = document.getElementById('dem-proj')?.value;
  const interval    = parseFloat(document.getElementById('dem-interval')?.value) || 2;
  const gridStepRaw = document.getElementById('dem-grid-step')?.value ?? '20';
  const gridStep    = (gridStepRaw === '' || gridStepRaw === null) ? 20 : parseInt(gridStepRaw, 10);
  const jitterMin   = parseFloat(document.getElementById('dem-jitter-min')?.value ?? '0') || 0;
  const jitterMax   = parseFloat(document.getElementById('dem-jitter-max')?.value ?? '0') || 0;
  const exportSatellite = document.getElementById('dem-satellite')?.checked !== false;
  const useGeoid    = document.getElementById('dem-bsv77')?.checked !== false;
  const satelliteOnly = document.getElementById('dem-sat-only')?.checked === true;
  const cacheOnly   = document.getElementById('dem-cache-only')?.checked === true;
  const satZoom     = parseInt(document.getElementById('dem-sat-zoom')?.value ?? '0') || 0;
  const satSourceId = document.getElementById('dem-sat-source')?.value || 'esri';
  const satSourceObj = DEM_SAT_SOURCES.find(s => s.id === satSourceId) || DEM_SAT_SOURCES[0];

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

  // SSE-слушатель прогресса
  const _demSse = new EventSource(`${location.origin}/api/events`);
  _demSse.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d.type === 'dem_progress') {
        setProgress(d.pct, d.text);
        console.log(`[DEM ${d.pct}%] ${d.text}`);
      }
    } catch(err) {}
  };

  try {
    setProgress(5, '⏳ Запрос к ArcticDEM...');

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
        exportSatellite: satelliteOnly ? true : exportSatellite,
        satelliteOnly,
        cacheOnly,
        satZoom,
        satSourceUrl: satSourceObj.url,
        satSourceSubdomains: satSourceObj.subdomains,
      }),
    });

    _demSse.close();

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Ошибка сервера');
    }

    // Режим «только кэш»: файла нет, сервер вернул JSON
    if (cacheOnly) {
      const j = await res.json().catch(() => ({}));
      setProgress(100, '✅ Тайл закэширован!');
      toast(j.cached === false
        ? '📦 Территория уже была в кэше'
        : '✅ Тайл ArcticDEM добавлен в кэш', 'ok');
      demRefreshTileCache();
      setTimeout(() => {
        if (progWrap) progWrap.style.display = 'none';
        btns.forEach(b => b.disabled = false);
      }, 1500);
      return;
    }

    setProgress(95, '⏳ Получение файла...');

    // Скачиваем файл
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');

    // Формируем имя файла
    const date    = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const projLbl = proj.name || proj.id.toUpperCase();
    a.href     = url;
    a.download = satelliteOnly
      ? `Satellite_${date}_${projLbl}_z${satZoom||'auto'}.zip`
      : `ArcticDEM_${date}_${projLbl}_${interval}m.zip`;
    a.click();
    URL.revokeObjectURL(url);

    setProgress(100, '✅ Файл готов!');
    toast(`✅ Файл выгружен: ${a.download}`, 'ok');
    demRefreshTileCache();

    setTimeout(() => {
      if (progWrap) progWrap.style.display = 'none';
      btns.forEach(b => b.disabled = false);
    }, 1500);

  } catch (err) {
    _demSse.close();
    setProgress(0, '');
    if (progWrap) progWrap.style.display = 'none';
    btns.forEach(b => b.disabled = false);
    toast('❌ ' + err.message, 'err');
    console.error('DEM export error:', err);
  }
}

// ── Диагностика геоид-гридов ───────────────────────────────
async function demCheckGeoid() {
  const el = document.getElementById('dem-geoid-status');
  if (!el) return;
  el.innerHTML = '<span style="color:var(--tx3)">⏳ Проверяю...</span>';
  try {
    const r = await fetch('/api/dem/status');
    const j = await r.json();
    if (!j.available) {
      el.innerHTML = `<span style="color:var(--ylw)">⚠️ GDAL недоступен</span>`;
      return;
    }
    const grids = j.geoid_grids || [];
    const ok    = grids.filter(g => g.present);
    const miss  = grids.filter(g => !g.present);

    if (ok.length > 0) {
      el.innerHTML =
        `<span style="color:var(--grn)">✅ Геоид OK: ${ok.map(g=>g.file.replace('us_nga_','').replace('.tif','')).join(', ')}</span>` +
        `<button onclick="demCheckGeoid()" style="float:right;font-size:9px;padding:1px 6px;
          background:var(--s3);border:1px solid var(--bd);border-radius:3px;cursor:pointer;color:var(--tx2)">↺</button>`;
    } else {
      const projPath = j.proj_lib || 'C:\\OSGeo4W\\share\\proj';
      el.innerHTML =
        `<span style="color:var(--red,#e02424)">❌ Grid-файлы не найдены</span>` +
        `<button onclick="demDownloadGeoidGrids()" style="margin-left:6px;font-size:9px;padding:2px 8px;
          background:var(--acc);color:#fff;border:none;border-radius:3px;cursor:pointer">
          ⬇ Скачать автоматически
        </button>
        <button onclick="demCheckGeoid()" style="float:right;font-size:9px;padding:1px 6px;
          background:var(--s3);border:1px solid var(--bd);border-radius:3px;cursor:pointer;color:var(--tx2)">↺</button>
        <div style="margin-top:5px;font-size:9px;color:var(--tx3);line-height:1.5">
          Папка PROJ: <code style="background:var(--s3);padding:1px 4px;border-radius:2px">${projPath}</code><br>
          Нужны файлы (скачать вручную с <b>cdn.proj.org</b>):<br>
          &nbsp;• <b>us_nga_egm08_25.tif</b> (~56 МБ) — EGM2008<br>
          &nbsp;• <b>us_nga_egm96_15.tif</b> (~26 МБ) — EGM96 (альтернатива)
        </div>`;
    }
  } catch(e) {
    el.innerHTML = `<span style="color:var(--ylw)">⚠️ Ошибка: ${e.message}</span>`;
  }
}

async function demDownloadGeoidGrids() {
  const el = document.getElementById('dem-geoid-status');
  if (el) el.innerHTML = '<span style="color:var(--acc)">⬇ Скачиваю grid-файлы (EGM2008 ~56МБ, EGM96 ~26МБ)... Подождите.</span>';
  try {
    const r = await fetch('/api/dem/download-geoid-grids', { method: 'POST' });
    const j = await r.json();
    await demCheckGeoid();
    const ok = (j.after || []).filter(g => g.present);
    if (ok.length > 0) toast('✅ Геоид-гриды установлены: ' + ok.map(g=>g.file).join(', '), 'ok');
    else toast('⚠️ Не удалось скачать grid-файлы. Проверьте соединение или скачайте вручную.', 'warn');
  } catch(e) {
    toast('❌ Ошибка скачивания: ' + e.message, 'err');
    await demCheckGeoid();
  }
}

async function _demLoadTilesDir() {
  try {
    const r = await fetch('/api/dem/tiles-dir');
    const j = await r.json();
    const lbl = document.getElementById('dem-tiles-dir-label');
    const inp = document.getElementById('dem-tiles-dir-input');
    if (lbl) lbl.textContent = j.dir || '—';
    if (inp) inp.value = j.dir || '';
  } catch(_) {}
}

function demToggleTilesDirEdit() {
  const el = document.getElementById('dem-tiles-dir-edit');
  if (!el) return;
  el.style.display = el.style.display === 'none' ? '' : 'none';
}

async function demSaveTilesDir() {
  const inp = document.getElementById('dem-tiles-dir-input');
  const dir = (inp ? inp.value : '').trim();
  if (!dir) { toast('Введите путь к папке', 'warn'); return; }
  try {
    const r = await fetch('/api/dem/tiles-dir', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir }),
    });
    const j = await r.json();
    if (!r.ok) { toast('❌ ' + (j.error || 'Ошибка'), 'err'); return; }
    const lbl = document.getElementById('dem-tiles-dir-label');
    if (lbl) lbl.textContent = j.dir;
    if (inp) inp.value = j.dir;
    document.getElementById('dem-tiles-dir-edit').style.display = 'none';
    toast('✅ Путь сохранён: ' + j.dir, 'ok');
    await demRefreshTileCache();
  } catch(e) {
    toast('❌ ' + e.message, 'err');
  }
}

async function demRefreshTileCache() {
  const el      = document.getElementById('dem-tile-cache-info');
  const btn     = document.getElementById('dem-tile-cache-btn');
  const showBtn = document.getElementById('dem-tile-show-btn');
  if (!el) return;
  try {
    const r = await fetch('/api/dem/tiles-info');
    const j = await r.json();
    const tiles = j.tiles || [];
    if (tiles.length === 0) {
      el.innerHTML = '<span style="color:var(--tx3)">Нет кэшированных тайлов рельефа</span>';
      if (btn)     btn.style.display = 'none';
      if (showBtn) showBtn.style.display = 'none';
    } else {
      const totalMb = (tiles.reduce((s, t) => s + (t.size || 0), 0) / 1024 / 1024).toFixed(0);
      el.innerHTML = `<span style="color:var(--grn)">✅ Тайлы рельефа: ${tiles.length} шт. (${totalMb} МБ) — профиль использует ArcticDEM</span>`;
      if (btn)     btn.style.display = '';
      if (showBtn) showBtn.style.display = '';
    }
  } catch(e) {
    if (el) el.innerHTML = '<span style="color:var(--tx3)">—</span>';
  }
}

// ── Покрытие тайлов на карте ───────────────────────────────
let _demTileLayers = [];

async function demToggleTileCoverage() {
  const btn = document.getElementById('dem-tile-show-btn');
  if (_demTileLayers.length) {
    _demTileLayers.forEach(l => { try { map.removeLayer(l); } catch(_) {} });
    _demTileLayers = [];
    if (btn) btn.textContent = '🗺 Показать';
    return;
  }
  try {
    const r = await fetch('/api/dem/tiles-bbox');
    const tiles = await r.json();
    if (!tiles.length) { toast('Нет тайлов для отображения', 'warn'); return; }
    tiles.forEach(t => {
      const b = t.bbox;
      const mb = (t.size / 1024 / 1024).toFixed(0);
      const rect = L.rectangle(
        [[b.minLat, b.minLng], [b.maxLat, b.maxLng]],
        { color: '#f59e0b', weight: 2, fillOpacity: 0.08, dashArray: '6 4' }
      ).addTo(map);
      rect.bindTooltip(`📐 ArcticDEM кэш<br><b>${t.file}</b><br>${mb} МБ`, { sticky: true });
      _demTileLayers.push(rect);
    });
    closeModal();
    if (btn) btn.textContent = '🗺 Скрыть';
  } catch(e) {
    toast('❌ ' + e.message, 'err');
  }
}

async function demClearTileCache() {
  if (!confirm('Удалить все кэшированные тайлы рельефа? Следующий профиль высот будет использовать Terrarium до нового экспорта.')) return;
  // Убрать слои с карты
  _demTileLayers.forEach(l => { try { map.removeLayer(l); } catch(_) {} });
  _demTileLayers = [];
  const el = document.getElementById('dem-tile-cache-info');
  if (el) el.innerHTML = '<span style="color:var(--tx3)">⏳ Очищаю...</span>';
  try {
    const r = await fetch('/api/dem/tiles', { method: 'DELETE' });
    const j = await r.json();
    toast(`🗑 Удалено тайлов: ${j.deleted}`, 'ok');
    await demRefreshTileCache();
  } catch(e) {
    toast('❌ ' + e.message, 'err');
  }
}

// Запустить проверку при первом открытии модалки
document.addEventListener('DOMContentLoaded', () => {
  // Отложенная проверка — не мешаем загрузке страницы
  setTimeout(() => { demCheckGeoid(); demRefreshTileCache(); }, 3000);
});
