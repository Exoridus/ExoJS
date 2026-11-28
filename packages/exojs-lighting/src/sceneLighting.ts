import type { Component, SystemClass } from '@codexo/exojs';

import type { Lighting } from './Lighting';

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
 * @internal
 */
export const sceneLighting = (member: Component): Lighting | null => {
  const scene = member.scene;

  if (scene === null) {
    return null;
  }

  const local = scene.systems.findAll(LightingSystem);

  const candidates = local.length > 0 ? local : scene.app.systems.findAll(LightingSystem);

  return candidates.length === 1 ? (candidates[0] ?? null) : null;
};
