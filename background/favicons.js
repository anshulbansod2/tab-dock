// @ts-check
import { INJECTABLE_URL } from './constants.js';

const FAVICON_SIZE = '32';
const DEFAULT_CACHE_SIZE = 200;
const CHUNK = 0x8000;

/**
 * Serves favicons as inline data: URLs from Chrome's own favicon cache. Pages never receive
 * other tabs' favicon URLs, which would otherwise leak the sites in the group through resource
 * timing or CSP reports. Cached per origin (LRU) so memory stays bounded; the cache lives only
 * as long as the service worker does.
 *
 * @param {{ api: typeof chrome, fetchFn?: typeof fetch, max?: number }} deps
 */
export function createFavicons({ api, fetchFn = fetch, max = DEFAULT_CACHE_SIZE }) {
  /** @type {Map<string, Promise<string | null>>} */
  const cache = new Map();

  /** @param {string} pageUrl */
  async function load(pageUrl) {
    const url = new URL(api.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', pageUrl);
    url.searchParams.set('size', FAVICON_SIZE);
    try {
      const res = await fetchFn(url.href);
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.startsWith('image/')) return null;
      return toDataUrl(new Uint8Array(await res.arrayBuffer()), type);
    } catch {
      return null;
    }
  }

  /**
   * @param {string | undefined} pageUrl
   * @returns {Promise<string | null>}
   */
  function forPage(pageUrl) {
    const origin = originOf(pageUrl);
    if (!origin || !pageUrl) return Promise.resolve(null);
    let entry = cache.get(origin);
    if (entry) {
      cache.delete(origin); // re-insert to mark as most recently used
    } else {
      entry = load(pageUrl);
    }
    cache.set(origin, entry);
    if (cache.size > max) cache.delete(/** @type {string} */ (cache.keys().next().value));
    return entry;
  }

  /**
   * @param {Snapshot} snapshot
   * @param {chrome.tabs.Tab[]} tabs - The window's tabs, for each bar tab's page URL.
   * @returns {Promise<Snapshot>}
   */
  async function inline(snapshot, tabs) {
    const urlById = new Map(tabs.map((tab) => [tab.id, tab.url]));
    const icons = await Promise.all(snapshot.tabs.map((tab) => forPage(urlById.get(tab.id))));
    return { ...snapshot, tabs: snapshot.tabs.map((tab, i) => ({ ...tab, favIconUrl: icons[i] })) };
  }

  return { inline };
}

/**
 * @param {string | undefined} pageUrl
 * @returns {string | null}
 */
function originOf(pageUrl) {
  if (!pageUrl || !INJECTABLE_URL.test(pageUrl)) return null;
  try {
    return new URL(pageUrl).origin;
  } catch {
    return null;
  }
}

/**
 * @param {Uint8Array} bytes
 * @param {string} type
 */
function toDataUrl(bytes, type) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${type};base64,${btoa(binary)}`;
}
