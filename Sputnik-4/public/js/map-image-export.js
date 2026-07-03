// Экспорт выделенной области карты как PNG-изображение
let _imgExStart = null, _imgExTmp = null, _imgExOpts = null;

function openMapImageExport() {
  showModal('🖼 Экспорт PNG',
    `<p style="margin:0 0 10px;color:var(--text-secondary)">Выберите слои для экспорта:</p>
    <div style="display:flex;flex-direction:column;gap:8px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="pex-kml" checked> KML слои</label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="pex-facts" checked> Объёмы (+факты)</label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="pex-mach" checked> Техника</label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="pex-bases" checked> Базы</label>
    </div>`,
    [
      {label: 'Отмена', cls: 'bs', fn: closeModal},
      {label: 'Выбрать область →', cls: 'bp', fn: function() {
        _imgExOpts = {
          kml:      document.getElementById('pex-kml').checked,
          facts:    document.getElementById('pex-facts').checked,
          machinery: document.getElementById('pex-mach').checked,
          bases:    document.getElementById('pex-bases').checked
        };
        closeModal();
        _imgExBeginDraw();
      }}
    ]
  );
}

function _imgExBeginDraw() {
  _imgExStart = null;
  if (_imgExTmp) { try { map.removeLayer(_imgExTmp); } catch(e){} _imgExTmp = null; }
  map.getContainer().style.cursor = 'crosshair';
  const bnr = document.getElementById('bnr');
  bnr.className = 'show draw';
  document.getElementById('bnr-t').textContent = '🖼 Первый угол области (ПКМ — отмена)';
  map.once('click', _imgExFirst);
  map.once('contextmenu', _imgExCancel);
}

function _imgExFirst(e) {
  _imgExStart = e.latlng;
  document.getElementById('bnr-t').textContent = '🖼 Второй угол области';
  map.on('mousemove', _imgExMove);
  map.once('click', _imgExSecond);
  map.off('contextmenu', _imgExCancel);
  map.once('contextmenu', _imgExCancel);
}

function _imgExMove(e) {
  if (!_imgExStart) return;
  const b = L.latLngBounds(_imgExStart, e.latlng);
  if (_imgExTmp) _imgExTmp.setBounds(b);
  else _imgExTmp = L.rectangle(b, {color:'#e11d48', weight:2, dashArray:'6 4', fillColor:'#e11d48', fillOpacity:.08}).addTo(map);
}

function _imgExSecond(e) {
  map.off('mousemove', _imgExMove);
  map.off('contextmenu', _imgExCancel);
  const bounds = L.latLngBounds(_imgExStart, e.latlng);
  if (_imgExTmp) { try { map.removeLayer(_imgExTmp); } catch(e){} _imgExTmp = null; }
  map.getContainer().style.cursor = '';
  document.getElementById('bnr').className = '';
  _imgExRender(bounds);
}

function _imgExCancel() {
  map.off('mousemove', _imgExMove);
  map.off('click', _imgExFirst);
  map.off('click', _imgExSecond);
  if (_imgExTmp) { try { map.removeLayer(_imgExTmp); } catch(e){} _imgExTmp = null; }
  map.getContainer().style.cursor = '';
  document.getElementById('bnr').className = '';
  toast('Экспорт PNG отменён', 'ok');
}

async function _imgExRender(bounds) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    toast('Браузер не поддерживает захват экрана', 'err');
    return;
  }

  const mapEl = document.getElementById('map');
  const tl = map.latLngToContainerPoint(bounds.getNorthWest());
  const br = map.latLngToContainerPoint(bounds.getSouthEast());
  const cropX = Math.round(Math.min(tl.x, br.x));
  const cropY = Math.round(Math.min(tl.y, br.y));
  const cropW = Math.round(Math.abs(br.x - tl.x));
  const cropH = Math.round(Math.abs(br.y - tl.y));

  if (cropW < 10 || cropH < 10) { toast('Область слишком маленькая', 'warn'); return; }

  const opts = _imgExOpts || {kml: true, facts: true, machinery: true, bases: true};

  // Скрываем то, что не должно попасть в кадр
  const hiddenEls = [];
  function _hide(el) { if (el) { el.style.display = 'none'; hiddenEls.push(el); } }

  if (!opts.kml)       _hide(map.getPanes()['kmlPane']);
  if (!opts.facts)   { _hide(map.getPanes()['overlayPane']); _hide(map.getPanes()['volPointsPane']); _hide(map.getPanes()['factsPane']); }
  if (!opts.machinery) Object.values(mMarkers || {}).forEach(function(m) { _hide(m.getElement ? m.getElement() : null); });
  if (!opts.bases)     Object.values(bMarkers || {}).forEach(function(m) { _hide(m.getElement ? m.getElement() : null); });

  // Скрываем тултипы и контролы Leaflet (зум, выбор слоёв)
  const _tips = document.querySelectorAll('.leaflet-tooltip');
  _tips.forEach(function(el) { el.style.visibility = 'hidden'; });
  const ctrl = document.querySelector('.leaflet-control-container');
  if (ctrl) ctrl.style.visibility = 'hidden';

  toast('В диалоге браузера выберите эту вкладку…', 'ok');

  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' },
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      audio: false
    });
  } catch (err) {
    if (ctrl) ctrl.style.visibility = '';
    _tips.forEach(function(el) { el.style.visibility = ''; });
    hiddenEls.forEach(function(el) { el.style.display = ''; });
    toast('Захват отменён', 'warn');
    return;
  }

  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await new Promise(function(r) { video.onloadedmetadata = r; });
    await video.play();
    // Ждём 2 кадра, чтобы захват точно успел отрендерить контент
    await new Promise(function(r) { requestAnimationFrame(function(){ requestAnimationFrame(r); }); });

    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings ? track.getSettings() : {};
    if (settings.displaySurface && settings.displaySurface !== 'browser') {
      toast('Выбрана не вкладка — снимок может быть обрезан', 'warn');
    }

    const mapRect = mapEl.getBoundingClientRect();
    const scaleX = video.videoWidth  / window.innerWidth;
    const scaleY = video.videoHeight / window.innerHeight;

    const srcX = (mapRect.left + cropX) * scaleX;
    const srcY = (mapRect.top  + cropY) * scaleY;
    const srcW = cropW * scaleX;
    const srcH = cropH * scaleY;

    const out = document.createElement('canvas');
    out.width  = Math.round(srcW);
    out.height = Math.round(srcH);
    out.getContext('2d').drawImage(video, srcX, srcY, srcW, srcH, 0, 0, out.width, out.height);

    out.toBlob(function(blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'map_' + new Date().toISOString().slice(0, 10) + '.png';
      a.click();
      setTimeout(function() { URL.revokeObjectURL(a.href); }, 3000);
      toast('PNG сохранён', 'ok');
    }, 'image/png');

  } catch(err) {
    console.error('PNG export error:', err);
    toast('Ошибка: ' + err.message, 'err');
  } finally {
    try { stream.getTracks().forEach(function(t) { t.stop(); }); } catch(e) {}
    if (ctrl) ctrl.style.visibility = '';
    _tips.forEach(function(el) { el.style.visibility = ''; });
    hiddenEls.forEach(function(el) { el.style.display = ''; });
  }
}
