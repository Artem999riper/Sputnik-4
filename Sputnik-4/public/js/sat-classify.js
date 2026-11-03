// ═══════════════════════════════════════════════════════════
// sat-classify.js — примерное оконтуривание по спутниковому снимку (подложка
// Esri через /api/export-tiles): вода, лес, луг (яркая трава, поймы), открытый
// грунт (пески, отсыпки, площадки), остальное — болото / открытая тундра.
// Без нейросетей: признаки пикселя — яркость, «зелёность» (2G−R−B), насыщенность,
// шероховатость (разброс яркости в окне ~8 м); пороги подбираются по самому снимку
// (Оцу, процентили), поэтому работает на разных снимках и сезонах.
// Дальше — сглаживание, удаление мелочи (меньше заданной площади), контуры по
// границам пикселей, упрощение (Дуглас–Пекер) и сглаживание углов.
// Точность — примерная (±1–3 пикселя снимка, тени, облака, сезон) — для ориентира.
// ═══════════════════════════════════════════════════════════
const SATC = { WATER: 1, FOREST: 2, MEADOW: 3, BARE: 4, BOG: 5 };
const SATC_SIT = { 1: 'lake', 2: 'forest', 3: 'meadow', 4: 'bare', 5: 'bog' };
const SATC_NAME = { 1: 'вода', 2: 'лес', 3: 'луг', 4: 'открытый грунт', 5: 'болото' };

// Оцу: порог, лучше всего делящий гистограмму на две группы
function _satOtsu(hist, lo, hi) {
  let tot = 0, sum = 0; for (let i = lo; i <= hi; i++) { tot += hist[i]; sum += i * hist[i]; }
  let wB = 0, sB = 0, best = lo, bv = -1;
  for (let i = lo; i <= hi; i++) {
    wB += hist[i]; if (!wB) continue; const wF = tot - wB; if (!wF) break;
    sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if (v > bv) { bv = v; best = i; }
  }
  return best;
}
function _satPct(hist, n, p) { let a = 0; const t = n * p; for (let i = 0; i < hist.length; i++) { a += hist[i]; if (a >= t) return i; } return hist.length - 1; }
// скользящее среднее (box) через интегральное изображение
function _satBox(src, W, H, r) {
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) { s += src[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + s; } }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) { const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
      out[y * W + x] = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0)); } }
  return out;
}

