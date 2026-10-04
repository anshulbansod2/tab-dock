# Hover Helper

A horizontal bar at the bottom of every page that lists the tabs in your current Chrome tab
group — or all ungrouped tabs — so you can switch and close them without opening the vertical
tab strip.

## Install (unpacked)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. Reload any tabs that were already open (Chrome only injects into pages loaded afterwards).

## Use

- Click a tab chip to switch; click **×** or middle-click to close.
- **+** opens a new tab next to the current one, inside the same group.
- **⌄** collapses the bar to a corner pill (remembered across tabs).
- Keyboard: focus a chip, then ←/→/Home/End to move, Enter/Space to switch, Delete to close.

The bar cannot appear on `chrome://` pages, the New Tab page or the Chrome Web Store — Chrome
does not allow extensions there.

### Memory footprint

Only visible tabs hold a connection to the service worker, and hidden tabs drop the bar's DOM
until they are shown again, so idle tabs cost almost nothing.

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
