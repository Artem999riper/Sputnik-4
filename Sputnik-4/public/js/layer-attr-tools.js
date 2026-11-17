// ═══════════════════════════════════════════════════════════
// layer-attr-tools.js — инструменты таблицы атрибутов (кнопка «🛠 Инструменты»
// и ПКМ по заголовку столбца):
//   • 🧮 Вычислить поле по формуле: [глубина] * 2, "Скв-" + [Номер], round(area/10000, 2)…
//   • № Нумерация: шаблон «Скв-{n}», старт/шаг/нули, порядок — как в таблице,
//     с севера на юг, с запада на восток, вдоль линии;
//   • 🔎 Найти и заменить в столбце (часть значения или целиком, пустые — тоже);
//   • 🧩 Шаблон полей слоя: новые объекты сразу получают эти поля
//     (style_json.fieldTpl = [{k, v}]).
// Действуют на выделенные строки, а без выделения — на все показанные (с поиском и фильтрами).
// Сводная строка «Σ» внизу таблицы — в layer-attr.js (_katFootHtml).
// ═══════════════════════════════════════════════════════════

// ── область действия: выделенные или показанные (все, не только первые KAT.max) ──
function _katScope() {
  const sel = _katSelIdx();
  if (sel.length) return { idxs: sel, what: `выделенные (${sel.length})` };
  const all = (KAT._allOrder || KAT.order || []).slice();
  return { idxs: all, what: `все показанные (${all.length})` };
}
const _katFieldsOf = l => kmlFields(l).filter(k => !k.startsWith('_'));
const _katDl = (id, l) => `<datalist id="${id}">${_katFieldsOf(l).map(f => `<option value="${escAttr(f)}">`).join('')}</datalist>`;

