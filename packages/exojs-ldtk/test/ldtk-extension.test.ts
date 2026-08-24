// Root entry: pulls in the module augmentation that types `loader.load` for
// this package's asset type. Without it the augmentation is not in the program.
import '../src/index';

import type { AssetLoaderContext, Loader } from '@codexo/exojs';
import { tilemapExtension } from '@codexo/exojs-tilemap';
import { describe, expect, it, vi } from 'vitest';

import { buildSnapshot } from '../../../src/extensions/snapshot';
import { ldtkMapBinding, ldtkProjectBinding } from '../src/ldtkBinding';
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

  it('carries both asset bindings (eager LdtkMap and streaming LdtkProject)', () => {
    expect(ldtkExtension.assets).toBeDefined();
    expect(ldtkExtension.assets).toEqual([ldtkMapBinding, ldtkProjectBinding]);
  });

  it('is a frozen descriptor', () => {
    expect(Object.isFrozen(ldtkExtension)).toBe(true);
  });
});

function fakeLoader(): Loader {
  return { load: vi.fn() } as unknown as Loader;
}

describe('@codexo/exojs-ldtk asset binding — ldtkMapBinding', () => {
  it('targets the LdtkMap constructor', () => {
    expect(ldtkMapBinding.ctor).toBe(LdtkMap);
  });

  it('has typeNames ["ldtkMap"]', () => {
    expect(ldtkMapBinding.typeNames).toEqual(['ldtkMap']);
  });

  it('claims the .ldtk file extension', () => {
    expect(ldtkMapBinding.extensions).toEqual(['ldtk']);
  });

  it('create() returns a handler with a load function', () => {
    const handler = ldtkMapBinding.create(fakeLoader());
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
    const fetchJson = vi.fn(async (requested: string) => {
      expect(requested).toBe(source);
      return fixture;
    });
    const context: AssetLoaderContext = {
      loader: { load: vi.fn() } as unknown as AssetLoaderContext['loader'],
      scope: { load: vi.fn() } as unknown as AssetLoaderContext['scope'],
      resourceKey: 'test',
    sourceKey: 'test',
    locator: 'url:test',
      resolveUrl: (source: string) => source,
      fetchText: vi.fn(),
      fetchArrayBuffer: vi.fn(),
      fetchJson: fetchJson as AssetLoaderContext['fetchJson'],
    };

    const handler = ldtkMapBinding.create(context.loader);
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

  it('collects both LDtk asset bindings', () => {
    const snapshot = buildSnapshot([ldtkExtension]);
    expect(snapshot.assets).toHaveLength(2);
    expect(snapshot.assets).toContain(ldtkMapBinding);
    expect(snapshot.assets).toContain(ldtkProjectBinding);
  });

  it('pulls in the tilemap renderer binding (one-extension rendering)', () => {
    const snapshot = buildSnapshot([ldtkExtension]);
    // The tilemap dependency contributes its tile chunk renderer binding, so an
    // LDtk-only setup can both load AND render without manual registration.
    expect(snapshot.renderers).toHaveLength(1);
  });
});

