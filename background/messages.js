// @ts-check
import { MSG, UNGROUPED_ID } from './constants.js';

/**
 * Narrows an untrusted port message to a ClientMessage; unknown fields are dropped.
 * @param {unknown} raw
 * @returns {ClientMessage | null}
 */
export function parseClientMessage(raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const { type, tabId, toIndex, groupId, bounds } = /** @type {Record<string, unknown>} */ (raw);
  if (type === MSG.NEW || type === MSG.HELLO || type === MSG.RETURN) return { type };
  if (type === MSG.PREVIEW && isTabId(tabId)) return { type, tabId };
  if (type === MSG.PEEK && isTabId(tabId)) {
    const box = parseBounds(bounds);
    return box ? { type, tabId, bounds: box } : null;
  }
  if ((type === MSG.ACTIVATE || type === MSG.CLOSE) && isTabId(tabId)) return { type, tabId };
  if (type === MSG.MOVE && isTabId(tabId) && isTabId(toIndex)) return { type, tabId, toIndex };
  if (type === MSG.REGROUP && isTabId(tabId) && (isTabId(groupId) || groupId === UNGROUPED_ID))
    return { type, tabId, groupId };
  if (type === MSG.NEW_GROUP && isTabId(tabId)) return { type, tabId };
  return null;
}

/**
 * A non-negative integer (tab ids and positions).
 * @param {unknown} value
 * @returns {value is number}
 */
function isTabId(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Identifies the sending tab, but only for this extension's own top-frame content script.
 * @param {chrome.runtime.MessageSender} sender
 * @param {string} extensionId
 * @returns {ClientInfo | null}
 */
export function identifySender(sender, extensionId) {
  if (sender.id !== extensionId || sender.frameId !== 0) return null;
  const tab = sender.tab;
  if (tab?.id === undefined || tab.id < 0) return null;
  return { tabId: tab.id, windowId: tab.windowId };
}

const SCREEN_LIMIT_PX = 100_000;
const MIN_SIZE_PX = 120;

/**
 * Screen bounds for a mini window: integers, a usable size, nothing absurd.
 * @param {unknown} raw
 * @returns {PeekBounds | null}
 */
function parseBounds(raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const { left, top, width, height } = /** @type {Record<string, unknown>} */ (raw);
  const all = [left, top, width, height];
  const sane = all.every(
    (v) => typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= SCREEN_LIMIT_PX,
  );
  if (!sane || Number(width) < MIN_SIZE_PX || Number(height) < MIN_SIZE_PX) return null;
  return /** @type {PeekBounds} */ ({ left, top, width, height });
}
