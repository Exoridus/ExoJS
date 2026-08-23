import type { CollisionFilter } from '@codexo/exojs-physics';
import type { TileMapObject } from '@codexo/exojs-tilemap';

/**
 * How a run of solid whole-cell tiles is turned into colliders.
 *
 * `'boxes'` keeps the merged rectangles as solid `BoxShape` colliders: the
 * region has an interior, so point queries, overlaps and sensors behave, and a
 * body that starts inside solid tiles is pushed out. Adjacent rectangles share
 * an internal edge, which a body sliding across can catch on.
 *
 * `'outline'` traces the boundary of each solid region into closed one-sided
 * chains. Nothing is left to catch on inside a region, which is what a
 * side-scroller wants, but the region has no interior: queries inside it find
 * nothing and a body spawned inside it falls through.
 */
export type TileRegionMode = 'boxes' | 'outline';

/** Collider settings a {@link TileColliderMaterialResolver} may override. */
export interface TileColliderMaterial {
  friction?: number;
  restitution?: number;
  density?: number;
  isSensor?: boolean;
  filter?: Partial<CollisionFilter>;
}

/** What a {@link TileColliderMaterialResolver} is asked about. */
export interface TileColliderContext {
  /**
   * The class/type string of the source geometry: the shared `type` of a merged
   * region, or the source object's own. Empty when the source carries none.
   */
  readonly type: string;
  /**
   * The source object, or `null` for a merged whole-cell region - a merged run
   * spans many tiles and has no single originating object.
   */
  readonly object: TileMapObject | null;
  /**
   * Tile column the geometry came from; the top-left cell of a merged region.
   * Absent for object-layer objects, which are not placed on the tile grid.
   */
  readonly tx?: number;
  /** Tile row, under the same rule as {@link tx}. */
  readonly ty?: number;
}

/**
 * Per-object collider settings, merged over the call-level defaults. Return
 * `null` to accept the defaults unchanged.
 *
 * Called only while a chunk is being built or rebuilt, never during a
 * no-change {@link import('./TileColliderStreamer').TileColliderStreamer.sync}.
 * It is a build-time mapping, not a live rule: changing what the resolver
 * would return has no effect until the layer itself changes.
 */
export type TileColliderMaterialResolver = (context: TileColliderContext) => TileColliderMaterial | null;

/** Collider settings shared by every generated collider unless overridden. */
export interface ColliderDefaults {
  /** Coulomb friction. Default `0.6`. */
  friction?: number;
  /** Restitution / bounciness in `[0, 1]`. Default `0`. */
  restitution?: number;
  /** Density; irrelevant while the bodies are static. Default `1`. */
  density?: number;
  /** Generate overlap events instead of contact response. Default `false`. */
  isSensor?: boolean;
  /** Category/mask/group filter; partials merge over the physics defaults. */
  filter?: Partial<CollisionFilter>;
  /** Per-object override of any of the above. */
  material?: TileColliderMaterialResolver;
}
