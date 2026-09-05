import { AnimatedSprite, type AnimatedSpriteClipDefinition, Spritesheet, type Texture, Time } from '@codexo/exojs';

import { type AsepriteData, type AsepriteFrameData, type AsepriteFrameTag, type AsepriteLayer, type AsepriteSlice, isAsepriteArrayData } from './AsepriteData';

/**
 * Normalises an {@link AsepriteData} document into an ordered array of
 * {@link AsepriteFrameData} entries regardless of whether the JSON was
 * produced in array or hash mode.
 */
const normaliseFrames = (data: AsepriteData): AsepriteFrameData[] => {
  if (isAsepriteArrayData(data)) {
    return [...data.frames];
  }

  return Object.values(data.frames);
};

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
const expandFrameIndices = (tag: AsepriteFrameTag): number[] => {
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
};

/**
 * Calculates the average frames-per-second for a sequence of frame indices,
 * based on the per-frame `duration` field (milliseconds per frame) exported
 * by Aseprite. Every occurrence of an index counts toward the average - for
 * ping-pong sequences that means repeated (bounced) frames are weighted twice.
 * Falls back to `12` fps when all durations are zero or the sequence is empty.
 */
const avgFps = (frames: TaggedFrame[]): number => {
  if (frames.length === 0) {
    return 12;
  }

  const totalMs = frames.reduce((sum, { frameData }) => sum + frameData.duration, 0);
  const avgMs = totalMs / frames.length;

  return avgMs > 0 ? 1000 / avgMs : 12;
};

/**
 * A frame a tag actually resolved to, paired with the index it came from.
 * Resolving index and data together is what keeps every per-frame array below
 * (durations, offsets, spritesheet lookups) aligned without re-indexing.
 */
interface TaggedFrame {
  index: number;
  frameData: AsepriteFrameData;
}

/**
 * Resolves a tag's frame indices against the frame array, dropping any that
 * fall outside it - Aseprite exports can reference frames a later edit removed.
 */
const resolveTaggedFrames = (frameArray: AsepriteFrameData[], indices: number[]): TaggedFrame[] => {
  const resolved: TaggedFrame[] = [];

  for (const index of indices) {
    const frameData = frameArray[index];

    if (frameData !== undefined) {
      resolved.push({ index, frameData });
    }
  }

  return resolved;
};

