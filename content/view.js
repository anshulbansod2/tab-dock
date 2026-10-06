// @ts-check
// What the dock shows: the latest snapshot, whether it is collapsed, and the group the switcher
// is browsing; painted at most once per animation frame.
(() => {
  const ns = (globalThis.TabDock ??= /** @type {TabDockNamespace} */ ({}));

  /**
   * Holds the latest snapshot and collapsed flag; paints only once both are known so the bar
   * never flashes in the wrong state. Paints are coalesced into the next animation frame, so a
   * burst of snapshots or collapse changes costs one render with the latest data. While held
   * (a chip is being dragged) nothing paints; the latest data paints on release.
   * @param {HTMLElement} mount
   * @param {(callback: FrameRequestCallback) => number} [requestFrame]
   * @param {(handle: number) => void} [cancelFrame]
   * @returns {BarViewState}
   */
  ns.createView = (
    mount,
    requestFrame = requestAnimationFrame,
    cancelFrame = cancelAnimationFrame,
  ) => {
    /** @type {Snapshot | null} */
    let snapshot = null;
    /** @type {boolean | null} */
    let collapsed = null;
    /** @type {Browse | null} */
    let browse = null;
    /** @type {number | null} */
    let frame = null;
    let held = false;
    let stale = false;
    const paint = () => {
      frame = null;
      if (held) {
        stale = true;
        return;
      }
      stale = false;
      if (snapshot && collapsed !== null) ns.render(mount, { snapshot, collapsed, browse });
    };
    const schedule = () => {
      frame ??= requestFrame(paint);
    };
    return {
      setSnapshot(next) {
        snapshot = next;
        schedule();
      },
      setCollapsed(next) {
        collapsed = next;
        schedule();
      },
      setBrowse(next) {
        browse = next;
        schedule();
      },
      browsing: () => browse,
      isCollapsed: () => collapsed === true,
      current: () => snapshot && shown(snapshot, browse),
      own: () => snapshot,
      hold(next) {
        held = next;
        if (!held && stale) schedule();
      },
      dispose() {
        if (frame !== null) cancelFrame(frame);
        frame = null;
      },
    };
  };

  /**
   * The snapshot as the dock shows it: while browsing, the browsed group and its tabs (so the
   * tab menu offers moves out of that group, into yours among others).
   * @param {Snapshot} snapshot
   * @param {Browse | null} browse
   * @returns {Snapshot}
   */
  function shown(snapshot, browse) {
    if (!browse) return snapshot;
    return { ...snapshot, group: browse.view.group, tabs: browse.view.tabs };
  }
})();
