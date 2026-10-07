// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('render (icons)', () => {
  it('makes the group name the collapse control (no separate collapse icon)', () => {
    ns.render(mount, { snapshot: grouped, collapsed: false });
    const label = mount.querySelector('.hh-label');
    expect(label.tagName).toBe('BUTTON');
    expect(label.getAttribute('data-action')).toBe('collapse');
    expect(label.getAttribute('aria-expanded')).toBe('true');
    expect(label.textContent).toBe('Research');
    expect(mount.querySelectorAll('[data-action="collapse"]')).toHaveLength(1);
  });

  it.each(['new', 'close'])(
    'draws the %s button as a decorative SVG icon, named by its aria-label',
    (action) => {
      ns.render(mount, { snapshot: grouped, collapsed: false });
      const button = mount.querySelector(`[data-action="${action}"]`);
      expect(button.querySelector('svg[aria-hidden="true"] path')).not.toBeNull();
      expect(button.textContent).toBe('');
      expect(button.getAttribute('aria-label')).toBeTruthy();
    },
  );
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
  const rule = (selector) =>
    ns.styles.match(
      new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`),
    )?.[2] ?? '';

  it('never animates in CSS, so re-renders cannot replay an entrance', () => {
    // The one entrance animation runs from bar.js on the host (whose styles are pinned inline).
    expect(ns.styles).not.toMatch(/animation:/);
  });

  it("spaces the group editor itself, not with the menu's tighter gap and padding", () => {
    // Same specificity would let the later .hh-menu rule win; the editor's must outrank it.
    expect(rule('.hh-menu.hh-editor')).toMatch(/gap: 8px/);
    expect(rule('.hh-menu.hh-editor')).toMatch(/padding: 12px 12px 8px/);
  });

  it('rings the whole chip, close button included, when its tab has keyboard focus', () => {
    expect(rule('.hh-chip:has(> .hh-tab:focus-visible)')).toMatch(/outline: 2px solid/);
    expect(ns.styles).not.toMatch(/\.hh-tab:focus-visible\s*[,{]/); // not the tab button alone
  });

  it('defines one light-dark() token set and a visible focus ring', () => {
    expect(ns.styles).toMatch(/--hh-glass:\s*light-dark\(/);
    expect(ns.styles).not.toContain('prefers-color-scheme');
    expect(ns.styles).toContain(':focus-visible');
  });

  it('opts the painted surfaces into light and dark, re-resolving their text colour', () => {
    for (const surface of ['.hh-bar', '.hh-pill']) {
      expect(rule(surface)).toMatch(/color-scheme:\s*light dark/);
      expect(rule(surface)).toMatch(/background:\s*var\(--hh-glass\)/);
      expect(rule(surface)).toMatch(/(^|[\s;])color:\s*var\(--hh-fg\)/);
    }
  });

  it('floats as a centred, rounded glass dock above the bottom edge', () => {
    expect(rule('.hh-root')).toMatch(/justify-content:\s*center/);
    expect(rule('.hh-root')).toMatch(/padding:[^;]*12px/);
    expect(rule('.hh-bar')).toMatch(/border-radius:\s*16px/);
    expect(rule('.hh-bar')).toMatch(/max-width:\s*min\(960px/);
    expect(rule('.hh-bar')).toMatch(/backdrop-filter:\s*blur\(/);
  });

  it('falls back to a solid surface without blur support or when transparency is reduced', () => {
    expect(ns.styles).toMatch(/@supports not \(backdrop-filter: blur\(1px\)\)[\s\S]*?--hh-solid/);
    expect(ns.styles).toMatch(/prefers-reduced-transparency: reduce[\s\S]*?--hh-solid/);
  });

  it('uses the group colour as the dock’s identity: edge glow and current-tab indicator', () => {
    expect(rule('.hh-bar::after')).toMatch(/var\(--hh-group\)/);
    expect(rule('.hh-bar::after')).toMatch(/box-shadow:[^;]*var\(--hh-group\)/); // a glow, not a hairline
    expect(ns.styles).toMatch(
      /\.hh-chip:has\(> \[aria-current='page'\]\)::after\s*\{[^}]*var\(--hh-group\)/,
    );
  });

  it('shrinks tab chips to fit before scrolling, like Chrome’s own tab strip', () => {
    expect(rule('.hh-list')).toMatch(/width:\s*100%/);
    expect(rule('.hh-chip')).toMatch(/flex:\s*0 1 auto/);
    expect(rule('.hh-chip')).toMatch(/min-width:\s*\d+px/);
    expect(rule('.hh-tab')).toMatch(/min-width:\s*0/);
  });

  it('drops the default-spot padding once the dock has been dragged somewhere', () => {
    expect(ns.styles).toMatch(/:host\(\[data-placed\]\) \.hh-root\s*\{[^}]*padding:\s*0/);
    expect(rule('.hh-bar')).toMatch(/max-width:\s*min\(960px, calc\(100vw - 24px\)\)/);
  });

  it('fades the tab strip’s edges with a mask rather than an overlay', () => {
    expect(rule('.hh-tabs')).toMatch(/mask-image:\s*linear-gradient/);
  });
});

describe('render (peeking)', () => {
  it("turns a peeked tab's own dock into a Return button", () => {
    ns.render(mount, {
      snapshot: { ...grouped, peek: { home: grouped.group } },
      collapsed: false,
    });
    expect(mount.querySelector('.hh-tabs')).toBeNull();
    const back = mount.querySelector('[data-action="return"]');
    expect(back.textContent).toBe('Return to Research');
    expect(mount.querySelector('.hh-bar').style.getPropertyValue('--hh-group')).toBe('#1a73e8');
  });

  it('says "Ungrouped" for a peeked tab with no group, even when collapsed', () => {
    ns.render(mount, { snapshot: { ...grouped, peek: { home: null } }, collapsed: true });
    expect(mount.querySelector('[data-action="return"]').textContent).toBe('Return to Ungrouped');
  });
});

describe('render (group switcher)', () => {
  const work = { id: 10, title: 'Research', color: 'blue' };
  const read = { id: 20, title: 'Reading', color: 'orange' };
  const withGroups = { ...grouped, groups: [work, read], hasUngrouped: true };
  const browse = {
    view: { group: read, tabs: [tab(7), tab(8), tab(9)], lastId: 8 },
    width: 612,
  };
  const swatches = () => [...mount.querySelectorAll('.hh-swatch')];

  it('shows a swatch per group, then one for the ungrouped tabs, marking your own', () => {
    ns.render(mount, { snapshot: withGroups, collapsed: false });
    expect(swatches().map((s) => s.dataset.groupId)).toEqual(['10', '20', '-1']);
    expect(swatches().map((s) => s.getAttribute('aria-label'))).toEqual([
      'Research (your group)',
      'Reading',
      'Ungrouped',
    ]);
    expect(swatches()[0].getAttribute('aria-current')).toBe('true');
    expect(swatches().map((s) => s.tabIndex)).toEqual([0, -1, -1]);
    expect(mount.querySelector('.hh-groups').getAttribute('role')).toBe('toolbar');
  });

  it('has no switcher when there is nowhere else to go', () => {
    ns.render(mount, { snapshot: { ...grouped, groups: [work] }, collapsed: false });
    expect(mount.querySelector('.hh-groups')).toBeNull();
  });

  it("shows the browsed group's name, colour and tabs at the dock's old width", () => {
    ns.render(mount, { snapshot: withGroups, collapsed: false, browse });
    const bar = mount.querySelector('.hh-bar');
    expect(bar.hasAttribute('data-browsing')).toBe(true);
    expect(bar.style.width).toBe('612px');
    expect(bar.style.getPropertyValue('--hh-group')).toBe('#fa903e');
    expect(mount.querySelector('.hh-label-text').textContent).toBe('Reading');
    expect(tabsIn().map((t) => t.textContent)).toEqual(['Tab 7', 'Tab 8', 'Tab 9']);
    expect(mount.querySelector('[data-last]').querySelector('.hh-tab').dataset.tabId).toBe('8');
    expect(mount.querySelector('[data-action="back"]').textContent).toBe('Back');
    expect(mount.querySelector('[data-action="new"]')).toBeNull();
    expect(swatches()[1].hasAttribute('data-shown')).toBe(true);
    expect(swatches().map((s) => s.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('keeps the swatch elements across renders, so one under the pointer still takes the click', () => {
    ns.render(mount, { snapshot: withGroups, collapsed: false });
    const before = swatches();
    ns.render(mount, { snapshot: withGroups, collapsed: false, browse });
    expect(swatches()).toEqual(before);
    expect(swatches().every((s, i) => s === before[i])).toBe(true);
    expect(before[1].hasAttribute('data-shown')).toBe(true);
    expect(before[0].hasAttribute('data-shown')).toBe(false);
  });

  it('slides the tabs in from the side of the newly shown group, and only then', () => {
    const animate = vi.fn();
    HTMLElement.prototype.animate = animate;
    try {
      ns.render(mount, { snapshot: withGroups, collapsed: false });
      ns.render(mount, { snapshot: withGroups, collapsed: false, browse });
      expect(animate).toHaveBeenCalledOnce();
      expect(animate.mock.contexts[0]).toBe(mount.querySelector('.hh-list'));
      expect(animate.mock.calls[0][0][0].transform).toBe('translateX(10px)'); // from the right
      ns.render(mount, { snapshot: withGroups, collapsed: false, browse }); // same group again
      ns.render(mount, { snapshot: withGroups, collapsed: false });
      expect(animate).toHaveBeenCalledTimes(2);
      expect(animate.mock.calls[1][0][0].transform).toBe('translateX(-10px)');
    } finally {
      delete HTMLElement.prototype.animate;
    }
  });

  it('keeps keyboard focus on the same swatch', () => {
    ns.render(mount, { snapshot: withGroups, collapsed: false });
    swatches()[1].focus();
    ns.render(mount, { snapshot: withGroups, collapsed: false, browse });
    expect(shadow.activeElement).toBe(swatches()[1]);
  });
});
