// @ts-check
// Hover cards: rest the pointer on a tab chip and a card shows that tab as it last looked
// (Chrome lets an extension capture only the visible tab, so the picture is from the last time
// the tab was on screen). Clicking the card makes it live: the real tab moves into a mini
// window placed where the card was.
(() => {
  const ns = (globalThis.TabDock ??= /** @type {TabDockNamespace} */ ({}));
  const { MSG } = ns.constants;
  const HOVER_MS = 250;
  const LEAVE_MS = 150; // off the card: the user is done with it
  const FRESH_MS = 30_000;
  const REACH_MS = 400; // from the chip to the card, across the dock edge and the gap
  const CARD = { width: 480, edge: 8 }; // as wide as the screenshot
  const PEEK = { minHeight: 160, titleBar: 28 };

  ns.bindPreview = ({ mount, ...deps }) => {
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let opening; // hover delay before a chip's card shows
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let closing; // grace before the card goes once the pointer leaves
    /** @type {Element | null} */
    let target = null; // the chip under the pointer, so moves within it don't restart the wait
    const card = createCard({
      ...deps,
      onEnter: () => clearTimeout(closing),
      onLeave: (event) => leaving(event, LEAVE_MS),
    });

    function hide() {
      clearTimeout(opening);
      clearTimeout(closing);
      target = null;
      card.close();
    }

    /** @param {Event} event */
    function onOver(event) {
      const chip = event.target instanceof Element ? event.target.closest('.hh-chip') : null;
      clearTimeout(closing); // still on the dock
      if (chip === target) return; // moving within the chip: keep its wait running
      clearTimeout(opening);
      if (!(chip instanceof HTMLElement) || !previewable(chip)) {
        if (card.el())
          closing = setTimeout(hide, REACH_MS); // maybe heading for the card
        else hide();
        return;
      }
      target = chip;
      opening = setTimeout(() => void card.open(chip, hide), HOVER_MS);
    }

    /** @param {MouseEvent} event @param {number} [delay] */
    function leaving(event, delay = REACH_MS) {
      const to = event.relatedTarget;
      if (to instanceof Node && (mount.contains(to) || card.el()?.contains(to))) return;
      clearTimeout(opening);
      clearTimeout(closing);
      closing = setTimeout(hide, delay);
    }

    const listeners = /** @type {const} */ ([
      ['pointerover', onOver],
      ['pointerout', /** @type {EventListener} */ (leaving)],
      ['pointerdown', hide], // switching, dragging or a menu: no card
    ]);
    for (const [type, listener] of listeners) mount.addEventListener(type, listener);
    return {
      hide,
      dispose() {
        hide();
        for (const [type, listener] of listeners) mount.removeEventListener(type, listener);
      },
    };
  };

  /**
   * The card itself: asks the background for the tab's last screenshot, shows it by the chip,
   * and opens the tab live when clicked. Replies to a closed or superseded card are dropped.
   * @param {{ layer: HTMLElement, win: Window, request: Connection['request'],
   *   onPeek: (tabId: number, bounds: PeekBounds) => void, now?: () => number,
   *   onEnter: () => void, onLeave: (event: MouseEvent) => void }} deps
   */
  function createCard({ layer, win, request, onPeek, now = Date.now, onEnter, onLeave }) {
    /** @type {HTMLElement | null} */
    let shown = null;
    let pending = 0; // id of the card the next reply belongs to
    const close = () => {
      pending += 1;
      shown = null;
      layer.replaceChildren();
    };
    return {
      close,
      el: () => shown,
      /** @param {HTMLElement} chip @param {() => void} hide */
      async open(chip, hide) {
        const tab = /** @type {HTMLElement} */ (chip.querySelector('.hh-tab'));
        const tabId = Number(tab.dataset.tabId);
        const ticket = ++pending;
        const reply = await request({ type: MSG.PREVIEW, tabId });
        if (ticket !== pending) return; // the pointer moved on meanwhile
        const el = buildCard(tab.title, reply, now());
        el.addEventListener('pointerover', onEnter);
        el.addEventListener('pointerout', onLeave);
        el.addEventListener('click', () => {
          const bounds = peekBounds(dock.getBoundingClientRect(), win);
          hide();
          onPeek(tabId, bounds);
        });
        layer.replaceChildren(el);
        const dock = chip.closest('.hh-bar') ?? chip;
        place(el, chip.getBoundingClientRect(), dock.getBoundingClientRect(), win);
        shown = el;
      },
    };
  }

  /**
   * Screenshots can only be taken of the tab on screen, so while this page is in view (and its
   * window focused) it asks for a fresh one now and then; a hover card elsewhere then shows it
   * close to how it is now. A hidden or background page sends nothing.
   */
  ns.keepPreviewFresh = ({ doc, send, everyMs = FRESH_MS }) => {
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    const tick = () => {
      if (doc.visibilityState === 'visible' && doc.hasFocus()) send({ type: MSG.SEEN });
      timer = setTimeout(tick, everyMs);
    };
    timer = setTimeout(tick, everyMs);
    return { dispose: () => clearTimeout(timer) };
  };

  /** Neither the current tab nor one already out in a mini window. @param {HTMLElement} chip */
  const previewable = (chip) =>
    !chip.querySelector('[aria-current="page"]') && !chip.classList.contains('hh-chip--away');

  /**
   * @param {string} title
   * @param {unknown} reply - `{ image, at }` from the background, or null
   * @param {number} now
   */
  function buildCard(title, reply, now) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'hh-card';
    card.setAttribute('aria-label', `Open ${title} live`);
    const { image, at } = /** @type {{ image?: unknown, at?: unknown }} */ (reply ?? {});
    const safe = typeof image === 'string' ? ns.safeFavicon(image) : null;
    if (safe) {
      const img = document.createElement('img');
      img.className = 'hh-card-image';
      img.alt = '';
      img.src = safe;
      card.append(img);
    } else {
      const empty = document.createElement('span');
      empty.className = 'hh-card-image hh-card-empty';
      empty.textContent = 'No preview yet: open the tab once to capture it';
      card.append(empty);
    }
    const caption = document.createElement('span');
    caption.className = 'hh-card-caption';
    const name = document.createElement('span');
    name.className = 'hh-card-title';
    name.textContent = title;
    const meta = document.createElement('span');
    meta.className = 'hh-card-meta';
    meta.textContent =
      safe && typeof at === 'number'
        ? `Seen ${ago(now - at)} · click to open live`
        : 'Click to open live';
    caption.append(name, meta);
    card.append(caption);
    return card;
  }

  /** @param {number} ms */
  function ago(ms) {
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    return `${Math.floor(minutes / 60)} h ago`;
  }

  /**
   * Attached to the dock: flush with its edge facing the larger part of the page (growing up
   * from a dock at the bottom), centred on the chip and kept inside the window. A card above
   * is pinned by its bottom so its height never has to be known.
   * @param {HTMLElement} card
   * @param {Pick<DOMRect, 'left' | 'width'>} chip
   * @param {Pick<DOMRect, 'top' | 'bottom'>} dock
   * @param {Window} win
   */
  function place(card, chip, dock, win) {
    const above = dock.top > win.innerHeight - dock.bottom;
    const centre = chip.left + chip.width / 2 - CARD.width / 2;
    const left = Math.min(Math.max(CARD.edge, centre), win.innerWidth - CARD.width - CARD.edge);
    card.dataset.side = above ? 'above' : 'below';
    card.style.setProperty('left', `${Math.round(left)}px`);
    if (above) card.style.setProperty('bottom', `${Math.round(win.innerHeight - dock.top)}px`);
    else card.style.setProperty('top', `${Math.round(dock.bottom)}px`);
  }

  /**
   * Screen bounds for the live window: its page exactly as wide as the dock, in the window's
   * own shape (no taller than the room left), resting on the dock's edge facing the page with
   * its title bar on the far side; kept on screen.
   * @param {Pick<DOMRect, 'left' | 'width' | 'top' | 'bottom'>} dock
   * @param {Window} win
   * @returns {PeekBounds}
   */
  function peekBounds(dock, win) {
    const above = dock.top > win.innerHeight - dock.bottom;
    const room = (above ? dock.top : win.innerHeight - dock.bottom) - CARD.edge;
    const shape = Math.round((dock.width * win.innerHeight) / win.innerWidth);
    const page = Math.max(PEEK.minHeight, Math.min(room, shape));
    const pageTop = above ? dock.top - page : dock.bottom;
    const chromeLeft = Math.max(0, (win.outerWidth - win.innerWidth) / 2);
    const chromeTop = Math.max(0, win.outerHeight - win.innerHeight);
    const width = Math.round(dock.width);
    const height = page + PEEK.titleBar;
    let left = Math.round(win.screenX + chromeLeft + dock.left);
    let top = Math.round(win.screenY + chromeTop + pageTop - PEEK.titleBar);
    const {
      availLeft = 0,
      availTop = 0,
      availWidth,
      availHeight,
    } = /** @type {Screen & { availLeft?: number, availTop?: number }} */ (win.screen);
    if (availWidth > 0 && availHeight > 0) {
      left = Math.min(Math.max(availLeft, left), availLeft + availWidth - width);
      top = Math.min(Math.max(availTop, top), availTop + availHeight - height);
    }
    return { left, top, width, height };
  }
})();
