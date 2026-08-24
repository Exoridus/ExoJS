import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { Asset, type AssetFactoryContext, logger, type Texture } from '@codexo/exojs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LdtkData } from '../src/LdtkData';
import { LdtkMap } from '../src/LdtkMap';
import { loadLdtkMap } from '../src/loadLdtkMap';
import { LdtkFormatError } from '../src/validate';

// ── Fixture loading ───────────────────────────────────────────────────────────

// Support both "pnpm test" (cwd=repo root) and "pnpm --filter ... test" (cwd=package).
const PKG_DIR =
  basename(process.cwd()) === 'exojs-ldtk'
    ? process.cwd()
    : join(process.cwd(), 'packages', 'exojs-ldtk');
const FIXTURES_DIR = join(PKG_DIR, 'test', 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
}

// ── Mock context factory ────────────────────────────────────────────────────────

// A texture large enough that any fixture's atlas region fits inside it.
// TextureRegion validates against the *underlying* texture's intrinsic size, so
// a default-constructed (0x0) Texture would be rejected during tileset assembly.
function fakeTexture(): Texture {
  return {
    width: 4096,
    height: 4096,
    uid: 0,
    label: 'test',
    destroy: () => {},
    destroyed: false,
  } as unknown as Texture;
}

/**
 * A dependency scope that answers a `texture` request with a blank atlas and a
 * `json` request from the registered fixtures - the two kinds of asset an LDtk
 * load acquires through its own scope.
 */
function makeContext(fixtures: Record<string, unknown>) {
  const textureLoad = vi.fn((_asset: unknown): Texture => fakeTexture());
  const jsonLoad = vi.fn(async (source: string): Promise<unknown> => {
    if (Object.hasOwn(fixtures, source)) return fixtures[source];
    throw new Error(`load-ldtk-map.test: no fixture registered for source "${source}"`);
  });

  const load = vi.fn(async (asset: unknown): Promise<unknown> => {
    const { type, source } = (asset as { _config: { type: string; source: string } })._config;

    return type === 'json' ? jsonLoad(source) : textureLoad(asset);
  });

  const contextFor = (source: string): AssetFactoryContext =>
    ({
      source,
      resourceKey: `test|${source}`,
      sourceKey: `url:${source}`,
      locator: `url:${source}`,
      dependencies: { load } as unknown as AssetFactoryContext['dependencies'],
    }) as AssetFactoryContext;

  return { contextFor, loaderLoad: textureLoad, jsonLoad };
}

const ABS_SOURCE = 'https://example.com/maps/world.ldtk';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('loadLdtkMap — happy path (absolute source)', () => {
  function context() {
    return makeContext({ [ABS_SOURCE]: loadFixture('world.ldtk') });
  }

  it('returns an LdtkMap with one TileMap per level', async () => {
    const map = await loadLdtkMap(context().contextFor(ABS_SOURCE));
    expect(map).toBeInstanceOf(LdtkMap);
    expect(map.levels).toHaveLength(1);
  });

  it('stores the source URL on the returned map', async () => {
    const map = await loadLdtkMap(context().contextFor(ABS_SOURCE));
    expect(map.source).toBe(ABS_SOURCE);
  });

  it('fetches the .ldtk JSON from the source', async () => {
    const { contextFor, jsonLoad } = context();
    await loadLdtkMap(contextFor(ABS_SOURCE));
    expect(jsonLoad).toHaveBeenCalledWith(ABS_SOURCE);
  });

  it('loads the tileset atlas image resolved against the source URL', async () => {
    const { contextFor, loaderLoad } = context();
    await loadLdtkMap(contextFor(ABS_SOURCE));
    // resolveLdtkUrl('tiles.png', 'https://example.com/maps/world.ldtk')
    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', 'https://example.com/maps/tiles.png'));
  });

  it('populates the Tiles layer with the gridTiles once the tileset is available', async () => {
    const map = await loadLdtkMap(context().contextFor(ABS_SOURCE));
    const tilesLayer = map.levels[0]!.layers.find(l => l.name === 'Tiles')!;
    // fixture places 2 gridTiles
    expect(tilesLayer.countNonEmptyTiles()).toBe(2);
  });

  it('exposes entity layers as ObjectLayers', async () => {
    const map = await loadLdtkMap(context().contextFor(ABS_SOURCE));
    const objectLayers = map.levels[0]!.objectLayers;
    expect(objectLayers).toHaveLength(1);
    expect(objectLayers[0]!.objects[0]!.type).toBe('Player');
  });

  it('never adds an ldtkWorldIid property key for a single-world document (backward-compat guard)', async () => {
    const map = await loadLdtkMap(context().contextFor(ABS_SOURCE));
    expect(Object.hasOwn(map.levels[0]!.properties, 'ldtkWorldIid')).toBe(false);
  });
});

