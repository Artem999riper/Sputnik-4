// ═══════════════════════════════════════════════════════════
// coord-convert.js — вкладка «Пересчёт координат»
// Пересчёт между WGS-84, ПЗ-90.11, ГСК-2011, СК-42, СК-95 (географические
// и Гаусс-Крюгер по зонам), МСК всех регионов (2001/2008), UTM, Web Mercator
// и произвольной proj4-строкой. Одна точка, «во всех системах», пакетный
// пересчёт (вставка из Excel / файл CSV, TXT, XLSX), экспорт и показ на карте.
// Все вычисления — в браузере через proj4js (параметры как в coords.js).
// ═══════════════════════════════════════════════════════════

// ── Параметры датумов (ГОСТ 32453-2017, ГОСТ Р 51794-2008) ─────────────
const CV_DATUM = {
  sk42:  '+ellps=krass +towgs84=23.57,-140.95,-79.8,0,0.35,0.79,-0.22',
  sk95:  '+ellps=krass +towgs84=24.47,-130.89,-81.56,0,0,0.13,-0.22',
  gsk:   '+a=6378136.5 +rf=298.2564151 +towgs84=0.013,-0.092,-0.03,-0.001738,0.003559,-0.004263,0.0074',
  pz90:  '+a=6378136 +rf=298.25784 +towgs84=-0.013,0.106,0.022,-0.0023,0.00354,-0.00421,-0.008',
  wgs:   '+datum=WGS84',
};
const CV_GEO = {
  wgs:  ['WGS-84', `+proj=longlat ${CV_DATUM.wgs} +no_defs`],
  pz90: ['ПЗ-90.11', `+proj=longlat ${CV_DATUM.pz90} +no_defs`],
  gsk:  ['ГСК-2011', `+proj=longlat ${CV_DATUM.gsk} +no_defs`],
  sk42: ['СК-42 (Пулково)', `+proj=longlat ${CV_DATUM.sk42} +no_defs`],
  sk95: ['СК-95', `+proj=longlat ${CV_DATUM.sk95} +no_defs`],
};
const CV_WGS = CV_GEO.wgs[1];

// Список систем для выпадающих списков. kind: geo | gk | msk | utm | merc | custom
const CV_SYSTEMS = [
  { id: 'geo:wgs',  kind: 'geo', label: 'WGS-84 — широта/долгота' },
  { id: 'geo:pz90', kind: 'geo', label: 'ПЗ-90.11 — широта/долгота' },
  { id: 'geo:gsk',  kind: 'geo', label: 'ГСК-2011 — широта/долгота' },
  { id: 'geo:sk42', kind: 'geo', label: 'СК-42 — широта/долгота' },
  { id: 'geo:sk95', kind: 'geo', label: 'СК-95 — широта/долгота' },
  { id: 'gk:sk42',  kind: 'gk',  label: 'СК-42 — Гаусс-Крюгер (зоны 6°)' },
  { id: 'gk:sk95',  kind: 'gk',  label: 'СК-95 — Гаусс-Крюгер (зоны 6°)' },
  { id: 'gk:gsk',   kind: 'gk',  label: 'ГСК-2011 — Гаусс-Крюгер (зоны 6°)' },
  { id: 'msk',      kind: 'msk', label: 'МСК (местная система региона)' },
  { id: 'utm',      kind: 'utm', label: 'UTM / WGS-84 (северное полушарие)' },
  { id: 'merc',     kind: 'merc', label: 'Web Mercator (EPSG:3857)' },
  { id: 'custom',   kind: 'custom', label: 'Своя система (строка proj4)' },
];

// Названия регионов для МСК (код субъекта РФ → название)
const CV_REGION_NAMES = {
  '01':'Адыгея','02':'Башкортостан','03':'Бурятия','04':'Алтай (респ.)','05':'Дагестан','06':'Ингушетия','07':'Кабардино-Балкария',
  '08':'Калмыкия','09':'Карачаево-Черкесия','10':'Карелия','11':'Коми','12':'Марий Эл','13':'Мордовия','14':'Якутия','15':'Северная Осетия',
  '16':'Татарстан','17':'Тыва','18':'Удмуртия','19':'Хакасия','20':'Чечня','21':'Чувашия','22':'Алтайский край','23':'Краснодарский край',
  '24':'Красноярский край','25':'Приморский край','26':'Ставропольский край','27':'Хабаровский край','28':'Амурская','29':'Архангельская',
  '30':'Астраханская','31':'Белгородская','32':'Брянская','33':'Владимирская','34':'Волгоградская','35':'Вологодская','36':'Воронежская',
  '37':'Ивановская','38':'Иркутская','39':'Калининградская','40':'Калужская','41':'Камчатский край','42':'Кемеровская','43':'Кировская',
  '44':'Костромская','45':'Курганская','46':'Курская','47':'Ленинградская','48':'Липецкая','49':'Магаданская','50':'Московская',
  '51':'Мурманская','52':'Нижегородская','53':'Новгородская','54':'Новосибирская','55':'Омская','56':'Оренбургская','57':'Орловская',
  '58':'Пензенская','59':'Пермский край','60':'Псковская','61':'Ростовская','62':'Рязанская','63':'Самарская','64':'Саратовская',
  '65':'Сахалинская','66':'Свердловская','67':'Смоленская','68':'Тамбовская','69':'Тверская','70':'Томская','71':'Тульская','72':'Тюменская',
  '73':'Ульяновская','74':'Челябинская','75':'Забайкальский край','76':'Ярославская','77':'Москва','78':'Санкт-Петербург','79':'Еврейская АО',
  '83':'Ненецкий АО','86':'ХМАО-Югра','87':'Чукотский АО','89':'ЯНАО',
};

