import { type Texture, TextureRegion } from '@codexo/exojs';
import type { TileProperties } from '@codexo/exojs-tilemap';
import { TileSet } from '@codexo/exojs-tilemap';
import { describe, expect, it, vi } from 'vitest';

import type {
  LdtkData,
  LdtkEntityInstance,
  LdtkFieldInstance,
  LdtkLayerInstance,
  LdtkLevel,
} from '../src/LdtkData';
import { LDTK_FLIP_NONE, LDTK_FLIP_X, LDTK_FLIP_XY, LDTK_FLIP_Y } from '../src/LdtkData';
import { getLdtkIntGridValueAt, ldtkToTileMap } from '../src/ldtkToTileMap';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fakeTexture(): Texture {
  return {
    width: 512,
    height: 512,
    uid: 0,
    label: 'test',
    destroy: () => {},
    destroyed: false,
  } as unknown as Texture;
}

function makeTileset(name = 'Atlas', tileCount = 4): TileSet {
  return new TileSet({
    name,
    texture: new TextureRegion(fakeTexture(), { x: 0, y: 0, width: 512, height: 512 }),
    tileWidth: 16,
    tileHeight: 16,
    tileCount,
  });
}

/** Build a single-level document containing exactly one layer instance. */
function docWithLayer(layer: LdtkLayerInstance, level: Partial<LdtkLevel> = {}): LdtkData {
  return {
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
        pxWid: 64,
        pxHei: 16,
        layerInstances: [layer],
        ...level,
      },
    ],
  };
}

/**
 * Convert a document with one Entities layer holding exactly one entity with
 * exactly one field, returning that entity's converted properties bag.
 */
function convertSingleField(field: LdtkFieldInstance): TileProperties {
  const data = docWithLayer({
    __identifier: 'Entities',
    __type: 'Entities',
    __cWid: 4,
    __cHei: 1,
    __gridSize: 16,
    layerDefUid: 130,
    levelId: 1,
    visible: true,
    iid: 'ent-1',
    entityInstances: [
      {
        __identifier: 'E',
        __type: 'E',
        px: [0, 0],
        width: 16,
        height: 16,
        __pivot: [0, 0],
        iid: 'e-1',
        defUid: 0,
        fieldInstances: [field],
      },
    ],
  });
  return ldtkToTileMap(data).levels[0]!.objectLayers[0]!.objects[0]!.properties;
}

// ── Flip-bit constants ──────────────────────────────────────────────────────────

describe('LDtk flip-bit constants', () => {
  it('have the LDtk-documented values', () => {
    expect(LDTK_FLIP_NONE).toBe(0);
    expect(LDTK_FLIP_X).toBe(1);
    expect(LDTK_FLIP_Y).toBe(2);
    expect(LDTK_FLIP_XY).toBe(3);
  });

  it('compose as an X|Y bitmask', () => {
    expect(LDTK_FLIP_X | LDTK_FLIP_Y).toBe(LDTK_FLIP_XY);
    expect(LDTK_FLIP_XY & LDTK_FLIP_X).not.toBe(0);
    expect(LDTK_FLIP_XY & LDTK_FLIP_Y).not.toBe(0);
    expect(LDTK_FLIP_NONE & LDTK_FLIP_X).toBe(0);
    expect(LDTK_FLIP_NONE & LDTK_FLIP_Y).toBe(0);
  });
});

// ── Tile population + flip decoding (Tiles layer, WITH a tileset) ───────────────

describe('ldtkToTileMap — tile population with a tileset', () => {
  const tileset = makeTileset('Atlas', 4);

  const data = docWithLayer({
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
    gridTiles: [
      { px: [0, 0], src: [16, 0], f: 0, t: 1 }, // tx0, no flip
      { px: [16, 0], src: [16, 0], f: 1, t: 1 }, // tx1, flipX
      { px: [32, 0], src: [16, 0], f: 2, t: 1 }, // tx2, flipY
      { px: [48, 0], src: [16, 0], f: 3, t: 1 }, // tx3, flipX + flipY
    ],
    autoLayerTiles: [],
  });

  function convert() {
    return ldtkToTileMap(data, { tilesets: new Map([[1, tileset]]) });
  }

  it('places one tile per gridTiles entry', () => {
    const layer = convert().levels[0]!.layers[0]!;
    expect(layer.countNonEmptyTiles()).toBe(4);
  });

  it('decodes flip bits onto each tile transform', () => {
    const layer = convert().levels[0]!.layers[0]!;

    const none = layer.getTileAt(0, 0);
    expect(none).not.toBeNull();
    expect(none!.transform.flipX).toBe(false);
    expect(none!.transform.flipY).toBe(false);

    const flipX = layer.getTileAt(1, 0);
    expect(flipX!.transform.flipX).toBe(true);
    expect(flipX!.transform.flipY).toBe(false);

    const flipY = layer.getTileAt(2, 0);
    expect(flipY!.transform.flipX).toBe(false);
    expect(flipY!.transform.flipY).toBe(true);

    const flipXy = layer.getTileAt(3, 0);
    expect(flipXy!.transform.flipX).toBe(true);
    expect(flipXy!.transform.flipY).toBe(true);
  });

  it('never sets the diagonal transform (LDtk has no anti-diagonal flip)', () => {
    const layer = convert().levels[0]!.layers[0]!;
    for (let tx = 0; tx < 4; tx++) {
      expect(layer.getTileAt(tx, 0)!.transform.diagonal).toBe(false);
    }
  });

  it('maps the LDtk tile index `t` to the resolved localTileId and tileset', () => {
    const tile = convert().levels[0]!.layers[0]!.getTileAt(0, 0)!;
    expect(tile.localTileId).toBe(1);
    expect(tile.tileset).toBe(tileset);
  });
});

