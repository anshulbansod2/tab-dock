// @ts-check
// Delegated mouse + keyboard handling. Bound once on the mount; survives every re-render.
(() => {
  const ns = (globalThis.TabDock ??= /** @type {TabDockNamespace} */ ({}));
  const MIDDLE_BUTTON = 1;

  ns.bindEvents = (mount, handlers) => {
    mount.addEventListener('click', (e) => onClick(e, handlers));
    mount.addEventListener('mousedown', onMouseDown);
    mount.addEventListener('auxclick', (e) => onAuxClick(e, handlers));
    mount.addEventListener('keydown', (e) => onKeyDown(e, handlers));
    mount.addEventListener('wheel', onWheel, { passive: false });
    // Sites bind shortcuts on keyup/keypress too; none of the bar's keystrokes should reach them.
    mount.addEventListener('keyup', stop);
    mount.addEventListener('keypress', stop);
  };

  /** @param {Event} event */
  const stop = (event) => event.stopPropagation();

  /**
   * @param {Event} event
   * @param {string} selector
   */
  function closest(event, selector) {
    return event.target instanceof Element ? event.target.closest(selector) : null;
  }

  /** @param {Element} el */
  const tabIdOf = (el) => Number(el.getAttribute('data-tab-id'));

  /**
   * @param {MouseEvent} event
   * @param {BarHandlers} h
   */
  function onClick(event, h) {
    const el = closest(event, '[data-action]');
    if (!el) return;
    const action = el.getAttribute('data-action');
    if (action === 'activate') h.onActivate(tabIdOf(el));
    else if (action === 'close') h.onClose(tabIdOf(el));
    else if (action === 'new') h.onNew();
    else if (action === 'collapse' || action === 'expand') h.onToggleCollapse();
  }

  /**
   * Mouse wheels scroll vertically; turn that into sideways scrolling of the tab strip so tabs
   * past the edge are reachable without a trackpad. Horizontal gestures stay native.
   * @param {WheelEvent} event
   */
  function onWheel(event) {
    const strip = closest(event, '.hh-tabs');
    if (!strip || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    if (strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft += event.deltaY;
    event.preventDefault(); // keep the page underneath from scrolling too
  }

  /**
   * Stops the browser's middle-click autoscroll so middle-click can mean "close".
   * @param {MouseEvent} event
   */
  function onMouseDown(event) {
    if (event.button === MIDDLE_BUTTON && closest(event, '.hh-chip')) event.preventDefault();
  }

  /**
   * @param {MouseEvent} event
   * @param {BarHandlers} h
   */
  function onAuxClick(event, h) {
    if (event.button !== MIDDLE_BUTTON) return;
    const tab = closest(event, '.hh-chip')?.querySelector('.hh-tab');
    if (!tab) return;
    event.preventDefault();
    h.onClose(tabIdOf(tab));
  }

  /**
   * @param {KeyboardEvent} event
   * @param {BarHandlers} h
   */
  function onKeyDown(event, h) {
    // The bar owns the keyboard while focused; don't let the page's shortcuts see it.
    stop(event);
    const tab = closest(event, '.hh-tab');
    if (!(tab instanceof HTMLElement)) return;
    // Enter/Space are left to the native <button>, which turns them into one click.
    switch (event.key) {
      case 'Delete':
        event.preventDefault();
        h.onClose(tabIdOf(tab));
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'Home':
      case 'End':
        event.preventDefault();
        moveFocus(tab, event.key);
        break;
      default:
    }
  }

  /**
   * Roving tabindex: exactly one tab is in the page's Tab order.
   * @param {HTMLElement} current
   * @param {string} key
   */
  function moveFocus(current, key) {
    const list = current.closest('[role="toolbar"]');
    const tabs = list ? [...list.querySelectorAll('.hh-tab')] : [];
    const i = tabs.indexOf(current);
    const step = key === 'ArrowRight' ? 1 : -1;
    let next = (i + step + tabs.length) % tabs.length;
    if (key === 'Home') next = 0;
    if (key === 'End') next = tabs.length - 1;
    const target = tabs[next];
    if (!(target instanceof HTMLElement)) return;
    current.tabIndex = -1;
    target.tabIndex = 0;
    target.focus();
  }
})();
