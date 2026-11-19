// Местные системы УХТА-B / УХТА-C (ЛСК МГ «Бованенково–Ухта. III нитка», этап 3.5, БЕНТА):
// контрольные точки из ITRF-2008 XYZ → x, y УСК — до 1 мм
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const proj4 = require('proj4');
const src = fs.readFileSync(path.join(__dirname, '..', 'public/js/coord-convert.js'), 'utf8');
const projOf = id => { const m = src.match(new RegExp(`id: '${id}'[\\s\\S]*?proj: '([^']+)'`)); return m && m[1]; };
const PTS = {
  'lsk:ukhta_b': [[1243149.987, 2255862.029, 5815489.672, 246578.907, 323015.271], [1257411.444, 2257907.770, 5811663.151, 237442.386, 311234.963], [1306962.651, 2269353.975, 5796338.177, 201336.343, 272268.602]],
  'lsk:ukhta_c': [[1332392.551, 2263153.517, 5792939.508, 354012.385, 553752.089], [1355199.023, 2260861.666, 5788575.734, 342646.154, 533371.272], [1404738.490, 2264591.893, 5775422.376, 309790.945, 493849.857]],
};
for (const id of Object.keys(PTS)) test(`${id}: контрольные точки ≤ 1 мм, обратный пересчёт`, () => {
  const p = projOf(id); assert.ok(p, 'нет системы ' + id);
  for (const [X, Y, Z, x, y] of PTS[id]) {
    const [lon, lat, h] = proj4('+proj=geocent +datum=WGS84 +units=m', 'WGS84', [X, Y, Z]);
    const [e, n] = proj4('WGS84', p, [lon, lat, h]);
    assert.ok(Math.abs(n - x) < 0.001 && Math.abs(e - y) < 0.001, `${id}: dx=${(n - x).toFixed(4)} dy=${(e - y).toFixed(4)}`);
    const [lon2, lat2] = proj4(p, 'WGS84', [y, x]);
    assert.ok(Math.abs(lon2 - lon) < 1e-7 && Math.abs(lat2 - lat) < 1e-7);
  }
});

test('таблица → Word (.docx): архив с document.xml, шапка, строки и итог', () => {
  const AdmZip = require('adm-zip');
  const buf = require('../routes/docx-table').buildDocx({ title: 'Каталог координат', lines: ['Система координат: УХТА-B'], head: ['№', 'Название', 'X, м', 'Y, м'], rows: [['1', 'KT7620', '246578,907', '323015,271'], ['2', 'A&B <x>', 1.5, '']], foot: ['', 'Итого: 2', '', ''] });
  const z = new AdmZip(buf), xml = z.readAsText('word/document.xml');
  assert.ok(z.getEntry('[Content_Types].xml') && z.getEntry('_rels/.rels'));
  assert.match(xml, /Каталог координат/); assert.match(xml, /246578,907/); assert.match(xml, /A&amp;B &lt;x&gt;/); assert.match(xml, /1,5/); assert.match(xml, /Итого: 2/);
  assert.strictEqual((xml.match(/<w:tr>|<w:tr /g) || []).length + (xml.match(/<w:tr><w:trPr>/g) || []).length > 0, true);
});
