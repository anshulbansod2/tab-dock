import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAction } from '../background/actions.js';
import { createChrome, makeTab } from './helpers/chrome.js';

const client = { tabId: 1, windowId: 1 };
let api;

beforeEach(() => {
  api = createChrome({
    tabs: [
      makeTab({ id: 1, index: 0, groupId: 10 }),
      makeTab({ id: 2, index: 1, groupId: 10 }),
      makeTab({ id: 3, index: 0, windowId: 2 }),
      makeTab({ id: 4, index: 2 }),
      makeTab({ id: 5, index: 3, pinned: true }),
    ],
  });
});

describe('handleAction', () => {
  it('activates a tab in the same window', async () => {
    await handleAction({ type: 'activate', tabId: 2 }, client, api);
    expect(api.tabs.update).toHaveBeenCalledWith(2, { active: true });
  });

  it('closes a tab in the same window', async () => {
    await handleAction({ type: 'close', tabId: 2 }, client, api);
    expect(api.tabs.remove).toHaveBeenCalledWith(2);
  });

  it('ignores a target in another window', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await handleAction({ type: 'close', tabId: 3 }, client, api);
    expect(api.tabs.remove).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('swallows stale-tab errors silently', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(handleAction({ type: 'close', tabId: 404 }, client, api)).resolves.toBeUndefined();
    expect(error).not.toHaveBeenCalled();
  });

  it('logs unexpected errors without throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.tabs.remove.mockRejectedValueOnce(new Error('boom'));
    await expect(handleAction({ type: 'close', tabId: 2 }, client, api)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('[tab-dock]', 'close failed', expect.any(Error));
  });

  it('opens a new tab next to a grouped tab and adds it to the group', async () => {
    await handleAction({ type: 'new' }, client, api);
    expect(api.tabs.create).toHaveBeenCalledWith({ windowId: 1, index: 1, active: true });
    expect(api.tabs.group).toHaveBeenCalledWith({ groupId: 10, tabIds: 999 });
  });

  it('opens a new ungrouped tab next to an ungrouped tab', async () => {
    await handleAction({ type: 'new' }, { tabId: 4, windowId: 1 }, api);
    expect(api.tabs.create).toHaveBeenCalledWith({ windowId: 1, index: 3, active: true });
    expect(api.tabs.group).not.toHaveBeenCalled();
  });

  it('never groups a tab opened from a pinned tab', async () => {
    api.state.tabs[4].groupId = 10;
    await handleAction({ type: 'new' }, { tabId: 5, windowId: 1 }, api);
    expect(api.tabs.group).not.toHaveBeenCalled();
  });

  describe('move', () => {
    beforeEach(() => {
      api.state.tabs.push(makeTab({ id: 6, index: 4, groupId: 10 }));
    });

    it("moves a tab to a position among its group's tabs", async () => {
      // Group 10 holds tabs 1, 2, 6 at window indexes 0, 1, 4: position 2 is index 4.
      await handleAction({ type: 'move', tabId: 1, toIndex: 2 }, client, api);
      expect(api.tabs.move).toHaveBeenCalledWith(1, { index: 4 });
    });

    it('clamps a position past the end to the last tab', async () => {
      await handleAction({ type: 'move', tabId: 6, toIndex: 99 }, client, api);
      expect(api.tabs.move).toHaveBeenCalledWith(6, { index: 4 });
    });

    it('moves ungrouped tabs among the ungrouped ones, pinned included', async () => {
      await handleAction({ type: 'move', tabId: 4, toIndex: 1 }, { tabId: 4, windowId: 1 }, api);
      expect(api.tabs.move).toHaveBeenCalledWith(4, { index: 3 });
    });

    it('puts the tab back in its group if Chrome dropped it out at the edge', async () => {
      api.tabs.move.mockImplementationOnce(async (id) => ({ ...makeTab({ id }), groupId: -1 }));
      await handleAction({ type: 'move', tabId: 1, toIndex: 2 }, client, api);
      expect(api.tabs.group).toHaveBeenCalledWith({ groupId: 10, tabIds: 1 });
    });

    it('takes an ungrouped tab back out of a group Chrome pulled it into', async () => {
      api.tabs.move.mockImplementationOnce(async (id) => ({ ...makeTab({ id }), groupId: 10 }));
      await handleAction({ type: 'move', tabId: 4, toIndex: 0 }, { tabId: 4, windowId: 1 }, api);
      expect(api.tabs.ungroup).toHaveBeenCalledWith(4);
    });

    it("ignores a tab outside the sender's group", async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await handleAction({ type: 'move', tabId: 4, toIndex: 0 }, client, api);
      await handleAction({ type: 'move', tabId: 3, toIndex: 0 }, client, api);
      expect(api.tabs.move).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(2);
    });
  });
});
