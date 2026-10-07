/**
 * cart.js — Bag state, totals, promo codes, mini-cart drawer and cart page.
 */
import { Store, fmt, $, escapeHTML } from './state.js';
import { findProduct, PROMOS, PRODUCTS, img } from './data.js';
import { toast } from './toast.js';
import { icon } from './icons.js';
import { flyToCart } from './animations.js';
import { Wishlist } from './wishlist.js';

const ROOT = document.documentElement.dataset.root ?? '';
export const FREE_SHIPPING_AT = 250;
export const SHIPPING_METHODS = [
  { id: 'standard', name: 'Standard', price: 18, days: 5, note: 'Three to five working days' },
  { id: 'express', name: 'Express', price: 35, days: 2, note: 'Two working days, tracked' },
  { id: 'nextday', name: 'Next Day Courier', price: 60, days: 1, note: 'Order before 2pm, signed for' },
];

export class Cart {
  static get items() { return Store.get('cart', []); }
  static get count() { return Cart.items.reduce((n, it) => n + it.qty, 0); }

  static add(id, { qty = 1, color = null, size = null, silent = false, sourceImg = null } = {}) {
    const p = findProduct(id);
    if (!p) return;
    color ??= p.colors[0]?.name ?? null;
    size ??= p.sizes.length ? p.sizes[Math.min(2, p.sizes.length - 1)] : null;
    const key = [p.id, color, size].join('|');
    Store.update('cart', (items) => {
      const found = items.find((it) => it.key === key);
      if (found) found.qty = Math.min(p.stock, found.qty + qty); else items.push({ key, id: p.id, qty: Math.min(qty, p.stock), color, size });
      return items;
    }, []);
    if (sourceImg) flyToCart(sourceImg);
    if (!silent) toast({ type: 'success', title: 'Added to your bag', message: `${p.name}${size ? `, ${size}` : ''}` });
  }
  static setQty(key, qty) {
    Store.update('cart', (items) => items.flatMap((it) => {
      if (it.key !== key) return [it];
      const max = findProduct(it.id)?.stock ?? 10;
      return qty <= 0 ? [] : [{ ...it, qty: Math.min(max, qty) }];
    }), []);
  }
  static remove(key) { Store.update('cart', (items) => items.filter((it) => it.key !== key), []); }
  static clear() { Store.set('cart', []); Store.remove('promo'); }

  static get promo() { return Store.get('promo', null); }
  static applyPromo(code) {
    const c = code.trim().toUpperCase();
    if (!PROMOS[c]) return { ok: false, message: 'That code is not recognised. Try SAVE10, FREESHIP or WELCOME15.' };
    Store.set('promo', c);
    return { ok: true, message: `${c} applied: ${PROMOS[c].label}.` };
  }
  static removePromo() { Store.remove('promo'); Store.set('promo', null); }

  /** All money maths lives here. */
  static totals(method = Store.get('shipMethod', 'standard')) {
    const lines = Cart.items.map((it) => ({ ...it, product: findProduct(it.id) })).filter((l) => l.product);
    const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
    const code = Cart.promo; const promo = code ? PROMOS[code] : null;
    const discount = promo?.type === 'percent' ? Math.round(subtotal * promo.value) / 100 : 0;
    const m = SHIPPING_METHODS.find((x) => x.id === method) ?? SHIPPING_METHODS[0];
    let shipping = m.price;
    if (m.id === 'standard' && subtotal >= FREE_SHIPPING_AT) shipping = 0;
    if (promo?.type === 'shipping') shipping = 0;
    if (!lines.length) shipping = 0;
    const tax = Math.round((subtotal - discount) * 0.08 * 100) / 100;
    return { lines, subtotal, discount, shipping, tax, total: subtotal - discount + shipping + tax, code, method: m };
  }
}

/* ---- Header badges ---------------------------------------------------- */
export function updateCartBadges() {
  const n = Cart.count;
  document.querySelectorAll('[data-cart-count]').forEach((b) => {
    const changed = b.textContent !== String(n);
    b.textContent = n || '';
    b.dataset.count = n;
    if (changed) { b.classList.remove('is-bumping'); void b.offsetWidth; b.classList.add('is-bumping'); }
  });
}

/* ---- Summary block (shared by cart, checkout, drawer) ---------------- */
export function summaryHTML(t = Cart.totals(), { compact = false } = {}) {
  return `
    <div class="summary__row"><span>Subtotal</span><span>${fmt.money(t.subtotal, true)}</span></div>
    ${t.discount ? `<div class="summary__row summary__row--discount"><span>Privilege ${escapeHTML(t.code)}</span><span>-${fmt.money(t.discount, true)}</span></div>` : ''}
    ${compact ? '' : `<div class="summary__row"><span>Shipping${t.method ? `, ${t.method.name}` : ''}</span><span>${t.shipping ? fmt.money(t.shipping, true) : 'Complimentary'}</span></div>
    <div class="summary__row"><span>Estimated tax</span><span>${fmt.money(t.tax, true)}</span></div>`}
    <div class="summary__total"><span>Total</span><span>${fmt.money(compact ? t.subtotal - t.discount : t.total, true)}</span></div>`;
}

