import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PUBLISH_ORDER } from '../../scripts/release/manifest';
import { assertLockstepVersion, officialPackages } from '../../scripts/release/prepare';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('officialPackages — the set release:prepare actually packs', () => {
  it('covers the canonical PUBLISH_ORDER exactly, in order', () => {
    // A package missing here is silently never packed — and therefore never
    // published — while verify:lockstep and the publish unit tests still pass.
    expect(officialPackages(rootDir).map(p => p.name)).toEqual([...PUBLISH_ORDER]);
  });

  it('maps every package name to the directory that declares it', () => {
    for (const pkg of officialPackages(rootDir)) {
      const manifest = JSON.parse(readFileSync(resolve(pkg.dir, 'package.json'), 'utf8')) as { name: string };
      expect(manifest.name).toBe(pkg.name);
    }
  });
});

describe('assertLockstepVersion', () => {
  it('returns the single shared version of the official packages', () => {
    const version = assertLockstepVersion(officialPackages(rootDir));
    const rootVersion = (JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')) as { version: string }).version;
    expect(version).toBe(rootVersion);
  });
});
