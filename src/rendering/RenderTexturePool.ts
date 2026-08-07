import { RenderTexture } from '#rendering/texture/RenderTexture';
import { type ColorTextureFormat, TextureFormat } from '#rendering/types';

import { estimateTextureBytes } from './GpuResourceAccountant';

/**
 * Largest number of render textures kept for reuse. Filter and mask
 * intermediates come in a handful of sizes per frame, so a few dozen entries
 * cover every realistic working set; beyond that the pool is hoarding, not
 * recycling.
 * @internal
 */
export const MAX_POOLED_RENDER_TEXTURES = 32;

/**
 * Largest total VRAM the pool may hold, in bytes. The count cap alone is no
 * protection — 32 full-screen 4K targets would be well over a gigabyte — so
 * whichever limit binds first wins.
 * @internal
 */
export const MAX_POOLED_RENDER_TEXTURE_BYTES = 64 * 1024 * 1024;

/** Bytes per pixel of a color attachment format. */
const colorFormatBytesPerPixel = (format: ColorTextureFormat): number => {
  switch (format) {
    case TextureFormat.Rgba8:
      return 4;
    case TextureFormat.Rgba16F:
      return 8;
    case TextureFormat.Rgba32F:
      return 16;
  }
};

/**
 * Recycles the short-lived {@link RenderTexture}s that filters, masks and
 * backdrop blends allocate every frame, keyed by exact `width × height` match.
 *
 * Bounded on purpose. Any workflow whose intermediates resize as they animate
 * retires one size class per frame and never asks for it again, so an unbounded
 * pool would grow forever, each dead entry still holding real VRAM. Past either
 * cap the least recently released entries are destroyed, which runs the
 * backend's own destroy-listener teardown and frees the GPU objects rather than
 * merely dropping the reference.
 *
 * One pool per backend instance — the textures it holds belong to that
 * backend's device/context.
 * @internal
 */
export class RenderTexturePool {
  /** Least recently released first, so eviction pops from the front. */
  private readonly _textures: RenderTexture[] = [];
  private _bytes = 0;

  /** Number of textures currently held for reuse. */
  public get size(): number {
    return this._textures.length;
  }

  /** Estimated VRAM held by the pooled textures, in bytes. */
  public get bytes(): number {
    return this._bytes;
  }

  /**
   * Take a pooled texture of exactly `width × height`, or allocate a fresh one.
   * The result is borrowed: hand it back with {@link release} rather than
   * destroying it.
   */
  public acquire(width: number, height: number): RenderTexture {
    for (let index = 0; index < this._textures.length; index++) {
      // In-bounds: `index` ranges over `0..length-1`.
      const texture = this._textures[index]!;

      if (texture.width === width && texture.height === height) {
        this._textures.splice(index, 1);
        this._bytes -= this._estimateBytes(texture);

        return texture;
      }
    }

    return new RenderTexture(width, height);
  }

  /**
   * Hand a borrowed texture back for reuse, evicting older entries if that puts
   * the pool over either cap. Releasing a texture twice, or releasing one that
   * has already been destroyed, is a no-op — both would otherwise seed the pool
   * with an entry that throws the moment it is bound.
   */
  public release(texture: RenderTexture): void {
    if (texture.destroyed || this._textures.includes(texture)) {
      return;
    }

    texture.setView(null);
    this._textures.push(texture);
    this._bytes += this._estimateBytes(texture);
    this._evictToCapacity();
  }

  /** Destroy every pooled texture and empty the pool. */
  public destroy(): void {
    for (const texture of this._textures) {
      texture.destroy();
    }

    this._textures.length = 0;
    this._bytes = 0;
  }

  /**
   * Empty the pool without destroying anything. For device loss only: the
   * backing GPU textures died with the device, so calling `destroy()` on them
   * would target a dead device instead of releasing anything.
   */
  public forget(): void {
    this._textures.length = 0;
    this._bytes = 0;
  }

  private _evictToCapacity(): void {
    while (this._textures.length > 0 && (this._textures.length > MAX_POOLED_RENDER_TEXTURES || this._bytes > MAX_POOLED_RENDER_TEXTURE_BYTES)) {
      // Non-empty per the loop guard.
      const evicted = this._textures.shift()!;

      this._bytes -= this._estimateBytes(evicted);
      // Destroying runs the backend's destroy listener, which deletes the GPU
      // texture and framebuffer and books the bytes back off the accountant.
      evicted.destroy();
    }
  }

  private _estimateBytes(texture: RenderTexture): number {
    return estimateTextureBytes(texture.width, texture.height, colorFormatBytesPerPixel(texture.format));
  }
}