describe('ldtkToTileMap — tile population edge cases', () => {
  const tileset = makeTileset('Atlas', 4);

  it('skips tiles whose local index is out of the tileset range', () => {
    const data = docWithLayer({
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
      gridTiles: [
        { px: [0, 0], src: [0, 0], f: 0, t: 0 }, // valid
        { px: [16, 0], src: [0, 0], f: 0, t: 99 }, // t >= tileCount → skipped
        { px: [32, 0], src: [0, 0], f: 0, t: -1 }, // t < 0 → skipped
      ],
      autoLayerTiles: [],
    });

    const layer = ldtkToTileMap(data, { tilesets: new Map([[1, tileset]]) }).levels[0]!
      .layers[0]!;
    expect(layer.countNonEmptyTiles()).toBe(1);
    expect(layer.getTileAt(1, 0)).toBeNull();
    expect(layer.getTileAt(2, 0)).toBeNull();
  });

  it('skips tiles that fall outside the layer grid', () => {
    const data = docWithLayer({
      __identifier: 'Tiles',
      __type: 'Tiles',
      __cWid: 2,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 101,
      levelId: 1,
      visible: true,
      iid: 'tiles-1',
      __tilesetDefUid: 1,
      gridTiles: [
        { px: [0, 0], src: [0, 0], f: 0, t: 0 }, // tx0, in bounds
        { px: [48, 0], src: [0, 0], f: 0, t: 0 }, // tx3, out of bounds (width 2)
      ],
      autoLayerTiles: [],
    });

    const layer = ldtkToTileMap(data, { tilesets: new Map([[1, tileset]]) }).levels[0]!
      .layers[0]!;
    expect(layer.countNonEmptyTiles()).toBe(1);
    expect(layer.getTileAt(0, 0)).not.toBeNull();
  });

  it('places no tiles when the layer references a tileset uid not in the map', () => {
    const data = docWithLayer({
      __identifier: 'Tiles',
      __type: 'Tiles',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 101,
      levelId: 1,
      visible: true,
      iid: 'tiles-1',
      __tilesetDefUid: 999, // no entry in tilesets map
      gridTiles: [{ px: [0, 0], src: [0, 0], f: 0, t: 0 }],
      autoLayerTiles: [],
    });

    const layer = ldtkToTileMap(data, { tilesets: new Map([[1, tileset]]) }).levels[0]!
      .layers[0]!;
    expect(layer.countNonEmptyTiles()).toBe(0);
  });
});

// ── AutoLayer + IntGrid render-tile sourcing ────────────────────────────────────

describe('ldtkToTileMap — AutoLayer', () => {
  const tileset = makeTileset('Atlas', 4);

  it('renders from autoLayerTiles (not gridTiles) into a TileLayer', () => {
    const data = docWithLayer({
      __identifier: 'Walls',
      __type: 'AutoLayer',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 110,
      levelId: 1,
      visible: true,
      iid: 'auto-1',
      __tilesetDefUid: 1,
      autoLayerTiles: [{ px: [16, 0], src: [0, 0], f: 1, t: 2 }],
    });

    const map = ldtkToTileMap(data, { tilesets: new Map([[1, tileset]]) }).levels[0]!;
    expect(map.layers).toHaveLength(1);
    expect(map.objectLayers).toHaveLength(0);
    const tile = map.layers[0]!.getTileAt(1, 0)!;
    expect(tile.localTileId).toBe(2);
    expect(tile.transform.flipX).toBe(true);
  });
});

describe('ldtkToTileMap — IntGrid', () => {
  const tileset = makeTileset('Atlas', 4);

  it('renders auto-tiles when an IntGrid layer carries autoLayerTiles + a tileset', () => {
    const data = docWithLayer({
      __identifier: 'Collision',
      __type: 'IntGrid',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 120,
      levelId: 1,
      visible: true,
      iid: 'int-1',
      __tilesetDefUid: 1,
      intGridCsv: [1, 0, 0, 0],
      autoLayerTiles: [{ px: [0, 0], src: [0, 0], f: 0, t: 3 }],
    });

    const layer = ldtkToTileMap(data, { tilesets: new Map([[1, tileset]]) }).levels[0]!
      .layers[0]!;
    expect(layer.countNonEmptyTiles()).toBe(1);
    expect(layer.getTileAt(0, 0)!.localTileId).toBe(3);
  });

  it('produces a data-only (empty) TileLayer when IntGrid has no auto-tiles', () => {
    const data = docWithLayer({
      __identifier: 'Collision',
      __type: 'IntGrid',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 120,
      levelId: 1,
      visible: true,
      iid: 'int-1',
      __tilesetDefUid: 1,
      intGridCsv: [1, 2, 3, 4],
    });

    const layer = ldtkToTileMap(data, { tilesets: new Map([[1, tileset]]) }).levels[0]!
      .layers[0]!;
    expect(layer.countNonEmptyTiles()).toBe(0);
    expect(layer.width).toBe(4);
  });
});

