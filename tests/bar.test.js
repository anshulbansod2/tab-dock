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
let runtime;
let storage;
let storageEvents;
let mounted;

beforeAll(async () => {
  ns = await loadContent(...ORDER);
});

beforeEach(() => {
  setVisibility('visible', false);
  document.querySelectorAll('hover-helper-bar').forEach((el) => el.remove());
  runtime = {
    id: 'ext-id',
    sendMessage: vi.fn(async (msg) => (msg.type === 'hello' ? snapshot : undefined)),
    onMessage: createEvent(),
  };
  storage = { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) };
  storageEvents = createEvent();
  mounted = mount();
});

afterEach(() => mounted?.unmount());

function setVisibility(state, dispatch = true) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  if (dispatch) document.dispatchEvent(new Event('visibilitychange'));
}

function mount() {
  return ns.mountBar({ doc: document, runtime, storage, storageEvents, shadowMode: 'open' });
}

function remount() {
  mounted.unmount();
  mounted = mount();
}

const shadow = () => mounted.host.shadowRoot;
const q = (sel) => shadow().querySelector(sel);

const push = (snap = snapshot) =>
  runtime.onMessage.emit({ type: 'snapshot', snapshot: snap }, { id: 'ext-id' });
const actions = () =>
  runtime.sendMessage.mock.calls.map(([m]) => m).filter((m) => m.type !== 'hello');

describe('mountBar', () => {
  it('mounts one host on <html> with styles in its shadow root', async () => {
    expect(mounted.host.parentElement).toBe(document.documentElement);
    // jsdom lacks constructable stylesheets, so the <style> fallback is what's exercised here.
    const styled =
      shadow().querySelector('style')?.textContent.includes('.hh-bar') ||
      (shadow().adoptedStyleSheets?.length ?? 0) > 0;
    expect(styled).toBe(true);
    expect(mount()).toBeNull();
    expect(document.querySelectorAll('hover-helper-bar')).toHaveLength(1);
  });

  it('is not blocked by a page element that reuses our old id', () => {
    mounted.unmount();
    const decoy = document.createElement('div');
    decoy.id = 'hover-helper-root';
    document.body.append(decoy);
    mounted = mount();
    expect(mounted).not.toBeNull();
    decoy.remove();
  });

  it('replaces a bar left behind by a previous extension instance', () => {
    mounted.unmount();
    const stale = document.createElement('hover-helper-bar');
    stale.dataset.instance = 'old-instance';
    document.documentElement.append(stale);
    mounted = mount();
    expect(stale.isConnected).toBe(false);
    expect(document.querySelectorAll('hover-helper-bar')).toHaveLength(1);
  });

  it('renders the snapshot once the collapsed state is known', async () => {
    let resolveRead;
    storage.get.mockReturnValueOnce(new Promise((resolve) => (resolveRead = resolve)));
    remount();
    await flushPromises();
    expect(q('.hh-bar')).toBeNull(); // storage not read yet → no flash of wrong state
    resolveRead({});
    await flushPromises();
    expect(q('.hh-bar')).not.toBeNull();
  });

  it('sends actions to the background', async () => {
    await flushPromises();
    q('[role="tab"][data-tab-id="2"]').click();
    q('[data-action="close"][data-tab-id="1"]').click();
    q('[data-action="new"]').click();
    expect(actions()).toEqual([
      { type: 'activate', tabId: 2 },
      { type: 'close', tabId: 1 },
      { type: 'new' },
    ]);
  });

  it('collapses immediately and persists the choice', async () => {
    await flushPromises();
    q('[data-action="collapse"]').click();
    expect(q('.hh-pill')).not.toBeNull();
    expect(storage.set).toHaveBeenCalledWith({ [KEY]: true });
  });

  it('starts collapsed when storage says so', async () => {
    storage.get.mockResolvedValueOnce({ [KEY]: true });
    remount();
    await flushPromises();
    expect(q('.hh-pill')).not.toBeNull();
  });

  it('follows collapsed changes made in other tabs', async () => {
    await flushPromises();
    storageEvents.emit({ [KEY]: { newValue: true } }, 'local');
    expect(q('.hh-pill')).not.toBeNull();
    storageEvents.emit({ [KEY]: { newValue: false } }, 'sync');
    expect(q('.hh-pill')).not.toBeNull();
  });

  it('still renders if reading storage fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.get.mockRejectedValueOnce(new Error('quota'));
    remount();
    await flushPromises();
    expect(q('.hh-bar')).not.toBeNull();
  });

  it('frees its DOM and snapshot while the page is hidden, repainting when shown', async () => {
    await flushPromises();
    setVisibility('hidden');
    expect(q('.hh-root')).toBeNull();
    storageEvents.emit({ [KEY]: { newValue: false } }, 'local'); // must not repaint stale data
    expect(q('.hh-root')).toBeNull();
    setVisibility('visible');
    await flushPromises(); // shown again → asks for a fresh snapshot
    expect(q('.hh-bar')).not.toBeNull();
    push();
    expect(q('.hh-bar')).not.toBeNull();
  });

  it('removes itself when the extension is reloaded', async () => {
    await flushPromises();
    runtime.sendMessage.mockRejectedValue(new Error('Extension context invalidated.'));
    q('[data-action="new"]').click();
    await flushPromises();
    expect(document.querySelector('hover-helper-bar')).toBeNull();
  });
});
