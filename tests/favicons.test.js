import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFavicons } from '../background/favicons.js';
import { createChrome } from './helpers/chrome.js';

const PNG = new Uint8Array([137, 80, 78, 71]);
let api;
let fetchFn;
let favicons;

const response = (ok = true, type = 'image/png') => ({
  ok,
  headers: { get: () => type },
  arrayBuffer: async () => PNG.buffer,
});

const snap = (...tabs) => ({
  group: null,
  tabs: tabs.map(([id]) => ({
    id,
    title: `T${id}`,
    favIconUrl: 'https://leak.test/f.ico',
    active: false,
  })),
});
const tabsFor = (...tabs) => tabs.map(([id, url]) => ({ id, url }));

beforeEach(() => {
  api = createChrome();
  fetchFn = vi.fn(async () => response());
  favicons = createFavicons({ api, fetchFn, max: 2 });
});

describe('createFavicons.inline', () => {
  it('replaces favicon URLs with inline data from Chrome’s favicon cache', async () => {
    const out = await favicons.inline(snap([1]), tabsFor([1, 'https://a.test/page']));
    expect(out.tabs[0].favIconUrl).toBe(`data:image/png;base64,${btoa('\x89PNG')}`);
    const requested = new URL(fetchFn.mock.calls[0][0]);
    // Node reports origin 'null' for chrome-extension: URLs, so compare the prefix.
    expect(requested.href).toMatch(/^chrome-extension:\/\/ext-id\/_favicon\/\?/);
    expect(requested.searchParams.get('pageUrl')).toBe('https://a.test/page');
    expect(requested.searchParams.get('size')).toBe('32');
  });

  it('fetches once per origin', async () => {
    await favicons.inline(
      snap([1], [2]),
      tabsFor([1, 'https://a.test/x'], [2, 'https://a.test/y']),
    );
    await favicons.inline(snap([1]), tabsFor([1, 'https://a.test/z']));
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('evicts the least recently used origin beyond the cap', async () => {
    const load = (url) => favicons.inline(snap([1]), tabsFor([1, url]));
    await load('https://a.test/');
    await load('https://b.test/');
    await load('https://a.test/'); // touch a → b is now oldest
    await load('https://c.test/');
    await load('https://a.test/');
    expect(fetchFn).toHaveBeenCalledTimes(3);
    await load('https://b.test/');
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['a non-web page', () => {}, 'chrome://settings/'],
    ['a failed fetch', () => fetchFn.mockRejectedValueOnce(new TypeError('x')), 'https://a.test/'],
    ['a non-OK response', () => fetchFn.mockResolvedValueOnce(response(false)), 'https://a.test/'],
    [
      'a non-image response',
      () => fetchFn.mockResolvedValueOnce(response(true, 'text/html')),
      'https://a.test/',
    ],
    ['an unparsable URL', () => {}, 'not a url'],
  ])('falls back to null for %s', async (_name, arrange, url) => {
    arrange();
    const out = await favicons.inline(snap([1]), tabsFor([1, url]));
    expect(out.tabs[0].favIconUrl).toBeNull();
  });
});
