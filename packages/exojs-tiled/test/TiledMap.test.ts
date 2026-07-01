import { Texture } from '@codexo/exojs';
import { TileLayer, TileMap, TileSet } from '@codexo/exojs-tilemap';
import { describe, expect, it } from 'vitest';

import { TiledTileLayer } from '../src/TiledLayer';
import { TiledMap } from '../src/TiledMap';
import { TiledTileset } from '../src/TiledTileset';
import { TiledFormatError, validateTiledMapData } from '../src/validate';

// Raw fixture data (matches test/fixtures/minimal.tmj)
const RAW_MINIMAL = {
  type: 'map',
  version: '1.10',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  width: 4,
  height: 4,
  tilewidth: 16,
  tileheight: 16,
  infinite: false,
  layers: [{
    id: 1, name: 'Ground', type: 'tilelayer', visible: true,
    x: 0, y: 0, width: 4, height: 4, opacity: 1,
    data: [1, 1, 1, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 1, 1, 1],
  }],
  tilesets: [{
    firstgid: 1, name: 'tiles', tilewidth: 16, tileheight: 16,
    columns: 2, tilecount: 4, spacing: 0, margin: 0,
  }],
};

const MINIMAL_DATA = validateTiledMapData(RAW_MINIMAL, 'minimal.tmj');
const TILESET = new TiledTileset({ name: 'tiles', tilewidth: 16, tileheight: 16, tilecount: 4, columns: 2 }, 1);

function makeMap(overrides: { tilesets?: TiledTileset[]; source?: string } = {}): TiledMap {
  return new TiledMap(overrides.source ?? 'minimal.tmj', MINIMAL_DATA, overrides.tilesets ?? [TILESET]);
}

describe('TiledMap constructor — field mapping', () => {
  const map = makeMap();

  it('stores source URL', () => expect(map.source).toBe('minimal.tmj'));
  it('stores raw data reference', () => expect(map.data).toBe(MINIMAL_DATA));
  it('maps width and height', () => {
    expect(map.width).toBe(4);
    expect(map.height).toBe(4);
  });
  it('maps tileWidth and tileHeight', () => {
    expect(map.tileWidth).toBe(16);
    expect(map.tileHeight).toBe(16);
  });
  it('maps orientation', () => expect(map.orientation).toBe('orthogonal'));
  it('maps renderOrder', () => expect(map.renderOrder).toBe('right-down'));
  it('maps infinite flag', () => expect(map.infinite).toBe(false));
  it('defaults class to empty string', () => expect(map.class).toBe(''));
  it('defaults backgroundColor to undefined', () => expect(map.backgroundColor).toBeUndefined());
  it('defaults properties to empty array', () => expect(map.properties).toEqual([]));
  it('constructs layers from data.layers', () => {
    expect(map.layers).toHaveLength(1);
    expect(map.layers[0]).toBeInstanceOf(TiledTileLayer);
  });
  it('stores sorted tilesets', () => {
    expect(map.tilesets).toHaveLength(1);
    expect(map.tilesets[0]).toBe(TILESET);
  });
});

describe('TiledMap — optional fields', () => {
  it('maps backgroundColor from data', () => {
    const data = validateTiledMapData({ ...RAW_MINIMAL, backgroundcolor: '#112233' }, 'test.tmj');
    const map = new TiledMap('test.tmj', data, [TILESET]);
    expect(map.backgroundColor).toBe('#112233');
  });

  it('maps class from data', () => {
    const data = validateTiledMapData({ ...RAW_MINIMAL, class: 'dungeon' }, 'test.tmj');
    expect(new TiledMap('test.tmj', data, [TILESET]).class).toBe('dungeon');
  });

  it('maps properties from data', () => {
    const data = validateTiledMapData({
      ...RAW_MINIMAL,
      properties: [{ name: 'biome', type: 'string', value: 'forest' }],
    }, 'test.tmj');
    expect(new TiledMap('test.tmj', data, [TILESET]).properties).toHaveLength(1);
  });
});

