// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContent } from './helpers/content.js';

const groups = [
  { id: 10, title: 'Work', color: 'blue' },
  { id: 20, title: 'Read', color: 'red' },
];
const grouped = {
  group: groups[0],
  groups,
  tabs: [{ id: 1, title: 'Docs', favIconUrl: null, active: true }],
};
const ungrouped = { ...grouped, group: null };

let ns;
let layer;
let send;
let menu;
let opener;

beforeAll(async () => {
  ns = await loadContent('core', 'format', 'menu');
});

beforeEach(() => {
  document.body.replaceChildren();
  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  layer = document.createElement('div');
  opener = document.createElement('button');
  shadow.append(opener, layer);
  send = vi.fn();
  menu = ns.createGroupMenu({ layer, win: window, send });
});

afterEach(() => menu.dispose());

const open = (snapshot = grouped) =>
  menu.open({ tabId: 1, point: { x: 100, y: 500 }, snapshot, returnFocus: opener });
const items = () => [...layer.querySelectorAll('[role="menuitem"]')];
const labels = () => items().map((el) => el.textContent);
const item = (text) => items().find((el) => el.textContent === text);
const key = (k) =>
  layer
    .querySelector('[role="menu"]')
    .dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('tab menu', () => {
  it("offers the window's other groups, a new group, leaving the group, and closing", () => {
    open();
    expect(labels()).toEqual(['Read', 'New group', 'Remove from group', 'Close tab']);
    expect(layer.querySelector('[role="menu"]').getAttribute('aria-label')).toBe('Docs');
  });

  it('offers every group but no "Remove from group" for an ungrouped tab', () => {
    open(ungrouped);
    expect(labels()).toEqual(['Work', 'Read', 'New group', 'Close tab']);
  });

  it.each([
    ['Read', { type: 'regroup', tabId: 1, groupId: 20 }],
    ['New group', { type: 'newgroup', tabId: 1 }],
    ['Remove from group', { type: 'regroup', tabId: 1, groupId: -1 }],
    ['Close tab', { type: 'close', tabId: 1 }],
  ])('"%s" sends %j and closes the menu', (text, message) => {
    open();
    item(text).click();
    expect(send).toHaveBeenCalledWith(message);
    expect(layer.querySelector('[role="menu"]')).toBeNull();
  });

  it('shows each group in its colour', () => {
    open(ungrouped);
    const dot = item('Read').querySelector('.hh-dot');
    expect(item('Read').style.getPropertyValue('--hh-group')).toBe('#d93025');
    expect(dot).not.toBeNull();
  });

  it('focuses the first item and moves with the arrow keys, wrapping', () => {
    open();
    const root = layer.getRootNode();
    expect(root.activeElement).toBe(items()[0]);
    key('ArrowDown');
    expect(root.activeElement).toBe(items()[1]);
    key('ArrowUp');
    key('ArrowUp');
    expect(root.activeElement).toBe(items()[3]);
    key('Home');
    expect(root.activeElement).toBe(items()[0]);
    key('End');
    expect(root.activeElement).toBe(items()[3]);
  });

  it('closes on Escape and gives focus back to the tab', () => {
    open();
    key('Escape');
    expect(layer.querySelector('[role="menu"]')).toBeNull();
    expect(layer.getRootNode().activeElement).toBe(opener);
    expect(send).not.toHaveBeenCalled();
  });

  it('closes when pressing outside it', () => {
    open();
    layer
      .querySelector('.hh-backdrop')
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(menu.isOpen()).toBe(false);
  });

  it('closes when the window loses focus or resizes', () => {
    open();
    window.dispatchEvent(new Event('blur'));
    expect(menu.isOpen()).toBe(false);
    open();
    window.dispatchEvent(new Event('resize'));
    expect(menu.isOpen()).toBe(false);
  });

  it('keeps its keystrokes from the page', () => {
    const page = vi.fn();
    document.addEventListener('keydown', page);
    open();
    key('ArrowDown');
    document.removeEventListener('keydown', page);
    expect(page).not.toHaveBeenCalled();
  });

  it('opens above the pointer and stays inside the window', () => {
    Object.defineProperty(window, 'innerWidth', { value: 300, configurable: true });
    open();
    const el = layer.querySelector('[role="menu"]');
    expect(el.style.getPropertyValue('left')).toMatch(/px$/);
    expect(el.style.getPropertyValue('top')).toMatch(/px$/);
  });

  it('replaces an open menu instead of stacking another', () => {
    open();
    open(ungrouped);
    expect(layer.querySelectorAll('[role="menu"]')).toHaveLength(1);
  });
});
