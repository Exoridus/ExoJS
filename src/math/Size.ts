export class Size {

    public static readonly Zero = new Size(0, 0);
    public static readonly Temp = new Size();

    protected _width: number;
    protected _height: number;

    constructor(width = 0, height = 0) {
        this._width = width;
        this._height = height;
    }

    public get width(): number {
        return this._width;
    }

    public set width(width: number) {
        this._width = width;
    }

    public get height(): number {
        return this._height;
    }

    public set height(height: number) {
        this._height = height;
    }

    public set(width: number, height: number = width): this {
        this._width = width;
        this._height = height;

        return this;
    }

    public add(width: number, height: number = width): this {
        this._width += width;
        this._height += height;

        return this;
    }

    public subtract(width: number, height: number = width): this {
        this._width -= width;
        this._height -= height;

        return this;
    }

    public scale(width: number, height: number = width): this {
        this._width *= width;
        this._height *= height;

        return this;
    }

    public divide(width: number, height: number = width): this {
        this._width /= width;
        this._height /= height;

        return this;
    }

    public copy(size: { width: number; height: number }): this {
        this._width = size.width;
        this._height = size.height;

        return this;
    }

    public clone(): Size {
        return new Size(this._width, this._height);
    }

    public equals({ width, height }: Partial<Size> = {}): boolean {
        return (width === undefined || this.width === width)
            && (height === undefined || this.height === height);
    }

    public destroy(): void {
        // todo - check if destroy is needed
    }
}
