// ═══════════════════════════════════════════════════════════
// KML LAYER MANAGER — Правая боковая панель управления слоями
// ═══════════════════════════════════════════════════════════

// ── Библиотека условных знаков (SVG) ───────────────────────
const KML_SYMBOLS = {
  borehole:       { label:'Скважина',              group:'Бурение',
    svg:`<circle cx="12" cy="12" r="8" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="12" y1="4" x2="12" y2="20" stroke="COLOR" stroke-width="2.5"/><line x1="4" y1="12" x2="20" y2="12" stroke="COLOR" stroke-width="2.5"/>` },
  borehole_filled:{ label:'Скважина (пройденная)', group:'Бурение',
    svg:`<circle cx="12" cy="12" r="8" fill="COLOR" fill-opacity="0.3" stroke="COLOR" stroke-width="2.5"/><line x1="12" y1="4" x2="12" y2="20" stroke="COLOR" stroke-width="2.5"/><line x1="4" y1="12" x2="20" y2="12" stroke="COLOR" stroke-width="2.5"/>` },
  borehole_water: { label:'Водозаборная скважина',  group:'Бурение',
    svg:`<circle cx="12" cy="12" r="8" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="12" y1="4" x2="12" y2="20" stroke="COLOR" stroke-width="2.5"/><line x1="4" y1="12" x2="20" y2="12" stroke="COLOR" stroke-width="2.5"/><circle cx="12" cy="12" r="3" fill="COLOR"/>` },
  borehole_geo:   { label:'Геологическая скважина', group:'Бурение',
    svg:`<circle cx="12" cy="8" r="6" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="12" y1="14" x2="12" y2="22" stroke="COLOR" stroke-width="2.5"/><line x1="8" y1="8" x2="16" y2="8" stroke="COLOR" stroke-width="2"/><line x1="6" y1="8" x2="18" y2="8" stroke="COLOR" stroke-width="1" stroke-dasharray="2 1"/>` },
  pit:            { label:'Шурф',                   group:'Горные выработки',
    svg:`<rect x="5" y="5" width="14" height="14" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="5" y1="5" x2="19" y2="19" stroke="COLOR" stroke-width="1.5"/><line x1="19" y1="5" x2="5" y2="19" stroke="COLOR" stroke-width="1.5"/>` },
  trench:         { label:'Канава',                 group:'Горные выработки',
    svg:`<rect x="3" y="8" width="18" height="8" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="3" y1="8" x2="21" y2="16" stroke="COLOR" stroke-width="1"/><line x1="3" y1="16" x2="21" y2="8" stroke="COLOR" stroke-width="1"/>` },
  adit:           { label:'Штольня',                group:'Горные выработки',
    svg:`<path d="M4 18 L12 6 L20 18 Z" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="12" y1="18" x2="12" y2="12" stroke="COLOR" stroke-width="2"/>` },
  benchmark:      { label:'Репер',                  group:'Геодезия',
    svg:`<polygon points="12,4 20,18 4,18" fill="none" stroke="COLOR" stroke-width="2.5"/><circle cx="12" cy="14" r="2" fill="COLOR"/>` },
  station:        { label:'Геодезическая станция',  group:'Геодезия',
    svg:`<polygon points="12,4 20,18 4,18" fill="COLOR" fill-opacity="0.25" stroke="COLOR" stroke-width="2.5"/><line x1="12" y1="4" x2="12" y2="2" stroke="COLOR" stroke-width="2"/><line x1="10" y1="2" x2="14" y2="2" stroke="COLOR" stroke-width="2"/>` },
  picket:         { label:'Пикет',                  group:'Геодезия',
    svg:`<circle cx="12" cy="12" r="3" fill="COLOR"/><circle cx="12" cy="12" r="8" fill="none" stroke="COLOR" stroke-width="1.5" stroke-dasharray="3 2"/>` },
  fault:          { label:'Разлом',                 group:'Геология',
    svg:`<path d="M4 18 Q8 12 12 12 Q16 12 20 6" fill="none" stroke="COLOR" stroke-width="3" stroke-linecap="round"/><line x1="16" y1="6" x2="20" y2="4" stroke="COLOR" stroke-width="2"/><line x1="18" y1="8" x2="20" y2="4" stroke="COLOR" stroke-width="2"/>` },
  contact:        { label:'Геологический контакт',  group:'Геология',
    svg:`<line x1="4" y1="12" x2="20" y2="12" stroke="COLOR" stroke-width="2.5" stroke-dasharray="4 2"/><line x1="4" y1="8" x2="20" y2="8" stroke="COLOR" stroke-width="1" stroke-dasharray="2 3"/>` },
  sample:         { label:'Точка опробования',      group:'Геология',
    svg:`<path d="M10 4 L14 4 L16 12 L8 12 Z" fill="none" stroke="COLOR" stroke-width="2"/><ellipse cx="12" cy="13" rx="4" ry="2" fill="none" stroke="COLOR" stroke-width="2"/><line x1="8" y1="12" x2="8" y2="18" stroke="COLOR" stroke-width="2"/><line x1="16" y1="12" x2="16" y2="18" stroke="COLOR" stroke-width="2"/><line x1="8" y1="18" x2="16" y2="18" stroke="COLOR" stroke-width="2"/>` },
  point:          { label:'Точка (стандарт)',        group:'Базовые',
    svg:`<circle cx="12" cy="12" r="7" fill="COLOR" fill-opacity="0.85" stroke="#fff" stroke-width="2"/>` },
  point_cross:    { label:'Точка с крестом',         group:'Базовые',
    svg:`<circle cx="12" cy="12" r="6" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="12" y1="6" x2="12" y2="18" stroke="COLOR" stroke-width="2"/><line x1="6" y1="12" x2="18" y2="12" stroke="COLOR" stroke-width="2"/>` },
  square:         { label:'Квадрат',                group:'Базовые',
    svg:`<rect x="5" y="5" width="14" height="14" fill="COLOR" fill-opacity="0.3" stroke="COLOR" stroke-width="2.5"/>` },
  diamond:        { label:'Ромб',                   group:'Базовые',
    svg:`<polygon points="12,4 20,12 12,20 4,12" fill="COLOR" fill-opacity="0.3" stroke="COLOR" stroke-width="2.5"/>` },
  star:           { label:'Звезда',                 group:'Базовые',
    svg:`<polygon points="12,3 14.5,9 21,9 15.5,13.5 17.5,20 12,16 6.5,20 8.5,13.5 3,9 9.5,9" fill="COLOR" stroke="COLOR" stroke-width="1" fill-opacity="0.8"/>` },
  flag:           { label:'Флажок',                 group:'Базовые',
    svg:`<line x1="7" y1="4" x2="7" y2="20" stroke="COLOR" stroke-width="2.5" stroke-linecap="round"/><path d="M7 4 L18 8 L7 12 Z" fill="COLOR" fill-opacity="0.8"/>` },
  camp:           { label:'Лагерь / База',           group:'Инфраструктура',
    svg:`<path d="M4 18 L12 4 L20 18 Z" fill="COLOR" fill-opacity="0.2" stroke="COLOR" stroke-width="2.5"/><line x1="4" y1="18" x2="20" y2="18" stroke="COLOR" stroke-width="2.5"/>` },
  helipad:        { label:'Вертолётная площадка',   group:'Инфраструктура',
    svg:`<circle cx="12" cy="12" r="9" fill="none" stroke="COLOR" stroke-width="2"/><text x="12" y="17" text-anchor="middle" font-size="12" font-weight="bold" fill="COLOR" font-family="Arial">H</text>` },
  fuel:           { label:'Топливо / АЗС',           group:'Инфраструктура',
    svg:`<rect x="7" y="4" width="8" height="12" fill="none" stroke="COLOR" stroke-width="2"/><rect x="9" y="6" width="4" height="3" fill="COLOR" fill-opacity="0.5"/><line x1="11" y1="16" x2="11" y2="20" stroke="COLOR" stroke-width="2"/><line x1="15" y1="8" x2="17" y2="8" stroke="COLOR" stroke-width="2"/><line x1="17" y1="8" x2="17" y2="14" stroke="COLOR" stroke-width="2"/><circle cx="17" cy="15" r="1.5" fill="COLOR"/>` },
  parking:        { label:'Парковка',                group:'Инфраструктура',
    svg:`<rect x="4" y="4" width="16" height="16" fill="none" stroke="COLOR" stroke-width="2" rx="2"/><path d="M9 8 L9 16 M9 8 L14 8 Q17 8 17 11 Q17 14 14 14 L9 14" fill="none" stroke="COLOR" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` },
  bridge:         { label:'Мост',                    group:'Инфраструктура',
    svg:`<path d="M3 15 Q8 7 12 14 Q16 21 21 15" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="3" y1="15" x2="21" y2="15" stroke="COLOR" stroke-width="1.5"/><line x1="3" y1="13" x2="3" y2="17" stroke="COLOR" stroke-width="2"/><line x1="21" y1="13" x2="21" y2="17" stroke="COLOR" stroke-width="2"/>` },
  power_line:     { label:'ЛЭП / Опора',             group:'Инфраструктура',
    svg:`<line x1="12" y1="3" x2="12" y2="21" stroke="COLOR" stroke-width="2"/><line x1="4" y1="8" x2="20" y2="8" stroke="COLOR" stroke-width="2"/><line x1="4" y1="8" x2="12" y2="5" stroke="COLOR" stroke-width="1.5"/><line x1="20" y1="8" x2="12" y2="5" stroke="COLOR" stroke-width="1.5"/><line x1="5" y1="13" x2="19" y2="13" stroke="COLOR" stroke-width="1.5"/><line x1="5" y1="13" x2="12" y2="10" stroke="COLOR" stroke-width="1.5"/><line x1="19" y1="13" x2="12" y2="10" stroke="COLOR" stroke-width="1.5"/>` },
  warehouse:      { label:'Склад / Ангар',            group:'Инфраструктура',
    svg:`<rect x="3" y="10" width="18" height="10" fill="none" stroke="COLOR" stroke-width="2"/><path d="M3 10 Q12 3 21 10" fill="none" stroke="COLOR" stroke-width="2"/><line x1="10" y1="20" x2="10" y2="14" stroke="COLOR" stroke-width="1.5"/><line x1="14" y1="20" x2="14" y2="14" stroke="COLOR" stroke-width="1.5"/><line x1="10" y1="14" x2="14" y2="14" stroke="COLOR" stroke-width="1.5"/>` },
  checkpoint:     { label:'КПП',                     group:'Охрана',
    svg:`<rect x="4" y="3" width="4" height="18" fill="COLOR" fill-opacity="0.4" stroke="COLOR" stroke-width="1.5" rx="1"/><rect x="8" y="7" width="12" height="4" fill="COLOR" fill-opacity="0.8" stroke="COLOR" stroke-width="1.5" rx="1"/><line x1="8" y1="9" x2="4" y2="9" stroke="COLOR" stroke-width="1"/><text x="14" y="16" text-anchor="middle" font-size="6" font-weight="bold" fill="COLOR" font-family="Arial">КПП</text>` },
  guard_post:     { label:'Пост охраны',              group:'Охрана',
    svg:`<rect x="6" y="9" width="12" height="11" fill="none" stroke="COLOR" stroke-width="2"/><path d="M4 11 L12 4 L20 11" fill="none" stroke="COLOR" stroke-width="2"/><rect x="9" y="13" width="6" height="7" fill="none" stroke="COLOR" stroke-width="1.5"/>` },
  barrier:        { label:'Шлагбаум',                group:'Охрана',
    svg:`<rect x="4" y="10" width="3" height="12" fill="COLOR" fill-opacity="0.5" stroke="COLOR" stroke-width="1.5" rx="1"/><line x1="7" y1="12" x2="20" y2="9" stroke="COLOR" stroke-width="3" stroke-linecap="round"/><circle cx="20" cy="9" r="2" fill="COLOR"/>` },
  camera:         { label:'Камера наблюдения',        group:'Охрана',
    svg:`<rect x="3" y="8" width="13" height="9" fill="none" stroke="COLOR" stroke-width="2" rx="1"/><path d="M16 11 L21 8 L21 16 L16 13 Z" fill="COLOR" fill-opacity="0.3" stroke="COLOR" stroke-width="1.5"/><circle cx="9" cy="12" r="2.5" fill="none" stroke="COLOR" stroke-width="1.5"/>` },
  warning:        { label:'Предупреждение',           group:'Охрана',
    svg:`<polygon points="12,3 22,20 2,20" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="12" y1="9" x2="12" y2="15" stroke="COLOR" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="18" r="1.5" fill="COLOR"/>` },
  forbidden:      { label:'Запретная зона',           group:'Охрана',
    svg:`<circle cx="12" cy="12" r="9" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="5.4" y1="5.4" x2="18.6" y2="18.6" stroke="COLOR" stroke-width="2.5"/>` },
  antenna:        { label:'Антенна / Вышка связи',    group:'Связь',
    svg:`<line x1="12" y1="22" x2="12" y2="10" stroke="COLOR" stroke-width="2.5" stroke-linecap="round"/><path d="M8 14 Q12 8 16 14" fill="none" stroke="COLOR" stroke-width="2"/><path d="M5 18 Q12 6 19 18" fill="none" stroke="COLOR" stroke-width="1.5"/><line x1="9" y1="22" x2="15" y2="22" stroke="COLOR" stroke-width="2"/>` },
  repeater:       { label:'Ретранслятор',             group:'Связь',
    svg:`<rect x="9" y="14" width="6" height="8" fill="none" stroke="COLOR" stroke-width="2"/><line x1="12" y1="14" x2="12" y2="10" stroke="COLOR" stroke-width="2"/><path d="M8 12 Q12 6 16 12" fill="none" stroke="COLOR" stroke-width="2"/><path d="M6 14 Q12 4 18 14" fill="none" stroke="COLOR" stroke-width="1.5"/>` },
  water_body:     { label:'Водоём / Река',             group:'Природа',
    svg:`<path d="M3 10 Q6 7 9 10 Q12 13 15 10 Q18 7 21 10" fill="none" stroke="COLOR" stroke-width="2.5"/><path d="M3 16 Q6 13 9 16 Q12 19 15 16 Q18 13 21 16" fill="none" stroke="COLOR" stroke-width="2"/>` },
  swamp:          { label:'Болото',                   group:'Природа',
    svg:`<line x1="3" y1="8" x2="21" y2="8" stroke="COLOR" stroke-width="2"/><line x1="3" y1="12" x2="21" y2="12" stroke="COLOR" stroke-width="1" stroke-dasharray="2 3"/><line x1="6" y1="8" x2="6" y2="19" stroke="COLOR" stroke-width="1.5"/><line x1="10" y1="8" x2="10" y2="16" stroke="COLOR" stroke-width="1.5"/><line x1="14" y1="8" x2="14" y2="19" stroke="COLOR" stroke-width="1.5"/><line x1="18" y1="8" x2="18" y2="16" stroke="COLOR" stroke-width="1.5"/>` },
  forest:         { label:'Лес',                      group:'Природа',
    svg:`<circle cx="12" cy="9" r="5" fill="COLOR" fill-opacity="0.3" stroke="COLOR" stroke-width="2"/><circle cx="7" cy="13" r="4" fill="COLOR" fill-opacity="0.3" stroke="COLOR" stroke-width="1.5"/><circle cx="17" cy="13" r="4" fill="COLOR" fill-opacity="0.3" stroke="COLOR" stroke-width="1.5"/><line x1="12" y1="14" x2="12" y2="21" stroke="COLOR" stroke-width="2.5"/>` },
  hill:           { label:'Холм / Гора',              group:'Природа',
    svg:`<path d="M2 20 L12 4 L22 20 Z" fill="none" stroke="COLOR" stroke-width="2.5"/><path d="M8 20 L14 11 L20 20" fill="COLOR" fill-opacity="0.2" stroke="COLOR" stroke-width="1.5"/>` },
  triangle_up:    { label:'Треугольник',              group:'Базовые фигуры',
    svg:`<polygon points="12,3 22,21 2,21" fill="COLOR" fill-opacity="0.8" stroke="COLOR" stroke-width="1.5"/>` },
  triangle_down:  { label:'Треугольник (↓)',          group:'Базовые фигуры',
    svg:`<polygon points="12,21 2,3 22,3" fill="COLOR" fill-opacity="0.8" stroke="COLOR" stroke-width="1.5"/>` },
  hexagon:        { label:'Шестиугольник',            group:'Базовые фигуры',
    svg:`<polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5" fill="COLOR" fill-opacity="0.3" stroke="COLOR" stroke-width="2.5"/>` },
  cross:          { label:'Крест',                    group:'Базовые фигуры',
    svg:`<line x1="12" y1="3" x2="12" y2="21" stroke="COLOR" stroke-width="3" stroke-linecap="round"/><line x1="3" y1="12" x2="21" y2="12" stroke="COLOR" stroke-width="3" stroke-linecap="round"/>` },
  arrow_up:       { label:'Стрелка вверх',            group:'Базовые фигуры',
    svg:`<path d="M12 3 L18 12 L14 12 L14 21 L10 21 L10 12 L6 12 Z" fill="COLOR" fill-opacity="0.8" stroke="COLOR" stroke-width="1.5"/>` },
  circle_empty:   { label:'Окружность',               group:'Базовые фигуры',
    svg:`<circle cx="12" cy="12" r="8" fill="none" stroke="COLOR" stroke-width="3"/>` },
};

