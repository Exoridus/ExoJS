import type { Color } from '#core/Color';
import { LoadState, type LoadStateValue } from '#core/LoadState';
import type { TextureSource } from '#core/types';
import { getTextureSourceSize } from '#core/utils';
import { Size } from '#math/Size';
import { isPowerOfTwo } from '#math/utils';
import { ScaleModes, WrapModes } from '#rendering/types';
import { createCanvas, createCheckerCanvas } from '#rendering/utils';

import type { SamplerOptions } from './Sampler';

/**
 * A static GPU texture sourced from an image, canvas, or video element.
 *
 * Holds the pixel source and sampling parameters ({@link ScaleModes}, {@link WrapModes},
 * mip generation, alpha premultiplication). A `version` counter is incremented on every
 * mutation so backends can detect stale GPU uploads without polling.
 *
 * Static helpers {@link Texture.black}, {@link Texture.white}, and {@link Texture.empty}
 * provide ready-made placeholder textures. Default sampler options are configurable via
 * {@link Texture.defaultSamplerOptions}.
 * @stable
 */
export class Texture {
  private static _black: Texture | null = null;
  private static _white: Texture | null = null;
  private static _missing: Texture | null = null;

  public static defaultSamplerOptions: SamplerOptions = {
    scaleMode: ScaleModes.Linear,
    wrapMode: WrapModes.ClampToEdge,
    premultiplyAlpha: true,
    generateMipMap: true,
    flipY: false,
  };

  public static readonly empty = new Texture(null);

  public static get black(): Texture {
    if (Texture._black === null) {
      Texture._black = Texture.fromColor('#000', 10);
    }

    return Texture._black;
  }

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
   */
  public static fromColor(color: Color | string, size = 1): Texture {
    let fillStyle: string;

    if (typeof color === 'string') {
      fillStyle = color;
    } else if (color.a < 1) {
      fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
    } else {
      fillStyle = color.toString();
    }

    return new Texture(createCanvas({ fillStyle, width: size, height: size }));
  }

  /**
   * Shared 8×8 magenta/black checkerboard shown in place of assets that failed
   * to load — a visible error beats an invisible hole, in production too.
   * Lazily created; every access returns the same instance.
   */
  public static get missing(): Texture {
    if (Texture._missing === null) {
      Texture._missing = new Texture(createCheckerCanvas());
    }

    return Texture._missing;
  }


  private _version = 0;
  private _source: TextureSource = null;
  private _size: Size = new Size(0, 0);
  private readonly _destroyListeners: Set<() => void> = new Set<() => void>();
  /** @internal — load lifecycle, driven by the Loader's seamless pipeline. */
  public readonly _loadState = new LoadState<Texture>();
  private _scaleMode: ScaleModes;
  private _wrapMode: WrapModes;
  private _premultiplyAlpha = false;
  private _generateMipMap = false;
  private _flipY = false;

  public constructor(source: TextureSource = null, options?: Partial<SamplerOptions>) {
    const { scaleMode, wrapMode, premultiplyAlpha, generateMipMap, flipY } = {
      ...Texture.defaultSamplerOptions,
      ...options,
    };

    this._scaleMode = scaleMode;
    this._wrapMode = wrapMode;
    this._premultiplyAlpha = premultiplyAlpha;
    this._generateMipMap = generateMipMap;
    this._flipY = flipY;

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
    this._generateMipMap = generateMipMap;
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
   * Incremented by any mutation that requires a GPU re-upload (source change,
   * size change, or sampler parameter change). Backends compare this value to
   * their cached version to decide whether to re-upload the texture.
   */
  public get version(): number {
    return this._version;
  }

  /**
   * Load lifecycle of this texture. Directly constructed textures are
   * `'ready'`; deferred handles returned by `loader.get('hero.png')` /
   * `loader.get(Asset.kind('texture', src))` start `'loading'` and become `'ready'` once
   * the payload fills in, or `'failed'` (showing the {@link Texture.missing}
   * checker) when the load errors.
   */
  public get loadState(): LoadStateValue {
    return this._loadState.value;
  }

  /** Load lifecycle: `'loading' | 'ready' | 'failed'` (asset-system v2 §6). */
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
   * Promise that settles with this texture once its payload has loaded —
   * resolved immediately for `'ready'` textures, rejected with the load error
   * for `'failed'` ones. Re-materialized when a failed load is retried, so
   * read it fresh from this getter rather than caching it across load cycles.
   */
  public get loaded(): Promise<this> {
    return this._loadState.loaded(this) as Promise<this>;
  }

  /**
   * Increment the version counter so backends re-upload on the next frame.
   * @internal — for subclasses (e.g. {@link DataTexture}) that mutate texture
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

  public setScaleMode(scaleMode: ScaleModes): this {
    if (this._scaleMode !== scaleMode) {
      this._scaleMode = scaleMode;
      this._touch();
    }

    return this;
  }

  public setWrapMode(wrapMode: WrapModes): this {
    if (this._wrapMode !== wrapMode) {
      this._wrapMode = wrapMode;
      this._touch();
    }

    return this;
  }

  public setPremultiplyAlpha(premultiplyAlpha: boolean): this {
    if (this._premultiplyAlpha !== premultiplyAlpha) {
      this._premultiplyAlpha = premultiplyAlpha;
      this._touch();
    }

    return this;
  }

  public setSource(source: TextureSource): this {
    if (this._source !== source) {
      this._source = source;
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

  public destroy(): void {
    for (const listener of [...this._destroyListeners]) {
      listener();
    }

    this._destroyListeners.clear();
    this._size.destroy();
    this._source = null;
  }

  private _touch(): void {
    this._version++;
  }
}
