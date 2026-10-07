// Real-Chrome check of naming groups from the dock: right-click the group name, type, Enter;
// and New group… from a tab's menu.
import { writeFileSync } from 'node:fs';
import { sleep } from './cdp.js';

/** @typedef {import('./checks.js').Lab} Lab */

/** Where a screenshot of the open editor goes, for a look by eye (set NAMES_SHOT=path). */
const SHOT = process.env.NAMES_SHOT;

/** Types into the focused field and presses Enter, as a keyboard does. @param {Lab} lab */
async function typeAndEnter(lab, text) {
  const sid = await lab.session('one');
  await lab.cdp.send('Input.insertText', { text }, sid);
  for (const type of ['keyDown', 'keyUp'])
    await lab.cdp.send(
      'Input.dispatchKeyEvent',
      { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
      sid,
    );
  await sleep(800);
}

/** A right-click at the middle of the dock element. @param {Lab} lab @param {string} selector */
async function rightClick(lab, selector) {
  const at = await lab.inDock('one', lab.rectOf(selector));
  if (!at) throw new Error(`nothing at ${selector}`);
  await lab.mouse('one', 'mouseMoved', at.x, at.y);
  await lab.cdp.send(
    'Input.dispatchMouseEvent',
    { type: 'mousePressed', x: at.x, y: at.y, button: 'right', buttons: 2, clickCount: 1 },
    await lab.session('one'),
  );
  await lab.cdp.send(
    'Input.dispatchMouseEvent',
    { type: 'mouseReleased', x: at.x, y: at.y, button: 'right', clickCount: 1 },
    await lab.session('one'),
  );
  await sleep(300);
}

/** @param {Lab} lab */
const groupOfOne = (lab) =>
  lab.sw(
    `chrome.tabs.query({ url: ${JSON.stringify(lab.url('one'))} }).then(([t]) => t.groupId < 0 ? null : chrome.tabGroups.get(t.groupId)).then((g) => g && { title: g.title, color: g.color })`,
  );

/** @param {Lab} lab @returns {Promise<import('./checks.js').Outcome>} */
export async function namesCheck(lab) {
  await lab.sw(
    `chrome.tabs.query({ url: ${JSON.stringify(lab.url('one'))} }).then(([t]) => chrome.tabs.group({ tabIds: [t.id] }).then(() => chrome.tabs.update(t.id, { active: true }))).then(() => 1)`,
  );
  await lab.cdp.send('Page.reload', {}, await lab.session('one'));
  await sleep(2500);
  const problems = [];
  await rightClick(lab, '.hh-label');
  if (!(await lab.inDock('one', lab.rectOf('.hh-editor'))))
    return { status: 'FAIL', detail: 'right-clicking the group name opened no editor' };
  if (SHOT) {
    const { data } = await lab.cdp.send('Page.captureScreenshot', {}, await lab.session('one'));
    writeFileSync(SHOT, Buffer.from(data, 'base64'));
  }
  await typeAndEnter(lab, 'Renamed here');
  const renamed = await groupOfOne(lab);
  if (renamed?.title !== 'Renamed here') problems.push(`the group is called ${renamed?.title}`);
  await rightClick(lab, '.hh-chip [aria-current="page"]');
  await lab.inDock(
    'one',
    `[...${lab.root}.querySelectorAll('[role="menuitem"]')].find((m) => m.textContent === 'New group…').click()`,
  );
  await sleep(300);
  await typeAndEnter(lab, 'Fresh');
  const made = await groupOfOne(lab);
  if (made?.title !== 'Fresh') problems.push(`New group… made ${JSON.stringify(made)}`);
  return problems.length
    ? { status: 'FAIL', detail: problems.join('; ') }
    : {
        status: 'PASS',
        detail: `renamed the group from its name on the dock; New group… made "Fresh" (${made.color})`,
      };
}
