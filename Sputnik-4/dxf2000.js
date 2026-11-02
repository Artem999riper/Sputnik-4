// ═══════════════════════════════════════════════════════════
// dxf2000.js — запись DXF 2000 (AC1015) для AutoCAD, когда нужны кириллические
// имена слоёв с пробелами (в R12 имя — только латиница/цифры/«_-$», до 31 знака,
// иначе AutoCAD отбрасывает файл; Robur к этому нестрог).
// Основа — проверенный «пустой» чертёж dxf2000-skeleton.dxf (таблицы, *Model_Space,
// словари OBJECTS); сюда добавляются типы линий, слои, стиль, блоки и объекты
// с handle/владельцем/подклассами. Объекты подаются в виде пар R12
// (LINE, POINT, TEXT, CIRCLE, SOLID, INSERT, POLYLINE+VERTEX) — переводятся сами.
// Кодировка — cp1251 ($DWGCODEPAGE ANSI_1251).
// ═══════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

const SKEL = fs.readFileSync(path.join(__dirname, 'dxf2000-skeleton.dxf'), 'latin1').split(/\r?\n/);
const _pairs = lines => { const P = []; for (let i = 0; i + 1 < lines.length; i += 2) P.push([lines[i].trim(), lines[i + 1]]); return P; };

// R12-пары → сущности {t, c:[[code,val]…], v:[вершины-сущности]}
function parseEntities(P) {
  const out = []; let cur = null, poly = null;
  for (const [c, v] of P) {
    if (c === '0') {
      if (v === 'VERTEX' && poly) { cur = { t: 'VERTEX', c: [] }; poly.v.push(cur); continue; }
      if (v === 'SEQEND') { poly = null; cur = null; continue; }
      cur = { t: v, c: [] };
      if (v === 'POLYLINE') { cur.v = []; poly = cur; } else poly = null;
      out.push(cur); continue;
    }
    if (cur) cur.c.push([c, v]);
  }
  return out;
}
const _get = (e, code, def) => { const p = e.c.find(x => x[0] === code); return p ? p[1] : def; };

class Dxf2000 {
  constructor() {
    this.P = _pairs(SKEL);
    this.h = parseInt(this._header('$HANDSEED') || '100', 16);
    this.layers = []; this.ltypes = []; this.styles = []; this.blocks = []; this.ents = [];
    this.layerNames = new Set(['0', 'DEFPOINTS']); this.ltNames = new Set(['BYBLOCK', 'BYLAYER', 'CONTINUOUS']);
    this.ms = this._recHandle('BLOCK_RECORD', '*Model_Space');
    this.plotStyle = this._layer0PlotStyle();
    this.tab = {}; ['LTYPE', 'LAYER', 'STYLE', 'BLOCK_RECORD'].forEach(t => { this.tab[t] = this._tableHandle(t); });
  }
  _header(name) { const i = this.P.findIndex(p => p[0] === '9' && p[1] === name); return i >= 0 ? this.P[i + 1][1] : null; }
  _setHeader(name, code, val) { const i = this.P.findIndex(p => p[0] === '9' && p[1] === name); if (i >= 0) this.P[i + 1] = [code, String(val)]; else { const j = this.P.findIndex(p => p[0] === '0' && p[1] === 'ENDSEC'); this.P.splice(j, 0, ['9', name], [code, String(val)]); } }
  _tableHandle(t) { const i = this.P.findIndex((p, k) => p[0] === '0' && p[1] === 'TABLE' && this.P[k + 1] && this.P[k + 1][1] === t); return this.P[i + 2][1]; }
  _recHandle(t, name) { for (let i = 0; i < this.P.length; i++) if (this.P[i][0] === '0' && this.P[i][1] === t) { let h = null; for (let j = i + 1; j < this.P.length && this.P[j][0] !== '0'; j++) { if (this.P[j][0] === '5') h = this.P[j][1]; if (this.P[j][0] === '2' && this.P[j][1] === name) return h; } } return null; }
  _layer0PlotStyle() { for (let i = 0; i < this.P.length; i++) if (this.P[i][0] === '0' && this.P[i][1] === 'LAYER') for (let j = i + 1; j < this.P.length && this.P[j][0] !== '0'; j++) if (this.P[j][0] === '390') return this.P[j][1]; return null; }
  hd() { return (this.h++).toString(16).toUpperCase(); }

