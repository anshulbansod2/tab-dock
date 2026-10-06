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

/** A runtime.MessageSender as Chrome reports it for our top-frame content script. */
export function createSender({
  tabId = 1,
  windowId = 1,
  extensionId = 'ext-id',
  frameId = 0,
} = {}) {
  return { id: extensionId, frameId, tab: { id: tabId, windowId } };
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
    runtime: {
      id: 'ext-id',
      onMessage: createEvent(),
      onInstalled: createEvent(),
      getURL: (path) => `chrome-extension://ext-id${path}`,
      getManifest: () => ({ content_scripts: [{ js: ['content/core.js', 'content/main.js'] }] }),
    },
    storage: { local: createStorage(), session: createStorage() },
    windows: {
      create: vi.fn(async (props) => ({ id: 77, ...props })),
      get: vi.fn(async (id) => ({ id, type: 'normal' })),
      update: vi.fn(async (id, props) => ({ id, ...props })),
      getLastFocused: vi.fn(async () => ({ id: 1, type: 'normal' })),
      onFocusChanged: createEvent(),
      WINDOW_ID_NONE: -1,
    },
    scripting: { executeScript: vi.fn(async () => []) },
    tabs: {
      query: vi.fn(async ({ windowId }) => state.tabs.filter((t) => t.windowId === windowId)),
      get: vi.fn(get),
      update: vi.fn(async (id) => get(id)),
      remove: vi.fn(async () => undefined),
      create: vi.fn(async (props) => ({ id: 999, ...props })),
      group: vi.fn(async () => 1),
      ungroup: vi.fn(async () => undefined),
      captureVisibleTab: vi.fn(async () => 'data:image/jpeg;base64,shot'),
      move: vi.fn(async (id) => get(id)),
      sendMessage: vi.fn(async () => undefined),
      onCreated: createEvent(),
      onRemoved: createEvent(),
      onUpdated: createEvent(),
      onMoved: createEvent(),
      onAttached: createEvent(),
      onDetached: createEvent(),
      onReplaced: createEvent(),
      onActivated: createEvent(),
    },
    tabGroups: {
      query: vi.fn(async ({ windowId }) => state.groups.filter((g) => g.windowId === windowId)),
      get: vi.fn(async (id) => {
        const group = state.groups.find((g) => g.id === id);
        if (!group) throw new Error(`No group with id: ${id}.`);
        return group;
      }),
      onUpdated: createEvent(),
      onRemoved: createEvent(),
      onMoved: createEvent(),
    },
  };
}

/** An in-memory chrome.storage area. */
export function createStorage(items = {}) {
  const data = { ...items };
  const pick = (keys) =>
    Object.fromEntries(
      [keys]
        .flat()
        .filter((k) => k in data)
        .map((k) => [k, data[k]]),
    );
  return {
    data,
    get: vi.fn(async (keys) => (keys === null || keys === undefined ? { ...data } : pick(keys))),
    set: vi.fn(async (next) => void Object.assign(data, next)),
    remove: vi.fn(async (keys) => [keys].flat().forEach((k) => delete data[k])),
  };
}

/** Resolves after pending promise callbacks run (works with fake setTimeout). */
export const flushPromises = () => new Promise((resolve) => setImmediate(resolve));
