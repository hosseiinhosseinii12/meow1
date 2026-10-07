/**
 * account.js — Account overview and panels, order history with status tabs,
 * and the order detail page with timeline, invoice printing and returns.
 */
import { Store, fmt, $, $$, escapeHTML } from './state.js';
import { ORDERS, CUSTOMERS, findProduct, img } from './data.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { confirmDialog, openModal } from './modal.js';
import { Cart } from './cart.js';
import { Wishlist } from './wishlist.js';
import { initCounters } from './animations.js';
import { Auth } from './auth.js';

export const STATUS = {
  placed: ['Placed', 'ink'], processing: ['Processing', 'gold'], shipped: ['Shipped', 'gold'],
  'out-for-delivery': ['Out for delivery', 'gold'], delivered: ['Delivered', 'green'], cancelled: ['Cancelled', 'red'], returned: ['Returned', 'ink'],
};
export const statusBadge = (s) => `<span class="status status--${STATUS[s]?.[1] ?? 'ink'}">${STATUS[s]?.[0] ?? s}</span>`;
const orderTotal = (o) => o.total ?? (o.subtotal + o.shipping + o.tax - o.discount);

/** A customer's orders: placed in this browser, then the demo history. */
export function myOrders() {
  const cid = CUSTOMERS[0].id;
  return [...Store.get('orders', []), ...ORDERS.filter((o) => o.customerId === cid || ORDERS.indexOf(o) < 8)].filter((o, i, a) => a.findIndex((x) => x.id === o.id) === i);
}
const findOrder = (id) => myOrders().find((o) => o.id === id) ?? ORDERS.find((o) => o.id === id);

