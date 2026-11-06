// ═══════════════════════════════════════════════════════════
// dashboard.js — «📊 Дашборд»: что происходит и что требует внимания.
// Данные — одним запросом /api/dashboard (routes/dashboard.js); недобур/перебур и
// незаполненные характеристики — здесь же по слоям (feat-sem.js).
// Блоки: ход работ по объектам, лента «сегодня / вчера», требует внимания, люди и
// вахты, мини-карта, выполнение по неделям. Порядок и видимость блоков — у каждого
// свои (localStorage dash_layout). Обновляется сам по событиям сервера (SSE).
// ═══════════════════════════════════════════════════════════
const DASH_BLOCKS = {
  progress: { t: '📈 Ход работ по объектам', wide: true },
  attention: { t: '⚠️ Требует внимания' },
  feed: { t: '🕑 Сегодня и вчера' },
  people: { t: '👷 Люди и вахты' },
  map: { t: '🗺 Объекты на карте' },
  chart: { t: '📊 Выполнение по неделям', wide: true },
};
const DASH = { data: null, map: null, mapLayers: null, filter: 'active', chartSite: '', timer: null, loading: false, long: 30 };

function _dashLayout() {
  let o = {}; try { o = JSON.parse(localStorage.getItem('dash_layout') || '{}') || {}; } catch (e) {}
  const all = Object.keys(DASH_BLOCKS);
  const order = (o.order || []).filter(k => DASH_BLOCKS[k]); all.forEach(k => { if (!order.includes(k)) order.push(k); });
  return { order, hidden: (o.hidden || []).filter(k => DASH_BLOCKS[k]) };
}
function _dashSaveLayout(l) { try { localStorage.setItem('dash_layout', JSON.stringify(l)); } catch (e) {} }

const _dN = (x, d = 1) => (Math.round((+x || 0) * 10 ** d) / 10 ** d).toLocaleString('ru-RU');
const _dDate = s => { if (!s) return ''; const d = new Date(s + 'T00:00:00'); return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: d.getFullYear() === new Date().getFullYear() ? undefined : '2-digit' }); };
const _dDays = s => { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((new Date(s + 'T00:00:00') - t) / 86400000); };
// состояние объекта: done / late / stop / ok / none
function _dashState(s) {
  const vp = s.volumes.filter(v => v.plan > 0);
  if (s.status === 'done' || (vp.length && vp.every(v => v.pct >= 100))) return 'done';
  if (s.status === 'paused') return 'pause';
  if (!vp.length) return 'none';
  if (s.late) return 'late';
  if (s.forecast === 'never') return 'stop';
  return 'ok';
}
const DASH_ST = { done: ['готово', '#16a34a'], late: ['отстаёт', '#dc2626'], stop: ['стоит', '#d97706'], ok: ['в срок', '#2563eb'], pause: ['пауза', '#94a3b8'], none: ['нет плана', '#94a3b8'] };

