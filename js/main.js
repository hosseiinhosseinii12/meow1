/**
 * main.js — Entry point for every storefront page. Boots shared UI, then
 * lazy-loads the controller for the current page via body[data-page].
 */
import { Store, $, $$ } from './state.js';
import { ANNOUNCEMENTS } from './data.js';
import { initTheme } from './theme.js';
import { initModals } from './modal.js';
import { initDrawers } from './drawer.js';
import { initCart } from './cart.js';
import { initWishlist } from './wishlist.js';
import { initReveal, initCounters, initRipple, initCursor, initHeader, initBlurUp } from './animations.js';
import { initAccordions } from './accordion.js';
import { initTabs } from './tabs.js';
import { initCarousels } from './carousel.js';
import { initCookieConsent } from './cookie-consent.js';
import { initBackToTop } from './back-to-top.js';
import { initShortcuts } from './shortcuts.js';
import { initSearchOverlay } from './search.js';
import { initValidation } from './validation.js';
import { renderCollections, initQuickView } from './products.js';
import { toast } from './toast.js';
import { hydrateIcons } from './icons.js';

/* Missing photography falls back to a quiet local placeholder. */
const ROOT = document.documentElement.dataset.root ?? '';
addEventListener('error', (e) => {
  const el = e.target;
  if (el instanceof HTMLImageElement && !el.dataset.fallback) { el.dataset.fallback = '1'; el.srcset = ''; el.src = `${ROOT}assets/placeholder.svg`; }
}, true);

/* ---- Announcement bar: rotating, dismissible ------------------------- */
function initAnnouncement() {
  const bar = $('.announce'); if (!bar) return;
  if (Store.get('announce-dismissed')) { bar.hidden = true; return; }
  const track = $('.announce__track', bar);
  track.innerHTML = ANNOUNCEMENTS.map((m, i) => `<p class="announce__msg ${i === 0 ? 'is-active' : ''}">${m}</p>`).join('');
  const msgs = $$('.announce__msg', bar); let i = 0;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(() => {
    msgs[i].classList.replace('is-active', 'is-leaving');
    const prev = msgs[i]; setTimeout(() => prev.classList.remove('is-leaving'), 700);
    i = (i + 1) % msgs.length; msgs[i].classList.add('is-active');
  }, 4800);
  $('.announce__close', bar).addEventListener('click', () => { bar.hidden = true; Store.set('announce-dismissed', true); dispatchEvent(new Event('scroll')); });
}

/* ---- Newsletter forms ------------------------------------------------- */
function initNewsletter() {
  $$('[data-newsletter]').forEach((form) => form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.querySelector('input[type="email"]');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value)) { toast({ type: 'error', title: 'Please check your email', message: 'That address does not look quite right.' }); email.focus(); return; }
    Store.set('newsletter', email.value);
    form.reset();
    toast({ type: 'success', title: 'Welcome to the letter', message: 'Expect something thoughtful once a month.' });
  }));
}

/* ---- Copy-to-clipboard for coupon codes ------------------------------ */
function initCopy() {
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); toast({ type: 'success', title: 'Code copied', message: `${b.dataset.copy} is ready to paste at checkout.` }); }
    catch { toast({ type: 'info', title: `Your code is ${b.dataset.copy}` }); }
  });
}

/* ---- Page controllers (lazy) ---------------------------------------- */
const PAGES = {
  home: async () => { renderCollections(); initCarousels(); },
  shop: async () => (await import('./products.js')).initShop(),
  category: async () => (await import('./products.js')).initCategory(),
  product: async () => (await import('./products.js')).initProduct(),
  search: async () => (await import('./search.js')).initSearchPage(),
  cart: async () => { await (await import('./cart.js')).initCartPage(); initCarousels(); },
  checkout: async () => (await import('./checkout.js')).initCheckout(),
  confirmation: async () => { await (await import('./checkout.js')).initConfirmation(); initCarousels(); },
  account: async () => (await import('./account.js')).initAccount(),
  orders: async () => (await import('./account.js')).initOrders(),
  'order-detail': async () => (await import('./account.js')).initOrderDetail(),
  wishlist: async () => (await import('./wishlist.js')).initWishlistPage(),
  auth: async () => (await import('./auth.js')).initAuth(),
  blog: async () => (await import('./blog.js')).initBlog(),
  post: async () => (await import('./blog.js')).initPost(),
  about: async () => initCounters(),
  contact: async () => {
    $('#contact-form')?.addEventListener('submit', (e) => { e.preventDefault(); e.target.reset(); toast({ type: 'success', title: 'Message received', message: 'Your concierge will reply within one working day.' }); });
  },
  faq: async () => {
    const input = $('#faq-search'); const empty = $('#faq-empty');
    input?.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase(); let shown = 0;
      $$('.faq-panel').forEach((panel) => { if (q) panel.hidden = false; });
      $$('.faq-panel .accordion__item').forEach((it) => { const hit = !q || it.textContent.toLowerCase().includes(q); it.hidden = !hit; shown += hit; });
      if (!q) $('[data-tabs]')?.selectTab?.($('[role="tab"][aria-selected="true"]')?.dataset.value);
      $('.faq-tabs-list').hidden = Boolean(q);
      empty.hidden = shown > 0;
    });
  },
  legal: async () => { (await import('./blog.js')).initScrollSpy('.legal__toc', '.prose h2[id]'); $('[data-print]')?.addEventListener('click', () => print()); },
  error: async () => {
    $('[data-retry]')?.addEventListener('click', () => location.reload());
    const c = $('[data-maint-countdown]');
    if (c) { let n = Number(c.dataset.maintCountdown); setInterval(() => { n = Math.max(0, n - 1); const m = Math.floor(n / 60); c.textContent = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; }, 1000); }
  },
  styleguide: async () => {
    renderCollections(); initCarousels();
    document.addEventListener('click', (e) => { const t = e.target.closest('[data-demo-toast]'); if (t) toast({ type: t.dataset.demoToast, title: { success: 'Saved to your wishlist', error: 'Payment declined', info: 'Your concierge is online' }[t.dataset.demoToast], message: 'This is how notifications feel across the house.' }); });
  },
};

async function boot() {
  document.documentElement.classList.remove('no-js');
  hydrateIcons();
  initTheme();
  initAnnouncement();
  initHeader();
  initModals();
  initDrawers();
  initCart();
  initWishlist();
  initQuickView();
  initSearchOverlay();
  initShortcuts();
  initAccordions();
  initTabs();
  initValidation();
  initNewsletter();
  initCopy();
  initRipple();
  initCursor();
  initBlurUp();
  const page = document.body.dataset.page;
  const results = await Promise.allSettled([PAGES[page]?.()]);
  results.filter((r) => r.status === 'rejected').forEach((r) => console.warn('[Maison Verdant] page init:', r.reason));
  initReveal();
  initCounters();
  initBackToTop();
  initCookieConsent();
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-logout]')) return;
    e.preventDefault(); (await import('./auth.js')).Auth.signOut();
    toast({ type: 'info', title: 'Signed out', message: 'Until next time.' });
    setTimeout(() => (location.href = `${ROOT}index.html`), 700);
  });
}

boot();
