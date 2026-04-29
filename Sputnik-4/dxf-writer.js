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

module.exports = { buildDXF, saveDXF };
