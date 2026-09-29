import type { Color } from '#core/Color';
import { LoadState, type LoadStateValue } from '#core/LoadState';
import type { TextureSource } from '#core/types';
import { getTextureSourceSize } from '#core/utils';
import { Size } from '#math/Size';
import { isPowerOfTwo } from '#math/utils';
import { ScaleModes, TextureFormat, WrapModes } from '#rendering/types';
import { createCanvas, createCheckerCanvas } from '#rendering/utils';

import type { CompressedTexturePayload } from './compressedPayload';
import { validateCompressedPayload } from './compressedPayload';
import type { CompressedTextureFormat } from './CompressedTextureFormat';
import type { Rgba8TexturePayload } from './pixelPayload';
import { validateRgba8Payload } from './pixelPayload';
import { resolveTextureFormat } from './textureFormatInfo';
import type { TextureAlphaMode, TextureColorSpace, TextureOptions } from './TextureOptions';

/** Resolved source interpretation retained while a texture handle changes payloads. */
export interface ResolvedTextureMetadata {
  readonly storageFormat: TextureFormat | CompressedTextureFormat | null;
  readonly colorSpace: TextureColorSpace;
  readonly alphaMode: TextureAlphaMode;
  readonly mipLevelCount: number;
}

type DecodedImageMetadata = Readonly<{ colorSpace: TextureColorSpace; alphaMode: TextureAlphaMode }>;

const browserImageMetadata: DecodedImageMetadata = Object.freeze({ colorSpace: 'srgb', alphaMode: 'straight' });

/**
 * A static GPU texture sourced from an image, canvas, or video element.
 *
 * Holds the pixel source, its sampling state ({@link ScaleModes}, {@link WrapModes})
 * and its upload state (mip generation, alpha premultiplication). A `version`
 * counter is incremented on every mutation that invalidates the GPU copy, so
 * backends detect stale uploads without polling.
 *
 * Static helpers {@link Texture.black}, {@link Texture.white}, and {@link Texture.empty}
 * provide ready-made placeholder textures. Default sampler options are configurable via
 * {@link Texture.defaultOptions}.
 *
 * # Colour and alpha
 *
 * Image, canvas and video sources are colour by default: RGB is sRGB-encoded,
 * stored in an sRGB format and decoded to linear light when sampled, while
 * alpha stays linear coverage. Declare `colorSpace: 'none'` for numeric data
 * so it is never decoded, and `'linear-srgb'` for colour already in linear
 * light. A straight-alpha colour source is premultiplied once at upload, in
 * linear light and before filtering, unless `premultiplyAlpha` is `false` or
 * `alphaMode` says it already is. A borrowed canvas or `ImageBitmap` may have
 * lost low-alpha precision before the engine sees it.
 *
 * Compressed KTX2 blocks are never recompressed. A straight-alpha compressed
 * source is filtered straight and premultiplied in the draw shader, so it does
 * not have the edge guarantee of premultiplied storage; use premultiplied
 * compressed assets or dilated edges for quality-sensitive transparency.
 * @stable
 */
export class Texture {
  private static _black: Texture | null = null;
  private static _white: Texture | null = null;
  private static _missing: Texture | null = null;

  public static defaultOptions: TextureOptions = {
    scaleMode: ScaleModes.Linear,
    wrapMode: WrapModes.ClampToEdge,
    premultiplyAlpha: true,
    generateMipMap: true,
    flipY: false,
  };

  public static readonly empty = new Texture(null);

  /**
   * Create a texture from RGBA8 bytes without converting through a browser
   * image source. The payload declares the meaning and alpha association of
   * its bytes; supplied handle metadata must agree with it.
   */
  public static fromPixels(payload: Rgba8TexturePayload, options?: Partial<TextureOptions>): Texture {
    const texture = new Texture(null, options);

    texture.setPixels(payload);

    return texture;
  }

  /** A color producer: a browser-rasterized canvas, interpreted exactly like any other decoded image source. */
  public static get black(): Texture {
    if (Texture._black === null) {
      Texture._black = Texture.fromColor('#000', 10);
    }

    return Texture._black;
  }

  /** A color producer: a browser-rasterized canvas, interpreted exactly like any other decoded image source. */
  public static get white(): Texture {
    if (Texture._white === null) {
      Texture._white = Texture.fromColor('#fff', 10);
    }

    return Texture._white;
  }

