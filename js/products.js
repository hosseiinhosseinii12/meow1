/**
 * products.js — Product card templates, skeletons, quick view and the
 * product detail page (gallery, variants, reviews, related, recently viewed).
 */
import { PRODUCTS, REVIEWS, QUESTIONS, findProduct, findCategory, img } from './data.js';
import { fmt, $, $$, escapeHTML, addBusinessDays, Store } from './state.js';
import { icon } from './icons.js';
import { Wishlist, updateWishBadges } from './wishlist.js';
import { Cart } from './cart.js';
import { toast } from './toast.js';
import { openModal } from './modal.js';
import { trackView, recentProducts } from './recently-viewed.js';
import { initTabs } from './tabs.js';
import { initAccordions } from './accordion.js';
import { initCarousels } from './carousel.js';
import { initReveal } from './animations.js';

const ROOT = document.documentElement.dataset.root ?? '';
export const url = (p) => `${ROOT}product.html?id=${p.id}`;
export const discountPct = (p) => (p.compareAt ? Math.round((1 - p.price / p.compareAt) * 100) : 0);

export function starsHTML(rating, { size = '' } = {}) {
  return `<span class="stars" role="img" aria-label="Rated ${rating} out of 5">${[1, 2, 3, 4, 5].map((n) => icon('star', { cls: `${n <= Math.round(rating) ? 'is-filled' : ''} ${size}` })).join('')}</span>`;
}

export function priceHTML(p, cls = '') {
  return `<span class="price ${cls}"><span>${fmt.money(p.price)}</span>${p.compareAt ? `<s aria-label="Original price">${fmt.money(p.compareAt)}</s>` : ''}</span>`;
}

/** Quiet, refined product card. */
export function productCard(p, { eager = false } = {}) {
  const off = discountPct(p);
  const wished = Wishlist.has(p.id);
  return `
  <article class="product-card" data-id="${p.id}">
    <div class="product-card__media">
      <img src="${img(p.images[0], 800)}" srcset="${img(p.images[0], 480)} 480w, ${img(p.images[0], 800)} 800w, ${img(p.images[0], 1200)} 1200w" sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 46vw" alt="${escapeHTML(p.name)} by ${escapeHTML(p.brand)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="800" height="1000">
      <img class="product-card__img--alt" src="${img(p.images[1], 800)}" alt="" loading="lazy" decoding="async" width="800" height="1000">
      <div class="product-card__badges">${p.isNew ? '<span class="tag tag--ink">New</span>' : ''}${off ? `<span class="tag">-${off}%</span>` : ''}${p.stock <= 5 ? '<span class="tag tag--outline" style="background:var(--surface)">Last pieces</span>' : ''}</div>
      <button class="product-card__wish" type="button" data-wish="${p.id}" data-name="${escapeHTML(p.name)}" aria-pressed="${wished}" aria-label="${wished ? 'Remove from' : 'Save to'} wishlist">${icon('heart', { cls: 'icon--sm icon--heart' })}</button>
      <div class="product-card__quick">
        <button class="btn btn--sm" type="button" data-quick-view="${p.id}">Quick view</button>
        <button class="product-card__add" type="button" data-add-to-cart="${p.id}" aria-label="Add ${escapeHTML(p.name)} to bag">${icon('plus', { cls: 'icon--sm' })}</button>
      </div>
    </div>
    <div class="product-card__body">
      <div class="product-card__row"><span class="product-card__brand">${escapeHTML(p.brand)}</span><span class="rating">${icon('star')}<span>${p.rating.toFixed(1)}</span><span class="visually-hidden">out of 5 from ${p.reviews} reviews</span></span></div>
      <h3 class="product-card__title"><a href="${url(p)}">${escapeHTML(p.name)}</a></h3>
      <p class="product-card__desc">${escapeHTML(p.description.split('. ')[0])}.</p>
      <div class="product-card__row">${priceHTML(p)}<span class="product-card__swatches" aria-label="${p.colors.length} colours">${p.colors.slice(0, 4).map((c) => `<span style="--_c:${c.hex}" title="${c.name}"></span>`).join('')}</span></div>
    </div>
  </article>`;
}

