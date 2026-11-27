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
 * All three renderers light a capsule. `forward` uses the nearest point on
 * the segment in its sprite shader (but casts no occluder shadows); `lightmap`
 * accumulates the capsule into its light target; `radiance` transports light
 * from an extended capsule emitter.
 *
 * # Shadows
 *
 * Under `lightmap`, a nonzero-length segment casts four polar shadow fans
 * from stratified positions along its length. Their weighted visibility
 * approximates an extended area emitter and produces a geometrically varying
 * penumbra even with zero `softness`. This is four-point sampling, not an
 * analytic solution; long lines can show finite-sample banding and cost four
 * shadow rows and up to four filtered shadow lookups per fragment. A zero-length
 * line uses one row. {@link LightOptions.softness} additionally softens each
 * sampled ray. `radiance` transports from its capsule emitter; `forward`
 * currently has no occluder-shadow path.
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
