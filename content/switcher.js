// @ts-check
// The group switcher: pointing at a group's swatch shows that group's tabs in the dock; clicking
// a tab (or the swatch, for the group's last-used tab) goes there. Looking changes nothing in
// Chrome, and the dock goes back to its own group once the pointer leaves it.
(() => {
  const ns = (globalThis.TabDock ??= /** @type {TabDockNamespace} */ ({}));
  const { MSG } = ns.constants;
  const UNGROUPED = -1;
  const LEAVE_MS = 350; // a pointer that slips off the dock for a moment keeps the group
  const STEPS = /** @type {Record<string, number>} */ ({ ArrowLeft: -1, ArrowRight: 1 });

  ns.bindSwitcher = (deps) => {
    const browser = createBrowser(deps);
    const unlisten = listen(deps, browser);
    return {
      refresh: browser.refresh,
      dispose() {
        browser.cancel();
        unlisten();
      },
    };
  };

  /**
   * What the dock browses, and going there.
   * @param {SwitcherDeps} deps
   */
  function createBrowser({ mount, view, request, send }) {
    /** @type {number | null} the group asked for or shown; null: the dock's own */
    let wanted = null;
    const own = () => view.own()?.group?.id ?? UNGROUPED;
    /** @param {number} groupId */
    const fetchGroup = async (groupId) =>
      /** @type {GroupView | null} */ (await request({ type: MSG.GROUP, groupId }));

    const back = () => {
      wanted = null;
      if (view.browsing()) view.setBrowse(null);
    };

    /** @param {number} groupId @param {number} [keepWidth] - set when refreshing */
    async function show(groupId, keepWidth) {
      if (groupId === own()) return back();
      if (groupId === wanted && keepWidth === undefined) return;
      // Measured before the first switch only: the dock keeps that width while browsing.
      const width =
        keepWidth ??
        view.browsing()?.width ??
        mount.querySelector('.hh-bar')?.getBoundingClientRect().width;
      wanted = groupId;
      const found = await fetchGroup(groupId);
      if (wanted !== groupId) return; // the pointer moved on before the reply
      if (found && width) view.setBrowse({ view: found, width });
      else back();
    }

    /** @param {number} groupId */
    async function go(groupId) {
      if (groupId === own()) return back();
      const browsed = view.browsing()?.view;
      const target = browsed?.group?.id === groupId ? browsed : await fetchGroup(groupId);
      if (target) send({ type: MSG.ACTIVATE, tabId: target.lastId });
    }

    /** A new snapshot: the browsed group's tabs may have changed too. */
    function refresh() {
      const browsing = view.browsing();
      if (browsing) void show(browsing.view.group?.id ?? UNGROUPED, browsing.width);
    }

    let leaving = /** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined);
    return {
      own,
      back,
      go,
      refresh,
      /** @param {number} groupId */
      show(groupId) {
        clearTimeout(leaving);
        void show(groupId);
      },
      /** @param {number} ms */
      later(ms) {
        clearTimeout(leaving);
        if (wanted !== null) leaving = setTimeout(back, ms);
      },
      cancel: () => clearTimeout(leaving),
    };
  }

  /** @param {Event} event */
  const swatchOf = (event) =>
    event.target instanceof Element ? event.target.closest('.hh-swatch') : null;
  /** @param {Element} swatch */
  const idOf = (swatch) => Number(swatch.getAttribute('data-group-id'));

  /**
   * Only a pointer that moves picks a group: Chrome also sends hover events when the page
   * lays out afresh under a still pointer (a reload, a re-render), which must not switch it.
   * @param {PointerEvent} event
   */
  const moved = (event) => event.movementX !== 0 || event.movementY !== 0;

  /**
   * Pointer, keyboard and page-visibility wiring.
   * @param {SwitcherDeps} deps
   * @param {ReturnType<typeof createBrowser>} browser
   * @returns {() => void} removes the listeners
   */
  function listen({ mount, areas, doc, leaveMs = LEAVE_MS }, browser) {
    /** @type {Array<[EventTarget, string, (event: Event) => void]>} */
    const bindings = [
      [
        mount,
        'pointermove',
        (e) => {
          const swatch = swatchOf(e);
          if (swatch && moved(/** @type {PointerEvent} */ (e))) browser.show(idOf(swatch));
        },
      ],
      [mount, 'click', (e) => onClick(e)],
      [mount, 'keydown', (e) => onKey(/** @type {KeyboardEvent} */ (e))],
      [doc, 'visibilitychange', () => doc.visibilityState === 'hidden' && browser.back()],
      ...areas.flatMap((area) => [
        /** @type {[EventTarget, string, () => void]} */ ([
          area,
          'pointerleave',
          () => browser.later(leaveMs),
        ]),
        /** @type {[EventTarget, string, () => void]} */ ([area, 'pointerenter', browser.cancel]),
      ]),
    ];

    /** @param {Event} event */
    function onClick(event) {
      const swatch = swatchOf(event);
      if (swatch) void browser.go(idOf(swatch));
      else if (event.target instanceof Element && event.target.closest('[data-action="back"]'))
        browser.back();
    }

    /** @param {KeyboardEvent} event */
    function onKey(event) {
      const swatch = swatchOf(event);
      if (!swatch) return;
      const all = /** @type {HTMLElement[]} */ ([...mount.querySelectorAll('.hh-swatch')]);
      const step = STEPS[event.key];
      if (event.key === 'Escape') {
        browser.back();
        all.find((s) => idOf(s) === browser.own())?.focus();
      } else if (step) {
        const next =
          all[(all.indexOf(/** @type {HTMLElement} */ (swatch)) + step + all.length) % all.length];
        next.focus();
        browser.show(idOf(next));
      } else return;
      event.preventDefault();
    }

    for (const [target, type, fn] of bindings) target.addEventListener(type, fn);
    return () => {
      for (const [target, type, fn] of bindings) target.removeEventListener(type, fn);
    };
  }
})();
