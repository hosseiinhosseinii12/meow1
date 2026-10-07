/**
 * search.js — Full-screen search overlay with debounced live suggestions,
 * keyboard navigation, and the dedicated search results page.
 */
import { PRODUCTS, CATEGORIES, POSTS, img } from './data.js';
import { $, $$, fmt, escapeHTML, debounce } from './state.js';
import { icon } from './icons.js';
import { matches } from './filters.js';
import { trapFocus } from './modal.js';

const ROOT = document.documentElement.dataset.root ?? '';
const POPULAR = ['Cashmere coat', 'Oxford', 'Automatic watch', 'Tote', 'Headphones', 'Linen'];
let overlay; let lastFocus; let controller;

const mark = (text, q) => {
  const safe = escapeHTML(text);
  if (!q) return safe;
  const words = q.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return words.length ? safe.replace(new RegExp(`(${words.join('|')})`, 'gi'), '<mark>$1</mark>') : safe;
};

function build() {
  overlay = document.createElement('div');
  overlay.className = 'search-overlay';
  overlay.id = 'search-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Search the collection');
  overlay.innerHTML = `
    <div class="search-overlay__inner">
      <button class="icon-btn search-overlay__close" type="button" aria-label="Close search" data-search-close>${icon('x')}</button>
      <form action="${ROOT}search.html" role="search">
        <label class="eyebrow" for="search-input">Search the atelier</label>
        <div class="underline-input underline-input--xl u-mt-4">
          <input id="search-input" name="q" type="search" autocomplete="off" placeholder="What are you looking for?" aria-controls="search-results" aria-autocomplete="list">
          <button type="submit" class="icon-btn" aria-label="Search">${icon('arrow-right', { cls: 'icon--lg' })}</button>
        </div>
      </form>
      <div class="search-overlay__hint"><span><kbd>Enter</kbd> to see all results</span><span><kbd>Up</kbd> <kbd>Down</kbd> to browse</span><span><kbd>Esc</kbd> to close</span></div>
    </div>
    <div class="search-overlay__results" id="search-results" aria-live="polite"></div>`;
  document.body.append(overlay);
  const input = $('#search-input', overlay);
  const results = $('#search-results', overlay);
  const renderSuggest = (q) => {
    controller?.abort(); controller = new AbortController();
    const signal = controller.signal;
    // Simulated async lookup; AbortController cancels stale requests.
    new Promise((res) => setTimeout(res, 60)).then(() => {
      if (signal.aborted) return;
      if (!q.trim()) {
        results.innerHTML = `<div class="search-overlay__group"><h3>Popular searches</h3><div class="suggest-terms">${POPULAR.map((t) => `<a class="chip" href="${ROOT}search.html?q=${encodeURIComponent(t)}">${t}</a>`).join('')}</div></div>
          <div class="search-overlay__group"><h3>Collections</h3><div class="suggest-terms">${CATEGORIES.map((c) => `<a class="chip" href="${ROOT}category.html?c=${c.slug}">${c.name}</a>`).join('')}</div></div>`;
        return;
      }
      const prods = PRODUCTS.filter((p) => matches(p, q)).slice(0, 6);
      const cats = CATEGORIES.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
      const posts = POSTS.filter((p) => p.title.toLowerCase().includes(q.toLowerCase())).slice(0, 3);
      results.innerHTML = `
        ${prods.length ? `<div class="search-overlay__group"><h3>Pieces</h3><ul class="suggest-list" role="listbox" aria-label="Product suggestions">${prods.map((p) => `<li><a class="suggest-item" role="option" href="${ROOT}product.html?id=${p.id}"><img src="${img(p.images[0], 160)}" alt="" loading="lazy"><span><span class="product-card__brand">${escapeHTML(p.brand)}</span><br><span class="u-serif u-xl">${mark(p.name, q)}</span></span><span class="mono u-sm">${fmt.money(p.price)}</span></a></li>`).join('')}</ul></div>` : `<p class="u-serif u-2xl u-muted">No pieces match "${escapeHTML(q)}" yet.</p>`}
        ${cats.length ? `<div class="search-overlay__group"><h3>Collections</h3><div class="suggest-terms">${cats.map((c) => `<a class="chip" href="${ROOT}category.html?c=${c.slug}">${c.name}</a>`).join('')}</div></div>` : ''}
        ${posts.length ? `<div class="search-overlay__group"><h3>Journal</h3><ul class="suggest-list">${posts.map((p) => `<li><a class="suggest-item" href="${ROOT}blog-post.html?slug=${p.slug}"><img src="${img(p.image, 160)}" alt="" loading="lazy"><span class="u-serif u-lg">${mark(p.title, q)}</span><span class="u-xs u-muted">${p.read} min</span></a></li>`).join('')}</ul></div>` : ''}
        ${prods.length ? `<a class="link" href="${ROOT}search.html?q=${encodeURIComponent(q)}">See all results ${icon('arrow-right', { cls: 'icon--sm' })}</a>` : ''}`;
    });
  };
  input.addEventListener('input', debounce(() => renderSuggest(input.value), 160));
  overlay.addEventListener('click', (e) => { if (e.target.closest('[data-search-close]')) closeSearch(); });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearch();
    trapFocus(overlay, e);
    const opts = $$('.suggest-item', overlay);
    if (!opts.length || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const i = opts.indexOf(document.activeElement);
    const n = e.key === 'ArrowDown' ? opts[(i + 1) % opts.length] : (i <= 0 ? input : opts[i - 1]);
    n.focus();
  });
  renderSuggest('');
}

