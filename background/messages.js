// @ts-check
import { MSG, PORT_NAME } from './constants.js';

/**
 * Narrows an untrusted port message to a ClientMessage; unknown fields are dropped.
 * @param {unknown} raw
 * @returns {ClientMessage | null}
 */
export function parseClientMessage(raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const { type, tabId } = /** @type {{ type?: unknown, tabId?: unknown }} */ (raw);
  if (type === MSG.NEW) return { type };
  if ((type === MSG.ACTIVATE || type === MSG.CLOSE) && isTabId(tabId)) return { type, tabId };
  return null;
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isTabId(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Identifies the sending tab, but only for this extension's own top-frame content script.
 * @param {chrome.runtime.Port} port
 * @param {string} extensionId
 * @returns {ClientInfo | null}
 */
export function identifyClient(port, extensionId) {
  const sender = port.sender;
  if (port.name !== PORT_NAME || sender?.id !== extensionId || sender.frameId !== 0) return null;
  const tab = sender.tab;
  if (tab?.id === undefined || tab.id < 0) return null;
  return { tabId: tab.id, windowId: tab.windowId };
}
