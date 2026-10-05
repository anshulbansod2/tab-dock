// @ts-check
// Shared constants and logger for the content scripts. Loaded first (see manifest.json).
(() => {
  const ns = (globalThis.TabDock ??= /** @type {TabDockNamespace} */ ({}));

  ns.constants = Object.freeze({
    /** Must equal background/constants.js MSG (tests/contract.test.js). */
    MSG: Object.freeze({
      HELLO: /** @type {const} */ ('hello'),
      SNAPSHOT: /** @type {const} */ ('snapshot'),
      ACTIVATE: /** @type {const} */ ('activate'),
      CLOSE: /** @type {const} */ ('close'),
      NEW: /** @type {const} */ ('new'),
    }),
    /** Custom tag (not an id) so page markup can't collide with or block the bar. */
    HOST_TAG: 'tab-dock-bar',
    STORAGE_KEY: 'tabDock.collapsed',
    POSITION_KEY: 'tabDock.position',
    UNGROUPED_LABEL: 'Ungrouped',
    NEUTRAL_COLOR: '#80868b',
    /** chrome.tabGroups.Color → the swatch Chrome draws for it. */
    GROUP_COLORS: Object.freeze({
      grey: '#5f6368',
      blue: '#1a73e8',
      red: '#d93025',
      yellow: '#f9ab00',
      green: '#188038',
      pink: '#d01884',
      purple: '#a142f4',
      cyan: '#007b83',
      orange: '#fa903e',
    }),
  });

  /** Identifies this injection; bars from an earlier (reloaded) extension instance differ. */
  ns.instance ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  const PREFIX = '[tab-dock]';
  ns.logger = Object.freeze({
    /** @param {...unknown} args */
    warn: (...args) => console.warn(PREFIX, ...args),
    /** @param {...unknown} args */
    error: (...args) => console.error(PREFIX, ...args),
  });
})();
