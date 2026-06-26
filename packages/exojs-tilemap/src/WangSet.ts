/**
 * Options for constructing a {@link WangSet}.
 */
export interface WangSetOptions {
  /** Which TileSet contains the Wang tiles (index into the layer's tilesets array). */
  tilesetIndex: number;
  /**
   * Map from Wang bitmask to local tile ID within the tileset.
   *
   * For blob mode (8-neighbor), keys are 0–255; the 47 valid combinations
   * of the blob encoding must be covered at minimum.
   * For edge mode (4-neighbor), keys are 0–15.
   *
   * Accepts either a {@link ReadonlyMap} or a plain `Record<number, number>`.
   */
  blobMap: ReadonlyMap<number, number> | Record<number, number>;
  /** Whether this is a blob (8-neighbor, default) or edge (4-neighbor) Wang set. */
  type?: 'blob' | 'edge';
  /**
   * Extra local tile IDs that count as belonging to this Wang group, beyond
   * the variant IDs already present as {@link blobMap} *values*.
   *
   * Membership is what {@link autoTile} / `refreshCell` use to decide whether a
   * neighbouring cell is "part of the terrain". Because every value in
   * `blobMap` is itself a member, group membership stays stable no matter which
   * variant a cell currently shows — that is what makes incremental
   * `refreshCell` correct. Add the *base* tile ID you paint with here if it is
   * not already one of the blobMap variants.
   */
  members?: Iterable<number>;
}

/**
 * Describes a Wang autotile set: a mapping from a neighbor bitmask to a
 * local tile ID within a specific tileset.
 *
 * Blob bitmask bit layout (powers of 2):
 * - Bit 0 (1):   Top-left
 * - Bit 1 (2):   Top
 * - Bit 2 (4):   Top-right
 * - Bit 3 (8):   Left
 * - Bit 4 (16):  Right
 * - Bit 5 (32):  Bottom-left
 * - Bit 6 (64):  Bottom
 * - Bit 7 (128): Bottom-right
 *
 * Diagonal (corner) bits are only set when both adjacent cardinal directions
 * are also set — reducing 256 raw combinations to 47 meaningful blob states.
 *
 * Edge bitmask bit layout:
 * - Bit 0 (1): Top
 * - Bit 1 (2): Right
 * - Bit 2 (4): Bottom
 * - Bit 3 (8): Left
 */
export class WangSet {
  /** Index of the tileset that contains the Wang tiles. */
  public readonly tilesetIndex: number;

  /** The Wang mode: `'blob'` (8-neighbor) or `'edge'` (4-neighbor). */
  public readonly type: 'blob' | 'edge';

  private readonly _map: ReadonlyMap<number, number>;
  private readonly _members: ReadonlySet<number>;

  public constructor(options: WangSetOptions) {
    this.tilesetIndex = options.tilesetIndex;
    this.type = options.type ?? 'blob';

    if (options.blobMap instanceof Map) {
      this._map = options.blobMap;
    } else {
      const map = new Map<number, number>();
      for (const [k, v] of Object.entries(options.blobMap as Record<string, number>)) {
        map.set(Number(k), v);
      }
      this._map = map;
    }

    // Members default to every variant tile ID the set can produce, so that any
    // autotiled variant is recognised as part of the group (variant-stable
    // membership). Explicit `members` (e.g. the base paint ID) are added on top.
    const members = new Set<number>(this._map.values());
    if (options.members) {
      for (const id of options.members) members.add(id);
    }
    this._members = members;
  }

  /**
   * Look up the local tile ID for a given neighbor bitmask.
   * Returns `undefined` if the mask has no mapping in this set.
   */
  public getTileId(mask: number): number | undefined {
    return this._map.get(mask);
  }

  /**
   * Whether a local tile ID belongs to this Wang group. True for every variant
   * the set produces plus any explicit {@link WangSetOptions.members}. Used as
   * the default, variant-stable neighbour-membership test by {@link autoTile}
   * and `refreshCell`.
   */
  public isMember(localTileId: number): boolean {
    return this._members.has(localTileId);
  }

  /** Read-only view of the full bitmask → tile-ID mapping. */
  public get blobMap(): ReadonlyMap<number, number> {
    return this._map;
  }

  /** Read-only view of the local tile IDs that count as group members. */
  public get members(): ReadonlySet<number> {
    return this._members;
  }
}
