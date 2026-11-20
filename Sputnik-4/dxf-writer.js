// ═══════════════════════════════════════════════════════════
// dxf-writer.js — DXF R12 (максимальная совместимость)
// AutoCAD R12 формат читается ВСЕМИ версиями AutoCAD и Robur
// ═══════════════════════════════════════════════════════════

// Группа DXF: всегда код + значение на отдельных строках
function g(code, val) {
  return `${String(code).padStart(3)}\n${val}\n`;
}

function buildDXF({ contours = [], labels = [], gridPoints = [], textHeight = 2 }) {
  let s = '';

  // ── HEADER ─────────────────────────────────────────────
  s += g(0,  'SECTION');
  s += g(2,  'HEADER');
  s += g(9,  '$ACADVER');
  s += g(1,  'AC1009');       // DXF R12 — максимальная совместимость
  s += g(9,  '$INSUNITS');
  s += g(70, 6);              // 6 = метры
  s += g(9,  '$TEXTSIZE');
  s += g(40, textHeight);
  s += g(0,  'ENDSEC');

  // ── TABLES ─────────────────────────────────────────────
  s += g(0, 'SECTION');
  s += g(2, 'TABLES');

  // Таблица типов линий
  s += g(0, 'TABLE');
  s += g(2, 'LTYPE');
  s += g(70, 1);
  s += g(0, 'LTYPE');
  s += g(2, 'CONTINUOUS');
  s += g(70, 64);
  s += g(3, 'Solid line');
  s += g(72, 65);
  s += g(73, 0);
  s += g(40, 0.0);
  s += g(0, 'ENDTAB');

  // Таблица слоёв
  const layerDefs = [
    { name: 'ГОРИЗОНТАЛИ', color: 5, ltype: 'CONTINUOUS' },  // синий
    { name: 'ПОДПИСИ',     color: 2, ltype: 'CONTINUOUS' },  // жёлтый
    { name: 'ТОЧКИ_ВЫСОТ', color: 3, ltype: 'CONTINUOUS' },  // зелёный
  ];
  s += g(0, 'TABLE');
  s += g(2, 'LAYER');
  s += g(70, layerDefs.length);
  for (const l of layerDefs) {
    s += g(0, 'LAYER');
    s += g(2, l.name);
    s += g(70, 0);
    s += g(62, l.color);
    s += g(6, l.ltype);
  }
  s += g(0, 'ENDTAB');

  // Таблица стилей текста
  s += g(0, 'TABLE');
  s += g(2, 'STYLE');
  s += g(70, 1);
  s += g(0, 'STYLE');
  s += g(2, 'STANDARD');
  s += g(70, 0);
  s += g(40, 0);
  s += g(41, 1.0);
  s += g(50, 0);
  s += g(71, 0);
  s += g(42, textHeight);
  s += g(3, 'txt');
  s += g(4, '');
  s += g(0, 'ENDTAB');

  s += g(0, 'ENDSEC');

  // ── ENTITIES ────────────────────────────────────────────
  s += g(0, 'SECTION');
  s += g(2, 'ENTITIES');

  // ГОРИЗОНТАЛИ — сегменты LINE (3D)
  // Каждый отрезок = одна линия от точки к точке
  for (const c of contours) {
    if (!c.coords || c.coords.length < 2) continue;
    const elev = isFinite(c.elevation) ? c.elevation : 0;
    for (let i = 0; i < c.coords.length - 1; i++) {
      const [x1, y1, z1] = c.coords[i];
      const [x2, y2, z2] = c.coords[i + 1];
      const Z1 = isFinite(z1) ? z1 : elev;
      const Z2 = isFinite(z2) ? z2 : elev;
      s += g(0,  'LINE');
      s += g(8,  'ГОРИЗОНТАЛИ');
      s += g(62, 5);
      s += g(10, x1.toFixed(3));
      s += g(20, y1.toFixed(3));
      s += g(30, Z1.toFixed(3));
      s += g(11, x2.toFixed(3));
      s += g(21, y2.toFixed(3));
      s += g(31, Z2.toFixed(3));
    }
  }

  // ПОДПИСИ — TEXT
  for (const lbl of labels) {
    const z = isFinite(lbl.z) ? lbl.z : 0;
    const h = lbl.height || textHeight;
    s += g(0,  'TEXT');
    s += g(8,  'ПОДПИСИ');
    s += g(62, 2);
    s += g(10, lbl.x.toFixed(3));
    s += g(20, lbl.y.toFixed(3));
    s += g(30, z.toFixed(3));
    s += g(40, h.toFixed(3));
    s += g(1,  String(lbl.text));
    s += g(50, lbl.angle || 0);    // угол поворота
    s += g(72, 1);                 // выравнивание: центр
    s += g(11, lbl.x.toFixed(3));
    s += g(21, lbl.y.toFixed(3));
    s += g(31, z.toFixed(3));
  }

  // ТОЧКИ_ВЫСОТ — POINT + TEXT рядом
  for (const pt of gridPoints) {
    const z = isFinite(pt.z) ? pt.z : 0;
    const offset = textHeight * 0.6;
    // Точка
    s += g(0,  'POINT');
    s += g(8,  'ТОЧКИ_ВЫСОТ');
    s += g(62, 3);
    s += g(10, pt.x.toFixed(3));
    s += g(20, pt.y.toFixed(3));
    s += g(30, z.toFixed(3));
    // Подпись высоты
    s += g(0,  'TEXT');
    s += g(8,  'ТОЧКИ_ВЫСОТ');
    s += g(62, 3);
    s += g(10, (pt.x + offset).toFixed(3));
    s += g(20, (pt.y + offset).toFixed(3));
    s += g(30, z.toFixed(3));
    s += g(40, (textHeight * 0.45).toFixed(3));
    s += g(1,  z.toFixed(2));
    s += g(72, 0);
    s += g(11, (pt.x + offset).toFixed(3));
    s += g(21, (pt.y + offset).toFixed(3));
    s += g(31, z.toFixed(3));
  }

  s += g(0, 'ENDSEC');
  s += g(0, 'EOF');
  return s;
}

