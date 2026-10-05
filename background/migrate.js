// @ts-check
import { logger } from './logger.js';

/** Settings keys from when the extension was called Hover Helper, mapped to their new names. */
/** @type {Readonly<Record<string, string>>} */
const RENAMED_KEYS = Object.freeze({
  'hoverHelper.collapsed': 'tabDock.collapsed',
  'hoverHelper.position': 'tabDock.position',
});

/**
 * Moves settings saved under the old keys to the new ones, once, so the rename keeps the
 * user's collapsed state and bar position. A value already under a new key wins.
 * @param {chrome.storage.StorageArea} storage
 */
export async function migrateStorage(storage) {
  try {
    const oldKeys = Object.keys(RENAMED_KEYS);
    const old = await storage.get(oldKeys);
    const found = oldKeys.filter((key) => key in old);
    if (found.length === 0) return;
    const current = await storage.get(found.map((key) => RENAMED_KEYS[key]));
    const moved = Object.fromEntries(
      found
        .filter((key) => !(RENAMED_KEYS[key] in current))
        .map((key) => [RENAMED_KEYS[key], old[key]]),
    );
    if (Object.keys(moved).length > 0) await storage.set(moved);
    await storage.remove(found);
  } catch (err) {
    logger.error('settings migration failed', err);
  }
}
