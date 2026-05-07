import { View } from '@/rendering/View';
import { Keyboard } from '@/input/types';
import { PerformanceLayer } from './PerformanceLayer';
import { BoundingBoxesLayer } from './BoundingBoxesLayer';
import { HitTestLayer } from './HitTestLayer';
import { PointerStackLayer } from './PointerStackLayer';
import type { Application } from '@/core/Application';
import type { Time } from '@/core/Time';
import type { DebugLayer } from './DebugLayer';

/**
 * Typed map of the four built-in diagnostic layers managed by
 * {@link DebugOverlay}. Access individual layers to toggle visibility or
 * interact with layer-specific state.
 */
export interface DebugLayers {
    readonly performance: PerformanceLayer;
    readonly boundingBoxes: BoundingBoxesLayer;
    readonly hitTest: HitTestLayer;
    readonly pointerStack: PointerStackLayer;
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
 *   F1 — toggle Performance layer
 *   F2 — toggle BoundingBoxes layer
 *   F3 — toggle HitTest layer
 *   F4 — toggle PointerStack layer
 *
 * NOTE: F-keys only fire while the canvas has focus (engine convention).
 *
 * The master `visible` switch suppresses all layer rendering when false
 * without changing individual layer visibility flags.
 */
export class DebugOverlay {
    /** Master visibility switch. When false, no layers render regardless of their individual flags. */
    public visible: boolean = true;

    /** The four built-in diagnostic layers. Toggle each layer's `visible` flag or use the F1–F4 keybindings. */
    public readonly layers: DebugLayers;

    private readonly _app: Application;
    private readonly _view: View;
    private readonly _onFrameHandler: (delta: Time) => void;
    private readonly _onKeyDownHandler: (channel: number) => void;
    private readonly _onResizeHandler: (width: number, height: number) => void;

    public constructor(app: Application) {
        this._app = app;
        this._view = new View(app.canvas.width / 2, app.canvas.height / 2, app.canvas.width, app.canvas.height);

        this.layers = {
            performance:  new PerformanceLayer(app),
            boundingBoxes: new BoundingBoxesLayer(app),
            hitTest:       new HitTestLayer(app),
            pointerStack:  new PointerStackLayer(app),
        };

        this._onFrameHandler  = this._onFrame.bind(this);
        this._onKeyDownHandler = this._onKeyDown.bind(this);
        this._onResizeHandler  = this._onResize.bind(this);

        app.onFrame.add(this._onFrameHandler);
        app.inputManager.onKeyDown.add(this._onKeyDownHandler);
        app.onResize.add(this._onResizeHandler);
    }

    /**
     * Unsubscribe from all application events, destroy every layer, and
     * release the overlay's internal {@link View}. Call this when you no
     * longer need the overlay to avoid memory leaks.
     */
    public destroy(): void {
        this._app.onFrame.remove(this._onFrameHandler);
        this._app.inputManager.onKeyDown.remove(this._onKeyDownHandler);
        this._app.onResize.remove(this._onResizeHandler);

        for (const layer of Object.values(this.layers) as Array<DebugLayer>) {
            layer.destroy();
        }

        this._view.destroy();
    }

    private _onResize(width: number, height: number): void {
        this._view.resize(width, height);
        this._view.setCenter(width / 2, height / 2);
    }

    private _onFrame(delta: Time): void {
        if (!this.visible) return;

        const layers = Object.values(this.layers) as Array<DebugLayer>;
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

    private _onKeyDown(channel: number): void {
        switch (channel) {
            case Keyboard.F1: this.layers.performance.visible  = !this.layers.performance.visible;  break;
            case Keyboard.F2: this.layers.boundingBoxes.visible = !this.layers.boundingBoxes.visible; break;
            case Keyboard.F3: this.layers.hitTest.visible       = !this.layers.hitTest.visible;       break;
            case Keyboard.F4: this.layers.pointerStack.visible  = !this.layers.pointerStack.visible;  break;
        }
    }
}
