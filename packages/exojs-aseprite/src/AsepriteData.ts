// TypeScript types for the Aseprite JSON sprite sheet export format.
// Supports both array mode (frames is an ordered array) and hash mode
// (frames is an object keyed by frame name / filename).

/** Playback direction of an Aseprite frame tag animation. */
export type AsepriteDirection = 'forward' | 'pingpong' | 'pingpong_reverse' | 'reverse';

/** Pixel region rectangle used throughout the Aseprite JSON format. */
export interface AsepriteRect {
  readonly h: number;
  readonly w: number;
  readonly x: number;
  readonly y: number;
}

/** Width/height size descriptor used in Aseprite metadata. */
export interface AsepriteSize {
  readonly h: number;
  readonly w: number;
}

/** A single animation frame in the Aseprite JSON export. */
export interface AsepriteFrameData {
  /** Display duration of this frame in milliseconds. */
  readonly duration: number;
  /** Pixel region of this frame within the packed sprite sheet texture. */
  readonly frame: AsepriteRect;
  readonly rotated: boolean;
  readonly sourceSize: AsepriteSize;
  readonly spriteSourceSize: AsepriteRect;
  readonly trimmed: boolean;
}

/**
 * A named animation range defined via Aseprite frame tags.
 * `from` and `to` are inclusive zero-based frame indices.
 */
export interface AsepriteFrameTag {
  readonly color?: string;
  readonly direction: AsepriteDirection;
  /** Inclusive end frame index. */
  readonly to: number;
  /** Inclusive start frame index. */
  readonly from: number;
  readonly name: string;
  /**
   * Number of times the tag plays before stopping, as a numeric string
   * (e.g. `"1"`, `"2"`). Absent means the tag loops indefinitely.
   */
  readonly repeat?: string;
}

/** A single layer entry in the Aseprite JSON metadata. */
export interface AsepriteLayer {
  readonly blendMode: string;
  readonly name: string;
  readonly opacity: number;
}

/** Bounds of a named slice at a specific frame. */
export interface AsepriteSliceKey {
  readonly bounds: AsepriteRect;
  readonly frame: number;
}

/** A named slice defined in the Aseprite editor. */
export interface AsepriteSlice {
  readonly color?: string;
  readonly keys: readonly AsepriteSliceKey[];
  readonly name: string;
}

/** Metadata block of an Aseprite JSON export. */
export interface AsepriteMeta {
  readonly app: string;
  readonly format: string;
  readonly frameTags?: readonly AsepriteFrameTag[];
  /** Relative path to the exported sprite sheet image. */
  readonly image: string;
  readonly layers?: readonly AsepriteLayer[];
  readonly scale: string;
  readonly size: AsepriteSize;
  readonly slices?: readonly AsepriteSlice[];
  readonly version: string;
}

/** Aseprite JSON export in array mode — frames is an ordered array. */
export interface AsepriteArrayData {
  readonly frames: readonly AsepriteFrameData[];
  readonly meta: AsepriteMeta;
}

/** Aseprite JSON export in hash mode — frames is an object keyed by frame name. */
export interface AsepriteHashData {
  readonly frames: Readonly<Record<string, AsepriteFrameData>>;
  readonly meta: AsepriteMeta;
}

/**
 * Union of both Aseprite JSON export formats.
 *
 * Use {@link isAsepriteArrayData} to discriminate between array and hash mode.
 */
export type AsepriteData = AsepriteArrayData | AsepriteHashData;

/** Returns `true` when `data` is in array mode (frames is an array). */
export function isAsepriteArrayData(data: AsepriteData): data is AsepriteArrayData {
  return Array.isArray(data.frames);
}
