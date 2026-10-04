// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent, flushPromises } from './helpers/chrome.js';
import { loadContent } from './helpers/content.js';

const KEY = 'hoverHelper.position';
const DOCK = { width: 400, height: 44 };
const snapshot = {
  group: { id: 10, title: 'Work', color: 'blue' },
  tabs: [{ id: 1, title: 'One', favIconUrl: null, active: true }],
};

let ns;
let host;
let mount;
let storage;
let storageEvents;
let drag;
let clicks;

beforeAll(async () => {
  ns = await loadContent('core', 'format', 'styles', 'dom', 'render', 'drag');
});

beforeEach(async () => {
  setViewport(1024, 768);
  host = document.createElement('hover-helper-bar');
  host.style.setProperty('inset', 'auto 0 0 0', 'important');
  const shadow = host.attachShadow({ mode: 'open' });
  mount = document.createElement('div');
  shadow.append(mount);
  document.documentElement.append(host);
  ns.render(mount, { snapshot, collapsed: false });
  dockAt(312, 712); // the default bottom-centre spot for a 400×44 dock in 1024×768
  storage = { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) };
  storageEvents = createEvent();
  clicks = vi.fn();
  mount.addEventListener('click', clicks); // stands in for bindEvents' collapse handler
  drag = ns.bindDrag({ host, mount, win: window, storage, storageEvents });
  await flushPromises();
});

afterEach(() => {
  drag.dispose();
  host.remove();
});

/** jsdom has no layout: report the dock's box from wherever the host was last placed. */
function dockAt(left, top) {
  const dock = mount.querySelector('.hh-bar, .hh-pill');
  dock.getBoundingClientRect = () => {
    const placedLeft = parseFloat(host.style.getPropertyValue('left'));
    const placedTop = parseFloat(host.style.getPropertyValue('top'));
    const l = Number.isNaN(placedLeft) ? left : placedLeft;
    const t = Number.isNaN(placedTop) ? top : placedTop;
    return { left: l, top: t, width: DOCK.width, height: DOCK.height, right: l + DOCK.width };
  };
}

function setViewport(width, height) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

const label = () => mount.querySelector('.hh-label');
const pointer = (type, x, y, target = label()) =>
  target.dispatchEvent(
    new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, composed: true }),
  );
const placed = () => ({
  left: host.style.getPropertyValue('left'),
  top: host.style.getPropertyValue('top'),
  marked: host.hasAttribute('data-placed'),
});

function dragBy(dx, dy, from = { x: 330, y: 730 }) {
  pointer('pointerdown', from.x, from.y);
  pointer('pointermove', from.x + dx / 2, from.y + dy / 2);
  pointer('pointermove', from.x + dx, from.y + dy);
  pointer('pointerup', from.x + dx, from.y + dy);
  label().click(); // browsers fire a click after the drag's pointerup
}

describe('placement maths', () => {
  it('round-trips a position through viewport fractions', () => {
    const box = DOCK;
    const viewport = { width: 1024, height: 768 };
    const fraction = ns.placement.toFraction({ left: 200, top: 400 }, box, viewport);
    expect(ns.placement.toPixels(fraction, box, viewport)).toEqual({ left: 200, top: 400 });
  });

  it('keeps the dock fully on screen', () => {
    const fraction = ns.placement.toFraction({ left: 5000, top: -50 }, DOCK, {
      width: 1024,
      height: 768,
    });
    expect(fraction).toEqual({ x: 1, y: 0 });
    expect(
      ns.placement.toPixels(
        { x: 0.5, y: 0.5 },
        { width: 2000, height: 900 },
        { width: 1024, height: 768 },
      ),
    ).toEqual({ left: 0, top: 0 });
  });
});

