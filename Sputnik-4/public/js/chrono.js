// ═══════════════════════════════════════════════════════════
// chrono.js — хронология выполнения на карте («🧰 Инструменты ▾ → Хронология»):
// ползунок дат внизу карты. Объекты, выполненные ПОЗЖЕ выбранного дня,
// показываются как невыполненные, выполненные В ЭТОТ день — оранжевым,
// раньше — обычным зелёным «выполнено». «▶» проигрывает прогресс по дням.
// Работает поверх обычной отрисовки: подменяет цвет объекта (_kmlFeatColor)
// и добавляет дату к подписи кэша слоя, чтобы слои с отметками перестраивались.
// ═══════════════════════════════════════════════════════════
const KCHR = { on: false, date: null, days: [], timer: null, speed: 400 };
const KCHR_DAY_COLOR = '#f97316';
const _kchrISO = d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
const _kchrDateOf = p => String((p && p._done_date) || '').slice(0, 10);

(function () {
  const go = () => {
    if (typeof _kmlFeatColor !== 'function' || typeof _kmlLayerSig !== 'function') return setTimeout(go, 300);
    const oc = _kmlFeatColor;
    window._kmlFeatColor = _kmlFeatColor = function (l, p) {
      if (KCHR.on && p && p._done && !p._skip) {
        const d = _kchrDateOf(p);
        if (d && d > KCHR.date) {                     // ещё не выполнен к выбранному дню
          const q = Object.assign({}, p); delete q._done;
          if (q._color === KML_DONE_COLOR) delete q._color;
          return oc.call(this, l, q);
        }
        if (d && d === KCHR.date) return KCHR_DAY_COLOR;
      }
      return oc.apply(this, arguments);
    };
    const os = _kmlLayerSig;
    window._kmlLayerSig = _kmlLayerSig = function (l) {
      const s = os.apply(this, arguments);
      return KCHR.on && l && l.geojson && l.geojson.indexOf('"_done"') >= 0 ? s + '|chr' + KCHR.date : s;
    };
  };
  go();
})();

