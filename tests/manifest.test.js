import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));
const manifest = read('manifest.json');
const pkg = read('package.json');

describe('manifest.json', () => {
  it('is MV3 with a version matching package.json', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe(pkg.version);
  });

  it('requests only the permissions the spec allows', () => {
    expect([...manifest.permissions].sort()).toEqual([
      'favicon',
      'scripting',
      'storage',
      'tabGroups',
      'tabs',
    ]);
    // Same sites the content script already matches, so no extra install warning.
    expect(manifest.host_permissions).toEqual(manifest.content_scripts[0].matches);
    expect(manifest.web_accessible_resources).toBeUndefined();
    expect(manifest.content_security_policy).toBeUndefined();
  });

  it('requires Chrome 123+ for CSS light-dark()', () => {
    expect(manifest.minimum_chrome_version).toBe('123');
  });

  it('runs a module service worker', () => {
    expect(manifest.background).toEqual({
      service_worker: 'background/service-worker.js',
      type: 'module',
    });
  });

  it('loads content scripts top-frame only, core first and main last', () => {
    const [cs] = manifest.content_scripts;
    expect(cs.all_frames ?? false).toBe(false);
    expect(cs.js[0]).toBe('content/core.js');
    expect(cs.js.at(-1)).toBe('content/main.js');
  });

  it('references only files that exist', () => {
    const files = [
      manifest.background.service_worker,
      ...manifest.content_scripts.flatMap((cs) => cs.js),
      ...Object.values(manifest.icons),
    ];
    expect(files.filter((f) => !exists(f))).toEqual([]);
  });
});
