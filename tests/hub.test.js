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

  it('pushes only to the visible (active) tab, once per burst', async () => {
    for (let i = 0; i < 4; i += 1) hub.schedule(1);
    await settle();
    expect(api.tabs.query).toHaveBeenCalledTimes(1);
    expect(api.tabs.sendMessage).toHaveBeenCalledOnce();
    const [tabId, message, options] = api.tabs.sendMessage.mock.calls[0];
    expect([tabId, message.type, options]).toEqual([1, 'snapshot', { frameId: 0 }]);
    expect(message.snapshot.tabs.map((t) => t.id)).toEqual([1, 2]);
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
    expect(pushedTo().sort()).toEqual([1, 3]);
  });

  it('inlines favicons in both replies and pushes', async () => {
    expect((await hub.snapshotFor({ tabId: 1, windowId: 1 })).inlined).toBe(true);
    hub.schedule(1);
    await settle();
    expect(api.tabs.sendMessage.mock.calls[0][1].snapshot.inlined).toBe(true);
    expect(favicons.inline.mock.calls[0][1].map((t) => t.id)).toEqual([1, 2]);
  });

  it('logs, not throws, when scheduleAll cannot list tabs', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.tabs.query.mockRejectedValueOnce(new Error('boom'));
    hub.scheduleAll();
    await flushPromises();
    expect(error).toHaveBeenCalledWith('[hover-helper]', 'refresh failed', expect.any(Error));
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
    expect(error).toHaveBeenCalledWith('[hover-helper]', 'push failed', expect.any(Error));
  });
});
