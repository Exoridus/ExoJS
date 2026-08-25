import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RendererRegistry } from '#rendering/RendererRegistry';
import type { RenderError } from '#rendering/RenderError';
import { createRenderStats, type RenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RenderTexture } from '#rendering/texture/RenderTexture';

export interface RenderBackendDoubleOptions {
  /** Root target the double reports and hands out views from. Created at 800x600 when omitted. */
  readonly renderTarget?: RenderTarget;
  /** Counters the double resets in `resetStats()`. A fresh set when omitted. */
  readonly stats?: RenderStats;
  readonly backendType?: RenderBackendType;
  readonly rootResolution?: number;
  readonly maxTextureSize?: number;
}

/**
 * A complete, inert {@link RenderBackend} to spread into a test's own double.
 *
 * `RenderBackend` is an interface, so no runtime mock can be derived from it -
 * every member has to exist as an actual value. This factory supplies all of
 * them, chainable and side-effect-free, so a test only writes the handful it
 * asserts on:
 *
 * ```ts
 * const backend: RenderBackend = {
 *   ...createRenderBackendDouble({ renderTarget }),
 *   draw(drawable) {
 *     drawn.push(drawable);
 *
 *     return this;
 *   },
 * };
 * ```
 *
 * Members written after the spread win, and `this` in them is the finished
 * double, not this factory's result. The double owns nothing it is handed: it
 * neither destroys `renderTarget` or a released render texture, so a test that
 * asserts on teardown overrides `destroy()`/`releaseRenderTexture()` itself.
 */
export const createRenderBackendDouble = (options: RenderBackendDoubleOptions = {}): RenderBackend => {
  const renderTarget = options.renderTarget ?? new RenderTarget(800, 600, true);
  const stats = options.stats ?? createRenderStats();

  return {
    backendType: options.backendType ?? RenderBackendType.WebGl2,
    rendererRegistry: new RendererRegistry<RenderBackend>(),
    view: renderTarget.view,
    renderTarget,
    stats,
    clearColor: new Color(0, 0, 0, 0),
    rootResolution: options.rootResolution ?? 1,
    maxTextureSize: options.maxTextureSize ?? 4096,
    onRenderError: new Signal<[RenderError]>(),

    async initialize() {
      return this;
    },
    resetStats() {
      return this;
    },
    clear() {
      return this;
    },
    resize(width: number, height: number) {
      renderTarget.resize(width, height);

      return this;
    },
    setView(view) {
      renderTarget.setView(view);

      return this;
    },
    setRenderTarget() {
      return this;
    },
    pushScissorRect() {
      return this;
    },
    popScissorRect() {
      return this;
    },
    pushStencilClip() {
      return this;
    },
    popStencilClip() {
      return this;
    },
    supportsColorFormat() {
      return true;
    },
    acquireRenderTexture(width: number, height: number) {
      return new RenderTexture(width, height);
    },
    releaseRenderTexture() {
      return this;
    },
    trimRenderTexturePool() {
      return this;
    },
    composeWithAlphaMask() {
      return this;
    },
    composeWithBackdropBlend() {
      return this;
    },
    draw() {
      return this;
    },
    drawInstanced() {
      return this;
    },
    execute() {
      return this;
    },
    flush() {
      return this;
    },
    destroy() {
      return undefined;
    },
  };
};
