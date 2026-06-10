import type { TextureRegion } from '@codexo/exojs';
import type { TileSet } from './TileSet';

// ── Properties ────────────────────────────────────────────────────────────

/**
 * Union of legal tile-property value types in the generic runtime.
 * Format-neutral; adapters map their native property systems into this set.
 * @advanced
 */
export type TilePropertyValue =
  | null
  | boolean
  | number
  | string;

/**
 * An immutable, flat key-value bag of generic tile properties.
 * Adapters copy and freeze source properties; the runtime never retains
 * a caller-owned mutable object.
 * @advanced
 */
export type TileProperties = Readonly<Record<string, TilePropertyValue>>;

// ── Tile orientation / transform ──────────────────────────────────────────

/**
 * Describes the orientation of a placed tile independent of source-format
 * flip-bit encodings. The eight legal combinations map to the eight distinct
 * 90°-rotation-and-flip states of a rectangular texture quad.
 *
 * Applying the transform at geometry-build time (reordering UV corners)
 * avoids per-tile runtime cost and per-frame matrix allocation.
 * @stable
 */
export interface TileTransform {
  /** Horizontal flip (mirror left-right). */
  readonly flipX: boolean;
  /** Vertical flip (mirror top-bottom). */
  readonly flipY: boolean;
  /** Anti-diagonal flip (transpose of the UV axes). Combined with flips produces 90° rotations. */
  readonly diagonal: boolean;
}

/** The identity transform: no flip, no diagonal. */
export const TILE_TRANSFORM_IDENTITY: Readonly<TileTransform> = Object.freeze({
  flipX: false,
  flipY: false,
  diagonal: false,
});

/**
 * Short string label for a {@link TileTransform} (debug / serialisation).
 * Returns one of the eight deterministic names, e.g. `"flipX"` or `"diag+flipX+flipY"`.
 * @internal
 */
export function tileTransformLabel(t: TileTransform): string {
  const parts: string[] = [];
  if (t.diagonal) parts.push('diag');
  if (t.flipX) parts.push('flipX');
  if (t.flipY) parts.push('flipY');
  return parts.length === 0 ? 'identity' : parts.join('+');
}

// ── Tile identity ─────────────────────────────────────────────────────────

/**
 * Opaque packed tile data stored in a {@link TileChunk}'s compact array.
 * 0 means "empty cell". Any non-zero value encodes localTileId, tilesetIndex,
 * and flip bits according to the bit-layout constants below.
 *
 * Use {@link packTile} / {@link unpackTile} to convert between packed form
 * and a {@link ResolvedTile}.
 *
 * Never expose this type as a plain number in public query signatures —
 * public APIs return {@link ResolvedTile} or null.
 * @internal
 */
export type PackedTile = number;

/** Bit width allocated to the local tile ID within a packed tile word. */
export const PACKED_LOCAL_BITS = 20;
/** Bit width allocated to the tileset index within a packed tile word. */
export const PACKED_TILESET_BITS = 9;
/** Bit width allocated to the transform/flip bits. */
export const PACKED_TRANSFORM_BITS = 3;

export const PACKED_LOCAL_MASK = (1 << PACKED_LOCAL_BITS) - 1;
export const PACKED_TILESET_MASK = ((1 << PACKED_TILESET_BITS) - 1) << PACKED_LOCAL_BITS;
export const PACKED_TRANSFORM_MASK = ((1 << PACKED_TRANSFORM_BITS) - 1) << (PACKED_LOCAL_BITS + PACKED_TILESET_BITS);

export const PACKED_TILESET_SHIFT = PACKED_LOCAL_BITS;
export const PACKED_TRANSFORM_SHIFT = PACKED_LOCAL_BITS + PACKED_TILESET_BITS;

/** Maximum tileset index representable in a packed tile. */
export const MAX_TILESET_INDEX = (1 << PACKED_TILESET_BITS) - 1;
/** Maximum local tile ID representable in a packed tile (1-based storage). */
export const MAX_LOCAL_TILE_ID = (1 << PACKED_LOCAL_BITS) - 2;

// Transform bit-field values (bit 0 = flipX, bit 1 = flipY, bit 2 = diagonal).
const TRANSFORM_FLIP_X = 1 << 0;
const TRANSFORM_FLIP_Y = 1 << 1;
const TRANSFORM_DIAGONAL = 1 << 2;

/**
 * Encode a tileset-local tile reference and transform into a packed word.
 * The localTileId is stored as (localTileId + 1) so that a packed value of 0
 * cleanly represents an empty cell, while tile 0 from tileset 0 with identity
 * transform is stored as 1 (non-zero).
 * Returns 0 for an empty cell.
 * @internal
 */
