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
let _demClip      = null;    // GeoJSON-полигон обрезки (для полигона/коридора), [lng,lat]; null = весь bbox
let _demVerts     = null;    // вершины текущего полигона/линии при рисовании
let _demVertMode  = null;    // 'polygon' | 'line'
let _demVertTmp   = null;    // временный слой (линия/полигон) при рисовании
let _demVertMouse = null;    // «резиновая» линия до курсора
let _demBufferM   = 100;     // буфер коридора (м), фиксируется при старте рисования линии

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
  // МСК-86 убрана из этого списка — дублировала «МСК по региону → МСК-86»
  // (зоны 3/4/5 там идентичны, зона выбирается автоматически по центру области).
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
      <b>Результат:</b> ZIP архив с DXF (горизонтали + точки) и спутником (GeoTIFF с геопривязкой)
    </div>
    <div class="fgr">
      <div class="fg s2">
        <label>1. Область на карте</label>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <button class="btn bp bsm" onclick="demStartDraw()" title="Прямоугольная область">▭ Прямоугольник</button>
          <button class="btn bs bsm" onclick="demStartPolygon()" title="Произвольный полигон — кликайте вершины, двойной клик для завершения">⬠ Полигон</button>
          <button class="btn bs bsm" onclick="demStartLine()" title="Линия с буфером (для линейных объектов) — кликайте точки, двойной клик для завершения">〰 Линия+буфер</button>
          <button class="btn bs bsm" onclick="demBatchByLayer()" title="Выгрузить сразу по всем (или выбранным) полигонам слоя — каждый участок отдельно, в одном архиве">📚 Пакет по слою</button>
          ${_demLastBbox ? `<button class="btn bs bsm" style="white-space:nowrap" onclick="demRestoreLast()" title="Восстановить предыдущую область">↩ Пред.</button>` : ''}
          <button class="btn bs bsm" onclick="demClearDraw()">✕</button>
        </div>
        <div id="dem-buf-row" style="display:flex;margin-top:5px;align-items:center;gap:6px">
          <span style="font-size:11px;color:var(--tx2)">Буфер от линии (м):</span>
          <input id="dem-buffer" type="number" value="100" min="1" max="100000" step="10"
            style="width:90px;font-size:12px;padding:4px 7px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
        </div>
        <div id="dem-bbox-info" style="margin-top:5px;font-size:10px;color:var(--tx3)">
          Область не выбрана
        </div>
      </div>

      <div class="fg">
        <label>Система координат</label>
        <select id="dem-proj" onchange="_demUpdateZoneSelect()" style="width:100%;font-size:12px;padding:5px 8px;
          border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
          ${projOpts}
        </select>
        <div id="dem-zone-wrap" style="display:none;margin-top:5px;align-items:center;gap:6px">
          <span style="font-size:11px;color:var(--tx2);white-space:nowrap">Зона:</span>
          <select id="dem-zone" style="flex:1;font-size:12px;padding:4px 7px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
            <option value="">Авто (по центру области)</option>
          </select>
        </div>
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
          <span>🛰 Только спутник <b>GeoTIFF</b> с геопривязкой (без горизонталей)</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;
               padding:6px 9px;background:var(--s2);border:1.5px solid var(--bd);
               border-radius:var(--rs);font-size:11px;margin-bottom:5px">
          <input type="checkbox" id="dem-satellite" checked
            style="width:14px;height:14px;accent-color:var(--acc)">
          <span>🛰 Добавить спутник <b>GeoTIFF</b> (геопривязка внутри файла)</span>
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
              <button onclick="demClearTileCacheBbox()" id="dem-tile-cache-bbox-btn"
                title="Удалить кэш только под нарисованной рамкой"
                style="font-size:9px;padding:1px 7px;background:var(--s3);border:1px solid var(--bd);
                border-radius:3px;cursor:pointer;color:var(--tx2);white-space:nowrap;display:none">
                🗑 По рамке
              </button>
              <button onclick="demClearTileCache()" id="dem-tile-cache-btn"
                title="Удалить весь кэш тайлов рельефа"
                style="font-size:9px;padding:1px 7px;background:var(--s3);border:1px solid var(--bd);
                border-radius:3px;cursor:pointer;color:var(--tx2);white-space:nowrap;display:none">
                🗑 Всё
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
                  border-radius:3px;background:var(--s)">
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
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:6px;
               padding:6px 9px;background:var(--s2);border:1.5px solid var(--bd);border-radius:var(--rs);font-size:11px">
          <input type="checkbox" id="dem-sat-1m" style="width:14px;height:14px;accent-color:var(--acc)"
            ${(() => { try { return localStorage.getItem('dem_sat_1m') === '0' ? '' : 'checked'; } catch(e) { return 'checked'; } })()}
            onchange="try{localStorage.setItem('dem_sat_1m',this.checked?'1':'0')}catch(e){}">
          <span>📐 Подложка <b>1 пиксель = 1 метр</b> (для МенуГЕО/AutoCAD: масштаб при вставке сразу верный, без домножения; детализация до 1 м)</span>
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
  setTimeout(demRefreshTileCache, 100);
  setTimeout(_demLoadTilesDir, 120);
  // Добавляем в список СК все региональные МСК (авто зона по центру области)
  if (typeof loadMskFull === 'function') {
    loadMskFull().then(() => { _demAppendMskOptions(); _demUpdateZoneSelect(); }).catch(()=>{});
  }
  _demAppendUtmOption();
  setTimeout(_demUpdateZoneSelect, 60);
}