  /**
   * Create a solid-colour texture of the given square size (default `1`×`1`).
   * Accepts a {@link Color} instance or any CSS colour string; a Color with
   * alpha below 1 is rendered with that alpha. Generalizes the fixed
   * {@link Texture.black}/{@link Texture.white} helpers.
   *
   * A color producer by default, not a numeric placeholder: the fill goes
   * through an ordinary `HTMLCanvasElement`, so it gets the same browser sRGB,
   * straight-alpha interpretation as any loaded image and matches a genuinely
   * loaded color asset of the same value. A solid texture standing for numeric
   * data instead - a flat normal map, a constant mask - declares that in
   * `options`.
   */
  public static fromColor(color: Color | string, size = 1, options?: Partial<TextureOptions>): Texture {
    let fillStyle: string;

    if (typeof color === 'string') {
      fillStyle = color;
    } else if (color.a < 1) {
      fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
    } else {
      fillStyle = color.toString();
    }

    return new Texture(createCanvas({ fillStyle, width: size, height: size }), options);
  }

  /**
   * Shared 8×8 magenta/black checkerboard shown in place of assets that failed
   * to load - a visible error beats an invisible hole, in production too.
   * Lazily created; every access returns the same instance.
   *
   * A color producer, like {@link Texture.fromColor}: the checker pattern is
   * drawn on a canvas and resolved the same way a loaded color asset is.
   */
  public static get missing(): Texture {
    if (Texture._missing === null) {
      Texture._missing = new Texture(createCheckerCanvas());
    }

    return Texture._missing;
  }

  private _version = 0;
  private _source: TextureSource = null;
  private _sourceMetadata: DecodedImageMetadata | null = null;
  private _pixels: Rgba8TexturePayload | null = null;
  private _compressed: CompressedTexturePayload | null = null;
  private _size: Size = new Size(0, 0);
  private _isDestroyed = false;
  private readonly _destroyListeners: Set<() => void> = new Set<() => void>();
  private readonly _releaseListeners: Set<() => void> = new Set<() => void>();
  /** @internal - load lifecycle, driven by the Loader's seamless pipeline. */
  public readonly _loadState = new LoadState<Texture>();
  private _scaleMode: ScaleModes;
  private _wrapMode: WrapModes;
  private _premultiplyAlpha = false;
  private _premultiplyAlphaExplicit = false;
  private _generateMipMap = false;
  private _flipY = false;
  private _requestedColorSpace: TextureColorSpace | undefined;
  private _requestedAlphaMode: TextureAlphaMode | undefined;
  private _resolvedMetadata: ResolvedTextureMetadata = Object.freeze({
    storageFormat: null,
    colorSpace: 'srgb',
    alphaMode: 'straight',
    mipLevelCount: 0,
  });

  public constructor(source: TextureSource = null, options?: Partial<TextureOptions>) {
    const { scaleMode, wrapMode, premultiplyAlpha, generateMipMap, flipY } = {
      ...Texture.defaultOptions,
      ...options,
    };

    this._scaleMode = scaleMode;
    this._wrapMode = wrapMode;
    this._premultiplyAlpha = premultiplyAlpha;
    this._premultiplyAlphaExplicit = options?.premultiplyAlpha !== undefined;
    this._generateMipMap = generateMipMap;
    this._flipY = flipY;
    this._requestedColorSpace = options?.colorSpace;
    this._requestedAlphaMode = options?.alphaMode;
    this._applyResolvedMetadata(this._resolveMetadata(null, null, null), false);

    if (source !== null) {
      this.setSource(source);
    }
  }

  public get source(): TextureSource {
    return this._source;
  }

  public set source(source: TextureSource) {
    this.setSource(source);
  }

  /** RGBA8 payload this texture uploads instead of a browser source, or `null`. */
  public get pixels(): Rgba8TexturePayload | null {
    return this._pixels;
  }

  /**
   * Hardware-compressed payload this texture uploads instead of a pixel source,
   * or `null` for the ordinary case.
   *
   * Mutually exclusive with {@link source} and {@link pixels}: installing one
   * clears the others, so a texture is never ambiguous about what it uploads.
   * A handle that arrives empty from the loader can become either, which is what
   * lets an asset variant swap a PNG for a KTX2 file without changing what a
   * caller holds.
   */
  public get compressed(): CompressedTexturePayload | null {
    return this._compressed;
  }

  /** Resolved interpretation for the active payload. The record is immutable. */
  public get resolvedMetadata(): ResolvedTextureMetadata {
    return this._resolvedMetadata;
  }

