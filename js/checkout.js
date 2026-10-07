/**
 * checkout.js — Five-step checkout (bag, information, shipping, payment,
 * review) with validation gates, progress bar, card formatting, and the
 * order confirmation page with confetti.
 */
import { Cart, SHIPPING_METHODS, summaryHTML } from './cart.js';
import { Store, fmt, $, $$, escapeHTML, addBusinessDays } from './state.js';
import { img, findProduct, PRODUCTS } from './data.js';
import { icon } from './icons.js';
import { validateScope, maskCard, maskExpiry, maskDigits, initValidation } from './validation.js';
import { toast } from './toast.js';
import { confetti } from './confetti.js';

const STEPS = ['bag', 'information', 'shipping', 'payment', 'review'];

export function initCheckout() {
  const root = $('#checkout'); if (!root) return;
  if (!Cart.items.length) {
    root.innerHTML = `<div class="empty"><svg class="empty__art draw-line" viewBox="0 0 140 140" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><path d="M34 48h72l-6 70H40Z"/><path d="M52 48V38a18 18 0 0 1 36 0v10"/></svg><h2 class="empty__title">Your bag is empty</h2><p class="empty__text">Add a piece or two before checking out.</p><a class="btn" href="shop.html">Discover the collection</a></div>`;
    return;
  }
  initValidation(root);
  const saved = Store.get('checkout', {});
  let step = 1;
  const form = $('#checkout-form');

  // Restore saved details (never card data).
  Object.entries(saved).forEach(([k, v]) => { const el = form.elements[k]; if (el && el.type !== 'radio' && el.type !== 'checkbox') el.value = v; else if (el?.length) [...el].forEach((r) => (r.checked = r.value === v)); });

  // Shipping methods
  const current = Store.get('shipMethod', 'standard');
  $('#ship-methods').innerHTML = SHIPPING_METHODS.map((m) => {
    const t = Cart.totals(m.id);
    return `<label class="radio-card"><span class="check"><input type="radio" name="method" value="${m.id}" ${m.id === current ? 'checked' : ''} required></span>
      <span><span class="radio-card__name">${m.name}</span><span class="radio-card__meta">${m.note}. Arrives ${fmt.weekday(addBusinessDays(new Date(), m.days))}</span></span>
      <span class="mono u-sm">${t.shipping ? fmt.money(t.shipping) : 'Complimentary'}</span></label>`;
  }).join('');
  form.addEventListener('change', (e) => {
    if (e.target.name === 'method') { Store.set('shipMethod', e.target.value); paintSummary(); }
    if (e.target.name === 'pay') paintPay();
    if (e.target.name === 'account') $('#create-pass').hidden = e.target.value !== 'create';
  });

  // Payment tabs
  const paintPay = () => {
    const v = form.elements.pay.value;
    $$('[data-pay-panel]').forEach((p) => { p.hidden = p.dataset.payPanel !== v; p.querySelectorAll('input').forEach((i) => (i.disabled = p.hidden)); });
  };
  paintPay();
  maskCard(form.elements.cardnumber); maskExpiry(form.elements.expiry); maskDigits(form.elements.cvc, 4);
  form.elements.cardnumber.addEventListener('input', () => { $('#card-num-preview').textContent = (form.elements.cardnumber.value || '0000 0000 0000 0000').padEnd(19, ' '); });
  form.elements.ccname.addEventListener('input', () => { $('#card-name-preview').textContent = form.elements.ccname.value.toUpperCase() || 'YOUR NAME'; });
  form.elements.expiry.addEventListener('input', () => { $('#card-exp-preview').textContent = form.elements.expiry.value || 'MM/YY'; });

  // Bag step lines
  const t0 = Cart.totals();
  $('#step-bag-lines').innerHTML = t0.lines.map((l) => `<div class="line-item" style="grid-template-columns:64px 1fr auto"><img class="line-item__img" style="inline-size:64px" src="${img(l.product.images[0], 200)}" alt=""><div class="line-item__info"><span class="product-card__brand">${escapeHTML(l.product.brand)}</span><span class="line-item__title">${escapeHTML(l.product.name)}</span><span class="line-item__variant">${[l.color, l.size].filter(Boolean).join(' / ')} &middot; Qty ${l.qty}</span></div><span class="mono">${fmt.money(l.product.price * l.qty)}</span></div>`).join('');

  function paintSummary() {
    const t = Cart.totals();
    $('#co-summary').innerHTML = `<h2 class="summary__title">Order summary</h2>
      ${t.lines.map((l) => `<div class="u-flex u-gap-4 u-items-center"><div style="position:relative"><img src="${img(l.product.images[0], 160)}" alt="" style="inline-size:56px;aspect-ratio:3/4;object-fit:cover;border-radius:2px"><span class="badge-count" style="top:-8px;right:-8px">${l.qty}</span></div><div style="flex:1"><p class="u-serif u-lg" style="line-height:1.2">${escapeHTML(l.product.name)}</p><p class="u-xs u-muted">${[l.color, l.size].filter(Boolean).join(' / ')}</p></div><span class="mono u-sm">${fmt.money(l.product.price * l.qty)}</span></div>`).join('')}
      <hr style="margin-block:var(--space-2)">${summaryHTML(t)}`;
  }
  paintSummary();

  function go(n) {
    step = Math.max(1, Math.min(STEPS.length, n));
    $$('.checkout-step').forEach((s, i) => s.classList.toggle('is-active', i === step - 1));
    $$('.steps__item').forEach((s, i) => { s.classList.toggle('is-done', i < step - 1); s.classList.toggle('is-active', i === step - 1); s.querySelector('.steps__dot').setAttribute('aria-current', i === step - 1 ? 'step' : 'false'); });
    $('.steps__bar').style.inlineSize = `${((step - 1) / (STEPS.length - 1)) * 80}%`;
    if (step === 5) paintReview();
    $('.checkout-step.is-active h2')?.focus({ preventScroll: true });
    scrollTo({ top: 0, behavior: 'smooth' });
    history.replaceState(null, '', `#${STEPS[step - 1]}`);
  }

  function persist() {
    const fd = new FormData(form); const keep = {};
    ['email', 'phone', 'account', 'fname', 'lname', 'address', 'apt', 'city', 'state', 'zip', 'country', 'method', 'pay'].forEach((k) => fd.get(k) != null && (keep[k] = fd.get(k)));
    if (form.elements.save?.checked) Store.set('checkout', keep);
    return keep;
  }

  function paintReview() {
    const d = persist(); const t = Cart.totals();
    const pay = { card: `Card ending ${form.elements.cardnumber.value.replace(/\s/g, '').slice(-4) || '0000'}`, paypal: 'PayPal', apple: 'Apple Pay', cod: 'Cash on delivery' }[d.pay];
    const block = (title, s, body) => `<div class="review-block"><div class="review-block__head"><h3>${title}</h3><button type="button" class="link link--gold" data-goto="${s}">Edit</button></div>${body}</div>`;
    $('#review-blocks').innerHTML = [
      block('Contact', 2, `<p>${escapeHTML(d.email)}<br>${escapeHTML(d.phone || '')}</p>`),
      block('Deliver to', 2, `<p>${escapeHTML(d.fname)} ${escapeHTML(d.lname)}<br>${escapeHTML(d.address)}${d.apt ? `, ${escapeHTML(d.apt)}` : ''}<br>${escapeHTML(d.city)}, ${escapeHTML(d.state || '')} ${escapeHTML(d.zip)}<br>${escapeHTML(d.country)}</p>`),
      block('Method', 3, `<p>${t.method.name}, ${t.shipping ? fmt.money(t.shipping) : 'complimentary'}. Arrives ${fmt.weekday(addBusinessDays(new Date(), t.method.days))}.</p>`),
      block('Payment', 4, `<p>${pay}</p>`),
    ].join('');
  }

  root.addEventListener('click', (e) => {
    const next = e.target.closest('[data-next]'); const back = e.target.closest('[data-back]'); const gt = e.target.closest('[data-goto]');
    if (next) { const scope = next.closest('.checkout-step'); if (validateScope(scope)) { persist(); go(step + 1); } else toast({ type: 'error', title: 'A few details need attention', message: 'Please review the highlighted fields.' }); }
    if (back) go(step - 1);
    if (gt) go(Number(gt.dataset.goto));
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.elements.terms.checked) { toast({ type: 'error', title: 'Please accept the terms of sale' }); form.elements.terms.focus(); return; }
    const d = persist(); const t = Cart.totals();
    const btn = $('#place-order'); btn.disabled = true; btn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="animation:spin 1s linear infinite" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg> Placing order`;
    const order = {
      id: `MV-${String(Date.now()).slice(-6)}`, date: new Date().toISOString(), status: 'placed',
      items: t.lines.map((l) => ({ id: l.id, qty: l.qty, price: l.product.price, color: l.color, size: l.size })),
      subtotal: t.subtotal, discount: t.discount, shipping: t.shipping, tax: t.tax, total: t.total, code: t.code, method: t.method.name, eta: addBusinessDays(new Date(), t.method.days).toISOString(),
      address: { name: `${d.fname} ${d.lname}`, line1: `${d.address}${d.apt ? `, ${d.apt}` : ''}`, city: `${d.city}${d.state ? `, ${d.state}` : ''}`, zip: d.zip, country: d.country }, email: d.email,
      payment: { card: `Card ending ${form.elements.cardnumber.value.replace(/\s/g, '').slice(-4)}`, paypal: 'PayPal', apple: 'Apple Pay', cod: 'Cash on delivery' }[d.pay],
    };
    setTimeout(() => {
      Store.update('orders', (l) => [order, ...l], []);
      Store.set('lastOrder', order.id);
      Cart.clear();
      location.href = `order-confirmation.html?order=${order.id}`;
    }, 900);
  });

  const hashStep = STEPS.indexOf(location.hash.slice(1));
  go(hashStep > 0 ? 1 : 1);
}

/* ---- Order confirmation -------------------------------------------- */
export async function initConfirmation() {
  const root = $('#confirm-root'); if (!root) return;
  const id = new URLSearchParams(location.search).get('order') ?? Store.get('lastOrder');
  const { ORDERS } = await import('./data.js');
  const order = Store.get('orders', []).find((o) => o.id === id) ?? ORDERS[0];
  const eta = order.eta ?? addBusinessDays(order.date, 4).toISOString();
  $('#order-number').textContent = order.id;
  $('#order-email').textContent = order.email ?? 'your inbox';
  $('#eta-date').textContent = fmt.weekday(eta);
  $('#track-btn').href = `order-detail.html?id=${order.id}`;
  $('#receipt').innerHTML = `
    ${order.items.map((it) => { const p = findProduct(it.id); return `<div class="line-item" style="grid-template-columns:64px 1fr auto"><img class="line-item__img" style="inline-size:64px" src="${img(p.images[0], 200)}" alt=""><div class="line-item__info"><span class="product-card__brand">${escapeHTML(p.brand)}</span><span class="line-item__title">${escapeHTML(p.name)}</span><span class="line-item__variant">${[it.color, it.size].filter(Boolean).join(' / ')} &middot; Qty ${it.qty}</span></div><span class="mono">${fmt.money(it.price * it.qty)}</span></div>`; }).join('')}
    <div class="summary u-mt-6">${summaryHTML({ ...order, method: { name: order.method } })}</div>`;
  $('#ship-summary').innerHTML = `<p>${escapeHTML(order.address.name)}<br>${escapeHTML(order.address.line1)}<br>${escapeHTML(order.address.city)} ${escapeHTML(order.address.zip)}<br>${escapeHTML(order.address.country)}</p><p class="u-xs u-muted u-mt-2">${escapeHTML(order.method)} delivery</p>`;
  $('#pay-summary').innerHTML = `<p>${escapeHTML(order.payment)}</p><p class="u-xs u-muted u-mt-2">Charged ${fmt.money(order.total, true)} on ${fmt.date(order.date)}</p>`;
  const { productCard } = await import('./products.js');
  $('#confirm-recs').innerHTML = PRODUCTS.filter((p) => p.isNew).slice(0, 8).map((p) => productCard(p)).join('');
  setTimeout(() => confetti({ duration: 3000 }), 400);
}
