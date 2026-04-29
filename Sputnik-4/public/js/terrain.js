// ArcticDEM layer functionality removed
function initTerrain() {
  try { localStorage.removeItem('pgk_terrain'); } catch(e) {}
}
function terrainHideAll() {}
function terrainToggle() {}
function terrainSetOpacity() {}
function renderTerrainPanel() {
  const el = document.getElementById('terrain-section');
  if (el) el.innerHTML = '';
}
