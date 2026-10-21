/**
 * The seven retired runtime package names stay importable on the 0.20 line as
 * forwarders: installed next to the Core tarball, each shim hands out the very
 * bindings of its Core entry, adds no second Core and no side effect, and
 * type-checks under both TypeScript resolutions. The shim files are generated
 * from the release matrix and carry nothing but forwarders.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  importSideEffectProbe,
  legacyShimConsumerSource,
  legacyShimIdentityProbe,
  runNodeCheck,
  typecheckConsumer,
} from '../../scripts/release/external-consumers';
import { isShimDue, planShimCut, shimPeerRange, syncLegacyShims } from '../../scripts/release/legacy-shims';
import { LEGACY_SHIM_LINE, LEGACY_SHIMS, releasesWithEveryCut, RUNTIME_MODULES } from '../../scripts/release/lockstep-packages';
import { type InstalledConsumer, installHybridConsumer, repoRoot, runsAgainstBuild } from '../support/hybrid-runtime-package';

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

describe.runIf(runsAgainstBuild(['dist/esm/index.js']))('legacy shims: installed next to the Core tarball', () => {
  let consumer: InstalledConsumer;

  beforeAll(() => {
    consumer = installHybridConsumer(LEGACY_SHIMS.map(shim => shim.dir));
  }, 240_000);

  afterAll(() => consumer?.dispose());

  it('forwards every binding of every entry, PhysicsDebugDraw included, from one Core', () => {
    const check = runNodeCheck(
      consumer.dir,
      'shim identity',
      'shim-identity.mjs',
      legacyShimIdentityProbe(LEGACY_SHIMS),
      'SHIM_IDENTITY_OK',
    );

    expect(check.detail ?? 'ok').toBe('ok');
    expect(check.ok).toBe(true);
  });

  it('creates no DOM access, timer, audio context, worker, registry entry or global on import', () => {
    const specifiers = LEGACY_SHIMS.flatMap(shim =>
      shim.entries.map(entry => (entry.entry === '.' ? shim.name : `${shim.name}/${entry.entry.slice(2)}`)),
    );
    const check = runNodeCheck(
      consumer.dir,
      'shim side effects',
      'shim-side-effects.mjs',
      importSideEffectProbe(specifiers),
      'NO_SIDE_EFFECTS',
    );

    expect(check.detail ?? 'ok').toBe('ok');
    expect(check.ok).toBe(true);
  });

  it.each(['bundler', 'nodenext'] as const)(
    'type-checks a strict %s consumer of the retired names without paths or skipLibCheck',
    resolution => {
      const check = typecheckConsumer(
        consumer.dir,
        'shim types',
        `shims-${resolution}`,
        legacyShimConsumerSource(LEGACY_SHIMS),
        resolution,
      );

      expect(check.detail ?? 'ok').toBe('ok');
      expect(check.ok).toBe(true);
    },
    120_000,
  );
});
