// ═══════════════════════════════════════════════════════════
// HTML-экспорт объёмов в выбранной области
// ═══════════════════════════════════════════════════════════

var _htmlExDraw   = false;
var _htmlExStart  = null;
var _htmlExTmp    = null;
var _htmlExSiteId = null;
var _htmlExOpts   = {tile:'map', kmlIds:[], coordSys:'wgs', mobile:false, offline:false, offlineMaxZoom:15};

// ── Открыть диалог выбора параметров ─────────────────────
function openHtmlExportModal(siteId) {
  _htmlExSiteId = siteId;

  const kmlLayers = (layers||[]).filter(l => l.geojson);
  const kmlBlock = kmlLayers.length === 0 ? '' :
    `<div style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span style="font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.4px">KML слои</span>
        <button class="btn bs bxs" onclick="_htmlExToggleAllKml(true)">Все</button>
        <button class="btn bs bxs" onclick="_htmlExToggleAllKml(false)">Снять</button>
      </div>
      <div style="max-height:110px;overflow-y:auto;display:flex;flex-direction:column;gap:2px">
        ${kmlLayers.map(l=>`
          <label style="display:flex;align-items:center;gap:7px;padding:3px 0;font-size:11px;cursor:pointer;user-select:none">
            <input type="checkbox" id="kml-exp-${l.id}" checked>
            <span style="width:10px;height:10px;border-radius:50%;background:${l.color||'#1a56db'};flex-shrink:0;border:1px solid rgba(0,0,0,.15)"></span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.name)}</span>
          </label>`).join('')}
      </div>
    </div>`;

  const radioStyle = 'flex:1;min-width:100px;padding:8px 10px;border:1.5px solid var(--bd);border-radius:8px;cursor:pointer;font-size:11px;font-weight:600;display:flex;align-items:center;gap:6px;transition:border-color .15s';

  showModal('📄 HTML-экспорт объёмов',
    `<div style="font-size:12px">
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--tx2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px">Подложка (по умолчанию)</div>
        <div style="display:flex;gap:6px">
          <label style="${radioStyle}"><input type="radio" name="htile" value="map" checked> 🗺 Карта</label>
          <label style="${radioStyle}"><input type="radio" name="htile" value="sat"> 🛰 Спутник</label>
        </div>
        <div style="font-size:10px;color:var(--tx3);margin-top:4px">В HTML-файле будет кнопка переключения подложки</div>
      </div>
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--tx2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px">Система координат</div>
        <div style="display:flex;gap:6px">
          <label style="${radioStyle}"><input type="radio" name="hcoord" value="wgs" checked> WGS-84</label>
          <label style="${radioStyle}"><input type="radio" name="hcoord" value="msk"> МСК-86/89</label>
          <label style="${radioStyle}"><input type="radio" name="hcoord" value="gsk"> ГСК-2011</label>
        </div>
      </div>
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--tx2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px">Устройство</div>
        <div style="display:flex;gap:6px">
          <label style="${radioStyle}"><input type="radio" name="hdevice" value="pc" checked> 🖥 ПК</label>
          <label style="${radioStyle}"><input type="radio" name="hdevice" value="mobile"> 📱 Телефон</label>
        </div>
        <div style="font-size:10px;color:var(--tx3);margin-top:4px">Телефон: карта на весь экран, крупные кнопки, таблица снизу</div>
      </div>
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--tx2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px">Офлайн подложка</div>
        <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1.5px solid var(--bd);border-radius:8px;cursor:pointer;font-size:11px;font-weight:600">
          <input type="checkbox" id="hex-offline" onchange="_hexOfflineToggle(this.checked)">
          <span>📥 Встроить тайлы в файл (работа без интернета)</span>
        </label>
        <div id="hex-offline-opts" style="display:none;margin-top:8px;padding:8px 10px;border:1px solid var(--bd);border-radius:6px;background:var(--s2)">
          <div style="display:flex;align-items:center;gap:8px;font-size:11px;margin-bottom:5px">
            <label style="font-weight:600">Макс. зум:</label>
            <select id="hex-offline-zoom" onchange="_hexUpdateTileCount()" style="font-size:11px;padding:3px 8px;border:1px solid var(--bd);border-radius:4px">
              <option value="12">12 — обзор (~1:50000)</option>
              <option value="13">13 — среднее (~1:25000)</option>
              <option value="14" selected>14 — стандарт (~1:12000)</option>
              <option value="15">15 — детальный (~1:6000)</option>
              <option value="16">16 — максимум (~1:3000)</option>
            </select>
          </div>
          <div id="hex-tile-info" style="font-size:10px;color:var(--tx2)">Оценка по текущему виду карты</div>
        </div>
      </div>
      ${kmlBlock}
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--tx2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px">Область</div>
        <div style="display:flex;gap:6px">
          <div style="flex:1;padding:10px;border:1.5px solid var(--bd);border-radius:8px;cursor:pointer;text-align:center" onclick="closeModal();_htmlExApplyOpts();_htmlExFromView()">
            <div style="font-size:20px">🗺</div>
            <div style="font-size:11px;font-weight:700;margin-top:2px">Текущий вид</div>
          </div>
          <div style="flex:1;padding:10px;border:1.5px solid var(--bd);border-radius:8px;cursor:pointer;text-align:center" onclick="closeModal();_htmlExApplyOpts();_htmlExStartDraw()">
            <div style="font-size:20px">✏️</div>
            <div style="font-size:11px;font-weight:700;margin-top:2px">Нарисовать</div>
          </div>
        </div>
      </div>
    </div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal}]
  );
}

function _htmlExToggleAllKml(check) {
  (layers||[]).filter(l => l.geojson).forEach(l => {
    const cb = document.getElementById('kml-exp-'+l.id);
    if (cb) cb.checked = check;
  });
}

function _hexOfflineToggle(on) {
  const opts = document.getElementById('hex-offline-opts');
  if (opts) opts.style.display = on ? 'block' : 'none';
  if (on) _hexUpdateTileCount();
}
function _hexTileCount(bbox, minZ, maxZ) {
  function lng2t(l, z) { return Math.floor((l + 180) / 360 * (1 << z)); }
  function lat2t(l, z) { const r = l * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1/Math.cos(r)) / Math.PI) / 2 * (1 << z)); }
  let n = 0;
  for (let z = minZ; z <= maxZ; z++)
    n += (lng2t(bbox.maxLng, z) - lng2t(bbox.minLng, z) + 1) * (lat2t(bbox.minLat, z) - lat2t(bbox.maxLat, z) + 1);
  return n;
}
function _hexUpdateTileCount() {
  const el = document.getElementById('hex-tile-info');
  if (!el || !window.map) return;
  const b = map.getBounds();
  const bbox = {minLng: b.getWest(), maxLng: b.getEast(), minLat: b.getSouth(), maxLat: b.getNorth()};
  const maxZ = parseInt(document.getElementById('hex-offline-zoom')?.value || '14');
  const n = _hexTileCount(bbox, 10, maxZ);
  const sz = Math.round(n * 35 / 1024);
  const ok = n <= 1500;
  const warn = n > 600 && n <= 1500;
  el.style.color = !ok ? '#c81e1e' : warn ? '#d97706' : 'var(--tx2)';
  el.textContent = !ok
    ? `~${n} тайлов — превышает лимит 1500. Уменьшите зум или область.`
    : warn
      ? `Оценка (текущий вид): ~${n} тайлов, ~${sz} МБ — файл будет большим`
      : `Оценка (текущий вид): ~${n} тайлов, ~${sz} МБ`;
}

function _htmlExApplyOpts() {
  const tileEl   = document.querySelector('input[name="htile"]:checked');
  const coordEl  = document.querySelector('input[name="hcoord"]:checked');
  const deviceEl = document.querySelector('input[name="hdevice"]:checked');
  const offlineEl = document.getElementById('hex-offline');
  const offlineZoomEl = document.getElementById('hex-offline-zoom');
  _htmlExOpts.tile     = tileEl   ? tileEl.value   : 'map';
  _htmlExOpts.coordSys = coordEl  ? coordEl.value  : 'wgs';
  _htmlExOpts.mobile   = deviceEl ? deviceEl.value === 'mobile' : false;
  _htmlExOpts.offline  = offlineEl ? offlineEl.checked : false;
  _htmlExOpts.offlineMaxZoom = offlineZoomEl ? parseInt(offlineZoomEl.value) : 15;
  _htmlExOpts.kmlIds = (layers||[])
    .filter(l => l.geojson && document.getElementById('kml-exp-'+l.id)?.checked)
    .map(l => l.id);
}

// ── Экспорт по текущему виду ──────────────────────────────
function _htmlExFromView() {
  const b = map.getBounds();
  generateHtmlExport(_htmlExSiteId, {
    minLat:b.getSouth(), maxLat:b.getNorth(),
    minLng:b.getWest(),  maxLng:b.getEast()
  });
}

// ── Рисование прямоугольника ──────────────────────────────
function _htmlExStartDraw() {
  _htmlExDraw  = false;
  _htmlExStart = null;
  if (_htmlExTmp) { try{map.removeLayer(_htmlExTmp);}catch(e){} _htmlExTmp=null; }

  map.getContainer().style.cursor = 'crosshair';
  const bnr = document.getElementById('bnr');
  if (bnr) {
    bnr.className = 'show draw';
    document.getElementById('bnr-t').textContent = '📄 Кликните — первый угол области (ПКМ — отмена)';
    bnr.style.display = 'flex';
  }
  map.once('click', _htmlExFirstClick);
  map.once('contextmenu', _htmlExCancel);
}

function _htmlExFirstClick(e) {
  _htmlExDraw  = true;
  _htmlExStart = e.latlng;
  document.getElementById('bnr-t').textContent = '📄 Кликните — второй угол области';
  map.on('mousemove', _htmlExMouseMove);
  map.once('click', _htmlExSecondClick);
}

function _htmlExMouseMove(e) {
  if (!_htmlExStart) return;
  const b = L.latLngBounds(_htmlExStart, e.latlng);
  if (_htmlExTmp) { _htmlExTmp.setBounds(b); }
  else { _htmlExTmp = L.rectangle(b,{color:'#6366f1',weight:2,dashArray:'6 4',fillColor:'#6366f1',fillOpacity:.12}).addTo(map); }
}

function _htmlExSecondClick(e) {
  map.off('mousemove', _htmlExMouseMove);
  map.off('contextmenu', _htmlExCancel);
  const b = L.latLngBounds(_htmlExStart, e.latlng);
  if (_htmlExTmp) { map.removeLayer(_htmlExTmp); _htmlExTmp=null; }
  map.getContainer().style.cursor = '';
  const bnr = document.getElementById('bnr');
  if (bnr) bnr.className = '';
  generateHtmlExport(_htmlExSiteId, {
    minLat:b.getSouth(), maxLat:b.getNorth(),
    minLng:b.getWest(),  maxLng:b.getEast()
  });
}

function _htmlExCancel() {
  map.off('mousemove', _htmlExMouseMove);
  map.off('click', _htmlExFirstClick);
  map.off('click', _htmlExSecondClick);
  if (_htmlExTmp) { try{map.removeLayer(_htmlExTmp);}catch(e){} _htmlExTmp=null; }
  map.getContainer().style.cursor = '';
  const bnr = document.getElementById('bnr');
  if (bnr) bnr.className = '';
}

// ── Главная функция генерации ─────────────────────────────
async function generateHtmlExport(siteId, bbox) {
  toast('Готовлю HTML...','ok');
  const s = await fetch(`${API}/sites/${siteId}`).then(r=>r.json());

  const inBbox = (lat,lng) =>
    lat>=bbox.minLat && lat<=bbox.maxLat && lng>=bbox.minLng && lng<=bbox.maxLng;

  const SEM_LABEL = {
    borehole:'Скважина', pit:'Шурф',
    ggs:'Пункт ГГС', ogs:'Пункт ОГС', repere:'Репер',
    benchmark:'Марка', steel_angle:'Металлический уголок', other:'Другое'
  };

  // ── Базы объекта в bbox ───────────────────────────────
  const basePts = (s.bases||[])
    .filter(b => b.lat && b.lng && inBbox(b.lat, b.lng))
    .map(b => ({lat: b.lat, lng: b.lng, name: b.name||'База'}));

  const volMap = {};
  (s.volumes||[]).forEach(v => { volMap[v.id]=v; });

  // ── Точки объёмов ─────────────────────────────────────
  const pts = [];
  const collectFromGJ = (gjStr, volName, color, date, cat) => {
    if (!gjStr) return;
    try {
      const gj = JSON.parse(gjStr);
      const feats = gj.type==='FeatureCollection'?gj.features:gj.type==='Feature'?[gj]:[];
      feats.forEach(feat => {
        if (!feat.geometry||feat.geometry.type!=='Point') return;
        const [lng,lat] = feat.geometry.coordinates;
        if (!inBbox(lat,lng)) return;
        const sem = (feat.properties&&feat.properties.sem)||{};
        pts.push({lat,lng,
          color:(feat.properties&&feat.properties.color)||color||'#1a56db',
          volName, date:date||'', sem, cat});
      });
    } catch(e) {}
  };
  (s.vol_progress||[]).forEach(p => {
    if (p.row_type&&p.row_type!=='fact') return;
    const vol = volMap[p.volume_id];
    if (!vol) return;
    collectFromGJ(p.geojson, vol.name, vol.color, p.work_date, vol.category);
  });
  (s.volumes||[]).forEach(v => collectFromGJ(v.geojson, v.name, v.color, null, v.category));

  // ── KML слои ──────────────────────────────────────────
  const kmlData = (_htmlExOpts.kmlIds||[]).map(id => {
    const l = (layers||[]).find(x=>x.id===id);
    if (!l||!l.geojson) return null;
    let gj; try{gj=JSON.parse(l.geojson);}catch(e){return null;}
    const dashMap = {solid:null,dashed:'8 4',dotted:'2 4',dashdot:'8 4 2 4'};
    const feats = (gj.features||[]).filter(feat => {
      if (!feat.geometry) return false;
      return _htmlExAnyCoordInBbox(feat.geometry, bbox);
    }).map(feat => {
      const sym   = (feat.properties&&feat.properties._sym)||l.symbol||'point';
      const color = (feat.properties&&feat.properties._color)||l.color||'#1a56db';
      const svgHtml = feat.geometry.type==='Point'
        ? `<div style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.4))">${kmlSvgIcon(sym,color,28)}</div>`
        : null;
      return {
        type:'Feature', geometry:feat.geometry,
        properties:{
          name:(feat.properties&&(feat.properties.name||feat.properties.Name))||'',
          _svgHtml:svgHtml
        }
      };
    });
    if (!feats.length) return null;
    return {name:l.name, color:l.color||'#1a56db', dashArray:dashMap[l.line_dash]||null, features:feats};
  }).filter(Boolean);

  if (pts.length===0 && kmlData.length===0 && basePts.length===0) {
    toast('В выбранной области нет данных','err'); return;
  }

  // ── Офлайн тайлы ────────────────────────────────────────
  let offlineTiles = null;
  if (_htmlExOpts.offline) {
    const maxZ = _htmlExOpts.offlineMaxZoom || 15;
    const est = _hexTileCount(bbox, 10, maxZ);
    if (est > 1500) {
      toast(`Слишком много тайлов (~${est}). Уменьшите область или зум (макс. 1500).`,'err'); return;
    }
    toast(`📥 Загружаю тайлы подложки (~${est} шт.)...`,'ok');
    try {
      const tr = await fetch(`${API}/export-tiles`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({bbox, minZoom:10, maxZoom:maxZ, source: _htmlExOpts.tile})
      });
      const td = await tr.json();
      if (td.error === 'too_many_tiles') {
        toast(`Слишком много тайлов (${td.count}). Уменьшите зум или область.`,'err'); return;
      }
      offlineTiles = td.tiles;
      toast(`✅ Тайлы загружены: ${td.count} шт.`,'ok');
    } catch(e) {
      toast('Ошибка загрузки тайлов: '+e.message,'err'); return;
    }
  }

  // Встраиваем Leaflet для офлайн режима
  let leafletInline = null;
  if (_htmlExOpts.offline) {
    try {
      toast('📥 Встраиваю Leaflet...', 'ok');
      const [cssR, jsR] = await Promise.all([
        fetch('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'),
        fetch('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js')
      ]);
      leafletInline = { css: await cssR.text(), js: await jsR.text() };
    } catch(e) {
      toast('Не удалось встроить Leaflet — используется CDN', 'err');
    }
  }

  const dateStr = new Date().toLocaleDateString('ru');
  const html = _buildHtmlExport(s.name, bbox, pts, kmlData, SEM_LABEL, dateStr, _htmlExOpts, basePts, offlineTiles, leafletInline);
  const a = document.createElement('a');
  a.href = 'data:text/html;charset=utf-8,'+encodeURIComponent(html);
  a.download = s.name.replace(/[\/\\:*?"<>|]/g,'_')
    +'_объёмы_'+new Date().toLocaleDateString('ru').replace(/\./g,'-')+'.html';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  const szKb = Math.round(html.length / 1024);
  toast(`HTML сохранён: ${pts.length} точек${offlineTiles?' + офлайн тайлы':''} · ${szKb} КБ`,'ok');
}

// Проверяем, есть ли хоть одна координата геометрии в bbox
function _htmlExAnyCoordInBbox(geom, bbox) {
  const flat = c => {
    if (!Array.isArray(c)) return [];
    if (typeof c[0]==='number') return [c];
    return c.flatMap(flat);
  };
  return flat(geom.coordinates).some(([lng,lat]) =>
    lat>=bbox.minLat&&lat<=bbox.maxLat&&lng>=bbox.minLng&&lng<=bbox.maxLng);
}

// ── Конвертация координат в выбранную СК ─────────────────
function _exFmtCoord(lat, lng, sys) {
  try {
    if (sys === 'msk' && typeof wgsToMsk === 'function') {
      const c = wgsToMsk(lat, lng);
      return { a: c.northing.toFixed(2), b: c.easting.toFixed(2), zone: c.zone };
    }
    if (sys === 'gsk' && typeof wgsToGsk === 'function') {
      const c = wgsToGsk(lat, lng);
      return { a: c.northing.toFixed(2), b: c.easting.toFixed(2), zone: c.zone };
    }
  } catch(e) {}
  return { a: lat.toFixed(6), b: lng.toFixed(6), zone: null };
}

// ── Сборка HTML ───────────────────────────────────────────
function _buildHtmlExport(siteName, bbox, pts, kmlData, SEM_LABEL, dateStr, opts, basePts, offlineTiles, leafletInline) {
  basePts = basePts || [];
  offlineTiles = offlineTiles || null;
  const leafCss = (leafletInline && leafletInline.css)
    ? `<style>${leafletInline.css}</style>`
    : `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>`;
  const leafJs = (leafletInline && leafletInline.js)
    ? `<script>${leafletInline.js.replace(/<\/script>/gi,'<\\/script>')}<\/script>`
    : `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>`;
  const he = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const sys = (opts && opts.coordSys) || 'wgs';
  const sysLabel = sys === 'msk' ? 'МСК-86/89' : sys === 'gsk' ? 'ГСК-2011' : 'WGS-84';
  const colA = sys === 'wgs' ? 'Широта'  : 'X (северн.)';
  const colB = sys === 'wgs' ? 'Долгота' : 'Y (восточ.)';
  const showZone = sys !== 'wgs';

  const mapData = pts.map((p,i) => {
    const c = _exFmtCoord(p.lat, p.lng, sys);
    return {
      i:i+1, lat:p.lat, lng:p.lng, color:p.color,
      n:p.volName, dt:p.date,
      cat:p.cat==='geology'?'Геология':'Геодезия',
      sl:SEM_LABEL[p.sem.type]||p.sem.type||'',
      d:p.sem.data||{},
      ca:c.a, cb:c.b, cz:c.zone
    };
  });

  const rows = pts.map((p,i) => {
    const d = p.sem.data||{};
    const cat = p.cat==='geology'?'Геология':'Геодезия';
    const sl  = SEM_LABEL[p.sem.type]||p.sem.type||'—';
    const c = _exFmtCoord(p.lat, p.lng, sys);
    return `<tr>
      <td>${i+1}</td>
      <td>${he(p.volName)}</td>
      <td>${he(p.date||'—')}</td>
      <td>${cat}</td>
      <td>${he(sl)}</td><td>${he(d.label||'')}</td>
      <td>${he(d.depth||'')}</td><td>${he(d.diam||'')}</td><td>${he(d.ugv||'')}</td>
      <td>${he(d.date||'')}</td><td>${he(d.exec||'')}</td>
      <td>${he(d.desc||d.note||'')}</td>
      <td style="font-family:monospace;font-size:10px;white-space:nowrap">${c.a}</td>
      <td style="font-family:monospace;font-size:10px;white-space:nowrap">${c.b}</td>
      ${showZone?`<td style="font-family:monospace;font-size:10px">${c.zone||''}</td>`:''}
    </tr>`;
  }).join('');

  const kmlJson = JSON.stringify(kmlData);
  const defTile = (opts&&opts.tile==='sat') ? 'sat' : 'map';
  const isMobile = !!(opts && opts.mobile);

  const pcCss = `
#hdr{padding:14px 20px;background:#1e293b;color:#fff;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
#hdr h1{font-size:17px;font-weight:700;letter-spacing:-.3px}
#hdr .sub{font-size:11px;color:#94a3b8;margin-top:2px}
#map{height:55vh;min-height:300px;width:100%;border-bottom:2px solid #e2e8f0}
#main{padding:16px 20px}
#main h2{font-size:13px;font-weight:700;color:#334155;margin-bottom:10px}
.tbl-wrap{overflow-x:auto;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.08);background:#fff}
table{width:100%;border-collapse:collapse;font-size:11px}
th{background:#334155;color:#fff;padding:7px 8px;text-align:left;white-space:nowrap;font-weight:600}
td{padding:5px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top}
tr:last-child td{border-bottom:none}
tr:hover td{background:#f8fafc}
#footer{padding:8px 20px;font-size:10px;color:#94a3b8;text-align:center}
.map-btn{position:absolute;z-index:1000;background:#fff;border:2px solid rgba(0,0,0,.2);border-radius:4px;width:34px;height:34px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 5px rgba(0,0,0,.2)}
.tile-btn{top:80px;right:10px}
.lbl-btn{top:124px;right:10px}
@media print{#map{height:40vh}#footer{display:none}.map-btn{display:none}}
.kml-lbl{background:rgba(255,255,255,.9);border:1px solid rgba(0,0,0,.15);border-radius:3px;padding:1px 4px;font-size:9px;font-weight:700;white-space:nowrap}`;

  const mobileCss = `
html,body{height:100%;margin:0;padding:0;overflow:hidden}
body{display:flex;flex-direction:column}
#hdr{padding:10px 14px;background:#1e293b;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:6px;flex-shrink:0}
#hdr h1{font-size:15px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#hdr .sub{font-size:10px;color:#94a3b8;display:none}
#map-wrap{flex:1;position:relative;overflow:hidden;min-height:0}
#map{position:absolute;top:0;left:0;right:0;bottom:0}
#main{padding:10px 12px;overflow-y:auto;max-height:40vh;border-top:2px solid #e2e8f0;background:#f8fafc;flex-shrink:0}
#main h2{font-size:12px;font-weight:700;color:#334155;margin-bottom:8px}
.tbl-wrap{overflow-x:auto;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.08);background:#fff}
table{width:100%;border-collapse:collapse;font-size:10px}
th{background:#334155;color:#fff;padding:6px;text-align:left;white-space:nowrap;font-weight:600}
td{padding:4px 6px;border-bottom:1px solid #f1f5f9;vertical-align:top}
tr:last-child td{border-bottom:none}
#footer{padding:6px 12px;font-size:9px;color:#94a3b8;text-align:center;background:#f8fafc;flex-shrink:0}
.map-btn{position:absolute;z-index:1000;background:#fff;border:2px solid rgba(0,0,0,.2);border-radius:6px;width:42px;height:42px;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 5px rgba(0,0,0,.2)}
.tile-btn{top:10px;right:10px}
.lbl-btn{top:62px;right:10px}
.kml-lbl{background:rgba(255,255,255,.9);border:1px solid rgba(0,0,0,.15);border-radius:3px;padding:1px 4px;font-size:9px;font-weight:700;white-space:nowrap}`;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${he(siteName)} — Объёмы</title>
${leafCss}
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;color:#1e293b}
${isMobile ? mobileCss : pcCss}
</style>
</head>
<body>
<div id="hdr">
  <div style="min-width:0">
    <h1>${he(siteName)}</h1>
    <div class="sub">Экспорт ${dateStr} · ${pts.length} точек${kmlData.length?' · '+kmlData.length+' KML слоёв':''}</div>
  </div>
  <div class="sub" style="text-align:right;flex-shrink:0">
    Координаты: <b>${sysLabel}</b><br>
    ${bbox.minLat.toFixed(5)}&thinsp;…&thinsp;${bbox.maxLat.toFixed(5)} с.ш.<br>
    ${bbox.minLng.toFixed(5)}&thinsp;…&thinsp;${bbox.maxLng.toFixed(5)} в.д.
  </div>
</div>
<div id="${isMobile?'map-wrap':'map-wrap'}" style="position:relative${isMobile?';flex:1':''}">
  <div id="map"${isMobile?'':' style="height:55vh;min-height:300px"'}></div>
  <button class="map-btn tile-btn" id="tile-toggle" title="Переключить подложку">🛰</button>
  ${kmlData.length ? `<button class="map-btn lbl-btn" id="lbl-toggle" title="Подписи KML">🏷</button>` : ''}
</div>
<div id="main">
  <h2>📍 Точки в области (${pts.length})</h2>
  <div class="tbl-wrap">
  <table>
    <thead><tr>
      <th>#</th><th>Объём</th><th>Дата записи</th><th>Категория</th><th>Тип</th><th>Название/№</th>
      <th>Глубина (м)</th><th>Диаметр (мм)</th><th>УГВ (м)</th>
      <th>Дата</th><th>Исполнитель</th><th>Описание</th>
      <th>${colA}</th><th>${colB}</th>${showZone?'<th>Зона</th>':''}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </div>
</div>
<div id="footer">ПурГеоКом · ${he(siteName)} · ${dateStr}</div>
${leafJs}
<script>
(function(){
var PTS=${JSON.stringify(mapData)};
var KML=${kmlJson};
var BASES=${JSON.stringify(basePts)};
var DEF_TILE='${defTile}';
var OFFLINE_TILES=${offlineTiles ? JSON.stringify(offlineTiles) : 'null'};

var map=L.map('map',{attributionControl:false});

// Слой с поддержкой офлайн тайлов (при наличии) с фолбэком в интернет
var OfflineLayer=L.TileLayer.extend({
  createTile:function(coords,done){
    var img=document.createElement('img');
    var k=coords.z+'/'+coords.x+'/'+coords.y;
    if(OFFLINE_TILES&&OFFLINE_TILES[k]){
      img.src='data:image/png;base64,'+OFFLINE_TILES[k];
      setTimeout(function(){done(null,img);},0);
    }else{
      img.crossOrigin='';
      img.src=L.TileLayer.prototype.getTileUrl.call(this,coords);
      img.onload=function(){done(null,img);};
      img.onerror=function(e){done(e,img);};
    }
    return img;
  }
});
var TILES={
  map:new OfflineLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20}),
  sat:new OfflineLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20})
};
var curTile=DEF_TILE;
TILES[curTile].addTo(map);

