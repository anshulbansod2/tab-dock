# Hover Helper — Design Spec

Date: 2026-10-05
Status: Draft — awaiting review

## Problem

The user browses with Chrome's built-in vertical tab strip, holding 4–5 tab groups plus several
ungrouped tabs. Switching between or closing the tabs they are actively working with (e.g. four
links just opened from the current page) requires expanding the vertical strip, which is slow.

## Goal

A single horizontal bar, rendered inside the page, showing the tabs that share the current tab's
context so the user can switch and close them with one click — without touching the vertical strip.

## Non-goals

- No custom grouping logic. Chrome already places links opened from a grouped tab into that group
  and leaves links from ungrouped tabs ungrouped; the extension only reads that state.
- No cross-window view; the bar shows tabs from the current window only.
- No vertical panel, popup, or Side Panel UI.
- No tab-group creation, renaming, or recolouring.

## Behaviour

### Which tabs appear

| Current tab is…            | Bar shows                                   | Label                          |
|----------------------------|---------------------------------------------|--------------------------------|
| In a tab group             | All tabs in that group, in strip order      | Group title + group colour     |
| Ungrouped                  | All ungrouped tabs in the window, in order  | "Ungrouped", neutral colour    |

Pinned tabs are treated as ungrouped tabs (Chrome does not allow pinned tabs in groups).
A group with an empty title is labelled "Group".

### Layout

- Thin strip (~32px) fixed to the **bottom** of the viewport, full width, above page content
  (max z-index).
- Left: group label chip (colour dot + title).
- Middle: one chip per tab — favicon + truncated title (max ~24 chars, ellipsis). The active tab's
  chip is highlighted. Overflow scrolls horizontally; the active chip is scrolled into view.
- Right: **+** button, and a collapse toggle.
- **Collapsed** state: a small pill in the bottom-right corner showing the group colour and tab
  count; clicking it expands. Collapsed/expanded state is persisted globally via
  `chrome.storage.local`.

### Actions

| Input                           | Effect                                                         |
|---------------------------------|----------------------------------------------------------------|
| Click a chip                    | Activate that tab                                              |
| Click × on a chip (hover-shown) | Close that tab                                                 |
| Middle-click a chip             | Close that tab                                                 |
| Click +                         | Open a new tab next to the current one; if the current tab is in a group, add the new tab to that group |

### Where the bar cannot appear

Chrome forbids content scripts on `chrome://` pages, the New Tab page, the Chrome Web Store, and
some other internal pages. The bar is simply absent there. (A keyboard-shortcut fallback is a
possible later addition, not part of this spec.)

## Architecture

Manifest V3, plain JavaScript/CSS loaded directly via "Load unpacked" — no bundler or build step.
Dev-only tooling (Vitest + jsdom) is used for tests and is not shipped.

```
manifest.json
background/
  index.js        service worker (ES module): wires Chrome events + port messaging
  tabModel.js     pure: (tabs, groups, activeTabId) -> bar snapshot
content/
  render.js       pure-ish: snapshot -> DOM inside a Shadow Root
  bar.js          connects port, handles reconnect, forwards user actions
  bar.css         styles (loaded into the Shadow Root)
tests/
  tabModel.test.js
  render.test.js
  background.test.js
package.json      dev dependencies only (vitest, jsdom)
```

Permissions: `tabs`, `tabGroups`, `storage`. Content script matches `<all_urls>`, `run_at:
document_idle`. `bar.css` exposed via `web_accessible_resources` (or inlined) so it can be loaded
into the Shadow Root.

Content scripts are classic scripts (not modules); `render.js` and `bar.js` are listed in order in
the manifest and share a single namespace object (`globalThis.HoverHelper`).

### Units

**`tabModel.js`** — `buildSnapshot({ tabs, groups, tabId })`
- Input: tabs in the window (from `chrome.tabs.query`), groups (from `chrome.tabGroups.query`),
  and the tab the bar belongs to.
- Output:
  `{ group: { id, title, color } | null, tabs: [{ id, title, favIconUrl, active }] }`
- Pure function, no Chrome API access. Primary unit-test target.

**`background/index.js`**
- Accepts `chrome.runtime.onConnect` ports named `hover-helper`; records `port.sender.tab.id`
  and `windowId`.
- On connect: query tabs/groups for that window, send `{ type: "snapshot", snapshot }`.
- Listens to `tabs.onCreated/onRemoved/onUpdated/onActivated/onMoved/onAttached/onDetached` and
  `tabGroups.onUpdated/onRemoved`; marks the affected window dirty and, debounced (~50ms),
  recomputes and pushes a snapshot to every port in that window.
- Handles incoming messages:
  - `{ type: "activate", tabId }` → `chrome.tabs.update(tabId, { active: true })`
  - `{ type: "close", tabId }` → `chrome.tabs.remove(tabId)`
  - `{ type: "new" }` → `chrome.tabs.create({ index: sender.index + 1, windowId })`, then
    `chrome.tabs.group({ tabIds, groupId })` if the sender tab is grouped.
- Ignores errors from tabs that no longer exist.

**`content/render.js`** — `render(root, snapshot, state, handlers)`
- Builds/updates the bar DOM inside the given Shadow Root. Handles collapsed vs expanded, favicon
  fallback (placeholder icon when `favIconUrl` is missing or fails to load), title truncation,
  active-chip scroll-into-view.

