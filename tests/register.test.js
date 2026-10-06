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
  registerBackground(api, { shrink: async (url) => `${url}#small` });
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

describe('previews and peeks', () => {
  const BOUNDS = { left: 10, top: 20, width: 480, height: 320 };
  const reply = async (message, sender) => {
    const { sendResponse } = deliver(message, sender);
    await flushPromises();
    await flushPromises();
    return sendResponse.mock.calls[0]?.[0];
  };

  it('answers a preview request with the screenshot taken while the tab was shown', async () => {
    api.tabs.onActivated.emit({ tabId: 1, windowId: 1 });
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    expect(await reply({ type: 'preview', tabId: 1 }, createSender({ tabId: 2 }))).toMatchObject({
      image: 'data:image/jpeg;base64,shot#small',
    });
  });

  it('captures again when the visible tab finishes loading', async () => {
    api.tabs.onUpdated.emit(1, { status: 'complete' }, api.state.tabs[0]);
    await vi.advanceTimersByTimeAsync(600);
    expect(api.tabs.captureVisibleTab).toHaveBeenCalledWith(1, expect.anything());
  });

  it('refreshes the screenshot while the bar reports the tab is still being looked at', async () => {
    deliver({ type: 'seen' });
    await vi.advanceTimersByTimeAsync(600);
    expect(api.tabs.captureVisibleTab).toHaveBeenCalledWith(1, expect.anything());
  });

  it('will not hand out previews of tabs in other windows', async () => {
    api.state.tabs.push(makeTab({ id: 9, windowId: 3 }));
    expect(await reply({ type: 'preview', tabId: 9 }, createSender({ tabId: 2 }))).toBeNull();
  });

  it("peeks a tab, shows it away in its home window's bar, and returns it", async () => {
    deliver({ type: 'peek', tabId: 2, bounds: BOUNDS }, createSender({ tabId: 1 }));
    await flushPromises();
    await flushPromises();
    expect(api.windows.create).toHaveBeenCalledWith(expect.objectContaining({ tabId: 2 }));
    api.state.tabs[1].windowId = 77; // Chrome moved it into the mini window
    const home = await reply({ type: 'hello' }, createSender({ tabId: 1 }));
    expect(home.tabs.map((t) => [t.id, Boolean(t.away)])).toEqual([
      [1, false],
      [2, true],
    ]);
    const mini = await reply({ type: 'hello' }, createSender({ tabId: 2, windowId: 77 }));
    expect(mini.peek).toEqual({ home: { id: 10, title: 'Work', color: 'blue' } });
    deliver({ type: 'return' }, createSender({ tabId: 2, windowId: 77 }));
    await flushPromises();
    await flushPromises();
    expect(api.tabs.move).toHaveBeenCalledWith(2, { windowId: 1, index: 1 });
  });

  const peekTwo = async () => {
    deliver({ type: 'peek', tabId: 2, bounds: BOUNDS }, createSender({ tabId: 1 }));
    await flushPromises();
    await flushPromises();
    api.state.tabs[1].windowId = 77; // Chrome moved it into the mini window
  };

  it('puts a peeked tab back as soon as its home window is used again', async () => {
    await peekTwo();
    api.windows.onFocusChanged.emit(1);
    await flushPromises();
    await flushPromises();
    expect(api.tabs.move).toHaveBeenCalledWith(2, { windowId: 1, index: 1 });
  });

  it('leaves it out while focus is in the mini window or another app', async () => {
    await peekTwo();
    api.windows.onFocusChanged.emit(77);
    api.windows.onFocusChanged.emit(-1);
    await flushPromises();
    await flushPromises();
    expect(api.tabs.move).not.toHaveBeenCalled();
  });

  it('closing a mini window forgets its peek and refreshes the home window', async () => {
    deliver({ type: 'peek', tabId: 2, bounds: BOUNDS }, createSender({ tabId: 1 }));
    await flushPromises();
    await flushPromises();
    api.state.tabs.splice(1, 1);
    api.tabs.onRemoved.emit(2, { windowId: 77, isWindowClosing: true });
    await flushPromises();
    await settle();
    expect(api.storage.session.data).toEqual({});
    expect(api.tabs.sendMessage).toHaveBeenCalledWith(1, expect.anything(), { frameId: 0 });
  });
});

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

  it('onRemoved forgets the tab so it does not block future pushes', async () => {
    // Send to both tabs.
    api.tabs.onCreated.emit(makeTab({ id: 5 }));
    await settle();
    api.tabs.sendMessage.mockClear();
    // Remove tab 1 (tab 1 is forgotten).
    api.tabs.onRemoved.emit(1, { windowId: 1, isWindowClosing: false });
    await settle();
    api.tabs.sendMessage.mockClear();
    // Push again without changes - tab 2 is skipped (nothing changed).
    api.tabs.onUpdated.emit(2, { title: 'Same' }, api.state.tabs[1]);
    await settle();
    // No sends because the only remaining tab (tab 2) has an unchanged snapshot.
    expect(api.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('onReplaced forgets the old tab id so it does not block the new id', async () => {
    // Send to both tabs first.
    api.tabs.onCreated.emit(makeTab({ id: 5 }));
    await settle();
    api.tabs.sendMessage.mockClear();
    // Prerender replaces tab 1 with tab 10 (tab 1 is forgotten, tab 10 is new).
    // For the test, update the state to reflect the replacement: remove tab 1, add tab 10.
    api.state.tabs[0] = makeTab({ id: 10, active: true, groupId: 10, status: 'complete' });
    api.tabs.onReplaced.emit(10, 1);
    await flushPromises();
    await settle();
    // scheduleAll queries active tabs, gets [10], and pushes to [10, 2] (5 unchanged, skipped).
    const sentTo = api.tabs.sendMessage.mock.calls.map(([tabId]) => tabId);
    expect(sentTo.sort((a, b) => a - b)).toEqual([2, 10]);
  });

  it('hello resets dedup so the next push is never skipped', async () => {
    // Push to both tabs.
    api.tabs.onCreated.emit(makeTab({ id: 5 }));
    await settle();
    api.tabs.sendMessage.mockClear();
    // Send hello from tab 1.
    deliver({ type: 'hello' }, createSender({ tabId: 1, windowId: 1 }));
    await flushPromises();
    // Push again without changes.
    api.tabs.onUpdated.emit(2, { title: 'Same' }, api.state.tabs[1]);
    await settle();
    // Tab 1 gets pushed again (hello reset dedup), tab 2 is skipped.
    const sentTo = api.tabs.sendMessage.mock.calls.map(([tabId]) => tabId);
    expect(sentTo).toEqual([1]);
  });
});