describe('ldtkToTileMap — IntGrid value exposure', () => {
  it('exposes the named/coloured IntGrid value at a tile coordinate', () => {
    const data = docWithLayer({
      __identifier: 'Collision',
      __type: 'IntGrid',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 120,
      levelId: 1,
      visible: true,
      iid: 'int-1',
      intGridCsv: [1, 0, 2, 1],
    });
    const withDefs: LdtkData = {
      ...data,
      defs: {
        tilesets: [],
        layers: [
          {
            uid: 120,
            identifier: 'Collision',
            type: 'IntGrid',
            gridSize: 16,
            intGridValues: [
              { value: 1, identifier: 'Wall', color: '#ff0000' },
              { value: 2, identifier: 'Water', color: '#0000ff' },
            ],
          },
        ],
      },
    };

    const layer = ldtkToTileMap(withDefs).levels[0]!.layers[0]!;
    expect(getLdtkIntGridValueAt(layer, 0, 0)).toEqual({
      value: 1,
      identifier: 'Wall',
      color: '#ff0000',
    });
    expect(getLdtkIntGridValueAt(layer, 2, 0)).toEqual({
      value: 2,
      identifier: 'Water',
      color: '#0000ff',
    });
    expect(getLdtkIntGridValueAt(layer, 3, 0)).toEqual({
      value: 1,
      identifier: 'Wall',
      color: '#ff0000',
    });
  });

  it('returns undefined for empty cells (raw value 0)', () => {
    const data = docWithLayer({
      __identifier: 'Collision',
      __type: 'IntGrid',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 120,
      levelId: 1,
      visible: true,
      iid: 'int-1',
      intGridCsv: [1, 0, 2, 1],
    });

    const layer = ldtkToTileMap(data).levels[0]!.layers[0]!;
    expect(getLdtkIntGridValueAt(layer, 1, 0)).toBeUndefined();
  });

  it('returns undefined for out-of-bounds coordinates', () => {
    const data = docWithLayer({
      __identifier: 'Collision',
      __type: 'IntGrid',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 120,
      levelId: 1,
      visible: true,
      iid: 'int-1',
      intGridCsv: [1, 0, 2, 1],
    });

    const layer = ldtkToTileMap(data).levels[0]!.layers[0]!;
    expect(getLdtkIntGridValueAt(layer, -1, 0)).toBeUndefined();
    expect(getLdtkIntGridValueAt(layer, 99, 99)).toBeUndefined();
  });

  it('returns undefined for a layer with no IntGrid data attached (e.g. a Tiles layer)', () => {
    const data = docWithLayer({
      __identifier: 'Tiles',
      __type: 'Tiles',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 101,
      levelId: 1,
      visible: true,
      iid: 'tiles-1',
      gridTiles: [],
      autoLayerTiles: [],
    });

    const layer = ldtkToTileMap(data).levels[0]!.layers[0]!;
    expect(getLdtkIntGridValueAt(layer, 0, 0)).toBeUndefined();
  });

  it('returns undefined for a raw value with no matching definition', () => {
    const data = docWithLayer({
      __identifier: 'Collision',
      __type: 'IntGrid',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 120,
      levelId: 1,
      visible: true,
      iid: 'int-1',
      intGridCsv: [5, 0, 0, 0], // 5 has no defs.layers[].intGridValues entry
    });

    const layer = ldtkToTileMap(data).levels[0]!.layers[0]!;
    expect(getLdtkIntGridValueAt(layer, 0, 0)).toBeUndefined();
  });

  it('parses the CSV/value-defs JSON only once per layer, regardless of call count', () => {
    const data = docWithLayer({
      __identifier: 'Collision',
      __type: 'IntGrid',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 120,
      levelId: 1,
      visible: true,
      iid: 'int-1',
      intGridCsv: [1, 0, 2, 1],
    });
    const withDefs: LdtkData = {
      ...data,
      defs: {
        tilesets: [],
        layers: [
          {
            uid: 120,
            identifier: 'Collision',
            type: 'IntGrid',
            gridSize: 16,
            intGridValues: [
              { value: 1, identifier: 'Wall', color: '#ff0000' },
              { value: 2, identifier: 'Water', color: '#0000ff' },
            ],
          },
        ],
      },
    };

    const layer = ldtkToTileMap(withDefs).levels[0]!.layers[0]!;

    const parseSpy = vi.spyOn(JSON, 'parse');
    try {
      // Repeated lookups across the whole layer, several times over — a
      // naive implementation would re-parse both JSON-encoded properties on
      // every single call.
      for (let pass = 0; pass < 5; pass++) {
        expect(getLdtkIntGridValueAt(layer, 0, 0)).toEqual({
          value: 1,
          identifier: 'Wall',
          color: '#ff0000',
        });
        expect(getLdtkIntGridValueAt(layer, 1, 0)).toBeUndefined();
        expect(getLdtkIntGridValueAt(layer, 2, 0)).toEqual({
          value: 2,
          identifier: 'Water',
          color: '#0000ff',
        });
        expect(getLdtkIntGridValueAt(layer, 3, 0)).toEqual({
          value: 1,
          identifier: 'Wall',
          color: '#ff0000',
        });
      }

      // One parse for the CSV array, one for the value-defs array — cached
      // after the first lookup and reused for every subsequent call.
      expect(parseSpy).toHaveBeenCalledTimes(2);
    } finally {
      parseSpy.mockRestore();
    }
  });
});

// ── Level field instances ────────────────────────────────────────────────────────

