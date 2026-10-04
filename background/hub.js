// @ts-check
import { BROADCAST_DEBOUNCE_MS, MSG } from './constants.js';
import { logger } from './logger.js';
import { buildSnapshot } from './tabModel.js';

/** @typedef {ReturnType<typeof createHub>} Hub */

/**
 * Tracks connected bars and pushes each a fresh snapshot when its window changes. Bursts of
 * events within `debounceMs` collapse into one push per window.
 *
 * @param {{ api: typeof chrome, debounceMs?: number }} deps
 */
export function createHub({ api, debounceMs = BROADCAST_DEBOUNCE_MS }) {
  /** @type {Map<chrome.runtime.Port, ClientInfo>} */
  const clients = new Map();
  /** @type {Map<number, ReturnType<typeof setTimeout>>} */
  const timers = new Map();

  /**
   * @param {chrome.runtime.Port[]} ports
   * @param {number} windowId
   */
  async function push(ports, windowId) {
    const [tabs, groups] = await Promise.all([
      api.tabs.query({ windowId }),
      api.tabGroups.query({ windowId }),
    ]);
    for (const port of ports) {
      const client = clients.get(port);
      if (client) send(port, buildSnapshot({ tabs, groups, tabId: client.tabId }));
    }
  }

  /**
   * @param {chrome.runtime.Port[]} ports
   * @param {number} windowId
   */
  function pushSafely(ports, windowId) {
    push(ports, windowId).catch((err) => logger.error('push failed', err));
  }

  /** @param {number} windowId */
  function flush(windowId) {
    timers.delete(windowId);
    const ports = [...clients].filter(([, c]) => c.windowId === windowId).map(([port]) => port);
    if (ports.length > 0) pushSafely(ports, windowId);
  }

  /** @param {number} windowId */
  function schedule(windowId) {
    if (windowId < 0) return; // chrome.windows.WINDOW_ID_NONE
    clearTimeout(timers.get(windowId));
    timers.set(
      windowId,
      setTimeout(() => flush(windowId), debounceMs),
    );
  }

  return {
    /**
     * @param {chrome.runtime.Port} port
     * @param {ClientInfo} client
     */
    add(port, client) {
      clients.set(port, client);
      port.onDisconnect.addListener(() => clients.delete(port));
      pushSafely([port], client.windowId);
    },
    /** @param {chrome.runtime.Port} port */
    clientFor: (port) => clients.get(port),
    schedule,
    scheduleAll() {
      new Set([...clients.values()].map((c) => c.windowId)).forEach(schedule);
    },
    /**
     * @param {number} tabId
     * @param {number} windowId
     */
    retarget(tabId, windowId) {
      for (const client of clients.values()) {
        if (client.tabId === tabId) client.windowId = windowId;
      }
    },
  };
}

/**
 * @param {chrome.runtime.Port} port
 * @param {Snapshot} snapshot
 */
function send(port, snapshot) {
  /** @type {ServerMessage} */
  const message = { type: MSG.SNAPSHOT, snapshot };
  try {
    port.postMessage(message);
  } catch (err) {
    logger.warn('dropping snapshot for disconnected port', err);
  }
}
