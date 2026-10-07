/**
 * theme.js — Light, dark and system themes persisted to localStorage.
 * An inline snippet in <head> applies the saved theme before first paint.
 */
import { Store } from './state.js';
import { icon } from './icons.js';

const ORDER = ['light', 'dark', 'system'];
const LABEL = { light: 'Light theme', dark: 'Dark theme', system: 'System theme' };
const ICON = { light: 'sun', dark: 'moon', system: 'monitor' };

export const getTheme = () => Store.get('theme', 'system');

export function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme'); else root.dataset.theme = mode;
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111110' : '#FBF9F5');
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.innerHTML = icon(ICON[mode]);
    btn.setAttribute('aria-label', `${LABEL[mode]}. Switch theme`);
    btn.dataset.tooltip = LABEL[mode];
  });
}

export function initTheme() {
  applyTheme(getTheme());
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    const next = ORDER[(ORDER.indexOf(getTheme()) + 1) % ORDER.length];
    const swap = () => { Store.set('theme', next); applyTheme(next); };
    document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches ? document.startViewTransition(swap) : swap();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => getTheme() === 'system' && applyTheme('system'));
}
