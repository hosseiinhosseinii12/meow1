/**
 * cookie-consent.js — Fine-bordered consent bar, choice stored in localStorage.
 */
import { Store } from './state.js';

export function initCookieConsent() {
  if (Store.get('consent')) return;
  const bar = document.createElement('div');
  bar.className = 'cookie-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Cookie preferences');
  const root = document.documentElement.dataset.root ?? '';
  bar.innerHTML = `<p>We use a few considered cookies to remember your bag and improve the atelier. <a href="${root}cookies.html">Read our cookie policy</a>.</p>
    <div class="cookie-bar__actions"><button type="button" class="link link--muted" data-consent="declined">Decline</button><button type="button" class="link link--gold" data-consent="accepted">Accept</button></div>`;
  document.body.append(bar);
  setTimeout(() => bar.classList.add('is-visible'), 1400);
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-consent]');
    if (!b) return;
    Store.set('consent', { value: b.dataset.consent, at: new Date().toISOString() });
    bar.classList.remove('is-visible');
    setTimeout(() => bar.remove(), 700);
  });
}
