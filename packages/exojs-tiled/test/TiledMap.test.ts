import { Texture } from '@codexo/exojs';
import { TileLayer, TileMap, TileSet } from '@codexo/exojs-tilemap';
import { describe, expect, it, test } from 'vitest';

import type { TiledChunkData, TiledLayerData, TiledMapData, TiledObjectData, TiledPropertyData } from '../src/data';
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
      tiledClassName: 'DoorConfig',
    });
  });

  it('tags a class-typed property with its Tiled propertytype under the reserved tiledClassName key', () => {
    const tm = makeObjectPropsMap([{
      name: 'stats',
      type: 'class',
      propertytype: 'Stats',
      value: { hp: 10 },
    }]);
    const obj = tm.objectLayers[0]!.objects[0]!;
    expect(obj.properties['stats']).toMatchObject({ hp: 10, tiledClassName: 'Stats' });
  });

  it('omits the reserved tiledClassName key on nested class members, which carry no propertytype of their own', () => {
    const tm = makeObjectPropsMap([{
      name: 'config',
      type: 'class',
      propertytype: 'DoorConfig',
      value: { access: { level: 2 } },
    }]);
    const obj = tm.objectLayers[0]!.objects[0]!;
    const config = obj.properties['config'] as Record<string, unknown>;
    expect(config['access']).toEqual({ level: 2 });
  });

  it('omits the reserved tiledClassName key when the class-typed property has no propertytype', () => {
    const tm = makeObjectPropsMap([{
      name: 'config',
      type: 'class',
      value: { locked: true },
    }]);
    const obj = tm.objectLayers[0]!.objects[0]!;
    expect(obj.properties['config']).toEqual({ locked: true });
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

// ── Object-kind conversion breadth (ellipse/polygon/polyline/dropped-tile) ──────

describe('TiledMap.toTileMap — object kind conversion', () => {
  function makeObjectKindMap(objectOverrides: Record<string, unknown>): TileMap {
    const data = validateTiledMapData({
      type: 'map', version: '1.10', orientation: 'orthogonal', renderorder: 'right-down',
      width: 1, height: 1, tilewidth: 16, tileheight: 16, infinite: false,
      layers: [{
        id: 1, name: 'Objects', type: 'objectgroup', visible: true, x: 0, y: 0, opacity: 1,
        objects: [{ id: 1, name: 'obj', type: '', x: 0, y: 0, width: 16, height: 16, rotation: 0, visible: true, ...objectOverrides }],
      }],
      tilesets: [],
    }, 'objkind.tmj');
    return new TiledMap('objkind.tmj', data, []).toTileMap();
  }

  it('maps an ellipse object to kind "ellipse"', () => {
    const obj = makeObjectKindMap({ ellipse: true }).objectLayers[0]!.objects[0]!;
    expect(obj.kind).toBe('ellipse');
  });

  it('maps a polygon object to kind "polygon" with converted points', () => {
    const points = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }];
    const obj = makeObjectKindMap({ polygon: points }).objectLayers[0]!.objects[0]!;
    expect(obj.kind).toBe('polygon');
    if (obj.kind === 'polygon') expect(obj.points).toEqual(points);
  });

  it('maps a polyline object to kind "polyline" with converted points', () => {
    const points = [{ x: 0, y: 0 }, { x: 4, y: 4 }];
    const obj = makeObjectKindMap({ polyline: points }).objectLayers[0]!.objects[0]!;
    expect(obj.kind).toBe('polyline');
    if (obj.kind === 'polyline') expect(obj.points).toEqual(points);
  });

  it('drops a tile object whose tileset has no atlas image (skipped at conversion)', () => {
    const noImageTs = new TiledTileset({ name: 'no-image', tilewidth: 16, tileheight: 16, tilecount: 1, columns: 1 }, 1);
    const data = validateTiledMapData({
      type: 'map', version: '1.10', orientation: 'orthogonal', renderorder: 'right-down',
      width: 1, height: 1, tilewidth: 16, tileheight: 16, infinite: false,
      layers: [{
        id: 1, name: 'Objects', type: 'objectgroup', visible: true, x: 0, y: 0, opacity: 1,
        objects: [{ id: 1, name: 'obj', type: '', x: 0, y: 0, width: 16, height: 16, rotation: 0, visible: true, gid: 1 }],
      }],
      tilesets: [{ firstgid: 1, name: 'no-image', tilewidth: 16, tileheight: 16, tilecount: 1, columns: 1 }],
    }, 'noimg.tmj');
    const tm = new TiledMap('noimg.tmj', data, [noImageTs]).toTileMap();
    expect(tm.objectLayers[0]!.objects).toHaveLength(0);
  });
});

