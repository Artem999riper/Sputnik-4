// ═══════════════════════════════════════════════════════════
// situation.js — «ситуация» для выгрузки рельефа: контуры воды, болот, леса,
// кустарника, лугов, песка, здания, дороги, ЛЭП, трубопроводы, заборы, просеки.
//   • данные — OpenStreetMap через Overpass API (fetchOSM → GeoJSON с классом _sit);
//   • в DXF — слои, типы линий и блоки условных знаков шаблона ПурГеоКом
//     (Osnova_2015, файл situation-template.json); контуры — замкнутые полилинии,
//     площадные объекты заполняются блоками знаков по сетке в шахматном порядке;
//     размер знаков — по масштабу плана (блоки нарисованы в мм бумаги);
//   • mergeIntoDxf дописывает всё в готовый DXF горизонталей (R12):
//     кодировка cp1251 ($DWGCODEPAGE ANSI_1251) — кириллические имена слоёв.
// Точность OSM — 5–20 м: ситуация «для ориентира», не съёмка.
// ═══════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const proj4 = require('proj4');

const TPL = JSON.parse(fs.readFileSync(path.join(__dirname, 'situation-template.json'), 'utf8'));

// ── Классы ситуации ────────────────────────────────────────
// g — группа (для выбора в окне), a — площадной, layer — слой шаблона,
// block/mm — блок заполнения и шаг сетки знаков на бумаге, мм; c — цвет на карте
const SIT_GROUPS = {
  water: 'Вода (озёра, реки, ручьи, канавы)', wet: 'Болота и заболоченность', veg: 'Растительность (лес, кустарник, луг, мох)',
  soil: 'Грунты (песок, камни)', bld: 'Здания', road: 'Дороги и тропы', power: 'ЛЭП и линии связи', pipe: 'Трубопроводы', other: 'Прочее (просеки, заборы, кладбища, пашни)',
};
const SIT = {
  lake:       { g: 'water', a: 1, layer: 'Озеро', c: '#2563eb', n: 'Озеро, водоём' },
  river_area: { g: 'water', a: 1, layer: 'Урез воды', c: '#3b82f6', n: 'Река (урез воды)' },
  river:      { g: 'water', layer: 'Река', c: '#1d4ed8', n: 'Река' },
  stream:     { g: 'water', layer: 'Ручей', c: '#60a5fa', n: 'Ручей' },
  stream_int: { g: 'water', layer: 'Ручей пересыхающий', c: '#93c5fd', n: 'Ручей пересыхающий' },
  ditch:      { g: 'water', layer: 'Канава', c: '#0ea5e9', n: 'Канава' },
  bog:        { g: 'wet', a: 1, layer: 'Контур болота', block: 'Boloto5', mm: 20, c: '#0891b2', n: 'Болото' },
  marsh:      { g: 'wet', a: 1, layer: 'Контур болота', block: 'Osoka', mm: 10, c: '#0e7490', n: 'Болото осоковое' },
  reed:       { g: 'wet', a: 1, layer: 'Контур болота', block: 'Kamish', mm: 10, c: '#155e75', n: 'Камыш' },
  wet_meadow: { g: 'wet', a: 1, layer: 'Контур заболочено', block: 'Zabolocheno', mm: 10, c: '#67e8f9', n: 'Заболоченность' },
  forest:     { g: 'veg', a: 1, layer: 'Контур леса', block: 'Les', mm: 12, c: '#15803d', n: 'Лес' },
  scrub:      { g: 'veg', a: 1, layer: 'Контур кустарника', block: 'KustZarosli', mm: 12, c: '#65a30d', n: 'Кустарник' },
  heath:      { g: 'veg', a: 1, layer: 'Контур кустарника', block: 'Kustarnichki', mm: 10, c: '#84cc16', n: 'Кустарнички' },
  meadow:     { g: 'veg', a: 1, layer: 'Контур сенокоса', block: 'VisokoTravie', mm: 10, c: '#a3e635', n: 'Луг' },
  grass:      { g: 'veg', a: 1, layer: 'Контур', block: 'Gazon', mm: 10, c: '#bef264', n: 'Травяная растительность' },
  moss:       { g: 'veg', a: 1, layer: 'Контур', block: 'Moh', mm: 10, c: '#a16207', n: 'Мох, тундра' },
  sand:       { g: 'soil', a: 1, layer: 'Контур', block: 'Pesok', mm: 4, c: '#eab308', n: 'Песок' },
  bare:       { g: 'soil', a: 1, layer: 'Контур', c: '#d6d3d1', n: 'Открытый грунт (отсыпки, площадки)' },
  rock:       { g: 'soil', a: 1, layer: 'Контур', block: 'Valun', mm: 8, c: '#78716c', n: 'Камни, скалы' },
  farmland:   { g: 'other', a: 1, layer: 'Контур пашни', c: '#ca8a04', n: 'Пашня' },
  cemetery:   { g: 'other', a: 1, layer: 'Контур', block: 'Kladbische', mm: 8, c: '#57534e', n: 'Кладбище' },
  building:   { g: 'bld', a: 1, layer: 'Здания', c: '#dc2626', n: 'Здание' },
  road_paved: { g: 'road', layer: 'Дорога с покрытием', c: '#f97316', n: 'Дорога с покрытием' },
  road_asph:  { g: 'road', layer: 'Дорога асфальт', c: '#ea580c', n: 'Дорога асфальт' },
  road_conc:  { g: 'road', layer: 'Дорога бетон', c: '#ea580c', n: 'Дорога бетон' },
  road_grav:  { g: 'road', layer: 'Дорога гравий', c: '#fb923c', n: 'Дорога гравий / щебень' },
  road_dirt:  { g: 'road', layer: 'Дорога грунтовая', c: '#a16207', n: 'Дорога грунтовая' },
  road_track: { g: 'road', layer: 'Дорога полевая', c: '#92400e', n: 'Дорога полевая' },
  road_winter:{ g: 'road', layer: 'Дорога зимник', c: '#7dd3fc', n: 'Зимник' },
  path:       { g: 'road', layer: 'Тропы', c: '#78350f', n: 'Тропа' },
  rail:       { g: 'road', layer: 'Дорога Ж-Д', c: '#111827', n: 'Железная дорога' },
  power_hv:   { g: 'power', layer: 'ЛЭП высоковольтная', c: '#b91c1c', n: 'ЛЭП' },
  power_lv:   { g: 'power', layer: 'ЛЭП низковольтная', c: '#ef4444', n: 'ЛЭП низковольтная' },
  power_cab:  { g: 'power', layer: 'Кабель высоковольтный', c: '#f87171', n: 'Кабель' },
  comm:       { g: 'power', layer: 'Воздушная линия связи', c: '#facc15', n: 'Линия связи' },
  pipe_gas:   { g: 'pipe', layer: 'Газопровод', c: '#eab308', n: 'Газопровод' },
  pipe_oil:   { g: 'pipe', layer: 'Нефтепровод', c: '#713f12', n: 'Нефтепровод' },
  pipe_prod:  { g: 'pipe', layer: 'Нефтепродуктопровод', c: '#854d0e', n: 'Нефтепродуктопровод' },
  pipe_cond:  { g: 'pipe', layer: 'Конденсатопровод', c: '#a16207', n: 'Конденсатопровод' },
  pipe_water: { g: 'pipe', layer: 'Водопровод', c: '#0284c7', n: 'Водопровод' },
  pipe_heat:  { g: 'pipe', layer: 'Теплотрасса', c: '#be123c', n: 'Теплотрасса' },
  pipe_sewer: { g: 'pipe', layer: 'Канализация', c: '#6b21a8', n: 'Канализация' },
  pipe_other: { g: 'pipe', layer: 'Сооружения', c: '#525252', n: 'Трубопровод' },
  cutline:    { g: 'other', layer: 'Просека', c: '#4d7c0f', n: 'Просека' },
  fence:      { g: 'other', layer: 'Забор', c: '#52525b', n: 'Забор' },
  wall:       { g: 'other', layer: 'Забор каменный', c: '#3f3f46', n: 'Забор каменный' },
  embankment: { g: 'other', layer: 'Откос верх', c: '#a8a29e', n: 'Насыпь, дамба' },
};

