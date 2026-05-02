import { View } from '@/rendering/View';
import { Keyboard } from '@/input/types';
import { PerformanceLayer } from './PerformanceLayer';
import type { Application } from '@/core/Application';
import type { Time } from '@/core/Time';
import type { DebugLayer } from './DebugLayer';

export interface DebugLayers {
    readonly performance: PerformanceLayer;
}

/**
 * Canvas-native debug overlay. Instantiate AFTER Application is constructed:
 *
 *     import { DebugOverlay } from '@codexo/exojs/debug';
 *     const debug = new DebugOverlay(app);
 *     debug.layers.performance.visible = true;  // or press F1
 *
 * The overlay subscribes to `app.onFrame` and renders its visible layers
 * into a screen-space view between scene render and backend flush.
 *
 * F1 toggles the Performance layer. Hardcoded for V1; opt-out and additional
 * layers come in future patches.
 *
 * NOTE: F-keys only fire while the canvas has focus (engine convention).
 */
export class DebugOverlay {
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
            performance: new PerformanceLayer(app),
        };

        this._onFrameHandler = this._onFrame.bind(this);
        this._onKeyDownHandler = this._onKeyDown.bind(this);
        this._onResizeHandler = this._onResize.bind(this);

        app.onFrame.add(this._onFrameHandler);
        app.inputManager.onKeyDown.add(this._onKeyDownHandler);
        app.onResize.add(this._onResizeHandler);
    }

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
        const backend = this._app.backend;
        const layers = Object.values(this.layers) as Array<DebugLayer>;
        let anyVisible = false;

        for (const layer of layers) {
            if (layer.visible) {
                anyVisible = true;
                break;
            }
        }

        if (!anyVisible) return;

        // Save & swap to screen-space view for debug rendering.
        const savedView = backend.view;

        backend.setView(this._view);

        try {
            for (const layer of layers) {
                if (layer.visible) {
                    layer.update(delta);
                    layer.render(backend);
                }
            }
        } finally {
            backend.setView(savedView);
        }
    }

    private _onKeyDown(channel: number): void {
        if (channel === Keyboard.F1) {
            this.layers.performance.visible = !this.layers.performance.visible;
        }
    }
}
