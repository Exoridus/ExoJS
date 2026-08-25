// Root entry: pulls in the module augmentation that types `loader.load` for
// this package's asset type. Without it the augmentation is not in the program.
import '../src/index';

import type { AssetFactoryContext } from '@codexo/exojs';
import { tilemapExtension } from '@codexo/exojs-tilemap';
import { describe, expect, it, vi } from 'vitest';

import { buildSnapshot } from '../../../src/extensions/snapshot';
import type { LdtkData } from '../src/LdtkData';
import { ldtkExtension } from '../src/ldtkExtension';
import { LdtkMap } from '../src/LdtkMap';
import { ldtkMapType, ldtkProjectType } from '../src/ldtkTypes';

describe('@codexo/exojs-ldtk extension descriptor', () => {
  it('has the correct id', () => {
    expect(ldtkExtension.id).toBe('@codexo/exojs-ldtk');
  });

  it('declares tilemapExtension as a dependency (same object reference)', () => {
    expect(ldtkExtension.dependencies).toBeDefined();
    expect(ldtkExtension.dependencies).toContain(tilemapExtension);
  });

  it('carries both asset types (eager LdtkMap and streaming LdtkProject)', () => {
    expect(ldtkExtension.assets).toBeDefined();
    expect(ldtkExtension.assets).toEqual([ldtkMapType, ldtkProjectType]);
  });

  it('is a frozen descriptor', () => {
    expect(Object.isFrozen(ldtkExtension)).toBe(true);
  });
});

describe('@codexo/exojs-ldtk asset type - ldtkMapType', () => {
  it('dispatches on the LdtkMap constructor', () => {
    expect(ldtkMapType._token).toBe(LdtkMap);
  });

  it('is named "ldtkMap"', () => {
    expect(ldtkMapType.id).toBe('ldtkMap');
  });

  it('claims the .ldtk file extension', () => {
    expect(ldtkMapType.extensions).toEqual(['ldtk']);
  });

  it('acquires nothing itself: the document arrives as a json dependency', () => {
    expect(ldtkMapType.unacquiredSource!()).toEqual({ source: undefined });
  });

  it('builds the map from the document its dependency scope answers with', async () => {
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
    const load = vi.fn(async (asset: unknown) => {
      const config = (asset as { _config: { type: string; source: string } })._config;

      expect(config).toEqual({ type: 'json', source });

      return fixture;
    });

    const result = await ldtkMapType.createFactory().create(undefined, {
      source,
      resourceKey: `test|${source}`,
      sourceKey: `url:${source}`,
      locator: `url:${source}`,
      dependencies: { load } as unknown as AssetFactoryContext['dependencies'],
    } as never);

    expect(result).toBeInstanceOf(LdtkMap);
    expect(result.source).toBe(source);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('buildSnapshot([ldtkExtension])', () => {
  it('materializes tilemapExtension before ldtkExtension', () => {
    const snapshot = buildSnapshot([ldtkExtension]);
    expect(snapshot.extensions.map(e => e.id)).toEqual(['@codexo/exojs-tilemap', '@codexo/exojs-ldtk']);
  });

  it('collects both LDtk asset types', () => {
    const snapshot = buildSnapshot([ldtkExtension]);
    expect(snapshot.assets).toHaveLength(2);
    expect(snapshot.assets).toContain(ldtkMapType);
    expect(snapshot.assets).toContain(ldtkProjectType);
  });

  it('pulls in the tilemap renderer binding (one-extension rendering)', () => {
    const snapshot = buildSnapshot([ldtkExtension]);
    // The tilemap dependency contributes its tile chunk renderer binding, so an
    // LDtk-only setup can both load AND render without manual registration.
    expect(snapshot.renderers).toHaveLength(1);
  });
});
