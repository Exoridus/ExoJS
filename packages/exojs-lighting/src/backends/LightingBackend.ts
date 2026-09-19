import type { Color, Rectangle } from '@codexo/exojs';

import type { LightingDebugView, LightingQuality } from '../Lighting';
import type { Light } from '../lights/Light';
import type { NormalSurface } from '../normals/NormalSurface';
import type { OccluderField } from '../occluders/OccluderField';

/**
 * What every renderer behind {@link Lighting} implements.
 *
 * Internal until all three renderers run through it unchanged: a contract with
 * one implementation describes that implementation rather than the job. The
 * three differ enough - `forward` has no G-buffer at all - that they shape it
 * honestly between them.
 *
 * Users who want a renderer of their own do not need this: `app.framePasses`
 * hands a pass the finished frame and lets it write the canvas, with no
 * agreement with this package at all.
 * @internal
 */
export interface LightingBackend {
  /** Which renderer this is. */
  readonly quality: LightingQuality;

  /** Lights the last {@link publish} actually wrote. */
  readonly activeLightCount: number;

  /** Normal surfaces the last {@link publish} actually wrote. */
  readonly activeSurfaceCount: number;

  /**
   * Whether this renderer turns the occluder field into shadows. A renderer
   * that does not lets the system skip collecting one at all, so registering
   * occluder sources costs nothing where they cannot be seen.
   */
  readonly castsShadows: boolean;

  /**
   * Whether this renderer reads registered normal surfaces. A renderer that
   * takes its normals from a material instead ignores them.
   */
  readonly readsSurfaces: boolean;

  /**
   * Whether this renderer rasterises occluders rather than turning them into
   * geometry, which is what decides whether a source may hand a drawable over
   * whole. See `OccluderSink.addDrawable`.
   */
  readonly rasterisesOccluders: boolean;

  /**
   * Whether light accumulates with headroom above `1.0`. See
   * {@link Lighting.hdr}.
   */
  readonly hdr: boolean;

  /**
   * Show an intermediate instead of the shaded frame, or `null` to shade
   * normally. A renderer that has no such intermediate ignores it.
   */
  debug: LightingDebugView;

  /**
   * Scale applied to the shaded output. See {@link Lighting.debugExposure}.
   * A renderer that composites nothing ignores it.
   */
  debugExposure: number;

  /**
   * Take this frame's lights, ambient term and occluder field. Called once per
   * frame from the system's update phase, before anything draws.
   *
   * All four are read, never retained: they belong to the system and are
   * rewritten between frames. A renderer that casts no shadows ignores the
   * field, and one that takes its normals from a material ignores the
   * surfaces.
   */
  publish(lights: readonly Light[], ambient: Color, occluders: OccluderField, surfaces: readonly NormalSurface[]): void;

  /**
   * Write the world region this renderer needs occluders for into `out` and
   * answer `true`, or answer `false` to be given the region the lights' own
   * reach spans.
   *
   * A renderer whose shadows end at each light's radius is served by that
   * reach. One that transports light through a field is not: light arrives
   * well past any light's nominal radius, so a wall outside every radius still
   * casts, and a region bounded by the radii drops it from the frame as soon
   * as a lamp moves away from it.
   */
  collectRegion(out: Rectangle): boolean;

  /** Release GPU resources. The lights are not owned. */
  destroy(): void;
}