const KML_LINE_STYLES = {
  solid:   { label:'Сплошная',      dash: null },
  dashed:  { label:'Пунктир',       dash: '8 4' },
  dotted:  { label:'Точечная',      dash: '2 4' },
  dashdot: { label:'Штрих-пунктир', dash: '8 4 2 4' },
};

// ── Состояние ───────────────────────────────────────────────
let kmGroups      = {};
let kmGroupOrder  = [];
let kmlPanelOpen  = false;
let _kmlSelectedCat = 'ALL';    // 'ALL' | group_id | 'UNGROUPED'
let _kmlDisplayMode = 'selected'; // 'selected' | 'all' | 'none'
let _kmlExpanded    = new Set();  // id слоёв, раскрытых в иерархии

// ── Утилиты SVG ────────────────────────────────────────────
function kmlSvgIcon(symbolKey, color, size) {
  size = size || 24;
  const sym = KML_SYMBOLS[symbolKey] || KML_SYMBOLS['point'];
  const inner = sym.svg.replace(/COLOR/g, color || '#1a56db');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${inner}</svg>`;
}

// Per-feature иконка (учитывает feature-level переопределения цвета/символа и размер слоя)
function kmlFeatureDivIcon(layerObj, featureProps) {
  const sym   = (featureProps && featureProps._sym)   || layerObj.symbol || 'point';
  const color = (featureProps && featureProps._color) || layerObj.color  || '#1a56db';
  const scale = featureProps?._size != null ? featureProps._size : (layerObj.size != null ? layerObj.size : 1);
  const size  = Math.round(28 * scale);
  return L.divIcon({
    className: '',
    html: `<div style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.4))">${kmlSvgIcon(sym, color, size)}</div>`,
    iconSize:    [size, size],
    iconAnchor:  [size/2, size/2],
    tooltipAnchor: [0, -size/2],
  });
}

// ── Открыть / закрыть панель ────────────────────────────────
function toggleKmlPanel() {
  kmlPanelOpen = !kmlPanelOpen;
  const panel = document.getElementById('kml-panel');
  const btn   = document.getElementById('tool-kml');
  if (kmlPanelOpen) {
    panel.classList.add('open');
    btn && btn.classList.add('on');
    renderKmlPanel();
  } else {
    panel.classList.remove('open');
    btn && btn.classList.remove('on');
  }
}

// ── Главный рендер панели ───────────────────────────────────
function renderKmlPanel() {
  _kmlRenderCats();
  _kmlRenderLayerPane();
}

// Рендер левой колонки (группы/категории)
function _kmlRenderCats() {
  const el = document.getElementById('kml-cats');
  if (!el) return;
  const allLayers = layers.filter(l => !l.site_id);
  const ungrouped = allLayers.filter(l => !l.group_id || !kmGroups[l.group_id]);
  const totalVis  = allLayers.some(l => l.visible);
  let html = '';

  // «Все слои»
  html += `<div class="kml-cat-row ${_kmlSelectedCat === 'ALL' ? 'active' : ''}" onclick="_kmlSelectCat('ALL')">
    <input type="checkbox" ${totalVis ? 'checked' : ''} onclick="event.stopPropagation()" onchange="_kmlCatBulkVis('ALL',this.checked)" style="cursor:pointer;flex-shrink:0">
    <span class="kml-cat-label">🗂 Все слои</span>
    <span class="kml-cat-count">${allLayers.length}</span>
  </div>`;

  // Группы
  kmGroupOrder.forEach(gid => {
    const g = kmGroups[gid];
    if (!g) return;
    const gLayers  = allLayers.filter(l => l.group_id === gid);
    const anyVis   = gLayers.some(l => l.visible);
    const siteIds  = g.site_ids || [];
    const boundSites = siteIds.length ? (typeof sites !== 'undefined' ? sites.filter(s => siteIds.includes(s.id)) : []) : [];
    const isActive = !siteIds.length || (typeof currentObj !== 'undefined' && currentObj && siteIds.includes(currentObj.id));
    const siteTip  = boundSites.length ? ` title="Привязана к: ${boundSites.map(s => esc(s.name)).join(', ')}"` : '';
    html += `<div class="kml-cat-row ${_kmlSelectedCat === gid ? 'active' : ''}"
        onclick="_kmlSelectCat('${gid}')"
        oncontextmenu="event.preventDefault();kmlGroupCtx(event,'${gid}')"
        style="${!isActive ? 'opacity:.5' : ''}"${siteTip}>
      <input type="checkbox" ${anyVis ? 'checked' : ''} onclick="event.stopPropagation()" onchange="kmlGroupVisToggle('${gid}')" style="cursor:pointer;flex-shrink:0">
      <span class="kml-cat-label" ondblclick="event.stopPropagation();kmlRenameGroup('${gid}')">📁 ${esc(g.name)}</span>
      <span class="kml-cat-count">${gLayers.length}</span>
      <button class="kml-icon-btn" onclick="event.stopPropagation();kmlGroupCtx(event,'${gid}')" title="Меню">⋯</button>
    </div>`;
  });

  // «Без группы»
  html += `<div class="kml-cat-row ${_kmlSelectedCat === 'UNGROUPED' ? 'active' : ''}" onclick="_kmlSelectCat('UNGROUPED')">
    <input type="checkbox" ${ungrouped.some(l => l.visible) ? 'checked' : ''} onclick="event.stopPropagation()" onchange="_kmlCatBulkVis('UNGROUPED',this.checked)" style="cursor:pointer;flex-shrink:0">
    <span class="kml-cat-label">📄 Без группы</span>
    <span class="kml-cat-count">${ungrouped.length}</span>
  </div>`;

  // Кнопки действий
  html += `<div class="kml-cat-actions">
    <button class="btn bs bxs" onclick="kmlCreateGroup()">📁 + Группа</button>
    <button class="btn bs bxs" onclick="kmlCreateIconLayer()">📌 Создать слой</button>
    <button class="btn bs bxs" onclick="openCoordMarkerModal()">🔢 По координатам</button>
  </div>`;

  el.innerHTML = html;
}

// Рендер правой колонки (список слоёв выбранной категории)
function _kmlRenderLayerPane() {
  const el = document.getElementById('kml-layers-pane');
  if (!el) return;
  const allLayers = layers.filter(l => !l.site_id);
  let filtered;
  if (_kmlSelectedCat === 'ALL') {
    filtered = allLayers;
  } else if (_kmlSelectedCat === 'UNGROUPED') {
    filtered = allLayers.filter(l => !l.group_id || !kmGroups[l.group_id]);
  } else {
    filtered = allLayers.filter(l => l.group_id === _kmlSelectedCat);
  }

  if (!filtered.length) {
    const isEmpty = !allLayers.length;
    el.innerHTML = `<div class="kml-empty">
      ${isEmpty
        ? '<div style="font-size:28px;margin-bottom:6px">🗺</div><div>Нет слоёв</div><div style="font-size:10px;color:var(--tx3);margin-top:4px">Импортируйте KML, GPX или DXF</div>'
        : '<div style="font-size:24px;margin-bottom:6px">📂</div><div>Нет слоёв в выбранной группе</div>'}
    </div>`;
    return;
  }

  const rows = filtered.map(l => {
    const lblOn   = !!layerLabels[l.id];
    const sym     = l.symbol || 'point';
    const svgPrev = kmlSvgIcon(sym, l.color || '#1a56db', 18);
    const featCnt = _kmlFeatureCount(l);
    const isExp   = _kmlExpanded.has(l.id);
    const arrow   = featCnt > 0
      ? `<span class="kml-exp-arrow" onclick="event.stopPropagation();_kmlToggleExpand('${l.id}')" title="${isExp ? 'Свернуть' : 'Показать объекты'}">${isExp ? '▼' : '▶'}</span>`
      : `<span class="kml-exp-arrow empty"></span>`;
    return `<div class="kml-layer-row" data-lid="${l.id}" oncontextmenu="event.preventDefault();kmlLayerCtx(event,'${l.id}')">
      ${arrow}
      <input type="checkbox" ${l.visible ? 'checked' : ''} title="${l.visible ? 'Скрыть слой' : 'Показать слой'}"
        onchange="kmlToggleVis('${l.id}',this.checked?1:0)" onclick="event.stopPropagation()" style="cursor:pointer;flex-shrink:0">
      <div class="kml-sym-preview" onclick="kmlOpenStyleModal('${l.id}')" title="Стиль слоя">${svgPrev}</div>
      <div class="kml-layer-name" onclick="${featCnt > 0 ? `_kmlToggleExpand('${l.id}')` : ''}" ondblclick="kmlRenameLayer('${l.id}')" title="${esc(l.name)}">${esc(l.name)}${featCnt ? ` <span class="kml-feat-badge">${featCnt}</span>` : ''}</div>
      <button class="kml-icon-btn ${lblOn ? 'on' : ''}" onclick="toggleLayerLabels('${l.id}')" title="Подписи">🏷</button>
      <button class="kml-icon-btn" onclick="kmlZoomTo('${l.id}')" title="Приблизить">🔍</button>
      <button class="kml-icon-btn ${_kmlPlacingLayerId === l.id ? 'on' : ''}" onclick="kmlStartPlacement('${l.id}')" title="Разместить иконку">📌</button>
      <button class="kml-icon-btn" onclick="kmlLayerCtx(event,'${l.id}')" title="Меню">⋯</button>
    </div>${isExp ? _kmlFeatureChildRows(l) : ''}`;
  }).join('');

  const visCount = filtered.filter(l => l.visible).length;
  el.innerHTML = `<div style="flex:1">${rows}</div>
    <div class="kml-pane-footer">Показано ${visCount} / ${filtered.length}</div>`;
}

// Выбрать категорию в левой панели
function _kmlSelectCat(cat) {
  _kmlSelectedCat = cat;
  renderKmlPanel();
}

// Кол-во объектов в слое
function _kmlFeatureCount(l) {
  try {
    const gj = JSON.parse(l.geojson);
    return gj.type === 'FeatureCollection' ? (gj.features || []).length : (gj.type === 'Feature' ? 1 : 0);
  } catch (e) { return 0; }
}

// Раскрыть/свернуть иерархию объектов слоя
function _kmlToggleExpand(id) {
  if (_kmlExpanded.has(id)) _kmlExpanded.delete(id);
  else _kmlExpanded.add(id);
  _kmlRenderLayerPane();
}

// Дочерние строки — объекты слоя в иерархии
function _kmlFeatureChildRows(l) {
  let gj;
  try { gj = JSON.parse(l.geojson); } catch (e) { return ''; }
  const features = gj.type === 'FeatureCollection' ? gj.features : (gj.type === 'Feature' ? [gj] : []);
  if (!features.length) {
    return `<div class="kml-feat-empty">Слой пуст</div>`;
  }
  const typeIcon = t => t === 'Point' ? '📍' : t === 'LineString' ? '〰️' : t === 'Polygon' ? '⬡' : '◆';
  return `<div class="kml-feat-children">` + features.map((f, idx) => {
    const props    = f.properties || {};
    const nm       = props.name || props.Name || `Объект ${idx + 1}`;
    const geomType = f.geometry ? f.geometry.type : '?';
    const fSym     = props._sym   || l.symbol || 'point';
    const fColor   = props._color || l.color  || '#1a56db';
    const isHidden = !!props._hidden;
    const preview  = geomType === 'Point' ? kmlSvgIcon(fSym, fColor, 16) : `<span style="font-size:13px">${typeIcon(geomType)}</span>`;
    let coordLabel = '';
    try {
      if (geomType === 'Point') { const [lng, lat] = f.geometry.coordinates; coordLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
      else if (geomType === 'LineString') coordLabel = `${f.geometry.coordinates.length} точек`;
      else if (geomType === 'Polygon')    coordLabel = `${(f.geometry.coordinates[0] || []).length} вершин`;
    } catch (e) {}
    return `<div class="kml-feat-row" style="${isHidden ? 'opacity:.45' : ''}">
      <span class="kml-feat-sym">${preview}</span>
      <div class="kml-feat-info" onclick="kmlZoomToFeature('${l.id}',${idx})" title="Приблизить">
        <div class="kml-feat-name">${esc(nm)}</div>
        ${coordLabel ? `<div class="kml-feat-coord">${esc(coordLabel)}</div>` : ''}
      </div>
      <button class="kml-icon-btn" onclick="kmlToggleFeatureVis('${l.id}',${idx})" title="${isHidden ? 'Показать' : 'Скрыть'}">${isHidden ? '🚫' : '👁'}</button>
      <button class="kml-icon-btn" onclick="kmlZoomToFeature('${l.id}',${idx})" title="Приблизить">🔍</button>
      <button class="kml-icon-btn" onclick="kmlEditFeature('${l.id}',${idx},'inline')" title="Редактировать">✏️</button>
      <button class="kml-icon-btn" style="color:var(--red);opacity:.75" onclick="kmlDeleteFeature('${l.id}',${idx},'inline')" title="Удалить">🗑</button>
    </div>`;
  }).join('') + `</div>`;
}

// Массовое переключение видимости для категории (чекбокс в левой панели)
async function _kmlCatBulkVis(cat, vis) {
  const allLayers = layers.filter(l => !l.site_id);
  let targets;
  if (cat === 'ALL') {
    targets = allLayers;
  } else if (cat === 'UNGROUPED') {
    targets = allLayers.filter(l => !l.group_id || !kmGroups[l.group_id]);
  } else {
    return;
  }
  const v = vis ? 1 : 0;
  for (const l of targets) await toggleLV(l.id, v);
  setTimeout(renderKmlPanel, 150);
}

// Переключение режима отображения (радиокнопки в футере)
function kmlSetMode(mode) {
  _kmlDisplayMode = mode;
  document.querySelectorAll('input[name="kml-mode"]').forEach(r => { r.checked = r.value === mode; });
  if (mode === 'all')  _kmlCatBulkVis('ALL', true);
  else if (mode === 'none') _kmlCatBulkVis('ALL', false);
  else renderKmlPanel();
}

// Инициализация разделителя колонок
function _kmlInitSplitter() {
  const handle = document.getElementById('kml-vsplit');
  const cats   = document.getElementById('kml-cats');
  if (!handle || !cats) return;
  let dragging = false, startX = 0, startW = 0;
  handle.addEventListener('mousedown', e => {
    dragging = true; startX = e.clientX; startW = cats.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const w = Math.max(80, Math.min(startW + (e.clientX - startX), 380));
    cats.style.width = w + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.userSelect = '';
  });
}

// ── Видимость ───────────────────────────────────────────────
function kmlToggleVis(id, vis) {
  toggleLV(id, vis);
  setTimeout(renderKmlPanel, 100);
}

// ── Zoom к слою ─────────────────────────────────────────────
function kmlZoomTo(id) {
  const g = lGroups[id];
  if (!g) { toast('Слой скрыт или пуст', 'err'); return; }
  try { const b = g.getBounds(); if (b.isValid()) map.flyToBounds(b, {padding:[40,40]}); }
  catch(e) { toast('Нет координат', 'err'); }
}

// ── Группы ─────────────────────────────────────────────────
function kmlToggleGroup(gid) {
  _kmlSelectCat(gid);
}
async function kmlGroupVisToggle(gid) {
  const gl = layers.filter(l => l.group_id === gid);
  const newVis = gl.some(l => l.visible) ? 0 : 1;
  for (const l of gl) await toggleLV(l.id, newVis);
  setTimeout(renderKmlPanel, 150);
}
async function kmlSetGroupVis(gid, vis) {
  for (const l of layers.filter(l => l.group_id === gid)) await toggleLV(l.id, vis);
  setTimeout(renderKmlPanel, 150);
}
function kmlRenameGroup(gid) {
  const g = kmGroups[gid]; if (!g) return;
  showModal('Переименовать группу',
    `<div class="fg"><label>Название</label><input id="f-grn" value="${esc(g.name)}"></div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},
     {label:'Сохранить',cls:'bp',fn:()=>{g.name=v('f-grn').trim()||g.name;saveKmGroups();closeModal();renderKmlPanel();}}]);
}
async function kmlDeleteGroup(gid) {
  const cnt = layers.filter(l=>l.group_id===gid).length;
  if (!await confirmDlg(`Удалить группу?${cnt?' Слои ('+cnt+' шт.) останутся без группы.':''}`)) return;
  layers.filter(l=>l.group_id===gid).forEach(l=>{l.group_id='';});
  delete kmGroups[gid];
  kmGroupOrder = kmGroupOrder.filter(x=>x!==gid);
  saveKmGroups(); renderKmlPanel();
}
function kmlCreateGroup() {
  showModal('Новая группа',
    `<div class="fg"><label>Название</label><input id="f-gnm" placeholder="Геология, Топография..."></div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},
     {label:'Создать',cls:'bp',fn:()=>{
       const nm=v('f-gnm').trim();if(!nm)return;
       const gid='g_'+Date.now();
       kmGroups[gid]={id:gid,name:nm,collapsed:false,site_ids:[]};
       kmGroupOrder.push(gid);
       saveKmGroups();closeModal();renderKmlPanel();
     }}]);
}
async function saveKmGroups(){
  Object.values(kmGroups).forEach(g=>{if(!g.site_ids)g.site_ids=g.site_id?[g.site_id]:[];});
  try{
    await fetch(`${API}/app-settings/kml_groups`,{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({value:{groups:kmGroups,order:kmGroupOrder}})});
  }catch(e){}
  try{localStorage.setItem('kml_groups',JSON.stringify({groups:kmGroups,order:kmGroupOrder}));}catch(e){}
}
async function loadKmGroups(){
  try{
    const r=await fetch(`${API}/app-settings/kml_groups`);
    const data=await r.json();
    if(data.value&&data.value.groups){
      kmGroups=data.value.groups;kmGroupOrder=data.value.order||[];
      Object.values(kmGroups).forEach(g=>{if(!g.site_ids)g.site_ids=g.site_id?[g.site_id]:[];});
      return;
    }
  }catch(e){}
  try{
    const d=JSON.parse(localStorage.getItem('kml_groups')||'{}');
    kmGroups=d.groups||{};kmGroupOrder=d.order||[];
    Object.values(kmGroups).forEach(g=>{if(!g.site_ids)g.site_ids=g.site_id?[g.site_id]:[];});
    if(Object.keys(kmGroups).length>0)saveKmGroups();
  }catch(e){kmGroups={};kmGroupOrder=[];}
}

