import { ObservableVector } from 'math/ObservableVector';
import { Rectangle } from 'math/Rectangle';
import { Matrix } from 'math/Matrix';
import { degreesToRadians, trimRotation } from 'utils/math';
import { ObservableSize } from 'math/ObservableSize';
import { Bounds } from 'core/Bounds';
import { Flags } from 'math/Flags';

export enum ViewFlags {
    NONE = 0x00,
    TRANSLATION = 0x01,
    ROTATION = 0x02,
    SCALING = 0x04,
    ORIGIN = 0x08,
    TRANSFORM = 0x0F,
    TRANSFORM_INV = 0x10,
    BOUNDING_BOX = 0x20,
    TEXTURE_COORDS = 0x40,
    VERTEX_TINT = 0x80,
}

export class View {
    private readonly _center: ObservableVector;
    private readonly _size: ObservableSize;
    private readonly _viewport: Rectangle = new Rectangle(0, 0, 1, 1);
    private readonly _transform: Matrix = new Matrix();
    private readonly _inverseTransform: Matrix = new Matrix();
    private readonly _bounds: Bounds = new Bounds();
    private readonly _flags: Flags<ViewFlags> = new Flags<ViewFlags>();
    private _rotation = 0;
    private _sin = 0;
    private _cos = 1;
    private _updateId = 0;

    constructor(centerX: number, centerY: number, width: number, height: number) {
        this._center = new ObservableVector(this._setPositionDirty.bind(this), centerX, centerY);
        this._size = new ObservableSize(this._setScalingDirty.bind(this), width, height);
        this._flags.push(
            ViewFlags.TRANSFORM,
            ViewFlags.TRANSFORM_INV,
            ViewFlags.BOUNDING_BOX
        );
    }

    public get center(): ObservableVector {
        return this._center;
    }

    public set center(center: ObservableVector) {
        this._center.copy(center);
    }

    public get size(): ObservableSize {
        return this._size;
    }

    public set size(size: ObservableSize) {
        this._size.copy(size);
    }

    public get width(): number {
        return this._size.width;
    }

    public set width(width: number) {
        this._size.width = width;
    }

    public get height(): number {
        return this._size.height;
    }

    public set height(height: number) {
        this._size.height = height;
    }

    public get rotation(): number {
        return this._rotation;
    }

    public set rotation(rotation: number) {
        this.setRotation(rotation);
    }

    public get viewport(): Rectangle {
        return this._viewport;
    }

    public set viewport(viewport: Rectangle) {
        if (!this._viewport.equals(viewport)) {
            this._viewport.copy(viewport);
            this._setDirty();
        }
    }

    public get updateId(): number {
        return this._updateId;
    }

    public setCenter(x: number, y: number): this {
        this._center.set(x, y);

        return this;
    }

    public resize(width: number, height: number): this {
        this._size.set(width, height);

        return this;
    }

    public setRotation(degrees: number): this {
        const rotation = trimRotation(degrees);

        if (this._rotation !== rotation) {
            this._rotation = rotation;
            this._setRotationDirty();
        }

        return this;
    }

    public move(x: number, y: number): this {
        this.setCenter(this._center.x + x, this._center.y + y);

        return this;
    }

    public zoom(factor: number): this {
        this.resize(this._size.width * factor, this._size.height * factor);

        return this;
    }

    public rotate(degrees: number): this {
        this.setRotation(this._rotation + degrees);

        return this;
    }

    public reset(centerX: number, centerY: number, width: number, height: number): this {
        this._size.set(width, height);
        this._center.set(centerX, centerY);
        this._viewport.set(0, 0, 1, 1);
        this._rotation = 0;
        this._sin = 0;
        this._cos = 1;

        this._flags.push(ViewFlags.TRANSFORM);

        return this;
    }

    public getTransform(): Matrix {
        if (this._flags.has(ViewFlags.TRANSFORM)) {
            this.updateTransform();
            this._flags.remove(ViewFlags.TRANSFORM);
        }

        return this._transform;
    }

    public updateTransform(): this {
        const x = 2 / this.width,
            y = -2 / this.height;

        if (this._flags.has(ViewFlags.ROTATION)) {
            const radians = degreesToRadians(this._rotation);

            this._cos = Math.cos(radians);
            this._sin = Math.sin(radians);
        }

        if (this._flags.has(ViewFlags.ROTATION | ViewFlags.SCALING)) {
            this._transform.a = x * this._cos;
            this._transform.b = x * this._sin;

            this._transform.c = -y * this._sin;
            this._transform.d =  y * this._cos;
        }

        this._transform.x = (x * -this._transform.a) - (y * this._transform.b) + (-x * this._center.x);
        this._transform.y = (x * -this._transform.c) - (y * this._transform.d) + (-y * this._center.y);

        return this;
    }

    public getInverseTransform(): Matrix {
        if (this._flags.has(ViewFlags.TRANSFORM_INV)) {
            this.getTransform()
                .getInverse(this._inverseTransform);

            this._flags.remove(ViewFlags.TRANSFORM_INV);
        }

        return this._inverseTransform;
    }

    public getBounds(): Rectangle {
        if (this._flags.has(ViewFlags.BOUNDING_BOX)) {
            this.updateBounds();
            this._flags.remove(ViewFlags.BOUNDING_BOX);
        }

        return this._bounds.getRect();
    }

    public updateBounds(): this {
        const offsetX = this.width / 2;
        const offsetY = this.height / 2;

        this._bounds.reset()
            .addCoords(this._center.x - offsetX, this._center.y - offsetY)
            .addCoords(this._center.x + offsetX, this._center.y + offsetY);

        return this;
    }

    public destroy(): void {
        this._center.destroy();
        this._size.destroy();
        this._viewport.destroy();
        this._transform.destroy();
        this._inverseTransform.destroy();
        this._bounds.destroy();
        this._flags.destroy();
    }

    private _setDirty() {
        this._flags.push(ViewFlags.TRANSFORM_INV, ViewFlags.BOUNDING_BOX);
        this._updateId++;
    }

    private _setPositionDirty() {
        this._flags.push(ViewFlags.TRANSLATION);
        this._setDirty();
    }

    private _setRotationDirty() {
        this._flags.push(ViewFlags.ROTATION);
        this._setDirty();
    }

    private _setScalingDirty() {
        this._flags.push(ViewFlags.SCALING);
        this._setDirty();
    }
}
