// @ts-check
import { UNGROUPED_ID } from './constants.js';
import { effectiveGroupId } from './tabModel.js';

const KEY_PREFIX = 'peek:';

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
    const saved = (await store.get(KEY_PREFIX + tabId))[KEY_PREFIX + tabId];
    return /** @type {PeekOrigin | undefined} */ (saved) ?? null;
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
      const origin = { windowId: tab.windowId, index: tab.index, groupId: effectiveGroupId(tab) };
      await store.set({ [KEY_PREFIX + tabId]: origin });
      try {
        await api.windows.create({ tabId, type: 'popup', ...bounds, focused: true });
      } catch (err) {
        await store.remove(KEY_PREFIX + tabId);
        throw err;
      }
    },

    /** @param {number} tabId */
    async back(tabId) {
      const origin = await originOf(tabId);
      if (!origin) return;
      const { windowId, same } = await homeWindow(api, origin);
      await api.tabs.move(tabId, { windowId, index: same ? origin.index : -1 });
      await store.remove(KEY_PREFIX + tabId);
      if (same && origin.groupId !== UNGROUPED_ID && (await groupExists(api, origin.groupId)))
        await api.tabs.group({ groupId: origin.groupId, tabIds: tabId });
      if (windowId !== undefined) await api.windows.update(windowId, { focused: true });
    },

    /** @param {number} tabId - brings a peeked tab's window forward */
    async focus(tabId) {
      const tab = await api.tabs.get(tabId);
      await api.windows.update(tab.windowId, { focused: true });
    },

    /** @returns {Promise<Map<number, PeekOrigin>>} */
    async all() {
      const items = await store.get(null);
      return new Map(
        Object.entries(items)
          .filter(([key]) => key.startsWith(KEY_PREFIX))
          .map(([key, origin]) => [
            Number(key.slice(KEY_PREFIX.length)),
            /** @type {PeekOrigin} */ (origin),
          ]),
      );
    },

    /** @param {number} tabId */
    forget: (tabId) => store.remove(KEY_PREFIX + tabId),
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
