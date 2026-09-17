import type { Color } from '@codexo/exojs';

import type { LightingDebugView, LightingQuality } from '../Lighting';
import type { Light } from '../lights/Light';

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

  /**
   * Show an intermediate instead of the shaded frame, or `null` to shade
   * normally. A renderer that has no such intermediate ignores it.
   */
  debug: LightingDebugView;

  /**
   * Take this frame's lights and ambient term. Called once per frame from the
   * system's update phase, before anything draws.
   *
   * Lights are read, never retained: the array belongs to the system and is
   * mutated between frames.
   */
  publish(lights: readonly Light[], ambient: Color): void;

  /** Release GPU resources. The lights are not owned. */
  destroy(): void;
}
