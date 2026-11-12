// Отмена выгрузки: идущая выгрузка в очереди останавливается сразу (скачивание прекращается),
// обрыв прямого запроса тоже останавливает работу
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), http = require('http'), zlib = require('zlib');
const { startServer } = require('./helpers');
const HAS_GDAL = ['/usr/bin', '/usr/local/bin', 'C:\\OSGeo4W\\bin'].some(d => fs.existsSync(path.join(d, process.platform === 'win32' ? 'gdalwarp.exe' : 'gdalwarp')));
let S;
test.before(async () => { S = await startServer(); });
test.after(async () => { if (S) await S.stop(); });
// минимальный PNG 256×256 (серый)
function png() {
  const crc = b => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(256, 0); ih.writeUInt32BE(256, 4); ih[8] = 8; ih[9] = 0;
  const raw = Buffer.alloc(257 * 256, 128); for (let y = 0; y < 256; y++) raw[y * 257] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]);
}

test('отмена идущей выгрузки подложки: задание убрано, тайлы больше не качаются', { skip: !HAS_GDAL && 'нет GDAL' }, async () => {
  const P = png(); let n = 0;
  const srv = http.createServer((q, r) => { n++; setTimeout(() => { r.writeHead(200, { 'Content-Type': 'image/png' }); r.end(P); }, 150); });
  await new Promise(r => srv.listen(0, r));
  try {
    const params = { bbox: { minLat: 64.5, maxLat: 65.3, minLng: 75.5, maxLng: 77.5 }, proj4: '+proj=longlat +datum=WGS84 +no_defs', satelliteOnly: true,
      satSourceUrl: `http://127.0.0.1:${srv.address().port}/{z}/{x}/{-y}`, satMaxZoom: 12, satZoom: 12 };
    const j = (await S.api('POST', '/api/dem/jobs', { params })).body;
    for (let i = 0; i < 80 && n < 8; i++) await new Promise(r => setTimeout(r, 150));
    assert.ok(n >= 8, 'выгрузка началась');
    assert.strictEqual((await S.api('DELETE', '/api/dem/jobs/' + j.id)).status, 200);
    let gone = false;
    for (let i = 0; i < 30 && !gone; i++) { await new Promise(r => setTimeout(r, 200)); const L = (await S.api('GET', '/api/dem/jobs')).body; gone = !(L.jobs || L).some(x => x.id === j.id); }
    assert.ok(gone, 'задание убрано');
    const n1 = n; await new Promise(r => setTimeout(r, 1500));
    assert.ok(n - n1 <= 1, 'после отмены тайлы не качаются: ' + (n - n1));
  } finally { srv.close(); }
});
