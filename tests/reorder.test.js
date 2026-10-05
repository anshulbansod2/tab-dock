// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContent } from './helpers/content.js';

const CHIP = { width: 100, gap: 4, top: 700, height: 32 };
const snapshot = {
  group: { id: 10, title: 'Work', color: 'blue' },
  tabs: [1, 2, 3, 4].map((id) => ({ id, title: `Tab ${id}`, favIconUrl: null, active: id === 1 })),
};

let ns;
let mount;
let callbacks;
let reorder;
let clicks;

beforeAll(async () => {
  ns = await loadContent('core', 'format', 'styles', 'dom', 'render', 'reorder');
});

beforeEach(() => {
  document.body.replaceChildren();
  const host = document.createElement('div');
  document.body.append(host);
  mount = document.createElement('div');
  host.attachShadow({ mode: 'open' }).append(mount);
  ns.render(mount, { snapshot, collapsed: false });
  layOutChips();
  callbacks = {
    onMove: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    onLift: vi.fn(),
    onPick: vi.fn(() => null),
    onLower: vi.fn(),
    onDrop: vi.fn(),
  };
  clicks = vi.fn();
  mount.addEventListener('click', clicks); // stands in for bindEvents' activate handler
  reorder = ns.bindReorder(mount, callbacks);
});

afterEach(() => reorder.dispose());

/** jsdom has no layout: chips sit in a row, 100 px wide with 4 px gaps, starting at x = 0. */
function layOutChips() {
  mount.querySelectorAll('.hh-chip').forEach((chip, i) => {
    const left = i * (CHIP.width + CHIP.gap);
    chip.getBoundingClientRect = () => ({
      left,
      right: left + CHIP.width,
      width: CHIP.width,
      top: CHIP.top,
      bottom: CHIP.top + CHIP.height,
      height: CHIP.height,
    });
  });
}

const tab = (id) => mount.querySelector(`.hh-tab[data-tab-id="${id}"]`);
const chipOf = (id) => tab(id).closest('.hh-chip');
const order = () => [...mount.querySelectorAll('.hh-tab')].map((t) => Number(t.dataset.tabId));
const shift = (id) => chipOf(id).style.transform;

/** Like a browser: moves go to the captured element, else to whatever is under the pointer. */
function pointer(type, x, target, y = CHIP.top + 10) {
  const event = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
}

function drag(id, toX, { release = true } = {}) {
  let captured = null;
  tab(id).setPointerCapture = () => (captured = tab(id));
  const startX = chipOf(id).getBoundingClientRect().left + 50;
  pointer('pointerdown', startX, tab(id));
  pointer('pointermove', (startX + toX) / 2, captured ?? document.body);
  pointer('pointermove', toX, captured ?? document.body);
  if (!release) return;
  pointer('pointerup', toX, captured ?? document.body);
  tab(id).click(); // browsers fire a click after the pointerup
}

