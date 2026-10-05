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
}

type ClientMessage =
  | { type: 'hello' }
  | { type: 'activate'; tabId: number }
  | { type: 'close'; tabId: number }
  | { type: 'new' }
  /** toIndex is a position within the sender's group (or among the ungrouped tabs). */
  | { type: 'move'; tabId: number; toIndex: number };

type ServerMessage = { type: 'snapshot'; snapshot: Snapshot };

/** The tab (and its window) a connected bar belongs to. */
interface ClientInfo {
  tabId: number;
  windowId: number;
}
