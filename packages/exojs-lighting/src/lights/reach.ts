import type { Light } from './Light';
import { PointLight } from './PointLight';
import { SpotLight } from './SpotLight';

/**
 * How far a light reaches, in world pixels, or `0` for a shape the renderers
 * cannot express yet.
 *
 * A light shape the caller can build but a renderer cannot place contributes
 * nothing rather than shading wrongly, and the reach is also the radius of the
 * region its occluders are collected for.
 * @internal
 */
export const lightRadius = (light: Light): number => {
  if (light instanceof PointLight || light instanceof SpotLight) {
    return light.radius;
  }

  return 0;
};

/**
 * How high above the sprite plane a light sits, which is what decides how
 * grazing its direction is. `0` for a shape without a height.
 * @internal
 */
export const lightHeight = (light: Light): number => {
  if (light instanceof PointLight || light instanceof SpotLight) {
    return light.height;
  }

  return 0;
};
