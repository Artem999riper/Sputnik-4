// ═══════════════════════════════════════════════════════════
// version.js — версия программы и предупреждения об устаревании:
//  • файлы сервера обновили, а сервер не перезапущен → плашка + кнопка «Перезапустить»
//  • страница открыта до обновления → плашка «Обновить страницу»
// ═══════════════════════════════════════════════════════════
let _appVer = null, _clientBuildAtLoad = null;
async function _verFetch() {
  try { const r = await fetch(`${API}/version`, { cache: 'no-store' }); if (r.ok) return await r.json(); } catch (e) {}
  return null;
}
function _verLabel(v) { return v ? `v${v.version}${v.commit ? ' · ' + v.commit : ''}` : ''; }
function _verBanner(kind, html) {
  let b = document.getElementById('ver-banner');
  if (!kind) { if (b) b.remove(); return; }
  if (!b) {
    b = document.createElement('div'); b.id = 'ver-banner';
    b.style.cssText = 'position:fixed;top:calc(var(--th,48px) + 6px);left:50%;transform:translateX(-50%);z-index:9500;background:#fef3c7;color:#78350f;border:1.5px solid #f59e0b;border-radius:10px;padding:8px 14px;font-size:12px;display:flex;gap:10px;align-items:center;box-shadow:0 4px 18px rgba(0,0,0,.18);max-width:92vw';
    document.body.appendChild(b);
  }
  if (b.dataset.kind === kind) return;
  b.dataset.kind = kind; b.innerHTML = html;
}
async function verCheck() {
  const v = await _verFetch(); if (!v) return;
  _appVer = v;
  if (_clientBuildAtLoad == null) _clientBuildAtLoad = v.clientBuild;
  const lbl = document.getElementById('app-ver'); if (lbl) { lbl.textContent = _verLabel(v); lbl.title = `Версия ${v.version}, сборка ${v.commit || v.serverBuild}, сервер запущен ${new Date(v.startedAt).toLocaleString('ru-RU')}`; }
  if (v.needRestart) {
    _verBanner('restart', `⚠️ Файлы программы обновлены, но сервер работает на старой версии.
      ${v.canRestart ? `<button class="btn bp bsm" onclick="verRestart()">🔄 Перезапустить сервер</button>` : '<b>Закройте окно сервера и запустите start.bat заново.</b>'}
      <button class="btn bs bsm" onclick="this.parentNode.remove()">✕</button>`);
  } else if (v.clientBuild !== _clientBuildAtLoad) {
    _verBanner('reload', `🆕 Вышла новая версия страницы.
      <button class="btn bp bsm" onclick="location.reload()">Обновить</button>
      <button class="btn bs bsm" onclick="this.parentNode.remove()">✕</button>`);
  } else _verBanner(null);
}
async function verRestart() {
  if (!await confirmDlg('Перезапустить сервер?\n\nУ всех пользователей программа на несколько секунд перестанет отвечать, затем продолжит работу.')) return;
  try {
    const r = await fetch(`${API}/admin/restart`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.error || 'Не удалось перезапустить', 'err'); return; }
  } catch (e) {}
  _verWaitBack();
}
// Ждём, пока сервер поднимется, и перезагружаем страницу
function _verWaitBack() {
  _verBanner('wait', '⏳ Сервер перезапускается… страница обновится сама.');
  const t0 = Date.now();
  const tick = async () => {
    await new Promise(r => setTimeout(r, 1500));
    const v = await _verFetch();
    if (v && (!_appVer || v.startedAt !== _appVer.startedAt)) { location.reload(); return; }
    if (Date.now() - t0 > 120000) { _verBanner('fail', '⚠️ Сервер не поднялся за 2 минуты — проверьте окно сервера. <button class="btn bs bsm" onclick="location.reload()">Обновить</button>'); return; }
    tick();
  };
  tick();
}
setTimeout(verCheck, 1500);
setInterval(verCheck, 60000);
