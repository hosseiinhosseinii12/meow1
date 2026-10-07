/**
 * modal.js — Native <dialog> system with ESC, click-outside, focus trap and
 * focus restoration. Open with [data-modal-open="id"], close with [data-modal-close].
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const openers = new WeakMap();

export function trapFocus(container, e) {
  if (e.key !== 'Tab') return;
  const items = [...container.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0]; const last = items.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function openModal(id, opener = document.activeElement) {
  const dlg = typeof id === 'string' ? document.getElementById(id) : id;
  if (!dlg || dlg.open) return dlg;
  openers.set(dlg, opener);
  dlg.showModal();
  document.body.classList.add('is-locked');
  dlg.dispatchEvent(new CustomEvent('modal:open', { bubbles: true }));
  requestAnimationFrame(() => (dlg.querySelector('[autofocus]') ?? dlg.querySelector(FOCUSABLE))?.focus());
  return dlg;
}

export function closeModal(dlg) {
  if (!dlg?.open) return;
  dlg.close();
}

export function initModals() {
  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-modal-open]');
    if (open) { e.preventDefault(); openModal(open.dataset.modalOpen, open); return; }
    const close = e.target.closest('[data-modal-close]');
    if (close) { closeModal(close.closest('dialog')); return; }
    // Click on the backdrop (the dialog element itself, outside its content box).
    if (e.target instanceof HTMLDialogElement && e.target.classList.contains('modal')) {
      const r = e.target.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) closeModal(e.target);
    }
  });
  document.addEventListener('keydown', (e) => {
    const dlg = document.querySelector('dialog.modal[open]');
    if (dlg) trapFocus(dlg, e);
  });
  document.addEventListener('close', (e) => {
    if (!(e.target instanceof HTMLDialogElement)) return;
    if (!document.querySelector('dialog.modal[open]')) document.body.classList.remove('is-locked');
    openers.get(e.target)?.focus?.();
  }, true);
}

/** Promise-based confirmation dialog, built on the fly. */
export function confirmDialog({ title = 'Are you sure?', message = '', confirm = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal';
    dlg.setAttribute('aria-labelledby', 'confirm-title');
    dlg.innerHTML = `
      <div class="modal__head"><h2 class="modal__title" id="confirm-title">${title}</h2></div>
      <div class="modal__body"><p>${message}</p></div>
      <div class="modal__foot"><button class="link link--muted" type="button" data-v="0">Cancel</button><button class="btn btn--sm ${danger ? 'btn--danger' : ''}" type="button" data-v="1">${confirm}</button></div>`;
    document.body.append(dlg);
    dlg.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { dlg.returnValue = b.dataset.v; dlg.close(); } });
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === '1'); setTimeout(() => dlg.remove(), 400); });
    openModal(dlg);
  });
}
