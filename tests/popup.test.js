// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChrome, createEvent, flushPromises, makeTab } from './helpers/chrome.js';
import { loadContent } from './helpers/content.js';

let startPopup;
let api;
let close;
let popup;

beforeAll(async () => {
  await loadContent('core', 'format', 'styles', 'dom', 'render', 'events', 'view', 'switcher');
  ({ startPopup } = await import('../popup/popup.js'));
});

beforeEach(async () => {
  // jsdom has no layout; the switcher keeps the dock's measured width while browsing.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ width: 480, height: 44 }),
  );
  document.head.replaceChildren();
  document.body.replaceChildren();
  api = createChrome({
    tabs: [
      makeTab({ id: 1, index: 0, groupId: 10, active: true, title: 'Settings' }),
      makeTab({ id: 2, index: 1, groupId: 10, title: 'Docs' }),
      makeTab({ id: 3, index: 2, groupId: 20, title: 'Paper', lastAccessed: 5 }),
      makeTab({ id: 4, index: 3, windowId: 2, active: true, title: 'Elsewhere' }),
    ],
    groups: [
      { id: 10, windowId: 1, title: 'Work', color: 'blue' },
      { id: 20, windowId: 1, title: 'Read', color: 'red' },
    ],
  });
  api.tabs.query.mockImplementation(async ({ windowId, active, currentWindow }) =>
    api.state.tabs.filter(
      (t) =>
        (windowId === undefined || t.windowId === windowId) &&
        (!currentWindow || t.windowId === 1) &&
        (!active || t.active),
    ),
  );
  api.tabGroups.onCreated = createEvent();
  api.tabGroups.onUpdated = createEvent();
  api.tabGroups.onRemoved = createEvent();
  close = vi.fn();
  popup = await startPopup({ api, doc: document, close, favicons: { inline: async (s) => s } });
  await settle();
});

afterEach(() => popup.dispose());

async function settle() {
  await flushPromises();
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  await flushPromises();
}

const q = (sel) => document.querySelector(sel);
const titles = () => [...document.querySelectorAll('.hh-tab')].map((t) => t.textContent);

describe('toolbar popup', () => {
  it("shows the current window's active tab group, with that tab focused", () => {
    expect(q('.hh-label-text').textContent).toBe('Work');
    expect(titles()).toEqual(['Settings', 'Docs']);
    expect(document.activeElement).toBe(q('.hh-tab[data-tab-id="1"]'));
    expect(q('style').textContent).toContain('.hh-bar');
  });

  it("is wider than the dock's narrow-window layout, which hides the group's name", () => {
    const css = q('style').textContent;
    const narrow = Number(css.match(/@media \(max-width: (\d+)px\)/)[1]);
    const popup = Number(css.match(/body \{[^}]*width: (\d+)px/)[1]);
    expect(popup).toBeGreaterThan(narrow);
  });

  it('switches to a clicked tab and closes', async () => {
    q('.hh-tab[data-tab-id="2"]').click();
    await flushPromises();
    expect(api.tabs.update).toHaveBeenCalledWith(2, { active: true });
    expect(close).toHaveBeenCalledOnce();
  });

  it("shows another group's tabs from the switcher and opens one", async () => {
    const swatch = q('.hh-swatch[data-group-id="20"]');
    const move = new MouseEvent('pointermove', { bubbles: true });
    Object.defineProperty(move, 'movementX', { value: 3 });
    swatch.dispatchEvent(move);
    await settle();
    expect(titles()).toEqual(['Paper']);
    swatch.click();
    await flushPromises();
    await flushPromises();
    expect(api.tabs.update).toHaveBeenCalledWith(3, { active: true });
    expect(api.tabGroups.update).toHaveBeenCalledWith(10, { collapsed: true });
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes a tab and stays open, showing the group without it', async () => {
    q('[data-action="close"][data-tab-id="2"]').click();
    await flushPromises();
    expect(api.tabs.remove).toHaveBeenCalledWith(2);
    api.state.tabs = api.state.tabs.filter((t) => t.id !== 2);
    api.tabs.onRemoved.emit(2, { windowId: 1 });
    await new Promise((resolve) => setTimeout(resolve, 80));
    await settle();
    expect(titles()).toEqual(['Settings']);
    expect(close).not.toHaveBeenCalled();
  });

  it('opens a new tab in the group and closes', async () => {
    q('[data-action="new"]').click();
    await flushPromises();
    await flushPromises();
    expect(api.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ index: 1 }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('never collapses: there is no page under it to hide in', async () => {
    q('[data-action="collapse"]').click();
    await settle();
    expect(q('.hh-pill')).toBeNull();
    expect(titles()).toEqual(['Settings', 'Docs']);
  });

  it('stops following tab changes once closed', async () => {
    popup.dispose();
    expect(api.tabs.onRemoved.hasListeners()).toBe(false);
    expect(api.tabGroups.onUpdated.hasListeners()).toBe(false);
  });
});
