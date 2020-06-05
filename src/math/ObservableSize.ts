import { Size } from './Size';

export class ObservableSize extends Size {

    private readonly _callback: () => void;

    public constructor(callback: () => void, width = 0, height = 0) {
        super(width, height);

        this._callback = callback;
    }

    public get width(): number {
        return this._width;
    }

    public set width(width: number) {
        if (this._width !== width) {
            this._width = width;
            this._callback();
        }
    }

    public get height(): number {
        return this._height;
    }

    public set height(height: number) {
        if (this._height !== height) {
            this._height = height;
            this._callback();
        }
    }

    public set(width: number = this._width, height: number = this._height): this {
        if (this._width !== width || this._height !== height) {
            this._width = width;
            this._height = height;
            this._callback();
        }

        return this;
    }

    public add(x: number, y: number = x): this {
        return this.set(this._width + x, this._height + y);
    }

    public subtract(x: number, y: number = x): this {
        return this.set(this._width - x, this._height - y);
    }

    public scale(x: number, y: number = x): this {
        return this.set(this._width * x, this._height * y);
    }

    public divide(x: number, y: number = x): this {
        return this.set(this._width / x, this._height / y);
    }

    public copy(size: Size): this {
        return this.set(size.width, size.height);
    }

    public clone(): this {
        return new (this.constructor as any)(this._callback, this._width, this._height);
    }
}
