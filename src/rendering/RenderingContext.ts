import type { Color } from '#core/Color';
import type { System } from '#core/System';
import type { Time } from '#core/Time';
import type { Matrix } from '#math/Matrix';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { MeshMaterial } from '#rendering/material/MeshMaterial';
import { ImmediateMesh } from '#rendering/mesh/ImmediateMesh';
import type { RenderPassCoordinatorHost } from '#rendering/pass/RenderPassCoordinator';
import { StencilAttachmentMode } from '#rendering/pass/RenderPassDescriptor';
import { playRenderTree } from '#rendering/plan/playRenderTree';
import { RenderTexture } from '#rendering/texture/RenderTexture';

import type { DrawContext, RenderToOptions } from './DrawContext';
import { type RenderBackend } from './RenderBackend';
import { type RenderBatch } from './RenderBatch';
import { type RenderNode } from './RenderNode';
import { type RenderStats } from './RenderStats';
import { View } from './View';

/** Options for {@link RenderingContext.capture} — allocates a new RenderTexture. */
export interface CaptureOptions {
  width: number;
  height: number;
  clearColor?: Color;
}

export interface RenderOptions {
  /** Override the view used for this render call. Defaults to the context's active camera. */
  view?: View;
}

/** Options for {@link RenderingContext.drawGeometry}. */
export interface DrawGeometryOptions {
  /**
   * Custom look (shader / uniforms / textures / blend mode) for this draw. Must
   * target `'mesh'`. Defaults to the standard mesh material (vertex colors,
   * optional texture), so an untextured colored geometry needs no material.
   */
  material?: MeshMaterial;

  /** Tint multiplied into the geometry's vertex colors. Defaults to white (no tint). */
  tint?: Color;

  /** Override the view used for this draw. Defaults to the context's active camera. */
  view?: View;
}

/** Options for {@link RenderingContext.drawBatch}. */
export interface DrawBatchOptions {
  /** Override the view used for this draw. Defaults to the context's active camera. */
  view?: View;
}

/**
 * Owns rendering orchestration: builds, optimizes and plays the internal
 * RenderPlan for a RenderNode subtree, manages render-target/view state for
 * off-screen capture, and exposes the low-level backend as an escape hatch.
 *
 * The conceptual model is "the context renders the node":
 *   context.render(node)            // into the active target (canvas by default)
 *   context.render(node, { view })  // override view (the world view, screenView, etc.)
 *   context.renderTo(node, { target })       // into a caller-owned off-screen target (per-frame)
 *   context.capture(node, { width, height }) // into a freshly allocated RenderTexture
 * @stable
 */
export class RenderingContext implements System, DrawContext {
  /** App-systems tick band — rendering last (camera + render-plan prep). @internal */
  public readonly order = 500;
  private readonly _backend: RenderBackend;
  private _view: View;
  private readonly _screenView: View;
  /** Lazily-created pooled drawable reused by every {@link drawGeometry} call. */
  private _immediateMesh: ImmediateMesh | null = null;
  /** Lazily-created pooled geometry/look source reused by every {@link drawBatch} call. */
  private _batchMesh: ImmediateMesh | null = null;
  /** Views explicitly pinned for per-frame update via {@link trackView} (escape hatch for views ticked but never rendered). */
  private readonly _trackedViews = new Set<View>();
  /** Views rendered since the last {@link update} — auto-advanced then cleared each frame, so a custom view's follow/shake ticks with no manual bookkeeping. */
  private readonly _renderedViews = new Set<View>();

  public constructor(backend: RenderBackend) {
    this._backend = backend;

    const viewWidth = backend.view?.width ?? 0;
    const viewHeight = backend.view?.height ?? 0;
    const viewCenterX = backend.view?.center?.x ?? viewWidth / 2;
    const viewCenterY = backend.view?.center?.y ?? viewHeight / 2;

    this._view = View.from({
      center: { x: viewCenterX, y: viewCenterY },
      size: { width: viewWidth, height: viewHeight },
    });
    this._screenView = new View(viewCenterX, viewCenterY, viewWidth, viewHeight);
  }

  /**
   * The active world {@link View} — the default for {@link render}. Defaults to
   * a view matching the initial backend view. Replace with a custom `View` for
   * follow, zoom, bounds, or split-screen viewport behavior.
   */
  public get view(): View {
    return this._view;
  }

  public set view(view: View) {
    const previousView = this._view;

    this._view = view;

    if (previousView !== view) {
      previousView.destroy();
    }
  }

  /**
   * A RenderingContext-managed screen-space {@link View} suitable for UI
   * overlays. Center and size are reset to match canvas logical dimensions
   * on each {@link resize} call. The returned reference is stable (the same
   * View object across frames), but its properties may change.
   *
   * Never follows, shakes, or rotates by default.
   */
  public get screenView(): View {
    return this._screenView;
  }

