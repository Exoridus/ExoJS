import { Light, type LightOptions } from './Light';

/** Construction options for {@link SunLight}. Every field is also mutable afterwards. */
export interface SunLightOptions extends LightOptions {
  /**
   * Height above the sprite plane, as a fraction of the distance light travels
   * across it - so it is a slope rather than a length, which is the only thing
   * a source at no particular distance can mean. `0` rakes along the plane and
   * large values light it from straight above. Defaults to `1`.
   */
  readonly height?: number;
}

/**
 * Light with a direction and no position: a sun, a moon, a distant floodlight.
 * It reaches everything the camera can see, falls off nowhere, and its shadows
 * are parallel.
 *
 * ```ts
 * scene.addChild(new SunLight({ intensity: 0.8 })).setRotation(-35);
 * ```
 *
 * It travels along the node's own rotation, like every other light's axis, so
 * turning the sun is rotating it - and a sun parented to the world rotates a
 * whole day with one tween.
 *
 * # Shadows
 *
 * A sun's shadow map is a LINE, not a circle. There is no centre to measure
 * angles from, so instead of an angular bin per direction it has one bin per
 * strip across the light's direction, holding how far along the light the
 * nearest occluder in that strip sits. The strips span the region the
 * registered occluder sources were collected for, which is the visible world.
 *
 * Because the shape has no radius, {@link LightOptions.softness} widens the
 * penumbra in strips rather than in degrees - the same knob, a different unit.
 */
export class SunLight extends Light {
  /** Height above the sprite plane, as a slope. See {@link SunLightOptions.height}. */
  public height: number;

  public constructor(options: SunLightOptions = {}) {
    super(options);

    this.height = options.height ?? 1;
  }
}