// все объекты с отметкой «выполнено» в обычных слоях
function _kchrFeats() {
  const out = [];
  (layers || []).filter(l => !l.site_id && l.geojson && l.geojson.indexOf('"_done"') >= 0).forEach(l => {
    let gj; try { gj = JSON.parse(l.geojson); } catch (e) { return; }
    (gj.features || []).forEach(f => { if (f && f.properties) out.push({ l, f }); });
  });
  return out;
}
function chronoOpen() {
  if (KCHR.on) { chronoClose(); return; }
  const dates = _kchrFeats().map(x => x.f.properties._done && _kchrDateOf(x.f.properties)).filter(Boolean).sort();
  if (!dates.length) { toast('Нет объектов с датой выполнения — хронологию строить не по чему', 'warn'); return; }
  const today = _kchrISO(new Date()), last = dates[dates.length - 1] > today ? dates[dates.length - 1] : today;
  // ряд дней от первой отметки (минус день — «ничего не сделано») до сегодня
  const d0 = new Date(dates[0] + 'T12:00:00'); d0.setDate(d0.getDate() - 1);
  KCHR.days = []; for (const d = new Date(d0); _kchrISO(d) <= last; d.setDate(d.getDate() + 1)) KCHR.days.push(_kchrISO(d));
  KCHR.on = true; KCHR.date = last;
  const b = document.getElementById('tool-chrono'); if (b) b.classList.add('on');
  _kchrBar(); _kchrApply();
}
function chronoClose() {
  chronoStop(); KCHR.on = false;
  const el = document.getElementById('kchr-bar'); if (el) el.remove();
  const b = document.getElementById('tool-chrono'); if (b) b.classList.remove('on');
  _kchrRedraw();
}
function _kchrRedraw() { try { renderLayerGroups(); } catch (e) {} try { if (typeof volKmlRenderPane === 'function' && kmlPanelOpen && _kmlTab === 'vol') renderKmlPanel(); } catch (e) {} }
function chronoSet(i) {
  i = Math.max(0, Math.min(KCHR.days.length - 1, +i));
  KCHR.date = KCHR.days[i]; _kchrApply();
}
function chronoStep(k) { chronoSet(KCHR.days.indexOf(KCHR.date) + k); }
function chronoPlay() {
  if (KCHR.timer) { chronoStop(); return; }
  if (KCHR.days.indexOf(KCHR.date) >= KCHR.days.length - 1) KCHR.date = KCHR.days[0];
  KCHR.timer = setInterval(() => {
    const i = KCHR.days.indexOf(KCHR.date);
    if (i >= KCHR.days.length - 1) { chronoStop(); return; }
    chronoSet(i + 1);
  }, KCHR.speed);
  _kchrBar(); _kchrApply();
}
function chronoStop() { if (KCHR.timer) { clearInterval(KCHR.timer); KCHR.timer = null; if (KCHR.on) _kchrBar(); } }
function _kchrBar() {
  let b = document.getElementById('kchr-bar');
  if (!b) { b = document.createElement('div'); b.id = 'kchr-bar'; document.body.appendChild(b); }
  const n = KCHR.days.length;
  b.innerHTML = `<span class="kchr-t">🕓 Хронология</span>
    <button onclick="chronoStep(-1)" title="День назад (←)">‹</button>
    <button onclick="chronoPlay()" title="Проиграть по дням">${KCHR.timer ? '⏸' : '▶'}</button>
    <button onclick="chronoStep(1)" title="День вперёд (→)">›</button>
    <input type="range" min="0" max="${n - 1}" value="${KCHR.days.indexOf(KCHR.date)}" oninput="chronoSet(this.value)">
    <input type="date" class="kchr-d" min="${KCHR.days[0]}" max="${KCHR.days[n - 1]}" value="${KCHR.date}" onchange="if(this.value){const i=KCHR.days.indexOf(this.value);if(i>=0)chronoSet(i);}">
    <select title="Скорость проигрывания" onchange="KCHR.speed=+this.value;if(KCHR.timer){chronoStop();chronoPlay();}">${[[900, 'медленно'], [400, 'обычно'], [150, 'быстро']].map(([v, l]) => `<option value="${v}" ${KCHR.speed === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <span class="kchr-st" id="kchr-st"></span>
    <button onclick="chronoClose()" title="Закрыть (Esc)">✕</button>
    <small><i style="background:${KML_DONE_COLOR}"></i>выполнено раньше <i style="background:${KCHR_DAY_COLOR}"></i>в этот день · позже — как невыполненные</small>`;
}
// перерисовать карту и итоги к выбранному дню
function _kchrApply() {
  const b = document.getElementById('kchr-bar');
  if (b) {
    const r = b.querySelector('input[type=range]'); if (r) r.value = KCHR.days.indexOf(KCHR.date);
    const d = b.querySelector('.kchr-d'); if (d) d.value = KCHR.date;
  }
  _kchrRedraw();
  const st = document.getElementById('kchr-st'); if (!st) return;
  // итоги по слоям-объёмам (без исключённых): к дате и за день
  let tot = 0, done = 0, day = 0; const per = [];
  (layers || []).filter(l => !l.site_id && typeof volByLayer === 'function' && volByLayer(l.id)).forEach(l => {
    let gj; try { gj = JSON.parse(l.geojson); } catch (e) { return; }
    const fs = (gj.features || []).filter(f => f && f.properties && !f.properties._skip);
    const dn = fs.filter(f => f.properties._done && (!_kchrDateOf(f.properties) || _kchrDateOf(f.properties) <= KCHR.date)).length;
    const dd = fs.filter(f => f.properties._done && _kchrDateOf(f.properties) === KCHR.date).length;
    tot += fs.length; done += dn; day += dd;
    const v = volByLayer(l.id); per.push(`${(v && v.name) || l.name}: ${dn} из ${fs.length}${fs.length ? ` (${Math.round(dn / fs.length * 100)}%)` : ''}${dd ? `, за день ${dd}` : ''}`);
  });
  const ds = new Date(KCHR.date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  st.innerHTML = `<b>${ds}</b>${tot ? ` · выполнено <b>${done}</b> из ${tot} (${Math.round(done / tot * 100)}%)${day ? ` · за день <b>+${day}</b>` : ''}` : ''}`;
  st.title = per.length ? 'По объёмам:\n' + per.join('\n') : '';
}
document.addEventListener('keydown', e => {
  if (!KCHR.on || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '') && e.target.type !== 'range') return;
  if (document.getElementById('mov')?.classList.contains('open')) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); chronoStep(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); chronoStep(1); }
  else if (e.key === 'Escape') { if (typeof MN !== 'undefined' && MN.mode) return; if (typeof kselCount === 'function' && kselCount()) return; chronoClose(); }
});
// «Снимок карты» во время хронологии — дата в заголовке штампа
(function () {
  const go = () => {
    if (typeof mapSnapshotOpen !== 'function') return setTimeout(go, 500);
    const o = mapSnapshotOpen;
    window.mapSnapshotOpen = mapSnapshotOpen = function () {
      const r = o.apply(this, arguments);
      if (KCHR.on) setTimeout(() => { const t = document.getElementById('snap-title'); if (t) t.value = `${t.value.replace(/ — состояние на .*$/, '')}${t.value ? ' — ' : ''}состояние на ${new Date(KCHR.date + 'T12:00:00').toLocaleDateString('ru-RU')}`; }, 0);
      return r;
    };
  };
  setTimeout(go, 800);
})();
