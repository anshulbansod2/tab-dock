// @ts-check
// Re-renders the bar for each snapshot while preserving keyboard focus and tab-list scroll.
(() => {
  const ns = (globalThis.TabDock ??= /** @type {TabDockNamespace} */ ({}));

  /** Collapsing focuses the pill and expanding focuses the collapse button. */
  const TOGGLE_PARTNER = Object.freeze(
    /** @type {Record<string, string>} */ ({ collapse: 'expand', expand: 'collapse' }),
  );

  /** @typedef {{ action: string, tabId: string | null, groupId: string | null }} FocusKey */

  ns.render = (mount, view) => {
    const focus = focusKey(mount);
    const previousScroll = mount.querySelector('.hh-tabs')?.scrollLeft;
    const wasShown = shownSwatch(mount);
    const root = document.createElement('div');
    root.className = 'hh-root';
    root.append(dockFor(view));
    reuseFavicons(mount, root);
    reuseSwatches(mount, root);
    mount.replaceChildren(root);
    restoreFocus(mount, focus);
    if (!view.collapsed && !view.snapshot.peek) restoreScroll(mount, previousScroll);
    slideIfSwitched(mount, wasShown);
  };

  /**
   * The shown group's place among the swatches (-1: no switcher).
   * @param {HTMLElement} mount
   */
  function shownSwatch(mount) {
    return [...mount.querySelectorAll('.hh-swatch')].findIndex((s) => s.hasAttribute('data-shown'));
  }

  /**
   * When the switcher shows another group, its tabs slide in from that group's side. Scripted,
   * not CSS, so other re-renders never replay it.
   * @param {HTMLElement} mount
   * @param {number} was - the previously shown swatch
   */
  function slideIfSwitched(mount, was) {
    const now = shownSwatch(mount);
    const list = mount.querySelector('.hh-list');
    if (was < 0 || now < 0 || was === now || typeof list?.animate !== 'function') return;
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    list.animate(
      [
        { opacity: 0, transform: `translateX(${now > was ? 10 : -10}px)` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  }

  /** @param {BarView} view - a peeked tab's dock is only ever its Return button */
  function dockFor(view) {
    if (view.snapshot.peek) return ns.dom.buildPeekBar(view);
    return view.collapsed ? ns.dom.buildPill(view) : ns.dom.buildBar(view);
  }

  /**
   * Moves already-decoded favicon <img>s from the previous render into the new tree when the
   * tab and image are unchanged, so re-renders never blank and re-decode the icons.
   * @param {HTMLElement} mount - previous render
   * @param {HTMLElement} next - new tree, not yet attached
   */
  function reuseFavicons(mount, next) {
    /** @param {Element} img */
    const keyOf = (img) =>
      `${img.closest('[data-tab-id]')?.getAttribute('data-tab-id')}|${img.getAttribute('src')}`;
    const previous = new Map(
      [...mount.querySelectorAll('img.hh-favicon')].map((img) => [keyOf(img), img]),
    );
    for (const img of next.querySelectorAll('img.hh-favicon')) {
      const old = previous.get(keyOf(img));
      if (old) img.replaceWith(old);
    }
  }

  /**
   * Moves the previous render's group swatches into the new tree, given the new attributes.
   * The switcher re-renders as the pointer moves along it; a swatch replaced under the pointer
   * would lose its hover and a click begun on it.
   * @param {HTMLElement} mount - previous render
   * @param {HTMLElement} next - new tree, not yet attached
   */
  function reuseSwatches(mount, next) {
    const previous = new Map(
      [...mount.querySelectorAll('.hh-swatch')].map((s) => [s.getAttribute('data-group-id'), s]),
    );
    for (const swatch of next.querySelectorAll('.hh-swatch')) {
      const old = previous.get(swatch.getAttribute('data-group-id'));
      if (!old) continue;
      for (const name of old.getAttributeNames()) old.removeAttribute(name);
      for (const name of swatch.getAttributeNames())
        old.setAttribute(name, /** @type {string} */ (swatch.getAttribute(name)));
      swatch.replaceWith(old);
    }
  }

  /**
   * @param {HTMLElement} mount
   * @returns {FocusKey | null}
   */
  function focusKey(mount) {
    const active = /** @type {Document | ShadowRoot} */ (mount.getRootNode()).activeElement;
    if (!active || !mount.contains(active)) return null;
    const action = active.getAttribute('data-action');
    if (!action) return null;
    const groupId = active.getAttribute('data-group-id');
    return { action, tabId: active.getAttribute('data-tab-id'), groupId };
  }

  /**
   * @param {HTMLElement} mount
   * @param {FocusKey | null} key
   */
  function restoreFocus(mount, key) {
    if (!key) return;
    let selector = `[data-action="${TOGGLE_PARTNER[key.action] ?? key.action}"]`;
    if (key.tabId) selector = `[data-action="${key.action}"][data-tab-id="${key.tabId}"]`;
    else if (key.groupId)
      selector = `[data-action="${key.action}"][data-group-id="${key.groupId}"]`;
    const target = mount.querySelector(selector);
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  }

  /**
   * Keeps the user's horizontal scroll position; on first render, centres the active tab.
   * @param {HTMLElement} mount
   * @param {number | undefined} previous
   */
  function restoreScroll(mount, previous) {
    const list = mount.querySelector('.hh-tabs');
    if (!list) return;
    if (previous !== undefined) {
      list.scrollLeft = previous;
      return;
    }
    const active = list.querySelector('[aria-current="page"]');
    if (!active) return;
    const listBox = list.getBoundingClientRect();
    const tabBox = active.getBoundingClientRect();
    list.scrollLeft += tabBox.left - listBox.left - (listBox.width - tabBox.width) / 2;
  }
})();
