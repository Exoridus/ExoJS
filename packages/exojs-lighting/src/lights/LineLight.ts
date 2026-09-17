import { Light, type LightOptions } from './Light';

/** Construction options for {@link LineLight}. Every field is also mutable afterwards. */
export interface LineLightOptions extends LightOptions {
  /**
   * Length of the emitting segment in pixels, centred on the node and running
   * along its rotation. Defaults to `128`.
   */
  readonly length?: number;
  /**
   * Distance from the SEGMENT at which the light contributes nothing, in
   * pixels - not from the node. A line light reaches `length / 2 + radius` from
   * its centre along its own axis and `radius` across it. Defaults to `192`.
   */
  readonly radius?: number;
  /** Height above the sprite plane, in pixels. See {@link PointLight.height}. Defaults to `64`. */
  readonly height?: number;
}

/**
 * A segment that emits: a neon tube, a light strip, a laser. Falloff is
 * measured from the nearest point on the segment, so the pool of light is a
 * capsule rather than a disc.
 *
 * ```ts
 * sign.addChild(new LineLight({ length: 120, color: Color.cyan }));
 * ```
 *
 * The segment runs along the node's own rotation and is centred on it, so
 * aiming a tube is rotating it and moving one is moving the node.
 *
 * # Renderers
 *
 * `lightmap` and `radiance` light the capsule. `forward` shades inside the
 * sprite stage, where a light is a position and a radius, and so lights a line
 * light as a point at its centre whose radius is the whole reach.
 *
 * # Shadows
 *
 * The shadow map is polar around the segment's CENTRE, the same as for a point
 * light. That is exact for a fragment the segment subtends little of, and
 * approximate near a long tube's ends, where a physically lit occluder would
 * be lit from many points along the segment at once. {@link LightOptions.softness}
 * is the knob that stands in for it.
 */
export class LineLight extends Light {
  /** Length of the emitting segment in pixels. */
  public length: number;
  /** Distance from the segment at which the light contributes nothing. */
  public radius: number;
  /** Height above the sprite plane, in pixels. */
  public height: number;

  public constructor(options: LineLightOptions = {}) {
    super(options);

    this.length = options.length ?? 128;
    this.radius = options.radius ?? 192;
    this.height = options.height ?? 64;
  }
}
