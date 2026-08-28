import { assert } from '#core/dev';
import { RenderTarget } from '#rendering/RenderTarget';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import type { ColorTextureFormat } from '#rendering/types';

import type { TextureOptions } from './texture/TextureOptions';

/** Construction options for {@link MultiRenderTarget}. */
export interface MultiRenderTargetOptions extends Partial<TextureOptions> {
  /**
   * Colour format per attachment, in the order the fragment shader's outputs are
   * declared. At least one; at most {@link RenderBackend.maxColorAttachments} on
   * the backend that will draw into it.
   */
  readonly formats: readonly ColorTextureFormat[];
}

/**
 * An off-screen render target with several colour attachments, written in one
 * pass.
 *
 * One draw can produce more than one image: a colour pass that also writes a
 * selection id, a normal buffer, a velocity buffer. Without it the same
 * information costs one full pass per output, re-transforming and re-rasterizing
 * the same geometry each time.
 *
 * Each attachment is an ordinary {@link RenderTexture} and is sampled like any
 * other texture once the pass has run. They are OWNED by this target - created,
 * resized and destroyed with it - because a mismatched attachment size is a
 * framebuffer-completeness error on WebGL2 and a validation error on WebGPU, and
 * that is not a failure worth handing to callers to avoid.
 *
 * # What can draw into one
 *
 * Only a {@link Mesh} with a {@link MeshMaterial} whose fragment shader declares
 * one output per attachment. Every other renderer - sprites, text, nine-slice,
 * repeating sprites, video - and the default mesh material declare a single
 * output, so on WebGPU their pipelines cannot satisfy a multi-attachment pass at
 * all; drawing one into this target throws a `RenderError` naming the reason
 * rather than minting pipeline variants nothing writes to. Mask and
 * backdrop-blend compositing stay single-target for the same reason.
 *
 * A single-attachment target is still just a {@link RenderTexture} - reach for
 * this only when one pass genuinely has to produce two images.
 *
 * @example
 * ```ts
 * const gbuffer = new MultiRenderTarget(512, 512, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
 *
 * context.renderTo(scene, { target: gbuffer });
 *
 * const albedo = gbuffer.attachment(0);
 * const ids = gbuffer.attachment(1);
 * ```
 * @advanced
 */
export class MultiRenderTarget extends RenderTarget {
  public readonly attachments: readonly RenderTexture[];

  public constructor(width: number, height: number, options: MultiRenderTargetOptions) {
    assert(width > 0 && height > 0, `MultiRenderTarget dimensions must be positive (got ${width}x${height})`);
    assert(options.formats.length > 0, 'MultiRenderTarget needs at least one colour format.');
    super(width, height, false);

    const { formats, ...textureOptions } = options;

    this.attachments = Object.freeze(formats.map(format => new RenderTexture(width, height, { ...textureOptions, format })));
  }

  /** Colour format of each attachment, in declaration order. */
  public get formats(): readonly ColorTextureFormat[] {
    return this.attachments.map(attachment => attachment.format);
  }

  /**
   * The attachment at `index`, in the order its format was declared - the same
   * order the fragment shader's outputs are in.
   */
  public attachment(index: number): RenderTexture {
    const attachment = this.attachments[index];

    assert(attachment !== undefined, `MultiRenderTarget has ${this.attachments.length} attachment(s); ${index} is out of range.`);

    return attachment;
  }

  public override resize(width: number, height: number): this {
    super.resize(width, height);

    // Attachments follow unconditionally rather than lazily: an attachment left
    // at the old size makes the whole framebuffer incomplete, and the symptom
    // would surface on the next unrelated draw into it.
    for (const attachment of this.attachments) {
      attachment.resize(width, height);
    }

    return this;
  }

  public override destroy(): void {
    if (this.destroyed) {
      return;
    }

    // Before the base call, which fires the destroy listeners the backends use
    // to drop their framebuffer - that framebuffer references these textures.
    for (const attachment of this.attachments) {
      attachment.destroy();
    }

    super.destroy();
  }
}

/** Whether `target` writes more than one colour attachment. @internal */
export const isMultiAttachmentTarget = (target: RenderTarget): target is MultiRenderTarget =>
  target instanceof MultiRenderTarget && target.attachments.length > 1;
