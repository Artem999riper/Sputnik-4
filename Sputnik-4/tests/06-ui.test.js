// Интерфейс (необязательно): открывает программу в браузере, проходит по всем
// вкладкам и проверяет, что нет ошибок JavaScript. Нужен Playwright — если его
// нет на компьютере, тест пропускается.
const test = require('node:test'), assert = require('node:assert');
const { startServer } = require('./helpers');
let pw = null; try { pw = require('playwright'); } catch (e) {}

test('все вкладки открываются без ошибок JavaScript', { skip: !pw && 'Playwright не установлен' }, async () => {
  const S = await startServer();
  let browser;
  try {
    browser = await pw.chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(S.base); await p.waitForTimeout(2500);
    await p.evaluate(() => { const g = document.getElementById('name-gate'); if (g) g.style.display = 'none'; });
    const views = await p.$$eval('.nt[data-v]', a => a.map(x => x.dataset.v));
    for (const v of views) { await p.evaluate(v => switchView(v), v); await p.waitForTimeout(600); }
    await p.evaluate(() => { switchView('map'); helpOpen('dem'); }); await p.waitForTimeout(300);
    await p.evaluate(() => { helpClose(); openAuditLog(); }); await p.waitForTimeout(500);
    assert.deepStrictEqual(errs, []);
  } finally { if (browser) await browser.close(); await S.stop(); }
});