  /** Meaning of the active texture samples. */
  public get colorSpace(): TextureColorSpace {
    return this._resolvedMetadata.colorSpace;
  }

  public set colorSpace(colorSpace: TextureColorSpace | undefined) {
    this.setColorSpace(colorSpace);
  }

  /** Source association of RGB with alpha for the active payload. */
  public get alphaMode(): TextureAlphaMode {
    return this._resolvedMetadata.alphaMode;
  }

  public set alphaMode(alphaMode: TextureAlphaMode | undefined) {
    this.setAlphaMode(alphaMode);
  }

  /** Number of supplied levels; browser sources report one until realized. */
  public get mipLevelCount(): number {
    return this._resolvedMetadata.mipLevelCount;
  }

  /**
   * Install a compressed payload, replacing any browser or raw pixel source,
   * and resize to its base level.
   *
   * Pass `null` to drop it. Bumps {@link version}, so backends re-create their
   * GPU texture - a format change cannot be patched into an existing one.
   * @throws Error - the payload has no levels, a base level that is not a whole
   *   number of blocks, or a level whose byte length does not match its extent.
   */
  public setCompressed(payload: CompressedTexturePayload | null): this {
    if (payload === null) {
      if (this._compressed !== null) {
        const metadata = this._resolveMetadata(null, null, null);

        this._validateResolvedMetadata(metadata);

        this.releaseGpu();
        this._compressed = null;
        this._applyResolvedMetadata(metadata);
        this.setSize(0, 0);
        this._touch();
      }

      return this;
    }

    const base = validateCompressedPayload(payload);
    const compressed = freezeCompressedPayload(payload);
    const metadata = this._resolveMetadata(null, null, compressed);

    this._validateResolvedMetadata(metadata);

    this.releaseGpu();
    this._compressed = compressed;
    this._source = null;
    this._sourceMetadata = null;
    this._pixels = null;
    this._applyResolvedMetadata(metadata);
    this.setSize(base.width, base.height);
    this._touch();

    return this;
  }

  public get size(): Size {
    return this._size;
  }

  public set size(size: Size) {
    this.setSize(size.width, size.height);
  }

  public get width(): number {
    return this._size.width;
  }

  public set width(width: number) {
    this.setSize(width, this.height);
  }

  public get height(): number {
    return this._size.height;
  }

  public set height(height: number) {
    this.setSize(this.width, height);
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
    this.setGenerateMipMap(generateMipMap);
  }

  public get flipY(): boolean {
    return this._flipY;
  }

  public set flipY(flipY: boolean) {
    this._flipY = flipY;
  }

  /**
   * Whether both dimensions are powers of two.
   * Non-power-of-two textures may have limited wrap-mode support on some hardware.
   */
  public get powerOfTwo(): boolean {
    return isPowerOfTwo(this.width) && isPowerOfTwo(this.height);
  }

  /**
   * Monotonically increasing version counter.
   * Incremented by any mutation that requires a GPU re-upload: a source, size,
   * or upload-parameter change. Filter and wrap changes do not bump it -
   * backends resolve sampling state separately, so changing it costs no upload.
   */
  public get version(): number {
    return this._version;
  }

  /**
   * Load lifecycle of this texture. Directly constructed textures are
   * `'ready'`; deferred handles returned by `loader.get('hero.png')` /
   * `loader.get(Asset.type('texture', src))` start `'loading'` and become `'ready'` once
   * the payload fills in, or `'failed'` (showing the {@link Texture.missing}
   * checker) when the load errors.
   */
  public get loadState(): LoadStateValue {
    return this._loadState.value;
  }

  /** Load lifecycle: `'idle' | 'loading' | 'ready' | 'failed'`. */
  public get state(): LoadStateValue {
    return this._loadState.value;
  }

  /** `true` exactly when {@link state} is `'ready'`. */
  public get ready(): boolean {
    return this._loadState.value === 'ready';
  }

  /** The error the last load failed with, or `null` outside `'failed'`. */
  public get error(): Error | null {
    return this._loadState.error;
  }

  /**
   * Promise that settles with this texture once its payload has loaded -
   * resolved immediately for `'ready'` textures, rejected with the load error
   * for `'failed'` ones. Re-materialized when a failed load is retried, so
   * read it fresh from this getter rather than caching it across load cycles.
   */
  public get loaded(): Promise<this> {
    return this._loadState.loaded(this) as Promise<this>;
  }