// Переключение подложки
var btn=document.getElementById('tile-toggle');
btn.textContent=curTile==='map'?'🛰':'🗺';
btn.onclick=function(){
  map.removeLayer(TILES[curTile]);
  curTile=curTile==='map'?'sat':'map';
  TILES[curTile].addTo(map);
  btn.textContent=curTile==='map'?'🛰':'🗺';
};

// KML слои
var kmlTooltips=[];
var lblVisible=true;
KML.forEach(function(lyr){
  L.geoJSON({type:'FeatureCollection',features:lyr.features},{
    pointToLayer:function(feat,ll){
      if(feat.properties._svgHtml){
        return L.marker(ll,{icon:L.divIcon({className:'',html:feat.properties._svgHtml,iconSize:[28,28],iconAnchor:[14,14],popupAnchor:[0,-14]})});
      }
      return L.circleMarker(ll,{radius:7,fillColor:lyr.color,color:'#fff',weight:2,fillOpacity:.85});
    },
    style:function(){
      return {color:lyr.color,weight:2,dashArray:lyr.dashArray,fillColor:lyr.color,fillOpacity:.15};
    },
    onEachFeature:function(feat,layer){
      var nm=feat.properties.name;
      if(nm){layer.bindTooltip(nm,{permanent:true,direction:'top',className:'kml-lbl'});kmlTooltips.push(layer);}
    }
  }).addTo(map);
});

