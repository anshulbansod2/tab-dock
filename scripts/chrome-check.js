// Real-Chrome checks for what jsdom can't model: live-window placement, zoom, focus and closing.
// Opens a visible Chrome with a throwaway profile for a minute, then cleans up.
// Usage: npm run chrome-check   (CHROME_PATH=/path/to/chrome to pick a browser)
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBrowser } from './chrome-check/browser.js';
import { CHECKS, reset } from './chrome-check/checks.js';
import { openLab } from './chrome-check/lab.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await startBrowser(root);
let failed = 0;
try {
  const lab = await openLab(browser);
  for (const [name, run] of CHECKS) {
    await reset(lab);
    let outcome;
    try {
      outcome = await run(lab);
    } catch (err) {
      outcome = { status: 'FAIL', detail: `error: ${err instanceof Error ? err.message : err}` };
    }
    if (outcome.status === 'FAIL') failed++;
    console.log(`${outcome.status.padEnd(4)}  ${name}: ${outcome.detail}`);
  }
} finally {
  browser.cdp.close();
  await browser.stop();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exitCode = failed ? 1 : 0;
