// The checks: each opens a live window from a hover card and measures what Chrome really did.
import { sleep } from './cdp.js';

/** @typedef {Awaited<ReturnType<typeof import('./lab.js').openLab>>} Lab */
/** @typedef {{ status: 'PASS' | 'FAIL' | 'SKIP', detail: string }} Outcome */

const PEEKED = 'three';
// Counts the tab moves Chrome reports (into a window, or within one), installed once.
const COUNT_MOVES = `(() => {
  if (!globalThis.__counting) {
    globalThis.__counting = true;
    const count = () => globalThis.__moves++;
    chrome.tabs.onAttached.addListener(count);
    chrome.tabs.onMoved.addListener(count);
  }
  globalThis.__moves = 0;
  return 1;
})()`;
const near = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) <= 1;

/** @param {Lab} lab @param {string} page */
const tabOf = (lab, page) =>
  lab.sw(
    `chrome.tabs.query({ url: ${JSON.stringify(lab.url(page))} }).then(([t]) => t && { id: t.id, index: t.index, windowId: t.windowId, groupId: t.groupId })`,
  );

/** @param {Lab} lab */
const popup = (lab) =>
  lab.sw(`chrome.windows.getAll().then((ws) => ws.find((w) => w.type === 'popup') ?? null)`);

/** @param {Lab} lab */
async function reload(lab) {
  await lab.cdp.send('Page.reload', {}, await lab.session('one'));
  await sleep(2500);
}

/** Waits for the hover card (the first preview request may wake the worker). @param {Lab} lab */
async function cardWithin(lab, ms) {
  for (let waited = 0; waited < ms; waited += 100) {
    if (await lab.inDock('one', lab.rectOf('.hh-card'))) return true;
    await sleep(100);
  }
  return false;
}

/**
 * Points at the chip, measured just now (a re-render after the last check can shift the
 * chips), coming from a neutral spot: a pointer already resting on it would send no hover.
 * @param {Lab} lab @param {string} page @returns {Promise<boolean>} whether its card showed
 */
async function hoverChip(lab, page) {
  const chip = await lab.inDock(
    'one',
    `[...${lab.root}.querySelectorAll('.hh-chip')].map((c) => { const r = c.getBoundingClientRect(); return { title: c.textContent.trim(), x: r.x + r.width / 2, y: r.y + r.height / 2 }; }).find((c) => c.title === 'Page ${page}')`,
  );
  if (!chip) throw new Error(`no chip for Page ${page}`);
  await lab.mouse('one', 'mouseMoved', 5, 5);
  await sleep(300);
  await lab.mouse('one', 'mouseMoved', chip.x, chip.y);
  return cardWithin(lab, 3000);
}

/** Hovers a chip, waits for its card and clicks it. @param {Lab} lab */
async function openPeek(lab, page = PEEKED, { beforeClick = async () => {} } = {}) {
  if (!(await hoverChip(lab, page)) && !(await hoverChip(lab, page)))
    throw new Error('no hover card within 3 s, twice');
  const shown = await lab.inDock('one', lab.rectOf('.hh-card'));
  await lab.mouse('one', 'mouseMoved', shown.x, shown.y); // resting on the card, as a user does
  await sleep(100);
  await beforeClick();
  const card = await lab.inDock('one', lab.rectOf('.hh-card'));
  if (!card) throw new Error('the hover card closed before the click');
  await lab.mouse('one', 'mousePressed', card.x, card.y, 1);
  await lab.mouse('one', 'mouseReleased', card.x, card.y);
  // A sleeping worker wakes for the message before it can open the window.
  for (let waited = 0; waited < 4000; waited += 200) {
    await sleep(200);
    const win = await popup(lab);
    if (win) return win;
  }
  throw new Error('the card was clicked but no live window opened within 4 s');
}

/** The dock's edges on screen, through the page's zoom (no side UI beside the page). */
async function dockOnScreen(lab) {
  const { id } = await tabOf(lab, 'one');
  const zoom = await lab.sw(`chrome.tabs.getZoom(${id})`);
  const dock = await lab.inDock('one', lab.rectOf('.hh-bar'));
  const page = await lab.inDock(
    'one',
    '({ x: screenX, y: screenY, ow: outerWidth, oh: outerHeight, iw: innerWidth, ih: innerHeight })',
  );
  const left = page.x + (page.ow - page.iw * zoom) / 2;
  const top = page.y + (page.oh - page.ih * zoom);
  return {
    zoom,
    left: left + dock.left * zoom,
    right: left + dock.right * zoom,
    top: top + dock.top * zoom,
    bottom: top + dock.bottom * zoom,
  };
}

/** Puts the test pages in one tab group (they stay grouped for the later checks). @param {Lab} lab */
async function groupTabs(lab) {
  await lab.sw(`chrome.tabs.query({ windowId: ${lab.main} })
    .then((ts) => ts.filter((t) => t.url.startsWith('http') && t.groupId === -1).map((t) => t.id))
    .then((ids) => ids.length && chrome.tabs.group({ tabIds: ids })
      .then((g) => chrome.tabGroups.update(g, { title: 'Work', color: 'blue' })))
    .then(() => 1)`);
  await reload(lab);
}

/** Puts things back: the tab home, zoom 100 %, the dock at its default spot. @param {Lab} lab */
export async function reset(lab) {
  if (await popup(lab))
    await lab.sw(`chrome.windows.update(${lab.main}, { focused: true }).then(() => 1)`);
  await sleep(800);
  const { id } = await tabOf(lab, 'one');
  await lab.sw(
    `chrome.tabs.setZoom(${id}, 1).then(() => chrome.storage.local.clear()).then(() => 1)`,
  );
  await reload(lab);
}

