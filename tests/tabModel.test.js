import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../background/tabModel.js';
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
