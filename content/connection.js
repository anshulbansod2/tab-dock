// @ts-check
// Port lifecycle. A bar holds a port only while its page is visible, so the service worker
// serves just the bars a user can see; every (re)connect yields a fresh snapshot.
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));
  const { PORT_NAME, MSG, RECONNECT_DELAYS_MS } = ns.constants;

  ns.createConnection = ({ onSnapshot, onOrphaned, runtime, doc }) => {
    /** @type {chrome.runtime.Port | null} */
    let port = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    let attempt = 0;
    let running = false;

    function connect() {
      if (!running || port || doc.visibilityState !== 'visible') return;
      // runtime.id disappears once the extension is reloaded or removed.
      if (!runtime.id) {
        orphan();
        return;
      }
      try {
        port = runtime.connect({ name: PORT_NAME });
      } catch {
        orphan();
        return;
      }
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(onDisconnect);
    }

    /** @param {unknown} raw */
    function onMessage(raw) {
      attempt = 0;
      const msg = /** @type {Partial<ServerMessage> | null} */ (raw);
      if (msg?.type === MSG.SNAPSHOT && msg.snapshot) onSnapshot(msg.snapshot);
    }

    function onDisconnect() {
      port = null;
      if (!running) return;
      const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
      attempt += 1;
      clearTimeout(timer);
      timer = setTimeout(connect, delay);
    }

    function disconnect() {
      clearTimeout(timer);
      port?.disconnect();
      port = null;
    }

    function onVisibility() {
      if (doc.visibilityState === 'visible') connect();
      else disconnect();
    }

    function orphan() {
      stop();
      onOrphaned();
    }

    function start() {
      if (running) return;
      running = true;
      doc.addEventListener('visibilitychange', onVisibility);
      connect();
    }

    function stop() {
      running = false;
      doc.removeEventListener('visibilitychange', onVisibility);
      disconnect();
    }

    /** @param {ClientMessage} msg */
    function send(msg) {
      if (!port) return;
      try {
        port.postMessage(msg);
      } catch (err) {
        ns.logger.warn('send failed; reconnecting', err);
        onDisconnect();
      }
    }

    return { start, stop, send };
  };
})();
