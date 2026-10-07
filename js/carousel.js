/**
 * carousel.js — Scroll-snap carousel with drag, arrows, line dots, touch,
 * optional autoplay and loop. Markup: [data-carousel] > .carousel__track.
 */
import { icon } from './icons.js';
import { reducedMotion } from './state.js';

export class Carousel {
  #root; #track; #prev; #next; #dots; #timer = null; #drag = null;
  static instances = new WeakMap();

  constructor(root) {
    this.#root = root;
    this.#track = root.querySelector('.carousel__track');
    if (!this.#track) return;
    this.loop = root.hasAttribute('data-loop');
    this.autoplay = Number(root.dataset.autoplay ?? 0);
    this.#build();
    this.#bind();
    Carousel.instances.set(root, this);
  }

  get pages() { const t = this.#track; return Math.max(1, Math.ceil((t.scrollWidth - 4) / t.clientWidth)); }
  get page() { const t = this.#track; return Math.round(t.scrollLeft / t.clientWidth); }

  #build() {
    this.#track.setAttribute('tabindex', '0');
    this.#track.setAttribute('role', 'region');
    this.#track.setAttribute('aria-roledescription', 'carousel');
    this.#prev = Object.assign(document.createElement('button'), { className: 'carousel__arrow carousel__arrow--prev', type: 'button', innerHTML: icon('arrow-left') });
    this.#next = Object.assign(document.createElement('button'), { className: 'carousel__arrow carousel__arrow--next', type: 'button', innerHTML: icon('arrow-right') });
    this.#prev.setAttribute('aria-label', 'Previous items'); this.#next.setAttribute('aria-label', 'Next items');
    this.#root.append(this.#prev, this.#next);
    this.#dots = this.#root.querySelector('.carousel__dots') ?? Object.assign(document.createElement('div'), { className: 'carousel__dots' });
    this.#root.append(this.#dots);
    this.refresh();
  }

  refresh() {
    this.#dots.innerHTML = Array.from({ length: this.pages }, (_, i) => `<button class="carousel__dot" type="button" aria-label="Go to page ${i + 1}" data-i="${i}"></button>`).join('');
    this.#dots.hidden = this.pages < 2;
    this.#sync();
  }

  go(i) {
    const n = this.pages;
    const idx = this.loop ? (i + n) % n : Math.max(0, Math.min(n - 1, i));
    this.#track.scrollTo({ left: idx * this.#track.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  #sync() {
    const p = this.page;
    this.#dots.querySelectorAll('.carousel__dot').forEach((d, i) => d.setAttribute('aria-current', String(i === p)));
    if (!this.loop) {
      this.#prev.disabled = this.#track.scrollLeft <= 4;
      this.#next.disabled = this.#track.scrollLeft + this.#track.clientWidth >= this.#track.scrollWidth - 4;
    }
  }

  #bind() {
    const t = this.#track;
    this.#prev.addEventListener('click', () => this.go(this.page - 1));
    this.#next.addEventListener('click', () => this.go(this.page + 1));
    this.#dots.addEventListener('click', (e) => { const d = e.target.closest('[data-i]'); if (d) this.go(Number(d.dataset.i)); });
    t.addEventListener('scroll', () => requestAnimationFrame(() => this.#sync()), { passive: true });
    t.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); this.go(this.page + 1); } if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(this.page - 1); } });
    // Mouse drag (touch uses native momentum scrolling).
    t.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      this.#drag = { x: e.clientX, left: t.scrollLeft, moved: false };
    });
    addEventListener('pointermove', (e) => {
      if (!this.#drag) return;
      const dx = e.clientX - this.#drag.x;
      if (Math.abs(dx) > 5) { this.#drag.moved = true; t.classList.add('is-dragging'); }
      t.scrollLeft = this.#drag.left - dx;
    });
    addEventListener('pointerup', () => {
      if (!this.#drag) return;
      const moved = this.#drag.moved; this.#drag = null;
      t.classList.remove('is-dragging');
      if (moved) { const snap = Math.round(t.scrollLeft / (t.firstElementChild?.getBoundingClientRect().width || 1)); t.firstElementChild && t.scrollTo({ left: snap * (t.firstElementChild.getBoundingClientRect().width + parseFloat(getComputedStyle(t).columnGap || 0)), behavior: 'smooth' }); }
    });
    t.addEventListener('click', (e) => { if (t.classList.contains('is-dragging')) e.preventDefault(); }, true);
    new ResizeObserver(() => this.refresh()).observe(t);
    new MutationObserver(() => this.refresh()).observe(t, { childList: true });
    if (this.autoplay && !reducedMotion()) {
      const start = () => { this.stop(); this.#timer = setInterval(() => this.go(this.page + 1 >= this.pages ? 0 : this.page + 1), this.autoplay); };
      this.stop = () => clearInterval(this.#timer);
      this.#root.addEventListener('pointerenter', () => this.stop());
      this.#root.addEventListener('pointerleave', start);
      this.#root.addEventListener('focusin', () => this.stop());
      start();
    }
  }
  stop() {}
}

export function initCarousels(root = document) {
  root.querySelectorAll('[data-carousel]').forEach((el) => Carousel.instances.has(el) || new Carousel(el));
}
