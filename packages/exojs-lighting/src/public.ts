// Side-effect-free public API for @codexo/exojs-lighting.
// Importing this entry performs no registration: a Lighting system is
// constructed directly and added to the system registry that should tick it.

export type { LightingRenderer, RadianceOptions } from './backends/radiance';
export { radiance } from './backends/radiance';
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
export type { SunLightOptions } from './lights/SunLight';
export { SunLight } from './lights/SunLight';
export type { LitMaterialOptions } from './LitMaterial';
export { LitMaterial } from './LitMaterial';
export { AlphaNormals } from './normals/AlphaNormals';
export type { DeriveNormalsOptions } from './normals/deriveNormals';
export type { NormalMapOptions } from './normals/NormalMap';
export { NormalMap } from './normals/NormalMap';
export type { NormalConvention, NormalSource } from './normals/NormalSource';
export type { NormalSurface, NormalSurfaceDrawable } from './normals/NormalSurface';
export { AlphaOccluder } from './occluders/AlphaOccluder';
export type { AlphaOccluderDrawable, AlphaOccluderOptions } from './occluders/alphaTrace';
export type { MeshOccluderOptions, OccluderMesh } from './occluders/MeshOccluder';
export { MeshOccluder } from './occluders/MeshOccluder';
export type { OccluderPlacement } from './occluders/OccluderPlacement';
export type { OccluderDrawable, OccluderSink, OccluderSource } from './occluders/OccluderSource';
export type {
  OccluderCollider,
  OccluderColliderShape,
  OccluderColliderTransform,
  OccluderPhysicsWorld,
  PhysicsOccluderOptions,
} from './occluders/PhysicsOccluder';
export { PhysicsOccluder } from './occluders/PhysicsOccluder';
export type { PolygonOccluderOptions } from './occluders/PolygonOccluder';
export { PolygonOccluder } from './occluders/PolygonOccluder';
export type { OccluderTileCell, OccluderTileLayer, TilemapOccluderOptions } from './occluders/TilemapOccluder';
export { TilemapOccluder } from './occluders/TilemapOccluder';
