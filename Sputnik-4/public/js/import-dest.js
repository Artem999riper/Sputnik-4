// ═══════════════════════════════════════════════════════════
// import-dest.js — шаг «Куда загрузить» для всех импортов слоёв.
// Файл разбирается на части (папки KML, слои DXF, файлы SHP, точки/треки
// GPX…), и для каждой части выбирается: новый слой (с названием) или
// существующий слой (объекты дописываются), или «не загружать».
// Части с одинаковым новым названием объединяются в один слой.
// ═══════════════════════════════════════════════════════════

// ── KML с папками: каждая папка (Folder) — отдельная часть ─────────────
function kmlToGroups(text, fileName) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Файл KML повреждён');
  const kids = (el, tag) => [...el.children].filter(c => c.localName === tag);
  const txt = (el, tag) => { const c = el && [...el.children].find(x => x.localName === tag); return c ? c.textContent.trim() : ''; };
  // стили: id → цвет (KML хранит aabbggrr)
  const styles = {};
  const kmlColor = c => { c = (c || '').trim(); return /^[0-9a-f]{8}$/i.test(c) ? '#' + c.slice(6, 8) + c.slice(4, 6) + c.slice(2, 4) : null; };
  doc.querySelectorAll('Style[id]').forEach(st => {
    const line = st.querySelector('LineStyle color'), poly = st.querySelector('PolyStyle color'), icon = st.querySelector('IconStyle color');
    styles['#' + st.getAttribute('id')] = kmlColor((line || icon || poly || {}).textContent);
  });
  doc.querySelectorAll('StyleMap[id]').forEach(sm => {
    const p = [...sm.querySelectorAll('Pair')].find(x => txt(x, 'key') === 'normal');
    if (p) styles['#' + sm.getAttribute('id')] = styles[txt(p, 'styleUrl')] || null;
  });
  const coords = s => s.trim().split(/\s+/).map(c => c.split(',').map(Number)).filter(c => c.length >= 2 && isFinite(c[0]) && isFinite(c[1])).map(c => isFinite(c[2]) && c[2] !== 0 ? [c[0], c[1], c[2]] : [c[0], c[1]]);
  const geomOf = el => {
    const out = [];
    const walk = g => {
      const n = g.localName;
      if (n === 'Point') { const c = coords(txt(g, 'coordinates'))[0]; if (c) out.push({ type: 'Point', coordinates: c }); }
      else if (n === 'LineString' || n === 'LinearRing') { const c = coords(txt(g, 'coordinates')); if (c.length >= 2) out.push({ type: 'LineString', coordinates: c }); }
      else if (n === 'Polygon') {
        const ring = b => { const lr = b && b.querySelector('LinearRing coordinates'); return lr ? coords(lr.textContent) : null; };
        const outer = ring(kids(g, 'outerBoundaryIs')[0]);
        if (outer && outer.length >= 3) out.push({ type: 'Polygon', coordinates: [outer, ...kids(g, 'innerBoundaryIs').map(ring).filter(r => r && r.length >= 3)] });
      }
      else if (n === 'MultiGeometry') [...g.children].forEach(walk);
      else if (n === 'Track' || n === 'gx:Track') { const c = [...g.children].filter(x => x.localName === 'coord').map(x => x.textContent.trim().split(/\s+/).map(Number)); if (c.length >= 2) out.push({ type: 'LineString', coordinates: c }); }
    };
    [...el.children].forEach(walk);
    if (!out.length) return null;
    if (out.length === 1) return out[0];
    const t = out[0].type;
    if (out.every(g => g.type === t)) return { type: 'Multi' + t, coordinates: out.map(g => g.coordinates) };
    return { type: 'GeometryCollection', geometries: out };
  };
  const groups = new Map();
  const add = (path, f) => { const k = path.join(' / ') || String(fileName || 'KML').replace(/\.(kml|kmz)$/i, ''); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); };
  const walk = (el, path) => {
    for (const c of el.children) {
      if (c.localName === 'Folder' || c.localName === 'Document') {
        const nm = txt(c, 'name');
        walk(c, c.localName === 'Folder' && nm ? [...path, nm] : path);
      } else if (c.localName === 'Placemark') {
        const g = geomOf(c); if (!g || g.type === 'GeometryCollection' && !g.geometries.length) continue;
        const props = { name: txt(c, 'name') };
        const d = txt(c, 'description'); if (d) props.description = d.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        c.querySelectorAll('ExtendedData Data').forEach(x => { const k = x.getAttribute('name'); const v = x.querySelector('value'); if (k && v) props[k] = v.textContent.trim(); });
        c.querySelectorAll('ExtendedData SimpleData').forEach(x => { const k = x.getAttribute('name'); if (k) props[k] = x.textContent.trim(); });
        const col = styles[txt(c, 'styleUrl')] || kmlColor((c.querySelector('Style LineStyle color') || c.querySelector('Style PolyStyle color') || {}).textContent);
        if (col && g.type !== 'Point') props._color = col;
        if (g.type === 'GeometryCollection') g.geometries.forEach(gg => add(path, { type: 'Feature', geometry: gg, properties: { ...props } }));
        else add(path, { type: 'Feature', geometry: g, properties: props });
      }
    }
  };
  walk(doc.documentElement, []);
  const fileBase = String(fileName || 'KML').replace(/\.(kml|kmz)$/i, '');
  const list = [...groups.entries()].map(([name, features]) => ({ name, features }));
  // объекты вне папок, когда папки есть, — отдельной понятной частью
  if (list.length > 1) list.forEach(g => { if (g.name === fileBase) g.name = `${fileBase} (вне папок)`; });
  return list;
}
function gpxToGroups(text, fileName) {
  const gj = gpxToGJ(text);
  const base = String(fileName || 'GPX').replace(/\.gpx$/i, '');
  const pts = gj.features.filter(f => f.geometry.type === 'Point'), trk = gj.features.filter(f => f.geometry.type !== 'Point');
  return [pts.length && { name: `${base} — точки`, features: pts }, trk.length && { name: `${base} — треки`, features: trk }].filter(Boolean);
}

