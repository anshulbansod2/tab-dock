// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent, flushPromises } from './helpers/chrome.js';
import { loadContent } from './helpers/content.js';

const ORDER = [
  'core',
  'format',
  'styles',
  'dom',
  'render',
  'events',
  'connection',
  'drag',
  'reorder',
  'menu',
  'dropzone',
  'preview',
  'bar',
];
const KEY = 'tabDock.collapsed';
const snapshot = {
  group: { id: 10, title: 'Work', color: 'blue' },
  groups: [
    { id: 10, title: 'Work', color: 'blue' },
    { id: 20, title: 'Read', color: 'red' },
  ],
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
  document.querySelectorAll('tab-dock-bar').forEach((el) => el.remove());
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
/** Makes the next read of the collapsed key behave as given; other keys read as empty. */
function onCollapsedRead(result) {
  storage.get.mockImplementation(async (key) => (key === KEY ? result() : {}));
}

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
    expect(document.querySelectorAll('tab-dock-bar')).toHaveLength(1);
  });

  it('stays a fixed-position host where the popover API is missing', async () => {
    await settle();
    expect('popover' in HTMLElement.prototype).toBe(false); // jsdom
    expect(mounted.host.hasAttribute('popover')).toBe(false);
    expect(q('.hh-bar')).not.toBeNull();
  });

  describe('with the popover API', () => {
    let showPopover;

    beforeEach(() => {
      Object.defineProperty(HTMLElement.prototype, 'popover', {
        configurable: true,
        get() {
          return this.getAttribute('popover');
        },
        set(value) {
          this.setAttribute('popover', value);
        },
      });
      showPopover = vi.fn(function () {
        if (!this.isConnected) throw new DOMException('Not connected', 'InvalidStateError');
      });
      HTMLElement.prototype.showPopover = showPopover;
    });

    afterEach(() => {
      delete HTMLElement.prototype.popover;
      delete HTMLElement.prototype.showPopover;
    });

    it('shows the host as a manual popover in the top layer once connected', async () => {
      remount();
      await settle();
      expect(mounted.host.getAttribute('popover')).toBe('manual');
      expect(showPopover).toHaveBeenCalledOnce();
      expect(showPopover.mock.contexts[0]).toBe(mounted.host);
      expect(showPopover.mock.results[0].type).toBe('return'); // connected at call time
      expect(q('.hh-bar')).not.toBeNull();
    });

    it('re-opens itself if the page closes its popover', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      remount();
      await settle();
      mounted.host.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed' }));
      expect(showPopover).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledWith('[tab-dock]', 'page closed the bar; reopening it');
    });

    it('keeps its top-layer slot if reopening throws (an older Chrome, already open)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      remount();
      await settle();
      showPopover.mockImplementationOnce(() => {
        throw new DOMException('Already open', 'InvalidStateError');
      });
      mounted.host.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed' }));
      expect(mounted.host.getAttribute('popover')).toBe('manual');
      expect(warn).toHaveBeenCalledWith('[tab-dock]', 'reopening failed', expect.any(DOMException));
    });

    it('falls back to fixed positioning if showPopover throws', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      showPopover.mockImplementationOnce(() => {
        throw new DOMException('Already open', 'InvalidStateError');
      });
      remount();
      await settle();
      // A popover that isn't open is display:none, so drop the attribute to stay visible.
      expect(mounted.host.hasAttribute('popover')).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        '[tab-dock]',
        'top layer unavailable',
        expect.any(DOMException),
      );
      expect(q('.hh-bar')).not.toBeNull();
    });
  });

  it('pins its host styles inline with !important so page CSS cannot hide or move it', () => {
    // e.g. Reddit hides unregistered custom elements: :not(:defined) { visibility: hidden }.
    const host = mounted.host;
    for (const [prop, value] of [
      ['visibility', 'visible'],
      ['display', 'block'],
      ['position', 'fixed'],
      ['opacity', '1'],
      ['pointer-events', 'none'],
    ]) {
      expect(host.style.getPropertyValue(prop)).toBe(value);
      expect(host.style.getPropertyPriority(prop)).toBe('important');
    }
  });

  it('animates its first appearance once, unless reduced motion is requested', () => {
    mounted.unmount();
    const animate = vi.fn();
    HTMLElement.prototype.animate = animate;
    window.matchMedia = vi.fn(() => ({ matches: false }));
    mounted = mount();
    expect(animate).toHaveBeenCalledOnce();
    mounted.unmount();
    window.matchMedia = vi.fn(() => ({ matches: true }));
    mounted = mount();
    expect(animate).toHaveBeenCalledOnce();
    delete HTMLElement.prototype.animate;
    delete window.matchMedia;
  });

  it('makes the bar draggable and releases dragging on unmount', () => {
    mounted.unmount();
    const dispose = vi.fn();
    const bindDrag = vi.spyOn(ns, 'bindDrag').mockReturnValue({ dispose });
    mounted = mount();
    expect(bindDrag).toHaveBeenCalledWith(
      expect.objectContaining({ host: mounted.host, win: window, storage, storageEvents }),
    );
    mounted.unmount();
    expect(dispose).toHaveBeenCalledOnce();
    mounted = null;
  });

  it('sends a reorder to the background and holds re-renders while a chip is dragged', async () => {
    mounted.unmount();
    let callbacks;
    const dispose = vi.fn();
    vi.spyOn(ns, 'bindReorder').mockImplementation((_mount, given) => {
      callbacks = given;
      return { dispose };
    });
    mounted = mount();
    await settle();
    const render = vi.spyOn(ns, 'render');
    callbacks.onDragStart();
    push();
    await settle();
    expect(render).not.toHaveBeenCalled(); // the chip being dragged stays in the page
    callbacks.onMove(2, 0);
    callbacks.onDragEnd();
    await settle();
    expect(render).toHaveBeenCalledOnce(); // the held snapshot paints after the drop
    expect(actions()).toEqual([{ type: 'move', tabId: 2, toIndex: 0 }]);
    mounted.unmount();
    expect(dispose).toHaveBeenCalledOnce();
    mounted = null;
  });

  it('opens the tab menu on right-click and sends the choice', async () => {
    await settle();
    q('.hh-tab[data-tab-id="2"]').dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    );
    const item = [...shadow().querySelectorAll('[role="menuitem"]')].find(
      (el) => el.textContent === 'Read',
    );
    item.click();
    expect(actions()).toEqual([{ type: 'regroup', tabId: 2, groupId: 20 }]);
    expect(shadow().querySelector('[role="menu"]')).toBeNull();
  });

  it('shows group targets for a lifted chip and sends the drop', async () => {
    mounted.unmount();
    let callbacks;
    vi.spyOn(ns, 'bindReorder').mockImplementation((_mount, given) => {
      callbacks = given;
      return { dispose: vi.fn() };
    });
    mounted = mount();
    await settle();
    callbacks.onLift(2);
    expect(shadow().querySelector('.hh-drop-ghost .hh-title').textContent).toBe('Two');
    const targets = shadow().querySelectorAll('.hh-drop-target');
    expect([...targets].map((t) => t.getAttribute('aria-label'))).toEqual([
      'Read',
      'Ungrouped',
      'New group',
    ]);
    const at = (el) => parseFloat(el.style.getPropertyValue('left')) + 15;
    const y = parseFloat(targets[0].style.getPropertyValue('top')) + 15;
    const picked = callbacks.onPick(at(targets[0]), y);
    callbacks.onDrop(picked);
    callbacks.onLower();
    expect(actions()).toEqual([{ type: 'regroup', tabId: 2, groupId: 20 }]);
    expect(shadow().querySelector('.hh-drop-target')).toBeNull();
  });

  it('puts itself back if the page removes it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await settle();
    mounted.host.remove();
    await flushPromises();
    expect(mounted.host.parentElement).toBe(document.documentElement);
    expect(q('.hh-bar')).not.toBeNull(); // the same bar, still painted
    expect(warn).toHaveBeenCalledWith('[tab-dock]', 'page removed the bar; restoring it');
  });

  it('follows the page when it swaps out <html> itself', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await settle();
    const old = document.documentElement;
    const fresh = document.createElement('html');
    document.replaceChild(fresh, old);
    await flushPromises();
    expect(mounted.host.parentElement).toBe(fresh);
    mounted.host.remove();
    await flushPromises();
    expect(mounted.host.parentElement).toBe(fresh); // still watched in the new <html>
    document.replaceChild(old, fresh);
  });

  it('stops putting itself back if the page keeps removing it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 10; i += 1) {
      mounted.host.remove();
      await flushPromises();
    }
    expect(mounted.host.isConnected).toBe(false); // gave up instead of fighting the page
    setVisibility('hidden');
    setVisibility('visible'); // coming back to the tab is a fresh chance
    expect(mounted.host.isConnected).toBe(true);
  });

  it('yields to a newer bar instead of putting itself back (extension reloaded)', async () => {
    await settle();
    const newer = document.createElement('tab-dock-bar');
    newer.dataset.instance = 'newer-instance';
    document.documentElement.append(newer);
    mounted.host.remove(); // what the newer instance's mountBar does to this one
    await flushPromises();
    expect(mounted.host.isConnected).toBe(false);
    expect(document.querySelectorAll('tab-dock-bar')).toHaveLength(1);
    newer.remove();
    mounted = null;
  });

  it('does not put itself back once its extension is gone', async () => {
    await settle();
    delete runtime.id; // Chrome clears it when the extension is reloaded or removed
    mounted.host.remove();
    await flushPromises();
    expect(mounted.host.isConnected).toBe(false);
    setVisibility('hidden');
    setVisibility('visible');
    expect(mounted.host.isConnected).toBe(false);
    mounted = null;
  });

  it('stays removed after unmount', async () => {
    const { host } = mounted;
    mounted.unmount();
    mounted = null;
    await flushPromises();
    expect(host.isConnected).toBe(false);
  });

  it('shows a hover card from the background and opens it live on click', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    runtime.sendMessage.mockImplementation(async (msg) =>
      msg.type === 'hello'
        ? snapshot
        : msg.type === 'preview'
          ? { image: 'data:image/jpeg;base64,x', at: Date.now() }
          : undefined,
    );
    await flushPromises();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    q('.hh-tab[data-tab-id="2"]').dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    const card = shadow().querySelector('.hh-card');
    expect(card.querySelector('img').src).toBe('data:image/jpeg;base64,x');
    card.click();
    expect(actions()).toContainEqual({ type: 'peek', tabId: 2 });
    vi.useRealTimers();
  });

  it('goes back to the tab a card was opened from', async () => {
    push({ ...snapshot, back: { tabId: 1, title: 'Tab 1' } });
    await settle();
    q('[data-action="return"]').click();
    expect(actions()).toEqual([{ type: 'return' }]);
  });

  it('is not blocked by a page element that reuses our old id', () => {
    mounted.unmount();
    const decoy = document.createElement('div');
    decoy.id = 'tab-dock-root';
    document.body.append(decoy);
    mounted = mount();
    expect(mounted).not.toBeNull();
    decoy.remove();
  });

  it('replaces a bar left behind by a previous extension instance', () => {
    mounted.unmount();
    const stale = document.createElement('tab-dock-bar');
    stale.dataset.instance = 'old-instance';
    document.documentElement.append(stale);
    mounted = mount();
    expect(stale.isConnected).toBe(false);
    expect(document.querySelectorAll('tab-dock-bar')).toHaveLength(1);
  });

  it('renders the snapshot once the collapsed state is known', async () => {
    let resolveRead;
    const pending = new Promise((resolve) => (resolveRead = resolve));
    onCollapsedRead(() => pending);
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
    q('.hh-tab[data-tab-id="2"]').click();
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
      '[tab-dock]',
      'saving collapsed state failed',
      expect.any(Error),
    );
  });

  it('starts collapsed when storage says so', async () => {
    onCollapsedRead(() => ({ [KEY]: true }));
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
    onCollapsedRead(() => {
      throw new Error('quota');
    });
    remount();
    await settle();
    expect(q('.hh-bar')).not.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[tab-dock]',
      'reading collapsed state failed',
      expect.any(Error),
    );
  });

  it('keeps its bar on screen while hidden and refreshes it in place when shown', async () => {
    await settle();
    setVisibility('hidden');
    await settle();
    expect(q('.hh-bar')).not.toBeNull(); // no empty gap when the user switches back
    const three = { ...snapshot, tabs: [...snapshot.tabs, { ...snapshot.tabs[1], id: 3 }] };
    runtime.sendMessage.mockImplementation(async (msg) =>
      msg.type === 'hello' ? three : undefined,
    );
    setVisibility('visible');
    await settle();
    expect(shadow().querySelectorAll('.hh-tab')).toHaveLength(3);
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
    expect(document.querySelector('tab-dock-bar')).toBeNull();
  });
});
