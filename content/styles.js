// @ts-check
// Bar stylesheet, applied inside the Shadow Root as a constructable stylesheet (exempt from
// page CSP and isolated from page CSS). A floating glass dock whose one accent is the Chrome
// tab group's own colour.
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));

  ns.styles = `
:host {
  all: initial;
  /* Spans the bottom edge, as a top-layer popover or (fallback) a fixed element; reset the
     UA popover box so only the dock and pill take clicks. */
  position: fixed; inset: auto 0 0 0; z-index: 2147483647; display: block;
  width: auto; height: auto; margin: 0; padding: 0; border: 0; overflow: visible;
  background: transparent; color: initial; pointer-events: none;
}
/* Tokens stay unregistered so each light-dark() resolves where it is used, against that
   element's color-scheme. :host's all: initial keeps the page's color-scheme out. */
.hh-root {
  display: flex; justify-content: center; padding: 0 12px 12px;
  font: 12.5px/1.2 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --hh-glass: light-dark(rgb(255 255 255 / 0.74), rgb(30 31 34 / 0.72));
  --hh-solid: light-dark(#ffffff, #1e1f22);
  --hh-fg: light-dark(#1f1f1f, #e3e3e3); --hh-muted: light-dark(#5f6368, #9aa0a6);
  --hh-edge: light-dark(rgb(0 0 0 / 0.08), rgb(255 255 255 / 0.1));
  --hh-highlight: light-dark(rgb(255 255 255 / 0.9), rgb(255 255 255 / 0.06));
  --hh-chip: light-dark(rgb(0 0 0 / 0.04), rgb(255 255 255 / 0.06));
  --hh-chip-hover: light-dark(rgb(0 0 0 / 0.08), rgb(255 255 255 / 0.11));
  --hh-current: light-dark(#ffffff, rgb(255 255 255 / 0.16));
  --hh-focus: light-dark(#0b57d0, #a8c7fa);
}
/* color-scheme goes on the painted surfaces (they have a background), and color is set there
   too: an inherited light-dark() colour would arrive already resolved. */
.hh-bar {
  color-scheme: light dark; color: var(--hh-fg); background: var(--hh-glass);
  pointer-events: auto; position: relative; box-sizing: border-box;
  display: flex; align-items: center; gap: 6px; min-width: 0; max-width: min(960px, 100%);
  height: 44px; padding: 6px 6px 6px 12px; border-radius: 16px;
  border: 1px solid var(--hh-edge);
  backdrop-filter: blur(20px) saturate(1.8);
  box-shadow: inset 0 1px 0 var(--hh-highlight), 0 2px 6px -2px rgb(0 0 0 / 0.12),
    0 12px 32px -12px rgb(0 0 0 / 0.35);
}
/* The group colour, glowing along the dock's lower edge. */
.hh-bar::after {
  content: ''; position: absolute; inset: auto 28px -1px; height: 2px; border-radius: 2px;
  background: linear-gradient(90deg, transparent, var(--hh-group), transparent);
  box-shadow: 0 0 12px 1px color-mix(in srgb, var(--hh-group) 55%, transparent);
  pointer-events: none;
}
.hh-label {
  display: flex; align-items: center; gap: 8px; flex: none; max-width: 160px;
  padding-right: 10px; border-right: 1px solid var(--hh-edge);
  font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.hh-label > span:last-child { overflow: hidden; text-overflow: ellipsis; }
.hh-dot {
  width: 9px; height: 9px; flex: none; border-radius: 50%; background: var(--hh-group);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--hh-group) 24%, transparent);
}
/* Edges fade (a mask, not an overlay) so overflowing tabs read as scrollable. */
.hh-tabs {
  flex: 1 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: none;
  overscroll-behavior-x: contain;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 14px, #000 calc(100% - 14px), transparent);
  mask-image: linear-gradient(to right, transparent, #000 14px, #000 calc(100% - 14px), transparent);
}
.hh-list {
  display: flex; gap: 4px; width: max-content; margin: 0; padding: 0 14px; list-style: none;
}
.hh-chip {
  position: relative; display: flex; align-items: center; flex: none; height: 32px;
  border-radius: 10px; background: var(--hh-chip); transition: background-color 120ms;
}
.hh-chip:hover { background: var(--hh-chip-hover); }
.hh-chip:has(> [aria-current='page']) {
  background: var(--hh-current);
  box-shadow: inset 0 0 0 1px var(--hh-edge), 0 1px 2px rgb(0 0 0 / 0.1);
}
/* The current tab carries the group colour as a short indicator bar. */
.hh-chip:has(> [aria-current='page'])::after {
  content: ''; position: absolute; inset: auto 12px 3px; height: 2px; border-radius: 2px;
  background: var(--hh-group); pointer-events: none;
}
.hh-tab {
  all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px;
  min-width: 0; height: 100%; padding: 0 4px 0 10px; border-radius: 10px; cursor: pointer;
}
.hh-tab[aria-current='page'] { font-weight: 500; }
.hh-title { max-width: 24ch; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.hh-favicon { width: 16px; height: 16px; flex: none; border-radius: 4px; }
.hh-favicon--placeholder { background: var(--hh-muted); opacity: 0.35; }
.hh-btn {
  all: unset; display: inline-grid; place-items: center; flex: none;
  width: 30px; height: 30px; border-radius: 999px; cursor: pointer;
  color: var(--hh-muted); font-size: 17px; line-height: 1; transition: background-color 120ms;
}
.hh-btn:hover { background: var(--hh-chip-hover); color: var(--hh-fg); }
.hh-icon {
  width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6;
  stroke-linecap: round; stroke-linejoin: round;
}
.hh-close .hh-icon { width: 13px; height: 13px; stroke-width: 1.8; }
.hh-close {
  width: 20px; height: 20px; margin-right: 6px; font-size: 14px; visibility: hidden;
}
.hh-chip:hover .hh-close, .hh-chip:focus-within .hh-close,
.hh-chip:has(> [aria-current='page']) .hh-close {
  visibility: visible;
}
.hh-pill {
  all: unset; color-scheme: light dark; color: var(--hh-fg); background: var(--hh-glass);
  pointer-events: auto; box-sizing: border-box; display: flex; align-items: center; gap: 8px;
  height: 32px; padding: 0 14px 0 12px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--hh-edge); backdrop-filter: blur(20px) saturate(1.8);
  box-shadow: inset 0 1px 0 var(--hh-highlight), 0 8px 24px -10px rgb(0 0 0 / 0.35);
  font-weight: 600; font-variant-numeric: tabular-nums;
}
.hh-tab:focus-visible, .hh-btn:focus-visible, .hh-pill:focus-visible {
  outline: 2px solid var(--hh-focus); outline-offset: 1px;
}
/* Solid surface where blur is unavailable or the user asks for less transparency. */
@supports not (backdrop-filter: blur(1px)) {
  .hh-bar, .hh-pill { background: var(--hh-solid); }
}
@media (prefers-reduced-transparency: reduce) {
  .hh-bar, .hh-pill { background: var(--hh-solid); backdrop-filter: none; }
}
/* Narrow windows: keep the colour dot, drop the group name. */
@media (max-width: 520px) {
  .hh-label { padding-right: 6px; }
  .hh-label > span:last-child { display: none; }
}
/* On the host, which lives for the whole page: animates the first appearance only, never the
   re-render that each snapshot triggers. */
@media (prefers-reduced-motion: no-preference) {
  :host { animation: hh-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1); }
}
@keyframes hh-in { from { transform: translateY(16px); opacity: 0; } }
`;
})();
