import { Signal } from '#core/Signal';
import type { Time } from '#core/Time';
import type { Rectangle } from '#math/Rectangle';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';

import { Sprite } from './Sprite';
import type { Spritesheet } from './Spritesheet';

/** Definition for a single animation clip registered on an {@link AnimatedSprite}. */
export interface AnimatedSpriteClipDefinition {
  readonly frames: readonly Rectangle[];
  readonly fps?: number;
  readonly loop?: boolean;
  /**
   * Per-frame hold duration in milliseconds, indexed the same as `frames`.
   * When provided it is authoritative for playback timing and `fps` is
   * ignored while advancing frames (still accepted as a display-only
   * average). Use this to preserve uneven hold-frames — e.g. an Aseprite
   * export where one frame intentionally lingers longer than the rest.
   */
  readonly frameDurations?: readonly number[];
}

/** Per-call options passed to {@link AnimatedSprite.play}. */
export interface AnimatedSpritePlayOptions {
  loop?: boolean;
  restart?: boolean;
}

interface NormalizedAnimatedSpriteClip {
  readonly frames: readonly Rectangle[];
  readonly frameDurationMs: number;
  readonly frameDurations: readonly number[] | null;
  readonly loop: boolean;
}

const defaultClipFps = 12;

/**
 * A {@link Sprite} that advances through a sequence of texture-frame
 * {@link Rectangle}s over time to produce frame-based animation.
 *
 * Multiple named clips can be registered via {@link defineClip} or the
 * constructor. Call {@link play} to start a clip; call {@link update} each
 * frame with the elapsed delta (seconds or a `Time` object) to advance
 * playback. The `onFrame` signal fires on every frame advance and
 * `onComplete` fires when a non-looping clip reaches its last frame.
 *
 * Use {@link AnimatedSprite.fromSpritesheet} to create an instance directly
 * from a {@link Spritesheet}'s named animations.
 */
export class AnimatedSprite extends Sprite {
  private readonly _clips = new Map<string, NormalizedAnimatedSpriteClip>();
  private _currentClipName: string | null = null;
  private _currentFrameIndex = 0;
  private _playing = false;
  private _loopOverride: boolean | null = null;
  private _elapsedFrameTimeMs = 0;

  public readonly onComplete = new Signal<[clip: string]>();
  public readonly onFrame = new Signal<[clip: string, frame: number]>();

  public constructor(texture: Texture | RenderTexture | null, clips?: Readonly<Record<string, AnimatedSpriteClipDefinition>>) {
    super(texture);

    if (clips) {
      this.setClips(clips);
    }
  }

  public get currentClip(): string | null {
    return this._currentClipName;
  }

  public get currentFrame(): number {
    return this._currentFrameIndex;
  }

  public get playing(): boolean {
    return this._playing;
  }

  /**
   * Whether the current clip loops. Returns the per-call loop override if set,
   * otherwise the clip's own `loop` flag.
   */
  public get loop(): boolean {
    if (this._loopOverride !== null) {
      return this._loopOverride;
    }

    if (!this._currentClipName) {
      return false;
    }

    return this._clips.get(this._currentClipName)?.loop ?? false;
  }

  public set loop(loop: boolean) {
    this._loopOverride = loop;
  }

  /** Replace all registered clips with the provided map. Clears any previously registered clips first. */
  public setClips(clips: Readonly<Record<string, AnimatedSpriteClipDefinition>>): this {
    this._clips.clear();

    for (const [name, clip] of Object.entries(clips)) {
      this.defineClip(name, clip);
    }

    return this;
  }

  /** Register a named clip. Frame rectangles are cloned so the caller may mutate the originals. */
  public defineClip(name: string, clip: AnimatedSpriteClipDefinition): this {
    if (name.trim().length === 0) {
      throw new Error('AnimatedSprite clip names must be non-empty strings.');
    }

    // Read the frames into a typed local first: `Array.isArray` narrows the
    // `readonly Rectangle[]` to `any[]` on whichever reference it tests, so the
    // runtime guard runs against the property while `.map` reads the typed local.
    const frames: readonly Rectangle[] = clip.frames;

    if (!Array.isArray(clip.frames) || frames.length === 0) {
      throw new Error(`AnimatedSprite clip "${name}" must define at least one frame.`);
    }

    const fps = clip.fps ?? defaultClipFps;

    if (!Number.isFinite(fps) || fps <= 0) {
      throw new Error(`AnimatedSprite clip "${name}" has an invalid fps value (${fps}).`);
    }

    let frameDurations: readonly number[] | null = null;

    if (clip.frameDurations) {
      if (clip.frameDurations.length !== frames.length) {
        throw new Error(`AnimatedSprite clip "${name}" frameDurations length (${clip.frameDurations.length}) must match its frame count (${frames.length}).`);
      }

      for (const duration of clip.frameDurations) {
        if (!Number.isFinite(duration) || duration <= 0) {
          throw new Error(`AnimatedSprite clip "${name}" has an invalid frameDurations value (${duration}).`);
        }
      }

      frameDurations = [...clip.frameDurations];
    }

    this._clips.set(name, {
      frames: frames.map(frame => frame.clone()),
      frameDurationMs: 1000 / fps,
      frameDurations,
      loop: clip.loop ?? true,
    });

    return this;
  }