// ── Классификация тегов OSM ────────────────────────────────
function classify(t, isArea) {
  const has = k => t[k] != null && t[k] !== 'no';
  const n = t.natural, lu = t.landuse, ww = t.waterway, hw = t.highway, mm = t.man_made;
  if (isArea) {
    if (has('building') || (t['building:part'] && t['building:part'] !== 'no')) return 'building';
    if (n === 'water' || lu === 'reservoir' || lu === 'basin' || ww === 'riverbank' || ww === 'dock') {
      return /river|canal|stream|riverbank/.test(t.water || '') || ww === 'riverbank' ? 'river_area' : 'lake';
    }
    if (n === 'wetland') {
      const w = t.wetland || '';
      if (w === 'wet_meadow' || w === 'saltmarsh' || w === 'tidalflat') return 'wet_meadow';
      if (w === 'reedbed') return 'reed';
      if (w === 'marsh') return 'marsh';
      return 'bog';                       // bog, string_bog, palsa_bog, fen, swamp, mangrove…
    }
    if (n === 'wood' || lu === 'forest') return 'forest';
    if (n === 'scrub') return 'scrub';
    if (n === 'heath') return 'heath';
    if (lu === 'meadow') return 'meadow';
    if (n === 'grassland' || lu === 'grass' || lu === 'village_green') return 'grass';
    if (n === 'tundra' || n === 'fell' || n === 'moss') return 'moss';
    if (n === 'sand' || n === 'beach' || n === 'dune') return 'sand';
    if (n === 'bare_rock' || n === 'scree' || n === 'shingle' || n === 'stone') return 'rock';
    if (lu === 'farmland' || lu === 'allotments') return 'farmland';
    if (lu === 'cemetery' || t.amenity === 'grave_yard') return 'cemetery';
  }
  // линейные (и площадные, если линейный тег)
  if (ww === 'river' || ww === 'canal') return 'river';
  if (ww === 'stream' || ww === 'brook') return t.intermittent === 'yes' ? 'stream_int' : 'stream';
  if (ww === 'ditch' || ww === 'drain') return 'ditch';
  if (t.railway === 'rail' || t.railway === 'narrow_gauge' || t.railway === 'light_rail') return 'rail';
  if (hw) {
    if (t.winter_road === 'yes' || t.ice_road === 'yes' || hw === 'winter_road' || hw === 'ice_road') return 'road_winter';
    if (/^(path|footway|bridleway|cycleway|steps|pedestrian)$/.test(hw)) return 'path';
    const s = t.surface || '';
    if (/asphalt/.test(s)) return 'road_asph';
    if (/concrete|paving_stones|sett/.test(s)) return 'road_conc';
    if (/gravel|fine_gravel|compacted|pebblestone/.test(s)) return 'road_grav';
    if (/^(dirt|earth|ground|sand|mud|grass|unpaved)$/.test(s)) return hw === 'track' ? 'road_track' : 'road_dirt';
    if (s === 'paved') return 'road_paved';
    if (hw === 'track') return 'road_track';
    if (/^(motorway|trunk|primary|secondary)(_link)?$/.test(hw)) return 'road_asph';
    if (/^(tertiary|tertiary_link|unclassified|residential|service|living_street|road)$/.test(hw)) return 'road_dirt';
    return null;
  }
  if (t.power === 'line') return 'power_hv';
  if (t.power === 'minor_line') return 'power_lv';
  if (t.power === 'cable') return 'power_cab';
  if (t.telecom === 'line' || t.communication === 'line') return 'comm';
  if (mm === 'pipeline') {
    const s = (t.substance || t.type || '').toLowerCase();
    if (/gas/.test(s)) return 'pipe_gas';
    if (/condensate/.test(s)) return 'pipe_cond';
    if (/^oil|crude/.test(s)) return 'pipe_oil';
    if (/fuel|petroleum|diesel|kerosene|gasoline/.test(s)) return 'pipe_prod';
    if (/^(water|drinking_water)$/.test(s)) return 'pipe_water';
    if (/heat|hot_water|steam/.test(s)) return 'pipe_heat';
    if (/sewage|wastewater/.test(s)) return 'pipe_sewer';
    return 'pipe_other';
  }
  if (mm === 'cutline') return 'cutline';
  if (mm === 'embankment' || mm === 'dyke' || t.embankment === 'yes') return 'embankment';
  if (t.barrier === 'fence' || t.barrier === 'hedge') return 'fence';
  if (t.barrier === 'wall' || t.barrier === 'retaining_wall') return 'wall';
  return null;
}
// слой ЛЭП по напряжению («ВЛ 110 кВ 3пров» из шаблона) и надземные трубы
function layerFor(cls, p) {
  const c = SIT[cls]; if (!c) return 'Условные знаки';
  if ((cls === 'power_hv' || cls === 'power_lv') && p && p.voltage) {
    const kv = Math.max(...String(p.voltage).split(/[;,]/).map(v => +v / 1000).filter(v => v > 0));
    if (isFinite(kv)) {
      const k = String(kv).replace(/\.0+$/, ''), nm = `ВЛ ${k} кВ 3пров`;
      if (TPL.layers[nm]) return nm;
    }
  }
  if (/^pipe_/.test(cls) && p && /overground|overhead/.test(p.location || '')) {
    const nm = c.layer + (c.layer === 'Теплотрасса' ? ' надземная' : ' надземный');
    if (TPL.layers[nm]) return nm;
  }
  return c.layer;
}

