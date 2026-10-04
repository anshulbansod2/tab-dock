import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadContent } from './helpers/content.js';

let ns;
beforeAll(async () => {
  ns = await loadContent('core', 'format');
});

describe('truncate', () => {
  it('keeps short text', () => expect(ns.truncate('Inbox', 24)).toBe('Inbox'));
  it('cuts long text with an ellipsis at the limit', () => {
    const out = ns.truncate('A very long title that keeps going', 24);
    expect(out).toBe('A very long title that…');
    expect([...out]).toHaveLength(23);
  });
  it('never splits an emoji', () => {
    expect(ns.truncate('😀😀😀😀', 3)).toBe('😀😀…');
  });
});

describe('safeFavicon', () => {
  it.each([
    ['https://a.com/f.ico', 'https://a.com/f.ico'],
    ['http://a.com/f.ico', 'http://a.com/f.ico'],
    ['data:image/png;base64,AAAA', 'data:image/png;base64,AAAA'],
    ['javascript:alert(1)', null],
    ['data:text/html,<script>', null],
    ['chrome://favicon/x', null],
    ['', null],
    [null, null],
  ])('%s → %s', (input, expected) => expect(ns.safeFavicon(input)).toBe(expected));
});

describe('group helpers', () => {
  it('labels and colours a group', () => {
    const group = { id: 1, title: 'Work', color: 'blue' };
    expect(ns.groupLabel(group)).toBe('Work');
    expect(ns.groupColor(group)).toBe(ns.constants.GROUP_COLORS.blue);
  });
  it('labels ungrouped tabs and uses the neutral colour', () => {
    expect(ns.groupLabel(null)).toBe('Ungrouped');
    expect(ns.groupColor(null)).toBe(ns.constants.NEUTRAL_COLOR);
  });
  it('falls back to neutral for an unknown colour', () => {
    expect(ns.groupColor({ id: 1, title: 'x', color: 'chartreuse' })).toBe(
      ns.constants.NEUTRAL_COLOR,
    );
  });
});

describe('logger', () => {
  it('prefixes lines', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    ns.logger.warn('w');
    ns.logger.error('e');
    expect(warn).toHaveBeenCalledWith('[hover-helper]', 'w');
    expect(error).toHaveBeenCalledWith('[hover-helper]', 'e');
  });
});
