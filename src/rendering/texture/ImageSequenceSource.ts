import { logger } from '#core/Logger';
import { Signal } from '#core/Signal';
import type { TextureSource } from '#core/types';

import { demuxAnimatedImage } from './animatedImageDemux';
import type { AnimatedImageMime } from './animatedImageMime';
import { animatedImageMime } from './animatedImageMime';
import { CompositingSequenceDecoder } from './CompositingSequenceDecoder';
import type { FrameSource } from './FrameSource';
import { isNativeDecoderFaithful } from './nativeDecoderProbe';
import type { DecodedSequenceFrame, SequenceDecoder } from './SequenceDecoder';

interface BrowserImageTrack {
  readonly frameCount: number;
  readonly repetitionCount?: number;
}

interface BrowserImageDecoder {
  readonly tracks: { readonly ready: Promise<void>; readonly selectedTrack?: BrowserImageTrack };
  decode(options: { frameIndex: number }): Promise<{ image: VideoFrame }>;
  close(): void;
}

interface BrowserImageDecoderConstructor {
  new (options: { data: Uint8Array; type: string }): BrowserImageDecoder;
  isTypeSupported?(type: string): Promise<boolean>;
}

/** Frame length used when a native frame reports no duration. */
const defaultFrameMs = 100;

class NativeSequenceDecoder implements SequenceDecoder {
  public constructor(
    private readonly _decoder: BrowserImageDecoder,
    public readonly frameCount: number,
    public readonly repetitions: number,
  ) {}

  public async decode(index: number): Promise<DecodedSequenceFrame> {
    const { image } = await this._decoder.decode({ frameIndex: index });

    return {
      image,
      width: image.displayWidth,
      height: image.displayHeight,
      durationMs: image.duration === null || image.duration === undefined ? defaultFrameMs : image.duration / 1000,
      release: () => image.close(),
    };
  }

  public close(): void {
    this._decoder.close();
  }
}

const openNative = async (
  encoded: ArrayBuffer,
  type: AnimatedImageMime,
  signal: AbortSignal | undefined,
): Promise<SequenceDecoder | null> => {
  const decoderClass = (globalThis as unknown as Record<string, BrowserImageDecoderConstructor | undefined>).ImageDecoder;

  if (decoderClass === undefined || (decoderClass.isTypeSupported !== undefined && !(await decoderClass.isTypeSupported(type)))) {
    return null;
  }

  // A decoder that composes frames wrongly is worse than the software path:
  // prefer it only when the compositor is unavailable.
  if (typeof createImageBitmap !== 'undefined' && !(await isNativeDecoderFaithful(decoderClass, type))) {
    return null;
  }

  signal?.throwIfAborted();

  let decoder: BrowserImageDecoder | null = null;

  try {
    decoder = new decoderClass({ data: new Uint8Array(encoded), type });
    await decoder.tracks.ready;
    signal?.throwIfAborted();

    const track = decoder.tracks.selectedTrack;

    if (track === undefined || !Number.isInteger(track.frameCount) || track.frameCount < 2) {
      throw new Error('The animation decoder did not expose a valid multi-frame track.');
    }

    // WebKit reports an endless animation as -1 where Chromium reports Infinity.
    const repeats = track.repetitionCount;

    const reported = repeats === undefined || repeats < 0 || !Number.isFinite(repeats) ? Number.POSITIVE_INFINITY : repeats;

    // Engines disagree on what repetitionCount counts, so the file's own loop count wins.
    return new NativeSequenceDecoder(decoder, track.frameCount, demuxAnimatedImage(encoded, type)?.repetitions ?? reported);
  } catch (error) {
    decoder?.close();

    if (signal?.aborted) {
      throw error;
    }

    // A decoder that exists but cannot handle this file falls back to software composition.
    return null;
  }
};

const openCompositing = (encoded: ArrayBuffer, type: AnimatedImageMime): SequenceDecoder => {
  if (typeof createImageBitmap === 'undefined') {
    throw new Error('Animated image decoding needs the ImageDecoder API or createImageBitmap; neither is available.');
  }

  const animation = demuxAnimatedImage(encoded, type);

  if (animation === null) {
    throw new Error('The animated image is malformed or has fewer than two decodable frames.');
  }

  return new CompositingSequenceDecoder(animation);
};

/**
 * Playback source for encoded GIF/APNG/animated WebP. Frames come from the
 * browser's ImageDecoder where it supports the file and from a software
 * compositor otherwise; both advance only at the authored frame durations and
 * honour the authored repeat count. No GPU resources are allocated here.
 *
 * Only the current and previous frame are retained; decoder-owned frames are
 * released as soon as they are no longer displayed.
 * @internal
 */
export class ImageSequenceSource implements FrameSource {
  public readonly onFrame = new Signal();
  public readonly onError = new Signal<[error: Error]>();

