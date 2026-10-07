/**
 * tabs.js — WAI-ARIA tabs with roving tabindex, arrow keys and a sliding
 * gold indicator. Markup: [data-tabs] > [role=tablist] > [role=tab] + [role=tabpanel]
 */
export function initTabs(root = document) {
  root.querySelectorAll('[data-tabs]:not([data-ready])').forEach((wrap) => {
    const list = wrap.querySelector('[role="tablist"]');
    if (!list) return;
    wrap.dataset.ready = '';
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const indicator = list.querySelector('.tabs__indicator') ?? list.appendChild(Object.assign(document.createElement('span'), { className: 'tabs__indicator' }));
    const moveIndicator = (tab) => { indicator.style.insetInlineStart = `${tab.offsetLeft}px`; indicator.style.inlineSize = `${tab.offsetWidth}px`; };
    const select = (tab, focus = true) => {
      tabs.forEach((t) => { const on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
      // Several tabs may share one panel (filter tabs); a panel shows if its selected tab controls it.
      new Set(tabs.map((t) => t.getAttribute('aria-controls'))).forEach((pid) => {
        const panel = document.getElementById(pid);
        if (panel) { panel.hidden = tab.getAttribute('aria-controls') !== pid; if (!panel.hidden) panel.setAttribute('aria-labelledby', tab.id); }
      });
      moveIndicator(tab);
      if (focus) tab.focus();
      wrap.dispatchEvent(new CustomEvent('tabs:change', { detail: { id: tab.id, value: tab.dataset.value }, bubbles: true }));
    };
    tabs.forEach((t) => t.addEventListener('click', () => select(t, false)));
    list.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const vertical = list.getAttribute('aria-orientation') === 'vertical';
      const nextKey = vertical ? 'ArrowDown' : 'ArrowRight'; const prevKey = vertical ? 'ArrowUp' : 'ArrowLeft';
      let n = null;
      if (e.key === nextKey) n = tabs[(i + 1) % tabs.length];
      if (e.key === prevKey) n = tabs.at(i - 1);
      if (e.key === 'Home') n = tabs[0];
      if (e.key === 'End') n = tabs.at(-1);
      if (n) { e.preventDefault(); select(n); }
    });
    const initial = tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0];
    select(initial, false);
    new ResizeObserver(() => moveIndicator(tabs.find((t) => t.getAttribute('aria-selected') === 'true'))).observe(list);
    wrap.selectTab = (value) => { const t = tabs.find((x) => x.dataset.value === value || x.id === value); if (t) select(t, false); };
  });
}