describe('loadLdtkMap — multi-world (worlds[] present)', () => {
  const MULTI_WORLD_SOURCE = 'https://example.com/maps/multi-world.ldtk';

  function context() {
    return makeContext({ [MULTI_WORLD_SOURCE]: loadFixture('multi-world.ldtk') });
  }

  it('flattens every world into map.levels, in world order', async () => {
    const map = await loadLdtkMap(context().contextFor(MULTI_WORLD_SOURCE));
    expect(map.levels).toHaveLength(3);
    expect(map.levels.map(l => l.name)).toEqual(['A_Level1', 'A_Level2', 'B_Level1']);
  });

  it("tags each level's properties with its owning world's iid", async () => {
    const map = await loadLdtkMap(context().contextFor(MULTI_WORLD_SOURCE));
    expect(map.levels[0]!.properties['ldtkWorldIid']).toBe('world-a-iid');
    expect(map.levels[1]!.properties['ldtkWorldIid']).toBe('world-a-iid');
    expect(map.levels[2]!.properties['ldtkWorldIid']).toBe('world-b-iid');
  });

  it('finds levels across worlds via getLevelByName', async () => {
    const map = await loadLdtkMap(context().contextFor(MULTI_WORLD_SOURCE));
    expect(map.getLevelByName('A_Level1')).toBe(map.levels[0]);
    expect(map.getLevelByName('B_Level1')).toBe(map.levels[2]);
    expect(map.getLevelByName('Missing')).toBeUndefined();
  });

  it('populates tile/entity data for a level nested inside a world (defs shared at root)', async () => {
    const map = await loadLdtkMap(context().contextFor(MULTI_WORLD_SOURCE));
    const tilesLayer = map.levels[0]!.layers.find(l => l.name === 'Tiles')!;
    expect(tilesLayer.countNonEmptyTiles()).toBe(2);
    expect(map.levels[0]!.objectLayers[0]!.objects[0]!.type).toBe('Player');
  });
});

