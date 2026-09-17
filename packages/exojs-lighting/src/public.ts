// Side-effect-free public API for @codexo/exojs-lighting.
// Importing this entry performs no registration: a Lighting system is
// constructed directly and added to the system registry that should tick it.

export type { LightingDebugView, LightingOptions, LightingQuality, LightingQualityOption } from './Lighting';
export { Lighting } from './Lighting';
export type { LightOptions } from './lights/Light';
export { Light } from './lights/Light';
export type { LineLightOptions } from './lights/LineLight';
export { LineLight } from './lights/LineLight';
export type { PointLightOptions } from './lights/PointLight';
export { PointLight } from './lights/PointLight';
export type { SpotLightOptions } from './lights/SpotLight';
export { SpotLight } from './lights/SpotLight';
export type { LitMaterialOptions } from './LitMaterial';
export { LitMaterial } from './LitMaterial';
export type { DeriveNormalsOptions } from './normals/deriveNormals';
export type { NormalSource } from './normals/Normals';
export { normalMap, Normals, normalsFromAlpha } from './normals/Normals';
export type { NormalSurface, NormalSurfaceDrawable } from './normals/NormalSurface';
export type { AlphaOccluderDrawable, AlphaOccluderOptions } from './occluders/alphaTrace';
export { fromAlpha as alphaOccluder } from './occluders/fromAlpha';
export type { MeshOccluderOptions, OccluderMesh } from './occluders/fromMesh';
export { fromMesh as meshOccluder } from './occluders/fromMesh';
export type { OccluderCollider, OccluderColliderShape, OccluderColliderTransform, OccluderPhysicsWorld, PhysicsOccluderOptions } from './occluders/fromPhysics';
export { fromPhysics as physicsOccluder } from './occluders/fromPhysics';
export type { PolygonOccluderOptions } from './occluders/fromPolygon';
export { fromPolygon as polygonOccluder } from './occluders/fromPolygon';
export type { OccluderTileCell, OccluderTileLayer, TilemapOccluderOptions } from './occluders/fromTilemap';
export { fromTilemap as tilemapOccluder } from './occluders/fromTilemap';
export type { OccluderPlacement } from './occluders/OccluderPlacement';
export { Occluders } from './occluders/Occluders';
export type { OccluderSink, OccluderSource } from './occluders/OccluderSource';
