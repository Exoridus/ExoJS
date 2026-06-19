import type { Color } from '#core/Color';
import type { System } from '#core/System';
import type { Time } from '#core/Time';
import type { RenderPassCoordinatorHost } from '#rendering/pass/RenderPassCoordinator';
import { StencilAttachmentMode } from '#rendering/pass/RenderPassDescriptor';
import { playRenderTree } from '#rendering/plan/playRenderTree';
import { RenderTexture } from '#rendering/texture/RenderTexture';

import { Camera } from './Camera';
import { type RenderBackend } from './RenderBackend';
import { type RenderNode } from './RenderNode';
import { type RenderStats } from './RenderStats';
import { View } from './View';

export interface RenderToOptions {
  width: number;
  height: number;
  clearColor?: Color;
}

export interface RenderOptions {
  /** Override the view used for this render call. Defaults to the context's active camera. */
  view?: View;
}

/**
 * Owns rendering orchestration: builds, optimizes and plays the internal
 * RenderPlan for a RenderNode subtree, manages render-target/view state for
 * off-screen capture, and exposes the low-level backend as an escape hatch.
 *
 * The conceptual model is "the context renders the node":
 *   context.render(node)            // into the active target (canvas by default)
 *   context.render(node, { view })  // override view (camera, screenView, etc.)
 *   context.renderTo(node, opts)    // into an off-screen RenderTexture
 * @stable
 */
export class RenderingContext implements System {
  /** App-systems tick band — rendering last (camera + render-plan prep). @internal */
  public readonly order = 500;
  private readonly _backend: RenderBackend;
  private _camera: Camera;
  private readonly _screenView: View;

  public constructor(backend: RenderBackend) {
    this._backend = backend;

    const viewWidth = backend.view?.width ?? 0;
    const viewHeight = backend.view?.height ?? 0;
    const viewCenterX = backend.view?.center?.x ?? viewWidth / 2;
    const viewCenterY = backend.view?.center?.y ?? viewHeight / 2;

    this._camera = new Camera({
      center: { x: viewCenterX, y: viewCenterY },
      size: { width: viewWidth, height: viewHeight },
    });
    this._screenView = new View(viewCenterX, viewCenterY, viewWidth, viewHeight);
  }

  /**
   * The active camera. Defaults to a camera that matches the initial
   * backend view. Replace with a custom `Camera` instance for follow,
   * zoom, bounds, or split-screen viewport behavior.
   */
  public get camera(): Camera {
    return this._camera;
  }

  public set camera(camera: Camera) {
    const previousCamera = this._camera;

    this._camera = camera;

    if (previousCamera !== camera) {
      previousCamera.destroy();
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

  /** Backward-compatible alias — returns the active {@link camera}. */
  public get view(): View {
    return this._camera;
  }

  /**
   * Advance follow, shake, and bounds-constraint animations on the active
   * camera. Ticked once per frame via {@link Application.systems}.
   */
  public update(delta: Time): void {
    this._camera.update(delta.milliseconds);
  }

  /**
   * Destroy the resources this context owns — the active {@link Camera} and the
   * screen-space {@link View}. The {@link RenderBackend} is owned by the
   * Application and destroyed separately.
   * @internal — invoked via Application.systems on teardown.
   */
  public destroy(): void {
    this._camera.destroy();
    this._screenView.destroy();
  }

  /**
   * Resize the camera and screen view to match new canvas dimensions.
   * Preserves the camera's center and zoom; only the visible area size changes.
   */
  public resize(width: number, height: number): void {
    this._camera.resize(width, height);
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
    const view = options.view ?? this._camera;

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
  public renderTo(node: RenderNode, options: RenderToOptions): RenderTexture {
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
