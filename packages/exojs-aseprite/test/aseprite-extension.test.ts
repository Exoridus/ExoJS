// Root entry: pulls in the module augmentation that types `loader.load` for
// this package's asset type. Without it the augmentation is not in the program.
import '../src/index';

import { describe, expect, it } from 'vitest';

import { buildSnapshot } from '../../../src/extensions/snapshot';
import { asepriteExtension } from '../src/asepriteExtension';
import { asepriteType } from '../src/asepriteType';

// ── Descriptor ───────────────────────────────────────────────────────────────

describe('asepriteExtension descriptor', () => {
  it('has the package id', () => {
    expect(asepriteExtension.id).toBe('@codexo/exojs-aseprite');
  });

  it('is a frozen, immutable descriptor', () => {
    expect(Object.isFrozen(asepriteExtension)).toBe(true);
  });

  it('registers exactly one asset binding (the aseprite binding)', () => {
    expect(asepriteExtension.assets).toHaveLength(1);
    expect(asepriteExtension.assets![0]).toBe(asepriteType);
  });

  it('declares no dependencies, renderers, or serializers', () => {
    expect(asepriteExtension.dependencies).toBeUndefined();
    expect(asepriteExtension.renderers).toBeUndefined();
    expect(asepriteExtension.serializers).toBeUndefined();
  });
});

// ── buildSnapshot materialization ──────────────────────────────────────────────

describe('buildSnapshot([asepriteExtension])', () => {
  it('materializes a single extension with the aseprite binding', () => {
    const snapshot = buildSnapshot([asepriteExtension]);
    expect(snapshot.extensions.map(e => e.id)).toEqual(['@codexo/exojs-aseprite']);
    expect(snapshot.assets).toHaveLength(1);
    expect(snapshot.assets).toContain(asepriteType);
  });

  it('contributes no renderers or serializers', () => {
    const snapshot = buildSnapshot([asepriteExtension]);
    expect(snapshot.renderers).toHaveLength(0);
    expect(snapshot.serializers).toHaveLength(0);
  });
});
