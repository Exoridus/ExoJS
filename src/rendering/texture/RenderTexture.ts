import { assert } from '#core/dev';
import { isPowerOfTwo } from '#math/utils';
import { RenderTarget } from '#rendering/RenderTarget';
import { type ColorTextureFormat, ScaleModes, TextureFormat, WrapModes } from '#rendering/types';

import type { SamplerOptions } from './Sampler';

/** Construction options for {@link RenderTexture}. */
export interface RenderTextureOptions extends Partial<SamplerOptions> {
  /**
   * Color attachment format. Defaults to {@link TextureFormat.Rgba8}.
   * The float formats ({@link TextureFormat.Rgba16F} / {@link TextureFormat.Rgba32F})
   * allocate a floating-point offscreen target for rendering values outside `[0, 1]` — they require
   * `EXT_color_buffer_float` at render time (throws otherwise) and default to
   * `nearest` sampling. The format is immutable for the texture's lifetime.
   */
  format?: ColorTextureFormat;
}

/**
 * An off-screen render target that can also be sampled as a texture.
 *
 * Combines {@link RenderTarget} (framebuffer attachment) with the sampler
 * parameters of a {@link Texture} (scale mode, wrap mode, mip generation).
 * A `textureVersion` counter is incremented on every mutation so backends
 * can detect when to re-create the underlying GPU texture object.
 *
 * Mipmap generation is disabled by default because render targets are typically
 * updated every frame and mip generation is expensive.
 */
export class RenderTexture extends RenderTarget {
  public static defaultSamplerOptions: SamplerOptions = {
    scaleMode: ScaleModes.Linear,
    wrapMode: WrapModes.ClampToEdge,
    premultiplyAlpha: true,
    generateMipMap: false,
    flipY: true,
  };

  private _source: DataView | null = null;
  private _textureVersion = 0;
  private readonly _format: ColorTextureFormat;
  private _scaleMode: ScaleModes;
  private _wrapMode: WrapModes;
  private _premultiplyAlpha: boolean;
  private _generateMipMap: boolean;
  private _flipY: boolean;

  public constructor(width: number, height: number, options?: RenderTextureOptions) {
    assert(width > 0 && height > 0, `RenderTexture dimensions must be positive (got ${width}×${height})`);
    super(width, height, false);

    const format = options?.format ?? TextureFormat.Rgba8;

    // Float targets are point-sampled by default: linear filtering of a float
    // texture requires OES_texture_float_linear, which is not guaranteed. An
    // explicit `scaleMode` in `options` still overrides this.
    const defaults: SamplerOptions =
      format === TextureFormat.Rgba8 ? RenderTexture.defaultSamplerOptions : { ...RenderTexture.defaultSamplerOptions, scaleMode: ScaleModes.Nearest };

    const { scaleMode, wrapMode, premultiplyAlpha, generateMipMap, flipY } = {
      ...defaults,
      ...options,
    };

    this._format = format;
    this._scaleMode = scaleMode;
    this._wrapMode = wrapMode;
    this._premultiplyAlpha = premultiplyAlpha;
    this._generateMipMap = generateMipMap;
    this._flipY = flipY;
    this._touchTexture();
  }

  public get source(): DataView | null {
    return this._source;
  }

  public set source(source: DataView | null) {
    this.setSource(source);
  }

  /** Color attachment format, fixed at construction. Defaults to {@link TextureFormat.Rgba8}. */
  public get format(): ColorTextureFormat {
    return this._format;
  }

  public get scaleMode(): ScaleModes {
    return this._scaleMode;
  }

  public set scaleMode(scaleMode: ScaleModes) {
    this.setScaleMode(scaleMode);
  }

  public get wrapMode(): WrapModes {
    return this._wrapMode;
  }

  public set wrapMode(wrapMode: WrapModes) {
    this.setWrapMode(wrapMode);
  }

  public get premultiplyAlpha(): boolean {
    return this._premultiplyAlpha;
  }

  public set premultiplyAlpha(premultiplyAlpha: boolean) {
    this.setPremultiplyAlpha(premultiplyAlpha);
  }

  public get generateMipMap(): boolean {
    return this._generateMipMap;
  }

  public set generateMipMap(generateMipMap: boolean) {
    this._generateMipMap = generateMipMap;
  }

  public get flipY(): boolean {
    return this._flipY;
  }

  public set flipY(flipY: boolean) {
    this._flipY = flipY;
  }

  /** Whether both dimensions are powers of two. */
  public get powerOfTwo(): boolean {
    return isPowerOfTwo(this.width) && isPowerOfTwo(this.height);
  }

  /**
   * Monotonically increasing counter incremented whenever a sampler parameter changes
   * or the source data is updated. Backends use this to detect stale GPU texture state.
   */
  public get textureVersion(): number {
    return this._textureVersion;
  }

  public setScaleMode(scaleMode: ScaleModes): this {
    if (this._scaleMode !== scaleMode) {
      this._scaleMode = scaleMode;
      this._touchTexture();
    }

    return this;
  }

  public setWrapMode(wrapMode: WrapModes): this {
    if (this._wrapMode !== wrapMode) {
      this._wrapMode = wrapMode;
      this._touchTexture();
    }

    return this;
  }

  public setPremultiplyAlpha(premultiplyAlpha: boolean): this {
    if (this._premultiplyAlpha !== premultiplyAlpha) {
      this._premultiplyAlpha = premultiplyAlpha;
      this._touchTexture();
    }

    return this;
  }

  public setSource(source: DataView | null): this {
    if (this._source !== source) {
      this._source = source;
      this.updateSource();
    }

    return this;
  }

  public updateSource(): this {
    this._touchTexture();

    return this;
  }

  public setSize(width: number, height: number): this {
    assert(width > 0 && height > 0, `RenderTexture.setSize() dimensions must be positive (got ${width}×${height})`);
    if (!this._size.equals({ width, height })) {
      this._size.set(width, height);
      // Both halves of the default view. `resize` only restates its EXTENT; the
      // view was built centred on the target it was created for, and leaving
      // that centre behind means a resized target renders a region offset by
      // half the size difference — content shifted, and the far edge clipped by
      // the same amount. Nothing outside a resize can observe the difference,
      // which is why it survived: the region only stops matching the target
      // when the two are set from different sizes.
      this._defaultView.resize(width, height).setCenter(width / 2, height / 2);
      this.updateViewport();
      this._touchTexture();
    }

    return this;
  }

  public override destroy(): void {
    super.destroy();

    this._source = null;
  }

  private _touchTexture(): void {
    this._textureVersion++;
  }
}
