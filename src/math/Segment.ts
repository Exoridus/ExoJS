import { Vector } from 'math/Vector';
import type { ICloneable } from 'types/types';

let temp: Segment | null = null;

export class Segment implements ICloneable {

    private readonly _startPoint: Vector;
    private readonly _endPoint: Vector;

    public constructor(startX = 0, startY = 0, endX = 0, endY = 0) {
        this._startPoint = new Vector(startX, startY);
        this._endPoint = new Vector(endX, endY);
    }

    public get startPoint(): Vector {
        return this._startPoint;
    }

    public set startPoint(startPoint: Vector) {
        this._startPoint.copy(startPoint);
    }

    public get startX(): number {
        return this._startPoint.x;
    }

    public set startX(x: number) {
        this._startPoint.x = x;
    }

    public get startY(): number {
        return this._startPoint.y;
    }

    public set startY(y: number) {
        this._startPoint.y = y;
    }

    public get endPoint(): Vector {
        return this._endPoint;
    }

    public set endPoint(endPoint: Vector) {
        this._endPoint.copy(endPoint);
    }

    public get endX(): number {
        return this._endPoint.x;
    }

    public set endX(x: number) {
        this._endPoint.x = x;
    }

    public get endY(): number {
        return this._endPoint.y;
    }

    public set endY(y: number) {
        this._endPoint.y = y;
    }

    public set(startX: number, startY: number, endX: number, endY: number): this {
        this._startPoint.set(startX, startY);
        this._endPoint.set(endX, endY);

        return this;
    }

    public copy(segment: Segment): this {
        this._startPoint.copy(segment.startPoint);
        this._endPoint.copy(segment.endPoint);

        return this;
    }

    public clone(): this {
        return new (this.constructor as any)(this.startX, this.startY, this.endX, this.endY);
    }

    public equals({ startX, startY, endX, endY }: Partial<Segment> = {}): boolean {
        return (startX === undefined || this.startX === startX)
            && (startY === undefined || this.startY === startY)
            && (endX === undefined || this.endX === endX)
            && (endY === undefined || this.endY === endY);
    }

    public destroy(): void {
        this._startPoint.destroy();
        this._endPoint.destroy();
    }

    public static get temp(): Segment {
        if (temp === null) {
            temp = new Segment();
        }

        return temp;
    }
}