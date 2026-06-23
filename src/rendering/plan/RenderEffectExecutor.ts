import { Rectangle } from '#math/Rectangle';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { MaskSource, RenderNode } from '#rendering/RenderNode';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';

import { type BarrierScope, ClipKind, type GroupScope } from './RenderScope';

/** @internal */
export class RenderEffectExecutor {
  public static play(barrier: BarrierScope, backend: RenderBackend, playScope: (scope: GroupScope) => void): void {
    const { node, effect } = barrier;
    const hasFilters = effect.filters.length > 0;
    const needsBitmapCache = effect.cacheAsBitmap;
    const { left, top, width, height } = barrier;

    if (!hasFilters && !needsBitmapCache) {
      this._withClip(node, backend, barrier, () => {
        if (barrier.childPlan !== null) {
          playScope(barrier.childPlan);
        }
      });

      return;
    }

    if (needsBitmapCache && barrier.childPlan === null) {
      const cachedTexture = node._renderPlanGetCacheTexture();

      if (cachedTexture !== null) {
        this._withClip(node, backend, barrier, () => {
          node._renderPlanDrawTexture(backend, cachedTexture, left, top, width, height, effect.blendMode);
        });
      }

      return;
    }

    const cacheTexture = needsBitmapCache ? node._renderPlanEnsureCacheTexture(width, height) : null;
    let pooledTexture: RenderTexture | null = null;

    try {
      const sourceTexture = needsBitmapCache && !hasFilters ? cacheTexture! : backend.acquireRenderTexture(width, height);

      if (sourceTexture !== cacheTexture) {
        pooledTexture = sourceTexture;
      }

      node._renderPlanRenderToTexture(backend, sourceTexture, left, top, width, height, () => {
        if (barrier.childPlan !== null) {
          playScope(barrier.childPlan);
        }
      });

      let finalTexture = sourceTexture;

      if (hasFilters) {
        for (let index = 0; index < effect.filters.length; index++) {
          const isLast = index === effect.filters.length - 1;
          const output = isLast && needsBitmapCache ? cacheTexture! : backend.acquireRenderTexture(width, height);

          try {
            // In-bounds: index < effect.filters.length.
            effect.filters[index]!.apply(backend, finalTexture, output);
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

      if (needsBitmapCache) {
        node._renderPlanStoreCacheTexture(cacheTexture!, left, top, width, height);
      }

      this._withClip(node, backend, barrier, () => {
        node._renderPlanDrawTexture(backend, finalTexture, left, top, width, height, effect.blendMode);
      });
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

    const contentTexture = backend.acquireRenderTexture(barrier.width, barrier.height);
    const releasePool: RenderTexture[] = [contentTexture];

    try {
      node._renderPlanRenderToTexture(backend, contentTexture, barrier.left, barrier.top, barrier.width, barrier.height, callback);

      const maskTexture = this._resolveMaskTexture(node, backend, mask, barrier, releasePool);

      backend.composeWithAlphaMask(contentTexture, maskTexture, barrier.left, barrier.top, barrier.width, barrier.height, barrier.effect.blendMode);
    } finally {
      for (const texture of releasePool) {
        backend.releaseRenderTexture(texture);
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
      const maskTexture = backend.acquireRenderTexture(barrier.width, barrier.height);

      releasePool.push(maskTexture);

      node._renderPlanRenderToTexture(backend, maskTexture, barrier.left, barrier.top, barrier.width, barrier.height, () => {
        mask.render(backend);
      });

      return maskTexture;
    }

    return mask;
  }
}
