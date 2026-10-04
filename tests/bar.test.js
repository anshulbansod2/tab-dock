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
  setVisibility('visible', false);
  document.getElementById('hover-helper-root')?.remove();
  port = {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: createEvent(),
    onDisconnect: createEvent(),
  };
  runtime = { id: 'ext-id', connect: vi.fn(() => port) };
  storage = { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) };
  storageEvents = createEvent();
  mounted = mount();
});

afterEach(() => mounted?.connection.stop());

function setVisibility(state, dispatch = true) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  if (dispatch) document.dispatchEvent(new Event('visibilitychange'));
}

function mount() {
  return ns.mountBar({ doc: document, runtime, storage, storageEvents, shadowMode: 'open' });
}

function remount() {
  mounted.connection.stop();
  document.getElementById('hover-helper-root').remove();
  mounted = mount();
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
    let resolveRead;
    storage.get.mockReturnValueOnce(new Promise((resolve) => (resolveRead = resolve)));
    remount();
    port.onMessage.emit({ type: 'snapshot', snapshot });
    expect(q('.hh-bar')).toBeNull(); // storage not read yet → no flash of wrong state
    resolveRead({});
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
    storage.get.mockResolvedValueOnce({ [KEY]: true });
    remount();
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
    storage.get.mockRejectedValueOnce(new Error('quota'));
    remount();
    await deliver();
    expect(q('.hh-bar')).not.toBeNull();
  });

  it('frees its DOM and snapshot while the page is hidden, repainting when shown', async () => {
    await deliver();
    setVisibility('hidden');
    expect(q('.hh-root')).toBeNull();
    storageEvents.emit({ [KEY]: { newValue: false } }, 'local'); // must not repaint stale data
    expect(q('.hh-root')).toBeNull();
    setVisibility('visible');
    port.onMessage.emit({ type: 'snapshot', snapshot });
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