// ── Привязать группу к объектам (мультивыбор) ──────────────
function kmlGroupBindSite(gid) {
  const g=kmGroups[gid];if(!g)return;
  if(!sites||!sites.length){toast('Нет объектов','err');return;}
  const cur=g.site_ids||[];
  const opts=sites.map(s=>
    `<label style="display:flex;align-items:center;gap:8px;padding:4px 2px;cursor:pointer">
      <input type="checkbox" value="${escAttr(s.id)}" ${cur.includes(s.id)?'checked':''}> ${esc(s.name)}
    </label>`).join('');
  showModal('🏗 Привязать группу к объектам',
    `<div style="max-height:260px;overflow-y:auto;padding-right:4px">${opts}</div>
     <div style="font-size:11px;color:var(--tx3);margin-top:8px">Слои этой группы видны только при выборе указанных объектов. Оставьте все снятыми — группа глобальная.</div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},
     {label:'Применить',cls:'bp',fn:()=>{
       const checked=[...document.querySelectorAll('#mbd input[type=checkbox]:checked')].map(el=>el.value);
       g.site_ids=checked;
       saveKmGroups();closeModal();renderKmlPanel();renderLayerGroups();
       toast(checked.length?`Группа привязана к ${checked.length} объект${checked.length===1?'у':'ам'}`:'Привязка снята','ok');
     }}]);
}

// ── Переименование слоя ─────────────────────────────────────
function kmlRenameLayer(id) {
  const l=layers.find(x=>x.id===id);if(!l)return;
  showModal('Переименовать слой',`<div class="fg"><label>Название</label><input id="f-lrn" value="${esc(l.name)}"></div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},
     {label:'Сохранить',cls:'bp',fn:async()=>{
       const nm=v('f-lrn').trim();if(!nm)return;
       l.name=nm;
       await fetch(`${API}/layers/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
         body:JSON.stringify({name:nm,color:l.color,visible:l.visible?1:0,symbol:l.symbol||'',group_id:l.group_id||'',line_dash:l.line_dash||'solid'})});
       closeModal();renderKmlPanel();toast('Переименовано','ok');
     }}]);
}

// ── Переместить в группу ────────────────────────────────────
async function kmlMoveToGroup(lid, gid) {
  const l=layers.find(x=>x.id===lid);if(!l)return;
  l.group_id=gid||'';
  await fetch(`${API}/layers/${lid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:l.name,color:l.color,visible:l.visible?1:0,symbol:l.symbol||'',group_id:l.group_id,line_dash:l.line_dash||'solid'})});
  renderKmlPanel();
}

// ── Удалить слой ────────────────────────────────────────────
async function kmlDeleteLayer(id) {
  if(!await confirmDlg('Удалить слой?'))return;
  if(lGroups[id])map.removeLayer(lGroups[id]);
  layers=layers.filter(l=>l.id!==id);renderKmlPanel();
  await apiDelUndo(`/layers/${id}`,'Слой удалён',async()=>{
    const fresh=await fetch(`${API}/layers`).then(r=>r.json()).catch(()=>[]);
    layers=fresh;renderKmlPanel();try{reloadKmlLayers();}catch(e){}
  });
}

// ── Контекстное меню слоя ───────────────────────────────────
function kmlLayerCtx(ev, id) {
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  const l=layers.find(x=>x.id===id);if(!l)return;
  const cx=ev.clientX,cy=ev.clientY;
  const moveToGroupItems=kmGroupOrder.length?[
    ...kmGroupOrder.map(gid=>({i:'📁',l:'В группу: '+esc(kmGroups[gid].name),f:()=>kmlMoveToGroup(id,gid)})),
  ]:[];
  const removeFromGroupItem=l.group_id?[{i:'📄',l:'Убрать из группы',f:()=>kmlMoveToGroup(id,null)}]:[];
  const groupItems=(moveToGroupItems.length||removeFromGroupItem.length)?[{sep:true},...moveToGroupItems,...removeFromGroupItem]:[];
  showCtx(cx,cy,[
    {i:'🗺',l:`<b>${esc(l.name)}</b>`,f:null},{sep:true},
    {i:_kmlExpanded.has(id)?'▼':'▶',l:_kmlExpanded.has(id)?'Свернуть объекты':'Показать объекты',f:()=>{if(!_kmlExpanded.has(id))_kmlExpanded.add(id);_kmlRenderLayerPane();}},
    {i:'🎨',l:'Стиль / условный знак',f:()=>kmlOpenStyleModal(id)},
    {i:'✏️',l:'Переименовать',f:()=>kmlRenameLayer(id)},
    {i:'🔍',l:'Приблизить к слою',f:()=>kmlZoomTo(id)},
    {i:l.visible?'🚫':'👁',l:l.visible?'Скрыть':'Показать',f:()=>kmlToggleVis(id,l.visible?0:1)},
    {i:'🏷',l:layerLabels[id]?'Скрыть подписи':'Показать подписи',f:()=>{toggleLayerLabels(id);renderKmlPanel();}},
    ...groupItems,{sep:true},
    {i:'🗑',l:'Удалить слой',cls:'dan',f:()=>kmlDeleteLayer(id)},
  ]);
}

// ── Контекстное меню группы ─────────────────────────────────
function kmlGroupCtx(ev, gid) {
  const g=kmGroups[gid];if(!g)return;
  const siteIds=g.site_ids||[];
  const bindItems=siteIds.length
    ?[{i:'🔓',l:'Отвязать от объектов',f:()=>{g.site_ids=[];saveKmGroups();renderKmlPanel();renderLayerGroups();}},
      {i:'🏗',l:'Изменить привязку…',f:()=>kmlGroupBindSite(gid)}]
    :[{i:'🏗',l:'Привязать к объектам…',f:()=>kmlGroupBindSite(gid)}];
  showCtx(ev.clientX,ev.clientY,[
    {i:'📁',l:`<b>${esc(g.name)}</b>`,f:null},{sep:true},
    {i:'✏️',l:'Переименовать',f:()=>kmlRenameGroup(gid)},
    {i:'👁',l:'Показать все',f:()=>kmlSetGroupVis(gid,1)},
    {i:'🚫',l:'Скрыть все',f:()=>kmlSetGroupVis(gid,0)},
    {sep:true},
    ...bindItems,
    {sep:true},
    {i:'🗑',l:'Удалить группу',cls:'dan',f:()=>kmlDeleteGroup(gid)},
  ]);
}

// ── Модалка стиля слоя ──────────────────────────────────────
function kmlOpenStyleModal(id) {
  const l=layers.find(x=>x.id===id);if(!l)return;
  const curSym=l.symbol||'point', curColor=l.color||'#1a56db', curDash=l.line_dash||'solid';
  const symGroups={};
  Object.entries(KML_SYMBOLS).forEach(([k,s])=>{
    if(!symGroups[s.group])symGroups[s.group]=[];
    symGroups[s.group].push({key:k,...s});
  });
  const symHtml=Object.entries(symGroups).map(([grpNm,syms])=>`
    <div style="margin-bottom:10px">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--tx3);margin-bottom:5px">${grpNm}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">
        ${syms.map(s=>`<div class="kml-sym-btn ${s.key===curSym?'on':''}" data-sym="${s.key}" onclick="kmlSelectSym(this)" title="${s.label}">
          <div class="kml-sym-inner" id="kml-sym-prev-${s.key}">${kmlSvgIcon(s.key,curColor,22)}</div></div>`).join('')}
      </div>
    </div>`).join('');
  const lineHtml=Object.entries(KML_LINE_STYLES).map(([k,s])=>
    `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:3px 0">
      <input type="radio" name="ldash" value="${k}" ${curDash===k?'checked':''}> ${s.label}</label>`).join('');
  const curMinZ = l.min_zoom != null ? l.min_zoom : 0;
  const curMaxZ = l.max_zoom != null ? l.max_zoom : 20;
  const curSize = l.size     != null ? l.size     : 1;
  const curFill = l.fill_opacity != null ? l.fill_opacity : 0.2;
  const curZ    = Math.round(map.getZoom());
  showModal(`🎨 Стиль слоя — ${esc(l.name)}`,`
    <div style="display:flex;gap:12px;margin-bottom:12px;align-items:flex-start">
      <div><label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px">Цвет</label>
        <input type="color" id="kml-style-color" value="${curColor}" style="width:50px;height:36px;border:1.5px solid var(--bd);border-radius:5px;cursor:pointer;padding:2px" oninput="kmlUpdateSymPreviews(this.value);var fp=document.getElementById('kml-fill-prev');if(fp)fp.style.background=this.value">
      </div>
      <div style="flex:1"><label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px">Линии/полигоны</label>${lineHtml}</div>
    </div>
    <div style="margin-bottom:12px">
      <label style="font-size:11px;font-weight:600;display:block;margin-bottom:6px">
        Заливка полигонов: <b id="kml-fill-val">${Math.round(curFill*100)}%</b>
      </label>
      <input type="range" id="kml-fill" min="0" max="100" step="5" value="${Math.round(curFill*100)}"
        style="width:100%;accent-color:var(--acc)"
        oninput="document.getElementById('kml-fill-val').textContent=this.value+'%';document.getElementById('kml-fill-prev').style.opacity=this.value/100">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:9px;color:var(--tx3);margin-top:2px">
        <span>0% (без заливки)</span>
        <div id="kml-fill-prev" style="width:44px;height:14px;border:1.5px solid var(--bd);border-radius:3px;background:${curColor};opacity:${curFill}"></div>
        <span>100% (сплошная)</span>
      </div>
    </div>
    <div style="margin-bottom:12px">
      <label style="font-size:11px;font-weight:600;display:block;margin-bottom:6px">
        Размер значков: <b id="kml-size-val">${curSize.toFixed(1)}×</b>
      </label>
      <input type="range" id="kml-size" min="0.3" max="3" step="0.1" value="${curSize}"
        style="width:100%;accent-color:var(--acc)"
        oninput="document.getElementById('kml-size-val').textContent=parseFloat(this.value).toFixed(1)+'×'">
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--tx3);margin-top:2px">
        <span>0.3× (мелко)</span><span>1.0× (норма)</span><span>3.0× (крупно)</span>
      </div>
    </div>
    <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:12px">
      <div style="flex:1">
        <label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px">Мин. зум</label>
        <input type="number" id="kml-min-zoom" min="0" max="20" value="${curMinZ}" style="width:100%;padding:5px 7px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:12px;background:var(--s);color:var(--tx)">
      </div>
      <div style="flex:1">
        <label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px">Макс. зум</label>
        <input type="number" id="kml-max-zoom" min="0" max="20" value="${curMaxZ}" style="width:100%;padding:5px 7px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:12px;background:var(--s);color:var(--tx)">
      </div>
      <div style="font-size:10px;color:var(--tx3);padding-bottom:7px;white-space:nowrap">сейчас: <b>${curZ}</b></div>
    </div>
    <label style="font-size:11px;font-weight:600;display:block;margin-bottom:6px">Условный знак для точек</label>
    <div id="kml-sym-grid" style="max-height:220px;overflow-y:auto;padding-right:4px">${symHtml}</div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},
     {label:'✅ Применить',cls:'bp',fn:async()=>{
       const color=document.getElementById('kml-style-color').value;
       const symEl=document.querySelector('.kml-sym-btn.on');
       const sym=symEl?symEl.dataset.sym:curSym;
       const dash=document.querySelector('input[name="ldash"]:checked')?.value||'solid';
       const minZ=Math.max(0,Math.min(20,parseInt(document.getElementById('kml-min-zoom').value)||0));
       const maxZ=Math.max(0,Math.min(20,parseInt(document.getElementById('kml-max-zoom').value)||20));
       const sz=Math.max(0.3,Math.min(3,parseFloat(document.getElementById('kml-size').value)||1));
       const fillOp=Math.max(0,Math.min(1,(parseInt(document.getElementById('kml-fill').value)||0)/100));
       l.color=color;l.symbol=sym;l.line_dash=dash;l.min_zoom=minZ;l.max_zoom=maxZ;l.size=sz;l.fill_opacity=fillOp;
       await fetch(`${API}/layers/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
         body:JSON.stringify({name:l.name,color,visible:l.visible?1:0,symbol:sym,group_id:l.group_id||'',line_dash:dash,min_zoom:minZ,max_zoom:maxZ,size:sz,fill_opacity:fillOp})});
       closeModal();renderLayerGroups();renderKmlPanel();toast('Стиль применён','ok');
     }}]);
}
function kmlSelectSym(el){document.querySelectorAll('.kml-sym-btn').forEach(b=>b.classList.remove('on'));el.classList.add('on');}
function kmlUpdateSymPreviews(color){Object.keys(KML_SYMBOLS).forEach(k=>{const el=document.getElementById('kml-sym-prev-'+k);if(el)el.innerHTML=kmlSvgIcon(k,color,22);});}