// Записывает DXF в Windows-1251 — AutoCAD R12 требует эту кодировку для кириллицы.
// UTF-8 файл AutoCAD не открывает без пересохранения.
function saveDXF(filePath, dxfString) {
  const fs = require('fs');
  // Конвертируем строку в Windows-1251 побайтово
  const buf = Buffer.alloc(dxfString.length);
  for (let i = 0; i < dxfString.length; i++) {
    const code = dxfString.charCodeAt(i);
    if (code < 0x80) {
      buf[i] = code; // ASCII — без изменений
    } else {
      // Кириллица Unicode → Windows-1251
      buf[i] = CP1251_MAP[code] || 0x3F; // '?' если нет в таблице
    }
  }
  fs.writeFileSync(filePath, buf);
}

// Таблица перекодировки Unicode → Windows-1251 для кириллицы
const CP1251_MAP = {};
// Русские заглавные А-Я: U+0410–U+042F → 0xC0–0xDF
for (let i = 0; i < 32; i++) CP1251_MAP[0x0410 + i] = 0xC0 + i;
// Русские строчные а-я: U+0430–U+044F → 0xE0–0xFF
for (let i = 0; i < 32; i++) CP1251_MAP[0x0430 + i] = 0xE0 + i;
// Ё/ё
CP1251_MAP[0x0401] = 0xA8;
CP1251_MAP[0x0451] = 0xB8;