// rgba — Uint8ClampedArray w×h, mpp — метров в пикселе. opts.bogOpen — открытое считать болотом
// → { lab: Uint8Array(W*H), W, H, k (во сколько раз уменьшено), mpp (рабочий), info }
function satClassify(rgba, w, h, mpp, opts = {}) {
  // рабочее разрешение ~2 м (шум крон, машин, бликов уходит)
  const k = Math.max(1, Math.round((opts.workM || 2) / mpp)), W = Math.floor(w / k), H = Math.floor(h / k), wm = mpp * k;
  const R = new Float32Array(W * H), G = new Float32Array(W * H), B = new Float32Array(W * H), valid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const i = ((y * k + dy) * w + x * k + dx) * 4; if (rgba[i + 3] < 128) continue; r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++; }
    const j = y * W + x; if (n) { R[j] = r / n; G[j] = g / n; B[j] = b / n; valid[j] = 1; }
  }
  const N = W * H, L = new Float32Array(N), L2 = new Float32Array(N), EXG = new Float32Array(N), CH = new Float32Array(N);
  for (let j = 0; j < N; j++) { const s = R[j] + G[j] + B[j] + 1; L[j] = s / 3; L2[j] = L[j] * L[j]; EXG[j] = (2 * G[j] - R[j] - B[j]) / s; const mx = Math.max(R[j], G[j], B[j]), mn = Math.min(R[j], G[j], B[j]); CH[j] = (mx - mn) / (mx + 1); }
  const rs = Math.max(1, Math.round(4 / wm)), rt = Math.max(1, Math.round(8 / wm));
  const Ls = _satBox(L, W, H, rs), Es = _satBox(EXG, W, H, rs), Cs = _satBox(CH, W, H, rs);
  const m1 = _satBox(L, W, H, rt), m2 = _satBox(L2, W, H, rt), TX = new Float32Array(N);
  for (let j = 0; j < N; j++) TX[j] = Math.sqrt(Math.max(0, m2[j] - m1[j] * m1[j]));
  // гистограммы
  const hL = new Uint32Array(256), hT = new Uint32Array(256); let nv = 0;
  for (let j = 0; j < N; j++) if (valid[j]) { hL[Math.min(255, Ls[j] | 0)]++; hT[Math.min(255, TX[j] | 0)]++; nv++; }
  if (!nv) return { lab: new Uint8Array(N), W, H, k, mpp: wm, info: {} };
  const p50 = _satPct(hL, nv, 0.5), p97 = _satPct(hL, nv, 0.97), t50 = _satPct(hT, nv, 0.5);
  // вода: тёмное и гладкое; порог — Оцу по тёмной части гистограммы, не выше 60 % медианы
  let tw = Math.min(_satOtsu(hL, 0, Math.min(255, Math.round(p50 * 1.1))), Math.round(p50 * 0.6));
  if (opts.waterK) tw = Math.round(tw * opts.waterK);
  const texW = Math.max(3, t50 * 1.6);
  const lab = new Uint8Array(N);
  // «зелёность» и яркость суши
  const hE = new Uint32Array(256), hS = new Uint32Array(256); let ns = 0;
  for (let j = 0; j < N; j++) { if (!valid[j]) continue; // тёмная вода; мутная бурая речная вода — «незелёная», насыщенная, гладкая и темнее середины снимка
    if ((Ls[j] < tw && TX[j] < texW && Es[j] < 0.1) || (Es[j] < -0.015 && Cs[j] > 0.14 && Ls[j] < p50 * 0.9 && TX[j] < texW * 2.5)) { lab[j] = SATC.WATER; continue; }
    hE[Math.max(0, Math.min(255, Math.round((Es[j] + 0.2) * 400)))]++; hS[Math.min(255, Ls[j] | 0)]++; ns++; }
  // лес: зелёное и не светлое; порог зелёности — Оцу по суше, но не ниже 0,035
  const eT = Math.max(0.035, _satOtsu(hE, 0, 255) / 400 - 0.2) + (opts.forestK ? (opts.forestK - 1) * 0.03 : 0);
  const sMed = _satPct(hS, ns, 0.5), sHi = _satPct(hS, ns, 0.9);
  const bareT = Math.max(p97, sHi * 1.15, 120);
  let nW = 0, nF = 0, nM = 0, nB = 0, nO = 0;
  for (let j = 0; j < N; j++) {
    if (!valid[j]) continue;
    if (lab[j] === SATC.WATER) { nW++; continue; }
    if (Ls[j] > bareT && Cs[j] < 0.22) { lab[j] = SATC.BARE; nB++; continue; }
    if (Es[j] > eT) {
      // тёмная зелень — лес; яркая — луг/пойма
      if (Ls[j] <= sMed * 1.05 || TX[j] > t50 * 1.4) { lab[j] = SATC.FOREST; nF++; } else { lab[j] = SATC.MEADOW; nM++; }
      continue;
    }
    lab[j] = opts.bogOpen === false ? 0 : SATC.BOG; nO++;
  }
  // сглаживание: мода 3×3 дважды
  for (let pass = 0; pass < 2; pass++) {
    const cp = lab.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const c = new Uint8Array(6);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) c[cp[(y + dy) * W + x + dx]]++;
      let b = cp[y * W + x], bn = c[b]; for (let q = 0; q < 6; q++) if (c[q] > bn + 1) { b = q; bn = c[q]; }
      lab[y * W + x] = b;
    }
  }
  // мелочь меньше минимальной площади — к соседнему классу
  const minPx = { 1: (opts.minWaterM2 || 300), 2: (opts.minForestM2 || 2500), 3: (opts.minMeadowM2 || 2500), 4: (opts.minBareM2 || 600), 5: (opts.minBogM2 || 5000), 0: 2500 };
  for (const c in minPx) minPx[c] = Math.max(2, minPx[c] / (wm * wm));
  _satAbsorbSmall(lab, W, H, minPx);
  return { lab, W, H, k, mpp: wm, info: { tw, eT: +eT.toFixed(3), bareT, share: { water: nW / nv, forest: nF / nv, meadow: nM / nv, bare: nB / nv, bog: nO / nv } } };
}
// связные области меньше порога своего класса перекрашиваются в самый частый соседний класс
function _satAbsorbSmall(lab, W, H, minPx) {
  for (let pass = 0; pass < 2; pass++) {
    const seen = new Int32Array(W * H).fill(-1), stack = new Int32Array(W * H);
    for (let s = 0; s < W * H; s++) {
      if (seen[s] >= 0) continue;
      const c = lab[s]; let sp = 0, n = 0; stack[sp++] = s; seen[s] = s;
      const comp = []; const nb = new Uint32Array(8);
      while (sp) {
        const p = stack[--sp]; comp.push(p); n++;
        const x = p % W, y = (p / W) | 0;
        const q4 = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
        for (const q of q4) { if (q < 0) continue; if (lab[q] === c) { if (seen[q] < 0) { seen[q] = s; stack[sp++] = q; } } else nb[lab[q]]++; }
      }
      if (n < (minPx[c] || 0)) { let b = -1, bn = 0; for (let q = 0; q < 8; q++) if (q !== c && nb[q] > bn) { bn = nb[q]; b = q; } if (b >= 0) comp.forEach(p => { lab[p] = b; }); }
    }
  }
}

