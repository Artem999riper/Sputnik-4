// Универсальные UI-хелперы: модалки и тосты

window.toast = function (msg, type = '') {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3500);
};

let _modalStack = [];

window.showModal = function (title, bodyHtml, buttons = [{ label: 'OK', cls: 'primary', fn: closeModal }]) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-bg';
  wrap.innerHTML = `
    <div class="modal">
      <div class="modal-hdr">${esc(title)}</div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-ftr"></div>
    </div>`;
  const ftr = wrap.querySelector('.modal-ftr');
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (b.cls || '');
    btn.textContent = b.label;
    btn.onclick = () => {
      const result = b.fn?.(wrap);
      if (result !== false) {} // fn может вернуть false чтобы не закрывать сама
    };
    ftr.appendChild(btn);
  });
  root.appendChild(wrap);
  _modalStack.push(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(); });
  return wrap;
};

window.closeModal = function () {
  const w = _modalStack.pop();
  if (w) w.remove();
};

window.closeAllModals = function () {
  while (_modalStack.length) _modalStack.pop().remove();
};

window.confirm2 = function (title, message, onConfirm, opts = {}) {
  showModal(title, `<div>${esc(message)}</div>`, [
    { label: opts.cancelLabel || 'Отмена', cls: '', fn: closeModal },
    { label: opts.confirmLabel || 'OK', cls: opts.danger ? 'danger' : 'primary', fn: () => { closeModal(); onConfirm(); } },
  ]);
};

// Простой prompt-modal для строкового ввода
window.prompt2 = function (title, label, initial, onSubmit) {
  showModal(title, `
    <div class="field">
      <label>${esc(label)}</label>
      <input type="text" id="pmt-input" value="${esc(initial || '')}">
    </div>`, [
    { label: 'Отмена', fn: closeModal },
    { label: 'OK', cls: 'primary', fn: () => {
      const v = document.getElementById('pmt-input').value.trim();
      closeModal();
      if (v) onSubmit(v);
    } },
  ]);
  setTimeout(() => document.getElementById('pmt-input')?.focus(), 50);
};

// Загрузка файла через скрытый input
window.pickFile = function (accept, onPicked, opts = {}) {
  const inp = document.getElementById('hidden-file');
  inp.value = '';
  inp.accept = accept || '';
  inp.multiple = !!opts.multiple;
  inp.onchange = () => {
    if (opts.multiple) onPicked(inp.files);
    else if (inp.files[0]) onPicked(inp.files[0]);
  };
  inp.click();
};