describe('loadLdtkMap — multi-world with an external (.ldtkl) level', () => {
  // Combines Task 2's world-flattening with the existing external-level
  // resolution: one level in World A is externalized; World B's level is
  // stored inline. Both must resolve correctly through the same flattened
  // pass.
  const MULTI_SOURCE = 'https://example.com/maps/multi-external.ldtk';
  const EXTERNAL_URL = 'https://example.com/maps/levels/A_External.ldtkl';

  const rootFixture: LdtkData = {
    jsonVersion: '1.5.3',
    defaultGridSize: 16,
    defs: {
      tilesets: [],
      layers: [{ uid: 101, identifier: 'Entities', type: 'Entities', gridSize: 16 }],
    },
    levels: [],
    worlds: [
      {
        identifier: 'WorldA',
        iid: 'world-a-iid',
        worldGridWidth: 256,
        worldGridHeight: 256,
        worldLayout: 'Free',
        levels: [
          {
            identifier: 'A_External',
            uid: 1,
            iid: 'iid-a-external',
            worldX: 0,
            worldY: 0,
            pxWid: 64,
            pxHei: 16,
            layerInstances: null,
            externalRelPath: 'levels/A_External.ldtkl',
          },
        ],
      },
      {
        identifier: 'WorldB',
        iid: 'world-b-iid',
        worldGridWidth: 128,
        worldGridHeight: 128,
        worldLayout: 'Free',
        levels: [
          {
            identifier: 'B_Inline',
            uid: 2,
            iid: 'iid-b-inline',
            worldX: 0,
            worldY: 0,
            pxWid: 16,
            pxHei: 16,
            layerInstances: [],
          },
        ],
      },
    ],
  };

  const externalFixture = {
    identifier: 'A_External',
    uid: 1,
    iid: 'iid-a-external',
    worldX: 0,
    worldY: 0,
    pxWid: 64,
    pxHei: 16,
    fieldInstances: [],
    layerInstances: [
      {
        __identifier: 'Entities',
        __type: 'Entities',
        __cWid: 4,
        __cHei: 1,
        __gridSize: 16,
        layerDefUid: 101,
        levelId: 1,
        visible: true,
        iid: 'ent-a-external',
        entityInstances: [
          {
            __identifier: 'Player',
            __type: 'Player',
            px: [8, 8],
            width: 16,
            height: 16,
            __pivot: [0, 0],
            fieldInstances: [],
            iid: 'player-a-external',
            defUid: 200,
          },
        ],
      },
    ],
  };

  function context() {
    return makeContext({
      [MULTI_SOURCE]: rootFixture,
      [EXTERNAL_URL]: externalFixture,
    });
  }

  it('fetches the external .ldtkl file for the level nested inside a world', async () => {
    const { contextFor, jsonLoad } = context();
    await loadLdtkMap(contextFor(MULTI_SOURCE));
    expect(jsonLoad).toHaveBeenCalledWith(EXTERNAL_URL);
  });

  it('merges the resolved external level into map.levels alongside the inline one', async () => {
    const map = await loadLdtkMap(context().contextFor(MULTI_SOURCE));
    expect(map.levels).toHaveLength(2);
    expect(map.levels.map(l => l.name)).toEqual(['A_External', 'B_Inline']);

    const external = map.levels[0]!;
    expect(external.objectLayers).toHaveLength(1);
    expect(external.objectLayers[0]!.objects[0]!.type).toBe('Player');
  });

  it("still tags the externally-resolved level with its owning world's iid", async () => {
    const map = await loadLdtkMap(context().contextFor(MULTI_SOURCE));
    expect(map.levels[0]!.properties['ldtkWorldIid']).toBe('world-a-iid');
    expect(map.levels[1]!.properties['ldtkWorldIid']).toBe('world-b-iid');
  });
});

