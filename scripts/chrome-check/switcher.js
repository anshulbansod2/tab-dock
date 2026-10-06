// Real-Chrome check of the group switcher: a real pointer moving along the swatches must find
// each one where it was (the dock keeps its place and width), and a click must take.
import { sleep } from './cdp.js';

/** @typedef {import('./checks.js').Lab} Lab */

const SETTLE_MS = 500;

/** Two groups: Work (pages one, two) and Read (three, four), with four used last in Read. */
async function makeGroups(/** @type {Lab} */ lab) {
  await lab.sw(`(async () => {
    const tabs = await chrome.tabs.query({ windowId: ${lab.main} });
    const id = (page) => tabs.find((t) => t.url.endsWith('/' + page + '.html')).id;
    const work = await chrome.tabs.group({ tabIds: [id('one'), id('two')] });
    await chrome.tabGroups.update(work, { title: 'Work', color: 'blue' });
    const read = await chrome.tabs.group({ tabIds: [id('three'), id('four')] });
    await chrome.tabGroups.update(read, { title: 'Read', color: 'red' });
    await chrome.tabs.update(id('four'), { active: true });
    await new Promise((r) => setTimeout(r, 300));
    await chrome.tabs.update(id('one'), { active: true });
    return 1;
  })()`);
  await lab.cdp.send('Page.reload', {}, await lab.session('one'));
  await sleep(2500);
}

/** What the dock shows now, measured in the page. @param {Lab} lab */
const dockState = (lab) =>
  lab.inDock(
    'one',
    `(() => {
      const root = ${lab.root};
      const bar = root.querySelector('.hh-bar').getBoundingClientRect();
      const swatches = [...root.querySelectorAll('.hh-swatch')].map((s) => {
        const r = s.getBoundingClientRect();
        const name = s.getAttribute('aria-label');
        return { id: s.dataset.groupId, name, x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      return {
        left: bar.left, width: bar.width, swatches,
        label: root.querySelector('.hh-label-text').textContent,
        tabs: [...root.querySelectorAll('.hh-tab')].map((t) => t.textContent.trim()),
      };
    })()`,
  );

/** Moves the real pointer in small steps, as a hand does. @param {Lab} lab */
async function glide(lab, from, to) {
  for (let i = 1; i <= 6; i++)
    await lab.mouse(
      'one',
      'mouseMoved',
      from.x + ((to.x - from.x) * i) / 6,
      from.y + ((to.y - from.y) * i) / 6,
    );
  await sleep(SETTLE_MS);
  return to;
}

/** @param {Lab} lab @returns {Promise<import('./checks.js').Outcome>} */
export async function switcherCheck(lab) {
  await makeGroups(lab);
  const start = await dockState(lab);
  if (start.swatches.length < 2) return { status: 'FAIL', detail: 'no group swatches on the dock' };
  const problems = [];
  let at = await glide(lab, { x: 5, y: 5 }, start.swatches[0]);
  for (const swatch of start.swatches) {
    at = await glide(lab, at, swatch);
    const now = await dockState(lab);
    const moved = now.swatches.find((s) => s.id === swatch.id);
    if (Math.abs(now.left - start.left) > 0.5 || Math.abs(now.width - start.width) > 0.5)
      problems.push(`dock moved on swatch ${swatch.id} (${now.left}+${now.width})`);
    if (!moved || Math.abs(moved.x - swatch.x) > 0.5)
      problems.push(`swatch ${swatch.id} slid from under the pointer`);
  }
  const read = start.swatches.find((s) => s.name === 'Read'); // strip order varies by run
  if (!read) return { status: 'FAIL', detail: 'no swatch named Read' };
  at = await glide(lab, at, read);
  const browsing = await dockState(lab);
  if (browsing.label !== 'Read' || browsing.tabs.toSorted().join() !== 'Page four,Page three') {
    const under = await lab.inDock(
      'one',
      `(() => { const r = ${lab.root}; const el = r.elementFromPoint(${read.x}, ${read.y}); return el ? el.className + ' ' + (el.dataset.groupId ?? '') : document.elementFromPoint(${read.x}, ${read.y})?.tagName; })()`,
    );
    const swatches = start.swatches.map((s) => `${s.id}@${Math.round(s.x)},${Math.round(s.y)}`);
    problems.push(
      `pointing at Read showed ${browsing.label}: ${browsing.tabs.join()} (under the pointer: ${under}; swatches ${swatches.join(' ')})`,
    );
  }
  at = await glide(lab, at, { x: 5, y: 5 });
  if ((await dockState(lab)).label !== 'Work') problems.push('leaving the dock kept Read');
  at = await glide(lab, at, read);
  await lab.mouse('one', 'mousePressed', read.x, read.y, 1);
  await lab.mouse('one', 'mouseReleased', read.x, read.y);
  await sleep(800);
  const active = await lab.sw(
    `chrome.tabs.query({ windowId: ${lab.main}, active: true }).then(([t]) => t.url)`,
  );
  if (!active.endsWith('/four.html')) problems.push(`clicking Read opened ${active}`);
  await lab.sw(
    `chrome.tabs.query({ url: ${JSON.stringify(lab.url('one'))} }).then(([t]) => chrome.tabs.update(t.id, { active: true })).then(() => 1)`,
  );
  return problems.length
    ? { status: 'FAIL', detail: problems.join('; ') }
    : {
        status: 'PASS',
        detail: `${start.swatches.length} swatches held still under the pointer; Read shown, left, clicked: page four opened`,
      };
}
