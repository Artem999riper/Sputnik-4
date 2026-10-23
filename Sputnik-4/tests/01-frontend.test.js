// Фронтенд: все скрипты разбираются без синтаксических ошибок, index.html
// ссылается только на существующие файлы, в CSS нет «сломанных» calc().
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { ROOT } = require('./helpers');

test('все public/js/*.js без синтаксических ошибок', () => {
  const dir = path.join(ROOT, 'public', 'js');
  const bad = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    try { new vm.Script(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f }); } catch (e) { bad.push(`${f}: ${e.message}`); }
  }
  assert.deepStrictEqual(bad, []);
});
test('серверные модули без синтаксических ошибок', () => {
  const files = ['server.js', 'database.js', 'dem-processor.js', 'shp-reader.js', 'dxf-writer.js', ...fs.readdirSync(path.join(ROOT, 'routes')).map(f => 'routes/' + f)];
  const bad = [];
  for (const f of files) { if (!fs.existsSync(path.join(ROOT, f))) continue; try { new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^#!.*/, ''), { filename: f }); } catch (e) { bad.push(`${f}: ${e.message}`); } }
  assert.deepStrictEqual(bad, []);
});
test('index.html: все скрипты и стили существуют', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const refs = [...html.matchAll(/<(?:script[^>]+src|link[^>]+href)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:)?\/\//.test(u));
  const missing = refs.filter(u => !fs.existsSync(path.join(ROOT, 'public', u.split('?')[0])));
  assert.deepStrictEqual(missing, []);
});
test('CSS: calc() с пробелами вокруг + и −', () => {
  const bad = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'public', 'css'))) {
    const s = fs.readFileSync(path.join(ROOT, 'public', 'css', f), 'utf8');
    for (const m of s.matchAll(/calc\(([^;{}]*?)\)\s*[;}]/g)) if (/[\w%)]\+[\w(]/.test(m[1])) bad.push(`${f}: ${m[0].slice(0, 60)}`);
  }
  assert.deepStrictEqual(bad, []);
});