export function openSearch() {
  if (!overlay) build();
  lastFocus = document.activeElement;
  overlay.classList.add('is-open');
  document.body.classList.add('is-locked');
  setTimeout(() => $('#search-input', overlay).focus(), 50);
}
export function closeSearch() {
  overlay?.classList.remove('is-open');
  document.body.classList.remove('is-locked');
  lastFocus?.focus?.();
}
export function initSearchOverlay() {
  document.addEventListener('click', (e) => { if (e.target.closest('[data-search-open]')) { e.preventDefault(); openSearch(); } });
}

/* ---- Did-you-mean via Levenshtein distance over catalogue vocabulary --- */
function lev(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}
const VOCAB = [...new Set(PRODUCTS.flatMap((p) => `${p.name} ${p.brand} ${p.tags.join(' ')} ${p.subcategory}`.toLowerCase().split(/[^a-z]+/)).filter((w) => w.length > 3))];
export function suggest(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let changed = false;
  const fixed = words.map((w) => {
    if (VOCAB.includes(w)) return w;
    const best = VOCAB.map((v) => [v, lev(w, v)]).sort((a, b) => a[1] - b[1])[0];
    if (best && best[1] <= Math.max(2, Math.floor(w.length / 3))) { changed = true; return best[0]; }
    return w;
  });
  return changed ? fixed.join(' ') : null;
}

export async function initSearchPage() {
  const form = $('#search-page-form'); if (!form) return;
  const q = new URLSearchParams(location.search).get('q') ?? '';
  form.q.value = q;
  const { initListing } = await import('./filters.js');
  initListing({ search: true });
  const dym = $('#dym'); const line = $('#search-line');
  const paintMeta = (count) => {
    line.textContent = q ? `${count} ${count === 1 ? 'result' : 'results'} for "${q}"` : `Browse all ${count} pieces`;
    const alt = q && count === 0 ? suggest(q) : null;
    dym.hidden = !alt;
    if (alt) dym.innerHTML = `Did you mean <a href="search.html?q=${encodeURIComponent(alt)}">${escapeHTML(alt)}</a>?`;
    $('#browse-cats').hidden = count !== 0;
  };
  document.addEventListener('listing:rendered', (e) => paintMeta(e.detail.count));
}
