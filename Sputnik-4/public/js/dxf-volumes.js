// DXF export of point volumes — client-side, R12 format, Windows-1251 encoding
// Based on the proven dxf-writer.js format for maximum AutoCAD R12 / Robur compatibility

// CP1251 encoding table for Cyrillic + commonly-used punctuation
const _CP1251 = (function(){
  const m = {};
  for(let i=0;i<32;i++) m[0x0410+i]=0xC0+i;   // А-Я
  for(let i=0;i<32;i++) m[0x0430+i]=0xE0+i;   // а-я
  m[0x0401]=0xA8; m[0x0451]=0xB8;             // Ё ё
  m[0x2116]=0xB9;                              // №
  m[0x00A0]=0xA0;                              // NBSP
  m[0x00AB]=0xAB; m[0x00BB]=0xBB;              // « »
  m[0x2013]=0x96; m[0x2014]=0x97;              // – —
  m[0x2018]=0x91; m[0x2019]=0x92;              // ' '
  m[0x201C]=0x93; m[0x201D]=0x94;              // " "
  m[0x2026]=0x85;                              // …
  m[0x00B0]=0xB0;                              // °
  m[0x00B7]=0xB7;                              // ·
  return m;
})();

function _dxfG(code, val){
  return code.toString().padStart(3,' ') + '\n' + val + '\n';
}

function _buildDxfLabel(sem, idx){
  const type = sem.type || '';
  const data = sem.data || {};
  const PREFIX = {borehole:'СКВ', pit:'Ш', ggs:'ГГС', ogs:'ОГС', repere:'Рп', benchmark:'Мк', steel_angle:'Уг', other:'Т'};
  const hasData = type==='borehole' || type==='pit';
  if(hasData){
    const desc = (data.desc||'').trim();
    const name = (data.label||'').trim() || desc || ((PREFIX[type]||'Т')+'-'+idx);
    const attrs = [
      'H=' + (data.depth||''),
      'd=' + (data.diam||''),
      'УГВ=' + (data.ugv||''),
      desc
    ];
    return name + ' (' + attrs.join(', ') + ')';
  } else {
    const note = (data.note||'').trim();
    const name = (data.label||'').trim() || ((PREFIX[type]||'Т')+'-'+idx);
    return note ? name + ' (' + note + ')' : name;
  }
}

function _dxfPoint(x, y, layer, color){
  // x = northing, y = easting (Russian geodesy)
  // DXF: code 10 = X (easting), code 20 = Y (northing) for AutoCAD
  let s = '';
  s += _dxfG(0,'POINT');
  s += _dxfG(8, layer);
  s += _dxfG(62, color);
  s += _dxfG(10, y.toFixed(3));
  s += _dxfG(20, x.toFixed(3));
  s += _dxfG(30, '0.000');
  return s;
}

function _dxfText(x, y, txt, layer, color, height){
  let s = '';
  const xs = y.toFixed(3);    // DXF X = easting
  const ys = x.toFixed(3);    // DXF Y = northing
  const h  = (height||1.5).toFixed(3);
  s += _dxfG(0,'TEXT');
  s += _dxfG(8, layer);
  s += _dxfG(62, color);
  s += _dxfG(10, xs);
  s += _dxfG(20, ys);
  s += _dxfG(30, '0.000');
  s += _dxfG(40, h);
  s += _dxfG(1, txt || ' ');
  s += _dxfG(50, '0.0');     // rotation
  s += _dxfG(72, '0');        // alignment: left
  s += _dxfG(11, xs);
  s += _dxfG(21, ys);
  s += _dxfG(31, '0.000');
  return s;
}

function _dxfLineSegments(coords, layer, color){
  // Each segment as separate LINE entity — most compatible with R12
  let s = '';
  for(let i=0; i<coords.length-1; i++){
    const a = coords[i], b = coords[i+1];
    const ax = parseFloat(a.x)||0, ay = parseFloat(a.y)||0;
    const bx = parseFloat(b.x)||0, by = parseFloat(b.y)||0;
    s += _dxfG(0,'LINE');
    s += _dxfG(8, layer);
    s += _dxfG(62, color);
    s += _dxfG(10, ay.toFixed(3));   // start X = easting
    s += _dxfG(20, ax.toFixed(3));   // start Y = northing
    s += _dxfG(30, '0.000');
    s += _dxfG(11, by.toFixed(3));   // end X
    s += _dxfG(21, bx.toFixed(3));   // end Y
    s += _dxfG(31, '0.000');
  }
  return s;
}

