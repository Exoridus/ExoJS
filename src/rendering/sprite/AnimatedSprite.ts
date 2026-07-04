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
  /**
   * How many full cycles (advancing through every frame once counts as one
   * cycle) the clip plays before stopping and dispatching `onComplete`.
   * `-1` (the default when omitted) loops indefinitely; `1` plays once; any
   * other positive integer plays exactly that many times. Use this to
   * preserve Aseprite's frame-tag `repeat` count (e.g. an attack that should
   * play exactly twice, not once or forever).
   */
  readonly repeat?: number;
  /**
   * Per-frame hold duration in milliseconds, indexed the same as `frames`.
   * When provided it is authoritative for playback timing and `fps` is
   * ignored while advancing frames (still accepted as a display-only
   * average). Use this to preserve uneven hold-frames — e.g. an Aseprite
   * export where one frame intentionally lingers longer than the rest.
   */
  readonly frameDurations?: readonly number[];
  /**
   * Per-frame local translation in local (pre-scale) pixels, indexed the
   * same as `frames`, applied on top of the sprite's own position/origin.
   * Use this to keep frames anchored to a stable point when a source atlas
   * trims frames to different sizes (Aseprite's `spriteSourceSize`) — without
   * it, differently-trimmed frames would jitter around their own top-left.
   */
  readonly frameOffsets?: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

/** Per-call options passed to {@link AnimatedSprite.play}. */
export interface AnimatedSpritePlayOptions {
  /** Per-call override of the clip's {@link AnimatedSpriteClipDefinition.repeat}, for the duration of this `play()` call. */
  repeat?: number;
  restart?: boolean;
}

interface NormalizedAnimatedSpriteClip {
  readonly frames: readonly Rectangle[];
  readonly frameDurationMs: number;
  readonly frameDurations: readonly number[] | null;
  readonly frameOffsets: ReadonlyArray<{ readonly x: number; readonly y: number }> | null;
  readonly repeat: number;
}

const defaultClipFps = 12;

/** Sentinel {@link AnimatedSpriteClipDefinition.repeat}/{@link AnimatedSprite.repeat} value meaning "loop indefinitely"; also the default when `repeat` is omitted. */
const infiniteRepeat = -1;

/**
 * Throws if `repeat` is not `infiniteRepeat` (`-1`) or a positive integer.
 * Shared by {@link AnimatedSprite.defineClip}, the {@link AnimatedSprite.repeat}
 * setter, and {@link AnimatedSprite.play}'s `options.repeat` so every entry
 * point rejects the same invalid values consistently.
 */
function assertValidRepeat(context: string, repeat: number): void {
  if (!Number.isInteger(repeat) || (repeat !== infiniteRepeat && repeat < 1)) {
    throw new Error(`AnimatedSprite ${context} has an invalid repeat value (${repeat}). Must be ${infiniteRepeat} (infinite) or a positive integer.`);
  }
}

/**
 * A {@link Sprite} that advances through a sequence of texture-frame
 * {@link Rectangle}s over time to produce frame-based animation.
 *
 * Multiple named clips can be registered via {@link defineClip} or the
 * constructor. Call {@link play} to start a clip; call {@link update} each
 * frame with the elapsed delta (seconds or a `Time` object) to advance
 * playback. The `onFrame` signal fires on every frame advance and
 * `onComplete` fires when a clip completes its final {@link AnimatedSpriteClipDefinition.repeat} cycle.
 *
 * Use {@link AnimatedSprite.fromSpritesheet} to create an instance directly
 * from a {@link Spritesheet}'s named animations.
 */
export class AnimatedSprite extends Sprite {
  private readonly _clips = new Map<string, NormalizedAnimatedSpriteClip>();
  private _currentClipName: string | null = null;
  private _currentFrameIndex = 0;
  private _hasAppliedFrame = false;
  private _playing = false;
  private _repeatOverride: number | null = null;
  private _elapsedFrameTimeMs = 0;
  private _completedCycles = 0;

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
   * How many cycles the current clip plays before stopping. Returns the
   * per-call override if set via {@link play} or this setter, otherwise the
   * clip's own `repeat` value (or `-1` if no clip is active).
   */
  public get repeat(): number {
    if (this._repeatOverride !== null) {
      return this._repeatOverride;
    }

    if (!this._currentClipName) {
      return infiniteRepeat;
    }

    return this._clips.get(this._currentClipName)?.repeat ?? infiniteRepeat;
  }

  public set repeat(repeat: number) {
    assertValidRepeat('repeat', repeat);

    this._repeatOverride = repeat;
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

    const repeat = clip.repeat ?? infiniteRepeat;

    assertValidRepeat(`clip "${name}"`, repeat);

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

    let frameOffsets: ReadonlyArray<{ readonly x: number; readonly y: number }> | null = null;

    if (clip.frameOffsets) {
      if (clip.frameOffsets.length !== frames.length) {
        throw new Error(`AnimatedSprite clip "${name}" frameOffsets length (${clip.frameOffsets.length}) must match its frame count (${frames.length}).`);
      }

      for (const offset of clip.frameOffsets) {
        if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) {
          throw new Error(`AnimatedSprite clip "${name}" has an invalid frameOffsets value (${JSON.stringify(offset)}).`);
        }
      }

      frameOffsets = clip.frameOffsets.map(offset => ({ x: offset.x, y: offset.y }));
    }

    this._clips.set(name, {
      frames: frames.map(frame => frame.clone()),
      frameDurationMs: 1000 / fps,
      frameDurations,
      frameOffsets,
      repeat,
    });

