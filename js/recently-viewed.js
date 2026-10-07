/**
 * recently-viewed.js — Automatically tracks product views (newest first, max 12).
 */
import { Store } from './state.js';
import { findProduct } from './data.js';

const KEY = 'recent';
export function trackView(id) { Store.update(KEY, (list) => [id, ...list.filter((x) => x !== id)].slice(0, 12), []); }
export function recentProducts(exclude) { return Store.get(KEY, []).filter((id) => id !== exclude).map(findProduct).filter(Boolean); }
export function clearRecent() { Store.set(KEY, []); }
