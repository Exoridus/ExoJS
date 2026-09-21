import type { Filter } from '@codexo/exojs';

import type { FrameLightingBackendOptions } from './backends/FrameLightingBackend';
import type { LightingOptions } from './Lighting';
import type { LightingHost } from './LightingHost';

/** What {@link LightmapLighting} and {@link RadianceLighting} both take. */
export interface FrameLightingOptions extends LightingOptions {
  /**
   * Texels per logical unit of the light target. Light is low-frequency, so
   * half resolution is hard to tell apart and costs a quarter of the fill.
   *
   * Defaults to `0.5` under {@link LightmapLighting} and to `1` under
   * {@link RadianceLighting}, which SAMPLES the field instead of painting into
   * it: the occluder mask a ray reads is rasterised at this density, so a
   * coarse field quantises the scene rather than the light and a source moving
   * by less than a texel makes the whole picture jump.
   */
  readonly lightResolution?: number;
  /**
   * How far beyond the camera's view the occluder mask and the geometry a ray
   * walks reach, as a fraction of the view's size on each side. It is what lets
   * a wall or a lamp just outside the picture still shadow or light what is in
   * it, so neither pops in at the edge as the camera moves; the probes
   * themselves still cover only the view. Defaults to `0.25`, and costs that
   * much more mask fill and collected geometry.
   */
  readonly fieldMargin?: number;
  /**
   * Angular bins in each light's shadow map. A bin is the finest shadow edge
   * the renderer can resolve, so a large light on a high-resolution canvas
   * wants more of them; the cost is linear in the light count. Defaults to
   * `256`.
   *
   * It trades against how wide a penumbra can get. The shadow filter samples
   * every bin under its kernel and spends at most 21 fetches doing it, so the
   * widest kernel is ten bins either side - three percent of a turn at the
   * default, and proportionally less as the resolution rises. Raising this
   * sharpens the hard edge rather than widening the softest one.
   */
  readonly shadowResolution?: number;
  /**
   * Filters applied to the shaded frame, in order. A bloom belongs here rather
   * than on a node: it reads the light the system produced, including the parts
   * no single node drew.
   *
   * They run as one pass in the host's frame slot, reading the composite, which
   * is where the light the system accumulated is still above `1.0` (see
   * {@link Lighting.hdr}).
   *
   * Caller-owned, and fixed for the system's lifetime - the filters' own
   * parameters stay live, which is what an animated effect actually needs.
   */
  readonly post?: readonly Filter[];
}

/** The backend options a frame-composing renderer is built from. @internal */
export const frameBackendOptions = (host: LightingHost, options: FrameLightingOptions, resolution: number): FrameLightingBackendOptions => ({
  app: host,
  post: options.post ?? [],
  resolution: options.lightResolution ?? resolution,
  shadowResolution: Math.max(8, Math.round(options.shadowResolution ?? 256)),
  fieldMargin: Math.min(1, Math.max(0, options.fieldMargin ?? 0.25)),
});