// ── геометрия: представительная точка, длина, площадь, периметр ──
function _katGeomInfo(f) {
  const g = f && f.geometry; const r = { x: null, y: null, area: 0, length: 0, perimeter: 0 };
  if (!g) return r;
  const ll = c => ({ lat: c[1], lng: c[0] });
  const pts = []; const walk = c => { if (typeof c[0] === 'number') pts.push(c); else c.forEach(walk); }; try { walk(g.coordinates); } catch (e) {}
  if (pts.length) { r.x = pts.reduce((s, p) => s + p[0], 0) / pts.length; r.y = pts.reduce((s, p) => s + p[1], 0) / pts.length; }
  try {
    const len = c => typeof _geoLength === 'function' ? _geoLength(c.map(ll)) : 0;
    const ar = c => typeof _geoArea === 'function' ? _geoArea(c.slice(0, -1).map(ll)) : 0;
    if (g.type === 'LineString') r.length = len(g.coordinates);
    else if (g.type === 'MultiLineString') g.coordinates.forEach(c => r.length += len(c));
    else if (/Polygon/.test(g.type)) (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(p => { r.area += Math.max(0, ar(p[0]) - p.slice(1).reduce((s, h) => s + ar(h), 0)); r.perimeter += len(p[0]); });
  } catch (e) {}
  return r;
}

// ═══ Формулы: маленький безопасный разборщик выражений (без eval) ═══
const KAT_FN = {
  round: (x, n) => { const k = Math.pow(10, +n || 0); return Math.round(_katN(x) * k) / k; },
  floor: x => Math.floor(_katN(x)), ceil: x => Math.ceil(_katN(x)), abs: x => Math.abs(_katN(x)), sqrt: x => Math.sqrt(_katN(x)),
  min: (...a) => Math.min(...a.map(_katN)), max: (...a) => Math.max(...a.map(_katN)),
  if: (c, a, b) => (c && c !== '0' ? a : (b == null ? '' : b)), 'если': (c, a, b) => (c && c !== '0' ? a : (b == null ? '' : b)),
  len: s => String(s ?? '').length, upper: s => String(s ?? '').toUpperCase(), lower: s => String(s ?? '').toLowerCase(), trim: s => String(s ?? '').trim(),
  left: (s, n) => String(s ?? '').slice(0, +n || 0), right: (s, n) => { const t = String(s ?? ''); return +n ? t.slice(-n) : ''; },
  replace: (s, a, b) => String(s ?? '').split(String(a ?? '')).join(String(b ?? '')),
  num: s => _katN(s), text: x => String(x ?? ''), pad: (x, n) => String(x ?? '').padStart(+n || 0, '0'),
  coalesce: (...a) => { const v = a.find(x => x != null && x !== ''); return v == null ? '' : v; },
};
const KAT_FN_HELP = 'round(x;n) floor ceil abs sqrt min max if(условие;да;нет) len upper lower trim left(s;n) right(s;n) replace(s;что;на что) num text pad(x;n) coalesce(a;b…)';
function _katN(v) { if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0; const n = _kaNum(v); return Number.isFinite(n) ? n : NaN; }
function _katCompile(src) {
  const s = String(src || ''); let p = 0;
  const T = [];   // токены
  while (p < s.length) {
    const c = s[p];
    if (/\s/.test(c)) { p++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[p + 1] || ''))) { const m = s.slice(p).match(/^\d*\.?\d+(e[-+]?\d+)?/i); T.push({ t: 'num', v: parseFloat(m[0]) }); p += m[0].length; continue; }
    if (c === '"' || c === "'" || c === '«') { const end = c === '«' ? '»' : c; const j = s.indexOf(end, p + 1); if (j < 0) throw new Error('не закрыта кавычка'); T.push({ t: 'str', v: s.slice(p + 1, j) }); p = j + 1; continue; }
    if (c === '[') { const j = s.indexOf(']', p + 1); if (j < 0) throw new Error('не закрыта скобка ]'); T.push({ t: 'fld', v: s.slice(p + 1, j).trim() }); p = j + 1; continue; }
    const id = s.slice(p).match(/^[A-Za-zА-Яа-яЁё_][\wА-Яа-яЁё]*/);
    if (id) { T.push({ t: 'id', v: id[0] }); p += id[0].length; continue; }
    const op = s.slice(p).match(/^(==|!=|<>|<=|>=|&&|\|\||[-+*/%(),;<>=!&])/);
    if (op) { T.push({ t: 'op', v: op[0] }); p += op[0].length; continue; }
    throw new Error(`непонятный символ «${c}»`);
  }
  let i = 0;
  const peek = v => T[i] && T[i].t === 'op' && (v == null || T[i].v === v);
  const eat = v => { if (!peek(v)) throw new Error(`ожидалось «${v}»`); i++; };
  const used = new Set();
  const bin = (a, b, f) => ctx => f(a(ctx), b(ctx));
  const num2 = f => (x, y) => { const a = _katN(x), b = _katN(y); return Number.isFinite(a) && Number.isFinite(b) ? f(a, b) : ''; };
  const cmpV = (x, y) => { const a = _katN(x), b = _katN(y); if (Number.isFinite(a) && Number.isFinite(b)) return a - b; return String(x ?? '').localeCompare(String(y ?? ''), 'ru'); };
  function primary() {
    const t = T[i++]; if (!t) throw new Error('выражение оборвано');
    if (t.t === 'num' || t.t === 'str') return () => t.v;
    if (t.t === 'fld') { used.add(t.v); return ctx => ctx.p[t.v]; }
    if (t.t === 'op' && t.v === '(') { const e = or(); eat(')'); return e; }
    if (t.t === 'id') {
      const nm = t.v, lo = nm.toLowerCase();
      if (peek('(')) {
        i++; const args = [];
        if (!peek(')')) { args.push(or()); while (peek(',') || peek(';')) { i++; args.push(or()); } }
        eat(')');
        const fn = KAT_FN[lo]; if (!fn) throw new Error(`нет функции ${nm}()`);
        return ctx => fn(...args.map(a => a(ctx)));
      }
      const vars = { n: c => c.n, i: c => c.i, x: c => c.g().x, lon: c => c.g().x, y: c => c.g().y, lat: c => c.g().y,
        area: c => c.g().area, 'площадь': c => c.g().area, length: c => c.g().length, 'длина': c => c.g().length, perimeter: c => c.g().perimeter, 'периметр': c => c.g().perimeter };
      if (vars[lo] && !(nm in (KAT._calcFields || {}))) return vars[lo];
      used.add(nm); return ctx => ctx.p[nm];
    }
    throw new Error(`неожиданное «${t.v}»`);
  }
  function unary() {
    if (peek('-')) { i++; const a = unary(); return ctx => -_katN(a(ctx)); }
    if (peek('!')) { i++; const a = unary(); return ctx => !a(ctx); }
    if (peek('+')) { i++; return unary(); }
    return primary();
  }
  function mul() { let a = unary(); while (peek('*') || peek('/') || peek('%')) { const o = T[i++].v, b = unary(); a = bin(a, b, num2(o === '*' ? (x, y) => x * y : o === '/' ? (x, y) => y === 0 ? '' : x / y : (x, y) => x % y)); } return a; }
  function add() {
    let a = mul();
    while (peek('+') || peek('-')) {
      const o = T[i++].v, b = mul();
      a = o === '+' ? bin(a, b, (x, y) => { const p = _katN(x), q = _katN(y); return (x !== '' && y !== '' && x != null && y != null && Number.isFinite(p) && Number.isFinite(q)) ? p + q : String(x ?? '') + String(y ?? ''); })
        : bin(a, b, num2((x, y) => x - y));
    }
    return a;
  }
  function cmp() {
    let a = add();
    while (peek('==') || peek('=') || peek('!=') || peek('<>') || peek('<') || peek('<=') || peek('>') || peek('>=')) {
      const o = T[i++].v, b = add();
      const f = { '==': d => d === 0, '=': d => d === 0, '!=': d => d !== 0, '<>': d => d !== 0, '<': d => d < 0, '<=': d => d <= 0, '>': d => d > 0, '>=': d => d >= 0 }[o];
      a = bin(a, b, (x, y) => f(cmpV(x, y)));
    }
    return a;
  }
  function and() { let a = cmp(); while (peek('&&') || (T[i] && T[i].t === 'id' && /^(и|and)$/i.test(T[i].v))) { i++; const b = cmp(); const A = a; a = ctx => !!(A(ctx) && b(ctx)); } return a; }
  function or() { let a = and(); while (peek('||') || (T[i] && T[i].t === 'id' && /^(или|or)$/i.test(T[i].v))) { i++; const b = and(); const A = a; a = ctx => !!(A(ctx) || b(ctx)); } return a; }
  if (!T.length) throw new Error('пустая формула');
  const fn = or();
  if (i < T.length) throw new Error(`лишнее «${T[i].v}»`);
  return { fn, used: [...used] };
}
function _katEvalOut(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1e9) / 1e9 : '';
  return v == null ? '' : v;
}
function _katRunFormula(l, formula, idxs) {
  KAT._calcFields = Object.fromEntries(_katFieldsOf(l).map(f => [f, 1]));
  const c = _katCompile(formula), feats = _kaFeatures(l);
  return idxs.map((i, n) => {
    const f = feats[i]; let gi = null;
    const ctx = { p: (f && f.properties) || {}, n: n + 1, i: i + 1, g: () => gi || (gi = _katGeomInfo(f)) };
    let v; try { v = _katEvalOut(c.fn(ctx)); } catch (e) { v = ''; }
    return { i, v };
  });
}