describe('loadLdtkMap — external levels (.ldtkl)', () => {
  // "Save levels to separate files" projects null out layerInstances on the
  // root document and store the real layer data in a sibling `<id>.ldtkl`
  // file referenced by externalRelPath.
  const EXTERNAL_URL = 'https://example.com/maps/levels/Level_0.ldtkl';

  const rootFixture: LdtkData = {
    jsonVersion: '1.5.3',
    defaultGridSize: 16,
    defs: {
      tilesets: [],
      layers: [{ uid: 101, identifier: 'Entities', type: 'Entities', gridSize: 16 }],
    },
    levels: [
      {
        identifier: 'Level_0',
        uid: 1,
        iid: 'iid-1',
        worldX: 0,
        worldY: 0,
        pxWid: 64,
        pxHei: 16,
        layerInstances: null,
        externalRelPath: 'levels/Level_0.ldtkl',
        // The root doc's own fieldInstances copy is stale/stripped once a
        // level is externalized; the .ldtkl file's copy is authoritative.
        fieldInstances: [{ __identifier: 'stale', __type: 'String', __value: 'root' }],
      },
    ],
  };

  const externalFixture = {
    identifier: 'Level_0',
    uid: 1,
    iid: 'iid-1',
    worldX: 0,
    worldY: 0,
    pxWid: 64,
    pxHei: 16,
    fieldInstances: [{ __identifier: 'difficulty', __type: 'String', __value: 'hard' }],
    layerInstances: [
      {
        __identifier: 'Entities',
        __type: 'Entities',
        __cWid: 4,
        __cHei: 1,
        __gridSize: 16,
        layerDefUid: 101,
        levelId: 1,
        visible: true,
        iid: 'ent-1',
        entityInstances: [
          {
            __identifier: 'Player',
            __type: 'Player',
            px: [8, 8],
            width: 16,
            height: 16,
            __pivot: [0, 0],
            fieldInstances: [],
            iid: 'player-1',
            defUid: 200,
          },
        ],
      },
    ],
  };

  function context() {
    return makeContext({
      [ABS_SOURCE]: rootFixture,
      [EXTERNAL_URL]: externalFixture,
    });
  }

  it('fetches the external .ldtkl file for a level with null layerInstances', async () => {
    const { contextFor, jsonLoad } = context();
    await loadLdtkMap(contextFor(ABS_SOURCE));
    expect(jsonLoad).toHaveBeenCalledWith(EXTERNAL_URL);
  });

  it('merges the external layerInstances into the level before conversion (no longer empty)', async () => {
    const map = await loadLdtkMap(context().contextFor(ABS_SOURCE));
    const level = map.levels[0]!;
    expect(level.objectLayers).toHaveLength(1);
    expect(level.objectLayers[0]!.objects).toHaveLength(1);
    expect(level.objectLayers[0]!.objects[0]!.type).toBe('Player');
  });

  it('prefers the external fieldInstances over the stale root copy', async () => {
    const map = await loadLdtkMap(context().contextFor(ABS_SOURCE));
    const level = map.levels[0]!;
    expect(level.properties['difficulty']).toBe('hard');
    expect(level.properties['stale']).toBeUndefined();
  });
});

describe('loadLdtkMap — external level omits fieldInstances entirely', () => {
  // Distinct from the "prefers the external fieldInstances" case above: here the
  // external payload does not carry the key at all (undefined, not `[]`), so
  // loadExternalLevel's `external.fieldInstances ?? level.fieldInstances` must
  // fall back to the root level's own fieldInstances rather than dropping them.
  const EXTERNAL_URL = 'https://example.com/maps/levels/Level_0.ldtkl';

  const rootFixture: LdtkData = {
    jsonVersion: '1.5.3',
    defaultGridSize: 16,
    defs: {
      tilesets: [],
      layers: [{ uid: 101, identifier: 'Entities', type: 'Entities', gridSize: 16 }],
    },
    levels: [
      {
        identifier: 'Level_0',
        uid: 1,
        iid: 'iid-1',
        worldX: 0,
        worldY: 0,
        pxWid: 64,
        pxHei: 16,
        layerInstances: null,
        externalRelPath: 'levels/Level_0.ldtkl',
        fieldInstances: [{ __identifier: 'kept', __type: 'String', __value: 'root-value' }],
      },
    ],
  };

  const externalFixture = {
    identifier: 'Level_0',
    uid: 1,
    iid: 'iid-1',
    worldX: 0,
    worldY: 0,
    pxWid: 64,
    pxHei: 16,
    // fieldInstances intentionally omitted (not even an empty array).
    layerInstances: [],
  };

  function context() {
    return makeContext({
      [ABS_SOURCE]: rootFixture,
      [EXTERNAL_URL]: externalFixture,
    });
  }

  it("falls back to the root level's fieldInstances when the external payload has none", async () => {
    const map = await loadLdtkMap(context().contextFor(ABS_SOURCE));
    expect(map.levels[0]!.properties['kept']).toBe('root-value');
  });
});