function lineHTML(l, { compact = false } = {}) {
  const p = l.product;
  const variant = [l.color, l.size].filter(Boolean).join(' / ');
  const pdp = `${ROOT}product.html?id=${p.id}`;
  return `
  <article class="line-item" data-key="${escapeHTML(l.key)}">
    <a href="${pdp}"><img class="line-item__img" src="${img(p.images[0], 240)}" alt="${escapeHTML(p.name)}" loading="lazy" width="80" height="107"></a>
    <div class="line-item__info">
      <span class="product-card__brand">${escapeHTML(p.brand)}</span>
      <h3 class="line-item__title"><a href="${pdp}">${escapeHTML(p.name)}</a></h3>
      <span class="line-item__variant">${escapeHTML(variant)}${compact ? ` &middot; <span class="mono">${fmt.money(p.price)}</span>` : ''}</span>
      <div class="line-item__controls">
        <div class="qty qty--sm" role="group" aria-label="Quantity for ${escapeHTML(p.name)}">
          <button type="button" data-qty="-1" aria-label="Decrease quantity" ${l.qty <= 1 ? 'disabled' : ''}>${icon('minus', { cls: 'icon--xs' })}</button>
          <input type="number" inputmode="numeric" min="1" max="${p.stock}" value="${l.qty}" aria-label="Quantity" data-qty-input>
          <button type="button" data-qty="1" aria-label="Increase quantity" ${l.qty >= p.stock ? 'disabled' : ''}>${icon('plus', { cls: 'icon--xs' })}</button>
        </div>
        ${compact ? '' : `<button type="button" class="link link--muted" data-move-wish>Move to wishlist</button>`}
      </div>
    </div>
    <div class="line-item__end">
      <button type="button" class="icon-btn icon-btn--sm" data-remove aria-label="Remove ${escapeHTML(p.name)}">${icon('x', { cls: 'icon--sm' })}</button>
      <span class="price">${compact ? '' : `<span class="u-muted u-xs">${fmt.money(p.price)} &times; ${l.qty}</span>`}</span>
      <span class="mono">${fmt.money(p.price * l.qty)}</span>
    </div>
  </article>`;
}

/** Delegated behaviour for any container of .line-item rows. */
function bindLines(container) {
  container.addEventListener('click', (e) => {
    const row = e.target.closest('.line-item'); if (!row) return;
    const key = row.dataset.key; const item = Cart.items.find((i) => i.key === key); if (!item) return;
    if (e.target.closest('[data-qty]')) Cart.setQty(key, item.qty + Number(e.target.closest('[data-qty]').dataset.qty));
    if (e.target.closest('[data-remove]')) {
      row.classList.add('is-removing');
      setTimeout(() => { Cart.remove(key); toast({ type: 'info', title: 'Removed from your bag', message: findProduct(item.id)?.name }); }, 300);
    }
    if (e.target.closest('[data-move-wish]')) { Wishlist.add(item.id); Cart.remove(key); toast({ type: 'success', title: 'Moved to your wishlist' }); }
  });
  container.addEventListener('change', (e) => {
    if (!e.target.matches('[data-qty-input]')) return;
    Cart.setQty(e.target.closest('.line-item').dataset.key, parseInt(e.target.value, 10) || 1);
  });
}

/* ---- Mini-cart drawer ------------------------------------------------- */
export function renderMiniCart() {
  const body = $('#cart-drawer-body'); const foot = $('#cart-drawer-foot');
  if (!body) return;
  const t = Cart.totals();
  const left = Math.max(0, FREE_SHIPPING_AT - t.subtotal);
  if (!t.lines.length) {
    body.innerHTML = `<div class="empty">${emptyBagArt()}<h3 class="empty__title">Your bag is empty</h3><p class="empty__text">Pieces you add will wait for you here.</p><a class="btn" href="${ROOT}shop.html">Discover the collection</a></div>`;
    foot.hidden = true; return;
  }
  foot.hidden = false;
  body.innerHTML = `
    <div class="u-mb-6"><p class="u-sm u-soft">${left ? `You are <span class="mono">${fmt.money(left)}</span> from complimentary shipping.` : 'Your order ships complimentary.'}</p>
    <div class="progress u-mt-2"><div class="progress__bar" style="--_v:${Math.min(100, (t.subtotal / FREE_SHIPPING_AT) * 100)}%"></div></div></div>
    ${t.lines.map((l) => lineHTML(l, { compact: true })).join('')}`;
  foot.innerHTML = `<div class="summary">${summaryHTML(t, { compact: true })}</div>
    <p class="u-xs u-muted">Shipping and taxes calculated at checkout.</p>
    <a class="btn btn--block" href="${ROOT}checkout.html">Checkout ${icon('lock', { cls: 'icon--sm' })}</a>
    <a class="link u-center" style="justify-self:center" href="${ROOT}cart.html">View bag</a>`;
}

