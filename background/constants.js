// @ts-check

/** Message types; must equal content/core.js MSG (enforced by tests/contract.test.js). */
export const MSG = Object.freeze({
  HELLO: 'hello',
  SNAPSHOT: 'snapshot',
  ACTIVATE: 'activate',
  CLOSE: 'close',
  NEW: 'new',
  MOVE: 'move',
  REGROUP: 'regroup',
  NEW_GROUP: 'newgroup',
  PREVIEW: 'preview',
  PEEK: 'peek',
  RETURN: 'return',
  SEEN: 'seen',
  GROUP: 'group',
  EDIT_GROUP: 'editgroup',
});

/** Mirrors chrome.tabGroups.TAB_GROUP_ID_NONE so pure modules need no chrome global. */
export const UNGROUPED_ID = -1;
export const DEFAULT_GROUP_TITLE = 'Group';
export const DEFAULT_GROUP_COLOR = 'grey';
/** chrome.tabGroups.Color values. */
export const GROUP_COLORS = Object.freeze([
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
]);
/** Longer names are cut off in the tab strip anyway; the cap keeps messages small. */
export const GROUP_TITLE_MAX = 100;
export const UNTITLED_TAB = 'Untitled';
export const BROADCAST_DEBOUNCE_MS = 50;

/**
 * Pages that can host the bar. Chrome blocks chrome://, the Web Store, etc.; file:// pages
 * work once the user enables "Allow access to file URLs" (injection fails quietly otherwise).
 */
export const INJECTABLE_URL = /^(https?|file):/;
/** Pages with a web origin, whose favicons Chrome caches per site. */
export const WEB_URL = /^https?:/;
