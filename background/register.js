// @ts-check
import { handleAction } from './actions.js';
import { MSG } from './constants.js';
import { createHub } from './hub.js';
import { logger } from './logger.js';
import { identifySender, parseClientMessage } from './messages.js';
import { migrateStorage } from './migrate.js';
import { createPreviews } from './previews.js';
import { createReturns } from './returns.js';

/** @typedef {import('./hub.js').Hub} Hub */

/** tabs.onUpdated fields that change what a bar displays. */
const RELEVANT_UPDATES = ['title', 'favIconUrl', 'groupId', 'pinned', 'url'];

/**
 * Wires bar messages and Chrome tab/group events. Must run synchronously at service-worker
 * start so Chrome can wake the worker for these events.
 * @param {typeof chrome} api
 * @param {{ shrink?: (dataUrl: string) => Promise<string> }} [options] - test seams
 * @returns {Hub}
 */
export function registerBackground(api, { shrink } = {}) {
  const returns = createReturns({ store: api.storage.session });
  const previews = createPreviews({ api, shrink });
  const hub = createHub({ api, returns });
  /** @type {Services} */
  const services = { hub, api, returns, previews };
  api.runtime.onMessage.addListener((raw, sender, sendResponse) =>
    onClientMessage(raw, sender, sendResponse, services),
  );
  // After install/update, open pages have no bar; refreshing the visible ones injects it.
  api.runtime.onInstalled.addListener(() => {
    void migrateStorage(api.storage.local); // settings saved before the rename to Tab Dock
    void hub.scheduleAll();
  });
  registerTabEvents(services);
  registerGroupEvents(api, hub);
  return hub;
}

/** @typedef {{ hub: Hub, api: typeof chrome, returns: Returns, previews: ReturnType<typeof createPreviews> }} Services */

/**
 * @param {unknown} raw
 * @param {chrome.runtime.MessageSender} sender
 * @param {(response?: unknown) => void} sendResponse
 * @param {Services} services
 * @returns {boolean} true when sendResponse will be called asynchronously
 */
function onClientMessage(raw, sender, sendResponse, services) {
  const { api, hub, returns } = services;
  const client = identifySender(sender, api.runtime.id);
  const msg = client && parseClientMessage(raw);
  if (!client || !msg) {
    logger.warn('dropped invalid message');
    return false;
  }
  if (msg.type === MSG.HELLO || msg.type === MSG.PREVIEW) {
    const answer =
      msg.type === MSG.HELLO ? hub.snapshotFor(client) : previewFor(msg.tabId, client, services);
    reply(answer, sendResponse, msg.type);
    return true; // keeps the channel open for the async sendResponse
  }
  if (msg.type === MSG.SEEN) services.previews.schedule(client.windowId);
  else void handleAction(msg, client, api, returns);
  return false;
}

/**
 * @param {Promise<unknown>} answer
 * @param {(response?: unknown) => void} sendResponse
 * @param {string} type
 */
async function reply(answer, sendResponse, type) {
  try {
    sendResponse(await answer);
  } catch (err) {
    logger.error(`${type} failed`, err);
    sendResponse(null);
  }
}

/**
 * A tab's hover-card screenshot, only for bars in its own window.
 * @param {number} tabId
 * @param {ClientInfo} client
 * @param {Services} services
 */
async function previewFor(tabId, client, { api, previews }) {
  const tab = await api.tabs.get(tabId).catch(() => null);
  return tab?.windowId === client.windowId ? previews.get(tabId) : null;
}

/**
 * @param {Services} services
 */
function registerTabEvents({ api, hub, returns, previews }) {
  const { tabs } = api;
  tabs.onCreated.addListener((tab) => hub.schedule(tab.windowId));
  tabs.onRemoved.addListener((id, info) => {
    hub.forget(id);
    hub.schedule(info.windowId);
    void forgetClosed(id, { hub, returns, previews });
  });
  tabs.onMoved.addListener((_id, info) => hub.schedule(info.windowId));
  // Also heals tabs opened before install: the push to them fails and the bar is injected.
  tabs.onActivated.addListener((info) => {
    hub.schedule(info.windowId);
    previews.schedule(info.windowId); // the hover card shows the tab as last seen
    // Leaving a tab opened off a hover card ends its way back (its Back button goes).
    void returns.activated(info.windowId, info.tabId).then((ended) => {
      if (ended) hub.schedule(info.windowId);
    });
  });
  tabs.onUpdated.addListener((_id, change, tab) => {
    if (RELEVANT_UPDATES.some((key) => key in change)) hub.schedule(tab.windowId);
    if (change.status === 'complete' && tab.active) previews.schedule(tab.windowId);
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
 * A closed tab's screenshot goes, and so does any way back it was part of.
 * @param {number} tabId
 * @param {Pick<Services, 'hub' | 'returns' | 'previews'>} services
 */
async function forgetClosed(tabId, { hub, returns, previews }) {
  const [ended] = await Promise.all([returns.closed(tabId), previews.forget(tabId)]);
  ended.forEach(hub.schedule);
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
