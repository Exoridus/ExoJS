import { Texture } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { TiledTileset } from '../src/TiledTileset';

const BASE_DATA = {
  name: 'tiles',
  tilewidth: 16,
  tileheight: 16,
  tilecount: 4,
  columns: 2,
  spacing: 2,
  margin: 1,
};

describe('TiledTileset constructor — field mapping', () => {
  it('maps name, tile dimensions, count, columns, spacing, margin', () => {
    const ts = new TiledTileset(BASE_DATA, 1);
    expect(ts.name).toBe('tiles');
    expect(ts.tileWidth).toBe(16);
    expect(ts.tileHeight).toBe(16);
    expect(ts.tileCount).toBe(4);
    expect(ts.columns).toBe(2);
    expect(ts.spacing).toBe(2);
    expect(ts.margin).toBe(1);
  });

  it('maps firstGid from the constructor argument', () => {
    expect(new TiledTileset(BASE_DATA, 5).firstGid).toBe(5);
  });

  it('defaults class to empty string', () => {
    expect(new TiledTileset(BASE_DATA, 1).class).toBe('');
  });

  it('maps class when provided', () => {
    expect(new TiledTileset({ ...BASE_DATA, class: 'water' }, 1).class).toBe('water');
  });

  it('defaults spacing and margin to 0 when absent', () => {
    const ts = new TiledTileset({ name: 'tiles', tilewidth: 16, tileheight: 16, tilecount: 4, columns: 2 }, 1);
    expect(ts.spacing).toBe(0);
    expect(ts.margin).toBe(0);
  });

  it('maps imageWidth and imageHeight from data', () => {
    const ts = new TiledTileset({ ...BASE_DATA, imagewidth: 64, imageheight: 64 }, 1);
    expect(ts.imageWidth).toBe(64);
    expect(ts.imageHeight).toBe(64);
  });

  it('defaults tileOffset to { x: 0, y: 0 }', () => {
    expect(new TiledTileset(BASE_DATA, 1).tileOffset).toEqual({ x: 0, y: 0 });
  });

  it('maps tileOffset from data', () => {
    expect(new TiledTileset({ ...BASE_DATA, tileoffset: { x: 4, y: -2 } }, 1).tileOffset).toEqual({ x: 4, y: -2 });
  });

  it('maps objectAlignment', () => {
    expect(new TiledTileset({ ...BASE_DATA, objectalignment: 'topleft' }, 1).objectAlignment).toBe('topleft');
  });

  it('defaults tiles to empty array', () => {
    expect(new TiledTileset(BASE_DATA, 1).tiles).toEqual([]);
  });

  it('defaults properties to empty array', () => {
    expect(new TiledTileset(BASE_DATA, 1).properties).toEqual([]);
  });
});

describe('TiledTileset resources', () => {
  it('uses empty resources by default (no texture, no tileTextures)', () => {
    const ts = new TiledTileset(BASE_DATA, 1);
    expect(ts.source).toBeUndefined();
    expect(ts.imageUrl).toBeUndefined();
    expect(ts.texture).toBeUndefined();
    expect(ts.tileTextures.size).toBe(0);
  });

  it('maps source, imageUrl, and texture from resources', () => {
    const texture = new Texture();
    const ts = new TiledTileset(
      { ...BASE_DATA, image: 'tiles.png', imagewidth: 64, imageheight: 64 },
      1,
      { source: 'tilesets/tiles.tsj', imageUrl: 'tilesets/tiles.png', texture },
    );
    expect(ts.source).toBe('tilesets/tiles.tsj');
    expect(ts.imageUrl).toBe('tilesets/tiles.png');
    expect(ts.texture).toBe(texture);
  });

  it('maps per-tile tileTextures from resources', () => {
    const t0 = new Texture();
    const t1 = new Texture();
    const tileTextures = new Map([[0, t0], [1, t1]]);
    const ts = new TiledTileset({ ...BASE_DATA, columns: 0 }, 1, { tileTextures });
    expect(ts.tileTextures.get(0)).toBe(t0);
    expect(ts.tileTextures.get(1)).toBe(t1);
  });
});

describe('TiledTileset.lastGid', () => {
  it('is firstGid + tileCount - 1', () => {
    expect(new TiledTileset(BASE_DATA, 1).lastGid).toBe(4);
    expect(new TiledTileset(BASE_DATA, 5).lastGid).toBe(8);
  });

  it('is less than firstGid for tileCount = 0 (empty tileset)', () => {
    const ts = new TiledTileset({ ...BASE_DATA, tilecount: 0 }, 1);
    expect(ts.lastGid).toBe(0);
    expect(ts.lastGid).toBeLessThan(ts.firstGid);
  });
});

describe('TiledTileset.getTile', () => {
  const tileData = { id: 2, type: 'water', animation: undefined, objectgroup: undefined, image: undefined, imagewidth: undefined, imageheight: undefined };
  const ts = new TiledTileset({ ...BASE_DATA, tiles: [{ id: 0 }, { id: 2 }] }, 1);

  it('returns the tile with matching local id', () => {
    expect(ts.getTile(0)).toMatchObject({ id: 0 });
    expect(ts.getTile(2)).toMatchObject({ id: 2 });
  });

  it('returns undefined for an unknown local id', () => {
    expect(ts.getTile(3)).toBeUndefined();
  });
});

describe('TiledTileset.getProperty', () => {
  const ts = new TiledTileset(
    { ...BASE_DATA, properties: [{ name: 'kind', type: 'string', value: 'terrain', propertytype: undefined }] },
    1,
  );

  it('returns the property with matching name', () => {
    expect(ts.getProperty('kind')).toMatchObject({ name: 'kind', value: 'terrain' });
  });

  it('returns undefined for an unknown name', () => {
    expect(ts.getProperty('unknown')).toBeUndefined();
  });
});