  /**
   * Increment the version counter so backends re-upload on the next frame.
   * @internal - for subclasses (e.g. {@link DataTexture}) that mutate texture
   * data through paths the base setters don't cover.
   */
  protected _bumpVersion(): void {
    this._version++;
  }

  /**
   * Register a callback to be invoked just before this texture is destroyed.
   * Useful for backends to release their GPU-side texture objects.
   */
  public addDestroyListener(listener: () => void): this {
    this._destroyListeners.add(listener);

    return this;
  }

  public removeDestroyListener(listener: () => void): this {
    this._destroyListeners.delete(listener);

    return this;
  }

  /**
   * Register a callback fired when {@link releaseGpu} runs. Distinct from
   * {@link addDestroyListener}: the handle stays alive and bindable
   * afterwards, ready for a later {@link setSource} to re-upload - used by
   * seamless asset eviction, which drops the payload but keeps the handle's
   * identity so a later fill can heal every consumer in place.
   * @internal
   */
  public addReleaseListener(listener: () => void): this {
    this._releaseListeners.add(listener);

    return this;
  }

  /** @internal */
  public removeReleaseListener(listener: () => void): this {
    this._releaseListeners.delete(listener);

    return this;
  }

  public setScaleMode(scaleMode: ScaleModes): this {
    this._scaleMode = scaleMode;

    return this;
  }

  public setWrapMode(wrapMode: WrapModes): this {
    this._wrapMode = wrapMode;

    return this;
  }

  public setGenerateMipMap(generateMipMap: boolean): this {
    if (this._generateMipMap !== generateMipMap) {
      this._generateMipMap = generateMipMap;
      this._touch();
    }

    return this;
  }

  public setPremultiplyAlpha(premultiplyAlpha: boolean): this {
    if (premultiplyAlpha && this.colorSpace === 'none') {
      throw new TypeError('Premultiply-alpha normalization is not valid for numeric texture data.');
    }

    this._premultiplyAlphaExplicit = true;

    if (this._premultiplyAlpha !== premultiplyAlpha) {
      this._premultiplyAlpha = premultiplyAlpha;
      this._touch();
    }

    return this;
  }

  /**
   * Installs a browser-managed image source. Direct sources use the browser's
   * sRGB, straight-alpha interpretation.
   */
  public setSource(source: TextureSource): this {
    return this._setSource(source, browserImageMetadata);
  }

  /** Installs a factory-decoded source whose conversion and alpha behavior were selected before decoding. @internal */
  public _setDecodedImageSource(source: TextureSource, colorSpace: TextureColorSpace): this {
    return this._setSource(source, { colorSpace, alphaMode: 'straight' });
  }

  /** Installs a visible failure source without changing the handle's declared interpretation. @internal */
  public _setFailureSource(source: TextureSource): this {
    return this._setSource(source, { colorSpace: this._requestedColorSpace ?? 'srgb', alphaMode: this._requestedAlphaMode ?? 'straight' });
  }

  /** Copies only payload data and source interpretation. Handle-local options remain unchanged. @internal */
  public _copyPayloadFrom(donor: Texture): this {
    if (donor.pixels !== null) {
      return this.setPixels(donor.pixels);
    }

    if (donor.compressed !== null) {
      return this.setCompressed(donor.compressed);
    }

    return this._setSource(donor.source, donor._sourceMetadata ?? browserImageMetadata);
  }

  private _setSource(source: TextureSource, sourceMetadata: DecodedImageMetadata): this {
    if (this._source !== source || this._pixels !== null || this._compressed !== null) {
      const metadata = this._resolveMetadata(source, null, null, sourceMetadata);

      this._validateResolvedMetadata(metadata);

      this.releaseGpu();
      this._source = source;
      this._sourceMetadata = source === null ? null : sourceMetadata;
      // A pixel source and a compressed payload are two answers to the same
      // question, and the backends pick the compressed one - so leaving a stale
      // payload in place would make this call silently do nothing.
      this._pixels = null;
      this._compressed = null;
      this._applyResolvedMetadata(metadata);
      this.updateSource();
    }

    return this;
  }

  /**
   * Refresh the size from the current source and bump the version.
   * Call after mutating the source's pixel data in place (e.g. drawing to a canvas)
   * to notify backends that a re-upload is needed.
   */
  public updateSource(): this {
    const { width, height } = getTextureSourceSize(this._source);

    this.setSize(width, height);
    this._touch();

    return this;
  }

  public setSize(width: number, height: number): this {
    if (!this._size.equals({ width, height })) {
      this._size.set(width, height);
      this._touch();
    }

    return this;
  }

