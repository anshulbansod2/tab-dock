// @ts-check
// Messaging with the background. No connection is held open, so the service worker can sleep:
// a bar asks for a snapshot when it loads and whenever its page is shown, and the background
// pushes updates to every bar, hidden ones included, so a tab switch shows a current bar.
(() => {
  const ns = (globalThis.TabDock ??= /** @type {TabDockNamespace} */ ({}));
  const { MSG } = ns.constants;
  const CONTEXT_GONE = /Extension context invalidated/i;

  /**
   * @param {unknown} value
   * @returns {value is Snapshot}
   */
  const isSnapshot = (value) =>
    typeof value === 'object' &&
    value !== null &&
    Array.isArray(/** @type {Snapshot} */ (value).tabs);

  ns.createConnection = ({ onSnapshot, onOrphaned, runtime, doc }) => {
    let running = false;
    let orphaned = false;
    const isVisible = () => doc.visibilityState === 'visible';

    /** @param {ClientMessage} msg */
    const call = (msg) => sendSafely(runtime, msg, orphan);

    async function requestSnapshot() {
      if (!running) return;
      const reply = await call({ type: MSG.HELLO });
      if (running && isSnapshot(reply)) onSnapshot(reply);
    }

    /**
     * @param {unknown} raw
     * @param {chrome.runtime.MessageSender} sender
     */
    function onPush(raw, sender) {
      if (sender.id !== runtime.id) return;
      const msg = /** @type {Partial<ServerMessage> | null} */ (raw);
      if (msg?.type === MSG.SNAPSHOT && isSnapshot(msg.snapshot)) onSnapshot(msg.snapshot);
    }

    /** Catches up on anything missed while the service worker was asleep. */
    function onVisibility() {
      if (isVisible()) void requestSnapshot();
    }

    function orphan() {
      if (orphaned) return;
      orphaned = true;
      stop();
      onOrphaned();
    }

    function start() {
      if (running) return;
      running = true;
      doc.addEventListener('visibilitychange', onVisibility);
      runtime.onMessage.addListener(onPush);
      void requestSnapshot();
    }

    function stop() {
      if (!running) return;
      running = false;
      doc.removeEventListener('visibilitychange', onVisibility);
      try {
        runtime.onMessage.removeListener(onPush);
      } catch {
        // The extension context is already gone; its listeners went with it.
      }
    }

    return { start, stop, send: (msg) => void call(msg), request: call };
  };

  /**
   * Sends to the background; a reloaded or removed extension calls `onGone` instead of
   * throwing, and other failures are logged. Resolves to the reply, or null.
   * @param {typeof chrome.runtime} runtime
   * @param {ClientMessage} msg
   * @param {() => void} onGone
   * @returns {Promise<unknown>}
   */
  async function sendSafely(runtime, msg, onGone) {
    try {
      // runtime.id disappears once the extension is reloaded or removed.
      if (!runtime.id) throw new Error('Extension context invalidated.');
      return await runtime.sendMessage(msg);
    } catch (err) {
      if (!runtime.id || (err instanceof Error && CONTEXT_GONE.test(err.message))) onGone();
      else ns.logger.warn(`${msg.type} failed`, err);
      return null;
    }
  }
})();
