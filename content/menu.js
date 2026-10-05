// @ts-check
// Right-click (or Shift+F10) menu on a tab chip: move the tab to another of the window's groups,
// a new group or out of its group, or close it. Rendered in its own layer of the shadow root, so
// bar re-renders never tear it down mid-use.
(() => {
  const ns = (globalThis.TabDock ??= /** @type {TabDockNamespace} */ ({}));
  const { MSG } = ns.constants;
  const EDGE_PX = 8;
  const UNGROUPED_ID = -1;

  /**
   * @typedef {object} MenuItem
   * @property {string} label
   * @property {ClientMessage} message
   * @property {BarGroup} [group] - drawn with the group's colour dot
   */

  ns.createGroupMenu = ({ layer, win, send }) => {
    /** @type {HTMLElement | null} */
    let current = null;
    /** @type {HTMLElement | null} */
    let returnFocus = null;

    function close({ refocus = false } = {}) {
      if (!current) return;
      current = null;
      layer.replaceChildren();
      if (refocus) returnFocus?.focus({ preventScroll: true });
      returnFocus = null;
    }
    const dismiss = () => close();

    /** @param {MenuOpenOptions} options */
    function open({ tabId, point, snapshot, returnFocus: opener }) {
      close();
      const tab = snapshot.tabs.find((t) => t.id === tabId);
      const menu = buildMenu(menuItems(tabId, snapshot), tab?.title ?? '', (message) => {
        close({ refocus: true });
        send(message);
      });
      menu.addEventListener('keydown', (event) => onKeyDown(event, menu, close));
      for (const type of ['keyup', 'keypress']) menu.addEventListener(type, stop);
      const backdrop = document.createElement('div');
      backdrop.className = 'hh-backdrop';
      backdrop.addEventListener('pointerdown', dismiss);
      backdrop.addEventListener('contextmenu', (event) => event.preventDefault());
      layer.replaceChildren(backdrop, menu);
      current = menu;
      returnFocus = opener;
      place(menu, point, win);
      /** @type {HTMLElement | null} */ (menu.querySelector('[role="menuitem"]'))?.focus();
    }

    win.addEventListener('blur', dismiss);
    win.addEventListener('resize', dismiss);
    return {
      open,
      close: dismiss,
      isOpen: () => current !== null,
      dispose() {
        close();
        win.removeEventListener('blur', dismiss);
        win.removeEventListener('resize', dismiss);
      },
    };
  };

  /** @param {Event} event */
  const stop = (event) => event.stopPropagation();

  /**
   * @param {number} tabId
   * @param {Snapshot} snapshot
   * @returns {MenuItem[]}
   */
  function menuItems(tabId, snapshot) {
    const own = snapshot.group?.id;
    /** @type {MenuItem[]} */
    const items = snapshot.groups
      .filter((group) => group.id !== own)
      .map((group) => ({ label: group.title, group, message: regroup(tabId, group.id) }));
    items.push({ label: 'New group', message: { type: MSG.NEW_GROUP, tabId } });
    if (snapshot.group)
      items.push({ label: 'Remove from group', message: regroup(tabId, UNGROUPED_ID) });
    items.push({ label: 'Close tab', message: { type: MSG.CLOSE, tabId } });
    return items;
  }

  /**
   * @param {number} tabId
   * @param {number} groupId
   * @returns {ClientMessage}
   */
  const regroup = (tabId, groupId) => ({ type: MSG.REGROUP, tabId, groupId });

  /**
   * @param {MenuItem[]} items
   * @param {string} title - the tab's title, naming the menu
   * @param {(message: ClientMessage) => void} choose
   */
  function buildMenu(items, title, choose) {
    const menu = document.createElement('div');
    menu.className = 'hh-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', title);
    for (const { label, message, group } of items) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'hh-menu-item';
      item.setAttribute('role', 'menuitem');
      item.tabIndex = -1;
      if (group) {
        item.style.setProperty('--hh-group', ns.groupColor(group));
        const dot = document.createElement('span');
        dot.className = 'hh-dot';
        item.append(dot);
      }
      const text = document.createElement('span');
      text.textContent = label;
      item.append(text);
      item.addEventListener('click', () => choose(message));
      menu.append(item);
    }
    return menu;
  }

  /**
   * @param {KeyboardEvent} event
   * @param {HTMLElement} menu
   * @param {(options: { refocus: boolean }) => void} close
   */
  function onKeyDown(event, menu, close) {
    event.stopPropagation(); // the page's shortcuts never see menu keys
    const items = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('[role="menuitem"]')]);
    const active = /** @type {ShadowRoot | Document} */ (menu.getRootNode()).activeElement;
    const i = items.indexOf(/** @type {HTMLElement} */ (active));
    /** @type {Record<string, number>} */
    const targets = {
      ArrowDown: (i + 1) % items.length,
      ArrowUp: (i - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close({ refocus: true });
    } else if (event.key in targets) {
      event.preventDefault();
      items[targets[event.key]]?.focus();
    }
  }

  /**
   * Opens above the pointer (the dock usually sits at the bottom), kept inside the window.
   * @param {HTMLElement} menu
   * @param {{ x: number, y: number }} point
   * @param {Window} win
   */
  function place(menu, point, win) {
    const { width, height } = menu.getBoundingClientRect();
    const left = Math.min(Math.max(EDGE_PX, point.x), win.innerWidth - width - EDGE_PX);
    const above = point.y - height - EDGE_PX;
    const top = above >= EDGE_PX ? above : Math.min(point.y + EDGE_PX, win.innerHeight - height);
    menu.style.setProperty('left', `${Math.max(EDGE_PX, left)}px`);
    menu.style.setProperty('top', `${Math.max(EDGE_PX, top)}px`);
  }
})();
