// Side-effect-free public API for @codexo/exojs-lighting.
// Importing this entry performs no registration: a LightingSystem is
// constructed directly and added to the system registry that should tick it.

export type { LightingSystemOptions } from './LightingSystem';
export { LightingSystem } from './LightingSystem';
export type { LitSpriteMaterialOptions } from './LitSpriteMaterial';
export { LitSpriteMaterial } from './LitSpriteMaterial';
export type { PointLightOptions } from './PointLight';
export { PointLight } from './PointLight';
