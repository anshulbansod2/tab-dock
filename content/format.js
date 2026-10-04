// @ts-check
// Pure display helpers for untrusted tab data.
(() => {
  const ns = (globalThis.HoverHelper ??= /** @type {HoverHelperNamespace} */ ({}));
  const { GROUP_COLORS, NEUTRAL_COLOR, UNGROUPED_LABEL } = ns.constants;
  const SAFE_FAVICON = /^(https?:|data:image\/)/i;
  const ELLIPSIS = '…';

  /** Shortens by code points (not UTF-16 units) so emoji are never split. */
  ns.truncate = (text, max) => {
    const chars = [...text];
    if (chars.length <= max) return text;
    return (
      chars
        .slice(0, max - 1)
        .join('')
        .trimEnd() + ELLIPSIS
    );
  };

  /** Only web and inline-image URLs may reach an <img src>. */
  ns.safeFavicon = (url) => (url && SAFE_FAVICON.test(url) ? url : null);

  ns.groupLabel = (group) => (group ? group.title : UNGROUPED_LABEL);

  ns.groupColor = (group) => (group ? (GROUP_COLORS[group.color] ?? NEUTRAL_COLOR) : NEUTRAL_COLOR);
})();
