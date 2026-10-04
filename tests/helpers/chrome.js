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
