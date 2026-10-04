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
  favIconUrl: `data:image/png;base64,AAA${id}`,
  active: false,
  ...extra,
});
const grouped = {
  group: { id: 10, title: 'Research', color: 'blue' },
  tabs: [tab(1), tab(2, { active: true }), tab(3)],
};
const tabsIn = () => [...mount.querySelectorAll('button.hh-tab')];
const renderTabs = (tabs) =>
  ns.render(mount, { snapshot: { group: null, tabs }, collapsed: false });

describe('render (expanded)', () => {
  it('shows the group label, one tab per entry, + and collapse', () => {
    ns.render(mount, { snapshot: grouped, collapsed: false });
    expect(mount.querySelector('.hh-label').textContent).toBe('Research');
    expect(tabsIn().map((t) => t.textContent)).toEqual(['Tab 1', 'Tab 2', 'Tab 3']);
    expect(mount.querySelector('[role="toolbar"]').getAttribute('aria-label')).toBe(
      'Tabs in Research',
    );
    expect(mount.querySelector('[data-action="new"]').getAttribute('aria-label')).toBe(
      'New tab in Research',
    );
    expect(mount.querySelector('[data-action="collapse"]').getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('is a toolbar holding a list of native tab buttons, each with its close button', () => {
    ns.render(mount, { snapshot: grouped, collapsed: false });
    const items = [...mount.querySelectorAll('[role="toolbar"] > ul > li')];
    expect(items).toHaveLength(3);
    for (const item of items) {
      const [tabButton, close] = item.children;
      expect(tabButton.tagName).toBe('BUTTON');
      expect(tabButton.type).toBe('button');
      expect(tabButton.className).toContain('hh-tab');
      expect(tabButton.dataset.action).toBe('activate');
      expect(close.tagName).toBe('BUTTON');
      expect(close.dataset.action).toBe('close');
    }
    expect(mount.querySelector('[role="tab"], [role="tablist"], [aria-selected]')).toBeNull();
  });

  it('marks the current tab with aria-current and roving tabindex', () => {
    ns.render(mount, { snapshot: grouped, collapsed: false });
    expect(tabsIn().map((t) => t.getAttribute('aria-current'))).toEqual([null, 'page', null]);
    expect(tabsIn().map((t) => t.getAttribute('aria-keyshortcuts'))).toEqual([
      'Delete',
      'Delete',
      'Delete',
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

  it('keeps the full title as the accessible name, truncating only visually', () => {
    const long = 'An extremely long page title that will not fit';
    renderTabs([tab(1, { title: long })]);
    expect(tabsIn()[0].textContent).toBe(long);
    expect(tabsIn()[0].title).toBe(long); // mouse tooltip
    expect(ns.styles).toMatch(
      /\.hh-title\s*\{[^}]*max-width:\s*24ch[^}]*text-overflow:\s*ellipsis/,
    );
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

describe('render (stability)', () => {
  const favicon = (id) => mount.querySelector(`[data-tab-id="${id}"] img.hh-favicon`);

  it('reuses a tab’s decoded favicon across re-renders so icons never flicker', () => {
    ns.render(mount, { snapshot: grouped, collapsed: false });
    const before = favicon(1);
    ns.render(mount, { snapshot: grouped, collapsed: false });
    expect(favicon(1)).toBe(before);
  });

  it('swaps the favicon when the tab’s icon changes', () => {
    ns.render(mount, { snapshot: grouped, collapsed: false });
    const before = favicon(1);
    const changed = { ...grouped, tabs: [tab(1, { favIconUrl: 'data:image/png;base64,NEW' })] };
    ns.render(mount, { snapshot: changed, collapsed: false });
    expect(favicon(1)).not.toBe(before);
    expect(favicon(1).getAttribute('src')).toBe('data:image/png;base64,NEW');
  });
});

describe('styles', () => {
  it('animates only the bar’s first appearance, not every re-render', () => {
    expect(ns.styles).not.toMatch(/\.hh-bar\s*\{[^}]*animation/);
    expect(ns.styles).toMatch(/:host\s*\{[^}]*animation/);
  });

  it('defines light and dark tokens and a visible focus ring', () => {
    expect(ns.styles).toContain('--hh-bg: light-dark(#ffffff, #202124)');
    expect(ns.styles).not.toContain('prefers-color-scheme'); // one token set, no duplicate block
    expect(ns.styles).toContain(':focus-visible');
  });

  it('opts the painted surfaces into light and dark, re-resolving their text colour', () => {
    // color-scheme belongs on elements with a background; color is re-specified there because
    // an inherited light-dark() colour would arrive already resolved.
    for (const surface of ['hh-bar', 'hh-pill']) {
      const rule = ns.styles.match(new RegExp(`\\.${surface}\\s*\\{([^}]*)\\}`))[1];
      expect(rule).toMatch(/color-scheme:\s*light dark/);
      expect(rule).toMatch(/background:\s*var\(--hh-bg\)/);
      expect(rule).toMatch(/(^|[\s;])color:\s*var\(--hh-fg\)/);
    }
  });
});
