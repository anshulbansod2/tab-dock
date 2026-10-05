import { describe, expect, it } from 'vitest';
import { migrateStorage } from '../background/migrate.js';
import { createStorage } from './helpers/chrome.js';

describe('migrateStorage', () => {
  it('carries settings saved under the old Hover Helper keys over to Tab Dock', async () => {
    const storage = createStorage({
      'hoverHelper.collapsed': true,
      'hoverHelper.position': { x: 0.2, y: 0.4 },
    });
    await migrateStorage(storage);
    expect(storage.data).toEqual({
      'tabDock.collapsed': true,
      'tabDock.position': { x: 0.2, y: 0.4 },
    });
  });

  it('never overwrites a setting already saved under the new key', async () => {
    const storage = createStorage({ 'hoverHelper.collapsed': true, 'tabDock.collapsed': false });
    await migrateStorage(storage);
    expect(storage.data).toEqual({ 'tabDock.collapsed': false });
  });

  it('does nothing when there is nothing old to move', async () => {
    const storage = createStorage({ 'tabDock.collapsed': true });
    await migrateStorage(storage);
    expect(storage.set).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
