import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBackground } from '../background/register.js';
import { createChrome, createSender, flushPromises, makeTab } from './helpers/chrome.js';

let api;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  api = createChrome({
    tabs: [
      makeTab({ id: 1, groupId: 10, active: true, status: 'complete' }),
      makeTab({ id: 2, index: 1, groupId: 10 }),
    ],
    groups: [{ id: 10, title: 'Work', color: 'blue', windowId: 1 }],
  });
  api.tabs.query.mockImplementation(async ({ windowId, active }) =>
    api.state.tabs.filter(
      (t) => (windowId === undefined || t.windowId === windowId) && (!active || t.active),
    ),
  );
  registerBackground(api);
});

afterEach(() => vi.useRealTimers());

/** Sends a message the way chrome.runtime.onMessage delivers it; returns the listener result. */
function deliver(message, sender = createSender()) {
  const sendResponse = vi.fn();
  let keepOpen;
  api.runtime.onMessage.addListener.mock.calls.forEach(([fn]) => {
    keepOpen = fn(message, sender, sendResponse);
  });
  return { keepOpen, sendResponse };
}

async function settle() {
  await vi.advanceTimersByTimeAsync(50);
  await flushPromises();
}

describe('registerBackground', () => {
  it('answers hello with the sender’s snapshot', async () => {
    const { keepOpen, sendResponse } = deliver({ type: 'hello' }, createSender({ tabId: 2 }));
    expect(keepOpen).toBe(true);
    await flushPromises();
    expect(sendResponse.mock.calls[0][0].tabs.map((t) => t.id)).toEqual([1, 2]);
  });

  it('answers hello with null if the snapshot cannot be built', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.tabs.query.mockRejectedValueOnce(new Error('boom'));
    const { sendResponse } = deliver({ type: 'hello' });
    await flushPromises();
    expect(sendResponse).toHaveBeenCalledWith(null);
  });

  it('drops messages from foreign senders and malformed messages', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(deliver({ type: 'hello' }, createSender({ extensionId: 'evil' })).keepOpen).toBe(false);
    expect(deliver({ type: 'activate', tabId: 'x' }).keepOpen).toBe(false);
    expect(warn).toHaveBeenCalledWith('[tab-dock]', 'dropped invalid message');
  });

  it('routes actions', async () => {
    expect(deliver({ type: 'activate', tabId: 2 }).keepOpen).toBe(false);
    await flushPromises();
    expect(api.tabs.update).toHaveBeenCalledWith(2, { active: true });
  });

  it('refreshes on relevant tab updates only', async () => {
    api.tabs.onUpdated.emit(1, { status: 'loading' }, makeTab({ id: 1 }));
    await settle();
    expect(api.tabs.sendMessage).not.toHaveBeenCalled();
    api.tabs.onUpdated.emit(1, { title: 'New' }, makeTab({ id: 1 }));
    await settle();
    expect(api.tabs.sendMessage).toHaveBeenCalledTimes(2); // both bars in the window
  });

  it('moves settings saved under the old name when the extension updates', async () => {
    api.storage.local.data['hoverHelper.position'] = { x: 1, y: 0 };
    api.runtime.onInstalled.emit({ reason: 'update' });
    await flushPromises();
    expect(api.storage.local.data).toEqual({ 'tabDock.position': { x: 1, y: 0 } });
  });

  it.each([
    ['onCreated', () => api.tabs.onCreated.emit(makeTab({ id: 5 }))],
    ['onRemoved', () => api.tabs.onRemoved.emit(5, { windowId: 1, isWindowClosing: false })],
    ['onMoved', () => api.tabs.onMoved.emit(1, { windowId: 1, fromIndex: 0, toIndex: 1 })],
    ['onActivated', () => api.tabs.onActivated.emit({ tabId: 1, windowId: 1 })],
    ['onDetached', () => api.tabs.onDetached.emit(5, { oldWindowId: 1, oldPosition: 0 })],
    ['onAttached', () => api.tabs.onAttached.emit(1, { newWindowId: 1, newPosition: 0 })],
    ['onReplaced', () => api.tabs.onReplaced.emit(6, 5)],
    ['onInstalled', () => api.runtime.onInstalled.emit({ reason: 'update' })],
    ['group onUpdated', () => api.tabGroups.onUpdated.emit({ id: 10, windowId: 1 })],
    ['group onRemoved', () => api.tabGroups.onRemoved.emit({ id: 10, windowId: 1 })],
    ['group onMoved', () => api.tabGroups.onMoved.emit({ id: 10, windowId: 1 })],
  ])("refreshes the window's bars on %s", async (_name, fire) => {
    fire();
    await flushPromises();
    await settle();
    expect(api.tabs.sendMessage).toHaveBeenCalledTimes(2);
  });
});
