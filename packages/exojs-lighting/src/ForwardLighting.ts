import type { Filter } from '@codexo/exojs';

import { ForwardBackend } from './backends/ForwardBackend';
import { Lighting, type LightingOptions } from './Lighting';
import type { LightingHost } from './LightingHost';

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
 * The same, for a system built without a host - which has no frame slot for a
 * filter chain to run in.
 */
export interface StandaloneForwardLightingOptions extends LightingOptions {
  /** Lights the renderer's texture is sized for; lights beyond it are skipped. Defaults to `64`. */
  readonly maxLights?: number;
  /** Filters need a frame slot, and a system without a host has none. */
  readonly post?: never;
}

/**
 * A plain options record must not be mistaken for a host, so the test is for
 * the members a host is defined by rather than for "an object".
 */
const isHost = (value: ForwardLightingOptions | LightingHost | undefined): value is LightingHost =>
  value !== undefined && 'framePasses' in value && 'frameTexture' in value && 'rendering' in value;

/**
 * Lighting shaded inside the sprite fragment stage, against one packed light
 * texture.
 *
 * ```ts
 * const lighting = new ForwardLighting(app, { maxLights: 16, ambient: new Color(20, 20, 24) });
 *
 * scene.systems.add(lighting);
 * ```
 *
 * One draw and no extra render targets, which is what makes it the floor
 * renderer. It is also the only one that does normal mapping, through
 * {@link LitMaterial} - the other two multiply a finished frame, which has no
 * surface normals left to shade against. The price is the cap: every lit
 * fragment walks every light, so {@link ForwardLightingOptions.maxLights}
 * bounds how many there may be, and it casts no shadows at all.
 *
 * It is the one system that can be built without a host, because its light data
 * is a texture a material samples rather than anything the frame slot runs:
 *
 * ```ts
 * const lighting = new ForwardLighting({ maxLights: 16 });
 * ```
 *
 * A filter chain is a frame pass, so `post` needs the host.
 */
export class ForwardLighting extends Lighting {
  public constructor(options?: StandaloneForwardLightingOptions);
  public constructor(host: LightingHost, options?: ForwardLightingOptions);
  public constructor(hostOrOptions?: LightingHost | ForwardLightingOptions, maybeOptions?: ForwardLightingOptions) {
    const host = isHost(hostOrOptions) ? hostOrOptions : null;
    const options = (isHost(hostOrOptions) ? maybeOptions : hostOrOptions) ?? {};
    const post = options.post ?? [];

    // A filter chain is a frame pass, and a frame pass needs the slot to
    // install itself in. Refusing it is the only honest answer; degrading to
    // "the option was ignored" is what this option did for its first release.
    if (post.length > 0 && host === null) {
      throw new Error('new ForwardLighting({ post }) needs the host whose frame the filters run on: pass it as the first argument.');
    }

    super(new ForwardBackend({ maxLights: options.maxLights ?? 64, post, app: host }), host, options);
  }
}
