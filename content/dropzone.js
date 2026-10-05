// @ts-check
// Drop targets for moving a tab to another group by dragging: a row of group-colour dots that
// appears above the dock when a chip is lifted off it, with a copy of the chip under the
// pointer (the chip strip clips its own chips). Positions are computed, not measured, so
// hit-testing works the same everywhere.
(() => {
  const ns = (globalThis.TabDock ??= /** @type {TabDockNamespace} */ ({}));
  const { MSG, UNGROUPED_LABEL } = ns.constants;
  const SIZE_PX = 30;
  const GAP_PX = 12;
  const RISE_PX = 56; // from the dock's top edge to the row's centre
  const HIT_SLOP_PX = 8;
  const HINT = 'Drop on a group';

  /**
   * @typedef {object} DropTarget
   * @property {string} label
   * @property {ClientMessage} message
   * @property {string} color
   * @property {string} [glyph]
   * @property {number} x - centre
   * @property {number} y - centre
   * @property {HTMLElement} [el]
   */

  ns.createGroupDrop = ({ layer }) => {
    /** @type {DropTarget[]} */
    let targets = [];
    /** @type {HTMLElement | null} */
    let label = null;
    /** @type {HTMLElement | null} */
    let ghost = null;

    /** @param {Parameters<GroupDrop['show']>[0]} options */
    function show({ snapshot, tabId, dock, ghost: copy }) {
      targets = layOut(targetsFor(snapshot, tabId), dock);
      for (const target of targets) target.el = buildTarget(target);
      label = document.createElement('div');
      label.className = 'hh-drop-label';
      label.textContent = HINT;
      label.style.setProperty('left', `${dock.left + dock.width / 2}px`);
      label.style.setProperty('top', `${dock.top - RISE_PX - SIZE_PX}px`);
      layer.replaceChildren(...targets.map((t) => /** @type {HTMLElement} */ (t.el)), label);
      ghost = copy ?? null;
      if (ghost) {
        ghost.classList.add('hh-drop-ghost');
        layer.append(ghost);
      }
    }

    /**
     * The target under the pointer, highlighted and named, or null.
     * @param {number} x
     * @param {number} y
     * @returns {ClientMessage | null}
     */
    function pick(x, y) {
      const reach = SIZE_PX / 2 + HIT_SLOP_PX;
      const hit = targets.find((t) => Math.hypot(t.x - x, t.y - y) <= reach) ?? null;
      for (const t of targets) t.el?.classList.toggle('hh-drop-target--hot', t === hit);
      if (label) label.textContent = hit ? hit.label : HINT;
      ghost?.style.setProperty('left', `${x}px`);
      ghost?.style.setProperty('top', `${y}px`);
      return hit ? hit.message : null;
    }

    function hide() {
      targets = [];
      label = null;
      ghost = null;
      layer.replaceChildren();
    }

    return { show, pick, hide };
  };

  /**
   * @param {Snapshot} snapshot
   * @param {number} tabId
   * @returns {Omit<DropTarget, 'x' | 'y'>[]}
   */
  function targetsFor(snapshot, tabId) {
    const own = snapshot.group?.id;
    /** @type {Omit<DropTarget, 'x' | 'y'>[]} */
    const list = snapshot.groups
      .filter((group) => group.id !== own)
      .map((group) => ({
        label: group.title,
        color: ns.groupColor(group),
        message: { type: MSG.REGROUP, tabId, groupId: group.id },
      }));
    if (snapshot.group) {
      list.push({
        label: UNGROUPED_LABEL,
        color: ns.groupColor(null),
        glyph: '–',
        message: { type: MSG.REGROUP, tabId, groupId: -1 },
      });
    }
    list.push({
      label: 'New group',
      color: ns.groupColor(null),
      glyph: '+',
      message: { type: MSG.NEW_GROUP, tabId },
    });
    return list;
  }

  /**
   * Centres the row above the dock.
   * @param {Omit<DropTarget, 'x' | 'y'>[]} list
   * @param {Pick<DOMRect, 'left' | 'top' | 'width'>} dock
   * @returns {DropTarget[]}
   */
  function layOut(list, dock) {
    const span = list.length * SIZE_PX + (list.length - 1) * GAP_PX;
    const start = dock.left + dock.width / 2 - span / 2 + SIZE_PX / 2;
    const y = Math.max(SIZE_PX, dock.top - RISE_PX);
    return list.map((target, i) => ({ ...target, x: start + i * (SIZE_PX + GAP_PX), y }));
  }

  /** @param {DropTarget} target */
  function buildTarget(target) {
    const el = document.createElement('div');
    el.className = 'hh-drop-target';
    el.setAttribute('aria-label', target.label);
    el.style.setProperty('--hh-group', target.color);
    el.style.setProperty('left', `${target.x - SIZE_PX / 2}px`);
    el.style.setProperty('top', `${target.y - SIZE_PX / 2}px`);
    if (target.glyph) el.textContent = target.glyph;
    return el;
  }
})();