export function initAccount() {
  const root = $('#account-root'); if (!root) return;
  const user = Auth.user ?? { name: 'Eleanor Whitcombe', email: 'eleanor.whitcombe@example.com' };
  const first = user.name.split(' ')[0];
  const orders = myOrders();
  const spent = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + orderTotal(o), 0);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const panels = {
    overview: `
      <header class="u-mb-8"><span class="eyebrow">Your atelier</span><h1 class="u-mt-2" style="font-size:var(--text-4xl)">${greet}, <em>${escapeHTML(first)}</em></h1><p class="u-soft u-mt-2">Member since March 2024 &middot; Private client</p></header>
      <div class="u-cols-3">
        <div class="panel kpi"><span class="kpi__label">Orders</span><span class="kpi__value" data-count="${orders.length}">0</span></div>
        <div class="panel kpi"><span class="kpi__label">Wishlist</span><span class="kpi__value" data-count="${Wishlist.ids.length}">0</span></div>
        <div class="panel kpi"><span class="kpi__label">Lifetime spend</span><span class="kpi__value" data-count="${Math.round(spent)}" data-prefix="$">0</span></div>
      </div>
      <section class="u-mt-12"><div class="u-flex u-between u-items-center u-mb-4"><h2 class="u-2xl">Recent orders</h2><a class="link" href="orders.html">View all ${icon('arrow-right', { cls: 'icon--sm' })}</a></div>
        <div class="table-wrap"><table class="table"><thead><tr><th scope="col">Order</th><th scope="col">Date</th><th scope="col">Status</th><th scope="col" class="num">Total</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
        <tbody>${orders.slice(0, 5).map((o) => `<tr><td class="mono">${o.id}</td><td class="u-serif u-lg">${fmt.date(o.date)}</td><td>${statusBadge(o.status)}</td><td class="num">${fmt.money(orderTotal(o))}</td><td class="num"><a class="link" href="order-detail.html?id=${o.id}">View</a></td></tr>`).join('')}</tbody></table></div></section>
      <section class="u-mt-12 u-cols-2">
        <div class="panel"><h2 class="panel__title">Default address <a class="link link--gold" href="#addresses">Edit</a></h2><p class="u-soft">${escapeHTML(user.name)}<br>24 Marylebone High Street<br>London W1U 4NR<br>United Kingdom</p></div>
        <div class="panel"><h2 class="panel__title">Your concierge</h2><p class="u-soft">Amelia Laurent is available Monday to Saturday, 9am to 7pm.</p><a class="link u-mt-4" href="contact.html">Book an appointment ${icon('arrow-right', { cls: 'icon--sm' })}</a></div>
      </section>`,
    addresses: `<h1 class="u-3xl u-mb-8">Addresses</h1><div class="u-cols-2">
      <div class="panel"><span class="status status--gold">Default</span><p class="u-soft u-mt-4">${escapeHTML(user.name)}<br>24 Marylebone High Street<br>London W1U 4NR<br>United Kingdom</p><div class="u-flex u-gap-6 u-mt-6"><button class="link" type="button" data-modal-open="address-modal">Edit</button></div></div>
      <div class="panel"><p class="u-soft">${escapeHTML(user.name)}<br>7 Rue de Sévigné<br>75004 Paris<br>France</p><div class="u-flex u-gap-6 u-mt-6"><button class="link" type="button" data-modal-open="address-modal">Edit</button><button class="link link--muted" type="button" data-toast="Set as default address">Set as default</button></div></div>
      <button class="panel empty" type="button" style="padding:var(--space-10);cursor:pointer" data-modal-open="address-modal">${icon('plus', { cls: 'icon--lg' })}<span class="u-serif u-xl">Add an address</span></button></div>`,
    payment: `<h1 class="u-3xl u-mb-8">Payment methods</h1><div class="u-cols-2"><div class="card-preview"><span class="u-xs u-upper">Maison Verdant Privilege</span><span class="card-preview__num">&bull;&bull;&bull;&bull; &bull;&bull;&bull;&bull; &bull;&bull;&bull;&bull; 4242</span><span class="u-flex u-between"><span>${escapeHTML(user.name.toUpperCase())}</span><span>09/29</span></span></div>
      <div class="panel"><p class="u-soft">Cards are tokenised by our payment partner. We never store full card numbers.</p><button class="link u-mt-6" type="button" data-toast="Card management opens at checkout">Add a card</button></div></div>`,
    profile: `<h1 class="u-3xl u-mb-8">Profile</h1><form class="form-grid form-grid--2" data-validate id="profile-form">
      <div class="field"><label class="field__label" for="pf-first">First name</label><input class="field__control" id="pf-first" name="first" autocomplete="given-name" required value="${escapeHTML(first)}"></div>
      <div class="field"><label class="field__label" for="pf-last">Last name</label><input class="field__control" id="pf-last" name="last" autocomplete="family-name" required value="${escapeHTML(user.name.split(' ').slice(1).join(' '))}"></div>
      <div class="field"><label class="field__label" for="pf-email">Email</label><input class="field__control" id="pf-email" type="email" name="email" autocomplete="email" required value="${escapeHTML(user.email)}"></div>
      <div class="field"><label class="field__label" for="pf-phone">Phone</label><input class="field__control" id="pf-phone" type="tel" name="phone" autocomplete="tel" value="+44 20 7946 0321"></div>
      <div class="field"><label class="field__label" for="pf-bday">Birthday</label><input class="field__control" id="pf-bday" type="date" name="bday" autocomplete="bday"></div>
      <div class="field"><label class="field__label" for="pf-size">Preferred size</label><select class="field__control" id="pf-size"><option>S</option><option selected>M</option><option>L</option></select></div>
      <div class="span-2"><button class="btn" type="submit">Save changes</button></div></form>`,
    notifications: `<h1 class="u-3xl u-mb-8">Notifications</h1><div class="panel" style="display:grid;gap:var(--space-6)">${[['New arrivals', 'First look at each new collection', true], ['Private sales', 'Invitations to members-only events', true], ['Order updates', 'Shipping and delivery notices', true], ['Journal', 'A monthly letter from the atelier', false], ['Back in stock', 'When wishlisted sizes return', true]].map(([t, d, on]) => `<label class="u-flex u-between u-items-center u-gap-6"><span><span class="u-serif u-xl">${t}</span><br><span class="u-sm u-muted">${d}</span></span><span class="switch"><input type="checkbox" ${on ? 'checked' : ''} aria-label="${t}"></span></label>`).join('<hr style="margin:0">')}</div>`,
  };
  const show = () => {
    const key = location.hash.slice(1) || 'overview';
    const k = panels[key] ? key : 'overview';
    root.innerHTML = panels[k];
    $$('.account-nav [data-panel]').forEach((a) => a.toggleAttribute('aria-current', a.dataset.panel === k) || a.setAttribute('aria-current', a.dataset.panel === k ? 'page' : 'false'));
    $$('.account-nav [data-panel]').forEach((a) => (a.dataset.panel === k ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    initCounters(root);
    $('#profile-form')?.addEventListener('submit', (e) => { e.preventDefault(); toast({ type: 'success', title: 'Profile saved' }); });
  };
  addEventListener('hashchange', show);
  show();
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-toast]'); if (t) toast({ type: 'success', title: t.dataset.toast }); });
  $('#address-form')?.addEventListener('submit', (e) => { e.preventDefault(); e.target.closest('dialog').close(); toast({ type: 'success', title: 'Address saved' }); });
}

