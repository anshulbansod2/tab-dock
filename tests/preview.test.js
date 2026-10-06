// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from './helpers/chrome.js';
import { loadContent } from './helpers/content.js';

const IMAGE = 'data:image/jpeg;base64,shot';
const snapshot = {
  group: { id: 10, title: 'Work', color: 'blue' },
  groups: [],
  tabs: [
    { id: 1, title: 'Current', favIconUrl: null, active: true },
    { id: 2, title: 'YouTube', favIconUrl: null, active: false },
    { id: 3, title: 'Away', favIconUrl: null, active: false, away: true },
    { id: 4, title: 'Docs', favIconUrl: null, active: false },
  ],
};

let ns;
let mount;
let layer;
let request;
let onPeek;
let preview;
let clock;

beforeAll(async () => {
  ns = await loadContent('core', 'format', 'styles', 'dom', 'render', 'preview');
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  document.body.replaceChildren();
  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  mount = document.createElement('div');
  layer = document.createElement('div');
  shadow.append(mount, layer);
  ns.render(mount, { snapshot, collapsed: false });
  setWindow({ innerWidth: 1200, innerHeight: 800 });
  chipAt(2, { left: 500, top: 100 }); // dock near the top: room below
  dockAt({ top: 92, bottom: 140 });
  request = vi.fn(async () => ({ image: IMAGE, at: 0 }));
  onPeek = vi.fn();
  clock = 3 * 60_000;
  preview = ns.bindPreview({ mount, layer, win: window, request, onPeek, now: () => clock });
});

afterEach(() => {
  preview.dispose();
  vi.useRealTimers();
});

function setWindow(values) {
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(window, key, { value, configurable: true });
}

function chipAt(id, { left, top }) {
  const chip = mount.querySelector(`.hh-tab[data-tab-id="${id}"]`).closest('.hh-chip');
  chip.getBoundingClientRect = () => ({
    left,
    top,
    width: 120,
    height: 32,
    right: left + 120,
    bottom: top + 32,
  });
}

function dockAt({ top, bottom }) {
  mount.querySelector('.hh-bar').getBoundingClientRect = () => ({
    left: 300,
    right: 900,
    width: 600,
    top,
    bottom,
    height: bottom - top,
  });
}

const tabEl = (id) => mount.querySelector(`.hh-tab[data-tab-id="${id}"]`);
const card = () => layer.querySelector('.hh-card');
const hover = (el) => el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
const leave = (el, to = document.body) =>
  el.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: to }));

async function hoverFor(ms, el = tabEl(2)) {
  hover(el);
  await vi.advanceTimersByTimeAsync(ms);
  await flushPromises();
}