function _dxfClosedPolyline(coords, layer, color){
  // R12 POLYLINE + VERTEX*N + SEQEND, closed
  if(!coords || !coords.length) return '';
  let s = '';
  s += _dxfG(0,'POLYLINE');
  s += _dxfG(8, layer);
  s += _dxfG(62, color);
  s += _dxfG(66,'1');          // vertices follow
  s += _dxfG(10,'0.000') + _dxfG(20,'0.000') + _dxfG(30,'0.000');
  s += _dxfG(70,'1');          // closed
  for(const c of coords){
    const cx = parseFloat(c.x)||0, cy = parseFloat(c.y)||0;
    s += _dxfG(0,'VERTEX');
    s += _dxfG(8, layer);
    s += _dxfG(62, color);
    s += _dxfG(10, cy.toFixed(3));
    s += _dxfG(20, cx.toFixed(3));
    s += _dxfG(30, '0.000');
    s += _dxfG(70,'0');
  }
  s += _dxfG(0,'SEQEND');
  s += _dxfG(8, layer);
  return s;
}

function buildVolumesDXF({points, polylines, polygons, coordSys, siteName}){
  polylines = polylines || [];
  polygons  = polygons  || [];
  const axisLabel = coordSys==='wgs' ? 'LAT / LON (WGS-84)' :
                    coordSys==='msk' ? 'X(northing) / Y(easting) МСК-86/89' :
                                       'X(northing) / Y(easting) ГСК-2011';

  // Compute text height adaptively from extents (so labels are visible across MSK extents)
  const allX = [], allY = [];
  for(const p of points){ allX.push(parseFloat(p.x)||0); allY.push(parseFloat(p.y)||0); }
  for(const pl of polylines) for(const c of pl.coords){ allX.push(parseFloat(c.x)||0); allY.push(parseFloat(c.y)||0); }
  for(const pg of polygons) for(const r of pg.rings) for(const c of r){ allX.push(parseFloat(c.x)||0); allY.push(parseFloat(c.y)||0); }
  let textH = 1.5;
  if(allX.length){
    const dx = Math.max(...allX) - Math.min(...allX);
    const dy = Math.max(...allY) - Math.min(...allY);
    const span = Math.max(dx, dy);
    if(span > 100) textH = Math.max(1.5, span / 800);   // ~ readable at extents
  }
  const textHs = textH.toFixed(3);

  let s = '';

  // ── HEADER ─────────────────────────────────────────────
  s += _dxfG(0,'SECTION') + _dxfG(2,'HEADER');
  s += _dxfG(9,'$ACADVER') + _dxfG(1,'AC1009');
  s += _dxfG(9,'$INSUNITS') + _dxfG(70,'6');
  s += _dxfG(9,'$TEXTSIZE') + _dxfG(40, textHs);
  s += _dxfG(0,'ENDSEC');

  // ── TABLES ─────────────────────────────────────────────
  s += _dxfG(0,'SECTION') + _dxfG(2,'TABLES');

  // LTYPE
  s += _dxfG(0,'TABLE') + _dxfG(2,'LTYPE') + _dxfG(70,'1');
  s += _dxfG(0,'LTYPE') + _dxfG(2,'CONTINUOUS') + _dxfG(70,'64');
  s += _dxfG(3,'Solid line') + _dxfG(72,'65') + _dxfG(73,'0') + _dxfG(40,'0.000');
  s += _dxfG(0,'ENDTAB');

  // LAYER
  const layers = [
    {name:'СКВАЖИНЫ', color:5},   // синий
    {name:'ПОДПИСИ',  color:2},   // жёлтый
    {name:'ЛИНИИ',    color:3},   // зелёный
    {name:'КОНТУРЫ',  color:4},   // голубой
  ];
  s += _dxfG(0,'TABLE') + _dxfG(2,'LAYER') + _dxfG(70, String(layers.length));
  for(const l of layers){
    s += _dxfG(0,'LAYER');
    s += _dxfG(2, l.name);
    s += _dxfG(70,'0');
    s += _dxfG(62, String(l.color));
    s += _dxfG(6,'CONTINUOUS');
  }
  s += _dxfG(0,'ENDTAB');

  // STYLE — needed for TEXT entities to render in many viewers (Robur, AutoCAD R12)
  s += _dxfG(0,'TABLE') + _dxfG(2,'STYLE') + _dxfG(70,'1');
  s += _dxfG(0,'STYLE');
  s += _dxfG(2,'STANDARD');
  s += _dxfG(70,'0');
  s += _dxfG(40,'0.000');
  s += _dxfG(41,'1.000');
  s += _dxfG(50,'0.0');
  s += _dxfG(71,'0');
  s += _dxfG(42, textHs);
  s += _dxfG(3,'txt');
  s += _dxfG(4,'');
  s += _dxfG(0,'ENDTAB');

  s += _dxfG(0,'ENDSEC');

  // ── ENTITIES ───────────────────────────────────────────
  s += _dxfG(0,'SECTION') + _dxfG(2,'ENTITIES');

  // Points + labels
  for(const pt of points){
    const x = parseFloat(pt.x)||0;
    const y = parseFloat(pt.y)||0;
    const txt = pt.label || pt.type || 'Точка';
    s += _dxfPoint(x, y, 'СКВАЖИНЫ', '5');
    s += _dxfText(x + textH*0.4, y + textH*0.4, txt, 'ПОДПИСИ', '2', textH);
  }

  // Lines (LineString) — as LINE segments
  for(const pl of polylines){
    s += _dxfLineSegments(pl.coords, 'ЛИНИИ', '3');
    if(pl.name && pl.coords && pl.coords[0]){
      const f = pl.coords[0];
      s += _dxfText(parseFloat(f.x)||0, parseFloat(f.y)||0, pl.name, 'ПОДПИСИ', '2', textH);
    }
  }

  // Polygons — closed POLYLINE
  for(const pg of polygons){
    for(const ring of pg.rings){
      s += _dxfClosedPolyline(ring, 'КОНТУРЫ', '4');
    }
    if(pg.name && pg.rings[0] && pg.rings[0][0]){
      const f = pg.rings[0][0];
      s += _dxfText(parseFloat(f.x)||0, parseFloat(f.y)||0, pg.name, 'ПОДПИСИ', '2', textH);
    }
  }

  // Metadata label — placed near first point if available, else origin
  let metaX = 0, metaY = 0;
  if(allX.length){ metaX = Math.min(...allX); metaY = Math.min(...allY) - textH*3; }
  s += _dxfText(metaX, metaY, (siteName||'Объект') + ' | ' + axisLabel, 'ПОДПИСИ', '2', textH*0.7);

  s += _dxfG(0,'ENDSEC');
  s += _dxfG(0,'EOF');
  return s;
}

