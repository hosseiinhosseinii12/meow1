/**
 * animations.js — Scroll reveal, counters, ripples, cursor dot, fly-to-cart,
 * header state, blur-up images and the <mv-countdown> custom element.
 * Everything checks prefers-reduced-motion before moving.
 */
import { reducedMotion } from './state.js';

/* ---- Scroll reveal --------------------------------------------------- */
let revealIO;
export function initReveal(root = document) {
  const els = root.querySelectorAll('.reveal:not(.is-visible)');
  if (reducedMotion() || !('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-visible')); return; }
  revealIO ??= new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-visible'); revealIO.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  // Stagger siblings inside [data-stagger] groups.
  root.querySelectorAll('[data-stagger]').forEach((g) => [...g.children].forEach((c, i) => c.style.setProperty('--i', i % 8)));
  els.forEach((el) => revealIO.observe(el));
}

/* ---- Animated counters ---------------------------------------------- */
export function animateCount(el) {
  const target = parseFloat(el.dataset.count);
  const decimals = Number(el.dataset.decimals ?? 0);
  const prefix = el.dataset.prefix ?? ''; const suffix = el.dataset.suffix ?? '';
  const format = (v) => prefix + v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
  if (reducedMotion()) { el.textContent = format(target); return; }
  const start = performance.now(); const dur = Number(el.dataset.duration ?? 1800);
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 4);
    el.textContent = format(target * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
export function initCounters(root = document) {
  const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { animateCount(en.target); io.unobserve(en.target); } }), { threshold: 0.4 });
  root.querySelectorAll('[data-count]').forEach((el) => io.observe(el));
}

/* ---- Button ripple ---------------------------------------------------- */
export function initRipple() {
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn || reducedMotion()) return;
    const r = btn.getBoundingClientRect();
    const s = Math.max(r.width, r.height);
    const dot = Object.assign(document.createElement('span'), { className: 'ripple' });
    Object.assign(dot.style, { width: `${s}px`, height: `${s}px`, left: `${e.clientX - r.left - s / 2}px`, top: `${e.clientY - r.top - s / 2}px` });
    btn.append(dot);
    setTimeout(() => dot.remove(), 650);
  });
}

/* ---- Cursor dot on interactive areas --------------------------------- */
export function initCursor() {
  if (reducedMotion() || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const dot = Object.assign(document.createElement('div'), { className: 'cursor-dot' });
  dot.setAttribute('aria-hidden', 'true');
  document.body.append(dot);
  let x = 0, y = 0, cx = 0, cy = 0;
  addEventListener('pointermove', (e) => {
    x = e.clientX; y = e.clientY;
    const hot = e.target.closest?.('a, button, [role="tab"], label, summary, .swatch, .size-pill');
    dot.classList.toggle('is-active', Boolean(hot));
    dot.classList.toggle('is-hover', Boolean(hot?.matches('.btn, .product-card__add')));
  }, { passive: true });
  const loop = () => { cx += (x - cx) * 0.28; cy += (y - cy) * 0.28; dot.style.transform = `translate(${cx}px, ${cy}px)`; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

/* ---- Fly-to-cart clone along a curved path --------------------------- */
export function flyToCart(sourceImg) {
  const target = document.querySelector('[data-cart-target]');
  if (!sourceImg || !target || reducedMotion()) return;
  const a = sourceImg.getBoundingClientRect(); const b = target.getBoundingClientRect();
  const clone = Object.assign(document.createElement('img'), { src: sourceImg.currentSrc || sourceImg.src, alt: '', className: 'fly-clone' });
  document.body.append(clone);
  const sx = a.left + a.width / 2 - 28, sy = a.top + a.height / 2 - 28;
  const ex = b.left + b.width / 2 - 28, ey = b.top + b.height / 2 - 28;
  const mx = (sx + ex) / 2, my = Math.min(sy, ey) - 160;
  const frames = Array.from({ length: 24 }, (_, i) => {
    const t = i / 23; const u = 1 - t;
    const px = u * u * sx + 2 * u * t * mx + t * t * ex;
    const py = u * u * sy + 2 * u * t * my + t * t * ey;
    return { transform: `translate(${px}px, ${py}px) scale(${1 - t * 0.7})`, opacity: t > 0.9 ? 0 : 1 };
  });
  clone.animate(frames, { duration: 900, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' }).finished.then(() => clone.remove());
}

/* ---- Heart pulse ------------------------------------------------------ */
export function pulse(el) {
  if (!el) return;
  el.classList.remove('is-pulsing'); void el.offsetWidth; el.classList.add('is-pulsing');
}

/* ---- Header: transparent over hero, solid after ---------------------- */
export function initHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const hero = document.querySelector('.hero');
  const announce = document.querySelector('.announce');
  const update = () => {
    const y = scrollY;
    const offset = announce && !announce.hidden ? Math.max(0, announce.offsetHeight - y) : 0;
    document.documentElement.style.setProperty('--_announce-offset', `${offset}px`);
    header.classList.toggle('is-solid', !hero || y > 40);
  };
  let ticking = false;
  addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(() => { update(); ticking = false; }); ticking = true; } }, { passive: true });
  update();
}

/* ---- Blur-up images --------------------------------------------------- */
export function initBlurUp(root = document) {
  root.querySelectorAll('img.blur-up:not(.is-loaded)').forEach((im) => {
    if (im.complete && im.naturalWidth) im.classList.add('is-loaded');
    else im.addEventListener('load', () => im.classList.add('is-loaded'), { once: true });
  });
}

/* ---- <mv-countdown to="ISO"> custom element --------------------------- */
class MvCountdown extends HTMLElement {
  #timer = null;
  static observedAttributes = ['to'];
  connectedCallback() { this.#render(); this.#timer = setInterval(() => this.#tick(), 1000); this.#tick(); }
  disconnectedCallback() { clearInterval(this.#timer); }
  #render() {
    const unit = (k, l) => `<div class="countdown__box"><span class="countdown__num" data-u="${k}">00</span><span class="countdown__label">${l}</span></div>`;
    this.innerHTML = `<div class="countdown" role="timer" aria-live="off">${unit('d', 'Days')}${unit('h', 'Hours')}${unit('m', 'Minutes')}${unit('s', 'Seconds')}</div>`;
  }
  #tick() {
    const end = new Date(this.getAttribute('to') ?? Date.now() + 864e5).getTime();
    const diff = Math.max(0, end - Date.now());
    const parts = { d: Math.floor(diff / 864e5), h: Math.floor(diff / 36e5) % 24, m: Math.floor(diff / 6e4) % 60, s: Math.floor(diff / 1e3) % 60 };
    Object.entries(parts).forEach(([k, v]) => {
      const el = this.querySelector(`[data-u="${k}"]`);
      const txt = String(v).padStart(2, '0');
      if (el && el.textContent !== txt) { el.textContent = txt; if (k === 's' && !reducedMotion()) { el.classList.remove('num-tick'); void el.offsetWidth; el.classList.add('num-tick'); } }
    });
    this.setAttribute('aria-label', `${parts.d} days, ${parts.h} hours, ${parts.m} minutes remaining`);
  }
}
if (!customElements.get('mv-countdown')) customElements.define('mv-countdown', MvCountdown);
