// Drives the extension in a running Chrome: its service worker, pages, and their docks.
import { PAGES } from './browser.js';
import { sleep } from './cdp.js';

const ROOT = `chrome.dom.openOrClosedShadowRoot(document.querySelector('tab-dock-bar'))`;
const LIVE = `globalThis.TabDock?.instance === document.querySelector('tab-dock-bar')?.dataset.instance`;

/**
 * @param {{ cdp: import('./cdp.js').Cdp, extensionId: string, origin: string }} browser
 */
export async function openLab({ cdp, extensionId, origin }) {
  const url = (/** @type {string} */ page) => `${origin}/${page}.html`;
  for (const page of PAGES.slice(1))
    await cdp.send('Target.createTarget', { url: url(page), background: true });
  await cdp.send('Target.createTarget', { url: url('one') });
  const worker = await cdp.attach(
    await targetOf(cdp, (t) => t.type === 'service_worker' && t.url.includes(extensionId)),
  );
  /** @param {string} expression */
  const sw = (expression) => cdp.evaluate(expression, worker);
  await ready(sw);
  const main = await sw(
    `chrome.windows.getAll().then((ws) => ws.find((w) => w.type === 'normal').id)`,
  );
  await sw(
    `chrome.windows.update(${main}, { left: 60, top: 60, width: 1300, height: 820 }).then(() => 1)`,
  );
  for (const page of [...PAGES.slice(1), 'one']) await show(cdp, url(page)); // a screenshot each
  const sessions = new Map();
  /** @param {string} page @returns {Promise<string>} a session on that page's tab */
  const session = async (page) => {
    // A restored tab (its window was closed) is a new target: attach again when it changes.
    const targetId = await targetOf(cdp, (t) => t.type === 'page' && t.url === url(page));
    if (sessions.get(page)?.targetId !== targetId) {
      const sid = await cdp.attach(targetId);
      await cdp.send('Runtime.enable', {}, sid);
      await cdp.send('Page.enable', {}, sid);
      sessions.set(page, { targetId, sid });
    }
    return sessions.get(page).sid;
  };
  return { cdp, sw, main, url, session, ...dockHelpers(cdp, session) };
}

/** A just-loaded worker can be attached before its extension APIs exist. */
async function ready(/** @type {(e: string) => Promise<unknown>} */ sw) {
  for (let i = 0; i < 50; i++) {
    if (await sw(`typeof chrome !== 'undefined' && Boolean(chrome.windows)`).catch(() => false))
      return;
    await sleep(100);
  }
  throw new Error('extension service worker never got its APIs');
}

/** @param {import('./cdp.js').Cdp} cdp @param {(t: { type: string, url: string }) => boolean} test */
async function targetOf(cdp, test) {
  for (let i = 0; i < 50; i++) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const found = targetInfos.find(test);
    if (found) return found.targetId;
    await sleep(100);
  }
  throw new Error('target not found');
}

/** @param {import('./cdp.js').Cdp} cdp @param {string} url */
async function show(cdp, url) {
  await cdp.send('Target.activateTarget', { targetId: await targetOf(cdp, (t) => t.url === url) });
  await sleep(1500);
}

/**
 * @param {import('./cdp.js').Cdp} cdp
 * @param {(page: string) => Promise<string>} session
 */
function dockHelpers(cdp, session) {
  /** Runs in the page's Tab Dock world (the live instance's), where the closed root opens. */
  const inDock = async (/** @type {string} */ page, /** @type {string} */ expression) => {
    const sid = await session(page);
    const contexts = cdp.events
      .filter((e) => e.sessionId === sid && e.params?.context?.name === 'Tab Dock')
      .map((e) => e.params.context.id)
      .reverse();
    for (const id of contexts)
      if (await cdp.evaluate(LIVE, sid, id).catch(() => false))
        return cdp.evaluate(expression, sid, id);
    throw new Error(`no live dock on ${page}`);
  };
  const mouse = async (/** @type {string} */ page, type, x, y, buttons = 0) =>
    cdp.send(
      'Input.dispatchMouseEvent',
      { type, x, y, buttons, button: 'left', clickCount: 1 },
      await session(page),
    );
  const rectOf = (/** @type {string} */ selector) =>
    `(() => { const r = ${ROOT}.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom, x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`;
  return { inDock, mouse, rectOf, root: ROOT };
}