// ── ВЫДЕЛЕНИЕ ОБЛАСТИ: массовые действия над объектами KML ──
// ПКМ по карте → «Выделить объекты» → два клика (углы прямоугольника) →
// меню действий над всеми попавшими объектами: выполнено/цвет/имя/
// линия↔полигон/сброс/удаление. Изменения сохраняются послойно.
const KML_DONE_COLOR='#7ed321'; // ярко-зелёный (салатовый) — метка «выполнено»
let _ksActive=false,_ksPts=[],_ksTmp=null,_ksSel=null;
// Выделение произвольным полигоном: клики — вершины, ПКМ — меню (выделить/отмена)
function startKmlSelectMode(){
  _ksCleanup();
  _ksActive=true;_ksPts=[];
  map.getContainer().style.cursor='crosshair';
  const bnr=document.getElementById('bnr');
  bnr.className='show draw';
  document.getElementById('bnr-t').textContent='⬚ Выделение: кликайте вершины области · ПКМ — меню';
  map.on('click',_ksClick);
  toast('Обведите область кликами · ПКМ — завершить','ok');
}
function _ksClick(e){
  if(!_ksActive)return;
  _ksPts.push(e.latlng);
  _ksPreview();
}
function _ksPreview(){
  if(_ksTmp){try{map.removeLayer(_ksTmp);}catch(e){}_ksTmp=null;}
  if(!_ksPts.length)return;
  if(_ksPts.length>=3)
    _ksTmp=L.polygon(_ksPts,{color:'#7c3aed',weight:2,dashArray:'6 4',fillColor:'#7c3aed',fillOpacity:.08,interactive:false}).addTo(map);
  else
    _ksTmp=L.polyline(_ksPts,{color:'#7c3aed',weight:2,dashArray:'6 4',interactive:false}).addTo(map);
}
// ПКМ в режиме выделения (вызывается из onMapRClick)
function _ksRClick(e){
  const cx=e.originalEvent.clientX,cy=e.originalEvent.clientY;
  showCtx(cx,cy,[
    {i:'✅',l:'Выделить ('+_ksPts.length+' тчк)',f:()=>_ksFinish(cx,cy)},
    {i:'↩️',l:'Удалить последнюю точку',f:()=>{_ksPts.pop();_ksPreview();}},
    {sep:true},
    {i:'❌',l:'Отменить выделение',cls:'dan',f:_ksCancel},
  ]);
}
function _ksCancel(){
  _ksCleanup();
  toast('Выделение отменено','ok');
}
function _ksCleanup(){
  map.off('click',_ksClick);
  _ksActive=false;_ksPts=[];_ksSel=null;
  if(_ksTmp){try{map.removeLayer(_ksTmp);}catch(e){}_ksTmp=null;}
  map.getContainer().style.cursor='';
  const bnr=document.getElementById('bnr');if(bnr)bnr.className='';
}
function _ksFinish(cx,cy){
  if(_ksPts.length<3){toast('Нужно минимум 3 точки','err');return;}
  const poly=_ksPts.map(p=>[p.lat,p.lng]);
  // выходим из режима кликов, но полигон оставляем видимым, пока открыто меню
  map.off('click',_ksClick);
  _ksActive=false;
  map.getContainer().style.cursor='';
  const bnr=document.getElementById('bnr');if(bnr)bnr.className='';
  const sel=_ksCollect(poly);
  if(!sel.total){
    _ksCleanup();
    toast('В области нет объектов KML','err');
    return;
  }
  _ksSel=sel;
  // отложенно: чтобы клик по пункту меню не закрыл новое меню
  setTimeout(()=>_ksMenu(cx,cy),20);
}
// Точка внутри полигона (ray casting), poly=[[lat,lng],...]
function _ksPtInPoly(lat,lng,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const yi=poly[i][0],xi=poly[i][1],yj=poly[j][0],xj=poly[j][1];
    if(((yi>lat)!==(yj>lat))&&(lng<(xj-xi)*(lat-yi)/(yj-yi)+xi))inside=!inside;
  }
  return inside;
}
// Пересекаются ли отрезки p1-p2 и p3-p4 (точки [x,y])
function _ksSegHit(p1,p2,p3,p4){
  const d=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const d1=d(p3,p4,p1),d2=d(p3,p4,p2),d3=d(p1,p2,p3),d4=d(p1,p2,p4);
  if(((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0)))return true;
  const on=(a,b,c)=>Math.min(a[0],b[0])<=c[0]&&c[0]<=Math.max(a[0],b[0])&&Math.min(a[1],b[1])<=c[1]&&c[1]<=Math.max(a[1],b[1]);
  if(d1===0&&on(p3,p4,p1))return true;
  if(d2===0&&on(p3,p4,p2))return true;
  if(d3===0&&on(p1,p2,p3))return true;
  if(d4===0&&on(p1,p2,p4))return true;
  return false;
}
// Собирает из геометрии список «путей» в формате [[lat,lng],...] (для Point — одна точка)
function _ksGeomPaths(geom,out){
  if(!geom)return;
  if(geom.type==='GeometryCollection'){(geom.geometries||[]).forEach(g=>_ksGeomPaths(g,out));return;}
  const t=geom.type,c=geom.coordinates;if(!c)return;
  const asLL=ring=>ring.map(p=>[p[1],p[0]]); // [lng,lat] → [lat,lng]
  if(t==='Point')out.push([[c[1],c[0]]]);
  else if(t==='MultiPoint')c.forEach(p=>out.push([[p[1],p[0]]]));
  else if(t==='LineString')out.push(asLL(c));
  else if(t==='MultiLineString')c.forEach(l=>out.push(asLL(l)));
  else if(t==='Polygon')c.forEach(r=>out.push(asLL(r)));
  else if(t==='MultiPolygon')c.forEach(poly=>poly.forEach(r=>out.push(asLL(r))));
}
// Пересекается ли геометрия объекта с полигоном выделения poly=[[lat,lng],...]
// Учитывает ЧАСТИЧНОЕ попадание: вершина объекта в контуре, ИЛИ пересечение
// рёбер, ИЛИ контур целиком внутри объекта-полигона.
function _ksGeomInPoly(geom,poly){
  if(!geom||!poly||poly.length<3)return false;
  const paths=[];
  try{_ksGeomPaths(geom,paths);}catch(e){return false;}
  const asXY=ll=>[ll[1],ll[0]];             // [lat,lng] → [x=lng,y=lat] для сегментов
  const polyXY=poly.map(asXY);
  for(const path of paths){
    // 1) любая вершина объекта внутри контура
    for(const pt of path){ if(_ksPtInPoly(pt[0],pt[1],poly))return true; }
    // 2) пересечение рёбер объекта с рёбрами контура (частичное попадание)
    if(path.length>=2){
      for(let i=0;i<path.length-1;i++){
        const a=asXY(path[i]),b=asXY(path[i+1]);
        for(let j=0,k=polyXY.length-1;j<polyXY.length;k=j++){
          if(_ksSegHit(a,b,polyXY[k],polyXY[j]))return true;
        }
      }
    }
    // 3) контур целиком внутри объекта-полигона (кольцо >=4 точек, замкнуто)
    if(path.length>=4){
      const f=path[0],l=path[path.length-1];
      const closed=Math.abs(f[0]-l[0])<1e-9&&Math.abs(f[1]-l[1])<1e-9;
      if(closed&&_ksPtInPoly(poly[0][0],poly[0][1],path))return true;
    }
  }
  return false;
}
// Собирает выделение: по каждому видимому KML-слою — индексы попавших фигур
function _ksCollect(poly){
  const entries=[];let total=0,lines=0,polys=0;
  for(const [gid,g] of Object.entries(lGroups||{})){
    if(!g||!map.hasLayer(g))continue;
    const isSite=String(gid).startsWith('s_');
    const lid=isSite?String(gid).slice(2):gid;
    const rec=isSite?(siteLayerCache[lid]||null):(layers||[]).find(x=>x.id===lid);
    if(!rec||!rec.geojson)continue;
    let gj;try{gj=JSON.parse(rec.geojson);}catch(e){continue;}
    if(!gj.features){
      if(gj.type==='Feature')gj={type:'FeatureCollection',features:[gj]};
      else gj={type:'FeatureCollection',features:[{type:'Feature',geometry:gj,properties:{}}]};
    }
    const idxs=[];
    (gj.features||[]).forEach((f,i)=>{
      if(!f||!_ksGeomInPoly(f.geometry,poly))return;
      idxs.push(i);
      const t=f.geometry&&f.geometry.type;
      if(t==='LineString')lines++;
      else if(t==='Polygon')polys++;
    });
    if(idxs.length){entries.push({gid,isSite,rec,gj,idxs});total+=idxs.length;}
  }
  return {entries,total,lines,polys};
}
function _ksMenu(cx,cy){
  const s=_ksSel;if(!s)return;
  window._ctxKeepUntil=Date.now()+400; // не дать «хвосту» клика закрыть меню
  const items=[
    {i:'⬚',l:`<b>Выделено: ${s.total} объект(ов)</b>`,f:null,html:true},
    {sep:true},
    {i:'✅',l:'Перевести в выполненные',f:()=>_ksApply('Выполнено',f=>{
      f.properties._color=KML_DONE_COLOR;f.properties.comment='Выполнено';f.properties._done=1;})},
    {i:'🎨',l:'Изменить цвет…',f:_ksColorModal},
    {i:'🏷',l:'Переименовать…',f:_ksRenameModal},
    {i:'↩️',l:'Снять «выполнено» / инд. цвет',f:()=>_ksApply('Сброшено',f=>{
      delete f.properties._color;
      if(f.properties.comment==='Выполнено')delete f.properties.comment;
      if(f.properties._done)delete f.properties._done;})},
  ];
  if(s.lines)items.push({i:'⬛',l:`Линии → полигоны (${s.lines})`,f:()=>_ksApply('Преобразовано',f=>{
    const g=f.geometry;
    if(!g||g.type!=='LineString')return;
    const coords=(g.coordinates||[]).map(c=>c.slice());
    if(coords.length<3)return;
    const a=coords[0],b=coords[coords.length-1];
    if(Math.abs(a[0]-b[0])>1e-9||Math.abs(a[1]-b[1])>1e-9)coords.push([a[0],a[1]]);
    f.geometry={type:'Polygon',coordinates:[coords]};
  })});
  if(s.polys)items.push({i:'〰️',l:`Полигоны → линии (${s.polys})`,f:()=>_ksApply('Преобразовано',f=>{
    const g=f.geometry;
    if(!g||g.type!=='Polygon')return;
    const ring=(g.coordinates&&g.coordinates[0])||[];
    if(ring.length<3)return;
    f.geometry={type:'LineString',coordinates:ring.map(c=>c.slice())};
  })});
  items.push({sep:true});
  items.push({i:'🗑',l:'Удалить объекты',cls:'dan',f:_ksDelete});
  items.push({i:'✕',l:'Отмена',f:()=>{_ksCleanup();}});
  showCtx(cx,cy,items);
}
// Применяет мутатор к каждой выделенной фигуре и сохраняет изменённые слои
async function _ksApply(label,mutator){
  const s=_ksSel;if(!s)return;
  let seq=0;const saves=[];
  s.entries.forEach(en=>{
    en.idxs.forEach(i=>{
      const f=en.gj.features[i];if(!f)return;
      if(!f.properties)f.properties={};
      seq++;mutator(f,seq,s.total);
    });
    saves.push(_kmlSaveGeojson(en.rec,en.gj).then(()=>{_ksRerenderEntry(en);})
      .catch(()=>toast('Ошибка сохранения слоя «'+(en.rec.name||'')+'»','err')));
  });
  await Promise.all(saves);
  renderLayerGroups();
  toast(label+': '+s.total+' объект(ов)','ok');
  _ksCleanup();
}
// Перерисовать слой объекта на месте (глобальные перерисует renderLayerGroups)
function _ksRerenderEntry(en){
  if(!en.isSite||!lGroups[en.gid])return;
  try{map.removeLayer(lGroups[en.gid]);}catch(e){}
  try{
    const rec=en.rec,gj=en.gj;
    lGroups[en.gid]=L.geoJSON(gj,{
      style:f=>({color:(f&&f.properties&&f.properties._color)||rec.color||'#1a56db',weight:2.5,opacity:.85,
        fillOpacity:rec.fill_opacity!=null?rec.fill_opacity:.2}),
      pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:6,
        fillColor:(f&&f.properties&&f.properties._color)||rec.color||'#1a56db',color:'#fff',weight:2,fillOpacity:.9})
    }).addTo(map);
  }catch(e){}
}
function _ksColorModal(){
  const s=_ksSel;if(!s)return;
  const PRESETS=['#16a34a','#1a56db','#7c3aed','#c81e1e','#d97706','#0891b2','#be185d','#374151','#f97316','#eab308'];
  showModal('🎨 Цвет для '+s.total+' объектов',
    `<div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px">
      ${PRESETS.map(c=>`<div onclick="document.getElementById('ks-color').value='${c}'"
        style="width:30px;height:30px;border-radius:50%;background:${c};cursor:pointer;border:2px solid var(--bd)"></div>`).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <input type="color" id="ks-color" value="#16a34a" style="width:46px;height:34px;border:1.5px solid var(--bd);border-radius:5px;cursor:pointer;padding:2px">
      <span style="font-size:11px;color:var(--tx2)">или выберите свой цвет</span>
    </div>`,
    [{label:'Отмена',cls:'bs',fn:()=>{closeModal();_ksCleanup();}},
     {label:'Применить',cls:'bp',fn:()=>{
       const c=document.getElementById('ks-color').value;
       closeModal();
       _ksApply('Цвет изменён',f=>{f.properties._color=c;});
     }}]);
}
function _ksRenameModal(){
  const s=_ksSel;if(!s)return;
  showModal('🏷 Переименовать '+s.total+' объект(ов)',
    `<div class="fg"><label>Шаблон имени</label>
      <input id="ks-name" placeholder="Скв-{n}" autocomplete="off">
    </div>
    <div style="font-size:10px;color:var(--tx3);margin-top:6px;line-height:1.6">
      <b>{n}</b> — порядковый номер (1, 2, 3…). Примеры:<br>
      «Скв-{n}» → Скв-1, Скв-2… · «ТК {n} выполнена» → ТК 1 выполнена…<br>
      Без {n} и при нескольких объектах номер добавится в конец автоматически.
    </div>
    <div class="fg" style="margin-top:8px"><label>Начать нумерацию с</label>
      <input id="ks-num" type="number" value="1" style="width:90px">
    </div>`,
    [{label:'Отмена',cls:'bs',fn:()=>{closeModal();_ksCleanup();}},
     {label:'Переименовать',cls:'bp',fn:()=>{
       const tpl=(document.getElementById('ks-name').value||'').trim();
       if(!tpl){toast('Введите имя','err');return;}
       const start=parseInt(document.getElementById('ks-num').value)||1;
       closeModal();
       _ksApply('Переименовано',(f,seq,total)=>{
         const n=start+seq-1;
         let nm;
         if(tpl.includes('{n}'))nm=tpl.replace(/\{n\}/g,n);
         else nm=total>1?tpl+'-'+n:tpl;
         f.properties.name=nm;
         if('Name' in f.properties)f.properties.Name=nm;
       });
     }}]);
}
async function _ksDelete(){
  const s=_ksSel;if(!s)return;
  if(!await confirmDlg('Удалить '+s.total+' объект(ов) из слоёв KML? Действие необратимо.'))
    {_ksCleanup();return;}
  const saves=[];
  s.entries.forEach(en=>{
    const del=new Set(en.idxs);
    en.gj.features=en.gj.features.filter((f,i)=>!del.has(i));
    saves.push(_kmlSaveGeojson(en.rec,en.gj).then(()=>{_ksRerenderEntry(en);})
      .catch(()=>toast('Ошибка сохранения слоя','err')));
  });
  Promise.all(saves).then(()=>{
    renderLayerGroups();
    toast('🗑 Удалено: '+s.total+' объект(ов)','ok');
    _ksCleanup();
  });
}

