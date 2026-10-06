import { describe, expect, it } from 'vitest';
import { buildGroupView, buildSnapshot } from '../background/tabModel.js';
import { makeTab } from './helpers/chrome.js';

const groups = [
  { id: 10, title: 'Research', color: 'blue', windowId: 1, collapsed: false },
  { id: 20, title: '', color: 'red', windowId: 1, collapsed: false },
];

describe('buildSnapshot', () => {
  it('returns same-group tabs in strip order with the group label', () => {
    const tabs = [
      makeTab({ id: 3, index: 2, groupId: 10 }),
      makeTab({ id: 1, index: 0, groupId: 10 }),
      makeTab({ id: 2, index: 1 }),
      makeTab({ id: 4, index: 3, groupId: 20 }),
    ];
    const snap = buildSnapshot({ tabs, groups, tabId: 1 });
    expect(snap.group).toEqual({ id: 10, title: 'Research', color: 'blue' });
    expect(snap.tabs.map((t) => t.id)).toEqual([1, 3]);
  });

  it('returns every ungrouped tab, pinned included, for an ungrouped tab', () => {
    const tabs = [
      makeTab({ id: 5, index: 0, pinned: true }),
      makeTab({ id: 2, index: 1 }),
      makeTab({ id: 1, index: 2, groupId: 10 }),
      makeTab({ id: 6, index: 3 }),
    ];
    const snap = buildSnapshot({ tabs, groups, tabId: 2 });
    expect(snap.group).toBeNull();
    expect(snap.tabs.map((t) => t.id)).toEqual([5, 2, 6]);
  });

  it('treats a pinned tab as ungrouped even if it reports a groupId', () => {
    const tabs = [makeTab({ id: 7, pinned: true, groupId: 10 }), makeTab({ id: 8, index: 1 })];
    const snap = buildSnapshot({ tabs, groups, tabId: 7 });
    expect(snap.group).toBeNull();
    expect(snap.tabs.map((t) => t.id)).toEqual([7, 8]);
  });

  it("lists the window's groups in strip order, as places a tab can move to", () => {
    const tabs = [
      makeTab({ id: 1, index: 0, groupId: 20 }),
      makeTab({ id: 2, index: 1 }),
      makeTab({ id: 3, index: 2, groupId: 10 }),
      makeTab({ id: 4, index: 3, groupId: 20 }),
    ];
    const snap = buildSnapshot({ tabs, groups, tabId: 2 });
    expect(snap.groups).toEqual([
      { id: 20, title: 'Group', color: 'red' },
      { id: 10, title: 'Research', color: 'blue' },
    ]);
  });

  it("leaves a peeked tab out of other groups' bars", () => {
    const tabs = [makeTab({ id: 1, index: 0, groupId: 20 })];
    const away = [
      { tab: makeTab({ id: 2, windowId: 77 }), origin: { windowId: 1, index: 1, groupId: 10 } },
    ];
    expect(buildSnapshot({ tabs, groups, tabId: 1, away }).tabs.map((t) => t.id)).toEqual([1]);
  });

  it("tells a peeked tab's own bar where it will return to", () => {
    const tabs = [makeTab({ id: 2, windowId: 77 })];
    const snap = buildSnapshot({ tabs, groups, tabId: 2, home: groups[0] });
    expect(snap.peek).toEqual({ home: { id: 10, title: 'Research', color: 'blue' } });
    expect(buildSnapshot({ tabs, groups, tabId: 2, home: null }).peek).toEqual({ home: null });
    expect(buildSnapshot({ tabs, groups, tabId: 2 }).peek).toBeUndefined();
  });

  it('labels a group with an empty title as "Group"', () => {
    const snap = buildSnapshot({ tabs: [makeTab({ id: 4, groupId: 20 })], groups, tabId: 4 });
    expect(snap.group).toEqual({ id: 20, title: 'Group', color: 'red' });
  });

  it('uses default title and colour when the group is not known yet', () => {
    const snap = buildSnapshot({ tabs: [makeTab({ id: 4, groupId: 99 })], groups, tabId: 4 });
    expect(snap.group).toEqual({ id: 99, title: 'Group', color: 'grey' });
  });

  it('marks only the bar’s own tab as active', () => {
    const tabs = [makeTab({ id: 1, active: true }), makeTab({ id: 2, index: 1 })];
    const snap = buildSnapshot({ tabs, groups, tabId: 2 });
    expect(snap.tabs.map((t) => t.active)).toEqual([false, true]);
  });

  it('falls back to url then "Untitled", and to null for missing favicons', () => {
    const tabs = [
      makeTab({ id: 1, title: '', favIconUrl: '' }),
      makeTab({ id: 2, index: 1, title: '', url: '', favIconUrl: undefined }),
    ];
    const snap = buildSnapshot({ tabs, groups, tabId: 1 });
    expect(snap.tabs[0]).toMatchObject({ title: 'https://example.com/1', favIconUrl: null });
    expect(snap.tabs[1]).toMatchObject({ title: 'Untitled', favIconUrl: null });
  });

  it('treats an unknown tabId as ungrouped with no active tab', () => {
    const tabs = [makeTab({ id: 1 }), makeTab({ id: 2, index: 1, groupId: 10 })];
    const snap = buildSnapshot({ tabs, groups, tabId: 42 });
    expect(snap.group).toBeNull();
    expect(snap.tabs).toEqual([expect.objectContaining({ id: 1, active: false })]);
  });

  it('skips tabs without an id', () => {
    const tabs = [makeTab({ id: 1 }), { ...makeTab({ index: 1 }), id: undefined }];
    expect(buildSnapshot({ tabs, groups, tabId: 1 }).tabs).toHaveLength(1);
  });
});

