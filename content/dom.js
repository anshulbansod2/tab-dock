// @ts-check
// Element builders. Every piece of tab data goes through textContent/attributes, never HTML.
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));

  /**
   * @template {keyof HTMLElementTagNameMap} K
   * @param {K} tag
   * @param {string} className
   * @param {string} [text]
   * @returns {HTMLElementTagNameMap[K]}
   */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /**
   * @param {string} className
   * @param {string} text
   * @param {string} label
   * @param {string} action
   */
  function button(className, text, label, action) {
    const node = el('button', `hh-btn ${className}`, text);
    node.type = 'button';
    node.setAttribute('aria-label', label);
    node.dataset.action = action;
    return node;
  }

  function placeholderIcon() {
    const node = el('span', 'hh-favicon hh-favicon--placeholder');
    node.setAttribute('aria-hidden', 'true');
    return node;
  }

  /** @param {string | null} url */
  function favicon(url) {
    const safe = ns.safeFavicon(url);
    if (!safe) return placeholderIcon();
    const img = el('img', 'hh-favicon');
    img.alt = '';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.replaceWith(placeholderIcon()), { once: true });
    img.src = safe;
    return img;
  }

  /**
   * @param {BarTab} tab
   * @param {boolean} focusable
   */
  function chip(tab, focusable) {
    const item = el('li', 'hh-chip');
    // A native button: Enter/Space activate it and its text (the full title) is its name.
    const tabEl = el('button', 'hh-tab');
    tabEl.type = 'button';
    if (tab.active) tabEl.setAttribute('aria-current', 'page');
    tabEl.setAttribute('aria-keyshortcuts', 'Delete');
    tabEl.tabIndex = focusable ? 0 : -1;
    tabEl.title = tab.title; // mouse tooltip for the visually truncated title
    tabEl.dataset.action = 'activate';
    tabEl.dataset.tabId = String(tab.id);
    tabEl.append(favicon(tab.favIconUrl), el('span', 'hh-title', tab.title));
    const close = button('hh-close', '×', `Close ${tab.title}`, 'close');
    close.dataset.tabId = String(tab.id);
    close.tabIndex = -1; // keyboard users close with Delete on the focused tab
    item.append(tabEl, close);
    return item;
  }

  /**
   * A toolbar of tab buttons with one Tab stop (roving tabindex); not a tablist, as there are
   * no tab panels.
   * @param {BarTab[]} tabs
   * @param {string} label
   */
  function tabList(tabs, label) {
    const toolbar = el('div', 'hh-tabs');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', `Tabs in ${label}`);
    const focusIndex = Math.max(
      0,
      tabs.findIndex((t) => t.active),
    );
    const list = el('ul', 'hh-list');
    list.append(...tabs.map((tab, i) => chip(tab, i === focusIndex)));
    toolbar.append(list);
    return toolbar;
  }

  /** @param {string} label */
  function groupLabel(label) {
    const node = el('div', 'hh-label');
    node.append(el('span', 'hh-dot'), el('span', '', label));
    return node;
  }

  /** @param {BarView} view */
  function buildBar({ snapshot }) {
    const label = ns.groupLabel(snapshot.group);
    const bar = el('div', 'hh-bar');
    bar.style.setProperty('--hh-group', ns.groupColor(snapshot.group));
    const collapse = button('hh-collapse', '⌄', 'Collapse tab bar', 'collapse');
    collapse.setAttribute('aria-expanded', 'true');
    bar.append(
      groupLabel(label),
      tabList(snapshot.tabs, label),
      button('hh-new', '+', `New tab in ${label}`, 'new'),
      collapse,
    );
    return bar;
  }

  /** @param {BarView} view */
  function buildPill({ snapshot }) {
    const count = snapshot.tabs.length;
    const pill = el('button', 'hh-pill');
    pill.type = 'button';
    pill.dataset.action = 'expand';
    pill.setAttribute('aria-expanded', 'false');
    pill.setAttribute(
      'aria-label',
      `Show tab bar: ${count} tabs in ${ns.groupLabel(snapshot.group)}`,
    );
    pill.style.setProperty('--hh-group', ns.groupColor(snapshot.group));
    pill.append(el('span', 'hh-dot'), el('span', '', String(count)));
    return pill;
  }

  ns.dom = Object.freeze({ buildBar, buildPill });
})();