// ── Загрузка из OpenStreetMap (Overpass) ───────────────────
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
function overpassQuery(b) {
  const bb = `${b.minLat},${b.minLng},${b.maxLat},${b.maxLng}`;
  const sel = [
    'way["natural"~"^(water|wetland|wood|scrub|heath|grassland|tundra|fell|moss|sand|beach|dune|bare_rock|scree|shingle|stone)$"]',
    'relation["natural"~"^(water|wetland|wood|scrub|heath|grassland|tundra|fell|sand|beach|bare_rock|scree)$"]',
    'way["landuse"~"^(forest|meadow|grass|village_green|farmland|allotments|cemetery|reservoir|basin)$"]',
    'relation["landuse"~"^(forest|meadow|grass|farmland|cemetery|reservoir|basin)$"]',
    'way["waterway"]', 'relation["waterway"="riverbank"]',
    'way["building"]', 'relation["building"]',
    'way["highway"]', 'way["railway"~"^(rail|narrow_gauge|light_rail)$"]',
    'way["power"~"^(line|minor_line|cable)$"]', 'way["telecom"="line"]',
    'way["man_made"~"^(pipeline|cutline|embankment|dyke)$"]', 'way["barrier"~"^(fence|hedge|wall|retaining_wall)$"]',
    'way["amenity"="grave_yard"]',
  ];
  return `[out:json][timeout:180][maxsize:536870912];(${sel.map(s => s + `(${bb});`).join('')});out body;>;out skel qt;`;
}
async function fetchOSM(bbox, opts = {}) {
  const km2 = (bbox.maxLat - bbox.minLat) * 111.32 * (bbox.maxLng - bbox.minLng) * 111.32 * Math.cos((bbox.minLat + bbox.maxLat) / 2 * Math.PI / 180);
  if (!(km2 > 0)) throw new Error('Пустая область');
  if (km2 > (opts.maxKm2 || 2500)) throw new Error(`Слишком большая область для ситуации (${km2.toFixed(0)} км², не больше ${opts.maxKm2 || 2500})`);
  const q = overpassQuery(bbox);
  let lastErr = null;
  for (const url of OVERPASS) {
    try {
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 200000);
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: ac.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'PurGeoKom-Sputnik/2 (survey planning)' } });
      clearTimeout(tm);
      if (!r.ok) { lastErr = new Error(`${new URL(url).host}: HTTP ${r.status}`); continue; }
      const j = await r.json();
      return osmToGeoJSON(j);
    } catch (e) { lastErr = e; }
  }
  throw new Error('OpenStreetMap недоступен (' + (lastErr ? lastErr.message : 'нет ответа') + '). Нужен интернет на сервере.');
}