export function emptyBagArt() {
  return `<svg class="empty__art draw-line" viewBox="0 0 140 140" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><path d="M34 48h72l-6 70H40Z"/><path d="M52 48V38a18 18 0 0 1 36 0v10"/><path d="M58 70c4 6 20 6 24 0"/><circle cx="70" cy="126" r="1.5"/></svg>`;
}

/* ---- Global add-to-cart delegation ----------------------------------- */
export function initCart() {
  updateCartBadges();
  renderMiniCart();
  const drawerBody = $('#cart-drawer-body');
  if (drawerBody) bindLines(drawerBody);
  Store.on('cart', () => { updateCartBadges(); renderMiniCart(); });
  Store.on('promo', renderMiniCart);
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add-to-cart]');
    if (!btn) return;
    e.preventDefault();
    const card = btn.closest('.product-card, [data-product-root]');
    Cart.add(btn.dataset.addToCart, { sourceImg: card?.querySelector('img') });
  });
}

/* ---- Cart page -------------------------------------------------------- */
export async function initCartPage() {
  const root = $('#cart-root'); if (!root) return;
  const { productCard } = await import('./products.js');
  const render = () => {
    const t = Cart.totals();
    if (!t.lines.length) {
      root.innerHTML = `<div class="empty">${emptyBagArt()}<h2 class="empty__title">Your bag is waiting to be filled</h2><p class="empty__text">Take your time. Every piece in the collection has been chosen to be kept for years.</p><a class="btn" href="${ROOT}shop.html">Start shopping</a></div>`;
      return;
    }
    const promo = t.code ? PROMOS[t.code] : null;
    root.innerHTML = `
    <div class="split split--summary">
      <section aria-labelledby="bag-items-title">
        <h2 id="bag-items-title" class="visually-hidden">Items</h2>
        <div id="cart-lines">${t.lines.map((l) => lineHTML(l)).join('')}</div>
        <a class="link u-mt-8" href="${ROOT}shop.html">${icon('arrow-left', { cls: 'icon--sm' })} Continue shopping</a>
      </section>
      <aside aria-labelledby="summary-title">
        <div class="sticky summary">
          <h2 id="summary-title" class="summary__title">Order summary</h2>
          <form class="field" id="promo-form">
            <label class="field__label" for="promo">Privilege code</label>
            <div class="input-group"><input id="promo" name="promo" autocomplete="off" placeholder="Enter code" value="${t.code ?? ''}" ${t.code ? 'readonly' : ''}><button type="submit">${t.code ? 'Remove' : 'Apply'}</button></div>
            <p class="u-xs ${promo ? 'u-success' : 'u-muted'}" id="promo-msg" role="status">${promo ? `${icon('check', { cls: 'icon--xs' })} ${promo.label}` : 'Try SAVE10, FREESHIP or WELCOME15.'}</p>
          </form>
          <form class="field" id="ship-form">
            <span class="field__label">Estimate shipping</span>
            <div class="form-grid form-grid--2">
              <select class="field__control" name="country" aria-label="Country" autocomplete="country"><option>United States</option><option>United Kingdom</option><option>France</option><option>Italy</option><option>Japan</option><option>Canada</option></select>
              <div class="input-group"><input name="zip" aria-label="ZIP or postal code" placeholder="ZIP" autocomplete="postal-code" inputmode="numeric"><button type="submit">Calculate</button></div>
            </div>
            <p class="u-xs u-muted" id="ship-msg" role="status"></p>
          </form>
          <div class="summary">${summaryHTML(t)}</div>
          <a class="btn btn--block" href="${ROOT}checkout.html">Proceed to checkout</a>
          <p class="u-xs u-muted u-center">${icon('lock', { cls: 'icon--xs' })} Secure checkout. Complimentary returns within 30 days.</p>
        </div>
      </aside>
    </div>`;
    bindLines($('#cart-lines'));
    $('#promo-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (Cart.promo) { Cart.removePromo(); return; }
      const res = Cart.applyPromo($('#promo').value);
      if (!res.ok) { const m = $('#promo-msg'); m.className = 'u-xs u-error'; m.textContent = res.message; }
      else toast({ type: 'success', title: 'Privilege applied', message: res.message });
    });
    $('#ship-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target); const zip = String(f.get('zip') ?? '').trim();
      const msg = $('#ship-msg');
      if (zip.length < 3) { msg.className = 'u-xs u-error'; msg.textContent = 'Please enter a valid ZIP or postal code.'; return; }
      const days = f.get('country') === 'United States' ? 3 : 5;
      const d = new Date(); d.setDate(d.getDate() + days);
      msg.className = 'u-xs u-success';
      msg.textContent = `${t.shipping ? fmt.money(t.shipping) : 'Complimentary'} to ${zip}. Arrives by ${fmt.weekday(d)}.`;
    });
  };
  render();
  Store.on('cart', render); Store.on('promo', render);
  const rec = $('#cart-recs');
  if (rec) rec.innerHTML = [...PRODUCTS].sort((a, b) => b.rating - a.rating).slice(0, 8).map((p) => productCard(p)).join('');
}
