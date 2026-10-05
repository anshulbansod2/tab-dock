// @ts-check
// Drag a tab chip sideways to reorder the group's tabs. The other chips slide aside while
// dragging; dropping reorders the chips at once and asks the background to move the real tab.
(() => {
  const ns = (globalThis.TabDock ??= /** @type {TabDockNamespace} */ ({}));
  const DRAG_THRESHOLD_PX = 5;
  const DRAGGING = 'hh-chip--dragging';

  /**
   * @typedef {object} ChipDrag
   * @property {HTMLElement} chip
   * @property {number} tabId
   * @property {HTMLElement[]} chips - in strip order, measured at press time
   * @property {DOMRect[]} boxes
   * @property {number} from - the dragged chip's position
   * @property {number} to - where it would land now
   * @property {number} startX
   * @property {boolean} moved
   */

  ns.bindReorder = (mount, { onMove, onDragStart, onDragEnd }) => {
    /** @type {ChipDrag | null} */
    let drag = null;
    let swallowClick = false;

    /** @param {PointerEvent} event */
    function onDown(event) {
      swallowClick = false;
      const tab = event.target instanceof Element ? event.target.closest('.hh-tab') : null;
      const chip = tab?.closest('.hh-chip');
      if (!(tab instanceof HTMLElement) || !(chip instanceof HTMLElement) || event.button !== 0)
        return;
      const chips = /** @type {HTMLElement[]} */ ([...mount.querySelectorAll('.hh-chip')]);
      if (chips.length < 2) return;
      const from = chips.indexOf(chip);
      const tabId = Number(tab.dataset.tabId);
      const boxes = chips.map((c) => c.getBoundingClientRect());
      drag = { chip, tabId, chips, boxes, from, to: from, startX: event.clientX, moved: false };
      // Capture now: the first real move usually lands off the chip.
      if (event.pointerId !== undefined) tab.setPointerCapture?.(event.pointerId);
    }

    /** @param {PointerEvent} event */
    function onPointerMove(event) {
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      if (!drag.moved) {
        drag.moved = true;
        drag.chip.classList.add(DRAGGING);
        onDragStart();
      }
      drag.to = landingIndex(drag, dx);
      paintShifts(drag, dx);
    }

    function onUp() {
      if (!drag) return;
      const { moved, from, to, tabId } = drag;
      finish();
      if (!moved) return;
      swallowClick = true;
      if (to !== from) {
        placeChip(mount, from, to);
        onMove(tabId, to);
      }
    }

    function finish() {
      if (drag?.moved) {
        for (const chip of drag.chips) chip.style.removeProperty('transform');
        drag.chip.classList.remove(DRAGGING);
        onDragEnd();
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
      ['pointermove', onPointerMove],
      ['pointerup', onUp],
      ['pointercancel', finish],
    ]);
    for (const [type, fn] of listeners)
      mount.addEventListener(type, /** @type {EventListener} */ (fn));
    mount.addEventListener('click', onClick, true); // capture: runs before activate
    return {
      dispose() {
        finish();
        for (const [type, fn] of listeners)
          mount.removeEventListener(type, /** @type {EventListener} */ (fn));
        mount.removeEventListener('click', onClick, true);
      },
    };
  };

  /**
   * Where the dragged chip lands: past every other chip whose midpoint its centre has crossed.
   * @param {ChipDrag} drag
   * @param {number} dx
   */
  function landingIndex(drag, dx) {
    const box = drag.boxes[drag.from];
    const centre = box.left + box.width / 2 + dx;
    let index = 0;
    drag.boxes.forEach((other, i) => {
      if (i !== drag.from && other.left + other.width / 2 < centre) index += 1;
    });
    return index;
  }

  /**
   * The dragged chip follows the pointer; chips between its old and new spot make room.
   * @param {ChipDrag} drag
   * @param {number} dx
   */
  function paintShifts(drag, dx) {
    const { boxes, from, to } = drag;
    const next = boxes[from + 1] ?? boxes[from - 1];
    const gap = next ? Math.abs(next.left - boxes[from].left) - boxes[from].width : 0;
    const room = boxes[from].width + gap;
    drag.chips.forEach((chip, i) => {
      let offset = 0;
      if (i === from) offset = dx;
      else if (from < to && i > from && i <= to) offset = -room;
      else if (to < from && i >= to && i < from) offset = room;
      if (offset) chip.style.setProperty('transform', `translateX(${offset}px)`);
      else chip.style.removeProperty('transform');
    });
  }

  /**
   * Moves the dropped chip to its new spot right away; the next snapshot confirms it.
   * @param {HTMLElement} mount
   * @param {number} from
   * @param {number} to
   */
  function placeChip(mount, from, to) {
    const chips = [...mount.querySelectorAll('.hh-chip')];
    const chip = chips[from];
    const rest = chips.filter((c) => c !== chip);
    const anchor = rest[to];
    if (anchor) anchor.before(chip);
    else rest[rest.length - 1]?.after(chip);
  }
})();