// ── Окно «Куда загрузить» ──────────────────────────────────────────────
// groups: [{name, features}] → Promise<{created, appended, ids}> | null (отмена)
function importDestination(fileName, groups, opt) {
  opt = opt || {};
  groups = (groups || []).filter(g => g.features && g.features.length);
  if (!groups.length) { toast('В файле нет объектов', 'err'); return Promise.resolve(null); }
  const TN = { Point: 'точки', MultiPoint: 'точки', LineString: 'линии', MultiLineString: 'линии', Polygon: 'полигоны', MultiPolygon: 'полигоны' };
  const typesOf = fs => { const c = {}; fs.forEach(f => { const t = TN[f.geometry && f.geometry.type] || 'прочее'; c[t] = (c[t] || 0) + 1; }); return Object.entries(c).map(([t, n]) => `${t}: ${n}`).join(', '); };
  const total = groups.reduce((s, g) => s + g.features.length, 0);
  const ex = (layers || []).filter(l => !l.site_id);
  const lopts = ex.map(l => `<option value="${escAttr(l.id)}">${esc(l.name)}</option>`).join('');
  const base = String(fileName || 'Импорт').replace(/\.[^.]+$/, '');
  const single = groups.length === 1;
  return new Promise(resolve => {
    const row = (g, i) => `<tr class="idst-row" data-i="${i}">
      <td style="width:24px"><input type="checkbox" class="idst-on" checked style="width:auto;margin:0"></td>
      <td style="width:36%;overflow:hidden;text-overflow:ellipsis"><b>${esc(g.name)}</b><div style="font-size:10px;color:var(--tx3)">${typesOf(g.features)}</div></td>
      <td style="padding-right:10px"><div style="display:flex;flex-direction:column;gap:3px;min-width:0;max-width:100%">
        <select class="idst-dst" style="font-size:12px;padding:3px;width:100%;min-width:0;box-sizing:border-box" onchange="this.nextElementSibling.style.display=this.value==='__new'?'':'none'">
          <option value="__new">＋ Новый слой</option>${lopts ? `<optgroup label="Дописать в слой">${lopts}</optgroup>` : ''}</select>
        <input class="idst-name" value="${escAttr(single ? (opt.defaultName || base) : g.name)}" style="width:100%;min-width:0;font-size:12px;padding:3px 6px;box-sizing:border-box" placeholder="Название нового слоя">
      </div></td></tr>`;
    showModal(`📥 Куда загрузить — ${esc(fileName || '')}`, `
      <div style="font-size:12px;margin-bottom:8px">В файле <b>${total}</b> объектов${single ? '' : `, частей: <b>${groups.length}</b>`}. Для каждой части выберите, куда её загрузить.</div>
      ${single ? '' : `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;font-size:11px">
        <b>Быстро:</b>
        <button class="btn bs bxs" onclick="_idstAll('sep')">каждая часть — свой слой</button>
        <button class="btn bs bxs" onclick="_idstAll('one')">всё в один новый слой</button>
        ${lopts ? `<span>всё в слой:</span><select id="idst-allex" style="font-size:11px;padding:2px;max-width:160px" onchange="_idstAll('ex')"><option value="">—</option>${lopts}</select>` : ''}
      </div>`}
      <div style="max-height:min(380px,50vh);overflow:auto;border:1.5px solid var(--bd);border-radius:var(--rs);width:100%;box-sizing:border-box;overflow-x:hidden">
        <table class="wt-tbl" style="width:100%;min-width:0;table-layout:fixed"><tbody>${groups.map(row).join('')}</tbody></table></div>
      <label style="display:flex;gap:6px;align-items:center;margin-top:8px;font-size:12px;text-transform:none;font-weight:500"><input type="checkbox" id="idst-zoom" checked style="width:auto;margin:0"> приблизить карту к загруженному</label>`,
      [{ label: 'Отмена', cls: 'bs', fn: () => { closeModal(); resolve(null); } },
       { label: '📥 Загрузить', cls: 'bp', fn: async () => {
          // собрать назначения: ключ «new:<имя>» или id слоя
          const plan = new Map();
          document.querySelectorAll('.idst-row').forEach(tr => {
            if (!tr.querySelector('.idst-on').checked) return;
            const g = groups[+tr.dataset.i], dst = tr.querySelector('.idst-dst').value;
            const name = tr.querySelector('.idst-name').value.trim() || g.name;
            const key = dst === '__new' ? 'new:' + name : dst;
            if (!plan.has(key)) plan.set(key, { dst, name, features: [] });
            plan.get(key).features.push(...g.features);
          });
          if (!plan.size) { toast('Отметьте хотя бы одну часть', 'err'); return; }
          const zoom = document.getElementById('idst-zoom').checked;
          closeModal();
          resolve(await _idstSave([...plan.values()], zoom));
       } }]);
    window._idstAll = mode => {
      const rows = [...document.querySelectorAll('.idst-row')];
      rows.forEach((tr, i) => {
        const s = tr.querySelector('.idst-dst'), n = tr.querySelector('.idst-name');
        if (mode === 'ex') { const v = document.getElementById('idst-allex').value; if (!v) return; s.value = v; n.style.display = 'none'; return; }
        s.value = '__new'; n.style.display = '';
        n.value = mode === 'one' ? base : groups[i].name;
      });
    };
  });
}
async function _idstSave(plan, zoom) {
  const ids = []; let created = 0, appended = 0, nObj = 0;
  for (const p of plan) {
    nObj += p.features.length;
    if (p.dst === '__new') {
      const color = typeof LCOLORS !== 'undefined' ? LCOLORS[((layers || []).length + created) % LCOLORS.length] : '#1a56db';
      const r = await fetch(`${API}/layers`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: p.name, geojson: JSON.stringify({ type: 'FeatureCollection', features: p.features }), color }) });
      const j = await r.json().catch(() => ({})); if (j.id) { ids.push(j.id); created++; }
    } else {
      const L0 = await fetch(`${API}/layers/${p.dst}`).then(r => r.json()).catch(() => null);
      if (!L0 || L0.error) continue;
      let g0; try { g0 = JSON.parse(L0.geojson || '{}'); } catch (e) { g0 = {}; }
      if (!g0 || g0.type !== 'FeatureCollection') g0 = { type: 'FeatureCollection', features: [] };
      g0.features = (g0.features || []).concat(p.features);
      await fetch(`${API}/layers/${p.dst}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...L0, geojson: JSON.stringify(g0), visible: !!L0.visible, show_labels: !!L0.show_labels }) });
      ids.push(p.dst); appended++;
    }
  }
  layers = await fetch(`${API}/layers`).then(r => r.json()).catch(() => layers);
  if (typeof renderLP === 'function') renderLP();
  if (typeof renderLayerGroups === 'function') renderLayerGroups();
  try { if (typeof kmlPanelOpen !== 'undefined' && kmlPanelOpen) renderKmlPanel(); } catch (e) {}
  toast(`Загружено объектов: ${nObj}${created ? ` · новых слоёв: ${created}` : ''}${appended ? ` · дописано в слои: ${appended}` : ''}`, 'ok');
  if (zoom && typeof _zoomToLayers === 'function') _zoomToLayers(ids);
  return { created, appended, ids };
}
