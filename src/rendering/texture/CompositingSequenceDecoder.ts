import type { DemuxedAnimation, DemuxedFrame } from './animatedImageDemux';
import type { DecodedSequenceFrame, SequenceDecoder } from './SequenceDecoder';

type Surface = OffscreenCanvas | HTMLCanvasElement;
type Context2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

const createSurface = (width: number, height: number): { canvas: Surface; context: Context2D } => {
  const canvas: Surface =
    typeof OffscreenCanvas === 'undefined'
      ? Object.assign(document.createElement('canvas'), { width, height })
      : new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: false });

  if (context === null) {
    throw new Error('A 2D canvas context is required to decode animated images without ImageDecoder.');
  }

  return { canvas, context };
};

/**
 * Decodes an animated image without WebCodecs. Each frame's standalone still
 * is decoded with createImageBitmap and composed onto one canvas following the
 * format's disposal and blend rules, so the canvas always shows the frame a
 * native decoder would produce.
 *
 * Frames are composed strictly in order. Requesting frame 0 restarts the
 * composition; the next frame is decoded while the current one is displayed.
 * @internal
 */
export class CompositingSequenceDecoder implements SequenceDecoder {
  public readonly frameCount: number;
  public readonly repetitions: number;

  private readonly _canvas: Surface;
  private readonly _context: Context2D;
  private readonly _backup: { canvas: Surface; context: Context2D };
  private readonly _frames: readonly DemuxedFrame[];
  private _composed = -1;
  private _prefetch: { index: number; bitmap: Promise<ImageBitmap> } | null = null;
  private _closed = false;
  private _hasBackup = false;

  public constructor(private readonly _animation: DemuxedAnimation) {
    this._frames = _animation.frames;
    this.frameCount = _animation.frames.length;
    this.repetitions = _animation.repetitions;

    const surface = createSurface(_animation.width, _animation.height);

    this._canvas = surface.canvas;
    this._context = surface.context;
    this._backup = createSurface(_animation.width, _animation.height);
  }

  public async decode(index: number): Promise<DecodedSequenceFrame> {
    if (index !== this._composed) {
      if (index !== this._composed + 1) {
        // Composition is stateful, so a non-sequential request replays from the start.
        this._restart();

        for (let replay = 0; replay < index; replay++) {
          await this._composeFrame(replay);
        }
      }

      await this._composeFrame(index);
    }

    return {
      image: this._canvas,
      width: this._animation.width,
      height: this._animation.height,
      durationMs: this._frames[index]!.durationMs,
      release: noop,
    };
  }

  private async _composeFrame(index: number): Promise<void> {
    const bitmap = await this._takeBitmap(index);

    if (this._closed) {
      bitmap.close();

      throw new Error('The animation decoder was closed.');
    }

    this._compose(index, bitmap);
    bitmap.close();
    this._composed = index;
    this._startPrefetch((index + 1) % this.frameCount);
  }

  public close(): void {
    this._closed = true;

    const pending = this._prefetch;

    this._prefetch = null;
    void pending?.bitmap.then(bitmap => bitmap.close(), noop);
    this._canvas.width = 0;
    this._backup.canvas.width = 0;
  }

  private _restart(): void {
    this._context.clearRect(0, 0, this._animation.width, this._animation.height);
    this._hasBackup = false;
    this._composed = -1;
  }

  private _takeBitmap(index: number): Promise<ImageBitmap> {
    const pending = this._prefetch;

    if (pending !== null && pending.index === index) {
      this._prefetch = null;

      return pending.bitmap;
    }

    void pending?.bitmap.then(bitmap => bitmap.close(), noop);
    this._prefetch = null;

    return this._decodeBitmap(index);
  }

  private _startPrefetch(index: number): void {
    if (!this._closed && this._prefetch === null) {
      const bitmap = this._decodeBitmap(index);

      bitmap.catch(noop);
      this._prefetch = { index, bitmap };
    }
  }

  private _decodeBitmap(index: number): Promise<ImageBitmap> {
    const frame = this._frames[index]!;

    return createImageBitmap(new Blob([frame.still() as BlobPart], { type: frame.stillType }), {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
  }

  private _compose(index: number, bitmap: ImageBitmap): void {
    const context = this._context;
    const frame = this._frames[index]!;
    const previous = index === 0 ? null : this._frames[index - 1]!;

    // The previous frame's disposal applies before this frame is drawn.
    if (previous !== null) {
      if (previous.dispose === 'background') {
        context.clearRect(previous.x, previous.y, previous.width, previous.height);
      } else if (previous.dispose === 'previous') {
        if (this._hasBackup) {
          context.globalCompositeOperation = 'copy';
          context.drawImage(this._backup.canvas, 0, 0);
          context.globalCompositeOperation = 'source-over';
        } else {
          // Nothing precedes the first frame to restore.
          context.clearRect(previous.x, previous.y, previous.width, previous.height);
        }
      }
    }

    // A "previous" disposal on the first frame behaves as "background".
    if (frame.dispose === 'previous' && index > 0) {
      this._backup.context.globalCompositeOperation = 'copy';
      this._backup.context.drawImage(this._canvas, 0, 0);
      this._backup.context.globalCompositeOperation = 'source-over';
      this._hasBackup = true;
    } else {
      this._hasBackup = false;
    }

    if (frame.blend === 'source') {
      context.clearRect(frame.x, frame.y, frame.width, frame.height);
    }

    context.drawImage(bitmap, frame.x, frame.y);
  }
}

const noop = (): void => undefined;
