import { describe, expect, it, vi } from 'vitest';
import { isStaleTabError, logger } from '../background/logger.js';

describe('logger', () => {
  it('prefixes every line', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.warn('a', 1);
    logger.error('b');
    expect(warn).toHaveBeenCalledWith('[hover-helper]', 'a', 1);
    expect(error).toHaveBeenCalledWith('[hover-helper]', 'b');
  });
});

describe('isStaleTabError', () => {
  it.each([
    [new Error('No tab with id: 12.'), true],
    [new Error('No group with id: 3.'), true],
    [new Error('Tabs cannot be edited right now'), false],
    ['No tab with id: 12.', false],
    [undefined, false],
  ])('%s → %s', (err, expected) => {
    expect(isStaleTabError(err)).toBe(expected);
  });
});