describe('TiledMap.tilesets — sort and validation', () => {
  it('sorts tilesets by firstGid ascending regardless of insertion order', () => {
    const t1 = new TiledTileset({ name: 'a', tilewidth: 16, tileheight: 16, tilecount: 1, columns: 1 }, 1);
    const t2 = new TiledTileset({ name: 'b', tilewidth: 16, tileheight: 16, tilecount: 1, columns: 1 }, 2);
    const data = validateTiledMapData({
      ...RAW_MINIMAL,
      layers: [],
      tilesets: [{ firstgid: 2, name: 'b', tilewidth: 16, tileheight: 16, tilecount: 1, columns: 1 },
                 { firstgid: 1, name: 'a', tilewidth: 16, tileheight: 16, tilecount: 1, columns: 1 }],
    }, 'test.tmj');
    const map = new TiledMap('test.tmj', data, [t2, t1]);
    expect(map.tilesets[0].firstGid).toBe(1);
    expect(map.tilesets[1].firstGid).toBe(2);
  });

  it('throws TiledFormatError on duplicate firstgid', () => {
    const t1 = new TiledTileset({ name: 'a', tilewidth: 16, tileheight: 16, tilecount: 4, columns: 2 }, 1);
    const t2 = new TiledTileset({ name: 'b', tilewidth: 16, tileheight: 16, tilecount: 4, columns: 2 }, 1);
    expect(() => makeMap({ tilesets: [t1, t2] })).toThrow(TiledFormatError);
    expect(() => makeMap({ tilesets: [t1, t2] })).toThrow(/duplicate firstgid 1/);
  });

  it('throws TiledFormatError when tileset ranges overlap', () => {
    const t1 = new TiledTileset({ name: 'a', tilewidth: 16, tileheight: 16, tilecount: 4, columns: 2 }, 1);
    const t2 = new TiledTileset({ name: 'b', tilewidth: 16, tileheight: 16, tilecount: 4, columns: 2 }, 3);
    expect(() => makeMap({ tilesets: [t1, t2] })).toThrow(TiledFormatError);
    expect(() => makeMap({ tilesets: [t1, t2] })).toThrow(/overlaps/);
  });
});

describe('TiledMap — GID coverage validation', () => {
  it('throws TiledFormatError when a tile layer GID is not covered by any tileset', () => {
    const underCovering = new TiledTileset({ name: 'tiles', tilewidth: 16, tileheight: 16, tilecount: 1, columns: 1 }, 1);
    // minimal.tmj has GID 2 in data — not covered by tilecount=1 (lastGid=1)
    expect(() => makeMap({ tilesets: [underCovering] })).toThrow(TiledFormatError);
    expect(() => makeMap({ tilesets: [underCovering] })).toThrow(/gid 2.*is not covered by any tileset/);
  });

  it('allows GID 0 (empty-cell sentinel) without a tileset', () => {
    const data = validateTiledMapData({
      ...RAW_MINIMAL,
      layers: [{ id: 1, name: 'Base', type: 'tilelayer', visible: true, x: 0, y: 0, width: 2, height: 2, opacity: 1, data: [0, 0, 0, 0] }],
    }, 'test.tmj');
    expect(() => new TiledMap('test.tmj', data, [])).not.toThrow();
  });
});

describe('TiledMap.findTilesetForGid', () => {
  const map = makeMap();

  it('returns undefined for GID 0 (empty-cell sentinel)', () => {
    expect(map.findTilesetForGid(0)).toBeUndefined();
  });

  it('returns the owning tileset for a covered GID', () => {
    expect(map.findTilesetForGid(1)).toBe(TILESET);
    expect(map.findTilesetForGid(4)).toBe(TILESET);
  });

  it('returns undefined for a GID above the covered range', () => {
    expect(map.findTilesetForGid(5)).toBeUndefined();
  });

  it('masks flip/rotation flag bits before lookup', () => {
    // 0x80000001 = horizontal-flip flag | GID 1 → masked to 1 → covered
    expect(map.findTilesetForGid(0x80000001)).toBe(TILESET);
    // 0xf0000001 = all flags | GID 1 → masked to 1 → covered
    expect(map.findTilesetForGid(0xf0000001)).toBe(TILESET);
    // Flip-only with no GID component → masked to 0 → undefined
    expect(map.findTilesetForGid(0x80000000)).toBeUndefined();
  });
});

