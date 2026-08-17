import { Rectangle } from '#math/Rectangle';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { MaskSource, RenderNode } from '#rendering/RenderNode';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';

import { type BarrierScope, ClipKind, type GroupScope } from './RenderScope';
import { targetTexels } from './targetResolution';

/**
 * One barrier's in-flight state, held on a depth-indexed stack.
 *
 * The clip / rect-clip / mask chain is continuation-passing — each layer wraps
 * the next and the innermost body does the actual work — and written the
 * obvious way that means a fresh closure per layer per barrier per frame, plus
 * the enclosing function's context. On a hundred filtered nodes that was the
 * single largest steady-state allocation left in the effect path.
 *
 * Staging the state here instead lets every body be a static function allocated
 * once. Barriers nest (a filtered node inside a filtered container), hence a
 * stack rather than a single slot; the frames are reused across frames and
 * across barriers, so the stack only ever grows to the deepest nesting the
 * scene reaches.
 */
interface EffectFrame {
  barrier: BarrierScope | null;
  backend: RenderBackend | null;
  playScope: ((scope: GroupScope) => void) | null;
  /** Set on the `cacheAsTexture` replay path — the baked texture to composite. */
  cachedTexture: RenderTexture | null;
  /** Set on the full path — the filter chain's output, or the capture when there are no filters. */
  finalTexture: RenderTexture | null;
  /**
   * Set while resolving a NODE mask into its own target. Narrower than
   * {@link MaskSource}: the texture-backed sources need no render pass, so only
   * a node ever reaches the body that reads this.
   */
  maskSource: RenderNode | null;
}

const createFrame = (): EffectFrame => ({
  barrier: null,
  backend: null,
  playScope: null,
  cachedTexture: null,
  finalTexture: null,
  maskSource: null,
});

/** @internal */
export class RenderEffectExecutor {
  private static readonly _frames: EffectFrame[] = [];
  private static _depth = 0;

  /** The frame the currently executing body belongs to. */
  private static _current(): EffectFrame {
    // In range: bodies only run between a push and its matching pop.
    return RenderEffectExecutor._frames[RenderEffectExecutor._depth - 1]!;
  }

  /** Body: play the barrier's child plan. Used by the effect-less and capture paths. */
  private static readonly _playChildPlan = (): void => {
    const frame = RenderEffectExecutor._current();

    if (frame.barrier!.childPlan !== null) {
      frame.playScope!(frame.barrier!.childPlan);
    }
  };

  /** Body: draw the `cacheAsTexture` texture straight back into the enclosing target. */
  private static readonly _drawCachedTexture = (): void => {
    const frame = RenderEffectExecutor._current();
    const { barrier, backend, cachedTexture } = frame;

    barrier!.node._renderPlanDrawTexture(backend!, cachedTexture!, barrier!.left, barrier!.top, barrier!.width, barrier!.height, barrier!.effect.blendMode);
  };

  /** Body: composite the filter chain's output back into the enclosing target. */
  private static readonly _compositeFinalTexture = (): void => {
    const frame = RenderEffectExecutor._current();
    const { barrier, backend, finalTexture } = frame;
    const { left, top, width, height, effect } = barrier!;

    if (effect.needsBackdropBlend) {
      backend!.composeWithBackdropBlend(finalTexture!, left, top, width, height, effect.blendMode);
    } else {
      barrier!.node._renderPlanDrawTexture(backend!, finalTexture!, left, top, width, height, effect.blendMode);
    }
  };

  /** Body: render a node mask's own subtree into the mask target. */
  private static readonly _renderMaskSource = (): void => {
    const frame = RenderEffectExecutor._current();

    frame.maskSource!.render(frame.backend!);
  };

  public static play(barrier: BarrierScope, backend: RenderBackend, playScope: (scope: GroupScope) => void): void {
    const depth = RenderEffectExecutor._depth;
    const frame = (RenderEffectExecutor._frames[depth] ??= createFrame());

    frame.barrier = barrier;
    frame.backend = backend;
    frame.playScope = playScope;
    frame.cachedTexture = null;
    frame.finalTexture = null;
    frame.maskSource = null;
    RenderEffectExecutor._depth = depth + 1;

    try {
      this._playFramed(barrier, backend, frame);
    } finally {
      RenderEffectExecutor._depth = depth;
      // Drop the references rather than only the depth: a frame outlives the
      // barrier it served, and holding the scope would pin its drawables until
      // the same nesting depth is reached again.
      frame.barrier = null;
      frame.backend = null;
      frame.playScope = null;
      frame.cachedTexture = null;
      frame.finalTexture = null;
      frame.maskSource = null;
    }
  }