function katCalcOpen(field) {
  const l = _katLayer(); if (!l) return;
  const sc = _katScope(); if (!sc.idxs.length) { toast('В таблице нет строк', 'warn'); return; }
  const flds = _katFieldsOf(l);
  showModal('🧮 Вычислить поле по формуле', `<div style="width:100%;font-size:12px">
    <div style="display:grid;grid-template-columns:110px 1fr;gap:6px 8px;align-items:center">
      <label>Поле</label><input id="kc-f" list="kc-dl" value="${escAttr(field || '')}" placeholder="существующее или новое">${_katDl('kc-dl', l)}
      <label>Формула</label><input id="kc-e" placeholder='например: [глубина] * 2   или   "Скв-" + [Номер]' style="font-family:monospace" value="${escAttr(KAT._lastFormula || '')}">
    </div>
    <div style="margin:6px 0 4px;color:var(--tx3)">Поля (щелчок — вставить):</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;max-height:70px;overflow:auto">${flds.map(f => `<button class="btn bs bxs" onclick="_katIns('[${escAttr(f)}]')">${esc(f)}</button>`).join('')}
      ${['n', 'area', 'length', 'perimeter', 'x', 'y'].map(v => `<button class="btn bs bxs" style="font-style:italic" onclick="_katIns('${v}')" title="${{ n: 'номер по порядку (1, 2, 3…)', area: 'площадь, м²', length: 'длина линии, м', perimeter: 'периметр полигона, м', x: 'долгота (WGS-84)', y: 'широта (WGS-84)' }[v]}">${v}</button>`).join('')}</div>
    <div style="margin-top:6px;color:var(--tx3);font-size:11px;line-height:1.5">Действия: + − * / % · сравнение = &lt;&gt; &lt; &gt; · и / или · текст в кавычках, + склеивает текст.<br>Функции: ${esc(KAT_FN_HELP)}</div>
    <div style="margin-top:8px"><b>Для:</b> ${esc(sc.what)}</div>
    <div id="kc-prev" style="margin-top:6px;font-size:11px;background:var(--s2);border-radius:6px;padding:6px;min-height:40px"></div></div>`,
    [{ label: '🧮 Вычислить', cls: 'bp', fn: () => _katCalcApply() }, { label: 'Отмена', cls: 'bs', fn: closeModal }]);
  const up = () => _katCalcPreview();
  document.getElementById('kc-e').oninput = up; document.getElementById('kc-f').oninput = up;
  setTimeout(() => { const e = document.getElementById('kc-e'); e && e.focus(); up(); }, 30);
}
function _katIns(t) {
  const e = document.getElementById('kc-e'); if (!e) return;
  const a = e.selectionStart ?? e.value.length, b = e.selectionEnd ?? a;
  e.value = e.value.slice(0, a) + t + e.value.slice(b); e.focus(); e.setSelectionRange(a + t.length, a + t.length); _katCalcPreview();
}
function _katCalcPreview() {
  const l = _katLayer(), box = document.getElementById('kc-prev'); if (!l || !box) return;
  const f = (document.getElementById('kc-f').value || '').trim(), e = document.getElementById('kc-e').value;
  if (!e.trim()) { box.innerHTML = '<span style="color:var(--tx3)">Введите формулу — здесь появится результат для первых строк</span>'; return; }
  try {
    KAT._calcFields = Object.fromEntries(_katFieldsOf(l).map(x => [x, 1]));
    const c = _katCompile(e), flds = _katFieldsOf(l), miss = c.used.filter(u => !flds.includes(u));
    const sc = _katScope(), res = _katRunFormula(l, e, sc.idxs.slice(0, 6)), feats = _kaFeatures(l);
    box.innerHTML = `${miss.length ? `<div style="color:#b45309">⚠ Нет таких полей: ${miss.map(esc).join(', ')} — будут пустыми</div>` : ''}
      <table style="width:100%;border-collapse:collapse">${res.map(r => { const p = (feats[r.i] || {}).properties || {}; return `<tr><td style="color:var(--tx3);padding:1px 4px">${esc(String(p.name ?? r.i + 1))}</td><td style="padding:1px 4px">${f ? esc(String(p[f] ?? '')) + ' → ' : ''}<b>${esc(String(r.v))}</b></td></tr>`; }).join('')}</table>`;
  } catch (er) { box.innerHTML = `<span style="color:var(--red)">Ошибка в формуле: ${esc(er.message)}</span>`; }
}
async function _katCalcApply() {
  const l = _katLayer(); if (!l) return;
  const f = (document.getElementById('kc-f').value || '').trim(), e = document.getElementById('kc-e').value;
  if (!f) { toast('Укажите поле', 'err'); return; }
  if (f.startsWith('_')) { toast('Название не может начинаться с «_»', 'err'); return; }
  let res; try { res = _katRunFormula(l, e, _katScope().idxs); } catch (er) { toast('Ошибка в формуле: ' + er.message, 'err'); return; }
  KAT._lastFormula = e; closeModal();
  await _katSave(l, fs => res.forEach(r => { if (!fs[r.i]) return; fs[r.i].properties = fs[r.i].properties || {}; fs[r.i].properties[f] = r.v; }), `«${f}» вычислено: ${res.length}`);
}