describe('TiledMap.getProperty', () => {
  it('returns the property by name', () => {
    const data = validateTiledMapData({
      ...RAW_MINIMAL,
      properties: [{ name: 'biome', type: 'string', value: 'forest' }],
    }, 'test.tmj');
    const map = new TiledMap('test.tmj', data, [TILESET]);
    expect(map.getProperty('biome')).toMatchObject({ name: 'biome', value: 'forest' });
  });

  it('returns undefined for an unknown name', () => {
    expect(makeMap().getProperty('nothing')).toBeUndefined();
  });
});

describe('TiledMap.destroy', () => {
  it('does not throw', () => {
    expect(() => makeMap().destroy()).not.toThrow();
  });
});

// ── TiledMap.toTileMap() ─────────────────────────────────────────────────────

/** Build a Texture stub with given pixel dimensions (required by TextureRegion). */
function makeTexture(width: number, height: number): Texture {
  const t = new Texture();
  t.width = width;
  t.height = height;
  return t;
}

function makeTilesetWithTexture(name: string, tileCount: number, columns: number, firstGid: number): TiledTileset {
  const w = columns * 16;
  const h = Math.ceil(tileCount / columns) * 16;
  return new TiledTileset(
    { name, tilewidth: 16, tileheight: 16, tilecount: tileCount, columns, spacing: 0, margin: 0, imagewidth: w, imageheight: h },
    firstGid,
    { imageUrl: `${name}.png`, texture: makeTexture(w, h) },
  );
}

const ATLAS_TILESET = makeTilesetWithTexture('tiles', 4, 2, 1);

function makeAtlasMap(): TiledMap {
  return new TiledMap('atlas.tmj', MINIMAL_DATA, [ATLAS_TILESET]);
}

describe('TiledMap.toTileMap — basic conversion', () => {
  it('returns a TileMap instance', () => {
    expect(makeAtlasMap().toTileMap()).toBeInstanceOf(TileMap);
  });

  it('maps width, height, tileWidth, tileHeight', () => {
    const tm = makeAtlasMap().toTileMap();
    expect(tm.width).toBe(4);
    expect(tm.height).toBe(4);
    expect(tm.tileWidth).toBe(16);
    expect(tm.tileHeight).toBe(16);
  });

  it('produces one runtime TileLayer per tile layer', () => {
    const tm = makeAtlasMap().toTileMap();
    expect(tm.layers).toHaveLength(1);
    expect(tm.layers[0]).toBeInstanceOf(TileLayer);
  });

  it('produces one runtime TileSet per tileset', () => {
    const tm = makeAtlasMap().toTileMap();
    expect(tm.tilesets).toHaveLength(1);
    expect(tm.tilesets[0]).toBeInstanceOf(TileSet);
  });

  it('preserves layer name and id', () => {
    const layer = makeAtlasMap().toTileMap().layers[0]!;
    expect(layer.name).toBe('Ground');
    expect(layer.id).toBe(1);
  });

  it('preserves tileset name', () => {
    expect(makeAtlasMap().toTileMap().tilesets[0]!.name).toBe('tiles');
  });

  it('non-empty cells in the source layer produce packed tiles in the runtime layer', () => {
    const tm = makeAtlasMap().toTileMap();
    const layer = tm.layers[0]!;
    // minimal.tmj has GID 1 and 2, so some cells are non-empty
    expect(layer.countNonEmptyTiles()).toBeGreaterThan(0);
  });

  it('GID 1 (no flags) maps to localTileId 0 of the first tileset', () => {
    const tm = makeAtlasMap().toTileMap();
    const tile = tm.layers[0]!.getTileAt(0, 0); // data[0] = GID 1
    expect(tile).not.toBeNull();
    expect(tile!.localTileId).toBe(0);
    expect(tile!.tileset).toBe(tm.tilesets[0]);
    expect(tile!.transform.flipX).toBe(false);
    expect(tile!.transform.flipY).toBe(false);
    expect(tile!.transform.diagonal).toBe(false);
  });

  it('GID 2 maps to localTileId 1 of the first tileset', () => {
    const tm = makeAtlasMap().toTileMap();
    const tile = tm.layers[0]!.getTileAt(1, 1); // data[5] = GID 2 (row 1, col 1)
    expect(tile!.localTileId).toBe(1);
  });
});

