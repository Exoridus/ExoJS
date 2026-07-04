import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');

interface Manifest {
  name?: string;
  version?: string;
  peerDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
}

const readManifest = (path: string): Manifest => JSON.parse(readFileSync(path, 'utf8')) as Manifest;
const changelog = readFileSync(resolve(repoRoot, 'CHANGELOG.md'), 'utf8');

// The version being cut is read from the newest CHANGELOG heading rather than
// hard-coded, so this release gate never goes stale on a bump. A non-dated
// heading (a placeholder / "Unreleased") must never reach a tag — release:notes
// hard-fails on it in the publish job, after npm has already published.
const heading = /^## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}$/m.exec(changelog);
const releaseVersion = heading?.[1] ?? '';
const peerRange = `${releaseVersion.split('.').slice(0, 2).join('.')}.x`;

// A lockstep extension is any package under packages/ that peers on the core.
// Discovered from disk so new extension packages are covered automatically.
const packagesDir = resolve(repoRoot, 'packages');
const lockstepExtensions = readdirSync(packagesDir)
  .map(dir => {
    try {
      return readManifest(resolve(packagesDir, dir, 'package.json'));
    } catch {
      return null;
    }
  })
  .filter((manifest): manifest is Manifest => manifest?.peerDependencies?.['@codexo/exojs'] !== undefined);

describe('release coherence', () => {
  it('CHANGELOG opens with a concrete, dated release section', () => {
    expect(heading, 'expected a `## [x.y.z] - YYYY-MM-DD` heading at the top of CHANGELOG.md').not.toBeNull();
  });

  it('root package version matches the newest CHANGELOG section', () => {
    expect(readManifest(resolve(repoRoot, 'package.json')).version).toBe(releaseVersion);
  });

  it('discovers at least one lockstep extension package', () => {
    expect(lockstepExtensions.length).toBeGreaterThan(0);
  });

  for (const manifest of lockstepExtensions) {
    it(`${manifest.name} is bumped to ${releaseVersion} with a ${peerRange} core peer`, () => {
      expect(manifest.version).toBe(releaseVersion);
      expect(manifest.peerDependencies?.['@codexo/exojs']).toBe(peerRange);
    });
  }

  it('@codexo/exojs-tiled depends on @codexo/exojs-tilemap', () => {
    const tiled = readManifest(resolve(packagesDir, 'exojs-tiled', 'package.json'));
    expect(tiled.dependencies?.['@codexo/exojs-tilemap']).toBeDefined();
  });
});
