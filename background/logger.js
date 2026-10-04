// @ts-check

const PREFIX = '[hover-helper]';

/** Thin wrapper so every log line is attributable to this extension. */
export const logger = Object.freeze({
  /** @param {...unknown} args */
  warn: (...args) => console.warn(PREFIX, ...args),
  /** @param {...unknown} args */
  error: (...args) => console.error(PREFIX, ...args),
});

const STALE_PATTERNS = [/^No tab with id/, /^No group with id/];

/**
 * True for the errors Chrome raises when a tab or group vanished between a snapshot and an
 * action — expected in normal use and safe to ignore.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isStaleTabError(err) {
  return err instanceof Error && STALE_PATTERNS.some((re) => re.test(err.message));
}
