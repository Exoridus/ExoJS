import { AnimatedSprite, type AnimatedSpriteClipDefinition, Spritesheet, type Texture } from '@codexo/exojs';

import { type AsepriteData, type AsepriteFrameData, type AsepriteFrameTag, type AsepriteSlice,isAsepriteArrayData } from './AsepriteData';

/**
 * Normalises an {@link AsepriteData} document into an ordered array of
 * {@link AsepriteFrameData} entries regardless of whether the JSON was
 * produced in array or hash mode.
 */
function normaliseFrames(data: AsepriteData): AsepriteFrameData[] {
  if (isAsepriteArrayData(data)) {
    return [...data.frames];
  }

  return Object.values(data.frames);
}

/**
 * Expands a frame tag's inclusive `[from, to]` range into the ordered
 * sequence of frame indices it actually plays, according to its
 * {@link AsepriteDirection}. Indices are not bounds-checked against the
 * frame array here; callers filter out-of-range entries separately.
 *
 * - `forward`: `[from, from+1, ..., to]`.
 * - `reverse`: `[to, to-1, ..., from]`.
 * - `pingpong`: a forward pass followed by a backward pass that excludes
 *   both endpoints, e.g. `[0,1,2]` becomes `[0,1,2,1]`.
 * - `pingpong_reverse`: the mirrored shape, starting from `to`.
 * - A single-frame tag (`from === to`) always yields just that one frame.
 */
function expandFrameIndices(tag: AsepriteFrameTag): number[] {
  const { from, to } = tag;

  if (from === to) {
    return [from];
  }

  const indices: number[] = [];

  switch (tag.direction) {
    case 'reverse':
      for (let i = to; i >= from; i--) indices.push(i);
      break;

    case 'pingpong':
      for (let i = from; i <= to; i++) indices.push(i);
      for (let i = to - 1; i > from; i--) indices.push(i);
      break;

    case 'pingpong_reverse':
      for (let i = to; i >= from; i--) indices.push(i);
      for (let i = from + 1; i < to; i++) indices.push(i);
      break;

    case 'forward':
    default:
      for (let i = from; i <= to; i++) indices.push(i);
      break;
  }

  return indices;
}

/**
 * Calculates the average frames-per-second for a sequence of frame indices,
 * based on the per-frame `duration` field (milliseconds per frame) exported
 * by Aseprite. Every occurrence of an index counts toward the average — for
 * ping-pong sequences that means repeated (bounced) frames are weighted twice.
 * Falls back to `12` fps when all durations are zero or the sequence is empty.
 */
function avgFps(frameArray: AsepriteFrameData[], indices: number[]): number {
  const durations = indices.filter(i => i >= 0 && i < frameArray.length).map(i => frameArray[i]!.duration);

  if (durations.length === 0) {
    return 12;
  }

  const totalMs = durations.reduce((sum, d) => sum + d, 0);
  const avgMs = totalMs / durations.length;

  return avgMs > 0 ? 1000 / avgMs : 12;
}

/**
 * Parsed representation of an Aseprite JSON sprite sheet export.
 *
 * `AsepriteSheet.parse(data, texture)` converts the raw JSON document into:
 * - A {@link Spritesheet} whose frames correspond to the Aseprite frame array
 *   (keyed by zero-based index string: `"0"`, `"1"`, …).
 * - A `clips` map of {@link AnimatedSpriteClipDefinition} entries built from
 *   `meta.frameTags`, one per named tag.
 *
 * Call {@link createAnimatedSprite} to obtain a ready-to-use
 * {@link AnimatedSprite} with all clips pre-registered.
 *
 * @example
 * ```ts
 * const sheet = await loader.load(AsepriteSheet, 'hero.aseprite.json');
 * const sprite = sheet.createAnimatedSprite();
 * sprite.play('run');
 * scene.addChild(sprite);
 * ```
 */
export class AsepriteSheet {
  /** The underlying {@link Spritesheet} whose frames are keyed by index string. */
  public readonly spritesheet: Spritesheet;

  /**
   * Animation clips derived from the Aseprite `frameTags` metadata.
   * Each clip's frames are live references into {@link spritesheet.frames};
   * they are cloned automatically when passed to {@link AnimatedSprite.defineClip}.
   */
  public readonly clips: ReadonlyMap<string, AnimatedSpriteClipDefinition>;

  /**
   * Named slices from the Aseprite `meta.slices` metadata, keyed by slice
   * name. Slices describe editor-defined regions — hitboxes, nine-patch
   * borders, UI anchor points — that aren't part of the frame/animation
   * data itself. Each {@link AsepriteSlice} carries one {@link AsepriteSliceKey}
   * per frame at which its bounds change; consumers resolve the applicable
   * key for a given frame index themselves.
   */
  public readonly slices: ReadonlyMap<string, AsepriteSlice>;

  /**
   * @internal — use {@link AsepriteSheet.parse} to create instances.
   * The public modifier is required for the Loader's `AssetConstructor` token
   * contract; users should call `parse()` instead of constructing directly.
   */
  public constructor(spritesheet: Spritesheet, clips: ReadonlyMap<string, AnimatedSpriteClipDefinition>, slices: ReadonlyMap<string, AsepriteSlice>) {
    this.spritesheet = spritesheet;
    this.clips = clips;
    this.slices = slices;
  }