// ── Преобразование линия ↔ полигон ──────────────────────────
// Сохраняет geojson слоя на сервере (все поля стиля передаём, чтобы ничего не сбросить)
async function _kmlSaveGeojson(l, gj){
  await fetch(`${API}/layers/${l.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:l.name,color:l.color,visible:l.visible?1:0,symbol:l.symbol||'',
      group_id:l.group_id||'',line_dash:l.line_dash||'solid',min_zoom:l.min_zoom,max_zoom:l.max_zoom,
      size:l.size,show_labels:l.show_labels?1:0,fill_opacity:l.fill_opacity,geojson:JSON.stringify(gj)})});
  l.geojson=JSON.stringify(gj);
}
// Замкнутая (или замыкаемая) KML-линия → полигон: появляется заливка (настройка в «Стиль слоя»)
async function kmlLineToPolygon(layerId, fIdx){
  const l=layers.find(x=>x.id===layerId);if(!l)return;
  let gj;try{gj=JSON.parse(l.geojson);}catch(e){toast('Ошибка разбора слоя','err');return;}
  const features=gj.type==='FeatureCollection'?gj.features:[gj];
  const f=features[fIdx];
  if(!f||!f.geometry||f.geometry.type!=='LineString'){toast('Это не линия','err');return;}
  const coords=(f.geometry.coordinates||[]).map(c=>c.slice());
  if(coords.length<3){toast('Нужно минимум 3 точки','err');return;}
  const a=coords[0],b=coords[coords.length-1];
  const wasClosed=Math.abs(a[0]-b[0])<1e-9&&Math.abs(a[1]-b[1])<1e-9;
  if(!wasClosed)coords.push([a[0],a[1]]); // автозамыкание
  f.geometry={type:'Polygon',coordinates:[coords]};
  try{
    await _kmlSaveGeojson(l,gj);
    renderLayerGroups();
    toast(wasClosed?'⬛ Линия преобразована в полигон':'⬛ Линия замкнута и преобразована в полигон','ok');
  }catch(e){toast('Ошибка сохранения','err');}
}
// Обратное преобразование: полигон (внешнее кольцо) → линия
async function kmlPolygonToLine(layerId, fIdx){
  const l=layers.find(x=>x.id===layerId);if(!l)return;
  let gj;try{gj=JSON.parse(l.geojson);}catch(e){toast('Ошибка разбора слоя','err');return;}
  const features=gj.type==='FeatureCollection'?gj.features:[gj];
  const f=features[fIdx];
  if(!f||!f.geometry||f.geometry.type!=='Polygon'){toast('Это не полигон','err');return;}
  const ring=(f.geometry.coordinates&&f.geometry.coordinates[0])||[];
  if(ring.length<3){toast('Пустой полигон','err');return;}
  f.geometry={type:'LineString',coordinates:ring.map(c=>c.slice())};
  try{
    await _kmlSaveGeojson(l,gj);
    renderLayerGroups();
    toast('〰️ Полигон преобразован в линию','ok');
  }catch(e){toast('Ошибка сохранения','err');}
}

// «Выполнить объект»: красит один объект слоя в салатовый и ставит
// комментарий «Выполнено» (повторный вызов снимает отметку).
async function kmlToggleDone(layerId, fIdx){
  const l=layers.find(x=>x.id===layerId);if(!l)return;
  let gj;try{gj=JSON.parse(l.geojson);}catch(e){toast('Ошибка разбора слоя','err');return;}
  const features=gj.type==='FeatureCollection'?gj.features:[gj];
  const f=features[fIdx];if(!f)return;
  if(!f.properties)f.properties={};
  const done=f.properties._color===KML_DONE_COLOR;
  if(done){
    // снять «выполнено»
    delete f.properties._color;
    if(f.properties.comment==='Выполнено')delete f.properties.comment;
    if(f.properties._done)delete f.properties._done;
  } else {
    f.properties._color=KML_DONE_COLOR;
    f.properties.comment='Выполнено';
    f.properties._done=1;
  }
  try{
    await _kmlSaveGeojson(l,gj);
    renderLayerGroups();
    toast(done?'↩️ Отметка «выполнено» снята':'✅ Объект выполнен','ok');
  }catch(e){toast('Ошибка сохранения','err');}
}

// ══════════════════════════════════════════════════════════════
// РЕДАКТОР ОБЪЕКТОВ СЛОЯ (Feature List)
// ══════════════════════════════════════════════════════════════
function kmlOpenFeatureList(id) {
  const l = layers.find(x => x.id === id);
  if (!l) return;
  let gj;
  try { gj = JSON.parse(l.geojson); } catch(e) { toast('Ошибка разбора слоя', 'err'); return; }
  const features = gj.type === 'FeatureCollection' ? gj.features : [gj];
  if (!features.length) { toast('Слой пустой', 'err'); return; }

  const pts  = features.filter(f => f.geometry && f.geometry.type === 'Point').length;
  const lns  = features.filter(f => f.geometry && f.geometry.type === 'LineString').length;
  const pols = features.filter(f => f.geometry && f.geometry.type === 'Polygon').length;
  const hiddenCount = features.filter(f => f.properties?._hidden).length;

  const typeIcon = geomType => geomType === 'Point' ? '📍' : geomType === 'LineString' ? '〰️' : '⬡';

  const rowsHtml = features.map((f, idx) => {
    const props    = f.properties || {};
    const nm       = props.name  || props.Name || `Объект ${idx + 1}`;
    const desc     = props.description || props.desc || '';
    const fSym     = props._sym   || l.symbol  || 'point';
    const fColor   = props._color || l.color   || '#1a56db';
    const isHidden = !!props._hidden;
    const geomType = f.geometry ? f.geometry.type : '?';
    const preview  = geomType === 'Point' ? kmlSvgIcon(fSym, fColor, 20) : typeIcon(geomType);
    let coordLabel = '';
    try {
      if (geomType === 'Point') {
        const [lng, lat] = f.geometry.coordinates;
        coordLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      } else if (geomType === 'LineString') {
        coordLabel = `${f.geometry.coordinates.length} точек`;
      } else if (geomType === 'Polygon') {
        coordLabel = `${(f.geometry.coordinates[0]||[]).length} вершин`;
      }
    } catch(e) {}

    return `<div class="kfl-row" data-fidx="${idx}" data-name="${esc(nm.toLowerCase())}" style="${isHidden?'opacity:.45':''}">
      <div class="kfl-sym">${preview}</div>
      <div class="kfl-info">
        <div class="kfl-name">${esc(nm)}</div>
        ${desc ? `<div class="kfl-desc">${esc(desc)}</div>` : ''}
        <div class="kfl-coord">${esc(coordLabel)}</div>
      </div>
      <div class="kfl-actions">
        <button class="kml-icon-btn kfl-vis-btn" onclick="kmlToggleFeatureVis('${id}',${idx})" title="${isHidden?'Показать объект':'Скрыть объект'}">${isHidden?'👁':'🚫'}</button>
        <button class="kml-icon-btn" onclick="kmlZoomToFeature('${id}',${idx})" title="Приблизить">🔍</button>
        <button class="kml-icon-btn" onclick="kmlEditFeature('${id}',${idx})" title="Редактировать">✏️</button>
        <button class="kml-icon-btn" style="color:var(--red);opacity:.7" onclick="kmlDeleteFeature('${id}',${idx})" title="Удалить">🗑</button>
      </div>
    </div>`;
  }).join('');

  const html = `
    <div class="kfl-header">
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
        <input id="kfl-search" type="text" placeholder="Поиск по названию…"
          style="flex:1;padding:5px 8px;border:1px solid var(--bd);border-radius:5px;background:var(--bg);color:var(--tx);font-size:13px"
          oninput="kflSearch(this.value)">
        <button class="btn bs" style="font-size:12px;padding:4px 8px;white-space:nowrap"
          title="Показать все объекты" onclick="kmlSetAllFeaturesVis('${id}',false)">👁 Все</button>
        <button class="btn bs" style="font-size:12px;padding:4px 8px;white-space:nowrap"
          title="Скрыть все объекты" onclick="kmlSetAllFeaturesVis('${id}',true)">🚫 Все</button>
      </div>
      <span style="font-size:11px;color:var(--tx3)">
        ${pts ? `📍 ${pts}  ` : ''}${lns ? `〰️ ${lns}  ` : ''}${pols ? `⬡ ${pols}  ` : ''}${hiddenCount ? `🚫 скрыто: ${hiddenCount}` : ''}
      </span>
    </div>
    <div class="kfl-list" id="kfl-list">${rowsHtml}</div>`;

  showModal(`📋 Объекты слоя — ${esc(l.name)}`, html,
    [{label:'Закрыть',cls:'bs',fn:closeModal}]);
}

function kflSearch(query) {
  const q = (query || '').toLowerCase().trim();
  document.querySelectorAll('#kfl-list .kfl-row').forEach(row => {
    const nm = row.dataset.name || '';
    row.style.display = (!q || nm.includes(q)) ? '' : 'none';
  });
}

async function kmlSetAllFeaturesVis(layerId, hidden) {
  const l = layers.find(x => x.id === layerId);
  if (!l) return;
  let gj;
  try { gj = JSON.parse(l.geojson); } catch(e) { return; }
  const features = gj.type === 'FeatureCollection' ? gj.features : [gj];
  features.forEach(f => {
    if (!f.properties) f.properties = {};
    if (hidden) f.properties._hidden = true;
    else delete f.properties._hidden;
  });
  const newGeojson = JSON.stringify(gj);
  l.geojson = newGeojson;
  await fetch(`${API}/layers/${layerId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: l.name, color: l.color, visible: l.visible ? 1 : 0,
      symbol: l.symbol||'', group_id: l.group_id||'', line_dash: l.line_dash||'solid',
      min_zoom: l.min_zoom||0, max_zoom: l.max_zoom||20, size: l.size||1,
      geojson: newGeojson }),
  });
  renderLayerGroupsWithSymbols();
  // Обновляем все строки в модалке без пересоздания
  document.querySelectorAll('#kfl-list .kfl-row').forEach(row => {
    row.style.opacity = hidden ? '0.45' : '';
    const btn = row.querySelector('.kfl-vis-btn');
    if (btn) { btn.textContent = hidden ? '👁' : '🚫'; btn.title = hidden ? 'Показать объект' : 'Скрыть объект'; }
  });
  // Обновляем счётчик скрытых
  const total = features.length;
  const span = document.querySelector('.kfl-header span');
  if (span) {
    const pts  = features.filter(f => f.geometry?.type === 'Point').length;
    const lns  = features.filter(f => f.geometry?.type === 'LineString').length;
    const pols = features.filter(f => f.geometry?.type === 'Polygon').length;
    span.innerHTML = `${pts ? `📍 ${pts}  ` : ''}${lns ? `〰️ ${lns}  ` : ''}${pols ? `⬡ ${pols}  ` : ''}${hidden ? `🚫 скрыто: ${total}` : ''}`;
  }
}

// ── Приблизить к конкретному feature ───────────────────────
function kmlZoomToFeature(layerId, fIdx) {
  const l = layers.find(x => x.id === layerId);
  if (!l) return;
  try {
    const gj = JSON.parse(l.geojson);
    const features = gj.type === 'FeatureCollection' ? gj.features : [gj];
    const f = features[fIdx];
    if (!f || !f.geometry) return;
    if (f.geometry.type === 'Point') {
      const [lng, lat] = f.geometry.coordinates;
      map.flyTo([lat, lng], 17, {animate: true});
    } else {
      // для линий/полигонов строим bounds
      const allCoords = f.geometry.type === 'LineString'
        ? f.geometry.coordinates
        : f.geometry.coordinates[0];
      const lats = allCoords.map(c => c[1]), lngs = allCoords.map(c => c[0]);
      map.flyToBounds([[Math.min(...lats), Math.min(...lngs)],[Math.max(...lats), Math.max(...lngs)]], {padding:[40,40]});
    }
  } catch(e) { toast('Не удалось приблизить', 'err'); }
}

// ── Редактировать отдельный feature ────────────────────────
function kmlEditFeature(layerId, fIdx, mode) {
  const inline = mode === 'inline';
  const l = layers.find(x => x.id === layerId);
  if (!l) return;
  let gj;
  try { gj = JSON.parse(l.geojson); } catch(e) { return; }
  const features = gj.type === 'FeatureCollection' ? gj.features : [gj];
  const f = features[fIdx];
  if (!f) return;
  const props    = f.properties || {};
  const nm       = props.name  || props.Name || '';
  const desc     = props.description || props.desc || '';
  const geomType = f.geometry ? f.geometry.type : '';
  const isPoint  = geomType === 'Point';
  const fSym     = props._sym   || l.symbol  || 'point';
  const fColor   = props._color || l.color   || '#1a56db';
  const fSize    = props._size  != null ? props._size : (l.size != null ? l.size : 1);

  // Строим сетку символов для выбора
  const symGroups = {};
  Object.entries(KML_SYMBOLS).forEach(([k,s]) => {
    if (!symGroups[s.group]) symGroups[s.group] = [];
    symGroups[s.group].push({key:k,...s});
  });
  const symGrid = isPoint ? `
    <div style="margin-top:12px">
      <label style="font-size:11px;font-weight:600;display:block;margin-bottom:6px">Условный знак</label>
      <div id="kfl-sym-grid" style="max-height:220px;overflow-y:auto">
        ${Object.entries(symGroups).map(([grpNm,syms])=>`
          <div style="margin-bottom:8px">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--tx3);margin-bottom:4px">${grpNm}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${syms.map(s=>`<div class="kml-sym-btn kfl-sym-sel ${s.key===fSym?'on':''}" data-sym="${s.key}" onclick="kflSelectSym(this)" title="${s.label}">
                <div id="kfl-sp-${s.key}">${kmlSvgIcon(s.key,fColor,20)}</div></div>`).join('')}
            </div>
          </div>`).join('')}
      </div>
    </div>` : '';

  const html = `
    <div class="fgr">
      <div class="fg"><label>Название</label><input id="kfl-nm" value="${esc(nm)}"></div>
      <div class="fg"><label>Описание</label><textarea id="kfl-desc" rows="2" style="width:100%;resize:vertical">${esc(desc)}</textarea></div>
      <div class="fg"><label>Цвет объекта</label>
        <input type="color" id="kfl-color" value="${fColor}" style="width:50px;height:32px;border:1.5px solid var(--bd);border-radius:5px;cursor:pointer;padding:2px"
          oninput="document.querySelectorAll('[id^=kfl-sp-]').forEach(el=>{const k=el.id.replace('kfl-sp-','');el.innerHTML=kmlSvgIcon(k,this.value,20);})">
        <span style="font-size:10px;color:var(--tx3);margin-left:6px">Переопределяет цвет слоя для этого объекта</span>
      </div>
      ${isPoint ? `<div class="fg"><label>Размер знака: <b id="kfl-szv">${fSize.toFixed(1)}×</b></label>
        <input type="range" id="kfl-size" min="0.3" max="4" step="0.1" value="${fSize}"
          oninput="document.getElementById('kfl-szv').textContent=parseFloat(this.value).toFixed(1)+'×'">
      </div>` : ''}
      ${symGrid}
    </div>`;

  showModal(`✏️ Редактировать — ${esc(nm||'Объект')}`, html, [
    {label:'Отмена',cls:'bs',fn:()=>{closeModal();if(inline){if(kmlPanelOpen)_kmlRenderLayerPane();}else kmlOpenFeatureList(layerId);}},
    {label:'💾 Сохранить',cls:'bp',fn:async()=>{
      const newNm   = document.getElementById('kfl-nm').value.trim() || nm;
      const newDesc = document.getElementById('kfl-desc').value.trim();
      const newColor= document.getElementById('kfl-color').value;
      const symEl   = isPoint ? document.querySelector('.kfl-sym-sel.on') : null;
      const newSym  = symEl ? symEl.dataset.sym : (isPoint ? fSym : null);
      const newSize = isPoint ? parseFloat(document.getElementById('kfl-size').value) : null;

      // Обновляем properties в GeoJSON
      if (!f.properties) f.properties = {};
      f.properties.name = newNm;
      if (newDesc) f.properties.description = newDesc; else delete f.properties.description;
      if (newColor && newColor !== l.color) f.properties._color = newColor;
      else delete f.properties._color;
      if (isPoint && newSym && newSym !== l.symbol) f.properties._sym = newSym;
      else delete f.properties._sym;
      if (isPoint && newSize != null && Math.abs(newSize - (l.size ?? 1)) > 0.05) f.properties._size = newSize;
      else delete f.properties._size;

      // Сохраняем весь слой обратно
      const newGeojson = JSON.stringify(gj);
      await fetch(`${API}/layers/${layerId}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:l.name,color:l.color,visible:l.visible?1:0,
          symbol:l.symbol||'',group_id:l.group_id||'',line_dash:l.line_dash||'solid',geojson:newGeojson})});
      l.geojson = newGeojson;
      renderLayerGroups();
      toast('Сохранено','ok');
      closeModal();
      if (inline) { if (kmlPanelOpen) _kmlRenderLayerPane(); }
      else kmlOpenFeatureList(layerId);  // возврат к списку
    }}
  ]);
}
function kflSelectSym(el){document.querySelectorAll('.kfl-sym-sel').forEach(b=>b.classList.remove('on'));el.classList.add('on');}

