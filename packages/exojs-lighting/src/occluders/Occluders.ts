import type { PointLike, Texture } from '@codexo/exojs';

import type { AlphaOccluderDrawable, AlphaOccluderOptions } from './alphaTrace';
import { fromAlpha } from './fromAlpha';
import { fromMesh, type MeshOccluderOptions, type OccluderMesh } from './fromMesh';
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
 *
 * Every entry is also exported under its own name - `physicsOccluder`,
 * `tilemapOccluder`, `alphaOccluder`, `meshOccluder`, `polygonOccluder`. The
 * two spellings do the same thing, and only the named one lets a bundler drop
 * what you did not use: reaching one property of this object keeps the whole
 * object, and with it the marching-squares tracer and the tile boundary walker
 * a physics-only project never runs. Reach for the named form when the bundle
 * matters, and for this one when discoverability does.
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
   * lighting.occludeFrom(Occluders.fromAlpha(tree));
   * ```
   *
   * Pass the drawable and it supplies everything: its texture, the frame of it
   * that it shows - so a sprite from an atlas outlines itself rather than the
   * whole page - its own box, and its transform, which already carries the
   * anchor. Pass a bare texture instead and the whole of it is traced, placed
   * by `node`.
   *
   * The alpha channel is traced and simplified per distinct frame, on first
   * sight and then never again, so an animation costs one trace per frame OF
   * THE CLIP rather than one per rendered frame - and the outline follows the
   * clip instead of freezing on whichever frame was showing at construction.
   * What runs every rendered frame is a comparison and the transform.
   *
   * That leaves two cases with no outline rather than a wrong one, both
   * reported on the `Occluders` log source in a development build. A render
   * target has no pixels this side of the GPU and can never be traced. A
   * texture that is not readable yet - still loading, or tainted by a
   * cross-origin image - is retried on the next frame rather than cached.
   *
   * The outline follows the art, which is not always the shadow you want - a
   * tree casts the shadow of its trunk, not of its canopy. Reach for
   * {@link Occluders.fromPolygon} where they differ.
   */
  fromAlpha: (source: Texture | AlphaOccluderDrawable, options?: AlphaOccluderOptions): OccluderSource => fromAlpha(source, options),

  /**
   * Shadows from a triangle mesh's own silhouette.
   *
   * ```ts
   * lighting.occludeFrom(Occluders.fromMesh(platform));
   * ```
   *
   * Only edges one triangle owns are kept: an edge two triangles share is
   * interior and casts no shadow anybody can see, and a tessellated shape has
   * far more of those than of the other kind. Holes come back as outlines of
   * their own, so a ring shadows like a ring.
   *
   * The outline is extracted once. The mesh places it, so moving or rotating
   * it moves its shadow; deforming its vertices afterwards does not, and wants
   * a fresh source.
   */
  fromMesh: (mesh: OccluderMesh, options?: MeshOccluderOptions): OccluderSource => fromMesh(mesh, options),

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
