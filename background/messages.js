// @ts-check
import { MSG, UNGROUPED_ID } from './constants.js';

/**
 * Narrows an untrusted port message to a ClientMessage; unknown fields are dropped.
 * @param {unknown} raw
 * @returns {ClientMessage | null}
 */
export function parseClientMessage(raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const { type, tabId, toIndex, groupId } = /** @type {Record<string, unknown>} */ (raw);
  if (type === MSG.NEW || type === MSG.HELLO || type === MSG.RETURN || type === MSG.SEEN)
    return { type };
  if (type === MSG.PREVIEW && isTabId(tabId)) return { type, tabId };
  if (type === MSG.GROUP && (isTabId(groupId) || groupId === UNGROUPED_ID))
    return { type, groupId };
  if (type === MSG.PEEK && isTabId(tabId)) return parsePeek(tabId, raw);
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

const PAGE_LIMIT_PX = 100_000;

/**
 * A peek's measurements: the dock's rect, the page's size and the click, all finite and none
 * absurd, the dock and page with a real size. Only the named fields are kept.
 * @param {number} tabId
 * @param {object} raw
 * @returns {ClientMessage | null}
 */
function parsePeek(tabId, raw) {
  const { dock, view, point } = /** @type {Record<string, unknown>} */ (raw);
  const d = numbers(dock, ['left', 'top', 'right', 'bottom']);
  const v = numbers(view, ['width', 'height']);
  const p = numbers(point, ['screenX', 'screenY', 'clientX', 'clientY']);
  if (!d || !v || !p || d.right <= d.left || d.bottom <= d.top || v.width <= 0 || v.height <= 0)
    return null;
  return {
    type: MSG.PEEK,
    tabId,
    dock: { left: d.left, top: d.top, right: d.right, bottom: d.bottom },
    view: { width: v.width, height: v.height },
    point: { screenX: p.screenX, screenY: p.screenY, clientX: p.clientX, clientY: p.clientY },
  };
}

/**
 * @param {unknown} raw
 * @param {string[]} keys
 * @returns {Record<string, number> | null} the named fields, if each is a sane finite number
 */
function numbers(raw, keys) {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = /** @type {Record<string, unknown>} */ (raw);
  /** @type {Record<string, number>} */
  const out = {};
  for (const key of keys) {
    const value = source[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > PAGE_LIMIT_PX)
      return null;
    out[key] = value;
  }
  return out;
}
