import { type Texture, TextureRegion } from '@codexo/exojs';
import { autoTile, refreshCell, TILE_TRANSFORM_IDENTITY, TileLayer, TileSet, WangSet } from '@codexo/exojs/tilemap';
import { describe, expect, it } from 'vitest';

import type { TiledWangSetData } from '../src/data';
import { tiledWangSetToWangSet } from '../src/wangSets';

// ── WangSet blob bit layout (from WangSet.ts) ────────────────────────────────
// Bit 0 (1):   Top-left
// Bit 1 (2):   Top
// Bit 2 (4):   Top-right
// Bit 3 (8):   Left
// Bit 4 (16):  Right
// Bit 5 (32):  Bottom-left
// Bit 6 (64):  Bottom
// Bit 7 (128): Bottom-right
//
// Tiled wangid layout (indices 0-7):
// [top(0), topright(1), right(2), bottomright(3), bottom(4), bottomleft(5), left(6), topleft(7)]

// Corner type: positions 1,3,5,7 carry color indices
// Tiled topleft  = wangid[7] → WangSet bit 0 (1)
// Tiled topright = wangid[1] → WangSet bit 2 (4)
// Tiled botleft  = wangid[5] → WangSet bit 5 (32)
// Tiled botright = wangid[3] → WangSet bit 7 (128)

const TILESET_INDEX = 2;

// Helper to build a minimal TiledWangSetData
const makeWangSet = (type: string, wangtiles: Array<{ tileid: number; wangid: number[] }>): TiledWangSetData => ({
  name: 'terrain',
  type,
  tile: -1,
  colors: [{ name: 'grass', color: '#00ff00', tile: 0, probability: 1 }],
  wangtiles: wangtiles.map(wt => ({ tileid: wt.tileid, wangid: wt.wangid })),
});

describe('tiledWangSetToWangSet — corner type', () => {
  // Build a corner wangset with 3 tiles:
  //   tile 10: all corners set → blob mask = 255
  //   tile 11: no corners set  → blob mask = 0
  //   tile 12: TL + TR only    → blob mask TL|T|TR|L|R = 31
  const cornerSet = makeWangSet('corner', [
    //        top topright right botright bot botleft left topleft
    { tileid: 10, wangid: [0, 1, 0, 1, 0, 1, 0, 1] }, // all corners
    { tileid: 11, wangid: [0, 0, 0, 0, 0, 0, 0, 0] }, // no corners
    { tileid: 12, wangid: [0, 1, 0, 0, 0, 0, 0, 1] }, // TL + TR only
  ]);

  it('returns a WangSet instance', () => {
    const result = tiledWangSetToWangSet(cornerSet, TILESET_INDEX);
    expect(result).toBeInstanceOf(WangSet);
  });

  it('sets tilesetIndex correctly', () => {
    const result = tiledWangSetToWangSet(cornerSet, TILESET_INDEX)!;
    expect(result.tilesetIndex).toBe(TILESET_INDEX);
  });

  it('type is "blob"', () => {
    const result = tiledWangSetToWangSet(cornerSet, TILESET_INDEX)!;
    expect(result.type).toBe('blob');
  });

  it('maps all-corners mask (255) → tile 10', () => {
    const result = tiledWangSetToWangSet(cornerSet, TILESET_INDEX)!;
    // All corners and cardinal bits are set.
    expect(result.getTileId(255)).toBe(10);
  });

  it('maps no-corners mask (0) → tile 11', () => {
    const result = tiledWangSetToWangSet(cornerSet, TILESET_INDEX)!;
    expect(result.getTileId(0)).toBe(11);
  });

  it('maps TL+TR mask (31) to tile 12', () => {
    const result = tiledWangSetToWangSet(cornerSet, TILESET_INDEX)!;
    // TL(1) | T(2) | TR(4) | L(8) | R(16) = 31
    expect(result.getTileId(31)).toBe(12);
  });

  it.each(['autoTile', 'refreshCell'])('resolves every valid blob neighborhood with %s', apply => {
    const wangtiles = Array.from({ length: 16 }, (_, corners) => ({
      tileid: corners,
      wangid: [0, (corners >> 1) & 1, 0, (corners >> 3) & 1, 0, (corners >> 2) & 1, 0, corners & 1],
    }));
    const set = tiledWangSetToWangSet(makeWangSet('corner', wangtiles), 0)!;
    const texture = { width: 128, height: 128, destroyed: false } as Texture;
    const tileset = new TileSet({
      columns: 4,
      name: 'terrain',
      tileCount: 16,
      tileWidth: 32,
      tileHeight: 32,
      texture: new TextureRegion(texture, { x: 0, y: 0, width: 128, height: 128 }),
    });
    const neighbors = [
      [0, 0, 1],
      [1, 0, 2],
      [2, 0, 4],
      [0, 1, 8],
      [2, 1, 16],
      [0, 2, 32],
      [1, 2, 64],
      [2, 2, 128],
    ];
    const failures: number[] = [];
    let validMasks = 0;

    for (let mask = 0; mask < 256; mask++) {
      if (
        ((mask & 1) !== 0 && (mask & 10) !== 10) ||
        ((mask & 4) !== 0 && (mask & 18) !== 18) ||
        ((mask & 32) !== 0 && (mask & 72) !== 72) ||
        ((mask & 128) !== 0 && (mask & 80) !== 80)
      ) {
        continue;
      }

      validMasks++;
      const layer = new TileLayer({
        id: 0,
        name: 'terrain',
        width: 3,
        height: 3,
        tileWidth: 32,
        tileHeight: 32,
        tilesets: [tileset],
      });
      const tile = { localTileId: 15, tileset, transform: TILE_TRANSFORM_IDENTITY };
      layer.setTileAt(1, 1, tile);

      for (const [x, y, bit] of neighbors) {
        if ((mask & bit!) !== 0) {
          layer.setTileAt(x!, y!, tile);
        }
      }

      if (apply === 'autoTile') {
        autoTile(layer, set, { wrapBorder: false });
      } else {
        refreshCell(layer, 1, 1, set, { wrapBorder: false });
      }

      const expected = (mask & 1) | ((mask & 4) >> 1) | ((mask & 32) >> 3) | ((mask & 128) >> 4);

      if (layer.getTileAt(1, 1)?.localTileId !== expected) {
        failures.push(mask);
      }
    }

    expect(validMasks).toBe(47);
    expect(failures).toEqual([]);
  });

  it('returns undefined for an unmapped corner pattern', () => {
    const result = tiledWangSetToWangSet(cornerSet, TILESET_INDEX)!;
    expect(result.getTileId(11)).toBeUndefined();
  });

  it('all mapped tile ids are members', () => {
    const result = tiledWangSetToWangSet(cornerSet, TILESET_INDEX)!;
    expect(result.isMember(10)).toBe(true);
    expect(result.isMember(11)).toBe(true);
    expect(result.isMember(12)).toBe(true);
  });

  it('treats missing wangid indices as unset rather than throwing', () => {
    // A wangid array shorter than 8 entries leaves the corner indices (1, 3, 5, 7)
    // undefined; the `?? 0` fallback must treat all of them as "not this terrain".
    const shortSet = makeWangSet('corner', [{ tileid: 30, wangid: [] }]);
    const result = tiledWangSetToWangSet(shortSet, TILESET_INDEX)!;
    expect(result.getTileId(0)).toBe(30);
  });
});

