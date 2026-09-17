import type { PointLike, Texture } from '@codexo/exojs';

import { type AlphaOccluderOptions, fromAlpha } from './fromAlpha';
import { fromPhysics, type OccluderPhysicsWorld, type PhysicsOccluderOptions } from './fromPhysics';
import { fromPolygon, type PolygonOccluderOptions } from './fromPolygon';
import { fromTilemap, type OccluderTileLayer, type TilemapOccluderOptions } from './fromTilemap';
import type { OccluderSource } from './OccluderSource';

/**
 * Ready-made {@link OccluderSource}s over the descriptions of the world a
 * project already has.
 *
 * The work in 2D shadows is data entry, not rendering: engines that ask for a
 * silhouette per object mostly ship without shadows, because the bookkeeping
 * is not worth it. A project with colliders or a tile layer has described its
 * walls once already, and these read the shadows out of that description.
 *
 * Each of these is an ordinary implementation of {@link OccluderSource} with
 * no privilege over one you write. A source is registered with
 * {@link Lighting.occludeFrom} and contributes until it is removed.
 */
export const Occluders = {
  /**
   * Shadows from physics colliders.
   *
   * ```ts
   * lighting.occludeFrom(Occluders.fromPhysics(world));
   * ```
   *
   * Static colliders only by default, and never sensors. The world is queried
   * per frame for the region the lights reach, so a body that moves casts a
   * shadow that moves with it, at the cost of rebuilding the field.
   *
   * Circles and capsules are approximated by their outline; polygons,
   * segments and chains are exact.
   */
  fromPhysics: (world: OccluderPhysicsWorld, options?: PhysicsOccluderOptions): OccluderSource => fromPhysics(world, options),

  /**
   * Shadows from the occupied cells of a tile layer.
   *
   * ```ts
   * lighting.occludeFrom(Occluders.fromTilemap(tilemap.layer('walls')));
   * ```
   *
   * Only the boundary between occupied and empty cells is emitted, and runs of
   * it are merged, so a corridor costs a handful of segments rather than one
   * per tile. Outlines are cached per block of cells and rebuilt when the
   * layer's revision changes, which is what lets a streamed map bring its
   * shadows in with its chunks.
   *
   * Every tile in the layer blocks light unless `solid` says otherwise, which
   * suits a layer dedicated to walls.
   */
  fromTilemap: <Tile>(layer: OccluderTileLayer<Tile>, options?: TilemapOccluderOptions<Tile>): OccluderSource => fromTilemap(layer, options),

  /**
   * Shadows from a texture's own silhouette, traced once.
   *
   * ```ts
   * lighting.occludeFrom(Occluders.fromAlpha(tree.texture, { node: tree, anchor: tree.anchor }));
   * ```
   *
   * The alpha channel is traced and simplified when this is called, never per
   * frame; what runs per frame is the node transform, so a moving carrier is
   * free. A texture that is still loading traces to nothing rather than
   * waiting, so call it once the texture is ready.
   *
   * The outline follows the art, which is not always the shadow you want - a
   * tree casts the shadow of its trunk, not of its canopy. Reach for
   * {@link Occluders.fromPolygon} where they differ.
   */
  fromAlpha: (texture: Texture, options?: AlphaOccluderOptions): OccluderSource => fromAlpha(texture, options),

  /**
   * Shadows from an outline of your own, in world space or local to a node.
   *
   * ```ts
   * lighting.occludeFrom(Occluders.fromPolygon(trunk, { node: tree }));
   * ```
   *
   * The escape hatch, and the right answer whenever the shadow silhouette is
   * not the drawn one.
   */
  fromPolygon: (points: ReadonlyArray<Readonly<PointLike>>, options?: PolygonOccluderOptions): OccluderSource => fromPolygon(points, options),
} as const;
