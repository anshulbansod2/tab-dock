import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent } from './helpers/chrome.js';
import { loadContent } from './helpers/content.js';

let ns;
let runtime;
let ports;
let doc;
let onSnapshot;
let onOrphaned;
let conn;

function fakePort() {
  const port = {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: createEvent(),
    onDisconnect: createEvent(),
  };
  ports.push(port);
  return port;
}

function setVisibility(state) {
  doc.visibilityState = state;
  doc.dispatchEvent(new Event('visibilitychange'));
}

beforeAll(async () => {
  ns = await loadContent('core', 'connection');
});

beforeEach(() => {
  vi.useFakeTimers();
  ports = [];
  runtime = { id: 'ext-id', connect: vi.fn(fakePort) };
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  onSnapshot = vi.fn();
  onOrphaned = vi.fn();
  conn = ns.createConnection({ onSnapshot, onOrphaned, runtime, doc });
});

afterEach(() => {
  conn.stop();
  vi.useRealTimers();
});

describe('createConnection', () => {
  it('connects on start when visible', () => {
    conn.start();
    expect(runtime.connect).toHaveBeenCalledWith({ name: 'hover-helper' });
  });

  it('waits until the page becomes visible', () => {
    doc.visibilityState = 'hidden';
    conn.start();
    expect(runtime.connect).not.toHaveBeenCalled();
    setVisibility('visible');
    expect(runtime.connect).toHaveBeenCalledOnce();
  });

  it('drops the port while hidden', () => {
    conn.start();
    setVisibility('hidden');
    expect(ports[0].disconnect).toHaveBeenCalled();
  });

  it('delivers snapshots and ignores other messages', () => {
    conn.start();
    const snapshot = { group: null, tabs: [] };
    ports[0].onMessage.emit({ type: 'snapshot', snapshot });
    ports[0].onMessage.emit({ type: 'other' });
    ports[0].onMessage.emit(null);
    expect(onSnapshot).toHaveBeenCalledOnce();
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('reconnects with backoff 100 → 1000 → 5000 ms and resets after a message', () => {
    conn.start();
    ports[0].onDisconnect.emit();
    vi.advanceTimersByTime(99);
    expect(runtime.connect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(runtime.connect).toHaveBeenCalledTimes(2);
    ports[1].onDisconnect.emit();
    vi.advanceTimersByTime(1000);
    expect(runtime.connect).toHaveBeenCalledTimes(3);
    ports[2].onDisconnect.emit();
    vi.advanceTimersByTime(5000);
    expect(runtime.connect).toHaveBeenCalledTimes(4);
    ports[3].onDisconnect.emit();
    vi.advanceTimersByTime(5000);
    expect(runtime.connect).toHaveBeenCalledTimes(5);
    ports[4].onMessage.emit({ type: 'snapshot', snapshot: { group: null, tabs: [] } });
    ports[4].onDisconnect.emit();
    vi.advanceTimersByTime(100);
    expect(runtime.connect).toHaveBeenCalledTimes(6);
  });

  it('orphans itself when the extension context is gone', () => {
    conn.start();
    delete runtime.id;
    ports[0].onDisconnect.emit();
    vi.advanceTimersByTime(100);
    expect(onOrphaned).toHaveBeenCalledOnce();
    expect(runtime.connect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(onOrphaned).toHaveBeenCalledOnce();
  });

  it('orphans itself when connect throws', () => {
    runtime.connect.mockImplementation(() => {
      throw new Error('Extension context invalidated.');
    });
    conn.start();
    expect(onOrphaned).toHaveBeenCalledOnce();
  });

  it('sends while connected and no-ops otherwise', () => {
    conn.send({ type: 'new' });
    conn.start();
    conn.send({ type: 'new' });
    expect(ports[0].postMessage).toHaveBeenCalledOnce();
  });

  it('treats a failed send as a disconnect', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    conn.start();
    ports[0].postMessage.mockImplementation(() => {
      throw new Error('Attempting to use a disconnected port object');
    });
    conn.send({ type: 'new' });
    vi.advanceTimersByTime(100);
    expect(runtime.connect).toHaveBeenCalledTimes(2);
  });

  it('stop cancels pending reconnects and visibility handling', () => {
    conn.start();
    ports[0].onDisconnect.emit();
    conn.stop();
    vi.advanceTimersByTime(10_000);
    setVisibility('visible');
    expect(runtime.connect).toHaveBeenCalledTimes(1);
  });
});