// Сборка колец из отрезков (ways мультиполигона): соединяем по совпадающим концам
function joinRings(ways) {
  const segs = ways.filter(w => w && w.length > 1).map(w => w.slice()), rings = [];
  const key = c => c[0].toFixed(7) + ',' + c[1].toFixed(7);
  while (segs.length) {
    let ring = segs.shift();
    let guard = 0;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && guard++ < 10000) {
      const end = key(ring[ring.length - 1]);
      const i = segs.findIndex(s => key(s[0]) === end || key(s[s.length - 1]) === end);
      if (i < 0) break;
      const s = segs.splice(i, 1)[0];
      ring = ring.concat((key(s[0]) === end ? s : s.slice().reverse()).slice(1));
    }
    if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}
const _ringArea = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return s / 2; };
const _pip = (x, y, ring) => { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins; } return ins; };

function osmToGeoJSON(j) {
  const nodes = new Map(), ways = new Map(), feats = [];
  (j.elements || []).forEach(e => { if (e.type === 'node') nodes.set(e.id, [e.lon, e.lat]); });
  (j.elements || []).forEach(e => { if (e.type === 'way') ways.set(e.id, e); });
  const coords = w => (w.nodes || []).map(id => nodes.get(id)).filter(Boolean);
  const keepTags = t => { const o = {}; ['name', 'natural', 'landuse', 'waterway', 'wetland', 'water', 'highway', 'surface', 'building', 'power', 'voltage', 'man_made', 'substance', 'location', 'barrier', 'intermittent', 'railway', 'leaf_type'].forEach(k => { if (t[k] != null) o[k] = t[k]; }); return o; };
  const inRel = new Set();
  (j.elements || []).forEach(r => {
    if (r.type !== 'relation' || !r.tags) return;
    if (r.tags.type !== 'multipolygon' && !(r.tags.waterway === 'riverbank')) return;
    const cls = classify(r.tags, true); if (!cls || !SIT[cls] || !SIT[cls].a) return;
    const outer = [], inner = [];
    (r.members || []).forEach(m => { if (m.type !== 'way') return; const w = ways.get(m.ref); if (!w) return; inRel.add(m.ref); (m.role === 'inner' ? inner : outer).push(coords(w)); });
    const O = joinRings(outer), I = joinRings(inner);
    if (!O.length) return;
    const polys = O.map(o => [o]);
    I.forEach(h => { const p = polys.find(pl => _pip(h[0][0], h[0][1], pl[0])) || polys[0]; p.push(h); });
    feats.push({ type: 'Feature', properties: Object.assign(keepTags(r.tags), { _sit: cls, _osm: 'r' + r.id }),
      geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys } });
  });
  ways.forEach(w => {
    if (!w.tags) return;
    const c = coords(w); if (c.length < 2) return;
    const closed = c.length >= 4 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1];
    const linearTag = w.tags.highway || (w.tags.waterway && w.tags.waterway !== 'riverbank') || w.tags.barrier || w.tags.power || w.tags.man_made === 'pipeline' || w.tags.railway;
    const asArea = closed && (w.tags.area === 'yes' || !linearTag);
    let cls = classify(w.tags, asArea);
    if (!cls && closed && !asArea) cls = classify(w.tags, true);
    if (!cls || !SIT[cls]) return;
    const area = !!SIT[cls].a && closed;
    if (inRel.has(w.id) && area && !w.tags.building) return;      // контур — часть мультиполигона
    feats.push({ type: 'Feature', properties: Object.assign(keepTags(w.tags), { _sit: cls, _osm: 'w' + w.id }),
      geometry: area ? { type: 'Polygon', coordinates: [c] } : { type: 'LineString', coordinates: c } });
  });
  // крупные площадные — первыми (на карте мелкие сверху)
  const sz = f => f.geometry.type === 'Polygon' ? Math.abs(_ringArea(f.geometry.coordinates[0])) : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.reduce((s, p) => s + Math.abs(_ringArea(p[0])), 0) : 0;
  feats.sort((a, b) => sz(b) - sz(a));
  return { type: 'FeatureCollection', features: feats };
}

