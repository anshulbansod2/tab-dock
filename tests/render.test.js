// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadContent } from './helpers/content.js';

let ns;
let mount;
let shadow;

beforeAll(async () => {
  ns = await loadContent('core', 'format', 'styles', 'dom', 'render');
});

beforeEach(() => {
  document.body.replaceChildren();
  const host = document.createElement('div');
  document.body.append(host);
  shadow = host.attachShadow({ mode: 'open' });
  mount = document.createElement('div');
  shadow.append(mount);
});

const tab = (id, extra = {}) => ({
  id,
  title: `Tab ${id}`,
  favIconUrl: `https://site${id}.test/favicon.ico`,
  active: false,
  ...extra,
});
const grouped = {
  group: { id: 10, title: 'Research', color: 'blue' },
  tabs: [tab(1), tab(2, { active: true }), tab(3)],
};
const tabsIn = () => [...mount.querySelectorAll('[role="tab"]')];
const renderTabs = (tabs) =>
  ns.render(mount, { snapshot: { group: null, tabs }, collapsed: false });

describe('render (expanded)', () => {
  it('shows the group label, one tab per entry, + and collapse', () => {
    ns.render(mount, { snapshot: grouped, collapsed: false });
    expect(mount.querySelector('.hh-label').textContent).toBe('Research');
    expect(tabsIn().map((t) => t.textContent)).toEqual(['Tab 1', 'Tab 2', 'Tab 3']);
    expect(mount.querySelector('[role="tablist"]').getAttribute('aria-label')).toBe(
      'Tabs in Research',
    );
    expect(mount.querySelector('[data-action="new"]').getAttribute('aria-label')).toBe(
      'New tab in Research',
    );
    expect(mount.querySelector('[data-action="collapse"]').getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('highlights the active tab with roving tabindex', () => {
    ns.render(mount, { snapshot: grouped, collapsed: false });
    expect(tabsIn().map((t) => t.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(tabsIn().map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('makes the first tab focusable when none is active', () => {
    renderTabs([tab(1), tab(2)]);
    expect(tabsIn().map((t) => t.tabIndex)).toEqual([0, -1]);
  });

  it('labels ungrouped tabs and sets the group colour variable', () => {
    renderTabs([tab(1)]);
    expect(mount.querySelector('.hh-label').textContent).toBe('Ungrouped');
    ns.render(mount, { snapshot: grouped, collapsed: false });
    expect(mount.querySelector('.hh-bar').style.getPropertyValue('--hh-group')).toBe(
      ns.constants.GROUP_COLORS.blue,
    );
  });

  it('truncates long titles but keeps the full title as a tooltip', () => {
    const long = 'An extremely long page title that will not fit';
    renderTabs([tab(1, { title: long })]);
    expect(tabsIn()[0].textContent).toBe(ns.truncate(long, 24));
    expect(tabsIn()[0].title).toBe(long);
  });

  it('renders hostile titles as inert text', () => {
    const evil = '<img src=x onerror="window.pwned=1">';
    renderTabs([tab(1, { title: evil })]);
    expect(mount.querySelector('img[src="x"]')).toBeNull();
    expect(tabsIn()[0].title).toBe(evil);
    expect(window.pwned).toBeUndefined();
  });

  it('uses a placeholder for unsafe or broken favicons', () => {
    renderTabs([
      tab(1),
      tab(2, { favIconUrl: 'javascript:alert(1)' }),
      tab(3, { favIconUrl: null }),
    ]);
    expect(mount.querySelectorAll('img.hh-favicon')).toHaveLength(1);
    expect(mount.querySelectorAll('.hh-favicon--placeholder')).toHaveLength(2);
    mount.querySelector('img.hh-favicon').dispatchEvent(new Event('error'));
    expect(mount.querySelectorAll('.hh-favicon--placeholder')).toHaveLength(3);
  });

  it('gives each close button an accessible name and the tab id', () => {
    ns.render(mount, { snapshot: grouped, collapsed: false });
    const close = mount.querySelector('[data-action="close"][data-tab-id="3"]');
    expect(close.getAttribute('aria-label')).toBe('Close Tab 3');
    expect(close.tabIndex).toBe(-1);
  });
});

describe('render (collapsed)', () => {
  it('shows only a pill with the count', () => {
    ns.render(mount, { snapshot: grouped, collapsed: true });
    const pill = mount.querySelector('[data-action="expand"]');
    expect(mount.querySelector('.hh-bar')).toBeNull();
    expect(pill.textContent).toBe('3');
    expect(pill.getAttribute('aria-label')).toBe('Show tab bar: 3 tabs in Research');
    expect(pill.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('render (focus)', () => {
  it('keeps focus on the same tab across re-renders', () => {
    ns.render(mount, { snapshot: grouped, collapsed: false });
    tabsIn()[2].focus();
    ns.render(mount, {
      snapshot: { ...grouped, tabs: [tab(0), ...grouped.tabs] },
      collapsed: false,
    });
    expect(shadow.activeElement.getAttribute('data-tab-id')).toBe('3');
  });

  it('moves focus between the collapse button and the pill when toggling', () => {
    ns.render(mount, { snapshot: grouped, collapsed: false });
    mount.querySelector('[data-action="collapse"]').focus();
    ns.render(mount, { snapshot: grouped, collapsed: true });
    expect(shadow.activeElement.getAttribute('data-action')).toBe('expand');
    ns.render(mount, { snapshot: grouped, collapsed: false });
    expect(shadow.activeElement.getAttribute('data-action')).toBe('collapse');
  });
});

describe('styles', () => {
  it('defines light and dark tokens and a visible focus ring', () => {
    expect(ns.styles).toContain('prefers-color-scheme: dark');
    expect(ns.styles).toContain(':focus-visible');
  });
});
