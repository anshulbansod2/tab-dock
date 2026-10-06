// @ts-check

const EDGE_PX = 8; // kept clear between the window and the page's far edge
const TITLE_BAR_PX = 28;
const MIN_PAGE_PX = 160;

/**
 * Screen bounds for a peeked tab's window: its page exactly as wide as the dock, in the page's
 * own shape (no taller than the room left), the whole window resting on the dock's edge that
 * faces the page. Page measurements are CSS pixels, which page zoom scales; the page's
 * position on screen comes from the click (screen point less client point × zoom), which
 * holds whatever sits beside the page: a side panel, docked DevTools, window borders.
 * @param {object} input
 * @param {PeekDock} input.dock - the dock's rect, in page pixels
 * @param {{ width: number, height: number }} input.view - the page's size, in page pixels
 * @param {PeekPoint} input.point - the click that opened it
 * @param {number} input.zoom - the page's zoom factor (chrome.tabs.getZoom)
 * @returns {PeekBounds}
 */
export function peekBounds({ dock, view, point, zoom }) {
  const originX = point.screenX - point.clientX * zoom;
  const originY = point.screenY - point.clientY * zoom;
  const above = dock.top > view.height - dock.bottom;
  const room = (above ? dock.top : view.height - dock.bottom) * zoom - EDGE_PX;
  const width = (dock.right - dock.left) * zoom;
  const shape = (width * view.height) / view.width;
  const page = Math.round(Math.max(MIN_PAGE_PX, Math.min(room - TITLE_BAR_PX, shape)));
  const top = above
    ? originY + dock.top * zoom - page - TITLE_BAR_PX
    : originY + dock.bottom * zoom;
  return {
    left: Math.round(originX + dock.left * zoom),
    top: Math.round(top),
    width: Math.round(width),
    height: page + TITLE_BAR_PX,
  };
}
