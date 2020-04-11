import Rectangle from '../math/Rectangle';
import Matrix from '../math/Matrix';

export default class Bounds {

    private _minX: number = Infinity;
    private _minY: number = Infinity;
    private _maxX: number = -Infinity;
    private _maxY: number = -Infinity;
    private _dirty: boolean = true;
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
            rectangle = rectangle.transform(transform, Rectangle.Temp);
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

    public destroy() {
        this._rect.destroy();
    }
}