export function skeletonCards(n = 6) {
  return Array.from({ length: n }, () => `<div aria-hidden="true"><div class="skeleton skeleton--media"></div><div class="skeleton skeleton--line w-40"></div><div class="skeleton skeleton--line w-60"></div><div class="skeleton skeleton--line w-40"></div></div>`).join('');
}

/** Render cards into any [data-products] container based on a preset. */
export function renderCollections(root = document) {
  root.querySelectorAll('[data-products]').forEach((el) => {
    const [kind, arg] = el.dataset.products.split(':');
    const limit = Number(el.dataset.limit ?? 8);
    let list = [...PRODUCTS];
    if (kind === 'best') list.sort((a, b) => b.sold - a.sold);
    if (kind === 'new') list = list.filter((p) => p.isNew).concat(list.filter((p) => !p.isNew)).slice(0, limit);
    if (kind === 'sale') list = list.filter((p) => p.compareAt).sort((a, b) => discountPct(b) - discountPct(a));
    if (kind === 'cat') list = list.filter((p) => p.category === arg);
    if (kind === 'top') list.sort((a, b) => b.rating - a.rating);
    list = list.slice(0, limit);
    el.innerHTML = kind === 'sale' && el.hasAttribute('data-flash')
      ? list.map((p, i) => { const claimed = 58 + ((i * 13) % 34); return `<div>${productCard(p)}<div class="flash__stock"><span>${claimed}% claimed</span><span>${Math.max(2, Math.round(p.stock * (1 - claimed / 100)))} left</span></div><div class="progress progress--light"><div class="progress__bar" data-progress="${claimed}"></div></div></div>`; }).join('')
      : list.map((p) => productCard(p)).join('');
    el.querySelectorAll('[data-progress]').forEach((bar) => new IntersectionObserver(([en], io) => { if (en.isIntersecting) { bar.style.setProperty('--_v', `${bar.dataset.progress}%`); io.disconnect(); } }).observe(bar));
  });
}

/* ---- Quick view modal ------------------------------------------------- */
export function initQuickView() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quick-view]');
    if (!btn) return;
    e.preventDefault();
    const p = findProduct(btn.dataset.quickView);
    let dlg = $('#quick-view');
    if (!dlg) { dlg = Object.assign(document.createElement('dialog'), { id: 'quick-view', className: 'modal modal--lg' }); dlg.setAttribute('aria-labelledby', 'qv-title'); document.body.append(dlg); }
    dlg.innerHTML = `
      <div class="u-cols-2" style="gap:0" data-product-root>
        <div style="aspect-ratio:4/5;background:var(--surface-sunken)"><img src="${img(p.images[0], 900)}" alt="${escapeHTML(p.name)}" style="width:100%;height:100%;object-fit:cover"></div>
        <div style="padding:var(--space-10) var(--space-8);display:grid;gap:var(--space-5);align-content:start;position:relative">
          <button class="icon-btn" style="position:absolute;top:var(--space-4);right:var(--space-4)" data-modal-close aria-label="Close quick view">${icon('x')}</button>
          <span class="eyebrow">${escapeHTML(p.brand)}</span>
          <h2 class="modal__title" id="qv-title">${escapeHTML(p.name)}</h2>
          <div class="u-flex u-gap-4 u-items-center">${priceHTML(p, 'price--lg')}<span class="rating">${icon('star')} ${p.rating}</span></div>
          <p class="u-soft u-sm">${escapeHTML(p.description)}</p>
          ${p.colors.length ? `<div><p class="pdp__label"><span>Colour</span></p><div class="swatches">${p.colors.map((c, i) => `<button type="button" class="swatch" style="--_c:${c.hex}" aria-pressed="${i === 0}" aria-label="${c.name}" data-qv-color="${c.name}"></button>`).join('')}</div></div>` : ''}
          ${p.sizes.length ? `<div><p class="pdp__label"><span>Size</span></p><div class="sizes">${p.sizes.map((s, i) => `<button type="button" class="size-pill size-pill--sm" aria-pressed="${i === Math.min(2, p.sizes.length - 1)}" data-qv-size="${s}">${s}</button>`).join('')}</div></div>` : ''}
          <button class="btn btn--block" type="button" data-qv-add>Add to bag</button>
          <a class="link" href="${url(p)}">View full details ${icon('arrow-right', { cls: 'icon--sm' })}</a>
        </div>
      </div>`;
    dlg.onclick = (ev) => {
      const c = ev.target.closest('[data-qv-color]'); const s = ev.target.closest('[data-qv-size]');
      if (c) $$('[data-qv-color]', dlg).forEach((b) => b.setAttribute('aria-pressed', String(b === c)));
      if (s) $$('[data-qv-size]', dlg).forEach((b) => b.setAttribute('aria-pressed', String(b === s)));
      if (ev.target.closest('[data-qv-add]')) {
        Cart.add(p.id, { color: $('[data-qv-color][aria-pressed="true"]', dlg)?.dataset.qvColor, size: $('[data-qv-size][aria-pressed="true"]', dlg)?.dataset.qvSize, sourceImg: $('img', dlg) });
        dlg.close();
      }
    };
    openModal(dlg, btn);
  });
}

