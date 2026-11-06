// ═══════════════════════════════════════════════════════════
// crs-picker.js — единый выбор системы координат для «Метки по координатам»
// и импорта (CSV/Excel, DXF, MapInfo TAB, SHP без .prj). Те же системы, что во
// вкладке «Пересчёт координат» (coord-convert.js): WGS-84, ПЗ-90.11, ГСК-2011,
// СК-42, СК-95 (широта/долгота и Гаусс-Крюгер 6°), МСК любого региона
// (2001/2008), UTM, своя строка proj4 — плюс «Свои системы координат»:
// общий для всех справочник (app_settings crs_library) — районы/зоны СК-63
// и любые местные системы, заданные параметрами или строкой proj4.
// Состояние выбора: { sys, zone, msk, mskDatum, custom } (sys — id из списка).
// ═══════════════════════════════════════════════════════════
const CRSP_WGS = '+proj=longlat +datum=WGS84 +no_defs';
let CRS_LIB = [];                 // [{id, name, proj, note}]
// СК-63: районы и зоны (public/sk63-zones.json — из MapInfo MAPINFOW.PRJ, датум Пулково-1942)
let SK63 = null;
const SK63_TOWGS = '23.57,-140.95,-79.8,0,0.35,0.79,-0.22';      // как СК-42 / МСК (ГОСТ 32453)
function sk63DistrictLabel(d) { const zs = (SK63 && SK63.districts[d]) || []; if (!zs.length) return d; const lo = Math.min(...zs.map(z => z.lon)), hi = Math.max(...zs.map(z => z.lon)), w = /6$/.test(d) ? 6 : 3;
  const f = v => Math.round(((v + 540) % 360) - 180); return `${d} — зоны ${w}°, ${zs.length} шт., ${f(lo - w / 2)}°…${f(hi + w / 2)}° в.д.`; }
