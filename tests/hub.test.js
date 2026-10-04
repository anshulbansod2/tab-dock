import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHub } from '../background/hub.js';
import { createChrome, createPort, flushPromises, makeTab } from './helpers/chrome.js';

let api;
let hub;

const lastSnapshot = (port) => port.postMessage.mock.calls.at(-1)?.[0].snapshot;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  api = createChrome({
    tabs: [
      makeTab({ id: 1, index: 0, groupId: 10 }),
      makeTab({ id: 2, index: 1, groupId: 10 }),
      makeTab({ id: 3, index: 0, windowId: 2 }),
    ],
    groups: [{ id: 10, title: 'Work', color: 'blue', windowId: 1 }],
  });
  hub = createHub({ api, debounceMs: 50 });
});

afterEach(() => vi.useRealTimers());

async function connect(tabId, windowId) {
  const port = createPort({ tabId, windowId });
  hub.add(port, { tabId, windowId });
  await flushPromises();
  return port;
}

async function settle() {
  await vi.advanceTimersByTimeAsync(50);
  await flushPromises();
}

describe('createHub', () => {
  it('sends an initial snapshot on add', async () => {
    const port = await connect(1, 1);
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    expect(port.postMessage.mock.calls[0][0].type).toBe('snapshot');
    expect(lastSnapshot(port).tabs.map((t) => t.id)).toEqual([1, 2]);
  });

  it('collapses a burst of events into one push per window', async () => {
    const port = await connect(1, 1);
    for (let i = 0; i < 4; i += 1) hub.schedule(1);
    await settle();
    expect(api.tabs.query).toHaveBeenCalledTimes(2); // initial + one debounced push
    expect(port.postMessage).toHaveBeenCalledTimes(2);
  });

  it('only pushes to bars in the scheduled window', async () => {
    const w1 = await connect(1, 1);
    const w2 = await connect(3, 2);
    hub.schedule(1);
    await settle();
    expect(w1.postMessage).toHaveBeenCalledTimes(2);
    expect(w2.postMessage).toHaveBeenCalledTimes(1);
  });

  it('scheduleAll refreshes every window with a bar', async () => {
    const w1 = await connect(1, 1);
    const w2 = await connect(3, 2);
    hub.scheduleAll();
    await settle();
    expect(w1.postMessage).toHaveBeenCalledTimes(2);
    expect(w2.postMessage).toHaveBeenCalledTimes(2);
  });

  it('stops pushing after the port disconnects', async () => {
    const port = await connect(1, 1);
    port.onDisconnect.emit();
    hub.schedule(1);
    await settle();
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    expect(hub.clientFor(port)).toBeUndefined();
  });

  it('retargets a bar whose tab moved to another window', async () => {
    const port = await connect(1, 1);
    api.state.tabs[0] = makeTab({ id: 1, index: 1, windowId: 2 });
    hub.retarget(1, 2);
    hub.schedule(2);
    await settle();
    expect(lastSnapshot(port).tabs.map((t) => t.id)).toEqual([3, 1]);
    expect(hub.clientFor(port)).toEqual({ tabId: 1, windowId: 2 });
  });

  it('ignores WINDOW_ID_NONE', async () => {
    hub.schedule(-1);
    await settle();
    expect(api.tabs.query).not.toHaveBeenCalled();
  });

  it('survives a postMessage on a dead port', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const port = createPort();
    port.postMessage.mockImplementation(() => {
      throw new Error('Attempting to use a disconnected port object');
    });
    hub.add(port, { tabId: 1, windowId: 1 });
    await flushPromises();
    expect(warn).toHaveBeenCalled();
  });

  it('logs, not throws, when querying tabs fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.tabs.query.mockRejectedValueOnce(new Error('boom'));
    await connect(1, 1);
    expect(error).toHaveBeenCalledWith('[hover-helper]', 'push failed', expect.any(Error));
  });
});