// ── Text-object TextStyle field breadth ─────────────────────────────────────────

describe('TiledMap.toTileMap — text object style conversion', () => {
  function makeTextObjectMap(textData: Record<string, unknown>): TileMap {
    const data = validateTiledMapData({
      type: 'map', version: '1.10', orientation: 'orthogonal', renderorder: 'right-down',
      width: 1, height: 1, tilewidth: 16, tileheight: 16, infinite: false,
      layers: [{
        id: 1, name: 'Objects', type: 'objectgroup', visible: true, x: 0, y: 0, opacity: 1,
        objects: [{ id: 1, name: 'label', type: '', x: 0, y: 0, width: 16, height: 16, rotation: 0, visible: true, text: textData }],
      }],
      tilesets: [],
    }, 'text.tmj');
    return new TiledMap('text.tmj', data, []).toTileMap();
  }

  it('omits optional TextStyle fields entirely when absent from the source text object', () => {
    const obj = makeTextObjectMap({ text: 'plain' }).objectLayers[0]!.objects[0]!;
    expect(obj.kind).toBe('text');
    if (obj.kind === 'text') expect(obj.text).toEqual({ text: 'plain' });
  });

  it('includes fontFamily, italic, underline, strikeout, halign, and valign when present', () => {
    const obj = makeTextObjectMap({
      text: 'styled', fontfamily: 'Arial', italic: true, underline: true, strikeout: true, halign: 'right', valign: 'bottom',
    }).objectLayers[0]!.objects[0]!;
    expect(obj.kind).toBe('text');
    if (obj.kind === 'text') {
      expect(obj.text.fontFamily).toBe('Arial');
      expect(obj.text.italic).toBe(true);
      expect(obj.text.underline).toBe(true);
      expect(obj.text.strikeout).toBe(true);
      expect(obj.text.halign).toBe('right');
      expect(obj.text.valign).toBe('bottom');
    }
  });
});

// ── Per-tile collision shape kind breadth ───────────────────────────────────────

describe('TiledMap.toTileMap — per-tile collision shape kinds', () => {
  it('converts point, ellipse, polygon, and polyline collision shapes; drops text and gid shapes', () => {
    const ts = new TiledTileset(
      {
        name: 'collide', tilewidth: 16, tileheight: 16, tilecount: 1, columns: 1,
        imagewidth: 16, imageheight: 16,
        tiles: [{
          id: 0,
          objectgroup: {
            id: 1, name: '', type: 'objectgroup', visible: true, opacity: 1, x: 0, y: 0,
            draworder: 'topdown',
            objects: [
              { id: 1, name: '', type: '', x: 0, y: 0, width: 0, height: 0, rotation: 0, visible: true, text: { text: 'dropped' } },
              { id: 2, name: '', type: '', x: 0, y: 0, width: 0, height: 0, rotation: 0, visible: true, gid: 1 },
              { id: 3, name: '', type: '', x: 1, y: 1, width: 0, height: 0, rotation: 0, visible: true, point: true },
              { id: 4, name: '', type: '', x: 2, y: 2, width: 4, height: 4, rotation: 0, visible: true, ellipse: true },
              { id: 5, name: '', type: '', x: 0, y: 0, width: 0, height: 0, rotation: 0, visible: true, polygon: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }] },
              { id: 6, name: '', type: '', x: 0, y: 0, width: 0, height: 0, rotation: 0, visible: true, polyline: [{ x: 0, y: 0 }, { x: 3, y: 3 }] },
            ],
          },
        }],
      },
      1,
      { imageUrl: 'collide.png', texture: makeTexture(16, 16) },
    );
    const data = validateTiledMapData({ ...RAW_MINIMAL, layers: [] }, 'collide.tmj');
    const tm = new TiledMap('collide.tmj', data, [ts]).toTileMap();
    const collision = tm.tilesets[0]!.getTileDefinition(0)?.collision;
    expect(collision).toHaveLength(4);
    expect(collision?.map(shape => shape.kind)).toEqual(['point', 'ellipse', 'polygon', 'polyline']);
  });
});