// ═══ № Нумерация ═══
function katNumberOpen(field) {
  const l = _katLayer(); if (!l) return;
  const sc = _katScope(); if (!sc.idxs.length) { toast('В таблице нет строк', 'warn'); return; }
  const lines = [];
  (layers || []).forEach(L2 => _kaFeatures(L2).forEach((f, i) => { const g = f && f.geometry; if (g && /LineString/.test(g.type) && lines.length < 300) lines.push({ lid: L2.id, i, t: `${L2.name}: ${(f.properties || {}).name || 'линия ' + (i + 1)}` }); }));
  KAT._numLines = lines;
  const sv = KAT._numLast || {};
  showModal('№ Нумерация', `<div style="width:100%;font-size:12px">
    <div style="display:grid;grid-template-columns:110px 1fr;gap:6px 8px;align-items:center">
      <label>Поле</label><input id="kn-f" list="kn-dl" value="${escAttr(field || sv.f || 'name')}">${_katDl('kn-dl', l)}
      <label>Шаблон</label><input id="kn-t" value="${escAttr(sv.t || 'Скв-{n}')}" title="{n} — номер; остальное — как написано">
      <label>Начать с</label><div style="display:flex;gap:6px;align-items:center"><input id="kn-s" type="number" value="${sv.s ?? 1}" style="width:80px"> шаг <input id="kn-d" type="number" value="${sv.d ?? 1}" style="width:60px"> цифр <input id="kn-z" type="number" min="0" max="8" value="${sv.z ?? 0}" style="width:50px" title="0 — без нулей впереди; 3 — 001, 002…"></div>
      <label>Порядок</label><select id="kn-o">
        <option value="table">как сейчас в таблице</option><option value="ns">с севера на юг</option><option value="sn">с юга на север</option>
        <option value="we">с запада на восток</option><option value="ew">с востока на запад</option>${lines.length ? '<option value="line">вдоль линии…</option>' : ''}</select>
      <label id="kn-ll" style="display:none">Линия</label><select id="kn-l" style="display:none">${lines.map((x, k) => `<option value="${k}">${esc(x.t)}</option>`).join('')}</select>
      <label id="kn-rl" style="display:none"></label><label id="kn-rv" style="display:none;font-size:11px"><input type="checkbox" id="kn-r"> от конца линии к началу</label>
    </div>
    <div style="margin-top:8px"><b>Для:</b> ${esc(sc.what)}</div>
    <div id="kn-prev" style="margin-top:6px;font-size:11px;background:var(--s2);border-radius:6px;padding:6px"></div></div>`,
    [{ label: '№ Пронумеровать', cls: 'bp', fn: () => _katNumApply() }, { label: 'Отмена', cls: 'bs', fn: closeModal }]);
  setTimeout(() => {
    const m = document.getElementById('mbd') || document;
    if (sv.o) { const o = document.getElementById('kn-o'); if ([...o.options].some(x => x.value === sv.o)) o.value = sv.o; }
    m.querySelectorAll('#kn-f,#kn-t,#kn-s,#kn-d,#kn-z,#kn-o,#kn-l,#kn-r').forEach(e => { e.oninput = _katNumPreview; e.onchange = _katNumPreview; });
    _katNumPreview();
  }, 30);
}
function _katNumRead() {
  const v = id => document.getElementById(id);
  return { f: (v('kn-f').value || '').trim(), t: v('kn-t').value || '{n}', s: +v('kn-s').value || 0, d: +v('kn-d').value || 1, z: Math.max(0, Math.min(8, +v('kn-z').value || 0)),
    o: v('kn-o').value, line: KAT._numLines[+v('kn-l').value], rev: v('kn-r').checked };
}
// пикетаж точки по линии (м от начала) — проекция на ближайший отрезок, плоская система вокруг линии
function _katChain(lineCoords, x, y) {
  const lat0 = lineCoords[0][1] * Math.PI / 180, kx = 111320 * Math.cos(lat0), ky = 110540;
  const P = lineCoords.map(c => [c[0] * kx, c[1] * ky]), px = x * kx, py = y * ky;
  let best = Infinity, ch = 0, acc = 0;
  for (let k = 1; k < P.length; k++) {
    const [ax, ay] = P[k - 1], [bx, by] = P[k], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, seg = Math.sqrt(L2);
    const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
    const qx = ax + t * dx, qy = ay + t * dy, d = (px - qx) ** 2 + (py - qy) ** 2;
    if (d < best) { best = d; ch = acc + t * seg; }
    acc += seg;
  }
  return ch;
}
function _katNumOrder(l, o) {
  const feats = _kaFeatures(l), idxs = _katScope().idxs.slice();
  if (o.o === 'table') return idxs;
  const gi = {}; idxs.forEach(i => gi[i] = _katGeomInfo(feats[i]));
  if (o.o === 'line' && o.line) {
    const lf = _kaFeatures((layers || []).find(x => x.id === o.line.lid))[o.line.i], g = lf && lf.geometry;
    const cs = g ? (g.type === 'LineString' ? g.coordinates : [].concat(...g.coordinates)) : [];
    if (cs.length < 2) return idxs;
    const ch = {}; idxs.forEach(i => ch[i] = gi[i].x == null ? Infinity : _katChain(cs, gi[i].x, gi[i].y));
    return idxs.sort((a, b) => (ch[a] - ch[b]) * (o.rev ? -1 : 1));
  }
  const key = { ns: i => -gi[i].y, sn: i => gi[i].y, we: i => gi[i].x, ew: i => -gi[i].x }[o.o];
  return key ? idxs.sort((a, b) => (key(a) ?? Infinity) - (key(b) ?? Infinity)) : idxs;
}
const _katNumText = (o, k) => { const n = o.s + k * o.d, ns = o.z ? String(Math.abs(n)).padStart(o.z, '0') : String(n); return o.t.includes('{n}') ? o.t.split('{n}').join(n < 0 && o.z ? '-' + ns : ns) : o.t + ns; };
function _katNumPreview() {
  const l = _katLayer(), box = document.getElementById('kn-prev'); if (!l || !box) return;
  const o = _katNumRead(), line = o.o === 'line';
  ['kn-ll', 'kn-l', 'kn-rl', 'kn-rv'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = line ? '' : 'none'; });
  const ord = _katNumOrder(l, o), feats = _kaFeatures(l);
  box.innerHTML = ord.slice(0, 5).map((i, k) => `<div>${esc(String(((feats[i] || {}).properties || {})[o.f] ?? '—'))} → <b>${esc(_katNumText(o, k))}</b></div>`).join('') + (ord.length > 5 ? `<div style="color:var(--tx3)">… всего ${ord.length}, последний — ${esc(_katNumText(o, ord.length - 1))}</div>` : '');
}
async function _katNumApply() {
  const l = _katLayer(); if (!l) return;
  const o = _katNumRead();
  if (!o.f || o.f.startsWith('_')) { toast('Укажите поле', 'err'); return; }
  const ord = _katNumOrder(l, o); KAT._numLast = { f: o.f, t: o.t, s: o.s, d: o.d, z: o.z, o: o.o }; closeModal();
  const numOnly = o.t.trim() === '{n}' && !o.z;
  await _katSave(l, fs => ord.forEach((i, k) => { if (!fs[i]) return; fs[i].properties = fs[i].properties || {}; fs[i].properties[o.f] = numOnly ? o.s + k * o.d : _katNumText(o, k); }), `Пронумеровано: ${ord.length}`);
}

