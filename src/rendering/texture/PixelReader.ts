import { logger } from '#core/Logger';
import type { ReadonlyRectangle } from '#math/Rectangle';
import { assertLiveTexture } from '#rendering/assertLiveResource';
import type { PixelReadback } from '#rendering/PixelReadback';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { PixelData } from '#rendering/RenderingContext';
import { TextureFormat } from '#rendering/types';

import type { RenderTexture } from './RenderTexture';

/** Options for {@link RenderingContext.createPixelReader}. */
export interface PixelReaderOptions {
  /** Sub-rectangle to read, in pixels from the texture's top-left corner. Defaults to the whole texture. */
  region?: ReadonlyRectangle;
  /**
   * Staging slots, each holding one read's pixels until it is released.
   * Defaults to `2`: one read in flight while the previous result is still
   * held. Every slot costs `width * height * 4` bytes for the reader's
   * lifetime, so size this from how many reads the consumer keeps outstanding,
   * not generously.
   */
  slots?: number;
}

/** A resolved read rectangle, validated against its source. @internal */
export interface PixelRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Check a readback's format and rectangle against `source`, naming `method`
 * in the error. Shared by the one-shot and the standing reader so both refuse
 * the same inputs with the same words.
 * @internal
 */
export const resolvePixelRegion = (method: string, source: RenderTexture, region: ReadonlyRectangle | undefined): PixelRegion => {
  if (source.format !== TextureFormat.Rgba8) {
    throw new Error(`${method} reads 'rgba8' targets, and this one is '${source.format}'. A float target's values do not fit the byte payload this returns.`);
  }

  const x = region !== undefined ? Math.trunc(region.left) : 0;
  const y = region !== undefined ? Math.trunc(region.top) : 0;
  const width = region !== undefined ? Math.trunc(region.width) : source.width;
  const height = region !== undefined ? Math.trunc(region.height) : source.height;

  if (width <= 0 || height <= 0 || x < 0 || y < 0 || x + width > source.width || y + height > source.height) {
    throw new Error(`${method} region ${width}x${height} at ${x},${y} does not lie inside the ${source.width}x${source.height} texture.`);
  }

  return { x, y, width, height };
};

/**
 * One read handed out by {@link PixelReader.request}: poll it from the frame
 * loop, take its pixels once {@link ready}, then {@link release} it.
 *
 * A read is never ready in the frame that requested it. It becomes ready a
 * frame or more later, or {@link failed} if the device was lost, the source
 * was resized or the reader destroyed underneath it. Both are terminal, and
 * `release()` is the caller's job in either case.
 *
 * Handles are pooled per slot: after `release()` the same object is handed
 * out again by a later request, so keep no reference past the release.
 */
export class PixelRead {
  /** @internal */
  public constructor(
    private readonly _reader: PixelReader,
    /** @internal */
    public readonly _slot: number,
    private readonly _data: PixelData,
    /** @internal */
    public _generation: number,
  ) {}

  /** Whether the pixels have landed and {@link data} is valid. */
  public get ready(): boolean {
    return this._reader._isReady(this);
  }

  /** Whether the read can no longer complete. Terminal; release it. */
  public get failed(): boolean {
    return this._reader._isFailed(this);
  }

  /**
   * The pixels, laid out as `ImageData` wants them, or `null` until ready.
   *
   * The array belongs to the slot and stays valid until {@link release};
   * after that a later read overwrites it. Copy it out to keep it longer.
   */
  public get data(): PixelData | null {
    return this.ready ? this._data : null;
  }

  /** Return the slot to the reader. A pending read is abandoned. Safe to call more than once. */
  public release(): void {
    this._reader._release(this);
  }
}

let nextReaderId = 0;

/**
 * A standing, non-blocking readback of one rectangle of one render texture,
 * for callers who read repeatedly: a picker, an analysis pass, a shader that
 * produces data rather than pixels.
 *
 * ```ts
 * const probe = app.rendering.createPixelReader(app.frameTexture, { region: cursorRect });
 * let pending: PixelRead | null = null;
 *
 * update() {
 *   if (clicked) pending = probe.request();
 *
 *   if (pending?.ready) {
 *     pick(pending.data!);
 *     pending.release();
 *     pending = null;
 *   }
 * }
 * ```
 *
 * Nothing blocks and nothing is allocated per read: each of the reader's
 * slots owns a staging buffer and a destination array for the reader's
 * lifetime, and a read copies into the slot it was given. The price is
 * latency, the pixels arrive a frame or more after the request, on both
 * backends alike. A caller that needs the pixels within the frame that drew
 * them should keep that data CPU-side instead; for a screenshot or any other
 * single read, {@link RenderingContext.readPixels} is the simpler call.
 *
 * `request()` refuses with `null` when every slot is held, rather than
 * queueing or stalling, so a consumer that reads faster than the GPU
 * delivers sees that as it happens instead of as growing latency.
 *
 * # Ownership
 *
 * The reader owns its slots and their arrays and nothing else; the source is
 * the caller's. Destroy the reader when the reads stop. A read whose consumer
 * went away still completes into its slot, so the worst case is the reader's
 * own fixed footprint, never a leak. Context loss fails the reads in flight
 * and the reader recovers on its own; resizing the source fails them too, and
 * a whole-texture reader follows the new size.
 */
