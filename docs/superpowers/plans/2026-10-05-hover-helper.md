# Hover Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Manifest V3 Chrome extension that renders a horizontal bar at the bottom of every page
listing the tabs in the current tab's Chrome tab group (or all ungrouped tabs), for one-click
switching and closing.

**Architecture:** A module service worker reads Chrome's native tabs/groups, builds a per-tab
`Snapshot` with a pure function, and pushes it over a long-lived port to each visible page. Classic
content scripts (sharing a `globalThis.HoverHelper` namespace) render the bar inside a closed Shadow
Root and send `activate | close | new` actions back. No build step; dev tooling is test/lint only.

**Tech Stack:** Plain JavaScript (ES2022) with `// @ts-check` + JSDoc, TypeScript (`tsc --noEmit`)
for type-checking, `@types/chrome`, Vitest + jsdom + `@vitest/coverage-v8`, ESLint (flat config),
Prettier, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-05-hover-helper-design.md`

**Deliberate refinements of the spec (all within its intent):**
1. `content/bar.css` becomes `content/styles.js` (a CSS string applied via a constructable
   stylesheet) — the spec allowed inlining; this avoids `web_accessible_resources` and page CSP.
2. Bars hold a port **only while their page is visible**; hidden tabs reconnect and receive a fresh
   snapshot when shown. Fewer ports, same UX.
3. `tabs.onActivated` is not observed: a bar highlights *its own* tab, which never changes.
4. The background is split into single-purpose modules (`service-worker`, `register`, `hub`,
   `actions`, `messages`, `logger`, `tabModel`, `constants`) and the content side into `core`,
   `format`, `styles`, `dom`, `render`, `events`, `connection`, `bar`, `main`.

## Global Constraints

- Manifest V3; `minimum_chrome_version` `"116"`.
- Permissions exactly: `tabs`, `tabGroups`, `storage`. No `host_permissions`, no
  `web_accessible_resources`, no remote code, default CSP.
- No build step: Chrome loads `manifest.json`, `background/`, `content/`, `icons/` as-is.
- Every source file starts with `// @ts-check`; `npm run typecheck` (strict) must pass. No `any`.
- Never assign `innerHTML`/`outerHTML`; build DOM with `createElement` + `textContent`.
- Favicon URLs are used only when they match `^(https?:|data:image\/)`; otherwise a placeholder.
- Functions < 50 lines; files < 400 lines; no magic strings/numbers outside constants modules.
- Port name `hover-helper`; message types `snapshot | activate | close | new`.
- Title truncation: 24 characters, ending in `…`.
- Debounce: 50 ms per window. Reconnect delays: 100 ms, 1000 ms, then 5000 ms (cap).
- Storage key `hoverHelper.collapsed` in `chrome.storage.local`.
- Coverage threshold: 80% lines/functions/branches/statements.
- Conventional commits; each commit message ends with
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Version `0.1.0`, identical in `manifest.json` and `package.json`.
- Before every commit: `npm run format && npm run lint && npm run typecheck && npm test` all pass.

## Review Focus

1. **Hostile tab titles** (e.g. `<img src=x onerror=alert(1)>`) must render as inert text — test in Task 7.
2. **A burst of tab events** (opening 4 links at once) must produce exactly one snapshot per bar, not one per event — test in Task 4.
3. **Extension reloaded while pages are open**: stale bars must remove themselves quietly, not throw on every event — tests in Tasks 9 and 10.
4. **A tab dragged into another window** must have its bar follow the new window's group — tests in Tasks 4 and 5.
5. **Page keyboard shortcuts** (Space/Delete on Gmail, YouTube) must not fire while focus is inside the bar — test in Task 8.

---

## File Structure

```
manifest.json                   extension manifest (Task 11)
package.json                    dev-only tooling + scripts (Task 1)
eslint.config.js, .prettierrc, .prettierignore, tsconfig.json, vitest.config.js   (Task 1)
types/hover-helper.d.ts         shared ambient types: Snapshot, BarTab, messages (Task 1)
types/content.d.ts              HoverHelper namespace types for content scripts (Task 6)
background/
  constants.js                  port name, message types, defaults (Task 1)
  tabModel.js                   pure buildSnapshot() (Task 1)
  logger.js                     prefixed logger + isStaleTabError() (Task 2)
  messages.js                   parseClientMessage(), identifyClient() (Task 2)
  actions.js                    handleAction() — activate/close/new (Task 3)
  hub.js                        createHub() — port registry + debounced pushes (Task 4)
  register.js                   registerBackground() — wires Chrome events (Task 5)
  service-worker.js             2-line entry point (Task 5)
content/                        classic scripts, loaded in this order:
  core.js                       constants + logger (Task 6)
  format.js                     truncate, safeFavicon, groupLabel, groupColor (Task 6)
  styles.js                     CSS string (Task 7)
  dom.js                        element builders (Task 7)
  render.js                     render() with focus/scroll preservation (Task 7)
  events.js                     bindEvents() — mouse + keyboard (Task 8)
  connection.js                 createConnection() — port lifecycle (Task 9)
  bar.js                        mountBar() — bootstrap + collapsed state (Task 10)
  main.js                       1-call entry point (Task 10)
icons/icon{16,48,128}.png       generated (Task 11)
scripts/generate-icons.js       PNG generator, no deps (Task 11)
tests/helpers/chrome.js         fake chrome API, ports, events (Task 1)
tests/helpers/content.js        loads content scripts into the test realm (Task 6)
tests/*.test.js                 one per unit
.github/workflows/ci.yml        CI (Task 11)
README.md                       (Task 11)
```

---

### Task 1: Tooling and the pure tab model

**Files:**
- Create: `package.json`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `tsconfig.json`,
  `vitest.config.js`, `types/hover-helper.d.ts`, `background/constants.js`,
  `background/tabModel.js`, `tests/helpers/chrome.js`, `tests/tabModel.test.js`

**Interfaces:**
- Produces:
  - Ambient types `BarGroup {id:number,title:string,color:string}`,
    `BarTab {id:number,title:string,favIconUrl:string|null,active:boolean}`,
    `Snapshot {group:BarGroup|null,tabs:BarTab[]}`, `ClientMessage`, `ServerMessage`,
    `ClientInfo {tabId:number,windowId:number}`.
  - `background/constants.js`: `PORT_NAME`, `MSG`, `UNGROUPED_ID`, `DEFAULT_GROUP_TITLE`,
    `DEFAULT_GROUP_COLOR`, `UNTITLED_TAB`, `BROADCAST_DEBOUNCE_MS`.
  - `buildSnapshot({ tabs, groups, tabId }): Snapshot`.
  - Test helpers: `createEvent()`, `createPort(opts)`, `createChrome({tabs,groups})`,
    `makeTab(overrides)`, `flushPromises()`.

- [ ] **Step 1: Create `package.json` and install dev dependencies**

```json
{
  "name": "hover-helper",
  "version": "0.1.0",
  "private": true,
  "description": "Horizontal quick-switch bar for the tabs in your current Chrome tab group.",
  "type": "module",
  "scripts": {
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "check": "npm run lint && npm run format:check && npm run typecheck && npm run test:coverage"
  }
}
```

Run: `npm install -D eslint @eslint/js globals prettier typescript @types/chrome vitest @vitest/coverage-v8 jsdom`
Expected: `package-lock.json` created, no errors.

- [ ] **Step 2: Create lint/format/type/test configs**

`eslint.config.js`:

```js
import js from '@eslint/js';
import globals from 'globals';

const noInnerHtml = {
  selector: 'AssignmentExpression > MemberExpression[property.name=/^(innerHTML|outerHTML)$/]',
  message: 'Tab data is untrusted: build DOM with createElement/textContent.',
};

export default [
  { ignores: ['coverage/', 'dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-syntax': ['error', noInnerHtml],
    },
  },
  {
    files: ['background/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.serviceworker, ...globals.webextensions },
    },
  },
  {
    files: ['content/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.webextensions, HoverHelper: 'readonly' },
    },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.js', '*.config.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
  },
];
```

`.prettierrc`:

```json
{ "singleQuote": true, "printWidth": 100 }
```

`.prettierignore`:

```
coverage/
dist/
node_modules/
package-lock.json
docs/
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noImplicitReturns": true,
    "skipLibCheck": true,
    "types": ["chrome"]
  },
  "include": ["background/**/*.js", "content/**/*.js", "types/**/*.d.ts"]
}
```

`vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['background/**/*.js', 'content/**/*.js'],
      // Two-line entry points that only call into tested modules with the real chrome global.
      exclude: ['background/service-worker.js', 'content/main.js'],
      reporter: ['text', 'html'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
```

- [ ] **Step 3: Create shared types `types/hover-helper.d.ts`**

```ts
// Ambient (no imports/exports) so JSDoc in both ES-module background files and classic content
// scripts can reference these names directly.

interface BarGroup {
  id: number;
  title: string;
  /** Chrome tab-group colour name, e.g. "blue". */
  color: string;
}

interface BarTab {
  id: number;
  title: string;
  favIconUrl: string | null;
  /** True only for the tab this bar is rendered in. */
  active: boolean;
}

interface Snapshot {
  /** null when the bar's tab is ungrouped (or pinned). */
  group: BarGroup | null;
  tabs: BarTab[];
}

type ClientMessage =
  | { type: 'activate'; tabId: number }
  | { type: 'close'; tabId: number }
  | { type: 'new' };

type ServerMessage = { type: 'snapshot'; snapshot: Snapshot };

/** The tab (and its window) a connected bar belongs to. */
interface ClientInfo {
  tabId: number;
  windowId: number;
}
```

- [ ] **Step 4: Create test helpers `tests/helpers/chrome.js`**

```js
import { vi } from 'vitest';

/** Minimal chrome.events.Event fake with an emit() for tests. */
export function createEvent() {
  const listeners = new Set();
  return {
    addListener: vi.fn((fn) => listeners.add(fn)),
    removeListener: vi.fn((fn) => listeners.delete(fn)),
    hasListeners: () => listeners.size > 0,
    emit: (...args) => [...listeners].forEach((fn) => fn(...args)),
  };
}

export function createPort({
  name = 'hover-helper',
  tabId = 1,
  windowId = 1,
  extensionId = 'ext-id',
  frameId = 0,
} = {}) {
  return {
    name,
    sender: { id: extensionId, frameId, tab: { id: tabId, windowId } },
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: createEvent(),
    onDisconnect: createEvent(),
  };
}

export function makeTab(overrides = {}) {
  const id = overrides.id ?? 1;
  return {
    id,
    index: 0,
    windowId: 1,
    groupId: -1,
    pinned: false,
    active: false,
    title: `Tab ${id}`,
    url: `https://example.com/${id}`,
    favIconUrl: 'https://example.com/favicon.ico',
    ...overrides,
  };
}

/** Fake `chrome` covering the APIs the background uses; `state` is mutable per test. */
export function createChrome({ tabs = [], groups = [] } = {}) {
  const state = { tabs: [...tabs], groups: [...groups] };
  const get = async (id) => {
    const tab = state.tabs.find((t) => t.id === id);
    if (!tab) throw new Error(`No tab with id: ${id}.`);
    return tab;
  };
  return {
    state,
    runtime: { id: 'ext-id', onConnect: createEvent() },
    tabs: {
      query: vi.fn(async ({ windowId }) => state.tabs.filter((t) => t.windowId === windowId)),
      get: vi.fn(get),
      update: vi.fn(async (id) => get(id)),
      remove: vi.fn(async () => undefined),
      create: vi.fn(async (props) => ({ id: 999, ...props })),
      group: vi.fn(async () => 1),
      onCreated: createEvent(),
      onRemoved: createEvent(),
      onUpdated: createEvent(),
      onMoved: createEvent(),
      onAttached: createEvent(),
      onDetached: createEvent(),
      onReplaced: createEvent(),
    },
    tabGroups: {
      query: vi.fn(async ({ windowId }) => state.groups.filter((g) => g.windowId === windowId)),
      onUpdated: createEvent(),
      onRemoved: createEvent(),
      onMoved: createEvent(),
    },
  };
}

/** Resolves after pending promise callbacks run (works with fake setTimeout). */
export const flushPromises = () => new Promise((resolve) => setImmediate(resolve));
```

- [ ] **Step 5: Write the failing test `tests/tabModel.test.js`**

```js
import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../background/tabModel.js';
import { makeTab } from './helpers/chrome.js';

const groups = [
  { id: 10, title: 'Research', color: 'blue', windowId: 1, collapsed: false },
  { id: 20, title: '', color: 'red', windowId: 1, collapsed: false },
];

