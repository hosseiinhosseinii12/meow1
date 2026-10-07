/**
 * admin.js — The atelier back office. Shares every module with the storefront
 * and adds charts, tables, bulk actions, drag-to-reorder and uploaders.
 */
import { PRODUCTS, ORDERS, CUSTOMERS, CATEGORIES, BRANDS, REVIEWS, COUPONS, POSTS, STAFF, findProduct, img } from './data.js';
import { Store, fmt, $, $$, escapeHTML, debounce } from './state.js';
import { icon, hydrateIcons } from './icons.js';
import { initTheme } from './theme.js';
import { initModals, openModal, confirmDialog } from './modal.js';
import { initTabs } from './tabs.js';
import { initValidation } from './validation.js';
import { toast } from './toast.js';
import { initReveal, animateCount, initRipple } from './animations.js';
import { productCard } from './products.js';
import { STATUS, statusBadge } from './account.js';

const ROOT = document.documentElement.dataset.root ?? '../';
addEventListener('error', (e) => { const el = e.target; if (el instanceof HTMLImageElement && !el.dataset.fallback) { el.dataset.fallback = '1'; el.srcset = ''; el.src = `${ROOT}assets/placeholder.svg`; } }, true);

const total = (o) => o.subtotal + o.shipping + o.tax - o.discount;
const customer = (id) => CUSTOMERS.find((c) => c.id === id);
const productStatus = (p) => (Store.get('admin-drafts', []).includes(p.id) ? 'draft' : p.stock <= 5 ? 'low' : 'active');
const PSTATUS = { active: ['Active', 'green'], low: ['Low stock', 'amber'], draft: ['Draft', 'ink'] };
const iconBtn = (name, label, attrs = '') => `<button class="icon-btn icon-btn--sm" type="button" aria-label="${label}" data-tooltip="${label}" ${attrs}>${icon(name, { cls: 'icon--sm' })}</button>`;

/* ======================================================================
   Shell: sidebar, dropdowns, notifications
   ====================================================================== */
function initShell() {
  const admin = $('#admin'); if (!admin) return;
  const side = $('#admin-side');
  if (Store.get('admin-collapsed')) admin.classList.add('is-collapsed');
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-side-open]')) side.classList.add('is-open');
    if (e.target.closest('[data-side-close]')) side.classList.remove('is-open');
    const col = e.target.closest('[data-side-collapse]');
    if (col) { const on = admin.classList.toggle('is-collapsed'); col.setAttribute('aria-pressed', String(on)); Store.set('admin-collapsed', on); }
    // Generic dropdowns in the top bar
    const trig = e.target.closest('#notif-btn, #user-btn');
    $$('.admin-top .dropdown__panel').forEach((p) => { const own = trig && p.id === trig.getAttribute('aria-controls'); const open = own && !p.classList.contains('is-open'); p.classList.toggle('is-open', open); document.querySelector(`[aria-controls="${p.id}"]`)?.setAttribute('aria-expanded', String(open)); });
    const exp = e.target.closest('[data-export]');
    if (exp) exportCSV(exp.dataset.export);
    const sch = e.target.closest('[data-schedule]');
    if (sch) toast({ type: 'success', title: `${sch.dataset.schedule} report scheduled`, message: 'Delivered to your inbox every Monday at 8am.' });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { side.classList.remove('is-open'); $$('.admin-top .dropdown__panel.is-open').forEach((p) => p.classList.remove('is-open')); } });
}

