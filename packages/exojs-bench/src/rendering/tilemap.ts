import { createRng } from '../shared/rng';
import type { ArchetypeSpec } from './EngineAdapter';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './world';

/**
 * The tilemap scenes' shared definition: map size, tile content, camera path and
 * per-frame edits, derived once so every arm paints the identical world.
 *
 * Each arm expresses a tilemap through its own API - an instanced chunk renderer,
 * an imperatively painted quad buffer, a shader over a data texture - and those
 * are the implementations under comparison. What must not differ is the map they
 * are given, which is why nothing here is an arm's business to decide.
 */

/** Tile edge length in pixels. Square, and the same in every arm. */
export const TILE_SIZE = 32;

/**
 * Distinct tiles in the tileset.
 *
 * Enough that the map is not one repeated tile - which a renderer could collapse
 * - and few enough to sit in a single atlas page on every arm, so no arm pays a
 * texture-slot cost the others avoid. The comparison is about tile throughput,
 * not about batching across tilesets.
 */
export const TILE_VARIANTS = 16;

/** Camera travel per frame in pixels, along the map diagonal. */
export const TILEMAP_CAMERA_SPEED = 8;

/** Unique visible tiles whose id is replaced each frame by the editing scene. */
export const TILEMAP_EDITS_PER_FRAME = 64;

/** Seed the tile content is drawn from; fixed, so every arm and every run paints one map. */
export const TILEMAP_SEED = 0xc0_ff_ee;

/** Map dimensions in tiles. */
export interface TilemapExtent {
  readonly width: number;
  readonly height: number;
}

/**
 * Map dimensions for a tile total.
 *
 * Tabulated rather than derived from a square root: the published loads are
 * 100x100, 400x250 and 1000x1000, and the middle one is deliberately not square
 * - a map wider than it is tall is the ordinary shape of a side-scrolling level,
 * and a square-only ladder would never exercise a chunk grid's minor axis
 * differently from its major one.
 */
export const tilemapExtent = (tileCount: number): TilemapExtent => {
  switch (tileCount) {
    case 10_000:
      return { width: 100, height: 100 };
    case 100_000:
      return { width: 400, height: 250 };
    case 1_000_000:
      return { width: 1_000, height: 1_000 };
    default: {
      // An off-ladder count (a spot check, a smoke run) still gets a real map:
      // the widest rectangle whose area does not exceed the count, in the same
      // 16:10 proportion as the published middle rung.
      const height = Math.max(1, Math.round(Math.sqrt(tileCount / 1.6)));

      return { width: Math.max(1, Math.floor(tileCount / height)), height };
    }
  }
};

/**
 * Tile id at map coordinate `(x, y)`, in `0..TILE_VARIANTS - 1`.
 *
 * Derived from the coordinate rather than from a stream, so an arm can fill its
 * map in whatever order its storage wants and still paint the identical world.
 * The hash is the one the shared RNG uses, seeded per tile.
 */
export const tileIdAt = (x: number, y: number): number => {
  const seed = (TILEMAP_SEED ^ (x * 0x9e_37_79_b1) ^ (y * 0x85_eb_ca_6b)) >>> 0;

  return Math.floor(createRng(seed)() * TILE_VARIANTS) % TILE_VARIANTS;
};

/** Top-left corner of the visible window, in pixels. */
export interface TilemapCamera {
  readonly x: number;
  readonly y: number;
}

/**
 * Camera position at `frame`: a diagonal that reflects off the map edges.
 *
 * Reflection rather than a wrap, because a wrap teleports the window across the
 * map and hands every arm a full chunk turnover on that one frame, which is a
 * spike in the middle of a steady-state measurement rather than a property of
 * the scroll.
 */
