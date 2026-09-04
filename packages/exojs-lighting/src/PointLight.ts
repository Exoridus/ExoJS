import { Color } from '@codexo/exojs';

/** Construction options for {@link PointLight}. Every field is also mutable afterwards. */
export interface PointLightOptions {
  /** World-space x, in pixels. */
  readonly x?: number;
  /** World-space y, in pixels. */
  readonly y?: number;
  /** Distance in pixels at which the light contributes nothing. Defaults to `256`. */
  readonly radius?: number;
  /**
   * Light colour. The instance is stored by reference, so mutating it after
   * construction is picked up on the next {@link LightingSystem.commit}.
   * Defaults to opaque white; alpha is ignored.
   */
  readonly color?: Color;
  /** Linear brightness multiplier. Defaults to `1`. */
  readonly intensity?: number;
  /**
   * Height above the sprite plane, in pixels. Drives how grazing the light
   * direction is: small values rake across the surface and exaggerate the
   * normal map, large values flatten it out. Defaults to `64`.
   */
  readonly height?: number;
}

/**
 * A world-space point light.
 *
 * Plain mutable data - no scene node, no transform, no parenting. Move one by
 * assigning {@link x}/{@link y} (or through {@link setPosition}) and the change
 * takes effect on the next {@link LightingSystem.commit}. A light contributes
 * to shading only while it is registered with a {@link LightingSystem}.
 */
export class PointLight {
  public x: number;
  public y: number;
  public radius: number;
  public color: Color;
  public intensity: number;
  public height: number;

  public constructor(options: PointLightOptions = {}) {
    this.x = options.x ?? 0;
    this.y = options.y ?? 0;
    this.radius = options.radius ?? 256;
    // Not `Color.white`: that is a shared frozen-by-convention singleton, and a
    // light whose colour is mutated would recolour every other default light.
    this.color = options.color ?? new Color(255, 255, 255);
    this.intensity = options.intensity ?? 1;
    this.height = options.height ?? 64;
  }

  /** Move the light, returning `this` for chaining. */
  public setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;

    return this;
  }
}
