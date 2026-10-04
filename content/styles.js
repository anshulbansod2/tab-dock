// @ts-check
// Bar stylesheet, applied inside the Shadow Root as a constructable stylesheet (exempt from
// page CSP and isolated from page CSS).
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));

  ns.styles = `
:host {
  all: initial;
  /* Spans the bottom edge, as a top-layer popover or (fallback) a fixed element; reset the
     UA popover box so only the bar and pill take clicks. */
  position: fixed; inset: auto 0 0 0; z-index: 2147483647; display: block;
  width: auto; height: auto; margin: 0; padding: 0; border: 0; overflow: visible;
  background: transparent; color: initial; pointer-events: none;
}
/* Tokens stay unregistered so each light-dark() resolves where it is used, against that
   element's color-scheme. :host's all: initial keeps the page's color-scheme out. */
.hh-root {
  font: 12px/1.2 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --hh-bg: light-dark(#ffffff, #202124); --hh-fg: light-dark(#202124, #e8eaed);
  --hh-muted: light-dark(#5f6368, #9aa0a6); --hh-border: light-dark(#dadce0, #3c4043);
  --hh-chip: light-dark(#f1f3f4, #2d2e30); --hh-chip-hover: light-dark(#e8eaed, #3c4043);
  --hh-active: light-dark(#d3e3fd, #394457); --hh-focus: light-dark(#0b57d0, #a8c7fa);
}
/* color-scheme goes on the painted surfaces (they have a background), and color is set there
   too: an inherited light-dark() colour would arrive already resolved. */
.hh-bar {
  color-scheme: light dark; color: var(--hh-fg);
  pointer-events: auto; box-sizing: border-box; display: flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 8px; background: var(--hh-bg);
  border-top: 1px solid var(--hh-border); box-shadow: 0 -1px 4px rgb(0 0 0 / 0.08);
}
.hh-label {
  display: flex; align-items: center; gap: 6px; flex: none; max-width: 160px;
  padding: 2px 8px; border-radius: 10px; font-weight: 600; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
  background: color-mix(in srgb, var(--hh-group) 18%, transparent);
}
.hh-dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--hh-group); }
.hh-tabs { flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: thin; }
.hh-list {
  display: flex; gap: 4px; width: max-content; margin: 0; padding: 0; list-style: none;
}
.hh-chip {
  display: flex; align-items: center; flex: none; height: 24px;
  border-radius: 6px; background: var(--hh-chip);
}
.hh-chip:hover { background: var(--hh-chip-hover); }
.hh-chip:has(> [aria-current='page']) { background: var(--hh-active); }
.hh-tab {
  all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 6px;
  min-width: 0; height: 100%; padding: 0 4px 0 8px; border-radius: 6px; cursor: pointer;
}
.hh-title { max-width: 24ch; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.hh-favicon { width: 16px; height: 16px; flex: none; border-radius: 3px; }
.hh-favicon--placeholder { background: var(--hh-muted); opacity: 0.4; }
.hh-btn {
  all: unset; display: inline-grid; place-items: center; width: 20px; height: 20px;
  border-radius: 4px; cursor: pointer; color: var(--hh-muted); font-size: 14px; line-height: 1;
}
.hh-btn:hover { background: var(--hh-chip-hover); color: var(--hh-fg); }
.hh-close { visibility: hidden; margin-right: 2px; }
.hh-chip:hover .hh-close, .hh-chip:focus-within .hh-close,
.hh-chip:has(> [aria-current='page']) .hh-close {
  visibility: visible;
}
.hh-pill {
  all: unset; color-scheme: light dark; pointer-events: auto;
  position: fixed; right: 12px; bottom: 12px; display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
  background: var(--hh-bg); color: var(--hh-fg); border: 1px solid var(--hh-border);
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.2); cursor: pointer; font-weight: 600;
}
.hh-tab:focus-visible, .hh-btn:focus-visible, .hh-pill:focus-visible {
  outline: 2px solid var(--hh-focus); outline-offset: 1px;
}
/* On the host, which lives for the whole page: animates the first appearance only, never the
   re-render that each snapshot triggers. */
@media (prefers-reduced-motion: no-preference) {
  :host { animation: hh-in 120ms ease-out; }
}
@keyframes hh-in { from { transform: translateY(100%); } }
`;
})();