export const tilemapCameraAt = (frame: number, extent: TilemapExtent): TilemapCamera => ({
  x: reflect(frame * TILEMAP_CAMERA_SPEED, Math.max(0, extent.width * TILE_SIZE - VIEWPORT_WIDTH)),
  y: reflect(frame * TILEMAP_CAMERA_SPEED, Math.max(0, extent.height * TILE_SIZE - VIEWPORT_HEIGHT)),
});

/** Reflect `value` into `0..span`, so the camera turns around at the map edge instead of jumping. */
const reflect = (value: number, span: number): number => {
  if (span <= 0) {
    return 0;
  }

  const cycle = value % (span * 2);

  return cycle <= span ? cycle : span * 2 - cycle;
};

/** One tile the editing scene replaces. */
export interface TilemapEdit {
  readonly x: number;
  readonly y: number;
  readonly tileId: number;
}

/**
 * The tiles `tilemap-edit` replaces on `frame`: {@link TILEMAP_EDITS_PER_FRAME}
 * distinct coordinates inside the visible window, each given a tile id different
 * from the one it held.
 *
 * Inside the window on purpose. An edit outside it is a data change an arm may
 * legitimately defer until the chunk is next drawn, so a scene editing off-screen
 * tiles would measure how long each arm defers rather than what an edit costs.
 */
export const tilemapEditsAt = (frame: number, extent: TilemapExtent): readonly TilemapEdit[] => {
  const camera = tilemapCameraAt(EDIT_CAMERA_FRAME, extent);
  const originX = Math.floor(camera.x / TILE_SIZE);
  const originY = Math.floor(camera.y / TILE_SIZE);
  const columns = Math.min(extent.width, Math.ceil(VIEWPORT_WIDTH / TILE_SIZE));
  const rows = Math.min(extent.height, Math.ceil(VIEWPORT_HEIGHT / TILE_SIZE));
  const edits: TilemapEdit[] = [];
  const visited = new Set<number>();

  // A stride coprime with the window's tile count walks distinct cells without
  // rejection sampling, so the set is exactly the requested size on every frame
  // rather than "usually" it.
  const cells = columns * rows;
  const stride = 61;

  for (let index = 0; index < TILEMAP_EDITS_PER_FRAME && visited.size < cells; index += 1) {
    const cell = (index * stride) % cells;

    if (visited.has(cell)) {
      continue;
    }

    visited.add(cell);

    const x = Math.min(extent.width - 1, originX + (cell % columns));
    const y = Math.min(extent.height - 1, originY + Math.floor(cell / columns));

    edits.push({ x, y, tileId: (tileIdAt(x, y) + 1 + (frame % (TILE_VARIANTS - 1))) % TILE_VARIANTS });
  }

  return edits;
};

/** Whether the archetype renders a tilemap rather than a sprite scene. */
export const isTilemap = (spec: ArchetypeSpec): boolean => spec.tilemap !== undefined;

/**
 * The frame the editing scene's camera is fixed at.
 *
 * The editing scene does not scroll, and that is a determinism requirement
 * rather than a simplification. The harness may cut an arm's warmup short on
 * wall clock, so two arms can reach the timed window having run a different
 * number of frames; with a moving camera the edited cells move too, and the two
 * arms would then be drawing worlds that differ by whatever the extra warmup
 * frames edited - a difference that looks like a rendering bug and is not.
 *
 * Holding the camera makes each frame set the SAME cells to a value derived from
 * that frame alone, so the visible world depends only on the last frame drawn.
 * The cost of scrolling is what `tilemap-scroll` measures; keeping it out of
 * here also makes the delta between the two scenes the edit cost alone.
 */
export const EDIT_CAMERA_FRAME = 0;

/** The frame whose camera position an archetype draws at. */
export const tilemapCameraFrameFor = (spec: ArchetypeSpec, frame: number): number => (isTilemapEditing(spec) ? EDIT_CAMERA_FRAME : frame);

/** Whether the archetype replaces visible tile ids every frame. */
export const isTilemapEditing = (spec: ArchetypeSpec): boolean => spec.tilemap === 'edit';