// Состояние вкладки (запоминается в браузере)
let CV = {
  src: 'geo:wgs', dst: 'msk',
  srcZone: 'auto', dstZone: 'auto',
  srcMsk: '86', dstMsk: '86', srcMskDatum: '2008', dstMskDatum: '2008',
  srcCustom: '', dstCustom: '',
  angFmt: 'dd',       // вывод углов: dd | dm | dms
  dec: 3,             // знаков после запятой для метров
  withH: false,       // пересчитывать эллипсоидальную высоту
  srcSwap: false,     // порядок на входе: false — X,Y (B,L); true — Y,X (L,B)
  dstSwap: false,     // порядок на выходе
  mode: 'one',        // one | batch
  results: [],        // пакетные результаты
};
try { Object.assign(CV, JSON.parse(localStorage.getItem('cv_state') || '{}'), { results: [] }); } catch (e) {}
function _cvSave() { try { const { results, ...rest } = CV; localStorage.setItem('cv_state', JSON.stringify(rest)); } catch (e) {} }

// ── Разбор углов: 61.5 | 61,5 | 61°30'15.2" | 61 30 15.2 | 61:30.25 | N61°… | 61°30'В
function cvParseAngle(str) {
  if (str == null) return NaN;
  let s = String(str).trim();
  if (!s) return NaN;
  // южная широта / западная долгота (S, W, ю.ш., з.д.) или минус — отрицательное значение
  const neg = /^[-−]/.test(s) || /[SWЮЗ]/i.test(s);
  s = s.replace(/^[-−]\s*/, '').replace(/[NSEWСЮВЗ]/gi, ' ').trim();
  s = s.replace(/[°º˚d]/gi, ' ').replace(/[′'’`m]/g, ' ').replace(/[″"”s]/g, ' ').replace(/:/g, ' ');
  // десятичная запятая → точка (в одном поле может быть только десятичная)
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  s = s.replace(/[A-Za-zА-Яа-яЁё]+\.?/g, ' ').replace(/(^|[^\d])\.(?!\d)/g, '$1 ');   // остатки подписей: «ш.», «д.», «град» …
  const parts = s.split(/\s+/).filter(Boolean).map(Number);
  if (!parts.length || parts.some(x => !isFinite(x))) return NaN;
  const [d, m = 0, sec = 0] = parts;
  if (parts.length > 3 || (parts.length > 1 && (m >= 60 || sec >= 60))) return NaN;
  return (neg ? -1 : 1) * (Math.abs(d) + m / 60 + sec / 3600);
}
function cvParseNum(str) {
  if (str == null) return NaN;
  const s = String(str).trim().replace(/\s+/g, '').replace(',', '.');
  return s === '' ? NaN : Number(s);
}
function cvFmtAngle(v, fmt, isLat) {
  if (!isFinite(v)) return '—';
  if (fmt === 'dd') return v.toFixed(8);
  const sg = v < 0 ? '-' : '';
  const a = Math.abs(v);
  let d = Math.floor(a);
  if (fmt === 'dm') {
    let m = (a - d) * 60;
    if (+m.toFixed(5) >= 60) { d++; m = 0; }
    return `${sg}${d}°${m.toFixed(5).padStart(8, '0')}'`;
  }
  let mf = (a - d) * 60, m = Math.floor(mf), s = (mf - m) * 60;
  if (+s.toFixed(4) >= 60) { s = 0; m++; }
  if (m >= 60) { m = 0; d++; }
  return `${sg}${d}°${String(m).padStart(2, '0')}'${s.toFixed(4).padStart(7, '0')}"`;
}

// ── Построение proj4-строки системы ────────────────────────────────────
// side: 'src' | 'dst'. ctx: {lon} — долгота точки (для авто-зоны прямого пересчёта),
// {easting} — восточная координата (для авто-зоны обратного пересчёта).
function cvProj(side, ctx) {
  const id = CV[side], sys = CV_SYSTEMS.find(s => s.id === id) || CV_SYSTEMS[0];
  const zoneSel = CV[side + 'Zone'];
  if (sys.kind === 'geo') return { proj: CV_GEO[id.split(':')[1]][1], name: CV_GEO[id.split(':')[1]][0], geo: true };
  if (sys.kind === 'merc') return { proj: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs', name: 'Web Mercator' };
  if (sys.kind === 'custom') {
    const p = (CV[side + 'Custom'] || '').trim();
    if (!p) throw new Error('Введите строку proj4 для своей системы');
    return { proj: p, name: 'proj4', geo: /\+proj=(longlat|latlong|lonlat)/.test(p) };
  }
  if (sys.kind === 'gk') {
    const dat = id.split(':')[1];
    let z = zoneSel !== 'auto' ? +zoneSel : (ctx.easting != null ? Math.floor(ctx.easting / 1e6) : Math.floor(((ctx.lon % 360) + 360) % 360 / 6) + 1);
    if (!(z >= 1 && z <= 60)) throw new Error('Не удалось определить зону — выберите её вручную');
    const lon0 = 6 * z - 3;
    return { proj: `+proj=tmerc +lat_0=0 +lon_0=${lon0} +k=1 +x_0=${z * 1e6 + 500000} +y_0=0 ${CV_DATUM[dat]} +units=m +no_defs`,
      name: `${dat === 'sk42' ? 'СК-42' : dat === 'sk95' ? 'СК-95' : 'ГСК-2011'} зона ${z}`, zone: z };
  }
  if (sys.kind === 'utm') {
    let z = zoneSel !== 'auto' ? +zoneSel : (ctx.lon != null ? Math.floor((ctx.lon + 180) / 6) + 1 : null);
    if (!z) throw new Error('Для UTM укажите зону (по координатам X/Y её не определить)');
    return { proj: `+proj=utm +zone=${z} +datum=WGS84 +units=m +no_defs`, name: `UTM ${z}N`, zone: z };
  }
  if (sys.kind === 'msk') {
    const reg = CV[side + 'Msk'], datum = CV[side + 'MskDatum'];
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
function cvIsGeo(side) {
  const id = CV[side];
  if (id.startsWith('geo:')) return true;
  if (id === 'custom') return /\+proj=(longlat|latlong|lonlat)/.test(CV[side + 'Custom'] || '');
  return false;
}

// ── Высота: proj4js при смене датума высоту не меняет, поэтому считаем сами ──
// геодезические → геоцентрические (эллипсоид системы) → towgs84 (Position Vector,
// как в PROJ) → WGS-84 → обратно в эллипсоид целевой системы.
const CV_ELLPS = { krass: [6378245, 298.3], WGS84: [6378137, 298.257223563], GRS80: [6378137, 298.257222101] };
function _cvDatumOf(projStr) {
  const g = k => { const m = new RegExp('\\+' + k + '=([^\\s]+)').exec(projStr); return m ? m[1] : null; };
  let a, rf;
  if (/\+datum=WGS84/.test(projStr)) [a, rf] = CV_ELLPS.WGS84;
  else if (g('ellps') && CV_ELLPS[g('ellps')]) [a, rf] = CV_ELLPS[g('ellps')];
  else if (g('a') && g('rf')) { a = +g('a'); rf = +g('rf'); }
  else if (g('a') && g('b')) { a = +g('a'); rf = a / (a - +g('b')); }
  else return null;
  const tw = (g('towgs84') || '0,0,0').split(',').map(Number);
  while (tw.length < 7) tw.push(0);
  return { a, rf, tw };
}
function _cvToEcef(d, lat, lon, h) {
  const f = 1 / d.rf, e2 = f * (2 - f), B = lat * Math.PI / 180, L = lon * Math.PI / 180;
  const N = d.a / Math.sqrt(1 - e2 * Math.sin(B) ** 2);
  return [(N + h) * Math.cos(B) * Math.cos(L), (N + h) * Math.cos(B) * Math.sin(L), (N * (1 - e2) + h) * Math.sin(B)];
}
function _cvFromEcef(d, X, Y, Z) {
  const f = 1 / d.rf, e2 = f * (2 - f), p = Math.hypot(X, Y);
  let B = Math.atan2(Z, p * (1 - e2)), h = 0;
  for (let i = 0; i < 8; i++) {
    const N = d.a / Math.sqrt(1 - e2 * Math.sin(B) ** 2);
    h = p / Math.cos(B) - N;
    B = Math.atan2(Z, p * (1 - e2 * N / (N + h)));
  }
  return h;
}
function _cvHelmert(tw, P, inverse) {
  const k = Math.PI / 648000, [dx, dy, dz] = tw, rx = tw[3] * k, ry = tw[4] * k, rz = tw[5] * k, m = 1 + tw[6] * 1e-6;
  if (!inverse) {
    const [x, y, z] = P;
    return [m * (x - rz * y + ry * z) + dx, m * (rz * x + y - rx * z) + dy, m * (-ry * x + rx * y + z) + dz];
  }
  const x = (P[0] - dx) / m, y = (P[1] - dy) / m, z = (P[2] - dz) / m;
  return [x + rz * y - ry * z, -rz * x + y + rx * z, ry * x - rx * y + z];
}
// h в исходной системе → h в целевой. srcLL/dstLL — [lon,lat] точки в эллипсоидах систем.
function _cvHeight(srcProj, dstProj, srcLL, h) {
  const ds = _cvDatumOf(srcProj), dd = _cvDatumOf(dstProj);
  if (!ds || !dd) return h;
  const Pw = _cvHelmert(ds.tw, _cvToEcef(ds, srcLL[1], srcLL[0], h), false);   // → WGS-84
  const Pd = _cvHelmert(dd.tw, Pw, true);                                       // WGS-84 → цель
  return _cvFromEcef(dd, Pd[0], Pd[1], Pd[2]);
}
// Географическая (lon,lat) точка в эллипсоиде самой системы (без смены датума)
function _cvOwnGeo(projStr, xy) {
  if (/\+proj=(longlat|latlong|lonlat)/.test(projStr)) return xy;
  const geo = projStr.replace(/\+proj=\S+/, '+proj=longlat').replace(/\+(lat_0|lon_0|k|k_0|x_0|y_0|zone|units|lat_ts)=\S+/g, '');
  return proj4(projStr, geo, xy);
}

// Пересчёт одной точки. a,b — для геосистем: широта, долгота; для плоских: X(север), Y(восток).
function cvConvert(a, b, h) {
  const srcGeo = cvIsGeo('src');
  let srcP;
  if (srcGeo) srcP = cvProj('src', { lon: b });
  else srcP = cvProj('src', { easting: b });
  const inXY = srcGeo ? [b, a] : [b, a];       // proj4: [x=восток/долгота, y=север/широта]
  // WGS-84 точки — для авто-зоны цели и для карты
  const w = proj4(srcP.proj, CV_WGS, inXY);
  const dstGeo = cvIsGeo('dst');
  const dstP = cvProj('dst', { lon: w[0] });
  const out = proj4(srcP.proj, dstP.proj, inXY);
  let hOut = isFinite(h) ? h : null;
  if (CV.withH && isFinite(h)) {
    try { hOut = _cvHeight(srcP.proj, dstP.proj, _cvOwnGeo(srcP.proj, inXY), h); } catch (e) { hOut = h; }
  }
  return {
    a: out[1], b: out[0], h: hOut,
    lat: w[1], lon: w[0], srcName: srcP.name, dstName: dstP.name, dstGeo,
  };
}
function cvFmtOut(r) {
  const v = r.dstGeo ? [cvFmtAngle(r.a, CV.angFmt, true), cvFmtAngle(r.b, CV.angFmt, false)]
                     : [r.a.toFixed(CV.dec), r.b.toFixed(CV.dec)];
  return CV.dstSwap ? [v[1], v[0]] : v;
}
// Поменять местами порядок координат (X↔Y, B↔L) у исходной или целевой системы
function cvToggleOrder(side) {
  CV[side + 'Swap'] = !CV[side + 'Swap'];
  _cvSave();
  _cvRefresh();
}

// ── Отрисовка вкладки ──────────────────────────────────────────────────
async function loadCoordConvert() {
  if (typeof loadMskFull === 'function') await loadMskFull();
  renderCoordConvert();
}
function _cvSysBlock(side) {
  const id = CV[side], sys = CV_SYSTEMS.find(s => s.id === id) || CV_SYSTEMS[0];
  const o = (v, l, cur) => `<option value="${escAttr(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
  const st = 'font-size:12px;padding:5px 8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2);width:100%;box-sizing:border-box';
  const ch = `onchange="_cvSet('${side}',this)"`;
  let extra = '';
  if (sys.kind === 'gk' || sys.kind === 'utm') {
    extra += `<div class="cv-row"><label>Зона</label><select data-f="Zone" ${ch} style="${st}">${o('auto', 'Авто (по долготе / по Y)', CV[side + 'Zone'])}${Array.from({ length: 60 }, (_, i) => o(i + 1, `${i + 1}${sys.kind === 'gk' ? ` (ЦМ ${6 * (i + 1) - 3}°)` : 'N'}`, CV[side + 'Zone'])).join('')}</select></div>`;
  }
  if (sys.kind === 'msk') {
    const regs = Object.keys((MSK_FULL && MSK_FULL.regions) || {}).sort();
    const zones = ((MSK_FULL && MSK_FULL.regions && MSK_FULL.regions[CV[side + 'Msk']]) || []);
    extra += `<div class="cv-row"><label>Регион</label><select data-f="Msk" ${ch} style="${st}">${regs.map(r => o(r, `МСК-${r}${CV_REGION_NAMES[r] ? ' — ' + CV_REGION_NAMES[r] : ''}`, CV[side + 'Msk'])).join('')}</select></div>
      <div class="cv-row"><label>Зона</label><select data-f="Zone" ${ch} style="${st}">${o('auto', 'Авто (по долготе / по Y)', CV[side + 'Zone'])}${zones.map(z => o(z.z, `${z.z} (ЦМ ${z.lon}°)`, CV[side + 'Zone'])).join('')}</select></div>
      <div class="cv-row"><label>Реализация</label><select data-f="MskDatum" ${ch} style="${st}">${o('2008', '2008 (ГОСТ Р 51794-2008)', CV[side + 'MskDatum'])}${o('2001', '2001 (ГОСТ Р 51794-2001)', CV[side + 'MskDatum'])}</select></div>`;
  }
  if (sys.kind === 'custom') {
    extra += `<div class="cv-row"><label>proj4</label><textarea data-f="Custom" onchange="_cvSet('${side}',this)" style="${st};min-height:54px;font-family:monospace;font-size:11px" placeholder="+proj=tmerc +lat_0=0 +lon_0=… +ellps=krass +towgs84=… +units=m +no_defs">${esc(CV[side + 'Custom'] || '')}</textarea></div>`;
  }
  const ord = _cvLabels(side).map(l => l.split(' ')[0]).join(', ');
  return `<div class="cv-card">
    <div class="cv-card-hd">${side === 'src' ? '📥 Исходная система' : '📤 Целевая система'}</div>
    <div class="cv-row"><label>Система</label><select data-f="" ${ch} style="${st}">${CV_SYSTEMS.map(s => o(s.id, s.label, id)).join('')}</select></div>
    ${extra}
    <div class="cv-row"><label>Порядок</label><div style="display:flex;gap:8px;align-items:center">
      <button class="btn bs bsm" onclick="cvToggleOrder('${side}')" title="Поменять местами ${cvIsGeo(side) ? 'широту и долготу' : 'X и Y'} ${side === 'src' ? 'во входных данных' : 'в результате'}">⇄ ${esc(ord)}</button>
      ${CV[side + 'Swap'] ? `<span style="font-size:10px;color:var(--warn,#a16207);font-weight:700">порядок изменён</span>` : ''}
    </div></div>
  </div>`;
}
function _cvSet(side, el) {
  const f = el.dataset.f;
  if (f === '') { CV[side] = el.value; CV[side + 'Zone'] = 'auto'; }
  else if (f === 'Msk') { CV[side + 'Msk'] = el.value; CV[side + 'Zone'] = 'auto'; }
  else CV[side + f] = el.value;
  _cvSave();
  renderCoordConvert(true);
}
function cvSwap() {
  ['', 'Zone', 'Msk', 'MskDatum', 'Custom', 'Swap'].forEach(f => { const t = CV['src' + f]; CV['src' + f] = CV['dst' + f]; CV['dst' + f] = t; });
  // перенести результат одиночного пересчёта во вход
  const ra = document.getElementById('cv-out-a'), rb = document.getElementById('cv-out-b');
  const ia = document.getElementById('cv-in-a'), ib = document.getElementById('cv-in-b');
  const keep = ra && ra.dataset.raw && ia ? [ra.dataset.raw, rb.dataset.raw] : null;
  _cvSave();
  renderCoordConvert(true);
  if (keep) {
    const k = CV.srcSwap ? [keep[1], keep[0]] : keep;   // во вход — в порядке полей новой исходной системы
    document.getElementById('cv-in-a').value = k[0]; document.getElementById('cv-in-b').value = k[1]; cvOne();
  }
}
function _cvPh() {
  const p = cvIsGeo('src') ? ["61.123456 или 61°07'24.4\"", "72.123456 или 72°07'24.4\""] : ['6 789 012.345', '3 456 789.012'];
  return CV.srcSwap ? [p[1], p[0]] : p;
}
function _cvPhBatch() {
  const r = cvIsGeo('src') ? [['61.123456', '72.123456'], ["61°07'24.4\"", "72°07'24.4\""]] : [['6789012.345', '3456789.012'], ['6789100.000', '3456900.000']];
  return r.map((v, i) => `т${i + 1}\t` + (CV.srcSwap ? [v[1], v[0]] : v).join('\t')).join('\n');
}
function _cvLabels(side) {
  const l = cvIsGeo(side) ? ['Широта (B)', 'Долгота (L)'] : ['X (север)', 'Y (восток)'];
  return CV[side + 'Swap'] ? [l[1], l[0]] : l;
}

function renderCoordConvert(keepInputs) {
  const pg = document.getElementById('conv-page'); if (!pg) return;
  const prev = keepInputs ? {
    a: document.getElementById('cv-in-a')?.value, b: document.getElementById('cv-in-b')?.value, h: document.getElementById('cv-in-h')?.value,
    batch: document.getElementById('cv-batch')?.value,
  } : {};
  const [la, lb] = _cvLabels('src'), [oa, ob] = _cvLabels('dst');
  const o = (v, l, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`;
  const inSt = 'font-size:13px;padding:6px 9px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s);width:100%;box-sizing:border-box;font-family:monospace';
  pg.innerHTML = `
  <div class="wt-toolbar" style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1.5px solid var(--bd);flex-wrap:wrap">
    <span style="font-size:14px;font-weight:800">🧭 Пересчёт координат</span>
    <span style="font-size:10px;color:var(--tx3)">WGS-84 · ПЗ-90.11 · ГСК-2011 · СК-42 · СК-95 · МСК · UTM</span>
    <span style="flex:1"></span>
    <div class="mch-view-toggle">
      <button class="btn bsm ${CV.mode === 'one' ? 'bp' : 'bs'}" onclick="CV.mode='one';_cvSave();renderCoordConvert(true)">📍 Одна точка</button>
      <button class="btn bsm ${CV.mode === 'batch' ? 'bp' : 'bs'}" onclick="CV.mode='batch';_cvSave();renderCoordConvert(true)">📋 Список точек</button>
    </div>
  </div>
  <div class="cv-body">
    <div class="cv-systems">
      ${_cvSysBlock('src')}
      <button class="btn bs cv-swap" onclick="cvSwap()" title="Поменять местами исходную и целевую систему">⇄</button>
      ${_cvSysBlock('dst')}
    </div>
    <div class="cv-opts">
      <label>Углы на выходе: <select onchange="CV.angFmt=this.value;_cvSave();_cvRefresh()" style="font-size:11px;padding:2px 4px">
        ${o('dd', 'градусы (61.12345678)', CV.angFmt)}${o('dm', 'град. мин (61°07.40741\')', CV.angFmt)}${o('dms', 'град. мин. сек (61°07\'24.4444")', CV.angFmt)}</select></label>
      <label>Метры: <select onchange="CV.dec=+this.value;_cvSave();_cvRefresh()" style="font-size:11px;padding:2px 4px">
        ${[0, 1, 2, 3, 4].map(d => o(d, d + ' зн.', CV.dec)).join('')}</select></label>
      <label style="display:inline-flex;gap:5px;align-items:center;cursor:pointer"><input type="checkbox" ${CV.withH ? 'checked' : ''} onchange="CV.withH=this.checked;_cvSave();_cvRefresh()" style="width:auto;margin:0">
        пересчитывать высоту <span style="color:var(--tx3)" title="Пересчитывается эллипсоидальная (геодезическая) высота при смене датума. Нормальные высоты (БСВ) и геоид не учитываются.">ⓘ</span></label>
    </div>
    ${CV.mode === 'one' ? `
    <div class="cv-card">
      <div class="cv-card-hd">Координаты точки</div>
      <div class="cv-grid">
        <div><label>${la}</label><input id="cv-in-a" style="${inSt}" placeholder="${esc(_cvPh()[0])}" onkeydown="if(event.key==='Enter')cvOne()"></div>
        <div><label>${lb}</label><input id="cv-in-b" style="${inSt}" placeholder="${esc(_cvPh()[1])}" onkeydown="if(event.key==='Enter')cvOne()"></div>
        <div style="${CV.withH ? '' : 'display:none'}"><label>H, м</label><input id="cv-in-h" style="${inSt}" placeholder="0" onkeydown="if(event.key==='Enter')cvOne()"></div>
        <div style="align-self:end;display:flex;gap:6px"><button class="btn bp" onclick="cvOne()">Пересчитать →</button></div>
      </div>
      <div id="cv-one-res" class="cv-res"></div>
    </div>` : `
    <div class="cv-card">
      <div class="cv-card-hd">Список точек
        <span style="font-weight:400;color:var(--tx3);font-size:10px;margin-left:6px">по строке на точку: [имя] ${la.split(' ')[0]} ${lb.split(' ')[0]}${CV.withH ? ' [H]' : ''} · разделитель: Tab (из Excel), «;» или пробел</span>
      </div>
      <textarea id="cv-batch" style="${inSt};min-height:170px;font-size:12px" placeholder="${esc(_cvPhBatch())}"></textarea>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">
        <button class="btn bp" onclick="cvBatch()">Пересчитать список →</button>
        <label class="btn bs" style="cursor:pointer">📂 Из файла (CSV, TXT, XLSX)<input type="file" accept=".csv,.txt,.xlsx,.xls" style="display:none" onchange="cvLoadFile(this)"></label>
        <button class="btn bs" onclick="document.getElementById('cv-batch').value='';CV.results=[];_cvRenderBatch()">Очистить</button>
      </div>
      <div id="cv-batch-res" style="margin-top:10px"></div>
    </div>`}
    <div class="cv-note">Точность: СК-42, СК-95, МСК — параметры ГОСТ Р 51794-2008, ГСК-2011 и ПЗ-90.11 — ГОСТ 32453-2017 (ошибка трансформации до 0,2–0,5 м, как в справочных системах).
      МСК — параметры зон из базы Trimble (Russia/MSK). Высота — только эллипсоидальная.</div>
  </div>`;
  if (keepInputs) {
    if (prev.a != null && document.getElementById('cv-in-a')) { document.getElementById('cv-in-a').value = prev.a; document.getElementById('cv-in-b').value = prev.b; if (document.getElementById('cv-in-h')) document.getElementById('cv-in-h').value = prev.h || ''; }
    if (prev.batch != null && document.getElementById('cv-batch')) document.getElementById('cv-batch').value = prev.batch;
  }
  if (CV.mode === 'batch') _cvRenderBatch();
}
function _cvRefresh() {
  renderCoordConvert(true);
  if (CV.mode === 'one') { if (document.getElementById('cv-in-a')?.value) cvOne(); }
  else if (CV.results.length) cvBatch();
}

function _cvReadAB(a, b) {
  if (CV.srcSwap) [a, b] = [b, a];   // поля в обратном порядке → внутренний порядок (север/широта, восток/долгота)
  if (cvIsGeo('src')) return [cvParseAngle(a), cvParseAngle(b)];
  return [cvParseNum(a), cvParseNum(b)];
}

// ── Одна точка ─────────────────────────────────────────────────────────
function cvOne() {
  const box = document.getElementById('cv-one-res'); if (!box) return;
  const [a, b] = _cvReadAB(document.getElementById('cv-in-a').value, document.getElementById('cv-in-b').value);
  const h = cvParseNum(document.getElementById('cv-in-h')?.value);
  if (!isFinite(a) || !isFinite(b)) { box.innerHTML = `<div style="color:var(--red);font-size:12px">Введите обе координаты (числа или градусы/минуты/секунды)</div>`; return; }
  try {
    const r = cvConvert(a, b, h);
    const [fa, fb] = cvFmtOut(r);
    const [oa, ob] = _cvLabels('dst');
    window._cvLastCopy = fa + '\t' + fb + (r.h != null ? '\t' + (+r.h).toFixed(3) : '');
    const rawA = r.dstGeo ? r.a.toFixed(8) : r.a.toFixed(CV.dec), rawB = r.dstGeo ? r.b.toFixed(8) : r.b.toFixed(CV.dec);
    box.innerHTML = `
      <div class="cv-out">
        <div class="cv-out-sys">${esc(r.srcName)} → <b>${esc(r.dstName)}</b></div>
        <div class="cv-out-grid">
          <div><span>${oa}</span><b id="cv-out-a" data-raw="${rawA}">${fa}</b></div>
          <div><span>${ob}</span><b id="cv-out-b" data-raw="${rawB}">${fb}</b></div>
          ${r.h != null ? `<div><span>H, м</span><b>${(+r.h).toFixed(3)}</b></div>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          <button class="btn bs bsm" onclick="cvCopy(window._cvLastCopy)">📋 Копировать</button>
          <button class="btn bs bsm" onclick="cvShowOnMap([{name:'Точка',lat:${r.lat},lon:${r.lon}}])">🗺 Показать на карте</button>
          <button class="btn bs bsm" onclick="cvAllSystems(${r.lat},${r.lon})">🌐 Во всех системах</button>
        </div>
        <div style="font-size:10px;color:var(--tx3);margin-top:6px">WGS-84: ${r.lat.toFixed(7)}, ${r.lon.toFixed(7)}</div>
      </div>
      <div id="cv-all"></div>`;
  } catch (e) { box.innerHTML = `<div style="color:var(--red);font-size:12px">⚠️ ${esc(e.message || String(e))}</div>`; }
}
// Таблица «точка во всех основных системах»
function cvAllSystems(lat, lon) {
  const box = document.getElementById('cv-all'); if (!box) return;
  const rows = [];
  const add = (name, proj, geo) => {
    try {
      const p = proj4(CV_WGS, proj, [lon, lat]);
      rows.push([name, geo ? cvFmtAngle(p[1], CV.angFmt) : p[1].toFixed(CV.dec), geo ? cvFmtAngle(p[0], CV.angFmt) : p[0].toFixed(CV.dec)]);
    } catch (e) {}
  };
  Object.entries(CV_GEO).forEach(([k, [n, p]]) => add(n + ' (B, L)', p, true));
  const z = Math.floor(lon / 6) + 1;
  [['sk42', 'СК-42'], ['sk95', 'СК-95'], ['gsk', 'ГСК-2011']].forEach(([d, n]) =>
    add(`${n} ГК, зона ${z} (X, Y)`, `+proj=tmerc +lat_0=0 +lon_0=${6 * z - 3} +k=1 +x_0=${z * 1e6 + 500000} +y_0=0 ${CV_DATUM[d]} +units=m +no_defs`, false));
  // МСК — регионы, выбранные в исходной/целевой системе (зона — ближайшая по долготе)
  const regs = (MSK_FULL && MSK_FULL.regions) || {};
  [...new Set([CV.srcMsk, CV.dstMsk])].filter(r => regs[r]).forEach(r => {
    let best = null, bd = Infinity;
    regs[r].forEach(zz => { const d = Math.abs(zz.lon - lon); if (d < bd) { bd = d; best = zz; } });
    if (best) {
      const tw = MSK_FULL.datums['2008'];
      add(`МСК-${r} зона ${best.z}${CV_REGION_NAMES[r] ? ' — ' + CV_REGION_NAMES[r] : ''} (X, Y)`,
        `+proj=tmerc +lat_0=0 +lon_0=${best.lon} +k=1 +x_0=${best.x0} +y_0=${best.y0} +ellps=krass +towgs84=${tw.join(',')} +units=m +no_defs`, false);
    }
  });
  const uz = Math.floor((lon + 180) / 6) + 1;
  add(`UTM ${uz}N (N, E)`, `+proj=utm +zone=${uz} +datum=WGS84 +units=m +no_defs`, false);
  box.innerHTML = `<div style="margin-top:10px;max-height:340px;overflow:auto;border:1.5px solid var(--bd);border-radius:var(--rs)">
    <table class="wt-tbl"><thead><tr><th class="no-sort">Система</th><th class="no-sort">B / X</th><th class="no-sort">L / Y</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td style="font-family:monospace">${r[1]}</td><td style="font-family:monospace">${r[2]}</td></tr>`).join('')}</tbody></table></div>
    <div style="font-size:10px;color:var(--tx3);margin-top:4px">МСК показана для регионов, выбранных выше (исходная и целевая система).</div>`;
}

// ── Список точек ───────────────────────────────────────────────────────
function _cvSplitLine(line, delim) {
  if (delim === 'tab') return line.split('\t');
  if (delim === ';') return line.split(';');
  if (delim === ',') return line.split(',');
  // пробелы: градусы с символами ° ' " держим вместе
  return line.trim().split(/\s+/);
}
function _cvDetectDelim(text) {
  if (text.includes('\t')) return 'tab';
  if (text.includes(';')) return ';';
  // «1.23,4.56» — запятая как разделитель полей (точка — десятичная)
  if (/\d\.\d+\s*,\s*-?\d/.test(text)) return ',';
  return 'space';
}
function cvBatch() {
  const ta = document.getElementById('cv-batch'); if (!ta) return;
  const text = ta.value.replace(/\r/g, '');
  const delim = _cvDetectDelim(text);
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    let f = _cvSplitLine(line, delim).map(x => x.trim());
    if (delim === 'space') f = f.filter(Boolean);
    // имя — если первое поле не число/угол
    // имя точки: лишнее первое поле (имена из одних цифр тоже допустимы) или нечисловое первое поле
    let name = '';
    const looksNum = s => isFinite(cvIsGeo('src') ? cvParseAngle(s) : cvParseNum(s));
    const need = CV.withH ? 3 : 2;
    if (f.length > need || (f.length && !looksNum(f[0]))) { name = f.shift(); }
    if (f.length < 2) { out.push({ line: i + 1, name, err: 'мало значений' }); return; }
    const [a, b] = _cvReadAB(f[0], f[1]);
    const h = f.length > 2 ? cvParseNum(f[2]) : NaN;
    if (!isFinite(a) || !isFinite(b)) { if (i === 0) return; out.push({ line: i + 1, name, inA: f[0], inB: f[1], err: 'не распознано' }); return; } // 1-я строка — возможно заголовок
    try { const r = cvConvert(a, b, h); out.push({ line: i + 1, name: name || String(out.length + 1), inA: f[0], inB: f[1], inH: f[2] || '', ...r }); }
    catch (e) { out.push({ line: i + 1, name, inA: f[0], inB: f[1], err: e.message || String(e) }); }
  });
  CV.results = out;
  _cvRenderBatch();
}
function _cvRenderBatch() {
  const box = document.getElementById('cv-batch-res'); if (!box) return;
  const res = CV.results || [];
  if (!res.length) { box.innerHTML = ''; return; }
  const ok = res.filter(r => !r.err);
  const [ia, ib] = _cvLabels('src'), [oa, ob] = _cvLabels('dst');
  const hasH = ok.some(r => r.h != null);
  box.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
      <span style="font-size:12px">Пересчитано: <b>${ok.length}</b>${res.length > ok.length ? ` · <span style="color:var(--red)">ошибок: ${res.length - ok.length}</span>` : ''}</span>
      ${ok[0] ? `<span style="font-size:11px;color:var(--tx3)">${esc(ok[0].srcName)} → <b>${esc(ok[0].dstName)}</b></span>` : ''}
      <span style="flex:1"></span>
      <button class="btn bs bsm" onclick="cvCopyBatch()">📋 Копировать (для Excel)</button>
      <button class="btn bs bsm" onclick="cvExport('xlsx')">📤 Excel</button>
      <button class="btn bs bsm" onclick="cvExport('csv')">📤 CSV</button>
      <button class="btn bs bsm" onclick="cvExport('txt')">📤 TXT</button>
      <button class="btn bs bsm" onclick="cvExport('kml')">📤 KML</button>
      <button class="btn bs bsm" onclick="cvShowOnMap(CV.results.filter(r=>!r.err))">🗺 На карту</button>
      <button class="btn bs bsm" onclick="cvSaveLayer()">💾 В слой карты</button>
    </div>
    <div style="max-height:420px;overflow:auto;border:1.5px solid var(--bd);border-radius:var(--rs)">
    <table class="wt-tbl" id="cv-res-tbl"><thead><tr>
      <th class="no-sort" style="width:34px">#</th><th class="no-sort">Имя</th>
      <th class="no-sort">${ia}</th><th class="no-sort">${ib}</th>
      <th class="no-sort" style="border-left:2px solid var(--acc)">${oa}</th><th class="no-sort">${ob}</th>${hasH ? '<th class="no-sort">H, м</th>' : ''}
      <th class="no-sort">Зона / система</th>
    </tr></thead><tbody>
    ${res.map((r, i) => {
      if (r.err) return `<tr><td>${r.line}</td><td>${esc(r.name || '')}</td><td>${esc(r.inA || '')}</td><td>${esc(r.inB || '')}</td><td colspan="${hasH ? 4 : 3}" style="color:var(--red)">⚠️ ${esc(r.err)}</td></tr>`;
      const [fa, fb] = cvFmtOut(r);
      return `<tr><td style="color:var(--tx3)">${i + 1}</td><td>${esc(r.name)}</td><td style="font-family:monospace;color:var(--tx2)">${esc(r.inA)}</td><td style="font-family:monospace;color:var(--tx2)">${esc(r.inB)}</td>
        <td style="font-family:monospace;font-weight:700;border-left:2px solid var(--acc)">${fa}</td><td style="font-family:monospace;font-weight:700">${fb}</td>${hasH ? `<td style="font-family:monospace">${r.h != null ? (+r.h).toFixed(3) : ''}</td>` : ''}
        <td style="font-size:10px;color:var(--tx3)">${esc(r.dstName)}</td></tr>`;
    }).join('')}
    </tbody></table></div>`;
}
function cvLoadFile(input) {
  const file = input.files[0]; if (!file) return;
  input.value = '';
  const ext = file.name.toLowerCase().split('.').pop();
  const put = txt => { const ta = document.getElementById('cv-batch'); if (ta) { ta.value = txt; cvBatch(); } };
  const rd = new FileReader();
  if (ext === 'xlsx' || ext === 'xls') {
    rd.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
        put(rows.filter(r => r.some(c => String(c).trim())).map(r => r.map(c => String(c).trim()).join('\t')).join('\n'));
      } catch (err) { toast('Ошибка чтения Excel: ' + err.message, 'err'); }
    };
    rd.readAsArrayBuffer(file);
  } else {
    rd.onload = e => {
      let t = e.target.result;
      // Windows-1251, если UTF-8 не распознался
      if (/�/.test(t)) { const r2 = new FileReader(); r2.onload = ev => put(ev.target.result); r2.readAsText(file, 'windows-1251'); return; }
      put(t);
    };
    rd.readAsText(file, 'utf-8');
  }
}

// ── Копирование / экспорт ──────────────────────────────────────────────
function cvCopy(text) {
  const t = String(text || '');
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Скопировано', 'ok')).catch(() => {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Скопировано', 'ok'); } catch (e) {} ta.remove();
  });
}
function _cvRows(withHeader, sep) {
  const ok = (CV.results || []).filter(r => !r.err);
  const [oa, ob] = _cvLabels('dst');
  const hasH = ok.some(r => r.h != null);
  const rows = ok.map(r => { const [fa, fb] = cvFmtOut(r); return [r.name, fa, fb, ...(hasH ? [r.h != null ? (+r.h).toFixed(3) : ''] : [])]; });
  if (withHeader) rows.unshift(['Имя', oa, ob, ...(hasH ? ['H'] : [])]);
  return rows;
}
function cvCopyBatch() { cvCopy(_cvRows(false).map(r => r.join('\t')).join('\n')); }
function cvExport(fmt) {
  const ok = (CV.results || []).filter(r => !r.err);
  if (!ok.length) { toast('Нет пересчитанных точек', 'warn'); return; }
  const day = new Date().toISOString().slice(0, 10);
  const sysName = (ok[0].dstName || '').replace(/[^\wА-Яа-яЁё\-]+/g, '_');
  const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };
  if (fmt === 'xlsx') {
    const ws = XLSX.utils.aoa_to_sheet([[`Пересчёт: ${ok[0].srcName} → ${ok[0].dstName}`], ..._cvRows(true)]);
    ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 10 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Координаты');
    XLSX.writeFile(wb, `Пересчёт_${sysName}_${day}.xlsx`);
  } else if (fmt === 'csv') {
    dl(new Blob(['﻿' + _cvRows(true).map(r => r.join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), `Пересчёт_${sysName}_${day}.csv`);
  } else if (fmt === 'txt') {
    dl(new Blob([_cvRows(false).map(r => r.join('\t')).join('\r\n')], { type: 'text/plain;charset=utf-8' }), `Пересчёт_${sysName}_${day}.txt`);
  } else if (fmt === 'kml') {
    const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Пересчёт ${x(day)}</name>\n` +
      ok.map(r => { const [fa, fb] = cvFmtOut(r); return `<Placemark><name>${x(r.name)}</name><description>${x(r.dstName)}: ${x(fa)}; ${x(fb)}</description><Point><coordinates>${r.lon.toFixed(8)},${r.lat.toFixed(8)},0</coordinates></Point></Placemark>`; }).join('\n') +
      `\n</Document></kml>`;
    dl(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), `Пересчёт_${day}.kml`);
  }
}

// ── Карта ──────────────────────────────────────────────────────────────
let _cvMapLayer = null;
function cvShowOnMap(pts) {
  pts = (pts || []).filter(p => isFinite(p.lat) && isFinite(p.lon));
  if (!pts.length) { toast('Нет точек', 'warn'); return; }
  switchView('map');
  setTimeout(() => {
    if (typeof map === 'undefined' || !map) return;
    if (_cvMapLayer) { map.removeLayer(_cvMapLayer); _cvMapLayer = null; }
    _cvMapLayer = L.layerGroup().addTo(map);
    pts.forEach(p => {
      L.circleMarker([p.lat, p.lon], { radius: 6, color: '#dc2626', weight: 2, fillColor: '#fca5a5', fillOpacity: .9 })
        .bindTooltip(esc(p.name || ''), { permanent: pts.length <= 50, direction: 'right', className: 'cv-tip' })
        .bindPopup(`<b>${esc(p.name || '')}</b><br>WGS-84: ${p.lat.toFixed(7)}, ${p.lon.toFixed(7)}<br><a href="#" onclick="cvClearMap();return false">Убрать точки пересчёта</a>`)
        .addTo(_cvMapLayer);
    });
    if (pts.length === 1) map.setView([pts[0].lat, pts[0].lon], Math.max(map.getZoom(), 14));
    else map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lon])).pad(0.2));
    toast(`На карте: ${pts.length} т. (щёлкните точку → «Убрать»)`, 'ok');
  }, 150);
}
function cvClearMap() { if (_cvMapLayer && map) { map.removeLayer(_cvMapLayer); _cvMapLayer = null; } }
async function cvSaveLayer() {
  const ok = (CV.results || []).filter(r => !r.err);
  if (!ok.length) { toast('Нет пересчитанных точек', 'warn'); return; }
  const name = prompt('Название слоя', `Пересчёт ${new Date().toLocaleDateString('ru-RU')}`);
  if (!name) return;
  const gj = { type: 'FeatureCollection', features: ok.map(r => { const [fa, fb] = cvFmtOut(r); return {
    type: 'Feature', geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
    properties: { name: r.name, description: `${r.dstName}: ${fa}; ${fb}` } }; }) };
  try {
    const r = await fetch(`${API}/layers`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, geojson: JSON.stringify(gj), color: '#dc2626', symbol: '', group_id: '', line_dash: 'solid' }) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    if (typeof loadAll === 'function') await loadAll();
    if (typeof renderKmlPanel === 'function') renderKmlPanel();
    toast(`Слой «${name}» сохранён (${ok.length} т.)`, 'ok');
  } catch (e) { toast('Не удалось сохранить слой: ' + e.message, 'err'); }
}
