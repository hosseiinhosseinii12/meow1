/**
 * drawer.js — Off-canvas panels (mobile menu, filters, mini cart).
 * Open with [data-drawer-open="id"], close with [data-drawer-close] / ESC / backdrop.
 */
import { trapFocus } from './modal.js';

let active = null;
let opener = null;

export function openDrawer(id, from = document.activeElement) {
  const el = document.getElementById(id);
  if (!el) return;
  if (active && active !== el) closeDrawer();
  active = el; opener = from;
  el.classList.add('is-open');
  el.setAttribute('aria-hidden', 'false');
  el.querySelector('.drawer__panel')?.removeAttribute('inert');
  document.body.classList.add('is-locked');
  document.querySelectorAll(`[data-drawer-open="${id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'true'));
  setTimeout(() => el.querySelector('.drawer__panel button, .drawer__panel a, .drawer__panel input')?.focus(), 60);
  el.dispatchEvent(new CustomEvent('drawer:open', { bubbles: true }));
}

export function closeDrawer() {
  if (!active) return;
  const el = active;
  el.classList.remove('is-open');
  el.setAttribute('aria-hidden', 'true');
  el.querySelector('.drawer__panel')?.setAttribute('inert', '');
  document.querySelectorAll(`[data-drawer-open="${el.id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'false'));
  if (!document.querySelector('dialog.modal[open]')) document.body.classList.remove('is-locked');
  active = null;
  opener?.focus?.();
}

export function initDrawers() {
  document.querySelectorAll('.drawer').forEach((d) => { d.setAttribute('aria-hidden', 'true'); d.querySelector('.drawer__panel')?.setAttribute('inert', ''); });
  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-drawer-open]');
    if (o) { e.preventDefault(); openDrawer(o.dataset.drawerOpen, o); return; }
    if (e.target.closest('[data-drawer-close]') || e.target.classList.contains('drawer__backdrop')) closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.key === 'Escape') closeDrawer();
    trapFocus(active.querySelector('.drawer__panel'), e);
  });
}
