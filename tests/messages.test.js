import { describe, expect, it } from 'vitest';
import { identifyClient, parseClientMessage } from '../background/messages.js';
import { createPort } from './helpers/chrome.js';

describe('parseClientMessage', () => {
  it.each([
    [
      { type: 'activate', tabId: 4 },
      { type: 'activate', tabId: 4 },
    ],
    [
      { type: 'close', tabId: 0 },
      { type: 'close', tabId: 0 },
    ],
    [{ type: 'new' }, { type: 'new' }],
    [{ type: 'new', tabId: 9, extra: true }, { type: 'new' }],
  ])('accepts %j', (raw, expected) => {
    expect(parseClientMessage(raw)).toEqual(expected);
  });

  it.each([
    null,
    'activate',
    42,
    {},
    { type: 'activate' },
    { type: 'activate', tabId: '4' },
    { type: 'close', tabId: 1.5 },
    { type: 'close', tabId: -1 },
    { type: 'snapshot', snapshot: {} },
    { type: 'eval', tabId: 1 },
  ])('rejects %j', (raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });
});

describe('identifyClient', () => {
  it('returns the sender tab for our own top-frame content script', () => {
    expect(identifyClient(createPort({ tabId: 7, windowId: 3 }), 'ext-id')).toEqual({
      tabId: 7,
      windowId: 3,
    });
  });

  it('rejects a port with the wrong name', () => {
    expect(identifyClient(createPort({ name: 'other' }), 'ext-id')).toBeNull();
  });

  it('rejects a port from another extension', () => {
    expect(identifyClient(createPort({ extensionId: 'evil' }), 'ext-id')).toBeNull();
  });

  it('rejects sub-frames and senders without a tab', () => {
    expect(identifyClient(createPort({ frameId: 2 }), 'ext-id')).toBeNull();
    const port = createPort();
    port.sender.tab = undefined;
    expect(identifyClient(port, 'ext-id')).toBeNull();
  });
});
