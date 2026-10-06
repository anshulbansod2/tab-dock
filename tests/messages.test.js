import { describe, expect, it } from 'vitest';
import { identifySender, parseClientMessage } from '../background/messages.js';
import { createSender } from './helpers/chrome.js';

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
    [{ type: 'hello' }, { type: 'hello' }],
    [{ type: 'new', tabId: 9, extra: true }, { type: 'new' }],
    [
      { type: 'move', tabId: 3, toIndex: 0 },
      { type: 'move', tabId: 3, toIndex: 0 },
    ],
    [
      { type: 'regroup', tabId: 3, groupId: 10 },
      { type: 'regroup', tabId: 3, groupId: 10 },
    ],
    [
      { type: 'regroup', tabId: 3, groupId: -1 },
      { type: 'regroup', tabId: 3, groupId: -1 },
    ],
    [
      { type: 'newgroup', tabId: 3 },
      { type: 'newgroup', tabId: 3 },
    ],
    [
      { type: 'preview', tabId: 3 },
      { type: 'preview', tabId: 3 },
    ],
    [
      { type: 'peek', tabId: 3, bounds: { left: 0 } },
      { type: 'peek', tabId: 3 },
    ],
    [{ type: 'return' }, { type: 'return' }],
    [{ type: 'seen', extra: 1 }, { type: 'seen' }],
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
    { type: 'move', tabId: 3 },
    { type: 'move', tabId: 3, toIndex: -1 },
    { type: 'move', tabId: 3, toIndex: 0.5 },
    { type: 'regroup', tabId: 3 },
    { type: 'regroup', tabId: 3, groupId: -2 },
    { type: 'regroup', tabId: 3, groupId: '10' },
    { type: 'newgroup' },
    { type: 'preview' },
    { type: 'peek' },
    { type: 'peek', tabId: -3 },
  ])('rejects %j', (raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });
});

describe('identifySender', () => {
  it('returns the sender tab for our own top-frame content script', () => {
    expect(identifySender(createSender({ tabId: 7, windowId: 3 }), 'ext-id')).toEqual({
      tabId: 7,
      windowId: 3,
    });
  });

  it('rejects messages from another extension', () => {
    expect(identifySender(createSender({ extensionId: 'evil' }), 'ext-id')).toBeNull();
  });

  it('rejects sub-frames and senders without a tab', () => {
    expect(identifySender(createSender({ frameId: 2 }), 'ext-id')).toBeNull();
    expect(identifySender({ id: 'ext-id', frameId: 0 }, 'ext-id')).toBeNull();
  });
});
