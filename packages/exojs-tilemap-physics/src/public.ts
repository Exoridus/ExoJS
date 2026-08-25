// Side-effect-free public API for @codexo/exojs-tilemap-physics.
// Importing this entry performs no registration: the bridge is constructed
// directly against a PhysicsWorld and a tilemap layer.

export type { ObjectCollider, ObjectColliderOptions } from './objectLayer';
export { buildObjectLayerColliders } from './objectLayer';
export type { TileColliderOptions } from './TileColliderStreamer';
export { TileColliderStreamer } from './TileColliderStreamer';
export type { ColliderDefaults, TileColliderContext, TileColliderMaterial, TileColliderMaterialResolver, TileRegionMode } from './types';
