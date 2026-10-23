// QR: структура матрицы по стандарту (размер, искатели, формат и версия с BCH).
const test = require('node:test'), assert = require('node:assert');
const QR = require('../public/js/qr.js');

const fmtOk = M => {   // 15 бит формата → проверка BCH(15,5) по маске 0x5412
  const n = M.length, c = (y, x) => M[y][x] ? 1 : 0;   // M[строка][столбец]
  const bits = [c(0, 8), c(1, 8), c(2, 8), c(3, 8), c(4, 8), c(5, 8), c(7, 8), c(8, 8), c(8, 7), c(8, 5), c(8, 4), c(8, 3), c(8, 2), c(8, 1), c(8, 0)];
  let v = 0; bits.forEach((x, i) => { v |= x << i; }); v ^= 0x5412;
  let r = v; for (let i = 14; i >= 10; i--) if ((r >> i) & 1) r ^= 0x537 << (i - 10);
  // вторая копия формата (у правого и нижнего искателей)
  let v2 = 0; for (let i = 0; i < 8; i++) v2 |= (M[8][n - 1 - i] ? 1 : 0) << i; for (let i = 8; i < 15; i++) v2 |= (M[n - 15 + i][8] ? 1 : 0) << i;
  return r === 0 && (v2 ^ 0x5412) === v;
};
test('размер и версия растут с длиной текста', () => {
  for (const [t, ver] of [['A', 1], ['x'.repeat(40), 3], ['y'.repeat(120), 7], ['z'.repeat(1000), 26]]) {
    const M = QR.encode(t); assert.strictEqual(M.length, ver * 4 + 17, `длина ${t.length}`);
  }
});
test('искатели в трёх углах', () => {
  const M = QR.encode('http://192.168.1.10:3000/#eq=7f513886'), n = M.length;
  for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let i = 0; i < 7; i++) { assert.ok(M[y][x + i] && M[y + 6][x + i] && M[y + i][x] && M[y + i][x + 6], 'рамка'); }
    assert.ok(M[y + 3][x + 3] && !M[y + 1][x + 1], 'центр/зазор');
  }
});
test('информация о формате корректна (обе копии)', () => {
  for (const t of ['A', 'Привет, мир', 'u'.repeat(300)]) assert.ok(fmtOk(QR.encode(t)), t.slice(0, 10));
});
test('SVG строится', () => { assert.match(QR.svg('test'), /^<svg[^>]+viewBox/); });