// ── buildTileDefinitions edge cases ──────────────────────────────────────────────

describe('TiledMap.toTileMap — buildTileDefinitions edge cases', () => {
  it('skips an out-of-range tile id and a tile whose animation/collision fully filter to empty', () => {
    const ts = new TiledTileset(
      {
        name: 'edge', tilewidth: 16, tileheight: 16, tilecount: 2, columns: 2,
        imagewidth: 32, imageheight: 16,
        tiles: [
          { id: 5 }, // out of range for tilecount: 2
          {
            id: 0,
            animation: [{ tileid: 99, duration: 100 }], // out-of-range frame, filtered to empty
            objectgroup: {
              id: 1, name: '', type: 'objectgroup', visible: true, opacity: 1, x: 0, y: 0,
              draworder: 'topdown',
              objects: [{ id: 1, name: '', type: '', x: 0, y: 0, width: 0, height: 0, rotation: 0, visible: true, text: { text: 'x' } }],
            },
          },
        ],
      },
      1,
      { imageUrl: 'edge.png', texture: makeTexture(32, 16) },
    );
    const data = validateTiledMapData({ ...RAW_MINIMAL, layers: [] }, 'edgeTiles.tmj');
    const tm = new TiledMap('edgeTiles.tmj', data, [ts]).toTileMap();
    const runtimeTs = tm.tilesets[0]!;
    expect(runtimeTs.getTileDefinition(0)).toBeUndefined();
    expect(runtimeTs.getTileDefinition(5)).toBeUndefined();
  });
});

// ── parseTiledColor breadth (AARRGGBB, malformed length, invalid hex digits) ────

describe('TiledMap.toTileMap — background colour parsing edge cases', () => {
  it('parses an 8-digit AARRGGBB colour, dropping the leading alpha', () => {
    const data = validateTiledMapData({ ...RAW_MINIMAL, backgroundcolor: '#ff112233' }, 'argb.tmj');
    const tm = new TiledMap('argb.tmj', data, [ATLAS_TILESET]).toTileMap();
    expect(tm.backgroundColor).toBe(0x112233);
  });

  it('returns null for a malformed-length colour string', () => {
    const data = validateTiledMapData({ ...RAW_MINIMAL, backgroundcolor: '#1234' }, 'shortcolor.tmj');
    const tm = new TiledMap('shortcolor.tmj', data, [ATLAS_TILESET]).toTileMap();
    expect(tm.backgroundColor).toBeNull();
  });

  it('returns null for invalid hex digits', () => {
    const data = validateTiledMapData({ ...RAW_MINIMAL, backgroundcolor: '#zzzzzz' }, 'badhex.tmj');
    const tm = new TiledMap('badhex.tmj', data, [ATLAS_TILESET]).toTileMap();
    expect(tm.backgroundColor).toBeNull();
  });

  it('accepts a colour string without a leading "#"', () => {
    const data = validateTiledMapData({ ...RAW_MINIMAL, backgroundcolor: '112233' }, 'nohash.tmj');
    const tm = new TiledMap('nohash.tmj', data, [ATLAS_TILESET]).toTileMap();
    expect(tm.backgroundColor).toBe(0x112233);
  });
});

// ── Property conversion edge cases ──────────────────────────────────────────────

