import { LightmapBackend } from './backends/LightmapBackend';
import { frameBackendOptions, type FrameLightingOptions } from './frameLighting';
import { Lighting } from './Lighting';
import type { LightingHost } from './LightingHost';

/** Construction options for {@link LightmapLighting}. */
export type LightmapLightingOptions = FrameLightingOptions;

/**
 * Lighting accumulated into a target of its own and multiplied onto the frame.
 *
 * ```ts
 * const lighting = new LightmapLighting(app, { lightResolution: 0.5, shadowResolution: 256 });
 *
 * scene.systems.add(lighting);
 * lighting.occludeFrom(new PhysicsOccluder(world));
 * ```
 *
 * Light no longer costs a loop iteration per fragment per light, so there is no
 * cap on how many there may be, and the accumulated field is a texture a shadow
 * term folds into: each light gets one polar row built from the registered
 * occluder sources. Normals come from a prepass over the surfaces registered
 * with {@link Lighting.normalsFrom} rather than from a material.
 *
 * The host is required and is the first argument: this renderer lights the
 * frame that host drew, installs its passes in that host's frame slot, and
 * follows its surface when it resizes. It is read, never owned.
 */
export class LightmapLighting extends Lighting {
  public constructor(host: LightingHost, options: LightmapLightingOptions = {}) {
    // Half resolution is the right default for the quads, which PAINT the
    // light field: a falloff is low-frequency and halving the fill is free.
    super(new LightmapBackend(frameBackendOptions(host, options, 0.5)), host, options);
  }
}