/**
 * Parsed representation of an Aseprite JSON sprite sheet export.
 *
 * `AsepriteSheet.parse(data, texture)` converts the raw JSON document into:
 * - A {@link Spritesheet} whose frames correspond to the Aseprite frame array
 *   (keyed by zero-based index string: `"0"`, `"1"`, ...).
 * - A `clips` map of {@link AnimatedSpriteClipDefinition} entries built from
 *   `meta.frameTags`, one per named tag.
 * - The `slices` and `layers` metadata maps, carried through verbatim.
 *
 * Call {@link createAnimatedSprite} to obtain a ready-to-use
 * {@link AnimatedSprite} with all clips pre-registered.
 *
 * @example
 * ```ts
 * const sheet = await loader.load(Asset.type('asepriteSheet', 'hero.aseprite.json'));
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
   * they are cloned automatically when passed to {@link AnimatedSprite.addClip}.
   */
  public readonly clips: ReadonlyMap<string, AnimatedSpriteClipDefinition>;

  /**
   * Named slices from the Aseprite `meta.slices` metadata, keyed by slice
   * name. Slices describe editor-defined regions - hitboxes, nine-patch
   * borders, UI anchor points - that aren't part of the frame/animation
   * data itself. Each {@link AsepriteSlice} carries one {@link AsepriteSliceKey}
   * per frame at which its bounds change; consumers resolve the applicable
   * key for a given frame index themselves.
   */
  public readonly slices: ReadonlyMap<string, AsepriteSlice>;

  /**
   * Layers from the Aseprite `meta.layers` metadata, keyed by layer name and
   * in export order (bottom-most first). Aseprite packs the sheet already
   * composited, so these are descriptive rather than renderable: they tell a
   * consumer which layers went into a frame and how - opacity, blend mode,
   * editor user data - and {@link AsepriteLayer.group} names the enclosing
   * group layer, so the flat map still encodes the layer tree.
   *
   * Empty when the export carries no `meta.layers` block. Layer names are
   * unique within an Aseprite document, so keying by name loses nothing.
   */
  public readonly layers: ReadonlyMap<string, AsepriteLayer>;

  /**
   * @internal - use {@link AsepriteSheet.parse} to create instances.
   * The public modifier is required for the Loader's `AssetConstructor` token
   * contract; users should call `parse()` instead of constructing directly.
   */
  public constructor(
    spritesheet: Spritesheet,
    clips: ReadonlyMap<string, AnimatedSpriteClipDefinition>,
    slices: ReadonlyMap<string, AsepriteSlice>,
    layers: ReadonlyMap<string, AsepriteLayer> = new Map(),
  ) {
    this.spritesheet = spritesheet;
    this.clips = clips;
    this.slices = slices;
    this.layers = layers;
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
   * clip - `forward` and `reverse` play the `[from, to]` range in order or
   * in reverse, while `pingpong`/`pingpong_reverse` append a backward pass
   * (excluding both endpoints) so the bounce plays back correctly on the
   * engine's forward-only {@link AnimatedSprite} playback. The tag's
   * `repeat` field maps directly onto {@link AnimatedSpriteClipDefinition.repeat}:
   * absent means the clip loops indefinitely (`repeat: -1`); a numeric
   * string (`"1"`, `"2"`, ...) means it plays exactly that many full cycles
   * before stopping.
   *
   * Each clip's `frameDurations` carries the real per-frame `duration` from
   * the export (falling back to the tag's average when a frame's duration is
   * non-positive), so uneven hold-frames survive into playback instead of
   * being flattened to a uniform fps. `frameOffsets` carries each frame's
   * `spriteSourceSize` `{x,y}` - its trimmed content's offset within the
   * untrimmed canvas - whenever any frame in the tag is trimmed, so frames
   * trimmed by different amounts stay anchored instead of jittering; it's
   * omitted entirely for tags with no trimmed frames.
   */
  public static parse(data: AsepriteData, texture: Texture): AsepriteSheet {
    const frameArray = normaliseFrames(data);

    // Build SpritesheetData: frame names are zero-based index strings.
    const spritesheetFrames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> = {};

    for (const [i, frameData] of frameArray.entries()) {
      spritesheetFrames[String(i)] = { frame: frameData.frame };
    }

    const spritesheet = new Spritesheet(texture, { frames: spritesheetFrames });

    // Build clips from frameTags, resolving frame indices into Rectangles.
    const clips = new Map<string, AnimatedSpriteClipDefinition>();
    const frameTags = data.meta.frameTags ?? [];

    for (const tag of frameTags) {
      // Out-of-range indices are silently skipped; `taggedFrames` parallels
      // `frames` exactly, so it's the basis for every other per-frame array
      // (durations, offsets) built below.
      const taggedFrames = resolveTaggedFrames(frameArray, expandFrameIndices(tag));
      const frames = taggedFrames.map(({ index }) => spritesheet.getFrame(String(index)));

      if (frames.length === 0) {
        continue;
      }

      // Aseprite's `tag.repeat` (a numeric string, `'1'` through any N) maps
      // directly onto the engine's `repeat` count. Absent means the tag
      // loops indefinitely, the engine's `-1` sentinel.
      const repeat = tag.repeat !== undefined ? Number(tag.repeat) : -1;
      const fps = avgFps(taggedFrames);

      // Per-frame hold duration (Aseprite "duration"), so uneven hold-frames
      // (e.g. a lingering idle frame) survive into playback instead of being
      // flattened to the tag's average fps. A non-positive duration (same
      // degenerate case `avgFps` guards against) falls back to the average -
      // computed as `1 / fps` directly, not `(1000 / fps) / 1000`, so it is
      // bit-for-bit the reciprocal of the fps this clip actually carries.
      const frameDurations = taggedFrames.map(({ frameData }) => Time.seconds(frameData.duration > 0 ? frameData.duration / 1000 : 1 / fps));

      // Per-frame trim offset (Aseprite "spriteSourceSize"), so frames trimmed
      // by different amounts stay anchored to the same point in the untrimmed
      // canvas instead of jittering frame to frame. Omitted entirely when no
      // frame in the tag is trimmed, to avoid noise on untrimmed sheets.
      const anyTrimmed = taggedFrames.some(({ frameData }) => frameData.trimmed);
      const frameOffsets = anyTrimmed
        ? taggedFrames.map(({ frameData }) => {
            const { x, y } = frameData.spriteSourceSize;

            return { x, y };
          })
        : undefined;

      clips.set(tag.name, {
        fps,
        frames,
        repeat,
        frameDurations,
        ...(frameOffsets ? { frameOffsets } : {}),
      });
    }

    // Build the slices map from meta.slices, keyed by slice name.
    const slices = new Map<string, AsepriteSlice>();

    for (const slice of data.meta.slices ?? []) {
      slices.set(slice.name, slice);
    }

    // Same for meta.layers - insertion order is the export order, so the map
    // doubles as the ordered layer list.
    const layers = new Map<string, AsepriteLayer>();

    for (const layer of data.meta.layers ?? []) {
      layers.set(layer.name, layer);
    }

    return new AsepriteSheet(spritesheet, clips, slices, layers);
  }

  /**
   * Create an {@link AnimatedSprite} with all frame-tag clips pre-defined.
   *
   * Each clip is registered via {@link AnimatedSprite.addClip}, which
   * clones the frame {@link Rectangle}s so the sprite owns its own copies.
   * Call {@link AnimatedSprite.play} with a tag name to start playback.
   */
  public createAnimatedSprite(): AnimatedSprite {
    const sprite = new AnimatedSprite(this.spritesheet.texture);

    for (const [name, clip] of this.clips) {
      sprite.addClip(name, clip);
    }

    return sprite;
  }

  /** Destroy the underlying {@link Spritesheet} and release its frame resources. */
  public destroy(): void {
    this.spritesheet.destroy();
  }
}
