import type { ChunkPayload, ChunkSource } from './ChunkSource';
import type { TileLayer } from './TileLayer';
import type { ResolvedTile } from './types';
import { packTile } from './types';

/**
 * Options for {@link createSampledChunkSource}.
 * @advanced
 */
export interface SampledChunkSourceOptions {
  /**
   * Sample a scalar value at a tile coordinate. Called once per tile within
   * each requested chunk. Must be a pure, deterministic function of
   * `(tx, ty)` — {@link import('./ChunkStreamer').ChunkStreamer} regenerates
   * a chunk from scratch via this source whenever it's revisited after
   * eviction, so a non-deterministic sampler would make previously-visited
   * terrain silently change underneath the player.
   */
  sample(tx: number, ty: number): number;
  /**
   * Convert a sampled value (and its tile coordinate, for position-dependent
   * logic such as river carving or map edges) into a resolved tile, or
   * `null` for an empty cell. Must be pure and deterministic, same
   * requirement as {@link sample}.
   */
  mapValueToTile(value: number, tx: number, ty: number): ResolvedTile | null;
}

/**
 * Build a {@link import('./ChunkStreamer').ChunkStreamer}-ready
 * {@link ChunkSource} from a caller-supplied sampling function — the
 * generic mechanism behind procedurally generated tile content (noise,
 * a heightmap, or any other per-tile-coordinate scalar function). This
 * module intentionally has no opinion on the sampling algorithm itself
 * ({@link SampledChunkSourceOptions.sample}/`mapValueToTile` are both
 * required, not defaulted) — pick or write whatever generation function
 * fits your game.
 *
 * `layer` supplies the target chunk grid ({@link TileLayer.chunkWidth}/
 * `chunkHeight`) and the tileset list tiles are packed against
 * ({@link TileLayer.tilesets}) — the same `TileLayer` you'll construct the
 * `ChunkStreamer` with.
 * @advanced
 */
export function createSampledChunkSource(layer: TileLayer, options: SampledChunkSourceOptions): ChunkSource {
  return {
    getChunk(cx: number, cy: number): ChunkPayload | null {
      const chunkWidth = layer.chunkWidth;
      const chunkHeight = layer.chunkHeight;
      const startTx = cx * chunkWidth;
      const startTy = cy * chunkHeight;

      let out: Uint32Array | null = null;
      for (let ty = startTy; ty < startTy + chunkHeight; ty++) {
        for (let tx = startTx; tx < startTx + chunkWidth; tx++) {
          const value = options.sample(tx, ty);
          const resolved = options.mapValueToTile(value, tx, ty);
          if (!resolved) continue;

          out ??= new Uint32Array(chunkWidth * chunkHeight);
          const tilesetIndex = layer.tilesets.indexOf(resolved.tileset);
          out[(ty - startTy) * chunkWidth + (tx - startTx)] = packTile(tilesetIndex, resolved.localTileId, resolved.transform);
        }
      }

      return out === null ? null : { width: chunkWidth, height: chunkHeight, tiles: out };
    },
  };
}