describe('loadLdtkMap — tilesets without an atlas image', () => {
  // relPath: null → an embed-atlas tileset whose image lives in the LDtk
  // editor. It is skipped, but the skip is announced.
  const fixture: LdtkData = {
    jsonVersion: '1.5.3',
    defaultGridSize: 16,
    defs: {
      tilesets: [
        {
          uid: 1,
          identifier: 'NoImage',
          relPath: null,
          tileGridSize: 16,
          pxWid: 64,
          pxHei: 64,
        },
      ],
      layers: [{ uid: 101, identifier: 'Tiles', type: 'Tiles', gridSize: 16, tilesetDefUid: 1 }],
    },
    levels: [
      {
        identifier: 'L',
        uid: 1,
        iid: 'iid-1',
        worldX: 0,
        worldY: 0,
        pxWid: 64,
        pxHei: 16,
        layerInstances: [
          {
            __identifier: 'Tiles',
            __type: 'Tiles',
            __cWid: 4,
            __cHei: 1,
            __gridSize: 16,
            layerDefUid: 101,
            levelId: 1,
            visible: true,
            iid: 'tiles-1',
            __tilesetDefUid: 1,
            gridTiles: [{ px: [0, 0], src: [0, 0], f: 0, t: 0 }],
          },
        ],
      },
    ],
  };

  it('does not call the loader and leaves tile layers empty', async () => {
    const { contextFor, loaderLoad } = makeContext({ [ABS_SOURCE]: fixture });
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const map = await loadLdtkMap(contextFor(ABS_SOURCE));

    expect(loaderLoad).not.toHaveBeenCalled();
    const tilesLayer = map.levels[0]!.layers[0]!;
    expect(tilesLayer.countNonEmptyTiles()).toBe(0);

    warnSpy.mockRestore();
  });

  it('warns instead of dropping the tileset silently', async () => {
    const { contextFor } = makeContext({ [ABS_SOURCE]: fixture });
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    await loadLdtkMap(contextFor(ABS_SOURCE));

    const messages = warnSpy.mock.calls.map(call => String(call[0]));

    expect(messages.some(message => message.includes('NoImage') && message.includes('relPath is null'))).toBe(true);

    warnSpy.mockRestore();
  });
});

describe('loadLdtkMap — atlas too small for any tile', () => {
  // pxWid (8) < tileGridSize (16) → columns computes to 0. Dropping the tileset
  // would make every cell referencing it vanish, so this is a format error.
  const fixture: LdtkData = {
    jsonVersion: '1.5.3',
    defaultGridSize: 16,
    defs: {
      tilesets: [
        {
          uid: 1,
          identifier: 'Tiny',
          relPath: 'tiny.png',
          tileGridSize: 16,
          pxWid: 8,
          pxHei: 8,
        },
      ],
      layers: [{ uid: 101, identifier: 'Tiles', type: 'Tiles', gridSize: 16, tilesetDefUid: 1 }],
    },
    levels: [
      {
        identifier: 'L',
        uid: 1,
        iid: 'iid-1',
        worldX: 0,
        worldY: 0,
        pxWid: 64,
        pxHei: 16,
        layerInstances: [
          {
            __identifier: 'Tiles',
            __type: 'Tiles',
            __cWid: 4,
            __cHei: 1,
            __gridSize: 16,
            layerDefUid: 101,
            levelId: 1,
            visible: true,
            iid: 'tiles-1',
            __tilesetDefUid: 1,
            gridTiles: [{ px: [0, 0], src: [0, 0], f: 0, t: 0 }],
          },
        ],
      },
    ],
  };

  it('throws LdtkFormatError naming the tileset instead of dropping it', async () => {
    const { contextFor, loaderLoad } = makeContext({ [ABS_SOURCE]: fixture });

    await expect(loadLdtkMap(contextFor(ABS_SOURCE))).rejects.toThrow(LdtkFormatError);

    // The texture load happens before the geometry check, so it IS requested.
    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', 'https://example.com/maps/tiny.png'));
  });

  it('names the offending tileset and its geometry in the message', async () => {
    const { contextFor } = makeContext({ [ABS_SOURCE]: fixture });

    await expect(loadLdtkMap(contextFor(ABS_SOURCE))).rejects.toThrow(/Tiny.*8×8.*tileGridSize 16/s);
  });
});

