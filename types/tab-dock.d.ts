// Ambient (no imports/exports) so JSDoc in both ES-module background files and classic content
// scripts can reference these names directly.

interface BarGroup {
  id: number;
  title: string;
  /** Chrome tab-group colour name, e.g. "blue". */
  color: string;
}

interface BarTab {
  id: number;
  title: string;
  favIconUrl: string | null;
  /** True only for the tab this bar is rendered in. */
  active: boolean;
}

interface Snapshot {
  /** null when the bar's tab is ungrouped (or pinned). */
  group: BarGroup | null;
  tabs: BarTab[];
  /** Every group in the window, in strip order: where a tab can be moved to. */
  groups: BarGroup[];
  /** Whether the window has ungrouped (or pinned) tabs: the switcher's last swatch. */
  hasUngrouped: boolean;
  /** Set when this bar's tab is peeked into a mini window: the group it returns to. */
  peek?: { home: BarGroup | null };
}

/** Another group's tabs, as the group switcher shows them. */
interface GroupView {
  /** null: the ungrouped tabs. */
  group: BarGroup | null;
  tabs: BarTab[];
  /** The group's most recently used tab. */
  lastId: number;
}

type ClientMessage =
  | { type: 'hello' }
  | { type: 'activate'; tabId: number }
  | { type: 'close'; tabId: number }
  | { type: 'new' }
  /** toIndex is a position within the sender's group (or among the ungrouped tabs). */
  | { type: 'move'; tabId: number; toIndex: number }
  /** groupId -1 takes the tab out of its group. */
  | { type: 'regroup'; tabId: number; groupId: number }
  /** Optionally named and coloured. */
  | { type: 'newgroup'; tabId: number; title?: string; color?: chrome.tabGroups.Color }
  /** Renames or recolours a group of the sender's window (at least one is set). */
  | { type: 'editgroup'; groupId: number; title?: string; color?: chrome.tabGroups.Color }
  /** Asks for a group's tabs (replied to with a GroupView); -1 is the ungrouped tabs. */
  | { type: 'group'; groupId: number }
  /** Asks for the tab's hover-card screenshot (replied to, like hello). */
  | { type: 'preview'; tabId: number }
  /** Moves the tab into a mini window resting on the sender's dock (measured in its page). */
  | {
      type: 'peek';
      tabId: number;
      dock: PeekDock;
      view: { width: number; height: number };
      point: PeekPoint;
    }
  /** Sent from a peeked tab's own bar: put me back. */
  | { type: 'return' }
  /** From a bar still in view: refresh its tab's hover-card screenshot. */
  | { type: 'seen' };

type ServerMessage = { type: 'snapshot'; snapshot: Snapshot };

/** The tab (and its window) a connected bar belongs to. */
interface ClientInfo {
  tabId: number;
  windowId: number;
}

/** Where a peeked tab came from, to put it back. */
interface PeekOrigin {
  windowId: number;
  index: number;
  groupId: number;
  pinned: boolean;
  url: string | undefined;
}

/** The dock's rectangle as a page measures it (CSS pixels, page zoom included). */
interface PeekDock {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The click that opened a peek: where it was on screen and in the page. */
interface PeekPoint {
  screenX: number;
  screenY: number;
  clientX: number;
  clientY: number;
}

/** What a page measures for a peek; the background turns it into screen bounds. */
interface PeekMeasures {
  dock: PeekDock;
  view: { width: number; height: number };
  point: PeekPoint;
}

/** A peek window's screen rectangle. */
interface PeekBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The background's live-peek store (background/peek.js). */
type Peeks = ReturnType<typeof import('../background/peek.js').createPeeks>;

/** A window as the hub sees it (background/hub.js). */
interface WindowState {
  tabs: chrome.tabs.Tab[];
  groups: chrome.tabGroups.TabGroup[];
  homes: Map<number, chrome.tabGroups.TabGroup | null>;
}