// Контуры класса cls: границы по рёбрам пикселей → кольца (внешние против часовой
// в системе «y вверх», дырки — по часовой) → [{outer:[[x,y]…], holes:[[…]]}] в пикселях
function satVectorize(lab, W, H, cls, tol = 1.3) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] === cls;
  // рёбра: внутри — слева по ходу (в координатах изображения y вниз)
  const next = new Map(), key = (x, y) => y * (W + 1) + x;
  const add = (x0, y0, x1, y1) => { const k0 = key(x0, y0); (next.get(k0) || next.set(k0, []).get(k0)).push([x1, y1]); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (lab[y * W + x] !== cls) continue;
    if (!inside(x, y - 1)) add(x + 1, y, x, y);         // верхнее ребро: справа налево
    if (!inside(x, y + 1)) add(x, y + 1, x + 1, y + 1); // нижнее: слева направо
    if (!inside(x - 1, y)) add(x, y, x, y + 1);         // левое: вниз
    if (!inside(x + 1, y)) add(x + 1, y + 1, x + 1, y); // правое: вверх
  }
  const rings = [];
  for (const [k0, list] of next) {
    while (list.length) {
      const sx = k0 % (W + 1), sy = (k0 / (W + 1)) | 0, ring = [[sx, sy]];
      let [cx, cy] = list.pop(), px = sx, py = sy, guard = 0;
      while (!(cx === sx && cy === sy) && guard++ < 4e6) {
        ring.push([cx, cy]);
        const l = next.get(key(cx, cy)); if (!l || !l.length) break;
        // на «шахматном» узле — поворот влево (держим область связной по рёбрам)
        let i = 0;
        if (l.length > 1) { const dx = cx - px, dy = cy - py; i = l.findIndex(([nx, ny]) => (nx - cx) === dy && (ny - cy) === -dx); if (i < 0) i = 0; }
        const [nx, ny] = l.splice(i, 1)[0]; px = cx; py = cy; cx = nx; cy = ny;
      }
      if (ring.length >= 4) rings.push(ring);
    }
  }
  // упрощение и сглаживание углов «лесенки»
  const simp = r => { const s = _satDP(r.concat([r[0]]), tol); s.pop(); return s.length >= 3 ? _satChaikin(s) : null; };
  const area = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; };
  const outers = [], holes = [];
  rings.forEach(r => { const s = simp(r); if (!s) return; (area(r) < 0 ? outers : holes).push(s); });
  const polys = outers.map(o => ({ outer: o, holes: [] }));
  holes.forEach(h => {
    const [hx, hy] = h[0];
    const p = polys.find(pl => _satPip(hx, hy, pl.outer)); if (p) p.holes.push(h);
  });
  return polys;
}
function _satPip(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function _satDP(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) { const d = l > 1e-9 ? Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / l : Math.hypot(pts[i][0] - ax, pts[i][1] - ay); if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function _satChaikin(r) {
  const o = [];
  for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; o.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); }
  return o;
}

