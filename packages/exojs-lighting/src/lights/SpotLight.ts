import { Light, type LightOptions } from './Light';

/** Construction options for {@link SpotLight}. Every field is also mutable afterwards. */
export interface SpotLightOptions extends LightOptions {
  /** Distance in pixels at which the light contributes nothing. Defaults to `320`. */
  readonly radius?: number;
  /** Half-angle of the cone in DEGREES, measured from its axis. Defaults to `30`. */
  readonly angle?: number;
  /**
   * How far the cone fades at its edge, as a fraction of {@link angle}. `0` is a
   * hard edge, `1` fades from the axis outwards. Defaults to `0.25`.
   *
   * This is the shape of the cone. {@link LightOptions.softness} is the
   * separate question of how soft the shadows the light casts are.
   */
  readonly coneSoftness?: number;
  /** Height above the sprite plane, in pixels. See {@link PointLight.height}. Defaults to `64`. */
  readonly height?: number;
}

/**
 * A cone of light. The cone points along the node's own rotation, so aiming a
 * spot is rotating it - a headlight parented to a car needs no direction of its
 * own.
 *
 * ```ts
 * lamp.addChild(new SpotLight({ radius: 400, angle: 35, coneSoftness: 0.3 }));
 * ```
 */
export class SpotLight extends Light {
  /** Distance in pixels at which the light contributes nothing. */
  public radius: number;
  /** Half-angle of the cone in degrees. */
  public angle: number;
  /** Edge fade as a fraction of {@link angle}. See {@link SpotLightOptions.coneSoftness}. */
  public coneSoftness: number;
  /** Height above the sprite plane, in pixels. */
  public height: number;

  public constructor(options: SpotLightOptions = {}) {
    super(options);

    this.radius = options.radius ?? 320;
    this.angle = options.angle ?? 30;
    this.coneSoftness = options.coneSoftness ?? 0.25;
    this.height = options.height ?? 64;
  }
}