  /** `true` once {@link destroy} has run - a destroyed texture must not be bound. */
  public get destroyed(): boolean {
    return this._isDestroyed;
  }

  public destroy(): void {
    // Idempotent by contract. Without this guard a second call would take
    // `_size` through a second `destroy()` and re-fire any listener registered
    // after the first call, against GPU state that is already released.
    if (this._isDestroyed) {
      return;
    }

    this._isDestroyed = true;

    for (const listener of [...this._destroyListeners]) {
      listener();
    }

    this._destroyListeners.clear();
    this._releaseListeners.clear();
    this._size.destroy();
    this._source = null;
    this._sourceMetadata = null;
    this._pixels = null;
    this._compressed = null;
  }

  /**
   * Free this texture's GPU-side payload right now instead of waiting for a
   * backend to notice on its next bind. `setSource(null)` alone only bumps
   * {@link version} - a backend re-uploads (and so frees the old payload)
   * only when it next binds this exact handle, which may never happen for a
   * texture nothing is currently drawing. Call this immediately after
   * dropping the source to reclaim the memory without depending on a future
   * bind. The handle itself is unaffected: it stays bindable, and a later
   * {@link setSource} re-uploads normally.
   * @internal
   */
  public releaseGpu(): void {
    for (const listener of [...this._releaseListeners]) {
      listener();
    }
  }

  private _touch(): void {
    this._version++;
  }

  /** Install RGBA8 bytes, replacing a browser or compressed source. */
  public setPixels(payload: Rgba8TexturePayload | null): this {
    if (payload === null) {
      if (this._pixels !== null) {
        const metadata = this._resolveMetadata(null, null, null);

        this._validateResolvedMetadata(metadata);

        this.releaseGpu();
        this._pixels = null;
        this._applyResolvedMetadata(metadata);
        this.setSize(0, 0);
        this._touch();
      }

      return this;
    }

    const base = validateRgba8Payload(payload);
    const pixels = freezeRgba8Payload(payload);
    const metadata = this._resolveMetadata(null, pixels, null);

    this._validateResolvedMetadata(metadata);

    this.releaseGpu();
    this._source = null;
    this._sourceMetadata = null;
    this._pixels = pixels;
    this._compressed = null;
    this._applyResolvedMetadata(metadata);
    this.setSize(base.width, base.height);
    this._touch();

    return this;
  }

  /** Change the caller-selected interpretation where the active payload permits it. */
  public setColorSpace(colorSpace: TextureColorSpace | undefined): this {
    if (this._requestedColorSpace === colorSpace) {
      return this;
    }

    const previous = this._requestedColorSpace;
    this._requestedColorSpace = colorSpace;

    let metadata: ResolvedTextureMetadata;

    try {
      metadata = this._resolveMetadata(this._source, this._pixels, this._compressed, this._sourceMetadata ?? browserImageMetadata);
      this._validateResolvedMetadata(metadata);
    } catch (error) {
      this._requestedColorSpace = previous;
      throw error;
    }

    this.releaseGpu();
    this._applyResolvedMetadata(metadata);
    this._touch();

    return this;
  }

  /** Change the caller-selected alpha association where the active payload permits it. */
  public setAlphaMode(alphaMode: TextureAlphaMode | undefined): this {
    if (this._requestedAlphaMode === alphaMode) {
      return this;
    }

    const previous = this._requestedAlphaMode;
    this._requestedAlphaMode = alphaMode;

    let metadata: ResolvedTextureMetadata;

    try {
      metadata = this._resolveMetadata(this._source, this._pixels, this._compressed, this._sourceMetadata ?? browserImageMetadata);
      this._validateResolvedMetadata(metadata);
    } catch (error) {
      this._requestedAlphaMode = previous;
      throw error;
    }

    this.releaseGpu();
    this._applyResolvedMetadata(metadata);
    this._touch();

    return this;
  }