describe('tiledWangSetToWangSet — edge type', () => {
  // Edge wangid positions: top=0, right=2, bottom=4, left=6
  // WangSet edge bits: top=1, right=2, bottom=4, left=8
  //   tile 20: all edges  → edge mask = 1|2|4|8 = 15
  //   tile 21: top only   → edge mask = 1
  //   tile 22: left+right → edge mask = 2|8 = 10
  const edgeSet = makeWangSet('edge', [
    //        top topright right botright bot botleft left topleft
    { tileid: 20, wangid: [1, 0, 1, 0, 1, 0, 1, 0] }, // all 4 edges
    { tileid: 21, wangid: [1, 0, 0, 0, 0, 0, 0, 0] }, // top only
    { tileid: 22, wangid: [0, 0, 1, 0, 0, 0, 1, 0] }, // right + left
  ]);

  it('returns a WangSet instance', () => {
    expect(tiledWangSetToWangSet(edgeSet, 0)).toBeInstanceOf(WangSet);
  });

  it('type is "edge"', () => {
    const result = tiledWangSetToWangSet(edgeSet, 0)!;
    expect(result.type).toBe('edge');
  });

  it('maps all-edges mask (15) → tile 20', () => {
    const result = tiledWangSetToWangSet(edgeSet, 0)!;
    expect(result.getTileId(15)).toBe(20);
  });

  it('maps top-only mask (1) → tile 21', () => {
    const result = tiledWangSetToWangSet(edgeSet, 0)!;
    expect(result.getTileId(1)).toBe(21);
  });

  it('maps right+left mask (10) → tile 22', () => {
    const result = tiledWangSetToWangSet(edgeSet, 0)!;
    // right(2) | left(8) = 10
    expect(result.getTileId(10)).toBe(22);
  });

  it('treats missing wangid indices as unset rather than throwing', () => {
    // A wangid array shorter than 8 entries leaves the edge indices (0, 2, 4, 6)
    // undefined; the `?? 0` fallback must treat all of them as "not this terrain".
    const shortSet = makeWangSet('edge', [{ tileid: 40, wangid: [] }]);
    const result = tiledWangSetToWangSet(shortSet, 0)!;
    expect(result.getTileId(0)).toBe(40);
  });
});

describe('tiledWangSetToWangSet — unsupported types', () => {
  it('returns null for type "mixed"', () => {
    const mixedSet = makeWangSet('mixed', [{ tileid: 0, wangid: [1, 1, 1, 1, 1, 1, 1, 1] }]);
    expect(tiledWangSetToWangSet(mixedSet, 0)).toBeNull();
  });

  it('returns null for an unknown type string', () => {
    const unknownSet = makeWangSet('superblob', []);
    expect(tiledWangSetToWangSet(unknownSet, 0)).toBeNull();
  });
});
