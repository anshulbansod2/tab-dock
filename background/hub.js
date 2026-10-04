// @ts-check
import { BROADCAST_DEBOUNCE_MS, INJECTABLE_URL, MSG } from './constants.js';
import { createFavicons } from './favicons.js';
import { logger } from './logger.js';
import { buildSnapshot } from './tabModel.js';

/** @typedef {ReturnType<typeof createHub>} Hub */

/**
 * Keeps visible bars current without holding any connection open, so the service worker can
 * sleep between events. Only a window's active tab is visible, so only it receives pushes;
 * other tabs ask for a snapshot when they are shown. Bursts of events within `debounceMs`
 * collapse into one push per window.
 *
 * @param {object} deps
 * @param {typeof chrome} deps.api
 * @param {Pick<ReturnType<typeof createFavicons>, 'inline'>} [deps.favicons]
 * @param {number} [deps.debounceMs]
 */
export function createHub({
  api,
  favicons = createFavicons({ api }),
  debounceMs = BROADCAST_DEBOUNCE_MS,
}) {
  /** @type {Map<number, ReturnType<typeof setTimeout>>} */
  const timers = new Map();

  /** @param {number} windowId */
  async function windowState(windowId) {
    const [tabs, groups] = await Promise.all([
      api.tabs.query({ windowId }),
      api.tabGroups.query({ windowId }),
    ]);
    return { tabs, groups };
  }

  /**
   * Snapshot for one bar, in reply to its hello.
   * @param {ClientInfo} client
   * @returns {Promise<Snapshot>}
   */
  async function snapshotFor(client) {
    const { tabs, groups } = await windowState(client.windowId);
    return favicons.inline(buildSnapshot({ tabs, groups, tabId: client.tabId }), tabs);
  }

  /** @param {number} windowId */
  async function pushToVisible(windowId) {
    const { tabs, groups } = await windowState(windowId);
    const visible = tabs.filter((tab) => tab.active && tab.id !== undefined);
    await Promise.all(
      visible.map(async (tab) => {
        const tabId = /** @type {number} */ (tab.id);
        const snapshot = await favicons.inline(buildSnapshot({ tabs, groups, tabId }), tabs);
        /** @type {ServerMessage} */
        const message = { type: MSG.SNAPSHOT, snapshot };
        return api.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(() => injectBar(tab));
      }),
    );
  }

  /**
   * A loaded web page with no bar was opened before the extension was installed or updated
   * (Chrome doesn't inject into existing tabs). Inject it now, only for tabs the user visits.
   * @param {chrome.tabs.Tab} tab
   */
  async function injectBar(tab) {
    if (tab.id === undefined || tab.status !== 'complete' || !INJECTABLE_URL.test(tab.url ?? '')) {
      return;
    }
    const files = api.runtime.getManifest().content_scripts?.[0]?.js ?? [];
    try {
      await api.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files });
    } catch {
      // Some https pages are still off-limits (e.g. the Web Store); the bar just isn't shown.
    }
  }

  /** @param {number} windowId */
  function schedule(windowId) {
    if (windowId < 0) return; // chrome.windows.WINDOW_ID_NONE
    clearTimeout(timers.get(windowId));
    const flush = () => {
      timers.delete(windowId);
      pushToVisible(windowId).catch((err) => logger.error('push failed', err));
    };
    timers.set(windowId, setTimeout(flush, debounceMs));
  }

  function scheduleAll() {
    api.tabs
      .query({ active: true })
      .then((tabs) => new Set(tabs.map((tab) => tab.windowId)).forEach(schedule))
      .catch((err) => logger.error('refresh failed', err));
  }

  return { snapshotFor, schedule, scheduleAll };
}
