/**
 * filters.js — Listing controller shared by shop, category and search.
 * Multi-select filters, dual-thumb price range, six sort orders, client-side
 * pagination and two-way URL sync through URLSearchParams.
 */
import { PRODUCTS, CATEGORIES, BRANDS } from './data.js';
import { $, $$, fmt, escapeHTML, debounce, reducedMotion } from './state.js';
import { icon } from './icons.js';
import { productCard, skeletonCards, discountPct } from './products.js';
import { initReveal } from './animations.js';
import { closeDrawer } from './drawer.js';

export const SORTS = [
  ['featured', 'Featured'], ['newest', 'Newest arrivals'], ['price-asc', 'Price, low to high'],
  ['price-desc', 'Price, high to low'], ['rating', 'Highest rated'], ['bestselling', 'Best selling'],
];
const MULTI = ['cat', 'brand', 'color', 'size', 'sub'];
const PER_PAGE = 12;
const PRICE_MAX = Math.ceil(Math.max(...PRODUCTS.map((p) => p.price)) / 500) * 500;

/** Parse state from the current URL. */
export function readState(preset = {}) {
  const u = new URLSearchParams(location.search);
  const s = Object.fromEntries(MULTI.map((k) => [k, u.get(k) ? u.get(k).split(',').filter(Boolean) : []]));
  if (preset.sub) s.sub = [preset.sub];
  return {
    ...s, q: u.get('q') ?? '', min: Number(u.get('min') ?? 0), max: Number(u.get('max') ?? PRICE_MAX),
    rating: Number(u.get('rating') ?? 0), stock: u.get('stock') === '1', sale: Number(u.get('sale') ?? 0),
    sort: u.get('sort') ?? 'featured', page: Math.max(1, Number(u.get('page') ?? 1)), view: u.get('view') ?? 'grid',
  };
}

