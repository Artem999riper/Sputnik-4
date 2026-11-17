// Таблица атрибутов → «🛠 Инструменты»: формулы (свой разборщик, без eval), нумерация, пикетаж
const test = require('node:test'), assert = require('node:assert');
const { loadBrowser } = require('./helpers');
const B = loadBrowser(['public/js/kameral.js', 'public/js/layer-attr.js', 'public/js/layer-attr-tools.js'], undefined);
const run = (expr, p, extra) => { B.get('KAT')._calcFields = Object.fromEntries(Object.keys(p).map(k => [k, 1])); const c = B.get('_katCompile')(expr); return B.get('_katEvalOut')(c.fn({ p, n: 1, i: 1, g: () => ({ x: 73, y: 61, area: 2000, length: 0, perimeter: 0, ...(extra || {}) }) })); };

test('формулы: числа, текст, функции, условия', () => {
  assert.strictEqual(run('[глубина] * 2', { 'глубина': 7.5 }), 15);
  assert.strictEqual(run('глубина + 1', { 'глубина': '4,5' }), 5.5);
  assert.strictEqual(run('"Скв-" + [Номер]', { 'Номер': 12 }), 'Скв-12');
  assert.strictEqual(run('[a] + [b]', { a: 'A', b: 1 }), 'A1');
  assert.strictEqual(run('round(area / 10000; 2)', {}), 0.2);
  assert.strictEqual(run('if([d] > 10; "глубокая"; "мелкая")', { d: 12 }), 'глубокая');
  assert.strictEqual(run('если([d] >= 10 и [t] = "ГГС"; 1; 0)', { d: 10, t: 'ГГС' }), 1);
  assert.strictEqual(run('pad(n; 3)', {}), '001');
  assert.strictEqual(run('coalesce([x1]; "нет")', { x1: '' }), 'нет');
  assert.strictEqual(run('[a] / 0', { a: 1 }), '');
  assert.strictEqual(run('0.1 + 0.2', {}), 0.3);
  assert.strictEqual(run('[n] * 2', { n: 21 }), 42, 'поле слоя важнее встроенной переменной');
  assert.throws(() => B.get('_katCompile')('process.exit()'), /символ|функции|неожидан|лишнее/);
  assert.throws(() => B.get('_katCompile')('foo(1)'), /нет функции/);
  assert.throws(() => B.get('_katCompile')('(1 + 2'), /ожидалось/);
});

test('пикетаж точки вдоль линии', () => {
  const ch = B.get('_katChain'), line = [[73, 61], [73, 61.01], [73.02, 61.01]];
  assert.ok(Math.abs(ch(line, 73.0001, 61.005) - 553) < 3);
  assert.ok(ch(line, 73.01, 61.0101) > ch(line, 73, 61.009));
});