// ── Геометрия в плоскости: обрезка по области ──────────────
// Отрезки полилинии внутри многоугольника области (может быть невыпуклым — коридор)
function clipPolyline(pts, region, closed) {
  const P = closed ? pts.concat([pts[0]]) : pts, out = [];
  let cur = null;
  const E = []; for (const ring of region) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) E.push([ring[j], ring[i]]);
  const inside = (x, y) => region.reduce((s, r) => s !== _pip(x, y, r), false);
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], ts = [0, 1];
    const minx = Math.min(a[0], b[0]), maxx = Math.max(a[0], b[0]), miny = Math.min(a[1], b[1]), maxy = Math.max(a[1], b[1]);
    for (const [c, d] of E) {
      if (Math.max(c[0], d[0]) < minx || Math.min(c[0], d[0]) > maxx || Math.max(c[1], d[1]) < miny || Math.min(c[1], d[1]) > maxy) continue;
      const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1], den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    for (let k = 0; k < ts.length - 1; k++) {
      const t0 = ts[k], t1 = ts[k + 1]; if (t1 - t0 < 1e-9) continue;
      const tm = (t0 + t1) / 2, mx = a[0] + (b[0] - a[0]) * tm, my = a[1] + (b[1] - a[1]) * tm;
      const p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
      if (inside(mx, my)) { if (!cur) cur = [p0]; cur.push(p1); }
      else if (cur) { out.push(cur); cur = null; }
    }
  }
  if (cur) out.push(cur);
  // кольцо целиком внутри — остаётся замкнутым
  if (closed && out.length === 1 && out[0].length === P.length) return [{ pts: pts.slice(), closed: true }];
  // кольцо разрезано: склеить начало и конец, если стыкуются
  if (closed && out.length > 1) { const f = out[0], l = out[out.length - 1]; if (Math.hypot(f[0][0] - l[l.length - 1][0], f[0][1] - l[l.length - 1][1]) < 1e-6) { out[0] = l.concat(f.slice(1)); out.pop(); } }
  return out.filter(s => s.length > 1).map(s => ({ pts: s, closed: false }));
}
// Точки сетки знаков внутри многоугольника (кольца с дырками) и внутри области — построчно
function fillPoints(rings, region, step, margin, cap) {
  const pts = []; let minY = Infinity, maxY = -Infinity;
  rings[0].forEach(p => { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; });
  const xs = (y, rs) => { const o = []; rs.forEach(r => { for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y)) o.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); } }); return o.sort((p, q) => p - q); };
  const rowH = step * 0.866;
  for (let k = Math.ceil(minY / rowH); k * rowH <= maxY; k++) {
    const y = k * rowH, off = (k & 1) ? step / 2 : 0;
    const A = xs(y, rings), B = xs(y, region);
    for (let i = 0; i + 1 < A.length; i += 2) {
      const x0 = A[i] + margin, x1 = A[i + 1] - margin; if (x1 < x0) continue;
      for (let x = Math.ceil((x0 - off) / step) * step + off; x <= x1; x += step) {
        let ins = false; for (let q = 0; q < B.length; q++) { if (B[q] > x) break; ins = !ins; }
        if (ins) { pts.push([x, y]); if (pts.length >= cap) return pts; }
      }
    }
  }
  return pts;
}

// ── DXF (R12) ──────────────────────────────────────────────
const f3 = v => (Math.round(v * 1000) / 1000).toFixed(3);
function _gp(o, code, v) { o.push(String(code).padStart(3), String(v)); }
// тип линии: чередование штрих/пробел, начинается со штриха, кончается пробелом
function _ltNorm(p) {
  const out = [];
  p.forEach(v => { const s = v >= 0 ? 1 : -1; if (out.length && (out[out.length - 1] >= 0 ? 1 : -1) === s) out[out.length - 1] += v; else out.push(v); });
  if (out.length > 1 && out[0] >= 0 && out[out.length - 1] >= 0) { out[0] += out.pop(); }
  if (out.length && out[out.length - 1] >= 0) out.push(-0.5);
  return out.length >= 2 ? out : null;
}
function _blockDef(o, name, prims) {
  _gp(o, 0, 'BLOCK'); _gp(o, 8, '0'); _gp(o, 2, name); _gp(o, 70, 0); _gp(o, 10, 0); _gp(o, 20, 0); _gp(o, 30, 0); _gp(o, 3, name);
  _blockBody(o, prims);
  _gp(o, 0, 'ENDBLK'); _gp(o, 8, '0');
}
// содержимое блока (пары R12): полилинии, окружности, залитые кружки, заливки
function _blockBody(o, prims) {
  const col = c => c == null ? 256 : c;  // без цвета — «по слою»: блок на слое 0 берёт цвет слоя вставки
  prims.forEach(p => {
    if (p.t === 'pl') {
      _gp(o, 0, 'POLYLINE'); _gp(o, 8, '0'); _gp(o, 62, col(p.c)); _gp(o, 66, 1); _gp(o, 10, 0); _gp(o, 20, 0); _gp(o, 30, 0); _gp(o, 70, p.z ? 1 : 0);
      if (p.w) { _gp(o, 40, f3(p.w)); _gp(o, 41, f3(p.w)); }
      p.p.forEach(v => { _gp(o, 0, 'VERTEX'); _gp(o, 8, '0'); _gp(o, 10, f3(v[0])); _gp(o, 20, f3(v[1])); _gp(o, 30, 0); if (v[2]) _gp(o, 42, v[2]); });
      _gp(o, 0, 'SEQEND'); _gp(o, 8, '0');
    } else if (p.t === 'ci') {
      _gp(o, 0, 'CIRCLE'); _gp(o, 8, '0'); _gp(o, 62, col(p.c)); _gp(o, 10, f3(p.x)); _gp(o, 20, f3(p.y)); _gp(o, 30, 0); _gp(o, 40, f3(p.r));
    } else if (p.t === 'dot' || p.t === 'pt') {
      // залитый кружок: замкнутая полилиния-«бублик» шириной в радиус
      const r = p.t === 'pt' ? 0.12 : p.r;
      _gp(o, 0, 'POLYLINE'); _gp(o, 8, '0'); _gp(o, 62, col(p.c)); _gp(o, 66, 1); _gp(o, 10, 0); _gp(o, 20, 0); _gp(o, 30, 0); _gp(o, 70, 1); _gp(o, 40, f3(r)); _gp(o, 41, f3(r));
      [[p.x - r / 2, p.y], [p.x + r / 2, p.y]].forEach(v => { _gp(o, 0, 'VERTEX'); _gp(o, 8, '0'); _gp(o, 10, f3(v[0])); _gp(o, 20, f3(v[1])); _gp(o, 30, 0); _gp(o, 42, 1); });
      _gp(o, 0, 'SEQEND'); _gp(o, 8, '0');
    } else if (p.t === 'fill' && p.p.length >= 3) {
      for (let i = 1; i + 1 < p.p.length; i++) {
        const A = p.p[0], B = p.p[i], C = p.p[i + 1];
        _gp(o, 0, 'SOLID'); _gp(o, 8, '0'); _gp(o, 62, col(p.c));
        _gp(o, 10, f3(A[0])); _gp(o, 20, f3(A[1])); _gp(o, 30, 0); _gp(o, 11, f3(B[0])); _gp(o, 21, f3(B[1])); _gp(o, 31, 0);
        _gp(o, 12, f3(C[0])); _gp(o, 22, f3(C[1])); _gp(o, 32, 0); _gp(o, 13, f3(C[0])); _gp(o, 23, f3(C[1])); _gp(o, 33, 0);
      }
    }
  });
}
function _blockBox(prims) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y, r = 0) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  prims.forEach(p => { if (p.p) p.p.forEach(v => add(v[0], v[1])); if (p.x != null) add(p.x, p.y, p.r || 0); });
  return isFinite(x0) ? { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 } : { w: 1, h: 1, cx: 0, cy: 0 };
}