  private _frame: DecodedSequenceFrame | null = null;
  private _retired: DecodedSequenceFrame | null = null;
  private _index = 0;
  private _revision = 0;
  private _playing = false;
  private _finished = false;
  private _generation = 0;
  private _loopsDone = 0;
  private _loop = true;
  private _rate = 1;
  private _destroyed = false;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _dueAt = 0;
  private _remainingMs = 0;

  private constructor(
    private readonly _decoder: SequenceDecoder,
    /** Which decoder backs this animation. @internal */
    public readonly decoderKind: 'native' | 'compositing',
  ) {}

  public static async open(encoded: ArrayBuffer, signal?: AbortSignal): Promise<ImageSequenceSource> {
    const type = animatedImageMime(encoded);

    if (type === null) {
      throw new TypeError('ImageSequenceSource requires an animated GIF, APNG or WebP file with more than one frame.');
    }

    signal?.throwIfAborted();

    const native = await openNative(encoded, type, signal);
    const decoder = native ?? openCompositing(encoded, type);

    try {
      signal?.throwIfAborted();

      const first = await decoder.decode(0);

      if (signal?.aborted) {
        first.release();
        signal.throwIfAborted();
      }

      const source = new ImageSequenceSource(decoder, native === null ? 'compositing' : 'native');

      source._frame = first;
      source._revision++;
      source.play();

      return source;
    } catch (error) {
      decoder.close();

      throw error;
    }
  }

  public get width(): number {
    return this._frame?.width ?? 0;
  }

  public get height(): number {
    return this._frame?.height ?? 0;
  }

  public get image(): TextureSource {
    return this._frame?.image ?? null;
  }

  public get revision(): number {
    return this._revision;
  }

  public get playing(): boolean {
    return this._playing;
  }

  /** `true` honours the authored repeat count; `false` plays the sequence once. */
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

    if (value === this._rate) {
      return;
    }

    if (this._playing && this._timer !== null) {
      // Keep the unplayed part of the current frame's authored duration.
      const remaining = Math.max(0, this._dueAt - performance.now()) * this._rate;

      this._clearTimer();
      this._rate = value;
      this._arm(remaining / value, performance.now());
    } else {
      this._rate = value;
    }
  }

  public play(): void {
    if (this._destroyed || this._playing) {
      return;
    }

    this._playing = true;

    if (this._finished) {
      this._finished = false;
      this._loopsDone = 0;
      this._begin(0);

      return;
    }

    const now = performance.now();

    this._arm(this._remainingMs > 0 ? this._remainingMs / this._rate : this._currentWallMs(), now);
  }

  public pause(): void {
    if (this._playing && this._timer !== null) {
      this._remainingMs = Math.max(0, this._dueAt - performance.now()) * this._rate;
    } else if (this._playing) {
      this._remainingMs = 0;
    }

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
    this._frame?.release();
    this._retired?.release();
    this._frame = null;
    this._retired = null;
    this._decoder.close();
    this.onFrame.destroy();
    this.onError.destroy();
  }

  private _currentWallMs(): number {
    return (this._frame?.durationMs ?? defaultFrameMs) / this._rate;
  }

  private _arm(delayMs: number, now: number): void {
    if (!this._playing || this._destroyed || this._frame === null) {
      return;
    }

    this._dueAt = now + delayMs;
    this._remainingMs = 0;
    this._timer = setTimeout(() => {
      this._timer = null;
      void this._advance();
    }, delayMs);
  }

  private _begin(index: number): void {
    const generation = this._generation;

    void this._present(index, generation, performance.now());
  }

  private async _advance(): Promise<void> {
    if (!this._playing || this._destroyed) {
      return;
    }

    let next = this._index + 1;

    if (next >= this._decoder.frameCount) {
      const repeats = this._loop ? this._decoder.repetitions : 0;

      if (this._loopsDone >= repeats) {
        this._playing = false;
        this._finished = true;
        this._remainingMs = 0;

        return;
      }

      this._loopsDone++;
      next = 0;
    }

    await this._present(next, this._generation, this._dueAt);
  }

  private async _present(index: number, generation: number, scheduledAt: number): Promise<void> {
    try {
      const decoded = await this._decoder.decode(index);

      if (this._destroyed || !this._playing || generation !== this._generation) {
        decoded.release();

        return;
      }

      this._retired?.release();
      this._retired = this._frame;
      this._frame = decoded;
      this._index = index;
      this._revision++;
      this.onFrame.dispatch();

      // Chaining deadlines from the previous due time keeps decode latency from accumulating as drift.
      const now = performance.now();
      const wall = this._currentWallMs();
      const due = scheduledAt + wall;

      this._arm(due > now ? due - now : wall, now);
    } catch (error) {
      if (!this._destroyed) {
        const failure = error instanceof Error ? error : new Error(String(error));

        this.pause();
        logger.error('Animated image playback stopped: a frame could not be decoded.', { source: 'texture', error: failure });
        this.onError.dispatch(failure);
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
