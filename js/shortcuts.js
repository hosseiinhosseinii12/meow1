/**
 * shortcuts.js — Keyboard shortcuts. Cmd/Ctrl+K or "/" search, "g" then a key
 * to navigate, "?" to show the shortcut sheet.
 */
import { openSearch } from './search.js';
import { openModal } from './modal.js';
import { openDrawer } from './drawer.js';

const ROOT = document.documentElement.dataset.root ?? '';
const GO = { h: 'index.html', s: 'shop.html', c: 'cart.html', w: 'wishlist.html', a: 'account.html', j: 'blog.html' };

export function initShortcuts() {
  let pendingG = false; let gTimer;
  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest('input, textarea, select, [contenteditable="true"]');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); openSearch(); return; }
    if (e.key === '?') { e.preventDefault(); ensureSheet(); openModal('shortcuts-modal'); return; }
    if (e.key.toLowerCase() === 'b' && document.getElementById('cart-drawer')) { openDrawer('cart-drawer'); return; }
    if (pendingG && GO[e.key]) { location.href = ROOT + GO[e.key]; return; }
    pendingG = e.key === 'g';
    clearTimeout(gTimer); gTimer = setTimeout(() => (pendingG = false), 900);
  });
}

function ensureSheet() {
  if (document.getElementById('shortcuts-modal')) return;
  const rows = [['Ctrl / Cmd + K', 'Open search'], ['/', 'Open search'], ['B', 'Open your bag'], ['G then H', 'Home'], ['G then S', 'Shop'], ['G then C', 'Cart'], ['G then W', 'Wishlist'], ['G then A', 'Account'], ['G then J', 'Journal'], ['?', 'This sheet'], ['Esc', 'Close any panel']];
  const dlg = document.createElement('dialog');
  dlg.className = 'modal'; dlg.id = 'shortcuts-modal';
  dlg.setAttribute('aria-labelledby', 'sc-title');
  dlg.innerHTML = `<div class="modal__head"><h2 class="modal__title" id="sc-title">Keyboard shortcuts</h2><button class="icon-btn" data-modal-close aria-label="Close"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
    <div class="modal__body"><table class="spec-table"><tbody>${rows.map(([k, v]) => `<tr><th scope="row"><kbd>${k}</kbd></th><td>${v}</td></tr>`).join('')}</tbody></table></div>`;
  document.body.append(dlg);
}