  /**
   * Register a custom {@link View} (e.g. a picture-in-picture or minimap view)
   * so {@link update} advances its `follow`/`shake`/bounds each frame, alongside
   * the active {@link view}. The active view and {@link screenView} are managed
   * automatically and need not be tracked.
   *
   * The view is caller-owned: call {@link untrackView} before discarding it,
   * otherwise a `follow` target keeps it (and its target node) referenced.
   */
  public trackView(view: View): void {
    this._trackedViews.add(view);
  }

  /** Stop advancing a previously {@link trackView}-ed view. No-op if absent. */
  public untrackView(view: View): void {
    this._trackedViews.delete(view);
  }

  /**
   * Advance follow, shake, and bounds-constraint animations on the active
   * {@link view}, every view rendered last frame (automatic), and any
   * {@link trackView}-ed view. Ticked once per frame via {@link Application.systems}.
   */
  public update(delta: Time): void {
    const ms = delta.milliseconds;

    this._view.update(ms);

    // Auto-advance every view rendered last frame (so a custom view's follow/shake
    // ticks with no manual bookkeeping) plus any explicitly tracked view; each view
    // updates at most once per frame.
    for (const view of this._trackedViews) {
      if (view !== this._view) {
        view.update(ms);
      }
    }
    for (const view of this._renderedViews) {
      if (view !== this._view && !this._trackedViews.has(view)) {
        view.update(ms);
      }
    }

    // Render-usage is per-frame: clear so a view that stops being rendered stops ticking.
    this._renderedViews.clear();
  }

  /**
   * Destroy the resources this context owns — the active {@link View} and the
   * screen-space {@link View}. The {@link RenderBackend} is owned by the
   * Application and destroyed separately.
   * @internal — invoked via Application.systems on teardown.
   */
  public destroy(): void {
    this._view.destroy();
    this._screenView.destroy();
    this._trackedViews.clear();
    this._renderedViews.clear();
    this._immediateMesh?.destroy();
    this._immediateMesh = null;
    this._batchMesh?.destroy();
    this._batchMesh = null;
  }

  /**
   * Resize the camera and screen view to match new canvas dimensions.
   * Preserves the camera's center and zoom; only the visible area size changes.
   */
  public resize(width: number, height: number): void {
    this._view.resize(width, height);
    this._screenView.resize(width, height);
    this._screenView.setCenter(width / 2, height / 2);
  }

