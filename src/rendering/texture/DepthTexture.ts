import type { RenderTarget } from '#rendering/RenderTarget';
import { ScaleModes, WrapModes } from '#rendering/types';

import { Texture } from './Texture';

/**
 * The depth attachment of a render target, bindable wherever a {@link Texture}
 * is - a material texture slot, a filter input.
 *
 * It is created by the target that opted into depth (`{ depth: true }`), owned
 * by it, resized with it and destroyed with it; there is no way to construct
 * one on its own and no source to upload. The value behind each texel is the
 * window-space depth the last draw with a depth-writing material left there,
 * which is the backend's mapping of the clip-space z that draw's vertex stage
 * produced: nearer geometry is always the smaller value, but the absolute
 * numbers differ between backends because WebGL2 maps NDC `[-1, 1]` onto
 * `[0, 1]` where WebGPU's NDC z already is `[0, 1]`. Compare depths, do not
 * hard-code them.
 *
 * Sampling constraints, both backends alike:
 *
 * - Nearest only. A depth format is not filterable, so the sampler is forced to
 *   `nearest` regardless of {@link Texture.scaleMode}.
 * - One channel. GLSL reads it as `texture(sampler, uv).r`; WGSL declares the
 *   binding as `texture_depth_2d` and reads it as `textureSample(t, s, uv)`,
 *   which yields the bare `f32`. Comparison sampling (`sampler_comparison`,
 *   `sampler2DShadow`) is not used and not available.
 * - Live. The texture is the attachment itself, not a copy, so sampling it in
 *   the same pass that writes it is undefined; sample it in a later pass.
 *
 * Reading one before the owning target has ever been rendered into throws a
 * `RenderError` - there is no attachment to sample yet.
 * @advanced
 */
export class DepthTexture extends Texture {
  /** The render target this attachment belongs to. */
  public readonly target: RenderTarget;

  /** @internal - created by the owning {@link RenderTarget}. */
  public constructor(target: RenderTarget) {
    super(null, {
      scaleMode: ScaleModes.Nearest,
      wrapMode: WrapModes.ClampToEdge,
      premultiplyAlpha: false,
      generateMipMap: false,
      flipY: false,
    });

    this.target = target;
    this.setSize(target.width, target.height);
  }

  /**
   * No-op: a depth attachment has no CPU-side source to refresh from, and the
   * inherited implementation would resize it to the null source's `0x0`.
   */
  public override updateSource(): this {
    return this;
  }
}
