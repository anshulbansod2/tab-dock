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

/** Resolves after the next animation frame, once pending promise callbacks have run. */
async function settle() {
  await flushPromises();
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
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
    await settle();
    expect(q('.hh-bar')).toBeNull(); // storage not read yet → no flash of wrong state
    resolveRead({});
    await settle();
    expect(q('.hh-bar')).not.toBeNull();
  });

  it('paints on the next animation frame, coalescing a burst into one render', async () => {
    await settle();
    const render = vi.spyOn(ns, 'render');
    const titled = (title) => ({ ...snapshot, tabs: [{ ...snapshot.tabs[0], title }] });
    push(titled('A'));
    push(titled('B'));
    push(titled('C'));
    expect(render).not.toHaveBeenCalled(); // nothing paints synchronously
    await settle();
    expect(render).toHaveBeenCalledOnce();
    expect(render.mock.calls[0][1].snapshot.tabs[0].title).toBe('C');
    expect(q('.hh-tab').textContent).toBe('C');
  });

  it('sends actions to the background', async () => {
    await settle();
    q('[role="tab"][data-tab-id="2"]').click();
    q('[data-action="close"][data-tab-id="1"]').click();
    q('[data-action="new"]').click();
    expect(actions()).toEqual([
      { type: 'activate', tabId: 2 },
      { type: 'close', tabId: 1 },
      { type: 'new' },
    ]);
  });

  it('collapses on the next frame and persists the choice', async () => {
    await settle();
    q('[data-action="collapse"]').click();
    await settle();
    expect(q('.hh-pill')).not.toBeNull();
    expect(storage.set).toHaveBeenCalledWith({ [KEY]: true });
  });

  it('keeps the local collapse if saving it fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.set.mockRejectedValueOnce(new Error('quota'));
    await settle();
    q('[data-action="collapse"]').click();
    await settle();
    expect(q('.hh-pill')).not.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[hover-helper]',
      'saving collapsed state failed',
      expect.any(Error),
    );
  });

  it('starts collapsed when storage says so', async () => {
    storage.get.mockResolvedValueOnce({ [KEY]: true });
    remount();
    await settle();
    expect(q('.hh-pill')).not.toBeNull();
  });

  it('follows collapsed changes made in other tabs', async () => {
    await settle();
    storageEvents.emit({ [KEY]: { newValue: true } }, 'local');
    await settle();
    expect(q('.hh-pill')).not.toBeNull();
    storageEvents.emit({ [KEY]: { newValue: false } }, 'sync');
    await settle();
    expect(q('.hh-pill')).not.toBeNull();
  });

  it('still renders if reading storage fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.get.mockRejectedValueOnce(new Error('quota'));
    remount();
    await settle();
    expect(q('.hh-bar')).not.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[hover-helper]',
      'reading collapsed state failed',
      expect.any(Error),
    );
  });

  it('frees its DOM and snapshot while the page is hidden, repainting when shown', async () => {
    await settle();
    setVisibility('hidden');
    expect(q('.hh-root')).toBeNull();
    storageEvents.emit({ [KEY]: { newValue: false } }, 'local'); // must not repaint stale data
    await settle();
    expect(q('.hh-root')).toBeNull();
    setVisibility('visible');
    await settle(); // shown again → asks for a fresh snapshot
    expect(q('.hh-bar')).not.toBeNull();
    push();
    await settle();
    expect(q('.hh-bar')).not.toBeNull();
  });

  it('drops a pending frame when the page is hidden', async () => {
    await settle();
    const render = vi.spyOn(ns, 'render');
    push();
    setVisibility('hidden');
    await settle();
    expect(render).not.toHaveBeenCalled();
    expect(q('.hh-root')).toBeNull();
  });

  it('drops a pending frame on unmount', async () => {
    await settle();
    const render = vi.spyOn(ns, 'render');
    push();
    mounted.unmount();
    await settle();
    expect(render).not.toHaveBeenCalled();
  });

  it('removes itself when the extension is reloaded', async () => {
    await settle();
    runtime.sendMessage.mockRejectedValue(new Error('Extension context invalidated.'));
    q('[data-action="new"]').click();
    await flushPromises();
    expect(document.querySelector('hover-helper-bar')).toBeNull();
  });
});
