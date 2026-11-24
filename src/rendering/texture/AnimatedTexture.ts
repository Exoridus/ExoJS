import { ImageSequenceSource } from './ImageSequenceSource';
import { Texture } from './Texture';
import type { TextureOptions } from './TextureOptions';

/**
 * A path-backed texture with explicit playback controls for GIF, APNG and
 * animated WebP. A plain Texture(path) also plays these formats automatically;
 * use this class only when the caller needs pause, rate or loop control.
 *
 * Like Texture, the constructor yields an idle handle. Attach it to a scene
 * or pass it to scene.assets.load(...) to claim its source.
 */
export class AnimatedTexture extends Texture {
  private _pendingPlaying: boolean | undefined;
  private _pendingRate: number | undefined;
  private _pendingLoop: boolean | undefined;

  public constructor(path: string, options?: Partial<TextureOptions>) {
    super(path, options);
  }

  private get _sequence(): ImageSequenceSource | null {
    const source = this._getFrameSource();

    return source instanceof ImageSequenceSource ? source : null;
  }

  /** Whether the shared animation is currently advancing. `false` before it has loaded. */
  public get playing(): boolean {
    return this._sequence?.playing ?? false;
  }

  /**
   * Resumes playback, restarting from the first frame when a non-looping animation had finished.
   * Playback state belongs to the loaded animation: every handle sharing the same loaded asset
   * advances, pauses and changes rate together, while separately loaded assets are independent.
   */
  public play(): this {
    const sequence = this._sequence;

    if (sequence === null) {
      this._pendingPlaying = true;
    } else {
      sequence.play();
    }

    return this;
  }

  /** Freezes the animation on its current frame; resuming continues the unplayed part of that frame. */
  public pause(): this {
    const sequence = this._sequence;

    if (sequence === null) {
      this._pendingPlaying = false;
    } else {
      sequence.pause();
    }

    return this;
  }

  /** Speed multiplier applied to every authored frame duration. Must be positive and finite. */
  public get playbackRate(): number {
    return this._sequence?.playbackRate ?? this._pendingRate ?? 1;
  }

  public set playbackRate(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError('AnimatedTexture playbackRate must be positive and finite.');
    }

    const sequence = this._sequence;

    if (sequence === null) {
      this._pendingRate = value;
    } else {
      sequence.playbackRate = value;
    }
  }

  /** `true` (default) repeats as often as the file authors; `false` plays the sequence once. */
  public get loop(): boolean {
    return this._sequence?.loop ?? this._pendingLoop ?? true;
  }

  public set loop(value: boolean) {
    const sequence = this._sequence;

    if (sequence === null) {
      this._pendingLoop = value;
    } else {
      sequence.loop = value;
    }
  }

  /** Ensure playback options set before loading are applied to the resident animation. @internal */
  public override _copyPayloadFrom(donor: Texture): this {
    super._copyPayloadFrom(donor);
    const sequence = this._sequence;

    if (sequence !== null) {
      // Only explicit requests made while unloaded belong to this fill.
      // An untouched handle must observe the existing shared playback state.
      if (this._pendingRate !== undefined) {
        sequence.playbackRate = this._pendingRate;
      }

      if (this._pendingLoop !== undefined) {
        sequence.loop = this._pendingLoop;
      }

      if (this._pendingPlaying === true) {
        sequence.play();
      } else if (this._pendingPlaying === false) {
        sequence.pause();
      }

      this._pendingRate = undefined;
      this._pendingLoop = undefined;
      this._pendingPlaying = undefined;
    }

    return this;
  }
}