describe('switching groups', () => {
  it('says whether the window has ungrouped tabs to switch to', () => {
    const grouped = [makeTab({ id: 1, groupId: 10 }), makeTab({ id: 2, index: 1, groupId: 20 })];
    expect(buildSnapshot({ tabs: grouped, groups, tabId: 1 }).hasUngrouped).toBe(false);
    const mixed = [...grouped, makeTab({ id: 3, index: 2, pinned: true, groupId: 10 })];
    expect(buildSnapshot({ tabs: mixed, groups, tabId: 1 }).hasUngrouped).toBe(true);
  });

  it("lists another group's tabs in strip order, none of them the bar's own", () => {
    const tabs = [
      makeTab({ id: 3, index: 2, groupId: 20 }),
      makeTab({ id: 1, index: 0, groupId: 10 }),
      makeTab({ id: 2, index: 1, groupId: 20 }),
    ];
    const view = buildGroupView({ tabs, groups, groupId: 20 });
    expect(view.group).toEqual({ id: 20, title: 'Group', color: 'red' });
    expect(view.tabs.map((t) => [t.id, t.active])).toEqual([
      [2, false],
      [3, false],
    ]);
  });

  it('names the tab last used in the group, where a click on its swatch lands', () => {
    const tabs = [
      makeTab({ id: 1, index: 0, groupId: 20, lastAccessed: 500 }),
      makeTab({ id: 2, index: 1, groupId: 20, lastAccessed: 900 }),
      makeTab({ id: 3, index: 2, groupId: 20 }),
    ];
    expect(buildGroupView({ tabs, groups, groupId: 20 }).lastId).toBe(2);
  });

  it('lists the ungrouped tabs, pinned ones included, for group -1', () => {
    const tabs = [
      makeTab({ id: 1, index: 0, pinned: true, groupId: 10 }),
      makeTab({ id: 2, index: 1, groupId: 10 }),
      makeTab({ id: 3, index: 2 }),
    ];
    const view = buildGroupView({ tabs, groups, groupId: -1 });
    expect(view.group).toBeNull();
    expect(view.tabs.map((t) => t.id)).toEqual([1, 3]);
    expect(view.lastId).toBe(1);
  });

  it('has nothing for a group with no tabs in the window', () => {
    const tabs = [makeTab({ id: 1, groupId: 10 })];
    expect(buildGroupView({ tabs, groups, groupId: 20 })).toBeNull();
  });
});
