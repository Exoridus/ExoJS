import { Vector } from 'math/Vector';
import { Rectangle } from 'math/Rectangle';
import type { IShape } from 'math/IShape';
import { Interval } from 'math/Interval';
import { ICollidable, ICollisionResponse, CollisionType } from 'types/Collision';
import {
    intersectionLineCircle,
    intersectionLineEllipse,
    intersectionLineLine,
    intersectionLinePoly,
    intersectionLineRect,
    intersectionPointLine
} from 'utils/collision-detection';
import type { SceneNode } from 'core/SceneNode';
import type { Polygon } from 'math/Polygon';
import type { Circle } from 'math/Circle';
import type { Ellipse } from 'math/Ellipse';

let temp: Line | null = null;

export class Line implements IShape {

    public readonly collisionType: CollisionType = CollisionType.line;

    private readonly _fromPosition: Vector;
    private readonly _toPosition: Vector;

    public constructor(x1 = 0, y1 = 0, x2 = 0, y2 = 0) {
        this._fromPosition = new Vector(x1, y1);
        this._toPosition = new Vector(x2, y2);
    }

    public get fromPosition(): Vector {
        return this._fromPosition;
    }

    public set fromPosition(positionFrom: Vector) {
        this._fromPosition.copy(positionFrom);
    }

    public get fromX(): number {
        return this._fromPosition.x;
    }

    public set fromX(fromX: number) {
        this._fromPosition.x = fromX;
    }

    public get fromY(): number {
        return this._fromPosition.y;
    }

    public set fromY(fromY: number) {
        this._fromPosition.y = fromY;
    }

    public get toPosition(): Vector {
        return this._toPosition;
    }

    public set toPosition(positionTo: Vector) {
        this._toPosition.copy(positionTo);
    }

    public get toX(): number {
        return this._toPosition.x;
    }

    public set toX(toX: number) {
        this._toPosition.x = toX;
    }

    public get toY(): number {
        return this._toPosition.y;
    }

    public set toY(toY: number) {
        this._toPosition.y = toY;
    }

    public set(x1: number, y1: number, x2: number, y2: number): this {
        this._fromPosition.set(x1, y1);
        this._toPosition.set(x2, y2);

        return this;
    }

    public copy(line: Line): this {
        this._fromPosition.copy(line.fromPosition);
        this.toPosition.copy(line.toPosition);

        return this;
    }

    public clone(): this {
        return new (this.constructor as any)(this.fromX, this.fromY, this.toX, this.toY);
    }

    public getBounds(): Rectangle {
        const { fromX, fromY, toX, toY } = this;
        const minX = Math.min(fromX, toX);
        const minY = Math.min(fromY, toY);

        return new Rectangle(
            minX,
            minY,
            Math.max(fromX, toX) - minX,
            Math.max(fromY, toY) - minY
        );
    }

    public getNormals(): Array<Vector> {
        return []
    }

    public project(axis: Vector, result: Interval = new Interval()): Interval {
        return result;
    }

    public intersectsWith(target: ICollidable): boolean {
        switch (target.collisionType) {
            case CollisionType.sceneNode: return intersectionLineRect(this, (target as SceneNode).getBounds());
            case CollisionType.rectangle: return intersectionLineRect(this, target as Rectangle);
            case CollisionType.polygon: return intersectionLinePoly(this, target as Polygon);
            case CollisionType.circle: return intersectionLineCircle(this, target as Circle);
            case CollisionType.ellipse: return intersectionLineEllipse(this, target as Ellipse);
            case CollisionType.line: return intersectionLineLine(this, target as Line);
            case CollisionType.point: return intersectionPointLine(target as Vector, this);
            default: return false;
        }
    }

    public collidesWith(target: ICollidable): ICollisionResponse | null {
        return null;
    }

    public contains(x: number, y: number, threshold = 0.1): boolean {
        return intersectionPointLine(Vector.temp.set(x, y), this, threshold);
    }

    public equals({ fromX, fromY, toX, toY }: Partial<Line> = {}): boolean {
        return (fromX === undefined || this.fromX === fromX)
            && (fromY === undefined || this.fromY === fromY)
            && (toX === undefined || this.toX === toX)
            && (toY === undefined || this.toY === toY);
    }

    public destroy(): void {
        this._fromPosition.destroy();
        this._toPosition.destroy();
    }

    public static get temp(): Line {
        if (temp === null) {
            temp = new Line();
        }

        return temp;
    }
}