describe('dragging the group name', () => {
  it('moves the bar with the pointer and remembers the spot for every site', async () => {
    dragBy(-130, -330); // dock from (312, 712) to (182, 382)
    expect(placed()).toEqual({ left: '182px', top: '382px', marked: true });
    await flushPromises();
    expect(storage.set).toHaveBeenCalledWith({
      [KEY]: { x: 182 / (1024 - 400), y: 382 / (768 - 44) },
    });
  });

  it('swallows the click that ends a drag, so dragging never collapses the bar', () => {
    dragBy(-130, -330);
    expect(clicks).not.toHaveBeenCalled();
  });

  it('treats a tiny movement as a click (collapse still works)', () => {
    dragBy(2, 1);
    expect(clicks).toHaveBeenCalledOnce();
    expect(placed().marked).toBe(false);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('stops at the window edges', () => {
    dragBy(5000, 5000);
    expect(placed()).toMatchObject({ left: '624px', top: '724px' });
  });

  it('snaps home when dropped near the default bottom-centre spot', async () => {
    dragBy(-130, -330);
    dragBy(140, 320, { x: 200, y: 400 }); // back to within a few px of (312, 712)
    expect(placed().marked).toBe(false);
    expect(host.style.getPropertyValue('inset')).toBe('auto 0 0 0');
    await flushPromises();
    expect(storage.set).toHaveBeenLastCalledWith({ [KEY]: null });
  });

  it('keeps following the pointer once it leaves the group name', () => {
    // Like a browser: moves go to the element under the pointer unless it was captured.
    let captured = null;
    const name = label();
    name.setPointerCapture = () => (captured = name);
    const send = (type, x, y, target) => {
      const event = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      target.dispatchEvent(event);
    };
    send('pointerdown', 330, 730, name);
    send('pointermove', 200, 400, captured ?? document.body); // first move is far off the label
    send('pointermove', 200, 400, captured ?? document.body);
    send('pointerup', 200, 400, captured ?? document.body);
    expect(placed()).toMatchObject({ left: '182px', top: '382px', marked: true });
  });

  it('ignores secondary buttons and pointers outside the group name', () => {
    label().dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 330, clientY: 730, button: 2, bubbles: true }),
    );
    pointer('pointermove', 100, 100);
    pointer('pointerdown', 330, 730, mount.querySelector('.hh-tab'));
    pointer('pointermove', 100, 100, mount.querySelector('.hh-tab'));
    expect(placed().marked).toBe(false);
  });
});

describe('keyboard', () => {
  const key = (k, alt = true) =>
    label().dispatchEvent(new KeyboardEvent('keydown', { key: k, altKey: alt, bubbles: true }));

  it('moves the bar with Alt+arrows and resets it with Alt+Home', async () => {
    key('ArrowUp');
    expect(placed()).toMatchObject({ left: '312px', top: '696px', marked: true });
    key('ArrowLeft');
    expect(placed()).toMatchObject({ left: '296px', top: '696px' });
    await flushPromises();
    expect(storage.set).toHaveBeenCalled();
    key('Home');
    expect(placed().marked).toBe(false);
  });

  it('leaves plain arrows alone', () => {
    key('ArrowUp', false);
    expect(placed().marked).toBe(false);
  });
});

describe('remembered position', () => {
  async function restart(stored) {
    drag.dispose();
    storage.get.mockResolvedValueOnce(stored);
    drag = ns.bindDrag({ host, mount, win: window, storage, storageEvents });
    await flushPromises();
  }

  it('restores the saved spot when a page loads', async () => {
    await restart({ [KEY]: { x: 0.5, y: 0 } });
    expect(placed()).toEqual({ left: '312px', top: '0px', marked: true });
  });

  it('ignores a corrupt saved value', async () => {
    await restart({ [KEY]: { x: 'left', y: null } });
    expect(placed().marked).toBe(false);
  });

  it('follows moves made in other tabs', () => {
    storageEvents.emit({ [KEY]: { newValue: { x: 0, y: 0 } } }, 'local');
    expect(placed()).toMatchObject({ left: '0px', top: '0px' });
    storageEvents.emit({ [KEY]: { newValue: null } }, 'local');
    expect(placed().marked).toBe(false);
  });

  it('keeps the same relative spot when the window is resized', async () => {
    await restart({ [KEY]: { x: 1, y: 1 } });
    setViewport(800, 600);
    window.dispatchEvent(new Event('resize'));
    expect(placed()).toMatchObject({ left: '400px', top: '556px' });
  });

  it('re-clamps after the bar re-renders at a different size', async () => {
    await restart({ [KEY]: { x: 1, y: 1 } });
    ns.render(mount, { snapshot, collapsed: true });
    const pill = mount.querySelector('.hh-pill');
    pill.getBoundingClientRect = () => ({ left: 0, top: 0, width: 80, height: 32 });
    await flushPromises();
    expect(placed()).toMatchObject({ left: '944px', top: '736px' });
  });

  it('stops reacting after dispose', () => {
    drag.dispose();
    dragBy(-130, -330);
    storageEvents.emit({ [KEY]: { newValue: { x: 0, y: 0 } } }, 'local');
    expect(placed().marked).toBe(false);
  });
});