function _dxfDownload(dxfStr, filename){
  const buf = new Uint8Array(dxfStr.length);
  for(let i=0;i<dxfStr.length;i++){
    const c = dxfStr.charCodeAt(i);
    buf[i] = c < 0x80 ? c : (_CP1251[c] || 0x3F);
  }
  const blob = new Blob([buf], {type:'application/dxf'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function _collectDxfFeatures(site, sys){
  const points = [], polylines = [], polygons = [];
  const vols = site.volumes || [];
  let idx = 0;

  const processGJ = (gjRaw, volName, isFact) => {
    let fc;
    try{ fc = typeof gjRaw==='string'? JSON.parse(gjRaw) : gjRaw; }catch(e){ return; }
    if(!fc || fc.type!=='FeatureCollection') return;
    for(const feat of (fc.features||[])){
      if(!feat.geometry) continue;
      const geomType = feat.geometry.type;
      const sem = feat.properties?.sem || {};
      const suffix = isFact ? ' (факт)' : '';

      if(geomType === 'Point'){
        const [lng, lat] = feat.geometry.coordinates;
        const label = _buildDxfLabel(sem, ++idx) + suffix;
        const c = _convertCoords(lat, lng, sys);
        points.push({x:c.x, y:c.y, label});

      } else if(geomType === 'LineString'){
        const name = (feat.properties?.name || volName || '') + suffix;
        const coords = feat.geometry.coordinates.map(([lng,lat])=>{
          const c = _convertCoords(lat,lng,sys); return {x:c.x,y:c.y};
        });
        polylines.push({coords, name});

      } else if(geomType === 'MultiLineString'){
        const name = (feat.properties?.name || volName || '') + suffix;
        for(const line of feat.geometry.coordinates){
          const coords = line.map(([lng,lat])=>{const c=_convertCoords(lat,lng,sys);return{x:c.x,y:c.y};});
          polylines.push({coords, name});
        }

      } else if(geomType === 'Polygon'){
        const name = (feat.properties?.name || volName || '') + suffix;
        const rings = feat.geometry.coordinates.map(ring =>
          ring.map(([lng,lat])=>{const c=_convertCoords(lat,lng,sys);return{x:c.x,y:c.y};})
        );
        polygons.push({rings, name});

      } else if(geomType === 'MultiPolygon'){
        const name = (feat.properties?.name || volName || '') + suffix;
        for(const poly of feat.geometry.coordinates){
          const rings = poly.map(ring =>
            ring.map(([lng,lat])=>{const c=_convertCoords(lat,lng,sys);return{x:c.x,y:c.y};})
          );
          polygons.push({rings, name});
        }
      }
    }
  };

  for(const vol of vols){
    if(vol.geojson) processGJ(vol.geojson, vol.name, false);
    for(const vp of (site.vol_progress||[])){
      if(vp.volume_id !== vol.id || !vp.geojson) continue;
      processGJ(vp.geojson, vol.name, true);
    }
  }
  return {points, polylines, polygons};
}

function _convertCoords(lat, lng, sys){
  if(sys === 'msk'){
    const r = wgsToMsk(lat, lng);
    return {x: r.northing, y: r.easting};
  } else if(sys === 'gsk'){
    const r = wgsToGsk(lat, lng);
    return {x: r.northing, y: r.easting};
  }
  return {x: lat, y: lng};
}

function _askDxfCoordSys(){
  return new Promise(resolve=>{
    const overlay = document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML=`
      <div style="background:var(--s);border-radius:var(--r);padding:24px 28px;min-width:280px;box-shadow:var(--shl)">
        <div style="font-size:14px;font-weight:700;margin-bottom:14px">📐 Экспорт DXF — выбор СК</div>
        <div style="display:flex;flex-direction:column;gap:10px;font-size:13px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="radio" name="dxf_cs" value="wgs" checked> WGS-84 (широта / долгота)
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="radio" name="dxf_cs" value="msk"> МСК-86/89 (X northing / Y easting)
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="radio" name="dxf_cs" value="gsk"> ГСК-2011 (X northing / Y easting)
          </label>
        </div>
        <div style="display:flex;gap:8px;margin-top:18px;justify-content:flex-end">
          <button class="btn bs bsm" id="_dxf_cancel">Отмена</button>
          <button class="btn bp bsm" id="_dxf_ok">Экспорт</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#_dxf_ok').onclick=()=>{
      const val=overlay.querySelector('input[name=dxf_cs]:checked')?.value||'wgs';
      document.body.removeChild(overlay);
      resolve(val);
    };
    overlay.querySelector('#_dxf_cancel').onclick=()=>{
      document.body.removeChild(overlay);
      resolve(null);
    };
    overlay.addEventListener('click',e=>{if(e.target===overlay){document.body.removeChild(overlay);resolve(null);}});
  });
}

async function exportVolumesDXF(siteId){
  const sys = await _askDxfCoordSys();
  if(!sys) return;

  let site;
  try{
    const r = await fetch(`${API}/sites/${siteId}`);
    if(!r.ok) throw new Error();
    site = await r.json();
  }catch(e){
    toast('Ошибка загрузки объекта','err');
    return;
  }

  const {points, polylines, polygons} = _collectDxfFeatures(site, sys);
  if(!points.length && !polylines.length && !polygons.length){
    toast('Нет геометрии объёмов для экспорта','err');
    return;
  }

  const dxf = buildVolumesDXF({points, polylines, polygons, coordSys:sys, siteName:site.name||''});
  const fname = (site.name||'объект').replace(/[\\/:*?"<>|]/g,'_') + '_объёмы.dxf';
  _dxfDownload(dxf, fname);
  toast(`DXF сохранён (${points.length} точек, ${polylines.length} линий, ${polygons.length} контуров)`, 'ok');
}
