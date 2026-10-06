// @ts-check
import { UNGROUPED_ID } from './constants.js';
import { effectiveGroupId } from './tabModel.js';

const PEEKS_KEY = 'peeks';

/**
 * @param {chrome.storage.StorageArea} store
 * @returns {Promise<Record<string, PeekOrigin>>}
 */
async function getPeeks(store) {
  return (await store.get(PEEKS_KEY))[PEEKS_KEY] ?? {};
}

/**
 * @param {chrome.storage.StorageArea} store
 * @param {Record<string, PeekOrigin>} peeks
 */
async function savePeeks(store, peeks) {
  if (Object.keys(peeks).length) await store.set({ [PEEKS_KEY]: peeks });
  else await store.remove(PEEKS_KEY);
}

/**
 * @param {typeof chrome} api
 * @param {chrome.storage.StorageArea} store
 * @param {number} tabId
 * @param {PeekOrigin} origin
 */
async function doBack(api, store, tabId, origin) {
  const { windowId, same } = await homeWindow(api, origin);
  await api.tabs.move(tabId, { windowId, index: same ? origin.index : -1 });
  const p = await getPeeks(store);
  delete p[tabId];
  await savePeeks(store, p);
  if (same && origin.groupId !== UNGROUPED_ID && (await groupExists(api, origin.groupId)))
    await api.tabs.group({ groupId: origin.groupId, tabIds: tabId });
  if (origin.pinned) await api.tabs.update(tabId, { pinned: true });
  if (windowId !== undefined) await api.windows.update(windowId, { focused: true });
}

/**
 * Live peeks: a tab moved, as itself (page state, video, login intact), into a small popup
 * window where its hover card was, and later put back exactly where it came from. Where each
 * peeked tab came from is kept in storage.session so a worker restart never strands it.
 *
 * @param {{ api: typeof chrome, store?: chrome.storage.StorageArea }} deps
 */
export function createPeeks({ api, store = api.storage.session }) {
  const inFlight = new Set();
  return {
    /**
     * @param {number} tabId
     * @returns {Promise<PeekOrigin | null>}
     */
    async originOf(tabId) {
      return (await getPeeks(store))[tabId] ?? null;
    },
    /**
     * @param {number} tabId
     * @param {PeekBounds} bounds - screen pixels
     */
    async open(tabId, bounds) {
      const tab = await api.tabs.get(tabId);
      const peeks = await getPeeks(store);
      peeks[tabId] = {
        windowId: tab.windowId,
        index: tab.index,
        groupId: effectiveGroupId(tab),
        pinned: tab.pinned,
        url: tab.url,
      };
      await savePeeks(store, peeks);
      try {
        await api.windows.create({ tabId, type: 'popup', ...bounds, focused: true });
      } catch (err) {
        const p = await getPeeks(store);
        delete p[tabId];
        await savePeeks(store, p);
        throw err;
      }
    },
    /** @param {number} tabId */
    async back(tabId) {
      if (inFlight.has(tabId)) return;
      inFlight.add(tabId);
      try {
        const origin = await this.originOf(tabId);
        if (origin) await doBack(api, store, tabId, origin);
      } finally {
        inFlight.delete(tabId);
      }
    },
    /** @param {number} tabId - brings a peeked tab's window forward */
    async focus(tabId) {
      const tab = await api.tabs.get(tabId);
      await api.windows.update(tab.windowId, { focused: true });
    },
    /** @returns {Promise<Map<number, PeekOrigin>>} */
    async all() {
      const p = await getPeeks(store);
      return new Map(Object.entries(p).map(([id, o]) => [Number(id), o]));
    },
    /** @param {number} tabId */
    async forget(tabId) {
      const p = await getPeeks(store);
      delete p[tabId];
      await savePeeks(store, p);
    },
  };
}

/**
 * @param {typeof chrome} api
 * @param {number} groupId
 */
async function groupExists(api, groupId) {
  try {
    await api.tabGroups.get(groupId);
    return true;
  } catch {
    return false;
  }
}

/**
 * The window to return to: the original if it still exists, else the last-used one.
 * @param {typeof chrome} api
 * @param {PeekOrigin} origin
 */
async function homeWindow(api, origin) {
  try {
    return { windowId: (await api.windows.get(origin.windowId)).id, same: true };
  } catch {
    const last = await api.windows.getLastFocused({ windowTypes: ['normal'] });
    return { windowId: last.id, same: false };
  }
}
