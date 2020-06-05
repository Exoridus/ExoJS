import { Interval } from 'math/Interval';
import { Vector } from 'math/Vector';
import { Rectangle } from 'math/Rectangle';
import type { Shape } from 'math/Shape';
import { Collidable, Collision, CollisionType } from "types/Collision";
import {
    getCollisionPolygonCircle,
    getCollisionSAT,
} from "utils/collision-detection";
import {
    intersectionCirclePoly,
    intersectionEllipsePoly,
    intersectionLinePoly,
    intersectionPointPoly,
    intersectionPolyPoly,
    intersectionRectPoly,
} from "utils/collision-detection";
import type { SceneNode } from "core/SceneNode";
import type { Circle } from 'math/Circle';
import type { Ellipse } from "math/Ellipse";
import type { Line } from "math/Line";

let temp: Polygon | null = null;

export class Polygon implements Shape {

    public readonly collisionType: CollisionType = CollisionType.Polygon;

    private readonly _position: Vector;
    private readonly _points: Array<Vector> = [];
    private readonly _edges: Array<Vector> = [];
    private readonly _normals: Array<Vector> = [];

    public constructor(points: Array<Vector> = [], x = 0, y = 0) {
        this._position = new Vector(x, y);
        this.setPoints(points);
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

    public get points(): Array<Vector> {
        return this._points;
    }

    public set points(points: Array<Vector>) {
        this.setPoints(points);
    }

    public get edges(): Array<Vector> {
        return this._edges;
    }

    public get normals(): Array<Vector> {
        return this._normals;
    }

    public setPosition(x: number, y: number): this {
        this._position.set(x, y);

        return this;
    }

    public setPoints(newPoints: Array<Vector>): this {
        const len = this._points.length;
        const newLen = newPoints.length;
        const diff = len - newLen;

        for (let i = 0; i < len; i++) {
            this._points[i].copy(newPoints[i]);
        }

        if (diff > 0) {
            this._points.splice(newLen).forEach(point => point.destroy());
            this._edges.splice(newLen).forEach(point => point.destroy());
            this._normals.splice(newLen).forEach(point => point.destroy());
        } else if (diff < 0) {
            for (let i = len; i < newLen; i++) {
                this._points.push(newPoints[i].clone());
                this._edges.push(newPoints[i].clone());
                this._normals.push(newPoints[i].clone());
            }
        }

        for (let i = 0; i < len; i += 1) {
            const curr = this._points[i];
            const next = this._points[(i + 1) % len];

            this._edges[i].set(next.x - curr.x, next.y - curr.y);
            this._normals[i].copy(this._edges[i]).rperp().normalize();
        }

        return this;
    }

    public set(x: number, y: number, points: Array<Vector>): this {
        this._position.set(x, y);
        this.setPoints(points);

        return this;
    }

    public copy(polygon: Polygon): this {
        this._position.copy(polygon.position);
        this.setPoints(polygon.points);

        return this;
    }

    public clone(): this {
        return new (this.constructor as any)(this.points, this.x, this.y);
    }

    public equals({ x, y, points }: Partial<Polygon> = {}): boolean {
        return (x === undefined || this.x === x)
            && (y === undefined || this.y === y)
            && (points === undefined || ((this.points.length === points.length)
                && (this.points.every((point, index) => point.equals(points[index])))
            ));
    }

    public getBounds(): Rectangle {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const point of this._points) {
            minX = Math.min(point.x, minX);
            minY = Math.min(point.y, minY);
            maxX = Math.max(point.x, maxX);
            maxY = Math.max(point.y, maxY);
        }

        return new Rectangle(
            this.x + minX,
            this.y + minY,
            maxX - minX,
            maxY - minY
        );
    }

    public getNormals(): Array<Vector> {
        return this._normals;
    }

    public project(axis: Vector, result: Interval = new Interval()): Interval {
        const normal = axis.clone().normalize();
        const projections = this._points.map(point => normal.dot(point.x, point.y));

        return result.set(
            Math.min(...projections),
            Math.max(...projections),
        );
    }

    public contains(x: number, y: number): boolean {
        return intersectionPointPoly(Vector.Temp.set(x, y), this);
    }

    public intersectsWith(target: Collidable): boolean {
        switch (target.collisionType) {
            case CollisionType.SceneNode: return intersectionRectPoly((target as SceneNode).getBounds(), this);
            case CollisionType.Rectangle: return intersectionRectPoly(target as Rectangle, this);
            case CollisionType.Polygon: return intersectionPolyPoly(this, target as Polygon);
            case CollisionType.Circle: return intersectionCirclePoly(target as Circle, this);
            case CollisionType.Ellipse: return intersectionEllipsePoly(target as Ellipse, this);
            case CollisionType.Line: return intersectionLinePoly(target as Line, this);
            case CollisionType.Point: return intersectionPointPoly(target as Vector, this);
            default: return false;
        }
    }

    public collidesWith(target: Collidable): Collision | null {
        switch (target.collisionType) {
            case CollisionType.SceneNode: return getCollisionSAT(this, target as SceneNode);
            case CollisionType.Rectangle: return getCollisionSAT(this, target as Rectangle);
            case CollisionType.Polygon: return getCollisionSAT(this, target as Polygon);
            case CollisionType.Circle: return getCollisionPolygonCircle(this, target as Circle);
            // case CollisionType.Ellipse: return intersectionEllipsePoly(target as Ellipse, this);
            // case CollisionType.Line: return intersectionLinePoly(target as Line, this);
            // case CollisionType.Point: return intersectionPointPoly(target as Vector, this);
            default: return null;
        }
    }

    public destroy(): void {

        for (const point of this._points) {
            point.destroy();
        }

        this._position.destroy();
        this._points.length = 0;
    }

    public static get Temp(): Polygon {
        if (temp === null) {
            temp = new Polygon();
        }

        return temp;
    }
}
