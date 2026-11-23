import { Signal } from '#core/Signal';
import type { TextureSource } from '#core/types';

import type { FrameSource } from './FrameSource';
import { animatedImageMime } from './animatedImageMime';

interface DecoderTrack {
  readonly frameCount: number;
}

interface BrowserImageDecoder {
  readonly tracks: { readonly ready: Promise<void>; readonly selectedTrack?: DecoderTrack };
  decode(options: { frameIndex: number }): Promise<{ image: VideoFrame }>;
  close(): void;
}

type BrowserImageDecoderConstructor = new (options: { data: Uint8Array; type: string }) => BrowserImageDecoder;

/**
 * Playback source for encoded GIF/APNG/animated WebP. The browser decoder
 * supplies composed VideoFrames; this source advances only at their authored
 * frame durations. No GPU resources are allocated here.
 *
 * Only the current and previous frame are retained; old VideoFrames are
 * explicitly closed to avoid pinning decoded images indefinitely.
 * @internal
 */
export class ImageSequenceSource implements FrameSource {
  public readonly onFrame = new Signal();
  public readonly onError = new Signal<[error: Error]>();

  private _frame: VideoFrame | null = null;
  private _retired: VideoFrame | null = null;
  private _index = 0;
  private _revision = 0;
  private _playing = false;
  private _generation = 0;
  private _loop = true;
  private _rate = 1;
  private _destroyed = false;
  private _timer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private readonly _decoder: BrowserImageDecoder,
    private readonly _frameCount: number,
  ) {}

  public static async open(encoded: ArrayBuffer, signal?: AbortSignal): Promise<ImageSequenceSource> {
    const type = animatedImageMime(encoded);

    if (type === null) {
      throw new TypeError('ImageSequenceSource requires an animated GIF, APNG or WebP file with more than one frame.');
    }

    const Decoder = (globalThis as unknown as { ImageDecoder?: BrowserImageDecoderConstructor }).ImageDecoder;

    if (Decoder === undefined) {
      throw new Error('Animated image decoding requires the browser ImageDecoder API; no supported decoder is available.');
    }

    signal?.throwIfAborted();
    const decoder = new Decoder({ data: new Uint8Array(encoded), type });

    try {
      await decoder.tracks.ready;
      signal?.throwIfAborted();

      const count = decoder.tracks.selectedTrack?.frameCount;

      if (count === undefined || !Number.isInteger(count) || count < 2) {
        throw new Error('The animation decoder did not expose a valid multi-frame track.');
      }

      const source = new ImageSequenceSource(decoder, count);
      const first = await decoder.decode({ frameIndex: 0 });

      if (signal?.aborted) {
        first.image.close();
        signal.throwIfAborted();
      }

      source._frame = first.image;
      source._revision++;
      source.play();

      return source;
    } catch (error) {
      decoder.close();
      throw error;
    }
  }

  public get width(): number {
    return this._frame?.displayWidth ?? 0;
  }

  public get height(): number {
    return this._frame?.displayHeight ?? 0;
  }

  public get image(): TextureSource {
    return this._frame;
  }

  public get revision(): number {
    return this._revision;
  }

  public get playing(): boolean {
    return this._playing;
  }

  public get loop(): boolean {
    return this._loop;
  }

  public set loop(value: boolean) {
    this._loop = value;
  }

  public get playbackRate(): number {
    return this._rate;
  }

  public set playbackRate(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError('Image sequence playbackRate must be positive and finite.');
    }

    this._rate = value;

    if (this._playing) {
      this._clearTimer();
      this._schedule();
    }
  }

  public play(): void {
    if (this._destroyed || this._playing) {
      return;
    }

    this._playing = true;
    this._schedule();
  }

  public pause(): void {
    this._playing = false;
    // A decode already running must not present a frame after pause.
    this._generation++;
    this._clearTimer();
  }

  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this.pause();
    this._frame?.close();
    this._retired?.close();
    this._frame = null;
    this._retired = null;
    this._decoder.close();
    this.onFrame.destroy();
    this.onError.destroy();
  }

  private _schedule(): void {
    if (!this._playing || this._destroyed || this._frameCount < 2 || this._frame === null) {
      return;
    }

    const durationMs = Math.max(10, (this._frame.duration ?? 100_000) / (1000 * this._rate));

    this._timer = setTimeout(() => {
      this._timer = null;
      void this._next();
    }, durationMs);
  }

  private async _next(): Promise<void> {
    if (!this._playing || this._destroyed) {
      return;
    }

    let next = this._index + 1;

    if (next === this._frameCount) {
      if (!this._loop) {
        this.pause();
        return;
      }

      next = 0;
    }

    const generation = this._generation;

    try {
      const decoded = await this._decoder.decode({ frameIndex: next });

      if (this._destroyed || !this._playing || generation !== this._generation) {
        decoded.image.close();
        return;
      }

      this._retired?.close();
      this._retired = this._frame;
      this._frame = decoded.image;
      this._index = next;
      this._revision++;
      this.onFrame.dispatch();
      this._schedule();
    } catch (error) {
      if (!this._destroyed) {
        this.pause();
        this.onError.dispatch(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  private _clearTimer(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}