// ── Снимок области → GeoJSON (WGS-84) ──────────────────────
// bbox {minLng…}; opts: {classes:[1..5], bogOpen, onProgress}
async function satRecognize(bbox, opts = {}) {
  const prog = opts.onProgress || (() => {});
  const lat0 = (bbox.minLat + bbox.maxLat) / 2;
  const tx = (lng, z) => (lng + 180) / 360 * 2 ** z, ty = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z; };
  // уровень снимка: подробнее ~1 м/пикс, но не больше 324 тайлов (≈ 4600×4600 пикселей)
  let z = 17;
  for (; z > 10; z--) { const n = (Math.floor(tx(bbox.maxLng, z)) - Math.floor(tx(bbox.minLng, z)) + 1) * (Math.floor(ty(bbox.minLat, z)) - Math.floor(ty(bbox.maxLat, z)) + 1); if (n <= 324) break; }
  const mpp = 156543.034 * Math.cos(lat0 * Math.PI / 180) / 2 ** z;
  prog(`Снимок z${z} (~${mpp.toFixed(1)} м/пикс)…`);
  const r = await fetch(`${API}/export-tiles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bbox, minZoom: z, maxZoom: z, source: 'sat' }) }).then(x => x.json());
  if (!r || !r.tiles || !Object.keys(r.tiles).length) throw new Error(r && r.error === 'too_many_tiles' ? 'слишком большая область' : 'снимок не загрузился (нет интернета на сервере?)');
  const x0 = Math.floor(tx(bbox.minLng, z)), y0 = Math.floor(ty(bbox.maxLat, z)), x1 = Math.floor(tx(bbox.maxLng, z)), y1 = Math.floor(ty(bbox.minLat, z));
  // мозаика ровно по рамке
  const px0 = tx(bbox.minLng, z) * 256, py0 = ty(bbox.maxLat, z) * 256, pw = Math.ceil(tx(bbox.maxLng, z) * 256 - px0), ph = Math.ceil(ty(bbox.minLat, z) * 256 - py0);
  const cv = document.createElement('canvas'); cv.width = pw; cv.height = ph;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const jobs = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const b64 = r.tiles[`${z}/${x}/${y}`]; if (!b64) continue;
    jobs.push(new Promise(ok => { const im = new Image(); im.onload = () => { g.drawImage(im, x * 256 - px0, y * 256 - py0); ok(); }; im.onerror = ok; im.src = (b64.startsWith('/9j') ? 'data:image/jpeg;base64,' : 'data:image/png;base64,') + b64; }));
  }
  await Promise.all(jobs);
  prog('Распознавание…');
  await new Promise(r2 => setTimeout(r2, 20));
  const res = satImageToFeatures(g.getImageData(0, 0, pw, ph).data, pw, ph, mpp,
    (px, py) => { const X = (px0 + px) / 256 / 2 ** z, Y = (py0 + py) / 256 / 2 ** z; return [+(X * 360 - 180).toFixed(7), +(Math.atan(Math.sinh(Math.PI * (1 - 2 * Y))) * 180 / Math.PI).toFixed(7)]; }, opts);
  res.zoom = z; res.mpp = mpp;
  return res;
}
// изображение → признаки; toLL(px, py) — пиксель исходного снимка → [lng, lat]
function satImageToFeatures(rgba, w, h, mpp, toLL, opts = {}) {
  const C = satClassify(rgba, w, h, mpp, opts);
  const want = opts.classes || [1, 2, 3, 4, 5], feats = [];
  want.forEach(cls => {
    satVectorize(C.lab, C.W, C.H, cls).forEach(p => {
      const ll = r => { const o = r.map(([x, y]) => toLL(x * C.k, y * C.k)); o.push(o[0]); return o; };
      feats.push({ type: 'Feature', properties: { _sit: SATC_SIT[cls], _src: 'снимок', name: '' }, geometry: { type: 'Polygon', coordinates: [ll(p.outer), ...p.holes.map(ll)] } });
    });
  });
  return { features: feats, info: C.info, lab: C.lab, W: C.W, H: C.H, k: C.k };
}
