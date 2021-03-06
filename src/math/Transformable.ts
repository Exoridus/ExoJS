import { ObservableVector } from './ObservableVector';
import { Matrix } from './Matrix';
import { degreesToRadians, trimRotation } from 'utils/math';
import { Flags } from './Flags';

export enum TransformableFlags {
    NONE = 0,
    TRANSLATION = 1 << 0,
    ROTATION = 1 << 1,
    SCALING = 1 << 2,
    ORIGIN = 1 << 3,
    TRANSFORM = TransformableFlags.TRANSLATION | TransformableFlags.ROTATION | TransformableFlags.SCALING | TransformableFlags.ORIGIN,
    TRANSFORM_INV = 1 << 4,
}

export class Transformable {

    public readonly flags: Flags<TransformableFlags> = new Flags<TransformableFlags>(TransformableFlags.TRANSFORM);

    protected _transform: Matrix = new Matrix();
    protected _position: ObservableVector = new ObservableVector(this._setPositionDirty.bind(this), 0, 0);
    protected _scale: ObservableVector = new ObservableVector(this._setScalingDirty.bind(this), 1, 1);
    protected _origin: ObservableVector = new ObservableVector(this._setOriginDirty.bind(this), 0, 0);
    protected _rotation = 0;
    protected _sin = 0;
    protected _cos = 1;

    public get position(): ObservableVector {
        return this._position;
    }

    public set position(position: ObservableVector) {
        this._position.copy(position);
    }

    public get x(): number {
        return this._position.x;
    }

    public set x(x: number) {
        this._position.x = x;
    }

    public get y(): number {
        return this._position.y;
    }

    public set y(y: number) {
        this._position.y = y;
    }

    public get rotation(): number {
        return this._rotation;
    }

    public set rotation(rotation: number) {
        this.setRotation(rotation);
    }

    public get scale(): ObservableVector {
        return this._scale;
    }

    public set scale(scale: ObservableVector) {
        this._scale.copy(scale);
    }

    public get origin(): ObservableVector {
        return this._origin;
    }

    public set origin(origin: ObservableVector) {
        this._origin.copy(origin);
    }

    public setPosition(x: number, y: number = x): this {
        this._position.set(x, y);

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

    public setScale(x: number, y: number = x): this {
        this._scale.set(x, y);

        return this;
    }

    public setOrigin(x: number, y: number = x): this {
        this._origin.set(x, y);

        return this;
    }

    public move(x: number, y: number): this {
        return this.setPosition(this.x + x, this.y + y);
    }

    public rotate(degrees: number): this {
        return this.setRotation(this._rotation + degrees);
    }

    public getTransform(): Matrix {
        if (this.flags.has(TransformableFlags.TRANSFORM)) {
            this.updateTransform();
            this.flags.remove(TransformableFlags.TRANSFORM);
        }

        return this._transform;
    }

    public updateTransform(): this {
        if (this.flags.has(TransformableFlags.ROTATION)) {
            const radians = degreesToRadians(this._rotation);

            this._cos = Math.cos(radians);
            this._sin = Math.sin(radians);
        }

        if (this.flags.has(TransformableFlags.ROTATION | TransformableFlags.SCALING)) {
            const { x, y } = this._scale;

            this._transform.a = x * this._cos;
            this._transform.b = y * this._sin;

            this._transform.c = -x * this._sin;
            this._transform.d =  y * this._cos;
        }

        if (this._rotation) {
            const { x, y } = this._origin;

            this._transform.x = (x * -this._transform.a) - (y * this._transform.b) + this._position.x;
            this._transform.y = (x * -this._transform.c) - (y * this._transform.d) + this._position.y;
        } else {
            this._transform.x = (this._origin.x * -this._scale.x) + this._position.x;
            this._transform.y = (this._origin.y * -this._scale.y) + this._position.y;
        }

        return this;
    }

    public destroy(): void {
        this._transform.destroy();
        this._position.destroy();
        this._scale.destroy();
        this._origin.destroy();
        this.flags.destroy();
    }

    private _setPositionDirty(): void {
        this.flags.push(TransformableFlags.TRANSLATION);
    }

    private _setRotationDirty(): void {
        this.flags.push(TransformableFlags.ROTATION);
    }

    private _setScalingDirty(): void {
        this.flags.push(TransformableFlags.SCALING);
    }

    private _setOriginDirty(): void {
        this.flags.push(TransformableFlags.ORIGIN);
    }
}