describe('hover card', () => {
  it("shows the tab's screenshot after a short hover, below the chip", async () => {
    await hoverFor(100);
    expect(card()).toBeNull(); // passing over the dock opens nothing
    await hoverFor(200);
    expect(request).toHaveBeenCalledWith({ type: 'preview', tabId: 2 });
    expect(card().querySelector('img').src).toBe(IMAGE);
    expect(card().textContent).toContain('YouTube');
    expect(card().textContent).toContain('3 min ago');
  });

  it('hangs from the dock edge facing the page, centred on the chip', async () => {
    await hoverFor(300);
    expect(card().style.top).toBe('140px'); // flush with the dock's bottom edge
    expect(card().style.left).toBe(`${560 - 240}px`); // chip centre minus half the card
    expect(card().dataset.side).toBe('below');
  });

  it('grows up out of the dock when it sits at the bottom', async () => {
    chipAt(2, { left: 500, top: 760 });
    dockAt({ top: 752, bottom: 800 });
    await hoverFor(300);
    expect(card().style.bottom).toBe('48px'); // window height minus the dock's top edge
    expect(card().style.top).toBe('');
    expect(card().dataset.side).toBe('above');
  });

  it('stays inside the window next to an edge chip', async () => {
    chipAt(2, { left: 1150, top: 100 });
    await hoverFor(300);
    expect(card().style.left).toBe(`${1200 - 480 - 8}px`);
  });

  describe('when the dock re-renders (a tab title or icon changed)', () => {
    const rerender = () => ns.render(mount, { snapshot, collapsed: false });

    it('places the card by the live chip, not the one the render replaced', async () => {
      await hoverFor(100);
      rerender();
      chipAt(2, { left: 700, top: 100 });
      dockAt({ top: 92, bottom: 140 });
      await hoverFor(200, tabEl(2));
      expect(card().style.left).toBe(`${760 - 240}px`);
    });

    it('keeps the hover wait running on the re-rendered chip', async () => {
      await hoverFor(100);
      rerender();
      chipAt(2, { left: 500, top: 100 });
      dockAt({ top: 92, bottom: 140 });
      await hoverFor(160, tabEl(2).querySelector('.hh-title'));
      expect(card()).not.toBeNull(); // 100 + 160 ms: the wait was not restarted
    });

    it('still opens the live tab from a card shown before the render', async () => {
      await hoverFor(300);
      rerender();
      chipAt(2, { left: 500, top: 100 });
      dockAt({ top: 92, bottom: 140 });
      card().click();
      const { dock } = onPeek.mock.calls[0][1];
      expect(dock).toEqual({ left: 300, top: 92, right: 900, bottom: 140 }); // the live one
    });
  });

  it('narrows to fit a window slimmer than the card', async () => {
    setWindow({ innerWidth: 400 });
    chipAt(2, { left: 150, top: 100 });
    await hoverFor(300);
    expect(card().style.left).toBe('8px');
    expect(card().style.width).toBe(`${400 - 16}px`);
  });

  it('says so when there is no screenshot yet', async () => {
    request.mockResolvedValueOnce(null);
    await hoverFor(300);
    expect(card().querySelector('img')).toBeNull();
    expect(card().textContent).toContain('No preview yet');
  });

  it('never loads anything but an inline image', async () => {
    request.mockResolvedValueOnce({ image: 'https://evil.test/track.png', at: 0 });
    await hoverFor(300);
    expect(card().querySelector('img')).toBeNull();
  });

  it('shows nothing for the current tab or one already out in a mini window', async () => {
    await hoverFor(300, tabEl(1));
    await hoverFor(300, tabEl(3));
    expect(card()).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it('hides when the pointer leaves, but not on the way to the card', async () => {
    await hoverFor(300);
    leave(tabEl(2), card());
    await vi.advanceTimersByTimeAsync(300);
    expect(card()).not.toBeNull();
    leave(card());
    await vi.advanceTimersByTimeAsync(300);
    expect(card()).toBeNull();
  });

  it('stays while the pointer crosses the dock edge on its way to the card', async () => {
    await hoverFor(300);
    hover(mount.querySelector('.hh-bar')); // the dock's padding, outside any chip
    await vi.advanceTimersByTimeAsync(100);
    hover(card());
    await vi.advanceTimersByTimeAsync(1000);
    expect(card()).not.toBeNull();
  });

  it('waits long enough for an unhurried move across the gap to the card', async () => {
    await hoverFor(300);
    leave(tabEl(2));
    await vi.advanceTimersByTimeAsync(300);
    hover(card());
    await vi.advanceTimersByTimeAsync(1000);
    expect(card()).not.toBeNull();
  });

  it('follows the pointer to the next chip once a card is showing', async () => {
    chipAt(4, { left: 640, top: 100 });
    await hoverFor(300);
    leave(tabEl(2), tabEl(4));
    await hoverFor(300, tabEl(4));
    expect(card().textContent).toContain('Docs');
    expect(request).toHaveBeenLastCalledWith({ type: 'preview', tabId: 4 });
  });

  it('follows to the next chip while the pointer keeps moving over its parts', async () => {
    chipAt(4, { left: 640, top: 100 });
    await hoverFor(300);
    hover(tabEl(4));
    await vi.advanceTimersByTimeAsync(100);
    hover(tabEl(4).querySelector('.hh-title')); // still the same chip
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(card().textContent).toContain('Docs');
  });

  it('follows across the gap between chips too', async () => {
    chipAt(4, { left: 640, top: 100 });
    await hoverFor(300);
    hover(mount.querySelector('.hh-tabs'));
    await hoverFor(300, tabEl(4));
    expect(card().textContent).toContain('Docs');
  });

  it('hides as soon as the chip is pressed (switching or dragging)', async () => {
    await hoverFor(300);
    tabEl(2).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(card()).toBeNull();
  });

  it('opens the live tab with what the background needs to rest it on the dock', async () => {
    chipAt(2, { left: 500, top: 760 });
    dockAt({ top: 752, bottom: 800 });
    await hoverFor(300);
    card().dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        screenX: 750,
        screenY: 906,
        clientX: 650,
        clientY: 776,
      }),
    );
    // page pixels and the click; the background adds Chrome's zoom and works out the window
    expect(onPeek).toHaveBeenCalledWith(2, {
      dock: { left: 300, top: 752, right: 900, bottom: 800 },
      view: { width: 1200, height: 800 },
      point: { screenX: 750, screenY: 906, clientX: 650, clientY: 776 },
    });
    expect(card()).toBeNull();
  });

  it('drops a reply that arrives after the pointer moved on', async () => {
    let answer;
    request.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await hoverFor(300);
    preview.hide();
    answer({ image: IMAGE, at: 0 });
    await flushPromises();
    expect(card()).toBeNull();
  });
});

describe('keepPreviewFresh', () => {
  let fresh;
  let sent;
  const setPage = ({ visible = true, focused = true }) => {
    Object.defineProperty(document, 'visibilityState', {
      value: visible ? 'visible' : 'hidden',
      configurable: true,
    });
    document.hasFocus = () => focused;
  };

  beforeEach(() => {
    sent = [];
    fresh = ns.keepPreviewFresh({ doc: document, send: (m) => sent.push(m) });
  });

  afterEach(() => fresh.dispose());

  it('asks for a new screenshot every 30 s while the page is in view', async () => {
    setPage({});
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent).toEqual([{ type: 'seen' }, { type: 'seen' }]);
  });

  it('stays quiet while the tab is hidden or the window is in the background', async () => {
    setPage({ visible: false });
    await vi.advanceTimersByTimeAsync(30_000);
    setPage({ focused: false });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sent).toEqual([]);
  });

  it('stops when disposed', async () => {
    setPage({});
    fresh.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent).toEqual([]);
  });
});
