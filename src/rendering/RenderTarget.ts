import { Size } from 'math/Size';
import { View } from './View';
import { Rectangle } from 'math/Rectangle';
import { Vector } from 'math/Vector';

export class RenderTarget {

    private readonly _root: boolean;
    private readonly _destroyListeners: Set<() => void> = new Set<() => void>();
    private _version = 0;
    protected _size: Size;
    protected _viewport: Rectangle = new Rectangle();
    protected _defaultView: View;
    protected _view: View;

    public constructor(width: number, height: number, root = false) {
        this._size = new Size(width, height);
        this._root = root;
        this._defaultView = new View(width / 2, height / 2, width, height);
        this._view = this._defaultView;
    }

    public get view(): View {
        return this._view;
    }

    public set view(view: View) {
        this.setView(view);
    }

    public get size(): Size {
        return this._size;
    }

    public set size(size: Size) {
        this.resize(size.width, size.height);
    }

    public get width(): number {
        return this._size.width;
    }

    public set width(width: number) {
        this.resize(width, this.height);
    }

    public get height(): number {
        return this._size.height;
    }

    public set height(height: number) {
        this.resize(this.width, height);
    }

    public get root(): boolean {
        return this._root;
    }

    public get version(): number {
        return this._version;
    }

    public addDestroyListener(listener: () => void): this {
        this._destroyListeners.add(listener);

        return this;
    }

    public removeDestroyListener(listener: () => void): this {
        this._destroyListeners.delete(listener);

        return this;
    }

    public setView(view: View | null): this {
        const nextView = view || this._defaultView;

        if (this._view !== nextView) {
            this._view = nextView;
            this._touch();
        }

        return this;
    }

    public resize(width: number, height: number): this {
        if (!this._size.equals({ width, height })) {
            this._size.set(width, height);
            this._touch();
        }

        return this;
    }

    public getViewport(view: View = this._view): Rectangle {
        const { x, y, width, height } = view.viewport;

        return this._viewport.set(
            Math.round(x * this.width),
            Math.round(y * this.height),
            Math.round(width * this.width),
            Math.round(height * this.height)
        );
    }

    public updateViewport(): this {
        this._touch();

        return this;
    }

    public mapPixelToCoords(point: Vector, view: View = this._view): Vector {
        const viewport = this.getViewport(view);
        const normalized = new Vector(
            -1 + (2 * (point.x - viewport.left) / viewport.width),
            1 - (2 * (point.y - viewport.top) / viewport.height)
        );

        return normalized.transform(view.getInverseTransform());
    }

    public mapCoordsToPixel(point: Vector, view: View = this._view): Vector {
        const viewport = this.getViewport(view);
        const normalized = point.clone().transform(view.getTransform());

        return normalized.set(
            ((( normalized.x + 1) / 2 * viewport.width) + viewport.left) | 0,
            (((-normalized.y + 1) / 2 * viewport.height) + viewport.top) | 0
        );
    }

    public destroy(): void {
        for (const listener of Array.from(this._destroyListeners)) {
            listener();
        }

        this._destroyListeners.clear();

        if (this._view !== this._defaultView) {
            this._view.destroy();
        }

        this._defaultView.destroy();
        this._viewport.destroy();
        this._size.destroy();
    }

    protected _touch(): void {
        this._version++;
    }
}
