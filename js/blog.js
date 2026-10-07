/**
 * blog.js — The Journal: featured story, category filters, search, pagination,
 * and the article page with table of contents scroll-spy and comments.
 */
import { POSTS, img } from './data.js';
import { $, $$, fmt, escapeHTML, debounce } from './state.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { initReveal } from './animations.js';

const PER = 6;
export const postCard = (p) => `
  <article class="post-card reveal">
    <div class="post-card__media"><img src="${img(p.image, 900)}" alt="" loading="lazy" width="900" height="675"></div>
    <p class="post-card__meta"><span>${p.category}</span><span>${fmt.date(p.date)}</span><span>${p.read} min read</span></p>
    <h3 class="post-card__title"><a href="blog-post.html?slug=${p.slug}">${escapeHTML(p.title)}</a></h3>
    <p class="post-card__excerpt">${escapeHTML(p.excerpt)}</p>
    <a class="link" href="blog-post.html?slug=${p.slug}" tabindex="-1" aria-hidden="true">Read more ${icon('arrow-right', { cls: 'icon--sm' })}</a>
  </article>`;

export function initBlog() {
  const grid = $('#journal-grid'); if (!grid) return;
  const [featured, ...rest] = POSTS;
  $('#journal-feature').innerHTML = `
    <img src="${img(featured.image, 1800)}" alt="" fetchpriority="high">
    <div class="journal-feature__body"><p class="post-card__meta"><span>${featured.category}</span><span>${fmt.date(featured.date)}</span><span>${featured.read} min read</span></p>
    <h2><a href="blog-post.html?slug=${featured.slug}">${escapeHTML(featured.title)}</a></h2><p>${escapeHTML(featured.excerpt)}</p></div>`;
  const cats = ['All', ...new Set(POSTS.map((p) => p.category))];
  const u = new URLSearchParams(location.search);
  const s = { cat: u.get('category') ?? 'All', q: u.get('q') ?? '', tag: u.get('tag') ?? '', page: 1 };
  $('#journal-cats').innerHTML = cats.map((c) => `<button type="button" class="chip" aria-pressed="${c === s.cat}" data-cat="${c}">${c}</button>`).join('');
  $('#popular').innerHTML = [...POSTS].sort((a, b) => b.read - a.read).slice(0, 4).map((p) => `<li><a href="blog-post.html?slug=${p.slug}"><img src="${img(p.image, 160)}" alt="" loading="lazy">${escapeHTML(p.title)}</a></li>`).join('');
  $('#tags').innerHTML = [...new Set(POSTS.flatMap((p) => p.tags))].map((t) => `<button type="button" class="chip" data-tag="${t}" aria-pressed="${t === s.tag}">${t}</button>`).join('');
  const render = () => {
    const list = rest.filter((p) => (s.cat === 'All' || p.category === s.cat) && (!s.tag || p.tags.includes(s.tag)) && (!s.q || `${p.title} ${p.excerpt}`.toLowerCase().includes(s.q.toLowerCase())));
    const pages = Math.max(1, Math.ceil(list.length / PER));
    s.page = Math.min(s.page, pages);
    grid.innerHTML = list.length ? list.slice((s.page - 1) * PER, s.page * PER).map(postCard).join('') : '<p class="u-serif u-2xl u-muted">No stories match just yet.</p>';
    $('#journal-pages').innerHTML = pages < 2 ? '' : Array.from({ length: pages }, (_, i) => `<button type="button" data-p="${i + 1}" ${i + 1 === s.page ? 'aria-current="page"' : ''}>${String(i + 1).padStart(2, '0')}</button>`).join('');
    initReveal(grid);
  };
  render();
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cat]'); const t = e.target.closest('[data-tag]'); const p = e.target.closest('[data-p]');
    if (c) { s.cat = c.dataset.cat; s.page = 1; $$('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b === c))); render(); }
    if (t) { s.tag = s.tag === t.dataset.tag ? '' : t.dataset.tag; $$('[data-tag]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tag === s.tag))); render(); }
    if (p) { s.page = Number(p.dataset.p); render(); grid.scrollIntoView({ behavior: 'smooth' }); }
  });
  $('#journal-search')?.addEventListener('input', debounce((e) => { s.q = e.target.value; s.page = 1; render(); }, 200));
}

/* ---- Table of contents with scroll-spy (shared with legal pages) ------ */
export function initScrollSpy(tocSel = '.toc', headingsSel = '.prose h2[id], .prose h3[id]') {
  const toc = $(tocSel); if (!toc) return;
  const links = $$('a', toc);
  const heads = $$(headingsSel);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${en.target.id}`));
    });
  }, { rootMargin: '-20% 0px -70% 0px' });
  heads.forEach((h) => io.observe(h));
}

export function initPost() {
  const root = $('#article'); if (!root) return;
  const slug = new URLSearchParams(location.search).get('slug');
  const p = POSTS.find((x) => x.slug === slug) ?? POSTS[0];
  document.title = `${p.title} | The Journal | Maison Verdant`;
  $('meta[name="description"]')?.setAttribute('content', p.excerpt);
  const ld = document.createElement('script'); ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: p.title, image: img(p.image), datePublished: p.date, author: { '@type': 'Person', name: p.author }, publisher: { '@type': 'Organization', name: 'Maison Verdant' } });
  document.head.append(ld);
  $('#article-hero').innerHTML = `<img src="${img(p.image, 2000)}" alt="" fetchpriority="high" class="parallax-soft">`;
  $('#article-head').innerHTML = `<a class="eyebrow eyebrow--gold" href="blog.html?category=${p.category}">${p.category}</a><h1>${escapeHTML(p.title)}</h1><p class="post-card__meta"><span>By ${p.author}</span><span><time datetime="${p.date}">${fmt.date(p.date)}</time></span><span>${p.read} min read</span></p>`;
  const id = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const body = p.body.map((sec, i) => `
    <h2 id="${id(sec.h)}">${sec.h}</h2>
    ${sec.sub ? `<h3 id="${id(sec.sub)}">${sec.sub}</h3>` : ''}
    ${sec.p.map((t) => `<p>${t}</p>`).join('')}
    ${sec.quote ? `<blockquote><p>${sec.quote}</p></blockquote>` : ''}
    ${sec.list ? `<ul>${sec.list.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}
    ${i === 0 ? `<figure><img src="${img(POSTS[(POSTS.indexOf(p) + 3) % POSTS.length].image, 1400)}" alt="The atelier workbench" loading="lazy"><figcaption>At the bench, where every piece is finished by hand.</figcaption></figure>` : ''}
    ${i === 2 ? `<pre><code>Care ritual
  1. Brush with the grain after each wear
  2. Rest on a shaped cedar form for 24 hours
  3. Condition every season, never more</code></pre>` : ''}`).join('');
  $('#article-body').innerHTML = body + `
    <aside class="author-card"><img class="avatar avatar--lg" src="${img('1500648767791-00dcc994a43e', 200)}" alt=""><div><span class="eyebrow">Written by</span><p class="u-serif u-2xl">${p.author}</p><p class="u-sm u-soft">${p.role} at Maison Verdant. Writes about craft, patience and the people who make beautiful things slowly.</p></div></aside>`;
  $('#toc-list').innerHTML = p.body.flatMap((s) => [`<li><a href="#${id(s.h)}">${s.h}</a></li>`, ...(s.sub ? [`<li><a class="toc__sub" href="#${id(s.sub)}">${s.sub}</a></li>`] : [])]).join('');
  initScrollSpy();
  $('#related-posts').innerHTML = POSTS.filter((x) => x.slug !== p.slug).slice(0, 3).map(postCard).join('');
  initReveal(document);
  // Share column
  $('#share-col').addEventListener('click', async (e) => {
    if (!e.target.closest('[data-share]')) return;
    if (navigator.share) { try { await navigator.share({ title: p.title, url: location.href }); return; } catch { /* dismissed */ } }
    await navigator.clipboard?.writeText(location.href); toast({ type: 'success', title: 'Link copied' });
  });
  // Comments
  const comments = [
    { n: 'Clementine Ashford', d: '2026-09-20', t: 'Beautifully written. I have had my loafers resoled twice now and they only get better.' },
    { n: 'Rafael Montoya', d: '2026-09-19', t: 'The part about rejecting nine bolts for every one accepted says everything.' },
  ];
  const paint = () => ($('#comments').innerHTML = comments.map((c) => `<div class="comment"><span class="avatar">${c.n[0]}</span><div><p><strong>${escapeHTML(c.n)}</strong> <span class="u-xs u-muted">${fmt.date(c.d)}</span></p><p>${escapeHTML(c.t)}</p></div></div>`).join(''));
  paint();
  $('#comment-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    comments.push({ n: String(fd.get('name')), d: new Date().toISOString(), t: String(fd.get('comment')) });
    paint(); e.target.reset(); toast({ type: 'success', title: 'Comment posted', message: 'Thank you for joining the conversation.' });
  });
}
