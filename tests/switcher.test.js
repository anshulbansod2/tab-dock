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
  'groupedit',
  'dropzone',
  'preview',
  'view',
  'switcher',
  'bar',
];
const work = { id: 10, title: 'Work', color: 'blue' };
const read = { id: 20, title: 'Read', color: 'red' };
const snapshot = {
  group: work,
  groups: [work, read],
  hasUngrouped: true,
  tabs: [
    { id: 1, title: 'One', favIconUrl: null, active: true },
    { id: 2, title: 'Two', favIconUrl: null, active: false },
  ],
};
const VIEWS = {
  20: {
    group: read,
    lastId: 6,
    tabs: [
      { id: 5, title: 'Five', favIconUrl: null, active: false },
      { id: 6, title: 'Six', favIconUrl: null, active: false },
    ],
  },
  '-1': {
    group: null,
    lastId: 9,
    tabs: [{ id: 9, title: 'Nine', favIconUrl: null, active: false }],
  },
};

let ns;
let runtime;
let mounted;

beforeAll(async () => {
  ns = await loadContent(...ORDER);
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 100, y: 700, width: 640, height: 44 }),
  );
  document.querySelectorAll('tab-dock-bar').forEach((el) => el.remove());
  runtime = {
    id: 'ext-id',
    sendMessage: vi.fn(async (msg) => {
      if (msg.type === 'hello') return snapshot;
      if (msg.type === 'group') return VIEWS[msg.groupId] ?? null;
      return undefined;
    }),
    onMessage: createEvent(),
  };
  mounted = ns.mountBar({
    doc: document,
    runtime,
    storage: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) },
    storageEvents: createEvent(),
    shadowMode: 'open',
  });
  await settle();
});

afterEach(() => {
  mounted?.unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function settle() {
  await flushPromises();
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  await flushPromises();
}

const shadow = () => mounted.host.shadowRoot;
const q = (sel) => shadow().querySelector(sel);
const swatch = (groupId) => q(`.hh-swatch[data-group-id="${groupId}"]`);
const titles = () => [...shadow().querySelectorAll('.hh-tab')].map((t) => t.textContent);
const label = () => q('.hh-label-text').textContent;
const actions = () =>
  runtime.sendMessage.mock.calls
    .map(([m]) => m)
    .filter((m) => !['hello', 'group'].includes(m.type));
/** A real pointer moving onto (or along) the element; `still`: Chrome's hover after a layout. */
function point(el, type = 'pointermove', { still = false } = {}) {
  const event = new MouseEvent(type, { bubbles: true });
  Object.defineProperty(event, 'movementX', { value: still ? 0 : 3 });
  return el.dispatchEvent(event);
}
const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const mountEl = () => q('.hh-root').parentElement;

async function browse(groupId) {
  point(swatch(groupId));
  await settle();
}

describe('group switcher', () => {
  it("shows a group's tabs while the pointer rests on its swatch, at the dock's width", async () => {
    await browse(20);
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: 'group', groupId: 20 });
    expect(label()).toBe('Read');
    expect(titles()).toEqual(['Five', 'Six']);
    expect(q('.hh-bar').style.width).toBe('640px');
    expect(actions()).toEqual([]); // looking changes nothing in Chrome
  });

  it('ignores hover events from a page that moved under a still pointer', async () => {
    point(swatch(20), 'pointerover');
    point(swatch(20), 'pointermove', { still: true });
    await settle();
    expect(label()).toBe('Work');
    expect(runtime.sendMessage).not.toHaveBeenCalledWith({ type: 'group', groupId: 20 });
  });

  it('opens a tab of the browsed group when it is clicked', async () => {
    await browse(20);
    q('.hh-tab[data-tab-id="5"]').click();
    expect(actions()).toEqual([{ type: 'activate', tabId: 5 }]);
  });

  it("opens the group's last-used tab when its swatch is clicked", async () => {
    await browse(20);
    swatch(20).click();
    await flushPromises();
    expect(actions()).toEqual([{ type: 'activate', tabId: 6 }]);
  });

  it('asks for the group first when its swatch is clicked straight away', async () => {
    swatch(-1).click();
    await flushPromises();
    await flushPromises();
    expect(actions()).toEqual([{ type: 'activate', tabId: 9 }]);
  });

  it('goes back to your group a moment after the pointer leaves the dock', async () => {
    await browse(20);
    point(mountEl(), 'pointerleave');
    await vi.advanceTimersByTimeAsync(200);
    point(mountEl(), 'pointerenter'); // came back in time
    await vi.advanceTimersByTimeAsync(400);
    await settle();
    expect(label()).toBe('Read');
    point(mountEl(), 'pointerleave');
    await vi.advanceTimersByTimeAsync(400);
    await settle();
    expect(label()).toBe('Work');
    expect(titles()).toEqual(['One', 'Two']);
    expect(q('.hh-bar').style.width).toBe('');
  });

  it('goes back on Escape or the Back button', async () => {
    await browse(20);
    key(swatch(20), 'Escape');
    await settle();
    expect(label()).toBe('Work');
    await browse(20);
    q('[data-action="back"]').click();
    await settle();
    expect(label()).toBe('Work');
  });

  it('goes back when the pointer reaches your own swatch', async () => {
    await browse(20);
    await browse(10);
    expect(label()).toBe('Work');
    expect(q('.hh-bar').hasAttribute('data-browsing')).toBe(false);
  });

  it('moves between groups with the arrow keys, wrapping at the ends', async () => {
    swatch(10).focus();
    key(swatch(10), 'ArrowRight');
    await settle();
    expect(label()).toBe('Read');
    expect(shadow().activeElement).toBe(swatch(20));
    key(swatch(20), 'ArrowRight');
    await settle();
    expect(label()).toBe('Ungrouped');
    key(swatch(-1), 'ArrowRight');
    await settle();
    expect(label()).toBe('Work');
    key(swatch(10), 'ArrowLeft');
    await settle();
    expect(label()).toBe('Ungrouped');
  });

  it('goes back when the page is hidden, so the dock is right on your return', async () => {
    await browse(20);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(label()).toBe('Work');
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('ignores a reply for a group the pointer has already left', async () => {
    let answer;
    runtime.sendMessage.mockImplementation((msg) =>
      msg.type === 'group' ? new Promise((resolve) => (answer = resolve)) : undefined,
    );
    point(swatch(20));
    point(swatch(10));
    answer(VIEWS[20]);
    await settle();
    expect(label()).toBe('Work');
  });

  it("refreshes the browsed group's tabs when a new snapshot arrives", async () => {
    await browse(20);
    VIEWS[20] = { ...VIEWS[20], tabs: [VIEWS[20].tabs[0]] };
    runtime.onMessage.emit({ type: 'snapshot', snapshot: { ...snapshot } }, { id: 'ext-id' });
    await settle();
    expect(titles()).toEqual(['Five']);
  });

  it('gives the right-click menu the browsed group, so its tab can move to yours', async () => {
    await browse(20);
    q('.hh-tab[data-tab-id="5"]').dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    );
    const items = [...shadow().querySelectorAll('.hh-menu-item')].map((m) => m.textContent);
    expect(items.some((t) => t.includes('Work'))).toBe(true);
    expect(items.some((t) => t.includes('Read'))).toBe(false);
  });
});
