// Оконтуривание по снимку (public/js/sat-classify.js): классы по цвету/фактуре и контуры с дырками
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/sat-classify.js'), 'utf8') + ';this.F=satImageToFeatures;this.V=satVectorize;', ctx);

test('снимок: озеро, лес, болото — по цвету; контуры; остров в озере — дырка', () => {
  const w = 300, h = 200, px = new Uint8ClampedArray(w * h * 4);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = [92, 94, 66];                                                     // болото — серо-оливковое
    if (x < 100) c = [24, 38, 16];                                            // лес — тёмная зелень
    const dx = x - 210, dy = y - 100;
    if (dx * dx + dy * dy < 60 * 60 && !(dx * dx + dy * dy < 25 * 25)) c = [10, 10, 8];   // озеро с островом ~0,8 га
    const i = (y * w + x) * 4, n = rnd() * 10;
    px[i] = c[0] + n; px[i + 1] = c[1] + n; px[i + 2] = c[2] + n; px[i + 3] = 255;
  }
  const r = ctx.F(px, w, h, 2, (x, y) => [x, y], {});
  const by = {}; r.features.forEach(f => { by[f.properties._sit] = (by[f.properties._sit] || 0) + 1; });
  assert.ok(by.lake >= 1 && by.forest >= 1 && by.bog >= 1, JSON.stringify(by));
  const lake = r.features.filter(f => f.properties._sit === 'lake').sort((a, b) => b.geometry.coordinates[0].length - a.geometry.coordinates[0].length)[0];
  assert.strictEqual(lake.geometry.coordinates.length, 2, 'у озера дырка-остров');
  const xs = lake.geometry.coordinates[0].map(p => p[0]);
  assert.ok(Math.min(...xs) > 140 && Math.max(...xs) < 280, 'контур озера на месте');
});

test('контуры: внешнее кольцо и дырки по рёбрам пикселей', () => {
  const W = 8, H = 6, lab = new Uint8Array(W * H);
  for (let y = 1; y < 5; y++) for (let x = 1; x < 7; x++) lab[y * W + x] = 1;
  lab[2 * W + 2] = 0; lab[2 * W + 5] = 2;
  const p = ctx.V(lab, W, H, 1, 0.1);
  assert.strictEqual(p.length, 1); assert.strictEqual(p[0].holes.length, 2);
});

test('топокарта: лес — зелёная заливка, вода — голубая, болото — штриховка, линии не мешают', () => {
  const w = 300, h = 200, px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = [252, 252, 252];
    if (x < 100) c = [166, 226, 168];                                  // лес
    if ((x - 160) ** 2 + (y - 100) ** 2 < 30 * 30) c = [166, 228, 250]; // озеро
    if (x >= 210 && y > 30 && y < 170 && y % 6 === 0 && x % 14 < 10) c = [40, 60, 210];   // штриховка болота
    if (y === 150 && x < 200) c = [180, 120, 60];                       // горизонталь поперёк
    const i = (y * w + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  const r = ctx.F(px, w, h, 4, (x, y) => [x, y], { topo: true, rpx: 22 });
  const by = {}; r.features.forEach(f => { by[f.properties._sit] = (by[f.properties._sit] || 0) + 1; });
  assert.ok(by.forest >= 1 && by.lake >= 1 && by.bog >= 1, JSON.stringify(by));
  const bog = r.features.find(f => f.properties._sit === 'bog'), bx = bog.geometry.coordinates[0].map(p => p[0]);
  assert.ok(Math.min(...bx) > 190, 'болото — там, где штриховка');
});
