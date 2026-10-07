import { describe, expect, it } from 'vitest';

const DOCK = { left: 300.5, top: 752, right: 900, bottom: 800 };
const VIEW = { width: 1200, height: 800 };
const POINT = { screenX: 750, screenY: 906, clientX: 650, clientY: 776 };
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
      { type: 'newgroup', tabId: 3, title: '  Trip  ', color: 'green', x: 1 },
      { type: 'newgroup', tabId: 3, title: 'Trip', color: 'green' },
    ],
    [
      { type: 'newgroup', tabId: 3, title: '' },
      { type: 'newgroup', tabId: 3, title: '' },
    ],
    [
      { type: 'editgroup', groupId: 20, title: 'Reading' },
      { type: 'editgroup', groupId: 20, title: 'Reading' },
    ],
    [
      { type: 'editgroup', groupId: 20, color: 'red' },
      { type: 'editgroup', groupId: 20, color: 'red' },
    ],
    [
      { type: 'preview', tabId: 3 },
      { type: 'preview', tabId: 3 },
    ],
    [
      { type: 'peek', tabId: 3, dock: { ...DOCK, x: 1 }, view: VIEW, point: POINT, bounds: {} },
      { type: 'peek', tabId: 3, dock: DOCK, view: VIEW, point: POINT },
    ],
    [{ type: 'return' }, { type: 'return' }],
    [
      { type: 'group', groupId: 20, tabId: 4 },
      { type: 'group', groupId: 20 },
    ],
    [
      { type: 'group', groupId: -1 },
      { type: 'group', groupId: -1 },
    ],
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
    { type: 'newgroup', tabId: 3, color: 'magenta' },
    { type: 'newgroup', tabId: 3, title: 7 },
    { type: 'newgroup', tabId: 3, title: 'x'.repeat(101) },
    { type: 'editgroup', groupId: 20 },
    { type: 'editgroup', groupId: -1, title: 'x' },
    { type: 'editgroup', groupId: 20, color: 'magenta' },
    { type: 'preview' },
    { type: 'group' },
    { type: 'group', groupId: -2 },
    { type: 'group', groupId: '20' },
    { type: 'peek', tabId: 3 },
    { type: 'peek', tabId: 3, dock: DOCK, view: VIEW },
    { type: 'peek', tabId: 3, dock: { ...DOCK, right: 100 }, view: VIEW, point: POINT },
    { type: 'peek', tabId: 3, dock: { ...DOCK, bottom: 700 }, view: VIEW, point: POINT },
    { type: 'peek', tabId: 3, dock: DOCK, view: { width: 0, height: 800 }, point: POINT },
    { type: 'peek', tabId: 3, dock: DOCK, view: VIEW, point: { ...POINT, screenX: NaN } },
    { type: 'peek', tabId: 3, dock: DOCK, view: VIEW, point: { ...POINT, clientY: '7' } },
    { type: 'peek', tabId: 3, dock: { ...DOCK, top: -1e9 }, view: VIEW, point: POINT },
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