  addLtype(name, desc, pattern) {
    if (this.ltNames.has(name.toUpperCase())) return; this.ltNames.add(name.toUpperCase());
    const r = [['0', 'LTYPE'], ['5', this.hd()], ['330', this.tab.LTYPE], ['100', 'AcDbSymbolTableRecord'], ['100', 'AcDbLinetypeTableRecord'], ['2', name], ['70', '0'], ['3', desc || ''], ['72', '65'], ['73', String(pattern.length)], ['40', pattern.reduce((s, x) => s + Math.abs(x), 0).toFixed(4)]];
    pattern.forEach(x => r.push(['49', String(x)], ['74', '0']));
    this.ltypes.push(r);
  }
  addLayer(name, color, ltype) {
    if (this.layerNames.has(name.toUpperCase())) return; this.layerNames.add(name.toUpperCase());
    const lt = ltype && this.ltNames.has(String(ltype).toUpperCase()) ? ltype : 'Continuous';
    const r = [['0', 'LAYER'], ['5', this.hd()], ['330', this.tab.LAYER], ['100', 'AcDbSymbolTableRecord'], ['100', 'AcDbLayerTableRecord'], ['2', name], ['70', '0'], ['62', String(color || 7)], ['6', lt], ['370', '-3']];
    if (this.plotStyle) r.push(['390', this.plotStyle]);
    this.layers.push(r);
  }
  addStyle(name, font, height) {
    this.styles.push([['0', 'STYLE'], ['5', this.hd()], ['330', this.tab.STYLE], ['100', 'AcDbSymbolTableRecord'], ['100', 'AcDbTextStyleTableRecord'], ['2', name], ['70', '0'], ['40', '0.0'], ['41', '1.0'], ['50', '0.0'], ['71', '0'], ['42', String(height || 2.5)], ['3', font], ['4', '']]);
  }
  // блок из R12-пар его содержимого
  addBlock(name, r12pairs) {
    const br = this.hd();
    const rec = [['0', 'BLOCK_RECORD'], ['5', br], ['330', this.tab.BLOCK_RECORD], ['100', 'AcDbSymbolTableRecord'], ['100', 'AcDbBlockTableRecord'], ['2', name]];
    const body = [['0', 'BLOCK'], ['5', this.hd()], ['330', br], ['100', 'AcDbEntity'], ['8', '0'], ['100', 'AcDbBlockBegin'], ['2', name], ['70', '0'], ['10', '0.0'], ['20', '0.0'], ['30', '0.0'], ['3', name], ['1', '']];
    parseEntities(r12pairs).forEach(e => this._emit(body, e, br));
    body.push(['0', 'ENDBLK'], ['5', this.hd()], ['330', br], ['100', 'AcDbEntity'], ['8', '0'], ['100', 'AcDbBlockEnd']);
    this.blocks.push({ rec, body });
  }
  // объекты модели из R12-пар; mapLayer(entity) → {layer, dropColor} — перенос на другие слои
  addEntities(r12pairs, mapLayer) {
    parseEntities(r12pairs).forEach(e => {
      if (mapLayer) { const m = mapLayer(e); if (m) { e.c = e.c.map(p => p[0] === '8' ? ['8', m.layer] : p); if (m.dropColor) e.c = e.c.filter(p => p[0] !== '62'); } }
      this._emit(this.ents, e, this.ms);
    });
  }
  _emit(o, e, owner) {
    const g = (c, v) => o.push([String(c), String(v)]), x = c => _get(e, c, '0');
    const head = sub => { g(0, e.t === 'POLYLINE' ? 'LWPOLYLINE' : e.t); g(5, this.hd()); g(330, owner); g(100, 'AcDbEntity'); g(8, _get(e, '8', '0'));
      const lt = _get(e, '6'); if (lt) g(6, lt); const col = _get(e, '62'); if (col != null && col !== '256') g(62, col); g(100, sub); };
    switch (e.t) {
      case 'LINE': head('AcDbLine'); ['10', '20', '30', '11', '21', '31'].forEach(c => g(c, x(c))); break;
      case 'POINT': head('AcDbPoint'); ['10', '20', '30'].forEach(c => g(c, x(c))); break;
      case 'CIRCLE': head('AcDbCircle'); ['10', '20', '30', '40'].forEach(c => g(c, x(c))); break;
      case 'SOLID': head('AcDbTrace'); ['10', '20', '30', '11', '21', '31', '12', '22', '32', '13', '23', '33'].forEach(c => g(c, x(c))); break;
      case 'INSERT': head('AcDbBlockReference'); g(2, _get(e, '2')); ['10', '20', '30'].forEach(c => g(c, x(c)));
        ['41', '42', '43'].forEach(c => g(c, _get(e, c, '1'))); if (_get(e, '50')) g(50, _get(e, '50')); break;
      case 'TEXT': {
        head('AcDbText'); ['10', '20', '30', '40'].forEach(c => g(c, x(c))); g(1, _get(e, '1', ''));
        if (_get(e, '50')) g(50, _get(e, '50'));
        const st = _get(e, '7'); g(7, !st || /^standard$/i.test(st) ? 'Standard' : st);
        const h72 = _get(e, '72', '0'), v73 = _get(e, '73', '0');
        if (h72 !== '0') g(72, h72);
        if (h72 !== '0' || v73 !== '0') ['11', '21', '31'].forEach((c, k) => g(c, _get(e, c, x(['10', '20', '30'][k]))));   // точка выравнивания
        g(100, 'AcDbText'); if (v73 !== '0') g(73, v73);
        break;
      }
      case 'POLYLINE': {
        const vs = e.v || []; if (vs.length < 2) return;
        head('AcDbPolyline'); g(90, vs.length); g(70, (+_get(e, '70', '0') & 1) ? 1 : 0);
        const w = _get(e, '40'); if (w && +w) g(43, w);
        vs.forEach(v => { g(10, _get(v, '10', '0')); g(20, _get(v, '20', '0')); const b = _get(v, '42'); if (b && +b) g(42, b); });
        break;
      }
      default: return;     // прочее не переносим
    }
  }
  // запись: таблицы/блоки/объекты вставляются в основу; счётчики и HANDSEED обновляются
  write(file, header = {}) {
    this._setHeader('$DWGCODEPAGE', '3', 'ANSI_1251');
    Object.entries(header).forEach(([k, v]) => this._setHeader(k, '40', v));
    const add = { LTYPE: this.ltypes, LAYER: this.layers, STYLE: this.styles, BLOCK_RECORD: this.blocks.map(b => b.rec) };
    const out = [];
    let tab = null, sec = null;
    this._setHeader('$HANDSEED', '5', (this.h + 16).toString(16).toUpperCase());
    for (let i = 0; i < this.P.length; i++) {
      const [c, v] = this.P[i];
      if (c === '0' && v === 'SECTION') sec = this.P[i + 1][1];
      if (c === '0' && v === 'TABLE') tab = this.P[i + 1][1];
      // число записей таблицы
      if (sec === 'TABLES' && c === '70' && tab && add[tab] && this.P[i - 1][0] === '100' && this.P[i - 1][1] === 'AcDbSymbolTable') { out.push(['70', String((+v || 0) + add[tab].length)]); continue; }
      if (sec === 'TABLES' && c === '0' && v === 'ENDTAB' && tab && add[tab]) { add[tab].forEach(r => { for (const q of r) out.push(q); }); tab = null; }
      if (sec === 'BLOCKS' && c === '0' && v === 'ENDSEC') this.blocks.forEach(b => { for (const q of b.body) out.push(q); });
      if (sec === 'ENTITIES' && c === '0' && v === 'ENDSEC') for (const q of this.ents) out.push(q);
      if (c === '0' && v === 'ENDSEC') sec = null;
      out.push(this.P[i]);
    }
    const toCp = require('./situation').toCp1251;
    const fd = fs.openSync(file, 'w');
    try {
      let buf = '';
      for (const [c, v] of out) { buf += c.padStart(3) + '\r\n' + v + '\r\n'; if (buf.length > 1 << 20) { fs.writeSync(fd, toCp(buf)); buf = ''; } }
      fs.writeSync(fd, toCp(buf));
    } finally { fs.closeSync(fd); }
  }
}

module.exports = { Dxf2000, parseEntities };
