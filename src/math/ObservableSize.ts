import { Size } from './Size';

export class ObservableSize extends Size {

    private readonly _callback: () => void;

    public constructor(callback: () => void, width = 0, height = 0) {
        super(width, height);

        this._callback = callback;
    }

    public override get width(): number {
        return this._width;
    }

    public override set width(width: number) {
        if (this._width !== width) {
            this._width = width;
            this._callback();
        }
    }

    public override get height(): number {
        return this._height;
    }

    public override set height(height: number) {
        if (this._height !== height) {
            this._height = height;
            this._callback();
        }
    }

    public override set(width: number = this._width, height: number = this._height): this {
        if (this._width !== width || this._height !== height) {
            this._width = width;
            this._height = height;
            this._callback();
        }

        return this;
    }

    public override add(x: number, y: number = x): this {
        return this.set(this._width + x, this._height + y);
    }

    public override subtract(x: number, y: number = x): this {
        return this.set(this._width - x, this._height - y);
    }

    public override scale(x: number, y: number = x): this {
        return this.set(this._width * x, this._height * y);
    }

    public override divide(x: number, y: number = x): this {
        return this.set(this._width / x, this._height / y);
    }

    public override copy(size: Size): this {
        return this.set(size.width, size.height);
    }

    public override clone(): this {
        return new ObservableSize(this._callback, this._width, this._height) as this;
    }
}
