// Фото-таб

let _photoCat = 'vyrabotka';

function renderPhotosTab(pane) {
  const photos = _bh.photos || [];
  const cats = Object.entries(PHOTO_CATEGORIES);
  const byCat = {};
  cats.forEach(([k]) => byCat[k] = photos.filter(p => p.category === k));

  pane.innerHTML = `
    <div class="filter-pills">
      ${cats.map(([k, v]) => `
        <button class="btn small ${_photoCat === k ? 'active' : ''}" onclick="setPhotoCat('${k}')">
          ${esc(v)} ${byCat[k].length}/${PHOTO_LIMITS[k]}
        </button>`).join('')}
    </div>
    <div style="margin-bottom:14px">
      <button class="btn primary" onclick="uploadPhotos()" ${byCat[_photoCat].length >= PHOTO_LIMITS[_photoCat] ? 'disabled' : ''}>
        📁 Загрузить (макс. ${PHOTO_LIMITS[_photoCat] - byCat[_photoCat].length})
      </button>
      <span style="margin-left:12px;color:var(--text2);font-size:12px">
        Категория: <b>${esc(PHOTO_CATEGORIES[_photoCat])}</b>, лимит ${PHOTO_LIMITS[_photoCat]}
      </span>
    </div>
    <div class="photo-grid">
      ${byCat[_photoCat].map(p => `
        <div class="photo-tile">
          <img src="/${esc(p.file_path)}" alt="" onclick="window.open('/${esc(p.file_path)}','_blank')">
          <button class="del" onclick="delPhoto('${p.uuid}')">✕</button>
        </div>`).join('')}
    </div>
  `;
}

function setPhotoCat(cat) { _photoCat = cat; renderPhotosTab(document.getElementById('tab-pane')); }

function uploadPhotos() {
  pickFile('image/jpeg,image/png', async (files) => {
    const fd = new FormData();
    for (const f of files) fd.append('photos', f);
    try {
      const r = await upload('/boreholes/' + _bh.uuid + '/photos?category=' + _photoCat, fd);
      // Обновим photos в _bh
      const fresh = await api('/boreholes/' + _bh.uuid);
      _bh.photos = fresh.photos;
      renderPhotosTab(document.getElementById('tab-pane'));
      toast(`Загружено: ${r.saved.length}${r.rejected_count ? `, отклонено: ${r.rejected_count}` : ''}`, 'ok');
    } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
  }, { multiple: true });
}

async function delPhoto(uuid) {
  await api('/photos/' + uuid, { method: 'DELETE' });
  _bh.photos = _bh.photos.filter(p => p.uuid !== uuid);
  renderPhotosTab(document.getElementById('tab-pane'));
}
