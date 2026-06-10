import { describe, expect, it } from 'vitest';

import { TiledMap } from '../src/TiledMap';
import { TiledTileset } from '../src/TiledTileset';
import { TiledTileLayer } from '../src/TiledLayer';
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