// Кнопка переключения подписей KML
var lblBtn=document.getElementById('lbl-toggle');
if(lblBtn){
  lblBtn.onclick=function(){
    lblVisible=!lblVisible;
    lblBtn.style.opacity=lblVisible?'1':'0.4';
    kmlTooltips.forEach(function(l){
      if(lblVisible) l.openTooltip(); else l.closeTooltip();
    });
  };
}

// Маркеры объёмов — в volPane поверх KML
var allBounds=[];
PTS.forEach(function(p){
  allBounds.push([p.lat,p.lng]);
  var c=p.color||'#1a56db';
  var icon=L.divIcon({
    className:'',
    html:'<div style="width:14px;height:14px;border-radius:50%;background:'+c+';border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>',
    iconSize:[14,14],iconAnchor:[7,7],popupAnchor:[0,-9]
  });
  var d=p.d||{};
  var pop='<div style="font-size:12px;line-height:1.65;min-width:170px">'
    +'<b>'+p.n+'</b>';
  if(p.dt) pop+='<br><span style="color:#64748b;font-size:10px">'+p.dt+'</span>';
  if(p.cat) pop+='<br><span style="color:#64748b;font-size:10px">'+p.cat+'</span>';
  if(p.sl)  pop+='<br><span style="color:'+c+';font-weight:600">'+p.sl+(d.label?' <b>'+d.label+'</b>':'')+'</span>';
  if(d.depth) pop+='<br>⬇ Глубина: <b>'+d.depth+' м</b>';
  if(d.diam)  pop+='<br>⌀ Диаметр: <b>'+d.diam+' мм</b>';
  if(d.ugv)   pop+='<br>💧 УГВ: <b>'+d.ugv+' м</b>';
  if(d.date)  pop+='<br>📅 '+d.date;
  if(d.exec)  pop+='<br>👤 '+d.exec;
  if(d.desc||d.note) pop+='<br>📋 '+(d.desc||d.note);
  var coordStr = (p.cz!=null) ? (p.ca+', '+p.cb+' (зона '+p.cz+')') : (p.ca+', '+p.cb);
  pop+='<br><span style="font-size:10px;color:#94a3b8;font-family:monospace">'+coordStr+'</span>';
  pop+='<\/div>';
  L.marker([p.lat,p.lng],{icon:icon})
    .bindPopup(pop)
    .bindTooltip('#'+p.i+' '+p.n,{direction:'top',offset:[0,-9]})
    .addTo(map);
});

