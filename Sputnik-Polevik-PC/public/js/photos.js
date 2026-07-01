// Фото-таб с drag-and-drop

let _photoCat = 'vyrabotka';

function renderPhotosTab(pane) {
  const photos = _bh.photos || [];
  const cats = Object.entries(PHOTO_CATEGORIES);
  const byCat = {};
  cats.forEach(([k]) => byCat[k] = photos.filter(p => p.category === k || (k === 'vyrabotka' && p.category === 'drilling')));

  pane.innerHTML = `
    <div class="filter-pills" style="margin-bottom:10px">
      ${cats.map(([k, v]) => `
        <button class="btn small ${_photoCat === k ? 'active' : ''}" onclick="setPhotoCat('${k}')">
          ${esc(v)} (${byCat[k].length})
        </button>`).join('')}
    </div>
    <div id="photo-dropzone" class="photo-dropzone"
         ondragover="event.preventDefault();this.classList.add('drag-over')"
         ondragleave="this.classList.remove('drag-over')"
         ondrop="photosDrop(event)">
      <div class="photo-drop-hint">
        📁 Перетащите фото сюда или
        <button class="btn primary small" onclick="uploadPhotos()">выберите файлы</button>
      </div>
      <div class="photo-grid">
        ${byCat[_photoCat].map(p => `
          <div class="photo-tile">
            <img src="/${esc(p.file_path)}" alt="" onclick="window.open('/${esc(p.file_path)}','_blank')">
            <button class="del" onclick="delPhoto('${p.uuid}')">✕</button>
          </div>`).join('')}
      </div>
    </div>
  `;
}

function setPhotoCat(cat) { _photoCat = cat; renderPhotosTab(document.getElementById('tab-pane')); }

async function _uploadFiles(files) {
  const fd = new FormData();
  for (const f of files) fd.append('photos', f);
  try {
    const r = await upload('/boreholes/' + _bh.uuid + '/photos?category=' + _photoCat, fd);
    const fresh = await api('/boreholes/' + _bh.uuid);
    _bh.photos = fresh.photos;
    renderPhotosTab(document.getElementById('tab-pane'));
    toast(`Загружено: ${r.saved.length}`, 'ok');
  } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
}

function uploadPhotos() {
  pickFile('image/jpeg,image/png,image/jpg', async (files) => _uploadFiles(files), { multiple: true });
}

function photosDrop(event) {
  event.preventDefault();
  document.getElementById('photo-dropzone')?.classList.remove('drag-over');
  const files = [...event.dataTransfer.files].filter(f => f.type.startsWith('image/'));
  if (!files.length) return toast('Только изображения', 'warn');
  _uploadFiles(files);
}

async function delPhoto(uuid) {
  await api('/photos/' + uuid, { method: 'DELETE' });
  _bh.photos = _bh.photos.filter(p => p.uuid !== uuid);
  renderPhotosTab(document.getElementById('tab-pane'));
}
