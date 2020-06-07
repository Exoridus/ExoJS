import { degreesToRadians } from 'utils/math';
import type { ICloneable } from 'types/types';

let temp: Matrix | null = null;

/**
 * | a | b | x |
 * | c | d | y |
 * | e | f | z |
 */
export class Matrix implements ICloneable {

    public a: number;
    public b: number;
    public x: number;
    public c: number;
    public d: number;
    public y: number;
    public e: number;
    public f: number;
    public z: number;

    private _array: Float32Array | null = null;

    public constructor(
        a = 1, b = 0, x = 0,
        c = 0, d = 1, y = 0,
        e = 0, f = 0, z = 1
    ) {
        this.a = a;
        this.b = b;
        this.x = x;

        this.c = c;
        this.d = d;
        this.y = y;

        this.e = e;
        this.f = f;
        this.z = z;
    }

    public set(
        a = this.a, b = this.b, x = this.x,
        c = this.c, d = this.d, y = this.y,
        e = this.e, f = this.f, z = this.z
    ): this {
        this.a = a; this.b = b; this.x = x;
        this.c = c; this.d = d; this.y = y;
        this.e = e; this.f = f; this.z = z;

        return this;
    }

    public copy(matrix: Matrix): this {
        this.a = matrix.a; this.b = matrix.b; this.x = matrix.x;
        this.c = matrix.c; this.d = matrix.d; this.y = matrix.y;
        this.e = matrix.e; this.f = matrix.f; this.z = matrix.z;

        return this;
    }

    public clone(): this {
        return new (this.constructor as any)(
            this.a, this.b, this.x,
            this.c, this.d, this.y,
            this.e, this.f, this.z
        );
    }

    public equals({
        a, b, x,
        c, d, y,
        e, f, z
    }: Partial<Matrix> = {}): boolean {
        return (a === undefined || this.a === a)
            && (b === undefined || this.b === b)
            && (x === undefined || this.x === x)
            && (c === undefined || this.c === c)
            && (d === undefined || this.d === d)
            && (y === undefined || this.y === y)
            && (e === undefined || this.e === e)
            && (f === undefined || this.f === f)
            && (z === undefined || this.z === z);
    }

    public combine(matrix: Matrix): this {
        return this.set(
            (this.a * matrix.a) + (this.c * matrix.b) + (this.e * matrix.x),
            (this.b * matrix.a) + (this.d * matrix.b) + (this.f * matrix.x),
            (this.x * matrix.a) + (this.y * matrix.b) + (this.z * matrix.x),

            (this.a * matrix.c) + (this.c * matrix.d) + (this.e * matrix.y),
            (this.b * matrix.c) + (this.d * matrix.d) + (this.f * matrix.y),
            (this.x * matrix.c) + (this.y * matrix.d) + (this.z * matrix.y),

            (this.a * matrix.e) + (this.c * matrix.f) + (this.e * matrix.z),
            (this.b * matrix.e) + (this.d * matrix.f) + (this.f * matrix.z),
            (this.x * matrix.e) + (this.y * matrix.f) + (this.z * matrix.z)
        );
    }

    public getInverse(result: Matrix = this): Matrix {
        const determinant =
            (this.a * (this.z * this.d - this.y * this.f)) -
            (this.b * (this.z * this.c - this.y * this.e)) +
            (this.x * (this.f * this.c - this.d * this.e));

        if (determinant === 0) {
            return result.copy(Matrix.identity);
        }

        return result.set(
            ((this.z * this.d) - (this.y * this.f)) /  determinant,
            ((this.z * this.c) - (this.y * this.e)) / -determinant,
            ((this.f * this.c) - (this.d * this.e)) /  determinant,

            ((this.z * this.b) - (this.x * this.f)) / -determinant,
            ((this.z * this.a) - (this.x * this.e)) /  determinant,
            ((this.f * this.a) - (this.b * this.e)) / -determinant,

            ((this.y * this.b) - (this.x * this.d)) /  determinant,
            ((this.y * this.a) - (this.x * this.c)) / -determinant,
            ((this.d * this.a) - (this.b * this.c)) /  determinant
        );
    }

    public translate(x: number, y: number = x): Matrix {
        return this.combine(Matrix.temp.set(
            1, 0, x,
            0, 1, y,
            0, 0, 1
        ));
    }

    public rotate(angle: number, centerX = 0, centerY: number = centerX): Matrix {
        const radian = degreesToRadians(angle);
        const cos = Math.cos(radian);
        const sin = Math.sin(radian);

        return this.combine(Matrix.temp.set(
            cos, -sin, (centerX * (1 - cos)) + (centerY * sin),
            sin,  cos, (centerY * (1 - cos)) - (centerX * sin),
            0, 0, 1
        ));
    }

    public scale(scaleX: number, scaleY: number = scaleX, centerX = 0, centerY: number = centerX): Matrix {
        return this.combine(Matrix.temp.set(
            scaleX, 0, (centerX * (1 - scaleX)),
            0, scaleY, (centerY * (1 - scaleY)),
            0, 0, 1
        ));
    }

    public toArray(transpose = false): Float32Array {
        const array = this._array || (this._array = new Float32Array(9));

        if (transpose) {
            array[0] = this.a; array[1] = this.b; array[2] = this.x;
            array[3] = this.c; array[4] = this.d; array[5] = this.y;
            array[6] = this.e; array[7] = this.f; array[8] = this.z;
        } else {
            array[0] = this.a; array[1] = this.c; array[2] = this.e;
            array[3] = this.b; array[4] = this.d; array[5] = this.f;
            array[6] = this.x; array[7] = this.y; array[8] = this.z;
        }

        return array;
    }

    public destroy(): void {
        if (this._array) {
            this._array = null;
        }
    }

    public static readonly identity = new Matrix(1, 0, 0, 1, 0, 0, 0, 1);

    public static get temp(): Matrix {
        if (temp === null) {
            temp = new Matrix();
        }

        return temp;
    }
}