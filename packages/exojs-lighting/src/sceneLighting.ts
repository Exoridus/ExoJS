import type { Component, ComponentClass, SystemClass } from '@codexo/exojs';

import type { Lighting } from './Lighting';
import type { OccluderComponent } from './occluders/OccluderComponent';

/** Carried by every {@link Lighting}; lets scene members find one without importing the class and every light shape with it. @internal */
export const lightingBrand: unique symbol = Symbol('exojs-lighting');

const LightingSystem = {
  [Symbol.hasInstance]: (value: unknown): boolean => typeof value === 'object' && value !== null && lightingBrand in value,
} as unknown as SystemClass<Lighting>;

/**
 * The lighting system a scene member joins on its own: the only one registered
 * with its scene's systems, or else the only one in the application's. `null`
 * when there is none, and when there are several - choosing between them is
 * the caller's decision, made with `Lighting.add` or `Lighting.occludeFrom`.
 * `excluded` does not count, for a system that is leaving its registry.
 * @internal
 */
export const sceneLighting = (member: Component, excluded: Lighting | null = null): Lighting | null => {
  const scene = member.scene;

  if (scene === null) {
    return null;
  }

  const local = without(scene.systems.findAll(LightingSystem), excluded);
  const candidates = local.length > 0 ? local : without(scene.app.systems.findAll(LightingSystem), excluded);

  return candidates.length === 1 ? (candidates[0] ?? null) : null;
};

const without = (systems: Lighting[], excluded: Lighting | null): Lighting[] =>
  excluded === null ? systems : systems.filter(system => system !== excluded);

let occluderComponentClass: ComponentClass<OccluderComponent> | null = null;

/**
 * Set by the `OccluderComponent` module when it loads, so a lighting system can
 * look its instances up without importing it - and every occluder source with
 * it - into renderers that never use one. Until then no such component exists.
 * @internal
 */
export const provideOccluderComponent = (type: ComponentClass<OccluderComponent>): void => {
  occluderComponentClass = type;
};

/** @internal */
export const sceneOccluderComponent = (): ComponentClass<OccluderComponent> | null => occluderComponentClass;