// UTM (WGS-84, северное полушарие) — авто зона по центру области.
function _demAppendUtmOption() {
  const sel = document.getElementById('dem-proj');
  if (!sel || sel.querySelector('option[value="utmauto"]')) return;
  const o = document.createElement('option');
  o.value = 'utmauto';
  o.textContent = 'UTM / WGS-84 (авто зона, сев.)';
  sel.appendChild(o);
}
function _demBuildUtmProj(projId, forcedZone) {
  if (projId !== 'utmauto' || !_demBbox) return null;
  let zone = parseInt(forcedZone) || 0;
  if (!(zone >= 1 && zone <= 60)) {
    const clng = (_demBbox.minLng + _demBbox.maxLng) / 2;
    zone = (typeof utmZoneFromLng === 'function') ? utmZoneFromLng(clng) : (Math.floor((clng + 180) / 6) + 1);
  }
  return { id: projId, proj4: `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`, epsg: 32600 + zone, name: `UTM${zone}N` };
}

// Наполняет селектор зоны в зависимости от выбранной СК. Для систем с зонами
// (МСК по региону, UTM) показывает список зон + «Авто»; иначе прячет.
function _demUpdateZoneSelect() {
  const projSel = document.getElementById('dem-proj');
  const zoneSel = document.getElementById('dem-zone');
  const wrap = document.getElementById('dem-zone-wrap');
  if (!projSel || !zoneSel || !wrap) return;
  const v = projSel.value || '';
  let opts = '<option value="">Авто (по центру области)</option>';
  let show = false;
  if (v.indexOf('mskfull:') === 0) {
    const reg = v.split(':')[1];
    const zs = (typeof MSK_FULL === 'object' && MSK_FULL && MSK_FULL.regions && MSK_FULL.regions[reg]) || [];
    zs.forEach(z => { opts += `<option value="${z.z}">зона ${z.z} (ЦМ ${z.lon}°)</option>`; });
    show = zs.length > 1;
  } else if (v === 'utmauto') {
    for (let z = 1; z <= 60; z++) opts += `<option value="${z}">зона ${z}N</option>`;
    show = true;
  }
  zoneSel.innerHTML = opts;
  wrap.style.display = show ? 'flex' : 'none';
}

// Оценка спутниковой подложки для области (та же математика, что на сервере).
// Возвращает {zoom, tilesX, tilesY, tiles, w, h}. Чем больше контур — тем мельче
// зум и грубее подложка; при очень больших — предупреждаем заранее.
function _demSatEstimate(b) {
  const TILE = 256, MINZ = 5, target = 6000;  // как в buildSatellite на сервере
  const lon2t = (lon, z) => Math.floor((lon + 180) / 360 * Math.pow(2, z));
  const lat2t = (lat, z) => { const r = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180); return Math.floor((1 - r / 180) * Math.pow(2, z) / 2); };
  let z = MINZ;
  for (let zz = 17; zz >= MINZ; zz--) {
    const tx = Math.abs(lon2t(b.maxLng, zz) - lon2t(b.minLng, zz)) + 1;
    const ty = Math.abs(lat2t(b.minLat, zz) - lat2t(b.maxLat, zz)) + 1;
    if (tx * TILE <= target && ty * TILE <= target) { z = zz; break; }
  }
  const tilesX = Math.abs(lon2t(b.maxLng, z) - lon2t(b.minLng, z)) + 1;
  const tilesY = Math.abs(lat2t(b.minLat, z) - lat2t(b.maxLat, z)) + 1;
  return { zoom: z, tilesX, tilesY, tiles: tilesX * tilesY, w: tilesX * TILE, h: tilesY * TILE };
}

