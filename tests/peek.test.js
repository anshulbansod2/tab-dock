import { beforeEach, describe, expect, it } from 'vitest';
import { createPeeks, reopenClosed } from '../background/peek.js';
import { createChrome, makeTab } from './helpers/chrome.js';

const BOUNDS = { left: 300, top: 400, width: 480, height: 320 };
let api;
let peeks;

beforeEach(() => {
  api = createChrome({
    tabs: [
      makeTab({ id: 1, index: 0, groupId: 10, active: true }),
      makeTab({ id: 2, index: 1, groupId: 10 }),
      makeTab({ id: 3, index: 2 }),
    ],
    groups: [{ id: 10, windowId: 1, title: 'Work', color: 'blue' }],
  });
  peeks = createPeeks({ api });
});

describe('peeking a tab live', () => {
  it('moves the real tab into a small focused window where the card was', async () => {
    await peeks.open(2, BOUNDS);
    expect(api.windows.create).toHaveBeenCalledWith({
      tabId: 2,
      type: 'popup',
      ...BOUNDS,
      focused: true,
    });
    expect(await peeks.originOf(2)).toEqual({
      windowId: 1,
      index: 1,
      groupId: 10,
      pinned: false,
      url: 'https://example.com/2',
    });
  });

  /** Chrome's rule: a tab outside group 10 can't be dropped inside it (indexes 0–1 here). */
  const enforceGroupContinuity = () => {
    const joined = new Set();
    api.tabs.group.mockImplementation(async ({ groupId, tabIds }) => (joined.add(tabIds), groupId));
    api.tabs.move.mockImplementation(async (id, { index }) => {
      if (!joined.has(id) && index >= 0 && index <= 1)
        throw new Error('the specified input would disrupt group continuity in the tab strip');
      return { id, index, groupId: joined.has(id) ? 10 : -1 };
    });
  };

  it('puts it back where it was, in its group, and focuses that window', async () => {
    enforceGroupContinuity();
    await peeks.open(2, BOUNDS);
    await peeks.back(2);
    // joining the group first brings it home; only then may it take its old spot inside
    expect(api.tabs.group).toHaveBeenCalledWith({ groupId: 10, tabIds: 2 });
    expect(api.tabs.move).toHaveBeenLastCalledWith(2, { index: 1 });
    expect(api.windows.update).toHaveBeenCalledWith(1, { focused: true });
    expect(await peeks.originOf(2)).toBeNull();
  });

  it('keeps the way back when putting the tab home fails', async () => {
    await peeks.open(2, BOUNDS);
    api.tabs.group.mockRejectedValueOnce(new Error('Tabs cannot be edited right now'));
    await expect(peeks.back(2)).rejects.toThrow();
    expect(await peeks.originOf(2)).not.toBeNull(); // clicking back in, or closing, still works
  });

  it('goes to the end of the window when its old spot now lies inside a group', async () => {
    enforceGroupContinuity();
    api.state.tabs[2].index = 1; // an ungrouped tab whose old index is now inside group 10
    await peeks.open(3, BOUNDS);
    await peeks.back(3);
    expect(api.tabs.move).toHaveBeenLastCalledWith(3, { windowId: 1, index: -1 });
    expect(await peeks.originOf(3)).toBeNull();
  });

  it('puts an ungrouped tab back ungrouped', async () => {
    await peeks.open(3, BOUNDS);
    await peeks.back(3);
    expect(api.tabs.move).toHaveBeenCalledWith(3, { windowId: 1, index: 2 });
    expect(api.tabs.group).not.toHaveBeenCalled();
  });

  it('goes back ungrouped if its group is gone', async () => {
    await peeks.open(2, BOUNDS);
    api.state.groups = [];
    await peeks.back(2);
    expect(api.tabs.move).toHaveBeenCalledWith(2, { windowId: 1, index: 1 });
    expect(api.tabs.group).not.toHaveBeenCalled();
  });

  it('goes back to the last-used window if its own window closed', async () => {
    await peeks.open(2, BOUNDS);
    api.windows.get.mockRejectedValueOnce(new Error('No window with id: 1.'));
    api.windows.getLastFocused.mockResolvedValueOnce({ id: 5, type: 'normal' });
    await peeks.back(2);
    expect(api.tabs.move).toHaveBeenCalledWith(2, { windowId: 5, index: -1 });
    expect(api.tabs.group).not.toHaveBeenCalled();
  });

  it('does nothing for a tab that is not peeked', async () => {
    await peeks.back(3);
    expect(api.tabs.move).not.toHaveBeenCalled();
  });

  it('lists peeked tabs and forgets closed ones', async () => {
    await peeks.open(2, BOUNDS);
    expect(await peeks.all()).toEqual(
      new Map([
        [2, { windowId: 1, index: 1, groupId: 10, pinned: false, url: 'https://example.com/2' }],
      ]),
    );
    await peeks.forget(2);
    expect(await peeks.all()).toEqual(new Map());
  });

  it('forgets the peek if its window cannot be made (and leaves the tab alone)', async () => {
    api.windows.create.mockRejectedValueOnce(new Error('Invalid bounds'));
    await expect(peeks.open(2, BOUNDS)).rejects.toThrow('Invalid bounds');
    expect(await peeks.originOf(2)).toBeNull();
  });
});

