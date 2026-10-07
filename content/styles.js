// @ts-check
// Bar stylesheet, applied inside the Shadow Root as a constructable stylesheet (exempt from
// page CSP and isolated from page CSS). A floating glass dock whose one accent is the Chrome
// tab group's own colour.
(() => {
  const ns = (globalThis.TabDock ??= /** @type {TabDockNamespace} */ ({}));

  ns.styles = `
/* Tokens stay unregistered so each light-dark() resolves where it is used, against that
   element's color-scheme. The host's inline all: initial (bar.js) keeps the page's out. */
.hh-root { display: flex; justify-content: center; padding: 0 12px 12px; }
.hh-root, .hh-layer {
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
  display: flex; align-items: center; gap: 6px; min-width: 0;
  max-width: min(960px, calc(100vw - 24px)); user-select: none;
  height: 44px; padding: 6px 6px 6px 12px; border-radius: 16px;
  border: 1px solid var(--hh-edge);
  backdrop-filter: blur(20px) saturate(1.8);
  box-shadow: inset 0 1px 0 var(--hh-highlight), 0 2px 6px -2px rgb(0 0 0 / 0.12),
    0 12px 32px -12px rgb(0 0 0 / 0.35);
}
/* Dragged somewhere: the host is placed exactly at the dock, so no default-spot padding. */
:host([data-placed]) .hh-root { padding: 0; }
/* The group colour, glowing along the dock's lower edge. */
.hh-bar::after {
  content: ''; position: absolute; inset: auto 28px -1px; height: 2px; border-radius: 2px;
  background: linear-gradient(90deg, transparent, var(--hh-group), transparent);
  box-shadow: 0 0 12px 1px color-mix(in srgb, var(--hh-group) 55%, transparent);
  pointer-events: none;
}
.hh-label {
  all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px;
  flex: none; max-width: 170px; height: 30px; padding: 0 12px 0 8px; margin-right: 2px;
  border-radius: 10px; cursor: grab; font-weight: 600; white-space: nowrap;
  touch-action: none; transition: background-color 120ms;
}
.hh-label:active, .hh-pill:active { cursor: grabbing; }
.hh-label:hover { background: var(--hh-chip-hover); }
.hh-label-text { overflow: hidden; text-overflow: ellipsis; }
.hh-label + .hh-tabs { border-left: 1px solid var(--hh-edge); }
.hh-dot {
  width: 9px; height: 9px; flex: none; border-radius: 50%; background: var(--hh-group);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--hh-group) 24%, transparent);
}
/* Group switcher: a swatch per group, always laid out (nothing slides under the pointer),
   quiet until the pointer is on the dock. */
.hh-groups { display: flex; align-items: center; flex: none; height: 30px; margin-right: 2px; }
.hh-swatch {
  all: unset; box-sizing: border-box; display: grid; place-items: center; flex: none;
  width: 18px; height: 30px; border-radius: 8px; cursor: pointer;
}
.hh-swatch::before {
  content: ''; box-sizing: border-box; width: 10px; height: 10px; border-radius: 50%;
  background: var(--hh-swatch); opacity: 0.45;
  transition: transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 140ms;
}
.hh-bar:hover .hh-swatch::before, .hh-groups:focus-within .hh-swatch::before { opacity: 0.8; }
.hh-swatch:hover::before, .hh-swatch[data-shown]::before { opacity: 1; transform: scale(1.3); }
.hh-swatch[aria-current='true']::before {
  box-shadow: 0 0 0 2px var(--hh-solid), 0 0 0 3.5px var(--hh-swatch);
}
.hh-swatch[data-ungrouped]::before { background: transparent; border: 2px dashed var(--hh-muted); }
/* Inset: swatches sit edge to edge, so an outset ring would cover the neighbours. */
.hh-swatch:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: -2px; }
.hh-back {
  all: unset; flex: none; height: 24px; padding: 0 8px; border-radius: 7px; cursor: pointer;
  color: var(--hh-muted); font-weight: 500; transition: background-color 120ms;
}
.hh-back:hover { background: var(--hh-chip-hover); color: var(--hh-fg); }
.hh-back:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 1px; }
/* Browsing: the browsed group's last-used tab (a swatch click's target) has a faint underline. */
.hh-chip[data-last]::after {
  content: ''; position: absolute; inset: auto 12px 3px; height: 2px; border-radius: 2px;
  background: color-mix(in srgb, var(--hh-group) 70%, transparent); pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .hh-swatch::before { transition: none; }
}
/* Edges fade (a mask, not an overlay) so overflowing tabs read as scrollable. */
.hh-tabs {
  flex: 1 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: none;
  overscroll-behavior-x: contain;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 14px, #000 calc(100% - 14px), transparent);
  mask-image: linear-gradient(to right, transparent, #000 14px, #000 calc(100% - 14px), transparent);
}
/* Chips shrink to fit (down to an icon and a few letters) before the strip scrolls. */
.hh-list {
  display: flex; gap: 4px; width: 100%; box-sizing: border-box; margin: 0; padding: 0 14px;
  list-style: none;
}
.hh-chip {
  position: relative; display: flex; align-items: center; flex: 0 1 auto; min-width: 96px;
  height: 32px;
  border-radius: 10px; background: var(--hh-chip);
  transition: background-color 120ms, transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.hh-chip:hover { background: var(--hh-chip-hover); }
/* Reordering: neighbours slide aside; the dragged chip lifts and tracks the pointer exactly. */
.hh-chip--dragging {
  z-index: 1; transition: none; cursor: grabbing; background: var(--hh-current);
  box-shadow: 0 6px 18px -6px rgb(0 0 0 / 0.45), inset 0 0 0 1px var(--hh-edge);
}
/* Lifted toward a group: the chip stays put, dimmed; a copy follows the pointer. */
.hh-chip--lifted { opacity: 0.35; }
.hh-drop-ghost {
  position: fixed; pointer-events: none; transform: translate(-50%, 20px) rotate(-2deg);
  width: 160px; list-style: none; color-scheme: light dark; color: var(--hh-fg);
  background: var(--hh-solid); box-shadow: 0 12px 28px -8px rgb(0 0 0 / 0.5);
}
.hh-drop-ghost .hh-close { visibility: hidden; }
@media (prefers-reduced-motion: reduce) { .hh-chip { transition: background-color 120ms; } }
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
  flex: 1 1 auto; min-width: 0; height: 100%; padding: 0 4px 0 10px; border-radius: 10px; cursor: pointer;
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
  height: 32px; padding: 0 14px 0 12px; border-radius: 999px; cursor: grab; touch-action: none;
  border: 1px solid var(--hh-edge); backdrop-filter: blur(20px) saturate(1.8);
  box-shadow: inset 0 1px 0 var(--hh-highlight), 0 8px 24px -10px rgb(0 0 0 / 0.35);
  font-weight: 600; font-variant-numeric: tabular-nums;
}
.hh-btn:focus-visible, .hh-pill:focus-visible, .hh-label:focus-visible {
  outline: 2px solid var(--hh-focus); outline-offset: 1px;
}
/* A focused tab rings its whole chip: on the tab button alone the ring stopped short of the
   close button on the right. Inset, as the scrolling strip clips anything outside a chip.
   (.hh-tab's all: unset already drops the browser's own ring.) */
.hh-chip:has(> .hh-tab:focus-visible) { outline: 2px solid var(--hh-focus); outline-offset: -2px; }
/* Group editor: a name field over Chrome's nine colours. */
.hh-editor { width: 244px; gap: 10px; padding: 10px; }
.hh-editor-name {
  all: unset; box-sizing: border-box; height: 32px; padding: 0 10px; border-radius: 8px;
  color: var(--hh-fg); background: var(--hh-chip); border: 1px solid var(--hh-edge);
  font-weight: 500; user-select: text;
}
.hh-editor-name::placeholder { color: var(--hh-muted); font-weight: 400; }
.hh-editor-name:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: -1px; }
.hh-colors { display: flex; justify-content: space-between; padding: 4px; }
.hh-color {
  all: unset; box-sizing: border-box; width: 18px; height: 18px; border-radius: 50%;
  background: var(--hh-swatch); cursor: pointer;
}
.hh-color[aria-checked='true'] { box-shadow: 0 0 0 2px var(--hh-solid), 0 0 0 4px var(--hh-fg); }
.hh-color:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 4px; }
.hh-editor-go {
  all: unset; align-self: flex-end; height: 28px; padding: 0 12px; border-radius: 8px;
  cursor: pointer; font-weight: 600; color: var(--hh-solid); background: var(--hh-focus);
}
.hh-editor-go:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 2px; }
/* Menus and drop targets live in a layer over the whole window; only their own boxes take
   pointer events. */
.hh-layer { position: fixed; inset: 0; pointer-events: none; }
.hh-backdrop { position: fixed; inset: 0; pointer-events: auto; }
.hh-menu {
  position: fixed; pointer-events: auto; display: flex; flex-direction: column; gap: 2px;
  min-width: 190px; max-width: 280px; padding: 6px; box-sizing: border-box; border-radius: 12px;
  color-scheme: light dark; color: var(--hh-fg); background: var(--hh-glass);
  border: 1px solid var(--hh-edge); backdrop-filter: blur(20px) saturate(1.8);
  box-shadow: inset 0 1px 0 var(--hh-highlight), 0 16px 40px -12px rgb(0 0 0 / 0.45);
}
.hh-menu-item {
  all: unset; display: flex; align-items: center; gap: 10px; height: 30px; padding: 0 10px;
  border-radius: 8px; cursor: pointer; white-space: nowrap; overflow: hidden;
}
.hh-menu-item > span:last-child { overflow: hidden; text-overflow: ellipsis; }
.hh-menu-item:hover, .hh-menu-item:focus-visible { background: var(--hh-chip-hover); }
.hh-menu-item:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: -2px; }
.hh-menu-item:nth-last-child(1) { margin-top: 3px; border-top: 1px solid var(--hh-edge); }
.hh-drop-target {
  position: fixed; width: 30px; height: 30px; border-radius: 50%; box-sizing: border-box;
  display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 16px;
  background: var(--hh-group); border: 2px solid rgb(255 255 255 / 0.85);
  box-shadow: 0 6px 16px -6px rgb(0 0 0 / 0.5); transition: transform 120ms, box-shadow 120ms;
}
.hh-drop-target--hot {
  transform: scale(1.3);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--hh-group) 35%, transparent),
    0 8px 20px -6px rgb(0 0 0 / 0.5);
}
.hh-drop-label {
  position: fixed; transform: translate(-50%, -100%); padding: 4px 10px; border-radius: 8px;
  color-scheme: light dark; color: var(--hh-fg); background: var(--hh-glass);
  border: 1px solid var(--hh-edge); backdrop-filter: blur(20px); white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) { .hh-drop-target { transition: none; } }
/* Hover card: the tab as last seen; a click opens it live in a mini window. */
.hh-card {
  all: unset; position: fixed; pointer-events: auto; box-sizing: border-box; width: 480px;
  display: flex; flex-direction: column; overflow: hidden; border-radius: 14px; cursor: pointer;
  color-scheme: light dark; color: var(--hh-fg); background: var(--hh-glass);
  border: 1px solid var(--hh-edge); backdrop-filter: blur(20px) saturate(1.8);
  box-shadow: inset 0 1px 0 var(--hh-highlight), 0 18px 44px -14px rgb(0 0 0 / 0.5);
}
/* Joined to the dock: no border or rounding on the side that touches it. */
.hh-card[data-side='above'] {
  border-bottom: 0; border-radius: 14px 14px 6px 6px;
  box-shadow: inset 0 1px 0 var(--hh-highlight), 0 -12px 36px -16px rgb(0 0 0 / 0.45);
}
.hh-card[data-side='below'] {
  border-top: 0; border-radius: 6px 6px 14px 14px;
  box-shadow: 0 16px 36px -16px rgb(0 0 0 / 0.45);
}
.hh-card:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 1px; }
.hh-card-image {
  display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; object-position: left top;
  background: var(--hh-chip); border-bottom: 1px solid var(--hh-edge);
}
.hh-card-empty {
  display: grid; place-items: center; padding: 0 24px; box-sizing: border-box;
  text-align: center; color: var(--hh-muted);
}
.hh-card-caption { display: flex; flex-direction: column; gap: 2px; padding: 9px 12px 10px; }
.hh-card-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hh-card-meta { color: var(--hh-muted); font-size: 12px; }
/* A tab out in a mini window: still listed, marked as away. */
.hh-chip--away { opacity: 0.6; }
.hh-chip--away .hh-title { font-style: italic; }
.hh-bar--peek { padding: 4px; }
.hh-return {
  all: unset; display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 14px;
  border-radius: 10px; cursor: pointer; font-weight: 600; white-space: nowrap;
}
.hh-return:hover { background: var(--hh-chip-hover); }
.hh-return:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 1px; }
/* Solid surface where blur is unavailable or the user asks for less transparency. */
@supports not (backdrop-filter: blur(1px)) {
  .hh-bar, .hh-pill, .hh-menu, .hh-drop-label, .hh-card { background: var(--hh-solid); }
}
@media (prefers-reduced-transparency: reduce) {
  .hh-bar, .hh-pill, .hh-menu, .hh-drop-label, .hh-card {
    background: var(--hh-solid); backdrop-filter: none;
  }
}
/* Narrow windows: keep the colour dot, drop the group name. */
@media (max-width: 520px) {
  .hh-label { padding: 0 8px; }
  .hh-label-text { display: none; }
}
`;
})();
