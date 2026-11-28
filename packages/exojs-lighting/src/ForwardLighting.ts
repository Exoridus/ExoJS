import type { Filter } from '@codexo/exojs';

import { ForwardBackend } from './backends/ForwardBackend';
import { Lighting, type LightingOptions } from './Lighting';
import { isLightingHost, type LightingHost } from './LightingHost';

/** What {@link ForwardLighting} takes whether or not it was given a host. */
export interface ForwardLightingOptions extends LightingOptions {
  /** Lights the renderer's texture is sized for; lights beyond it are skipped. Defaults to `64`. */
  readonly maxLights?: number;
  /**
   * Filters applied to the shaded frame, in order. They run as one pass in the
   * host's frame slot and read the frame the sprite shader shaded, so they need
   * the host: see the host-taking overload.
   *
   * Caller-owned, and fixed for the system's lifetime.
   */
  readonly post?: readonly Filter[];
}

/**
 * The same, for a system built without a host. A `post` chain is a frame pass,
 * so a system built with one gets its renderer only once it is added to a
 * registry, which supplies the application whose frame slot runs it.
 */
export interface StandaloneForwardLightingOptions extends LightingOptions {
  /** Lights the renderer's texture is sized for; lights beyond it are skipped. Defaults to `64`. */
  readonly maxLights?: number;
  /** Filters applied to the shaded frame; see {@link ForwardLightingOptions.post}. */
  readonly post?: readonly Filter[];
}

/**
 * Lighting shaded inside the sprite fragment stage, against one packed light
 * texture.
 *
 * ```ts
 * // In Scene.init():
 * const lighting = this.systems.add(new ForwardLighting({ maxLights: 16, ambient: new Color(20, 20, 24) }));
 * ```
 *
 * Without a `post` chain it adds no draw of its own and no extra render
 * targets, which is what makes it the floor renderer; a chain adds a filter
 * pass over the finished frame. It is the only renderer that takes its
 * normals from a material ({@link LitMaterial}) rather than from registered
 * surfaces, which `lightmap` reads through its normal prepass. The price is the cap: every
 * lit fragment walks every light, so {@link ForwardLightingOptions.maxLights}
 * bounds how many there may be, and it casts no shadows at all.
 *
 * It is the one system that can be built without a host, because its light data
 * is a texture a material samples rather than anything the frame slot runs:
 *
 * ```ts
 * const lighting = new ForwardLighting({ maxLights: 16 });
 * ```
 *
 * Without a `post` chain its renderer exists from construction, so a
 * {@link LitMaterial} can bind to it before the system is registered. A filter
 * chain is a frame pass and needs an application: built from options alone, the
 * renderer is then created when the system is added to a registry.
 */
export class ForwardLighting extends Lighting {
  public constructor(options?: StandaloneForwardLightingOptions);
  public constructor(host: LightingHost, options?: ForwardLightingOptions);
  public constructor(hostOrOptions?: LightingHost | ForwardLightingOptions, maybeOptions?: ForwardLightingOptions) {
    const host = isLightingHost(hostOrOptions) ? hostOrOptions : null;
    const options = (host === null ? (hostOrOptions as ForwardLightingOptions | undefined) : maybeOptions) ?? {};
    const post = options.post ?? [];
    const maxLights = options.maxLights ?? 64;

    // A filter chain is a frame pass and needs the slot to install itself in,
    // so without a host the renderer waits for the registry's application.
    if (host === null && post.length > 0) {
      super((target: LightingHost) => new ForwardBackend({ maxLights, post, app: target }), null, options);

      return;
    }

    super(new ForwardBackend({ maxLights, post, app: host }), host, options);
  }
}
