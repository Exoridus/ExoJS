import { Vector } from 'math/Vector';
import { Rectangle } from 'math/Rectangle';
import type { Shape } from 'math/Shape';
import { Interval } from "math/Interval";
import { Collidable, Collision, CollisionType } from "types/Collision";
import {
    intersectionCircleEllipse,
    intersectionEllipseEllipse,
    intersectionEllipsePoly,
    intersectionLineEllipse,
    intersectionPointEllipse,
    intersectionRectEllipse
} from "utils/collision-detection";
import type { Polygon } from "math/Polygon";
import type { Line } from "math/Line";
import type { Circle } from "math/Circle";
import type { SceneNode } from "core/SceneNode";

export class Ellipse implements Shape {
    public readonly collisionType: CollisionType = CollisionType.Ellipse;

    private readonly _position: Vector;
    private readonly _radius: Vector;

    public constructor(x = 0, y = 0, halfWidth = 0, halfHeight = halfWidth) {
        this._position = new Vector(x, y);
        this._radius = new Vector(halfWidth, halfHeight);
    }

    public get position(): Vector {
        return this._position;
    }

    public set position(position: Vector) {
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

    public get radius(): Vector {
        return this._radius;
    }

    public set radius(size: Vector) {
        this._radius.copy(size);
    }

    public get rx(): number {
        return this._radius.x;
    }

    public set rx(radiusX: number) {
        this._radius.x = radiusX;
    }

    public get ry(): number {
        return this._radius.y;
    }

    public set ry(radiusY: number) {
        this._radius.y = radiusY;
    }

    public setPosition(x: number, y: number): this {
        this._position.set(x, y);

        return this;
    }

    public setRadius(radiusX: number, radiusY: number = radiusX): this {
        this._radius.set(radiusX, radiusY);

        return this;
    }

    public set(x: number, y: number, radiusX: number, radiusY: number): this {
        this._position.set(x, y);
        this._radius.set(radiusX, radiusY);

        return this;
    }

    public copy(ellipse: Ellipse): this {
        this._position.copy(ellipse.position);
        this._radius.copy(ellipse.radius);

        return this;
    }

    public clone(): this {
        return new (this.constructor as any)(this.x, this.y, this.rx, this.ry);
    }

    public getBounds(): Rectangle {
        return new Rectangle(this.x - this.rx, this.y - this.ry, this.rx, this.ry);
    }

    public getNormals(): Array<Vector> {
        return [];
    }

    public project(axis: Vector, result: Interval = new Interval()): Interval {
        return result;
    }

    public intersectsWith(target: Collidable): boolean {
        switch (target.collisionType) {
            case CollisionType.SceneNode: return intersectionRectEllipse((target as SceneNode).getBounds(), this);
            case CollisionType.Rectangle: return intersectionRectEllipse(target as Rectangle, this);
            case CollisionType.Polygon: return intersectionEllipsePoly(this, target as Polygon);
            case CollisionType.Circle: return intersectionCircleEllipse(target as Circle, this);
            case CollisionType.Ellipse: return intersectionEllipseEllipse(this, target as Ellipse);
            case CollisionType.Line: return intersectionLineEllipse(target as Line, this);
            case CollisionType.Point: return intersectionPointEllipse(target as Vector, this);
            default: return false;
        }
    }

    public collidesWith(target: Collidable): Collision | null {
        return null;
    }

    public contains(x: number, y: number): boolean {
        return intersectionPointEllipse(Vector.Temp.set(x, y), this)
    }

    public equals({ x, y, rx, ry }: Partial<Ellipse> = {}): boolean {
        return (x === undefined || this.x === x)
            && (y === undefined || this.y === y)
            && (rx === undefined || this.rx === x)
            && (ry === undefined || this.ry === y);
    }

    public destroy(): void {
        this._position.destroy();
        this._radius.destroy();
    }
}