  /**
   * Render `node` into the active render target.
   *
   * Sets the backend's active view to `options.view` (or the default camera)
   * before building and playing the render plan. This is the recommended
   * high-level rendering entry point.
   */
  public render(node: RenderNode, options: RenderOptions = {}): void {
    const view = options.view ?? this._view;

    this._renderedViews.add(view);
    this._backend.setView(view);
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
  public capture(node: RenderNode, options: CaptureOptions): RenderTexture {
    const target = new RenderTexture(options.width, options.height);
    const view = new View(options.width / 2, options.height / 2, options.width, options.height);
    const coordinator = (this._backend as RenderBackend & Partial<RenderPassCoordinatorHost>)._passCoordinator;

    if (coordinator) {
      coordinator.withChildPass(
        {
          target,
          view,
          load: options.clearColor !== undefined ? 'clear' : 'load',
          clearColor: options.clearColor ?? null,
          stencil: StencilAttachmentMode.None,
        },
        () => {
          playRenderTree(node, this._backend);
        },
      );

      return target;
    }

    // Legacy fallback for backends without a pass coordinator (e.g. test stubs).
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

  /**
   * Clear the active render target to `color`. Routes through the pass
   * coordinator so it respects the clear-vs-load policy and never leaks the
   * clear onto another target. Falls back to a raw backend clear when no
   * coordinator is present (test stubs).
   */
  public clear(color: Color): void {
    const coordinator = (this._backend as RenderBackend & Partial<RenderPassCoordinatorHost>)._passCoordinator;

    if (coordinator) {
      coordinator.withChildPass(
        {
          target: coordinator.activeTarget,
          view: coordinator.activeView,
          load: 'clear',
          clearColor: color,
          stencil: StencilAttachmentMode.None,
        },
        () => {},
      );

      return;
    }

    this._backend.clear(color);
  }

  /**
   * Render `node` into a caller-owned {@link RenderTexture} that is reused across
   * frames — the per-frame, allocation-free counterpart to {@link capture}. The
   * target and view are supplied by the caller; the view defaults to the
   * target's own view. Save/restore is handled by the pass coordinator.
   */
  public renderTo(node: RenderNode, options: RenderToOptions): void {
    const view = options.view ?? options.target.view;

    this._renderedViews.add(view);
    const coordinator = (this._backend as RenderBackend & Partial<RenderPassCoordinatorHost>)._passCoordinator;

    if (coordinator) {
      coordinator.withChildPass(
        {
          target: options.target,
          view,
          load: options.clear !== undefined ? 'clear' : 'load',
          clearColor: options.clear ?? null,
          stencil: StencilAttachmentMode.None,
        },
        () => {
          playRenderTree(node, this._backend);
        },
      );

      return;
    }

    const previousTarget = this._backend.renderTarget;
    const previousView = this._backend.view;

    this._backend.setRenderTarget(options.target);
    this._backend.setView(view);

    if (options.clear !== undefined) {
      this._backend.clear(options.clear);
    }

    try {
      playRenderTree(node, this._backend);
    } finally {
      this._backend.setRenderTarget(previousTarget);
      this._backend.setView(previousView);
    }
  }

  /**
   * Immediately draw a single {@link Geometry} with `transform` as its world
   * matrix — no retained {@link RenderNode} required. Useful for procedural or
   * data-driven shapes that would be wasteful to wrap in a node.
   *
   * The draw is submitted through the mesh renderer and flushed at once, so it
   * lands in call order relative to the surrounding {@link render} calls: a
   * `drawGeometry` issued after a layer's `render` draws on top of it. All
   * output is presented at the frame-end backend flush, as usual.
   *
   * `transform` is taken as the raw world matrix (`a, b, c, d, tx, ty`),
   * bypassing the position / rotation / scale / origin composition a node would
   * apply — build it with {@link Matrix} directly. The geometry must use the
   * `triangle-list` topology and the standard mesh attribute layout (position,
   * optional texcoord and color); custom per-vertex attributes are dropped.
   *
   * This is the single-draw convenience of the immediate API: each call is its
   * own flush and draw call, and the geometry is repacked every call, so it is
   * best for a handful of draws. An instanced batch path for drawing many like
   * items as one upload + one draw follows in a later release.
   *
   * @param geometry  Source geometry (interleaved vertex data + layout).
   * @param transform World matrix applied to the geometry's local vertices.
   * @param options   Optional {@link DrawGeometryOptions.material material},
   *                  {@link DrawGeometryOptions.tint tint}, and
   *                  {@link DrawGeometryOptions.view view}.
   */
  public drawGeometry(geometry: Geometry, transform: Matrix, options: DrawGeometryOptions = {}): void {
    const material = options.material ?? null;

    // Defensive guard for JS callers; the MeshMaterial type already enforces
    // this for TypeScript callers (its `target` is the literal 'mesh').
    if (material !== null && (material.target as string) !== 'mesh') {
      throw new Error(`drawGeometry material must target 'mesh' (got '${String(material.target)}').`);
    }

    const view = options.view ?? this._view;

    this._renderedViews.add(view);
    const mesh = (this._immediateMesh ??= new ImmediateMesh());

    // Set the view first: setView now only flushes when the view actually changes
    // (not unconditionally). Correctness here rests on (a) the trailing flush()
    // below — so a later drawGeometry cannot observe this pooled mesh through a
    // still-deferred draw — and (b) any renderer switch flushing its pending batch.
    this._backend.setView(view);
    mesh.configure(geometry, transform, material, options.tint ?? null);
    this._backend.draw(mesh);
    this._backend.flush();
  }

  /**
   * Immediately draw an instanced {@link RenderBatch} — one geometry + material
   * drawn once with the batch's N per-instance `(transform, tint)` pairs as a
   * single instanced draw call. This is the high-throughput immediate path: use
   * it for many like items (tiles, bullets, procedural instances) where
   * {@link drawGeometry} would issue one draw call each.
   *
   * Like {@link drawGeometry}, the batch is flushed at once and lands in call
   * order relative to the surrounding {@link render} calls. An empty batch is a
   * no-op.
   *
   * v1 renders with the default mesh material (per-instance tint over the
   * geometry's vertex colors); a custom {@link RenderBatch.material} is not yet
   * supported on the instanced path.
   *
   * @param batch   The instanced submission (geometry + per-instance transforms/tints).
   * @param options Optional {@link DrawBatchOptions.view view} override.
   */
  public drawBatch(batch: RenderBatch, options: DrawBatchOptions = {}): void {
    if (batch.material !== null) {
      throw new Error('drawBatch custom materials are not supported yet — v1 renders batches with the default mesh material.');
    }

    if (batch.count === 0) {
      return;
    }

    const view = options.view ?? this._view;

    this._renderedViews.add(view);
    const mesh = (this._batchMesh ??= new ImmediateMesh());

    // Set the view first (setView only flushes when the view actually changes;
    // correctness rests on the trailing flush() below and on any renderer switch
    // flushing its pending batch), configure the pooled geometry/look source,
    // then submit a single instanced draw over the batch's per-instance
    // transforms/tints and flush it immediately.
    this._backend.setView(view);
    mesh.configureBatchSource(batch.geometry, batch.material);
    this._backend.drawInstanced(mesh, batch._instanceTransforms, batch._instanceTints, batch.count);
    this._backend.flush();
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
