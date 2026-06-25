import type { RenderStats } from './RenderStats';

/**
 * Per-backend GPU resource accountant (Slice 2g — Resource-Accounting).
 *
 * The GPU exposes no way to query VRAM usage (neither WebGL2 nor WebGPU report
 * it — a deliberate security boundary), so the engine keeps its own running
 * tally by booking every allocation (`+`) and every free (`−`) at the points
 * where the backend creates or destroys a GPU texture / buffer. The same
 * bookkeeping runs against the Node fake-context, so it is fully deterministic
 * and CI-testable.
 *
 * The accountant owns the authoritative running total ({@link liveBytes}) and
 * mirrors it into {@link RenderStats.gpuMemoryBytes}. Unlike the per-frame
 * counters, that total is **not** zeroed by {@link resetRenderStats} — live
 * resources outlive frames. The per-frame upload / download accumulators are
 * written straight into the stats object and reset each tick.
 *
 * One accountant per backend instance (never module-global) so that multiple
 * concurrent {@link Application}s keep independent tallies.
 *
 * @internal
 */
export class GpuResourceAccountant {
  private readonly _stats: RenderStats;
  private _liveBytes = 0;

  public constructor(stats: RenderStats) {
    this._stats = stats;
    this._stats.gpuMemoryBytes = 0;
  }

  /** Current running total of live GPU resource bytes (textures + buffers). */
  public get liveBytes(): number {
    return this._liveBytes;
  }

  /**
   * Record an allocation of `bytes` GPU memory (texture storage or buffer).
   * Pass a non-negative value; the running total and the mirrored
   * `stats.gpuMemoryBytes` both increase.
   */
  public allocate(bytes: number): void {
    if (bytes <= 0) {
      return;
    }

    this._liveBytes += bytes;
    this._stats.gpuMemoryBytes = this._liveBytes;
  }

  /**
   * Record a free of `bytes` GPU memory. Clamped at zero so a double-free or a
   * missed allocation can never drive the tally negative. To avoid transient
   * spikes on resize, book the free **before** the matching re-allocation.
   */
  public free(bytes: number): void {
    if (bytes <= 0) {
      return;
    }

    this._liveBytes = Math.max(0, this._liveBytes - bytes);
    this._stats.gpuMemoryBytes = this._liveBytes;
  }

  /**
   * Re-book a resource whose byte size changed in place (e.g. a texture resize):
   * frees the previous size and allocates the next, never dipping below zero.
   * Returns the new size so callers can stash it for the next free.
   */
  public reallocate(previousBytes: number, nextBytes: number): number {
    this.free(previousBytes);
    this.allocate(nextBytes);

    return nextBytes;
  }

  /** Record `bytes` of content-texture pixel data uploaded this frame (CPU → GPU). */
  public recordTextureUpload(bytes: number): void {
    if (bytes <= 0) {
      return;
    }

    this._stats.textureUploadBytes += bytes;
  }

  /** Record `bytes` of buffer data uploaded this frame (CPU → GPU). */
  public recordBufferUpload(bytes: number): void {
    if (bytes <= 0) {
      return;
    }

    this._stats.bufferUploadBytes += bytes;
  }

  /** Record a GPU → CPU readback of `bytes` this frame (e.g. `mapAsync`, `readPixels`). */
  public recordDownload(bytes: number): void {
    if (bytes <= 0) {
      return;
    }

    this._stats.downloadBytes += bytes;
    this._stats.downloadCount++;
  }
}

/**
 * Estimated bytes for a 2D texture of `width × height` at `bytesPerPixel`,
 * including the mip chain when `mipLevelCount > 1`. A full mip chain adds
 * roughly ¹⁄₃ over the base level; this sums the exact per-level footprint
 * (each level a quarter of the previous, floored at 1×1).
 *
 * @internal
 */
export const estimateTextureBytes = (width: number, height: number, bytesPerPixel: number, mipLevelCount = 1): number => {
  const baseWidth = Math.max(1, Math.floor(width));
  const baseHeight = Math.max(1, Math.floor(height));
  const levels = Math.max(1, Math.floor(mipLevelCount));

  let total = 0;
  let levelWidth = baseWidth;
  let levelHeight = baseHeight;

  for (let level = 0; level < levels; level++) {
    total += levelWidth * levelHeight * bytesPerPixel;

    if (levelWidth === 1 && levelHeight === 1) {
      break;
    }

    levelWidth = Math.max(1, levelWidth >> 1);
    levelHeight = Math.max(1, levelHeight >> 1);
  }

  return total;
};

/** Bytes per pixel for the {@link DataTexture} formats (shared by both backends). @internal */
export const dataTextureBytesPerPixel = (format: 'r8' | 'r32f' | 'rgba8' | 'rgba32f'): number => {
  switch (format) {
    case 'r8':
      return 1;
    case 'r32f':
      return 4;
    case 'rgba8':
      return 4;
    case 'rgba32f':
      return 16;
  }
};