  /**
   * Parse a raw {@link AsepriteData} document and the already-loaded
   * {@link Texture} into an {@link AsepriteSheet}.
   *
   * Supports both Aseprite array mode and hash mode. Frame indices from
   * `frameTags` are resolved against the ordered frame array; out-of-range
   * indices are silently skipped.
   *
   * A tag's `direction` determines the expanded frame sequence fed into the
   * clip — `forward` and `reverse` play the `[from, to]` range in order or
   * in reverse, while `pingpong`/`pingpong_reverse` append a backward pass
   * (excluding both endpoints) so the bounce plays back correctly on the
   * engine's forward-only {@link AnimatedSprite} playback. A clip loops
   * (`loop: true`) unless the tag's `repeat` is exactly `"1"`, in which case
   * it plays once (`loop: false`).
   *
   * Each clip's `frameDurations` carries the real per-frame `duration` from
   * the export (falling back to the tag's average when a frame's duration is
   * non-positive), so uneven hold-frames survive into playback instead of
   * being flattened to a uniform fps. `frameOffsets` carries each frame's
   * `spriteSourceSize` `{x,y}` — its trimmed content's offset within the
   * untrimmed canvas — whenever any frame in the tag is trimmed, so frames
   * trimmed by different amounts stay anchored instead of jittering; it's
   * omitted entirely for tags with no trimmed frames.
   */
  public static parse(data: AsepriteData, texture: Texture): AsepriteSheet {
    const frameArray = normaliseFrames(data);

    // Build SpritesheetData: frame names are zero-based index strings.
    const spritesheetFrames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> = {};

    for (let i = 0; i < frameArray.length; i++) {
      const frameData = frameArray[i]!;
      spritesheetFrames[String(i)] = { frame: frameData.frame };
    }

    const spritesheet = new Spritesheet(texture, { frames: spritesheetFrames });

    // Build clips from frameTags, resolving frame indices into Rectangles.
    const clips = new Map<string, AnimatedSpriteClipDefinition>();
    const frameTags = data.meta.frameTags ?? [];

    for (const tag of frameTags) {
      // Out-of-range indices are silently skipped; `validIndices` parallels
      // `frames` exactly, so it's the basis for every other per-frame array
      // (durations, offsets) built below.
      const validIndices = expandFrameIndices(tag).filter(i => i >= 0 && i < frameArray.length);
      const frames = validIndices.map(i => spritesheet.getFrame(String(i)));

      if (frames.length === 0) {
        continue;
      }

      // `repeat === '1'` is an explicit one-shot. Any other finite N (e.g. '2',
      // '3') falls back to an infinite loop pending engine `loopCount` support.
      const loop = tag.repeat !== '1';
      const fps = avgFps(frameArray, validIndices);

      // Per-frame hold duration (Aseprite "duration"), so uneven hold-frames
      // (e.g. a lingering idle frame) survive into playback instead of being
      // flattened to the tag's average fps. A non-positive duration (same
      // degenerate case `avgFps` guards against) falls back to the average.
      const avgDurationFallback = 1000 / fps;
      const frameDurations = validIndices.map(i => {
        const duration = frameArray[i]!.duration;

        return duration > 0 ? duration : avgDurationFallback;
      });

      // Per-frame trim offset (Aseprite "spriteSourceSize"), so frames trimmed
      // by different amounts stay anchored to the same point in the untrimmed
      // canvas instead of jittering frame to frame. Omitted entirely when no
      // frame in the tag is trimmed, to avoid noise on untrimmed sheets.
      const anyTrimmed = validIndices.some(i => frameArray[i]!.trimmed);
      const frameOffsets = anyTrimmed
        ? validIndices.map(i => {
            const { x, y } = frameArray[i]!.spriteSourceSize;

            return { x, y };
          })
        : undefined;

      clips.set(tag.name, {
        fps,
        frames,
        loop,
        frameDurations,
        ...(frameOffsets ? { frameOffsets } : {}),
      });
    }

    // Build the slices map from meta.slices, keyed by slice name.
    const slices = new Map<string, AsepriteSlice>();

    for (const slice of data.meta.slices ?? []) {
      slices.set(slice.name, slice);
    }

    return new AsepriteSheet(spritesheet, clips, slices);
  }

  /**
   * Create an {@link AnimatedSprite} with all frame-tag clips pre-defined.
   *
   * Each clip is registered via {@link AnimatedSprite.defineClip}, which
   * clones the frame {@link Rectangle}s so the sprite owns its own copies.
   * Call {@link AnimatedSprite.play} with a tag name to start playback.
   */
  public createAnimatedSprite(): AnimatedSprite {
    const sprite = new AnimatedSprite(this.spritesheet.texture);

    for (const [name, clip] of this.clips) {
      sprite.defineClip(name, clip);
    }

    return sprite;
  }

  /** Destroy the underlying {@link Spritesheet} and release its frame resources. */
  public destroy(): void {
    this.spritesheet.destroy();
  }
}
