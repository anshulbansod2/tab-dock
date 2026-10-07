// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContent } from './helpers/content.js';

const work = { id: 10, title: 'Work', color: 'blue' };

let ns;
let layer;
let send;
let editor;
let opener;
let shadow;

beforeAll(async () => {
  ns = await loadContent('core', 'format', 'menu', 'groupedit');
});

beforeEach(() => {
  document.body.replaceChildren();
  const host = document.createElement('div');
  document.body.append(host);
  shadow = host.attachShadow({ mode: 'open' });
  layer = document.createElement('div');
  opener = document.createElement('button');
  shadow.append(opener, layer);
  send = vi.fn();
  editor = ns.createGroupEditor({ layer, win: window, send });
});

afterEach(() => editor.dispose());

const point = { x: 200, y: 700 };
const q = (sel) => layer.querySelector(sel);
const name = () => q('.hh-editor-name');
const color = (c) => q(`.hh-color[data-color="${c}"]`);
const key = (el, k) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true }));
const type = (text) => {
  name().value = text;
  name().dispatchEvent(new Event('input', { bubbles: true }));
};

describe('renaming a group', () => {
  beforeEach(() => editor.open({ group: work, point, returnFocus: opener }));

  it('opens on the name, selected, with the colour checked', () => {
    expect(q('.hh-editor').getAttribute('aria-label')).toBe('Edit group');
    expect(shadow.activeElement).toBe(name());
    expect(name().value).toBe('Work');
    expect(name().selectionStart).toBe(0);
    expect(name().selectionEnd).toBe(4);
    expect(color('blue').getAttribute('aria-checked')).toBe('true');
    expect(layer.querySelectorAll('.hh-color')).toHaveLength(9);
  });

  it('saves the new name on Enter and gives focus back', () => {
    type('Deep work');
    key(name(), 'Enter');
    expect(send).toHaveBeenCalledWith({ type: 'editgroup', groupId: 10, title: 'Deep work' });
    expect(editor.isOpen()).toBe(false);
    expect(shadow.activeElement).toBe(opener);
  });

  it('sends nothing when the name is unchanged', () => {
    key(name(), 'Enter');
    expect(send).not.toHaveBeenCalled();
    expect(editor.isOpen()).toBe(false);
  });

  it('applies a colour at once and keeps the panel open', () => {
    color('green').click();
    expect(send).toHaveBeenCalledWith({ type: 'editgroup', groupId: 10, color: 'green' });
    expect(color('green').getAttribute('aria-checked')).toBe('true');
    expect(color('blue').getAttribute('aria-checked')).toBe('false');
    expect(editor.isOpen()).toBe(true);
  });

  it('drops the edit on Escape', () => {
    type('Nope');
    key(name(), 'Escape');
    expect(send).not.toHaveBeenCalled();
    expect(editor.isOpen()).toBe(false);
    expect(shadow.activeElement).toBe(opener);
  });

  it('keeps a typed name when clicking away, as the tab strip does', () => {
    type('Kept');
    q('.hh-backdrop').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(send).toHaveBeenCalledWith({ type: 'editgroup', groupId: 10, title: 'Kept' });
    expect(editor.isOpen()).toBe(false);
  });

  it("keeps the page's shortcuts from seeing what is typed", () => {
    const page = vi.fn();
    document.addEventListener('keydown', page);
    key(name(), 'j');
    document.removeEventListener('keydown', page);
    expect(page).not.toHaveBeenCalled();
  });
});

describe('making a named group', () => {
  beforeEach(() => editor.open({ tabId: 4, taken: ['blue', 'red'], point, returnFocus: opener }));

  it('opens empty, suggesting a colour no group uses yet', () => {
    expect(q('.hh-editor').getAttribute('aria-label')).toBe('New group');
    expect(name().value).toBe('');
    expect(name().placeholder).toBe('Name this group');
    expect(color('yellow').getAttribute('aria-checked')).toBe('true');
  });

  it('makes the group with its name and chosen colour on Enter', () => {
    type(' Trip ');
    color('cyan').click();
    expect(send).not.toHaveBeenCalled(); // nothing exists until it is made
    key(name(), 'Enter');
    expect(send).toHaveBeenCalledWith({ type: 'newgroup', tabId: 4, title: 'Trip', color: 'cyan' });
  });

  it('makes it from the Create button too', () => {
    type('Trip');
    q('.hh-editor-go').click();
    expect(send).toHaveBeenCalledWith({
      type: 'newgroup',
      tabId: 4,
      title: 'Trip',
      color: 'yellow',
    });
  });

  it('makes nothing when clicked away', () => {
    type('Trip');
    q('.hh-backdrop').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(send).not.toHaveBeenCalled();
    expect(editor.isOpen()).toBe(false);
  });
});