let _crsLibLoaded = false;
async function crsLibLoad(force) {
  if (!SK63) { try { SK63 = await fetch('/sk63-zones.json').then(r => r.json()); } catch (e) { SK63 = { districts: {} }; } }
  if (_crsLibLoaded && !force) return CRS_LIB;
  try { const j = await fetch(`${API}/app-settings/crs_library`).then(r => r.json()); CRS_LIB = Array.isArray(j && j.value) ? j.value : []; } catch (e) {}
  _crsLibLoaded = true;
  return CRS_LIB;
}
async function _crsLibSave() {
  const r = await fetch(`${API}/app-settings/crs_library`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: CRS_LIB }) });
  if (!r.ok) throw new Error('не сохранилось');
}
// все системы: стандартные (без Web Mercator) + свои
function crsAllSystems() {
  return CV_SYSTEMS.filter(s => s.kind !== 'merc').concat(CRS_LIB.map(l => ({ id: 'lib:' + l.id, kind: 'lib', label: '★ ' + l.name })));
}
// proj4 для состояния; ctx: {lon} (по долготе) или {easting} (зона по Y)
function crsProjOf(st, ctx = {}) {
  const id = st.sys || 'geo:wgs';
  if (id.startsWith('lib:')) {
    const l = CRS_LIB.find(x => 'lib:' + x.id === id);
    if (!l) throw new Error('Своя система не найдена (удалена?)');
    return { proj: l.proj, name: l.name, geo: /\+proj=(longlat|latlong|lonlat)/.test(l.proj) };
  }
  const sys = CV_SYSTEMS.find(s => s.id === id) || CV_SYSTEMS[0], zoneSel = st.zone || 'auto';
  if (sys.kind === 'geo') return { proj: CV_GEO[id.split(':')[1]][1], name: CV_GEO[id.split(':')[1]][0], geo: true };
  if (sys.kind === 'merc') return { proj: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs', name: 'Web Mercator' };
  if (sys.kind === 'custom') {
    const p = (st.custom || '').trim();
    if (!p) throw new Error('Введите строку proj4 для своей системы');
    return { proj: p, name: 'proj4', geo: /\+proj=(longlat|latlong|lonlat)/.test(p) };
  }
  if (sys.kind === 'gk') {
    const dat = id.split(':')[1];
    const z = zoneSel !== 'auto' ? +zoneSel : (ctx.easting != null ? Math.floor(ctx.easting / 1e6) : Math.floor(((ctx.lon % 360) + 360) % 360 / 6) + 1);
    if (!(z >= 1 && z <= 60)) throw new Error('Не удалось определить зону — выберите её вручную');
    return { proj: `+proj=tmerc +lat_0=0 +lon_0=${6 * z - 3} +k=1 +x_0=${z * 1e6 + 500000} +y_0=0 ${CV_DATUM[dat]} +units=m +no_defs`,
      name: `${dat === 'sk42' ? 'СК-42' : dat === 'sk95' ? 'СК-95' : 'ГСК-2011'} зона ${z}`, zone: z };
  }
  if (sys.kind === 'utm') {
    const z = zoneSel !== 'auto' ? +zoneSel : (ctx.lon != null ? Math.floor((ctx.lon + 180) / 6) + 1 : null);
    if (!z) throw new Error('Для UTM выберите зону (по X/Y её не определить)');
    return { proj: `+proj=utm +zone=${z} +datum=WGS84 +units=m +no_defs`, name: `UTM ${z}N`, zone: z };
  }
  if (sys.kind === 'sk63') {
    const d = st.sk63 || 'W3', zs = (SK63 && SK63.districts && SK63.districts[d]) || [];
    if (!zs.length) throw new Error('Нет параметров СК-63 для района ' + d);
    let zr;
    if (zoneSel !== 'auto') zr = zs.find(z => String(z.z) === String(zoneSel));
    else if (ctx.easting != null) zr = zs.find(z => z.z === Math.floor(ctx.easting / 1e6));
    else { let bd = Infinity; zs.forEach(z => { const dd = Math.abs((((z.lon - ctx.lon) + 540) % 360) - 180); if (dd < bd) { bd = dd; zr = z; } }); }
    if (!zr) throw new Error(`СК-63 ${d}: нет зоны ${ctx.easting != null ? Math.floor(ctx.easting / 1e6) : ''} — проверьте район или выберите зону`);
    const lon0 = zr.lon > 180 ? zr.lon - 360 : zr.lon;
    return { proj: `+proj=tmerc +lat_0=${zr.lat} +lon_0=${lon0} +k=${zr.k} +x_0=${zr.x0} +y_0=${zr.y0} +ellps=krass +towgs84=${SK63_TOWGS} +units=m +no_defs`,
      name: `СК-63 ${d} зона ${zr.z}`, zone: zr.z };
  }
  if (sys.kind === 'msk') {
    const reg = st.msk || '86', datum = st.mskDatum || '2008';
    const zones = (MSK_FULL && MSK_FULL.regions && MSK_FULL.regions[reg]) || [];
    if (!zones.length) throw new Error('Нет параметров МСК для региона ' + reg);
    let zr;
    if (zoneSel !== 'auto') zr = zones.find(z => String(z.z) === String(zoneSel));
    else if (ctx.easting != null) { const n = Math.floor(ctx.easting / 1e6); zr = zones.find(z => Math.floor(z.x0 / 1e6) === n); }
    else { let bd = Infinity; zones.forEach(z => { const d = Math.abs(z.lon - ctx.lon); if (d < bd) { bd = d; zr = z; } }); }
    if (!zr) zr = zones[0];
    const tw = (MSK_FULL.datums && MSK_FULL.datums[datum]) || MSK_FULL.datums['2008'];
    return { proj: `+proj=tmerc +lat_0=0 +lon_0=${zr.lon} +k=1 +x_0=${zr.x0} +y_0=${zr.y0} +ellps=${MSK_FULL.ellps || 'krass'} +towgs84=${tw.join(',')} +units=m +no_defs`,
      name: `МСК-${reg} зона ${zr.z} (${datum})`, zone: zr.z };
  }
  throw new Error('Неизвестная система');
}
const crsIsGeo = st => { try { const id = st.sys || ''; if (id.startsWith('geo:')) return true; if (id === 'custom') return /\+proj=(longlat|latlong|lonlat)/.test(st.custom || ''); if (id.startsWith('lib:')) { const l = CRS_LIB.find(x => 'lib:' + x.id === id); return !!(l && /\+proj=(longlat|latlong|lonlat)/.test(l.proj)); } } catch (e) {} return false; };
// В WGS-84: a — X (север) или широта, b — Y (восток) или долгота → {lat, lng, name}
function crsToWgs(st, a, b) {
  const geo = crsIsGeo(st);
  const P = crsProjOf(st, geo ? { lon: b } : { easting: b });
  const w = proj4(P.proj, CRSP_WGS, [b, a]);
  return { lat: w[1], lng: w[0], name: P.name };
}
// Ключ для сервера (импорт DXF/TAB/SHP): зона «авто» — по координатам на сервере
function crsServerKey(st) {
  const id = st.sys || 'geo:wgs', auto = !st.zone || st.zone === 'auto';
  if (id === 'geo:wgs') return 'wgs84';
  if (id.startsWith('gk:') && auto) return id;
  if (id === 'msk' && auto) return `mskfull:${st.msk || '86'}:${st.mskDatum || '2008'}`;
  if (id === 'sk63' && auto) return `sk63:${st.sk63 || 'W3'}`;
  return crsProjOf(st, { easting: 0, lon: 0 }).proj;     // фиксированная зона / UTM / своя / широта-долгота — строка proj4
}
function crsLabel(st) {
  const s = crsAllSystems().find(x => x.id === st.sys); let t = s ? s.label.replace(/^★ /, '') : st.sys;
  if (st.sys === 'msk') t = `МСК-${st.msk || '86'}${CV_REGION_NAMES[st.msk] ? ' (' + CV_REGION_NAMES[st.msk] + ')' : ''}, ${st.mskDatum || '2008'}`;
  if (st.sys === 'sk63') t = `СК-63 ${st.sk63 || 'W3'}`;
  if (st.zone && st.zone !== 'auto') t += `, зона ${st.zone}`;
  return t;
}

// ── Разметка выбора ────────────────────────────────────────
// prefix — уникальный префикс id; st — начальное состояние; opt.onChange — имя глобальной функции
const _CRSP = {};   // prefix → { st, onChange }
function crspHtml(prefix, st, opt = {}) {
  _CRSP[prefix] = { st: Object.assign({ sys: 'msk', zone: 'auto', msk: (typeof coordMskRegion !== 'undefined' ? coordMskRegion : '86'), mskDatum: '2008', custom: '', sk63: 'W3' }, st || {}), onChange: opt.onChange || '' };
  // справочник своих систем ещё не загружен — догрузить и перерисовать
  if (!_crsLibLoaded) crsLibLoad().then(() => { const el = document.getElementById(prefix + '-crsp'); if (el) el.innerHTML = _crspInner(prefix); });
  return `<div class="crsp" id="${prefix}-crsp">${_crspInner(prefix)}</div>`;
}
function _crspInner(prefix) {
  const S = _CRSP[prefix].st, sys = crsAllSystems().find(s => s.id === S.sys) || { kind: 'geo' };
  const o = (v, l, cur) => `<option value="${escAttr(String(v))}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
  const ch = f => `onchange="_crspSet('${prefix}','${f}',this.value)"`;
  const std = crsAllSystems().filter(s => s.kind !== 'lib'), lib = crsAllSystems().filter(s => s.kind === 'lib');
  let h = `<select ${ch('sys')} class="crsp-sys">${std.map(s => o(s.id, s.label, S.sys)).join('')}
    ${lib.length ? `<optgroup label="Свои системы (СК-63 и др.)">${lib.map(s => o(s.id, s.label, S.sys)).join('')}</optgroup>` : ''}</select>`;
  if (sys.kind === 'msk') {
    const regs = Object.keys((MSK_FULL && MSK_FULL.regions) || {}).sort(), zones = (MSK_FULL && MSK_FULL.regions && MSK_FULL.regions[S.msk]) || [];
    h += `<div class="crsp-row"><select ${ch('msk')}>${regs.map(r => o(r, `МСК-${r}${CV_REGION_NAMES[r] ? ' — ' + CV_REGION_NAMES[r] : ''}`, S.msk)).join('')}</select>
      <select ${ch('zone')} title="Зона">${o('auto', 'зона — авто (по Y)', S.zone)}${zones.map(z => o(z.z, `зона ${z.z} (ЦМ ${z.lon}°)`, S.zone)).join('')}</select>
      <select ${ch('mskDatum')} title="Реализация">${o('2008', '2008', S.mskDatum)}${o('2001', '2001', S.mskDatum)}</select></div>`;
  }
  if (sys.kind === 'sk63') {
    const D = (SK63 && SK63.districts) || {}, zs = D[S.sk63] || [];
    h += `<div class="crsp-row"><select ${ch('sk63')} title="Район СК-63">${Object.keys(D).sort().map(d => o(d, sk63DistrictLabel(d), S.sk63)).join('')}</select>
      <select ${ch('zone')} title="Зона">${o('auto', 'зона — авто (по Y)', S.zone)}${zs.map(z => o(z.z, `зона ${z.z} (ЦМ ${(+z.lon).toFixed(3)}°)`, S.zone)).join('')}</select></div>`;
  }
  if (sys.kind === 'gk' || sys.kind === 'utm') {
    h += `<div class="crsp-row"><select ${ch('zone')}>${sys.kind === 'gk' ? o('auto', 'зона — авто (по первым цифрам Y)', S.zone) : o('auto', 'зона — по центру карты', S.zone)}${Array.from({ length: 60 }, (_, i) => o(i + 1, `зона ${i + 1}${sys.kind === 'gk' ? ` (ЦМ ${6 * (i + 1) - 3}°)` : 'N'}`, S.zone)).join('')}</select></div>`;
  }
  if (sys.kind === 'custom') h += `<textarea class="crsp-custom" rows="2" placeholder="+proj=tmerc +lat_0=0 +lon_0=… +x_0=… +y_0=… +ellps=krass +towgs84=… +units=m +no_defs" onchange="_crspSet('${prefix}','custom',this.value)">${esc(S.custom || '')}</textarea>`;
  if (!lib.length) h += `<div class="crsp-hint">Другие местные системы — добавьте один раз в «★ Свои системы» на вкладке «Пересчёт координат», и они появятся здесь.</div>`;
  return h;
}
function _crspSet(prefix, f, v) {
  const P = _CRSP[prefix]; if (!P) return;
  P.st[f] = v;
  if (f === 'sys' || f === 'msk' || f === 'sk63') P.st.zone = 'auto';
  // UTM: «по центру карты» — сразу ставим зону, иначе из X/Y её не узнать
  if (f === 'sys' && v === 'utm' && typeof map !== 'undefined' && map.getCenter) P.st.zone = String(Math.floor((map.getCenter().lng + 180) / 6) + 1);
  const el = document.getElementById(prefix + '-crsp'); if (el) el.innerHTML = _crspInner(prefix);
  if (P.onChange && typeof window[P.onChange] === 'function') window[P.onChange]();
}
const crspRead = prefix => Object.assign({}, (_CRSP[prefix] || {}).st || {});
function crspRemember(key, st) { try { localStorage.setItem('crsp_' + key, JSON.stringify(st)); } catch (e) {} }
function crspRecall(key) { try { return JSON.parse(localStorage.getItem('crsp_' + key) || 'null'); } catch (e) { return null; } }

// ── ★ Свои системы координат: СК-63 и местные ───────────────
function crsLibOpen(backPrefix) {
  const rows = CRS_LIB.length ? CRS_LIB.map(l => `<div class="crsl-row"><div style="flex:1;min-width:0"><b>${esc(l.name)}</b>${l.note ? `<div class="crsl-note">${esc(l.note)}</div>` : ''}<code>${esc(l.proj)}</code></div>
      <button class="btn bs bxs" onclick="crsLibEdit('${escAttr(l.id)}','${escAttr(backPrefix || '')}')">✏️</button><button class="btn bs bxs" onclick="crsLibDel('${escAttr(l.id)}','${escAttr(backPrefix || '')}')">🗑</button></div>`).join('')
    : '<div class="vl-hint">Пока пусто.</div>';
  showModal('★ Свои системы координат', `<div style="min-width:min(560px,90vw)">
    <div class="vl-hint">Общий справочник для всех пользователей: системы появляются в «Метке по координатам», импорте слоёв и «Пересчёте координат». Сюда вносят районы и зоны <b>СК-63</b> и другие местные системы — по параметрам (центральный меридиан, сдвиги X и Y) или готовой строкой proj4 (например, из .prj, Credo, MapInfo).</div>
    <div style="margin:8px 0">${rows}</div>
  </div>`, [
    { label: 'Закрыть', cls: 'bs', fn: () => { closeModal(); if (typeof renderCoordConvert === 'function' && document.getElementById('conv-page') && document.getElementById('conv-page').offsetParent) renderCoordConvert(true); } },
    { label: '＋ Добавить систему', cls: 'bp', fn: () => crsLibEdit('', backPrefix) },
  ]);
}
function crsLibEdit(id, backPrefix) {
  const l = CRS_LIB.find(x => x.id === id) || { name: '', proj: '', note: '' };
  // разбор существующей строки в поля (если это поперечная Меркатора)
  const g = k => { const m = (l.proj || '').match(new RegExp('\\+' + k + '=([^ ]+)')); return m ? m[1] : ''; };
  const isTm = !l.proj || /\+proj=tmerc/.test(l.proj);
  const dat = /towgs84=23\.92/.test(l.proj) ? 'sk63' : /towgs84=24\.47/.test(l.proj) ? 'sk95' : 'sk42';
  showModal(id ? '✏️ Своя система' : '＋ Своя система координат', `<div class="fgr" style="min-width:min(520px,90vw)">
    <div class="fg s2"><label>Название</label><input id="crsl-name" value="${escAttr(l.name)}" placeholder="СК-63 район К, зона 2"></div>
    <div class="fg s2"><label>Как задать</label><select id="crsl-mode" onchange="_crslMode()"><option value="tm" ${isTm ? 'selected' : ''}>Параметрами (СК-63, местные Гаусс-Крюгер)</option><option value="proj" ${isTm ? '' : 'selected'}>Строкой proj4</option></select></div>
    <div id="crsl-tm" class="fg s2" style="${isTm ? '' : 'display:none'}">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 10px">
        <div class="fg"><label>Центральный меридиан, °</label><input id="crsl-lon0" value="${escAttr(g('lon_0'))}" placeholder="69.03333333 или 69 02"></div>
        <div class="fg"><label>Широта начала, °</label><input id="crsl-lat0" value="${escAttr(g('lat_0') || '0')}" placeholder="0 (у СК-63 бывает 0.1)"></div>
        <div class="fg"><label>Сдвиг по Y (x_0), м</label><input id="crsl-x0" value="${escAttr(g('x_0'))}" placeholder="2300000"></div>
        <div class="fg"><label>Сдвиг по X (y_0), м</label><input id="crsl-y0" value="${escAttr(g('y_0') || '0')}" placeholder="-9214.69"></div>
        <div class="fg"><label>Масштаб k</label><input id="crsl-k" value="${escAttr(g('k') || g('k_0') || '1')}"></div>
        <div class="fg"><label>Эллипсоид и переход в WGS-84</label><select id="crsl-dat">
          <option value="sk42" ${dat === 'sk42' ? 'selected' : ''}>Красовский, как СК-42 (ГОСТ 32453)</option>
          <option value="sk63" ${dat === 'sk63' ? 'selected' : ''}>Красовский, СК-63 (EPSG:1267)</option>
          <option value="sk95" ${dat === 'sk95' ? 'selected' : ''}>Красовский, как СК-95</option></select></div>
      </div>
      <div class="vl-hint">Параметры района/зоны СК-63 берут из паспорта или «ключей» системы (у геодезистов, в Credo/MapInfo). Сдвиги — как в proj4: x_0 — к восточной координате, y_0 — к северной.</div>
    </div>
    <div id="crsl-pj" class="fg s2" style="${isTm ? 'display:none' : ''}"><label>Строка proj4</label><textarea id="crsl-proj" rows="3" style="font-family:monospace;font-size:11px">${esc(l.proj || '')}</textarea></div>
    <div class="fg s2"><label>Примечание (необязательно)</label><input id="crsl-note" value="${escAttr(l.note || '')}" placeholder="откуда параметры, для каких объектов"></div>
    <div class="fg s2"><label>Проверка: X (север), Y (восток) → WGS-84</label><div style="display:flex;gap:6px"><input id="crsl-tx" placeholder="X, м" style="flex:1"><input id="crsl-ty" placeholder="Y, м" style="flex:1"><button class="btn bs bsm" type="button" onclick="_crslTest()">→</button></div><div id="crsl-tres" class="vl-hint"></div></div>
  </div>`, [
    { label: 'Отмена', cls: 'bs', fn: () => crsLibOpen(backPrefix) },
    { label: '💾 Сохранить', cls: 'bp', fn: async () => {
      const name = document.getElementById('crsl-name').value.trim(); if (!name) { toast('Укажите название', 'err'); return; }
      let proj; try { proj = _crslProj(); proj4(proj, CRSP_WGS, [500000, 6000000]); } catch (e) { toast('Параметры не подходят: ' + e.message, 'err'); return; }
      const rec = { id: id || Math.random().toString(36).slice(2, 10), name, proj, note: document.getElementById('crsl-note').value.trim() };
      const i = CRS_LIB.findIndex(x => x.id === rec.id); if (i >= 0) CRS_LIB[i] = rec; else CRS_LIB.push(rec);
      try { await _crsLibSave(); toast('★ Система сохранена — видна у всех', 'ok'); } catch (e) { toast('❌ ' + e.message, 'err'); return; }
      crsLibOpen(backPrefix);
    } },
  ]);
}
function _crslMode() { const m = document.getElementById('crsl-mode').value; document.getElementById('crsl-tm').style.display = m === 'tm' ? '' : 'none'; document.getElementById('crsl-pj').style.display = m === 'proj' ? '' : 'none'; }
// градусы: «69.0333» или «69 02» / «69°02′» → десятичные
function _crslDeg(s) { s = String(s || '').trim().replace(',', '.'); if (!s) return NaN; const p = s.split(/[°'′"″\s]+/).filter(Boolean).map(Number); return p.length > 1 ? Math.sign(p[0] || 1) * (Math.abs(p[0]) + (p[1] || 0) / 60 + (p[2] || 0) / 3600) : +p[0]; }
function _crslProj() {
  if (document.getElementById('crsl-mode').value === 'proj') { const p = document.getElementById('crsl-proj').value.trim(); if (!/^\+proj=/.test(p)) throw new Error('строка должна начинаться с +proj='); return p; }
  const lon0 = _crslDeg(document.getElementById('crsl-lon0').value), lat0 = _crslDeg(document.getElementById('crsl-lat0').value || '0');
  const num = id => { const v = parseFloat(String(document.getElementById(id).value || '').replace(/\s/g, '').replace(',', '.')); return v; };
  const x0 = num('crsl-x0'), y0 = num('crsl-y0') || 0, k = num('crsl-k') || 1;
  if (!isFinite(lon0)) throw new Error('центральный меридиан'); if (!isFinite(x0)) throw new Error('сдвиг x_0');
  const tw = { sk42: '23.57,-140.95,-79.8,0,0.35,0.79,-0.22', sk63: '23.92,-141.27,-80.9,0,0.35,0.82,-0.12', sk95: '24.47,-130.89,-81.56,0,0,0.13,-0.22' }[document.getElementById('crsl-dat').value];
  return `+proj=tmerc +lat_0=${+lat0.toFixed(10)} +lon_0=${+lon0.toFixed(10)} +k=${k} +x_0=${x0} +y_0=${y0} +ellps=krass +towgs84=${tw} +units=m +no_defs`;
}
function _crslTest() {
  const el = document.getElementById('crsl-tres');
  try {
    const p = _crslProj(), x = parseFloat(document.getElementById('crsl-tx').value.replace(/\s/g, '').replace(',', '.')), y = parseFloat(document.getElementById('crsl-ty').value.replace(/\s/g, '').replace(',', '.'));
    if (!isFinite(x) || !isFinite(y)) throw new Error('введите X и Y');
    const w = proj4(p, CRSP_WGS, [y, x]);
    el.innerHTML = `→ <b>${w[1].toFixed(6)}°N, ${w[0].toFixed(6)}°E</b> <a href="#" onclick="event.preventDefault();map.setView([${w[1]},${w[0]}],15)">показать на карте</a>`;
  } catch (e) { el.textContent = '⚠ ' + e.message; }
}
async function crsLibDel(id, backPrefix) {
  const l = CRS_LIB.find(x => x.id === id); if (!l) return;
  if (!await confirmDlg(`Удалить систему «${l.name}» из справочника? Уже загруженные слои не изменятся.`)) return;
  CRS_LIB = CRS_LIB.filter(x => x.id !== id);
  try { await _crsLibSave(); } catch (e) { toast('❌ ' + e.message, 'err'); }
  crsLibOpen(backPrefix);
}