// Дописывает в выпадающий список проекций все регионы МСК (из msk-zones.json).
function _demAppendMskOptions() {
  const sel = document.getElementById('dem-proj');
  if (!sel || typeof MSK_FULL !== 'object' || !MSK_FULL || !MSK_FULL.regions) return;
  if (sel.querySelector('optgroup[data-msk]')) return;      // уже добавлено
  const og = document.createElement('optgroup');
  og.label = 'МСК (все регионы, авто зона)';
  og.setAttribute('data-msk', '1');
  Object.keys(MSK_FULL.regions).sort((a,b)=>parseInt(a,10)-parseInt(b,10)).forEach(r => {
    const o = document.createElement('option');
    o.value = 'mskfull:' + r;
    o.textContent = 'МСК-' + r + ' (авто зона)';
    og.appendChild(o);
  });
  sel.appendChild(og);
}


// ── Начать рисование bbox ──────────────────────────────────
function demStartDraw() {
  closeModal();
  _demCancelVerts();            // прервать незавершённый полигон/линию, если был
  _demClip = null;
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
  _demClip = null;                 // прямоугольник — без обрезки по контуру
  _demFinalize(b);
}

// Общий финал после выбора области (прямоугольник/полигон/линия+буфер).
function _demFinalize(b) {
  _demDrawing = false;
  map.getContainer().style.cursor = '';
  const bnr = document.getElementById('bnr');
  if (bnr) { bnr.className = ''; bnr.style.display = 'none'; }

  // Считаем площадь bbox
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
      const clipNote = _demClip
        ? (_demVertMode === 'line' ? ' · обрезка по коридору линии' : ' · обрезка по полигону')
        : '';
      info.textContent =
        `✅ Область: ${latDist.toFixed(0)}м × ${lngDist.toFixed(0)}м ≈ ${areaSqKm.toFixed(1)} км²${clipNote}`;
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
      _demUpdateZoneSelect();
    }
    // Предупреждение о площади + ранняя оценка спутниковой подложки
    const warn = document.getElementById('dem-size-warn');
    if (warn && _demBbox) {
      const satOn = document.getElementById('dem-satellite')?.checked !== false;
      const est = _demSatEstimate(_demBbox);
      const msgs = [];
      if (areaSqKm > 100) msgs.push(`⚠️ Большая область (${areaSqKm.toFixed(0)} км²) — загрузка может занять несколько минут.`);
      if (satOn) {
        if (est.zoom <= 13) {
          msgs.push(`🛰 На «Авто» спутник для этой площади будет грубоват (zoom ${est.zoom}). ` +
                    `Для <b>большой площади в хорошем качестве</b> поднимите «Масштаб подложки» ниже (z15–z17) — ` +
                    `подложка автоматически разобьётся на части (несколько GeoTIFF с привязкой).`);
        } else {
          msgs.push(`🛰 Спутник (Авто): zoom ${est.zoom}, ~${est.w}×${est.h} px. ` +
                    `Нужен крупнее — поднимите «Масштаб подложки» (большие области разбиваются на части).`);
        }
      }
      if (msgs.length) { warn.style.display = 'block'; warn.innerHTML = msgs.join('<br>'); }
      else warn.style.display = 'none';
    }
  }, 100);
}

// ── Рисование полигона / линии+буфера ──────────────────────
function demStartPolygon() { _demStartVerts('polygon'); }
function demStartLine() {
  // Буфер считываем ДО закрытия панели (во время рисования поля нет в DOM)
  const bi = document.getElementById('dem-buffer');
  _demBufferM = Math.max(1, parseFloat(bi && bi.value) || 100);
  _demStartVerts('line');
}

function _demStartVerts(mode) {
  closeModal();
  _demCancelVerts();
  _demVertMode = mode;
  _demVerts = [];
  _demDrawing = true;
  map.getContainer().style.cursor = 'crosshair';
  const bnr = document.getElementById('bnr');
  if (bnr) {
    bnr.className = 'show draw';
    document.getElementById('bnr-t').textContent = mode === 'line'
      ? '〰 Кликайте точки линии · ПКМ или Enter — завершить · Esc — отмена · Alt — без привязки'
      : '⬠ Кликайте вершины полигона · ПКМ или Enter — завершить · Esc — отмена · Alt — без привязки';
    bnr.style.display = 'flex';
  }
  map.on('click', _demVertClick);
  map.on('mousemove', _demVertMoveRubber);
  map.on('contextmenu', _demVertCtx);        // ПКМ → меню «Завершить / Отмена»
  document.addEventListener('keydown', _demVertKey);
}

