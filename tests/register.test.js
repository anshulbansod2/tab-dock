import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBackground } from '../background/register.js';
import { createChrome, createPort, flushPromises, makeTab } from './helpers/chrome.js';

let api;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  api = createChrome({
    tabs: [makeTab({ id: 1, groupId: 10 }), makeTab({ id: 2, index: 1, groupId: 10 })],
    groups: [{ id: 10, title: 'Work', color: 'blue', windowId: 1 }],
  });
  registerBackground(api);
});

afterEach(() => vi.useRealTimers());

async function connect(opts) {
  const port = createPort(opts);
  api.runtime.onConnect.emit(port);
  await flushPromises();
  return port;
}

async function settle() {
  await vi.advanceTimersByTimeAsync(50);
  await flushPromises();
}

describe('registerBackground', () => {
  it('accepts our bar and sends a snapshot', async () => {
    const port = await connect();
    expect(port.postMessage).toHaveBeenCalledTimes(1);
  });

  it('disconnects ports that fail identification', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const port = await connect({ name: 'intruder' });
    expect(port.disconnect).toHaveBeenCalled();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it('routes valid messages to actions and drops invalid ones', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const port = await connect();
    port.onMessage.emit({ type: 'activate', tabId: 2 });
    port.onMessage.emit({ type: 'activate', tabId: 'x' });
    await flushPromises();
    expect(api.tabs.update).toHaveBeenCalledWith(2, { active: true });
    expect(warn).toHaveBeenCalledWith('[hover-helper]', 'dropped invalid message');
  });

  it('refreshes on relevant tab updates only', async () => {
    const port = await connect();
    api.tabs.onUpdated.emit(1, { status: 'loading' }, makeTab({ id: 1 }));
    await settle();
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    api.tabs.onUpdated.emit(1, { title: 'New' }, makeTab({ id: 1 }));
    await settle();
    expect(port.postMessage).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['onCreated', () => api.tabs.onCreated.emit(makeTab({ id: 5 }))],
    ['onRemoved', () => api.tabs.onRemoved.emit(5, { windowId: 1, isWindowClosing: false })],
    ['onMoved', () => api.tabs.onMoved.emit(1, { windowId: 1, fromIndex: 0, toIndex: 1 })],
    ['onDetached', () => api.tabs.onDetached.emit(5, { oldWindowId: 1, oldPosition: 0 })],
    ['onReplaced', () => api.tabs.onReplaced.emit(6, 5)],
    ['group onUpdated', () => api.tabGroups.onUpdated.emit({ id: 10, windowId: 1 })],
    ['group onRemoved', () => api.tabGroups.onRemoved.emit({ id: 10, windowId: 1 })],
    ['group onMoved', () => api.tabGroups.onMoved.emit({ id: 10, windowId: 1 })],
  ])('refreshes on %s', async (_name, fire) => {
    const port = await connect();
    fire();
    await settle();
    expect(port.postMessage).toHaveBeenCalledTimes(2);
  });

  it('follows a tab dragged into another window', async () => {
    const port = await connect();
    api.state.tabs[0] = makeTab({ id: 1, windowId: 2 });
    api.tabs.onAttached.emit(1, { newWindowId: 2, newPosition: 0 });
    await settle();
    const snapshot = port.postMessage.mock.calls.at(-1)[0].snapshot;
    expect(snapshot).toEqual({
      group: null,
      tabs: [expect.objectContaining({ id: 1, active: true })],
    });
  });
});