export function initOrders() {
  const root = $('#orders-root'); if (!root) return;
  const all = myOrders();
  const render = (filter = 'all') => {
    const groups = { all: () => true, active: (o) => ['placed', 'processing', 'shipped', 'out-for-delivery'].includes(o.status), delivered: (o) => o.status === 'delivered', cancelled: (o) => ['cancelled', 'returned'].includes(o.status) };
    const list = all.filter(groups[filter]);
    root.innerHTML = list.length ? list.map((o) => `
      <article class="order-card">
        <div class="order-card__head"><span class="mono">${o.id}</span><time class="u-serif u-xl" datetime="${o.date}">${fmt.date(o.date)}</time>${statusBadge(o.status)}<span class="mono" style="margin-inline-start:auto">${fmt.money(orderTotal(o))}</span></div>
        <div class="order-card__thumbs">${o.items.map((it) => { const p = findProduct(it.id); return `<img src="${img(p.images[0], 160)}" alt="${escapeHTML(p.name)}" loading="lazy" title="${escapeHTML(p.name)}">`; }).join('')}</div>
        <div class="order-card__foot"><span class="u-sm u-muted">${o.items.reduce((n, i) => n + i.qty, 0)} items &middot; ${escapeHTML(typeof o.method === 'string' ? o.method : 'Standard')} delivery</span><span class="u-flex u-gap-6"><button class="link link--muted" type="button" data-reorder="${o.id}">Reorder</button><a class="link" href="order-detail.html?id=${o.id}">View details ${icon('arrow-right', { cls: 'icon--sm' })}</a></span></div>
      </article>`).join('') : `<div class="empty"><svg class="empty__art draw-line" viewBox="0 0 140 140" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><rect x="30" y="40" width="80" height="70" rx="2"/><path d="M30 60h80M56 40v20M84 40v20"/></svg><h2 class="empty__title">No orders here</h2><p class="empty__text">When you place an order it will be kept safely in this list.</p><a class="btn" href="shop.html">Discover the collection</a></div>`;
  };
  render();
  $('#orders-tabs').addEventListener('tabs:change', (e) => render(e.detail.value));
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-reorder]'); if (!b) return;
    findOrder(b.dataset.reorder).items.forEach((it) => Cart.add(it.id, { qty: it.qty, color: it.color, size: it.size, silent: true }));
    toast({ type: 'success', title: 'Added to your bag', message: 'Every piece from this order is waiting for you.' });
  });
}

