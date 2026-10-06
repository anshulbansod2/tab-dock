// @ts-check
import { INJECTABLE_URL } from './constants.js';
import { logger } from './logger.js';

const KEY_PREFIX = 'preview:';
const INDEX_KEY = 'preview:index';
const DEFAULT_MAX = 60;
const DEFAULT_SETTLE_MS = 600;
const WIDTH_PX = 480;

/**
 * Screenshots of tabs as the user last saw them, for the dock's hover cards. Chrome only lets
 * an extension capture a window's visible tab, so each tab is captured while it is on screen
 * (once it settles after a switch or load) and the picture is shown later. Stored in
 * storage.session: in memory only, cleared when Chrome quits, and surviving worker restarts.
 *
 * @param {object} deps
 * @param {typeof chrome} deps.api
 * @param {chrome.storage.StorageArea} [deps.store]
 * @param {(dataUrl: string) => Promise<string>} [deps.shrink]
 * @param {() => number} [deps.now]
 * @param {number} [deps.settleMs]
 * @param {number} [deps.max] - previews kept (oldest dropped first)
 */
export function createPreviews({
  api,
  store = api.storage.session,
  shrink = shrinkImage,
  now = Date.now,
  settleMs = DEFAULT_SETTLE_MS,
  max = DEFAULT_MAX,
}) {
  /** @type {Map<number, ReturnType<typeof setTimeout>>} */
  const timers = new Map();
  const index = createIndex(store, max);
  /** @param {number} windowId */
  const captureVisible = (windowId) => capture({ api, store, shrink, now, index }, windowId);

  return {
    /**
     * Captures the window's visible tab once it has settled (Chrome allows two captures a
     * second, and a fresh switch may still be painting).
     * @param {number} windowId
     */
    schedule(windowId) {
      if (windowId < 0) return;
      clearTimeout(timers.get(windowId));
      timers.set(
        windowId,
        setTimeout(() => {
          timers.delete(windowId);
          void captureVisible(windowId);
        }, settleMs),
      );
    },

    /**
     * The tab's last preview, unless it has since moved to another site.
     * @param {number} tabId
     * @returns {Promise<{ image: string, at: number } | null>}
     */
    async get(tabId) {
      const saved = /** @type {{ image: string, at: number, url?: string } | undefined} */ (
        (await store.get(KEY_PREFIX + tabId))[KEY_PREFIX + tabId]
      );
      if (!saved) return null;
      const tab = await api.tabs.get(tabId).catch(() => null);
      if (!tab || originOf(tab.url) !== originOf(saved.url)) {
        await this.forget(tabId);
        return null;
      }
      return { image: saved.image, at: saved.at };
    },

    /** @param {number} tabId */
    async forget(tabId) {
      await store.remove(KEY_PREFIX + tabId);
      await index.remove(tabId);
    },
  };
}

/**
 * The most-recent-first list of previewed tabs; trimming it drops the oldest previews. Updates
 * run one at a time so overlapping captures never lose an entry.
 * @param {chrome.storage.StorageArea} store
 * @param {number} max
 */
function createIndex(store, max) {
  let writes = Promise.resolve();
  /** @param {(ids: number[]) => number[]} change */
  const update = (change) =>
    (writes = writes.then(async () => {
      const ids = /** @type {number[]} */ ((await store.get(INDEX_KEY))[INDEX_KEY] ?? []);
      const next = change(ids);
      const dropped = ids.filter((id) => !next.includes(id));
      if (next.length) await store.set({ [INDEX_KEY]: next });
      else await store.remove(INDEX_KEY);
      if (dropped.length) await store.remove(dropped.map((id) => KEY_PREFIX + id));
    }));
  return {
    /** @param {number} tabId */
    touch: (tabId) => update((ids) => [...ids.filter((id) => id !== tabId), tabId].slice(-max)),
    /** @param {number} tabId */
    remove: (tabId) => update((ids) => ids.filter((id) => id !== tabId)),
  };
}

/**
 * Screenshots the window's visible tab, unless it is private or a browser page.
 * @param {{ api: typeof chrome, store: chrome.storage.StorageArea,
 *   shrink: (dataUrl: string) => Promise<string>, now: () => number,
 *   index: ReturnType<typeof createIndex> }} deps
 * @param {number} windowId
 */
async function capture({ api, store, shrink, now, index }, windowId) {
  const [tab] = await api.tabs.query({ windowId, active: true });
  if (tab?.id === undefined || tab.incognito || !INJECTABLE_URL.test(tab.url ?? '')) return;
  const tabId = tab.id;
  try {
    const shot = await api.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 70 });
    const image = await shrink(shot);
    await store.set({ [KEY_PREFIX + tabId]: { image, at: now(), url: tab.url } });
    await index.touch(tabId);
  } catch (err) {
    logger.warn('preview capture skipped', err); // e.g. the tab changed or closed meanwhile
  }
}

/** @param {string | undefined} url */
function originOf(url) {
  try {
    return new URL(url ?? '').origin;
  } catch {
    return null;
  }
}

/**
 * Scales a screenshot down to card size as a JPEG data: URL (about 25 KB).
 * @param {string} dataUrl
 */
export async function shrinkImage(dataUrl) {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const scale = Math.min(1, WIDTH_PX / bitmap.width);
  const canvas = new OffscreenCanvas(
    Math.round(bitmap.width * scale),
    Math.round(bitmap.height * scale),
  );
  /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d')).drawImage(
    bitmap,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(binary)}`;
}