// ПКМ во время рисования: меню завершения
function _demVertCtx(e) {
  if (!_demVertMode) return;
  if (e.originalEvent) { e.originalEvent.preventDefault(); L.DomEvent.stopPropagation(e); }
  const need = _demVertMode === 'line' ? 2 : 3;
  const enough = (_demVerts || []).length >= need;
  const cx = e.originalEvent ? e.originalEvent.clientX : 100;
  const cy = e.originalEvent ? e.originalEvent.clientY : 100;
  showCtx(cx, cy, [
    { i:'✅', l: enough ? 'Завершить' : `Нужно ещё точек (мин. ${need})`, f: enough ? _demVertFinish : null, cls: enough ? '' : '' },
    ...((_demVerts || []).length ? [{ i:'↩', l:'Удалить последнюю точку', f:_demVertUndo }] : []),
    { sep:true },
    { i:'✕', l:'Отмена', cls:'dan', f:_demCancelVerts },
  ]);
}
function _demVertUndo() {
  if (_demVerts && _demVerts.length) { _demVerts.pop(); _demRedrawVerts(null); }
}

// Клавиши: Enter — завершить, Esc — отмена
function _demVertKey(e) {
  if (!_demVertMode) return;
  if (e.key === 'Enter') { e.preventDefault(); _demVertFinish(); }
  else if (e.key === 'Escape') { _demCancelVerts(); }
}

function _demVertClick(e) {
  if (!_demVertMode) return;
  _demVerts.push(typeof mapSnapLL==='function'?mapSnapLL(e.latlng,e):e.latlng);
  _demRedrawVerts(null);
}

function _demVertMoveRubber(e) {
  if (!_demVertMode || !_demVerts.length) return;
  _demRedrawVerts(e.latlng);
}

function _demRedrawVerts(cursor) {
  const pts = cursor ? _demVerts.concat([cursor]) : _demVerts.slice();
  if (_demVertTmp) { try { map.removeLayer(_demVertTmp); } catch(e) {} _demVertTmp = null; }
  if (pts.length < 1) return;
  if (_demVertMode === 'polygon' && pts.length >= 3) {
    _demVertTmp = L.polygon(pts, { color:'#f59e0b', weight:2, dashArray:'6 4', fillColor:'#f59e0b', fillOpacity:0.12 }).addTo(map);
  } else {
    _demVertTmp = L.polyline(pts, { color:'#f59e0b', weight:2.5, dashArray:'6 4' }).addTo(map);
  }
}

function _demVertFinish() {
  if (!_demVertMode) return;
  const mode = _demVertMode;
  const verts = _demVerts.slice();
  const need = mode === 'line' ? 2 : 3;
  if (verts.length < need) { toast(mode === 'line' ? 'Нужно минимум 2 точки' : 'Нужно минимум 3 вершины', 'err'); return; }

  // Строим полигон обрезки (для линии — коридор по буферу)
  let ring; // массив [lng,lat]
  if (mode === 'line') {
    ring = _demBufferLine(verts, _demBufferM);
    if (!ring) { toast('Не удалось построить буфер', 'err'); return; }
  } else {
    ring = verts.map(p => [p.lng, p.lat]);
    ring.push([verts[0].lng, verts[0].lat]); // замкнуть
  }

  // bbox по кольцу
  let minLat=90, maxLat=-90, minLng=180, maxLng=-180;
  for (const [lng, lat] of ring) { if (lat<minLat)minLat=lat; if (lat>maxLat)maxLat=lat; if (lng<minLng)minLng=lng; if (lng>maxLng)maxLng=lng; }
  _demBbox = { minLat, maxLat, minLng, maxLng };
  _demLastBbox = _demBbox;
  try { localStorage.setItem('dem_last_bbox', JSON.stringify(_demLastBbox)); } catch(e) {}
  _demClip = { type:'Polygon', coordinates:[ring] };

  _demCleanupVertListeners();
  if (_demVertTmp) { try { map.removeLayer(_demVertTmp); } catch(e) {} _demVertTmp = null; }
  if (_demRect) { try { map.removeLayer(_demRect); } catch(e) {} _demRect = null; }
  // Рисуем итоговую фигуру (храним в _demRect, чтобы demClearDraw её убрал)
  _demRect = L.polygon(ring.map(c => [c[1], c[0]]), { color:'#f59e0b', weight:2.5, fillColor:'#f59e0b', fillOpacity:0.18 }).addTo(map);

  _demFinalize(L.latLngBounds([minLat, minLng], [maxLat, maxLng]));
}

function _demCleanupVertListeners() {
  map.off('click', _demVertClick);
  map.off('mousemove', _demVertMoveRubber);
  map.off('contextmenu', _demVertCtx);
  document.removeEventListener('keydown', _demVertKey);
}

function _demCancelVerts() {
  _demCleanupVertListeners();
  _demVertMode = null; _demVerts = null; _demDrawing = false;
  map.getContainer().style.cursor = '';
  const bnr = document.getElementById('bnr'); if (bnr) { bnr.className = ''; bnr.style.display = 'none'; }
  if (_demVertTmp) { try { map.removeLayer(_demVertTmp); } catch(e) {} _demVertTmp = null; }
}

