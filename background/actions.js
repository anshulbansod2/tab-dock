// @ts-check
import { MSG, UNGROUPED_ID } from './constants.js';
import { isStaleTabError, logger } from './logger.js';

/**
 * Performs a validated bar action for the tab that sent it. Never rejects: stale-tab failures
 * are expected and ignored, anything else is logged.
 *
 * @param {ClientMessage} msg
 * @param {ClientInfo} client
 * @param {typeof chrome} api
 * @returns {Promise<void>}
 */
export async function handleAction(msg, client, api) {
  try {
    if (msg.type === MSG.NEW) {
      await openTabInGroup(client.tabId, api);
    } else {
      await actOnTab(msg, client.tabId, api);
    }
  } catch (err) {
    if (!isStaleTabError(err)) logger.error(`${msg.type} failed`, err);
  }
}

/**
 * Activates or closes a tab, but only within the sender's current window.
 * @param {Extract<ClientMessage, { tabId: number }>} msg
 * @param {number} senderTabId
 * @param {typeof chrome} api
 */
async function actOnTab(msg, senderTabId, api) {
  const [sender, target] = await Promise.all([api.tabs.get(senderTabId), api.tabs.get(msg.tabId)]);
  if (target.windowId !== sender.windowId) {
    logger.warn(`ignored cross-window ${msg.type}`);
    return;
  }
  if (msg.type === MSG.ACTIVATE) {
    await api.tabs.update(msg.tabId, { active: true });
  } else {
    await api.tabs.remove(msg.tabId);
  }
}

/**
 * Opens a tab right after the sender and, if the sender is grouped, joins it to that group.
 * @param {number} senderTabId
 * @param {typeof chrome} api
 */
async function openTabInGroup(senderTabId, api) {
  const sender = await api.tabs.get(senderTabId);
  const created = await api.tabs.create({
    windowId: sender.windowId,
    index: sender.index + 1,
    active: true,
  });
  const grouped = !sender.pinned && sender.groupId !== UNGROUPED_ID;
  if (grouped && created.id !== undefined) {
    await api.tabs.group({ groupId: sender.groupId, tabIds: created.id });
  }
}
