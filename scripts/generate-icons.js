// Generates the Tab Dock icons with no deps: a dark glass dock holding three tab chips (the
// middle one current) above a blue glow line, echoing the bar itself.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 48, 128];
const SAMPLES = 4; // per axis: 16 sub-pixel samples give smooth edges at 16 px
const GLOW = [138, 180, 248]; // the bar's blue group colour (dark-mode tone)

/** Signed distance from (x, y) to a rounded rectangle; negative inside. */
function roundedRect(x, y, { x0, y0, x1, y1, r }) {
  const dx = Math.max(x0 + r - x, x - (x1 - r), 0);
  const dy = Math.max(y0 + r - y, y - (y1 - r), 0);
  const inside = Math.min(Math.max(x0 + r - x, x - (x1 - r)), Math.max(y0 + r - y, y - (y1 - r)));
  return dx > 0 || dy > 0 ? Math.hypot(dx, dy) - r : Math.min(inside, 0) - r;
}

const DOCK = { x0: 6, y0: 30, x1: 122, y1: 94, r: 20 };
/** Three tab chips; the middle one is the current tab. Favicon colours echo real sites. */
const CHIPS = [
  { x0: 15, favicon: [234, 67, 53] },
  { x0: 50, favicon: [52, 168, 83], current: true },
  { x0: 85, favicon: [251, 188, 4] },
].map((chip) => ({ ...chip, x1: chip.x0 + 30, y0: 46, y1: 78, r: 9 }));

/**
 * Colour layers, bottom to top, in a 128-unit design space. Each returns [r, g, b, a] at a
 * point, or null where it paints nothing.
 */
const DETAILED = [
  (x, y) => {
    // The glow line under the dock: soft falloff around a segment, fading at both ends.
    const fade = Math.max(0, 1 - Math.abs(x - 64) / 50) ** 1.5;
    const halo = Math.exp(-(((y - 104) / 4.5) ** 2)) * fade;
    return halo > 0.01 ? [...GLOW, Math.min(1, halo * 1.15)] : null;
  },
  (x, y) => {
    if (roundedRect(x, y, DOCK) > 0) return null;
    const t = (y - DOCK.y0) / (DOCK.y1 - DOCK.y0); // dark glass, lighter at the top
    const edge = roundedRect(x, y, DOCK) > -2.5 ? 22 : 0; // thin highlight rim
    return [58 - 22 * t + edge, 61 - 22 * t + edge, 70 - 24 * t + edge, 1];
  },
  ...CHIPS.flatMap((chip) => [
    (x, y) => (roundedRect(x, y, chip) <= 0 ? chipFill(chip) : null),
    (x, y) => (inBox(x, y, chip.x0 + 6, 57, chip.x0 + 15, 66, 2.5) ? [...chip.favicon, 1] : null),
    (x, y) => (inBox(x, y, chip.x0 + 18, 59.5, chip.x0 + 25, 63.5, 2) ? [205, 208, 214, 1] : null),
    (x, y) =>
      chip.current && inBox(x, y, chip.x0 + 7, 72, chip.x1 - 7, 75, 1.5) ? [...GLOW, 1] : null,
  ]),
];

/**
 * At 16 px a favicon and title per chip turn to noise, so the toolbar icon is a taller dock
 * holding three solid favicon-coloured chips.
 */
const SMALL_DOCK = { x0: 2, y0: 22, x1: 126, y1: 98, r: 24 };
const SMALL = [
  DETAILED[0],
  (x, y) => (roundedRect(x, y, SMALL_DOCK) <= 0 ? [44, 46, 54, 1] : null),
  ...[14, 50, 86].map(
    (x0, i) => (x, y) => (inBox(x, y, x0, 42, x0 + 28, 78, 8) ? [...CHIPS[i].favicon, 1] : null),
  ),
];

/** @param {{ current?: boolean }} chip */
function chipFill(chip) {
  return chip.current ? [104, 108, 120, 1] : [76, 79, 89, 1];
}

function inBox(x, y, x0, y0, x1, y1, r) {
  return roundedRect(x, y, { x0, y0, x1, y1, r }) <= 0;
}

/** "Over" compositing of one layer colour onto an accumulated premultiplied pixel. */
function over(dst, [r, g, b, a]) {
  const keep = 1 - a;
  return [r * a + dst[0] * keep, g * a + dst[1] * keep, b * a + dst[2] * keep, a + dst[3] * keep];
}

/** Averages SAMPLES² sub-pixel samples of the layer stack (anti-aliasing). */
function pixel(x, y, size) {
  const scale = 128 / size;
  const sum = [0, 0, 0, 0];
  for (let sy = 0; sy < SAMPLES; sy += 1) {
    for (let sx = 0; sx < SAMPLES; sx += 1) {
      const px = (x + (sx + 0.5) / SAMPLES) * scale;
      const py = (y + (sy + 0.5) / SAMPLES) * scale;
      let color = [0, 0, 0, 0];
      for (const layer of size <= 16 ? SMALL : DETAILED) {
        const paint = layer(px, py);
        if (paint) color = over(color, paint);
      }
      color.forEach((v, i) => (sum[i] += v));
    }
  }
  const n = SAMPLES * SAMPLES;
  const alpha = sum[3] / n;
  if (alpha === 0) return [0, 0, 0, 0];
  const channel = (i) => Math.round(Math.min(255, sum[i] / n / alpha));
  return [channel(0), channel(1), channel(2), Math.round(alpha * 255)];
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size) {
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4); // leading 0 = no filter
    for (let x = 0; x < size; x += 1) row.set(pixel(x, y, size), 1 + x * 4);
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('icons', { recursive: true });
for (const size of SIZES) writeFileSync(`icons/icon${size}.png`, png(size));