// ── Скрыть/показать отдельный feature ──────────────────────
async function kmlToggleFeatureVis(layerId, fIdx) {
  const l = layers.find(x => x.id === layerId);
  if (!l) return;
  let gj;
  try { gj = JSON.parse(l.geojson); } catch(e) { return; }
  const features = gj.type === 'FeatureCollection' ? gj.features : [gj];
  const f = features[fIdx];
  if (!f) return;
  if (!f.properties) f.properties = {};
  const nowHidden = !f.properties._hidden;
  if (nowHidden) f.properties._hidden = true;
  else delete f.properties._hidden;
  const newGeojson = JSON.stringify(gj);
  l.geojson = newGeojson;
  await fetch(`${API}/layers/${layerId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: l.name, color: l.color, visible: l.visible ? 1 : 0,
      symbol: l.symbol||'', group_id: l.group_id||'', line_dash: l.line_dash||'solid',
      min_zoom: l.min_zoom||0, max_zoom: l.max_zoom||20, size: l.size||1,
      geojson: newGeojson }),
  });
  renderLayerGroupsWithSymbols();
  // Обновляем только строку в модалке без пересоздания (сохраняет позицию скролла)
  const row = document.querySelector(`.kfl-row[data-fidx="${fIdx}"]`);
  if (row) {
    row.style.opacity = nowHidden ? '0.45' : '';
    const btn = row.querySelector('.kfl-vis-btn');
    if (btn) { btn.textContent = nowHidden ? '👁' : '🚫'; btn.title = nowHidden ? 'Показать объект' : 'Скрыть объект'; }
  }
  // Обновляем счётчик скрытых в заголовке
  const span = document.querySelector('.kfl-header span');
  if (span) {
    const hc = features.filter(f2 => f2.properties?._hidden).length;
    const pts = features.filter(f2 => f2.geometry?.type === 'Point').length;
    const lns = features.filter(f2 => f2.geometry?.type === 'LineString').length;
    const pols = features.filter(f2 => f2.geometry?.type === 'Polygon').length;
    span.innerHTML = `${pts ? `📍 ${pts}  ` : ''}${lns ? `〰️ ${lns}  ` : ''}${pols ? `⬡ ${pols}  ` : ''}${hc ? `🚫 скрыто: ${hc}` : ''}`;
  }
  // Обновляем иерархию в панели (если слой раскрыт)
  if (kmlPanelOpen && _kmlExpanded.has(layerId)) _kmlRenderLayerPane();
}

// ── Удалить отдельный feature ───────────────────────────────
async function kmlDeleteFeature(layerId, fIdx, mode) {
  const inline = mode === 'inline';
  if (!await confirmDlg('Удалить этот объект из слоя?')) return;
  const l = layers.find(x => x.id === layerId);
  if (!l) return;
  let gj;
  try { gj = JSON.parse(l.geojson); } catch(e) { return; }
  if (gj.type === 'FeatureCollection') {
    gj.features.splice(fIdx, 1);
  }
  const newGeojson = JSON.stringify(gj);
  await fetch(`${API}/layers/${layerId}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:l.name,color:l.color,visible:l.visible?1:0,
      symbol:l.symbol||'',group_id:l.group_id||'',line_dash:l.line_dash||'solid',geojson:newGeojson})});
  l.geojson = newGeojson;
  renderLayerGroups();
  toast('Объект удалён','ok');
  if (inline) { if (kmlPanelOpen) _kmlRenderLayerPane(); }
  else kmlOpenFeatureList(layerId);  // обновить список
}

// ── Импорт ─────────────────────────────────────────────────
function kmlPanelImport(evt) {
  importLayer(evt);
  setTimeout(renderKmlPanel, 500);
}

// ══════════════════════════════════════════════════════════════
// ИКОНКИ — создание слоя и размещение на карте
// ══════════════════════════════════════════════════════════════

// Глобальный ID слоя, в который сейчас размещаем иконки
let _kmlPlacingLayerId = null;
let _kmlPlacementHandler = null;
let _kmlPlacementEscHandler = null;

async function kmlCreateIconLayer() {
  showModal('Новый слой иконок',
    `<div class="fg"><label>Название</label><input id="kml-icon-nm" placeholder="КПП, Посты охраны…"></div>
     <div class="fg"><label>Цвет по умолчанию</label>
       <input type="color" id="kml-icon-col" value="#e53935" style="width:50px;height:32px;border:1.5px solid var(--bd);border-radius:5px;cursor:pointer;padding:2px">
     </div>`,
    [
      {label:'Отмена',cls:'bs',fn:closeModal},
      {label:'Создать',cls:'bp',fn:async()=>{
        const nm = document.getElementById('kml-icon-nm').value.trim();
        if (!nm) return toast('Укажите название','warn');
        const col = document.getElementById('kml-icon-col').value;
        closeModal();
        const emptyGJ = JSON.stringify({type:'FeatureCollection',features:[]});
        const r = await fetch(`${API}/layers`,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({name:nm,geojson:emptyGJ,color:col,symbol:'star',visible:1,
            group_id:'',line_dash:'solid',min_zoom:null,max_zoom:null,size:1})});
        const {id} = await r.json();
        layers.unshift({id,name:nm,geojson:emptyGJ,color:col,symbol:'star',visible:1,
          group_id:'',line_dash:'solid',min_zoom:null,max_zoom:null,size:1});
        renderKmlPanel();
        renderLayerGroups();
        toast('Слой создан. Нажмите 📌 на слое для размещения иконок.','ok');
      }}
    ]);
}

function kmlStartPlacement(layerId) {
  if (_kmlPlacingLayerId === layerId) { kmlCancelPlacement(); return; }
  kmlCancelPlacement();
  _kmlPlacingLayerId = layerId;
  const l = layers.find(x=>x.id===layerId);
  map.getContainer().style.cursor = 'crosshair';
  toast(`📌 Кликните на карту для размещения иконки в «${l?.name||'слой'}». ESC — отмена`,'ok');
  renderKmlPanel();

  _kmlPlacementHandler = async function(e) {
    const {lat,lng} = e.latlng;
    kmlCancelPlacement();
    // Открыть модалку для настройки иконки
    const ll = layers.find(x=>x.id===layerId);
    if (!ll) return;
    let gj;
    try { gj = JSON.parse(ll.geojson); } catch(err) { gj={type:'FeatureCollection',features:[]}; }
    if (gj.type !== 'FeatureCollection') gj = {type:'FeatureCollection',features:gj.type==='Feature'?[gj]:[]};

    const defColor = ll.color || '#e53935';
    const defSym   = ll.symbol || 'star';
    const symGroups = {};
    Object.entries(KML_SYMBOLS).forEach(([k,s])=>{
      if(!symGroups[s.group])symGroups[s.group]=[];
      symGroups[s.group].push({key:k,...s});
    });
    const symGrid = Object.entries(symGroups).map(([grpNm,syms])=>`
      <div style="margin-bottom:8px">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--tx3);margin-bottom:4px">${grpNm}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${syms.map(s=>`<div class="kml-sym-btn kfl-sym-sel ${s.key===defSym?'on':''}" data-sym="${s.key}" onclick="kflSelectSym(this)" title="${s.label}">
            <div id="kfl-sp-${s.key}">${kmlSvgIcon(s.key,defColor,20)}</div></div>`).join('')}
        </div>
      </div>`).join('');

    showModal('📌 Разместить иконку',`
      <div class="fgr">
        <div class="fg"><label>Название</label><input id="kpl-nm" placeholder="КПП №1…"></div>
        <div class="fg"><label>Цвет</label>
          <input type="color" id="kpl-color" value="${defColor}" style="width:50px;height:32px;border:1.5px solid var(--bd);border-radius:5px;cursor:pointer;padding:2px"
            oninput="document.querySelectorAll('[id^=kfl-sp-]').forEach(el=>{const k=el.id.replace('kfl-sp-','');el.innerHTML=kmlSvgIcon(k,this.value,20);})">
        </div>
        <div class="fg"><label>Размер: <b id="kpl-szv">1.0×</b></label>
          <input type="range" id="kpl-size" min="0.3" max="4" step="0.1" value="1"
            oninput="document.getElementById('kpl-szv').textContent=parseFloat(this.value).toFixed(1)+'×'">
        </div>
        <div style="margin-top:8px">
          <label style="font-size:11px;font-weight:600;display:block;margin-bottom:6px">Условный знак</label>
          <div id="kpl-sym-grid" style="max-height:220px;overflow-y:auto">${symGrid}</div>
        </div>
      </div>`,
      [
        {label:'Отмена',cls:'bs',fn:()=>{closeModal();kmlStartPlacement(layerId);}},
        {label:'💾 Разместить',cls:'bp',fn:async()=>{
          const nm   = document.getElementById('kpl-nm').value.trim();
          const col  = document.getElementById('kpl-color').value;
          const sz   = parseFloat(document.getElementById('kpl-size').value);
          const symEl= document.querySelector('.kfl-sym-sel.on');
          const sym  = symEl ? symEl.dataset.sym : defSym;

          const props = {name: nm || 'Иконка'};
          if (col !== ll.color) props._color = col;
          if (sym !== ll.symbol) props._sym = sym;
          if (Math.abs(sz - (ll.size ?? 1)) > 0.05) props._size = sz;

          gj.features.push({
            type:'Feature',
            geometry:{type:'Point',coordinates:[lng,lat]},
            properties:props,
          });
          const newGeojson = JSON.stringify(gj);
          await fetch(`${API}/layers/${layerId}`,{method:'PUT',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({name:ll.name,color:ll.color,visible:ll.visible?1:0,
              symbol:ll.symbol||'',group_id:ll.group_id||'',line_dash:ll.line_dash||'solid',
              min_zoom:ll.min_zoom||null,max_zoom:ll.max_zoom||null,size:ll.size||1,geojson:newGeojson})});
          ll.geojson = newGeojson;
          renderLayerGroups();
          toast('Иконка размещена','ok');
          closeModal();
        }}
      ]);
  };
  map.once('click', _kmlPlacementHandler);

  _kmlPlacementEscHandler = (e)=>{ if(e.key==='Escape') kmlCancelPlacement(); };
  document.addEventListener('keydown', _kmlPlacementEscHandler);
}

function kmlCancelPlacement() {
  if (!_kmlPlacingLayerId) return;
  _kmlPlacingLayerId = null;
  map.getContainer().style.cursor = '';
  if (_kmlPlacementHandler) { map.off('click', _kmlPlacementHandler); _kmlPlacementHandler = null; }
  if (_kmlPlacementEscHandler) { document.removeEventListener('keydown', _kmlPlacementEscHandler); _kmlPlacementEscHandler = null; }
  renderKmlPanel();
}