describe('ldtkToTileMap — level field instances', () => {
  it('merges scalar level field instances into TileMap.properties', () => {
    const data: LdtkData = {
      jsonVersion: '1.5.3',
      defaultGridSize: 16,
      defs: { tilesets: [], layers: [] },
      levels: [
        {
          identifier: 'L',
          uid: 7,
          iid: 'iid-7',
          worldX: 0,
          worldY: 0,
          pxWid: 32,
          pxHei: 32,
          layerInstances: [],
          fieldInstances: [
            { __identifier: 'difficulty', __type: 'String', __value: 'hard' },
            { __identifier: 'timeLimit', __type: 'Int', __value: 60 },
          ],
        },
      ],
    };

    const map = ldtkToTileMap(data).levels[0]!;
    expect(map.properties['difficulty']).toBe('hard');
    expect(map.properties['timeLimit']).toBe(60);
    expect(map.properties['ldtkUid']).toBe(7);
    expect(map.properties['ldtkIid']).toBe('iid-7');
  });

  it('never lets a user-defined field clobber a reserved key (reserved keys win)', () => {
    const data: LdtkData = {
      jsonVersion: '1.5.3',
      defaultGridSize: 16,
      defs: { tilesets: [], layers: [] },
      levels: [
        {
          identifier: 'L',
          uid: 7,
          iid: 'iid-7',
          worldX: 0,
          worldY: 0,
          pxWid: 32,
          pxHei: 32,
          layerInstances: [],
          fieldInstances: [
            { __identifier: 'ldtkUid', __type: 'Int', __value: 999 },
            { __identifier: 'worldX', __type: 'Int', __value: -1 },
          ],
        },
      ],
    };

    const map = ldtkToTileMap(data).levels[0]!;
    expect(map.properties['ldtkUid']).toBe(7);
    expect(map.properties['worldX']).toBe(0);
  });

  it('produces only the reserved keys when fieldInstances is absent', () => {
    const data: LdtkData = {
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
          pxWid: 32,
          pxHei: 32,
          layerInstances: [],
        },
      ],
    };

    const map = ldtkToTileMap(data).levels[0]!;
    expect(Object.keys(map.properties).sort()).toEqual([
      'ldtkIid',
      'ldtkUid',
      'worldX',
      'worldY',
    ]);
  });
});

// ── Entity pivot correction ────────────────────────────────────────────────────

describe('ldtkToTileMap — entity pivot correction', () => {
  it('adjusts px by the pivot to compute the bounding-box top-left corner', () => {
    const data = docWithLayer({
      __identifier: 'Entities',
      __type: 'Entities',
      __cWid: 4,
      __cHei: 4,
      __gridSize: 16,
      layerDefUid: 130,
      levelId: 1,
      visible: true,
      iid: 'ent-1',
      entityInstances: [
        {
          __identifier: 'Torch',
          __type: 'Torch',
          px: [40, 64],
          width: 16,
          height: 32,
          __pivot: [0.5, 1],
          iid: 'torch-1',
          defUid: 400,
          fieldInstances: [],
        },
      ],
    });

    const object = ldtkToTileMap(data).levels[0]!.objectLayers[0]!.objects[0]!;
    // x = 40 - 16 * 0.5 = 32; y = 64 - 32 * 1 = 32
    expect(object.x).toBe(32);
    expect(object.y).toBe(32);
  });

  it('leaves position unchanged for a default top-left pivot [0, 0]', () => {
    const data = docWithLayer({
      __identifier: 'Entities',
      __type: 'Entities',
      __cWid: 4,
      __cHei: 4,
      __gridSize: 16,
      layerDefUid: 130,
      levelId: 1,
      visible: true,
      iid: 'ent-1',
      entityInstances: [
        {
          __identifier: 'Torch',
          __type: 'Torch',
          px: [40, 64],
          width: 16,
          height: 32,
          __pivot: [0, 0],
          iid: 'torch-1',
          defUid: 400,
          fieldInstances: [],
        },
      ],
    });

    const object = ldtkToTileMap(data).levels[0]!.objectLayers[0]!.objects[0]!;
    expect(object.x).toBe(40);
    expect(object.y).toBe(64);
  });

  it('adjusts by the full width/height for a bottom-right pivot [1, 1]', () => {
    const data = docWithLayer({
      __identifier: 'Entities',
      __type: 'Entities',
      __cWid: 4,
      __cHei: 4,
      __gridSize: 16,
      layerDefUid: 130,
      levelId: 1,
      visible: true,
      iid: 'ent-1',
      entityInstances: [
        {
          __identifier: 'Torch',
          __type: 'Torch',
          px: [40, 64],
          width: 16,
          height: 32,
          __pivot: [1, 1],
          iid: 'torch-1',
          defUid: 400,
          fieldInstances: [],
        },
      ],
    });

    const object = ldtkToTileMap(data).levels[0]!.objectLayers[0]!.objects[0]!;
    expect(object.x).toBe(24); // 40 - 16
    expect(object.y).toBe(32); // 64 - 32
  });
});

// ── Grid-size derivation ────────────────────────────────────────────────────────

describe('ldtkToTileMap — level tile size derivation', () => {
  const tileset = makeTileset('Atlas', 4);

  it('derives the map tile size from the first non-Entities layer', () => {
    const data = docWithLayer(
      {
        __identifier: 'Tiles',
        __type: 'Tiles',
        __cWid: 2,
        __cHei: 1,
        __gridSize: 32, // differs from defaultGridSize (16)
        layerDefUid: 101,
        levelId: 1,
        visible: true,
        iid: 'tiles-1',
        __tilesetDefUid: 1,
        gridTiles: [],
        autoLayerTiles: [],
      },
      { pxWid: 64, pxHei: 32 },
    );

    const map = ldtkToTileMap(data, { tilesets: new Map([[1, tileset]]) }).levels[0]!;
    expect(map.tileWidth).toBe(32);
    expect(map.tileHeight).toBe(32);
    // 64 × 32 px at 32 px/tile → 2 × 1 tiles
    expect(map.width).toBe(2);
    expect(map.height).toBe(1);
  });

  it('skips Entities layers and falls back to data.defaultGridSize', () => {
    const data = docWithLayer(
      {
        __identifier: 'Entities',
        __type: 'Entities',
        __cWid: 4,
        __cHei: 4,
        __gridSize: 16, // ignored: Entities layers do not contribute grid size
        layerDefUid: 130,
        levelId: 1,
        visible: true,
        iid: 'ent-1',
        entityInstances: [],
      },
      { pxWid: 64, pxHei: 64 },
    );
    // Override defaultGridSize to prove the fallback is used (the lone Entities
    // layer must NOT contribute its own __gridSize).
    const tuned: LdtkData = { ...data, defaultGridSize: 8 };

    const map = ldtkToTileMap(tuned).levels[0]!;
    expect(map.tileWidth).toBe(8);
    expect(map.width).toBe(8); // 64 / 8
  });

  it('falls back to 16 when defaultGridSize is absent', () => {
    const data: LdtkData = {
      jsonVersion: '1.5.3',
      defs: { tilesets: [], layers: [] },
      levels: [
        {
          identifier: 'L',
          uid: 1,
          iid: 'iid-1',
          worldX: 0,
          worldY: 0,
          pxWid: 32,
          pxHei: 32,
          layerInstances: [],
        },
      ],
    };

    const map = ldtkToTileMap(data).levels[0]!;
    expect(map.tileWidth).toBe(16);
    expect(map.width).toBe(2);
  });

  it('clamps degenerate level dimensions to a minimum of 1 tile', () => {
    const data: LdtkData = {
      jsonVersion: '1.5.3',
      defaultGridSize: 16,
      defs: { tilesets: [], layers: [] },
      levels: [
        {
          identifier: 'Tiny',
          uid: 1,
          iid: 'iid-1',
          worldX: 0,
          worldY: 0,
          pxWid: 0,
          pxHei: 8, // ceil(8/16) = 1
          layerInstances: [],
        },
      ],
    };

    const map = ldtkToTileMap(data).levels[0]!;
    expect(map.width).toBe(1);
    expect(map.height).toBe(1);
  });
});

