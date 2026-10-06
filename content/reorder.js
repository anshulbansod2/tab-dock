// @ts-check
// Drag a tab chip sideways to reorder the group's tabs. The other chips slide aside while
// dragging; dropping reorders the chips at once and asks the background to move the real tab.
// Pulling the chip well above the dock lifts it: group targets appear, and dropping on one
// moves the tab to that group instead.
(() => {
  const ns = (globalThis.TabDock ??= /** @type {TabDockNamespace} */ ({}));
  const DRAG_THRESHOLD_PX = 5;
  const LIFT_PX = 40; // this far above where the press started, the chip leaves the strip
  const DRAGGING = 'hh-chip--dragging';
  const LIFTED = 'hh-chip--lifted';

  /**
   * @typedef {object} ChipDrag
   * @property {HTMLElement} chip
   * @property {number} tabId
   * @property {HTMLElement[]} chips - in strip order, measured at press time
   * @property {DOMRect[]} boxes
   * @property {number} from - the dragged chip's position
   * @property {number} to - where it would land now
   * @property {number} startX
   * @property {number} startY
   * @property {boolean} moved
   * @property {boolean} lifted - showing group targets instead of reordering
   * @property {ClientMessage | null} picked - the group target under the pointer
   */

  ns.bindReorder = (mount, callbacks) => {
    /** @type {ChipDrag | null} */
    let drag = null;
    let swallowClick = false;

    /** @param {PointerEvent} event */
    function onDown(event) {
      swallowClick = false;
      drag = startDrag(event, mount);
    }

    function onUp() {
      if (!drag) return;
      const { moved, from, to, tabId, picked } = drag;
      finish();
      if (!moved) return;
      swallowClick = true;
      if (picked) callbacks.onDrop(picked);
      else if (to !== from) {
        placeChip(mount, from, to);
        callbacks.onMove(tabId, to);
      }
    }

    function finish() {
      if (drag?.lifted) callbacks.onLower();
      if (drag?.moved) {
        for (const chip of drag.chips) chip.style.removeProperty('transform');
        drag.chip.classList.remove(DRAGGING, LIFTED);
        callbacks.onDragEnd();
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

    const unlisten = listen(mount, [
      ['pointerdown', onDown],
      ['pointermove', (/** @type {PointerEvent} */ e) => drag && advance(drag, e, callbacks)],
      ['pointerup', onUp],
      ['pointercancel', finish],
      ['click', onClick, true], // capture: runs before activate
    ]);
    return {
      dispose() {
        finish();
        unlisten();
      },
    };
  };

  /**
   * @param {HTMLElement} target
   * @param {[string, (event: never) => void, boolean?][]} listeners
   * @returns {() => void} removes them all
   */
  function listen(target, listeners) {
    for (const [type, fn, capture] of listeners)
      target.addEventListener(type, /** @type {EventListener} */ (fn), capture);
    return () => {
      for (const [type, fn, capture] of listeners)
        target.removeEventListener(type, /** @type {EventListener} */ (fn), capture);
    };
  }

  /**
   * A press on a tab chip (primary button, more than one chip) may start a drag.
   * @param {PointerEvent} event
   * @param {HTMLElement} mount
   * @returns {ChipDrag | null}
   */
  function startDrag(event, mount) {
    const tab = event.target instanceof Element ? event.target.closest('.hh-tab') : null;
    const chip = tab?.closest('.hh-chip');
    if (!(tab instanceof HTMLElement) || !(chip instanceof HTMLElement) || event.button !== 0)
      return null;
    // Positions are in the dock's own group; another group's tabs, shown by the switcher, stay.
    if (chip.closest('[data-browsing]')) return null;
    const chips = /** @type {HTMLElement[]} */ ([...mount.querySelectorAll('.hh-chip')]);
    if (chips.length < 2) return null;
    const from = chips.indexOf(chip);
    const boxes = chips.map((c) => c.getBoundingClientRect());
    // Capture now: the first real move usually lands off the chip.
    if (event.pointerId !== undefined) tab.setPointerCapture?.(event.pointerId);
    return {
      ...{ chip, tabId: Number(tab.dataset.tabId), chips, boxes, from, to: from },
      ...{ startX: event.clientX, startY: event.clientY },
      ...{ moved: false, lifted: false, picked: null },
    };
  }

  /**
   * Follows the pointer: past the threshold the drag starts; above the dock the chip lifts
   * toward the group targets, otherwise it previews its new place in the strip.
   * @param {ChipDrag} drag
   * @param {PointerEvent} event
   * @param {ReorderCallbacks} callbacks
   */
  function advance(drag, event, callbacks) {
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY; // negative is upwards
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.chip.classList.add(DRAGGING);
      callbacks.onDragStart();
    }
    setLifted(drag, dy < -LIFT_PX, callbacks);
    if (drag.lifted) {
      drag.picked = callbacks.onPick(event.clientX, event.clientY);
      for (const chip of drag.chips) chip.style.removeProperty('transform');
      return;
    }
    drag.to = landingIndex(drag, dx);
    paintShifts(drag, dx);
  }

  /**
   * @param {ChipDrag} drag
   * @param {boolean} lifted
   * @param {ReorderCallbacks} callbacks
   */
  function setLifted(drag, lifted, callbacks) {
    if (lifted === drag.lifted) return;
    drag.lifted = lifted;
    drag.picked = null;
    drag.to = drag.from;
    drag.chip.classList.toggle(LIFTED, lifted);
    if (lifted) callbacks.onLift(drag.tabId);
    else callbacks.onLower();
  }

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