// Построить части DXF для ситуации.
// features — GeoJSON (WGS-84) с properties._sit; opts: {proj4|epsg, bbox, clip, scale, groups[], maxSymbols}
function buildSituation(features, opts) {
  const scale = +opts.scale || 2000, k = scale / 1000;               // мм бумаги → метры
  const dst = opts.proj4 || (opts.epsg ? `EPSG:${opts.epsg}` : 'EPSG:4326');
  const T = proj4('EPSG:4326', dst);
  const fw = c => T.forward([+c[0], +c[1]]);
  const groups = opts.groups && opts.groups.length ? new Set(opts.groups) : null;
  // область обрезки в плоскости: контур clip или рамка bbox (рёбра сгущены — в МСК рамка слегка кривая)
  let region;
  if (opts.clip && opts.clip.type === 'Polygon') region = opts.clip.coordinates.map(r => r.map(fw));
  else {
    const b = opts.bbox, r = [], N = 16;
    for (let i = 0; i < N; i++) r.push([b.minLng + (b.maxLng - b.minLng) * i / N, b.minLat]);
    for (let i = 0; i < N; i++) r.push([b.maxLng, b.minLat + (b.maxLat - b.minLat) * i / N]);
    for (let i = 0; i < N; i++) r.push([b.maxLng - (b.maxLng - b.minLng) * i / N, b.maxLat]);
    for (let i = 0; i < N; i++) r.push([b.minLng, b.maxLat - (b.maxLat - b.minLat) * i / N]);
    region = [r.map(fw)];
  }
  const ent = [], usedLayers = new Set(), usedBlocks = new Set(), stats = {}, labels = [];
  const isGeo = /longlat|EPSG:4326$/.test(dst);
  // знаков не больше maxSymbols: при перегрузе шаг сетки увеличивается
  const maxSym = opts.maxSymbols || 150000;
  let symCount = 0;
  const pl = (layer, pts, closed) => {
    _gp(ent, 0, 'POLYLINE'); _gp(ent, 8, layer); _gp(ent, 66, 1); _gp(ent, 10, 0); _gp(ent, 20, 0); _gp(ent, 30, 0); _gp(ent, 70, closed ? 1 : 0);
    pts.forEach(p => { _gp(ent, 0, 'VERTEX'); _gp(ent, 8, layer); _gp(ent, 10, f3(p[0])); _gp(ent, 20, f3(p[1])); _gp(ent, 30, 0); });
    _gp(ent, 0, 'SEQEND'); _gp(ent, 8, layer); usedLayers.add(layer);
  };
  const fills = [];
  for (const f of features || []) {
    const p = f.properties || {}, g = f.geometry; if (!g) continue;
    // класс: служебный _sit, а если в таблице атрибутов поменяли «класс» — по его названию
    const byName = p['класс'] ? Object.keys(SIT).find(k => SIT[k].n.toLowerCase() === String(p['класс']).trim().toLowerCase()) : null;
    const cls = byName || (p._sit && SIT[p._sit] ? p._sit : null);
    if (cls && groups && !groups.has(SIT[cls].g)) continue;
    if (!cls && groups && !groups.has('other')) continue;
    const layer = cls ? layerFor(cls, p) : 'Условные знаки';
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : null;
    let n = 0;
    if (polys) {
      polys.forEach(poly => {
        const R = poly.map(r => r.map(fw)).map(r => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) ? r.slice(0, -1) : r).filter(r => r.length >= 3);
        if (!R.length) return;
        R.forEach(r => clipPolyline(r, region, true).forEach(s => { pl(layer, s.pts, s.closed); n++; }));
        const c = cls && SIT[cls];
        if (c && c.block && TPL.blocks[c.block]) fills.push({ R, c, layer: c.g === 'wet' ? 'Гидрология' : c.g === 'veg' ? 'Растительность' : 'Условные знаки', cls });
        if (p.name && (cls === 'lake' || cls === 'river_area')) {
          const pts = fillPoints(R, region, Math.max(1, Math.sqrt(Math.abs(_ringArea(R[0]))) / 3), 0, 9);
          if (pts.length) labels.push({ x: pts[Math.floor(pts.length / 2)][0], y: pts[Math.floor(pts.length / 2)][1], t: p.name });
        }
      });
    } else if (lines) {
      lines.forEach(ln => {
        const L = ln.map(fw); if (L.length < 2) return;
        const parts = clipPolyline(L, region, false);
        parts.forEach(s => { pl(layer, s.pts, false); n++; });
        if (p.name && (cls === 'river' || cls === 'stream') && parts.length) {
          const s = parts.sort((a, b) => b.pts.length - a.pts.length)[0].pts, i = Math.floor(s.length / 2), a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
          let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
          labels.push({ x: s[i][0], y: s[i][1], t: p.name, ang });
        }
      });
    } else if (g.type === 'Point') {
      // точки (нарисованные вручную) — метка
      const q = fw(g.coordinates);
      if (region.reduce((s, r) => s !== _pip(q[0], q[1], r), false)) { _gp(ent, 0, 'POINT'); _gp(ent, 8, layer); _gp(ent, 10, f3(q[0])); _gp(ent, 20, f3(q[1])); _gp(ent, 30, 0); usedLayers.add(layer); n++; }
    }
    if (n) { const key = cls || 'other'; stats[key] = (stats[key] || 0) + 1; }
  }
  // заполнение знаками: сначала оцениваем количество, при перегрузе — реже
  if (!isGeo && fills.length) {
    let est = 0; fills.forEach(F => { const a = Math.abs(_ringArea(F.R[0])), s = F.c.mm * k; est += a / (s * s * 0.866); });
    const thin = est > maxSym ? Math.sqrt(est / maxSym) : 1;
    stats._thin = thin > 1 ? +thin.toFixed(2) : 1;
    fills.forEach(F => {
      const prim = TPL.blocks[F.c.block], bx = _blockBox(prim), step = F.c.mm * k * thin, margin = Math.max(bx.w, bx.h) * k * 0.55;
      const pts = fillPoints(F.R, region, step, margin, Math.max(0, maxSym - symCount));
      if (!pts.length) return;
      usedBlocks.add(F.c.block); usedLayers.add(F.layer);
      pts.forEach(q => {
        _gp(ent, 0, 'INSERT'); _gp(ent, 8, F.layer); _gp(ent, 2, F.c.block);
        _gp(ent, 10, f3(q[0] - bx.cx * k)); _gp(ent, 20, f3(q[1] - bx.cy * k)); _gp(ent, 30, 0);
        _gp(ent, 41, k); _gp(ent, 42, k); _gp(ent, 43, k);
      });
      symCount += pts.length;
    });
  }
  // подписи: названия озёр и рек, высота 2,5 мм на бумаге
  const th = 2.5 * k;
  labels.forEach(L => {
    _gp(ent, 0, 'TEXT'); _gp(ent, 8, 'Текст'); _gp(ent, 7, 'SIT'); _gp(ent, 10, f3(L.x)); _gp(ent, 20, f3(L.y)); _gp(ent, 30, 0);
    _gp(ent, 40, f3(th)); _gp(ent, 1, L.t); if (L.ang) _gp(ent, 50, L.ang.toFixed(1)); _gp(ent, 72, 1); _gp(ent, 73, 2); _gp(ent, 11, f3(L.x)); _gp(ent, 21, f3(L.y)); _gp(ent, 31, 0);
    usedLayers.add('Текст');
  });
  stats._symbols = symCount;
  return { ent, usedLayers, usedBlocks, stats, scale };
}