/* ======================================================================
   PRODUCT DETAIL PAGE
   ====================================================================== */
/** Deterministic "unavailable" combinations so variant disabling is visible. */
const unavailable = (p, ci, si) => p.sizes.length > 3 && (ci * 3 + si * 2 + p.id.length) % 7 === 0;

export function initProduct() {
  const root = $('#pdp-root'); if (!root) return;
  const params = new URLSearchParams(location.search);
  const p = findProduct(params.get('id') ?? params.get('slug') ?? '') ?? PRODUCTS[0];
  const cat = findCategory(p.category);
  trackView(p.id);
  const reviews = REVIEWS.filter((r) => r.productId === p.id && r.status === 'approved');
  const off = discountPct(p);

  // SEO: title, description, canonical and JSON-LD for this product.
  document.title = `${p.name} by ${p.brand} | Maison Verdant`;
  $('meta[name="description"]')?.setAttribute('content', p.description.slice(0, 155));
  $('link[rel="canonical"]')?.setAttribute('href', `https://maisonverdant.com/product.html?id=${p.id}`);
  const ld = document.createElement('script'); ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify([
    { '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.sku, brand: { '@type': 'Brand', name: p.brand }, description: p.description, image: p.images.map((i) => img(i)),
      offers: { '@type': 'Offer', priceCurrency: 'USD', price: p.price, availability: p.stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: location.href },
      aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.reviews },
      review: reviews.slice(0, 2).map((r) => ({ '@type': 'Review', author: { '@type': 'Person', name: r.author }, reviewRating: { '@type': 'Rating', ratingValue: r.rating }, name: r.title, reviewBody: r.body })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['Home', 'index.html'], ['Shop', 'shop.html'], [cat.name, `category.html?c=${cat.slug}`], [p.name, `product.html?id=${p.id}`]].map(([name, u], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `https://maisonverdant.com/${u}` })) },
  ]);
  document.head.append(ld);

  const state = { color: 0, size: p.sizes.length ? p.sizes.findIndex((_, si) => !unavailable(p, 0, si)) : -1, qty: 1, image: 0 };
  const delivery = addBusinessDays(new Date(), 3);

  $('#pdp-breadcrumb').innerHTML = `<ol><li><a href="index.html">Home</a></li><li><a href="shop.html">Shop</a></li><li><a href="category.html?c=${cat.slug}">${cat.short}</a></li><li aria-current="page">${escapeHTML(p.name)}</li></ol>`;

  root.innerHTML = `
  <div class="gallery" data-product-root>
    <div class="gallery__main" id="gallery-main">
      <img id="gallery-img" src="${img(p.images[0], 1200)}" srcset="${img(p.images[0], 800)} 800w, ${img(p.images[0], 1200)} 1200w, ${img(p.images[0], 1800)} 1800w" sizes="(min-width:1024px) 55vw, 100vw" alt="${escapeHTML(p.name)}, view 1 of ${p.images.length}" fetchpriority="high" width="1200" height="1500">
      <div class="gallery__lens" id="gallery-lens" aria-hidden="true"></div>
      <div class="product-card__badges">${p.isNew ? '<span class="tag tag--ink">New</span>' : ''}${off ? `<span class="tag">-${off}%</span>` : ''}</div>
    </div>
    <div class="gallery__thumbs" role="group" aria-label="Product images">
      ${p.images.map((im, i) => `<button type="button" class="gallery__thumb" data-thumb="${i}" aria-current="${i === 0}" aria-label="Show image ${i + 1}"><img src="${img(im, 200)}" alt="" loading="lazy" width="72" height="90"></button>`).join('')}
    </div>
  </div>

  <div class="pdp__info">
    <div>
      <span class="eyebrow">${escapeHTML(p.brand)}</span>
      <h1 class="pdp__title u-mt-2">${escapeHTML(p.name)}</h1>
    </div>
    <div class="pdp__meta"><span class="rating">${icon('star', { cls: 'is-filled' })} ${p.rating.toFixed(1)}</span><a class="link link--muted" href="#reviews" data-go-reviews>${p.reviews} reviews</a><span class="mono u-xs">${p.sku}</span></div>
    <div class="u-flex u-gap-4 u-items-center">${priceHTML(p, 'price--lg')}${off ? `<span class="tag">Save ${off}%</span>` : ''}</div>
    <p class="pdp__desc">${escapeHTML(p.description)}</p>

    ${p.colors.length ? `<div><p class="pdp__label"><span>Colour</span><strong id="color-name">${p.colors[0].name}</strong></p><div class="swatches" role="radiogroup" aria-label="Colour">${p.colors.map((c, i) => `<button type="button" class="swatch" role="radio" style="--_c:${c.hex}" aria-checked="${i === 0}" aria-pressed="${i === 0}" aria-label="${c.name}" data-color="${i}"></button>`).join('')}</div></div>` : ''}
    ${p.sizes.length ? `<div><p class="pdp__label"><span>Size</span><button type="button" class="link link--muted" data-modal-open="size-guide">${icon('ruler', { cls: 'icon--xs' })} Size guide</button></p><div class="sizes" id="sizes" role="radiogroup" aria-label="Size"></div></div>` : ''}

    <div class="pdp__buy">
      <div class="qty" role="group" aria-label="Quantity">
        <button type="button" data-step="-1" aria-label="Decrease quantity">${icon('minus', { cls: 'icon--sm' })}</button>
        <input id="qty" type="number" inputmode="numeric" min="1" max="${p.stock}" value="1" aria-label="Quantity">
        <button type="button" data-step="1" aria-label="Increase quantity">${icon('plus', { cls: 'icon--sm' })}</button>
      </div>
      <button class="btn" type="button" id="add-btn">Add to bag</button>
      <button class="icon-btn icon-btn--bordered icon-btn--square" type="button" data-wish="${p.id}" data-name="${escapeHTML(p.name)}" aria-pressed="${Wishlist.has(p.id)}">${icon('heart', { cls: 'icon--heart' })}</button>
    </div>
    <a class="link" href="checkout.html" id="buy-now">Buy now ${icon('arrow-right', { cls: 'icon--sm' })}</a>

    <p class="pdp__stock"><span class="u-dot ${p.stock <= 5 ? 'u-dot--amber' : ''}"></span>${p.stock <= 5 ? `Only ${p.stock} remaining in the atelier` : 'In stock, ready to ship'}</p>

    <form class="field" id="zip-form">
      <label class="field__label" for="zip">Delivery estimate</label>
      <div class="input-group"><input id="zip" name="zip" inputmode="numeric" autocomplete="postal-code" placeholder="Enter ZIP code" pattern="[0-9A-Za-z -]{3,10}"><button type="submit">Check</button></div>
      <p class="u-xs u-muted" id="zip-msg" role="status">Order today for delivery by ${fmt.weekday(delivery)}.</p>
    </form>

    <div class="accordion" data-single>
      <div class="accordion__item" data-open><button class="accordion__trigger" type="button">Description<span class="accordion__icon" aria-hidden="true"></span></button><div class="accordion__panel"><div><div class="accordion__content"><p>${escapeHTML(p.description)}</p></div></div></div></div>
      <div class="accordion__item"><button class="accordion__trigger" type="button">Specifications<span class="accordion__icon" aria-hidden="true"></span></button><div class="accordion__panel"><div><div class="accordion__content"><ul>${Object.entries(p.specs).map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join('')}</ul></div></div></div></div>
      <div class="accordion__item"><button class="accordion__trigger" type="button">Shipping<span class="accordion__icon" aria-hidden="true"></span></button><div class="accordion__panel"><div><div class="accordion__content"><p>Complimentary standard shipping on orders over $250. Express and next-day courier available at checkout. Every order arrives in our signature linen box.</p></div></div></div></div>
      <div class="accordion__item"><button class="accordion__trigger" type="button">Returns<span class="accordion__icon" aria-hidden="true"></span></button><div class="accordion__panel"><div><div class="accordion__content"><p>Return unworn pieces within 30 days for a full refund. Returns are always complimentary. <a href="returns.html">Read the returns policy</a>.</p></div></div></div></div>
      <div class="accordion__item"><button class="accordion__trigger" type="button">Care<span class="accordion__icon" aria-hidden="true"></span></button><div class="accordion__panel"><div><div class="accordion__content"><p>Rest between wears and store in the linen dust bag provided. Covered by our lifetime repair service, carried out by the artisans who made it.</p></div></div></div></div>
    </div>

    <div class="share"><span>Share</span>
      <button class="icon-btn icon-btn--sm" type="button" data-share aria-label="Share or copy link">${icon('link', { cls: 'icon--sm' })}</button>
      <a class="icon-btn icon-btn--sm" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}" target="_blank" rel="noopener" aria-label="Share on Facebook">${icon('facebook', { cls: 'icon--sm' })}</a>
      <a class="icon-btn icon-btn--sm" href="https://twitter.com/intent/tweet?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent(p.name)}" target="_blank" rel="noopener" aria-label="Share on X">${icon('twitter', { cls: 'icon--sm' })}</a>
      <a class="icon-btn icon-btn--sm" href="https://pinterest.com/pin/create/button/?url=${encodeURIComponent(location.href)}&media=${encodeURIComponent(img(p.images[0]))}" target="_blank" rel="noopener" aria-label="Pin on Pinterest">${icon('pinterest', { cls: 'icon--sm' })}</a>
    </div>

    <div class="pdp__trust">
      <div>${icon('truck')}<span>Complimentary shipping</span></div>
      <div>${icon('refresh')}<span>30-day returns</span></div>
      <div>${icon('shield')}<span>Lifetime repairs</span></div>
    </div>
  </div>`;

  /* -- Tabs section -- */
  const dist = [5, 4, 3, 2, 1].map((s) => ({ s, n: Math.round(p.reviews * [0.72, 0.19, 0.06, 0.02, 0.01][5 - s]) }));
  $('#pdp-tabs').innerHTML = `
    <div class="tabs__list" role="tablist" aria-label="Product information">
      <button class="tabs__tab" role="tab" id="t-desc" aria-controls="p-desc" aria-selected="true">Description</button>
      <button class="tabs__tab" role="tab" id="t-spec" aria-controls="p-spec">Specifications</button>
      <button class="tabs__tab" role="tab" id="t-rev" aria-controls="p-rev" data-value="reviews">Reviews<sup>${p.reviews}</sup></button>
      <button class="tabs__tab" role="tab" id="t-qa" aria-controls="p-qa">Questions</button>
      <button class="tabs__tab" role="tab" id="t-ship" aria-controls="p-ship">Shipping</button>
    </div>
    <div class="tabs__panel" role="tabpanel" id="p-desc" aria-labelledby="t-desc" tabindex="0"><div class="split split--50"><div class="prose"><p>${escapeHTML(p.description)}</p><p>Each piece is inspected by hand before it leaves our atelier, then wrapped in acid-free tissue and boxed in natural linen.</p></div><figure><img src="${img(p.images[2], 1000)}" alt="${escapeHTML(p.name)} detail" loading="lazy" style="border-radius:var(--radius-sm);aspect-ratio:4/3;object-fit:cover;width:100%"></figure></div></div>
    <div class="tabs__panel" role="tabpanel" id="p-spec" aria-labelledby="t-spec" tabindex="0" hidden><table class="spec-table"><tbody>${Object.entries({ ...p.specs, SKU: p.sku, Category: cat.name }).map(([k, v]) => `<tr><th scope="row">${k}</th><td class="${k === 'SKU' ? 'mono' : ''}">${v}</td></tr>`).join('')}</tbody></table></div>
    <div class="tabs__panel" role="tabpanel" id="p-rev" aria-labelledby="t-rev" tabindex="0" hidden>
      <div class="reviews-summary">
        <div><p class="reviews-summary__score">${p.rating.toFixed(1)}</p>${starsHTML(p.rating)}<p class="u-xs u-muted u-mt-2">Based on ${p.reviews} reviews</p></div>
        <div class="bars">${dist.map((d) => `<div class="bars__row"><span>${d.s} ${icon('star', { cls: 'icon--xs' })}</span><div class="progress"><div class="progress__bar" style="--_v:${(d.n / p.reviews) * 100}%"></div></div><span>${d.n}</span></div>`).join('')}</div>
        <button class="chip" type="button" data-modal-open="review-modal">${icon('edit', { cls: 'icon--xs' })} Write a review</button>
      </div>
      <div class="u-flex u-between u-wrap u-gap-4 u-mt-8">
        <div class="cluster" id="rev-filter">${['All', 5, 4, 3].map((r, i) => `<button type="button" class="chip" aria-pressed="${i === 0}" data-r="${r}">${r === 'All' ? 'All' : `${r} stars`}</button>`).join('')}</div>
        <select class="field__control" style="inline-size:auto;min-block-size:40px" id="rev-sort" aria-label="Sort reviews"><option value="new">Most recent</option><option value="helpful">Most helpful</option><option value="high">Highest rated</option><option value="low">Lowest rated</option></select>
      </div>
      <div id="rev-list"></div>
    </div>
    <div class="tabs__panel" role="tabpanel" id="p-qa" aria-labelledby="t-qa" tabindex="0" hidden><div class="accordion">${QUESTIONS.map((q) => `<div class="accordion__item"><button class="accordion__trigger" type="button">${q.q}<span class="accordion__icon" aria-hidden="true"></span></button><div class="accordion__panel"><div><div class="accordion__content"><p>${q.a}</p></div></div></div></div>`).join('')}</div></div>
    <div class="tabs__panel" role="tabpanel" id="p-ship" aria-labelledby="t-ship" tabindex="0" hidden><div class="u-cols-3">${[['truck', 'Standard', 'Complimentary over $250. Three to five working days.'], ['zap', 'Express', '$35. Two working days, fully tracked.'], ['gift', 'Gift service', 'Linen box, wax seal and a handwritten card.']].map(([ic, t, d]) => `<div class="value-card">${icon(ic)}<h3>${t}</h3><p>${d}</p></div>`).join('')}</div></div>`;
  initTabs($('#pdp-tabs').parentElement);
  initAccordions(document);

  /* -- Reviews list with filter + sort -- */
  const revState = { r: 'All', sort: 'new' };
  const renderReviews = () => {
    let list = reviews.filter((r) => revState.r === 'All' || r.rating === Number(revState.r));
    const sorters = { new: (a, b) => new Date(b.date) - new Date(a.date), helpful: (a, b) => b.helpful - a.helpful, high: (a, b) => b.rating - a.rating, low: (a, b) => a.rating - b.rating };
    list = list.toSorted ? list.toSorted(sorters[revState.sort]) : [...list].sort(sorters[revState.sort]);
    $('#rev-list').innerHTML = list.length ? list.map((r) => `
      <article class="review">
        <div class="review__head"><img class="avatar" src="${img(r.avatar, 120)}" alt="" loading="lazy" width="40" height="40"><div><p class="review__name">${r.author}</p><p class="u-xs u-muted">${r.verified ? `<span class="review__verified">${icon('check', { cls: 'icon--xs' })} Verified buyer</span> &middot; ` : ''}<time datetime="${r.date}">${fmt.date(r.date)}</time></p></div></div>
        ${starsHTML(r.rating)}
        <h3 class="review__title">${r.title}</h3><p class="review__body">${r.body}</p>
        ${r.photos.length ? `<div class="review__photos">${r.photos.map((ph) => `<img src="${img(ph, 160)}" alt="Customer photo" loading="lazy">`).join('')}</div>` : ''}
        <button type="button" class="link link--muted" style="justify-self:start" data-helpful>Helpful (<span>${r.helpful}</span>)</button>
      </article>`).join('') : '<p class="u-muted u-mt-8">No reviews match this filter yet.</p>';
  };
  renderReviews();
  $('#rev-filter').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; revState.r = b.dataset.r; $$('#rev-filter [data-r]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderReviews(); });
  $('#rev-sort').addEventListener('change', (e) => { revState.sort = e.target.value; renderReviews(); });
  $('#rev-list').addEventListener('click', (e) => { const b = e.target.closest('[data-helpful]'); if (b && !b.disabled) { const s = b.querySelector('span'); s.textContent = Number(s.textContent) + 1; b.disabled = true; b.firstChild.textContent = 'Thank you '; } });

  /* -- Variants -- */
  const renderSizes = () => {
    const box = $('#sizes'); if (!box) return;
    box.innerHTML = p.sizes.map((s, si) => {
      const na = unavailable(p, state.color, si);
      return `<button type="button" class="size-pill" role="radio" aria-checked="${si === state.size}" aria-pressed="${si === state.size}" ${na ? 'aria-disabled="true" disabled' : ''} data-size="${si}" aria-label="${s}${na ? ', unavailable in this colour' : ''}">${s}</button>`;
    }).join('');
  };
  renderSizes();
  root.addEventListener('click', (e) => {
    const c = e.target.closest('[data-color]');
    if (c) {
      state.color = Number(c.dataset.color);
      $$('[data-color]', root).forEach((b) => { const on = b === c; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-checked', String(on)); });
      $('#color-name').textContent = p.colors[state.color].name;
      if (p.sizes.length && unavailable(p, state.color, state.size)) state.size = p.sizes.findIndex((_, si) => !unavailable(p, state.color, si));
      renderSizes();
      swapImage(state.color % p.images.length);
    }
    const s = e.target.closest('[data-size]');
    if (s) { state.size = Number(s.dataset.size); renderSizes(); }
    const t = e.target.closest('[data-thumb]');
    if (t) swapImage(Number(t.dataset.thumb));
    const step = e.target.closest('[data-step]');
    if (step) setQty(state.qty + Number(step.dataset.step));
    if (e.target.closest('[data-go-reviews]')) { e.preventDefault(); $('#pdp-tabs').parentElement.selectTab?.('reviews'); $('#reviews').scrollIntoView({ behavior: 'smooth' }); }
  });
  const qtyInput = $('#qty');
  const setQty = (n) => { state.qty = Math.max(1, Math.min(p.stock, n || 1)); qtyInput.value = state.qty; $$('[data-step]', root).forEach((b) => (b.disabled = (b.dataset.step === '-1' && state.qty <= 1) || (b.dataset.step === '1' && state.qty >= p.stock))); };
  qtyInput.addEventListener('change', () => setQty(parseInt(qtyInput.value, 10)));
  setQty(1);

  const addNow = (silent = false) => Cart.add(p.id, { qty: state.qty, color: p.colors[state.color]?.name, size: p.sizes[state.size] ?? null, sourceImg: $('#gallery-img'), silent });
  $('#add-btn').addEventListener('click', () => addNow());
  $('#buy-now').addEventListener('click', () => addNow(true));
  $('#mobile-add')?.addEventListener('click', () => addNow());
  const mp = $('#mobile-price'); if (mp) mp.innerHTML = priceHTML(p);

  /* -- Gallery: cross-fade swap + hover zoom lens -- */
  const main = $('#gallery-img'); const lens = $('#gallery-lens');
  function swapImage(i) {
    if (i === state.image) return;
    state.image = i;
    $$('[data-thumb]', root).forEach((b) => b.setAttribute('aria-current', String(Number(b.dataset.thumb) === i)));
    main.classList.add('is-fading');
    setTimeout(() => { main.srcset = ''; main.src = img(p.images[i], 1400); main.alt = `${p.name}, view ${i + 1} of ${p.images.length}`; main.onload = () => main.classList.remove('is-fading'); setTimeout(() => main.classList.remove('is-fading'), 500); }, 200);
  }
  const gm = $('#gallery-main');
  gm.addEventListener('pointerenter', () => { lens.style.backgroundImage = `url("${img(p.images[state.image], 2000)}")`; });
  gm.addEventListener('pointermove', (e) => {
    const r = gm.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100; const y = ((e.clientY - r.top) / r.height) * 100;
    requestAnimationFrame(() => { lens.style.backgroundPosition = `${x}% ${y}%`; });
  });

  /* -- ZIP delivery estimate -- */
  $('#zip-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const z = $('#zip').value.trim(); const msg = $('#zip-msg');
    if (!/^[0-9A-Za-z -]{3,10}$/.test(z)) { msg.className = 'u-xs u-error'; msg.textContent = 'Please enter a valid ZIP or postal code.'; return; }
    const days = /^\d/.test(z) ? 2 + (Number(z[0]) % 3) : 4;
    msg.className = 'u-xs u-success';
    msg.textContent = `Delivers to ${z.toUpperCase()} by ${fmt.weekday(addBusinessDays(new Date(), days))}.`;
  });

  /* -- Share -- */
  root.querySelector('[data-share]').addEventListener('click', async () => {
    if (navigator.share) { try { await navigator.share({ title: p.name, text: p.description.slice(0, 100), url: location.href }); return; } catch { /* dismissed */ } }
    try { await navigator.clipboard.writeText(location.href); toast({ type: 'success', title: 'Link copied', message: 'Ready to paste wherever you like.' }); }
    catch { toast({ type: 'error', title: 'Could not copy', message: location.href }); }
  });

  /* -- Review modal submission -- */
  const rf = $('#review-form');
  if (rf) {
    let rating = 0;
    const stars = $('#review-stars');
    stars.innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">${icon('star')}</button>`).join('');
    stars.addEventListener('click', (e) => { const b = e.target.closest('[data-star]'); if (!b) return; rating = Number(b.dataset.star); $$('[data-star]', stars).forEach((s) => s.classList.toggle('is-on', Number(s.dataset.star) <= rating)); $('#review-rating').value = rating; });
    rf.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!rating) { toast({ type: 'error', title: 'Please choose a rating' }); return; }
      rf.closest('dialog').close(); rf.reset(); rating = 0; $$('[data-star]', stars).forEach((s) => s.classList.remove('is-on'));
      toast({ type: 'success', title: 'Thank you for your review', message: 'It will appear once our team has read it.' });
    });
  }

  /* -- Related + recently viewed -- */
  const related = PRODUCTS.filter((x) => x.category === p.category && x.id !== p.id).concat(PRODUCTS.filter((x) => x.tags.some((t) => p.tags.includes(t)) && x.category !== p.category)).slice(0, 8);
  $('#related-track').innerHTML = related.map((x) => productCard(x)).join('');
  const recent = recentProducts(p.id);
  const rs = $('#recent-section');
  if (recent.length) $('#recent-track').innerHTML = recent.map((x) => productCard(x)).join(''); else rs.hidden = true;
  initCarousels(document);
  updateWishBadges();
  initReveal(document);

  /* -- Mobile sticky bar appears once the main buy button scrolls away -- */
  const bar = $('.mobile-bar');
  if (bar) new IntersectionObserver(([en]) => bar.classList.toggle('is-visible', !en.isIntersecting && en.boundingClientRect.top < 0)).observe($('#add-btn'));
}

