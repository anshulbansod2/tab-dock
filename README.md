# Hover Helper

A horizontal bar at the bottom of every page that lists the tabs in your current Chrome tab
group — or all ungrouped tabs — so you can switch and close them without opening the vertical
tab strip.

## Install (unpacked)

Requires Chrome 123 or later.

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder.

Tabs that were already open get the bar the first time you switch to them — no reload needed.

## Use

- Click a tab chip to switch; click **×** or middle-click to close.
- **+** opens a new tab next to the current one, inside the same group.
- **⌄** collapses the bar to a corner pill (remembered across tabs).
- Keyboard: focus a chip, then ←/→/Home/End to move, Enter/Space to switch, Delete to close.

The bar cannot appear on `chrome://` pages, the New Tab page or the Chrome Web Store — Chrome
does not allow extensions there.

Keystrokes made while the bar has focus are kept from the page's own shortcuts. A page that
listens in the capture phase on `window` can still see them; that is a browser limitation.

### Memory and speed

- No connection is held open: the service worker sleeps between tab events, and only each
  window's visible tab receives updates.
- Hidden tabs drop the bar's DOM and data until they are shown again.
- Favicons come from Chrome's own cache as small inline images, cached per site (bounded),
  so pages never fetch — or learn about — other tabs' sites.

### Permissions

`tabs`, `tabGroups`, `storage`; `scripting` + host access to add the bar to tabs that were
open before install; `favicon` to read Chrome's favicon cache. Host access matches the content
script's sites, so it adds no install warning.

## Develop

```bash
npm ci
npm run check          # lint + format check + typecheck + tests with coverage
npm test               # tests only
npm run package        # dist/hover-helper.zip
npm run icons          # regenerate icons
```

No build step: Chrome loads `manifest.json`, `background/`, `content/` and `icons/` directly.
Design: `docs/superpowers/specs/2026-10-05-hover-helper-design.md`.