describe('TiledMap.toTileMap — flip flag decoding', () => {
  // Build a 1×1 map with a single GID that has flip flags set.
  function makeFlippedMap(rawGid: number): TiledMap {
    const ts = makeTilesetWithTexture('ts', 4, 2, 1);
    const data = validateTiledMapData({
      type: 'map', version: '1.10', orientation: 'orthogonal', renderorder: 'right-down',
      width: 1, height: 1, tilewidth: 16, tileheight: 16, infinite: false,
      layers: [{ id: 1, name: 'L', type: 'tilelayer', visible: true, x: 0, y: 0, width: 1, height: 1, opacity: 1, data: [rawGid] }],
      tilesets: [{ firstgid: 1, name: 'ts', tilewidth: 16, tileheight: 16, tilecount: 4, columns: 2 }],
    }, 'flip.tmj');
    return new TiledMap('flip.tmj', data, [ts]);
  }

  it('horizontal flip flag sets flipX=true, others false', () => {
    const { transform } = makeFlippedMap(0x80000001).toTileMap().layers[0]!.getTileAt(0, 0)!;
    expect(transform).toMatchObject({ flipX: true, flipY: false, diagonal: false });
  });

  it('vertical flip flag sets flipY=true, others false', () => {
    const { transform } = makeFlippedMap(0x40000001).toTileMap().layers[0]!.getTileAt(0, 0)!;
    expect(transform).toMatchObject({ flipX: false, flipY: true, diagonal: false });
  });

  it('diagonal flag sets diagonal=true, others false', () => {
    const { transform } = makeFlippedMap(0x20000001).toTileMap().layers[0]!.getTileAt(0, 0)!;
    expect(transform).toMatchObject({ flipX: false, flipY: false, diagonal: true });
  });

  it('all three flags combined', () => {
    const { transform } = makeFlippedMap(0xe0000001).toTileMap().layers[0]!.getTileAt(0, 0)!;
    expect(transform).toMatchObject({ flipX: true, flipY: true, diagonal: true });
  });
});

describe('TiledMap.toTileMap — multi-tileset', () => {
  it('assigns tiles to the correct runtime tileset based on firstGid ranges', () => {
    const ts1 = makeTilesetWithTexture('a', 1, 1, 1);
    const ts2 = makeTilesetWithTexture('b', 1, 1, 2);
    const data = validateTiledMapData({
      type: 'map', version: '1.10', orientation: 'orthogonal', renderorder: 'right-down',
      width: 2, height: 1, tilewidth: 16, tileheight: 16, infinite: false,
      layers: [{ id: 1, name: 'L', type: 'tilelayer', visible: true, x: 0, y: 0, width: 2, height: 1, opacity: 1, data: [1, 2] }],
      tilesets: [
        { firstgid: 1, name: 'a', tilewidth: 16, tileheight: 16, tilecount: 1, columns: 1 },
        { firstgid: 2, name: 'b', tilewidth: 16, tileheight: 16, tilecount: 1, columns: 1 },
      ],
    }, 'multi.tmj');
    const tm = new TiledMap('multi.tmj', data, [ts1, ts2]).toTileMap();
    const tile0 = tm.layers[0]!.getTileAt(0, 0)!;
    const tile1 = tm.layers[0]!.getTileAt(1, 0)!;
    expect(tile0.tileset.name).toBe('a');
    expect(tile0.localTileId).toBe(0);
    expect(tile1.tileset.name).toBe('b');
    expect(tile1.localTileId).toBe(0);
  });
});

