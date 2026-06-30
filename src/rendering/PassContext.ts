import type { Color } from '#core/Color';
import type { Matrix } from '#math/Matrix';
import type { Geometry } from '#rendering/geometry/Geometry';

import type { DrawContext, RenderToOptions } from './DrawContext';
import type { RenderBackend } from './RenderBackend';
import type { RenderBatch } from './RenderBatch';
import type { RenderNode } from './RenderNode';
import type { RenderTarget } from './RenderTarget';
import type { DrawBatchOptions, DrawGeometryOptions, RenderingContext, RenderOptions } from './RenderingContext';
import type { View } from './View';

/**
 * Pass-scoped {@link DrawContext}: the active render target and view for a
 * {@link CallbackRenderPass} callback. `clear`/`render`/`renderTo` route through
 * the owning {@link RenderingContext} (and its pass coordinator), so they act on
 * THIS pass's target and never reset the active view or leak onto another
 * target. Default view for `render`/`draw*` is the pass view — not the world
 * view — so a callback inside an off-screen redirect renders correctly without
 * passing `{ view }` explicitly.
 *
 * Use {@link backend} only for raw draws or GPU state; switching target / view /
 * clear through it bypasses the coordinator (the leak this type prevents).
 * @advanced
 */
export class PassContext implements DrawContext {
  public constructor(
    private readonly _context: RenderingContext,
    /** The target this pass draws into (read-only). */
    public readonly target: RenderTarget,
    /** The view this pass renders with (read-only). */
    public readonly view: View,
  ) {}

  public get backend(): RenderBackend {
    return this._context.backend;
  }

  public clear(color: Color): void {
    this._context.clear(color);
  }

  public render(node: RenderNode, options?: RenderOptions): void {
    this._context.render(node, { view: options?.view ?? this.view });
  }

  public renderTo(node: RenderNode, options: RenderToOptions): void {
    this._context.renderTo(node, options);
  }

  public drawGeometry(geometry: Geometry, transform: Matrix, options?: DrawGeometryOptions): void {
    this._context.drawGeometry(geometry, transform, { ...options, view: options?.view ?? this.view });
  }

  public drawBatch(batch: RenderBatch, options?: DrawBatchOptions): void {
    this._context.drawBatch(batch, { ...options, view: options?.view ?? this.view });
  }
}