// Маркеры баз
BASES.forEach(function(b){
  var icon=L.divIcon({
    className:'',
    html:'<div style="display:flex;flex-direction:column;align-items:center;gap:2px">'
      +'<div style="width:32px;height:32px;background:#7c3aed;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 8px rgba(0,0,0,.4)">🏕</div>'
      +'<div style="background:rgba(124,58,237,.85);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px;white-space:nowrap;max-width:110px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 4px rgba(0,0,0,.3)">'+b.name+'</div>'
      +'</div>',
    iconSize:[110,52],iconAnchor:[55,16]
  });
  allBounds.push([b.lat,b.lng]);
  L.marker([b.lat,b.lng],{icon:icon}).bindPopup('<b>🏕 '+b.name+'</b>').addTo(map);
});

if(allBounds.length===1){map.setView(allBounds[0],16);}
else if(allBounds.length>1){map.fitBounds(L.latLngBounds(allBounds),{padding:[30,30]});}
else if(KML.length){
  var kbounds=[];
  KML.forEach(function(l){l.features.forEach(function(f){
    if(f.geometry.type==='Point') kbounds.push([f.geometry.coordinates[1],f.geometry.coordinates[0]]);
  });});
  if(kbounds.length) map.fitBounds(L.latLngBounds(kbounds),{padding:[30,30]});
}
[100,350,800].forEach(function(t){setTimeout(function(){map.invalidateSize();},t);});
})();
<\/script>
</body>
</html>`;
}