describe('loadLdtkMap — relative-source URL resolution', () => {
  // resolveLdtkUrl now mirrors the Tiled adapter: a tileset relPath resolves
  // against a RELATIVE .ldtk source without throwing, collapsing ../ / ./ and
  // staying relative in the result.
  const makeFixture = (relPath: string): LdtkData => ({
    jsonVersion: '1.5.3',
    defaultGridSize: 16,
    defs: {
      tilesets: [
        {
          uid: 1,
          identifier: 'Atlas',
          relPath,
          tileGridSize: 16,
          pxWid: 64,
          pxHei: 64,
        },
      ],
      layers: [],
    },
    levels: [],
  });

  it('resolves a tileset relPath against a relative .ldtk source instead of throwing', async () => {
    const { contextFor, loaderLoad } = makeContext({ 'maps/world.ldtk': makeFixture('tiles.png') });

    await expect(loadLdtkMap(contextFor('maps/world.ldtk'))).resolves.toBeDefined();

    // The texture is requested at the source-relative path, still relative.
    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', 'maps/tiles.png'));
  });

  it('collapses ../ segments in a relPath against a relative source', async () => {
    const { contextFor, loaderLoad } = makeContext({ 'maps/world.ldtk': makeFixture('../art/tiles.png') });

    await loadLdtkMap(contextFor('maps/world.ldtk'));

    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', 'art/tiles.png'));
  });

  it('still resolves against an absolute source (unchanged behaviour)', async () => {
    const { contextFor, loaderLoad } = makeContext({ 'https://example.com/maps/world.ldtk': makeFixture('tiles.png') });

    await loadLdtkMap(contextFor('https://example.com/maps/world.ldtk'));

    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', 'https://example.com/maps/tiles.png'));
  });
});

describe('loadLdtkMap — structural validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws a typed LdtkFormatError for an empty document', async () => {
    const { contextFor } = makeContext({ [ABS_SOURCE]: {} });
    await expect(loadLdtkMap(contextFor(ABS_SOURCE))).rejects.toThrow(LdtkFormatError);
  });

  it('names the source and the offending property path', async () => {
    const broken = JSON.parse(JSON.stringify(loadFixture('world.ldtk'))) as any;
    broken.levels[0].layerInstances[0].gridTiles[0].t = 'first';
    const { contextFor } = makeContext({ [ABS_SOURCE]: broken });
    await expect(loadLdtkMap(contextFor(ABS_SOURCE))).rejects.toThrow(
      /world\.ldtk" at levels\[0\]\.layerInstances\[0\]\.gridTiles\[0\]\.t/,
    );
  });

  it('does not fetch tileset images for a document that fails validation', async () => {
    const { contextFor, loaderLoad } = makeContext({ [ABS_SOURCE]: { jsonVersion: '1.5.3', defs: {}, levels: [] } });
    await expect(loadLdtkMap(contextFor(ABS_SOURCE))).rejects.toThrow(LdtkFormatError);
    expect(loaderLoad).not.toHaveBeenCalled();
  });

  it('validates an external .ldtkl payload against the external file as source', async () => {
    const root: LdtkData = {
      jsonVersion: '1.5.3',
      defaultGridSize: 16,
      defs: { tilesets: [], layers: [] },
      levels: [{
        identifier: 'Level_0', uid: 1, iid: 'iid-1', worldX: 0, worldY: 0, pxWid: 16, pxHei: 16,
        layerInstances: null, externalRelPath: 'levels/Level_0.ldtkl',
      }],
    };
    const external = { identifier: 'Level_0', uid: 1, iid: 'iid-1', worldX: 0, worldY: 0, pxWid: 16, pxHei: 'tall', layerInstances: [] };
    const { contextFor } = makeContext({
      [ABS_SOURCE]: root,
      'https://example.com/maps/levels/Level_0.ldtkl': external,
    });

    await expect(loadLdtkMap(contextFor(ABS_SOURCE))).rejects.toThrow(
      /levels\/Level_0\.ldtkl" at pxHei/,
    );
  });
});
