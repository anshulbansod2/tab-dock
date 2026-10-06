// Starts what a check run needs: a test site, a copy of the extension, and a visible Chrome.
// Headless Chrome ignores window bounds and never changes focus, so it can't check either.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, sleep } from './cdp.js';

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
];
const EXTENSION_PARTS = ['manifest.json', 'background', 'content', 'popup', 'icons'];
export const PAGES = ['one', 'two', 'three', 'four'];

/** @returns {Promise<number>} */
function freePort() {
  return new Promise((resolve) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
      server.close(() => resolve(port));
    });
  });
}

/** Simple, distinct pages: each is a tab in the dock. */
async function serveSite() {
  const port = await freePort();
  const server = createServer((req, res) => {
    const name = (req.url ?? '').replace(/^\/|\.html$/g, '');
    const body = PAGES.includes(name)
      ? `<!doctype html><title>Page ${name}</title><body style="margin:0;height:200vh"><h1>Page ${name}</h1>`
      : 'not found';
    res.writeHead(PAGES.includes(name) ? 200 : 404, { 'content-type': 'text/html' });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(undefined)));
  return { origin: `http://localhost:${port}`, close: () => server.close() };
}

/** @param {string} root - the repo */
async function copyExtension(root, dir) {
  for (const part of EXTENSION_PARTS)
    await cp(join(root, part), join(dir, part), { recursive: true });
}

/** @param {number} port */
async function waitForChrome(port) {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/json/version`);
      return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error('Chrome did not start');
}

/**
 * @param {string} root - the repo, whose extension files are copied and loaded
 */
export async function startBrowser(root) {
  const binary = process.env.CHROME_PATH ?? CHROME_PATHS.find((path) => existsSync(path));
  if (!binary) throw new Error('No Chrome found: set CHROME_PATH');
  const work = await mkdtemp(join(tmpdir(), 'tab-dock-check-'));
  const site = await serveSite();
  await copyExtension(root, join(work, 'extension'));
  const port = await freePort();
  // No --window-size or --window-position: they force every new window, popups included.
  const chrome = spawn(
    binary,
    [
      `--user-data-dir=${join(work, 'profile')}`,
      `--remote-debugging-port=${port}`,
      '--enable-unsafe-extension-debugging',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const stop = async () => {
    chrome.kill();
    site.close();
    await sleep(500);
    await rm(work, { recursive: true, force: true });
  };
  try {
    await waitForChrome(port);
    const cdp = await connect(port);
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: join(work, 'extension') });
    return { cdp, extensionId: id, origin: site.origin, stop };
  } catch (err) {
    await stop();
    throw err;
  }
}