describe('TiledMap.toTileMap — property conversion edge cases', () => {
  it('converts float, color, and file property types to their raw values', () => {
    const data = validateTiledMapData({
      ...RAW_MINIMAL,
      properties: [
        { name: 'speed', type: 'float', value: 2.5 },
        { name: 'tint', type: 'color', value: '#ff0000ff' },
        { name: 'sfx', type: 'file', value: 'sounds/hit.wav' },
      ],
    }, 'floatcolorfile.tmj');
    const tm = new TiledMap('floatcolorfile.tmj', data, [ATLAS_TILESET]).toTileMap();
    expect(tm.properties['speed']).toBe(2.5);
    expect(tm.properties['tint']).toBe('#ff0000ff');
    expect(tm.properties['sfx']).toBe('sounds/hit.wav');
  });

  it('omits a property whose converted value is undefined (defensive; requires bypassing validate.ts, whose `value` field is never undefined)', () => {
    const data = validateTiledMapData({ ...RAW_MINIMAL, layers: [] }, 'ghost.tmj');
    const bogusProp = { name: 'ghost', type: 'string', propertytype: undefined, value: undefined } as unknown as TiledPropertyData;
    const dataWithGhost: TiledMapData = { ...data, properties: [bogusProp] };
    const tm = new TiledMap('ghost.tmj', dataWithGhost, [ATLAS_TILESET]).toTileMap();
    expect(tm.properties).toEqual({});
  });

  it('throws when converting a property with an unrecognised type (defensive; validate.ts normally restricts property.type to 8 known values)', () => {
    const data = validateTiledMapData({
      ...RAW_MINIMAL,
      properties: [{ name: 'weird', type: 'string', value: 'x' }],
    }, 'weird.tmj');
    // Mutate the already-parsed property to simulate an invariant violation that
    // validate.ts's own type restriction would normally prevent.
    (data.properties![0] as { type: string }).type = 'vector3';
    const map = new TiledMap('weird.tmj', data, [ATLAS_TILESET]);
    expect(() => map.toTileMap()).toThrow(/unrecognised Tiled property type "vector3"/);
  });
});

// ── Defensive coverage of otherwise-unreachable branches ────────────────────────
//
// The tests below intentionally bypass validate.ts's invariants (which a
// TiledMap built via loadTiledMap() always upholds) by either constructing
// TiledMapData by hand or tampering with an already-validated map's internal
// state. TiledMap's own constructor does not re-run validate.ts, so these are
// legitimate (if unusual) call shapes for a caller that skips loadTiledMap.

function makeBareMapData(overrides: Partial<TiledMapData> & { layers: TiledMapData['layers'] }): TiledMapData {
  return {
    type: 'map',
    version: '1.10',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: 1,
    height: 1,
    tilewidth: 16,
    tileheight: 16,
    infinite: false,
    tilesets: [],
    properties: [],
    ...overrides,
  };
}

