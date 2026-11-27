/**
 * The seven retired runtime package names stay importable on the 0.20 line as
 * forwarders. The shim files are generated from the release matrix and carry
 * nothing but forwarders; their behaviour against the packed Core is covered by
 * `legacy-shims-tarball.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isShimDue, planShimCut, shimPeerRange, syncLegacyShims } from '../../scripts/release/legacy-shims';
import { LEGACY_SHIM_LINE, LEGACY_SHIMS, releasesWithEveryCut, RUNTIME_MODULES } from '../../scripts/release/lockstep-packages';
import { repoRoot } from '../support/hybrid-runtime-package';

interface ShimManifest {
  name: string;
  version: string;
  files: string[];
  exports: Record<string, unknown>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const readShimManifest = (dir: string): ShimManifest =>
  JSON.parse(readFileSync(resolve(repoRoot, dir, 'package.json'), 'utf8')) as ShimManifest;

describe('legacy shims: the release matrix', () => {
  it('keeps one shim per runtime module under its retired name', () => {
    expect(LEGACY_SHIMS.map(shim => shim.name)).toEqual(RUNTIME_MODULES.map(module => module.legacyName));
    expect(LEGACY_SHIMS.every(shim => shim.role === 'legacy-shim' && shim.line === LEGACY_SHIM_LINE)).toBe(true);
    expect(LEGACY_SHIMS.some(releasesWithEveryCut)).toBe(false);
  });

  it('forwards the retired physics debug entry to the Core debug entry, nothing wider', () => {
    const physics = LEGACY_SHIMS.find(shim => shim.subpath === 'physics');

    expect(physics?.entries).toEqual([
      { entry: '.', target: '@codexo/exojs/physics' },
      { entry: './debug', target: '@codexo/exojs/debug', names: { values: ['PhysicsDebugDraw'], types: ['PhysicsDebugDrawOptions'] } },
    ]);
  });

  it('has every shim package file exactly as the generator writes it', () => {
    expect(syncLegacyShims({ check: true })).toEqual([]);
  });

  it.each(LEGACY_SHIMS.map(shim => [shim.name, shim.dir] as const))(
    '%s peers on Core alone, depends on nothing and runs no script',
    (_name, dir) => {
      const manifest = readShimManifest(dir);

      expect({
        dependencies: manifest.dependencies,
        devDependencies: manifest.devDependencies,
        optionalDependencies: manifest.optionalDependencies,
        scripts: manifest.scripts,
        peers: Object.keys(manifest.peerDependencies ?? {}),
        peerRange: manifest.peerDependencies?.['@codexo/exojs'],
      }).toEqual({
        dependencies: undefined,
        devDependencies: { '@codexo/exojs': 'workspace:*' },
        optionalDependencies: undefined,
        scripts: undefined,
        peers: ['@codexo/exojs'],
        peerRange: shimPeerRange(manifest.version),
      });
    },
  );

  it.each(LEGACY_SHIMS.map(shim => [shim.name, shim.dir] as const))('%s ships forwarders and nothing else', (_name, dir) => {
    const manifest = readShimManifest(dir);
    const code = manifest.files.filter(file => /\.(?:js|d\.ts)$/.test(file));

    expect(manifest.files.filter(file => !code.includes(file))).toEqual(['README.md', 'LICENSE']);

    for (const file of code) {
      const statements = readFileSync(join(repoRoot, dir, file), 'utf8')
        .trim()
        .split('\n');

      expect(statements.every(line => /^export (?:\*|\{[^}]+\}) from '@codexo\/exojs\/[a-z-]+';$/.test(line))).toBe(true);
    }
  });
});

describe('legacy shims: the release cut', () => {
  const cut = (currentVersion: string, releaseVersion: string, forwarderChanged = false): ReturnType<typeof planShimCut> =>
    planShimCut({ line: '0.20', currentVersion, releaseVersion, forwarderChanged });

  it('sets the release version when the cut opens the shim line', () => {
    expect(cut('0.19.1', '0.20.0')).toMatchObject({ action: 'set', version: '0.20.0', peerRange: '0.20.x' });
  });

  it('does not republish an unchanged forwarder on a Core patch', () => {
    expect(cut('0.20.0', '0.20.1')).toMatchObject({ action: 'keep' });
  });

  it('gives a changed forwarder the patch version', () => {
    expect(cut('0.20.0', '0.20.3', true)).toMatchObject({ action: 'set', version: '0.20.3', peerRange: '0.20.x' });
  });

  it('never moves a shim onto another line', () => {
    expect(cut('0.19.1', '0.19.2', true)).toMatchObject({ action: 'keep' });
    expect(cut('0.20.4', '0.21.0', true)).toMatchObject({ action: 'keep' });
  });

  it('publishes a shim only in the release that set its version on its line', () => {
    expect(isShimDue({ line: '0.20' }, '0.20.0', '0.20.0')).toBe(true);
    expect(isShimDue({ line: '0.20' }, '0.20.0', '0.20.1')).toBe(false);
    expect(isShimDue({ line: '0.20' }, '0.19.1', '0.19.1')).toBe(false);
  });
});
