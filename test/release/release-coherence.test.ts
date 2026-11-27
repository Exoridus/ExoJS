import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { INDEPENDENT_PACKAGES } from '../../scripts/release/lockstep-packages.ts';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');

interface Manifest {
  name?: string;
  version?: string;
  peerDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const readManifest = (path: string): Manifest => JSON.parse(readFileSync(path, 'utf8')) as Manifest;
const changelog = readFileSync(resolve(repoRoot, 'CHANGELOG.md'), 'utf8');

// The version being cut is read from the newest CHANGELOG heading rather than
// hard-coded, so this release gate never goes stale on a bump. A non-dated
// heading (a placeholder / "Unreleased") must never reach a tag - release:notes
// hard-fails on it in the publish job, after npm has already published.
const heading = /^## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}$/m.exec(changelog);
const releaseVersion = heading?.[1] ?? '';
const peerRange = `${releaseVersion.split('.').slice(0, 2).join('.')}.x`;

// A lockstep extension is any package under packages/ that peers on the core.
// Discovered from disk so new extension packages are covered automatically.
// Independent packages (build tooling, content) also declare the engine peer
// but move on their own version line, so the release matrix excludes them.
const independentNames = new Set<string>(INDEPENDENT_PACKAGES.map(pkg => pkg.name));
const packagesDir = resolve(repoRoot, 'packages');
const lockstepExtensions = readdirSync(packagesDir)
  .map(dir => {
    try {
      return readManifest(resolve(packagesDir, dir, 'package.json'));
    } catch {
      return null;
    }
  })
  .filter(
    (manifest): manifest is Manifest =>
      manifest?.peerDependencies?.['@codexo/exojs'] !== undefined && manifest.name !== undefined && !independentNames.has(manifest.name),
  );

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

  // exojs-tiled and exojs-ldtk render tiles through the tilemap runtime, which
  // ships inside Core as `@codexo/exojs/tilemap`. Their Core peer is therefore
  // the only engine dependency they may declare: a dependency on the retired
  // tilemap package would install a second, separate tilemap implementation.
  for (const consumer of ['exojs-tiled', 'exojs-ldtk']) {
    it(`@codexo/${consumer} reaches the tilemap runtime through its Core peer only`, () => {
      const manifest = readManifest(resolve(packagesDir, consumer, 'package.json'));
      const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies });

      expect(manifest.peerDependencies?.['@codexo/exojs']).toBeDefined();
      expect(declared.filter(name => name.startsWith('@codexo/exojs-') && name !== '@codexo/exojs-config')).toEqual([]);
    });
  }
});
