// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadContent } from './helpers/content.js';

const groups = [
  { id: 10, title: 'Work', color: 'blue' },
  { id: 20, title: 'Read', color: 'red' },
];
const snapshot = { group: groups[0], groups, tabs: [] };
const DOCK = { left: 100, top: 600, width: 400, height: 44 };

let ns;
let layer;
let drop;

beforeAll(async () => {
  ns = await loadContent('core', 'format', 'dropzone');
});

beforeEach(() => {
  document.body.replaceChildren();
  layer = document.createElement('div');
  document.body.append(layer);
  drop = ns.createGroupDrop({ layer });
});

const targets = () => [...layer.querySelectorAll('.hh-drop-target')];
const centre = (el) => ({
  x: parseFloat(el.style.getPropertyValue('left')) + 15,
  y: parseFloat(el.style.getPropertyValue('top')) + 15,
});

describe('group drop targets', () => {
  it('shows the other groups, ungrouped and a new group above the dock', () => {
    drop.show({ snapshot, tabId: 1, dock: DOCK });
    expect(targets().map((t) => t.getAttribute('aria-label'))).toEqual([
      'Read',
      'Ungrouped',
      'New group',
    ]);
    for (const t of targets()) expect(centre(t).y).toBeLessThan(DOCK.top);
  });

  it('leaves out "Ungrouped" for a tab that has no group', () => {
    drop.show({ snapshot: { ...snapshot, group: null }, tabId: 1, dock: DOCK });
    expect(targets().map((t) => t.getAttribute('aria-label'))).toEqual([
      'Work',
      'Read',
      'New group',
    ]);
  });

  it('picks the target under the pointer, highlights it and names it', () => {
    drop.show({ snapshot, tabId: 1, dock: DOCK });
    const [read, ungroup, fresh] = targets();
    expect(drop.pick(centre(read).x, centre(read).y)).toEqual({
      type: 'regroup',
      tabId: 1,
      groupId: 20,
    });
    expect(read.classList).toContain('hh-drop-target--hot');
    expect(layer.querySelector('.hh-drop-label').textContent).toBe('Read');
    expect(drop.pick(centre(ungroup).x, centre(ungroup).y)).toEqual({
      type: 'regroup',
      tabId: 1,
      groupId: -1,
    });
    expect(read.classList).not.toContain('hh-drop-target--hot');
    expect(drop.pick(centre(fresh).x, centre(fresh).y)).toEqual({ type: 'newgroup', tabId: 1 });
  });

  it('picks nothing away from the targets', () => {
    drop.show({ snapshot, tabId: 1, dock: DOCK });
    expect(drop.pick(0, 0)).toBeNull();
    expect(layer.querySelector('.hh-drop-target--hot')).toBeNull();
    expect(layer.querySelector('.hh-drop-label').textContent).toBe('Drop on a group');
  });

  it('carries a floating copy of the chip under the pointer', () => {
    const ghost = document.createElement('li');
    drop.show({ snapshot, tabId: 1, dock: DOCK, ghost });
    drop.pick(240, 330);
    expect(ghost.classList).toContain('hh-drop-ghost');
    expect(ghost.isConnected).toBe(true);
    expect([ghost.style.left, ghost.style.top]).toEqual(['240px', '330px']);
  });

  it('clears everything on hide', () => {
    drop.show({ snapshot, tabId: 1, dock: DOCK });
    drop.hide();
    expect(layer.childElementCount).toBe(0);
    expect(drop.pick(0, 0)).toBeNull();
  });
});
