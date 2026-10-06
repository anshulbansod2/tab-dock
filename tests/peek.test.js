import { beforeEach, describe, expect, it } from 'vitest';
import { createPeeks } from '../background/peek.js';
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

  it('puts it back where it was, in its group, and focuses that window', async () => {
    await peeks.open(2, BOUNDS);
    await peeks.back(2);
    expect(api.tabs.move).toHaveBeenCalledWith(2, { windowId: 1, index: 1 });
    expect(api.tabs.group).toHaveBeenCalledWith({ groupId: 10, tabIds: 2 });
    expect(api.windows.update).toHaveBeenCalledWith(1, { focused: true });
    expect(await peeks.originOf(2)).toBeNull();
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