// ══════════════════════════════════════════════════════════════
// renderLayerGroups — KML всегда ПОД объёмами (pane kmlPane)
// ══════════════════════════════════════════════════════════════
// Кэш отрисованных слоёв: id → {str: geojson на момент постройки, sig: стилевая
// подпись, rec: объект слоя, захваченный замыканиями меню}. Слой пересобирается
// только если изменились данные или стиль — иначе группа остаётся на карте как есть.
let _kmlRenderCache = {};
function _kmlLayerSig(l) {
  return [l.color, l.line_dash, l.symbol, l.size, l.show_labels ? 1 : 0,
    l.fill_opacity, l.min_zoom, l.max_zoom, layerLabels[l.id] ? 1 : 0].join('|');
}
function renderLayerGroupsWithSymbols() {
  // kmlPane ниже overlayPane (400) — KML визуально под объёмами
  if (!map.getPane('kmlPane')) {
    map.createPane('kmlPane');
    map.getPane('kmlPane').style.pointerEvents = 'auto';
  }
  map.getPane('kmlPane').style.zIndex = 300;
  // overlayPane (canvas фактов/полигонов) держим НИЖЕ markerPane (600): сплошной
  // canvas поверх маркеров перехватывал бы наведение мыши на них. KML(300) < факты(400) < маркеры(600).
  if (map.getPane('overlayPane'))  map.getPane('overlayPane').style.zIndex  = 400;
  if (map.getPane('volPointsPane'))map.getPane('volPointsPane').style.zIndex = 640;

  const keep = new Set();
  layers.filter(l => l.visible && !l.site_id).forEach(l => {
    // If the layer's group is bound to a specific site, only show when that site is active
    if (l.group_id) {
      const grp = kmGroups[l.group_id];
      if (grp) {
        const siteIds = grp.site_ids || (grp.site_id ? [grp.site_id] : []);
        if (siteIds.length && (!currentObj || !siteIds.includes(currentObj.id))) return;
      }
    }
    // Не изменился (данные + стиль) и уже на карте → не пересоздаём
    const sig = _kmlLayerSig(l);
    const cached = _kmlRenderCache[l.id];
    if (cached && lGroups[l.id] && cached.str === l.geojson && cached.sig === sig) {
      keep.add(l.id);
      // замыкания контекстных меню держат старый объект слоя — синхронизируем поля
      if (cached.rec !== l) { Object.assign(cached.rec, l); }
      return;
    }
    if (lGroups[l.id]) { try { map.removeLayer(lGroups[l.id]); } catch(e) {} delete lGroups[l.id]; }
    try {
      const gjRaw    = JSON.parse(l.geojson);
      // Скрытые объекты слоя не рендерим
      const gj = gjRaw.type === 'FeatureCollection'
        ? { ...gjRaw, features: (gjRaw.features || []).filter(f => !f.properties?._hidden) }
        : gjRaw;
      const showLabels = !!layerLabels[l.id];
      const color    = l.color     || '#1a56db';
      const dash     = l.line_dash || 'solid';
      const dashArr  = KML_LINE_STYLES[dash]?.dash || null;

      const g = L.geoJSON(gj, {
        pane: 'kmlPane',
        renderer: getCanvasRenderer('kmlPane'),
        style: (f) => ({ color: f?.properties?._color || color, weight:2.5, opacity:.85,
          fillOpacity: l.fill_opacity != null ? l.fill_opacity : .2, dashArray:dashArr }),
        pointToLayer: (f, ll) => {
          // Точки — в markerPane (z-600), иначе markerPane перехватывает события
          const icon = kmlFeatureDivIcon(l, f.properties);
          return L.marker(ll, { icon });
        },
        onEachFeature: (f, layer) => {
          const nm = f.properties?.name || f.properties?.Name || '';
          const cmt = f.properties?.comment || '';
          const tip = esc(nm) + (cmt ? (nm ? '<br>' : '') + '<span style="color:#65a30d;font-weight:700">✅ ' + esc(cmt) + '</span>' : '');
          if (tip) layer.bindTooltip(tip, {permanent:showLabels, className:'mlbl', direction:'top'});

          // ПКМ на объекте карты
          layer.on('contextmenu', function(ev) {
            L.DomEvent.stopPropagation(ev);
            ev.originalEvent.preventDefault();
            const cx = ev.originalEvent.clientX, cy = ev.originalEvent.clientY;
            const featureName = f.properties?.name || f.properties?.Name || 'Объект';
            let coordStr = '';
            try {
              if (f.geometry.type === 'Point') {
                const [lng, lat] = f.geometry.coordinates;
                coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
              }
            } catch(e) {}
            const fIdx = gjRaw.features ? gjRaw.features.indexOf(f) : -1;
            showCtx(cx, cy, [
              {i:'🗺',l:`<b>${esc(featureName)}</b> <span style="color:var(--tx3);font-weight:400">${esc(l.name)}</span>`,f:null,html:true},{sep:true},
              {i:'📍',l:'Отметка высоты (БСВ-77)',f:()=>showElevationAtPoint(ev.latlng)},
              {sep:true},
              {i:'🔍',l:'Приблизить',f:()=>{
                try { map.flyToBounds(layer.getBounds ? layer.getBounds() : L.latLngBounds([[layer.getLatLng().lat,layer.getLatLng().lng]]), {padding:[60,60]}); }
                catch(e){ try{map.flyTo(layer.getLatLng(),16);}catch(e2){} }
              }},
              ...(fIdx>=0?[{i:'✅',l:(f.properties&&f.properties._color===KML_DONE_COLOR)?'Снять «выполнено»':'Выполнить объект',f:()=>kmlToggleDone(l.id,fIdx)}]:[]),
              ...(fIdx>=0?[{i:'✏️',l:'Редактировать объект',f:()=>kmlEditFeature(l.id,fIdx)}]:[]),
              ...(fIdx>=0&&f.geometry&&f.geometry.type==='LineString'?[{i:'⬛',l:'Линия → полигон',f:()=>kmlLineToPolygon(l.id,fIdx)}]:[]),
              ...(fIdx>=0&&f.geometry&&f.geometry.type==='Polygon'?[{i:'〰️',l:'Полигон → линия',f:()=>kmlPolygonToLine(l.id,fIdx)}]:[]),
              ...(coordStr?[{i:'📋',l:'Копировать координаты',f:()=>{navigator.clipboard.writeText(coordStr).then(()=>toast('Скопировано','ok'));}}]:[]),
              {sep:true},
              {i:'🎨',l:'Стиль слоя',f:()=>kmlOpenStyleModal(l.id)},
              {i:'📋',l:'Объекты слоя',f:()=>kmlOpenFeatureList(l.id)},
              {i:'👁',l:l.visible?'Скрыть слой':'Показать слой',f:()=>kmlToggleVis(l.id,l.visible?0:1)},
              ...(l.group_id?[{sep:true},{i:'📄',l:'Убрать из группы',f:()=>kmlMoveToGroup(l.id,null)}]:[]),
            ]);
          });
        }
      }).addTo(map);

      lGroups[l.id] = g;
      _kmlRenderCache[l.id] = { str: l.geojson, sig, rec: l };
      keep.add(l.id);
      // Скрыть если текущий зум вне диапазона масштаба
      const minZ = l.min_zoom != null ? l.min_zoom : 0;
      const maxZ = l.max_zoom != null ? l.max_zoom : 20;
      if (minZ > 0 || maxZ < 20) {
        const z = map.getZoom();
        if (z < minZ || z > maxZ) map.removeLayer(g);
      }
    } catch(e) { console.warn('KML render error', l.name, e); }
  });

  // Убираем слои, которых больше нет / скрытые / выпавшие из группы объекта
  Object.keys(lGroups).forEach(k => {
    if (k.startsWith('s_')) return;
    if (!keep.has(k)) {
      try { map.removeLayer(lGroups[k]); } catch(e) {}
      delete lGroups[k];
      delete _kmlRenderCache[k];
    }
  });

  // Объёмы всегда поверх KML
  setTimeout(bringVolumesToFront, 50);
  // Обновить панель чтобы отразить активные/неактивные группы
  if (kmlPanelOpen) setTimeout(renderKmlPanel, 50);
}

// ── Экспорт слоёв в DXF / KML ───────────────────────────────
function openLayerExportDialog() {
  const list = (layers || []).slice();
  if (!list.length) { toast('Нет слоёв для экспорта', 'err'); return; }
  const rows = list.map(l => `
    <label style="display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer">
      <input type="checkbox" class="lex-cb" value="${l.id}" ${l.visible ? 'checked' : ''}>
      <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${l.color || '#666'};flex-shrink:0"></span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(l.name || '').replace(/[<>&]/g, '')}</span>
    </label>
  `).join('');
  const body = `
    <div style="display:flex;flex-direction:column;gap:10px">
      <div>
        <div style="font-weight:600;margin-bottom:6px">Формат</div>
        <div style="display:flex;gap:6px">
          <label style="flex:1;display:flex;align-items:center;gap:6px;padding:7px 10px;border:1.5px solid var(--acc);border-radius:var(--rs);cursor:pointer;background:var(--s2)">
            <input type="radio" name="lex-fmt" value="dxf" checked onchange="lexFmtChange()">
            <div>
              <div style="font-weight:600;font-size:12px">DXF</div>
              <div style="font-size:10px;color:var(--tx3)">AutoCAD, ГСК, МСК</div>
            </div>
          </label>
          <label style="flex:1;display:flex;align-items:center;gap:6px;padding:7px 10px;border:1.5px solid var(--bd);border-radius:var(--rs);cursor:pointer;background:var(--s2)">
            <input type="radio" name="lex-fmt" value="kml" onchange="lexFmtChange()">
            <div>
              <div style="font-weight:600;font-size:12px">KML</div>
              <div style="font-size:10px;color:var(--tx3)">Google Earth, QGIS</div>
            </div>
          </label>
        </div>
      </div>
      <div id="lex-crs-row">
        <div style="font-weight:600;margin-bottom:4px">Система координат</div>
        <label style="display:block;padding:2px 0"><input type="radio" name="lex-crs" value="wgs84"> WGS-84 (градусы)</label>
        <label style="display:block;padding:2px 0"><input type="radio" name="lex-crs" value="msk86" checked> МСК-86 (авто зона по долготе)</label>
        <label style="display:block;padding:2px 0"><input type="radio" name="lex-crs" value="msk86_z3"> МСК-86 Зона 3 (ЦМ=66°, фиксированная)</label>
        <label style="display:block;padding:2px 0"><input type="radio" name="lex-crs" value="msk86_z4"> МСК-86 Зона 4 (ЦМ=72°, фиксированная)</label>
        <label style="display:block;padding:2px 0"><input type="radio" name="lex-crs" value="gsk2011"> ГСК-2011 (6° зоны)</label>
      </div>
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div style="font-weight:600">Слои (${list.length})</div>
          <div>
            <button class="btn bs bxs" onclick="document.querySelectorAll('.lex-cb').forEach(c=>c.checked=true)">Все</button>
            <button class="btn bs bxs" onclick="document.querySelectorAll('.lex-cb').forEach(c=>c.checked=false)">Никакие</button>
          </div>
        </div>
        <div style="max-height:260px;overflow:auto;border:1px solid var(--bd);border-radius:6px;padding:6px 10px">
          ${rows}
        </div>
      </div>
    </div>`;
  showModal('📤 Экспорт слоёв', body, [
    { label: 'Отмена', cls: 'bs', fn: closeModal },
    { label: 'Скачать DXF', cls: 'bp', fn: doLayerExport },
  ]);
}

function lexFmtChange() {
  const fmt = document.querySelector('input[name="lex-fmt"]:checked')?.value || 'dxf';
  const crsRow = document.getElementById('lex-crs-row');
  if (crsRow) crsRow.style.display = fmt === 'dxf' ? '' : 'none';
  // Update button label
  const btn = document.querySelector('#mft .bp');
  if (btn) btn.textContent = fmt === 'dxf' ? 'Скачать DXF' : 'Скачать KML';
  // Highlight selected format card
  document.querySelectorAll('input[name="lex-fmt"]').forEach(r => {
    const card = r.closest('label');
    if (card) card.style.borderColor = r.checked ? 'var(--acc)' : 'var(--bd)';
  });
}

async function doLayerExport() {
  const ids = Array.from(document.querySelectorAll('.lex-cb'))
    .filter(c => c.checked).map(c => c.value);
  if (!ids.length) { toast('Выберите хотя бы один слой', 'err'); return; }
  const fmt = document.querySelector('input[name="lex-fmt"]:checked')?.value || 'dxf';

  if (fmt === 'kml') {
    closeModal();
    toast('Готовим KML…');
    try {
      const r = await fetch(`${API}/layers/export-kml`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layerIds: ids }),
      });
      if (!r.ok) {
        let msg = 'Ошибка экспорта';
        try { const j = await r.json(); if (j.error) msg = j.error; } catch (_) {}
        toast(msg, 'err'); return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'layers.kml';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
      toast('✅ KML сохранён', 'ok');
    } catch (e) { toast('Ошибка экспорта', 'err'); }
    return;
  }

  // DXF export
  const crsEl = document.querySelector('input[name="lex-crs"]:checked');
  const crs = crsEl ? crsEl.value : 'wgs84';
  closeModal();
  toast('Готовим DXF…');
  try {
    const r = await fetch(`${API}/layers/export-dxf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layerIds: ids, crs }),
    });
    if (!r.ok) {
      let msg = 'Ошибка экспорта';
      try { const j = await r.json(); if (j.error) msg = j.error; } catch (e) {}
      toast(msg, 'err');
      return;
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `layers_${crs}.dxf`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    toast('DXF сохранён', 'ok');
  } catch (e) {
    toast('Ошибка экспорта', 'err');
  }
}

// ═══════════════════════════════════════════════════════════
// ПОСТАВИТЬ МЕТКУ — ПКМ + ввод координат
// ═══════════════════════════════════════════════════════════

let _pmSym = 'point';
let _cmCrs = 'wgs';

const _PM_QUICK_SYMS = ['point','flag','star','benchmark','borehole','warning','camp','picket'];

function _parseDMSCoord(str) {
  if (!str) return NaN;
  // Normalize: comma → dot decimal, trim
  str = str.trim().replace(/,(?=\d)/g, '.');
  // Detect sign (S/W/Ю/З means negative)
  const neg = /^-|[SsWwЮюЗзYy](?!\w)/.test(str);
  // Strip all non-numeric except dot and minus, then re-extract numbers
  const nums = str.match(/-?[\d]+(?:\.[\d]+)?/g);
  if (!nums || nums.length === 0) return NaN;
  // If single token and it looks like a decimal degree, return it directly
  if (nums.length === 1) {
    const v = parseFloat(nums[0]);
    return neg && v > 0 ? -v : v;
  }
  // DMS: first token = degrees, second = minutes, third (optional) = seconds
  const d = Math.abs(parseFloat(nums[0]) || 0);
  const m = parseFloat(nums[1]) || 0;
  const s = parseFloat(nums[2]) || 0;
  const val = d + m / 60 + s / 3600;
  return neg ? -val : val;
}

function _pmSymHtml(containerId, selected) {
  return _PM_QUICK_SYMS.map(k => {
    const sym = KML_SYMBOLS[k];
    if (!sym) return '';
    const svg = sym.svg.replace(/COLOR/g, 'currentColor');
    return `<div class="kml-sym-btn ${k === selected ? 'on' : ''}" data-sym="${k}" data-container="${containerId}"
      onclick="_pmSelSym(this)" title="${sym.label}"
      style="width:30px;height:30px;padding:3px;cursor:pointer;border-radius:4px">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${svg}</svg>
    </div>`;
  }).join('');
}

function _pmSelSym(el) {
  const cid = el.dataset.container;
  document.querySelectorAll(`.kml-sym-btn[data-container="${cid}"]`).forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  _pmSym = el.dataset.sym;
}

function _pmLayerSelectHtml(pfx) {
  const globalLayers = layers.filter(l => !l.site_id);
  return `<select id="${pfx}-layer" onchange="${pfx}LayerChange()"
    style="width:100%;font-size:12px;padding:5px 8px;border:1.5px solid var(--bd);
    border-radius:var(--rs);background:var(--s2)">
    <option value="_new">— Новый слой —</option>
    ${globalLayers.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}
  </select>
  <div id="${pfx}-newname-row" style="margin-top:5px">
    <input id="${pfx}-newname" type="text" placeholder="Мои метки"
      style="width:100%;box-sizing:border-box;font-size:12px;padding:5px 8px;
      border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
  </div>`;
}

async function _saveMarkerPoint(lat, lng, name, layerId, newLayerName, color, sym) {
  let ll;
  if (layerId === '_new') {
    const gj = JSON.stringify({ type: 'FeatureCollection', features: [] });
    const nm = (newLayerName || '').trim() || 'Метки';
    const r = await fetch(`${API}/layers`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nm, geojson: gj, color: color || '#e53935', symbol: sym || 'point',
        visible: 1, group_id: '', line_dash: 'solid' }) });
    const j = await r.json();
    ll = { id: j.id, name: nm, geojson: gj, color: color || '#e53935', symbol: sym || 'point',
      visible: 1, group_id: '', line_dash: 'solid', size: 1, show_labels: 0 };
    layers.unshift(ll);
  } else {
    ll = layers.find(x => x.id === layerId);
    if (!ll) { toast('Слой не найден', 'err'); return false; }
  }
  let gj;
  try { gj = JSON.parse(ll.geojson); } catch (_) { gj = { type: 'FeatureCollection', features: [] }; }
  if (!Array.isArray(gj.features)) gj.features = [];
  const props = { name: (name || '').trim() || 'Метка' };
  if (color && color !== ll.color) props._color = color;
  if (sym && sym !== ll.symbol) props._sym = sym;
  gj.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: props });
  const newGJ = JSON.stringify(gj);
  await fetch(`${API}/layers/${ll.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: ll.name, color: ll.color, visible: ll.visible ? 1 : 0,
      symbol: ll.symbol || '', group_id: ll.group_id || '', line_dash: ll.line_dash || 'solid',
      min_zoom: ll.min_zoom || 0, max_zoom: ll.max_zoom || 20, size: ll.size || 1,
      show_labels: ll.show_labels ? 1 : 0, geojson: newGJ }) });
  ll.geojson = newGJ;
  try { renderLayerGroups(); } catch (e) {}
  setTimeout(bringVolumesToFront, 50);
  try { if (kmlPanelOpen) renderKmlPanel(); } catch (e) {}
  try { renderLP(); } catch (e) {}
  return true;
}

