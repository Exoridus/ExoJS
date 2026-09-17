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
   */
  readonly softness?: number;
  /** Height above the sprite plane, in pixels. See {@link PointLight.height}. Defaults to `64`. */
  readonly height?: number;
}

/**
 * A cone of light. The cone points along the node's own rotation, so aiming a
 * spot is rotating it - a headlight parented to a car needs no direction of its
 * own.
 *
 * ```ts
 * lamp.addChild(new SpotLight({ radius: 400, angle: 35, softness: 0.3 }));
 * ```
 */
export class SpotLight extends Light {
  /** Distance in pixels at which the light contributes nothing. */
  public radius: number;
  /** Half-angle of the cone in degrees. */
  public angle: number;
  /** Edge fade as a fraction of {@link angle}. */
  public softness: number;
  /** Height above the sprite plane, in pixels. */
  public height: number;

  public constructor(options: SpotLightOptions = {}) {
    super(options);

    this.radius = options.radius ?? 320;
    this.angle = options.angle ?? 30;
    this.softness = options.softness ?? 0.25;
    this.height = options.height ?? 64;
  }

  /**
   * Cone axis in world space, as a unit vector written into `out` - the node's
   * world rotation, which is what makes aiming a spot the same act as rotating
   * whatever carries it.
   */
  public getWorldDirection(out: { x: number; y: number }): void {
    // The forward map is `world = [[a, b], [c, d]] * local + (x, y)`, so the
    // local +x axis lands on (a, c) - the cone axis, before normalisation.
    const transform = this.getWorldTransform();
    const x = transform.a;
    const y = transform.c;
    const length = Math.hypot(x, y);

    if (length === 0) {
      out.x = 1;
      out.y = 0;

      return;
    }

    out.x = x / length;
    out.y = y / length;
  }
}
