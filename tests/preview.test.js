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
    expect(parseFloat(card().style.top)).toBeGreaterThan(132);
  });

  it('opens above the chip when the dock sits at the bottom', async () => {
    chipAt(2, { left: 500, top: 760 });
    await hoverFor(300);
    expect(parseFloat(card().style.top)).toBeLessThan(760);
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

  it('hides as soon as the chip is pressed (switching or dragging)', async () => {
    await hoverFor(300);
    tabEl(2).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(card()).toBeNull();
  });

  it('turns into the live tab when clicked, in a mini window where the card was', async () => {
    setWindow({ screenX: 100, screenY: 50, outerWidth: 1200, outerHeight: 880 });
    await hoverFor(300);
    card().getBoundingClientRect = () => ({ left: 400, top: 140, width: 360, height: 270 });
    card().click();
    expect(onPeek).toHaveBeenCalledWith(2, { left: 500, top: 242, width: 480, height: 320 });
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