// ── Level metadata / properties ─────────────────────────────────────────────────

describe('ldtkToTileMap — level properties', () => {
  it('stores the LDtk uid and iid alongside world coordinates', () => {
    const data: LdtkData = {
      jsonVersion: '1.5.3',
      defaultGridSize: 16,
      defs: { tilesets: [], layers: [] },
      levels: [
        {
          identifier: 'L',
          uid: 42,
          iid: 'level-iid-42',
          worldX: 100,
          worldY: 200,
          pxWid: 32,
          pxHei: 32,
          layerInstances: [],
        },
      ],
    };

    const map = ldtkToTileMap(data).levels[0]!;
    expect(map.properties['ldtkUid']).toBe(42);
    expect(map.properties['ldtkIid']).toBe('level-iid-42');
    expect(map.properties['worldX']).toBe(100);
    expect(map.properties['worldY']).toBe(200);
  });

  it('tolerates a level with null layerInstances (unloaded external level)', () => {
    const data: LdtkData = {
      jsonVersion: '1.5.3',
      defaultGridSize: 16,
      defs: { tilesets: [], layers: [] },
      levels: [
        {
          identifier: 'External',
          uid: 1,
          iid: 'iid-1',
          worldX: 0,
          worldY: 0,
          pxWid: 48,
          pxHei: 16,
          layerInstances: null,
        },
      ],
    };

    const map = ldtkToTileMap(data).levels[0]!;
    expect(map.layers).toHaveLength(0);
    expect(map.objectLayers).toHaveLength(0);
    expect(map.width).toBe(3); // 48 / 16, default grid
  });
});

// ── TileLayer metadata passthrough ──────────────────────────────────────────────

describe('ldtkToTileMap — TileLayer metadata', () => {
  it('forwards id, grid size, visibility, opacity and offsets to the TileLayer', () => {
    const data = docWithLayer({
      __identifier: 'Tiles',
      __type: 'Tiles',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 101,
      levelId: 1,
      visible: false,
      opacity: 0.25,
      pxOffsetX: 7,
      pxOffsetY: 9,
      iid: 'tiles-1',
      gridTiles: [],
      autoLayerTiles: [],
    });

    const layer = ldtkToTileMap(data).levels[0]!.layers[0]!;
    expect(layer.id).toBe(101);
    expect(layer.name).toBe('Tiles');
    expect(layer.tileWidth).toBe(16);
    expect(layer.tileHeight).toBe(16);
    expect(layer.visible).toBe(false);
    expect(layer.opacity).toBe(0.25);
    expect(layer.offsetX).toBe(7);
    expect(layer.offsetY).toBe(9);
  });
});

// ── Entity → ObjectLayer conversion ─────────────────────────────────────────────