/* ---- CSV export via Blob ---------------------------------------------- */
function exportCSV(kind) {
  const rows = {
    products: [['Name', 'SKU', 'Brand', 'Category', 'Price', 'Stock'], ...PRODUCTS.map((p) => [p.name, p.sku, p.brand, p.category, p.price, p.stock])],
    orders: [['Order', 'Customer', 'Date', 'Status', 'Total'], ...ORDERS.map((o) => [o.id, customer(o.customerId).name, o.date.slice(0, 10), o.status, total(o)])],
    customers: [['Name', 'Email', 'Orders', 'Spent'], ...CUSTOMERS.map((c) => [c.name, c.email, c.orders, c.spent])],
  }[kind] ?? [['Report', 'Generated'], [kind, new Date().toISOString()]];
  const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `maison-verdant-${kind}-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
  toast({ type: 'success', title: 'Export ready', message: `${rows.length - 1} rows downloaded.` });
}

/* ======================================================================
   Charts (SVG): thin gold line with gradient fill, drawn on view
   ====================================================================== */
function series(days, seed = 1, base = 8000) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 30) - (days - 1 - i) * 864e5);
    const v = base + Math.sin((i + seed) / 3.2) * base * 0.22 + Math.cos((i * seed) / 7) * base * 0.14 + i * (base / days) * 0.4 + ((i * 7919 * seed) % 13) * base * 0.02;
    return { d, v: Math.round(v) };
  });
}
export function lineChart(el, data, { money = true } = {}) {
  const W = 800, H = 280, P = { t: 20, r: 16, b: 32, l: 56 };
  const max = Math.max(...data.map((x) => x.v)) * 1.1, min = 0;
  const x = (i) => P.l + (i / (data.length - 1)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
  const pts = data.map((p, i) => [x(i), y(p.v)]);
  const d = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
  const area = `${d} L${x(data.length - 1)},${H - P.b} L${P.l},${H - P.b} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min));
  const labelEvery = Math.ceil(data.length / 6);
  const gid = `g${Math.random().toString(36).slice(2, 7)}`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Line chart, ${data.length} points, peak ${money ? fmt.money(Math.max(...data.map((q) => q.v))) : Math.max(...data.map((q) => q.v))}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B8935A" stop-opacity=".28"/><stop offset="1" stop-color="#B8935A" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" stroke="currentColor" stroke-opacity=".08"/><text x="${P.l - 10}" y="${y(t) + 4}" text-anchor="end" font-family="JetBrains Mono" font-size="10" fill="currentColor" fill-opacity=".5">${money ? fmt.compact(t) : Math.round(t)}</text>`).join('')}
    ${data.map((p, i) => (i % labelEvery === 0 ? `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-family="Manrope" font-size="10" fill="currentColor" fill-opacity=".5">${fmt.short(p.d)}</text>` : '')).join('')}
    <path d="${area}" fill="url(#${gid})" class="chart-area" style="opacity:0;transition:opacity 1s .6s"/>
    <path d="${d}" fill="none" stroke="#B8935A" stroke-width="1.5" vector-effect="non-scaling-stroke" class="chart-line"/>
    <g class="chart-hover" style="opacity:0"><line y1="${P.t}" y2="${H - P.b}" stroke="currentColor" stroke-opacity=".2"/><circle r="4" fill="var(--surface)" stroke="#B8935A"/></g>
  </svg><div class="chart-tip panel" style="position:absolute;padding:6px 10px;font-size:12px;pointer-events:none;opacity:0;transition:opacity .15s"></div>`;
  const line = el.querySelector('.chart-line'); const len = line.getTotalLength?.() ?? 2000;
  line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
  new IntersectionObserver(([en], io) => { if (!en.isIntersecting) return; line.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 1600, easing: 'cubic-bezier(0.22,1,0.36,1)', fill: 'forwards' }); el.querySelector('.chart-area').style.opacity = 1; io.disconnect(); }).observe(el);
  const svg = el.querySelector('svg'); const hov = el.querySelector('.chart-hover'); const tip = el.querySelector('.chart-tip');
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect(); const rx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(data.length - 1, Math.round(((rx - P.l) / (W - P.l - P.r)) * (data.length - 1))));
    const [px, py] = pts[i];
    hov.style.opacity = 1; hov.querySelector('line').setAttribute('x1', px); hov.querySelector('line').setAttribute('x2', px);
    hov.querySelector('circle').setAttribute('cx', px); hov.querySelector('circle').setAttribute('cy', py);
    tip.style.opacity = 1; tip.style.left = `${(px / W) * r.width + 12}px`; tip.style.top = `${(py / H) * r.height - 12}px`;
    tip.innerHTML = `<span class="u-muted">${fmt.short(data[i].d)}</span> <strong class="mono">${money ? fmt.money(data[i].v) : data[i].v}</strong>`;
  });
  svg.addEventListener('pointerleave', () => { hov.style.opacity = 0; tip.style.opacity = 0; });
}
export function donut(el, parts) {
  const R = 60, C = 2 * Math.PI * R; let off = 0;
  const sum = parts.reduce((s, p) => s + p.v, 0);
  el.innerHTML = `<svg viewBox="0 0 160 160" role="img" aria-label="${parts.map((p) => `${p.label} ${Math.round((p.v / sum) * 100)}%`).join(', ')}"><g transform="rotate(-90 80 80)">${parts.map((p) => { const len = (p.v / sum) * C; const s = `<circle cx="80" cy="80" r="${R}" fill="none" stroke="${p.c}" stroke-width="10" stroke-dasharray="0 ${C}" data-len="${len - 2}" data-off="${-off}" stroke-dashoffset="${-off}"/>`; off += len; return s; }).join('')}</g><text x="80" y="78" text-anchor="middle" font-family="Cormorant Garamond" font-size="28" fill="currentColor">${fmt.compact(sum)}</text><text x="80" y="96" text-anchor="middle" font-family="Manrope" font-size="9" letter-spacing="1.5" fill="currentColor" fill-opacity=".55">SESSIONS</text></svg>
    <ul class="legend" role="list">${parts.map((p) => `<li><span style="--_c:${p.c}"></span>${p.label}<span>${Math.round((p.v / sum) * 100)}%</span></li>`).join('')}</ul>`;
  new IntersectionObserver(([en], io) => { if (!en.isIntersecting) return; el.querySelectorAll('circle[data-len]').forEach((c, i) => setTimeout(() => { c.style.transition = 'stroke-dasharray 1.2s cubic-bezier(0.22,1,0.36,1)'; c.setAttribute('stroke-dasharray', `${c.dataset.len} ${C}`); }, i * 150)); io.disconnect(); }).observe(el);
}
const TRAFFIC = [{ label: 'Direct', v: 38, c: '#0A0A0A' }, { label: 'Organic search', v: 27, c: '#B8935A' }, { label: 'Instagram', v: 21, c: '#C9C1B3' }, { label: 'Newsletter', v: 14, c: '#F5F1EA' }];

function kpiCards(el, items) {
  el.innerHTML = items.map((k) => `<div class="panel kpi"><span class="kpi__label">${k.label}</span><span class="kpi__value" data-count="${k.value}" data-prefix="${k.prefix ?? ''}" data-suffix="${k.suffix ?? ''}" data-decimals="${k.decimals ?? 0}">0</span><span class="kpi__trend kpi__trend--${k.trend >= 0 ? 'up' : 'down'}">${icon(k.trend >= 0 ? 'arrow-up-right' : 'arrow-down-right', { cls: 'icon--xs' })} ${Math.abs(k.trend)}% <span class="u-muted">vs last period</span></span></div>`).join('');
  el.querySelectorAll('[data-count]').forEach(animateCount);
}

/* ======================================================================
   Pages
   ====================================================================== */
const PAGES = {
  dashboard() {
    kpiCards($('#kpis'), [{ label: 'Revenue', value: 284650, prefix: '$', trend: 12.4 }, { label: 'Orders', value: 1284, trend: 8.1 }, { label: 'Customers', value: 3912, trend: 5.6 }, { label: 'Conversion', value: 3.42, suffix: '%', decimals: 2, trend: -0.4 }]);
    const draw = (n) => lineChart($('#rev-chart'), series(Number(n), 2, 9000));
    draw(30);
    $('#range-tabs').addEventListener('tabs:change', (e) => draw(e.detail.value));
    donut($('#donut'), TRAFFIC);
    $('#recent-orders').innerHTML = ORDERS.slice(0, 6).map((o) => `<tr class="is-clickable" data-href="order-detail.html?id=${o.id}"><td class="mono">${o.id}</td><td>${customer(o.customerId).name}</td><td class="u-serif u-lg">${fmt.short(o.date)}</td><td>${statusBadge(o.status)}</td><td class="num">${fmt.money(total(o))}</td></tr>`).join('');
    $('#top-products').innerHTML = [...PRODUCTS].sort((a, b) => b.sold - a.sold).slice(0, 5).map((p) => `<li><img class="table__thumb" src="${img(p.images[0], 120)}" alt=""><span style="flex:1"><span class="table__name">${escapeHTML(p.name)}</span><br><span class="u-xs u-muted">${p.sold} sold</span></span><span class="mono u-sm">${fmt.money(p.price * p.sold)}</span></li>`).join('');
    $('#low-stock').innerHTML = PRODUCTS.filter((p) => p.stock <= 6).slice(0, 5).map((p) => `<li><span class="u-dot u-dot--amber"></span><span style="flex:1">${escapeHTML(p.name)}</span><span class="mono u-sm">${p.stock} left</span></li>`).join('');
  },

  products() {
    const s = { q: new URLSearchParams(location.search).get('q') ?? '', cat: '', status: '', page: 1, sel: new Set() };
    $('#p-q').value = s.q;
    $('#p-cat').insertAdjacentHTML('beforeend', CATEGORIES.map((c) => `<option value="${c.slug}">${c.short}</option>`).join(''));
    let list = [...PRODUCTS];
    const render = () => {
      const rows = list.filter((p) => (!s.q || `${p.name} ${p.sku}`.toLowerCase().includes(s.q.toLowerCase())) && (!s.cat || p.category === s.cat) && (!s.status || productStatus(p) === s.status));
      const pages = Math.max(1, Math.ceil(rows.length / 10)); s.page = Math.min(s.page, pages);
      $('#products-body').innerHTML = rows.slice((s.page - 1) * 10, s.page * 10).map((p) => { const st = PSTATUS[productStatus(p)]; return `<tr data-id="${p.id}"><td><label class="check"><input type="checkbox" data-sel="${p.id}" ${s.sel.has(p.id) ? 'checked' : ''} aria-label="Select ${escapeHTML(p.name)}"></label></td><td><img class="table__thumb" src="${img(p.images[0], 120)}" alt="" loading="lazy"></td><td><a class="table__name" href="product-edit.html?id=${p.id}">${escapeHTML(p.name)}</a><br><span class="u-xs u-muted">${escapeHTML(p.brand)}</span></td><td class="mono u-xs">${p.sku}</td><td>${CATEGORIES.find((c) => c.slug === p.category).short}</td><td class="num">${fmt.money(p.price)}</td><td class="num">${p.stock}</td><td><span class="status status--${st[1]}">${st[0]}</span></td><td><div class="table__actions"><a class="icon-btn icon-btn--sm" href="product-edit.html?id=${p.id}" aria-label="Edit ${escapeHTML(p.name)}" data-tooltip="Edit">${icon('edit', { cls: 'icon--sm' })}</a>${iconBtn('trash', `Delete ${escapeHTML(p.name)}`, `data-del="${p.id}"`)}</div></td></tr>`; }).join('') || '<tr><td colspan="9" class="u-center u-muted" style="padding:var(--space-12)">No products match these filters.</td></tr>';
      $('#p-pages').innerHTML = pages < 2 ? '' : Array.from({ length: pages }, (_, i) => `<button type="button" data-page="${i + 1}" ${i + 1 === s.page ? 'aria-current="page"' : ''}>${String(i + 1).padStart(2, '0')}</button>`).join('');
      $('#bulk-count').textContent = s.sel.size;
      $('#bulk-bar').classList.toggle('is-visible', s.sel.size > 0);
      $('#select-all').checked = rows.length > 0 && rows.every((p) => s.sel.has(p.id));
    };
    render();
    $('#p-q').addEventListener('input', debounce((e) => { s.q = e.target.value; s.page = 1; render(); }, 150));
    $('#p-cat').addEventListener('change', (e) => { s.cat = e.target.value; s.page = 1; render(); });
    $('#p-status').addEventListener('change', (e) => { s.status = e.target.value; s.page = 1; render(); });
    $('#p-pages').addEventListener('click', (e) => { const b = e.target.closest('[data-page]'); if (b) { s.page = Number(b.dataset.page); render(); } });
    $('#select-all').addEventListener('change', (e) => { $$('[data-sel]').forEach((c) => (e.target.checked ? s.sel.add(c.dataset.sel) : s.sel.delete(c.dataset.sel))); render(); });
    $('#products-body').addEventListener('change', (e) => { const c = e.target.closest('[data-sel]'); if (c) { c.checked ? s.sel.add(c.dataset.sel) : s.sel.delete(c.dataset.sel); render(); } });
    $('#products-body').addEventListener('click', async (e) => {
      const d = e.target.closest('[data-del]'); if (!d) return;
      const p = findProduct(d.dataset.del);
      if (await confirmDialog({ title: 'Delete this product?', message: `${p.name} will be removed from the storefront. This cannot be undone.`, confirm: 'Delete', danger: true })) { list = list.filter((x) => x.id !== p.id); s.sel.delete(p.id); render(); toast({ type: 'success', title: 'Product deleted', message: p.name }); }
    });
    $('#bulk-bar').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-bulk]'); if (!b) return;
      const ids = [...s.sel];
      if (b.dataset.bulk === 'delete') { if (!(await confirmDialog({ title: `Delete ${ids.length} products?`, message: 'They will be removed from the storefront.', confirm: 'Delete all', danger: true }))) return; list = list.filter((x) => !s.sel.has(x.id)); }
      else Store.update('admin-drafts', (dr) => (b.dataset.bulk === 'draft' ? [...new Set([...dr, ...ids])] : dr.filter((x) => !ids.includes(x))), []);
      s.sel.clear(); render(); toast({ type: 'success', title: 'Bulk update complete', message: `${ids.length} products updated.` });
    });
  },

  'product-edit'() {
    const p = findProduct(new URLSearchParams(location.search).get('id') ?? '') ?? PRODUCTS[0];
    const f = $('#product-form');
    $('#pe-cat').innerHTML = CATEGORIES.map((c) => `<option value="${c.slug}" ${c.slug === p.category ? 'selected' : ''}>${c.name}</option>`).join('');
    $('#pe-brand').innerHTML = BRANDS.map((b) => `<option ${b === p.brand ? 'selected' : ''}>${b}</option>`).join('');
    Object.assign(f.elements, {});
    f.elements.name.value = p.name; f.elements.slug.value = p.slug; f.elements.description.value = p.description;
    f.elements.price.value = p.price; f.elements.compareAt.value = p.compareAt ?? ''; f.elements.sku.value = p.sku; f.elements.stock.value = p.stock;
    f.elements.seoTitle.value = `${p.name} by ${p.brand}`; f.elements.seoDesc.value = p.description.slice(0, 155);
    let images = [...p.images.map((i) => img(i, 300))];
    const paintThumbs = () => { $('#thumbs').innerHTML = images.map((src, i) => `<figure><img src="${src}" alt="Product image ${i + 1}"><button class="icon-btn icon-btn--sm" type="button" data-rm-img="${i}" aria-label="Remove image ${i + 1}" style="position:absolute;top:4px;right:4px;background:var(--surface)">${icon('x', { cls: 'icon--xs' })}</button></figure>`).join(''); };
    paintThumbs();
    const variants = p.colors.flatMap((c) => (p.sizes.length ? p.sizes.slice(0, 2) : ['One size']).map((z) => ({ color: c.name, size: z, sku: `${p.sku}-${c.name.slice(0, 3).toUpperCase()}-${z}`.replace(/\s/g, ''), stock: 4 })));
    const paintVariants = () => { $('#variants').innerHTML = variants.map((v, i) => `<div class="variant-row"><div class="field"><label class="field__label" for="v-c${i}">Colour</label><input class="field__control" id="v-c${i}" value="${v.color}"></div><div class="field"><label class="field__label" for="v-s${i}">Size</label><input class="field__control" id="v-s${i}" value="${v.size}"></div><div class="field"><label class="field__label" for="v-k${i}">SKU</label><input class="field__control mono" id="v-k${i}" value="${v.sku}"></div><div class="field"><label class="field__label" for="v-q${i}">Stock</label><input class="field__control mono" id="v-q${i}" type="number" min="0" value="${v.stock}"></div>${iconBtn('trash', 'Remove variant', `data-rm-var="${i}"`)}</div>`).join(''); };
    paintVariants();
    $('#add-variant').addEventListener('click', () => { variants.push({ color: '', size: '', sku: `${p.sku}-NEW`, stock: 0 }); paintVariants(); $('#variants .variant-row:last-child input')?.focus(); });
    f.addEventListener('click', (e) => { const r = e.target.closest('[data-rm-var]'); if (r) { variants.splice(Number(r.dataset.rmVar), 1); paintVariants(); } const ri = e.target.closest('[data-rm-img]'); if (ri) { images.splice(Number(ri.dataset.rmImg), 1); paintThumbs(); preview(); } });
    const preview = () => {
      const draft = { ...p, name: f.elements.name.value || 'Untitled piece', brand: f.elements.brand.value, price: Number(f.elements.price.value) || 0, compareAt: Number(f.elements.compareAt.value) || null, description: f.elements.description.value };
      $('#preview').innerHTML = productCard(draft);
      const firstImg = $('#preview img'); if (firstImg && images[0]) { firstImg.src = images[0]; firstImg.srcset = ''; }
      $('#seo-t-count').textContent = f.elements.seoTitle.value.length; $('#seo-d-count').textContent = f.elements.seoDesc.value.length;
    };
    f.addEventListener('input', (e) => { if (e.target === f.elements.name) f.elements.slug.value = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); preview(); });
    preview();
    // Drag-and-drop uploader with FileReader previews
    const up = $('#uploader'); const input = $('#pe-files');
    const addFiles = (files) => { [...files].filter((file) => file.type.startsWith('image/')).forEach((file) => { const r = new FileReader(); r.onload = () => { images.push(r.result); paintThumbs(); preview(); }; r.readAsDataURL(file); }); toast({ type: 'success', title: 'Images added', message: `${files.length} file(s) ready to upload.` }); };
    ['dragenter', 'dragover'].forEach((ev) => up.addEventListener(ev, (e) => { e.preventDefault(); up.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((ev) => up.addEventListener(ev, (e) => { e.preventDefault(); up.classList.remove('is-over'); }));
    up.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
    input.addEventListener('change', () => addFiles(input.files));
    f.addEventListener('submit', (e) => { e.preventDefault(); toast({ type: 'success', title: 'Product saved', message: `${f.elements.name.value} is now ${f.elements.status.value}.` }); });
  },

  orders() {
    const s = { q: '', status: '', from: '2026-06-01', to: '2026-09-30' };
    const overrides = Store.get('admin-order-status', {});
    const render = () => {
      const rows = ORDERS.filter((o) => { const c = customer(o.customerId); const st = overrides[o.id] ?? o.status; const d = o.date.slice(0, 10); return (!s.q || `${o.id} ${c.name}`.toLowerCase().includes(s.q.toLowerCase())) && (!s.status || st === s.status) && d >= s.from && d <= s.to; });
      $('#orders-body').innerHTML = rows.map((o) => { const st = overrides[o.id] ?? o.status; return `<tr class="is-clickable" data-href="order-detail.html?id=${o.id}"><td class="mono">${o.id}</td><td><span class="u-flex u-items-center u-gap-3"><img class="avatar avatar--sm" src="${img(customer(o.customerId).avatar, 80)}" alt="">${customer(o.customerId).name}</span></td><td class="u-serif u-lg">${fmt.date(o.date)}</td><td class="num">${o.items.reduce((n, i) => n + i.qty, 0)}</td><td class="num">${fmt.money(total(o))}</td><td>${statusBadge(st)}</td><td><select class="field__control" style="min-block-size:36px;inline-size:auto;font-size:var(--text-sm)" data-status="${o.id}" aria-label="Update status for ${o.id}">${Object.keys(STATUS).map((k) => `<option value="${k}" ${k === st ? 'selected' : ''}>${STATUS[k][0]}</option>`).join('')}</select></td></tr>`; }).join('') || '<tr><td colspan="7" class="u-center u-muted" style="padding:var(--space-12)">No orders in this range.</td></tr>';
    };
    render();
    $('#o-q').addEventListener('input', debounce((e) => { s.q = e.target.value; render(); }, 150));
    $('#o-status').addEventListener('change', (e) => { s.status = e.target.value; render(); });
    $('#o-from').addEventListener('change', (e) => { s.from = e.target.value; render(); });
    $('#o-to').addEventListener('change', (e) => { s.to = e.target.value; render(); });
    $('#orders-body').addEventListener('change', (e) => { const sel = e.target.closest('[data-status]'); if (!sel) return; overrides[sel.dataset.status] = sel.value; Store.set('admin-order-status', overrides); render(); toast({ type: 'success', title: 'Status updated', message: `${sel.dataset.status} is now ${STATUS[sel.value][0].toLowerCase()}.` }); });
    $('#orders-body').addEventListener('click', (e) => { if (e.target.closest('select')) e.stopPropagation(); }, true);
  },

  'order-detail'() {
    const o = ORDERS.find((x) => x.id === new URLSearchParams(location.search).get('id')) ?? ORDERS[0];
    const c = customer(o.customerId);
    let st = Store.get('admin-order-status', {})[o.id] ?? o.status;
    const steps = ['placed', 'processing', 'shipped', 'out-for-delivery', 'delivered'];
    const paint = () => {
      const idx = Math.max(0, steps.indexOf(st));
      $('#ao-root').innerHTML = `
      <div class="admin-head"><div><a class="link link--muted" href="orders.html">${icon('arrow-left', { cls: 'icon--xs' })} Orders</a><h1 class="mono u-mt-4" style="font-size:var(--text-3xl)">${o.id}</h1><p>${fmt.date(o.date)} &middot; ${statusBadge(st)}</p></div>
        <div class="admin-toolbar"><button class="link" type="button" data-print>${icon('printer', { cls: 'icon--xs' })} Print invoice</button><button class="link" type="button" data-refund>Refund</button><button class="link link--danger" type="button" data-cancel>Cancel</button></div></div>
      <div class="admin-grid admin-grid--2-1">
        <div class="u-grid u-gap-6" style="align-content:start">
          <section class="panel panel--flush"><h2 class="panel__title" style="padding:var(--space-6) var(--space-6) 0">Items</h2><div class="table-wrap"><table class="table"><thead><tr><th scope="col">Product</th><th scope="col">Variant</th><th scope="col" class="num">Qty</th><th scope="col" class="num">Price</th><th scope="col" class="num">Total</th></tr></thead><tbody>${o.items.map((it) => { const p = findProduct(it.id); return `<tr><td><span class="u-flex u-items-center u-gap-3"><img class="table__thumb" src="${img(p.images[0], 120)}" alt=""><span class="table__name">${escapeHTML(p.name)}</span></span></td><td class="u-sm u-muted">${[it.color, it.size].filter(Boolean).join(' / ')}</td><td class="num">${it.qty}</td><td class="num">${fmt.money(it.price)}</td><td class="num">${fmt.money(it.price * it.qty)}</td></tr>`; }).join('')}</tbody></table></div>
            <div class="summary" style="padding:var(--space-6);max-inline-size:360px;margin-inline-start:auto"><div class="summary__row"><span>Subtotal</span><span>${fmt.money(o.subtotal, true)}</span></div>${o.discount ? `<div class="summary__row summary__row--discount"><span>Discount</span><span>-${fmt.money(o.discount, true)}</span></div>` : ''}<div class="summary__row"><span>Shipping</span><span>${o.shipping ? fmt.money(o.shipping, true) : 'Complimentary'}</span></div><div class="summary__row"><span>Tax</span><span>${fmt.money(o.tax, true)}</span></div><div class="summary__total"><span>Total</span><span>${fmt.money(total(o), true)}</span></div></div></section>
          <section class="panel"><div class="panel__title"><h2>Status</h2><span class="u-flex u-gap-3 u-items-center"><label class="visually-hidden" for="st-sel">New status</label><select class="field__control" id="st-sel" style="min-block-size:40px;inline-size:auto">${Object.keys(STATUS).map((k) => `<option value="${k}" ${k === st ? 'selected' : ''}>${STATUS[k][0]}</option>`).join('')}</select><button class="btn btn--sm" type="button" id="st-update">Update</button></span></div>
            <ol class="timeline" role="list" style="--_p:${(idx / 4) * 80}%"><span class="timeline__progress" aria-hidden="true"></span>${steps.map((s2, i) => `<li class="timeline__step ${i < idx || (i === idx && s2 === 'delivered') ? 'is-done' : ''} ${i === idx && s2 !== 'delivered' ? 'is-current' : ''}"><span class="timeline__dot"></span><span class="timeline__label">${STATUS[s2][0]}</span></li>`).join('')}</ol></section>
        </div>
        <div class="u-grid u-gap-6" style="align-content:start">
          <section class="panel"><h2 class="panel__title">Customer</h2><div class="u-flex u-gap-4 u-items-center"><img class="avatar avatar--lg" src="${img(c.avatar, 160)}" alt=""><div><a class="u-serif u-xl" href="customer-detail.html?id=${c.id}">${c.name}</a><p class="u-sm u-muted">${c.email}</p><p class="u-xs u-muted">${c.orders} orders &middot; ${fmt.money(c.spent)} lifetime</p></div></div></section>
          <section class="panel"><h2 class="panel__title">Shipping</h2><p class="u-soft">${o.address.name}<br>${o.address.line1}<br>${o.address.city} ${o.address.zip}<br>${o.address.country}</p><p class="u-xs u-muted u-mt-4">${o.method} delivery</p></section>
          <section class="panel"><h2 class="panel__title">Payment</h2><p class="u-soft">${o.payment}</p><p class="u-xs u-muted u-mt-2">Captured ${fmt.date(o.date)}</p></section>
        </div></div>`;
    };
    paint();
    $('#ao-root').addEventListener('click', async (e) => {
      if (e.target.closest('#st-update')) { st = $('#st-sel').value; Store.update('admin-order-status', (m) => ({ ...m, [o.id]: st }), {}); paint(); toast({ type: 'success', title: 'Status updated', message: `Customer notified by email.` }); }
      if (e.target.closest('[data-print]')) print();
      if (e.target.closest('[data-refund]') && (await confirmDialog({ title: 'Issue a full refund?', message: `${fmt.money(total(o), true)} will be returned to ${o.payment}.`, confirm: 'Refund' }))) toast({ type: 'success', title: 'Refund issued' });
      if (e.target.closest('[data-cancel]') && (await confirmDialog({ title: 'Cancel this order?', message: 'The customer will be notified and refunded.', confirm: 'Cancel order', danger: true }))) { st = 'cancelled'; Store.update('admin-order-status', (m) => ({ ...m, [o.id]: st }), {}); paint(); toast({ type: 'success', title: 'Order cancelled' }); }
    });
  },

  customers() {
    const s = { q: '', seg: '' };
    const render = () => { $('#customers-body').innerHTML = CUSTOMERS.filter((c) => (!s.q || `${c.name} ${c.email}`.toLowerCase().includes(s.q.toLowerCase())) && (!s.seg || c.segment === s.seg)).map((c) => `<tr class="is-clickable" data-href="customer-detail.html?id=${c.id}"><td><span class="u-flex u-items-center u-gap-3"><img class="avatar" src="${img(c.avatar, 100)}" alt=""><span class="table__name">${c.name}</span></span></td><td class="u-sm">${c.email}</td><td><span class="status status--${c.segment === 'VIP' ? 'gold' : c.segment === 'New' ? 'green' : 'ink'}">${c.segment}</span></td><td class="num">${c.orders}</td><td class="num">${fmt.money(c.spent)}</td><td class="u-sm">${fmt.date(c.joined)}</td><td><div class="table__actions"><a class="icon-btn icon-btn--sm" href="customer-detail.html?id=${c.id}" aria-label="View ${c.name}" data-tooltip="View">${icon('eye', { cls: 'icon--sm' })}</a><a class="icon-btn icon-btn--sm" href="customer-detail.html?id=${c.id}#notes" aria-label="Edit ${c.name}" data-tooltip="Edit">${icon('edit', { cls: 'icon--sm' })}</a></div></td></tr>`).join(''); };
    render();
    $('#c-q').addEventListener('input', debounce((e) => { s.q = e.target.value; render(); }, 150));
    $('#c-seg').addEventListener('change', (e) => { s.seg = e.target.value; render(); });
  },

  'customer-detail'() {
    const c = CUSTOMERS.find((x) => x.id === new URLSearchParams(location.search).get('id')) ?? CUSTOMERS[0];
    const orders = ORDERS.filter((o) => o.customerId === c.id);
    $('#cd-root').innerHTML = `
      <div class="admin-head"><div class="u-flex u-gap-6 u-items-center"><img class="avatar avatar--lg" src="${img(c.avatar, 200)}" alt=""><div><a class="link link--muted" href="customers.html">${icon('arrow-left', { cls: 'icon--xs' })} Customers</a><h1 class="u-mt-2">${c.name}</h1><p>${c.email} &middot; ${c.city} &middot; Client since ${fmt.date(c.joined)}</p></div></div><span class="status status--gold">${c.segment}</span></div>
      <div class="admin-kpis"><div class="panel kpi"><span class="kpi__label">Orders</span><span class="kpi__value">${c.orders}</span></div><div class="panel kpi"><span class="kpi__label">Lifetime value</span><span class="kpi__value">${fmt.money(c.spent)}</span></div><div class="panel kpi"><span class="kpi__label">Average order</span><span class="kpi__value">${fmt.money(c.spent / c.orders)}</span></div></div>
      <div class="admin-grid admin-grid--2-1">
        <section class="panel panel--flush"><h2 class="panel__title" style="padding:var(--space-6) var(--space-6) 0">Order history</h2><div class="table-wrap"><table class="table"><thead><tr><th scope="col">Order</th><th scope="col">Date</th><th scope="col">Status</th><th scope="col" class="num">Total</th></tr></thead><tbody>${orders.map((o) => `<tr class="is-clickable" data-href="order-detail.html?id=${o.id}"><td class="mono">${o.id}</td><td class="u-serif u-lg">${fmt.date(o.date)}</td><td>${statusBadge(o.status)}</td><td class="num">${fmt.money(total(o))}</td></tr>`).join('')}</tbody></table></div></section>
        <div class="u-grid u-gap-6" style="align-content:start">
          <section class="panel"><h2 class="panel__title">Profile</h2><dl class="u-grid u-gap-2 u-sm"><dt class="u-muted">Phone</dt><dd>+44 20 7946 0${100 + CUSTOMERS.indexOf(c)}</dd><dt class="u-muted">Preferred size</dt><dd>M / 42</dd><dt class="u-muted">Concierge</dt><dd>Amelia Laurent</dd></dl></section>
          <section class="panel"><h2 class="panel__title">Addresses</h2><p class="u-soft u-sm">${c.name}<br>24 Marylebone High Street<br>London W1U 4NR</p></section>
          <section class="panel" id="notes"><h2 class="panel__title">Notes</h2><form id="note-form"><label class="visually-hidden" for="note">Private note</label><textarea class="field__control" id="note" placeholder="Prefers linen boxes without branding. Anniversary in November.">${escapeHTML(Store.get(`note-${c.id}`, ''))}</textarea><button class="btn btn--sm u-mt-4" type="submit">Save note</button></form></section>
        </div></div>`;
    $('#note-form').addEventListener('submit', (e) => { e.preventDefault(); Store.set(`note-${c.id}`, $('#note').value); toast({ type: 'success', title: 'Note saved' }); });
  },

  categories() { reorderPage('categories', CATEGORIES.map((c) => ({ name: c.name, slug: c.slug, count: PRODUCTS.filter((p) => p.category === c.slug).length, visible: true }))); },
  brands() { reorderPage('brands', BRANDS.map((b) => ({ name: b, slug: b.toLowerCase().replace(/[^a-z0-9]+/g, '-'), count: PRODUCTS.filter((p) => p.brand === b).length, visible: true }))); },

  coupons() {
    const rows = Store.get('admin-coupons', COUPONS);
    const render = () => { $('#coupons-body').innerHTML = rows.map((c, i) => `<tr><td><button class="chip mono" type="button" data-copy="${c.code}" aria-label="Copy ${c.code}">${c.code} ${icon('copy', { cls: 'icon--xs' })}</button></td><td>${{ percent: 'Percentage', fixed: 'Fixed', shipping: 'Free shipping' }[c.type]}</td><td class="num">${c.type === 'percent' ? `${c.value}%` : c.type === 'fixed' ? fmt.money(c.value) : '-'}</td><td class="num">${fmt.money(c.min)}</td><td><div class="u-grid u-gap-2" style="min-inline-size:120px"><span class="mono u-xs">${c.used}${c.limit ? ` / ${c.limit}` : ''}</span>${c.limit ? `<div class="progress"><div class="progress__bar" style="--_v:${(c.used / c.limit) * 100}%"></div></div>` : ''}</div></td><td class="u-sm">${fmt.date(c.expires)}</td><td><span class="status status--${{ active: 'green', expired: 'ink', scheduled: 'gold' }[c.status]}">${c.status}</span></td><td><div class="table__actions">${iconBtn('edit', `Edit ${c.code}`, `data-edit="${i}"`)}${iconBtn('trash', `Delete ${c.code}`, `data-del="${i}"`)}</div></td></tr>`).join(''); };
    render();
    let editing = -1;
    const form = $('#coupon-form');
    $('#coupons-body').addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-edit]'); const del = e.target.closest('[data-del]');
      if (ed) { editing = Number(ed.dataset.edit); const c = rows[editing]; form.elements.code.value = c.code; form.elements.type.value = c.type; form.elements.value.value = c.value; form.elements.min.value = c.min; form.elements.expires.value = c.expires; openModal('coupon-modal', ed); }
      if (del && (await confirmDialog({ title: 'Delete this code?', message: `${rows[del.dataset.del].code} will stop working immediately.`, confirm: 'Delete', danger: true }))) { rows.splice(Number(del.dataset.del), 1); Store.set('admin-coupons', rows); render(); toast({ type: 'success', title: 'Code deleted' }); }
    });
    $('[data-modal-open="coupon-modal"]').addEventListener('click', () => { editing = -1; form.reset(); });
    form.addEventListener('submit', (e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData(form)); const c = { code: fd.code.toUpperCase(), type: fd.type, value: Number(fd.value), min: Number(fd.min), used: 0, limit: null, expires: fd.expires, status: 'active' }; if (editing >= 0) rows[editing] = { ...rows[editing], ...c, used: rows[editing].used }; else rows.unshift(c); Store.set('admin-coupons', rows); render(); form.closest('dialog').close(); toast({ type: 'success', title: 'Code saved', message: c.code }); });
    document.addEventListener('click', async (e) => { const b = e.target.closest('[data-copy]'); if (!b) return; try { await navigator.clipboard.writeText(b.dataset.copy); toast({ type: 'success', title: 'Code copied', message: b.dataset.copy }); } catch { toast({ type: 'info', title: b.dataset.copy }); } });
  },

  reviews() {
    const status = Store.get('admin-review-status', {});
    let filter = 'all';
    const rows = REVIEWS.slice(0, 40);
    const render = () => { $('#reviews-body').innerHTML = rows.filter((r) => filter === 'all' || (status[r.id] ?? r.status) === filter).map((r) => { const p = findProduct(r.productId); const st = status[r.id] ?? r.status; return `<tr><td><span class="u-flex u-items-center u-gap-3"><img class="table__thumb" src="${img(p.images[0], 100)}" alt=""><span class="u-sm">${escapeHTML(p.name)}</span></span></td><td class="u-sm">${r.author}</td><td><span class="stars" role="img" aria-label="${r.rating} of 5">${[1, 2, 3, 4, 5].map((n) => icon('star', { cls: n <= r.rating ? 'is-filled' : '' })).join('')}</span></td><td style="max-inline-size:320px"><p class="u-serif u-lg">${r.title}</p><p class="u-xs u-muted">${r.body.slice(0, 90)}...</p></td><td><span class="status status--${{ approved: 'green', pending: 'amber', rejected: 'red' }[st]}">${st}</span></td><td><div class="table__actions">${iconBtn('check', 'Approve', `data-approve="${r.id}"`)}${iconBtn('x', 'Reject', `data-reject="${r.id}"`)}</div></td></tr>`; }).join('') || '<tr><td colspan="6" class="u-center u-muted" style="padding:var(--space-12)">Nothing here. The queue is clear.</td></tr>'; };
    render();
    $('#rv-tabs').addEventListener('tabs:change', (e) => { filter = e.detail.value; render(); });
    $('#reviews-body').addEventListener('click', (e) => { const a = e.target.closest('[data-approve]'); const r = e.target.closest('[data-reject]'); if (!a && !r) return; const id = (a ?? r).dataset[a ? 'approve' : 'reject']; status[id] = a ? 'approved' : 'rejected'; Store.set('admin-review-status', status); render(); toast({ type: a ? 'success' : 'info', title: a ? 'Review approved' : 'Review rejected' }); });
  },

  blog() {
    const rows = POSTS.map((p, i) => ({ ...p, status: i === 8 ? 'draft' : i === 7 ? 'scheduled' : 'published' }));
    const render = () => { $('#posts-body').innerHTML = rows.map((p, i) => `<tr><td><span class="u-flex u-items-center u-gap-3"><img class="table__thumb" src="${img(p.image, 100)}" alt=""><span class="table__name">${escapeHTML(p.title)}</span></span></td><td class="u-sm">${p.author}</td><td class="u-sm">${p.category}</td><td><span class="status status--${{ published: 'green', draft: 'ink', scheduled: 'gold' }[p.status]}">${p.status}</span></td><td class="u-sm">${fmt.date(p.date)}</td><td><div class="table__actions">${iconBtn('edit', 'Edit story', `data-edit="${i}"`)}${iconBtn('trash', 'Delete story', `data-del="${i}"`)}</div></td></tr>`).join(''); };
    render();
    let editing = -1; const f = $('#post-form');
    const fill = (p) => { f.elements.title.value = p?.title ?? ''; f.elements.slug.value = p?.slug ?? ''; f.elements.category.value = p?.category ?? 'Craft'; f.elements.cover.value = p ? img(p.image) : ''; f.elements.tags.value = p?.tags.join(', ') ?? ''; f.elements.date.value = p ? `${p.date}T09:00` : ''; f.elements.body.value = p ? p.body.flatMap((s) => s.p).join('\n\n') : ''; f.elements.status.value = p?.status ?? 'draft'; };
    document.querySelector('[data-new-post]').addEventListener('click', (e) => { editing = -1; fill(null); openModal('post-modal', e.currentTarget); });
    $('#posts-body').addEventListener('click', async (e) => { const ed = e.target.closest('[data-edit]'); const del = e.target.closest('[data-del]'); if (ed) { editing = Number(ed.dataset.edit); fill(rows[editing]); openModal('post-modal', ed); } if (del && (await confirmDialog({ title: 'Delete this story?', message: rows[del.dataset.del].title, confirm: 'Delete', danger: true }))) { rows.splice(Number(del.dataset.del), 1); render(); toast({ type: 'success', title: 'Story deleted' }); } });
    f.elements.title.addEventListener('input', () => { f.elements.slug.value = f.elements.title.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); });
    f.addEventListener('submit', (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(f)); const base = editing >= 0 ? rows[editing] : { ...POSTS[0], author: 'Charlotte Vale' }; const row = { ...base, title: d.title, slug: d.slug, category: d.category, status: d.status, date: (d.date || new Date().toISOString()).slice(0, 10), tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean) }; if (editing >= 0) rows[editing] = row; else rows.unshift(row); render(); f.closest('dialog').close(); toast({ type: 'success', title: 'Story saved', message: row.title }); });
  },

  media() {
    let items = PRODUCTS.flatMap((p) => p.images.slice(0, 2).map((i, k) => ({ id: `${p.id}-${k}`, src: img(i, 400), name: p.name, cat: p.category })));
    $('#m-f').insertAdjacentHTML('beforeend', CATEGORIES.map((c) => `<option value="${c.slug}">${c.short}</option>`).join(''));
    const s = { q: '', f: '' };
    const render = () => { $('#media-grid').innerHTML = items.filter((m) => (!s.q || m.name.toLowerCase().includes(s.q.toLowerCase())) && (!s.f || m.cat === s.f)).map((m) => `<figure class="media-item"><img src="${m.src}" alt="${escapeHTML(m.name)}" loading="lazy"><figcaption class="media-item__overlay"><button type="button" data-del="${m.id}" aria-label="Delete ${escapeHTML(m.name)} image">${icon('trash', { cls: 'icon--sm' })}</button><span>${escapeHTML(m.name)}</span></figcaption></figure>`).join(''); };
    render();
    $('#m-q').addEventListener('input', debounce((e) => { s.q = e.target.value; render(); }, 150));
    $('#m-f').addEventListener('change', (e) => { s.f = e.target.value; render(); });
    $('#media-grid').addEventListener('click', async (e) => { const d = e.target.closest('[data-del]'); if (d && (await confirmDialog({ title: 'Delete this image?', message: 'It will be removed from any product using it.', confirm: 'Delete', danger: true }))) { items = items.filter((m) => m.id !== d.dataset.del); render(); toast({ type: 'success', title: 'Image deleted' }); } });
    const up = $('#media-upload'); const input = $('#media-files');
    const add = (files) => { [...files].filter((f) => f.type.startsWith('image/')).forEach((file) => { const r = new FileReader(); r.onload = () => { items.unshift({ id: `up-${Date.now()}-${Math.random()}`, src: r.result, name: file.name, cat: '' }); render(); }; r.readAsDataURL(file); }); toast({ type: 'success', title: 'Upload complete', message: `${files.length} image(s) added.` }); };
    ['dragenter', 'dragover'].forEach((ev) => up.addEventListener(ev, (e) => { e.preventDefault(); up.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((ev) => up.addEventListener(ev, (e) => { e.preventDefault(); up.classList.remove('is-over'); }));
    up.addEventListener('drop', (e) => add(e.dataTransfer.files));
    input.addEventListener('change', () => add(input.files));
  },

  analytics() {
    const draw = () => {
      const days = Math.max(7, Math.min(120, Math.round((new Date($('#an-to').value) - new Date($('#an-from').value)) / 864e5)));
      kpiCards($('#an-kpis'), [{ label: 'Net sales', value: 812400, prefix: '$', trend: 14.2 }, { label: 'Orders', value: 3610, trend: 9.3 }, { label: 'Average order', value: 225, prefix: '$', trend: 4.4 }, { label: 'Returning clients', value: 41, suffix: '%', trend: 2.8 }]);
      lineChart($('#an-sales'), series(days, 3, 8800));
      lineChart($('#an-orders'), series(days, 5, 40), { money: false });
    };
    draw();
    $('#an-apply').addEventListener('click', () => { draw(); toast({ type: 'info', title: 'Range updated' }); });
    $('#an-top').innerHTML = [...PRODUCTS].sort((a, b) => b.sold * b.price - a.sold * a.price).slice(0, 6).map((p) => `<li><img class="table__thumb" src="${img(p.images[0], 100)}" alt=""><span style="flex:1" class="u-serif u-lg">${escapeHTML(p.name)}</span><span class="mono u-sm">${fmt.compact(p.sold * p.price)}</span></li>`).join('');
    const cats = CATEGORIES.map((c) => ({ c, v: PRODUCTS.filter((p) => p.category === c.slug).reduce((s, p) => s + p.sold * p.price, 0) })).sort((a, b) => b.v - a.v);
    const max = cats[0].v;
    $('#an-cats').innerHTML = cats.map(({ c, v }) => `<li style="display:grid;gap:6px"><span class="u-flex u-between"><span class="u-serif u-lg">${c.short}</span><span class="mono u-sm">${fmt.compact(v)}</span></span><div class="progress"><div class="progress__bar" data-v="${(v / max) * 100}"></div></div></li>`).join('');
    requestAnimationFrame(() => $$('#an-cats [data-v]').forEach((b) => b.style.setProperty('--_v', `${b.dataset.v}%`)));
    donut($('#an-acq'), [{ label: 'Referral', v: 31, c: '#B8935A' }, { label: 'Search', v: 29, c: '#0A0A0A' }, { label: 'Social', v: 24, c: '#C9C1B3' }, { label: 'Events', v: 16, c: '#F5F1EA' }]);
  },

  reports() {},

  settings() {
    $$('[data-settings]').forEach((f) => f.addEventListener('submit', (e) => { e.preventDefault(); toast({ type: 'success', title: 'Settings saved', message: `${f.querySelector('h2').textContent} updated.` }); }));
    document.addEventListener('click', (e) => { const s = e.target.closest('.swatch'); if (s) $$('.swatch', s.parentElement).forEach((b) => b.setAttribute('aria-pressed', String(b === s))); });
  },

  users() {
    const roles = ['Owner', 'Admin', 'Editor', 'Support'];
    const perms = ['View dashboard', 'Manage products', 'Manage orders', 'Issue refunds', 'Manage customers', 'Edit Journal', 'Manage staff', 'Store settings'];
    const matrix = Store.get('admin-roles', { Owner: perms, Admin: perms.slice(0, 7), Editor: ['View dashboard', 'Manage products', 'Edit Journal'], Support: ['View dashboard', 'Manage orders', 'Manage customers'] });
    $('#users-body').innerHTML = STAFF.map((u) => `<tr><td><span class="u-flex u-items-center u-gap-3"><img class="avatar" src="${img(u.avatar, 100)}" alt=""><span class="table__name">${u.name}</span></span></td><td class="u-sm">${u.email}</td><td><span class="status status--${u.role === 'Owner' ? 'gold' : 'ink'}">${u.role}</span></td><td class="u-sm u-muted">${u.last}</td><td><div class="table__actions">${iconBtn('edit', `Edit ${u.name}`, 'data-toast-edit')}</div></td></tr>`).join('');
    $('#role-matrix').innerHTML = `<thead><tr><th scope="col">Permission</th>${roles.map((r) => `<th scope="col">${r}</th>`).join('')}</tr></thead><tbody>${perms.map((p) => `<tr><th scope="row" class="u-sm" style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text)">${p}</th>${roles.map((r) => `<td><label class="check"><input type="checkbox" data-role="${r}" data-perm="${p}" ${matrix[r]?.includes(p) ? 'checked' : ''} ${r === 'Owner' ? 'disabled' : ''} aria-label="${r}: ${p}"></label></td>`).join('')}</tr>`).join('')}</tbody>`;
    $('#save-roles').addEventListener('click', () => { const m = Object.fromEntries(roles.map((r) => [r, $$(`[data-role="${r}"]:checked`).map((c) => c.dataset.perm)])); Store.set('admin-roles', m); toast({ type: 'success', title: 'Permissions saved' }); });
    document.addEventListener('click', (e) => { if (e.target.closest('[data-invite]')) toast({ type: 'success', title: 'Invitation sent', message: 'A secure link has been emailed.' }); if (e.target.closest('[data-toast-edit]')) toast({ type: 'info', title: 'Role editor', message: 'Adjust permissions in the matrix below.' }); });
  },

  'admin-login'() {
    $('#admin-login-form').addEventListener('submit', (e) => { e.preventDefault(); if (!e.target.checkValidity()) return; toast({ type: 'success', title: 'Welcome back, Charlotte' }); setTimeout(() => (location.href = 'index.html'), 700); });
  },
};

/* ---- Drag-to-reorder rows (HTML5 DnD + keyboard) ---------------------- */
function reorderPage(kind, initial) {
  let rows = Store.get(`admin-${kind}`, initial);
  const body = $('#reorder-body');
  const render = () => { body.innerHTML = rows.map((r, i) => `<tr draggable="true" data-i="${i}"><td><button class="icon-btn icon-btn--sm drag-handle" type="button" aria-label="Reorder ${escapeHTML(r.name)}. Use up and down arrow keys." data-handle>${icon('grip', { cls: 'icon--sm' })}</button></td><td class="table__name">${escapeHTML(r.name)}</td><td class="mono u-xs">${r.slug}</td><td class="num">${r.count}</td><td><span class="status status--${r.visible ? 'green' : 'ink'}">${r.visible ? 'Visible' : 'Hidden'}</span></td><td><div class="table__actions">${iconBtn('edit', `Edit ${escapeHTML(r.name)}`, `data-edit="${i}"`)}${iconBtn('trash', `Delete ${escapeHTML(r.name)}`, `data-del="${i}"`)}</div></td></tr>`).join(''); };
  const save = () => { Store.set(`admin-${kind}`, rows); render(); };
  render();
  let from = null;
  body.addEventListener('dragstart', (e) => { const tr = e.target.closest('tr'); from = Number(tr.dataset.i); tr.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(from)); });
  body.addEventListener('dragover', (e) => { e.preventDefault(); $$('tr', body).forEach((t) => t.classList.remove('is-drop-target')); e.target.closest('tr')?.classList.add('is-drop-target'); });
  body.addEventListener('dragend', () => $$('tr', body).forEach((t) => t.classList.remove('is-dragging', 'is-drop-target')));
  body.addEventListener('drop', (e) => { e.preventDefault(); const to = Number(e.target.closest('tr')?.dataset.i); if (from == null || Number.isNaN(to) || from === to) return; const [m] = rows.splice(from, 1); rows.splice(to, 0, m); save(); toast({ type: 'success', title: 'Order saved', message: `${m.name} moved to position ${to + 1}.` }); });
  body.addEventListener('keydown', (e) => { const h = e.target.closest('[data-handle]'); if (!h || !['ArrowUp', 'ArrowDown'].includes(e.key)) return; e.preventDefault(); const i = Number(h.closest('tr').dataset.i); const j = i + (e.key === 'ArrowUp' ? -1 : 1); if (j < 0 || j >= rows.length) return; [rows[i], rows[j]] = [rows[j], rows[i]]; save(); $$('[data-handle]', body)[j].focus(); });
  let editing = -1; const f = $('#row-form');
  document.querySelector('[data-add-row]').addEventListener('click', (e) => { editing = -1; f.reset(); openModal('row-modal', e.currentTarget); });
  body.addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]'); const del = e.target.closest('[data-del]');
    if (ed) { editing = Number(ed.dataset.edit); const r = rows[editing]; f.elements.name.value = r.name; f.elements.slug.value = r.slug; f.elements.visible.checked = r.visible; openModal('row-modal', ed); }
    if (del && (await confirmDialog({ title: 'Delete this entry?', message: `${rows[del.dataset.del].name} will be removed. Products are kept.`, confirm: 'Delete', danger: true }))) { rows.splice(Number(del.dataset.del), 1); save(); toast({ type: 'success', title: 'Deleted' }); }
  });
  f.elements.name.addEventListener('input', () => { f.elements.slug.value = f.elements.name.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); });
  f.addEventListener('submit', (e) => { e.preventDefault(); const r = { name: f.elements.name.value, slug: f.elements.slug.value, visible: f.elements.visible.checked, count: editing >= 0 ? rows[editing].count : 0 }; if (editing >= 0) rows[editing] = r; else rows.push(r); save(); f.closest('dialog').close(); toast({ type: 'success', title: 'Saved', message: r.name }); });
}

/* ---- Boot --------------------------------------------------------------- */
function boot() {
  document.documentElement.classList.remove('no-js');
  hydrateIcons();
  initTheme(); initModals(); initTabs(); initValidation(); initRipple(); initShell();
  document.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a, button, input, select, label')) location.href = tr.dataset.href; });
  try { PAGES[document.body.dataset.page]?.(); } catch (err) { console.warn('[Atelier]', err); }
  initReveal();
}
boot();
