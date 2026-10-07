/**
 * accordion.js — Accessible disclosure accordion with smooth grid-rows motion.
 * Markup: .accordion > .accordion__item > button.accordion__trigger + .accordion__panel
 */
export function initAccordions(root = document) {
  root.querySelectorAll('.accordion:not([data-ready])').forEach((acc, ai) => {
    acc.dataset.ready = '';
    const single = acc.hasAttribute('data-single');
    acc.querySelectorAll('.accordion__item').forEach((item, i) => {
      const btn = item.querySelector('.accordion__trigger');
      const panel = item.querySelector('.accordion__panel');
      const id = panel.id || `acc-${ai}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      panel.id = id;
      btn.setAttribute('aria-controls', id);
      const open = item.hasAttribute('data-open');
      btn.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('is-open', open);
      panel.setAttribute('role', 'region');
      if (btn.id) panel.setAttribute('aria-labelledby', btn.id);
    });
    acc.addEventListener('click', (e) => {
      const btn = e.target.closest('.accordion__trigger');
      if (!btn || !acc.contains(btn)) return;
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      if (single) acc.querySelectorAll('.accordion__trigger[aria-expanded="true"]').forEach((b) => { if (b !== btn) toggle(b, false); });
      toggle(btn, !expanded);
    });
  });
}
function toggle(btn, open) {
  btn.setAttribute('aria-expanded', String(open));
  document.getElementById(btn.getAttribute('aria-controls'))?.classList.toggle('is-open', open);
}
