import type { View } from '@codexo/exojs';

import type { ChunkPayload, ChunkSource } from './ChunkSource';
import type { ChunkRange, TileLayer } from './TileLayer';
import { tileToChunkCoord } from './types';

/**
 * Options for a {@link ChunkStreamer}. All optional.
 * @advanced
 */
export interface ChunkStreamerOptions {
  /**
   * Chunks within this many chunk-units (Chebyshev distance to the visible
   * chunk range) of the view are loaded. Default `1`.
   */
  readonly loadRadius?: number;
  /**
   * Own-resident chunks beyond this many chunk-units of the view are
   * evicted. Must be `>= loadRadius` — the gap between the two is
   * deliberate hysteresis that prevents load/unload thrashing when the
   * view sits near a chunk boundary. Default `2`.
   */
  readonly unloadRadius?: number;
  /**
   * Maximum number of new chunk loads issued per {@link ChunkStreamer.update}
   * call, after the very first call (which loads the entire initial wanted
   * set unbudgeted, so the starting view never pops in). Default `8`.
   */
  readonly maxChunkLoadsPerFrame?: number;
}

const DEFAULT_LOAD_RADIUS = 1;
const DEFAULT_UNLOAD_RADIUS = 2;
const DEFAULT_MAX_CHUNK_LOADS_PER_FRAME = 8;

function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

