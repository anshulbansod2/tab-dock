// @ts-check
import {
  DEFAULT_GROUP_COLOR,
  DEFAULT_GROUP_TITLE,
  UNGROUPED_ID,
  UNTITLED_TAB,
} from './constants.js';

/**
 * Builds one bar's contents: the tabs sharing its Chrome tab group (or every ungrouped tab
 * when it has none), in tab-strip order.
 *
 * @param {object} input
 * @param {chrome.tabs.Tab[]} input.tabs - Every tab in the window.
 * @param {chrome.tabGroups.TabGroup[]} input.groups - Every group in the window.
 * @param {number} input.tabId - The tab the bar is rendered in.
 * @param {chrome.tabGroups.TabGroup | null} [input.home] - set when the bar's own tab is
 *   peeked: the group it returns to (null: ungrouped).
 * @returns {Snapshot}
 */
export function buildSnapshot({ tabs, groups, tabId, home }) {
  const self = tabs.find((tab) => tab.id === tabId);
  const groupId = self ? effectiveGroupId(self) : UNGROUPED_ID;
  /** @type {Snapshot} */
  const snapshot = {
    group: describeGroup(groups, groupId),
    tabs: membersOf({ tabs, groupId, tabId }),
    groups: groupsInOrder(tabs, groups),
  };
  if (home !== undefined) snapshot.peek = { home: home && describeGroup([home], home.id) };
  return snapshot;
}

/**
 * The group's tabs in strip order.
 * @param {object} input
 * @param {chrome.tabs.Tab[]} input.tabs
 * @param {number} input.groupId
 * @param {number} input.tabId
 * @returns {BarTab[]}
 */
function membersOf({ tabs, groupId, tabId }) {
  return tabs
    .filter((tab) => tab.id !== undefined && effectiveGroupId(tab) === groupId)
    .sort((a, b) => a.index - b.index)
    .map((tab) => toBarTab(tab, tabId));
}

/**
 * The window's groups in tab-strip order (by their first tab).
 * @param {chrome.tabs.Tab[]} tabs
 * @param {chrome.tabGroups.TabGroup[]} groups
 * @returns {BarGroup[]}
 */
function groupsInOrder(tabs, groups) {
  /** @type {Map<number, number>} */
  const firstIndex = new Map();
  for (const tab of tabs) {
    const id = effectiveGroupId(tab);
    if (id === UNGROUPED_ID) continue;
    firstIndex.set(id, Math.min(firstIndex.get(id) ?? Infinity, tab.index));
  }
  return [...firstIndex.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => /** @type {BarGroup} */ (describeGroup(groups, id)));
}

/**
 * Pinned tabs cannot be grouped, so they always sit with the ungrouped tabs.
 * @param {chrome.tabs.Tab} tab
 * @returns {number}
 */
export function effectiveGroupId(tab) {
  return tab.pinned ? UNGROUPED_ID : (tab.groupId ?? UNGROUPED_ID);
}

/**
 * @param {chrome.tabs.Tab} tab - Must have an id (filtered by the caller).
 * @param {number} selfId
 * @returns {BarTab}
 */
function toBarTab(tab, selfId) {
  const id = /** @type {number} */ (tab.id);
  return {
    id,
    title: tab.title || tab.url || UNTITLED_TAB,
    favIconUrl: tab.favIconUrl || null,
    active: id === selfId,
  };
}

/**
 * @param {chrome.tabGroups.TabGroup[]} groups
 * @param {number} groupId
 * @returns {BarGroup | null}
 */
function describeGroup(groups, groupId) {
  if (groupId === UNGROUPED_ID) return null;
  const group = groups.find((g) => g.id === groupId);
  return {
    id: groupId,
    title: group?.title || DEFAULT_GROUP_TITLE,
    color: group?.color ?? DEFAULT_GROUP_COLOR,
  };
}