describe('ldtkToTileMap — entity field projection', () => {
  it('keeps scalar fields, maps structured/array fields, and omits null-valued fields', () => {
    const data = docWithLayer({
      __identifier: 'Entities',
      __type: 'Entities',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 130,
      levelId: 1,
      visible: true,
      iid: 'ent-1',
      entityInstances: [
        {
          __identifier: 'NPC',
          __type: 'NPC',
          px: [0, 0],
          width: 16,
          height: 16,
          __pivot: [0, 0],
          iid: 'npc-1',
          defUid: 300,
          fieldInstances: [
            { __identifier: 'hp', __type: 'Int', __value: 10 },
            { __identifier: 'label', __type: 'String', __value: 'Bob' },
            { __identifier: 'hostile', __type: 'Bool', __value: true },
            { __identifier: 'path', __type: 'Array<Point>', __value: [{ cx: 1, cy: 2 }] },
            { __identifier: 'nothing', __type: 'String', __value: null },
          ],
        },
      ],
    });

    const props = ldtkToTileMap(data).levels[0]!.objectLayers[0]!.objects[0]!.properties;
    expect(props['hp']).toBe(10);
    expect(props['label']).toBe('Bob');
    expect(props['hostile']).toBe(true);
    expect(props['path']).toEqual([{ kind: 'point', cx: 1, cy: 2 }]);
    expect(props['nothing']).toBeUndefined();
  });

  it('freezes the projected properties bag', () => {
    const data = docWithLayer({
      __identifier: 'Entities',
      __type: 'Entities',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 130,
      levelId: 1,
      visible: true,
      iid: 'ent-1',
      entityInstances: [
        {
          __identifier: 'NPC',
          __type: 'NPC',
          px: [0, 0],
          width: 16,
          height: 16,
          __pivot: [0, 0],
          iid: 'npc-1',
          defUid: 300,
          fieldInstances: [{ __identifier: 'hp', __type: 'Int', __value: 10 }],
        },
      ],
    });

    const props = ldtkToTileMap(data).levels[0]!.objectLayers[0]!.objects[0]!.properties;
    expect(Object.isFrozen(props)).toBe(true);
  });

  it('emits a frozen empty bag for entities without fields', () => {
    const data = docWithLayer({
      __identifier: 'Entities',
      __type: 'Entities',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 130,
      levelId: 1,
      visible: true,
      iid: 'ent-1',
      entityInstances: [
        {
          __identifier: 'Marker',
          __type: 'Marker',
          px: [0, 0],
          width: 0,
          height: 0,
          __pivot: [0, 0],
          iid: 'm-1',
          defUid: 301,
          fieldInstances: [],
        },
      ],
    });

    const props = ldtkToTileMap(data).levels[0]!.objectLayers[0]!.objects[0]!.properties;
    expect(props).toEqual({});
    expect(Object.isFrozen(props)).toBe(true);
  });

  it('maps the entity __identifier to both name and type, with rectangle geometry', () => {
    const data = docWithLayer({
      __identifier: 'Entities',
      __type: 'Entities',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 130,
      levelId: 1,
      visible: true,
      iid: 'ent-1',
      entityInstances: [
        {
          __identifier: 'Door',
          __type: 'Door',
          px: [3, 5],
          width: 16,
          height: 16,
          __pivot: [0, 0],
          iid: 'door-1',
          defUid: 302,
          fieldInstances: [],
        },
      ],
    });

    const object = ldtkToTileMap(data).levels[0]!.objectLayers[0]!.objects[0]!;
    expect(object.name).toBe('Door');
    expect(object.type).toBe('Door');
    expect(object.kind).toBe('rectangle');
    expect(object.rotation).toBe(0);
    expect(object.visible).toBe(true);
  });
});

// ── Structured field types (Point / EntityRef / Tile / Array) ───────────────────

describe('ldtkToTileMap — Point field conversion', () => {
  it('maps a Point field to a TilePropertyPoint', () => {
    const props = convertSingleField({
      __identifier: 'spawn',
      __type: 'Point',
      __value: { cx: 3, cy: 4 },
    });

    expect(props['spawn']).toEqual({ kind: 'point', cx: 3, cy: 4 });
  });

  it('omits a null-valued Point field', () => {
    const props = convertSingleField({
      __identifier: 'spawn',
      __type: 'Point',
      __value: null,
    });

    expect(props['spawn']).toBeUndefined();
    expect('spawn' in props).toBe(false);
  });
});

describe('ldtkToTileMap — EntityRef field conversion', () => {
  it('maps an EntityRef field to a TilePropertyObjectRef, threading all 4 source fields through', () => {
    const props = convertSingleField({
      __identifier: 'target',
      __type: 'EntityRef',
      __value: {
        entityIid: 'target-entity-iid',
        layerIid: 'target-layer-iid',
        levelIid: 'target-level-iid',
        worldIid: 'target-world-iid',
      },
    });

    expect(props['target']).toEqual({
      kind: 'objectRef',
      id: 'target-entity-iid',
      layerIid: 'target-layer-iid',
      levelIid: 'target-level-iid',
      worldIid: 'target-world-iid',
    });
  });

  it('omits a null-valued EntityRef field', () => {
    const props = convertSingleField({
      __identifier: 'target',
      __type: 'EntityRef',
      __value: null,
    });

    expect('target' in props).toBe(false);
  });
});

describe('ldtkToTileMap — Tile field conversion', () => {
  it('maps a Tile field to a TilePropertyTileRef', () => {
    const props = convertSingleField({
      __identifier: 'icon',
      __type: 'Tile',
      __value: { tilesetUid: 7, x: 16, y: 32, w: 16, h: 16 },
    });

    expect(props['icon']).toEqual({ kind: 'tileRef', tilesetUid: 7, x: 16, y: 32, w: 16, h: 16 });
  });

  it('omits a null-valued Tile field', () => {
    const props = convertSingleField({
      __identifier: 'icon',
      __type: 'Tile',
      __value: null,
    });

    expect('icon' in props).toBe(false);
  });
});

describe('ldtkToTileMap — Array field conversion', () => {
  it('maps an Array<Int> field to a plain array of numbers', () => {
    const props = convertSingleField({
      __identifier: 'scores',
      __type: 'Array<Int>',
      __value: [1, 2, 3],
    });

    expect(props['scores']).toEqual([1, 2, 3]);
  });

  it('maps an Array<Point> field to an array of TilePropertyPoint (nested complex conversion)', () => {
    const props = convertSingleField({
      __identifier: 'path',
      __type: 'Array<Point>',
      __value: [
        { cx: 0, cy: 0 },
        { cx: 1, cy: 2 },
      ],
    });

    expect(props['path']).toEqual([
      { kind: 'point', cx: 0, cy: 0 },
      { kind: 'point', cx: 1, cy: 2 },
    ]);
  });

  it('omits a null-valued Array field', () => {
    const props = convertSingleField({
      __identifier: 'scores',
      __type: 'Array<Int>',
      __value: null,
    });

    expect('scores' in props).toBe(false);
  });

  it('maps an empty array to an empty array (still present, not omitted)', () => {
    const props = convertSingleField({
      __identifier: 'scores',
      __type: 'Array<Int>',
      __value: [],
    });

    expect(props['scores']).toEqual([]);
  });
});