/* ---- Listing pages delegate to filters.js ---------------------------- */
export async function initShop(preset = {}) { const { initListing } = await import('./filters.js'); initListing(preset); }
export async function initCategory() {
  const slug = new URLSearchParams(location.search).get('c') ?? 'outerwear';
  const cat = findCategory(slug) ?? findCategory('outerwear');
  document.title = `${cat.name} | Maison Verdant`;
  $('meta[name="description"]')?.setAttribute('content', cat.description);
  const hero = $('#cat-hero');
  hero.querySelector('img').src = img(cat.image, 1800);
  hero.querySelector('img').alt = cat.name;
  hero.querySelector('.eyebrow').textContent = cat.eyebrow;
  hero.querySelector('h1').textContent = cat.name;
  hero.querySelector('p').textContent = cat.description;
  const sub = new URLSearchParams(location.search).get('sub');
  $('#cat-subs').innerHTML = [`<a class="chip ${!sub ? 'is-active' : ''}" href="category.html?c=${cat.slug}">All</a>`, ...cat.subs.map((s) => `<a class="chip ${sub === s ? 'is-active' : ''}" href="category.html?c=${cat.slug}&sub=${encodeURIComponent(s)}">${s}</a>`)].join('');
  $('#cat-crumb').textContent = cat.short;
  const { initListing } = await import('./filters.js');
  initListing({ category: cat.slug, sub });
}
