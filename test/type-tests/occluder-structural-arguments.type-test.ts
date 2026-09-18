// The occluder factories take structurally typed arguments so that
// `@codexo/exojs-lighting` depends on neither `@codexo/exojs-physics` nor
// `@codexo/exojs-tilemap`. That is a claim about two packages it cannot import,
// so nothing inside it can check it: the assertion belongs here, where all
// three surfaces are visible at once.
//
// A failure means a shape one of those packages exposes has moved and the
// one-way dependency has quietly stopped being usable - a project would have to
// adapt by hand, which is the thing the structural typing exists to avoid.

import type { Mesh, Sprite, Video } from '@codexo/exojs';
import {
  AlphaOccluder,
  type AlphaOccluderDrawable,
  MeshOccluder,
  type OccluderMesh,
  type OccluderPhysicsWorld,
  type OccluderTileLayer,
  PhysicsOccluder,
  TilemapOccluder,
} from '@codexo/exojs-lighting';
import type { PhysicsWorld } from '@codexo/exojs-physics';
import type { ResolvedTile, TileLayer } from '@codexo/exojs-tilemap';

declare const world: PhysicsWorld;
declare const layer: TileLayer;
declare const sprite: Sprite;
declare const mesh: Mesh;
declare const video: Video;

const takesPhysicsWorld = (value: OccluderPhysicsWorld): OccluderPhysicsWorld => value;
const takesTileLayer = (value: OccluderTileLayer<ResolvedTile>): OccluderTileLayer<ResolvedTile> => value;

const takesAlphaDrawable = (value: AlphaOccluderDrawable): AlphaOccluderDrawable => value;
const takesMesh = (value: OccluderMesh): OccluderMesh => value;

takesPhysicsWorld(world);
takesTileLayer(layer);
// Core's own drawables, which is what lets one argument stand in for a
// texture, an anchor and a transform.
takesAlphaDrawable(sprite);
// A video is a sprite over a live texture, so it needs no separate path - it
// traces whichever frame was decoded when the source was built.
takesAlphaDrawable(video);
takesMesh(mesh);

// The factories themselves, as a caller writes them.
new PhysicsOccluder(world, { staticOnly: true });
new TilemapOccluder(layer);

// `solid` infers the layer's own tile type, so a predicate can read a tile
// definition without a cast.
new TilemapOccluder(layer, { solid: tile => tile.tileset.getTileDefinition(tile.localTileId)?.collision !== undefined });
new AlphaOccluder(sprite);
new MeshOccluder(mesh);
