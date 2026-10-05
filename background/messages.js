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
  if (type === MSG.NEW || type === MSG.HELLO) return { type };
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