  /**
   * Returns the registered clips as serializable definitions (frames as
   * {@link Rectangle}s, `fps`, `loop`, and `frameDurations` when the clip has
   * one). Used by scene serialization to read back clip state the normalized
   * internal store no longer exposes directly.
   * @internal
   */
  public _getClipDefinitions(): Record<string, Required<Pick<AnimatedSpriteClipDefinition, 'frames' | 'loop'>> & AnimatedSpriteClipDefinition> {
    const out: Record<string, Required<Pick<AnimatedSpriteClipDefinition, 'frames' | 'loop'>> & AnimatedSpriteClipDefinition> = {};

    for (const [name, clip] of this._clips) {
      out[name] = {
        frames: clip.frames.map(frame => frame.clone()),
        fps: 1000 / clip.frameDurationMs,
        loop: clip.loop,
        ...(clip.frameDurations ? { frameDurations: [...clip.frameDurations] } : {}),
      };
    }

    return out;
  }

  /** Remove a registered clip by name. Stops playback first if the clip is currently active. */
  public removeClip(name: string): this {
    if (this._currentClipName === name) {
      this.stop();
    }

    this._clips.delete(name);

    return this;
  }

  /**
   * Start playing the named clip. By default restarts from frame 0; pass
   * `{ restart: false }` to resume from the current frame if the same clip
   * is already active. Optionally overrides the clip's loop setting.
   */
  public play(name: string, options: AnimatedSpritePlayOptions = {}): this {
    const clip = this._clips.get(name);

    if (!clip) {
      throw new Error(`AnimatedSprite clip "${name}" is not defined.`);
    }

    const isSameClip = this._currentClipName === name;
    const shouldRestart = options.restart ?? true;

    if (!isSameClip || shouldRestart) {
      this._currentClipName = name;
      this._currentFrameIndex = 0;
      this._elapsedFrameTimeMs = 0;
      // Normalized clips always hold at least one frame.
      this._applyFrame(clip.frames[0]!);
      this.onFrame.dispatch(name, 0);
    }

    this._loopOverride = options.loop ?? this._loopOverride;
    this._playing = true;

    return this;
  }

  /** Stop playback and rewind the active clip to frame 0. */
  public stop(): this {
    this._playing = false;
    this._elapsedFrameTimeMs = 0;

    if (!this._currentClipName) {
      return this;
    }

    const clip = this._clips.get(this._currentClipName);

    if (clip && clip.frames.length > 0) {
      this._currentFrameIndex = 0;
      // Guarded non-empty above.
      this._applyFrame(clip.frames[0]!);
      this.onFrame.dispatch(this._currentClipName, 0);
    }

    return this;
  }

  public pause(): this {
    this._playing = false;

    return this;
  }

  public resume(): this {
    if (this._currentClipName !== null) {
      this._playing = true;
    }

    return this;
  }

  /**
   * Advance playback by `delta` milliseconds (or a `Time` object). Call once
   * per frame from the game loop. Dispatches `onFrame` for each frame
   * boundary crossed and `onComplete` when a non-looping clip ends.
   */
  public update(delta: Time | number): this {
    if (!this._playing || this._currentClipName === null) {
      return this;
    }

    const clip = this._clips.get(this._currentClipName);

    if (!clip || clip.frames.length <= 1) {
      return this;
    }

    const deltaMs = typeof delta === 'number' ? delta : delta.milliseconds;

    if (deltaMs <= 0) {
      return this;
    }

    this._elapsedFrameTimeMs += deltaMs;

    // The hold duration for the frame CURRENTLY displayed determines how long
    // it takes to advance past it. `frameDurations`, when present, overrides
    // the clip's uniform `frameDurationMs` per frame — re-read after every
    // index change below rather than cached once, since it depends on
    // `_currentFrameIndex`.
    let thresholdMs = clip.frameDurations?.[this._currentFrameIndex] ?? clip.frameDurationMs;

    while (this._elapsedFrameTimeMs >= thresholdMs) {
      this._elapsedFrameTimeMs -= thresholdMs;

      const nextFrame = this._currentFrameIndex + 1;

      if (nextFrame >= clip.frames.length) {
        if (this.loop) {
          this._currentFrameIndex = 0;
          // clip has > 1 frame here (early-returned otherwise).
          this._applyFrame(clip.frames[0]!);
          this.onFrame.dispatch(this._currentClipName, 0);
          thresholdMs = clip.frameDurations?.[this._currentFrameIndex] ?? clip.frameDurationMs;
          continue;
        }

        this._currentFrameIndex = clip.frames.length - 1;
        // In-bounds: last frame index.
        this._applyFrame(clip.frames[this._currentFrameIndex]!);
        this._playing = false;
        this.onComplete.dispatch(this._currentClipName);

        break;
      }

      this._currentFrameIndex = nextFrame;
      // In-bounds: nextFrame < frames.length.
      this._applyFrame(clip.frames[this._currentFrameIndex]!);
      this.onFrame.dispatch(this._currentClipName, this._currentFrameIndex);
      thresholdMs = clip.frameDurations?.[this._currentFrameIndex] ?? clip.frameDurationMs;
    }

    return this;
  }

  public override destroy(): void {
    super.destroy();

    this.onComplete.destroy();
    this.onFrame.destroy();

    for (const clip of this._clips.values()) {
      for (const frame of clip.frames) {
        frame.destroy();
      }
    }

    this._clips.clear();
  }

  /**
   * Construct an {@link AnimatedSprite} from the named animations defined on
   * a {@link Spritesheet}. Each animation becomes a looping clip whose frames
   * are the spritesheet frame rectangles in declaration order.
   */
  public static fromSpritesheet(spritesheet: Spritesheet): AnimatedSprite {
    const clips: Record<string, AnimatedSpriteClipDefinition> = {};

    for (const [clipName, frameNames] of spritesheet.animations) {
      clips[clipName] = {
        frames: frameNames.map(frameName => spritesheet.getFrame(frameName)),
        loop: true,
      };
    }

    return new AnimatedSprite(spritesheet.texture, clips);
  }

  private _applyFrame(frame: Rectangle): void {
    this.setTextureFrame(frame, false);
  }
}