describe('dragging a tab chip', () => {
  it('reorders the tab where it is dropped and tells the background', () => {
    drag(1, 260); // chip 1's centre passes chips 2 and 3's midpoints
    expect(callbacks.onMove).toHaveBeenCalledWith(1, 2);
    expect(order()).toEqual([2, 3, 1, 4]); // shown at once, before Chrome confirms
  });

  it('moves leftwards too', () => {
    drag(4, 40);
    expect(callbacks.onMove).toHaveBeenCalledWith(4, 0);
    expect(order()).toEqual([4, 1, 2, 3]);
  });

  it('slides the other chips aside while dragging and follows the pointer', () => {
    drag(1, 260, { release: false });
    expect(chipOf(1).classList).toContain('hh-chip--dragging');
    expect(shift(1)).toBe('translateX(210px)');
    expect([shift(2), shift(3), shift(4)]).toEqual([
      'translateX(-104px)',
      'translateX(-104px)',
      '',
    ]);
    expect(callbacks.onDragStart).toHaveBeenCalledOnce();
  });

  it('cleans up after the drop', () => {
    drag(1, 260);
    expect(mount.querySelector('.hh-chip--dragging')).toBeNull();
    expect([1, 2, 3, 4].map(shift)).toEqual(['', '', '', '']);
    expect(callbacks.onDragEnd).toHaveBeenCalledOnce();
  });

  it('swallows the click that ends a drag, so dropping never switches tabs', () => {
    drag(1, 260);
    expect(clicks).not.toHaveBeenCalled();
  });

  it('treats a tiny movement as a click', () => {
    drag(1, 53);
    expect(clicks).toHaveBeenCalledOnce();
    expect(callbacks.onMove).not.toHaveBeenCalled();
    expect(callbacks.onDragStart).not.toHaveBeenCalled();
  });

  it('sends nothing when dropped back in place', () => {
    drag(2, 160);
    expect(callbacks.onMove).not.toHaveBeenCalled();
    expect(callbacks.onDragEnd).toHaveBeenCalledOnce();
  });

  it('ignores the close button, other buttons and a single-tab bar', () => {
    const close = mount.querySelector('[data-action="close"]');
    pointer('pointerdown', 90, close);
    pointer('pointermove', 300, close);
    tab(1).dispatchEvent(new MouseEvent('pointerdown', { clientX: 50, button: 2, bubbles: true }));
    pointer('pointermove', 300, tab(1));
    ns.render(mount, {
      snapshot: { ...snapshot, tabs: snapshot.tabs.slice(0, 1) },
      collapsed: false,
    });
    layOutChips();
    pointer('pointerdown', 50, tab(1));
    pointer('pointermove', 300, tab(1));
    expect(callbacks.onDragStart).not.toHaveBeenCalled();
  });

  it('cancels cleanly when the pointer is cancelled', () => {
    drag(1, 260, { release: false });
    pointer('pointercancel', 260, tab(1));
    expect(callbacks.onMove).not.toHaveBeenCalled();
    expect(callbacks.onDragEnd).toHaveBeenCalledOnce();
    expect(order()).toEqual([1, 2, 3, 4]);
    expect(shift(1)).toBe('');
  });

  it('stops reacting after dispose', () => {
    reorder.dispose();
    drag(1, 260);
    expect(callbacks.onMove).not.toHaveBeenCalled();
  });
});

describe('lifting a chip off the dock to change its group', () => {
  const REGROUP = { type: 'regroup', tabId: 2, groupId: 20 };

  function lift(id, y) {
    let captured = null;
    tab(id).setPointerCapture = () => (captured = tab(id));
    const x = chipOf(id).getBoundingClientRect().left + 50;
    pointer('pointerdown', x, tab(id));
    pointer('pointermove', x, captured ?? document.body, CHIP.top - 10);
    pointer('pointermove', x + 8, captured ?? document.body, y);
    return { x: x + 8, captured };
  }

  it('shows the group targets once the chip is pulled well above the dock', () => {
    lift(2, CHIP.top - 60);
    expect(callbacks.onLift).toHaveBeenCalledWith(2);
    expect(callbacks.onPick).toHaveBeenLastCalledWith(162, CHIP.top - 60);
    // The strip clips anything outside it, so a floating copy (the bar's job) follows the
    // pointer; the chip itself stays put, dimmed, and no reorder preview shows.
    expect(chipOf(2).classList).toContain('hh-chip--lifted');
    expect([shift(1), shift(2), shift(3)]).toEqual(['', '', '']);
  });

  it('a small upward wobble still reorders', () => {
    lift(2, CHIP.top - 10);
    expect(callbacks.onLift).not.toHaveBeenCalled();
  });

  it('dropping on a target moves the tab there instead of reordering', () => {
    callbacks.onPick.mockReturnValue(REGROUP);
    const { x, captured } = lift(2, CHIP.top - 60);
    pointer('pointerup', x, captured, CHIP.top - 60);
    expect(callbacks.onDrop).toHaveBeenCalledWith(REGROUP);
    expect(callbacks.onMove).not.toHaveBeenCalled();
    expect(callbacks.onLower).toHaveBeenCalledOnce();
    expect(order()).toEqual([1, 2, 3, 4]);
  });

  it('dropping away from the targets cancels', () => {
    const { x, captured } = lift(2, CHIP.top - 60);
    pointer('pointerup', x, captured, CHIP.top - 60);
    expect(callbacks.onDrop).not.toHaveBeenCalled();
    expect(callbacks.onMove).not.toHaveBeenCalled();
    expect(callbacks.onLower).toHaveBeenCalledOnce();
  });

  it('bringing the chip back down hides the targets and reorders again', () => {
    const { captured } = lift(2, CHIP.top - 60);
    pointer('pointermove', 270, captured, CHIP.top + 10);
    expect(callbacks.onLower).toHaveBeenCalledOnce();
    expect(chipOf(2).classList).not.toContain('hh-chip--lifted');
    pointer('pointerup', 270, captured, CHIP.top + 10);
    expect(callbacks.onMove).toHaveBeenCalledWith(2, 2);
  });
});