describe('buildSnapshot', () => {
  it('returns same-group tabs in strip order with the group label', () => {
    const tabs = [
      makeTab({ id: 3, index: 2, groupId: 10 }),
      makeTab({ id: 1, index: 0, groupId: 10 }),
      makeTab({ id: 2, index: 1 }),
      makeTab({ id: 4, index: 3, groupId: 20 }),
    ];
    const snap = buildSnapshot({ tabs, groups, tabId: 1 });
    expect(snap.group).toEqual({ id: 10, title: 'Research', color: 'blue' });
    expect(snap.tabs.map((t) => t.id)).toEqual([1, 3]);
  });

  it('returns every ungrouped tab, pinned included, for an ungrouped tab', () => {
    const tabs = [
      makeTab({ id: 5, index: 0, pinned: true }),
      makeTab({ id: 2, index: 1 }),
      makeTab({ id: 1, index: 2, groupId: 10 }),
      makeTab({ id: 6, index: 3 }),
    ];
    const snap = buildSnapshot({ tabs, groups, tabId: 2 });
    expect(snap.group).toBeNull();
    expect(snap.tabs.map((t) => t.id)).toEqual([5, 2, 6]);
  });

  it('treats a pinned tab as ungrouped even if it reports a groupId', () => {
    const tabs = [makeTab({ id: 7, pinned: true, groupId: 10 }), makeTab({ id: 8, index: 1 })];
    const snap = buildSnapshot({ tabs, groups, tabId: 7 });
    expect(snap.group).toBeNull();
    expect(snap.tabs.map((t) => t.id)).toEqual([7, 8]);
  });

  it('labels a group with an empty title as "Group"', () => {
    const snap = buildSnapshot({ tabs: [makeTab({ id: 4, groupId: 20 })], groups, tabId: 4 });
    expect(snap.group).toEqual({ id: 20, title: 'Group', color: 'red' });
  });

  it('uses default title and colour when the group is not known yet', () => {
    const snap = buildSnapshot({ tabs: [makeTab({ id: 4, groupId: 99 })], groups, tabId: 4 });
    expect(snap.group).toEqual({ id: 99, title: 'Group', color: 'grey' });
  });

  it('marks only the bar’s own tab as active', () => {
    const tabs = [makeTab({ id: 1, active: true }), makeTab({ id: 2, index: 1 })];
    const snap = buildSnapshot({ tabs, groups, tabId: 2 });
    expect(snap.tabs.map((t) => t.active)).toEqual([false, true]);
  });

  it('falls back to url then "Untitled", and to null for missing favicons', () => {
    const tabs = [
      makeTab({ id: 1, title: '', favIconUrl: '' }),
      makeTab({ id: 2, index: 1, title: '', url: '', favIconUrl: undefined }),
    ];
    const snap = buildSnapshot({ tabs, groups, tabId: 1 });
    expect(snap.tabs[0]).toMatchObject({ title: 'https://example.com/1', favIconUrl: null });
    expect(snap.tabs[1]).toMatchObject({ title: 'Untitled', favIconUrl: null });
  });

  it('treats an unknown tabId as ungrouped with no active tab', () => {
    const tabs = [makeTab({ id: 1 }), makeTab({ id: 2, index: 1, groupId: 10 })];
    const snap = buildSnapshot({ tabs, groups, tabId: 42 });
    expect(snap.group).toBeNull();
    expect(snap.tabs).toEqual([expect.objectContaining({ id: 1, active: false })]);
  });

  it('skips tabs without an id', () => {
    const tabs = [makeTab({ id: 1 }), { ...makeTab({ index: 1 }), id: undefined }];
    expect(buildSnapshot({ tabs, groups, tabId: 1 }).tabs).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/tabModel.test.js`
Expected: FAIL — cannot resolve `../background/tabModel.js`.

- [ ] **Step 7: Implement `background/constants.js`**

```js
// @ts-check

/** Port name; must equal content/core.js PORT_NAME (enforced by tests/contract.test.js). */
export const PORT_NAME = 'hover-helper';

export const MSG = Object.freeze({
  SNAPSHOT: 'snapshot',
  ACTIVATE: 'activate',
  CLOSE: 'close',
  NEW: 'new',
});

/** Mirrors chrome.tabGroups.TAB_GROUP_ID_NONE so pure modules need no chrome global. */
export const UNGROUPED_ID = -1;
export const DEFAULT_GROUP_TITLE = 'Group';
export const DEFAULT_GROUP_COLOR = 'grey';
export const UNTITLED_TAB = 'Untitled';
export const BROADCAST_DEBOUNCE_MS = 50;
```

- [ ] **Step 8: Implement `background/tabModel.js`**

```js
// @ts-check
import {
  DEFAULT_GROUP_COLOR,
  DEFAULT_GROUP_TITLE,
  UNGROUPED_ID,
  UNTITLED_TAB,
} from './constants.js';

/**
 * Builds one bar's contents: the tabs sharing its Chrome tab group (or every ungrouped tab
 * when it has none), in tab-strip order.
 *
 * @param {object} input
 * @param {chrome.tabs.Tab[]} input.tabs - Every tab in the window.
 * @param {chrome.tabGroups.TabGroup[]} input.groups - Every group in the window.
 * @param {number} input.tabId - The tab the bar is rendered in.
 * @returns {Snapshot}
 */
export function buildSnapshot({ tabs, groups, tabId }) {
  const self = tabs.find((tab) => tab.id === tabId);
  const groupId = self ? effectiveGroupId(self) : UNGROUPED_ID;
  const members = tabs
    .filter((tab) => tab.id !== undefined && effectiveGroupId(tab) === groupId)
    .sort((a, b) => a.index - b.index)
    .map((tab) => toBarTab(tab, tabId));
  return { group: describeGroup(groups, groupId), tabs: members };
}

/**
 * Pinned tabs cannot be grouped, so they always sit with the ungrouped tabs.
 * @param {chrome.tabs.Tab} tab
 * @returns {number}
 */
function effectiveGroupId(tab) {
  return tab.pinned ? UNGROUPED_ID : (tab.groupId ?? UNGROUPED_ID);
}

/**
 * @param {chrome.tabs.Tab} tab - Must have an id (filtered by the caller).
 * @param {number} selfId
 * @returns {BarTab}
 */
function toBarTab(tab, selfId) {
  const id = /** @type {number} */ (tab.id);
  return {
    id,
    title: tab.title || tab.url || UNTITLED_TAB,
    favIconUrl: tab.favIconUrl || null,
    active: id === selfId,
  };
}

/**
 * @param {chrome.tabGroups.TabGroup[]} groups
 * @param {number} groupId
 * @returns {BarGroup | null}
 */
function describeGroup(groups, groupId) {
  if (groupId === UNGROUPED_ID) return null;
  const group = groups.find((g) => g.id === groupId);
  return {
    id: groupId,
    title: group?.title || DEFAULT_GROUP_TITLE,
    color: group?.color ?? DEFAULT_GROUP_COLOR,
  };
}
```

- [ ] **Step 9: Run tests and all checks**

Run: `npx vitest run tests/tabModel.test.js` → Expected: 9 passed.
Run: `npm run format && npm run lint && npm run typecheck` → Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json eslint.config.js .prettierrc .prettierignore tsconfig.json vitest.config.js types tests background
git commit -m "feat(background): add tooling and pure tab-group snapshot model

The bar's contents are derived purely from Chrome's native groups, so
isolating that derivation makes the core behaviour testable without
a browser."
```

---

### Task 2: Logger and message validation

**Files:**
- Create: `background/logger.js`, `background/messages.js`, `tests/logger.test.js`,
  `tests/messages.test.js`

**Interfaces:**
- Consumes: `PORT_NAME`, `MSG` from `background/constants.js`; ambient `ClientMessage`, `ClientInfo`.
- Produces:
  - `logger.warn(...args)`, `logger.error(...args)` — prefix `[hover-helper]`.
  - `isStaleTabError(err: unknown): boolean`.
  - `parseClientMessage(raw: unknown): ClientMessage | null`.
  - `identifyClient(port: chrome.runtime.Port, extensionId: string): ClientInfo | null`.

- [ ] **Step 1: Write failing tests**

`tests/logger.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { isStaleTabError, logger } from '../background/logger.js';

describe('logger', () => {
  it('prefixes every line', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.warn('a', 1);
    logger.error('b');
    expect(warn).toHaveBeenCalledWith('[hover-helper]', 'a', 1);
    expect(error).toHaveBeenCalledWith('[hover-helper]', 'b');
  });
});

describe('isStaleTabError', () => {
  it.each([
    [new Error('No tab with id: 12.'), true],
    [new Error('No group with id: 3.'), true],
    [new Error('Tabs cannot be edited right now'), false],
    ['No tab with id: 12.', false],
    [undefined, false],
  ])('%s → %s', (err, expected) => {
    expect(isStaleTabError(err)).toBe(expected);
  });
});
```

`tests/messages.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { identifyClient, parseClientMessage } from '../background/messages.js';
import { createPort } from './helpers/chrome.js';

describe('parseClientMessage', () => {
  it.each([
    [{ type: 'activate', tabId: 4 }, { type: 'activate', tabId: 4 }],
    [{ type: 'close', tabId: 0 }, { type: 'close', tabId: 0 }],
    [{ type: 'new' }, { type: 'new' }],
    [{ type: 'new', tabId: 9, extra: true }, { type: 'new' }],
  ])('accepts %j', (raw, expected) => {
    expect(parseClientMessage(raw)).toEqual(expected);
  });

  it.each([
    null,
    'activate',
    42,
    {},
    { type: 'activate' },
    { type: 'activate', tabId: '4' },
    { type: 'close', tabId: 1.5 },
    { type: 'close', tabId: -1 },
    { type: 'snapshot', snapshot: {} },
    { type: 'eval', tabId: 1 },
  ])('rejects %j', (raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });
});

describe('identifyClient', () => {
  it('returns the sender tab for our own top-frame content script', () => {
    expect(identifyClient(createPort({ tabId: 7, windowId: 3 }), 'ext-id')).toEqual({
      tabId: 7,
      windowId: 3,
    });
  });

  it('rejects a port with the wrong name', () => {
    expect(identifyClient(createPort({ name: 'other' }), 'ext-id')).toBeNull();
  });

  it('rejects a port from another extension', () => {
    expect(identifyClient(createPort({ extensionId: 'evil' }), 'ext-id')).toBeNull();
  });

  it('rejects sub-frames and senders without a tab', () => {
    expect(identifyClient(createPort({ frameId: 2 }), 'ext-id')).toBeNull();
    const port = createPort();
    port.sender.tab = undefined;
    expect(identifyClient(port, 'ext-id')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/logger.test.js tests/messages.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `background/logger.js`**

```js
// @ts-check

const PREFIX = '[hover-helper]';

/** Thin wrapper so every log line is attributable to this extension. */
export const logger = Object.freeze({
  /** @param {...unknown} args */
  warn: (...args) => console.warn(PREFIX, ...args),
  /** @param {...unknown} args */
  error: (...args) => console.error(PREFIX, ...args),
});

const STALE_PATTERNS = [/^No tab with id/, /^No group with id/];

/**
 * True for the errors Chrome raises when a tab or group vanished between a snapshot and an
 * action — expected in normal use and safe to ignore.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isStaleTabError(err) {
  return err instanceof Error && STALE_PATTERNS.some((re) => re.test(err.message));
}
```

- [ ] **Step 4: Implement `background/messages.js`**

```js
// @ts-check
import { MSG, PORT_NAME } from './constants.js';

/**
 * Narrows an untrusted port message to a ClientMessage; unknown fields are dropped.
 * @param {unknown} raw
 * @returns {ClientMessage | null}
 */
export function parseClientMessage(raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const { type, tabId } = /** @type {{ type?: unknown, tabId?: unknown }} */ (raw);
  if (type === MSG.NEW) return { type };
  if ((type === MSG.ACTIVATE || type === MSG.CLOSE) && isTabId(tabId)) return { type, tabId };
  return null;
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isTabId(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Identifies the sending tab, but only for this extension's own top-frame content script.
 * @param {chrome.runtime.Port} port
 * @param {string} extensionId
 * @returns {ClientInfo | null}
 */
export function identifyClient(port, extensionId) {
  const sender = port.sender;
  if (port.name !== PORT_NAME || sender?.id !== extensionId || sender.frameId !== 0) return null;
  const tab = sender.tab;
  if (tab?.id === undefined || tab.id < 0) return null;
  return { tabId: tab.id, windowId: tab.windowId };
}
```

- [ ] **Step 5: Run tests and checks**

Run: `npx vitest run tests/logger.test.js tests/messages.test.js` → Expected: all pass.
Run: `npm run format && npm run lint && npm run typecheck` → Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add background/logger.js background/messages.js tests/logger.test.js tests/messages.test.js
git commit -m "feat(background): validate bar ports and messages

Port messages cross a trust boundary; rejecting anything that is not a
well-formed action from our own top-frame script keeps the tab APIs
out of reach of malformed or foreign input."
```

---

### Task 3: Bar actions

**Files:**
- Create: `background/actions.js`, `tests/actions.test.js`

**Interfaces:**
- Consumes: `MSG`, `UNGROUPED_ID`; `logger`, `isStaleTabError`; ambient `ClientMessage`, `ClientInfo`.
- Produces: `handleAction(msg: ClientMessage, client: ClientInfo, api: typeof chrome): Promise<void>` — never rejects.

- [ ] **Step 1: Write failing test `tests/actions.test.js`**

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAction } from '../background/actions.js';
import { createChrome, makeTab } from './helpers/chrome.js';

const client = { tabId: 1, windowId: 1 };
let api;

beforeEach(() => {
  api = createChrome({
    tabs: [
      makeTab({ id: 1, index: 0, groupId: 10 }),
      makeTab({ id: 2, index: 1, groupId: 10 }),
      makeTab({ id: 3, index: 0, windowId: 2 }),
      makeTab({ id: 4, index: 2 }),
      makeTab({ id: 5, index: 3, pinned: true }),
    ],
  });
});

describe('handleAction', () => {
  it('activates a tab in the same window', async () => {
    await handleAction({ type: 'activate', tabId: 2 }, client, api);
    expect(api.tabs.update).toHaveBeenCalledWith(2, { active: true });
  });

  it('closes a tab in the same window', async () => {
    await handleAction({ type: 'close', tabId: 2 }, client, api);
    expect(api.tabs.remove).toHaveBeenCalledWith(2);
  });

  it('ignores a target in another window', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await handleAction({ type: 'close', tabId: 3 }, client, api);
    expect(api.tabs.remove).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('swallows stale-tab errors silently', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(handleAction({ type: 'close', tabId: 404 }, client, api)).resolves.toBeUndefined();
    expect(error).not.toHaveBeenCalled();
  });

  it('logs unexpected errors without throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.tabs.remove.mockRejectedValueOnce(new Error('boom'));
    await expect(handleAction({ type: 'close', tabId: 2 }, client, api)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('[hover-helper]', 'close failed', expect.any(Error));
  });

  it('opens a new tab next to a grouped tab and adds it to the group', async () => {
    await handleAction({ type: 'new' }, client, api);
    expect(api.tabs.create).toHaveBeenCalledWith({ windowId: 1, index: 1, active: true });
    expect(api.tabs.group).toHaveBeenCalledWith({ groupId: 10, tabIds: 999 });
  });

  it('opens a new ungrouped tab next to an ungrouped tab', async () => {
    await handleAction({ type: 'new' }, { tabId: 4, windowId: 1 }, api);
    expect(api.tabs.create).toHaveBeenCalledWith({ windowId: 1, index: 3, active: true });
    expect(api.tabs.group).not.toHaveBeenCalled();
  });

  it('never groups a tab opened from a pinned tab', async () => {
    api.state.tabs[4].groupId = 10;
    await handleAction({ type: 'new' }, { tabId: 5, windowId: 1 }, api);
    expect(api.tabs.group).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/actions.test.js` → Expected: FAIL — module not found.

- [ ] **Step 3: Implement `background/actions.js`**

```js
// @ts-check
import { MSG, UNGROUPED_ID } from './constants.js';
import { isStaleTabError, logger } from './logger.js';

/**
 * Performs a validated bar action for the tab that sent it. Never rejects: stale-tab failures
 * are expected and ignored, anything else is logged.
 *
 * @param {ClientMessage} msg
 * @param {ClientInfo} client
 * @param {typeof chrome} api
 * @returns {Promise<void>}
 */
export async function handleAction(msg, client, api) {
  try {
    if (msg.type === MSG.NEW) {
      await openTabInGroup(client.tabId, api);
    } else {
      await actOnTab(msg, client.tabId, api);
    }
  } catch (err) {
    if (!isStaleTabError(err)) logger.error(`${msg.type} failed`, err);
  }
}

/**
 * Activates or closes a tab, but only within the sender's current window.
 * @param {Extract<ClientMessage, { tabId: number }>} msg
 * @param {number} senderTabId
 * @param {typeof chrome} api
 */
async function actOnTab(msg, senderTabId, api) {
  const [sender, target] = await Promise.all([
    api.tabs.get(senderTabId),
    api.tabs.get(msg.tabId),
  ]);
  if (target.windowId !== sender.windowId) {
    logger.warn(`ignored cross-window ${msg.type}`);
    return;
  }
  if (msg.type === MSG.ACTIVATE) {
    await api.tabs.update(msg.tabId, { active: true });
  } else {
    await api.tabs.remove(msg.tabId);
  }
}

/**
 * Opens a tab right after the sender and, if the sender is grouped, joins it to that group.
 * @param {number} senderTabId
 * @param {typeof chrome} api
 */
async function openTabInGroup(senderTabId, api) {
  const sender = await api.tabs.get(senderTabId);
  const created = await api.tabs.create({
    windowId: sender.windowId,
    index: sender.index + 1,
    active: true,
  });
  const grouped = !sender.pinned && sender.groupId !== UNGROUPED_ID;
  if (grouped && created.id !== undefined) {
    await api.tabs.group({ groupId: sender.groupId, tabIds: created.id });
  }
}
```

- [ ] **Step 4: Run tests and checks**

Run: `npx vitest run tests/actions.test.js` → Expected: 8 passed.
Run: `npm run format && npm run lint && npm run typecheck` → Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add background/actions.js tests/actions.test.js
git commit -m "feat(background): handle activate, close and new-tab actions

Actions are scoped to the sender's window and tolerate tabs that
closed mid-click, so a fast user never sees errors."
```

---

### Task 4: Connection hub with debounced pushes

**Files:**
- Create: `background/hub.js`, `tests/hub.test.js`

**Interfaces:**
- Consumes: `BROADCAST_DEBOUNCE_MS`, `MSG`; `logger`; `buildSnapshot`.
- Produces: `createHub({ api: typeof chrome, debounceMs?: number }): Hub` where
  `Hub = { add(port, client: ClientInfo): void; clientFor(port): ClientInfo | undefined;
  schedule(windowId: number): void; scheduleAll(): void; retarget(tabId: number, windowId: number): void }`.
  Each push posts `{ type: 'snapshot', snapshot }` (a `ServerMessage`).

- [ ] **Step 1: Write failing test `tests/hub.test.js`**

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHub } from '../background/hub.js';
import { createChrome, createPort, flushPromises, makeTab } from './helpers/chrome.js';

let api;
let hub;

const lastSnapshot = (port) => port.postMessage.mock.calls.at(-1)?.[0].snapshot;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  api = createChrome({
    tabs: [
      makeTab({ id: 1, index: 0, groupId: 10 }),
      makeTab({ id: 2, index: 1, groupId: 10 }),
      makeTab({ id: 3, index: 0, windowId: 2 }),
    ],
    groups: [{ id: 10, title: 'Work', color: 'blue', windowId: 1 }],
  });
  hub = createHub({ api, debounceMs: 50 });
});

afterEach(() => vi.useRealTimers());

async function connect(tabId, windowId) {
  const port = createPort({ tabId, windowId });
  hub.add(port, { tabId, windowId });
  await flushPromises();
  return port;
}

describe('createHub', () => {
  it('sends an initial snapshot on add', async () => {
    const port = await connect(1, 1);
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    expect(port.postMessage.mock.calls[0][0].type).toBe('snapshot');
    expect(lastSnapshot(port).tabs.map((t) => t.id)).toEqual([1, 2]);
  });

  it('collapses a burst of events into one push per window', async () => {
    const port = await connect(1, 1);
    for (let i = 0; i < 4; i += 1) hub.schedule(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushPromises();
    expect(api.tabs.query).toHaveBeenCalledTimes(2); // initial + one debounced push
    expect(port.postMessage).toHaveBeenCalledTimes(2);
  });

  it('only pushes to bars in the scheduled window', async () => {
    const w1 = await connect(1, 1);
    const w2 = await connect(3, 2);
    hub.schedule(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushPromises();
    expect(w1.postMessage).toHaveBeenCalledTimes(2);
    expect(w2.postMessage).toHaveBeenCalledTimes(1);
  });

  it('scheduleAll refreshes every window with a bar', async () => {
    const w1 = await connect(1, 1);
    const w2 = await connect(3, 2);
    hub.scheduleAll();
    await vi.advanceTimersByTimeAsync(50);
    await flushPromises();
    expect(w1.postMessage).toHaveBeenCalledTimes(2);
    expect(w2.postMessage).toHaveBeenCalledTimes(2);
  });

  it('stops pushing after the port disconnects', async () => {
    const port = await connect(1, 1);
    port.onDisconnect.emit();
    hub.schedule(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushPromises();
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    expect(hub.clientFor(port)).toBeUndefined();
  });

  it('retargets a bar whose tab moved to another window', async () => {
    const port = await connect(1, 1);
    api.state.tabs[0] = makeTab({ id: 1, index: 1, windowId: 2 });
    hub.retarget(1, 2);
    hub.schedule(2);
    await vi.advanceTimersByTimeAsync(50);
    await flushPromises();
    expect(lastSnapshot(port).tabs.map((t) => t.id)).toEqual([3, 1]);
    expect(hub.clientFor(port)).toEqual({ tabId: 1, windowId: 2 });
  });

  it('ignores WINDOW_ID_NONE', async () => {
    hub.schedule(-1);
    await vi.advanceTimersByTimeAsync(50);
    expect(api.tabs.query).not.toHaveBeenCalled();
  });

  it('survives a postMessage on a dead port', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const port = createPort();
    port.postMessage.mockImplementation(() => {
      throw new Error('Attempting to use a disconnected port object');
    });
    hub.add(port, { tabId: 1, windowId: 1 });
    await flushPromises();
    expect(warn).toHaveBeenCalled();
  });

  it('logs, not throws, when querying tabs fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.tabs.query.mockRejectedValueOnce(new Error('boom'));
    await connect(1, 1);
    expect(error).toHaveBeenCalledWith('[hover-helper]', 'push failed', expect.any(Error));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/hub.test.js` → Expected: FAIL — module not found.

- [ ] **Step 3: Implement `background/hub.js`**

```js
// @ts-check
import { BROADCAST_DEBOUNCE_MS, MSG } from './constants.js';
import { logger } from './logger.js';
import { buildSnapshot } from './tabModel.js';

/** @typedef {ReturnType<typeof createHub>} Hub */

/**
 * Tracks connected bars and pushes each a fresh snapshot when its window changes. Bursts of
 * events within `debounceMs` collapse into one push per window.
 *
 * @param {{ api: typeof chrome, debounceMs?: number }} deps
 */
export function createHub({ api, debounceMs = BROADCAST_DEBOUNCE_MS }) {
  /** @type {Map<chrome.runtime.Port, ClientInfo>} */
  const clients = new Map();
  /** @type {Map<number, ReturnType<typeof setTimeout>>} */
  const timers = new Map();

  /** @param {chrome.runtime.Port[]} ports @param {number} windowId */
  async function push(ports, windowId) {
    const [tabs, groups] = await Promise.all([
      api.tabs.query({ windowId }),
      api.tabGroups.query({ windowId }),
    ]);
    for (const port of ports) {
      const client = clients.get(port);
      if (client) send(port, buildSnapshot({ tabs, groups, tabId: client.tabId }));
    }
  }

  /** @param {chrome.runtime.Port[]} ports @param {number} windowId */
  function pushSafely(ports, windowId) {
    push(ports, windowId).catch((err) => logger.error('push failed', err));
  }

  /** @param {number} windowId */
  function flush(windowId) {
    timers.delete(windowId);
    const ports = [...clients].filter(([, c]) => c.windowId === windowId).map(([port]) => port);
    if (ports.length > 0) pushSafely(ports, windowId);
  }

  /** @param {number} windowId */
  function schedule(windowId) {
    if (windowId < 0) return; // chrome.windows.WINDOW_ID_NONE
    clearTimeout(timers.get(windowId));
    timers.set(windowId, setTimeout(() => flush(windowId), debounceMs));
  }

  return {
    /** @param {chrome.runtime.Port} port @param {ClientInfo} client */
    add(port, client) {
      clients.set(port, client);
      port.onDisconnect.addListener(() => clients.delete(port));
      pushSafely([port], client.windowId);
    },
    /** @param {chrome.runtime.Port} port */
    clientFor: (port) => clients.get(port),
    schedule,
    scheduleAll() {
      new Set([...clients.values()].map((c) => c.windowId)).forEach(schedule);
    },
    /** @param {number} tabId @param {number} windowId */
    retarget(tabId, windowId) {
      for (const client of clients.values()) {
        if (client.tabId === tabId) client.windowId = windowId;
      }
    },
  };
}

/**
 * @param {chrome.runtime.Port} port
 * @param {Snapshot} snapshot
 */
function send(port, snapshot) {
  /** @type {ServerMessage} */
  const message = { type: MSG.SNAPSHOT, snapshot };
  try {
    port.postMessage(message);
  } catch (err) {
    logger.warn('dropping snapshot for disconnected port', err);
  }
}
```

- [ ] **Step 4: Run tests and checks**

Run: `npx vitest run tests/hub.test.js` → Expected: 9 passed.
Run: `npm run format && npm run lint && npm run typecheck` → Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add background/hub.js tests/hub.test.js
git commit -m "feat(background): push debounced snapshots to connected bars

Opening several links fires many tab events at once; debouncing per
window sends each bar one update instead of a flicker of them."
```

---

### Task 5: Background wiring and service-worker entry

**Files:**
- Create: `background/register.js`, `background/service-worker.js`, `tests/register.test.js`

**Interfaces:**
- Consumes: `createHub`, `handleAction`, `identifyClient`, `parseClientMessage`, `logger`.
- Produces: `registerBackground(api: typeof chrome): Hub`; the service worker entry calls it with
  the real `chrome`. Manifest (Task 11) points at `background/service-worker.js` with `"type": "module"`.

- [ ] **Step 1: Write failing test `tests/register.test.js`**

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBackground } from '../background/register.js';
import { createChrome, createPort, flushPromises, makeTab } from './helpers/chrome.js';

let api;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  api = createChrome({
    tabs: [makeTab({ id: 1, groupId: 10 }), makeTab({ id: 2, index: 1, groupId: 10 })],
    groups: [{ id: 10, title: 'Work', color: 'blue', windowId: 1 }],
  });
  registerBackground(api);
});

afterEach(() => vi.useRealTimers());

async function connect(opts) {
  const port = createPort(opts);
  api.runtime.onConnect.emit(port);
  await flushPromises();
  return port;
}

async function settle() {
  await vi.advanceTimersByTimeAsync(50);
  await flushPromises();
}

describe('registerBackground', () => {
  it('accepts our bar and sends a snapshot', async () => {
    const port = await connect();
    expect(port.postMessage).toHaveBeenCalledTimes(1);
  });

  it('disconnects ports that fail identification', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const port = await connect({ name: 'intruder' });
    expect(port.disconnect).toHaveBeenCalled();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it('routes valid messages to actions and drops invalid ones', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const port = await connect();
    port.onMessage.emit({ type: 'activate', tabId: 2 });
    port.onMessage.emit({ type: 'activate', tabId: 'x' });
    await flushPromises();
    expect(api.tabs.update).toHaveBeenCalledWith(2, { active: true });
    expect(warn).toHaveBeenCalledWith('[hover-helper]', 'dropped invalid message');
  });

  it('refreshes on relevant tab updates only', async () => {
    const port = await connect();
    api.tabs.onUpdated.emit(1, { status: 'loading' }, makeTab({ id: 1 }));
    await settle();
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    api.tabs.onUpdated.emit(1, { title: 'New' }, makeTab({ id: 1 }));
    await settle();
    expect(port.postMessage).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['onCreated', () => api.tabs.onCreated.emit(makeTab({ id: 5 }))],
    ['onRemoved', () => api.tabs.onRemoved.emit(5, { windowId: 1, isWindowClosing: false })],
    ['onMoved', () => api.tabs.onMoved.emit(1, { windowId: 1, fromIndex: 0, toIndex: 1 })],
    ['onDetached', () => api.tabs.onDetached.emit(5, { oldWindowId: 1, oldPosition: 0 })],
    ['onReplaced', () => api.tabs.onReplaced.emit(6, 5)],
    ['group onUpdated', () => api.tabGroups.onUpdated.emit({ id: 10, windowId: 1 })],
    ['group onRemoved', () => api.tabGroups.onRemoved.emit({ id: 10, windowId: 1 })],
    ['group onMoved', () => api.tabGroups.onMoved.emit({ id: 10, windowId: 1 })],
  ])('refreshes on %s', async (_name, fire) => {
    const port = await connect();
    fire();
    await settle();
    expect(port.postMessage).toHaveBeenCalledTimes(2);
  });

  it('follows a tab dragged into another window', async () => {
    const port = await connect();
    api.state.tabs[0] = makeTab({ id: 1, windowId: 2 });
    api.tabs.onAttached.emit(1, { newWindowId: 2, newPosition: 0 });
    await settle();
    const snapshot = port.postMessage.mock.calls.at(-1)[0].snapshot;
    expect(snapshot).toEqual({
      group: null,
      tabs: [expect.objectContaining({ id: 1, active: true })],
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/register.test.js` → Expected: FAIL — module not found.

- [ ] **Step 3: Implement `background/register.js`**

```js
// @ts-check
import { handleAction } from './actions.js';
import { createHub } from './hub.js';
import { logger } from './logger.js';
import { identifyClient, parseClientMessage } from './messages.js';

/** @typedef {import('./hub.js').Hub} Hub */

/** tabs.onUpdated fields that change what a bar displays. */
const RELEVANT_UPDATES = ['title', 'favIconUrl', 'groupId', 'pinned', 'url'];

/**
 * Wires bar connections and Chrome tab/group events. Must run synchronously at service-worker
 * start so Chrome can wake the worker for these events.
 * @param {typeof chrome} api
 * @returns {Hub}
 */
export function registerBackground(api) {
  const hub = createHub({ api });
  api.runtime.onConnect.addListener((port) => acceptPort(port, hub, api));
  registerTabEvents(api, hub);
  registerGroupEvents(api, hub);
  return hub;
}

/**
 * @param {chrome.runtime.Port} port
 * @param {Hub} hub
 * @param {typeof chrome} api
 */
function acceptPort(port, hub, api) {
  const client = identifyClient(port, api.runtime.id);
  if (!client) {
    logger.warn('rejected port', port.name);
    port.disconnect();
    return;
  }
  port.onMessage.addListener((raw) => {
    const msg = parseClientMessage(raw);
    const current = hub.clientFor(port);
    if (!msg || !current) {
      logger.warn('dropped invalid message');
      return;
    }
    void handleAction(msg, current, api);
  });
  hub.add(port, client);
}

/** @param {typeof chrome} api @param {Hub} hub */
function registerTabEvents(api, hub) {
  const { tabs } = api;
  tabs.onCreated.addListener((tab) => hub.schedule(tab.windowId));
  tabs.onRemoved.addListener((_id, info) => hub.schedule(info.windowId));
  tabs.onMoved.addListener((_id, info) => hub.schedule(info.windowId));
  tabs.onUpdated.addListener((_id, change, tab) => {
    if (RELEVANT_UPDATES.some((key) => key in change)) hub.schedule(tab.windowId);
  });
  tabs.onDetached.addListener((_id, info) => hub.schedule(info.oldWindowId));
  tabs.onAttached.addListener((id, info) => {
    hub.retarget(id, info.newWindowId);
    hub.schedule(info.newWindowId);
  });
  // Prerender swaps a tab's id; the window isn't in the payload, so refresh all.
  tabs.onReplaced.addListener(() => hub.scheduleAll());
}

/** @param {typeof chrome} api @param {Hub} hub */
function registerGroupEvents(api, hub) {
  /** @param {chrome.tabGroups.TabGroup} group */
  const onGroupChange = (group) => hub.schedule(group.windowId);
  api.tabGroups.onUpdated.addListener(onGroupChange);
  api.tabGroups.onRemoved.addListener(onGroupChange);
  api.tabGroups.onMoved.addListener(onGroupChange);
}
```

- [ ] **Step 4: Implement `background/service-worker.js`**

```js
// @ts-check
import { registerBackground } from './register.js';

registerBackground(chrome);
```

- [ ] **Step 5: Run tests and checks**

Run: `npx vitest run tests/register.test.js` → Expected: all pass.
Run: `npm run format && npm run lint && npm run typecheck` → Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add background/register.js background/service-worker.js tests/register.test.js
git commit -m "feat(background): wire tab and group events to the hub

Listening to every event that can change a bar's contents (including
cross-window drags) keeps bars truthful without polling."
```

---

### Task 6: Content core, formatting helpers and the cross-context contract

**Files:**
- Create: `types/content.d.ts`, `content/core.js`, `content/format.js`,
  `tests/helpers/content.js`, `tests/format.test.js`, `tests/contract.test.js`

**Interfaces:**
- Consumes: `PORT_NAME`, `MSG` from `background/constants.js` (test only).
- Produces (on `globalThis.HoverHelper`):
  - `constants`: `PORT_NAME`, `MSG`, `HOST_ID='hover-helper-root'`,
    `STORAGE_KEY='hoverHelper.collapsed'`, `TITLE_MAX_CHARS=24`,
    `RECONNECT_DELAYS_MS=[100,1000,5000]`, `UNGROUPED_LABEL='Ungrouped'`, `NEUTRAL_COLOR`,
    `GROUP_COLORS`.
  - `logger.warn/error`.
  - `truncate(text, max): string`, `safeFavicon(url): string|null`,
    `groupLabel(group): string`, `groupColor(group): string`.
  - Test helper `loadContent(...names): Promise<HoverHelperNamespace>` — imports
    `content/<name>.js` in order.

- [ ] **Step 1: Create `types/content.d.ts`**

```ts
// Ambient types for the classic content scripts, which share one global namespace.

interface ContentConstants {
  PORT_NAME: string;
  MSG: Readonly<{ SNAPSHOT: 'snapshot'; ACTIVATE: 'activate'; CLOSE: 'close'; NEW: 'new' }>;
  HOST_ID: string;
  STORAGE_KEY: string;
  TITLE_MAX_CHARS: number;
  RECONNECT_DELAYS_MS: readonly number[];
  UNGROUPED_LABEL: string;
  NEUTRAL_COLOR: string;
  GROUP_COLORS: Readonly<Record<string, string>>;
}

interface Logger {
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

interface BarView {
  snapshot: Snapshot;
  collapsed: boolean;
}

interface BarHandlers {
  onActivate(tabId: number): void;
  onClose(tabId: number): void;
  onNew(): void;
  onToggleCollapse(): void;
}

interface Connection {
  start(): void;
  stop(): void;
  send(msg: ClientMessage): void;
}

interface ConnectionOptions {
  onSnapshot(snapshot: Snapshot): void;
  onOrphaned(): void;
  runtime: typeof chrome.runtime;
  doc: Document;
}

interface MountOptions {
  doc: Document;
  runtime: typeof chrome.runtime;
  storage: chrome.storage.StorageArea;
  storageEvents: typeof chrome.storage.onChanged;
  shadowMode: ShadowRootMode;
}

interface HoverHelperNamespace {
  constants: ContentConstants;
  logger: Logger;
  styles: string;
  truncate(text: string, max: number): string;
  safeFavicon(url: string | null): string | null;
  groupLabel(group: BarGroup | null): string;
  groupColor(group: BarGroup | null): string;
  dom: Readonly<{ buildBar(view: BarView): HTMLElement; buildPill(view: BarView): HTMLElement }>;
  render(mount: HTMLElement, view: BarView): void;
  bindEvents(mount: HTMLElement, handlers: BarHandlers): void;
  createConnection(options: ConnectionOptions): Connection;
  mountBar(options: MountOptions): { host: HTMLElement; connection: Connection } | null;
}

declare var HoverHelper: HoverHelperNamespace;
```

- [ ] **Step 2: Create `tests/helpers/content.js`**

```js
/**
 * Content scripts are classic IIFEs that attach to globalThis.HoverHelper. Importing them as
 * modules executes them once per test file, in the order given (mirror manifest order).
 * @param {...string} names - file names under content/ without ".js"
 */
export async function loadContent(...names) {
  for (const name of names) await import(`../../content/${name}.js`);
  return globalThis.HoverHelper;
}
```

- [ ] **Step 3: Write failing tests**

`tests/format.test.js`:

```js
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadContent } from './helpers/content.js';

let ns;
beforeAll(async () => {
  ns = await loadContent('core', 'format');
});

describe('truncate', () => {
  it('keeps short text', () => expect(ns.truncate('Inbox', 24)).toBe('Inbox'));
  it('cuts long text with an ellipsis at the limit', () => {
    const out = ns.truncate('A very long title that keeps going', 24);
    expect(out).toBe('A very long title that…');
    expect([...out]).toHaveLength(23);
  });
  it('never splits an emoji', () => {
    expect(ns.truncate('😀😀😀😀', 3)).toBe('😀😀…');
  });
});

describe('safeFavicon', () => {
  it.each([
    ['https://a.com/f.ico', 'https://a.com/f.ico'],
    ['http://a.com/f.ico', 'http://a.com/f.ico'],
    ['data:image/png;base64,AAAA', 'data:image/png;base64,AAAA'],
    ['javascript:alert(1)', null],
    ['data:text/html,<script>', null],
    ['chrome://favicon/x', null],
    ['', null],
    [null, null],
  ])('%s → %s', (input, expected) => expect(ns.safeFavicon(input)).toBe(expected));
});

describe('group helpers', () => {
  it('labels and colours a group', () => {
    const group = { id: 1, title: 'Work', color: 'blue' };
    expect(ns.groupLabel(group)).toBe('Work');
    expect(ns.groupColor(group)).toBe(ns.constants.GROUP_COLORS.blue);
  });
  it('labels ungrouped tabs and uses the neutral colour', () => {
    expect(ns.groupLabel(null)).toBe('Ungrouped');
    expect(ns.groupColor(null)).toBe(ns.constants.NEUTRAL_COLOR);
  });
  it('falls back to neutral for an unknown colour', () => {
    expect(ns.groupColor({ id: 1, title: 'x', color: 'chartreuse' })).toBe(
      ns.constants.NEUTRAL_COLOR,
    );
  });
});

describe('logger', () => {
  it('prefixes lines', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    ns.logger.warn('w');
    ns.logger.error('e');
    expect(warn).toHaveBeenCalledWith('[hover-helper]', 'w');
    expect(error).toHaveBeenCalledWith('[hover-helper]', 'e');
  });
});
```

`tests/contract.test.js`:

```js
import { expect, it } from 'vitest';
import { MSG, PORT_NAME } from '../background/constants.js';
import { loadContent } from './helpers/content.js';

it('content and background agree on the port name and message types', async () => {
  const { constants } = await loadContent('core');
  expect(constants.PORT_NAME).toBe(PORT_NAME);
  expect({ ...constants.MSG }).toEqual({ ...MSG });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run tests/format.test.js tests/contract.test.js` → Expected: FAIL — cannot find `content/core.js`.

- [ ] **Step 5: Implement `content/core.js`**

```js
// @ts-check
// Shared constants and logger for the content scripts. Loaded first (see manifest.json).
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));

  ns.constants = Object.freeze({
    /** Must equal background/constants.js PORT_NAME (tests/contract.test.js). */
    PORT_NAME: 'hover-helper',
    MSG: Object.freeze({
      SNAPSHOT: /** @type {const} */ ('snapshot'),
      ACTIVATE: /** @type {const} */ ('activate'),
      CLOSE: /** @type {const} */ ('close'),
      NEW: /** @type {const} */ ('new'),
    }),
    HOST_ID: 'hover-helper-root',
    STORAGE_KEY: 'hoverHelper.collapsed',
    TITLE_MAX_CHARS: 24,
    RECONNECT_DELAYS_MS: Object.freeze([100, 1000, 5000]),
    UNGROUPED_LABEL: 'Ungrouped',
    NEUTRAL_COLOR: '#80868b',
    /** chrome.tabGroups.Color → the swatch Chrome draws for it. */
    GROUP_COLORS: Object.freeze({
      grey: '#5f6368',
      blue: '#1a73e8',
      red: '#d93025',
      yellow: '#f9ab00',
      green: '#188038',
      pink: '#d01884',
      purple: '#a142f4',
      cyan: '#007b83',
      orange: '#fa903e',
    }),
  });

  const PREFIX = '[hover-helper]';
  ns.logger = Object.freeze({
    /** @param {...unknown} args */
    warn: (...args) => console.warn(PREFIX, ...args),
    /** @param {...unknown} args */
    error: (...args) => console.error(PREFIX, ...args),
  });
})();
```

- [ ] **Step 6: Implement `content/format.js`**

```js
// @ts-check
// Pure display helpers for untrusted tab data.
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));
  const { GROUP_COLORS, NEUTRAL_COLOR, UNGROUPED_LABEL } = ns.constants;
  const SAFE_FAVICON = /^(https?:|data:image\/)/i;
  const ELLIPSIS = '…';

  /** Shortens by code points (not UTF-16 units) so emoji are never split. */
  ns.truncate = (text, max) => {
    const chars = [...text];
    if (chars.length <= max) return text;
    return chars.slice(0, max - 1).join('').trimEnd() + ELLIPSIS;
  };

  /** Only web and inline-image URLs may reach an <img src>. */
  ns.safeFavicon = (url) => (url && SAFE_FAVICON.test(url) ? url : null);

  ns.groupLabel = (group) => (group ? group.title : UNGROUPED_LABEL);

  ns.groupColor = (group) => (group ? (GROUP_COLORS[group.color] ?? NEUTRAL_COLOR) : NEUTRAL_COLOR);
})();
```

- [ ] **Step 7: Run tests and checks**

Run: `npx vitest run tests/format.test.js tests/contract.test.js` → Expected: all pass.
Run: `npm run format && npm run lint && npm run typecheck` → Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add types/content.d.ts content/core.js content/format.js tests/helpers/content.js tests/format.test.js tests/contract.test.js
git commit -m "feat(content): add shared constants and safe display helpers

Content scripts cannot import the background's ES modules, so the
protocol constants are duplicated and a contract test keeps both
sides from drifting apart."
```

---

### Task 7: Bar styles, DOM builders and render

**Files:**
- Create: `content/styles.js`, `content/dom.js`, `content/render.js`, `tests/render.test.js`

**Interfaces:**
- Consumes: `ns.constants`, `ns.truncate`, `ns.safeFavicon`, `ns.groupLabel`, `ns.groupColor`.
- Produces:
  - `ns.styles: string`.
  - `ns.dom.buildBar(view)`, `ns.dom.buildPill(view)`.
  - `ns.render(mount: HTMLElement, view: BarView): void`.
  - DOM contract relied on by Task 8: every actionable element has `data-action` ∈
    `activate | close | new | collapse | expand`; tab and close elements carry `data-tab-id`;
    tabs are `[role="tab"]` inside one `[role="tablist"]`; each chip is `.hh-chip`.

- [ ] **Step 1: Write failing test `tests/render.test.js`**

```js
// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadContent } from './helpers/content.js';

let ns;
let mount;
let shadow;

beforeAll(async () => {
  ns = await loadContent('core', 'format', 'styles', 'dom', 'render');
});

beforeEach(() => {
  document.body.replaceChildren();
  const host = document.createElement('div');
  document.body.append(host);
  shadow = host.attachShadow({ mode: 'open' });
  mount = document.createElement('div');
  shadow.append(mount);
});

const tab = (id, extra = {}) => ({
  id,
  title: `Tab ${id}`,
  favIconUrl: `https://site${id}.test/favicon.ico`,
  active: false,
  ...extra,
});
const grouped = {
  group: { id: 10, title: 'Research', color: 'blue' },
  tabs: [tab(1), tab(2, { active: true }), tab(3)],
};
const tabsIn = () => [...mount.querySelectorAll('[role="tab"]')];

describe('render (expanded)', () => {
  it('shows the group label, one tab per entry, + and collapse', () => {
    ns.render(mount, { snapshot: grouped, collapsed: false });
    expect(mount.querySelector('.hh-label').textContent).toBe('Research');
    expect(tabsIn().map((t) => t.textContent)).toEqual(['Tab 1', 'Tab 2', 'Tab 3']);
    expect(mount.querySelector('[role="tablist"]').getAttribute('aria-label')).toBe(
      'Tabs in Research',
    );
    expect(mount.querySelector('[data-action="new"]').getAttribute('aria-label')).toBe(
      'New tab in Research',
    );
    expect(mount.querySelector('[data-action="collapse"]').getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('highlights the active tab with roving tabindex', () => {
    ns.render(mount, { snapshot: grouped, collapsed: false });
    expect(tabsIn().map((t) => t.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(tabsIn().map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('makes the first tab focusable when none is active', () => {
    ns.render(mount, { snapshot: { group: null, tabs: [tab(1), tab(2)] }, collapsed: false });
    expect(tabsIn().map((t) => t.tabIndex)).toEqual([0, -1]);
  });

  it('labels ungrouped tabs and sets the group colour variable', () => {
    ns.render(mount, { snapshot: { group: null, tabs: [tab(1)] }, collapsed: false });
    expect(mount.querySelector('.hh-label').textContent).toBe('Ungrouped');
    ns.render(mount, { snapshot: grouped, collapsed: false });
    expect(mount.querySelector('.hh-bar').style.getPropertyValue('--hh-group')).toBe(
      ns.constants.GROUP_COLORS.blue,
    );
  });

  it('truncates long titles but keeps the full title as a tooltip', () => {
    const long = 'An extremely long page title that will not fit';
    ns.render(mount, { snapshot: { group: null, tabs: [tab(1, { title: long })] }, collapsed: false });
    expect(tabsIn()[0].textContent).toBe(ns.truncate(long, 24));
    expect(tabsIn()[0].title).toBe(long);
  });

  it('renders hostile titles as inert text', () => {
    const evil = '<img src=x onerror="window.pwned=1">';
    ns.render(mount, { snapshot: { group: null, tabs: [tab(1, { title: evil })] }, collapsed: false });
    expect(mount.querySelector('img[src="x"]')).toBeNull();
    expect(tabsIn()[0].title).toBe(evil);
    expect(window.pwned).toBeUndefined();
  });

  it('uses a placeholder for unsafe or broken favicons', () => {
    const tabs = [tab(1), tab(2, { favIconUrl: 'javascript:alert(1)' }), tab(3, { favIconUrl: null })];
    ns.render(mount, { snapshot: { group: null, tabs }, collapsed: false });
    expect(mount.querySelectorAll('img.hh-favicon')).toHaveLength(1);
    expect(mount.querySelectorAll('.hh-favicon--placeholder')).toHaveLength(2);
    mount.querySelector('img.hh-favicon').dispatchEvent(new Event('error'));
    expect(mount.querySelectorAll('.hh-favicon--placeholder')).toHaveLength(3);
  });

  it('gives each close button an accessible name and the tab id', () => {
    ns.render(mount, { snapshot: grouped, collapsed: false });
    const close = mount.querySelector('[data-action="close"][data-tab-id="3"]');
    expect(close.getAttribute('aria-label')).toBe('Close Tab 3');
    expect(close.tabIndex).toBe(-1);
  });
});

describe('render (collapsed)', () => {
  it('shows only a pill with the count', () => {
    ns.render(mount, { snapshot: grouped, collapsed: true });
    const pill = mount.querySelector('[data-action="expand"]');
    expect(mount.querySelector('.hh-bar')).toBeNull();
    expect(pill.textContent).toBe('3');
    expect(pill.getAttribute('aria-label')).toBe('Show tab bar: 3 tabs in Research');
    expect(pill.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('render (focus)', () => {
  it('keeps focus on the same tab across re-renders', () => {
    ns.render(mount, { snapshot: grouped, collapsed: false });
    tabsIn()[2].focus();
    ns.render(mount, { snapshot: { ...grouped, tabs: [tab(0), ...grouped.tabs] }, collapsed: false });
    expect(shadow.activeElement.getAttribute('data-tab-id')).toBe('3');
  });

  it('moves focus between the collapse button and the pill when toggling', () => {
    ns.render(mount, { snapshot: grouped, collapsed: false });
    mount.querySelector('[data-action="collapse"]').focus();
    ns.render(mount, { snapshot: grouped, collapsed: true });
    expect(shadow.activeElement.getAttribute('data-action')).toBe('expand');
    ns.render(mount, { snapshot: grouped, collapsed: false });
    expect(shadow.activeElement.getAttribute('data-action')).toBe('collapse');
  });
});

describe('styles', () => {
  it('defines light and dark tokens and a visible focus ring', () => {
    expect(ns.styles).toContain('prefers-color-scheme: dark');
    expect(ns.styles).toContain(':focus-visible');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/render.test.js` → Expected: FAIL — cannot find `content/styles.js`.

- [ ] **Step 3: Implement `content/styles.js`**

```js
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
```

- [ ] **Step 4: Implement `content/dom.js`**

```js
// @ts-check
// Element builders. Every piece of tab data goes through textContent/attributes, never HTML.
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));
  const { TITLE_MAX_CHARS } = ns.constants;

  /**
   * @template {keyof HTMLElementTagNameMap} K
   * @param {K} tag
   * @param {string} className
   * @param {string} [text]
   * @returns {HTMLElementTagNameMap[K]}
   */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /** @param {string} className @param {string} text @param {string} label @param {string} action */
  function button(className, text, label, action) {
    const node = el('button', `hh-btn ${className}`, text);
    node.type = 'button';
    node.setAttribute('aria-label', label);
    node.dataset.action = action;
    return node;
  }

  function placeholderIcon() {
    const node = el('span', 'hh-favicon hh-favicon--placeholder');
    node.setAttribute('aria-hidden', 'true');
    return node;
  }

  /** @param {string | null} url */
  function favicon(url) {
    const safe = ns.safeFavicon(url);
    if (!safe) return placeholderIcon();
    const img = el('img', 'hh-favicon');
    img.alt = '';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.replaceWith(placeholderIcon()), { once: true });
    img.src = safe;
    return img;
  }

  /** @param {BarTab} tab @param {boolean} focusable */
  function chip(tab, focusable) {
    const wrapper = el('div', 'hh-chip');
    wrapper.setAttribute('role', 'presentation');
    if (tab.active) wrapper.dataset.active = '';
    const tabEl = el('div', 'hh-tab');
    tabEl.setAttribute('role', 'tab');
    tabEl.setAttribute('aria-selected', String(tab.active));
    tabEl.tabIndex = focusable ? 0 : -1;
    tabEl.title = tab.title;
    tabEl.dataset.action = 'activate';
    tabEl.dataset.tabId = String(tab.id);
    tabEl.append(favicon(tab.favIconUrl), el('span', 'hh-title', ns.truncate(tab.title, TITLE_MAX_CHARS)));
    const close = button('hh-close', '×', `Close ${tab.title}`, 'close');
    close.dataset.tabId = String(tab.id);
    close.tabIndex = -1; // keyboard users close with Delete on the focused tab
    wrapper.append(tabEl, close);
    return wrapper;
  }

  /** @param {BarTab[]} tabs @param {string} label */
  function tabList(tabs, label) {
    const list = el('div', 'hh-tabs');
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', `Tabs in ${label}`);
    const focusIndex = Math.max(0, tabs.findIndex((t) => t.active));
    list.append(...tabs.map((tab, i) => chip(tab, i === focusIndex)));
    return list;
  }

  /** @param {string} label */
  function groupLabel(label) {
    const node = el('div', 'hh-label');
    node.append(el('span', 'hh-dot'), el('span', '', label));
    return node;
  }

  /** @param {BarView} view */
  function buildBar({ snapshot }) {
    const label = ns.groupLabel(snapshot.group);
    const bar = el('div', 'hh-bar');
    bar.style.setProperty('--hh-group', ns.groupColor(snapshot.group));
    const collapse = button('hh-collapse', '⌄', 'Collapse tab bar', 'collapse');
    collapse.setAttribute('aria-expanded', 'true');
    bar.append(
      groupLabel(label),
      tabList(snapshot.tabs, label),
      button('hh-new', '+', `New tab in ${label}`, 'new'),
      collapse,
    );
    return bar;
  }

  /** @param {BarView} view */
  function buildPill({ snapshot }) {
    const count = snapshot.tabs.length;
    const pill = el('button', 'hh-pill');
    pill.type = 'button';
    pill.dataset.action = 'expand';
    pill.setAttribute('aria-expanded', 'false');
    pill.setAttribute('aria-label', `Show tab bar: ${count} tabs in ${ns.groupLabel(snapshot.group)}`);
    pill.style.setProperty('--hh-group', ns.groupColor(snapshot.group));
    pill.append(el('span', 'hh-dot'), el('span', '', String(count)));
    return pill;
  }

  ns.dom = Object.freeze({ buildBar, buildPill });
})();
```

- [ ] **Step 5: Implement `content/render.js`**

```js
// @ts-check
// Re-renders the bar for each snapshot while preserving keyboard focus and tab-list scroll.
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));

  /** Collapsing focuses the pill and expanding focuses the collapse button. */
  const TOGGLE_PARTNER = Object.freeze(/** @type {Record<string, string>} */ ({
    collapse: 'expand',
    expand: 'collapse',
  }));

  /** @typedef {{ action: string, tabId: string | null }} FocusKey */

  ns.render = (mount, view) => {
    const focus = focusKey(mount);
    const previousScroll = mount.querySelector('[role="tablist"]')?.scrollLeft;
    const root = document.createElement('div');
    root.className = 'hh-root';
    root.append(view.collapsed ? ns.dom.buildPill(view) : ns.dom.buildBar(view));
    mount.replaceChildren(root);
    restoreFocus(mount, focus);
    if (!view.collapsed) restoreScroll(mount, previousScroll);
  };

  /** @param {HTMLElement} mount @returns {FocusKey | null} */
  function focusKey(mount) {
    const active = /** @type {Document | ShadowRoot} */ (mount.getRootNode()).activeElement;
    if (!active || !mount.contains(active)) return null;
    const action = active.getAttribute('data-action');
    return action ? { action, tabId: active.getAttribute('data-tab-id') } : null;
  }

  /** @param {HTMLElement} mount @param {FocusKey | null} key */
  function restoreFocus(mount, key) {
    if (!key) return;
    const selector = key.tabId
      ? `[data-action="${key.action}"][data-tab-id="${key.tabId}"]`
      : `[data-action="${TOGGLE_PARTNER[key.action] ?? key.action}"]`;
    const target = mount.querySelector(selector);
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  }

  /**
   * Keeps the user's horizontal scroll position; on first render, centres the active tab.
   * @param {HTMLElement} mount
   * @param {number | undefined} previous
   */
  function restoreScroll(mount, previous) {
    const list = mount.querySelector('[role="tablist"]');
    if (!list) return;
    if (previous !== undefined) {
      list.scrollLeft = previous;
      return;
    }
    const active = list.querySelector('[aria-selected="true"]');
    if (!active) return;
    const listBox = list.getBoundingClientRect();
    const tabBox = active.getBoundingClientRect();
    list.scrollLeft += tabBox.left - listBox.left - (listBox.width - tabBox.width) / 2;
  }
})();
```

- [ ] **Step 6: Run tests and checks**

Run: `npx vitest run tests/render.test.js` → Expected: all pass.
Run: `npm run format && npm run lint && npm run typecheck` → Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add content/styles.js content/dom.js content/render.js tests/render.test.js
git commit -m "feat(content): render the horizontal tab bar and collapsed pill

Tab titles and favicons are page-controlled, so the bar is built from
text nodes and allow-listed URLs only; focus and scroll survive the
re-render that every snapshot triggers."
```

---

### Task 8: Mouse and keyboard interaction

**Files:**
- Create: `content/events.js`, `tests/events.test.js`

**Interfaces:**
- Consumes: DOM contract from Task 7 (`data-action`, `data-tab-id`, `[role="tab"]`, `.hh-chip`).
- Produces: `ns.bindEvents(mount: HTMLElement, handlers: BarHandlers): void` — bind once; works
  across re-renders via delegation.

- [ ] **Step 1: Write failing test `tests/events.test.js`**

```js
// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContent } from './helpers/content.js';

let ns;
let mount;
let shadow;
let handlers;

const snapshot = {
  group: { id: 10, title: 'Work', color: 'blue' },
  tabs: [1, 2, 3].map((id) => ({ id, title: `Tab ${id}`, favIconUrl: null, active: id === 2 })),
};

beforeAll(async () => {
  ns = await loadContent('core', 'format', 'styles', 'dom', 'render', 'events');
});

beforeEach(() => {
  document.body.replaceChildren();
  const host = document.createElement('div');
  document.body.append(host);
  shadow = host.attachShadow({ mode: 'open' });
  mount = document.createElement('div');
  shadow.append(mount);
  handlers = {
    onActivate: vi.fn(),
    onClose: vi.fn(),
    onNew: vi.fn(),
    onToggleCollapse: vi.fn(),
  };
  ns.bindEvents(mount, handlers);
  ns.render(mount, { snapshot, collapsed: false });
});

const q = (sel) => mount.querySelector(sel);
const tab = (id) => q(`[role="tab"][data-tab-id="${id}"]`);
const key = (target, k) => {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe('mouse', () => {
  it('activates a tab on click (including on its title)', () => {
    tab(3).querySelector('.hh-title').click();
    expect(handlers.onActivate).toHaveBeenCalledWith(3);
  });

  it('closes via the × button without activating', () => {
    q('[data-action="close"][data-tab-id="1"]').click();
    expect(handlers.onClose).toHaveBeenCalledWith(1);
    expect(handlers.onActivate).not.toHaveBeenCalled();
  });

  it('closes on middle-click and suppresses autoscroll', () => {
    const down = new MouseEvent('mousedown', { button: 1, bubbles: true, cancelable: true });
    tab(2).dispatchEvent(down);
    tab(2).dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
    expect(down.defaultPrevented).toBe(true);
    expect(handlers.onClose).toHaveBeenCalledWith(2);
  });

  it('ignores right-click auxclick', () => {
    tab(2).dispatchEvent(new MouseEvent('auxclick', { button: 2, bubbles: true }));
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it('opens a new tab and toggles collapse', () => {
    q('[data-action="new"]').click();
    q('[data-action="collapse"]').click();
    expect(handlers.onNew).toHaveBeenCalledOnce();
    expect(handlers.onToggleCollapse).toHaveBeenCalledOnce();
  });

  it('expands from the pill after a re-render', () => {
    ns.render(mount, { snapshot, collapsed: true });
    q('[data-action="expand"]').click();
    expect(handlers.onToggleCollapse).toHaveBeenCalledOnce();
  });
});

describe('keyboard', () => {
  it.each(['Enter', ' '])('%j activates the focused tab', (k) => {
    key(tab(1), k);
    expect(handlers.onActivate).toHaveBeenCalledWith(1);
  });

  it.each(['Delete', 'Backspace'])('%s closes the focused tab', (k) => {
    key(tab(3), k);
    expect(handlers.onClose).toHaveBeenCalledWith(3);
  });

  it('moves focus with arrows (wrapping) and Home/End, updating tabindex', () => {
    tab(2).focus();
    key(tab(2), 'ArrowRight');
    expect(shadow.activeElement).toBe(tab(3));
    expect(tab(3).tabIndex).toBe(0);
    expect(tab(2).tabIndex).toBe(-1);
    key(tab(3), 'ArrowRight');
    expect(shadow.activeElement).toBe(tab(1));
    key(tab(1), 'ArrowLeft');
    expect(shadow.activeElement).toBe(tab(3));
    key(tab(3), 'Home');
    expect(shadow.activeElement).toBe(tab(1));
    key(tab(1), 'End');
    expect(shadow.activeElement).toBe(tab(3));
  });

  it('keeps keystrokes inside the bar away from page shortcuts', () => {
    const pageListener = vi.fn();
    document.addEventListener('keydown', pageListener);
    key(tab(1), ' ');
    key(tab(1), 'j');
    document.removeEventListener('keydown', pageListener);
    expect(pageListener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/events.test.js` → Expected: FAIL — cannot find `content/events.js`.

- [ ] **Step 3: Implement `content/events.js`**

```js
// @ts-check
// Delegated mouse + keyboard handling. Bound once on the mount; survives every re-render.
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));
  const MIDDLE_BUTTON = 1;

  ns.bindEvents = (mount, handlers) => {
    mount.addEventListener('click', (e) => onClick(e, handlers));
    mount.addEventListener('mousedown', onMouseDown);
    mount.addEventListener('auxclick', (e) => onAuxClick(e, handlers));
    mount.addEventListener('keydown', (e) => onKeyDown(e, handlers));
  };

  /** @param {Event} event @param {string} selector */
  function closest(event, selector) {
    return event.target instanceof Element ? event.target.closest(selector) : null;
  }

  /** @param {Element} el */
  const tabIdOf = (el) => Number(el.getAttribute('data-tab-id'));

  /** @param {MouseEvent} event @param {BarHandlers} h */
  function onClick(event, h) {
    const el = closest(event, '[data-action]');
    if (!el) return;
    const action = el.getAttribute('data-action');
    if (action === 'activate') h.onActivate(tabIdOf(el));
    else if (action === 'close') h.onClose(tabIdOf(el));
    else if (action === 'new') h.onNew();
    else if (action === 'collapse' || action === 'expand') h.onToggleCollapse();
  }

  /**
   * Stops the browser's middle-click autoscroll so middle-click can mean "close".
   * @param {MouseEvent} event
   */
  function onMouseDown(event) {
    if (event.button === MIDDLE_BUTTON && closest(event, '.hh-chip')) event.preventDefault();
  }

  /** @param {MouseEvent} event @param {BarHandlers} h */
  function onAuxClick(event, h) {
    if (event.button !== MIDDLE_BUTTON) return;
    const tab = closest(event, '.hh-chip')?.querySelector('[role="tab"]');
    if (!tab) return;
    event.preventDefault();
    h.onClose(tabIdOf(tab));
  }

  /** @param {KeyboardEvent} event @param {BarHandlers} h */
  function onKeyDown(event, h) {
    // The bar owns the keyboard while focused; don't let the page's shortcuts see it.
    event.stopPropagation();
    const tab = closest(event, '[role="tab"]');
    if (!(tab instanceof HTMLElement)) return;
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        h.onActivate(tabIdOf(tab));
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        h.onClose(tabIdOf(tab));
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'Home':
      case 'End':
        event.preventDefault();
        moveFocus(tab, event.key);
        break;
      default:
    }
  }

  /**
   * Roving tabindex: exactly one tab is in the page's Tab order.
   * @param {HTMLElement} current
   * @param {string} key
   */
  function moveFocus(current, key) {
    const tabs = [...(current.closest('[role="tablist"]')?.querySelectorAll('[role="tab"]') ?? [])];
    const i = tabs.indexOf(current);
    const step = key === 'ArrowRight' ? 1 : -1;
    let next = (i + step + tabs.length) % tabs.length;
    if (key === 'Home') next = 0;
    if (key === 'End') next = tabs.length - 1;
    const target = tabs[next];
    if (!(target instanceof HTMLElement)) return;
    current.tabIndex = -1;
    target.tabIndex = 0;
    target.focus();
  }
})();
```

- [ ] **Step 4: Run tests and checks**

Run: `npx vitest run tests/events.test.js` → Expected: all pass.
Run: `npm run format && npm run lint && npm run typecheck` → Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add content/events.js tests/events.test.js
git commit -m "feat(content): add click, middle-click and keyboard controls

Middle-click-to-close and roving-tabindex keyboard navigation match
how the native tab strip behaves, and stopping keydown propagation
keeps site shortcuts from firing while the bar has focus."
```

---

### Task 9: Port connection lifecycle

**Files:**
- Create: `content/connection.js`, `tests/connection.test.js`

**Interfaces:**
- Consumes: `ns.constants.PORT_NAME`, `MSG`, `RECONNECT_DELAYS_MS`; `ns.logger`.
- Produces: `ns.createConnection({ onSnapshot, onOrphaned, runtime, doc }): Connection`
  (`start()`, `stop()`, `send(msg)`).

- [ ] **Step 1: Write failing test `tests/connection.test.js`**

```js
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent } from './helpers/chrome.js';
import { loadContent } from './helpers/content.js';

let ns;
let runtime;
let ports;
let doc;
let onSnapshot;
let onOrphaned;
let conn;

function fakePort() {
  const port = { postMessage: vi.fn(), disconnect: vi.fn(), onMessage: createEvent(), onDisconnect: createEvent() };
  ports.push(port);
  return port;
}

function setVisibility(state) {
  doc.visibilityState = state;
  doc.dispatchEvent(new Event('visibilitychange'));
}

beforeAll(async () => {
  ns = await loadContent('core', 'connection');
});

beforeEach(() => {
  vi.useFakeTimers();
  ports = [];
  runtime = { id: 'ext-id', connect: vi.fn(fakePort) };
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  onSnapshot = vi.fn();
  onOrphaned = vi.fn();
  conn = ns.createConnection({ onSnapshot, onOrphaned, runtime, doc });
});

afterEach(() => {
  conn.stop();
  vi.useRealTimers();
});

describe('createConnection', () => {
  it('connects on start when visible', () => {
    conn.start();
    expect(runtime.connect).toHaveBeenCalledWith({ name: 'hover-helper' });
  });

  it('waits until the page becomes visible', () => {
    doc.visibilityState = 'hidden';
    conn.start();
    expect(runtime.connect).not.toHaveBeenCalled();
    setVisibility('visible');
    expect(runtime.connect).toHaveBeenCalledOnce();
  });

  it('drops the port while hidden', () => {
    conn.start();
    setVisibility('hidden');
    expect(ports[0].disconnect).toHaveBeenCalled();
  });

  it('delivers snapshots and ignores other messages', () => {
    conn.start();
    const snapshot = { group: null, tabs: [] };
    ports[0].onMessage.emit({ type: 'snapshot', snapshot });
    ports[0].onMessage.emit({ type: 'other' });
    ports[0].onMessage.emit(null);
    expect(onSnapshot).toHaveBeenCalledOnce();
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('reconnects with backoff 100 → 1000 → 5000 ms and resets after a message', () => {
    conn.start();
    ports[0].onDisconnect.emit();
    vi.advanceTimersByTime(99);
    expect(runtime.connect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(runtime.connect).toHaveBeenCalledTimes(2);
    ports[1].onDisconnect.emit();
    vi.advanceTimersByTime(1000);
    expect(runtime.connect).toHaveBeenCalledTimes(3);
    ports[2].onDisconnect.emit();
    vi.advanceTimersByTime(5000);
    expect(runtime.connect).toHaveBeenCalledTimes(4);
    ports[3].onDisconnect.emit();
    vi.advanceTimersByTime(5000);
    expect(runtime.connect).toHaveBeenCalledTimes(5);
    ports[4].onMessage.emit({ type: 'snapshot', snapshot: { group: null, tabs: [] } });
    ports[4].onDisconnect.emit();
    vi.advanceTimersByTime(100);
    expect(runtime.connect).toHaveBeenCalledTimes(6);
  });

  it('orphans itself when the extension context is gone', () => {
    conn.start();
    delete runtime.id;
    ports[0].onDisconnect.emit();
    vi.advanceTimersByTime(100);
    expect(onOrphaned).toHaveBeenCalledOnce();
    expect(runtime.connect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(onOrphaned).toHaveBeenCalledOnce();
  });

  it('orphans itself when connect throws', () => {
    runtime.connect.mockImplementation(() => {
      throw new Error('Extension context invalidated.');
    });
    conn.start();
    expect(onOrphaned).toHaveBeenCalledOnce();
  });

  it('sends while connected and no-ops otherwise', () => {
    conn.send({ type: 'new' });
    conn.start();
    conn.send({ type: 'new' });
    expect(ports[0].postMessage).toHaveBeenCalledOnce();
  });

  it('treats a failed send as a disconnect', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    conn.start();
    ports[0].postMessage.mockImplementation(() => {
      throw new Error('Attempting to use a disconnected port object');
    });
    conn.send({ type: 'new' });
    vi.advanceTimersByTime(100);
    expect(runtime.connect).toHaveBeenCalledTimes(2);
  });

  it('stop cancels pending reconnects and visibility handling', () => {
    conn.start();
    ports[0].onDisconnect.emit();
    conn.stop();
    vi.advanceTimersByTime(10_000);
    setVisibility('visible');
    expect(runtime.connect).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/connection.test.js` → Expected: FAIL — cannot find `content/connection.js`.

- [ ] **Step 3: Implement `content/connection.js`**

```js
// @ts-check
// Port lifecycle. A bar holds a port only while its page is visible, so the service worker
// serves just the bars a user can see; every (re)connect yields a fresh snapshot.
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));
  const { PORT_NAME, MSG, RECONNECT_DELAYS_MS } = ns.constants;

  ns.createConnection = ({ onSnapshot, onOrphaned, runtime, doc }) => {
    /** @type {chrome.runtime.Port | null} */
    let port = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    let attempt = 0;
    let running = false;

    function connect() {
      if (!running || port || doc.visibilityState !== 'visible') return;
      // runtime.id disappears once the extension is reloaded or removed.
      if (!runtime.id) {
        orphan();
        return;
      }
      try {
        port = runtime.connect({ name: PORT_NAME });
      } catch {
        orphan();
        return;
      }
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(onDisconnect);
    }

    /** @param {unknown} raw */
    function onMessage(raw) {
      attempt = 0;
      const msg = /** @type {Partial<ServerMessage> | null} */ (raw);
      if (msg?.type === MSG.SNAPSHOT && msg.snapshot) onSnapshot(msg.snapshot);
    }

    function onDisconnect() {
      port = null;
      if (!running) return;
      const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
      attempt += 1;
      clearTimeout(timer);
      timer = setTimeout(connect, delay);
    }

    function disconnect() {
      clearTimeout(timer);
      port?.disconnect();
      port = null;
    }

    function onVisibility() {
      if (doc.visibilityState === 'visible') connect();
      else disconnect();
    }

    function orphan() {
      stop();
      onOrphaned();
    }

    function start() {
      if (running) return;
      running = true;
      doc.addEventListener('visibilitychange', onVisibility);
      connect();
    }

    function stop() {
      running = false;
      doc.removeEventListener('visibilitychange', onVisibility);
      disconnect();
    }

    /** @param {ClientMessage} msg */
    function send(msg) {
      if (!port) return;
      try {
        port.postMessage(msg);
      } catch (err) {
        ns.logger.warn('send failed; reconnecting', err);
        onDisconnect();
      }
    }

    return { start, stop, send };
  };
})();
```

- [ ] **Step 4: Run tests and checks**

Run: `npx vitest run tests/connection.test.js` → Expected: all pass.
Run: `npm run format && npm run lint && npm run typecheck` → Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add content/connection.js tests/connection.test.js
git commit -m "feat(content): manage the background port with backoff

MV3 service workers sleep and extensions get reloaded; bars reconnect
with capped backoff and remove themselves once orphaned instead of
throwing on every event."
```

---

### Task 10: Bar bootstrap and collapsed-state persistence

**Files:**
- Create: `content/bar.js`, `content/main.js`, `tests/bar.test.js`

**Interfaces:**
- Consumes: `ns.render`, `ns.bindEvents`, `ns.createConnection`, `ns.styles`, `ns.constants`
  (`HOST_ID`, `STORAGE_KEY`, `MSG`), `ns.logger`.
- Produces: `ns.mountBar(options: MountOptions): { host, connection } | null`; `content/main.js`
  calls it with the real `chrome` APIs and `shadowMode: 'closed'`.

- [ ] **Step 1: Write failing test `tests/bar.test.js`**

```js
// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent, flushPromises } from './helpers/chrome.js';
import { loadContent } from './helpers/content.js';

const ORDER = ['core', 'format', 'styles', 'dom', 'render', 'events', 'connection', 'bar'];
const KEY = 'hoverHelper.collapsed';
const snapshot = {
  group: { id: 10, title: 'Work', color: 'blue' },
  tabs: [
    { id: 1, title: 'One', favIconUrl: null, active: true },
    { id: 2, title: 'Two', favIconUrl: null, active: false },
  ],
};

let ns;
let port;
let runtime;
let storage;
let storageEvents;
let mounted;

beforeAll(async () => {
  ns = await loadContent(...ORDER);
});

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.getElementById('hover-helper-root')?.remove();
  port = { postMessage: vi.fn(), disconnect: vi.fn(), onMessage: createEvent(), onDisconnect: createEvent() };
  runtime = { id: 'ext-id', connect: vi.fn(() => port) };
  storage = { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) };
  storageEvents = createEvent();
  mounted = mount();
});

afterEach(() => mounted?.connection.stop());

function mount() {
  return ns.mountBar({ doc: document, runtime, storage, storageEvents, shadowMode: 'open' });
}

const shadow = () => mounted.host.shadowRoot;
const q = (sel) => shadow().querySelector(sel);

async function deliver(snap = snapshot) {
  await flushPromises();
  port.onMessage.emit({ type: 'snapshot', snapshot: snap });
}

describe('mountBar', () => {
  it('mounts one host on <html> with styles in its shadow root', () => {
    expect(mounted.host.parentElement).toBe(document.documentElement);
    // jsdom lacks constructable stylesheets, so the <style> fallback is what's exercised here.
    const styled =
      shadow().querySelector('style')?.textContent.includes('.hh-bar') ||
      (shadow().adoptedStyleSheets?.length ?? 0) > 0;
    expect(styled).toBe(true);
    expect(mount()).toBeNull();
    expect(document.querySelectorAll('#hover-helper-root')).toHaveLength(1);
  });

  it('renders the snapshot once the collapsed state is known', async () => {
    port.onMessage.emit({ type: 'snapshot', snapshot });
    expect(q('.hh-bar')).toBeNull(); // storage not read yet → no flash of wrong state
    await flushPromises();
    expect(q('.hh-bar')).not.toBeNull();
  });

  it('sends actions to the background', async () => {
    await deliver();
    q('[role="tab"][data-tab-id="2"]').click();
    q('[data-action="close"][data-tab-id="1"]').click();
    q('[data-action="new"]').click();
    expect(port.postMessage.mock.calls.map(([m]) => m)).toEqual([
      { type: 'activate', tabId: 2 },
      { type: 'close', tabId: 1 },
      { type: 'new' },
    ]);
  });

  it('collapses immediately and persists the choice', async () => {
    await deliver();
    q('[data-action="collapse"]').click();
    expect(q('.hh-pill')).not.toBeNull();
    expect(storage.set).toHaveBeenCalledWith({ [KEY]: true });
  });

  it('starts collapsed when storage says so', async () => {
    mounted.connection.stop();
    document.getElementById('hover-helper-root').remove();
    storage.get.mockResolvedValueOnce({ [KEY]: true });
    mounted = mount();
    await deliver();
    expect(q('.hh-pill')).not.toBeNull();
  });

  it('follows collapsed changes made in other tabs', async () => {
    await deliver();
    storageEvents.emit({ [KEY]: { newValue: true } }, 'local');
    expect(q('.hh-pill')).not.toBeNull();
    storageEvents.emit({ [KEY]: { newValue: false } }, 'sync');
    expect(q('.hh-pill')).not.toBeNull();
  });

  it('still renders if reading storage fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mounted.connection.stop();
    document.getElementById('hover-helper-root').remove();
    storage.get.mockRejectedValueOnce(new Error('quota'));
    mounted = mount();
    await deliver();
    expect(q('.hh-bar')).not.toBeNull();
  });

  it('removes itself when the extension is reloaded', async () => {
    vi.useFakeTimers();
    try {
      delete runtime.id;
      port.onDisconnect.emit();
      vi.advanceTimersByTime(100);
      expect(document.getElementById('hover-helper-root')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/bar.test.js` → Expected: FAIL — cannot find `content/bar.js`.

- [ ] **Step 3: Implement `content/bar.js`**

```js
// @ts-check
// Mounts the bar into the page and connects state, rendering, events and the port.
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));
  const { HOST_ID, STORAGE_KEY, MSG } = ns.constants;

  ns.mountBar = ({ doc, runtime, storage, storageEvents, shadowMode }) => {
    if (doc.getElementById(HOST_ID)) return null; // already injected into this document
    const host = doc.createElement('div');
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: shadowMode });
    applyStyles(shadow, doc);
    const mount = doc.createElement('div');
    shadow.append(mount);

    /** @type {{ snapshot: Snapshot | null, collapsed: boolean, ready: boolean }} */
    const state = { snapshot: null, collapsed: false, ready: false };
    const paint = () => {
      if (state.ready && state.snapshot) {
        ns.render(mount, { snapshot: state.snapshot, collapsed: state.collapsed });
      }
    };
    /** @param {boolean} collapsed */
    const setCollapsed = (collapsed) => {
      state.collapsed = collapsed;
      paint();
    };

    const connection = ns.createConnection({
      runtime,
      doc,
      onSnapshot: (snapshot) => {
        state.snapshot = snapshot;
        paint();
      },
      onOrphaned: () => host.remove(),
    });
    ns.bindEvents(mount, {
      onActivate: (tabId) => connection.send({ type: MSG.ACTIVATE, tabId }),
      onClose: (tabId) => connection.send({ type: MSG.CLOSE, tabId }),
      onNew: () => connection.send({ type: MSG.NEW }),
      onToggleCollapse: () => persistCollapsed(storage, !state.collapsed, setCollapsed),
    });
    syncCollapsed(storage, storageEvents, (collapsed) => {
      state.ready = true;
      setCollapsed(collapsed);
    });

    doc.documentElement.append(host);
    connection.start();
    return { host, connection };
  };

  /**
   * Constructable stylesheets are exempt from page CSP; fall back to <style> where they are
   * unavailable (older engines, test DOMs).
   * @param {ShadowRoot} shadow
   * @param {Document} doc
   */
  function applyStyles(shadow, doc) {
    if ('adoptedStyleSheets' in shadow && 'replaceSync' in CSSStyleSheet.prototype) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(ns.styles);
      shadow.adoptedStyleSheets = [sheet];
      return;
    }
    const style = doc.createElement('style');
    style.textContent = ns.styles;
    shadow.append(style);
  }

  /**
   * Applies the change locally first so the UI responds instantly, then persists it; other
   * tabs pick it up through storage.onChanged.
   * @param {chrome.storage.StorageArea} storage
   * @param {boolean} collapsed
   * @param {(collapsed: boolean) => void} apply
   */
  function persistCollapsed(storage, collapsed, apply) {
    apply(collapsed);
    storage
      .set({ [STORAGE_KEY]: collapsed })
      .catch((/** @type {unknown} */ err) => ns.logger.warn('saving collapsed state failed', err));
  }

  /**
   * @param {chrome.storage.StorageArea} storage
   * @param {typeof chrome.storage.onChanged} storageEvents
   * @param {(collapsed: boolean) => void} apply
   */
  function syncCollapsed(storage, storageEvents, apply) {
    storage
      .get(STORAGE_KEY)
      .then((items) => apply(items[STORAGE_KEY] === true))
      .catch((/** @type {unknown} */ err) => {
        ns.logger.warn('reading collapsed state failed', err);
        apply(false);
      });
    storageEvents.addListener((changes, area) => {
      if (area === 'local' && STORAGE_KEY in changes) apply(changes[STORAGE_KEY].newValue === true);
    });
  }
})();
```

- [ ] **Step 4: Implement `content/main.js`**

```js
// @ts-check
// Entry point. Content scripts run only in the top frame (all_frames is false), once per page.
HoverHelper.mountBar({
  doc: document,
  runtime: chrome.runtime,
  storage: chrome.storage.local,
  storageEvents: chrome.storage.onChanged,
  shadowMode: 'closed',
});
```

- [ ] **Step 5: Run tests and checks**

Run: `npx vitest run tests/bar.test.js` → Expected: all pass.
Run: `npm run format && npm run lint && npm run typecheck && npm run test:coverage` → Expected:
clean; coverage ≥ 80% on every metric.

- [ ] **Step 6: Commit**

```bash
git add content/bar.js content/main.js tests/bar.test.js
git commit -m "feat(content): mount the bar and persist collapsed state

A closed shadow root isolates the bar from page CSS and scripts;
waiting for the stored collapsed state before first paint avoids a
flash of the wrong layout on every page load."
```

---

### Task 11: Manifest, icons, packaging, CI and README

**Files:**
- Create: `manifest.json`, `scripts/generate-icons.js`, `icons/icon16.png`, `icons/icon48.png`,
  `icons/icon128.png`, `tests/manifest.test.js`, `.github/workflows/ci.yml`, `README.md`
- Modify: `package.json` (add `icons` and `package` scripts)

**Interfaces:**
- Consumes: every file from Tasks 1–10; content script order
  `core, format, styles, dom, render, events, connection, bar, main`.
- Produces: a loadable unpacked extension and `dist/hover-helper.zip`.

- [ ] **Step 1: Write failing test `tests/manifest.test.js`**

```js
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));
const manifest = read('manifest.json');
const pkg = read('package.json');

describe('manifest.json', () => {
  it('is MV3 with a version matching package.json', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe(pkg.version);
  });

  it('requests only the permissions the spec allows', () => {
    expect([...manifest.permissions].sort()).toEqual(['storage', 'tabGroups', 'tabs']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.web_accessible_resources).toBeUndefined();
    expect(manifest.content_security_policy).toBeUndefined();
  });

  it('runs a module service worker', () => {
    expect(manifest.background).toEqual({
      service_worker: 'background/service-worker.js',
      type: 'module',
    });
  });

  it('loads content scripts top-frame only, core first and main last', () => {
    const [cs] = manifest.content_scripts;
    expect(cs.all_frames ?? false).toBe(false);
    expect(cs.js[0]).toBe('content/core.js');
    expect(cs.js.at(-1)).toBe('content/main.js');
  });

  it('references only files that exist', () => {
    const files = [
      manifest.background.service_worker,
      ...manifest.content_scripts.flatMap((cs) => cs.js),
      ...Object.values(manifest.icons),
    ];
    expect(files.filter((f) => !exists(f))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/manifest.test.js` → Expected: FAIL — `manifest.json` not found.

- [ ] **Step 3: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Hover Helper",
  "version": "0.1.0",
  "description": "A horizontal quick-switch bar for the tabs in your current Chrome tab group.",
  "minimum_chrome_version": "116",
  "permissions": ["tabs", "tabGroups", "storage"],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "run_at": "document_idle",
      "js": [
        "content/core.js",
        "content/format.js",
        "content/styles.js",
        "content/dom.js",
        "content/render.js",
        "content/events.js",
        "content/connection.js",
        "content/bar.js",
        "content/main.js"
      ]
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 4: Create `scripts/generate-icons.js` and generate icons**

```js
// Generates the extension icons (blue rounded square with a white bottom bar) with no deps.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 48, 128];
const BLUE = [26, 115, 232, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function pixel(x, y, size) {
  const r = size * 0.2;
  const px = x + 0.5;
  const py = y + 0.5;
  const cx = Math.min(Math.max(px, r), size - r);
  const cy = Math.min(Math.max(py, r), size - r);
  if ((px - cx) ** 2 + (py - cy) ** 2 > r ** 2) return CLEAR;
  const inBar = py >= size * 0.62 && py <= size * 0.78 && px >= size * 0.2 && px <= size * 0.8;
  return inBar ? WHITE : BLUE;
}

function png(size) {
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4); // leading 0 = no filter
    for (let x = 0; x < size; x += 1) row.set(pixel(x, y, size), 1 + x * 4);
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('icons', { recursive: true });
for (const size of SIZES) writeFileSync(`icons/icon${size}.png`, png(size));
```

Add to `package.json` `scripts`:

```json
"icons": "node scripts/generate-icons.js",
"package": "rm -rf dist && mkdir dist && zip -rq dist/hover-helper.zip manifest.json background content icons -x '*.DS_Store'"
```

Run: `npm run icons` → Expected: `icons/icon16.png`, `icon48.png`, `icon128.png` exist (open
`icons/icon128.png` to eyeball it).

- [ ] **Step 5: Run the manifest test and the full check**

Run: `npx vitest run tests/manifest.test.js` → Expected: 5 passed.
Run: `npm run format && npm run check` → Expected: lint, format, typecheck clean; all tests pass;
coverage ≥ 80%.
Run: `npm run package && unzip -l dist/hover-helper.zip` → Expected: zip lists only
`manifest.json`, `background/*`, `content/*`, `icons/*`.

- [ ] **Step 6: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run package
      - uses: actions/upload-artifact@v4
        with:
          name: hover-helper
          path: dist/hover-helper.zip
```

- [ ] **Step 7: Create `README.md`**

````markdown
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
````

- [ ] **Step 8: Manual verification in Chrome**

1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder. Expected: no errors
   on the card; service worker shows as active.
2. In a tab group, open a page, then Cmd/Ctrl-click 4 links. Expected: the 4 new tabs join the
   group (Chrome native) and appear in the bar within a moment.
3. Click a chip → switches. Middle-click a chip → closes. Click **×** → closes. **+** → new tab
   inside the group.
4. Switch to an ungrouped tab. Expected: label "Ungrouped", lists only ungrouped/pinned tabs.
5. Collapse in one tab, switch to another. Expected: collapsed there too.
6. Drag a tab into another window. Expected: its bar shows that window's group.
7. Click **Reload** on the extension card, then return to an old tab. Expected: its bar
   disappears (no console errors); refreshing the page brings the bar back.
8. Open the service worker DevTools and the page DevTools console. Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add manifest.json scripts icons tests/manifest.test.js .github README.md package.json
git commit -m "chore(release): add manifest, icons, CI and packaging

Locks permissions and file wiring behind a manifest test so a missing
script or extra permission fails CI instead of failing in Chrome."
```
