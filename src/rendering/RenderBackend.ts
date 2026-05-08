import type { Color } from '@/core/Color';
import type { Rectangle } from '@/math/Rectangle';

import type { Drawable } from './Drawable';
import type { RenderBackendType } from './RenderBackendType';
import type { RenderPass } from './RenderPass';
import type { RenderStats } from './RenderStats';
import type { RenderTarget } from './RenderTarget';
import type { RenderTexture } from './texture/RenderTexture';
import type { Texture } from './texture/Texture';
import type { BlendModes } from './types';
import type { View } from './View';

/**
 * Common interface implemented by both rendering backends
 * ({@link WebGl2Backend}, {@link WebGpuBackend}). Owns the canvas root
 * render target, exposes the active {@link View}, accepts {@link Drawable}
 * submissions, manages an offscreen render-texture pool, and exposes the
 * scissor-stack and alpha-mask compositing primitives used by
 * {@link RenderNode}'s `mask` machinery.
 *
 * Application code rarely calls this directly — high-level code submits
 * drawables via the scene graph and reads `app.backend.stats` for
 * per-frame counters. Custom render passes (subclasses of
 * {@link RenderPass}) interact with the interface directly.
 */
export interface RenderBackend {
  readonly backendType: RenderBackendType;
  readonly view: View;
  readonly renderTarget: RenderTarget;
  readonly stats: RenderStats;

  initialize(): Promise<this>;
  resetStats(): this;
  clear(color?: Color): this;
  resize(width: number, height: number): this;
  setView(view: View | null): this;
  setRenderTarget(target: RenderTarget | null): this;

  /**
   * Push an axis-aligned scissor rectangle. Used internally by the
   * `Rectangle` mask path on `RenderNode.mask`. Nested scissors
   * intersect with the previous scissor on the stack.
   */
  pushScissorRect(bounds: Rectangle): this;

  /**
   * Pop the most recently pushed scissor rectangle.
   */
  popScissorRect(): this;

  acquireRenderTexture(width: number, height: number): RenderTexture;
  releaseRenderTexture(texture: RenderTexture): this;

  /**
   * Composite `content` onto the active render target with each output
   * pixel's alpha multiplied by the corresponding sample of
   * `mask.alpha`. The mask is stretched-fit over the target rectangle
   * `(x, y, width, height)` in world-space. Used internally by the
   * non-Rectangle `MaskSource` paths on `RenderNode.mask`.
   */
  composeWithAlphaMask(content: RenderTexture, mask: Texture | RenderTexture, x: number, y: number, width: number, height: number, blendMode: BlendModes): this;

  draw(drawable: Drawable): this;
  execute(pass: RenderPass): this;
  flush(): this;
  destroy(): void;
}
