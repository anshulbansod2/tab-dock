// @ts-check
// Re-renders the bar for each snapshot while preserving keyboard focus and tab-list scroll.
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));

  /** Collapsing focuses the pill and expanding focuses the collapse button. */
  const TOGGLE_PARTNER = Object.freeze(
    /** @type {Record<string, string>} */ ({ collapse: 'expand', expand: 'collapse' }),
  );

  /** @typedef {{ action: string, tabId: string | null }} FocusKey */

  ns.render = (mount, view) => {
    const focus = focusKey(mount);
    const previousScroll = mount.querySelector('[role="tablist"]')?.scrollLeft;
    const root = document.createElement('div');
    root.className = 'hh-root';
    root.append(view.collapsed ? ns.dom.buildPill(view) : ns.dom.buildBar(view));
    mount.replaceChildren(root);
    restoreFocus(mount, focus);
    if (!view.collapsed) restoreScroll(mount, previousScroll);
  };

  /**
   * @param {HTMLElement} mount
   * @returns {FocusKey | null}
   */
  function focusKey(mount) {
    const active = /** @type {Document | ShadowRoot} */ (mount.getRootNode()).activeElement;
    if (!active || !mount.contains(active)) return null;
    const action = active.getAttribute('data-action');
    return action ? { action, tabId: active.getAttribute('data-tab-id') } : null;
  }

  /**
   * @param {HTMLElement} mount
   * @param {FocusKey | null} key
   */
  function restoreFocus(mount, key) {
    if (!key) return;
    const selector = key.tabId
      ? `[data-action="${key.action}"][data-tab-id="${key.tabId}"]`
      : `[data-action="${TOGGLE_PARTNER[key.action] ?? key.action}"]`;
    const target = mount.querySelector(selector);
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  }

  /**
   * Keeps the user's horizontal scroll position; on first render, centres the active tab.
   * @param {HTMLElement} mount
   * @param {number | undefined} previous
   */
  function restoreScroll(mount, previous) {
    const list = mount.querySelector('[role="tablist"]');
    if (!list) return;
    if (previous !== undefined) {
      list.scrollLeft = previous;
      return;
    }
    const active = list.querySelector('[aria-selected="true"]');
    if (!active) return;
    const listBox = list.getBoundingClientRect();
    const tabBox = active.getBoundingClientRect();
    list.scrollLeft += tabBox.left - listBox.left - (listBox.width - tabBox.width) / 2;
  }
})();
