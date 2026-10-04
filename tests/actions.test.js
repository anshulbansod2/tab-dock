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
    expect(error).toHaveBeenCalledWith('[hover-helper]', 'close failed', expect.any(Error));
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
});
