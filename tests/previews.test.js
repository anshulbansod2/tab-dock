import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPreviews } from '../background/previews.js';
import { createChrome, createStorage, flushPromises, makeTab } from './helpers/chrome.js';

const SHOT = 'data:image/jpeg;base64,full';
let api;
let store;
let previews;
let clock;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  api = createChrome({
    tabs: [
      makeTab({ id: 1, index: 0, active: true, status: 'complete', url: 'https://a.test/x' }),
      makeTab({ id: 2, index: 1, url: 'https://b.test/' }),
      makeTab({ id: 3, index: 0, windowId: 2, active: true, url: 'chrome://settings/' }),
    ],
  });
  api.tabs.query.mockImplementation(async ({ windowId, active }) =>
    api.state.tabs.filter((t) => t.windowId === windowId && (!active || t.active)),
  );
  api.tabs.captureVisibleTab = vi.fn(async () => SHOT);
  store = createStorage();
  clock = 1_000;
  previews = createPreviews({
    api,
    store,
    shrink: async (url) => `${url}#small`,
    now: () => clock,
    settleMs: 400,
    max: 3,
  });
});

afterEach(() => vi.useRealTimers());

async function settle() {
  await vi.advanceTimersByTimeAsync(400);
  await flushPromises();
  await flushPromises();
}

describe('tab previews', () => {
  it("captures the window's visible tab once it settles, shrunk", async () => {
    previews.schedule(1);
    await settle();
    expect(api.tabs.captureVisibleTab).toHaveBeenCalledWith(1, { format: 'jpeg', quality: 70 });
    expect(await previews.get(1)).toEqual({ image: `${SHOT}#small`, at: 1_000 });
  });

  it('captures once for a burst of events (Chrome allows two captures a second)', async () => {
    previews.schedule(1);
    previews.schedule(1);
    previews.schedule(1);
    await settle();
    expect(api.tabs.captureVisibleTab).toHaveBeenCalledOnce();
  });

  it('never captures incognito or browser pages', async () => {
    api.state.tabs[0].incognito = true;
    previews.schedule(1);
    previews.schedule(2);
    await settle();
    expect(api.tabs.captureVisibleTab).not.toHaveBeenCalled();
  });

  it('has nothing for a tab that was never shown', async () => {
    expect(await previews.get(2)).toBeNull();
  });

  it('drops a preview once the tab has moved to another site', async () => {
    previews.schedule(1);
    await settle();
    api.state.tabs[0].url = 'https://elsewhere.test/';
    expect(await previews.get(1)).toBeNull();
    api.state.tabs[0].url = 'https://a.test/other-page'; // same site: still a fair picture
    expect(await previews.get(1)).toBeNull(); // the elsewhere visit already dropped it
  });

  it('keeps only the most recent previews', async () => {
    for (const id of [1, 2, 4, 5]) {
      api.state.tabs.push(makeTab({ id: id + 10, index: 5, url: 'https://c.test/' }));
      api.state.tabs.forEach((t) => (t.active = t.windowId === 1 && t.id === id + 10));
      previews.schedule(1);
      await settle();
    }
    const kept = await Promise.all([11, 12, 14, 15].map((id) => previews.get(id)));
    expect(kept.map(Boolean)).toEqual([false, true, true, true]);
  });

  it('forgets a closed tab', async () => {
    previews.schedule(1);
    await settle();
    await previews.forget(1);
    expect(await previews.get(1)).toBeNull();
    expect(Object.keys(store.data).some((k) => k.includes(':1'))).toBe(false);
  });

  it('shrugs off a failed capture (e.g. the tab closed meanwhile)', async () => {
    api.tabs.captureVisibleTab.mockRejectedValueOnce(new Error('No active tab'));
    previews.schedule(1);
    await settle();
    expect(await previews.get(1)).toBeNull();
  });
});