// ═══════════════════════════════════════════════════════════
// buildLayersDXF — экспорт GeoJSON-слоёв в DXF R12
// layers: [{ name, color?: 1..7, geojson: <stringified or object> }]
// transform: (lng, lat) => [x, y] в целевой СК
// ═══════════════════════════════════════════════════════════
function buildLayersDXF({ layers = [], transform = (lng, lat) => [lng, lat] }) {
  // DXF R12: имя слоя — не длиннее 31 символа, только буквы, цифры и « _ - $ »
  // (иначе AutoCAD файл не открывает); регистр не различается
  const R12_MAX = 31;
  const sanitizeName = (n) => String(n || 'СЛОЙ')
    .replace(/[^A-Za-z0-9А-Яа-яЁё_$-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'СЛОЙ';
  // длинное — начало и конец названия («Инженерно-геологиче_уч_150-250»): различия обычно в конце
  const shorten = (n) => n.length <= R12_MAX ? n
    : n.slice(0, 19).replace(/_+$/, '') + '_' + n.slice(-11).replace(/^[_-]+/, '');

  const seen = new Set();
  const layerDefs = layers.map((l, i) => {
    let nm = shorten(sanitizeName(l.name || `СЛОЙ_${i + 1}`));
    let candidate = nm; let k = 1;
    // одинаковые после обрезки — номер в конце, общая длина всё равно ≤ 31
    while (seen.has(candidate.toUpperCase())) { const suf = `_${k++}`; candidate = nm.slice(0, R12_MAX - suf.length).replace(/_+$/, '') + suf; }
    seen.add(candidate.toUpperCase());
    return { dxfName: candidate, color: Number.isFinite(l.color) ? l.color : 7, gj: l.geojson };
  });

  let s = '';
  s += g(0, 'SECTION'); s += g(2, 'HEADER');
  s += g(9, '$ACADVER'); s += g(1, 'AC1009');
  s += g(9, '$DWGCODEPAGE'); s += g(3, 'ANSI_1251');   // кириллица в cp1251
  s += g(9, '$INSUNITS'); s += g(70, 6);
  s += g(0, 'ENDSEC');

  s += g(0, 'SECTION'); s += g(2, 'TABLES');
  s += g(0, 'TABLE'); s += g(2, 'LTYPE'); s += g(70, 1);
  s += g(0, 'LTYPE'); s += g(2, 'CONTINUOUS'); s += g(70, 64);
  s += g(3, 'Solid line'); s += g(72, 65); s += g(73, 0); s += g(40, 0.0);
  s += g(0, 'ENDTAB');

  s += g(0, 'TABLE'); s += g(2, 'LAYER'); s += g(70, layerDefs.length);
  for (const l of layerDefs) {
    s += g(0, 'LAYER'); s += g(2, l.dxfName); s += g(70, 0);
    s += g(62, l.color); s += g(6, 'CONTINUOUS');
  }
  s += g(0, 'ENDTAB');

  s += g(0, 'TABLE'); s += g(2, 'STYLE'); s += g(70, 1);
  s += g(0, 'STYLE'); s += g(2, 'STANDARD'); s += g(70, 0);
  s += g(40, 0); s += g(41, 1.0); s += g(50, 0); s += g(71, 0);
  s += g(42, 2.5); s += g(3, 'txt'); s += g(4, '');
  s += g(0, 'ENDTAB');
  s += g(0, 'ENDSEC');

  // ── Буферы: определения блоков (BLOCKS) и объекты (ENTITIES) ──
  // Точка выгружается как вставка БЛОКА (INSERT) — один блок на слой: POINT + атрибуты.
  // Атрибут NAME (видимый) — название объекта; остальные поля объекта (глубина, номер…)
  // — скрытые атрибуты: в AutoCAD видны в «Свойствах» и в редакторе атрибутов, их можно
  // извлечь в таблицу (_DATAEXTRACTION / _ATTEXT). Точка и подпись выделяются вместе.
  let blk = '';   // тело секции BLOCKS
  let ent = '';   // тело секции ENTITIES
  const TXT_H = 2.5, OFF = 1;
  const blockNames = new Set();
  // тег атрибута: без пробелов, заглавными (кириллица — можно, файл в cp1251)
  const tagOf = k => String(k).trim().replace(/[^A-Za-z0-9А-Яа-яЁё_-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').toUpperCase().slice(0, 31) || 'ПОЛЕ';
  const val = v => v == null ? '' : String(typeof v === 'number' ? String(v).replace('.', ',') : v).replace(/[\r\n\t]+/g, ' ').slice(0, 250);
  const nameOf = p => p.name || p.Name || p.title || '';

  function tf(c) {
    const r = transform(c[0], c[1]);
    return [Number(r[0]) || 0, Number(r[1]) || 0];
  }

  // блок слоя: определяется один раз, с полями всех точек слоя
  function defineBlock(layer) {
    if (layer.block) return layer.block;
    let bn = (layer.dxfName.slice(0, 27).replace(/_+$/, '') + '_PT'), k = 2;
    while (blockNames.has(bn.toUpperCase())) bn = layer.dxfName.slice(0, 24).replace(/_+$/, '') + '_PT' + (k++);
    blockNames.add(bn.toUpperCase());
    const used = new Set(['NAME']), fields = [];
    (layer.fields || []).forEach(f => { let t = tagOf(f), n = 2; while (used.has(t)) t = tagOf(f).slice(0, 28) + '_' + (n++); used.add(t); fields.push({ key: f, tag: t }); });
    blk += g(0, 'BLOCK'); blk += g(8, layer.dxfName); blk += g(2, bn);
    blk += g(70, 2); blk += g(10, '0.000'); blk += g(20, '0.000'); blk += g(30, '0.000');
    blk += g(3, bn);
    blk += g(0, 'POINT'); blk += g(8, layer.dxfName); blk += g(62, 256);
    blk += g(10, '0.000'); blk += g(20, '0.000'); blk += g(30, '0.000');
    const attdef = (tag, prompt, i, hidden) => {
      blk += g(0, 'ATTDEF'); blk += g(8, layer.dxfName); blk += g(62, 256);
      blk += g(10, OFF.toFixed(3)); blk += g(20, (OFF - i * TXT_H * 1.4).toFixed(3)); blk += g(30, '0.000');
      blk += g(40, TXT_H.toFixed(1)); blk += g(1, ''); blk += g(3, String(prompt).slice(0, 100)); blk += g(2, tag); blk += g(70, hidden ? 1 : 0);
    };
    attdef('NAME', 'Название', 0, false);
    fields.forEach((f, i) => attdef(f.tag, f.key, i + 1, true));
    blk += g(0, 'ENDBLK'); blk += g(8, layer.dxfName);
    layer.block = { bn, fields };
    return layer.block;
  }

  function emitPoint(layer, c, props) {
    const [x, y] = tf(c);
    const name = nameOf(props);
    const hasData = name || (layer.fields || []).some(f => props[f] != null && props[f] !== '');
    if (!hasData) {
      // точка без названия и без данных — обычный POINT
      ent += g(0, 'POINT'); ent += g(8, layer.dxfName); ent += g(62, layer.color);
      ent += g(10, x.toFixed(3)); ent += g(20, y.toFixed(3)); ent += g(30, '0.000');
      return;
    }
    const B = defineBlock(layer);
    ent += g(0, 'INSERT'); ent += g(8, layer.dxfName); ent += g(62, layer.color); ent += g(66, 1);
    ent += g(2, B.bn);
    ent += g(10, x.toFixed(3)); ent += g(20, y.toFixed(3)); ent += g(30, '0.000');
    const attrib = (tag, v, i, hidden) => {
      ent += g(0, 'ATTRIB'); ent += g(8, layer.dxfName); ent += g(62, layer.color);
      ent += g(10, (x + OFF).toFixed(3)); ent += g(20, (y + OFF - i * TXT_H * 1.4).toFixed(3)); ent += g(30, '0.000');
      ent += g(40, TXT_H.toFixed(1)); ent += g(1, v); ent += g(2, tag); ent += g(70, hidden ? 1 : 0);
    };
    attrib('NAME', val(name), 0, false);
    B.fields.forEach((f, i) => attrib(f.tag, val(props[f.key]), i + 1, true));
    ent += g(0, 'SEQEND'); ent += g(8, layer.dxfName);
  }

  function emitLine(layer, coords) {
    for (let i = 0; i < coords.length - 1; i++) {
      const [x1, y1] = tf(coords[i]);
      const [x2, y2] = tf(coords[i + 1]);
      const z1 = isFinite(coords[i][2]) ? coords[i][2] : 0;
      const z2 = isFinite(coords[i + 1][2]) ? coords[i + 1][2] : 0;
      ent += g(0, 'LINE'); ent += g(8, layer.dxfName); ent += g(62, layer.color);
      ent += g(10, x1.toFixed(3)); ent += g(20, y1.toFixed(3)); ent += g(30, z1.toFixed(3));
      ent += g(11, x2.toFixed(3)); ent += g(21, y2.toFixed(3)); ent += g(31, z2.toFixed(3));
    }
  }

  function emitPolygon(layer, rings) {
    for (const ring of rings) {
      if (!ring || ring.length < 2) continue;
      // Используем Z первой точки кольца как высоту полигона (однородная для зоны затопления)
      const ringZ = isFinite(ring[0]?.[2]) ? ring[0][2] : 0;
      ent += g(0, 'POLYLINE'); ent += g(8, layer.dxfName); ent += g(62, layer.color);
      ent += g(66, 1); ent += g(70, 1); ent += g(30, ringZ.toFixed(3));
      for (const c of ring) {
        const [x, y] = tf(c);
        const z = isFinite(c[2]) ? c[2] : ringZ;
        ent += g(0, 'VERTEX'); ent += g(8, layer.dxfName);
        ent += g(10, x.toFixed(3)); ent += g(20, y.toFixed(3)); ent += g(30, z.toFixed(3));
      }
      ent += g(0, 'SEQEND'); ent += g(8, layer.dxfName);
    }
  }

  function emitFeature(layer, feature) {
    if (!feature || !feature.geometry) return;
    const geom = feature.geometry;
    const props = feature.properties || {};
    switch (geom.type) {
      case 'Point':           emitPoint(layer, geom.coordinates, props); break;
      case 'MultiPoint':      (geom.coordinates || []).forEach(c => emitPoint(layer, c, props)); break;
      case 'LineString':      emitLine(layer, geom.coordinates || []); break;
      case 'MultiLineString': (geom.coordinates || []).forEach(line => emitLine(layer, line)); break;
      case 'Polygon':         emitPolygon(layer, geom.coordinates || []); break;
      case 'MultiPolygon':    (geom.coordinates || []).forEach(rings => emitPolygon(layer, rings)); break;
      case 'GeometryCollection':
        (geom.geometries || []).forEach(gm => emitFeature(layer, { geometry: gm, properties: props }));
        break;
    }
  }

  for (const layer of layerDefs) {
    let gj = layer.gj;
    if (typeof gj === 'string') {
      try { gj = JSON.parse(gj); } catch (e) { gj = null; }
    }
    if (!gj) continue;
    const features = gj.type === 'FeatureCollection' ? (gj.features || [])
      : gj.type === 'Feature' ? [gj]
      : gj.type ? [{ geometry: gj, properties: {} }]
      : [];
    // поля точек слоя → скрытые атрибуты блока (служебные «_…» и название — не берём)
    const fs = new Set();
    features.forEach(f => { const gt = f && f.geometry && f.geometry.type; if (!/Point/.test(gt || '')) return; Object.keys((f && f.properties) || {}).forEach(k => { const v = f.properties[k]; if (!k.startsWith('_') && !/^(name|Name|title)$/.test(k) && (v == null || typeof v !== 'object')) fs.add(k); }); });
    layer.fields = [...fs].slice(0, 40);
    features.forEach(f => emitFeature(layer, f));
  }

  // ── BLOCKS ── (обязательные *MODEL_SPACE / *PAPER_SPACE + наши блоки точек)
  s += g(0, 'SECTION'); s += g(2, 'BLOCKS');
  for (const bn of ['*MODEL_SPACE', '*PAPER_SPACE']) {
    s += g(0, 'BLOCK'); s += g(8, '0'); s += g(2, bn); s += g(70, 0);
    s += g(10, '0.000'); s += g(20, '0.000'); s += g(30, '0.000'); s += g(3, bn);
    s += g(0, 'ENDBLK'); s += g(8, '0');
  }
  s += blk;
  s += g(0, 'ENDSEC');

  // ── ENTITIES ──
  s += g(0, 'SECTION'); s += g(2, 'ENTITIES');
  s += ent;
  s += g(0, 'ENDSEC');

  s += g(0, 'EOF');
  return s;
}

module.exports = { buildDXF, saveDXF, buildLayersDXF };
