import { AnimatedSprite, type AnimatedSpriteClipDefinition, Rectangle, Spritesheet, type Texture } from '@codexo/exojs';

import { isAsepriteArrayData, type AsepriteData, type AsepriteFrameData } from './AsepriteData';

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
 * Calculates the average frames-per-second for a subset of frames, based on
 * the per-frame `duration` field (milliseconds per frame) exported by Aseprite.
 * Falls back to `12` fps when all durations are zero or the slice is empty.
 */
function avgFps(frames: AsepriteFrameData[], from: number, to: number): number {
  const slice = frames.slice(from, to + 1);

  if (slice.length === 0) {
    return 12;
  }

  const totalMs = slice.reduce((sum, f) => sum + f.duration, 0);
  const avgMs = totalMs / slice.length;

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
   * @internal — use {@link AsepriteSheet.parse} to create instances.
   * The public modifier is required for the Loader's `AssetConstructor` token
   * contract; users should call `parse()` instead of constructing directly.
   */
  public constructor(spritesheet: Spritesheet, clips: ReadonlyMap<string, AnimatedSpriteClipDefinition>) {
    this.spritesheet = spritesheet;
    this.clips = clips;
  }

  /**
   * Parse a raw {@link AsepriteData} document and the already-loaded
   * {@link Texture} into an {@link AsepriteSheet}.
   *
   * Supports both Aseprite array mode and hash mode. Frame indices from
   * `frameTags` are resolved against the ordered frame array; out-of-range
   * indices are silently skipped.
   *
   * Ping-pong directions (`pingpong`, `pingpong_reverse`) are recorded with
   * `loop: true` but the reversed segment is not automatically appended —
   * the clip plays only the declared `from`→`to` range.
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
      const frames: Rectangle[] = [];

      for (let i = tag.from; i <= tag.to; i++) {
        if (i >= 0 && i < frameArray.length) {
          frames.push(spritesheet.getFrame(String(i)));
        }
      }

      if (frames.length === 0) {
        continue;
      }

      clips.set(tag.name, {
        fps: avgFps(frameArray, tag.from, tag.to),
        frames,
        loop: true,
      });
    }

    return new AsepriteSheet(spritesheet, clips);
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