// Буфер (коридор) вокруг ломаной линии: возвращает кольцо [lng,lat].
// Смещение вершин в локальной метрической плоскости на bufM метров в обе стороны.
function _demBufferLine(latlngs, bufM) {
  if (!latlngs || latlngs.length < 2) return null;
  const lat0 = latlngs.reduce((s,p)=>s+p.lat,0)/latlngs.length;
  const mLat = 111320, mLng = 111320 * Math.cos(lat0*Math.PI/180);
  const P = latlngs.map(p => ({ x:p.lng*mLng, y:p.lat*mLat }));
  const n = P.length;
  const segN = [];
  for (let i=0;i<n-1;i++){ let dx=P[i+1].x-P[i].x, dy=P[i+1].y-P[i].y; const l=Math.hypot(dx,dy)||1; segN.push({x:-dy/l, y:dx/l}); }
  const vN = [];
  for (let i=0;i<n;i++){
    let nx, ny;
    if (i===0){ nx=segN[0].x; ny=segN[0].y; }
    else if (i===n-1){ nx=segN[n-2].x; ny=segN[n-2].y; }
    else {
      nx=segN[i-1].x+segN[i].x; ny=segN[i-1].y+segN[i].y; const l=Math.hypot(nx,ny)||1; nx/=l; ny/=l;
      const cosHalf = Math.max(0.25, segN[i-1].x*nx + segN[i-1].y*ny);
      const scale = Math.min(4, 1/cosHalf); nx*=scale; ny*=scale;
    }
    vN.push({x:nx, y:ny});
  }
  const left=[], right=[];
  for (let i=0;i<n;i++){ left.push({x:P[i].x+vN[i].x*bufM, y:P[i].y+vN[i].y*bufM}); right.push({x:P[i].x-vN[i].x*bufM, y:P[i].y-vN[i].y*bufM}); }
  const ringM = left.concat(right.reverse());
  const ring = ringM.map(p => [p.x/mLng, p.y/mLat]);
  ring.push(ring[0]);
  return ring;
}

function demClearDraw() {
  _demCancelVerts();
  if (_demRect) { try { map.removeLayer(_demRect); } catch(e) {} _demRect = null; }
  _demBbox = null;
  _demClip = null;
  const info = document.getElementById('dem-bbox-info');
  if (info) { info.style.color = 'var(--tx3)'; info.textContent = 'Область не выбрана'; }
  const warn = document.getElementById('dem-size-warn');
  if (warn) warn.style.display = 'none';
}

function demRestoreLast() {
  if (!_demLastBbox) return;
  _demCancelVerts();
  _demBbox = _demLastBbox;
  _demClip = null;              // «Предыдущее» восстанавливает прямоугольник bbox без обрезки
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
    : 'Результат: ZIP архив с DXF (горизонтали + точки) и спутником (GeoTIFF с геопривязкой)';
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
    ? 'Результат: ZIP архив со спутником (GeoTIFF с геопривязкой) (без DXF)'
    : 'Результат: ZIP архив с DXF (горизонтали + точки) и спутником (GeoTIFF с геопривязкой)';
}

