import type { TileLayer } from './TileLayer';
import type { TileSet } from './TileSet';
import type { TileAnimationFrame, TileTransform } from './types';

/** Internal per-cell animation record. */
interface AnimatedCell {
  readonly layer: TileLayer;
  readonly tx: number;
  readonly ty: number;
  readonly tileset: TileSet;
  readonly transform: TileTransform;
  readonly frames: readonly TileAnimationFrame[];
  /** Cumulative end-time (ms) of each frame, so `cumulative.at(-1) === totalMs`. */
  readonly cumulative: readonly number[];
  readonly totalMs: number;
  /** Index of the frame currently written into the layer (-1 = none yet). */
  currentFrame: number;
}

/**
 * Drives per-tile animations on one or more {@link TileLayer}s, RPG-Maker style.
 *
 * On construction it scans the given layer(s) once and registers every cell
 * whose tile carries an `animation` (see {@link import('./types').TileDefinition}).
 * Each {@link update} advances a shared clock and rewrites **only** the
 * registered animated cells, and **only** when a cell crosses a frame boundary —
 * static tiles are never touched. Because a tile rewrite goes through
 * `layer.setTileAt`, only the chunks that actually contain animated cells rebuild
 * their geometry, and only on the (infrequent) frames where a boundary is
 * crossed. The large static body of the map never rebuilds.
 *
 * Tick it from your update loop, like `TweenSequencer`:
 *
 * ```ts
 * const animator = new TileAnimator(map.layers);
 * scene.systems.add({ update: (t) => animator.update(t.deltaSeconds) });
 * ```
 *
 * The animator references — but never owns — the layers and their tilesets;
 * {@link destroy} only drops its own cell registry.
 *
 * @advanced
 */
export class TileAnimator {
  private readonly _layers: readonly TileLayer[];
  private _cells: AnimatedCell[] = [];
  private _elapsedMs = 0;

  /**
   * @param layers One layer, or an array of layers (e.g. `map.layers`), to scan
   *               for animated tiles.
   */
  public constructor(layers: TileLayer | readonly TileLayer[]) {
    this._layers = Array.isArray(layers) ? layers : [layers as TileLayer];
    this._scan();
  }

  /** Number of animated cells currently registered across all layers. */
  public get animatedCellCount(): number {
    return this._cells.length;
  }

  /** Total elapsed animation time in milliseconds since construction/reset. */
  public get elapsedMs(): number {
    return this._elapsedMs;
  }

  /**
   * Advance all registered animations by `deltaSeconds` and write the current
   * frame into any cell that crossed a frame boundary. Cells that did not change
   * frame are not touched, so their chunks do not rebuild.
   *
   * @param deltaSeconds Elapsed wall-clock time since the last call, in seconds.
   */
  public update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || this._cells.length === 0) {
      return;
    }

    this._elapsedMs += deltaSeconds * 1000;

    for (const cell of this._cells) {
      const t = this._elapsedMs % cell.totalMs;
      const frameIndex = frameIndexAt(cell.cumulative, t);
      if (frameIndex === cell.currentFrame) {
        continue;
      }
      cell.currentFrame = frameIndex;
      const frame = cell.frames[frameIndex];
      if (frame === undefined) {
        continue;
      }
      cell.layer.setTileAt(cell.tx, cell.ty, {
        tileset: cell.tileset,
        localTileId: frame.localTileId,
        transform: cell.transform,
      });
    }
  }

  /**
   * Restore every animated cell to its first frame and reset the clock.
   * Useful before serialising or pausing.
   */
  public reset(): void {
    this._elapsedMs = 0;
    for (const cell of this._cells) {
      const frame = cell.frames[0];
      if (frame === undefined) {
        continue;
      }
      cell.currentFrame = 0;
      cell.layer.setTileAt(cell.tx, cell.ty, {
        tileset: cell.tileset,
        localTileId: frame.localTileId,
        transform: cell.transform,
      });
    }
  }

  /**
   * Re-scan the layers for animated cells. Call after structural edits that add
   * or remove animated tiles. Resets all currently-tracked cells to frame 0
   * first so the rescan starts from a clean, deterministic state.
   */
  public rescan(): void {
    this.reset();
    this._scan();
  }

  /** Drop the cell registry. Does not modify the layers or tilesets. */
  public destroy(): void {
    this._cells = [];
    this._elapsedMs = 0;
  }

  /** Scan all layers for cells whose tile carries a (multi-frame) animation. */
  private _scan(): void {
    const cells: AnimatedCell[] = [];

    for (const layer of this._layers) {
      for (let ty = 0; ty < layer.height; ty++) {
        for (let tx = 0; tx < layer.width; tx++) {
          const tile = layer.getTileAt(tx, ty);
          if (!tile) {
            continue;
          }

          const def = tile.tileset.getTileDefinition(tile.localTileId);
          const frames = def?.animation;
          if (!frames || frames.length < 2) {
            continue;
          }

          // Skip animations referencing out-of-range frames so update() never
          // throws from setTileAt; such data is malformed and silently ignored.
          if (frames.some(f => f.localTileId < 0 || f.localTileId >= tile.tileset.tileCount)) {
            continue;
          }

          const cumulative: number[] = [];
          let total = 0;
          for (const frame of frames) {
            total += Math.max(0, frame.duration);
            cumulative.push(total);
          }
          if (total <= 0) {
            continue;
          }

          cells.push({
            layer,
            tx,
            ty,
            tileset: tile.tileset,
            transform: tile.transform,
            frames,
            cumulative,
            totalMs: total,
            currentFrame: -1,
          });
        }
      }
    }

    this._cells = cells;
  }
}

/**
 * Find the frame index whose cumulative window contains time `t` (0 ≤ t < total).
 * `cumulative[i]` is the end time of frame `i`; the last entry equals the total.
 */
function frameIndexAt(cumulative: readonly number[], t: number): number {
  for (let i = 0; i < cumulative.length; i++) {
    const end = cumulative[i];
    if (end !== undefined && t < end) {
      return i;
    }
  }
  return cumulative.length - 1;
}