// ── Рисование линии/полигона с ПКМ (в слой KML) ─────────────
// ПКМ → «Нарисовать линию/полигон»: точка ПКМ — первая вершина,
// далее клики добавляют точки, ПКМ — меню (завершить/отменить).
let _kdActive=null,_kdPts=[],_kdTmp=null;
function startKmlDraw(type, firstLatLng){
  _kdCancelSilent();
  _kdActive=type;
  _kdPts=firstLatLng?[firstLatLng]:[];
  map.getContainer().style.cursor='crosshair';
  const bnr=document.getElementById('bnr');
  bnr.className='show draw';
  document.getElementById('bnr-t').textContent=(type==='line'?'〰 Линия':'⬛ Полигон')+': кликайте точки · ПКМ — меню';
  map.on('click',_kdClick);
  _kdPreview();
  toast('Кликайте точки · ПКМ — завершить','ok');
}
function _kdClick(e){
  if(!_kdActive)return;
  _kdPts.push(e.latlng);
  _kdPreview();
}
function _kdPreview(){
  if(_kdTmp){try{map.removeLayer(_kdTmp);}catch(e){}_kdTmp=null;}
  if(!_kdPts.length)return;
  if(_kdActive==='polygon'&&_kdPts.length>=3)
    _kdTmp=L.polygon(_kdPts,{color:'#7c3aed',weight:2,dashArray:'5 4',fillColor:'#7c3aed',fillOpacity:.12}).addTo(map);
  else
    _kdTmp=L.polyline(_kdPts,{color:'#7c3aed',weight:2.5,dashArray:'5 4'}).addTo(map);
}
function _kdRClick(e){
  e.originalEvent.preventDefault();
  const need=_kdActive==='line'?2:3;
  showCtx(e.originalEvent.clientX,e.originalEvent.clientY,[
    {i:'✅',l:'Завершить ('+_kdPts.length+' тчк)',f:_kdFinish},
    {i:'↩️',l:'Удалить последнюю точку',f:_kdUndo},
    {sep:true},
    {i:'❌',l:'Отменить рисование',cls:'dan',f:_kdCancel},
  ]);
}
function _kdUndo(){
  if(!_kdPts.length){toast('Нет точек','err');return;}
  _kdPts.pop();_kdPreview();
}
function _kdCancelSilent(){
  map.off('click',_kdClick);
  _kdActive=null;_kdPts=[];
  if(_kdTmp){try{map.removeLayer(_kdTmp);}catch(e){}_kdTmp=null;}
  map.getContainer().style.cursor='';
  const bnr=document.getElementById('bnr');if(bnr)bnr.className='';
}
function _kdCancel(){_kdCancelSilent();toast('Рисование отменено','ok');}
function _kdFinish(){
  const type=_kdActive,pts=_kdPts.slice();
  const need=type==='line'?2:3;
  if(pts.length<need){toast('Нужно минимум '+need+' точек','err');return;}
  _kdCancelSilent();
  const title=type==='line'?'〰 Линия':'⬛ Полигон';
  showModal(title+' — сохранить',`
    <div class="fgr fone">
      <div class="fg"><label>Название</label>
        <input id="kd-name" type="text" placeholder="${type==='line'?'Маршрут, профиль…':'Площадка, участок…'}"
          style="width:100%;box-sizing:border-box;font-size:13px;padding:5px 8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
      </div>
      <div style="font-size:10px;color:var(--tx3);margin:-4px 0 6px">Точек: ${pts.length}</div>
      <div class="fg"><label>Слой</label>${_pmLayerSelectHtml('kd')}</div>
      <div class="fg"><label style="display:block;font-size:11px;font-weight:600;margin-bottom:4px">Цвет</label>
        <input id="kd-color" type="color" value="#e53935"
          style="width:44px;height:32px;padding:2px;border:1.5px solid var(--bd);border-radius:var(--rs);cursor:pointer">
      </div>
    </div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},
     {label:'💾 Сохранить',cls:'bp',fn:async()=>{
       const name=(document.getElementById('kd-name')?.value||'').trim();
       const layerId=document.getElementById('kd-layer')?.value;
       const newName=(document.getElementById('kd-newname')?.value||'').trim();
       const color=document.getElementById('kd-color')?.value||'#e53935';
       let geom;
       const coords=pts.map(p=>[p.lng,p.lat]);
       if(type==='polygon'){
         const a=coords[0],b=coords[coords.length-1];
         if(a[0]!==b[0]||a[1]!==b[1])coords.push([a[0],a[1]]); // замыкаем кольцо
         geom={type:'Polygon',coordinates:[coords]};
       } else {
         geom={type:'LineString',coordinates:coords};
       }
       const ok=await _saveKmlShape(geom,name||(type==='line'?'Линия':'Полигон'),layerId,newName,color);
       if(ok){closeModal();toast('✅ '+(type==='line'?'Линия добавлена':'Полигон добавлен'),'ok');}
     }}]);
  setTimeout(()=>{const el=document.getElementById('kd-name');if(el)el.focus();},80);
}
function kdLayerChange(){
  const sel=document.getElementById('kd-layer');
  const row=document.getElementById('kd-newname-row');
  if(row)row.style.display=sel&&sel.value==='_new'?'':'none';
}
// Сохраняет произвольную геометрию в слой KML (аналог _saveMarkerPoint)
async function _saveKmlShape(geometry,name,layerId,newLayerName,color){
  let ll;
  if(layerId==='_new'){
    const gj=JSON.stringify({type:'FeatureCollection',features:[]});
    const nm=(newLayerName||'').trim()||'Мои объекты';
    const r=await fetch(`${API}/layers`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:nm,geojson:gj,color:color||'#e53935',symbol:'point',
        visible:1,group_id:'',line_dash:'solid'})});
    const j=await r.json();
    ll={id:j.id,name:nm,geojson:gj,color:color||'#e53935',symbol:'point',
      visible:1,group_id:'',line_dash:'solid',size:1,show_labels:0};
    layers.unshift(ll);
  } else {
    ll=layers.find(x=>x.id===layerId);
    if(!ll){toast('Слой не найден','err');return false;}
  }
  let gj;
  try{gj=JSON.parse(ll.geojson);}catch(_){gj={type:'FeatureCollection',features:[]};}
  if(!Array.isArray(gj.features))gj.features=[];
  const props={name:(name||'').trim()};
  if(color&&color!==ll.color)props._color=color;
  gj.features.push({type:'Feature',geometry:geometry,properties:props});
  await _kmlSaveGeojson(ll,gj);
  try{renderLayerGroups();}catch(e){}
  setTimeout(bringVolumesToFront,50);
  try{if(kmlPanelOpen)renderKmlPanel();}catch(e){}
  try{renderLP();}catch(e){}
  return true;
}

// ── Метка по клику ПКМ ──────────────────────────────────────
function openPlaceMarkerModal(latlng) {
  _pmSym = 'point';
  showModal('📌 Поставить метку', `
    <div class="fgr fone">
      <div class="fg">
        <label>Название</label>
        <input id="pm-name" type="text" placeholder="КПП, Скважина, Точка 1..."
          style="width:100%;box-sizing:border-box;font-size:13px;padding:5px 8px;
          border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
      </div>
      <div style="font-size:10px;color:var(--tx3);margin:-4px 0 6px">
        📍 ${latlng.lat.toFixed(6)}°N, ${latlng.lng.toFixed(6)}°E
      </div>
      <div class="fg">
        <label>Слой</label>
        ${_pmLayerSelectHtml('pm')}
      </div>
      <div class="fg" style="display:flex;align-items:flex-start;gap:14px">
        <div>
          <label style="display:block;font-size:11px;font-weight:600;margin-bottom:4px">Цвет</label>
          <input id="pm-color" type="color" value="#e53935"
            style="width:44px;height:32px;padding:2px;border:1.5px solid var(--bd);
            border-radius:var(--rs);cursor:pointer">
        </div>
        <div style="flex:1">
          <label style="display:block;font-size:11px;font-weight:600;margin-bottom:4px">Знак</label>
          <div style="display:flex;flex-wrap:wrap;gap:3px">${_pmSymHtml('pm', 'point')}</div>
        </div>
      </div>
    </div>`,
    [
      { label: 'Отмена', cls: 'bs', fn: closeModal },
      { label: '📍 Добавить', cls: 'bp', fn: async () => {
        const name = (document.getElementById('pm-name')?.value || '').trim();
        const layerId = document.getElementById('pm-layer')?.value;
        const newName = (document.getElementById('pm-newname')?.value || '').trim();
        const color = document.getElementById('pm-color')?.value || '#e53935';
        const ok = await _saveMarkerPoint(latlng.lat, latlng.lng, name, layerId, newName, color, _pmSym);
        if (ok) { closeModal(); toast('✅ Метка добавлена', 'ok'); }
      }}
    ]
  );
  setTimeout(() => { const el = document.getElementById('pm-name'); if (el) el.focus(); }, 80);
}

function pmLayerChange() {
  const sel = document.getElementById('pm-layer');
  const row = document.getElementById('pm-newname-row');
  if (row) row.style.display = sel && sel.value === '_new' ? '' : 'none';
}

// ── Метка по координатам ────────────────────────────────────
function openCoordMarkerModal(prefillLatlng) {
  _pmSym = 'point';
  _cmCrs = 'wgs';
  const lat0 = prefillLatlng ? prefillLatlng.lat.toFixed(6) : '';
  const lon0 = prefillLatlng ? prefillLatlng.lng.toFixed(6) : '';
  showModal('🔢 Метка по координатам', `
    <div class="fgr fone">
      <div class="fg">
        <label>Система координат</label>
        <div style="display:flex;gap:4px">
          <button id="cmb-wgs" class="btn bsm on" onclick="cmSetCrs('wgs')">WGS-84</button>
          <button id="cmb-msk" class="btn bsm"    onclick="cmSetCrs('msk')">МСК-86</button>
          <button id="cmb-gsk" class="btn bsm"    onclick="cmSetCrs('gsk')">ГСК-2011</button>
        </div>
      </div>
      <div id="cm-wgs-fields">
        <div style="font-size:9px;color:var(--tx3);margin-bottom:6px;line-height:1.5">
          Принимаемые форматы:<br>
          Десятичные градусы: <b>60.123456</b><br>
          Градусы°Минуты′Секунды″: <b>60°07′24.42″</b> или <b>60 07 24.42</b>
        </div>
        <div style="display:flex;gap:8px">
          <div class="fg" style="flex:1">
            <label>Широта (°N)</label>
            <input id="cm-lat" type="text" value="${lat0}"
              placeholder="60.123456 или 60 07 24.42" oninput="cmUpdatePreview()"
              style="width:100%;box-sizing:border-box;font-size:12px;padding:5px 8px;
              border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
          </div>
          <div class="fg" style="flex:1">
            <label>Долгота (°E)</label>
            <input id="cm-lon" type="text" value="${lon0}"
              placeholder="68.654321 или 68 39 15.56" oninput="cmUpdatePreview()"
              style="width:100%;box-sizing:border-box;font-size:12px;padding:5px 8px;
              border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
          </div>
        </div>
      </div>
      <div id="cm-proj-fields" style="display:none">
        <div class="fg">
          <label>X — Северная (м)</label>
          <input id="cm-north" type="text" placeholder="6 630 000.00" oninput="cmUpdatePreview()"
            style="width:100%;box-sizing:border-box;font-size:12px;padding:5px 8px;
            border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
        </div>
        <div class="fg">
          <label>Y — Восточная (м)</label>
          <input id="cm-east" type="text" placeholder="12 500 000.00" oninput="cmUpdatePreview()"
            style="width:100%;box-sizing:border-box;font-size:12px;padding:5px 8px;
            border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
        </div>
        <div id="cm-zone-hint"
          style="font-size:10px;color:var(--tx3);margin-top:-4px;margin-bottom:2px">
          Зона определяется автоматически по значению Y
        </div>
      </div>
      <div id="cm-preview"
        style="font-size:10px;min-height:16px;padding:3px 0;color:var(--tx3)"></div>
      <div class="fg">
        <label>Название метки</label>
        <input id="cm-name" type="text" placeholder="Точка 1, КПП, Скважина..."
          style="width:100%;box-sizing:border-box;font-size:13px;padding:5px 8px;
          border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
      </div>
      <div class="fg">
        <label>Слой</label>
        ${_pmLayerSelectHtml('cm')}
      </div>
      <div class="fg" style="display:flex;align-items:flex-start;gap:14px">
        <div>
          <label style="display:block;font-size:11px;font-weight:600;margin-bottom:4px">Цвет</label>
          <input id="cm-color" type="color" value="#1a56db"
            style="width:44px;height:32px;padding:2px;border:1.5px solid var(--bd);
            border-radius:var(--rs);cursor:pointer">
        </div>
        <div style="flex:1">
          <label style="display:block;font-size:11px;font-weight:600;margin-bottom:4px">Знак</label>
          <div style="display:flex;flex-wrap:wrap;gap:3px">${_pmSymHtml('cm', 'point')}</div>
        </div>
      </div>
    </div>`,
    [
      { label: 'Отмена', cls: 'bs', fn: closeModal },
      { label: '📍 Добавить', cls: 'bp', fn: async () => {
        const ll = _cmGetLatlng();
        if (!ll) { toast('❌ Некорректные координаты', 'err'); return; }
        const name = (document.getElementById('cm-name')?.value || '').trim();
        const layerId = document.getElementById('cm-layer')?.value;
        const newName = (document.getElementById('cm-newname')?.value || '').trim();
        const color = document.getElementById('cm-color')?.value || '#1a56db';
        const ok = await _saveMarkerPoint(ll.lat, ll.lng, name, layerId, newName, color, _pmSym);
        if (ok) {
          closeModal();
          toast('✅ Метка добавлена', 'ok');
          map.flyTo([ll.lat, ll.lng], Math.max(map.getZoom(), 14));
        }
      }}
    ]
  );
  setTimeout(() => {
    const el = _cmCrs === 'wgs' ? document.getElementById('cm-lat') : document.getElementById('cm-north');
    if (el) el.focus();
    cmUpdatePreview();
  }, 80);
}

function cmSetCrs(crs) {
  _cmCrs = crs;
  ['wgs', 'msk', 'gsk'].forEach(c => {
    const b = document.getElementById('cmb-' + c);
    if (b) b.classList.toggle('on', c === crs);
  });
  const wf = document.getElementById('cm-wgs-fields');
  const pf = document.getElementById('cm-proj-fields');
  if (wf) wf.style.display = crs === 'wgs' ? '' : 'none';
  if (pf) pf.style.display = crs !== 'wgs' ? '' : 'none';
  cmUpdatePreview();
}

function _cmGetLatlng() {
  if (_cmCrs === 'wgs') {
    const lat = _parseDMSCoord(document.getElementById('cm-lat')?.value || '');
    const lon = _parseDMSCoord(document.getElementById('cm-lon')?.value || '');
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lng: lon };
  }
  const rawN = (document.getElementById('cm-north')?.value || '').replace(/[\s ]/g, '').replace(',', '.');
  const rawE = (document.getElementById('cm-east')?.value || '').replace(/[\s ]/g, '').replace(',', '.');
  const north = parseFloat(rawN), east = parseFloat(rawE);
  if (isNaN(north) || isNaN(east)) return null;
  const zone = Math.round(east / 1000000);
  if (zone < 1 || zone > 60) return null;
  try {
    const conv = _cmCrs === 'msk' ? mskToWgs : gskToWgs;
    const { lat, lon } = conv(north, east, zone);
    if (isNaN(lat) || isNaN(lon)) return null;
    return { lat, lng: lon };
  } catch (_) { return null; }
}

function cmUpdatePreview() {
  const el = document.getElementById('cm-preview');
  if (!el) return;
  const ll = _cmGetLatlng();
  if (!ll) { el.textContent = ''; return; }
  let hint = '';
  if (_cmCrs !== 'wgs') {
    const rawE = (document.getElementById('cm-east')?.value || '').replace(/[\s ]/g, '').replace(',', '.');
    const east = parseFloat(rawE);
    const zone = isNaN(east) ? '?' : Math.round(east / 1000000);
    hint = ` · зона ${zone}`;
  }
  el.innerHTML = `→ WGS-84${hint}: <b>${ll.lat.toFixed(6)}°N</b> &nbsp; <b>${ll.lng.toFixed(6)}°E</b>`;
}

function cmLayerChange() {
  const sel = document.getElementById('cm-layer');
  const row = document.getElementById('cm-newname-row');
  if (row) row.style.display = sel && sel.value === '_new' ? '' : 'none';
}

// ── Инициализация ───────────────────────────────────────────
async function initKmlManager() {
  await loadKmGroups();
  window.renderLayerGroups = renderLayerGroupsWithSymbols;
  _kmlInitSplitter();
  setTimeout(() => {
    try { renderLayerGroupsWithSymbols(); } catch(e) {}
  }, 50);

  // Показывать/скрывать слои при смене зума (если задан диапазон масштаба)
  map.on('zoomend', () => {
    const z = map.getZoom();
    layers.filter(l => l.visible && !l.site_id).forEach(l => {
      const minZ = l.min_zoom != null ? l.min_zoom : 0;
      const maxZ = l.max_zoom != null ? l.max_zoom : 20;
      if (minZ === 0 && maxZ === 20) return; // без ограничений
      const g = lGroups[l.id];
      if (!g) return;
      const shouldShow = z >= minZ && z <= maxZ;
      if (shouldShow && !map.hasLayer(g)) g.addTo(map);
      else if (!shouldShow && map.hasLayer(g)) map.removeLayer(g);
    });
  });
}
