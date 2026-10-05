import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHub } from '../background/hub.js';
import { createChrome, flushPromises, makeTab } from './helpers/chrome.js';

let api;
let hub;
let favicons;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  api = createChrome({
    tabs: [
      makeTab({ id: 1, index: 0, groupId: 10, active: true, status: 'complete' }),
      makeTab({ id: 2, index: 1, groupId: 10 }),
      makeTab({ id: 3, index: 0, windowId: 2, active: true, status: 'complete' }),
    ],
    groups: [{ id: 10, title: 'Work', color: 'blue', windowId: 1 }],
  });
  api.tabs.query.mockImplementation(async ({ windowId, active }) =>
    api.state.tabs.filter(
      (t) => (windowId === undefined || t.windowId === windowId) && (!active || t.active),
    ),
  );
  favicons = { inline: vi.fn(async (snapshot) => ({ ...snapshot, inlined: true })) };
  hub = createHub({ api, favicons, debounceMs: 50 });
});

afterEach(() => vi.useRealTimers());

async function settle() {
  await vi.advanceTimersByTimeAsync(50);
  await flushPromises();
}

const pushedTo = () => api.tabs.sendMessage.mock.calls.map(([tabId]) => tabId);

describe('createHub', () => {
  it('builds a snapshot for a bar that asks', async () => {
    const snapshot = await hub.snapshotFor({ tabId: 2, windowId: 1 });
    expect(snapshot.group.title).toBe('Work');
    expect(snapshot.tabs.map((t) => [t.id, t.active])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it('keeps every bar in the window current, once per burst', async () => {
    for (let i = 0; i < 4; i += 1) hub.schedule(1);
    await settle();
    expect(api.tabs.query).toHaveBeenCalledTimes(1);
    expect(pushedTo()).toEqual([1, 2]); // hidden tab 2 is ready before the user switches to it
    for (const [tabId, message, options] of api.tabs.sendMessage.mock.calls) {
      expect([message.type, options]).toEqual(['snapshot', { frameId: 0 }]);
      expect(message.snapshot.tabs.map((t) => [t.id, t.active])).toEqual([
        [1, tabId === 1],
        [2, tabId === 2],
      ]);
    }
  });

  it('inlines favicons once per group, however many tabs it has', async () => {
    hub.schedule(1);
    await settle();
    expect(favicons.inline).toHaveBeenCalledOnce();
  });

  it.each([
    ['discarded', { discarded: true }],
    ['a chrome:// page', { url: 'chrome://settings/' }],
  ])('skips a hidden tab that is %s', async (_name, extra) => {
    Object.assign(api.state.tabs[1], extra);
    hub.schedule(1);
    await settle();
    expect(pushedTo()).toEqual([1]);
  });

  it('injects a missing bar only into the visible tab', async () => {
    api.tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist.'));
    api.state.tabs[1].status = 'complete';
    hub.schedule(1);
    await settle();
    expect(api.scripting.executeScript).toHaveBeenCalledOnce();
    expect(api.scripting.executeScript.mock.calls[0][0].target.tabId).toBe(1);
  });

  it('only pushes to the scheduled window', async () => {
    hub.schedule(2);
    await settle();
    expect(pushedTo()).toEqual([3]);
  });

  it('scheduleAll refreshes every window', async () => {
    hub.scheduleAll();
    await flushPromises();
    await settle();
    expect(pushedTo().sort()).toEqual([1, 2, 3]);
  });

  it('inlines favicons in both replies and pushes', async () => {
    expect((await hub.snapshotFor({ tabId: 1, windowId: 1 })).inlined).toBe(true);
    hub.schedule(1);
    await settle();
    expect(api.tabs.sendMessage.mock.calls[0][1].snapshot.inlined).toBe(true);
    expect(api.tabs.sendMessage.mock.calls[1][1].snapshot.inlined).toBe(true);
    expect(favicons.inline.mock.calls[0][1].map((t) => t.id)).toEqual([1, 2]);
  });

  it('logs, not throws, when scheduleAll cannot list tabs', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.tabs.query.mockRejectedValueOnce(new Error('boom'));
    hub.scheduleAll();
    await flushPromises();
    expect(error).toHaveBeenCalledWith('[tab-dock]', 'refresh failed', expect.any(Error));
  });

  it('ignores WINDOW_ID_NONE', async () => {
    hub.schedule(-1);
    await settle();
    expect(api.tabs.query).not.toHaveBeenCalled();
  });

  it('injects the bar into a loaded web page that has none', async () => {
    api.tabs.sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist.'));
    hub.schedule(1);
    await settle();
    expect(api.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 1, frameIds: [0] },
      files: ['content/core.js', 'content/main.js'],
    });
  });

  it('injects into local file pages too (works once the user allows file access)', async () => {
    api.state.tabs[0].url = 'file:///Users/me/notes.html';
    api.tabs.sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist.'));
    hub.schedule(1);
    await settle();
    expect(api.scripting.executeScript).toHaveBeenCalledOnce();
  });

  it.each([
    ['still loading', { status: 'loading' }],
    ['a chrome:// page', { url: 'chrome://settings/' }],
  ])('does not inject into %s', async (_name, extra) => {
    Object.assign(api.state.tabs[0], extra);
    api.tabs.sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist.'));
    hub.schedule(1);
    await settle();
    expect(api.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('swallows injection failures (e.g. Web Store pages)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.tabs.sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist.'));
    api.scripting.executeScript.mockRejectedValueOnce(new Error('Cannot access contents'));
    hub.schedule(1);
    await settle();
    expect(error).not.toHaveBeenCalled();
  });

  it('logs, not throws, when querying tabs fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.tabs.query.mockRejectedValueOnce(new Error('boom'));
    hub.schedule(1);
    await settle();
    expect(error).toHaveBeenCalledWith('[tab-dock]', 'push failed', expect.any(Error));
  });

  it('skips an unchanged second push to a tab', async () => {
    hub.schedule(1);
    await settle();
    api.tabs.sendMessage.mockClear();
    // Push again without any changes.
    hub.schedule(1);
    await settle();
    // No sends because nothing changed.
    expect(api.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('pushes again if a title changes', async () => {
    hub.schedule(1);
    await settle();
    api.tabs.sendMessage.mockClear();
    // Change a tab's title.
    api.state.tabs[0].title = 'New Title';
    hub.schedule(1);
    await settle();
    // Both tabs in the group get the updated snapshot.
    expect(pushedTo()).toEqual([1, 2]);
  });

  it('retries a failed send on the next push', async () => {
    api.tabs.sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist.'));
    hub.schedule(1);
    await settle();
    // Tab 1 fails, tab 2 succeeds. Tab 1 failure is not recorded in lastSent.
    expect(pushedTo()).toEqual([1, 2]);
    api.tabs.sendMessage.mockClear();
    api.tabs.sendMessage.mockResolvedValue(undefined);
    hub.schedule(1);
    await settle();
    // Tab 1 is retried (failed send not recorded), tab 2 is skipped (unchanged).
    expect(pushedTo()).toEqual([1]);
    // If something changes, both tabs are pushed (tab 1 successful this time, tab 2 updated).
    api.tabs.sendMessage.mockClear();
    api.state.tabs[0].title = 'Changed';
    hub.schedule(1);
    await settle();
    expect(pushedTo()).toEqual([1, 2]);
  });

  it('hello resets the dedup map so the next push is sent', async () => {
    hub.schedule(1);
    await settle();
    // Get a hello from tab 1.
    await hub.snapshotFor({ tabId: 1, windowId: 1 });
    api.tabs.sendMessage.mockClear();
    // Push again without any changes.
    hub.schedule(1);
    await settle();
    // Tab 1 gets pushed again (hello reset the dedup key), tab 2 is skipped.
    expect(pushedTo()).toEqual([1]);
  });

  it('forget removes a tab from the dedup map', async () => {
    hub.schedule(1);
    await settle();
    api.tabs.sendMessage.mockClear();
    // Forget tab 1 (as if it was removed).
    hub.forget(1);
    hub.schedule(1);
    await settle();
    // Tab 1 gets pushed again even though nothing changed (it was forgotten).
    // Tab 2 is still skipped.
    expect(pushedTo()).toEqual([1]);
  });

  it('pushes only to tabs in a group that changed', async () => {
    // Create a second group in the same window.
    api.state.tabs.push(makeTab({ id: 4, index: 2, groupId: 11, windowId: 1 }));
    api.state.groups.push({ id: 11, title: 'Fun', color: 'green', windowId: 1 });
    hub.schedule(1);
    await settle();
    const callsPerGroup = api.tabs.sendMessage.mock.calls.map(([tabId]) => tabId);
    expect(callsPerGroup.sort()).toEqual([1, 2, 4]);
    api.tabs.sendMessage.mockClear();
    // Change a title in group 10.
    api.state.tabs[0].title = 'New Title';
    hub.schedule(1);
    await settle();
    // Only group 10's tabs are pushed; group 11's tab is skipped.
    expect(pushedTo()).toEqual([1, 2]);
  });
});
