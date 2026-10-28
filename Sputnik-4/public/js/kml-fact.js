// ═══════════════════════════════════════════════════════════
// kml-fact.js — план и факт по объекту:
//   • 45: «Выполнить объект» в слое KML → запись факта в объём объекта
//     (1 за объект или число из поля). Связь слоя с объёмом запоминается
//     (style_json.fact), снятие «выполнено» удаляет созданный факт;
//   • 46: «🎯 План/факт на карте» — плановые точки/контуры объёмов зелёным
//     (выполнено) или красным (нет), подпись с % и отставанием от графика.
// ═══════════════════════════════════════════════════════════
const _kfToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Объект, к которому относится слой: привязка слоя/группы, иначе открытый объект
function _kfSiteOfLayer(l) {
  if (l.site_id) return l.site_id;
  const g = l.group_id && typeof kmGroups === 'object' ? kmGroups[l.group_id] : null;
  const ids = g ? (g.site_ids || (g.site_id ? [g.site_id] : [])) : [];
  if (ids.length === 1) return ids[0];
  return currentType === 'site' && currentObj ? currentObj.id : (ids[0] || null);
}
function _kfAmount(cfg, f) {
  if (cfg.amount != null && cfg.amount !== '') return +cfg.amount;     // своё число за каждый объект
  if (!cfg.field) return 1;
  const v = typeof _kaNum === 'function' ? _kaNum((f.properties || {})[cfg.field]) : parseFloat((f.properties || {})[cfg.field]);
  return Number.isFinite(v) ? v : 0;
}
// Вызывается после отметки «выполнено» (done=true) или её снятия (done=false)
// force — показать окно параметров, даже если сегодня уже подтверждали (ПКМ → «Выполнить с параметрами…»)
async function kmlFactAfterDone(layerId, idxs, done, force) {
  const l = (layers || []).find(x => x.id === layerId); if (!l) return;
  let gj; try { gj = JSON.parse(l.geojson); } catch (e) { return; }
  const feats = gj.type === 'FeatureCollection' ? gj.features : [gj];
  const sel = idxs.map(i => feats[i]).filter(Boolean);
  if (!done) {
    const withFact = sel.filter(f => f.properties && f.properties._fact);
    if (!withFact.length) return;
    for (const f of withFact) { await fetch(`${API}/vol_progress/${encodeURIComponent(f.properties._fact)}`, { method: 'DELETE' }).catch(() => {}); delete f.properties._fact; }
    await _kmlSaveGeojson(l, gj);
    toast(`Факт снят: ${withFact.length} поз.`, 'ok');
    _kfAfterChange();
    return;
  }
  const todo = sel.filter(f => !(f.properties && f.properties._fact));
  if (!todo.length) return;
  const st = (typeof kmlStyleOf === 'function' && kmlStyleOf(l)) || {};
  if (st.fact && st.fact.off && !force) return;
  // Связь помнится всегда, но параметры (и дату работ) подтверждаем раз в день:
  // сегодня уже подтверждали — засчитываем сразу с выбранной тогда датой
  if (!force && st.fact && st.fact.volumeId && st.fact.day === _kfToday()) return _kfCreate(l, gj, todo, st.fact, st.fact.workDate || _kfToday());
  _kfAsk(l, gj, todo, st.fact && st.fact.volumeId ? st.fact : null);
}
async function _kfAsk(l, gj, todo, prev) {
  const sid0 = (prev && prev.siteId) || _kfSiteOfLayer(l);
  const fields = typeof kmlFields === 'function' ? kmlFields(l).filter(k => todo.some(f => Number.isFinite(_kaNum((f.properties || {})[k])))) : [];
  showModal('✅ Засчитать в факт объёма?', `<div style="min-width:min(460px,88vw);display:flex;flex-direction:column;gap:8px;font-size:12px">
    <div>Выполнено объектов слоя «${esc(l.name)}»: <b>${todo.length}</b>. Добавить их в факт объёма объекта?</div>
    ${prev ? '<div style="font-size:11px;color:var(--acc)">Новый день — проверьте дату и параметры (прошлые подставлены).</div>' : ''}
    <div class="fg" style="margin:0"><label>Объект</label><select id="kf-site" onchange="_kfVols(this.value)">${sites.map(s => `<option value="${escAttr(s.id)}" ${s.id === sid0 ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
    <div class="fg" style="margin:0"><label>Объём (вид работ)</label><select id="kf-vol"><option value="">⏳…</option></select></div>
    <div class="fg" style="margin:0"><label>Сколько засчитывать за объект</label>
      <div style="display:flex;gap:6px"><select id="kf-amt" style="flex:1" onchange="const n=document.getElementById('kf-num');n.style.display=this.value==='#num'?'':'none';if(this.value==='#num')n.focus()">
        <option value="">1 (штука: скважина, точка…)</option>
        <option value="#num" ${prev && prev.amount != null ? 'selected' : ''}>своё число…</option>
        ${fields.map(k => `<option value="${escAttr(k)}" ${prev && prev.field === k ? 'selected' : ''}>из поля «${esc(k)}»</option>`).join('')}</select>
      <input id="kf-num" type="text" inputmode="decimal" placeholder="напр. 15,5" value="${prev && prev.amount != null ? esc(String(prev.amount)) : ''}" style="width:110px;${prev && prev.amount != null ? '' : 'display:none'}"></div></div>
    <div class="fg" style="margin:0"><label>Дата</label><input id="kf-date" type="date" value="${_kfToday()}"></div>
    <label style="display:flex;gap:6px;align-items:center;text-transform:none;font-weight:500;margin:0"><input type="checkbox" id="kf-rem" checked style="width:auto;margin:0"> Запомнить для этого слоя — до конца дня засчитывать сразу, без вопроса (завтра спрошу снова)</label>
    <div style="font-size:10px;color:var(--tx3)">Открыть это окно снова в любой момент — ПКМ по объекту → «✅ Выполнить с параметрами…» или ПКМ по слою → «🔗 Связь с объёмом». Снятие «выполнено» убирает и факт.</div></div>`,
    [{ label: 'Не засчитывать', cls: 'bs', fn: async () => { if (document.getElementById('kf-rem').checked) await _kfSaveCfg(l, { off: true }); closeModal(); } },
     { label: '✅ Засчитать', cls: 'bp', fn: async () => {
       const am = document.getElementById('kf-amt').value;
       const cfg = { siteId: document.getElementById('kf-site').value, volumeId: document.getElementById('kf-vol').value, field: am && am !== '#num' ? am : null };
       if (am === '#num') {
         const n = parseFloat(String(document.getElementById('kf-num').value).replace(',', '.').replace(/\s/g, ''));
         if (!(n > 0)) { toast('Введите число больше 0', 'err'); document.getElementById('kf-num').focus(); return; }
         cfg.amount = n;
       }
       if (!cfg.volumeId) { toast('Выберите объём', 'err'); return; }
       const date = document.getElementById('kf-date').value || _kfToday();
       if (document.getElementById('kf-rem').checked) await _kfSaveCfg(l, { ...cfg, day: _kfToday(), workDate: date });
       closeModal();
       const l2 = layers.find(x => x.id === l.id) || l; let gj2; try { gj2 = JSON.parse(l2.geojson); } catch (e) { gj2 = gj; }
       const f2 = gj2.type === 'FeatureCollection' ? gj2.features : [gj2];
       const idx = (gj.type === 'FeatureCollection' ? gj.features : [gj]);
       _kfCreate(l2, gj2, todo.map(f => f2[idx.indexOf(f)]).filter(Boolean), cfg, date);
     } }]);
  _kfVols(sid0 || (sites[0] || {}).id, prev && prev.volumeId);
}
async function _kfVols(siteId, selId) {
  const sel = document.getElementById('kf-vol'); if (!sel || !siteId) return;
  const o = await fetch(`${API}/sites/${siteId}`).then(r => r.json()).catch(() => ({}));
  const vols = o.volumes || [];
  sel.innerHTML = vols.length ? vols.map(v => `<option value="${escAttr(v.id)}" ${v.id === selId ? 'selected' : ''}>${esc(v.name)} — ${(+v.amount || 0).toLocaleString('ru-RU')} ${esc(v.unit || '')}</option>`).join('') : '<option value="">— у объекта нет объёмов —</option>';
}
async function _kfSaveCfg(l, cfg) {
  const st = Object.assign({}, (typeof kmlStyleOf === 'function' && kmlStyleOf(l)) || {});
  if (cfg) st.fact = cfg; else delete st.fact;
  if (typeof kmlSaveStyle === 'function') await kmlSaveStyle(l, st);
}
async function _kfCreate(l, gj, todo, cfg, date) {
  let n = 0, sum = 0;
  for (const f of todo) {
    const amt = _kfAmount(cfg, f); if (!(amt > 0)) continue;
    const nm = (f.properties && (f.properties.name || f.properties.Name)) || 'объект';
    const r = await fetch(`${API}/volumes/${encodeURIComponent(cfg.volumeId)}/progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: cfg.siteId, work_date: date, completed: amt, notes: `KML «${l.name}»: ${nm}`, geojson: JSON.stringify({ type: 'Feature', properties: { name: nm }, geometry: f.geometry }), user_name: un() }) });
    const j = await r.json().catch(() => ({}));
    if (j.id) { f.properties = f.properties || {}; f.properties._fact = j.id; n++; sum += amt; }
  }
  if (!n) { toast('В факт ничего не добавлено (нет количества)', 'warn'); return; }
  await _kmlSaveGeojson(l, gj);
  toast(`📈 В факт добавлено: ${n} поз., ${sum.toLocaleString('ru-RU')}`, 'ok');
  _kfAfterChange();
}
function _kfAfterChange() {
  try { if (currentType === 'site' && currentObj && typeof refreshCurrent === 'function') refreshCurrent(); } catch (e) {}
  if (PF.on) setTimeout(planFactRender, 600);
}
// ПКМ по слою → изменить/снять связь
function kmlFactLinkEdit(layerId) {
  const l = (layers || []).find(x => x.id === layerId); if (!l) return;
  const cur = ((typeof kmlStyleOf === 'function' && kmlStyleOf(l)) || {}).fact;
  const st = cur ? (cur.off ? 'засчёт отключён' : `связан с объёмом (${cur.amount != null ? cur.amount + ' за объект' : cur.field ? 'кол-во из поля «' + cur.field + '»' : '1 за объект'})` +
    (cur.day === _kfToday() ? `, сегодня засчитывается датой ${String(cur.workDate || cur.day).split('-').reverse().join('.')}` : ', при первой отметке сегодня спрошу дату')) : 'не связан';
  showModal('🔗 Связь слоя с объёмом', `<div style="font-size:12px;min-width:min(420px,86vw)">Слой «${esc(l.name)}»: <b>${esc(st)}</b>.<br><br>
    Когда объект слоя отмечают «✅ Выполнить», он может сразу засчитываться в факт объёма объекта.</div>`,
    [{ label: 'Закрыть', cls: 'bs', fn: closeModal },
     ...(cur ? [{ label: '✕ Снять связь', cls: 'bs', fn: async () => { await _kfSaveCfg(l, null); closeModal(); toast('Связь снята — при следующей отметке программа спросит', 'ok'); } }] : []),
     { label: '🔗 Настроить', cls: 'bp', fn: () => { _kfAsk(l, JSON.parse(l.geojson), [], cur && cur.volumeId ? cur : null); const t = document.querySelector('#mbd div'); if (t) t.firstElementChild.textContent = 'Выберите объём, в который засчитывать выполненные объекты слоя.'; } }]);
}

