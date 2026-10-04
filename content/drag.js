// @ts-check
// Lets the user drag the dock anywhere by its group name (or the collapsed pill) (Alt+arrows from the keyboard). The
// spot is stored as viewport fractions, shared by every site, and dropping the dock near its
// default bottom-centre spot snaps it home.
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));
  const { POSITION_KEY } = ns.constants;
  const DRAG_THRESHOLD_PX = 4;
  const KEY_STEP_PX = 16;
  const SNAP_HOME_PX = 32;
  /** What the user grabs: the group name, or the whole pill when collapsed. */
  const HANDLE = '.hh-label, .hh-pill';
  /** Gap between the default dock and the bottom edge; matches .hh-root's padding. */
  const HOME_GAP_PX = 12;
  /** @type {Readonly<Record<string, [number, number]>>} */
  const ARROWS = Object.freeze({
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  });

  /** @param {number} value */
  const clamp01 = (value) => Math.min(1, Math.max(0, value));

  ns.placement = Object.freeze({
    toFraction: (point, box, viewport) => ({
      x: clamp01(point.left / Math.max(1, viewport.width - box.width)),
      y: clamp01(point.top / Math.max(1, viewport.height - box.height)),
    }),
    toPixels: (fraction, box, viewport) => ({
      left: Math.round(clamp01(fraction.x) * Math.max(0, viewport.width - box.width)),
      top: Math.round(clamp01(fraction.y) * Math.max(0, viewport.height - box.height)),
    }),
  });

  /**
   * @param {unknown} value
   * @returns {value is Placement}
   */
  const isPlacement = (value) =>
    typeof value === 'object' &&
    value !== null &&
    Number.isFinite(/** @type {Placement} */ (value).x) &&
    Number.isFinite(/** @type {Placement} */ (value).y);

  ns.bindDrag = ({ host, mount, win, storage, storageEvents }) => {
    const pos = createPositioner(host, mount, win);
    const pointer = createPointerDrag(mount, pos);
    /** @param {KeyboardEvent} event */
    const onKeyDown = (event) => {
      if (!event.altKey || !(event.target instanceof Element) || !event.target.closest(HANDLE))
        return;
      if (event.key === 'Home') pos.save(null);
      else if (event.key in ARROWS) {
        const [dx, dy] = ARROWS[event.key];
        pos.nudge(dx * KEY_STEP_PX, dy * KEY_STEP_PX);
      } else return;
      event.preventDefault();
    };
    /** @type {Parameters<typeof chrome.storage.onChanged.addListener>[0]} */
    const onStorage = (changes, area) => {
      if (area === 'local' && POSITION_KEY in changes) pos.set(changes[POSITION_KEY].newValue);
    };
    const observer = new MutationObserver(() => pos.apply()); // re-clamp to the new dock size
    observer.observe(mount, { childList: true });
    mount.addEventListener('keydown', onKeyDown);
    win.addEventListener('resize', pos.apply);
    storageEvents.addListener(onStorage);
    pos.persist = (placement) => void persist(storage, placement);
    void load(storage, pos);
    return {
      dispose() {
        pointer.dispose();
        observer.disconnect();
        mount.removeEventListener('keydown', onKeyDown);
        win.removeEventListener('resize', pos.apply);
        storageEvents.removeListener(onStorage);
        pos.set = () => {};
      },
    };
  };

  /**
   * Owns the host's placement: applies a stored fraction as pixels, and turns a dropped pixel
   * position back into a fraction (or "home").
   * @param {HTMLElement} host
   * @param {HTMLElement} mount
   * @param {Window} win
   */
  function createPositioner(host, mount, win) {
    /** @type {Placement | null} */
    let placement = null;
    const viewport = () => ({ width: win.innerWidth, height: win.innerHeight });
    const dockBox = () =>
      (mount.querySelector('.hh-bar, .hh-pill') ?? host).getBoundingClientRect();

    /** @param {number} left @param {number} top */
    function place(left, top) {
      host.setAttribute('data-placed', '');
      host.style.setProperty('inset', 'auto', 'important');
      host.style.setProperty('left', `${left}px`, 'important');
      host.style.setProperty('top', `${top}px`, 'important');
    }

    function home() {
      host.removeAttribute('data-placed');
      host.style.removeProperty('left');
      host.style.removeProperty('top');
      host.style.setProperty('inset', 'auto 0 0 0', 'important');
    }

    function apply() {
      if (!placement) return home();
      const { left, top } = ns.placement.toPixels(placement, dockBox(), viewport());
      return place(left, top);
    }

    /** @param {number} left @param {number} top */
    function isNearHome(left, top) {
      const box = dockBox();
      const { width, height } = viewport();
      const homeLeft = (width - box.width) / 2;
      const homeTop = height - HOME_GAP_PX - box.height;
      return Math.hypot(left - homeLeft, top - homeTop) <= SNAP_HOME_PX;
    }

    const self = {
      apply,
      /** Moves the dock to a pixel spot, kept on screen (live, while dragging). */
      moveTo(/** @type {number} */ left, /** @type {number} */ top) {
        const box = dockBox();
        const clamped = ns.placement.toPixels(
          ns.placement.toFraction({ left, top }, box, viewport()),
          box,
          viewport(),
        );
        place(clamped.left, clamped.top);
      },
      /** Stores where the dock ended up, or "home" when it was dropped near its default spot. */
      commit() {
        const box = dockBox();
        self.save(
          isNearHome(box.left, box.top) ? null : ns.placement.toFraction(box, box, viewport()),
        );
      },
      nudge(/** @type {number} */ dx, /** @type {number} */ dy) {
        const box = dockBox();
        self.moveTo(box.left + dx, box.top + dy);
        self.save(ns.placement.toFraction(dockBox(), dockBox(), viewport()));
      },
      /** @param {Placement | null} next */
      save(next) {
        self.set(next);
        self.persist(next);
      },
      /** @param {unknown} next */
      set(next) {
        placement = isPlacement(next) ? next : null;
        apply();
      },
      /** Replaced by bindDrag with the storage writer. @param {Placement | null} _next */
      persist(_next) {},
      dockBox,
    };
    return self;
  }

  /**
   * Pointer dragging on the group name or pill. A press that moves less than the threshold stays a
   * click (collapse); a real drag swallows the click that follows its pointerup.
   * @param {HTMLElement} mount
   * @param {ReturnType<typeof createPositioner>} pos
   */
  function createPointerDrag(mount, pos) {
    /** @type {{ x: number, y: number, left: number, top: number, moved: boolean } | null} */
    let drag = null;
    let swallowClick = false;

    /** @param {PointerEvent} event */
    function onDown(event) {
      swallowClick = false;
      const handle = event.target instanceof Element && event.target.closest(HANDLE);
      if (!handle || event.button !== 0) return;
      const box = pos.dockBox();
      drag = { x: event.clientX, y: event.clientY, left: box.left, top: box.top, moved: false };
      // Capture now: the first real move usually lands off the small handle, on the page.
      if (event.pointerId !== undefined) handle.setPointerCapture?.(event.pointerId);
    }

    /** @param {PointerEvent} event */
    function onMove(event) {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      pos.moveTo(drag.left + dx, drag.top + dy);
    }

    function onUp() {
      if (drag?.moved) {
        swallowClick = true;
        pos.commit();
      }
      drag = null;
    }

    /** @param {MouseEvent} event */
    function onClick(event) {
      if (!swallowClick) return;
      swallowClick = false;
      event.stopImmediatePropagation();
      event.preventDefault();
    }

    const listeners = /** @type {const} */ ([
      ['pointerdown', onDown],
      ['pointermove', onMove],
      ['pointerup', onUp],
      ['pointercancel', onUp],
    ]);
    for (const [type, fn] of listeners)
      mount.addEventListener(type, /** @type {EventListener} */ (fn));
    mount.addEventListener('click', onClick, true); // capture: runs before the collapse handler
    return {
      dispose() {
        for (const [type, fn] of listeners)
          mount.removeEventListener(type, /** @type {EventListener} */ (fn));
        mount.removeEventListener('click', onClick, true);
        drag = null;
      },
    };
  }

  /**
   * @param {chrome.storage.StorageArea} storage
   * @param {ReturnType<typeof createPositioner>} pos
   */
  async function load(storage, pos) {
    try {
      const items = await storage.get(POSITION_KEY);
      pos.set(items[POSITION_KEY]);
    } catch (err) {
      ns.logger.warn('reading bar position failed', err);
    }
  }

  /**
   * @param {chrome.storage.StorageArea} storage
   * @param {Placement | null} placement
   */
  async function persist(storage, placement) {
    try {
      await storage.set({ [POSITION_KEY]: placement });
    } catch (err) {
      ns.logger.warn('saving bar position failed', err);
    }
  }
})();