**`content/bar.js`**
- Creates a host element + closed Shadow Root on `document.documentElement`.
- Opens the port, renders each snapshot, forwards click actions.
- On port disconnect (service-worker restart / extension reload): retries connection with
  backoff (e.g. 100ms → 1s → 5s cap); stops if `chrome.runtime.id` is gone (extension
  uninstalled/reloaded — orphaned script removes its host element).
- Reads/writes collapsed state in `chrome.storage.local`; listens to `storage.onChanged` so all
  tabs stay in sync.

### Data flow

```
page load ──connect──▶ background ──query tabs/groups──▶ tabModel ──snapshot──▶ bar renders
Chrome tab/group event ──▶ background (debounce) ──▶ snapshot ──▶ every bar in that window
user click ──{activate|close|new}──▶ background ──▶ chrome.tabs API ──▶ events ──▶ new snapshots
```

## Error handling

- Stale tab IDs (tab closed between render and click): API rejection caught and ignored; the next
  snapshot corrects the UI.
- Service worker sleep/restart: bars reconnect automatically and receive a fresh snapshot.
- Missing/broken favicons: neutral placeholder.
- Pages with hostile CSS: closed Shadow Root + explicit resets isolate the bar's styling.
- Collapsed state never overlaps more than the small corner pill.

## Testing

TDD: failing test first for each unit; ≥80% coverage on new code.

- `tabModel.test.js`: grouped tab, ungrouped tab, pinned tabs, empty group title, ordering,
  single-tab group, active flag.
- `background.test.js`: with a mocked `chrome` global — snapshot on connect, debounced push on
  events, scoping pushes to the right window, `activate/close/new` handlers (including
  new-tab-joins-group), stale-tab error swallowing.
- `render.test.js` (jsdom): expanded vs collapsed, chip count/labels, truncation, active
  highlight, favicon fallback, click/middle-click/×/+ invoke the right handlers.
- Manual: Load unpacked; from a grouped page open 4 links in new tabs → all 4 appear in the bar;
  switch and close via the bar; repeat from an ungrouped page; collapse/expand persists across
  tabs; reload the extension and confirm bars reconnect.

Test command: `npx vitest run --coverage`.

## Engineering standards

The shipped extension has no build step, but the repository is held to production standards via
dev-only tooling.

### Code quality

- **Type safety without a build:** every source file has `// @ts-check`; public functions and
  message shapes are documented with JSDoc types (`@typedef` for `Snapshot`, `BarTab`,
  `BarGroup`, `ClientMessage`, `ServerMessage`). `tsc --noEmit` with `checkJs` + `strict` and
  `@types/chrome` runs as the `typecheck` script. No `any` (`@ts-expect-error` only with a
  justification comment).
- **Lint/format:** ESLint (flat config, `eslint:recommended` + browser/webextension globals) and
  Prettier. Rules are never disabled without an explanatory comment.
- **Size limits:** functions < 50 lines, files < 400 lines; logic split into single-purpose
  modules.
- **Constants:** port name, message types, debounce interval, reconnect backoff, and title length
  live in one constants module per context — no magic strings/numbers.

### Security

- **Least privilege:** `tabs`, `tabGroups`, `storage`, plus (after final review) `scripting`
  with host access equal to the content-script match — to add the bar to tabs open before
  install/update — and `favicon` to inline favicons from Chrome's cache. No remote code;
  default MV3 CSP.
- **Untrusted data:** tab titles and URLs are page-controlled. The bar is built with
  `document.createElement` + `textContent` only — never `innerHTML`. Favicons reach the page
  only as `data:image/` URLs inlined by the service worker, so a page never sees (or fetches)
  other tabs' favicon URLs; anything else shows the placeholder.
- **Message validation:** the background script accepts only ports named `hover-helper` from this
  extension's own content scripts (`sender.id === chrome.runtime.id`, `sender.tab` present),
  validates each message's `type` and that `tabId` is an integer in the sender's window, and
  drops anything else.

### Accessibility

- Bar is a `role="tablist"` with `aria-label`; chips are `role="tab"` with `aria-selected`;
  close and + are `<button>`s with `aria-label`s.
- Keyboard: chips are focusable; Enter/Space activates, Delete closes, Left/Right moves focus.
- Visible focus ring; colours meet WCAG AA contrast in both light and dark (`prefers-color-scheme`).

### Reliability & observability

- All `chrome.*` promise calls are awaited inside `try/catch`; expected failures (stale tab IDs)
  are ignored, unexpected ones logged via a small `logger` with a `[hover-helper]` prefix.
- No unhandled promise rejections; debounce timers and listeners are cleaned up on port
  disconnect.

### Repository & process

- Conventional commits (`type(scope): description`), one logical change per commit.
- `package.json` scripts: `lint`, `format`, `typecheck`, `test`, `test:coverage`, `check`
  (all of the above), and `package` (zips `manifest.json`, `background/`, `content/`, `icons/`
  into `dist/hover-helper.zip` for release).
- GitHub Actions CI runs `npm ci && npm run check` on push/PR; coverage threshold 80%
  enforced in `vitest.config.js`.
- `.gitignore` covers `node_modules/`, `coverage/`, `dist/`.
- `README.md` with install (Load unpacked), usage, and development commands.
- Versioning: SemVer in `manifest.json` and `package.json`, kept in sync.

## Revision after final review (2026-10-05)

- Long-lived ports replaced by one-shot messages: bars send `hello` when visible and receive
  `snapshot` pushes (only each window's active tab is pushed to). The service worker can sleep.
- Bars are injected on demand into tabs that predate install/update.
- Host element is a custom `<hover-helper-bar>` tag tagged with a per-injection instance id.
