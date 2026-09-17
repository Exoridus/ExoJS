// Side-effect-free public API for @codexo/exojs-lighting.
// Importing this entry performs no registration: a Lighting system is
// constructed directly and added to the system registry that should tick it.

export type { LightingDebugView, LightingOptions, LightingQuality } from './Lighting';
export { Lighting } from './Lighting';
export type { LightOptions } from './lights/Light';
export { Light } from './lights/Light';
export type { PointLightOptions } from './lights/PointLight';
export { PointLight } from './lights/PointLight';
export type { SpotLightOptions } from './lights/SpotLight';
export { SpotLight } from './lights/SpotLight';
export type { LitMaterialOptions } from './LitMaterial';
export { LitMaterial } from './LitMaterial';
export type { NormalSource } from './normals/Normals';
export { Normals } from './normals/Normals';