function isThenable(value: unknown): value is Promise<ChunkPayload | null> {
  return value !== null && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

/**
 * Drives {@link TileLayer._adoptChunk}/{@link TileLayer._evictChunk} calls
 * from a {@link View}'s position: chunks near the view are requested from a
 * {@link ChunkSource} and installed; chunks that scroll far enough away are
 * evicted. Works on both unbounded and bounded layers (a bounded-but-large
 * layer still benefits from not keeping every chunk resident at once) — for
 * a bounded layer, the wanted range is clamped to {@link TileLayer.chunkRange}.
 *
 * Touches only the {@link TileLayer} data layer —
 * {@link import('./TileLayerNode').TileLayerNode} reacts to
 * `_adoptChunk`/`_evictChunk` on its own via a structural listener, so this
 * class has no rendering dependency and no reference to any scene node.
 *
 * Tracks its own resident set (chunks *this instance* has loaded), never
 * touching chunks that predate its attachment or were installed by another
 * source.
 *
 * Tick it from your update loop, like {@link import('./TileAnimator').TileAnimator}:
 *
 * ```ts
 * const streamer = new ChunkStreamer(layer, mySource, view);
 * scene.systems.add({ update: () => streamer.update() });
 * ```
 *
 * @advanced
 */
export class ChunkStreamer {
  private readonly _layer: TileLayer;
  private readonly _source: ChunkSource;
  private readonly _view: View;
  private readonly _loadRadius: number;
  private readonly _unloadRadius: number;
  private readonly _maxChunkLoadsPerFrame: number;

  private readonly _resident = new Map<string, { readonly cx: number; readonly cy: number }>();
  private readonly _inFlight = new Map<string, number>();
  private _requestCounter = 0;
  private _primed = false;
  private _destroyed = false;

  public constructor(layer: TileLayer, source: ChunkSource, view: View, options?: ChunkStreamerOptions) {
    this._layer = layer;
    this._source = source;
    this._view = view;
    this._loadRadius = options?.loadRadius ?? DEFAULT_LOAD_RADIUS;
    this._unloadRadius = options?.unloadRadius ?? DEFAULT_UNLOAD_RADIUS;
    this._maxChunkLoadsPerFrame = options?.maxChunkLoadsPerFrame ?? DEFAULT_MAX_CHUNK_LOADS_PER_FRAME;

    if (this._unloadRadius < this._loadRadius) {
      throw new Error(
        `ChunkStreamer unloadRadius (${this._unloadRadius}) must be >= loadRadius (${this._loadRadius}).`,
      );
    }
  }

  /** Number of chunks this instance currently has resident in the layer. */
  public get residentCount(): number {
    return this._resident.size;
  }

  /**
   * Recompute the wanted chunk set from the view's current position; evict
   * own-resident chunks that fell outside `unloadRadius`, then request
   * chunks newly inside `loadRadius`. The very first call loads the entire
   * initial wanted set unbudgeted; every later call is capped at
   * {@link ChunkStreamerOptions.maxChunkLoadsPerFrame}. No-op once
   * {@link destroy}ed.
   */
  public update(): void {
    if (this._destroyed) return;

    const core = this._computeCoreRange();

    this._unload(core);

    const range = this._layer.chunkRange();
    let minCx = core.minCx - this._loadRadius;
    let minCy = core.minCy - this._loadRadius;
    let maxCx = core.maxCx + this._loadRadius;
    let maxCy = core.maxCy + this._loadRadius;
    if (range !== null) {
      minCx = Math.max(minCx, range.minCx);
      minCy = Math.max(minCy, range.minCy);
      maxCx = Math.min(maxCx, range.maxCx);
      maxCy = Math.min(maxCy, range.maxCy);
    }

    const toLoad: Array<{ cx: number; cy: number }> = [];
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = chunkKey(cx, cy);
        if (this._resident.has(key) || this._inFlight.has(key)) continue;
        toLoad.push({ cx, cy });
      }
    }

    if (!this._primed) {
      this._primed = true;
      for (const { cx, cy } of toLoad) {
        this._request(cx, cy);
      }
      return;
    }

    toLoad.sort((a, b) => this._rangeDistance(a.cx, a.cy, core) - this._rangeDistance(b.cx, b.cy, core));

    const budget = Math.min(this._maxChunkLoadsPerFrame, toLoad.length);
    for (let i = 0; i < budget; i++) {
      const { cx, cy } = toLoad[i]!;
      this._request(cx, cy);
    }
  }

  /**
   * Stop responding to {@link update}. Idempotent. Does not evict any
   * currently-resident chunk — see the follow-on eviction behavior added by
   * the next task in this slice's implementation plan.
   */
  public destroy(): void {
    this._destroyed = true;
  }

  private _computeCoreRange(): ChunkRange {
    const layer = this._layer;
    const view = this._view;
    const bounds = view.getBounds();
    const centerX = view.center.x;
    const centerY = view.center.y;

    const shiftX = centerX * (1 - layer.parallaxX);
    const shiftY = centerY * (1 - layer.parallaxY);

    const topLeftTile = layer.pixelToTile(bounds.left - shiftX, bounds.top - shiftY);
    const bottomRightTile = layer.pixelToTile(bounds.right - shiftX, bounds.bottom - shiftY);

    const topLeftChunk = tileToChunkCoord(topLeftTile.tx, topLeftTile.ty, layer.chunkWidth, layer.chunkHeight);
    const bottomRightChunk = tileToChunkCoord(bottomRightTile.tx, bottomRightTile.ty, layer.chunkWidth, layer.chunkHeight);

    return {
      minCx: topLeftChunk.cx,
      minCy: topLeftChunk.cy,
      maxCx: bottomRightChunk.cx,
      maxCy: bottomRightChunk.cy,
    };
  }

  private _rangeDistance(cx: number, cy: number, range: ChunkRange): number {
    const dx = Math.max(range.minCx - cx, 0, cx - range.maxCx);
    const dy = Math.max(range.minCy - cy, 0, cy - range.maxCy);
    return Math.max(dx, dy);
  }

  private _unload(core: ChunkRange): void {
    for (const [key, { cx, cy }] of this._resident) {
      if (this._rangeDistance(cx, cy, core) > this._unloadRadius) {
        this._layer._evictChunk(cx, cy);
        this._resident.delete(key);
      }
    }
  }

  private _request(cx: number, cy: number): void {
    const key = chunkKey(cx, cy);
    const token = ++this._requestCounter;
    this._inFlight.set(key, token);

    let result: ChunkPayload | null | Promise<ChunkPayload | null>;
    try {
      result = this._source.getChunk(cx, cy);
    } catch (error) {
      this._inFlight.delete(key);
      if (__DEV__) {
        console.warn(`[ChunkStreamer] source.getChunk(${cx}, ${cy}) threw synchronously:`, error);
      }
      return;
    }

    if (isThenable(result)) {
      result.then(
        payload => { this._onResolved(key, cx, cy, token, payload); },
        (error: unknown) => {
          this._inFlight.delete(key);
          if (__DEV__) {
            console.warn(`[ChunkStreamer] source.getChunk(${cx}, ${cy}) rejected:`, error);
          }
        },
      );
      return;
    }

    this._onResolved(key, cx, cy, token, result);
  }

  /**
   * Ignore-on-resolve: only the `_destroyed` and in-flight-token checks
   * guard installation — a chunk that scrolled out of the wanted set while
   * its request was in flight is still installed if it resolves (installing
   * it is cheap and self-correcting: the next {@link update} call's unload
   * pass evicts it again if it's genuinely no longer wanted). There is no
   * edit-persistence to protect, so discarding is never destructive.
   */
  private _onResolved(key: string, cx: number, cy: number, token: number, payload: ChunkPayload | null): void {
    if (this._destroyed) return;
    if (this._inFlight.get(key) !== token) return;
    this._inFlight.delete(key);

    if (payload === null) return;

    this._layer._adoptChunk(cx, cy, payload);
    this._resident.set(key, { cx, cy });
  }
}
