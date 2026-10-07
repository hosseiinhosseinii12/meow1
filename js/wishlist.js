/**
 * wishlist.js — Saved pieces with a slow heart pulse and the wishlist page.
 */
import { Store, $ } from './state.js';
import { findProduct } from './data.js';
import { toast } from './toast.js';
import { pulse } from './animations.js';

const ROOT = document.documentElement.dataset.root ?? '';

export class Wishlist {
  static get ids() { return Store.get('wishlist', []); }
  static has(id) { return Wishlist.ids.includes(id); }
  static add(id) { if (!Wishlist.has(id)) Store.update('wishlist', (l) => [id, ...l], []); }
  static remove(id) { Store.update('wishlist', (l) => l.filter((x) => x !== id), []); }
  static toggle(id) { const on = !Wishlist.has(id); on ? Wishlist.add(id) : Wishlist.remove(id); return on; }
}

export function updateWishBadges() {
  const n = Wishlist.ids.length;
  document.querySelectorAll('[data-wish-count]').forEach((b) => { b.textContent = n || ''; b.dataset.count = n; });
  document.querySelectorAll('[data-wish]').forEach((btn) => {
    const on = Wishlist.has(btn.dataset.wish);
    btn.setAttribute('aria-pressed', String(on));
    const name = btn.dataset.name ?? 'this piece';
    btn.setAttribute('aria-label', on ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`);
  });
}

export function initWishlist() {
  updateWishBadges();
  Store.on('wishlist', updateWishBadges);
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-wish]');
    if (!btn) return;
    e.preventDefault();
    const on = Wishlist.toggle(btn.dataset.wish);
    pulse(btn.querySelector('svg') ?? btn);
    const p = findProduct(btn.dataset.wish);
    toast({ type: on ? 'success' : 'info', title: on ? 'Saved to your wishlist' : 'Removed from your wishlist', message: p?.name });
  });
}

export async function initWishlistPage() {
  const root = $('#wishlist-root'); if (!root) return;
  const { productCard } = await import('./products.js');
  const { Cart } = await import('./cart.js');
  const render = () => {
    const items = Wishlist.ids.map(findProduct).filter(Boolean);
    $('#wish-count').textContent = `${items.length} ${items.length === 1 ? 'piece' : 'pieces'} saved`;
    $('#wish-all').hidden = !items.length;
    if (!items.length) {
      root.innerHTML = `<div class="empty"><svg class="empty__art draw-line" viewBox="0 0 140 140" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><path d="M70 112 30 72a22 22 0 0 1 40-26 22 22 0 0 1 40 26Z"/><path d="M56 62h28"/></svg><h2 class="empty__title">Nothing saved yet</h2><p class="empty__text">Tap the heart on any piece to keep it here while you decide.</p><a class="btn" href="${ROOT}shop.html">Explore the collection</a></div>`;
      return;
    }
    root.innerHTML = `<div class="product-grid product-grid--4">${items.map((p) => `<div class="u-grid u-gap-3">${productCard(p)}<div class="u-flex u-gap-6"><button class="link" type="button" data-move="${p.id}">Move to bag</button><button class="link link--muted" type="button" data-unwish="${p.id}">Remove</button></div></div>`).join('')}</div>`;
    updateWishBadges();
  };
  render();
  Store.on('wishlist', render);
  root.addEventListener('click', (e) => {
    const m = e.target.closest('[data-move]'); const r = e.target.closest('[data-unwish]');
    if (m) { Cart.add(m.dataset.move, { sourceImg: m.closest('.u-grid').querySelector('img') }); Wishlist.remove(m.dataset.move); }
    if (r) { Wishlist.remove(r.dataset.unwish); toast({ type: 'info', title: 'Removed from your wishlist' }); }
  });
  $('#wish-all')?.addEventListener('click', () => {
    const ids = Wishlist.ids;
    ids.forEach((id) => Cart.add(id, { silent: true }));
    toast({ type: 'success', title: 'All pieces added to your bag', message: `${ids.length} items` });
  });
}