/** Push state to the URL without reloading. */
function writeState(s, preset) {
  const u = new URLSearchParams();
  if (preset.category) u.set('c', preset.category);
  if (s.q) u.set('q', s.q);
  MULTI.forEach((k) => s[k].length && u.set(k, s[k].join(',')));
  if (s.min > 0) u.set('min', s.min);
  if (s.max < PRICE_MAX) u.set('max', s.max);
  if (s.rating) u.set('rating', s.rating);
  if (s.stock) u.set('stock', '1');
  if (s.sale) u.set('sale', s.sale);
  if (s.sort !== 'featured') u.set('sort', s.sort);
  if (s.page > 1) u.set('page', s.page);
  if (s.view !== 'grid') u.set('view', s.view);
  const qs = u.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

/** Text match used by listing search. */
export const matches = (p, q) => {
  if (!q) return true;
  const hay = `${p.name} ${p.brand} ${p.category} ${p.subcategory} ${p.tags.join(' ')} ${p.colors.map((c) => c.name).join(' ')}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
};

export function applyFilters(list, s, preset = {}) {
  let out = list.filter((p) =>
    (!preset.category || p.category === preset.category) &&
    matches(p, s.q) &&
    (!s.cat.length || s.cat.includes(p.category)) &&
    (!s.sub.length || s.sub.includes(p.subcategory)) &&
    (!s.brand.length || s.brand.includes(p.brand)) &&
    (!s.color.length || p.colors.some((c) => s.color.includes(c.name))) &&
    (!s.size.length || p.sizes.some((z) => s.size.includes(z))) &&
    p.price >= s.min && p.price <= s.max &&
    p.rating >= s.rating && (!s.stock || p.stock > 5) && discountPct(p) >= s.sale);
  const sorters = {
    featured: (a, b) => (b.isNew - a.isNew) || (b.rating * b.reviews) - (a.rating * a.reviews),
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    'price-asc': (a, b) => a.price - b.price, 'price-desc': (a, b) => b.price - a.price,
    rating: (a, b) => b.rating - a.rating, bestselling: (a, b) => b.sold - a.sold,
  };
  out = out.toSorted ? out.toSorted(sorters[s.sort] ?? sorters.featured) : [...out].sort(sorters[s.sort] ?? sorters.featured);
  return out;
}

/** Sidebar markup, rendered once per container with a unique id prefix. */
function sidebarHTML(s, preset, pre) {
  const pool = PRODUCTS.filter((p) => !preset.category || p.category === preset.category);
  const count = (fn) => pool.filter(fn).length;
  const colors = [...new Map(pool.flatMap((p) => p.colors).map((c) => [c.name, c])).values()];
  const sizes = [...new Set(pool.flatMap((p) => p.sizes))];
  const group = (title, body, open = true) => `<details class="filter-group" ${open ? 'open' : ''}><summary>${title}${icon('chevron-down', { cls: 'icon--sm' })}</summary><div class="filter-group__body">${body}</div></details>`;
  const checks = (name, items) => items.map(([val, label, n]) => `<label class="check"><input type="checkbox" name="${name}" value="${escapeHTML(val)}" ${s[name].includes(val) ? 'checked' : ''}> ${label}<span class="check__count">${n}</span></label>`).join('');
  return `
  <form class="filters" data-filters aria-label="Product filters">
    ${preset.category ? '' : group('Category', checks('cat', CATEGORIES.map((c) => [c.slug, c.short, count((p) => p.category === c.slug)])))}
    ${group('Price', `<div class="range" data-range><div class="range__track"></div><div class="range__fill"></div>
      <input type="range" name="min" min="0" max="${PRICE_MAX}" step="50" value="${s.min}" aria-label="Minimum price">
      <input type="range" name="max" min="0" max="${PRICE_MAX}" step="50" value="${s.max}" aria-label="Maximum price"></div>
      <div class="range__values"><span data-min-label>${fmt.money(s.min)}</span><span data-max-label>${fmt.money(s.max)}</span></div>`)}
    ${group('Colour', `<div class="swatches">${colors.map((c) => `<label class="swatch" style="--_c:${c.hex}" title="${c.name}"><input type="checkbox" name="color" value="${c.name}" ${s.color.includes(c.name) ? 'checked' : ''} aria-label="${c.name}"></label>`).join('')}</div>`)}
    ${sizes.length ? group('Size', `<div class="sizes">${sizes.map((z) => `<label class="size-pill size-pill--sm"><input type="checkbox" name="size" value="${z}" ${s.size.includes(z) ? 'checked' : ''}>${z}</label>`).join('')}</div>`, false) : ''}
    ${group('Designer', checks('brand', BRANDS.filter((b) => pool.some((p) => p.brand === b)).map((b) => [b, b, count((p) => p.brand === b)])), false)}
    ${group('Rating', [4.8, 4.5, 4].map((r) => `<label class="check"><input type="radio" name="rating" value="${r}" ${s.rating === r ? 'checked' : ''}> <span class="stars" aria-hidden="true">${[1, 2, 3, 4, 5].map((n) => icon('star', { cls: n <= Math.floor(r) ? 'is-filled' : '' })).join('')}</span> ${r}+</label>`).join('') + `<label class="check"><input type="radio" name="rating" value="0" ${!s.rating ? 'checked' : ''}> Any rating</label>`, false)}
    ${group('Availability', `<label class="switch"><input type="checkbox" name="stock" value="1" ${s.stock ? 'checked' : ''}> Ready to ship</label>`, false)}
    ${group('Privileges', [10, 20].map((d) => `<label class="check"><input type="radio" name="sale" value="${d}" ${s.sale === d ? 'checked' : ''}> ${d}% off or more</label>`).join('') + `<label class="check"><input type="radio" name="sale" value="0" ${!s.sale ? 'checked' : ''}> All prices</label>`, false)}
  </form>`.replaceAll('name="', `data-pre="${pre}" name="`);
}

function paintRange(form) {
  const r = form.querySelector('[data-range]'); if (!r) return;
  const [lo, hi] = r.querySelectorAll('input');
  const a = (Number(lo.value) / PRICE_MAX) * 100; const b = (Number(hi.value) / PRICE_MAX) * 100;
  const fill = r.querySelector('.range__fill');
  fill.style.insetInlineStart = `${a}%`; fill.style.inlineSize = `${b - a}%`;
  form.querySelector('[data-min-label]').textContent = fmt.money(lo.value);
  form.querySelector('[data-max-label]').textContent = fmt.money(hi.value);
}

export function initListing(preset = {}) {
  const grid = $('#grid'); if (!grid) return;
  let s = readState(preset);
  const containers = [$('#filters'), $('#filters-drawer-body')].filter(Boolean);

  const mountFilters = () => containers.forEach((c, i) => { c.innerHTML = sidebarHTML(s, preset, i ? 'm' : 'd'); c.querySelectorAll('form').forEach(paintRange); });
  mountFilters();

  // Sort dropdown
  const trigger = $('#sort-trigger'); const panel = $('#sort-panel');
  const paintSort = () => {
    trigger.querySelector('strong').textContent = SORTS.find(([k]) => k === s.sort)?.[1] ?? 'Featured';
    panel.innerHTML = SORTS.map(([k, l]) => `<button type="button" class="dropdown__item" role="option" aria-selected="${k === s.sort}" data-sort="${k}">${l}</button>`).join('');
  };
  paintSort();
  trigger.addEventListener('click', () => { const open = !panel.classList.contains('is-open'); panel.classList.toggle('is-open', open); trigger.setAttribute('aria-expanded', String(open)); if (open) panel.querySelector('[aria-selected="true"]')?.focus(); });
  panel.addEventListener('click', (e) => { const b = e.target.closest('[data-sort]'); if (!b) return; s.sort = b.dataset.sort; s.page = 1; panel.classList.remove('is-open'); trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); paintSort(); render(); });
  panel.addEventListener('keydown', (e) => {
    const items = $$('[data-sort]', panel); const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items.at(i - 1).focus(); }
    if (e.key === 'Escape') { panel.classList.remove('is-open'); trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#sort-dropdown')) { panel.classList.remove('is-open'); trigger.setAttribute('aria-expanded', 'false'); } });

  // View toggle
  $('#view-toggle')?.addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (!b) return; s.view = b.dataset.view; render(false); });

  // Filter changes (either container)
  const onChange = debounce((form) => {
    const fd = new FormData(form);
    MULTI.filter((k) => k !== 'sub').forEach((k) => (s[k] = fd.getAll(k)));
    let lo = Number(fd.get('min') ?? 0); let hi = Number(fd.get('max') ?? PRICE_MAX);
    if (lo > hi) [lo, hi] = [hi, lo];
    Object.assign(s, { min: lo, max: hi, rating: Number(fd.get('rating') ?? 0), stock: fd.get('stock') === '1', sale: Number(fd.get('sale') ?? 0), page: 1 });
    // mirror into the other container
    containers.forEach((c) => { const f = c.querySelector('form'); if (f !== form) { c.innerHTML = sidebarHTML(s, preset, c.id === 'filters' ? 'd' : 'm'); c.querySelectorAll('form').forEach(paintRange); } });
    render();
  }, 180);
  containers.forEach((c) => {
    c.addEventListener('input', (e) => { const f = e.target.closest('form'); if (e.target.type === 'range') paintRange(f); onChange(f); });
  });

  // Chips
  $('#chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-chip]'); const clear = e.target.closest('[data-clear]');
    if (clear) { s = { ...readState({}), q: s.q, sort: s.sort, view: s.view, cat: [], brand: [], color: [], size: [], sub: preset.sub ? [] : [], min: 0, max: PRICE_MAX, rating: 0, stock: false, sale: 0, page: 1 }; preset.sub = null; mountFilters(); render(); return; }
    if (!b) return;
    const [k, v] = b.dataset.chip.split('::');
    if (MULTI.includes(k)) s[k] = s[k].filter((x) => x !== v);
    if (k === 'price') { s.min = 0; s.max = PRICE_MAX; }
    if (k === 'rating') s.rating = 0; if (k === 'stock') s.stock = false; if (k === 'sale') s.sale = 0; if (k === 'q') s.q = '';
    s.page = 1; mountFilters(); render();
  });

  // Pagination
  $('#pagination').addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]'); if (!b) return;
    s.page = Number(b.dataset.page); render();
    $('#listing-top').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  });

  function chipsHTML() {
    const cName = (slug) => CATEGORIES.find((c) => c.slug === slug)?.short ?? slug;
    const chips = [
      ...(s.q ? [['q', s.q, `"${s.q}"`]] : []),
      ...MULTI.flatMap((k) => s[k].map((v) => [k, v, k === 'cat' ? cName(v) : v])),
      ...(s.min > 0 || s.max < PRICE_MAX ? [['price', '', `${fmt.money(s.min)} to ${fmt.money(s.max)}`]] : []),
      ...(s.rating ? [['rating', '', `${s.rating}+ stars`]] : []), ...(s.stock ? [['stock', '', 'Ready to ship']] : []), ...(s.sale ? [['sale', '', `${s.sale}% off or more`]] : []),
    ];
    if (!chips.length) return '';
    return chips.map(([k, v, l]) => `<span class="chip">${escapeHTML(l)}<button type="button" data-chip="${k}::${escapeHTML(v)}" aria-label="Remove filter ${escapeHTML(l)}">${icon('x', { cls: 'icon--xs' })}</button></span>`).join('') + '<button type="button" class="link link--muted" data-clear>Clear all</button>';
  }

  function render(showSkeleton = true) {
    const all = applyFilters(PRODUCTS, s, preset);
    const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
    s.page = Math.min(s.page, pages);
    const slice = all.slice((s.page - 1) * PER_PAGE, s.page * PER_PAGE);
    writeState(s, preset);
    $('#result-count').textContent = `${all.length} ${all.length === 1 ? 'piece' : 'pieces'}`;
    $('#chips').innerHTML = chipsHTML();
    $$('#view-toggle [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === s.view)));
    grid.classList.toggle('is-list', s.view === 'list');
    grid.setAttribute('aria-busy', 'true');
    const paint = () => {
      if (!slice.length) {
        grid.classList.remove('is-list');
        grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><svg class="empty__art draw-line" viewBox="0 0 140 140" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><circle cx="62" cy="62" r="30"/><path d="m84 84 26 26"/><path d="M50 62h24"/></svg><h2 class="empty__title">Nothing quite matches</h2><p class="empty__text">Try loosening a filter or two. The atelier is small, so every piece counts.</p><button type="button" class="link" data-clear-empty>Clear all filters</button></div>`;
        grid.querySelector('[data-clear-empty]').addEventListener('click', () => $('#chips [data-clear]')?.click());
      } else {
        grid.innerHTML = slice.map((p, i) => productCard(p, { eager: i < 2 && s.page === 1 })).join('');
        [...grid.children].forEach((c, i) => { c.classList.add('reveal'); c.style.setProperty('--i', i % 6); });
        initReveal(grid);
      }
      grid.setAttribute('aria-busy', 'false');
      $('#pagination').innerHTML = pages < 2 ? '' : `
        <button type="button" data-page="${s.page - 1}" ${s.page === 1 ? 'disabled' : ''} aria-label="Previous page">${icon('chevron-left', { cls: 'icon--sm' })}</button>
        ${Array.from({ length: pages }, (_, i) => `<button type="button" data-page="${i + 1}" ${i + 1 === s.page ? 'aria-current="page"' : ''} aria-label="Page ${i + 1}">${String(i + 1).padStart(2, '0')}</button>`).join('')}
        <button type="button" data-page="${s.page + 1}" ${s.page === pages ? 'disabled' : ''} aria-label="Next page">${icon('chevron-right', { cls: 'icon--sm' })}</button>`;
      document.dispatchEvent(new CustomEvent('listing:rendered', { detail: { count: all.length, state: s } }));
    };
    if (showSkeleton && !reducedMotion()) { grid.innerHTML = skeletonCards(Math.min(6, slice.length || 3)); setTimeout(paint, 260); } else paint();
  }

  // Apply button in mobile drawer
  $('#filters-apply')?.addEventListener('click', closeDrawer);
  render();
  return { get state() { return s; }, set q(v) { s.q = v; s.page = 1; render(); } };
}
