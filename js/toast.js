/**
 * toast.js — Stacking, auto-dismissing notifications from the top right.
 */
import { icon } from './icons.js';
import { escapeHTML } from './state.js';

const ICONS = { success: 'check-circle', error: 'x-circle', info: 'info' };
let region;

function ensureRegion() {
  region ??= document.querySelector('.toast-region') ?? Object.assign(document.body.appendChild(document.createElement('div')), { className: 'toast-region' });
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  return region;
}

export function toast({ type = 'info', title = '', message = '', duration = 4200 } = {}) {
  const host = ensureRegion();
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `
    <span class="toast__icon">${icon(ICONS[type] ?? 'info')}</span>
    <div><p class="toast__title">${escapeHTML(title)}</p>${message ? `<p class="toast__msg">${escapeHTML(message)}</p>` : ''}</div>
    <button class="icon-btn icon-btn--sm" type="button" aria-label="Dismiss notification">${icon('x', { cls: 'icon--sm' })}</button>
    <span class="toast__bar" style="animation-duration:${duration}ms"></span>`;
  host.prepend(el);
  // Keep the stack calm: never more than four at once.
  [...host.children].slice(4).forEach((old) => old.remove());
  let timer = setTimeout(close, duration);
  function close() {
    clearTimeout(timer);
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  }
  el.querySelector('button').addEventListener('click', close);
  el.addEventListener('mouseenter', () => { clearTimeout(timer); el.querySelector('.toast__bar').style.animationPlayState = 'paused'; });
  el.addEventListener('mouseleave', () => { timer = setTimeout(close, 1600); el.querySelector('.toast__bar').style.animationPlayState = 'running'; });
  return close;
}
