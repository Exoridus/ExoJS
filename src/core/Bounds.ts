import { Rectangle } from 'math/Rectangle';
import type { Matrix } from 'math/Matrix';

export class Bounds {

    private _minX = Infinity;
    private _minY = Infinity;
    private _maxX = -Infinity;
    private _maxY = -Infinity;
    private _dirty = true;
    private _rect: Rectangle = new Rectangle();

    public get minX(): number {
        return this._minX;
    }

    public get minY(): number {
        return this._minY;
    }

    public get maxX(): number {
        return this._maxX;
    }

    public get maxY(): number {
        return this._maxY;
    }

    public addCoords(x: number, y: number): this {
        this._minX = Math.min(this._minX, x);
        this._minY = Math.min(this._minY, y);
        this._maxX = Math.max(this._maxX, x);
        this._maxY = Math.max(this._maxY, y);

        this._dirty = true;

        return this;
    }

    public addRect(rectangle: Rectangle, transform?: Matrix): this {
        if (transform) {
            rectangle = rectangle.transform(transform, Rectangle.temp);
        }

        return this
            .addCoords(rectangle.left, rectangle.top)
            .addCoords(rectangle.right, rectangle.bottom);
    }

    public getRect(): Rectangle {
        if (this._dirty) {
            this._rect.set(
                this._minX,
                this._minY,
                this._maxX - this._minX,
                this._maxY - this._minY
            );

            this._dirty = false;
        }

        return this._rect;
    }

    public reset(): this {
        this._minX = Infinity;
        this._minY = Infinity;
        this._maxX = -Infinity;
        this._maxY = -Infinity;

        this._dirty = true;

        return this;
    }

    public destroy(): void {
        this._rect.destroy();
    }
}
