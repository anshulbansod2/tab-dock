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
    groups: [
      { id: 10, windowId: 1, title: 'Work', color: 'blue' },
      { id: 20, windowId: 1, title: 'Read', color: 'red' },
      { id: 30, windowId: 2, title: 'Other window', color: 'green' },
    ],
  });
});

describe('handleAction', () => {
  it('activates a tab in the same window', async () => {
    await handleAction({ type: 'activate', tabId: 2 }, client, api);
    expect(api.tabs.update).toHaveBeenCalledWith(2, { active: true });
  });

  it('collapses the group left behind when switching to another group', async () => {
    api.state.tabs.push(makeTab({ id: 6, index: 4, groupId: 20 }));
    await handleAction({ type: 'activate', tabId: 6 }, client, api);
    expect(api.tabs.update).toHaveBeenCalledWith(6, { active: true });
    expect(api.tabGroups.update).toHaveBeenCalledWith(10, { collapsed: true });
    expect(api.tabs.update.mock.invocationCallOrder[0]).toBeLessThan(
      api.tabGroups.update.mock.invocationCallOrder[0],
    ); // Chrome won't collapse the group of the active tab
  });

  it('collapses the group left behind when switching to an ungrouped tab', async () => {
    await handleAction({ type: 'activate', tabId: 4 }, client, api);
    expect(api.tabGroups.update).toHaveBeenCalledWith(10, { collapsed: true });
  });

  it('collapses nothing within a group, or when leaving the ungrouped tabs', async () => {
    await handleAction({ type: 'activate', tabId: 2 }, client, api);
    await handleAction({ type: 'activate', tabId: 1 }, { tabId: 4, windowId: 1 }, api);
    expect(api.tabGroups.update).not.toHaveBeenCalled();
  });

  it('closes a tab in the same window', async () => {
    await handleAction({ type: 'close', tabId: 2 }, client, api);
    expect(api.tabs.remove).toHaveBeenCalledWith(2);
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

  describe('moving a tab to another group', () => {
    it('adds the tab to a group in the same window', async () => {
      await handleAction({ type: 'regroup', tabId: 2, groupId: 20 }, client, api);
      expect(api.tabs.group).toHaveBeenCalledWith({ groupId: 20, tabIds: 2 });
    });

    it('removes the tab from its group', async () => {
      await handleAction({ type: 'regroup', tabId: 2, groupId: -1 }, client, api);
      expect(api.tabs.ungroup).toHaveBeenCalledWith(2);
    });

    it('starts a new group with the tab, in its window', async () => {
      await handleAction({ type: 'newgroup', tabId: 4 }, client, api);
      expect(api.tabs.group).toHaveBeenCalledWith({
        tabIds: 4,
        createProperties: { windowId: 1 },
      });
    });

    it.each([
      ['a group in another window', { type: 'regroup', tabId: 2, groupId: 30 }],
      ['a tab in another window', { type: 'regroup', tabId: 3, groupId: 20 }],
      ['a tab in another window (new group)', { type: 'newgroup', tabId: 3 }],
    ])('ignores %s', async (_name, msg) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await handleAction(msg, client, api);
      expect(api.tabs.group).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
    });

    it('leaves pinned tabs alone (Chrome cannot group them)', async () => {
      await handleAction({ type: 'regroup', tabId: 5, groupId: 20 }, client, api);
      await handleAction({ type: 'newgroup', tabId: 5 }, client, api);
      expect(api.tabs.group).not.toHaveBeenCalled();
    });
  });

  describe('peeking', () => {
    // the page area's top-left is at (100, 130) on screen: the click minus its client point
    const PEEK = {
      type: 'peek',
      dock: { left: 300, right: 900, top: 752, bottom: 800 },
      view: { width: 1200, height: 800 },
      point: { screenX: 750, screenY: 906, clientX: 650, clientY: 776 },
    };
    let peeks;

    beforeEach(() => {
      peeks = {
        open: vi.fn(async () => undefined),
        back: vi.fn(async () => undefined),
        focus: vi.fn(async () => undefined),
        originOf: vi.fn(async () => null),
      };
    });

    it('opens a tab from the same window in a window resting on the dock', async () => {
      await handleAction({ ...PEEK, tabId: 2 }, client, api, peeks);
      expect(peeks.open).toHaveBeenCalledWith(2, { left: 400, top: 454, width: 600, height: 428 });
    });

    it("sizes it by the sending page's own zoom, as Chrome reports it", async () => {
      api.tabs.getZoom.mockResolvedValue(1.25);
      await handleAction({ ...PEEK, tabId: 2 }, client, api, peeks);
      expect(api.tabs.getZoom).toHaveBeenCalledWith(1);
      expect(peeks.open).toHaveBeenCalledWith(2, expect.objectContaining({ width: 750 }));
    });

    it.each([
      ['another window', 3],
      ["the bar's own tab", 1],
    ])('will not peek a tab from %s', async (_name, tabId) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await handleAction({ ...PEEK, tabId }, client, api, peeks);
      expect(peeks.open).not.toHaveBeenCalled();
    });

    it('returns the sending tab when its mini window asks', async () => {
      await handleAction({ type: 'return' }, { tabId: 2, windowId: 77 }, api, peeks);
      expect(peeks.back).toHaveBeenCalledWith(2);
    });

    it('can close a peeked tab from its home window', async () => {
      api.state.tabs[1].windowId = 77;
      peeks.originOf.mockResolvedValue({ windowId: 1, index: 1, groupId: 10 });
      await handleAction({ type: 'close', tabId: 2 }, client, api);
      expect(api.tabs.remove).toHaveBeenCalledWith(2);
    });
  });
});