// ═══ 46: План / факт на карте ═══════════════════════════════════════════
const PF = { on: false, layer: null, ctl: null };
function planFactToggle() { if (PF.on) planFactOff(); else { PF.on = true; planFactRender(); } }
function planFactOff() {
  PF.on = false;
  if (PF.layer) { try { map.removeLayer(PF.layer); } catch (e) {} PF.layer = null; }
  if (PF.ctl) { PF.ctl.remove(); PF.ctl = null; }
  const b = document.getElementById('pf-btn'); if (b) b.classList.remove('on');
}
// Расстояние между точками, м (быстро, для малых расстояний)
const _pfDist = (a, b) => { const k = Math.cos((a[1] + b[1]) / 2 * Math.PI / 180); return Math.hypot((a[0] - b[0]) * 111320 * k, (a[1] - b[1]) * 110540); };
const _pfIn = (pt, ring) => { let r = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (((yi > pt[1]) !== (yj > pt[1])) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) r = !r; } return r; };
function _pfFeats(s) { try { const g = typeof s === 'string' ? JSON.parse(s) : s; return g.type === 'FeatureCollection' ? g.features : g.type === 'Feature' ? [g] : [{ type: 'Feature', geometry: g, properties: {} }]; } catch (e) { return []; } }
function _pfPts(geom) { const o = []; const w = c => { if (typeof c[0] === 'number') o.push(c); else c.forEach(w); }; if (geom && geom.coordinates) w(geom.coordinates); return o; }
// Ожидаемый % по графику на сегодня (план объёма или сроки объекта)
function _pfExpected(v, o) {
  const s = (v.plan_start || o.start_date || '').slice(0, 10), e = (v.plan_end || o.end_date || '').slice(0, 10);
  if (!s || !e || e <= s) return null;
  const t = Date.now(), a = new Date(s + 'T00:00:00').getTime(), b = new Date(e + 'T23:59:59').getTime();
  return Math.max(0, Math.min(100, (t - a) / (b - a) * 100));
}
async function planFactRender() {
  if (!(currentType === 'site' && currentObj)) { toast('Откройте объект (щелчок в списке слева)', 'warn'); PF.on = false; return; }
  const o = await fetch(`${API}/sites/${currentObj.id}`).then(r => r.json()).catch(() => currentObj);
  if (PF.layer) { try { map.removeLayer(PF.layer); } catch (e) {} }
  PF.layer = L.layerGroup().addTo(map);
  const fact = (o.vol_progress || []).filter(p => (p.row_type || 'fact') !== 'plan' && !p.hidden);
  const rows = [];
  (o.volumes || []).forEach(v => {
    const plan = _pfFeats(v.geojson).filter(f => f && f.geometry);
    const facts = fact.filter(p => p.volume_id === v.id);
    const factPts = facts.flatMap(p => _pfFeats(p.geojson).flatMap(f => f.geometry && /Point/.test(f.geometry.type) ? _pfPts(f.geometry) : (f.geometry ? [_pfPts(f.geometry).reduce((s, c, i, a) => [s[0] + c[0] / a.length, s[1] + c[1] / a.length], [0, 0])] : [])));
    const factPolys = facts.flatMap(p => _pfFeats(p.geojson).filter(f => f.geometry && /Polygon/.test(f.geometry.type)));
    let doneN = 0, n = 0;
    plan.forEach(f => {
      const g = f.geometry, t = g.type;
      let done = false;
      if (/Point/.test(t)) {
        const p = _pfPts(g)[0];
        done = factPts.some(q => _pfDist(p, q) <= 10) || factPolys.some(fp => _pfIn(p, (fp.geometry.type === 'Polygon' ? fp.geometry.coordinates : fp.geometry.coordinates[0])[0]));
        n++; if (done) doneN++;
        L.circleMarker([p[1], p[0]], { radius: 7, color: '#fff', weight: 2, fillColor: done ? '#16a34a' : '#dc2626', fillOpacity: 0.95, pane: 'factsPane' })
          .bindTooltip(`${esc((f.properties || {}).name || v.name)} — ${done ? '✅ выполнено' : '❌ не выполнено'}`).addTo(PF.layer);
      } else if (/Polygon/.test(t)) {
        const ring = (t === 'Polygon' ? g.coordinates : g.coordinates[0])[0];
        const c = ring.reduce((s, q) => [s[0] + q[0] / ring.length, s[1] + q[1] / ring.length], [0, 0]);
        done = factPolys.some(fp => _pfIn(c, (fp.geometry.type === 'Polygon' ? fp.geometry.coordinates : fp.geometry.coordinates[0])[0])) || factPts.some(q => _pfIn(q, ring));
        n++; if (done) doneN++;
        L.geoJSON(f, { pane: 'factsPane', style: { color: done ? '#16a34a' : '#dc2626', weight: 3, dashArray: done ? null : '6 4', fillOpacity: done ? 0.25 : 0.08, fillColor: done ? '#16a34a' : '#dc2626' } })
          .bindTooltip(`${esc(v.name)} — ${done ? '✅ выполнено' : '❌ не выполнено'}`).addTo(PF.layer);
      }
    });
    const total = facts.reduce((s, p) => s + (+p.completed || 0), 0), planAmt = +v.amount || 0;
    const pct = planAmt ? Math.min(100, total / planAmt * 100) : (n ? doneN / n * 100 : null);
    const exp = _pfExpected(v, o);
    rows.push({ name: v.name, n, doneN, pct, exp, lag: pct != null && exp != null ? exp - pct : null, color: v.color });
  });
  if (PF.ctl) PF.ctl.remove();
  PF.ctl = L.control({ position: 'topleft' });
  PF.ctl.onAdd = () => {
    const d = L.DomUtil.create('div', 'kml-legend'); L.DomEvent.disableClickPropagation(d);
    const f1 = x => x == null ? '—' : Math.round(x) + '%';
    d.innerHTML = `<div class="kml-legend-h" style="display:flex;justify-content:space-between;gap:10px">🎯 План / факт: ${esc(o.name)}<a href="#" onclick="event.preventDefault();planFactOff()" style="text-decoration:none">✕</a></div>
      ${rows.map(r => `<div class="kml-legend-r" style="display:block;margin-top:4px"><b>${esc(r.name)}</b><br>
        ${r.n ? `<span style="color:#16a34a">● ${r.doneN}</span> / <span style="color:#dc2626">● ${r.n - r.doneN}</span> · ` : ''}выполнено <b>${f1(r.pct)}</b>${r.exp != null ? ` · по графику ${f1(r.exp)}` : ''}
        ${r.lag != null ? (r.lag > 3 ? ` · <b style="color:#dc2626">отставание ${Math.round(r.lag)}%</b>` : r.lag < -3 ? ` · <span style="color:#16a34a">опережение ${Math.round(-r.lag)}%</span>` : ' · по графику') : ''}</div>`).join('') || '<div class="kml-legend-r">У объекта нет объёмов</div>'}
      <div style="font-size:10px;color:#6b7280;margin-top:4px">● зелёный — выполнено (есть факт в 10 м), красный — нет</div>`;
    return d;
  };
  PF.ctl.addTo(map);
  const b = document.getElementById('pf-btn'); if (b) b.classList.add('on');
}
