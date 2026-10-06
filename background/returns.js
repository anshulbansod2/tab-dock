// @ts-check

const KEY_PREFIX = 'return:';

/**
 * The way back from a tab opened off a hover card: per window, the tab it was opened from and
 * the tab it opened. It lasts only while the opened tab stays in front, so the dock's Back
 * button never points anywhere stale. Kept in storage.session (memory only, survives worker
 * restarts).
 * @param {{ store: chrome.storage.StorageArea }} deps
 */
export function createReturns({ store }) {
  /** @param {number} windowId @returns {Promise<Trail | null>} */
  const get = async (windowId) =>
    /** @type {Trail | undefined} */ (
      (await store.get(KEY_PREFIX + windowId))[KEY_PREFIX + windowId]
    ) ?? null;
  /** @param {number} windowId */
  const clear = (windowId) => store.remove(KEY_PREFIX + windowId);

  return {
    get,
    /** @param {number} windowId @param {Trail} trail */
    remember: (windowId, trail) => store.set({ [KEY_PREFIX + windowId]: trail }),

    /**
     * Any other tab coming to the front ends the trail.
     * @param {number} windowId
     * @param {number} tabId - the tab now in front
     * @returns {Promise<boolean>} whether a trail ended
     */
    async activated(windowId, tabId) {
      const trail = await get(windowId);
      if (!trail || trail.to === tabId) return false;
      await clear(windowId);
      return true;
    },

    /**
     * @param {number} tabId - a tab that closed
     * @returns {Promise<number[]>} the windows whose trail it ended
     */
    async closed(tabId) {
      const items = /** @type {Record<string, Trail>} */ (await store.get(null));
      const ended = Object.entries(items)
        .filter(
          ([key, { from, to }]) => key.startsWith(KEY_PREFIX) && (from === tabId || to === tabId),
        )
        .map(([key]) => Number(key.slice(KEY_PREFIX.length)));
      await Promise.all(ended.map(clear));
      return ended;
    },
  };
}
