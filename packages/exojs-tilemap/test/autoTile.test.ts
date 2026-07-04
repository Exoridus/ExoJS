import { TextureRegion } from '@codexo/exojs';
import { type Texture } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { autoTile, refreshCell } from '../src/autoTile';
import { TileLayer } from '../src/TileLayer';
import { TileSet } from '../src/TileSet';
import { TILE_TRANSFORM_IDENTITY } from '../src/types';
import { WangSet } from '../src/WangSet';

// ── Test helpers ──────────────────────────────────────────────────────────

function fakeTexture(): Texture {
  return {
    destroyed: false,
    destroy: () => {},
    height: 512,
    label: 'test',
    uid: 0,
    width: 512,
  } as unknown as Texture;
}

function fakeRegion(): TextureRegion {
  return new TextureRegion(fakeTexture(), { height: 512, width: 512, x: 0, y: 0 });
}

/**
 * Create a TileSet with 256 tiles (16×16 grid in a 512×512 atlas).
 * localTileIds 0–255 are all valid, which conveniently covers the full
 * blob bitmask range (0–255) when using an identity blobMap.
 */
function makeTileset256(name = 'ts'): TileSet {
  return new TileSet({
    columns: 16,
    name,
    tileCount: 256,
    tileHeight: 32,
    tileWidth: 32,
    texture: fakeRegion(),
  });
}

function makeLayer(ts: TileSet, w = 3, h = 3): TileLayer {
  return new TileLayer({
    height: h,
    id: 0,
    name: 'layer',
    tileHeight: 32,
    tileWidth: 32,
    tilesets: [ts],
    width: w,
  });
}

/**
 * A blobMap that maps every bitmask to itself (identity).
 * After autoTile, `layer.getTileAt(x,y).localTileId` equals the computed mask,
 * making assertions straightforward.
 */
function identityBlobMap(): Map<number, number> {
  const m = new Map<number, number>();
  for (let i = 0; i <= 255; i++) m.set(i, i);
  return m;
}

