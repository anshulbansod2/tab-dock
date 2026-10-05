# Tab Dock

A horizontal bar at the bottom of every page that lists the tabs in your current Chrome tab
group — or all ungrouped tabs — so you can switch and close them without opening the vertical
tab strip.

## Install (unpacked)

Requires Chrome 123 or later.

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder.

Tabs that were already open get the bar the first time you switch to them — no reload needed.

## Use

- Click a tab chip to switch; click **×** or middle-click to close. The mouse wheel scrolls
  a long strip.
- **+** opens a new tab next to the current one, inside the same group.
- Click the group name to collapse the bar to a pill, and the pill to expand it (remembered
  across tabs).
- Drag the group name (or the pill) to move the dock anywhere; drop it near the bottom centre
  to snap it back. The spot is the same on every site.
- Drag a chip sideways to reorder the group's tabs (Chrome's own tab strip follows).
- Move a tab to another group: right-click its chip for **Move to group**, **New group**,
  **Remove from group** or **Close tab** — or drag the chip up off the dock and drop it on a
  group's dot.
- Keyboard: focus a chip, then ←/→/Home/End to move, Enter/Space to switch, Delete to close,
  Alt+Shift+←/→ to reorder, Shift+F10 (or the menu key) for the tab menu. With the group
  name focused, Alt+arrows move the dock and Alt+Home puts it back.

The bar cannot appear on `chrome://` pages, the New Tab page or the Chrome Web Store — Chrome
does not allow extensions there.

Keystrokes made while the bar has focus are kept from the page's own shortcuts. A page that
listens in the capture phase on `window` can still see them; that is a browser limitation.

### Memory and speed

- No connection is held open: the service worker sleeps between tab events.
- Every bar in the window is kept current, so switching tabs shows the right bar at once.
  Only bars whose content changed are sent anything (a title flicker in one group never
  touches the others), and hidden tabs only store the update: Chrome holds their repaint
  until they are shown.
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
npm run package        # dist/tab-dock.zip
npm run icons          # regenerate icons
```

No build step: Chrome loads `manifest.json`, `background/`, `content/` and `icons/` directly.
