import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { type AssetLoaderContext, Texture } from '@codexo/exojs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LdtkData } from '../src/LdtkData';
import { LdtkMap } from '../src/LdtkMap';
import { loadLdtkMap } from '../src/loadLdtkMap';

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

function makeContext(fixtures: Record<string, unknown>) {
  const loaderLoad = vi.fn(
    async (_token: unknown, _url: string): Promise<Texture> => fakeTexture(),
  );

  const context: AssetLoaderContext = {
    loader: { load: loaderLoad } as unknown as AssetLoaderContext['loader'],
    identityKey: 'test',
    fetchText: vi.fn(),
    fetchArrayBuffer: vi.fn(),
    fetchJson: vi.fn(async (source: string): Promise<unknown> => {
      if (Object.hasOwn(fixtures, source)) return fixtures[source];
      throw new Error(`load-ldtk-map.test: no fixture registered for source "${source}"`);
    }),
  };

  return { context, loaderLoad };
}

const ABS_SOURCE = 'https://example.com/maps/world.ldtk';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('loadLdtkMap — happy path (absolute source)', () => {
  function context() {
    return makeContext({ [ABS_SOURCE]: loadFixture('world.ldtk') });
  }

  it('returns an LdtkMap with one TileMap per level', async () => {
    const map = await loadLdtkMap(ABS_SOURCE, context().context);
    expect(map).toBeInstanceOf(LdtkMap);
    expect(map.levels).toHaveLength(1);
  });

  it('stores the source URL on the returned map', async () => {
    const map = await loadLdtkMap(ABS_SOURCE, context().context);
    expect(map.source).toBe(ABS_SOURCE);
  });

  it('fetches the .ldtk JSON from the source', async () => {
    const { context: ctx } = context();
    await loadLdtkMap(ABS_SOURCE, ctx);
    expect(ctx.fetchJson).toHaveBeenCalledWith(ABS_SOURCE);
  });

  it('loads the tileset atlas image resolved against the source URL', async () => {
    const { context: ctx, loaderLoad } = context();
    await loadLdtkMap(ABS_SOURCE, ctx);
    // resolveLdtkUrl('tiles.png', 'https://example.com/maps/world.ldtk')
    expect(loaderLoad).toHaveBeenCalledWith(Texture, 'https://example.com/maps/tiles.png');
  });

  it('populates the Tiles layer with the gridTiles once the tileset is available', async () => {
    const map = await loadLdtkMap(ABS_SOURCE, context().context);
    const tilesLayer = map.levels[0]!.layers.find(l => l.name === 'Tiles')!;
    // fixture places 2 gridTiles
    expect(tilesLayer.countNonEmptyTiles()).toBe(2);
  });

  it('exposes entity layers as ObjectLayers', async () => {
    const map = await loadLdtkMap(ABS_SOURCE, context().context);
    const objectLayers = map.levels[0]!.objectLayers;
    expect(objectLayers).toHaveLength(1);
    expect(objectLayers[0]!.objects[0]!.type).toBe('Player');
  });

  it('never adds an ldtkWorldIid property key for a single-world document (backward-compat guard)', async () => {
    const map = await loadLdtkMap(ABS_SOURCE, context().context);
    expect(Object.hasOwn(map.levels[0]!.properties, 'ldtkWorldIid')).toBe(false);
  });
});

