import type { Color } from '#core/Color';
import type { Matrix } from '#math/Matrix';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { RenderTexture } from '#rendering/texture/RenderTexture';

import type { RenderBackend } from './RenderBackend';
import type { RenderBatch } from './RenderBatch';
import type { DrawBatchOptions, DrawGeometryOptions, RenderOptions } from './RenderingContext';
import type { RenderNode } from './RenderNode';
import type { View } from './View';

/**
 * Caller-owned, per-frame off-screen render target. Unlike
 * {@link RenderingContext.capture}, the {@link RenderTexture} is supplied by the
 * caller and reused across frames (no per-call allocation).
 */
export interface RenderToOptions {
  /** Destination texture, owned and kept stable by the caller. */
  target: RenderTexture;
  /** View to render with. Defaults to the target's own view. */
  view?: View;
  /** Clear the target to this colour before rendering; omitted preserves its contents. */
  clear?: Color;
}

/**
 * The shared rendering verbs that act on the active render target. Implemented
 * by the frame-level {@link RenderingContext} (active target = the canvas by
 * default) and the pass-scoped `PassContext` (active target = the pass target).
 *
 * Every verb operates on the *active* target and never resets the active view,
 * so it is safe inside a pass redirect. Use {@link backend} only for raw draws
 * or GPU state — never to switch target/view/clear, which would bypass the
 * coordinator's clear-vs-load handling.
 * @stable
 */
export interface DrawContext {
  /** Render `node` into the active target with `options.view` (default: the active view). */
  render(node: RenderNode, options?: RenderOptions): void;
  /** Render `node` into a caller-owned off-screen target (nested when called inside a pass). */
  renderTo(node: RenderNode, options: RenderToOptions): void;
  /** Clear the active target to `color` (coordinator-routed; no leak). */
  clear(color: Color): void;
  /** Immediately draw a single geometry with `transform` as its world matrix. */
  drawGeometry(geometry: Geometry, transform: Matrix, options?: DrawGeometryOptions): void;
  /** Immediately draw an instanced batch. */
  drawBatch(batch: RenderBatch, options?: DrawBatchOptions): void;
  /** @advanced Raw backend — draws/state only; do NOT switch target/view/clear here. */
  readonly backend: RenderBackend;
}
