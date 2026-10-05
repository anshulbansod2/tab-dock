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
    shadow.append(mount);
    const view = createView(mount);

    const drag = ns.bindDrag({
      host,
      mount,
      win: doc.defaultView ?? window,
      storage,
      storageEvents,
    });
    const reorder = ns.bindReorder(mount, {
      onMove: (tabId, toIndex) => connection.send({ type: MSG.MOVE, tabId, toIndex }),
      onDragStart: () => view.hold(true),
      onDragEnd: () => view.hold(false),
    });
    const unmount = () => {
      reorder.dispose();
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
      onActivate: (tabId) => connection.send({ type: MSG.ACTIVATE, tabId }),
      onClose: (tabId) => connection.send({ type: MSG.CLOSE, tabId }),
      onNew: () => connection.send({ type: MSG.NEW }),
      onMove: (tabId, toIndex) => connection.send({ type: MSG.MOVE, tabId, toIndex }),
      onToggleCollapse: () =>
        void persistCollapsed(storage, !view.isCollapsed(), view.setCollapsed),
    });
    void syncCollapsed(storage, storageEvents, view.setCollapsed);

    doc.documentElement.append(host);
    showInTopLayer(host);
    animateEntrance(host);
    connection.start();
    return { host, connection, unmount };
  };

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