/** @param {Lab} lab @param {'above' | 'below'} side @returns {Promise<Outcome>} */
async function placement(lab, side) {
  const dock = await dockOnScreen(lab);
  const win = await openPeek(lab);
  const edge = side === 'above' ? [win.top + win.height, dock.top] : [win.top, dock.bottom];
  const ok =
    near(win.left, dock.left) && near(win.width, dock.right - dock.left) && near(edge[0], edge[1]);
  const detail = `dock ${dock.left.toFixed(1)}–${dock.right.toFixed(1)}, edge ${edge[1].toFixed(1)}; window ${win.left}+${win.width}, edge ${edge[0]}`;
  return { status: ok ? 'PASS' : 'FAIL', detail };
}

export const CHECKS = [
  ['live window rests on a bottom dock (100 %)', (lab) => placement(lab, 'above')],
  [
    'live window rests on a bottom dock (125 % zoom)',
    async (lab) => {
      const { id } = await tabOf(lab, 'one');
      await lab.sw(`chrome.tabs.setZoom(${id}, 1.25).then(() => 1)`);
      await reload(lab);
      return placement(lab, 'above');
    },
  ],
  [
    'live window hangs below a dock at the top',
    async (lab) => {
      const label = await lab.inDock('one', lab.rectOf('.hh-label'));
      await lab.mouse('one', 'mousePressed', label.x, label.y, 1);
      for (let i = 1; i <= 8; i++)
        await lab.mouse('one', 'mouseMoved', label.x, label.y + ((40 - label.y) * i) / 8, 1);
      await lab.mouse('one', 'mouseReleased', label.x, 40);
      await sleep(600);
      return placement(lab, 'below');
    },
  ],
  [
    'Return puts the tab back where it was',
    (lab) =>
      comesBack(lab, async () => {
        await lab.inDock(PEEKED, `${lab.root}.querySelector('[data-action="return"]').click()`);
      }),
  ],
  [
    'using the main window again puts the tab back, once',
    (lab) =>
      comesBack(lab, () =>
        lab.sw(`chrome.windows.update(${lab.main}, { focused: true }).then(() => 1)`),
      ),
  ],
  ['a re-render while hovering keeps the card on the dock', reRender],
  [
    'closing the live window puts the tab back',
    (lab) =>
      comesBack(lab, async (win) => {
        await lab.sw(`chrome.windows.remove(${win.id}).then(() => 1)`);
      }),
  ],
  ...['Return', 'using the main window again', 'closing the live window'].map((how, i) => [
    `${how} puts a grouped tab back in its group`,
    async (/** @type {Lab} */ lab) => {
      await groupTabs(lab);
      const acts = [
        () => lab.inDock(PEEKED, `${lab.root}.querySelector('[data-action="return"]').click()`),
        () => lab.sw(`chrome.windows.update(${lab.main}, { focused: true }).then(() => 1)`),
        (win) => lab.sw(`chrome.windows.remove(${win.id}).then(() => 1)`),
      ];
      return comesBack(lab, acts[i]);
    },
  ]),
  [
    'side panel open',
    async () => ({
      status: 'SKIP',
      detail: 'Chrome has no API to open its side panel for another extension; check by hand',
    }),
  ],
];

/**
 * Opens a live window, does `act`, and expects the tab home at its old index exactly once.
 * @param {Lab} lab @param {(win: { id: number }) => Promise<unknown>} act
 */
async function comesBack(lab, act) {
  const before = await tabOf(lab, PEEKED);
  await lab.sw(COUNT_MOVES);
  const win = await openPeek(lab);
  await lab.sw(`(globalThis.__moves = 0, 1)`);
  await act(win);
  await sleep(2000);
  const after = await tabOf(lab, PEEKED);
  const moves = await lab.sw('globalThis.__moves');
  const left = await popup(lab);
  const home = after?.windowId === lab.main && after.index === before.index;
  // Exactly one trip home: an ungrouped tab moves once; a grouped one joins its group (a move
  // into the window) and then takes its old spot. More would mean it was returned twice.
  const expected = before.groupId === -1 ? 1 : 2;
  const ok = home && after.groupId === before.groupId && moves === expected && !left;
  const group =
    before.groupId === -1
      ? ''
      : `, ${after?.groupId === before.groupId ? 'in' : 'NOT in'} its group`;
  const where = after
    ? `window ${after.windowId === lab.main ? 'main' : after.windowId}, index ${after.index} (was ${before.index})${group}`
    : 'tab gone';
  return {
    status: ok ? 'PASS' : 'FAIL',
    detail: `${where}; moves back ${moves} (expected ${expected}); live window left ${Boolean(left)}`,
  };
}

/**
 * Another tab's title changes while the pointer rests on a card, so the dock re-renders under
 * it (every chip and the dock itself are replaced); the card must still open the live window.
 * @param {Lab} lab
 */
async function reRender(lab) {
  let replaced = false;
  const win = await openPeek(lab, PEEKED, {
    beforeClick: async () => {
      await lab.inDock('one', `(${lab.root}.querySelector('.hh-bar').dataset.mark = 'old', 1)`);
      await lab.cdp.evaluate(`document.title = 'Page two ' + Date.now()`, await lab.session('two'));
      await sleep(900);
      replaced = await lab.inDock(
        'one',
        `${lab.root}.querySelector('.hh-bar').dataset.mark !== 'old'`,
      );
    },
  });
  if (!replaced)
    return { status: 'FAIL', detail: 'the dock never re-rendered: nothing was tested' };
  return {
    status: win ? 'PASS' : 'FAIL',
    detail: `dock re-rendered; live window ${win ? 'opened' : 'never opened'}`,
  };
}
