import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadContent } from './helpers/content.js';

let ns;
beforeAll(async () => {
  ns = await loadContent('core', 'format');
});

describe('safeFavicon', () => {
  it.each([
    // Remote URLs would leak other tabs' sites to the page (resource timing, CSP reports).
    ['https://a.com/f.ico', null],
    ['http://a.com/f.ico', null],
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
    expect(warn).toHaveBeenCalledWith('[tab-dock]', 'w');
    expect(error).toHaveBeenCalledWith('[tab-dock]', 'e');
  });
});
