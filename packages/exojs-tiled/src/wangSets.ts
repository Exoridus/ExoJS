import { WangSet } from '@codexo/exojs-tilemap';

import type { TiledWangSetData } from './data';

/**
 * Best-effort conversion of a {@link TiledWangSetData} to a runtime
 * {@link WangSet} from `@codexo/exojs-tilemap`.
 *
 * ## Supported types
 *
 * - **`'corner'`** — Maps the four corner positions of each `wangtile` to the
 *   four corner bits of the 8-bit blob mask and returns a `WangSet` of type
 *   `'blob'`. Only color index `> 0` in the Tiled wangid is treated as "this
 *   terrain"; color index `0` means unset (not this terrain).
 *
 *   Tiled corner wangid position → WangSet blob bit mapping:
 *   - `wangid[7]` (top-left)     → bit 0 (value 1)
 *   - `wangid[1]` (top-right)    → bit 2 (value 4)
 *   - `wangid[5]` (bottom-left)  → bit 5 (value 32)
 *   - `wangid[3]` (bottom-right) → bit 7 (value 128)
 *
 *   This is a best-effort conversion accurate for the common **single-color**
 *   corner terrain (blob-style). Multi-color terrains are accepted but only
 *   the presence/absence of any color (> 0 = set) is used; which specific
 *   color is set is ignored.
 *
 * - **`'edge'`** — Maps the four edge positions to the 4-bit edge mask and
 *   returns a `WangSet` of type `'edge'`.
 *
 *   Tiled edge wangid position → WangSet edge bit mapping:
 *   - `wangid[0]` (top)    → bit 0 (value 1)
 *   - `wangid[2]` (right)  → bit 1 (value 2)
 *   - `wangid[4]` (bottom) → bit 2 (value 4)
 *   - `wangid[6]` (left)   → bit 3 (value 8)
 *
 * - **`'mixed'` / unknown** — Returns `null`; mixed wangsets interleave corner
 *   and edge semantics in a way that cannot be faithfully represented by
 *   a single blob or edge mask without additional heuristics.
 *
 * @param wangSet  The raw {@link TiledWangSetData} parsed from a `.tsj` file.
 * @param tilesetIndex  The index of the owning tileset within the layer's
 *   tileset list (forwarded to {@link WangSet} as-is).
 * @returns A {@link WangSet}, or `null` when the wangset type is unsupported.
 */
export function tiledWangSetToWangSet(wangSet: TiledWangSetData, tilesetIndex: number): WangSet | null {
  if (wangSet.type === 'corner') {
    return convertCornerWangSet(wangSet, tilesetIndex);
  }

  if (wangSet.type === 'edge') {
    return convertEdgeWangSet(wangSet, tilesetIndex);
  }

  // 'mixed' or any unknown type cannot be faithfully mapped.
  return null;
}

// ── Corner → blob ─────────────────────────────────────────────────────────────
//
// Tiled corner wangid positions (indices into the 8-element wangid array):
// Index order: [top(0), topright(1), right(2), bottomright(3), bottom(4), bottomleft(5), left(6), topleft(7)]
//
// WangSet blob bitmask values (bit layout: bit0=TL, bit1=T, bit2=TR, bit3=L, bit4=R, bit5=BL, bit6=B, bit7=BR):
//   topleft     → wangid[7] → blob bit 0 (value   1)
//   topright    → wangid[1] → blob bit 2 (value   4)
//   bottomleft  → wangid[5] → blob bit 5 (value  32)
//   bottomright → wangid[3] → blob bit 7 (value 128)

const cornerIndexTopLeft = 7;
const cornerIndexTopRight = 1;
const cornerIndexBottomRight = 3;
const cornerIndexBottomLeft = 5;

const blobBitTopLeft = 1; // bit 0
const blobBitTopRight = 4; // bit 2
const blobBitBottomLeft = 32; // bit 5
const blobBitBottomRight = 128; // bit 7

function convertCornerWangSet(wangSet: TiledWangSetData, tilesetIndex: number): WangSet {
  const blobMap = new Map<number, number>();

  for (const wangTile of wangSet.wangtiles) {
    const id = wangTile.wangid;
    let mask = 0;

    if ((id[cornerIndexTopLeft] ?? 0) > 0) mask |= blobBitTopLeft;
    if ((id[cornerIndexTopRight] ?? 0) > 0) mask |= blobBitTopRight;
    if ((id[cornerIndexBottomLeft] ?? 0) > 0) mask |= blobBitBottomLeft;
    if ((id[cornerIndexBottomRight] ?? 0) > 0) mask |= blobBitBottomRight;

    // Last writer wins when two wangtiles produce the same mask
    // (shouldn't happen in well-formed data, but be lenient).
    blobMap.set(mask, wangTile.tileid);
  }

  return new WangSet({ tilesetIndex, blobMap, type: 'blob' });
}

// ── Edge → edge ───────────────────────────────────────────────────────────────
//
// Tiled edge wangid positions:
// Index order: [top(0), topright(1), right(2), bottomright(3), bottom(4), bottomleft(5), left(6), topleft(7)]
//
// WangSet edge bitmask values (bit layout: bit0=T, bit1=R, bit2=B, bit3=L):
//   top    → wangid[0] → edge bit 0 (value 1)
//   right  → wangid[2] → edge bit 1 (value 2)
//   bottom → wangid[4] → edge bit 2 (value 4)
//   left   → wangid[6] → edge bit 3 (value 8)

const edgeIndexTop = 0;
const edgeIndexRight = 2;
const edgeIndexBottom = 4;
const edgeIndexLeft = 6;

const edgeBitTop = 1; // bit 0
const edgeBitRight = 2; // bit 1
const edgeBitBottom = 4; // bit 2
const edgeBitLeft = 8; // bit 3

function convertEdgeWangSet(wangSet: TiledWangSetData, tilesetIndex: number): WangSet {
  const blobMap = new Map<number, number>();

  for (const wangTile of wangSet.wangtiles) {
    const id = wangTile.wangid;
    let mask = 0;

    if ((id[edgeIndexTop] ?? 0) > 0) mask |= edgeBitTop;
    if ((id[edgeIndexRight] ?? 0) > 0) mask |= edgeBitRight;
    if ((id[edgeIndexBottom] ?? 0) > 0) mask |= edgeBitBottom;
    if ((id[edgeIndexLeft] ?? 0) > 0) mask |= edgeBitLeft;

    blobMap.set(mask, wangTile.tileid);
  }

  return new WangSet({ tilesetIndex, blobMap, type: 'edge' });
}