describe('TiledMap.toTileMap — object/class property conversion', () => {
  function makeObjectPropsMap(properties: readonly { name: string; type: string; value: unknown; propertytype?: string }[]): TileMap {
    const data = validateTiledMapData({
      type: 'map', version: '1.10', orientation: 'orthogonal', renderorder: 'right-down',
      width: 1, height: 1, tilewidth: 16, tileheight: 16, infinite: false,
      layers: [{
        id: 1, name: 'Objects', type: 'objectgroup', visible: true, x: 0, y: 0, opacity: 1,
        draworder: 'topdown',
        objects: [{
          id: 1, name: 'door', type: '', x: 0, y: 0, width: 16, height: 16,
          rotation: 0, visible: true, properties,
        }],
      }],
      tilesets: [],
    }, 'objprops.tmj');
    return new TiledMap('objprops.tmj', data, []).toTileMap();
  }

  it('maps an object-typed property to a TilePropertyObjectRef by numeric id', () => {
    const tm = makeObjectPropsMap([{ name: 'target', type: 'object', value: 42 }]);
    const obj = tm.objectLayers[0]!.objects[0]!;
    expect(obj.properties['target']).toEqual({ kind: 'objectRef', id: 42 });
  });

  it('recursively maps a class-typed property to a nested TileProperties bag, including 2-level nesting', () => {
    const tm = makeObjectPropsMap([{
      name: 'config',
      type: 'class',
      propertytype: 'DoorConfig',
      value: {
        locked: true,
        label: 'Vault',
        access: { level: 2, tags: { vip: true } },
      },
    }]);
    const obj = tm.objectLayers[0]!.objects[0]!;
    expect(obj.properties['config']).toEqual({
      locked: true,
      label: 'Vault',
      access: { level: 2, tags: { vip: true } },
    });
  });

  it('keeps scalar properties unaffected alongside object/class properties', () => {
    const tm = makeObjectPropsMap([
      { name: 'label', type: 'string', value: 'north gate' },
      { name: 'target', type: 'object', value: 7 },
    ]);
    const obj = tm.objectLayers[0]!.objects[0]!;
    expect(obj.properties['label']).toBe('north gate');
    expect(obj.properties['target']).toEqual({ kind: 'objectRef', id: 7 });
  });
});

describe('TiledMap.toTileMap — map-level property conversion', () => {
  it('carries map-level custom properties into TileMap.properties', () => {
    const data = validateTiledMapData({
      ...RAW_MINIMAL,
      properties: [
        { name: 'biome', type: 'string', value: 'forest' },
        { name: 'maxPlayers', type: 'int', value: 4 },
      ],
    }, 'mapprops.tmj');
    const tm = new TiledMap('mapprops.tmj', data, [ATLAS_TILESET]).toTileMap();
    expect(tm.properties['biome']).toBe('forest');
    expect(tm.properties['maxPlayers']).toBe(4);
  });

  it('defaults TileMap.properties to an empty bag when the map has no custom properties', () => {
    const tm = makeAtlasMap().toTileMap();
    expect(tm.properties).toEqual({});
  });
});

describe('TiledMap.toTileMap — error cases', () => {
  it('throws TiledFormatError for a collection-of-images tileset', () => {
    const collectionTs = new TiledTileset(
      { name: 'col', tilewidth: 16, tileheight: 16, tilecount: 2, columns: 0 },
      1,
      { tileTextures: new Map([[0, makeTexture(16, 16)], [1, makeTexture(16, 16)]]) },
    );
    const data = validateTiledMapData({
      type: 'map', version: '1.10', orientation: 'orthogonal', renderorder: 'right-down',
      width: 1, height: 1, tilewidth: 16, tileheight: 16, infinite: false,
      layers: [{ id: 1, name: 'L', type: 'tilelayer', visible: true, x: 0, y: 0, width: 1, height: 1, opacity: 1, data: [0] }],
      tilesets: [{ firstgid: 1, name: 'col', tilewidth: 16, tileheight: 16, tilecount: 2, columns: 0 }],
    }, 'col.tmj');
    const map = new TiledMap('col.tmj', data, [collectionTs]);
    expect(() => map.toTileMap()).toThrow(TiledFormatError);
    expect(() => map.toTileMap()).toThrow(/collection-of-images/);
  });
});