  private static _playFramed(barrier: BarrierScope, backend: RenderBackend, frame: EffectFrame): void {
    const { node, effect } = barrier;
    const hasFilters = effect.filters.length > 0;
    const needsTextureCache = effect.cacheAsTexture;
    const { left, top, width, height, resolution } = barrier;
    // The one place the two coordinate systems meet. Every TEXTURE is allocated
    // in texels; every capture view, composite and cache bound stays in the
    // logical units the plan built. Rendering the logical view into a larger
    // texture is what supersamples it; drawing it back at the logical size is
    // what resolves it against the surface.
    const texelWidth = targetTexels(width, resolution);
    const texelHeight = targetTexels(height, resolution);

    if (!hasFilters && !needsTextureCache && !effect.needsBackdropBlend) {
      this._withClip(node, backend, barrier, this._playChildPlan);

      return;
    }

    if (needsTextureCache && barrier.childPlan === null) {
      const cachedTexture = node._renderPlanGetCacheTexture();

      if (cachedTexture !== null) {
        frame.cachedTexture = cachedTexture;
        this._withClip(node, backend, barrier, this._drawCachedTexture);
      }

      return;
    }

    const cacheTexture = needsTextureCache ? node._renderPlanEnsureCacheTexture(texelWidth, texelHeight) : null;
    let pooledTexture: RenderTexture | null = null;

    try {
      const sourceTexture = needsTextureCache && !hasFilters ? cacheTexture! : backend.acquireRenderTexture(texelWidth, texelHeight);

      if (sourceTexture !== cacheTexture) {
        pooledTexture = sourceTexture;
      }

      node._renderPlanRenderToTexture(backend, sourceTexture, left, top, width, height, this._playChildPlan);

      let finalTexture = sourceTexture;

      if (hasFilters) {
        for (let index = 0; index < effect.filters.length; index++) {
          const isLast = index === effect.filters.length - 1;
          const output = isLast && needsTextureCache ? cacheTexture! : backend.acquireRenderTexture(texelWidth, texelHeight);

          try {
            // In-bounds: index < effect.filters.length.
            effect.filters[index]!.apply(backend, finalTexture, output, resolution);
          } catch (error) {
            if (output !== cacheTexture) {
              backend.releaseRenderTexture(output);
            }

            throw error;
          }

          if (pooledTexture !== null) {
            backend.releaseRenderTexture(pooledTexture);
            pooledTexture = null;
          }

          finalTexture = output;

          if (output !== cacheTexture) {
            pooledTexture = output;
          }
        }
      }

      if (needsTextureCache) {
        node._renderPlanStoreCacheTexture(cacheTexture!, left, top, width, height, resolution);
      }

      frame.finalTexture = finalTexture;
      this._withClip(node, backend, barrier, this._compositeFinalTexture);
    } finally {
      if (pooledTexture !== null) {
        backend.releaseRenderTexture(pooledTexture);
      }
    }
  }

  // Clip wraps the mask block as the outermost effect boundary, so it acts on
  // the final filtered/masked output. Stencil (Geometry) is outermost; the Rect
  // scissor sits between it and the alpha-mask machinery; both compose with any
  // existing mask scissor since scissors/stencil are all restrictive.
  private static _withClip(node: RenderNode, backend: RenderBackend, barrier: BarrierScope, callback: () => void): void {
    if (barrier.effect.clip === ClipKind.Stencil) {
      backend.pushStencilClip(barrier.effect.clipShape as Geometry, node.getGlobalTransform());

      try {
        this._withRectClip(node, backend, barrier, callback);
      } finally {
        backend.popStencilClip();
      }

      return;
    }

    this._withRectClip(node, backend, barrier, callback);
  }

  private static _withRectClip(node: RenderNode, backend: RenderBackend, barrier: BarrierScope, callback: () => void): void {
    if (barrier.effect.clip === ClipKind.Rect) {
      const rect = (barrier.effect.clipShape as Rectangle | null) ?? node.getBounds();

      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      backend.pushScissorRect(rect);

      try {
        this._withMask(node, backend, barrier, callback);
      } finally {
        backend.popScissorRect();
      }

      return;
    }

    this._withMask(node, backend, barrier, callback);
  }

  private static _withMask(node: RenderNode, backend: RenderBackend, barrier: BarrierScope, callback: () => void): void {
    const mask = barrier.effect.maskSource;

    if (mask === null) {
      callback();

      return;
    }

    if (mask instanceof Rectangle) {
      if (mask.width <= 0 || mask.height <= 0) {
        return;
      }

      backend.pushScissorRect(mask);

      try {
        callback();
      } finally {
        backend.popScissorRect();
      }

      return;
    }

    const contentTexture = backend.acquireRenderTexture(targetTexels(barrier.width, barrier.resolution), targetTexels(barrier.height, barrier.resolution));
    const releasePool: RenderTexture[] = [contentTexture];

    try {
      node._renderPlanRenderToTexture(backend, contentTexture, barrier.left, barrier.top, barrier.width, barrier.height, callback);

      const maskTexture = this._resolveMaskTexture(node, backend, mask, barrier, releasePool);

      backend.composeWithAlphaMask(contentTexture, maskTexture, barrier.left, barrier.top, barrier.width, barrier.height, barrier.effect.blendMode);
    } finally {
      for (let i = 0; i < releasePool.length; i++) {
        // In-bounds: i < length.
        backend.releaseRenderTexture(releasePool[i]!);
      }
    }
  }

  private static _resolveMaskTexture(
    node: RenderNode,
    backend: RenderBackend,
    mask: Exclude<MaskSource, Rectangle | null>,
    barrier: BarrierScope,
    releasePool: RenderTexture[],
  ): Texture | RenderTexture {
    if (!(mask instanceof Texture) && !(mask instanceof RenderTexture)) {
      const maskTexture = backend.acquireRenderTexture(targetTexels(barrier.width, barrier.resolution), targetTexels(barrier.height, barrier.resolution));
      const frame = RenderEffectExecutor._current();
      const previousMask = frame.maskSource;

      releasePool.push(maskTexture);
      frame.maskSource = mask;

      try {
        node._renderPlanRenderToTexture(backend, maskTexture, barrier.left, barrier.top, barrier.width, barrier.height, this._renderMaskSource);
      } finally {
        frame.maskSource = previousMask;
      }

      return maskTexture;
    }

    return mask;
  }
}
