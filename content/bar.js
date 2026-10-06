// @ts-check
// Mounts the bar into the page and connects state, rendering, events and the port.
(() => {
  const ns = (globalThis.TabDock ??= /** @type {TabDockNamespace} */ ({}));
  const { HOST_TAG, STORAGE_KEY, MSG } = ns.constants;

  /**
   * The host is the one element page CSS can reach (shadow :host rules lose to page rules on
   * it). Reddit, for one, hides unregistered custom elements with :not(:defined), and content
   * scripts can't register ours, so its box is pinned inline with !important, which no page
   * stylesheet can override. Spans the bottom edge, as a top-layer popover or (fallback) a
   * fixed element; only the dock and pill take clicks.
   */
  const HOST_STYLE = /** @type {const} */ ([
    ['all', 'initial'],
    ['position', 'fixed'],
    ['inset', 'auto 0 0 0'],
    ['z-index', '2147483647'],
    ['display', 'block'],
    ['visibility', 'visible'],
    ['opacity', '1'],
    ['width', 'auto'],
    ['height', 'auto'],
    ['margin', '0'],
    ['padding', '0'],
    ['border', '0'],
    ['overflow', 'visible'],
    ['background', 'transparent'],
    ['pointer-events', 'none'],
  ]);

  const HEAL_LIMIT = 5;
  const HEAL_WINDOW_MS = 10_000;

  ns.mountBar = ({ doc, runtime, storage, storageEvents, shadowMode }) => {
    const existing = /** @type {HTMLElement[]} */ ([...doc.getElementsByTagName(HOST_TAG)]);
    if (existing.some((el) => el.dataset.instance === ns.instance)) return null; // already mounted
    existing.forEach((el) => el.remove()); // left behind by a reloaded extension instance
    const host = doc.createElement(HOST_TAG);
    host.dataset.instance = ns.instance;
    for (const [property, value] of HOST_STYLE)
      host.style.setProperty(property, value, 'important');
    const shadow = host.attachShadow({ mode: shadowMode });
    applyStyles(shadow, doc);
    const mount = doc.createElement('div');
    const layer = doc.createElement('div'); // menus and drop targets, outside the re-rendered tree
    layer.className = 'hh-layer';
    shadow.append(mount, layer);
    const view = createView(mount);
    /** @type {Pick<Connection, 'send' | 'request'>} */
    const port = { send: (m) => connection.send(m), request: (m) => connection.request(m) };
    const win = doc.defaultView ?? window;

    const drag = ns.bindDrag({ host, mount, win, storage, storageEvents });
    const moves = bindTabMoves({ mount, layer, win, view, ...port });
    const guard = guardHost(host, doc, { runtime, onStale: () => unmount() });
    const unmount = () => {
      guard.dispose();
      moves.dispose();
      drag.dispose();
      view.dispose();
      connection.stop();
      host.remove();
    };
    const connection = ns.createConnection({
      runtime,
      doc,
      onSnapshot: view.setSnapshot,
      onOrphaned: unmount,
    });
    ns.bindEvents(mount, {
      onActivate: (tabId) => port.send({ type: MSG.ACTIVATE, tabId }),
      onClose: (tabId) => port.send({ type: MSG.CLOSE, tabId }),
      onNew: () => port.send({ type: MSG.NEW }),
      onReturn: () => port.send({ type: MSG.RETURN }),
      onMove: moves.onMove,
      onMenu: moves.onMenu,
      onToggleCollapse: () =>
        void persistCollapsed(storage, !view.isCollapsed(), view.setCollapsed),
    });
    void syncCollapsed(storage, storageEvents, view.setCollapsed);

    guard.start(); // attaches the host and shows it in the top layer
    animateEntrance(host);
    connection.start();
    return { host, connection, unmount };
  };

  /**
   * Some pages tidy up elements they didn't create (removing them, or closing every open
   * popover), which made the bar vanish until a reload. The bar puts itself back, but at
   * most HEAL_LIMIT times per HEAL_WINDOW_MS so it never fights a page that insists, and
   * never once it is stale (see isSuperseded): then it unmounts instead.
   * @param {HTMLElement} host
   * @param {Document} doc
   * @param {{ runtime: typeof chrome.runtime, onStale: () => void }} options
   */
  function guardHost(host, doc, { runtime, onStale }) {
    /** @type {number[]} */
    let heals = [];
    const allowed = () => {
      const now = Date.now();
      heals = heals.filter((t) => now - t < HEAL_WINDOW_MS);
      if (heals.length >= HEAL_LIMIT) return false;
      heals.push(now);
      return true;
    };
    const attach = () => {
      doc.documentElement.append(host);
      showInTopLayer(host);
      // Watch the document too, in case the page swaps out <html> itself (re-observing the
      // same node is a no-op).
      observer.observe(doc, { childList: true });
      observer.observe(doc.documentElement, { childList: true });
    };
    const stale = () => {
      if (!isSuperseded(host, doc, runtime)) return false;
      onStale();
      return true;
    };
    const observer = new MutationObserver(() => {
      if (host.isConnected || stale() || !allowed()) return;
      ns.logger.warn('page removed the bar; restoring it');
      attach();
    });
    // After giving up, coming back to the tab is a fresh chance.
    const onVisible = () => {
      if (doc.visibilityState !== 'visible' || host.isConnected || stale()) return;
      heals = [];
      attach();
    };
    /** @param {Event} event */
    const onToggle = (event) => {
      const closed = /** @type {ToggleEvent} */ (event).newState === 'closed';
      if (!closed || !host.isConnected || !host.hasAttribute('popover')) return;
      if (stale() || !allowed()) return;
      ns.logger.warn('page closed the bar; reopening it');
      reopen(host);
    };
    return {
      start() {
        attach();
        host.addEventListener('toggle', onToggle);
        doc.addEventListener('visibilitychange', onVisible);
      },
      dispose() {
        observer.disconnect();
        host.removeEventListener('toggle', onToggle);
        doc.removeEventListener('visibilitychange', onVisible);
      },
    };
  }

  /**
   * A bar is stale once its extension was reloaded or removed (Chrome clears runtime.id, but
   * the old content script keeps running), or once a newer instance's bar is on the page; a
   * stale bar putting itself back would leave two bars stacked.
   * @param {HTMLElement} host
   * @param {Document} doc
   * @param {typeof chrome.runtime} runtime
   */
  function isSuperseded(host, doc, runtime) {
    if (!runtime.id) return true;
    return [...doc.getElementsByTagName(HOST_TAG)].some(
      (el) => el !== host && /** @type {HTMLElement} */ (el).dataset.instance !== ns.instance,
    );
  }

  /**
   * Shows the closed popover again. Unlike the first show, a failure keeps the popover
   * attribute: Chrome (since the popover API's revision) ignores showing an open popover, so
   * a quick close-and-reopen is harmless, and an older engine that throws here is better off
   * still owning its top-layer slot. (No :popover-open check: jsdom's selector engine runs
   * out of memory evaluating it on Linux, which crashed CI.)
   * @param {HTMLElement} host
   */
  function reopen(host) {
    try {
      host.showPopover();
    } catch (err) {
      ns.logger.warn('reopening failed', err);
    }
  }

  /**
   * Reordering by drag, moving tabs between groups by the tab menu or by lifting a chip onto
   * a group target, and the hover card that opens a tab in a mini window. The card has a
   * layer of its own: the menu and drop targets replace their layer's children.
   * @param {{ mount: HTMLElement, layer: HTMLElement, win: Window,
   *   view: ReturnType<typeof createView>, send: (message: ClientMessage) => void,
   *   request: Connection['request'] }} deps
   */
  function bindTabMoves({ mount, layer, win, view, send, request }) {
    const cards = layer.ownerDocument.createElement('div');
    cards.className = 'hh-layer';
    layer.after(cards);
    const preview = ns.bindPreview({
      mount,
      layer: cards,
      win,
      request,
      onPeek: (tabId, measures) => send({ type: MSG.PEEK, tabId, ...measures }),
    });
    const fresh = ns.keepPreviewFresh({ doc: layer.ownerDocument, send });
    const menu = ns.createGroupMenu({ layer, win, send });
    const drop = ns.createGroupDrop({ layer });
    /** @param {number} tabId @param {number} toIndex */
    const onMove = (tabId, toIndex) => send({ type: MSG.MOVE, tabId, toIndex });
    const reorder = ns.bindReorder(mount, {
      onMove,
      onDragStart: () => {
        menu.close();
        view.hold(true);
      },
      onDragEnd: () => view.hold(false),
      onLift: (tabId) => {
        const snapshot = view.current();
        const dock = mount.querySelector('.hh-bar')?.getBoundingClientRect();
        const chip = mount.querySelector(`.hh-tab[data-tab-id="${tabId}"]`)?.closest('.hh-chip');
        const ghost = chip ? /** @type {HTMLElement} */ (chip.cloneNode(true)) : undefined;
        ghost?.classList.remove('hh-chip--dragging', 'hh-chip--lifted');
        if (snapshot && dock) drop.show({ snapshot, tabId, dock, ghost });
      },
      onPick: drop.pick,
      onLower: drop.hide,
      onDrop: send,
    });
    return {
      onMove,
      /** @type {BarHandlers['onMenu']} */
      onMenu(tabId, point, tab) {
        preview.hide();
        const snapshot = view.current();
        if (snapshot) menu.open({ tabId, point, snapshot, returnFocus: tab });
      },
      dispose() {
        preview.dispose();
        fresh.dispose();
        reorder.dispose();
        menu.dispose();
        drop.hide();
      },
    };
  }

  /**
   * Holds the latest snapshot and collapsed flag; paints only once both are known so the bar
   * never flashes in the wrong state. Paints are coalesced into the next animation frame, so a
   * burst of snapshots or collapse changes costs one render with the latest data. While held
   * (a chip is being dragged) nothing paints; the latest data paints on release.
   * @param {HTMLElement} mount
   * @param {(callback: FrameRequestCallback) => number} [requestFrame]
   * @param {(handle: number) => void} [cancelFrame]
   */
  function createView(
    mount,
    requestFrame = requestAnimationFrame,
    cancelFrame = cancelAnimationFrame,
  ) {
    /** @type {Snapshot | null} */
    let snapshot = null;
    /** @type {boolean | null} */
    let collapsed = null;
    /** @type {number | null} */
    let frame = null;
    let held = false;
    let stale = false;
    const paint = () => {
      frame = null;
      if (held) {
        stale = true;
        return;
      }
      stale = false;
      if (snapshot && collapsed !== null) ns.render(mount, { snapshot, collapsed });
    };
    const schedule = () => {
      frame ??= requestFrame(paint);
    };
    const cancel = () => {
      if (frame !== null) cancelFrame(frame);
      frame = null;
    };
    return {
      /** @param {Snapshot} next */
      setSnapshot(next) {
        snapshot = next;
        schedule();
      },
      /** @param {boolean} next */
      setCollapsed(next) {
        collapsed = next;
        schedule();
      },
      isCollapsed: () => collapsed === true,
      current: () => snapshot,
      /** @param {boolean} next */
      hold(next) {
        held = next;
        if (!held && stale) schedule();
      },
      dispose: cancel,
    };
  }

  /**
   * A manual popover renders in the top layer: above any page z-index and unaffected by a
   * transform or filter on <html>. Without the API the host stays a fixed-position element
   * (no polyfill: extensions can't load remote code).
   * @param {HTMLElement} host - must already be connected
   */
  function showInTopLayer(host) {
    if (!('popover' in HTMLElement.prototype) || typeof host.showPopover !== 'function') return;
    host.setAttribute('popover', 'manual');
    try {
      host.showPopover();
    } catch (err) {
      host.removeAttribute('popover'); // a closed popover is display:none
      ns.logger.warn('top layer unavailable', err);
    }
  }

  /**
   * Slides the dock up once when it first appears; re-renders never replay it. Runs through the
   * Web Animations API because the host's inline styles would override a :host animation.
   * @param {HTMLElement} host
   */
  function animateEntrance(host) {
    if (typeof host.animate !== 'function') return;
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    host.animate(
      [
        { transform: 'translateY(16px)', opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  }

  /**
   * Constructable stylesheets are exempt from page CSP; fall back to <style> where they are
   * unavailable (older engines, test DOMs).
   * @param {ShadowRoot} shadow
   * @param {Document} doc
   */
  function applyStyles(shadow, doc) {
    if ('adoptedStyleSheets' in shadow && 'replaceSync' in CSSStyleSheet.prototype) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(ns.styles);
      shadow.adoptedStyleSheets = [sheet];
      return;
    }
    const style = doc.createElement('style');
    style.textContent = ns.styles;
    shadow.append(style);
  }

  /**
   * Applies the change locally first so the UI responds instantly, then persists it; other
   * tabs pick it up through storage.onChanged.
   * @param {chrome.storage.StorageArea} storage
   * @param {boolean} collapsed
   * @param {(collapsed: boolean) => void} apply
   */
  async function persistCollapsed(storage, collapsed, apply) {
    apply(collapsed);
    try {
      await storage.set({ [STORAGE_KEY]: collapsed });
    } catch (err) {
      ns.logger.warn('saving collapsed state failed', err);
    }
  }

  /**
   * @param {chrome.storage.StorageArea} storage
   * @param {typeof chrome.storage.onChanged} storageEvents
   * @param {(collapsed: boolean) => void} apply
   */
  async function syncCollapsed(storage, storageEvents, apply) {
    storageEvents.addListener((changes, area) => {
      if (area === 'local' && STORAGE_KEY in changes) apply(changes[STORAGE_KEY].newValue === true);
    });
    try {
      const items = await storage.get(STORAGE_KEY);
      apply(items[STORAGE_KEY] === true);
    } catch (err) {
      ns.logger.warn('reading collapsed state failed', err);
      apply(false);
    }
  }
})();
