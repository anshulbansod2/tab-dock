// @ts-check
import { MSG, UNGROUPED_ID } from './constants.js';
import { isStaleTabError, logger } from './logger.js';
import { effectiveGroupId } from './tabModel.js';

/**
 * Performs a validated bar action for the tab that sent it. Never rejects: stale-tab failures
 * are expected and ignored, anything else is logged.
 *
 * @param {Exclude<ClientMessage, { type: 'hello' | 'preview' | 'seen' }>} msg
 * @param {ClientInfo} client
 * @param {typeof chrome} api
 * @param {Pick<Returns, 'remember' | 'get'>} [returns]
 * @returns {Promise<void>}
 */
export async function handleAction(msg, client, api, returns) {
  try {
    if (msg.type === MSG.PEEK) await openInPlace(msg.tabId, client, api, returns);
    else if (msg.type === MSG.RETURN) await goBack(client, api, returns);
    else await act(msg, client, api);
  } catch (err) {
    if (!isStaleTabError(err)) logger.error(`${msg.type} failed`, err);
  }
}

/**
 * Switches to a tab opened off a hover card, remembering the way back. Only another tab of the
 * sender's own window.
 * @param {number} tabId
 * @param {ClientInfo} client
 * @param {typeof chrome} api
 * @param {Pick<Returns, 'remember'>} [returns]
 */
async function openInPlace(tabId, client, api, returns) {
  const target = await api.tabs.get(tabId);
  if (target.windowId !== client.windowId || tabId === client.tabId) {
    logger.warn('ignored peek outside the bar');
    return;
  }
  await returns?.remember(client.windowId, { from: client.tabId, to: tabId });
  await api.tabs.update(tabId, { active: true });
}

/**
 * The Back button: from the opened tab to the one it was opened from.
 * @param {ClientInfo} client
 * @param {typeof chrome} api
 * @param {Pick<Returns, 'get'>} [returns]
 */
async function goBack(client, api, returns) {
  const trail = await returns?.get(client.windowId);
  if (trail?.to === client.tabId) await api.tabs.update(trail.from, { active: true });
}

/**
 * @param {Exclude<ClientMessage, { type: 'hello' | 'preview' | 'seen' | 'peek' | 'return' }>} msg
 * @param {ClientInfo} client
 * @param {typeof chrome} api
 */
async function act(msg, client, api) {
  if (msg.type === MSG.NEW) await openTabInGroup(client.tabId, api);
  else if (msg.type === MSG.MOVE) await moveWithinGroup(msg, client.tabId, api);
  else if (msg.type === MSG.REGROUP || msg.type === MSG.NEW_GROUP)
    await changeGroup(msg, client.tabId, api);
  else await actOnTab(msg, client.tabId, api);
}

/**
 * Activates or closes a tab, but only within the sender's current window.
 * @param {Extract<ClientMessage, { type: 'activate' | 'close' }>} msg
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

/**
 * Reorders a tab among the tabs its bar shows: the sender's group, or the ungrouped tabs.
 * `toIndex` is a position in that list; Chrome wants a window index, which is the index of the
 * tab currently at that position (tabs.move takes the final index).
 * @param {Extract<ClientMessage, { type: 'move' }>} msg
 * @param {number} senderTabId
 * @param {typeof chrome} api
 */
async function moveWithinGroup(msg, senderTabId, api) {
  const sender = await api.tabs.get(senderTabId);
  const groupId = effectiveGroupId(sender);
  const members = (await api.tabs.query({ windowId: sender.windowId }))
    .filter((tab) => effectiveGroupId(tab) === groupId)
    .sort((a, b) => a.index - b.index);
  if (!members.some((tab) => tab.id === msg.tabId)) {
    logger.warn('ignored move outside the bar');
    return;
  }
  const destination = members[Math.min(msg.toIndex, members.length - 1)];
  const moved = await api.tabs.move(msg.tabId, { index: destination.index });
  await keepGroup(msg.tabId, moved, groupId, api);
}

/**
 * Moving to a group's first or last slot can make Chrome add the tab to, or drop it from, a
 * neighbouring group; put it back where the user dragged it within.
 * @param {number} tabId
 * @param {chrome.tabs.Tab | chrome.tabs.Tab[] | undefined} moved
 * @param {number} groupId
 * @param {typeof chrome} api
 */
async function keepGroup(tabId, moved, groupId, api) {
  const tab = Array.isArray(moved) ? moved[0] : moved;
  if (!tab || tab.pinned || (tab.groupId ?? UNGROUPED_ID) === groupId) return;
  if (groupId === UNGROUPED_ID) await api.tabs.ungroup(tabId);
  else await api.tabs.group({ groupId, tabIds: tabId });
}

/**
 * Moves a tab into another group of its window, out of its group, or into a new group.
 * @param {Extract<ClientMessage, { type: 'regroup' | 'newgroup' }>} msg
 * @param {number} senderTabId
 * @param {typeof chrome} api
 */
async function changeGroup(msg, senderTabId, api) {
  const [sender, target] = await Promise.all([api.tabs.get(senderTabId), api.tabs.get(msg.tabId)]);
  if (target.windowId !== sender.windowId) {
    logger.warn(`ignored cross-window ${msg.type}`);
    return;
  }
  if (target.pinned) return; // Chrome can't group pinned tabs
  if (msg.type === MSG.NEW_GROUP) {
    await api.tabs.group({ tabIds: msg.tabId, createProperties: { windowId: target.windowId } });
  } else if (msg.groupId === UNGROUPED_ID) {
    await api.tabs.ungroup(msg.tabId);
  } else if ((await api.tabGroups.get(msg.groupId)).windowId !== target.windowId) {
    logger.warn('ignored move to a group in another window');
  } else {
    await api.tabs.group({ groupId: msg.groupId, tabIds: msg.tabId });
  }
}