// ── Выгрузка ───────────────────────────────────────────────
// Строит объект проекции для выбранной региональной МСК (projId = "mskfull:<регион>").
// Зона — по центральному меридиану выбранной области.
function _demBuildMskProj(projId, forcedZone) {
  if (typeof projId !== 'string' || projId.indexOf('mskfull:') !== 0) return null;
  if (typeof MSK_FULL !== 'object' || !MSK_FULL || !MSK_FULL.regions || !_demBbox) return null;
  const reg = projId.split(':')[1];
  const zs = MSK_FULL.regions[reg] || [];
  let z = null;
  const fz = parseInt(forcedZone) || 0;
  if (fz) z = zs.find(q => q.z === fz) || null;
  if (!z) {
    const clng = (_demBbox.minLng + _demBbox.maxLng) / 2;
    z = (typeof _mskFullPickZone === 'function') ? _mskFullPickZone(reg, clng) : null;
  }
  if (!z) return null;
  const tw = (MSK_FULL.datums && MSK_FULL.datums['2008']) || [23.57,-140.95,-79.8,0,0.35,0.79,-0.22];
  const ellps = MSK_FULL.ellps || 'krass';
  const proj4 = `+proj=tmerc +lat_0=0 +lon_0=${z.lon} +k=1 +x_0=${z.x0} +y_0=${z.y0}` +
                ` +ellps=${ellps} +towgs84=${tw.join(',')} +units=m +no_defs`;
  return { id: projId, proj4, epsg: null, name: `MSK-${reg}_z${z.z}` };
}
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

  const forcedZone = parseInt(document.getElementById('dem-zone')?.value) || 0;
  const proj = DEM_PROJECTIONS.find(p => p.id === projId) || _demBuildMskProj(projId, forcedZone) || _demBuildUtmProj(projId, forcedZone);
  if (!proj) { toast('Выберите систему координат', 'err'); return; }
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

  // Проверка: сервер (node) должен быть той же версии, что и страница.
  // Если файлы обновили, а окно сервера не перезапустили — выгрузка уйдёт
  // в старом формате (JPG, без режима «1 пиксель = 1 метр»).
  try {
    const si = await fetch(`${API}/server-info`).then(r => r.json());
    if (!si || !Array.isArray(si.features) || !si.features.includes('sat-geotiff-1m')) {
      alert('⚠️ Сервер запущен со СТАРОЙ версией программы.\n\n' +
            'Страница обновлена, а сервер — нет, поэтому подложка выгрузится в старом формате ' +
            '(satellite.jpg, неверный масштаб/положение в МенуГЕО).\n\n' +
            'Закройте ВСЕ чёрные окна сервера, проверьте, что новые файлы (dem-processor.js, ' +
            'routes/misc.js, server.js) скопированы в папку программы, и запустите start.bat заново.');
      if (progWrap) progWrap.style.display = 'none';
      return;
    }
  } catch (e) {}

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
        clip:     _demClip || null,
        satMPP:   document.getElementById('dem-sat-1m')?.checked ? 1 : 0,
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
    // Главное — работает ли перевод на деле (файлы могут лежать и в другой папке PROJ)
    const t = await fetch('/api/dem/geoid-test').then(r => r.json()).catch(() => ({}));
    if (t.ok) {
      el.innerHTML = `<span style="color:var(--grn)">✅ БСВ-77 работает: поправка геоида в ХМАО ${(+t.n).toFixed(2)} м</span>` +
        `<button onclick="demCheckGeoid()" style="float:right;font-size:9px;padding:1px 6px;background:var(--s3);border:1px solid var(--bd);border-radius:3px;cursor:pointer;color:var(--tx2)">↺</button>`;
      return;
    }
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
  const bboxBtn = document.getElementById('dem-tile-cache-bbox-btn');
  const showBtn = document.getElementById('dem-tile-show-btn');
  if (!el) return;
  try {
    const r = await fetch('/api/dem/tiles-info');
    const j = await r.json();
    const tiles = j.tiles || [];
    if (tiles.length === 0) {
      el.innerHTML = '<span style="color:var(--tx3)">Нет кэшированных тайлов рельефа</span>';
      if (btn)     btn.style.display = 'none';
      if (bboxBtn) bboxBtn.style.display = 'none';
      if (showBtn) showBtn.style.display = 'none';
    } else {
      const totalMb = (tiles.reduce((s, t) => s + (t.size || 0), 0) / 1024 / 1024).toFixed(0);
      el.innerHTML = `<span style="color:var(--grn)">✅ Тайлы рельефа: ${tiles.length} шт. (${totalMb} МБ) — профиль использует ArcticDEM</span>`;
      if (btn)     btn.style.display = '';
      if (bboxBtn) bboxBtn.style.display = '';
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
  if (!await confirmDlg('Удалить все кэшированные тайлы рельефа? Следующий профиль высот будет использовать Terrarium до нового экспорта.')) return;
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

// Очистить кэш ТОЛЬКО под нарисованной рамкой (пересекающиеся тайлы)
async function demClearTileCacheBbox() {
  if (!_demBbox) { toast('Сначала нарисуйте рамку области (✏️ Нарисовать прямоугольник)', 'err'); return; }
  if (!await confirmDlg('Удалить кэшированные тайлы рельефа, попадающие в нарисованную рамку? При следующем экспорте эта область скачается заново.')) return;
  const el = document.getElementById('dem-tile-cache-info');
  if (el) el.innerHTML = '<span style="color:var(--tx3)">⏳ Очищаю по рамке...</span>';
  try {
    const r = await fetch('/api/dem/tiles/clear-bbox', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bbox: _demBbox }),
    });
    const j = await r.json();
    if (!r.ok) { toast('❌ ' + (j.error || 'Ошибка'), 'err'); await demRefreshTileCache(); return; }
    toast(j.deleted ? `🗑 Удалено тайлов в рамке: ${j.deleted}` : 'В рамке нет кэшированных тайлов', j.deleted ? 'ok' : 'err');
    // Обновить наложение покрытия, если оно показано
    if (_demTileLayers.length) { _demTileLayers.forEach(l => { try { map.removeLayer(l); } catch(_) {} }); _demTileLayers = []; await demToggleTileCoverage(); }
    await demRefreshTileCache();
  } catch(e) {
    toast('❌ ' + e.message, 'err');
    await demRefreshTileCache();
  }
}