export function initOrderDetail() {
  const root = $('#order-root'); if (!root) return;
  const o = findOrder(new URLSearchParams(location.search).get('id')) ?? myOrders()[0];
  const steps = ['placed', 'processing', 'shipped', 'out-for-delivery', 'delivered'];
  const idx = o.status === 'cancelled' ? 0 : steps.indexOf(o.status);
  const stepDate = (i) => fmt.short(new Date(new Date(o.date).getTime() + i * 864e5 * 1.2));
  document.title = `Order ${o.id} | Maison Verdant`;
  root.innerHTML = `
    <header class="u-flex u-between u-wrap u-gap-6 u-items-center">
      <div><span class="eyebrow">Order</span><h1 class="mono u-mt-2" style="font-size:var(--text-3xl)">${o.id}</h1><p class="u-serif u-xl u-soft">Placed ${fmt.date(o.date)}</p></div>
      ${statusBadge(o.status)}
    </header>
    <div class="print-only"><p class="wordmark">Maison Verdant</p><p>Invoice for order ${o.id}. 24 Marylebone High Street, London W1U 4NR. VAT GB 123 4567 89</p></div>
    ${o.status === 'cancelled' ? '<div class="alert alert--error u-mt-8">' + icon('x-circle') + '<div><strong>This order was cancelled</strong>A full refund has been issued to your original payment method.</div></div>' : `
    <ol class="timeline" role="list" aria-label="Order progress" style="--_p:${(idx / 4) * 80}%"><span class="timeline__progress" aria-hidden="true"></span>
      ${steps.map((s, i) => `<li class="timeline__step ${i < idx || (i === idx && s === 'delivered') ? 'is-done' : ''} ${i === idx && s !== 'delivered' ? 'is-current' : ''}"><span class="timeline__dot" aria-hidden="true"></span><span class="timeline__label">${STATUS[s][0]}</span><span class="timeline__date">${i <= idx ? stepDate(i) : 'Pending'}</span></li>`).join('')}
    </ol>`}
    <section class="u-mt-8"><h2 class="u-2xl u-mb-4">Items</h2>
      ${o.items.map((it) => { const p = findProduct(it.id); return `<div class="line-item"><img class="line-item__img" src="${img(p.images[0], 240)}" alt=""><div class="line-item__info"><span class="product-card__brand">${escapeHTML(p.brand)}</span><a class="line-item__title" href="product.html?id=${p.id}">${escapeHTML(p.name)}</a><span class="line-item__variant">${[it.color, it.size].filter(Boolean).join(' / ')} &middot; Qty ${it.qty} &middot; <span class="mono">${p.sku}</span></span></div><span class="mono">${fmt.money(it.price * it.qty)}</span></div>`; }).join('')}
    </section>
    <div class="u-cols-2 u-mt-8">
      <div class="panel"><h2 class="panel__title">Shipping</h2><p class="u-soft">${escapeHTML(o.address.name)}<br>${escapeHTML(o.address.line1)}<br>${escapeHTML(o.address.city)} ${escapeHTML(o.address.zip)}<br>${escapeHTML(o.address.country)}</p><p class="u-xs u-muted u-mt-4">${escapeHTML(typeof o.method === 'string' ? o.method : 'Standard')} &middot; Tracking <span class="mono">1Z 999 AA1 0123 4567 84</span></p></div>
      <div class="panel"><h2 class="panel__title">Payment</h2><p class="u-soft">${escapeHTML(o.payment)}</p><div class="summary u-mt-6">
        <div class="summary__row"><span>Subtotal</span><span>${fmt.money(o.subtotal, true)}</span></div>${o.discount ? `<div class="summary__row summary__row--discount"><span>Privilege</span><span>-${fmt.money(o.discount, true)}</span></div>` : ''}
        <div class="summary__row"><span>Shipping</span><span>${o.shipping ? fmt.money(o.shipping, true) : 'Complimentary'}</span></div><div class="summary__row"><span>Tax</span><span>${fmt.money(o.tax, true)}</span></div>
        <div class="summary__total"><span>Total</span><span>${fmt.money(orderTotal(o), true)}</span></div></div></div>
    </div>
    <div class="u-flex u-wrap u-gap-6 u-items-center u-mt-12 no-print">
      <a class="btn" href="#" data-track>${icon('truck', { cls: 'icon--sm' })} Track shipment</a>
      <button class="btn btn--ghost" type="button" data-print>${icon('download', { cls: 'icon--sm' })} Download invoice</button>
      ${o.status === 'delivered' ? '<button class="link" type="button" data-modal-open="return-modal">Request a return</button>' : ''}
      ${['placed', 'processing'].includes(o.status) ? '<button class="link link--danger" type="button" data-cancel>Cancel order</button>' : ''}
    </div>`;
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-print]')) print();
    if (e.target.closest('[data-track]')) { e.preventDefault(); toast({ type: 'info', title: 'In transit with DHL Express', message: 'Last scan: London Heathrow, 06:42 today.' }); }
    if (e.target.closest('[data-cancel]')) {
      if (await confirmDialog({ title: 'Cancel this order?', message: 'Your pieces will be returned to the atelier and a full refund issued within five working days.', confirm: 'Cancel order', danger: true })) {
        Store.update('orders', (l) => l.map((x) => (x.id === o.id ? { ...x, status: 'cancelled' } : x)), []);
        toast({ type: 'success', title: 'Order cancelled', message: 'A confirmation is on its way to your inbox.' });
        setTimeout(() => location.reload(), 1200);
      }
    }
  });
  $('#return-form')?.addEventListener('submit', (e) => { e.preventDefault(); e.target.closest('dialog').close(); toast({ type: 'success', title: 'Return requested', message: 'A prepaid label has been emailed to you.' }); });
}
