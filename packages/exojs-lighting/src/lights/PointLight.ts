import { Light, type LightOptions } from './Light';

/** Construction options for {@link PointLight}. Every field is also mutable afterwards. */
export interface PointLightOptions extends LightOptions {
  /** Distance in pixels at which the light contributes nothing. Defaults to `256`. */
  readonly radius?: number;
  /**
   * Height above the sprite plane, in pixels. Drives how grazing the light
   * direction is: small values rake across the surface and exaggerate a normal
   * map, large values flatten it out. Defaults to `64`.
   */
  readonly height?: number;
}

/**
 * A point light: equal in every direction, falling off quadratically to nothing
 * at {@link radius}.
 *
 * ```ts
 * player.addChild(new PointLight({ radius: 260, color: Color.amber, intensity: 1.4 }));
 * ```
 */
export class PointLight extends Light {
  /** Distance in pixels at which the light contributes nothing. */
  public radius: number;
  /** Height above the sprite plane, in pixels. */
  public height: number;

  public constructor(options: PointLightOptions = {}) {
    super(options);

    this.radius = options.radius ?? 256;
    this.height = options.height ?? 64;
  }
}