  private _resolveMetadata(
    source: TextureSource | null,
    pixels: Rgba8TexturePayload | null,
    compressed: CompressedTexturePayload | null,
    sourceMetadata: DecodedImageMetadata = browserImageMetadata,
  ): ResolvedTextureMetadata {
    if (source !== null) {
      // A decoded image's own colour space is a fact about how the browser
      // decoded it, not a contract the caller has to agree with: an explicitly
      // requested interpretation replaces it, and the storage format follows
      // whichever interpretation won - sRGB storage being what decodes the
      // sample on every read and encodes it on every write. The payload routes
      // below are the opposite case, where a raw payload's declared meaning
      // and the caller's options have to agree.
      const colorSpace = this._requestedColorSpace ?? sourceMetadata.colorSpace;
      const resolved = resolveTextureFormat(colorSpace === 'srgb' ? TextureFormat.Rgba8Srgb : TextureFormat.Rgba8, {
        ...(this._requestedColorSpace === undefined ? {} : { colorSpace: this._requestedColorSpace }),
        ...(this._requestedAlphaMode === undefined ? {} : { alphaMode: this._requestedAlphaMode }),
        colorSpace,
        payloadAlphaMode: sourceMetadata.alphaMode,
      });

      return Object.freeze({ storageFormat: resolved.storageFormat, colorSpace: resolved.colorSpace, alphaMode: resolved.alphaMode, mipLevelCount: 1 });
    }

    if (pixels !== null) {
      const resolved = resolveTextureFormat(TextureFormat.Rgba8, {
        ...(this._requestedColorSpace === undefined ? {} : { colorSpace: this._requestedColorSpace }),
        ...(this._requestedAlphaMode === undefined ? {} : { alphaMode: this._requestedAlphaMode }),
        payloadColorSpace: pixels.colorSpace,
        payloadAlphaMode: pixels.alphaMode,
      });

      return Object.freeze({
        storageFormat: resolved.storageFormat,
        colorSpace: resolved.colorSpace,
        alphaMode: resolved.alphaMode,
        mipLevelCount: pixels.levels.length,
      });
    }

    if (compressed !== null) {
      const resolved = resolveTextureFormat(compressed.format, {
        ...(this._requestedColorSpace === undefined ? {} : { colorSpace: this._requestedColorSpace }),
        ...(this._requestedAlphaMode === undefined ? {} : { alphaMode: this._requestedAlphaMode }),
        ...(compressed.colorSpace === undefined ? {} : { payloadColorSpace: compressed.colorSpace }),
        ...(compressed.alphaMode === undefined ? {} : { payloadAlphaMode: compressed.alphaMode }),
      });

      return Object.freeze({
        storageFormat: resolved.storageFormat,
        colorSpace: resolved.colorSpace,
        alphaMode: resolved.alphaMode,
        mipLevelCount: compressed.levels.length,
      });
    }

    return Object.freeze({
      storageFormat: null,
      colorSpace: this._requestedColorSpace ?? 'srgb',
      alphaMode: this._requestedAlphaMode ?? 'straight',
      mipLevelCount: 0,
    });
  }

  private _applyResolvedMetadata(metadata: ResolvedTextureMetadata, touch = true): void {
    this._validateResolvedMetadata(metadata);

    const nextPremultiplyAlpha = this._premultiplyAlphaExplicit ? this._premultiplyAlpha : metadata.colorSpace !== 'none';
    const metadataChanged =
      this._resolvedMetadata.colorSpace !== metadata.colorSpace ||
      this._resolvedMetadata.alphaMode !== metadata.alphaMode ||
      this._resolvedMetadata.storageFormat !== metadata.storageFormat ||
      this._resolvedMetadata.mipLevelCount !== metadata.mipLevelCount;
    const premultiplyChanged = this._premultiplyAlpha !== nextPremultiplyAlpha;

    this._resolvedMetadata = metadata;
    this._premultiplyAlpha = nextPremultiplyAlpha;

    if (touch && (metadataChanged || premultiplyChanged)) {
      this._touch();
    }
  }

  private _validateResolvedMetadata(metadata: ResolvedTextureMetadata): void {
    if (metadata.colorSpace === 'none' && this._premultiplyAlphaExplicit && this._premultiplyAlpha) {
      throw new TypeError('Premultiply-alpha normalization is not valid for numeric texture data.');
    }
  }
}

const freezeRgba8Payload = (payload: Rgba8TexturePayload): Rgba8TexturePayload =>
  Object.freeze({ levels: Object.freeze([...payload.levels]), colorSpace: payload.colorSpace, alphaMode: payload.alphaMode });

const freezeCompressedPayload = (payload: CompressedTexturePayload): CompressedTexturePayload =>
  Object.freeze({
    format: payload.format,
    levels: Object.freeze([...payload.levels]),
    ...(payload.colorSpace === undefined ? {} : { colorSpace: payload.colorSpace }),
    ...(payload.alphaMode === undefined ? {} : { alphaMode: payload.alphaMode }),
  });
