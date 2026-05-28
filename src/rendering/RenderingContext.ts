import type { Color } from '@/core/Color';
import { type RenderBackend } from '@/rendering/RenderBackend';
import { type RenderNode } from '@/rendering/RenderNode';
import { type RenderStats } from '@/rendering/RenderStats';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import { View } from '@/rendering/View';

import { playRenderTree } from './plan/playRenderTree';

export interface RenderToOptions {
  width: number;
  height: number;
  clearColor?: Color;
}

/**
 * Owns rendering orchestration: builds, optimizes and plays the internal
 * RenderPlan for a RenderNode subtree, manages render-target/view state for
 * off-screen capture, and exposes the low-level backend as an escape hatch.
 *
 * The conceptual model is "the context renders the node":
 *   context.render(node)            // into the active target (canvas by default)
 *   context.renderTo(node, opts)    // into an off-screen RenderTexture
 * @stable
 */
export class RenderingContext {
  private readonly _backend: RenderBackend;

  public constructor(backend: RenderBackend) {
    this._backend = backend;
  }

  /** Render a RenderNode subtree into the active target via the RenderPlan machinery. */
  public render(node: RenderNode): void {
    playRenderTree(node, this._backend);
  }

  /**
   * Renders `node` into an off-screen {@link RenderTexture} and returns it.
   *
   * The View is centered at `(width / 2, height / 2)` so that the origin
   * of the node's local space sits at the center of the render texture.
   *
   * Saves and restores the active render target and view so the caller's
   * rendering state is undisturbed.
   */
  public renderTo(node: RenderNode, options: RenderToOptions): RenderTexture {
    const target = new RenderTexture(options.width, options.height);
    const view = new View(options.width / 2, options.height / 2, options.width, options.height);

    const previousTarget = this._backend.renderTarget;
    const previousView = this._backend.view;

    this._backend.setRenderTarget(target);
    this._backend.setView(view);

    if (options.clearColor !== undefined) {
      this._backend.clear(options.clearColor);
    }

    try {
      playRenderTree(node, this._backend);
    } finally {
      this._backend.setRenderTarget(previousTarget);
      this._backend.setView(previousView);
    }

    return target;
  }

  /** Active camera view of the current target. Convenience over backend.view. */
  public get view(): View {
    return this._backend.view;
  }

  /** Per-frame render counters. Convenience over backend.stats. */
  public get stats(): RenderStats {
    return this._backend.stats;
  }

  /**
   * Low-level backend (draw primitives, flush, target/scissor/stencil state,
   * GPU specifics). Escape hatch for custom passes / custom renderers.
   * @advanced
   */
  public get backend(): RenderBackend {
    return this._backend;
  }
}
