import type { Application } from '#core/Application';
import type { Seconds } from '#core/units';
import type { InputBinding } from '#input/InputBinding';
import { Keyboard } from '#input/types';
import { View } from '#rendering/View';

import { BoundingBoxesLayer } from './BoundingBoxesLayer';
import type { DebugLayer } from './DebugLayer';
import { HitTestLayer } from './HitTestLayer';
import { PerformanceLayer } from './PerformanceLayer';
import { PointerStackLayer } from './PointerStackLayer';
import { RenderPassInspectorLayer } from './RenderPassInspectorLayer';

/**
 * Typed map of the built-in diagnostic layers managed by
 * {@link DebugOverlay}. Access individual layers to toggle visibility or
 * interact with layer-specific state.
 */
export interface DebugLayers {
  readonly performance: PerformanceLayer;
  readonly boundingBoxes: BoundingBoxesLayer;
  readonly hitTest: HitTestLayer;
  readonly pointerStack: PointerStackLayer;
  readonly renderPassInspector: RenderPassInspectorLayer;
}

/**
 * Canvas-native debug overlay. Instantiate AFTER Application is constructed:
 *
 *     import { DebugOverlay } from '@codexo/exojs/debug';
 *     const debug = new DebugOverlay(app);
 *     debug.layers.performance.visible = true;  // or press F1
 *
 * The overlay subscribes to `app.onFrame` and renders its visible layers.
 * World-space layers render first (under text panels) in the scene view;
 * screen-space layers then render in the overlay's pixel-space view.
 *
 * Keybindings (while canvas has focus):
 *   F1 - toggle Performance layer
 *   F2 - toggle BoundingBoxes layer
 *   F3 - toggle HitTest layer
 *   F4 - toggle PointerStack layer
 *   F6 - toggle RenderPassInspector layer
 *
 * NOTE: F-keys only fire while the canvas has focus (engine convention).
 * F5 is deliberately left unbound: browsers reload the page on it, which
 * would tear down the very session being inspected.
 *
 * Each key is claimed through a real {@link InputBinding} rather than the
 * `onKeyDown` signal, so the overlay's shortcuts also suppress the browser's
 * own default for those keys while it exists - F1 opening a help window and
 * F3 opening the find bar are otherwise triggered right alongside the panel
 * they were meant to toggle. Binding registration is what marks a key
 * consumed; a signal subscription runs a frame too late to prevent anything.
 *
 * The master `visible` switch suppresses all layer rendering when false
 * without changing individual layer visibility flags.
 */
export class DebugOverlay {
  /** Master visibility switch. When false, no layers render regardless of their individual flags. */
  public visible = true;

  /** The built-in diagnostic layers. Toggle each layer's `visible` flag or use the F1-F4/F6 keybindings. */
  public readonly layers: DebugLayers;

  private readonly _app: Application;
  private readonly _view: View;
  private readonly _onFrameHandler: (delta: Seconds) => void;
  private readonly _onResizeHandler: (width: number, height: number) => void;
  /** One per keybinding - held so `destroy()` can release the keys it claimed. */
  private readonly _keyBindings: readonly InputBinding[];

  public constructor(app: Application) {
    this._app = app;
    // Logical units, matching what `onResize` reports and what the layers draw
    // in - the backing store is a different size wherever the pixel ratio or a
    // sizing policy says so.
    this._view = new View(app.width / 2, app.height / 2, app.width, app.height);

    this.layers = {
      performance: new PerformanceLayer(app),
      boundingBoxes: new BoundingBoxesLayer(app),
      hitTest: new HitTestLayer(app),
      pointerStack: new PointerStackLayer(app),
      renderPassInspector: new RenderPassInspectorLayer(app),
    };

    this._onFrameHandler = this._onFrame.bind(this);
    this._onResizeHandler = this._onResize.bind(this);

    app.onFrame.add(this._onFrameHandler);
    app.onResize.add(this._onResizeHandler);

    this._keyBindings = [
      app.input.onStart(Keyboard.F1, () => this._toggle(this.layers.performance)),
      app.input.onStart(Keyboard.F2, () => this._toggle(this.layers.boundingBoxes)),
      app.input.onStart(Keyboard.F3, () => this._toggle(this.layers.hitTest)),
      app.input.onStart(Keyboard.F4, () => this._toggle(this.layers.pointerStack)),
      // F5 is skipped on purpose - see the keybinding note on the class.
      app.input.onStart(Keyboard.F6, () => this._toggle(this.layers.renderPassInspector)),
    ];
  }

  /**
   * Unsubscribe from all application events, destroy every layer, and
   * release the overlay's internal {@link View}. Call this when you no
   * longer need the overlay to avoid memory leaks.
   */
  public destroy(): void {
    this._app.onFrame.remove(this._onFrameHandler);
    this._app.onResize.remove(this._onResizeHandler);

    for (const binding of this._keyBindings) {
      binding.unbind();
    }

    for (const layer of Object.values(this.layers) as DebugLayer[]) {
      layer.destroy();
    }

    this._view.destroy();
  }

  private _onResize(width: number, height: number): void {
    this._view.resize(width, height);
    this._view.setCenter(width / 2, height / 2);
  }

  private _onFrame(delta: Seconds): void {
    if (!this.visible) return;

    const layers = Object.values(this.layers) as DebugLayer[];
    const visibleLayers = layers.filter(l => l.visible);

    if (visibleLayers.length === 0) return;

    const backend = this._app.backend;
    const sceneView = backend.view; // capture scene's current view

    // --- World-space layers first (render under screen-space text panels) ---
    const worldLayers = visibleLayers.filter(l => l.viewMode === 'world');

    for (const layer of worldLayers) {
      layer.update(delta);
      layer.render(backend);
    }

    // --- Screen-space layers: swap to overlay's pixel view ---
    const screenLayers = visibleLayers.filter(l => l.viewMode === 'screen');

    if (screenLayers.length > 0) {
      backend.setView(this._view);

      try {
        for (const layer of screenLayers) {
          layer.update(delta);
          layer.render(backend);
        }
      } finally {
        backend.setView(sceneView);
      }
    }
  }

  private _toggle(layer: DebugLayer): void {
    layer.visible = !layer.visible;
  }
}
