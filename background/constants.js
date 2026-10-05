// @ts-check

/** Message types; must equal content/core.js MSG (enforced by tests/contract.test.js). */
export const MSG = Object.freeze({
  HELLO: 'hello',
  SNAPSHOT: 'snapshot',
  ACTIVATE: 'activate',
  CLOSE: 'close',
  NEW: 'new',
  MOVE: 'move',
});

/** Mirrors chrome.tabGroups.TAB_GROUP_ID_NONE so pure modules need no chrome global. */
export const UNGROUPED_ID = -1;
export const DEFAULT_GROUP_TITLE = 'Group';
export const DEFAULT_GROUP_COLOR = 'grey';
export const UNTITLED_TAB = 'Untitled';
export const BROADCAST_DEBOUNCE_MS = 50;

/**
 * Pages that can host the bar. Chrome blocks chrome://, the Web Store, etc.; file:// pages
 * work once the user enables "Allow access to file URLs" (injection fails quietly otherwise).
 */
export const INJECTABLE_URL = /^(https?|file):/;
/** Pages with a web origin, whose favicons Chrome caches per site. */
export const WEB_URL = /^https?:/;
