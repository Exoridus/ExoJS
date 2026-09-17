import type { Light } from './Light';
import { LineLight } from './LineLight';
import { PointLight } from './PointLight';
import { SpotLight } from './SpotLight';

/**
 * How far a light's falloff reaches from whatever emits, in world pixels, or
 * `0` for a shape the renderers cannot express yet.
 *
 * For a point or cone light this is the whole reach. For a line light it is the
 * distance from the SEGMENT, which is why it and {@link lightRadius} differ.
 * @internal
 */
export const lightFalloff = (light: Light): number => {
  if (light instanceof PointLight || light instanceof SpotLight || light instanceof LineLight) {
    return light.radius;
  }

  return 0;
};

/**
 * Half the length of a light's emitting segment, in world pixels. `0` for a
 * shape that emits from a point, which is what makes the capsule falloff
 * collapse to a disc for every other light.
 * @internal
 */
export const lightHalfLength = (light: Light): number => (light instanceof LineLight ? Math.max(0, light.length) / 2 : 0);

/**
 * How far a light reaches from its own position, in world pixels, or `0` for a
 * shape the renderers cannot express yet.
 *
 * A light shape the caller can build but a renderer cannot place contributes
 * nothing rather than shading wrongly, and the reach is also the radius of the
 * region its occluders are collected for.
 * @internal
 */
export const lightRadius = (light: Light): number => {
  const falloff = lightFalloff(light);

  return falloff <= 0 ? 0 : falloff + lightHalfLength(light);
};

/**
 * How high above the sprite plane a light sits, which is what decides how
 * grazing its direction is. `0` for a shape without a height.
 * @internal
 */
export const lightHeight = (light: Light): number => {
  if (light instanceof PointLight || light instanceof SpotLight || light instanceof LineLight) {
    return light.height;
  }

  return 0;
};
