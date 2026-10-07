/**
 * back-to-top.js — Small fine-bordered circle that fades in after scrolling.
 */
import { icon } from './icons.js';
import { reducedMotion } from './state.js';

export function initBackToTop() {
  const btn = document.createElement('button');
  btn.className = 'back-to-top';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML = icon('arrow-up', { cls: 'icon--sm' });
  document.body.append(btn);
  const sentinel = Object.assign(document.createElement('div'), { style: 'position:absolute;top:0;height:900px;width:1px;pointer-events:none' });
  sentinel.setAttribute('aria-hidden', 'true');
  document.body.prepend(sentinel);
  new IntersectionObserver(([en]) => btn.classList.toggle('is-visible', !en.isIntersecting)).observe(sentinel);
  btn.addEventListener('click', () => { scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); document.querySelector('#main')?.focus({ preventScroll: true }); });
}
