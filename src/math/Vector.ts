import { getDistance } from 'utils/math';
import { Matrix } from './Matrix';
import { Cloneable } from "const/types";

export abstract class AbstractVector {
    public abstract x: number;
    public abstract y: number;

    public get direction(): number {
        return Math.atan2(this.x, this.y);
    }

    public set direction(angle: number) {
        const length = this.length;

        this.x = Math.cos(angle) * length;
        this.y = Math.sin(angle) * length;
    }

    public get angle(): number {
        return this.direction;
    }

    public set angle(angle: number) {
        this.direction = angle;
    }

    public get length(): number {
        return Math.sqrt((this.x * this.x) + (this.y * this.y));
    }

    public set length(magnitude: number) {
        const direction = this.direction;

        this.x = Math.cos(direction) * magnitude;
        this.y = Math.sin(direction) * magnitude;
    }

    public get lengthSq(): number {
        return (this.x * this.x) + (this.y * this.y);
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
        this.x = x;
        this.y = y;

        return this;
    }

    public equals<T extends AbstractVector>({ x, y }: Partial<T> = {}): boolean {
        return (x === undefined || this.x === x)
            && (y === undefined || this.y === y);
    }

    public add(x: number, y: number = x): this {
        this.x += x;
        this.y += y;

        return this;
    }

    public subtract(x: number, y: number = x): this {
        this.x -= x;
        this.y -= y;

        return this;
    }

    public multiply(x: number, y: number = x): this {
        this.x *= x;
        this.y *= y;

        return this;
    }

    public divide(x: number, y: number = x): this {
        if (x !== 0 && y !== 0) {
            this.x /= x;
            this.y /= y;
        }

        return this;
    }

    public normalize(): this {
        return this.divide(this.length);
    }

    public invert(): this {
        return this.multiply(-1, -1);
    }

    public transform(matrix: Matrix): this {
        return this.set(
            (this.x * matrix.a) + (this.y * matrix.b) + matrix.x,
            (this.x * matrix.c) + (this.y * matrix.d) + matrix.y
        );
    }

    public transformInverse(matrix: Matrix): this {
        const id = 1 / ((matrix.a * matrix.d) + (matrix.c * -matrix.b));

        return this.set(
            (this.x * matrix.d * id) + (this.y * -matrix.c * id) + (((matrix.y * matrix.c) - (matrix.x * matrix.d)) * id),
            (this.y * matrix.a * id) + (this.x * -matrix.b * id) + (((-matrix.y * matrix.a) + (matrix.x * matrix.b)) * id)
        );
    }

    public perp(): this {
        return this.set(-this.y, this.x);
    }

    public rperp(): this {
        return this.set(this.y, -this.x);
    }

    public min(): number {
        return Math.min(this.x, this.y);
    }

    public max(): number {
        return Math.max(this.x, this.y);
    }

    public dot(x: number, y: number): number {
        return (this.x * x) + (this.y * y);
    }

    public cross<T extends AbstractVector>(vector: T): number {
        return (this.x * vector.y) - (this.y * vector.x);
    }

    public distanceTo<T extends AbstractVector>(vector: T): number {
        return getDistance(this.x, this.y, vector.x, vector.y);
    }

    public abstract destroy(): void;
}

export class Vector extends AbstractVector implements Cloneable<Vector> {

    public static readonly Zero = new Vector(0, 0);
    public static readonly One = new Vector(1, 1);
    public static readonly Temp = new Vector();

    public x: number;
    public y: number;

    constructor(x = 0, y = 0) {
        super();
        this.x = x;
        this.y = y;
    }

    public clone(): Vector {
        return new Vector(this.x, this.y);
    }

    public copy(vector: Vector): this {
        this.x = vector.x;
        this.y = vector.y;

        return this;
    }

    public destroy() {
        // todo - check if destroy is needed
    }
}
