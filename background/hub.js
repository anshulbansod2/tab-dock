// @ts-check
import { BROADCAST_DEBOUNCE_MS, INJECTABLE_URL, MSG, UNGROUPED_ID } from './constants.js';
import { createFavicons } from './favicons.js';
import { logger } from './logger.js';
import { buildSnapshot } from './tabModel.js';

/** @typedef {ReturnType<typeof createHub>} Hub */

/**
 * Keeps every bar current without holding any connection open, so the service worker can
 * sleep between events. Bursts of events within `debounceMs` collapse into one push per
 * window.
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
  // In-memory on purpose: chrome.alarms can't fire sooner than 30 s, too coarse to debounce.
  // Losing a pending timer when the worker stops only drops one push; the next tab event or
  // a bar's hello rebuilds the snapshot from Chrome's live state.
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

  /**
   * Pushes to every bar in the window, not just the visible one, so switching tabs shows a bar
   * that is already current instead of one that catches up a round trip later. Hidden pages
   * paint on their next animation frame, which Chrome holds until they are shown, so this costs
   * one message per tab and no rendering. Favicons are inlined once per group.
   * @param {number} windowId
   */
  async function pushToWindow(windowId) {
    const { tabs, groups } = await windowState(windowId);
    /** @type {Map<number, Promise<Snapshot>>} */
    const perGroup = new Map();
    const reachable = tabs.filter(
      (tab) => tab.id !== undefined && !tab.discarded && INJECTABLE_URL.test(tab.url ?? ''),
    );
    await Promise.all(
      reachable.map(async (tab) => {
        const tabId = /** @type {number} */ (tab.id);
        const built = buildSnapshot({ tabs, groups, tabId });
        const key = built.group?.id ?? UNGROUPED_ID;
        if (!perGroup.has(key)) perGroup.set(key, favicons.inline(built, tabs));
        const shared = /** @type {Snapshot} */ (await perGroup.get(key));
        const snapshot = {
          ...shared,
          tabs: shared.tabs.map((t) => ({ ...t, active: t.id === tabId })),
        };
        /** @type {ServerMessage} */
        const message = { type: MSG.SNAPSHOT, snapshot };
        try {
          await api.tabs.sendMessage(tabId, message, { frameId: 0 });
        } catch {
          if (tab.active) await injectBar(tab); // no bar is listening in the visible tab yet
        }
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
    const flush = async () => {
      timers.delete(windowId);
      try {
        await pushToWindow(windowId);
      } catch (err) {
        logger.error('push failed', err);
      }
    };
    timers.set(windowId, setTimeout(flush, debounceMs));
  }

  async function scheduleAll() {
    try {
      const tabs = await api.tabs.query({ active: true });
      new Set(tabs.map((tab) => tab.windowId)).forEach(schedule);
    } catch (err) {
      logger.error('refresh failed', err);
    }
  }

  return { snapshotFor, schedule, scheduleAll };
}
