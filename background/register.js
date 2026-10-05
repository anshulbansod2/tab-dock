// @ts-check
import { handleAction } from './actions.js';
import { MSG } from './constants.js';
import { createHub } from './hub.js';
import { logger } from './logger.js';
import { identifySender, parseClientMessage } from './messages.js';
import { migrateStorage } from './migrate.js';

/** @typedef {import('./hub.js').Hub} Hub */

/** tabs.onUpdated fields that change what a bar displays. */
const RELEVANT_UPDATES = ['title', 'favIconUrl', 'groupId', 'pinned', 'url'];

/**
 * Wires bar messages and Chrome tab/group events. Must run synchronously at service-worker
 * start so Chrome can wake the worker for these events.
 * @param {typeof chrome} api
 * @returns {Hub}
 */
export function registerBackground(api) {
  const hub = createHub({ api });
  api.runtime.onMessage.addListener((raw, sender, sendResponse) =>
    onClientMessage(raw, sender, sendResponse, hub, api),
  );
  // After install/update, open pages have no bar; refreshing the visible ones injects it.
  api.runtime.onInstalled.addListener(() => {
    void migrateStorage(api.storage.local); // settings saved before the rename to Tab Dock
    void hub.scheduleAll();
  });
  registerTabEvents(api, hub);
  registerGroupEvents(api, hub);
  return hub;
}

/**
 * @param {unknown} raw
 * @param {chrome.runtime.MessageSender} sender
 * @param {(response?: unknown) => void} sendResponse
 * @param {Hub} hub
 * @param {typeof chrome} api
 * @returns {boolean} true when sendResponse will be called asynchronously
 */
function onClientMessage(raw, sender, sendResponse, hub, api) {
  const client = identifySender(sender, api.runtime.id);
  const msg = client && parseClientMessage(raw);
  if (!client || !msg) {
    logger.warn('dropped invalid message');
    return false;
  }
  if (msg.type === MSG.HELLO) {
    (async () => {
      try {
        sendResponse(await hub.snapshotFor(client));
      } catch (err) {
        logger.error('hello failed', err);
        sendResponse(null);
      }
    })();
    return true; // keeps the channel open for the async sendResponse
  }
  void handleAction(msg, client, api);
  return false;
}

/**
 * @param {typeof chrome} api
 * @param {Hub} hub
 */
function registerTabEvents(api, hub) {
  const { tabs } = api;
  tabs.onCreated.addListener((tab) => hub.schedule(tab.windowId));
  tabs.onRemoved.addListener((id, info) => {
    hub.forget(id);
    hub.schedule(info.windowId);
  });
  tabs.onMoved.addListener((_id, info) => hub.schedule(info.windowId));
  // Also heals tabs opened before install: the push to them fails and the bar is injected.
  tabs.onActivated.addListener((info) => hub.schedule(info.windowId));
  tabs.onUpdated.addListener((_id, change, tab) => {
    if (RELEVANT_UPDATES.some((key) => key in change)) hub.schedule(tab.windowId);
  });
  tabs.onDetached.addListener((_id, info) => hub.schedule(info.oldWindowId));
  tabs.onAttached.addListener((_id, info) => hub.schedule(info.newWindowId));
  // Prerender swaps a tab's id; the window isn't in the payload, so refresh all.
  tabs.onReplaced.addListener((newId, oldId) => {
    hub.forget(oldId);
    void hub.scheduleAll();
  });
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