// ── Кодировка cp1251 ───────────────────────────────────────
const _CP = (() => { const m = new Map(); for (let i = 0; i < 64; i++) m.set(0x410 + i, 0xC0 + i); m.set(0x401, 0xA8); m.set(0x451, 0xB8); m.set(0x2116, 0xB9); m.set(0xAB, 0xAB); m.set(0xBB, 0xBB); m.set(0x2014, 0x97); m.set(0x2013, 0x96); m.set(0xB0, 0xB0); m.set(0xB7, 0xB7); return m; })();
function toCp1251(s) {
  const b = Buffer.allocUnsafe(s.length); let n = 0;
  for (const ch of s) { const c = ch.codePointAt(0); b[n++] = c < 128 ? c : (_CP.get(c) || 0x3F); }
  return b.subarray(0, n);
}

// ── Дописать ситуацию в готовый DXF горизонталей ───────────
// Файл переписывается в DXF 2000 (dxf2000.js): в R12 AutoCAD не принимает
// кириллические имена слоёв с пробелами. Горизонтали, подписи и точки высот
// переносятся как есть; opts.contoursToTemplate — горизонтали на слои шаблона
// «Горизонтали основные / утолщенные» (каждая 5-я), цвет — по слою.
function mergeIntoDxf(file, sit, opts = {}) {
  const { Dxf2000 } = require('./dxf2000');
  // исходник от dem_export.py — ASCII; уже обработанный файл — cp1251 (по $DWGCODEPAGE)
  const bytes = fs.readFileSync(file), cp1251 = /ANSI_1251/.test(bytes.subarray(0, 4000).toString('latin1'));
  const raw = (cp1251 ? new TextDecoder('windows-1251').decode(bytes) : bytes.toString('latin1')).split(/\r?\n/);
  const P = []; for (let i = 0; i + 1 < raw.length; i += 2) P.push([raw[i].trim(), raw[i + 1]]);
  const D = new Dxf2000();
  const iv = +opts.interval || 1;
  // слои исходного файла (GORIZONTALI, PODPISI, TOCHKI_VYSOT) и его объекты
  const src = [], ent = []; let sec = null, inLayer = false, cur = null;
  for (let i = 0; i < P.length; i++) {
    const [c, v] = P[i];
    if (c === '0' && v === 'SECTION') { sec = P[i + 1] && P[i + 1][1]; continue; }
    if (c === '0' && v === 'ENDSEC') { sec = null; continue; }
    if (sec === 'TABLES') {
      if (c === '0') { inLayer = v === 'LAYER'; if (inLayer) { cur = { c: 7 }; src.push(cur); } continue; }
      if (inLayer && cur) { if (c === '2') cur.n = v; if (c === '62') cur.c = +v; }
    } else if (sec === 'ENTITIES') ent.push(P[i]);
  }
  // типы линий и слои шаблона
  const used = new Set(sit ? sit.usedLayers : []);
  if (opts.contoursToTemplate) ['Горизонтали основные', 'Горизонтали утолщенные'].forEach(n => used.add(n));
  used.forEach(n => { const L = TPL.layers[n]; if (L && TPL.ltypes[L.lt]) { const p = _ltNorm(TPL.ltypes[L.lt].p); if (p) D.addLtype(L.lt, TPL.ltypes[L.lt].d || L.lt, p); } });
  src.forEach(l => {
    if (!l.n || l.n === '0') return;
    const T = TPL.layers[l.n];        // слой шаблона (например, файл уже с ситуацией) — с его типом линии
    if (T && TPL.ltypes[T.lt]) { const p = _ltNorm(TPL.ltypes[T.lt].p); if (p) D.addLtype(T.lt, TPL.ltypes[T.lt].d || T.lt, p); }
    D.addLayer(l.n, Math.abs(l.c) || 7, T ? T.lt : 'Continuous');
  });
  used.forEach(n => { const L = TPL.layers[n] || { c: 7, lt: 'Continuous' }; D.addLayer(n, L.c || 7, L.lt); });
  D.addStyle('SIT', 'arial.ttf', 2.5);           // подписи ситуации (кириллица — TrueType)
  if (sit) sit.usedBlocks.forEach(n => { const b = []; _blockBody(b, TPL.blocks[n]); const pr = []; for (let q = 0; q < b.length; q += 2) pr.push([b[q].trim(), b[q + 1]]); D.addBlock(n, pr); });
  D.addEntities(ent, opts.contoursToTemplate ? e => {
    if (e.t !== 'LINE' || (e.c.find(p => p[0] === '8') || [])[1] !== 'GORIZONTALI') return null;
    const z = +((e.c.find(p => p[0] === '30') || [])[1]);
    const k = Number.isFinite(z) ? Math.round(z / iv) : 1;
    return { layer: k % 5 === 0 ? 'Горизонтали утолщенные' : 'Горизонтали основные', dropColor: true };
  } : null);
  if (sit) { const pr = []; for (let q = 0; q < sit.ent.length; q += 2) pr.push([sit.ent[q].trim(), sit.ent[q + 1]]); D.addEntities(pr); }
  const lts0 = P.findIndex(p => p[0] === '9' && p[1] === '$LTSCALE');
  D.write(file, { '$LTSCALE': sit ? sit.scale / 1000 : lts0 >= 0 ? +P[lts0 + 1][1] || 1 : 1 });
}

// Классы для окна выгрузки: [{key, name, group}]
function classList() { return { groups: SIT_GROUPS, classes: Object.entries(SIT).map(([k, c]) => ({ k, n: c.n, g: c.g, a: !!c.a, c: c.c, layer: c.layer, block: c.block || null })) }; }

module.exports = { _blockBody, fetchOSM, osmToGeoJSON, classify, buildSituation, mergeIntoDxf, classList, SIT, SIT_GROUPS, TPL, toCp1251, clipPolyline, fillPoints };
