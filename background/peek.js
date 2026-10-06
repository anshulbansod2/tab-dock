// @ts-check
import { UNGROUPED_ID } from './constants.js';
import { effectiveGroupId } from './tabModel.js';

const PEEKS_KEY = 'peeks';

/**
 * @param {chrome.storage.StorageArea} store
 * @returns {Promise<Record<string, PeekOrigin>>}
 */
async function getPeeks(store) {
  return /** @type {Record<string, PeekOrigin>} */ ((await store.get(PEEKS_KEY))[PEEKS_KEY] ?? {});
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
  // Forgotten only once home: if putting it back fails, clicking back in or closing its window
  // must still find the way. (The in-flight guard keeps the focus change this causes out.)
  await placeHome(api, tabId, origin);
  const p = await getPeeks(store);
  delete p[tabId];
  await savePeeks(store, p);
}

/**
 * Puts a tab where a peek took it from: its window and index, group and pin (or, if that
 * window is gone, the end of the last-used one), and brings that window forward.
 * @param {typeof chrome} api
 * @param {number} tabId
 * @param {PeekOrigin} origin
 */
async function placeHome(api, tabId, origin) {
  const { windowId, same } = await homeWindow(api, origin);
  const grouped =
    same && origin.groupId !== UNGROUPED_ID && (await groupExists(api, origin.groupId));
  if (grouped) {
    // Chrome won't drop a tab inside a group it isn't in, so it joins first (which also brings
    // it into the group's window), then takes its old spot; a spot outside the group (it moved
    // meanwhile) would take it out again, so it rejoins at the group's end.
    await api.tabs.group({ groupId: origin.groupId, tabIds: tabId });
    const moved = await api.tabs.move(tabId, { index: origin.index });
    if (!Array.isArray(moved) && moved.groupId !== origin.groupId)
      await api.tabs.group({ groupId: origin.groupId, tabIds: tabId });
  } else await moveInto(api, tabId, windowId, same ? origin.index : -1);
  if (origin.pinned) await api.tabs.update(tabId, { pinned: true });
  if (windowId !== undefined) await api.windows.update(windowId, { focused: true });
}

/**
 * Moves a tab to `index` in a window, or to the end when that spot now lies inside a group.
 * @param {typeof chrome} api
 * @param {number} tabId
 * @param {number | undefined} windowId
 * @param {number} index
 */
async function moveInto(api, tabId, windowId, index) {
  try {
    await api.tabs.move(tabId, { windowId, index });
  } catch (err) {
    if (index === -1) throw err;
    await api.tabs.move(tabId, { windowId, index: -1 });
  }
}

/**
 * A peek's window was closed (its close button, Cmd/Ctrl+W), which closes the tab with it.
 * Brings the tab back to its old place: restored from the session when the closed item is that
 * tab (history and page state come back), else reopened at its address.
 * @param {typeof chrome} api
 * @param {PeekOrigin} origin
 */
export async function reopenClosed(api, origin) {
  let tabId = await restoreFromSession(api, origin.url).catch(() => null);
  if (tabId === null) {
    const { windowId, same } = await homeWindow(api, origin);
    const index = same ? origin.index : -1;
    tabId = (await api.tabs.create({ windowId, index, url: origin.url, active: false })).id ?? null;
  }
  if (tabId !== null) await placeHome(api, tabId, origin);
}

/**
 * Restores the most recently closed item if it is the tab at `url` (alone in its closed mini
 * window, or as a tab), and returns the restored tab's id.
 * @param {typeof chrome} api
 * @param {string | undefined} url
 * @returns {Promise<number | null>}
 */
async function restoreFromSession(api, url) {
  const [recent] = await api.sessions.getRecentlyClosed({ maxResults: 1 });
  const closed = recent?.window?.tabs?.[0] ?? recent?.tab;
  const sessionId = recent?.window?.sessionId ?? recent?.tab?.sessionId;
  if (!sessionId || !url || closed?.url !== url) return null;
  const restored = await api.sessions.restore(sessionId);
  return (restored?.window?.tabs?.[0] ?? restored?.tab)?.id ?? null;
}

/**
 * @param {typeof chrome} api
 * @param {chrome.storage.StorageArea} store
 * @param {Set<number>} inFlight
 * @returns {(tabId: number) => Promise<void>}
 */
function makeBack(api, store, inFlight) {
  return async (tabId) => {
    if (inFlight.has(tabId)) return;
    inFlight.add(tabId);
    try {
      const origin = (await getPeeks(store))[tabId];
      if (origin) await doBack(api, store, tabId, origin);
    } finally {
      inFlight.delete(tabId);
    }
  };
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
    /** @param {number} tabId @returns {Promise<PeekOrigin | null>} */
    originOf: (tabId) => getPeeks(store).then((p) => p[tabId] ?? null),
    /** @param {number} tabId @param {PeekBounds} bounds */
    async open(tabId, bounds) {
      const tab = await api.tabs.get(tabId);
      const p = await getPeeks(store);
      p[tabId] = {
        windowId: tab.windowId,
        index: tab.index,
        groupId: effectiveGroupId(tab),
        pinned: tab.pinned,
        url: tab.url,
      };
      await savePeeks(store, p);
      try {
        await api.windows.create({ tabId, type: 'popup', ...bounds, focused: true });
      } catch (err) {
        const ps = await getPeeks(store);
        delete ps[tabId];
        await savePeeks(store, ps);
        throw err;
      }
    },
    back: makeBack(api, store, inFlight),
    /** @returns {Promise<Map<number, PeekOrigin>>} */
    all: () =>
      getPeeks(store).then((p) => new Map(Object.entries(p).map(([id, o]) => [Number(id), o]))),
    /** @param {number} tabId */
    forget: async (tabId) => {
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
