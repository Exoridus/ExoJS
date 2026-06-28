import { ExtensionRegistry } from '@codexo/exojs/extensions';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildSnapshot } from '../../../src/extensions/snapshot';
import { resetExtensionRegistryForTesting } from '../../../src/extensions/testing';
import { asepriteBinding } from '../src/asepriteBinding';
import { asepriteExtension } from '../src/asepriteExtension';

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
    expect(asepriteExtension.assets![0]).toBe(asepriteBinding);
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
    expect(snapshot.assets).toContain(asepriteBinding);
  });

  it('contributes no renderers or serializers', () => {
    const snapshot = buildSnapshot([asepriteExtension]);
    expect(snapshot.renderers).toHaveLength(0);
    expect(snapshot.serializers).toHaveLength(0);
  });
});

// ── Side-effect contract: root entry vs /register ───────────────────────────────

describe('@codexo/exojs-aseprite root entry (side-effect-free)', () => {
  beforeEach(() => {
    resetExtensionRegistryForTesting();
  });

  it('root import does NOT register asepriteExtension in the ExtensionRegistry', async () => {
    await import('../src/index');
    expect(ExtensionRegistry.has('@codexo/exojs-aseprite')).toBe(false);
  });
});

describe('@codexo/exojs-aseprite/register entry', () => {
  beforeEach(() => {
    resetExtensionRegistryForTesting();
  });

  it('registers asepriteExtension on import', async () => {
    await import('../src/register');
    expect(ExtensionRegistry.has('@codexo/exojs-aseprite')).toBe(true);
  });
});

describe('export parity', () => {
  it('root and register expose the same named exports', async () => {
    const root = await import('../src/index');
    const register = await import('../src/register');
    const rootKeys = Object.keys(root)
      .filter(k => k !== 'default')
      .sort();
    const registerKeys = Object.keys(register)
      .filter(k => k !== 'default')
      .sort();
    expect(rootKeys).toEqual(registerKeys);
  });
});
