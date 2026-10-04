// @ts-check

/** Message types; must equal content/core.js MSG (enforced by tests/contract.test.js). */
export const MSG = Object.freeze({
  HELLO: 'hello',
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

/** Only these pages can host the bar (Chrome blocks chrome://, the Web Store, etc.). */
export const INJECTABLE_URL = /^https?:/;