describe('loadLdtkMap — multi-world (worlds[] present)', () => {
  const MULTI_WORLD_SOURCE = 'https://example.com/maps/multi-world.ldtk';

  function context() {
    return makeContext({ [MULTI_WORLD_SOURCE]: loadFixture('multi-world.ldtk') });
  }

  it('flattens every world into map.levels, in world order', async () => {
    const map = await loadLdtkMap(MULTI_WORLD_SOURCE, context().context);
    expect(map.levels).toHaveLength(3);
    expect(map.levels.map(l => l.name)).toEqual(['A_Level1', 'A_Level2', 'B_Level1']);
  });

  it("tags each level's properties with its owning world's iid", async () => {
    const map = await loadLdtkMap(MULTI_WORLD_SOURCE, context().context);
    expect(map.levels[0]!.properties['ldtkWorldIid']).toBe('world-a-iid');
    expect(map.levels[1]!.properties['ldtkWorldIid']).toBe('world-a-iid');
    expect(map.levels[2]!.properties['ldtkWorldIid']).toBe('world-b-iid');
  });

  it('finds levels across worlds via getLevelByName', async () => {
    const map = await loadLdtkMap(MULTI_WORLD_SOURCE, context().context);
    expect(map.getLevelByName('A_Level1')).toBe(map.levels[0]);
    expect(map.getLevelByName('B_Level1')).toBe(map.levels[2]);
    expect(map.getLevelByName('Missing')).toBeUndefined();
  });

  it('populates tile/entity data for a level nested inside a world (defs shared at root)', async () => {
    const map = await loadLdtkMap(MULTI_WORLD_SOURCE, context().context);
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
    const { context: ctx } = context();
    await loadLdtkMap(MULTI_SOURCE, ctx);
    expect(ctx.fetchJson).toHaveBeenCalledWith(EXTERNAL_URL);
  });

  it('merges the resolved external level into map.levels alongside the inline one', async () => {
    const map = await loadLdtkMap(MULTI_SOURCE, context().context);
    expect(map.levels).toHaveLength(2);
    expect(map.levels.map(l => l.name)).toEqual(['A_External', 'B_Inline']);

    const external = map.levels[0]!;
    expect(external.objectLayers).toHaveLength(1);
    expect(external.objectLayers[0]!.objects[0]!.type).toBe('Player');
  });

  it("still tags the externally-resolved level with its owning world's iid", async () => {
    const map = await loadLdtkMap(MULTI_SOURCE, context().context);
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
    const { context: ctx } = context();
    await loadLdtkMap(ABS_SOURCE, ctx);
    expect(ctx.fetchJson).toHaveBeenCalledWith(EXTERNAL_URL);
  });

  it('merges the external layerInstances into the level before conversion (no longer empty)', async () => {
    const map = await loadLdtkMap(ABS_SOURCE, context().context);
    const level = map.levels[0]!;
    expect(level.objectLayers).toHaveLength(1);
    expect(level.objectLayers[0]!.objects).toHaveLength(1);
    expect(level.objectLayers[0]!.objects[0]!.type).toBe('Player');
  });

  it('prefers the external fieldInstances over the stale root copy', async () => {
    const map = await loadLdtkMap(ABS_SOURCE, context().context);
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
    const map = await loadLdtkMap(ABS_SOURCE, context().context);
    expect(map.levels[0]!.properties['kept']).toBe('root-value');
  });
});

describe('loadLdtkMap — tilesets without an atlas image', () => {
  // relPath: null → the tileset is skipped entirely; tiles cannot render.
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
    const { context, loaderLoad } = makeContext({ [ABS_SOURCE]: fixture });
    const map = await loadLdtkMap(ABS_SOURCE, context);

    expect(loaderLoad).not.toHaveBeenCalled();
    const tilesLayer = map.levels[0]!.layers[0]!;
    expect(tilesLayer.countNonEmptyTiles()).toBe(0);
  });
});

describe('loadLdtkMap — atlas too small for any tile', () => {
  // pxWid (8) < tileGridSize (16) → columns computes to 0 → tileset is dropped.
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

  it('still loads the texture but drops the tileset (no tiles placed)', async () => {
    const { context, loaderLoad } = makeContext({ [ABS_SOURCE]: fixture });
    const map = await loadLdtkMap(ABS_SOURCE, context);

    // The texture load happens before the column check, so it IS requested.
    expect(loaderLoad).toHaveBeenCalledWith(Texture, 'https://example.com/maps/tiny.png');
    expect(map.levels[0]!.layers[0]!.countNonEmptyTiles()).toBe(0);
  });
});

describe('loadLdtkMap — URL resolution is absolute-base-only (characterization)', () => {
  // resolveLdtkUrl uses `new URL(relPath, baseUrl)` directly, which throws when
  // the base URL is relative. Unlike the Tiled adapter, LDtk does NOT tolerate a
  // relative .ldtk source when a tileset carries a relPath. See report note.
  const fixture: LdtkData = {
    jsonVersion: '1.5.3',
    defaultGridSize: 16,
    defs: {
      tilesets: [
        {
          uid: 1,
          identifier: 'Atlas',
          relPath: 'tiles.png',
          tileGridSize: 16,
          pxWid: 64,
          pxHei: 64,
        },
      ],
      layers: [],
    },
    levels: [],
  };

  it('rejects when the source is a relative URL and a tileset has a relPath', async () => {
    const { context } = makeContext({ 'world.ldtk': fixture });
    await expect(loadLdtkMap('world.ldtk', context)).rejects.toThrow(/Invalid URL/);
  });
});

describe('loadLdtkMap — no structural validation (characterization)', () => {
  // loadLdtkMap casts fetched JSON straight to LdtkData with no schema check, so
  // malformed input surfaces as a raw runtime error during conversion rather than
  // a typed format error.
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws a raw error (not a typed format error) for an empty document', async () => {
    const { context } = makeContext({ [ABS_SOURCE]: {} });
    await expect(loadLdtkMap(ABS_SOURCE, context)).rejects.toThrow();
  });
});