async function loadDashboard(silent) {
  const pb = document.getElementById('dash-page'); if (!pb) return;
  // карточка объекта с карты не должна висеть поверх дашборда
  if (!silent && document.getElementById('mini-panel')?.classList.contains('open') && typeof closeMiniPanel === 'function') { try { closeMiniPanel(); } catch (e) {} }
  if (!silent || !pb.querySelector('.dsh-head')) _dashSkeleton();
  if (DASH.loading) return; DASH.loading = true;
  try {
    const r = await fetch(`${API}/dashboard`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
    DASH.data = await r.json();
  } catch (e) {
    DASH.loading = false;
    const b = document.getElementById('dsh-grid'); if (b && !DASH.data) b.innerHTML = `<div class="dsh-empty">Не удалось загрузить: ${esc(e.message || '')}</div>`;
    return;
  }
  DASH.loading = false;
  if (typeof volLoad === 'function' && !(typeof VL !== 'undefined' && VL.all && VL.all.length)) { try { await volLoad(); } catch (e) {} }
  _dashFill();
}
// каркас страницы: шапка и пустые блоки в выбранном порядке
function _dashSkeleton() {
  const pb = document.getElementById('dash-page'), lay = _dashLayout();
  if (DASH.map) { try { DASH.map.remove(); } catch (e) {} DASH.map = null; }
  pb.innerHTML = `<div class="dsh-head">
      <h2>📊 Дашборд</h2><span id="dsh-upd" class="dsh-upd"></span>
      <span style="flex:1"></span>
      <button class="btn bs bsm" onclick="dashCustomize(event)" title="Какие блоки показывать и в каком порядке">⚙️ Блоки</button>
      <button class="btn bs bsm" onclick="loadDashboard(true)" title="Обновить сейчас (обновляется и сам)">🔄</button>
    </div>
    <div id="dsh-grid" class="dsh-grid">${lay.order.filter(k => !lay.hidden.includes(k)).map(k => `
      <section class="dsh-card${DASH_BLOCKS[k].wide ? ' wide' : ''}" data-b="${k}">
        <div class="dsh-ct"><span>${DASH_BLOCKS[k].t}</span><span class="dsh-ctr" id="dsh-ctr-${k}"></span>
          <button class="dsh-x" onclick="dashHide('${k}')" title="Скрыть блок (вернуть — «⚙️ Блоки»)">✕</button></div>
        <div class="dsh-cb" id="dsh-${k}"><div class="dsh-empty">Загрузка…</div></div>
      </section>`).join('')}
      ${lay.order.every(k => lay.hidden.includes(k)) ? '<div class="dsh-empty">Все блоки скрыты — «⚙️ Блоки», чтобы вернуть.</div>' : ''}
    </div>`;
}
function _dashFill() {
  const D = DASH.data; if (!D) return;
  const u = document.getElementById('dsh-upd'); if (u) u.textContent = 'обновлено ' + new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  const run = (k, f) => { const el = document.getElementById('dsh-' + k); if (!el) return; try { f(el, D); } catch (e) { el.innerHTML = `<div class="dsh-empty">Ошибка блока: ${esc(e.message)}</div>`; console.error(e); } };
  run('progress', _dashProgress); run('feed', _dashFeed); run('attention', _dashAttention);
  run('people', _dashPeople); run('map', _dashMap); run('chart', _dashChart);
}
// ── переходы ──
function dashGoSite(id) { switchView('map'); if (typeof selectSite === 'function') selectSite(id); }
function dashGoLayer(lid, kind) { switchView('map'); setTimeout(() => { if (kind === 'dev' && typeof featSemDevList === 'function') featSemDevList(lid); else if (typeof featSemSelect === 'function') featSemSelect(lid, 'miss'); }, 200); }

// ── 1. Ход работ ─────────────────────────────────────────────
function _dashProgress(el, D) {
  const f = DASH.filter;
  const list = D.sites.filter(s => f === 'all' ? true : f === 'late' ? ['late', 'stop'].includes(_dashState(s)) : s.status === 'active');
  const rank = { late: 0, stop: 1, ok: 2, none: 3, pause: 4, done: 5 };
  list.sort((a, b) => rank[_dashState(a)] - rank[_dashState(b)] || a.name.localeCompare(b.name, 'ru'));
  const n = st => D.sites.filter(s => s.status === 'active' && _dashState(s) === st).length;
  document.getElementById('dsh-ctr-progress').innerHTML = ['active', 'late', 'all'].map(k => `<button class="dsh-chip${f === k ? ' on' : ''}" onclick="DASH.filter='${k}';_dashFill()">${{ active: 'Активные', late: `Отстают${n('late') + n('stop') ? ' · ' + (n('late') + n('stop')) : ''}`, all: 'Все' }[k]}</button>`).join('');
  if (!list.length) { el.innerHTML = `<div class="dsh-empty">${f === 'late' ? '👍 Отстающих объектов нет' : 'Объектов нет'}</div>`; return; }
  el.innerHTML = `<div class="dsh-sites">${list.map(s => {
    const st = _dashState(s), [stL, stC] = DASH_ST[st];
    const fc = s.forecast === 'never' ? 'работы стоят' : s.forecast ? `прогноз ${_dDate(s.forecast)}` : '';
    const dl = s.deadline ? (() => { const d = _dDays(s.deadline); return `срок ${_dDate(s.deadline)}${d >= 0 ? ` (${d} дн.)` : ` (просрочен ${-d} дн.)`}`; })() : 'срок не задан';
    return `<div class="dsh-site" style="--c:${stC}">
      <div class="dsh-sh" onclick="dashGoSite('${escAttr(s.id)}')" title="Открыть объект на карте">
        <b>${esc(s.name)}</b><span class="dsh-st" style="background:${stC}">${stL}</span>
        <span class="dsh-sub">${esc(s.client || '')}</span><span style="flex:1"></span>
        <span class="dsh-sub">${dl}${fc ? ' · ' + fc : ''}${s.last7 > 0 ? ` · за неделю +${_dN(s.last7)}%` : ''}</span>
        <b class="dsh-pct">${Math.round(s.pct)}%</b></div>
      <div class="dsh-bar"><i style="width:${Math.min(100, s.pct)}%;background:${stC}"></i></div>
      ${s.volumes.length ? `<div class="dsh-vols">${s.volumes.map(v => {
        const late = v.plan > 0 && v.pct < 100 && s.deadline && (v.forecast === 'never' || (v.forecast && v.forecast > s.deadline));
        return `<div class="dsh-vol"><span class="dsh-vn" title="${esc(v.name)}">${esc(v.name)}</span>
          <span class="dsh-vb"><i style="width:${Math.min(100, v.pct)}%;background:${v.pct >= 100 ? '#16a34a' : late ? '#dc2626' : '#3b82f6'}"></i></span>
          <span class="dsh-vv">${_dN(v.done)} / ${_dN(v.plan)} ${esc(v.unit)}${v.unit2 && (v.plan2 || v.done2) ? ` · ${_dN(v.done2)}${v.plan2 ? ' / ' + _dN(v.plan2) : ''} ${esc(v.unit2)}` : ''}</span>
          <span class="dsh-v7" title="За последние 7 дней">${v.last7 ? '+' + _dN(v.last7) : ''}</span>
          <span class="dsh-vf${late ? ' red' : ''}">${v.pct >= 100 ? '✓' : v.forecast === 'never' ? 'стоит' : v.forecast ? '→ ' + _dDate(v.forecast) : ''}</span></div>`;
      }).join('')}</div>` : '<div class="dsh-sub" style="padding:2px 0 4px">объёмы не заданы</div>'}
    </div>`;
  }).join('')}</div>`;
}

// ── 2. Лента ─────────────────────────────────────────────────
function _dashFeed(el, D) {
  const sName = Object.fromEntries(D.sites.map(s => [s.id, s.name]));
  const days = [...new Set(D.feed.map(r => r.date))].sort().reverse();
  document.getElementById('dsh-ctr-feed').textContent = '';
  if (!days.length) { el.innerHTML = '<div class="dsh-empty">За сегодня и вчера отметок выполнения нет</div>'; return; }
  el.innerHTML = days.map(dt => {
    const rows = D.feed.filter(r => r.date === dt), bySite = {};
    rows.forEach(r => (bySite[r.site_id] = bySite[r.site_id] || []).push(r));
    return `<div class="dsh-fd">${dt === D.today ? 'Сегодня' : 'Вчера'}, ${_dDate(dt)}</div>` + Object.keys(bySite).map(sid => {
      const who = [...new Set(bySite[sid].flatMap(r => r.who))];
      return `<div class="dsh-fr" onclick="dashGoSite('${escAttr(sid)}')"><b>${esc(sName[sid] || 'объект')}</b>
        <div>${bySite[sid].map(r => `${esc(r.volume)}: <b class="dsh-plus">+${_dN(r.done, 2)} ${esc(r.unit)}</b>${r.done2 ? `, ${_dN(r.done2)} ${esc(r.unit2)}` : ''}`).join(' · ')}</div>
        ${who.length ? `<div class="dsh-sub">👷 ${esc(who.join(', '))}</div>` : ''}</div>`;
    }).join('');
  }).join('');
}

// ── 3. Требует внимания ──────────────────────────────────────
const DASH_KIND = { task: '⏰', gtask: '📋', remarks: '📝', doc: '🪪', calib: '📏', mat: '📦', mach: '🔧', cargo: '🚚', late: '🐢', idle: '⏸', miss: '🏷', dev: '⚠️' };
function _dashAttnItems(D) {
  const items = D.attention.slice();
  // недобур / перебур и выполненные без характеристик — по слоям объёмов (в браузере)
  try {
    if (typeof featSemCheck === 'function' && typeof VL !== 'undefined') {
      const sName = Object.fromEntries(D.sites.map(s => [s.id, s.name]));
      (VL.all || []).filter(v => v.layer_id).forEach(v => {
        const l = (layers || []).find(x => x.id === v.layer_id); if (!l) return;
        const c = featSemCheck(l, v), sub = `${sName[v.site_id] || ''} · ${v.name}`;
        if (c.under.length || c.over.length) items.push({ kind: 'dev', sev: 2, title: [c.under.length ? `недобур ${c.under.length}` : '', c.over.length ? `перебур ${c.over.length}` : ''].filter(Boolean).join(', '), sub, layer_id: l.id });
        if (c.miss.length) items.push({ kind: 'miss', sev: 1, title: `Без характеристик: ${c.miss.length}`, sub, layer_id: l.id });
      });
    }
  } catch (e) {}
  return items.sort((a, b) => b.sev - a.sev || String(a.date || '9').localeCompare(String(b.date || '9')));
}
function dashAttnGo(i) {
  const a = (DASH._attn || [])[i]; if (!a) return;
  if (a.kind === 'dev' || a.kind === 'miss') return dashGoLayer(a.layer_id, a.kind);
  if (a.site_id && ['task', 'remarks', 'late', 'idle'].includes(a.kind)) return dashGoSite(a.site_id);
  if (a.kind === 'gtask') return switchView('gtasks');
  if (a.kind === 'doc') { switchView('workers'); if (a.worker_id && typeof openWorkerDetail === 'function') setTimeout(() => openWorkerDetail(a.worker_id), 400); return; }
  if (a.kind === 'calib') { switchView('equipment'); if (typeof openEquipDetail === 'function') setTimeout(() => openEquipDetail(a.equip_id), 400); return; }
  if (a.kind === 'mat') return switchView('materials');
  if (a.kind === 'mach') return switchView('machinery');
  if (a.kind === 'cargo') return switchView('gruz');
}
function _dashAttention(el, D) {
  const items = DASH._attn = _dashAttnItems(D);
  const red = items.filter(a => a.sev >= 2).length;
  document.getElementById('dsh-ctr-attention').innerHTML = items.length ? `<span class="dsh-cnt${red ? ' red' : ''}">${items.length}</span>` : '';
  if (!items.length) { el.innerHTML = '<div class="dsh-empty">👍 Всё в порядке</div>'; return; }
  el.innerHTML = `<div class="dsh-attn">${items.map((a, i) => `<div class="dsh-ai ${a.sev >= 2 ? 'red' : 'ylw'}" onclick="dashAttnGo(${i})" title="Перейти">
      <span class="dsh-ai-i">${DASH_KIND[a.kind] || '•'}</span>
      <span class="dsh-ai-t"><b>${esc(a.title)}</b>${a.sub ? `<span class="dsh-sub">${esc(a.sub)}</span>` : ''}</span>
      ${a.date ? `<span class="dsh-ai-d">${_dDate(a.date)}</span>` : ''}<span class="dsh-ai-go">›</span></div>`).join('')}</div>`;
}

// ── 4. Люди ─────────────────────────────────────────────────
function _dashPeople(el, D) {
  const P = D.people, long = P.onShift.filter(w => w.days > DASH.long);
  document.getElementById('dsh-ctr-people').innerHTML = `<span class="dsh-sub">на вахте ${P.onShift.length} из ${P.total}</span>`;
  const max = Math.max(1, ...P.bases.map(b => Math.max(b.n, b.norm)));
  el.innerHTML = `
    ${P.bases.length ? `<div class="dsh-bases">${P.bases.map(b => `<div class="dsh-base" title="${b.norm ? `норма ${b.norm} чел.` : 'норма не задана (Сотрудники → календарь вахт)'}">
        <span class="dsh-vn">${esc(b.name)}</span>
        <span class="dsh-vb"><i style="width:${b.n / max * 100}%;background:${b.norm && b.n < b.norm ? '#dc2626' : '#16a34a'}"></i>${b.norm ? `<u style="left:${b.norm / max * 100}%"></u>` : ''}</span>
        <b>${b.n}${b.norm ? ` / ${b.norm}` : ''}</b>${b.norm && b.n < b.norm ? `<span class="dsh-sub red">не хватает ${b.norm - b.n}</span>` : ''}</div>`).join('')}</div>` : '<div class="dsh-empty">Сейчас никого на вахте</div>'}
    <div class="dsh-two">
      <div><div class="dsh-fd">Заезд — 7 дней</div>${P.arrive.length ? P.arrive.map(x => `<div class="dsh-pr">🟢 <b>${esc(x.name)}</b> <span class="dsh-sub">${_dDate(x.date)}${x.base ? ' · ' + esc(x.base) : ''}</span></div>`).join('') : '<div class="dsh-sub">нет</div>'}</div>
      <div><div class="dsh-fd">Выезд — 7 дней</div>${P.leave.length ? P.leave.map(x => `<div class="dsh-pr">🔻 <b>${esc(x.name)}</b> <span class="dsh-sub">${_dDate(x.date)}${x.base ? ' · ' + esc(x.base) : ''}</span></div>`).join('') : '<div class="dsh-sub">нет</div>'}</div>
    </div>
    <div class="dsh-fd">Дольше ${DASH.long} дней на вахте${long.length ? ` — ${long.length}` : ''}</div>
    ${long.length ? long.map(w => `<div class="dsh-pr" onclick="switchView('workers');setTimeout(()=>openWorkerDetail('${escAttr(w.id)}'),400)" style="cursor:pointer">⏳ <b>${esc(w.name)}</b> <span class="dsh-sub">${w.days} дн. · ${esc(w.base)}${w.role ? ' · ' + esc(w.role) : ''}</span></div>`).join('') : '<div class="dsh-sub">нет</div>'}`;
}

// ── 5. Мини-карта ───────────────────────────────────────────
function _dashMap(el, D) {
  document.getElementById('dsh-ctr-map').innerHTML = Object.entries(DASH_ST).filter(([k]) => ['ok', 'late', 'stop', 'done'].includes(k)).map(([, [l, c]]) => `<span class="dsh-lg"><i style="background:${c}"></i>${l}</span>`).join('');
  if (!DASH.map || !document.getElementById('dsh-mapdiv')) {
    el.innerHTML = '<div id="dsh-mapdiv" class="dsh-map"></div>';
    DASH.map = L.map('dsh-mapdiv', { zoomControl: true, attributionControl: false, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(DASH.map);
    DASH.mapLayers = L.layerGroup().addTo(DASH.map); DASH._fitted = false;
  }
  const g = DASH.mapLayers; g.clearLayers();
  const pts = [];
  D.sites.filter(s => s.bbox).forEach(s => {
    const [x1, y1, x2, y2] = s.bbox, c = DASH_ST[_dashState(s)][1], ctr = [(y1 + y2) / 2, (x1 + x2) / 2];
    const tip = `<b>${esc(s.name)}</b><br>${Math.round(s.pct)}% · ${DASH_ST[_dashState(s)][0]}`;
    const small = Math.abs(x2 - x1) < 0.01 && Math.abs(y2 - y1) < 0.005;
    const lay = small ? L.circleMarker(ctr, { radius: 9, color: '#fff', weight: 2, fillColor: c, fillOpacity: .95 })
      : L.rectangle([[y1, x1], [y2, x2]], { color: c, weight: 2, fillColor: c, fillOpacity: .25 });
    lay.bindTooltip(tip, { direction: 'top' }).on('click', () => dashGoSite(s.id)).addTo(g);
    if (!small) L.circleMarker(ctr, { radius: 5, color: '#fff', weight: 1.5, fillColor: c, fillOpacity: 1 }).bindTooltip(tip).on('click', () => dashGoSite(s.id)).addTo(g);
    pts.push([y1, x1], [y2, x2]);
  });
  (D.basesGeo || []).forEach(b => {
    L.marker([b.lat, b.lng], { icon: L.divIcon({ className: 'dsh-bmk', html: `🏠${b.n ? `<b>${b.n}</b>` : ''}`, iconSize: null }) })
      .bindTooltip(`${esc(b.name)}${b.n ? ` — на вахте ${b.n}` : ''}`).addTo(g);
    pts.push([b.lat, b.lng]);
  });
  setTimeout(() => {
    try { DASH.map.invalidateSize(); if (!DASH._fitted) { if (pts.length) DASH.map.fitBounds(pts, { padding: [24, 24], maxZoom: 11 }); else DASH.map.setView([64, 75], 4); DASH._fitted = true; } } catch (e) {}
  }, 50);
}

// ── 6. По неделям ───────────────────────────────────────────
const DASH_PAL = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#dc2626', '#65a30d', '#db2777', '#475569', '#ca8a04'];
function _dashChart(el, D) {
  const act = D.sites.filter(s => s.weekly.some(x => x > 0));
  const sel = DASH.chartSite && D.sites.find(s => s.id === DASH.chartSite) ? DASH.chartSite : '';
  document.getElementById('dsh-ctr-chart').innerHTML = `<select class="dsh-sel" onchange="DASH.chartSite=this.value;_dashFill()"><option value="">Все объекты</option>${act.map(s => `<option value="${escAttr(s.id)}"${s.id === sel ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`;
  const series = sel ? D.sites.filter(s => s.id === sel) : act;
  if (!series.length) { el.innerHTML = '<div class="dsh-empty">За последние 13 недель выполнения нет</div>'; return; }
  const W = D.weeks.length, tot = D.weeks.map((_, i) => series.reduce((a, s) => a + s.weekly[i], 0));
  const max = Math.max(1, ...tot), H = 160, bw = 100 / W;
  const nice = (() => { const st = [1, 2, 5, 10, 20, 25, 50, 100]; return st.find(x => max / x <= 4) || 100; })();
  const top = Math.ceil(max / nice) * nice;
  const ticks = []; for (let v = 0; v <= top + 1e-9; v += nice) ticks.push(v);
  const cum = sel ? (() => { let c = series[0].pct - series[0].weekly.reduce((a, b) => a + b, 0); return series[0].weekly.map(x => (c += x)); })() : null;
  el.innerHTML = `<div class="dsh-chart">
    <div class="dsh-yax">${ticks.slice().reverse().map(v => `<span>${v}%</span>`).join('')}</div>
    <div class="dsh-plot">
      ${ticks.map(v => `<div class="dsh-grid-l" style="bottom:${v / top * 100}%"></div>`).join('')}
      <div class="dsh-bars">${D.weeks.map((w, i) => {
        let acc = 0;
        const segs = series.map((s, k) => { const h = s.weekly[i] / top * 100; const seg = h > 0 ? `<i style="bottom:${acc}%;height:${h}%;background:${DASH_PAL[(sel ? 0 : k) % DASH_PAL.length]}"></i>` : ''; acc += h; return seg; }).join('');
        const tip = `Неделя с ${_dDate(w)}: ${series.filter(s => s.weekly[i] > 0).map(s => `${s.name} +${_dN(s.weekly[i])}%`).join(', ') || 'нет выполнения'}${cum ? ` · всего ${Math.round(cum[i])}%` : ''}`;
        return `<div class="dsh-col" style="width:${bw}%" title="${escAttr(tip)}">${segs}</div>`;
      }).join('')}</div>
      ${cum ? `<svg class="dsh-cum" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline vector-effect="non-scaling-stroke" points="${cum.map((c, i) => `${(i + .5) * bw},${100 - Math.min(100, c)}`).join(' ')}"/></svg>` : ''}
    </div>
    <div class="dsh-xax">${D.weeks.map((w, i) => `<span style="width:${bw}%">${i % 2 === (W - 1) % 2 ? _dDate(w).slice(0, 5) : ''}</span>`).join('')}</div>
  </div>
  <div class="dsh-sub" style="margin-top:6px">Высота столбца — сколько процентов плана объекта выполнено за неделю (среднее по его объёмам).${cum ? ' Линия — готовность объекта нарастающим итогом (шкала 0–100%).' : ''}</div>
  ${sel ? '' : `<div class="dsh-legend">${series.map((s, k) => `<span class="dsh-lg" onclick="DASH.chartSite='${escAttr(s.id)}';_dashFill()" style="cursor:pointer"><i style="background:${DASH_PAL[k % DASH_PAL.length]}"></i>${esc(s.name)}</span>`).join('')}</div>`}`;
}

// ── настройка блоков ────────────────────────────────────────
function dashHide(k) { const l = _dashLayout(); if (!l.hidden.includes(k)) l.hidden.push(k); _dashSaveLayout(l); _dashSkeleton(); _dashFill(); }
function dashCustomize() {
  const l = _dashLayout();
  const row = (k, i) => `<div class="dsh-cz" data-k="${k}"><label><input type="checkbox" ${l.hidden.includes(k) ? '' : 'checked'} onchange="_dashCzSet()"> ${DASH_BLOCKS[k].t}</label>
    <span style="flex:1"></span><button class="btn bs bxs" onclick="_dashCzMove(${i},-1)" ${i ? '' : 'disabled'}>↑</button><button class="btn bs bxs" onclick="_dashCzMove(${i},1)" ${i < l.order.length - 1 ? '' : 'disabled'}>↓</button></div>`;
  showModal('⚙️ Блоки дашборда', `<div class="dsh-sub" style="margin-bottom:8px">Галочка — показывать, стрелки — порядок. Запоминается для этого браузера.</div>
    <div id="dsh-cz">${l.order.map(row).join('')}</div>
    <div style="margin-top:10px;display:flex;gap:8px;align-items:center"><span class="dsh-sub">«Долго на вахте» — больше</span>
      <input type="number" min="5" max="120" value="${DASH.long}" style="width:70px" onchange="DASH.long=Math.max(5,+this.value||30);try{localStorage.setItem('dash_long',DASH.long)}catch(e){};_dashFill()"> <span class="dsh-sub">дней</span>
      <span style="flex:1"></span><button class="btn bs bsm" onclick="_dashSaveLayout({});dashCustomize();_dashSkeleton();_dashFill()">Как было</button></div>`,
    [{ label: 'Готово', cls: 'bp', fn: closeModal }]);
}
function _dashCzSet() {
  const l = _dashLayout(); l.hidden = [...document.querySelectorAll('#dsh-cz .dsh-cz')].filter(r => !r.querySelector('input').checked).map(r => r.dataset.k);
  _dashSaveLayout(l); _dashSkeleton(); _dashFill();
}
function _dashCzMove(i, d) {
  const l = _dashLayout(), j = i + d; if (j < 0 || j >= l.order.length) return;
  [l.order[i], l.order[j]] = [l.order[j], l.order[i]]; _dashSaveLayout(l); dashCustomize(); _dashSkeleton(); _dashFill();
}
try { DASH.long = Math.max(5, +localStorage.getItem('dash_long') || 30); } catch (e) {}

// ── живое обновление: любое изменение данных на сервере (SSE) ──
function dashOnChange() {
  const pb = document.getElementById('dash-page'); if (!pb || !pb.classList.contains('show')) return;
  clearTimeout(DASH.timer); DASH.timer = setTimeout(() => loadDashboard(true), 2500);
}
