// Real-Chrome check of the toolbar popup on a chrome:// page, where no dock can be injected.
import { writeFileSync } from 'node:fs';
import { sleep } from './cdp.js';

/** @typedef {import('./checks.js').Lab} Lab */

/** Where the popup's screenshot goes, for a look by eye (set POPUP_SHOT=path). */
const SHOT = process.env.POPUP_SHOT;

/** @param {Lab} lab @returns {Promise<import('./checks.js').Outcome>} */
export async function popupCheck(lab) {
  await lab.sw(
    `chrome.tabs.create({ windowId: ${lab.main}, url: 'chrome://version', active: true }).then(() => 1)`,
  );
  await sleep(800);
  await openPopup(lab);
  const sid = await popupSession(lab);
  if (!sid) return { status: 'FAIL', detail: 'the toolbar popup never opened' };
  await sleep(1500); // the popup paints, then Chrome sizes it
  const shown = await lab.cdp.evaluate(
    `({ label: document.querySelector('.hh-label-text')?.textContent,
        tabs: [...document.querySelectorAll('.hh-tab')].map((t) => t.textContent.trim()),
        focused: document.activeElement?.textContent.trim() })`,
    sid,
  );
  if (SHOT) {
    const { data } = await lab.cdp.send('Page.captureScreenshot', {}, sid);
    writeFileSync(SHOT, Buffer.from(data, 'base64'));
  }
  const problems = [];
  if (!shown.tabs.some((t) => t.startsWith('About Version') || t.includes('chrome://version')))
    problems.push(`the popup shows ${shown.label}: ${shown.tabs.join(', ')}`);
  if (shown.focused !== shown.tabs.find((t) => t.includes('Version')))
    problems.push(`focus is on ${shown.focused}, not the current tab`);
  const other = shown.tabs.find((t) => !t.includes('Version'));
  if (other) {
    await lab.cdp.evaluate(
      `[...document.querySelectorAll('.hh-tab')].find((t) => t.textContent.trim() === ${JSON.stringify(other)}).click()`,
      sid,
    );
    await sleep(600);
    const active = await lab.sw(
      `chrome.tabs.query({ windowId: ${lab.main}, active: true }).then(([t]) => t.title)`,
    );
    if (active !== other) problems.push(`clicking ${other} left ${active} active`);
  }
  await lab.sw(
    `chrome.tabs.query({ url: 'chrome://version/' }).then((ts) => chrome.tabs.remove(ts.map((t) => t.id))).then(() => 1)`,
  );
  return problems.length
    ? { status: 'FAIL', detail: problems.join('; ') }
    : {
        status: 'PASS',
        detail: `on chrome://version the popup showed ${shown.label} (${shown.tabs.length} tabs), focused the current tab; clicking ${other ?? 'nothing'} switched to it`,
      };
}

/**
 * Chrome shows the popup only for the window in front, which the OS may not have granted yet
 * (the terminal running this has focus): ask again a few times.
 * @param {Lab} lab
 */
async function openPopup(lab) {
  for (let i = 0; ; i++) {
    try {
      return await lab.sw(
        `chrome.windows.update(${lab.main}, { focused: true }).then(() => chrome.action.openPopup({ windowId: ${lab.main} })).then(() => 1)`,
      );
    } catch (err) {
      if (i === 4) throw err;
      await sleep(500);
    }
  }
}

/** The open popup page's session. @param {Lab} lab */
async function popupSession(lab) {
  for (let i = 0; i < 30; i++) {
    const { targetInfos } = await lab.cdp.send('Target.getTargets');
    const page = targetInfos.find((t) => t.url.endsWith('/popup/popup.html'));
    if (page) {
      const sid = await lab.cdp.attach(page.targetId);
      await lab.cdp.send('Runtime.enable', {}, sid);
      return sid;
    }
    await sleep(100);
  }
  return null;
}
