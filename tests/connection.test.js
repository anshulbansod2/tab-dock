import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent, flushPromises } from './helpers/chrome.js';
import { loadContent } from './helpers/content.js';

const snapshot = { group: null, tabs: [] };
const OWN = { id: 'ext-id' };

let ns;
let runtime;
let doc;
let onSnapshot;
let onOrphaned;
let conn;

function setVisibility(state) {
  doc.visibilityState = state;
  doc.dispatchEvent(new Event('visibilitychange'));
}

beforeAll(async () => {
  ns = await loadContent('core', 'connection');
});

beforeEach(() => {
  runtime = {
    id: 'ext-id',
    sendMessage: vi.fn(async (msg) => (msg.type === 'hello' ? snapshot : undefined)),
    onMessage: createEvent(),
  };
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  onSnapshot = vi.fn();
  onOrphaned = vi.fn();
  conn = ns.createConnection({ onSnapshot, onOrphaned, runtime, doc });
});

afterEach(() => conn.stop());

describe('createConnection', () => {
  it('asks for a snapshot on start when visible', async () => {
    conn.start();
    await flushPromises();
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: 'hello' });
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('holds no listener-driven work while hidden, and asks again when shown', async () => {
    doc.visibilityState = 'hidden';
    conn.start();
    await flushPromises();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    setVisibility('visible');
    await flushPromises();
    expect(onSnapshot).toHaveBeenCalledOnce();
  });

  it('ignores a hello reply that is not a snapshot', async () => {
    runtime.sendMessage.mockResolvedValueOnce(null);
    conn.start();
    await flushPromises();
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('applies pushes from its own extension while visible only', async () => {
    conn.start();
    await flushPromises();
    onSnapshot.mockClear();
    runtime.onMessage.emit({ type: 'snapshot', snapshot }, OWN);
    runtime.onMessage.emit({ type: 'snapshot', snapshot }, { id: 'other-ext' });
    runtime.onMessage.emit({ type: 'other' }, OWN);
    doc.visibilityState = 'hidden';
    runtime.onMessage.emit({ type: 'snapshot', snapshot }, OWN);
    expect(onSnapshot).toHaveBeenCalledOnce();
  });

  it('sends actions', async () => {
    conn.start();
    conn.send({ type: 'new' });
    await flushPromises();
    expect(runtime.sendMessage).toHaveBeenLastCalledWith({ type: 'new' });
  });

  it('orphans itself once when the extension context is gone', async () => {
    conn.start();
    await flushPromises();
    runtime.sendMessage.mockRejectedValue(new Error('Extension context invalidated.'));
    conn.send({ type: 'new' });
    conn.send({ type: 'new' });
    await flushPromises();
    expect(onOrphaned).toHaveBeenCalledOnce();
  });

  it('orphans itself without messaging when runtime.id is gone', async () => {
    delete runtime.id;
    conn.start();
    await flushPromises();
    expect(onOrphaned).toHaveBeenCalledOnce();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('logs other send failures and keeps working', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    runtime.sendMessage.mockRejectedValueOnce(new Error('Could not establish connection.'));
    conn.start();
    await flushPromises();
    expect(warn).toHaveBeenCalled();
    expect(onOrphaned).not.toHaveBeenCalled();
  });

  it('stop removes its listeners', async () => {
    conn.start();
    await flushPromises();
    conn.stop();
    onSnapshot.mockClear();
    runtime.onMessage.emit({ type: 'snapshot', snapshot }, OWN);
    setVisibility('visible');
    await flushPromises();
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(runtime.onMessage.hasListeners()).toBe(false);
  });
});
