import { Container } from '@/rendering/Container';
import type { RenderNode } from '@/rendering/RenderNode';
import type { Application } from '@/core/Application';

const sampleCount = 60;

export class DebugOverlay {
    private readonly _app: Application;
    private _visible = false;
    private _element: HTMLDivElement | null = null;
    private _destroyed = false;

    private readonly _frameSamples: Array<number> = new Array(sampleCount).fill(0);
    private _sampleIndex = 0;
    private _lastFrameTime = 0;

    public constructor(app: Application) {
        this._app = app;
    }

    public get visible(): boolean {
        return this._visible;
    }

    public show(): this {
        if (this._destroyed) return this;

        if (this._element === null) {
            this._createElement();
        }

        document.body.appendChild(this._element!);
        this._visible = true;

        return this;
    }

    public hide(): this {
        if (this._element !== null && this._element.parentNode !== null) {
            this._element.parentNode.removeChild(this._element);
        }

        this._visible = false;

        return this;
    }

    public toggle(): this {
        return this._visible ? this.hide() : this.show();
    }

    public update(): void {
        if (!this._visible || this._element === null) return;

        const now = performance.now();

        if (this._lastFrameTime !== 0) {
            this._frameSamples[this._sampleIndex] = now - this._lastFrameTime;
            this._sampleIndex = (this._sampleIndex + 1) % sampleCount;
        }

        this._lastFrameTime = now;

        let totalMs = 0;
        let validSamples = 0;

        for (const sample of this._frameSamples) {
            if (sample > 0) {
                totalMs += sample;
                validSamples++;
            }
        }

        const avgFrameMs = validSamples > 0 ? totalMs / validSamples : 0;
        const fps = avgFrameMs > 0 ? 1000 / avgFrameMs : 0;

        const stats = this._app.backend.stats;
        const nodeCount = this._countNodes();
        const activePointers = this._countActivePointers();
        const hovered = this._getHoveredInfo();

        this._element.textContent = [
            `FPS:             ${fps.toFixed(1)}`,
            `Frame time:      ${stats.frameTimeMs.toFixed(1)} ms`,
            `Draw calls:      ${stats.drawCalls}`,
            `Culled nodes:    ${stats.culledNodes}`,
            `Node count:      ${nodeCount}`,
            `Active pointers: ${activePointers}`,
            `Hovered:         ${hovered}`,
        ].join('\n');

        const rect = this._app.canvas.getBoundingClientRect();
        this._element.style.top = `${rect.top + 4}px`;
        this._element.style.left = `${rect.left + 4}px`;
    }

    public destroy(): void {
        this.hide();
        this._element = null;
        this._destroyed = true;
    }

    private _createElement(): void {
        const root = document.createElement('div');

        root.style.cssText = [
            'position: fixed',
            'padding: 6px 10px',
            'background: rgba(0,0,0,0.65)',
            'color: #d8e6ff',
            'font: 11px/1.4 ui-monospace, Consolas, monospace',
            'pointer-events: none',
            'z-index: 10000',
            'border-radius: 3px',
            'white-space: pre',
        ].join(';');

        this._element = root;
    }

    private _countNodes(): number {
        const scene = this._app.sceneManager.scene;

        if (!scene) return 0;

        return this._countNodeRecursive(scene.root);
    }

    private _countNodeRecursive(node: RenderNode): number {
        let count = 1;

        if (node instanceof Container) {
            for (const child of node.children) {
                count += this._countNodeRecursive(child);
            }
        }

        return count;
    }

    private _countActivePointers(): number {
        return this._app.inputManager.pointersInCanvas ? 1 : 0;
    }

    private _getHoveredInfo(): string {
        const node = this._app.interaction.getHoveredNode();

        if (node === null) return 'none';

        return node.constructor.name;
    }
}
