import { LightmapBackend } from './backends/LightmapBackend';
import { frameBackendOptions, type FrameLightingOptions } from './frameLighting';
import { Lighting } from './Lighting';
import { isLightingHost, type LightingHost } from './LightingHost';

/** Construction options for {@link LightmapLighting}. */
export type LightmapLightingOptions = FrameLightingOptions;

/**
 * Lighting accumulated into a target of its own and multiplied onto the frame.
 *
 * ```ts
 * // In Scene.init():
 * const lighting = this.systems.add(new LightmapLighting({ lightResolution: 0.5, shadowResolution: 256 }));
 *
 * lighting.occludeFrom(new PhysicsOccluder(world));
 * ```
 *
 * Light no longer costs a loop iteration per fragment per light, so there is no
 * cap on how many there may be, and the accumulated field is a texture a shadow
 * term folds into: each light gets one polar row built from the registered
 * occluder sources. Normals come from a prepass over the surfaces registered
 * with {@link Lighting.normalsFrom} rather than from a material.
 *
 * This renderer lights the frame an application drew, installs its passes in
 * that application's frame slot, and follows its surface when it resizes. Built
 * from options alone, it takes that application from the registry it is added
 * to (see {@link Lighting}). Given a host as the first argument, it is built at
 * once against that host, which is read and never owned; pass the scene the
 * system belongs to as {@link LightingOptions.scene} then, so its passes are in
 * that frame slot only while the scene is the one on screen.
 */
export class LightmapLighting extends Lighting {
  public constructor(options?: LightmapLightingOptions);
  public constructor(host: LightingHost, options?: LightmapLightingOptions);
  public constructor(hostOrOptions?: LightingHost | LightmapLightingOptions, maybeOptions?: LightmapLightingOptions) {
    const host = isLightingHost(hostOrOptions) ? hostOrOptions : null;
    const options = (host === null ? (hostOrOptions as LightmapLightingOptions | undefined) : maybeOptions) ?? {};
    // Half resolution is the right default for the quads, which PAINT the
    // light field: a falloff is low-frequency and halving the fill is free.
    const settings = frameBackendOptions(options, 0.5);
    const create = (target: LightingHost): LightmapBackend => new LightmapBackend(settings(target));

    super(host === null ? create : create(host), host, options);
  }
}