describe('TiledMap — defensive coverage of otherwise-unreachable branches', () => {
  it('tolerates an explicit undefined entry in the tilesets array (sort() never invokes the comparator on it)', () => {
    const data = validateTiledMapData({ ...RAW_MINIMAL, layers: [] }, 'holetilesets.tmj');
    const map = new TiledMap('holetilesets.tmj', data, [TILESET, undefined as unknown as TiledTileset]);
    expect(map.tilesets).toHaveLength(2);
    const tm = map.toTileMap();
    // TILESET has no texture (skipped) and the hole is skipped too → no runtime tilesets.
    expect(tm.tilesets).toHaveLength(0);
  });

  it('resolveGid returns null when no tileset covers the masked gid (requires clearing tilesets after construction, since valid construction always guarantees coverage)', () => {
    const map = makeAtlasMap();
    (map as unknown as { tilesets: TiledTileset[] }).tilesets = [];
    const tm = map.toTileMap();
    expect(tm.layers[0]!.getTileAt(0, 0)).toBeNull();
  });

  it('skips a hole in a tile layer\'s raw data array (defensive; requires a genuine sparse hole, which JSON parsing never produces)', () => {
    const holedData: number[] = new Array(3) as number[];
    holedData[0] = 0;
    holedData[2] = 0;
    const layer: TiledLayerData = {
      type: 'tilelayer', id: 1, name: 'HoleData', visible: true, opacity: 1, x: 0, y: 0,
      width: 3, height: 1, data: holedData,
    };
    const data = makeBareMapData({ width: 3, height: 1, layers: [layer] });
    const map = new TiledMap('holedata.tmj', data, []);
    const tm = map.toTileMap();
    expect(tm.layers[0]!.getTileAt(1, 0)).toBeNull();
  });

  it('silently ignores a layer of an unrecognised type end-to-end (defensive; bypasses validate.ts\'s restriction of layer.type to 4 known values)', () => {
    const bogusLayer = { type: 'unknown-layer-type', id: 1, name: 'Bogus', visible: true, opacity: 1, x: 0, y: 0 } as unknown as TiledLayerData;
    const data = makeBareMapData({ layers: [bogusLayer] });
    const map = new TiledMap('bogus.tmj', data, []);
    const tm = map.toTileMap();
    expect(tm.layers).toHaveLength(0);
    expect(tm.objectLayers).toHaveLength(0);
    expect(tm.imageLayers).toHaveLength(0);
  });

  it('skips tile-layer population when both data and chunks are undefined (defensive; bypasses validate.ts\'s "exactly one of data/chunks" check)', () => {
    const layer: TiledLayerData = {
      type: 'tilelayer', id: 1, name: 'Bare', visible: true, opacity: 1, x: 0, y: 0, width: 1, height: 1,
    };
    const data = makeBareMapData({ layers: [layer] });
    const map = new TiledMap('bare.tmj', data, []);
    const tm = map.toTileMap();
    expect(tm.layers[0]!.getTileAt(0, 0)).toBeNull();
  });

  it('defaults an image layer texture to null when no texture was preloaded for its id', () => {
    const layer: TiledLayerData = {
      type: 'imagelayer', id: 1, name: 'Bg', visible: true, opacity: 1, x: 0, y: 0, image: 'bg.png',
    };
    const data = makeBareMapData({ layers: [layer] });
    const tm = new TiledMap('imgnotex.tmj', data, []).toTileMap(); // no imageTextures map passed → defaults to empty
    expect(tm.imageLayers[0]!.texture).toBeNull();
  });

  it('skips a hole in an infinite tile layer\'s chunks array during GID-coverage validation', () => {
    const chunks: TiledChunkData[] = new Array(2) as TiledChunkData[];
    chunks[1] = { x: 0, y: 0, width: 1, height: 1, data: [0] };
    const layer: TiledLayerData = {
      type: 'tilelayer', id: 1, name: 'Inf', visible: true, opacity: 1, x: 0, y: 0, width: 0, height: 0, chunks,
    };
    const data = makeBareMapData({ infinite: true, layers: [layer] });
    expect(() => new TiledMap('holechunks.tmj', data, [])).not.toThrow();
  });

  it('skips a hole in an object layer\'s objects array during GID-coverage validation', () => {
    const objects: TiledObjectData[] = new Array(2) as TiledObjectData[];
    objects[1] = { id: 1, name: '', type: '', x: 0, y: 0, width: 0, height: 0, rotation: 0, visible: true };
    const layer: TiledLayerData = {
      type: 'objectgroup', id: 1, name: 'Objs', visible: true, opacity: 1, x: 0, y: 0, objects,
    };
    const data = makeBareMapData({ layers: [layer] });
    expect(() => new TiledMap('holeobjects.tmj', data, [])).not.toThrow();
  });

  test('an object gid of 0 is accepted as the empty-cell sentinel, like tile-layer GIDs', () => {
    // findTilesetForGid documents gid 0 as "the empty-cell sentinel" and
    // checkGidArray (tile-layer data/chunks) special-cases it; the object-layer
    // coverage check treats it the same way.
    const layer: TiledLayerData = {
      type: 'objectgroup', id: 1, name: 'Objs', visible: true, opacity: 1, x: 0, y: 0,
      objects: [{ id: 1, name: '', type: '', x: 0, y: 0, width: 0, height: 0, rotation: 0, visible: true, gid: 0 }],
    };
    const data = makeBareMapData({ layers: [layer] });
    expect(() => new TiledMap('objgid0.tmj', data, [])).not.toThrow();
  });
});
