import type { AssetLoaderContext } from '@codexo/exojs';
import { ExtensionRegistry } from '@codexo/exojs/extensions';
import { tilemapExtension } from '@codexo/exojs-tilemap';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildSnapshot } from '../../../src/extensions/snapshot';
import { resetExtensionRegistryForTesting } from '../../../src/extensions/testing';
import { ldtkMapBinding } from '../src/ldtkBinding';
import type { LdtkData } from '../src/LdtkData';
import { ldtkExtension } from '../src/ldtkExtension';
import { LdtkMap } from '../src/LdtkMap';

describe('@codexo/exojs-ldtk extension descriptor', () => {
  it('has the correct id', () => {
    expect(ldtkExtension.id).toBe('@codexo/exojs-ldtk');
  });

  it('declares tilemapExtension as a dependency (same object reference)', () => {
    expect(ldtkExtension.dependencies).toBeDefined();
    expect(ldtkExtension.dependencies).toContain(tilemapExtension);
  });

  it('carries exactly one asset binding (the LdtkMap binding)', () => {
    expect(ldtkExtension.assets).toBeDefined();
    expect(ldtkExtension.assets!.length).toBe(1);
    expect(ldtkExtension.assets![0]).toBe(ldtkMapBinding);
  });

  it('is a frozen descriptor', () => {
    expect(Object.isFrozen(ldtkExtension)).toBe(true);
  });
});

describe('@codexo/exojs-ldtk asset binding — ldtkMapBinding', () => {
  it('targets the LdtkMap constructor', () => {
    expect(ldtkMapBinding.type).toBe(LdtkMap);
  });

  it('has typeNames ["ldtkMap"]', () => {
    expect(ldtkMapBinding.typeNames).toEqual(['ldtkMap']);
  });

  it('claims the .ldtk file extension', () => {
    expect(ldtkMapBinding.extensions).toEqual(['ldtk']);
  });

  it('create() returns a handler with a load function', () => {
    const handler = ldtkMapBinding.create();
    expect(typeof handler.load).toBe('function');
  });

  it("load() delegates to loadLdtkMap, passing through the request's source and the context", async () => {
    const fixture: LdtkData = {
      jsonVersion: '1.5.3',
      defaultGridSize: 16,
      defs: { tilesets: [], layers: [] },
      levels: [
        {
          identifier: 'L',
          uid: 1,
          iid: 'iid-1',
          worldX: 0,
          worldY: 0,
          pxWid: 16,
          pxHei: 16,
          layerInstances: [],
        },
      ],
    };
    const source = 'https://example.com/world.ldtk';
    const context: AssetLoaderContext = {
      loader: { load: vi.fn() } as unknown as AssetLoaderContext['loader'],
      identityKey: 'test',
      fetchText: vi.fn(),
      fetchArrayBuffer: vi.fn(),
      fetchJson: vi.fn(async (requested: string) => {
        expect(requested).toBe(source);
        return fixture;
      }),
    };

    const handler = ldtkMapBinding.create();
    const result = await handler.load({ source }, context);

    expect(result).toBeInstanceOf(LdtkMap);
    expect(result.source).toBe(source);
    expect(context.fetchJson).toHaveBeenCalledWith(source);
  });
});

describe('buildSnapshot([ldtkExtension])', () => {
  it('materializes tilemapExtension before ldtkExtension', () => {
    const snapshot = buildSnapshot([ldtkExtension]);
    expect(snapshot.extensions.map(e => e.id)).toEqual([
      '@codexo/exojs-tilemap',
      '@codexo/exojs-ldtk',
    ]);
  });

  it('collects the single LDtk asset binding', () => {
    const snapshot = buildSnapshot([ldtkExtension]);
    expect(snapshot.assets).toHaveLength(1);
    expect(snapshot.assets).toContain(ldtkMapBinding);
  });

  it('pulls in the tilemap renderer binding (one-extension rendering)', () => {
    const snapshot = buildSnapshot([ldtkExtension]);
    // The tilemap dependency contributes its tile chunk renderer binding, so an
    // LDtk-only setup can both load AND render without manual registration.
    expect(snapshot.renderers).toHaveLength(1);
  });
});

describe('@codexo/exojs-ldtk root entry (side-effect-free)', () => {
  beforeEach(() => {
    resetExtensionRegistryForTesting();
  });

  it('root import does NOT register ldtkExtension in ExtensionRegistry', async () => {
    await import('../src/index');
    expect(ExtensionRegistry.has('@codexo/exojs-ldtk')).toBe(false);
  });
});

describe('@codexo/exojs-ldtk/register entry', () => {
  beforeEach(() => {
    resetExtensionRegistryForTesting();
  });

  it('registers ldtkExtension on import', async () => {
    await import('../src/register');
    expect(ExtensionRegistry.has('@codexo/exojs-ldtk')).toBe(true);
  });
});

describe('export parity', () => {
  it('root and register have the same named exports', async () => {
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
