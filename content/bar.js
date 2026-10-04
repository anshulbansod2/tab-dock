// @ts-check
// Mounts the bar into the page and connects state, rendering, events and the port.
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));
  const { HOST_ID, STORAGE_KEY, MSG } = ns.constants;

  ns.mountBar = ({ doc, runtime, storage, storageEvents, shadowMode }) => {
    if (doc.getElementById(HOST_ID)) return null; // already injected into this document
    const host = doc.createElement('div');
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: shadowMode });
    applyStyles(shadow, doc);
    const mount = doc.createElement('div');
    shadow.append(mount);
    const view = createView(mount);

    // Hidden tabs keep no bar DOM or snapshot; a fresh one arrives when the page is shown.
    const onVisibility = () => {
      if (doc.visibilityState !== 'visible') view.release();
    };
    const connection = ns.createConnection({
      runtime,
      doc,
      onSnapshot: view.setSnapshot,
      onOrphaned: () => {
        doc.removeEventListener('visibilitychange', onVisibility);
        host.remove();
      },
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
    return { host, connection };
  };

  /**
   * Holds the latest snapshot and collapsed flag; paints only once both are known so the bar
   * never flashes in the wrong state.
   * @param {HTMLElement} mount
   */
  function createView(mount) {
    /** @type {Snapshot | null} */
    let snapshot = null;
    /** @type {boolean | null} */
    let collapsed = null;
    const paint = () => {
      if (snapshot && collapsed !== null) ns.render(mount, { snapshot, collapsed });
    };
    return {
      /** @param {Snapshot} next */
      setSnapshot(next) {
        snapshot = next;
        paint();
      },
      /** @param {boolean} next */
      setCollapsed(next) {
        collapsed = next;
        paint();
      },
      isCollapsed: () => collapsed === true,
      release() {
        snapshot = null;
        mount.replaceChildren();
      },
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