describe('reopening a peeked tab whose mini window was closed', () => {
  const origin = { windowId: 1, index: 1, groupId: 10, pinned: true, url: 'https://example.com/2' };

  beforeEach(() => {
    // the tabs Chrome hands back: restored (42, 43) or reopened (50, 999)
    for (const id of [42, 43, 50, 999]) api.state.tabs.push(makeTab({ id, windowId: 88 }));
  });

  it('restores the closed mini window and moves its tab home, grouped and pinned', async () => {
    api.sessions.getRecentlyClosed.mockResolvedValue([
      { window: { sessionId: 's1', tabs: [{ url: origin.url }] } },
    ]);
    api.sessions.restore.mockResolvedValue({ window: { tabs: [{ id: 42, url: origin.url }] } });
    await reopenClosed(api, origin);
    expect(api.sessions.restore).toHaveBeenCalledWith('s1');
    expect(api.tabs.group).toHaveBeenCalledWith({ groupId: 10, tabIds: 42 });
    expect(api.tabs.move).toHaveBeenLastCalledWith(42, { index: 1 });
    expect(api.tabs.update).toHaveBeenCalledWith(42, { pinned: true });
  });

  it('restores a closed tab entry too', async () => {
    api.sessions.getRecentlyClosed.mockResolvedValue([
      { tab: { sessionId: 't1', url: origin.url } },
    ]);
    api.sessions.restore.mockResolvedValue({ tab: { id: 43, url: origin.url } });
    await reopenClosed(api, { ...origin, pinned: false });
    expect(api.tabs.move).toHaveBeenLastCalledWith(43, { index: 1 }); // in its group (10) first;
    expect(api.tabs.update).not.toHaveBeenCalled();
  });

  it('never restores something else that was closed more recently', async () => {
    api.sessions.getRecentlyClosed.mockResolvedValue([
      { tab: { sessionId: 'x', url: 'https://other.example/' } },
    ]);
    await reopenClosed(api, origin);
    expect(api.sessions.restore).not.toHaveBeenCalled();
    expect(api.tabs.create).toHaveBeenCalledWith({
      windowId: 1,
      index: 1,
      url: origin.url,
      active: false,
    });
  });

  it('falls back to reopening its address when the session cannot be restored', async () => {
    api.sessions.getRecentlyClosed.mockRejectedValue(new Error('unavailable'));
    api.tabs.create.mockResolvedValue({ id: 50 });
    await reopenClosed(api, origin);
    expect(api.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: origin.url }));
    expect(api.tabs.group).toHaveBeenCalledWith({ groupId: 10, tabIds: 50 });
  });
});
