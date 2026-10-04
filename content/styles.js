// @ts-check
// Bar stylesheet, applied inside the Shadow Root as a constructable stylesheet (exempt from
// page CSP and isolated from page CSS).
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));

  ns.styles = `
:host { all: initial; }
.hh-root {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
  pointer-events: none; color: var(--hh-fg);
  font: 12px/1.2 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --hh-bg: #ffffff; --hh-fg: #202124; --hh-muted: #5f6368; --hh-border: #dadce0;
  --hh-chip: #f1f3f4; --hh-chip-hover: #e8eaed; --hh-active: #d3e3fd; --hh-focus: #0b57d0;
}
@media (prefers-color-scheme: dark) {
  .hh-root {
    --hh-bg: #202124; --hh-fg: #e8eaed; --hh-muted: #9aa0a6; --hh-border: #3c4043;
    --hh-chip: #2d2e30; --hh-chip-hover: #3c4043; --hh-active: #394457; --hh-focus: #a8c7fa;
  }
}
.hh-bar {
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
.hh-tabs {
  display: flex; gap: 4px; flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: thin;
}
.hh-chip {
  display: flex; align-items: center; flex: none; max-width: 200px; height: 24px;
  border-radius: 6px; background: var(--hh-chip);
}
.hh-chip:hover { background: var(--hh-chip-hover); }
.hh-chip[data-active] { background: var(--hh-active); }
.hh-tab {
  display: flex; align-items: center; gap: 6px; min-width: 0; height: 100%;
  padding: 0 4px 0 8px; border-radius: 6px; cursor: pointer; outline: none;
}
.hh-title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.hh-favicon { width: 16px; height: 16px; flex: none; border-radius: 3px; }
.hh-favicon--placeholder { background: var(--hh-muted); opacity: 0.4; }
.hh-btn {
  all: unset; display: inline-grid; place-items: center; width: 20px; height: 20px;
  border-radius: 4px; cursor: pointer; color: var(--hh-muted); font-size: 14px; line-height: 1;
}
.hh-btn:hover { background: var(--hh-chip-hover); color: var(--hh-fg); }
.hh-close { visibility: hidden; margin-right: 2px; }
.hh-chip:hover .hh-close, .hh-chip:focus-within .hh-close, .hh-chip[data-active] .hh-close {
  visibility: visible;
}
.hh-pill {
  all: unset; pointer-events: auto; position: fixed; right: 12px; bottom: 12px;
  display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
  background: var(--hh-bg); color: var(--hh-fg); border: 1px solid var(--hh-border);
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.2); cursor: pointer; font-weight: 600;
}
.hh-tab:focus-visible, .hh-btn:focus-visible, .hh-pill:focus-visible {
  outline: 2px solid var(--hh-focus); outline-offset: 1px;
}
@media (prefers-reduced-motion: no-preference) {
  .hh-bar { animation: hh-in 120ms ease-out; }
}
@keyframes hh-in { from { transform: translateY(100%); } }
`;
})();
