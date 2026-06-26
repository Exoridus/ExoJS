import { WangSet } from '@codexo/exojs-tilemap';
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
function makeWangSet(type: string, wangtiles: { tileid: number; wangid: number[] }[]): TiledWangSetData {
  return {
    name: 'terrain',
    type,
    tile: -1,
    colors: [{ name: 'grass', color: '#00ff00', tile: 0, probability: 1 }],
    wangtiles: wangtiles.map(wt => ({ tileid: wt.tileid, wangid: wt.wangid })),
  };
}

describe('tiledWangSetToWangSet — corner type', () => {
  // Build a corner wangset with 3 tiles:
  //   tile 10: all corners set → blob mask TL|TR|BL|BR = 1|4|32|128 = 165
  //   tile 11: no corners set  → blob mask = 0
  //   tile 12: TL + TR only    → blob mask TL|TR = 1|4 = 5
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

  it('maps all-corners mask (165) → tile 10', () => {
    const result = tiledWangSetToWangSet(cornerSet, TILESET_INDEX)!;
    // TL(1) | TR(4) | BL(32) | BR(128) = 165
    expect(result.getTileId(165)).toBe(10);
  });

  it('maps no-corners mask (0) → tile 11', () => {
    const result = tiledWangSetToWangSet(cornerSet, TILESET_INDEX)!;
    expect(result.getTileId(0)).toBe(11);
  });

  it('maps TL+TR mask (5) → tile 12', () => {
    const result = tiledWangSetToWangSet(cornerSet, TILESET_INDEX)!;
    // TL(1) | TR(4) = 5
    expect(result.getTileId(5)).toBe(12);
  });

  it('returns undefined for a mask with no mapping', () => {
    const result = tiledWangSetToWangSet(cornerSet, TILESET_INDEX)!;
    // mask 2 (top-only cardinal bit, not used by corner wangsets) → not mapped
    expect(result.getTileId(2)).toBeUndefined();
  });

  it('all mapped tile ids are members', () => {
    const result = tiledWangSetToWangSet(cornerSet, TILESET_INDEX)!;
    expect(result.isMember(10)).toBe(true);
    expect(result.isMember(11)).toBe(true);
    expect(result.isMember(12)).toBe(true);
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
