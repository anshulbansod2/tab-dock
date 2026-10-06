// @ts-check
// The toolbar popup: the dock for the current window's active tab, for pages that can't show
// one (chrome://, the New Tab page, the Web Store). It renders with the content scripts' own
// modules and acts through the background's, calling Chrome directly instead of messaging.
import { handleAction } from '../background/actions.js';
import { MSG } from '../background/constants.js';
import { createFavicons } from '../background/favicons.js';
import { buildGroupView, buildSnapshot } from '../background/tabModel.js';

/** What the popup's dock can do; the rest needs a page under the dock. */
/** @type {Set<string>} */
const ACTIONS = new Set([MSG.ACTIVATE, MSG.CLOSE, MSG.NEW, MSG.MOVE]);
const REFRESH_MS = 50; // a burst of tab events (closing several tabs) costs one rebuild

/** In the popup the dock is the whole page: no glass over a page, no collapsing. */
const POPUP_CSS = `
html, body { margin: 0; }
/* A fixed width: Chrome sizes popups to content, but chips shrink rather than ask for room.
   Wider than the dock's narrow-window layout (max-width: 520px), which drops the group name. */
body { width: 640px; color-scheme: light dark; background: light-dark(#f3f4f6, #26272b); }
.hh-popup .hh-root { padding: 8px; }
.hh-popup .hh-bar { max-width: none; box-shadow: none; }
.hh-popup .hh-label { pointer-events: none; }
`;

/**
 * @param {object} deps
 * @param {typeof chrome} deps.api
 * @param {Document} deps.doc
 * @param {() => void} deps.close - closes the popup
 * @param {Pick<ReturnType<typeof createFavicons>, 'inline'>} [deps.favicons]
 */
export async function startPopup({ api, doc, close, favicons = createFavicons({ api }) }) {
  const ns = /** @type {TabDockNamespace} */ (globalThis.TabDock);
  const mount = doc.createElement('div');
  mount.className = 'hh-popup';
  const style = doc.createElement('style');
  style.textContent = ns.styles + POPUP_CSS;
  doc.head.append(style);
  doc.body.append(mount);
  const view = ns.createView(mount);
  view.setCollapsed(false);
  const state = createState({ api, favicons });
  /** @param {ClientMessage} msg */
  const send = (msg) => void act(msg);
  /** @param {ClientMessage} msg */
  async function act(msg) {
    const client = state.client();
    if (!client || !ACTIONS.has(msg.type)) return;
    await handleAction(/** @type {Parameters<typeof handleAction>[0]} */ (msg), client, api);
    if (msg.type === MSG.ACTIVATE || msg.type === MSG.NEW) close();
  }
  const switcher = ns.bindSwitcher({
    mount,
    areas: [mount],
    view,
    request: state.request,
    send,
    doc,
  });
  ns.bindEvents(mount, handlersFor(send));
  const load = async () => {
    const snapshot = await state.snapshot();
    if (!snapshot) return close(); // no tab to show a dock for
    view.setSnapshot(snapshot);
    switcher.refresh();
  };
  const unfollow = follow(api, load);
  await load();
  focusCurrent(mount);
  return {
    dispose() {
      unfollow();
      switcher.dispose();
      view.dispose();
    },
  };
}

/**
 * The tab the popup stands in for, its snapshot, and other groups' tabs.
 * @param {{ api: typeof chrome, favicons: Pick<ReturnType<typeof createFavicons>, 'inline'> }} deps
 */
function createState({ api, favicons }) {
  /** @type {ClientInfo | null} */
  let client = null;
  const windowOf = async (/** @type {number} */ windowId) =>
    Promise.all([api.tabs.query({ windowId }), api.tabGroups.query({ windowId })]);
  return {
    client: () => client,
    /** @returns {Promise<Snapshot | null>} */
    async snapshot() {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) return null;
      client = { tabId: tab.id, windowId: tab.windowId };
      const [tabs, groups] = await windowOf(tab.windowId);
      return favicons.inline(buildSnapshot({ tabs, groups, tabId: tab.id }), tabs);
    },
    /** @param {ClientMessage} msg @returns {Promise<GroupView | null>} */
    async request(msg) {
      if (!client || msg.type !== MSG.GROUP) return null;
      const [tabs, groups] = await windowOf(client.windowId);
      const view = buildGroupView({ tabs, groups, groupId: msg.groupId });
      return view && favicons.inline(view, tabs);
    },
  };
}

/**
 * The dock's handlers, minus what needs a page under it: collapsing, the tab menu, Return.
 * @param {(msg: ClientMessage) => void} send
 * @returns {BarHandlers}
 */
function handlersFor(send) {
  const none = () => {};
  return {
    onActivate: (tabId) => send({ type: MSG.ACTIVATE, tabId }),
    onClose: (tabId) => send({ type: MSG.CLOSE, tabId }),
    onNew: () => send({ type: MSG.NEW }),
    onMove: (tabId, toIndex) => send({ type: MSG.MOVE, tabId, toIndex }),
    onToggleCollapse: none,
    onMenu: none,
    onReturn: none,
  };
}

/**
 * Rebuilds while open as tabs and groups change (a tab closed from the popup, say).
 * @param {typeof chrome} api
 * @param {() => Promise<unknown>} load
 * @returns {() => void} stops following
 */
function follow(api, load) {
  let timer = /** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined);
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void load(), REFRESH_MS);
  };
  const { tabs, tabGroups } = api;
  const events = [
    ...[tabs.onCreated, tabs.onRemoved, tabs.onUpdated, tabs.onMoved, tabs.onActivated],
    ...[tabs.onAttached, tabs.onDetached, tabGroups.onCreated, tabGroups.onUpdated],
    tabGroups.onRemoved,
  ];
  for (const event of events) event.addListener(schedule);
  return () => {
    clearTimeout(timer);
    for (const event of events) event.removeListener(schedule);
  };
}

/**
 * Keyboard first: the popup opens on its shortcut, so the current tab takes focus once
 * painted, ready for the arrow keys and Enter.
 * @param {HTMLElement} mount
 */
function focusCurrent(mount) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      /** @type {HTMLElement | null} */ (mount.querySelector('[aria-current="page"]'))?.focus(),
    ),
  );
}