export class PixelReader {
  /** The texture this reader reads. */
  public readonly source: RenderTexture;
  /** Number of staging slots. */
  public readonly slots: number;

  private readonly _backend: RenderBackend;
  private readonly _region: ReadonlyRectangle | undefined;
  private readonly _id = nextReaderId++;
  private _readback: PixelReadback;
  private _reads: PixelRead[] = [];
  /** Per slot, whether a read over it has been handed out and not released. */
  private _heldSlots: boolean[] = [];
  private _generation = 0;
  private _width: number;
  private _height: number;
  private _sourceWidth: number;
  private _sourceHeight: number;
  private _held = 0;
  private _destroyed = false;

  /**
   * Prefer {@link RenderingContext.createPixelReader}, which resolves the
   * backend. Constructing one directly is for code that already holds a
   * {@link RenderBackend}, such as an extension package.
   */
  public constructor(backend: RenderBackend, source: RenderTexture, options: PixelReaderOptions = {}) {
    const slots = options.slots ?? 2;

    if (!Number.isInteger(slots) || slots < 1) {
      throw new Error(`PixelReader needs at least one slot, got ${slots}.`);
    }

    const { x, y, width, height } = resolvePixelRegion('PixelReader', source, options.region);

    this._backend = backend;
    this.source = source;
    this.slots = slots;
    this._region = options.region;
    this._width = width;
    this._height = height;
    this._sourceWidth = source.width;
    this._sourceHeight = source.height;
    this._readback = backend.createPixelReadback(source, x, y, width, height, slots);
    this._bindReads();
  }

  /** Width of the rectangle each read describes. */
  public get width(): number {
    return this._width;
  }

  /** Height of the rectangle each read describes. */
  public get height(): number {
    return this._height;
  }

  /** Reads handed out and not yet released, pending or finished. Equal to {@link slots} when the next request would be refused. */
  public get inFlight(): number {
    return this._held;
  }

  public get isDestroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Copy the rectangle as drawn so far and hand back the read to poll, or
   * `null` when every slot is still held. Everything drawn into the source
   * before this call is included; pending work is submitted first.
   *
   * Throws once the reader or its source is destroyed, and when a region
   * reader's rectangle no longer fits a resized source.
   */
  public request(): PixelRead | null {
    if (this._destroyed) {
      throw new Error('PixelReader.request() on a destroyed reader.');
    }

    assertLiveTexture(this.source);
    this._followSourceSize();

    const slot = this._readback.request();

    if (slot === -1) {
      if (__DEV__) {
        logger.warn(
          `PixelReader over ${this._width}x${this._height}: all ${this.slots} slots are held, so this request was refused. The caller reads faster than the GPU delivers or keeps finished reads without releasing them; release them, or create the reader with more slots.`,
          { source: 'PixelReader', once: `pixel-reader:refused:${this._id}` },
        );
      }

      return null;
    }

    this._held++;
    this._heldSlots[slot] = true;

    return this._reads[slot]!;
  }

  /** Release every slot's GPU memory. Reads in flight fail. Idempotent. */
  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this._readback.destroy();
  }

  /** @internal */
  public _isReady(read: PixelRead): boolean {
    return read._generation === this._generation && !this._destroyed && this._readback.isReady(read._slot);
  }

  /** @internal */
  public _isFailed(read: PixelRead): boolean {
    return read._generation !== this._generation || this._destroyed || this._readback.isFailed(read._slot);
  }

  /** @internal */
  public _release(read: PixelRead): void {
    if (read._generation !== this._generation || this._destroyed) {
      return;
    }

    if (this._heldSlots[read._slot] === true) {
      this._heldSlots[read._slot] = false;
      this._held--;
      this._readback.release(read._slot);
    }
  }

  /**
   * A whole-texture reader follows a resized source with fresh slots; the
   * reads it handed out describe pixels that no longer exist and fail. A
   * region reader keeps its rectangle and refuses once it no longer fits.
   */
  private _followSourceSize(): void {
    if (this.source.width === this._sourceWidth && this.source.height === this._sourceHeight) {
      return;
    }

    const { x, y, width, height } = resolvePixelRegion('PixelReader', this.source, this._region);

    this._sourceWidth = this.source.width;
    this._sourceHeight = this.source.height;

    if (width === this._width && height === this._height && this._region !== undefined) {
      return;
    }

    this._readback.destroy();
    this._readback = this._backend.createPixelReadback(this.source, x, y, width, height, this.slots);
    this._width = width;
    this._height = height;
    this._generation++;
    this._held = 0;
    this._bindReads();
  }

  private _bindReads(): void {
    this._reads = [];
    this._heldSlots = [];

    for (let slot = 0; slot < this.slots; slot++) {
      this._reads.push(new PixelRead(this, slot, { width: this._width, height: this._height, data: this._readback.data(slot) }, this._generation));
      this._heldSlots.push(false);
    }
  }
}
