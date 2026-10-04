// @ts-check
// Mounts the bar into the page and connects state, rendering, events and the port.
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));
  const { HOST_TAG, STORAGE_KEY, MSG } = ns.constants;

  ns.mountBar = ({ doc, runtime, storage, storageEvents, shadowMode }) => {
    const existing = /** @type {HTMLElement[]} */ ([...doc.getElementsByTagName(HOST_TAG)]);
    if (existing.some((el) => el.dataset.instance === ns.instance)) return null; // already mounted
    existing.forEach((el) => el.remove()); // left behind by a reloaded extension instance
    const host = doc.createElement(HOST_TAG);
    host.dataset.instance = ns.instance;
    const shadow = host.attachShadow({ mode: shadowMode });
    applyStyles(shadow, doc);
    const mount = doc.createElement('div');
    shadow.append(mount);
    const view = createView(mount);

    // Hidden tabs keep no bar DOM or snapshot; a fresh one arrives when the page is shown.
    const onVisibility = () => {
      if (doc.visibilityState !== 'visible') view.release();
    };
    const unmount = () => {
      view.dispose();
      connection.stop();
      doc.removeEventListener('visibilitychange', onVisibility);
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
      onToggleCollapse: () => persistCollapsed(storage, !view.isCollapsed(), view.setCollapsed),
    });
    syncCollapsed(storage, storageEvents, view.setCollapsed);

    doc.addEventListener('visibilitychange', onVisibility);
    doc.documentElement.append(host);
    connection.start();
    return { host, connection, unmount };
  };

  /**
   * Holds the latest snapshot and collapsed flag; paints only once both are known so the bar
   * never flashes in the wrong state. Paints are coalesced into the next animation frame, so a
   * burst of snapshots or collapse changes costs one render with the latest data.
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
    const paint = () => {
      frame = null;
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
      /** Drops data and any pending paint so a hidden page never shows a stale frame. */
      release() {
        cancel();
        snapshot = null;
        mount.replaceChildren();
      },
      dispose: cancel,
    };
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
  function persistCollapsed(storage, collapsed, apply) {
    apply(collapsed);
    storage
      .set({ [STORAGE_KEY]: collapsed })
      .catch((/** @type {unknown} */ err) => ns.logger.warn('saving collapsed state failed', err));
  }

  /**
   * @param {chrome.storage.StorageArea} storage
   * @param {typeof chrome.storage.onChanged} storageEvents
   * @param {(collapsed: boolean) => void} apply
   */
  function syncCollapsed(storage, storageEvents, apply) {
    storage
      .get(STORAGE_KEY)
      .then((items) => apply(items[STORAGE_KEY] === true))
      .catch((/** @type {unknown} */ err) => {
        ns.logger.warn('reading collapsed state failed', err);
        apply(false);
      });
    storageEvents.addListener((changes, area) => {
      if (area === 'local' && STORAGE_KEY in changes) apply(changes[STORAGE_KEY].newValue === true);
    });
  }
})();