function setTile(layer: TileLayer, ts: TileSet, tx: number, ty: number, localTileId = 0): void {
  layer.setTileAt(tx, ty, { localTileId, tileset: ts, transform: TILE_TRANSFORM_IDENTITY });
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 1: Blob mask — corner bits require adjacent cardinals to be set
// ═══════════════════════════════════════════════════════════════════════════

describe('autoTile — blob mode corner dependency', () => {
  it('full 3×3 grid: center gets mask 255, corner gets partial mask without OOB neighbors', () => {
    const ts = makeTileset256();
    const layer = makeLayer(ts, 3, 3);

    // Fill all 9 cells with tile 0.
    for (let ty = 0; ty < 3; ty++) {
      for (let tx = 0; tx < 3; tx++) {
        setTile(layer, ts, tx, ty, 0);
      }
    }

    const wangSet = new WangSet({ blobMap: identityBlobMap(), tilesetIndex: 0, type: 'blob' });
    autoTile(layer, wangSet, { wrapBorder: false });

    // Center (1,1): all 8 in-bounds neighbors are tile 0 → all bits set → mask 255.
    expect(layer.getTileAt(1, 1)?.localTileId).toBe(255);

    // Corner (0,0) with wrapBorder=false:
    //   top (0,-1): OOB → false         T=0
    //   left (-1,0): OOB → false        L=0
    //   right (1,0): tile 0 → true      R=16
    //   bottom (0,1): tile 0 → true     B=64
    //   TL: OOB but top=false → no      bit 1=0
    //   TR: OOB and top=false → no      bit 4=0
    //   BL: OOB and left=false → no     bit 32=0
    //   BR (1,1): tile0=true, AND bottom=true, right=true → yes  bit 128=128
    //   expected mask: 16 + 64 + 128 = 208
    expect(layer.getTileAt(0, 0)?.localTileId).toBe(208);
  });

  it('corner bit suppressed when an adjacent cardinal is absent (diagonal-only neighbor)', () => {
    // Place tiles only at diagonally opposite corners of a 3×3 grid.
    // Cell (0,0) has a diagonal neighbor at (1,1) but NO cardinal neighbors.
    // The corner dependency rule must prevent bit 128 (BR) from being set.
    const ts = makeTileset256();
    const layer = makeLayer(ts, 3, 3);

    setTile(layer, ts, 0, 0, 0);
    setTile(layer, ts, 2, 2, 0);
    // All other cells are empty.

    const wangSet = new WangSet({ blobMap: identityBlobMap(), tilesetIndex: 0, type: 'blob' });
    autoTile(layer, wangSet, { wrapBorder: false });

    // Cell (0,0): right=empty, bottom=empty → neither cardinal present.
    // BR (1,1) is also empty, so even without the rule, bit 128 = 0.
    // More importantly: no cardinal neighbors → mask = 0.
    expect(layer.getTileAt(0, 0)?.localTileId).toBe(0);

    // Now test the critical case: 3×3 grid with a hole at (0,1).
    // (0,1) is empty, so for cell (0,0):
    //   right (1,0): tile 0 → true         R=16
    //   bottom (0,1): EMPTY → false         B=0
    //   BR (1,1): tile 0, BUT bottom=false → BR bit suppressed → 0
    // mask = 16 only.
    const layer2 = makeLayer(ts, 3, 3);
    for (let ty2 = 0; ty2 < 3; ty2++) {
      for (let tx2 = 0; tx2 < 3; tx2++) {
        setTile(layer2, ts, tx2, ty2, 0);
      }
    }
    layer2.clearTileAt(0, 1); // punch a hole below (0,0)

    autoTile(layer2, wangSet, { wrapBorder: false });

    // (0,0): right=true, bottom=empty(false) → BR bit must NOT be set.
    expect(layer2.getTileAt(0, 0)?.localTileId).toBe(16); // R only
  });

  it('wrapBorder=true treats OOB as in-group: every cell in a full grid gets mask 255', () => {
    const ts = makeTileset256();
    const layer = makeLayer(ts, 3, 3);

    for (let ty = 0; ty < 3; ty++) {
      for (let tx = 0; tx < 3; tx++) {
        setTile(layer, ts, tx, ty, 0);
      }
    }

    const wangSet = new WangSet({ blobMap: identityBlobMap(), tilesetIndex: 0, type: 'blob' });
    autoTile(layer, wangSet); // wrapBorder defaults to true

    // All cells: every OOB neighbor counts as in-group → all bits set → mask 255.
    for (let ty = 0; ty < 3; ty++) {
      for (let tx = 0; tx < 3; tx++) {
        expect(layer.getTileAt(tx, ty)?.localTileId).toBe(255);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 2: matchFn restricts which cells are autotiled
// ═══════════════════════════════════════════════════════════════════════════

describe('autoTile — matchFn scope restriction', () => {
  it('cells not matched by matchFn are skipped and their tile ID is preserved', () => {
    const ts = makeTileset256();
    const layer = makeLayer(ts, 3, 3);

    // Fill 3×3 with tile 0 (wang group), then plant a "foreign" tile 5 at (2,2).
    for (let ty = 0; ty < 3; ty++) {
      for (let tx = 0; tx < 3; tx++) {
        setTile(layer, ts, tx, ty, 0);
      }
    }
    setTile(layer, ts, 2, 2, 5); // not in the wang group

    // matchFn: only localTileId 0 is in the wang group.
    const matchFn = (localTileId: number) => localTileId === 0;
    const wangSet = new WangSet({ blobMap: identityBlobMap(), tilesetIndex: 0, type: 'blob' });
    autoTile(layer, wangSet, { matchFn, wrapBorder: false });

    // The foreign tile at (2,2) must remain tile 5 — it was not autotiled.
    expect(layer.getTileAt(2, 2)?.localTileId).toBe(5);

    // A tile-0 cell must have been updated (its localTileId changed to the mask).
    // Cell (1,1): neighbors are mostly tile-0 (in group) except (2,2) is tile-5 (not matched).
    //   top (1,0): tile0 → matchFn true     T=2
    //   left (0,1): tile0 → true            L=8
    //   right (2,1): tile0 → true           R=16
    //   bottom (1,2): tile0 → true          B=64
    //   TL (0,0): tile0, top+left true → 1
    //   TR (2,0): tile0, top+right true → 4
    //   BL (0,2): tile0, bottom+left true → 32
    //   BR (2,2): tile5, matchFn→false → bit suppressed → 0
    //   mask = 1+2+4+8+16+32+64 = 127
    expect(layer.getTileAt(1, 1)?.localTileId).toBe(127);
  });

  it('matchFn returning false for all cells leaves the layer unchanged', () => {
    const ts = makeTileset256();
    const layer = makeLayer(ts, 3, 3);

    setTile(layer, ts, 1, 1, 3);

    const wangSet = new WangSet({ blobMap: identityBlobMap(), tilesetIndex: 0, type: 'blob' });
    // matchFn always returns false → nothing is autotiled.
    autoTile(layer, wangSet, { matchFn: () => false });

    expect(layer.getTileAt(1, 1)?.localTileId).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 3: Edge mode — 4 neighbors only
// ═══════════════════════════════════════════════════════════════════════════

describe('autoTile — edge mode (4-neighbor)', () => {
  it('edge mode uses only Top/Right/Bottom/Left bits', () => {
    const ts = makeTileset256();
    const layer = makeLayer(ts, 3, 3);

    // Fill all 9 cells.
    for (let ty = 0; ty < 3; ty++) {
      for (let tx = 0; tx < 3; tx++) {
        setTile(layer, ts, tx, ty, 0);
      }
    }

    const wangSet = new WangSet({ blobMap: identityBlobMap(), tilesetIndex: 0, type: 'edge' });
    autoTile(layer, wangSet, { wrapBorder: false });

    // Center (1,1): all 4 cardinal neighbors in bounds and in group.
    //   Top=1, Right=2, Bottom=4, Left=8 → mask 15.
    expect(layer.getTileAt(1, 1)?.localTileId).toBe(15);

    // Corner (0,0) with wrapBorder=false:
    //   top (0,-1): OOB → false   T=0
    //   left (-1,0): OOB → false  L=0
    //   right (1,0): tile 0 → true  R=2
    //   bottom (0,1): tile 0 → true B=4
    //   mask = 2 + 4 = 6.
    expect(layer.getTileAt(0, 0)?.localTileId).toBe(6);

    // Top-center (1,0) with wrapBorder=false:
    //   top (1,-1): OOB → false   T=0
    //   right (2,0): tile 0       R=2
    //   bottom (1,1): tile 0      B=4
    //   left (0,0): tile 0        L=8
    //   mask = 2 + 4 + 8 = 14.
    expect(layer.getTileAt(1, 0)?.localTileId).toBe(14);
  });

  it('edge mode does not consider diagonal neighbors', () => {
    // Place tiles only at diagonal positions relative to origin.
    // With edge mode, diagonals are never in the mask calculation.
    const ts = makeTileset256();
    const layer = makeLayer(ts, 3, 3);

    setTile(layer, ts, 0, 0, 0); // origin
    setTile(layer, ts, 1, 1, 0); // diagonal from (0,0)
    // No cardinal neighbors of (0,0) are set.

    const wangSet = new WangSet({ blobMap: identityBlobMap(), tilesetIndex: 0, type: 'edge' });
    autoTile(layer, wangSet, { wrapBorder: false });

    // (0,0): right=(1,0) empty, bottom=(0,1) empty → mask 0.
    expect(layer.getTileAt(0, 0)?.localTileId).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 4: WangSet membership (variant-stable)
// ═══════════════════════════════════════════════════════════════════════════

describe('WangSet — membership', () => {
  it('every blobMap value is a member; extra members are additive', () => {
    const wangSet = new WangSet({
      blobMap: new Map([
        [0, 10],
        [255, 11],
      ]),
      members: [99],
      tilesetIndex: 0,
    });

    // blobMap values are members…
    expect(wangSet.isMember(10)).toBe(true);
    expect(wangSet.isMember(11)).toBe(true);
    // …explicit members too…
    expect(wangSet.isMember(99)).toBe(true);
    // …and unrelated ids are not.
    expect(wangSet.isMember(0)).toBe(false);
    expect(wangSet.members.has(10)).toBe(true);
  });

  it('accepts a plain Record blobMap (not just a Map) and exposes it via blobMap', () => {
    const wangSet = new WangSet({
      blobMap: { 0: 10, 255: 11 },
      tilesetIndex: 0,
    });

    expect(wangSet.getTileId(0)).toBe(10);
    expect(wangSet.getTileId(255)).toBe(11);
    expect(wangSet.isMember(10)).toBe(true);
    expect(wangSet.isMember(11)).toBe(true);

    // The public getter exposes the same resolved mapping, keyed by number.
    expect(wangSet.blobMap.get(0)).toBe(10);
    expect(wangSet.blobMap.get(255)).toBe(11);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 4b: applyVariant edge cases — unmapped mask / missing tileset
// ═══════════════════════════════════════════════════════════════════════════

describe('autoTile — applyVariant defensive paths', () => {
  it('leaves a cell untouched when its computed mask has no blobMap entry', () => {
    const ts = makeTileset256();
    const layer = makeLayer(ts, 3, 3);

    // Fill the grid so the center cell computes a non-zero mask, but the
    // blobMap only maps mask 0 → 0 — every other mask is unmapped.
    for (let ty = 0; ty < 3; ty++) {
      for (let tx = 0; tx < 3; tx++) {
        setTile(layer, ts, tx, ty, 0);
      }
    }

    const sparseBlobMap = new Map<number, number>([[0, 0]]);
    const wangSet = new WangSet({ blobMap: sparseBlobMap, tilesetIndex: 0, type: 'blob' });
    autoTile(layer, wangSet, { wrapBorder: false });

    // Center (1,1) computes mask 255, which has no mapping — the cell must be
    // left exactly as painted (localTileId 0), never rewritten.
    expect(layer.getTileAt(1, 1)?.localTileId).toBe(0);
  });

  it('leaves a cell untouched when the wangSet.tilesetIndex has no matching tileset on the layer', () => {
    const ts = makeTileset256();
    const layer = makeLayer(ts, 2, 2);
    setTile(layer, ts, 0, 0, 0);
    setTile(layer, ts, 1, 0, 0);

    // matchFn bypasses the tilesetIndex membership gate entirely, so a
    // wangSet.tilesetIndex that doesn't correspond to any of the layer's
    // tilesets can still reach applyVariant's tileset lookup.
    const wangSet = new WangSet({ blobMap: identityBlobMap(), tilesetIndex: 99, type: 'blob' });
    autoTile(layer, wangSet, { matchFn: () => true, wrapBorder: false });

    // layer.tilesets[99] is undefined → applyVariant must bail out silently.
    expect(layer.getTileAt(0, 0)?.localTileId).toBe(0);
    expect(layer.getTileAt(1, 0)?.localTileId).toBe(0);
  });

  it('refreshCell defaults wrapBorder to true and honours a custom matchFn', () => {
    const ts = makeTileset256();
    const layer = makeLayer(ts, 3, 3);

    for (let ty = 0; ty < 3; ty++) {
      for (let tx = 0; tx < 3; tx++) {
        setTile(layer, ts, tx, ty, 0);
      }
    }

    const wangSet = new WangSet({ blobMap: identityBlobMap(), tilesetIndex: 0, type: 'blob' });

    // No `wrapBorder` key at all (exercises the `?? true` default) and a
    // matchFn that unconditionally accepts every cell.
    expect(() => refreshCell(layer, 0, 0, wangSet, { matchFn: () => true })).not.toThrow();

    // wrapBorder defaulting to true means every corner neighbor counts as
    // in-group, so the corner cell ends up with the full mask (255).
    expect(layer.getTileAt(0, 0)?.localTileId).toBe(255);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 5: refreshCell — incremental autotiling around an edit
// ═══════════════════════════════════════════════════════════════════════════

describe('refreshCell — incremental update', () => {
  it('produces the same result as a full autoTile for a localised edit', () => {
    const ts = makeTileset256();
    const full = makeLayer(ts, 5, 5);
    const incr = makeLayer(ts, 5, 5);

    // Identity members so every variant 0..255 is recognised as group member.
    const wangSet = new WangSet({ blobMap: identityBlobMap(), tilesetIndex: 0, type: 'blob' });

    // Both layers: fill a 3×3 block of water at the centre, leave the rim empty.
    for (const layer of [full, incr]) {
      for (let ty = 1; ty <= 3; ty++) {
        for (let tx = 1; tx <= 3; tx++) {
          setTile(layer, ts, tx, ty, 0);
        }
      }
    }

    // Full path: autotile the whole block.
    autoTile(full, wangSet, { wrapBorder: false });

    // Incremental path: autotile once to establish variants, then "paint" a new
    // water cell at (2,4) and refresh only its neighbourhood.
    autoTile(incr, wangSet, { wrapBorder: false });
    setTile(incr, ts, 2, 4, 0); // paint with a member id
    refreshCell(incr, 2, 4, wangSet, { wrapBorder: false });

    // Now apply the same paint to the full layer and re-run a complete autoTile;
    // the incremental result must match the full recompute everywhere.
    setTile(full, ts, 2, 4, 0);
    autoTile(full, wangSet, { wrapBorder: false });

    for (let ty = 0; ty < 5; ty++) {
      for (let tx = 0; tx < 5; tx++) {
        expect(incr.getTileAt(tx, ty)?.localTileId).toBe(full.getTileAt(tx, ty)?.localTileId);
      }
    }
  });

  it('only touches the 3×3 neighbourhood (does not bump the whole layer)', () => {
    const ts = makeTileset256();
    const layer = makeLayer(ts, 5, 5);
    const wangSet = new WangSet({ blobMap: identityBlobMap(), tilesetIndex: 0, type: 'blob' });

    // A lone cell far from the edit must be untouched by refreshCell.
    setTile(layer, ts, 0, 0, 0);
    autoTile(layer, wangSet, { wrapBorder: false });
    const farBefore = layer.getTileAt(0, 0)?.localTileId;
    const revBefore = layer.revision;

    // Paint + refresh in the opposite corner.
    setTile(layer, ts, 4, 4, 0);
    refreshCell(layer, 4, 4, wangSet, { wrapBorder: false });

    // The far cell is unchanged, and revision advanced by only a small amount
    // (the refreshed cell, not a whole-layer rewrite).
    expect(layer.getTileAt(0, 0)?.localTileId).toBe(farBefore);
    expect(layer.revision).toBeGreaterThan(revBefore);
  });
});
