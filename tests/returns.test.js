import { beforeEach, describe, expect, it } from 'vitest';
import { createReturns } from '../background/returns.js';
import { createStorage } from './helpers/chrome.js';

let store;
let returns;

beforeEach(() => {
  store = createStorage();
  returns = createReturns({ store });
});

describe('createReturns', () => {
  it('remembers, per window, which tab a hover card was opened from', async () => {
    await returns.remember(1, { from: 4, to: 7 });
    expect(await returns.get(1)).toEqual({ from: 4, to: 7 });
    expect(await returns.get(2)).toBeNull();
  });

  it('keeps the way back only while the opened tab stays in front', async () => {
    await returns.remember(1, { from: 4, to: 7 });
    expect(await returns.activated(1, 7)).toBe(false);
    expect(await returns.get(1)).toEqual({ from: 4, to: 7 });
    expect(await returns.activated(1, 5)).toBe(true); // changed: its bars need a refresh
    expect(await returns.get(1)).toBeNull();
    expect(store.data).toEqual({});
  });

  it('forgets it when either tab closes', async () => {
    await returns.remember(1, { from: 4, to: 7 });
    await returns.remember(2, { from: 8, to: 9 });
    expect(await returns.closed(4)).toEqual([1]);
    expect(await returns.get(1)).toBeNull();
    expect(await returns.closed(9)).toEqual([2]);
    expect(store.data).toEqual({});
  });
});
