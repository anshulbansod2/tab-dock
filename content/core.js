// @ts-check
// Shared constants and logger for the content scripts. Loaded first (see manifest.json).
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));

  ns.constants = Object.freeze({
    /** Must equal background/constants.js PORT_NAME (tests/contract.test.js). */
    PORT_NAME: 'hover-helper',
    MSG: Object.freeze({
      SNAPSHOT: /** @type {const} */ ('snapshot'),
      ACTIVATE: /** @type {const} */ ('activate'),
      CLOSE: /** @type {const} */ ('close'),
      NEW: /** @type {const} */ ('new'),
    }),
    HOST_ID: 'hover-helper-root',
    STORAGE_KEY: 'hoverHelper.collapsed',
    TITLE_MAX_CHARS: 24,
    RECONNECT_DELAYS_MS: Object.freeze([100, 1000, 5000]),
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

  const PREFIX = '[hover-helper]';
  ns.logger = Object.freeze({
    /** @param {...unknown} args */
    warn: (...args) => console.warn(PREFIX, ...args),
    /** @param {...unknown} args */
    error: (...args) => console.error(PREFIX, ...args),
  });
})();