// ═══ 🔎 Найти и заменить ═══
function katReplaceOpen(field) {
  const l = _katLayer(); if (!l) return;
  const sc = _katScope(); if (!sc.idxs.length) { toast('В таблице нет строк', 'warn'); return; }
  showModal('🔎 Найти и заменить', `<div style="width:100%;font-size:12px">
    <div style="display:grid;grid-template-columns:110px 1fr;gap:6px 8px;align-items:center">
      <label>Поле</label><select id="kr-f">${_katFieldsOf(l).map(f => `<option value="${escAttr(f)}"${f === field ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>
      <label>Найти</label><input id="kr-a" placeholder="пусто + «целиком» — найти пустые ячейки">
      <label>Заменить на</label><input id="kr-b">
      <span></span><label><input type="checkbox" id="kr-w"> только значение целиком</label>
      <span></span><label><input type="checkbox" id="kr-c"> учитывать регистр (А ≠ а)</label>
    </div>
    <div style="margin-top:8px"><b>Где:</b> ${esc(sc.what)}</div>
    <div id="kr-prev" style="margin-top:6px;font-size:11px;background:var(--s2);border-radius:6px;padding:6px"></div></div>`,
    [{ label: '🔎 Заменить', cls: 'bp', fn: () => _katRepApply() }, { label: 'Отмена', cls: 'bs', fn: closeModal }]);
  setTimeout(() => { ['kr-f', 'kr-a', 'kr-b', 'kr-w', 'kr-c'].forEach(id => { const e = document.getElementById(id); e.oninput = _katRepPreview; e.onchange = _katRepPreview; }); document.getElementById('kr-a').focus(); _katRepPreview(); }, 30);
}
function _katRepPlan() {
  const l = _katLayer(), v = id => document.getElementById(id);
  const f = v('kr-f').value, a = v('kr-a').value, b = v('kr-b').value, whole = v('kr-w').checked, cs = v('kr-c').checked;
  const feats = _kaFeatures(l), out = [];
  if (!a && !whole) return { f, out, need: true };
  const esc2 = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = a ? new RegExp(whole ? `^${esc2(a)}$` : esc2(a), cs ? 'g' : 'gi') : null;
  _katScope().idxs.forEach(i => {
    const p = (feats[i] || {}).properties || {}, old = p[f] == null ? '' : String(p[f]);
    let nv;
    if (!a) { if (old !== '') return; nv = b; }
    else { re.lastIndex = 0; if (!re.test(old)) return; re.lastIndex = 0; nv = old.replace(re, () => b); }
    if (nv !== old) out.push({ i, old, nv });
  });
  return { f, out };
}
function _katRepPreview() {
  const box = document.getElementById('kr-prev'); if (!box) return;
  const pl = _katRepPlan();
  if (pl.need) { box.innerHTML = '<span style="color:var(--tx3)">Введите, что найти</span>'; return; }
  box.innerHTML = `<b>Будет изменено: ${pl.out.length}</b>` + pl.out.slice(0, 5).map(r => `<div>${esc(r.old || '(пусто)')} → <b>${esc(r.nv || '(пусто)')}</b></div>`).join('');
}
async function _katRepApply() {
  const l = _katLayer(); if (!l) return;
  const pl = _katRepPlan(); if (pl.need || !pl.out.length) { toast('Нечего заменять', 'warn'); return; }
  closeModal();
  await _katSave(l, fs => pl.out.forEach(r => { if (!fs[r.i]) return; fs[r.i].properties = fs[r.i].properties || {}; const o = fs[r.i].properties[pl.f]; fs[r.i].properties[pl.f] = typeof _katTyped === 'function' ? _katTyped(r.nv, [o]) : r.nv; }), `Заменено: ${pl.out.length}`);
}

// ═══ 🧩 Шаблон полей слоя ═══
const KAT_TPL_PRESETS = {
  'Скважина': [['глубина', ''], ['отметка устья', ''], ['дата бурения', ''], ['бурильщик', ''], ['примечание', '']],
  'Шурф': [['глубина', ''], ['размер', ''], ['дата', ''], ['примечание', '']],
  'Пункт ГГС': [['тип знака', ''], ['класс', ''], ['состояние', ''], ['дата обследования', ''], ['примечание', '']],
};
function kmlFieldTpl(l) { const st = kmlStyleOf(l) || {}; return Array.isArray(st.fieldTpl) ? st.fieldTpl : []; }
// новый объект слоя: добавить поля шаблона (не перетирая заданные)
function kmlApplyTpl(l, props) {
  try { kmlFieldTpl(l).forEach(t => { if (t && t.k && !(t.k in props)) props[t.k] = t.v ?? ''; }); } catch (e) {}
  return props;
}
function katTplOpen() {
  const l = _katLayer(); if (!l) return;
  KAT._tpl = kmlFieldTpl(l).map(t => [t.k, t.v ?? '']);
  _katTplRender();
}
function _katTplRender() {
  const l = _katLayer(); if (!l) return;
  const rows = KAT._tpl;
  showModal(`🧩 Шаблон полей — «${l.name}»`, `<div style="width:100%;font-size:12px">
    <div style="color:var(--tx3);margin-bottom:8px">Новые объекты этого слоя (нарисованные, поставленные метки) сразу получают эти поля. Значение по умолчанию можно оставить пустым.</div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">Готовые: ${Object.keys(KAT_TPL_PRESETS).map(k => `<button class="btn bs bxs" onclick="_katTplPreset('${escAttr(k)}')">${esc(k)}</button>`).join('')}
      <button class="btn bs bxs" onclick="_katTplPreset('')" title="Взять поля, которые уже есть у объектов слоя">Из полей слоя</button></div>
    <div id="ktp-rows">${rows.map((r, k) => `<div style="display:flex;gap:4px;margin-bottom:4px"><input value="${escAttr(r[0])}" placeholder="поле" style="flex:1" oninput="KAT._tpl[${k}][0]=this.value"><input value="${escAttr(r[1])}" placeholder="по умолчанию" style="flex:1" oninput="KAT._tpl[${k}][1]=this.value"><button class="btn bd bxs" onclick="KAT._tpl.splice(${k},1);_katTplRender()">✕</button></div>`).join('') || '<div style="color:var(--tx3);padding:6px 0">Полей нет</div>'}</div>
    <button class="btn bs bxs" onclick="KAT._tpl.push(['','']);_katTplRender();setTimeout(()=>{const r=document.querySelectorAll('#ktp-rows input');r[r.length-2]&&r[r.length-2].focus()},30)">＋ Поле</button>
    <label style="display:block;margin-top:10px"><input type="checkbox" id="ktp-ex" checked> добавить недостающие поля и уже существующим объектам</label></div>`,
    [{ label: '💾 Сохранить', cls: 'bp', fn: () => _katTplSave() }, ...(rows.length ? [{ label: 'Убрать шаблон', cls: 'bs', fn: () => { KAT._tpl = []; _katTplSave(); } }] : []), { label: 'Отмена', cls: 'bs', fn: closeModal }]);
}
function _katTplPreset(k) {
  const l = _katLayer(); if (!l) return;
  const add = k ? KAT_TPL_PRESETS[k] : _katFieldsOf(l).filter(f => f !== 'name').map(f => [f, '']);
  add.forEach(([a, b]) => { if (!KAT._tpl.some(r => r[0] === a)) KAT._tpl.push([a, b]); });
  _katTplRender();
}
async function _katTplSave() {
  const l = _katLayer(); if (!l) return;
  const ex = document.getElementById('ktp-ex'), toExisting = ex ? ex.checked : false;
  const seen = new Set(), tpl = [];
  for (const [k0, v] of KAT._tpl) { const k = String(k0 || '').trim(); if (!k || k.startsWith('_') || seen.has(k)) continue; seen.add(k); tpl.push({ k, v: String(v ?? '') }); }
  const st = Object.assign({}, kmlStyleOf(l) || {});
  if (tpl.length) st.fieldTpl = tpl; else delete st.fieldTpl;
  closeModal();
  if (!await kmlSaveStyle(l, st)) { toast('Не удалось сохранить шаблон', 'err'); return; }
  if (toExisting && tpl.length) {
    let n = 0;
    await _katSave(l, fs => { fs.forEach(f => { f.properties = f.properties || {}; tpl.forEach(t => { if (!(t.k in f.properties)) { f.properties[t.k] = t.v; n++; } }); }); if (!n) return false; }, null);
  }
  _katRender();
  toast(tpl.length ? `🧩 Шаблон сохранён: ${tpl.length} пол.` : 'Шаблон убран', 'ok');
}

// ── меню «🛠 Инструменты» в шапке таблицы ──
function katToolsMenu(e) {
  e.stopPropagation();
  const r = e.currentTarget.getBoundingClientRect(), sc = _katScope();
  window._ctxKeepUntil = Date.now() + 300;
  showCtx(r.left, r.bottom + 4, [
    { i: '🛠', l: `<span style="color:var(--tx3)">Для: ${esc(sc.what)}</span>`, html: true, f: null }, { sep: true },
    { i: '🧮', l: 'Вычислить поле по формуле…', f: () => katCalcOpen('') },
    { i: '№', l: 'Пронумеровать…', f: () => katNumberOpen('') },
    { i: '🔎', l: 'Найти и заменить…', f: () => katReplaceOpen('') },
    ...(typeof wellElevOpen === 'function' ? [{ i: '⛰', l: 'Отметка из рельефа (БСВ-77)…', f: () => wellElevOpen() }] : []),
    { sep: true },
    { i: '🧩', l: `Шаблон полей слоя…${(_katLayer() ? kmlFieldTpl(_katLayer()).length : 0) ? ' ✓' : ''}`, f: () => katTplOpen() },
  ]);
}