// Запустить проверку при первом открытии модалки
document.addEventListener('DOMContentLoaded', () => {
  // Отложенная проверка — не мешаем загрузке страницы
  setTimeout(() => { demCheckGeoid(); demRefreshTileCache(); }, 3000);
});

// ═══ Пакетная выгрузка рельефа по полигонам слоя (№21) ══════════════════
// Каждый полигон — отдельный участок со своей обрезкой и своей зоной СК;
// всё складывается в один ZIP (папка на участок + «Отчёт.txt»).
function _demCommonParams() {
  const gs = document.getElementById('dem-grid-step')?.value ?? '20';
  const satSourceId = document.getElementById('dem-sat-source')?.value || 'esri';
  const so = DEM_SAT_SOURCES.find(s => s.id === satSourceId) || DEM_SAT_SOURCES[0];
  const satelliteOnly = document.getElementById('dem-sat-only')?.checked === true;
  return {
    interval: parseFloat(document.getElementById('dem-interval')?.value) || 2,
    gridStep: (gs === '' || gs === null) ? 20 : parseInt(gs, 10),
    jitterMin: parseFloat(document.getElementById('dem-jitter-min')?.value ?? '0') || 0,
    jitterMax: parseFloat(document.getElementById('dem-jitter-max')?.value ?? '0') || 0,
    useGeoid: document.getElementById('dem-bsv77')?.checked !== false,
    exportSatellite: satelliteOnly ? true : document.getElementById('dem-satellite')?.checked !== false,
    satelliteOnly,
    satZoom: parseInt(document.getElementById('dem-sat-zoom')?.value ?? '0') || 0,
    satMPP: document.getElementById('dem-sat-1m')?.checked ? 1 : 0,
    satSourceUrl: so.url, satSourceSubdomains: so.subdomains,
  };
}
function _demPolysOfLayer(l) {
  let gj; try { gj = JSON.parse(l.geojson); } catch (e) { return []; }
  const out = [];
  (gj.features || []).forEach((f, i) => {
    const g = f && f.geometry; if (!g) return;
    const nm = (f.properties && (f.properties.name || f.properties.Name || f.properties['НАЗВ'])) || `Полигон ${i + 1}`;
    if (g.type === 'Polygon') out.push({ name: String(nm), ring: g.coordinates[0] });
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((p, k) => out.push({ name: `${nm}${g.coordinates.length > 1 ? ' (' + (k + 1) + ')' : ''}`, ring: p[0] }));
  });
  return out.filter(p => p.ring && p.ring.length >= 4);
}
function demBatchByLayer(layerId) {
  const cand = (layers || []).map(l => ({ l, polys: _demPolysOfLayer(l) })).filter(x => x.polys.length);
  if (!cand.length) { toast('Нет слоёв с полигонами. Импортируйте или нарисуйте контуры участков', 'warn'); return; }
  const cur = cand.find(x => x.l.id === layerId) || cand[0];
  // Параметры окна «Рельеф» — запоминаем сейчас, пока окно открыто (дальше его заменит окно пакета)
  window._demBatchCfg = { params: _demCommonParams(), projId: document.getElementById('dem-proj')?.value, forcedZone: parseInt(document.getElementById('dem-zone')?.value) || 0 };
  const projSel = document.getElementById('dem-proj');
  const projLbl = projSel ? projSel.options[projSel.selectedIndex]?.text : '';
  const render = c => `
    <div class="fg s2"><label>Слой с участками</label>
      <select id="demb-layer" onchange="window._demBatchRender(this.value)" style="width:100%">
        ${cand.map(x => `<option value="${escAttr(x.l.id)}" ${x.l.id === c.l.id ? 'selected' : ''}>${esc(x.l.name)} — ${x.polys.length} полиг.</option>`).join('')}</select></div>
    <div style="font-size:11px;font-weight:700;margin:6px 0 4px">Участки
      <button class="btn bs bxs" onclick="document.querySelectorAll('.demb-p').forEach(c=>c.checked=true)">все</button>
      <button class="btn bs bxs" onclick="document.querySelectorAll('.demb-p').forEach(c=>c.checked=false)">ни одного</button></div>
    <div style="max-height:220px;overflow:auto;border:1.5px solid var(--bd);border-radius:var(--rs);padding:4px 8px">
      ${c.polys.map((p, i) => { const km2 = typeof _geoArea === 'function' ? _geoArea(p.ring.slice(0, -1).map(q => ({ lat: q[1], lng: q[0] }))) / 1e6 : 0;
        return `<label style="display:flex;gap:6px;align-items:baseline;padding:2px 0;font-size:12px;cursor:pointer"><input type="checkbox" class="demb-p" value="${i}" checked style="width:auto;margin:0">
        <span style="flex:1">${esc(p.name)}</span><span style="color:var(--tx3);font-size:10px">${km2 ? km2.toFixed(km2 < 1 ? 3 : 1) + ' км²' : ''}</span></label>`; }).join('')}
    </div>
    <div style="font-size:11px;color:var(--tx3);margin-top:8px;line-height:1.5">
      Параметры берутся из окна «Рельеф»: шаг горизонталей, сетка точек, подложка, БСВ-77.
      Система координат: <b>${esc(projLbl || '')}</b> — зона подбирается <b>для каждого участка отдельно</b> (если стоит «Авто»).
      Каждый участок обрезается по своему контуру. Большие пакеты выгружаются долго — окно можно не закрывать.</div>`;
  window._demBatchRender = id => { const c = cand.find(x => x.l.id === id); if (c) { window._demBatchCur = c; document.getElementById('mbd').innerHTML = render(c); } };
  window._demBatchCur = cur;
  showModal('📚 Рельеф по полигонам слоя', render(cur), [
    { label: 'Отмена', cls: 'bs', fn: () => { closeModal(); if (typeof openDEMPanel === 'function') openDEMPanel(); } },
    { label: '🏔 Выгрузить пакет', cls: 'bp', fn: () => {
      const c = window._demBatchCur;
      const idx = [...document.querySelectorAll('.demb-p')].filter(x => x.checked).map(x => +x.value);
      if (!idx.length) { toast('Отметьте хотя бы один участок', 'err'); return; }
      _demRunBatch(c.l, idx.map(i => c.polys[i]));
    } },
  ]);
}
async function _demRunBatch(layer, polys) {
  const cfg = window._demBatchCfg || { params: _demCommonParams(), projId: document.getElementById('dem-proj')?.value, forcedZone: 0 };
  const params = cfg.params, projId = cfg.projId, forcedZone = cfg.forcedZone;
  const keepBbox = _demBbox;
  const items = [];
  for (const p of polys) {
    const lats = p.ring.map(c => c[1]), lngs = p.ring.map(c => c[0]);
    _demBbox = { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
    const proj = DEM_PROJECTIONS.find(q => q.id === projId) || _demBuildMskProj(projId, forcedZone) || _demBuildUtmProj(projId, forcedZone);
    if (!proj) { _demBbox = keepBbox; toast('Выберите систему координат в окне «Рельеф»', 'err'); return; }
    items.push({ name: p.name, bbox: _demBbox, clip: { type: 'Polygon', coordinates: [p.ring] }, projId: proj.id, proj4: proj.proj4 || null, epsg: proj.epsg || null, projName: proj.name || null });
  }
  _demBbox = keepBbox;
  // Окно прогресса
  showModal('📚 Пакетная выгрузка рельефа', `<div style="font-size:12px;margin-bottom:8px">Слой «${esc(layer.name)}», участков: <b>${items.length}</b></div>
    <div style="height:8px;background:var(--s3);border-radius:4px;overflow:hidden"><div id="demb-bar" style="height:100%;width:2%;background:var(--acc);transition:width .4s"></div></div>
    <div id="demb-txt" style="font-size:11px;color:var(--tx2);margin-top:6px">⏳ Запуск…</div>`, [{ label: 'Скрыть', cls: 'bs', fn: closeModal }]);
  const sse = new EventSource(`${location.origin}/api/events`);
  sse.onmessage = e => { try { const d = JSON.parse(e.data); if (d.type === 'dem_progress' && !d.job) { const b = document.getElementById('demb-bar'), t = document.getElementById('demb-txt'); if (b) b.style.width = Math.max(2, d.pct) + '%'; if (t) t.textContent = d.text; } } catch (x) {} };
  try {
    const r = await fetch(`${API}/dem/export-batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, ...params }) });
    sse.close();
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Ошибка сервера'); }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ArcticDEM_пакет_${String(layer.name).replace(/[\\/:*?"<>|]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.zip`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    const t = document.getElementById('demb-txt'); if (t) t.textContent = '✅ Готово — архив скачан (в нём «Отчёт.txt» по участкам)';
    const b = document.getElementById('demb-bar'); if (b) b.style.width = '100%';
    toast('✅ Пакет выгружен: ' + a.download, 'ok');
  } catch (e) {
    sse.close();
    const t = document.getElementById('demb-txt'); if (t) t.innerHTML = '<span style="color:var(--red)">❌ ' + esc(e.message) + '</span>';
    toast('❌ ' + e.message, 'err');
  }
}