describe('ldtkToTileMap — null-valued scalar fields (all scalar types)', () => {
  it.each(['Int', 'Float', 'Bool', 'String', 'Multilines', 'Color', 'FilePath', 'Enum'] as const)(
    'omits a null-valued %s field',
    __type => {
      const props = convertSingleField({ __identifier: 'x', __type, __value: null });
      expect('x' in props).toBe(false);
    },
  );
});

describe('ldtkToTileMap — ObjectLayer metadata', () => {
  it('forwards id, visibility, opacity and offsets to the ObjectLayer', () => {
    const data = docWithLayer({
      __identifier: 'Entities',
      __type: 'Entities',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 130,
      levelId: 1,
      visible: false,
      opacity: 0.5,
      pxOffsetX: 4,
      pxOffsetY: 6,
      iid: 'ent-1',
      entityInstances: [],
    });

    const objectLayer = ldtkToTileMap(data).levels[0]!.objectLayers[0]!;
    expect(objectLayer.id).toBe(130);
    expect(objectLayer.name).toBe('Entities');
    expect(objectLayer.visible).toBe(false);
    expect(objectLayer.opacity).toBe(0.5);
    expect(objectLayer.offsetX).toBe(4);
    expect(objectLayer.offsetY).toBe(6);
  });
});

describe('ldtkToTileMap — entity id assignment across layers and levels', () => {
  it('accumulates ids across multiple entity layers within one level', () => {
    const data: LdtkData = {
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
          pxWid: 64,
          pxHei: 16,
          layerInstances: [
            {
              __identifier: 'EntitiesA',
              __type: 'Entities',
              __cWid: 4,
              __cHei: 1,
              __gridSize: 16,
              layerDefUid: 130,
              levelId: 1,
              visible: true,
              iid: 'ent-a',
              entityInstances: [
                makeEntity('A0'),
                makeEntity('A1'),
              ],
            },
            {
              __identifier: 'EntitiesB',
              __type: 'Entities',
              __cWid: 4,
              __cHei: 1,
              __gridSize: 16,
              layerDefUid: 131,
              levelId: 1,
              visible: true,
              iid: 'ent-b',
              entityInstances: [makeEntity('B0')],
            },
          ],
        },
      ],
    };

    const layers = ldtkToTileMap(data).levels[0]!.objectLayers;
    expect(layers[0]!.objects.map(o => o.id)).toEqual([0, 1]);
    expect(layers[1]!.objects.map(o => o.id)).toEqual([2]);
  });

  it('offsets ids by levelIndex * 1_000_000 so they stay globally unique', () => {
    const data: LdtkData = {
      jsonVersion: '1.5.3',
      defaultGridSize: 16,
      defs: { tilesets: [], layers: [] },
      levels: [makeEntityLevel('L0', 1), makeEntityLevel('L1', 2)],
    };

    const result = ldtkToTileMap(data);
    expect(result.levels[0]!.objectLayers[0]!.objects[0]!.id).toBe(0);
    expect(result.levels[1]!.objectLayers[0]!.objects[0]!.id).toBe(1_000_000);
  });
});

// ── Local builders for the multi-level id fixtures ──────────────────────────────

function makeEntity(identifier: string): LdtkEntityInstance {
  return {
    __identifier: identifier,
    __type: identifier,
    px: [0, 0],
    width: 16,
    height: 16,
    __pivot: [0, 0],
    iid: `iid-${identifier}`,
    defUid: 0,
    fieldInstances: [],
  };
}

// ── Coverage-closing edge cases ─────────────────────────────────────────────

describe('ldtkToTileMap — grid size skips a non-Entities layer with an invalid grid size', () => {
  it('continues past a layer whose __gridSize is 0 and uses the next valid layer', () => {
    // A layer type outside the LdtkLayerType union (cast) is used here so the
    // gridSize<=0 layer is never routed through the Tiles/IntGrid/AutoLayer
    // switch cases in convertLevel (which would otherwise try to build a
    // TileLayer from its own invalid __gridSize and throw). This isolates
    // pickLevelGridSize's `__gridSize > 0` guard for the non-Entities branch.
    const invalidGridSizeLayer = {
      __identifier: 'Unsupported',
      __type: 'Unsupported',
      __cWid: 2,
      __cHei: 1,
      __gridSize: 0, // invalid — must be skipped, not treated as the map's grid size
      layerDefUid: 102,
      levelId: 1,
      visible: true,
      iid: 'unsupported-0',
    } as unknown as LdtkLayerInstance;

    const validTilesLayer: LdtkLayerInstance = {
      __identifier: 'Tiles',
      __type: 'Tiles',
      __cWid: 2,
      __cHei: 1,
      __gridSize: 24,
      layerDefUid: 101,
      levelId: 1,
      visible: true,
      iid: 'tiles-0',
      gridTiles: [],
      autoLayerTiles: [],
    };

    const data: LdtkData = {
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
          pxWid: 48,
          pxHei: 24,
          layerInstances: [invalidGridSizeLayer, validTilesLayer],
        },
      ],
    };

    const map = ldtkToTileMap(data).levels[0]!;
    expect(map.tileWidth).toBe(24);
    expect(map.tileHeight).toBe(24);
  });
});

