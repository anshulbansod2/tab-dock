// @ts-check
import { UNGROUPED_ID } from './constants.js';
import { effectiveGroupId } from './tabModel.js';

const PEEKS_KEY = 'peeks';

/**
 * Live peeks: a tab moved, as itself (page state, video, login intact), into a small popup
 * window where its hover card was, and later put back exactly where it came from. Where each
 * peeked tab came from is kept in storage.session so a worker restart never strands it.
 *
 * @param {{ api: typeof chrome, store?: chrome.storage.StorageArea }} deps
 */
export function createPeeks({ api, store = api.storage.session }) {
  /**
   * @param {number} tabId
   * @returns {Promise<PeekOrigin | null>}
   */
  async function originOf(tabId) {
    const saved = (await store.get(PEEKS_KEY))[PEEKS_KEY];
    return /** @type {PeekOrigin | undefined} */ (saved?.[tabId]) ?? null;
  }

  return {
    originOf,

    /**
     * @param {number} tabId
     * @param {PeekBounds} bounds - screen pixels
     */
    async open(tabId, bounds) {
      const tab = await api.tabs.get(tabId);
      /** @type {PeekOrigin} */
      const origin = {
        windowId: tab.windowId,
        index: tab.index,
        groupId: effectiveGroupId(tab),
        pinned: tab.pinned,
      };
      const peeks = (await store.get(PEEKS_KEY))[PEEKS_KEY] ?? {};
      peeks[tabId] = origin;
      await store.set({ [PEEKS_KEY]: peeks });
      try {
        await api.windows.create({ tabId, type: 'popup', ...bounds, focused: true });
      } catch (err) {
        const peeks = (await store.get(PEEKS_KEY))[PEEKS_KEY] ?? {};
        delete peeks[tabId];
        if (Object.keys(peeks).length) await store.set({ [PEEKS_KEY]: peeks });
        else await store.remove(PEEKS_KEY);
        throw err;
      }
    },

    /** @param {number} tabId */
    async back(tabId) {
      const origin = await originOf(tabId);
      if (!origin) return;
      const { windowId, same } = await homeWindow(api, origin);
      await api.tabs.move(tabId, { windowId, index: same ? origin.index : -1 });
      const peeks = (await store.get(PEEKS_KEY))[PEEKS_KEY] ?? {};
      delete peeks[tabId];
      if (Object.keys(peeks).length) await store.set({ [PEEKS_KEY]: peeks });
      else await store.remove(PEEKS_KEY);
      if (same && origin.groupId !== UNGROUPED_ID && (await groupExists(api, origin.groupId)))
        await api.tabs.group({ groupId: origin.groupId, tabIds: tabId });
      if (origin.pinned) await api.tabs.update(tabId, { pinned: true });
      if (windowId !== undefined) await api.windows.update(windowId, { focused: true });
    },

    /** @param {number} tabId - brings a peeked tab's window forward */
    async focus(tabId) {
      const tab = await api.tabs.get(tabId);
      await api.windows.update(tab.windowId, { focused: true });
    },

    /** @returns {Promise<Map<number, PeekOrigin>>} */
    async all() {
      return new Map(
        Object.entries((await store.get(PEEKS_KEY))[PEEKS_KEY] ?? {}).map(([t, o]) => [
          Number(t),
          /** @type {PeekOrigin} */ (o),
        ]),
      );
    },

    /** @param {number} tabId */
    async forget(tabId) {
      const p = (await store.get(PEEKS_KEY))[PEEKS_KEY] ?? {};
      delete p[tabId];
      if (Object.keys(p).length) await store.set({ [PEEKS_KEY]: p });
      else await store.remove(PEEKS_KEY);
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
