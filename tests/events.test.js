// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContent } from './helpers/content.js';

let ns;
let mount;
let shadow;
let handlers;

const snapshot = {
  group: { id: 10, title: 'Work', color: 'blue' },
  tabs: [1, 2, 3].map((id) => ({ id, title: `Tab ${id}`, favIconUrl: null, active: id === 2 })),
};

beforeAll(async () => {
  ns = await loadContent('core', 'format', 'styles', 'dom', 'render', 'events');
});

beforeEach(() => {
  document.body.replaceChildren();
  const host = document.createElement('div');
  document.body.append(host);
  shadow = host.attachShadow({ mode: 'open' });
  mount = document.createElement('div');
  shadow.append(mount);
  handlers = {
    onActivate: vi.fn(),
    onClose: vi.fn(),
    onNew: vi.fn(),
    onToggleCollapse: vi.fn(),
  };
  ns.bindEvents(mount, handlers);
  ns.render(mount, { snapshot, collapsed: false });
});

const q = (sel) => mount.querySelector(sel);
const tab = (id) => q(`[role="tab"][data-tab-id="${id}"]`);
const key = (target, k) => {
  const event = new KeyboardEvent('keydown', {
    key: k,
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
};

describe('mouse', () => {
  it('activates a tab on click (including on its title)', () => {
    tab(3).querySelector('.hh-title').click();
    expect(handlers.onActivate).toHaveBeenCalledWith(3);
  });

  it('closes via the × button without activating', () => {
    q('[data-action="close"][data-tab-id="1"]').click();
    expect(handlers.onClose).toHaveBeenCalledWith(1);
    expect(handlers.onActivate).not.toHaveBeenCalled();
  });

  it('closes on middle-click and suppresses autoscroll', () => {
    const down = new MouseEvent('mousedown', { button: 1, bubbles: true, cancelable: true });
    tab(2).dispatchEvent(down);
    tab(2).dispatchEvent(
      new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }),
    );
    expect(down.defaultPrevented).toBe(true);
    expect(handlers.onClose).toHaveBeenCalledWith(2);
  });

  it('ignores right-click auxclick', () => {
    tab(2).dispatchEvent(new MouseEvent('auxclick', { button: 2, bubbles: true }));
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it('opens a new tab and toggles collapse', () => {
    q('[data-action="new"]').click();
    q('[data-action="collapse"]').click();
    expect(handlers.onNew).toHaveBeenCalledOnce();
    expect(handlers.onToggleCollapse).toHaveBeenCalledOnce();
  });

  it('expands from the pill after a re-render', () => {
    ns.render(mount, { snapshot, collapsed: true });
    q('[data-action="expand"]').click();
    expect(handlers.onToggleCollapse).toHaveBeenCalledOnce();
  });
});

describe('keyboard', () => {
  it.each(['Enter', ' '])('%j activates the focused tab', (k) => {
    key(tab(1), k);
    expect(handlers.onActivate).toHaveBeenCalledWith(1);
  });

  it.each(['Delete', 'Backspace'])('%s closes the focused tab', (k) => {
    key(tab(3), k);
    expect(handlers.onClose).toHaveBeenCalledWith(3);
  });

  it('moves focus with arrows (wrapping) and Home/End, updating tabindex', () => {
    tab(2).focus();
    key(tab(2), 'ArrowRight');
    expect(shadow.activeElement).toBe(tab(3));
    expect(tab(3).tabIndex).toBe(0);
    expect(tab(2).tabIndex).toBe(-1);
    key(tab(3), 'ArrowRight');
    expect(shadow.activeElement).toBe(tab(1));
    key(tab(1), 'ArrowLeft');
    expect(shadow.activeElement).toBe(tab(3));
    key(tab(3), 'Home');
    expect(shadow.activeElement).toBe(tab(1));
    key(tab(1), 'End');
    expect(shadow.activeElement).toBe(tab(3));
  });

  it.each(['keydown', 'keyup', 'keypress'])(
    'keeps %s inside the bar away from page shortcuts',
    (type) => {
      const pageListener = vi.fn();
      document.addEventListener(type, pageListener);
      tab(1).dispatchEvent(new KeyboardEvent(type, { key: 'j', bubbles: true, composed: true }));
      document.removeEventListener(type, pageListener);
      expect(pageListener).not.toHaveBeenCalled();
    },
  );
});
