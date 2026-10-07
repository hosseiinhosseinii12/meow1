/**
 * state.js — Namespaced, versioned persistence plus locale formatting.
 * Keys look like "mv:v1:cart". Changes broadcast a `mv:state` CustomEvent and
 * sync across tabs through the native storage event.
 */
const NS = 'mv';
const VERSION = 'v1';
const key = (k) => `${NS}:${VERSION}:${k}`;

export class Store {
  static #memory = new Map();
  static #available = (() => { try { localStorage.setItem('__mv', '1'); localStorage.removeItem('__mv'); return true; } catch { return false; } })();

  static {
    // Purge keys left by older schema versions so stale shapes never load.
    if (Store.#available) {
      Object.keys(localStorage).filter((k) => k.startsWith(`${NS}:`) && !k.startsWith(`${NS}:${VERSION}:`)).forEach((k) => localStorage.removeItem(k));
      window.addEventListener('storage', (e) => {
        if (!e.key?.startsWith(`${NS}:${VERSION}:`)) return;
        const name = e.key.split(':').at(-1);
        window.dispatchEvent(new CustomEvent('mv:state', { detail: { key: name, value: Store.get(name) } }));
      });
    }
  }

  static get(k, fallback = null) {
    try {
      const raw = Store.#available ? localStorage.getItem(key(k)) : Store.#memory.get(k);
      return raw == null ? structuredClone(fallback) : JSON.parse(raw);
    } catch { return structuredClone(fallback); }
  }

  static set(k, value) {
    const raw = JSON.stringify(value);
    if (Store.#available) localStorage.setItem(key(k), raw); else Store.#memory.set(k, raw);
    window.dispatchEvent(new CustomEvent('mv:state', { detail: { key: k, value } }));
    return value;
  }

  static update(k, fn, fallback) { return Store.set(k, fn(Store.get(k, fallback))); }
  static remove(k) { Store.#available ? localStorage.removeItem(key(k)) : Store.#memory.delete(k); }
  static on(k, cb) {
    const handler = (e) => { if (e.detail.key === k) cb(e.detail.value); };
    window.addEventListener('mv:state', handler);
    return () => window.removeEventListener('mv:state', handler);
  }
}

/* ---- Formatting ------------------------------------------------------ */
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const currency2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const dateLong = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const dateShort = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const dateWeekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export const fmt = {
  money: (n, cents = false) => (cents ? currency2 : currency).format(n ?? 0),
  date: (d) => dateLong.format(new Date(d)),
  short: (d) => dateShort.format(new Date(d)),
  weekday: (d) => dateWeekday.format(new Date(d)),
  compact: (n) => compact.format(n),
  number: (n) => new Intl.NumberFormat('en-US').format(n),
};

/** Business-day arithmetic for delivery estimates. */
export function addBusinessDays(from, days) {
  const d = new Date(from);
  let added = 0;
  while (added < days) { d.setDate(d.getDate() + 1); if (d.getDay() % 6 !== 0) added += 1; }
  return d;
}

/** Tiny helpers used everywhere. */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const escapeHTML = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Resolve a path relative to the site root, whether we're in /admin or not. */
export const ROOT = document.documentElement.dataset.root ?? '';
