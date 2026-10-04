// @ts-check
import { handleAction } from './actions.js';
import { createHub } from './hub.js';
import { logger } from './logger.js';
import { identifyClient, parseClientMessage } from './messages.js';

/** @typedef {import('./hub.js').Hub} Hub */

/** tabs.onUpdated fields that change what a bar displays. */
const RELEVANT_UPDATES = ['title', 'favIconUrl', 'groupId', 'pinned', 'url'];

/**
 * Wires bar connections and Chrome tab/group events. Must run synchronously at service-worker
 * start so Chrome can wake the worker for these events.
 * @param {typeof chrome} api
 * @returns {Hub}
 */
export function registerBackground(api) {
  const hub = createHub({ api });
  api.runtime.onConnect.addListener((port) => acceptPort(port, hub, api));
  registerTabEvents(api, hub);
  registerGroupEvents(api, hub);
  return hub;
}

/**
 * @param {chrome.runtime.Port} port
 * @param {Hub} hub
 * @param {typeof chrome} api
 */
function acceptPort(port, hub, api) {
  const client = identifyClient(port, api.runtime.id);
  if (!client) {
    logger.warn('rejected port', port.name);
    port.disconnect();
    return;
  }
  port.onMessage.addListener((raw) => {
    const msg = parseClientMessage(raw);
    const current = hub.clientFor(port);
    if (!msg || !current) {
      logger.warn('dropped invalid message');
      return;
    }
    void handleAction(msg, current, api);
  });
  hub.add(port, client);
}

/**
 * @param {typeof chrome} api
 * @param {Hub} hub
 */
function registerTabEvents(api, hub) {
  const { tabs } = api;
  tabs.onCreated.addListener((tab) => hub.schedule(tab.windowId));
  tabs.onRemoved.addListener((_id, info) => hub.schedule(info.windowId));
  tabs.onMoved.addListener((_id, info) => hub.schedule(info.windowId));
  tabs.onUpdated.addListener((_id, change, tab) => {
    if (RELEVANT_UPDATES.some((key) => key in change)) hub.schedule(tab.windowId);
  });
  tabs.onDetached.addListener((_id, info) => hub.schedule(info.oldWindowId));
  tabs.onAttached.addListener((id, info) => {
    hub.retarget(id, info.newWindowId);
    hub.schedule(info.newWindowId);
  });
  // Prerender swaps a tab's id; the window isn't in the payload, so refresh all.
  tabs.onReplaced.addListener(() => hub.scheduleAll());
}

/**
 * @param {typeof chrome} api
 * @param {Hub} hub
 */
function registerGroupEvents(api, hub) {
  /** @param {chrome.tabGroups.TabGroup} group */
  const onGroupChange = (group) => hub.schedule(group.windowId);
  api.tabGroups.onUpdated.addListener(onGroupChange);
  api.tabGroups.onRemoved.addListener(onGroupChange);
  api.tabGroups.onMoved.addListener(onGroupChange);
}