    return this;
  }

  /**
   * Returns the registered clips as serializable definitions (frames as
   * {@link Rectangle}s, `fps`, `repeat`, and `frameDurations`/`frameOffsets`
   * when the clip has them). Used by scene serialization to read back clip
   * state the normalized internal store no longer exposes directly.
   * @internal
   */
  public _getClipDefinitions(): Record<string, Required<Pick<AnimatedSpriteClipDefinition, 'frames' | 'repeat'>> & AnimatedSpriteClipDefinition> {
    const out: Record<string, Required<Pick<AnimatedSpriteClipDefinition, 'frames' | 'repeat'>> & AnimatedSpriteClipDefinition> = {};

    for (const [name, clip] of this._clips) {
      out[name] = {
        frames: clip.frames.map(frame => frame.clone()),
        fps: 1000 / clip.frameDurationMs,
        repeat: clip.repeat,
        ...(clip.frameDurations ? { frameDurations: [...clip.frameDurations] } : {}),
        ...(clip.frameOffsets ? { frameOffsets: clip.frameOffsets.map(offset => ({ x: offset.x, y: offset.y })) } : {}),
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
   * is already active. Optionally overrides the clip's `repeat` setting.
   */
  public play(name: string, options: AnimatedSpritePlayOptions = {}): this {
    const clip = this._clips.get(name);

    if (!clip) {
      throw new Error(`AnimatedSprite clip "${name}" is not defined.`);
    }

    if (options.repeat !== undefined) {
      assertValidRepeat('play() options.repeat', options.repeat);
    }

    const isSameClip = this._currentClipName === name;
    const shouldRestart = options.restart ?? true;

    if (!isSameClip || shouldRestart) {
      this._currentClipName = name;
      this._currentFrameIndex = 0;
      this._elapsedFrameTimeMs = 0;
      this._completedCycles = 0;
      // Normalized clips always hold at least one frame.
      this._applyFrame(clip, 0);
      this.onFrame.dispatch(name, 0);
    }

    this._repeatOverride = options.repeat ?? this._repeatOverride;
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
      this._applyFrame(clip, 0);
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
   * boundary crossed and `onComplete` when the clip completes its final
   * {@link AnimatedSpriteClipDefinition.repeat} cycle.
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
        // `repeat` is the single source of truth for whether playback wraps.
        // Infinite always wraps; a finite count wraps until it has completed
        // that many full cycles, then stops on the same path play-once used to.
        const activeRepeat = this._repeatOverride ?? clip.repeat;
        let shouldWrap: boolean;

        if (activeRepeat === infiniteRepeat) {
          shouldWrap = true;
        } else {
          this._completedCycles++;
          shouldWrap = this._completedCycles < activeRepeat;
        }

        if (shouldWrap) {
          this._currentFrameIndex = 0;
          // clip has > 1 frame here (early-returned otherwise).
          this._applyFrame(clip, 0);
          this.onFrame.dispatch(this._currentClipName, 0);
          thresholdMs = clip.frameDurations?.[this._currentFrameIndex] ?? clip.frameDurationMs;
          continue;
        }

        this._currentFrameIndex = clip.frames.length - 1;
        // In-bounds: last frame index.
        this._applyFrame(clip, this._currentFrameIndex);
        this._playing = false;
        this.onComplete.dispatch(this._currentClipName);

        break;
      }

      this._currentFrameIndex = nextFrame;
      // In-bounds: nextFrame < frames.length.
      this._applyFrame(clip, this._currentFrameIndex);
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
   * a {@link Spritesheet}. Each animation becomes an indefinitely-looping
   * clip whose frames are the spritesheet frame rectangles in declaration
   * order.
   */
  public static fromSpritesheet(spritesheet: Spritesheet): AnimatedSprite {
    const clips: Record<string, AnimatedSpriteClipDefinition> = {};

    for (const [clipName, frameNames] of spritesheet.animations) {
      clips[clipName] = {
        frames: frameNames.map(frameName => spritesheet.getFrame(frameName)),
      };
    }

    return new AnimatedSprite(spritesheet.texture, clips);
  }

  /**
   * Apply the clip's frame at `frameIndex` to the sprite's texture region,
   * and — when the clip defines `frameOffsets` — translate the local quad by
   * that frame's `{x,y}` on top of the sprite's own position/origin. The
   * offset lives entirely in local (pre-scale) space via {@link getLocalBounds},
   * so it composes correctly under rotation/scale and never mutates the
   * public `x`/`y`/`origin` a caller set.
   */
  private _applyFrame(clip: NormalizedAnimatedSpriteClip, frameIndex: number): void {
    // In-bounds by every call site's own guard.
    if (this._hasAppliedFrame) {
      // Frame-to-frame advance: keep the current pixel size so differently
      // sized frames don't visibly pop.
      this.setTextureFrame(clip.frames[frameIndex]!, false);
    } else {
      // First application: the sprite still shows the full source texture
      // (usually the whole atlas), so "keep the pixel size" would inflate the
      // scale by atlasSize/frameSize and the sprite would render blown up far
      // beyond the canvas. Snap the logical size to the frame instead — while
      // preserving the user's scale, which `resetSize` would reset to 1.
      const scaleX = this.scale.x;
      const scaleY = this.scale.y;
      this.setTextureFrame(clip.frames[frameIndex]!, true);
      this.scale.set(scaleX, scaleY);
      this._hasAppliedFrame = true;
    }

    const offset = clip.frameOffsets?.[frameIndex];

    if (offset) {
      this.getLocalBounds().setPosition(offset.x, offset.y);
      this._invalidateBoundsCascade();
    }
  }
}