describe('ldtkToTileMap — Tiles/AutoLayer tile-source fallback when the field is absent', () => {
  const tileset = makeTileset('Atlas', 4);

  it('falls back to an empty tile list for a Tiles layer with no gridTiles field', () => {
    const data = docWithLayer({
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
      // gridTiles intentionally omitted
    });

    const layer = ldtkToTileMap(data, { tilesets: new Map([[1, tileset]]) }).levels[0]!
      .layers[0]!;
    expect(layer.countNonEmptyTiles()).toBe(0);
  });

  it('falls back to an empty tile list for an AutoLayer layer with no autoLayerTiles field', () => {
    const data = docWithLayer({
      __identifier: 'Walls',
      __type: 'AutoLayer',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 110,
      levelId: 1,
      visible: true,
      iid: 'auto-1',
      __tilesetDefUid: 1,
      // autoLayerTiles intentionally omitted
    });

    const layer = ldtkToTileMap(data, { tilesets: new Map([[1, tileset]]) }).levels[0]!
      .layers[0]!;
    expect(layer.countNonEmptyTiles()).toBe(0);
  });
});

describe('ldtkToTileMap — IntGrid auto-tiles reference a tileset uid missing from the tilesets map', () => {
  it('leaves the layer without tiles instead of throwing', () => {
    const tileset = makeTileset('Atlas', 4);
    const data = docWithLayer({
      __identifier: 'Collision',
      __type: 'IntGrid',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 120,
      levelId: 1,
      visible: true,
      iid: 'int-1',
      __tilesetDefUid: 999, // not present in the tilesets map below
      intGridCsv: [1, 0, 0, 0],
      autoLayerTiles: [{ px: [0, 0], src: [0, 0], f: 0, t: 3 }],
    });

    const layer = ldtkToTileMap(data, { tilesets: new Map([[1, tileset]]) }).levels[0]!
      .layers[0]!;
    expect(layer.countNonEmptyTiles()).toBe(0);
  });
});

describe('ldtkToTileMap — IntGrid layer with no intGridCsv data', () => {
  it('exposes no IntGrid properties when intGridCsv is absent', () => {
    const data = docWithLayer({
      __identifier: 'Collision',
      __type: 'IntGrid',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 120,
      levelId: 1,
      visible: true,
      iid: 'int-1',
      // intGridCsv intentionally omitted
    });

    const layer = ldtkToTileMap(data).levels[0]!.layers[0]!;
    expect(getLdtkIntGridValueAt(layer, 0, 0)).toBeUndefined();
  });

  it('exposes no IntGrid properties when intGridCsv is an empty array', () => {
    const data = docWithLayer({
      __identifier: 'Collision',
      __type: 'IntGrid',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 120,
      levelId: 1,
      visible: true,
      iid: 'int-1',
      intGridCsv: [],
    });

    const layer = ldtkToTileMap(data).levels[0]!.layers[0]!;
    expect(getLdtkIntGridValueAt(layer, 0, 0)).toBeUndefined();
  });
});

describe('ldtkToTileMap — Entities layer fallback / defensive entries', () => {
  it('produces an empty ObjectLayer for an Entities layer with no entityInstances field', () => {
    const data = docWithLayer({
      __identifier: 'Entities',
      __type: 'Entities',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 130,
      levelId: 1,
      visible: true,
      iid: 'ent-1',
      // entityInstances intentionally omitted
    });

    const objectLayer = ldtkToTileMap(data).levels[0]!.objectLayers[0]!;
    expect(objectLayer.objects).toHaveLength(0);
  });

  it('skips a hole (undefined entry) in entityInstances while keeping surrounding entities and their index-derived ids', () => {
    // entityInstances is typed as a dense array, but the conversion loop
    // defensively guards against a sparse/holey array — construct one via a
    // cast to exercise that guard.
    const holeyInstances = [
      makeEntity('First'),
      undefined,
      makeEntity('Second'),
    ] as unknown as readonly LdtkEntityInstance[];

    const data = docWithLayer({
      __identifier: 'Entities',
      __type: 'Entities',
      __cWid: 4,
      __cHei: 1,
      __gridSize: 16,
      layerDefUid: 130,
      levelId: 1,
      visible: true,
      iid: 'ent-1',
      entityInstances: holeyInstances,
    });

    const objects = ldtkToTileMap(data).levels[0]!.objectLayers[0]!.objects;
    expect(objects.map(o => o.name)).toEqual(['First', 'Second']);
    // index 1 (the hole) was skipped, so the surviving ids are 0 and 2.
    expect(objects.map(o => o.id)).toEqual([0, 2]);
  });
});

describe('ldtkToTileMap — unrecognised field types (exhaustiveness guard)', () => {
  it('throws when a top-level field carries an unrecognised, non-Array __type', () => {
    // Constructing this requires a cast — the LdtkFieldInstance union only
    // permits known __type values, so this exercises the runtime guard
    // against malformed/future LDtk data rather than a reachable-by-types path.
    const bogusField = {
      __identifier: 'x',
      __type: 'FutureType',
      __value: 'whatever',
    } as unknown as LdtkFieldInstance;

    expect(() => convertSingleField(bogusField)).toThrow(/unrecognised LDtk field type "FutureType"/);
  });

  it('drops an Array<T> element whose element type is unrecognised, yielding an empty array', () => {
    const props = convertSingleField({
      __identifier: 'mystery',
      __type: 'Array<FutureType>',
      __value: [1, 2, 3],
    });

    expect(props['mystery']).toEqual([]);
  });
});

function makeEntityLevel(identifier: string, uid: number): LdtkLevel {
  return {
    identifier,
    uid,
    iid: `iid-${uid}`,
    worldX: 0,
    worldY: 0,
    pxWid: 64,
    pxHei: 16,
    layerInstances: [
      {
        __identifier: 'Entities',
        __type: 'Entities',
        __cWid: 4,
        __cHei: 1,
        __gridSize: 16,
        layerDefUid: 130,
        levelId: uid,
        visible: true,
        iid: `ent-${uid}`,
        entityInstances: [makeEntity('E')],
      },
    ],
  };
}
