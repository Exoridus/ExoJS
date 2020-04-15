import { getDistance } from 'utils/math';
import { Matrix } from './Matrix';

export class Vector {

    public static readonly Zero = new Vector(0, 0);
    public static readonly One = new Vector(1, 1);
    public static readonly Temp = new Vector();

    protected _x: number;
    protected _y: number;

    constructor(x = 0, y = 0) {
        this._x = x;
        this._y = y;
    }

    public get x(): number {
        return this._x;
    }

    public set x(x: number) {
        this._x = x;
    }

    public get y(): number {
        return this._y;
    }

    public set y(y: number) {
        this._y = y;
    }

    public get direction(): number {
        return Math.atan2(this._x, this._y);
    }

    public set direction(angle: number) {
        const length = this.length;

        this._x = Math.cos(angle) * length;
        this._y = Math.sin(angle) * length;
    }

    public get angle(): number {
        return this.direction;
    }

    public set angle(angle: number) {
        this.direction = angle;
    }

    public get length(): number {
        return Math.sqrt((this._x * this._x) + (this._y * this._y));
    }

    public set length(magnitude: number) {
        const direction = this.direction;

        this._x = Math.cos(direction) * magnitude;
        this._y = Math.sin(direction) * magnitude;
    }

    public get lengthSq(): number {
        return (this._x * this._x) + (this._y * this._y);
    }

    public set lengthSq(lengthSquared: number) {
        this.length = Math.sqrt(lengthSquared);
    }

    public get magnitude(): number {
        return this.length;
    }

    public set magnitude(magnitude: number) {
        this.length = magnitude;
    }

    public set(x: number, y: number = x): this {
        this._x = x;
        this._y = y;

        return this;
    }

    public copy(vector: Vector): this {
        this._x = vector.x;
        this._y = vector.y;

        return this;
    }

    public clone(): Vector {
        return new Vector(this._x, this._y);
    }

    public equals({ x, y }: Partial<Vector> = {}): boolean {
        return (x === undefined || this._x === x)
            && (y === undefined || this._y === y);
    }

    public add(x: number, y: number = x): this {
        this._x += x;
        this._y += y;

        return this;
    }

    public subtract(x: number, y: number = x): this {
        this._x -= x;
        this._y -= y;

        return this;
    }

    public multiply(x: number, y: number = x): this {
        this._x *= x;
        this._y *= y;

        return this;
    }

    public divide(x: number, y: number = x): this {
        if (x !== 0 && y !== 0) {
            this._x /= x;
            this._y /= y;
        }

        return this;
    }

    public normalize(): this {
        return this.divide(this.length);
    }

    public invert(): this {
        return this.multiply(-1, -1);
    }

    public transform(matrix: Matrix, result: Vector = this): Vector {
        return result.set(
            (this._x * matrix.a) + (this._y * matrix.b) + matrix.x,
            (this._x * matrix.c) + (this._y * matrix.d) + matrix.y
        );
    }

    public transformInverse(matrix: Matrix, result: Vector = this): Vector {
        const id = 1 / ((matrix.a * matrix.d) + (matrix.c * -matrix.b));

        return result.set(
            (this._x * matrix.d * id) + (this._y * -matrix.c * id) + (((matrix.y * matrix.c) - (matrix.x * matrix.d)) * id),
            (this._y * matrix.a * id) + (this._x * -matrix.b * id) + (((-matrix.y * matrix.a) + (matrix.x * matrix.b)) * id)
        );
    }

    public perp(result: Vector = this): Vector {
        return result.set(-this._y, this._x);
    }

    public rperp(result = this): Vector {
        return result.set(this._y, -this._x);
    }

    public min(): number {
        return Math.min(this._x, this._y);
    }

    public max(): number {
        return Math.max(this._x, this._y);
    }

    public dot(x: number, y: number): number {
        return (this._x * x) + (this._y * y);
    }

    public cross(vector: Vector): number {
        return (this._x * vector.y) - (this._y * vector.x);
    }

    public distanceTo(vector: Vector): number {
        return getDistance(this._x, this._y, vector.x, vector.y);
    }

    public destroy() {
        // todo - check if destroy is needed
    }

    public static add(vecA: Vector, vecB: Vector, result: Vector = new Vector()): Vector {
        return result.copy(vecA).add(vecB.x, vecB.y);
    }

    public static subtract(vecA: Vector, vecB: Vector, result: Vector = new Vector()): Vector {
        return result.copy(vecA).subtract(vecB.x, vecB.y);
    }

    public static multiply(vecA: Vector, vecB: Vector, result: Vector = new Vector()): Vector {
        return result.copy(vecA).multiply(vecB.x, vecB.y);
    }

    public static divide(vecA: Vector, vecB: Vector, result: Vector = new Vector()): Vector {
        return result.copy(vecA).divide(vecB.x, vecB.y);
    }
}
