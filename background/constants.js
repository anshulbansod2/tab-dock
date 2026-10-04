// @ts-check

/** Port name; must equal content/core.js PORT_NAME (enforced by tests/contract.test.js). */
export const PORT_NAME = 'hover-helper';

export const MSG = Object.freeze({
  SNAPSHOT: 'snapshot',
  ACTIVATE: 'activate',
  CLOSE: 'close',
  NEW: 'new',
});

/** Mirrors chrome.tabGroups.TAB_GROUP_ID_NONE so pure modules need no chrome global. */
export const UNGROUPED_ID = -1;
export const DEFAULT_GROUP_TITLE = 'Group';
export const DEFAULT_GROUP_COLOR = 'grey';
export const UNTITLED_TAB = 'Untitled';
export const BROADCAST_DEBOUNCE_MS = 50;
