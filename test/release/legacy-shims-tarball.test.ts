/**
 * The seven retired runtime package names, packed and installed next to the
 * Core tarball: each shim hands out the very bindings of its Core entry, adds
 * no second Core and no side effect, and type-checks under both TypeScript
 * resolutions. Reads the built Core, so it runs in the `release-dist` project.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  importSideEffectProbe,
  legacyShimConsumerSource,
  legacyShimIdentityProbe,
  runNodeCheck,
  typecheckConsumer,
} from '../../scripts/release/external-consumers';
import { LEGACY_SHIMS } from '../../scripts/release/lockstep-packages';
import { type InstalledConsumer, installHybridConsumer, runsAgainstBuild } from '../support/hybrid-runtime-package';

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