export function packTile(tilesetIndex: number, localTileId: number, transform: TileTransform): PackedTile {
  if (tilesetIndex < 0 || tilesetIndex > MAX_TILESET_INDEX) {
    throw new Error(`Tileset index ${tilesetIndex} exceeds maximum ${MAX_TILESET_INDEX}.`);
  }
  if (localTileId < 0 || localTileId > MAX_LOCAL_TILE_ID) {
    throw new Error(`Local tile ID ${localTileId} exceeds maximum ${MAX_LOCAL_TILE_ID}.`);
  }
  let bits = 0;
  if (transform.flipX) bits |= TRANSFORM_FLIP_X;
  if (transform.flipY) bits |= TRANSFORM_FLIP_Y;
  if (transform.diagonal) bits |= TRANSFORM_DIAGONAL;
  // +1 so 0 means "empty" not "tile 0 without transform"
  const storedId = localTileId + 1;
  return (storedId & PACKED_LOCAL_MASK)
    | ((tilesetIndex << PACKED_TILESET_SHIFT) & PACKED_TILESET_MASK)
    | ((bits << PACKED_TRANSFORM_SHIFT) & PACKED_TRANSFORM_MASK);
}

/**
 * Decode a packed word into its components.
 * Returns null for an empty cell (packed === 0).
 * @internal
 */
export function unpackTile(packed: PackedTile): {
  tilesetIndex: number;
  localTileId: number;
  transform: TileTransform;
} | null {
  if (packed === 0) return null;
  const storedId = packed & PACKED_LOCAL_MASK;
  // Undo the +1 offset applied during packTile.
  const localTileId = storedId - 1;
  const tilesetIndex = (packed & PACKED_TILESET_MASK) >>> PACKED_TILESET_SHIFT;
  const rawTransform = (packed & PACKED_TRANSFORM_MASK) >>> PACKED_TRANSFORM_SHIFT;
  return {
    tilesetIndex,
    localTileId,
    transform: {
      flipX: !!(rawTransform & TRANSFORM_FLIP_X),
      flipY: !!(rawTransform & TRANSFORM_FLIP_Y),
      diagonal: !!(rawTransform & TRANSFORM_DIAGONAL),
    },
  };
}

// ── Resolved tile reference (public query result) ─────────────────────────

/**
 * A fully resolved, format-independent tile reference returned by queries.
 * Materialised on-demand from the packed storage; never stored as a per-cell
 * heap object.
 * @advanced
 */
export interface ResolvedTile {
  /** The owning tileset (already resolved from source-format GID). */
  readonly tileset: TileSet;
  /** 0-based tile index within the tileset. */
  readonly localTileId: number;
  /** Orientation transform for this placed tile. */
  readonly transform: TileTransform;
}

// ── TileDefinition ────────────────────────────────────────────────────────

/**
 * Optional per-tile metadata in a {@link TileSet}. Sparse — only defined
 * tiles carry a definition. May carry animation data in future slices.
 * @advanced
 */
export interface TileDefinition {
  /** The local tile ID this definition belongs to. */
  readonly localTileId: number;
  /** Tile properties (copied and frozen by the tileset). */
  readonly properties?: TileProperties;
}

// ── Chunk coordinate helpers ──────────────────────────────────────────────

/** A signed chunk coordinate pair. */
export interface ChunkCoord {
  readonly cx: number;
  readonly cy: number;
}

/** Convert tile coordinates to chunk coordinates given a chunk size. */
export function tileToChunkCoord(tx: number, ty: number, chunkW: number, chunkH: number): ChunkCoord {
  return {
    cx: Math.floor(tx / chunkW),
    cy: Math.floor(ty / chunkH),
  };
}

/** Convert tile coordinates to local-in-chunk coordinates. */
export function tileToLocalInChunk(tx: number, ty: number, chunkW: number, chunkH: number): { lx: number; ly: number } {
  return {
    lx: ((tx % chunkW) + chunkW) % chunkW,
    ly: ((ty % chunkH) + chunkH) % chunkH,
  };
}

/**
 * Validate that a value is a finite, safe, positive integer.
 * Used for dimensions, tile counts, chunk sizes.
 */
export function validatePositiveInteger(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer (got ${value}).`);
  }
  if (value > Number.MAX_SAFE_INTEGER) {
    throw new Error(`${label} exceeds safe integer range (got ${value}).`);
  }
}

/**
 * Validate a non-negative finite integer.
 */
export function validateNonNegativeInteger(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer (got ${value}).`);
  }
}

/**
 * Validate that a value is a finite integer (may be negative).
 */
export function validateInteger(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${label} must be a finite integer (got ${value}).`);
  }
}
