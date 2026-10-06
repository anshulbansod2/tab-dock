import { describe, expect, it } from 'vitest';
import { peekBounds } from '../background/geometry.js';

// A 1200 × 800 page whose top-left sits at (100, 130) on screen; the click was at client (650, 776).
const point = (originX = 100, originY = 130, zoom = 1, clientY = 776) => ({
  clientX: 650,
  clientY,
  screenX: originX + 650 * zoom,
  screenY: originY + clientY * zoom,
});
const view = { width: 1200, height: 800 };
const bottomDock = { left: 300, right: 900, top: 752, bottom: 800 };

describe('peekBounds', () => {
  it('rests the window on a bottom dock: as wide, in the page shape, title bar on top', () => {
    expect(peekBounds({ dock: bottomDock, view, point: point(), zoom: 1 })).toEqual({
      left: 400,
      top: 130 + 752 - 400 - 28,
      width: 600,
      height: 428,
    });
  });

  it('hangs the whole window below a dock at the top', () => {
    const dock = { left: 300, right: 900, top: 8, bottom: 56 };
    const bounds = peekBounds({ dock, view, point: point(), zoom: 1 });
    expect(bounds).toMatchObject({ left: 400, top: 130 + 56, width: 600, height: 428 });
  });

  it('is no taller than the room left beside the dock', () => {
    const dock = { left: 300, right: 900, top: 200, bottom: 248 };
    // 800 - 248 - 8 = 544 below, but 200 - 8 = 192 above: below wins; 544 - 28 fits 400
    expect(peekBounds({ dock, view, point: point(), zoom: 1 }).height).toBe(428);
    const low = { left: 300, right: 900, top: 500, bottom: 548 };
    // above: 500 - 8 - 28 = 464 of room, more than the 400 the shape needs
    expect(peekBounds({ dock: low, view, point: point(), zoom: 1 }).height).toBe(428);
    const tight = { left: 300, right: 900, top: 270, bottom: 318 };
    // room above: 270 - 8 margin - 28 title bar = 234, less than the 600 × 280 shape
    const wide = { width: 1200, height: 560 };
    expect(peekBounds({ dock: tight, view: wide, point: point(), zoom: 1 }).height).toBe(262);
  });

  it('undoes page zoom: page pixels × zoom are screen pixels', () => {
    const zoom = 1.25;
    const dock = { left: 240, right: 720, top: 600, bottom: 640 }; // 960 × 640 page reported
    const bounds = peekBounds({
      dock,
      view: { width: 960, height: 640 },
      point: point(100, 130, zoom, 620),
      zoom,
    });
    expect(bounds).toEqual({ left: 100 + 300, top: 130 + 750 - 400 - 28, width: 600, height: 428 });
  });

  it('takes the page position from the click, so a side panel cannot skew it', () => {
    // a 360 px panel on the left pushes the page area to x = 460 on screen
    const bounds = peekBounds({ dock: bottomDock, view, point: point(460), zoom: 1 });
    expect(bounds.left).toBe(460 + 300);
  });
});
