import { Interval } from './Interval';
import { Vector } from './Vector';
import { Rectangle } from './Rectangle';
import { Circle } from './Circle';
import { IShape } from '../interfaces/IShape';
import {
    Collidable, Collision, CollisionType,
    getCollisionPolygonCircle,
    getCollisionSAT,
    isPolygonIntersectingWithTarget
} from "../const/collision";

export class Polygon implements IShape {

    public static readonly Temp = new Polygon();

    public readonly collisionType: CollisionType = CollisionType.Polygon;

    private readonly _position: Vector;
    private readonly _points: Array<Vector>;

    constructor(points: Array<Vector> = [], x = 0, y = 0) {
        this._position = new Vector(x, y);
        this._points = points.map(point => point.clone());
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

    public setPosition(x: number, y: number): this {
        this._position.set(x, y);

        return this;
    }

    public setPoints(newPoints: Array<Vector>): this {
        const points = this._points,
            len = points.length,
            diff = len - newPoints.length;

        for (let i = 0; i < len; i++) {
            points[i].copy(newPoints[i]);
        }

        if (diff > 0) {
            for (const point of points.splice(newPoints.length, diff)) {
                point.destroy();
            }
        } else if (diff < 0) {
            for (let i = len; i < newPoints.length; i++) {
                points.push(newPoints[i].clone());
            }
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

    public clone(): Polygon {
        return new Polygon(this.points, this.x, this.y);
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
        return this._points.map((point, i, points) => Vector.subtract(points[(i + 1) % points.length], point).rperp().normalize());
    }

    public project(axis: Vector, result: Interval = new Interval()): Interval {
        const normal = axis.clone().normalize();
        const projections = this._points.map(point => normal.dot(point.x, point.y));

        return result.set(
            Math.min(...projections),
            Math.max(...projections),
        );
    }

    // todo - gehört hier noch ein transform matrix dazu?
    public contains(x: number, y: number): boolean {
        const length = this._points.length;

        let inside = false;

        for (let i = 0, j = length - 1; i < length; j = i++) {
            const { x: aX, y: aY } = this._points[i];
            const { x: bX, y: bY } = this._points[j];

            if (((aY <= y && y < bY) || (bY <= y && y < aY)) && x < ((bX - aX) / (bY - aY) * (y - aY) + aX)) {
                inside = !inside;
            }
        }

        return inside;
    }

    public intersects(target: Collidable): boolean {
        return isPolygonIntersectingWithTarget(this, target);
    }

    public getCollision(target: Collidable): Collision | null {
        if (target instanceof Polygon || target instanceof Rectangle) {
            return getCollisionSAT(this, target);
        }

        if (target instanceof Circle) {
            return getCollisionPolygonCircle(this, target);
        }

        return null;
    }

    public destroy() {

        for (const point of this._points) {
            point.destroy();
        }

        this._position.destroy();
        this._points.length = 0;
    }
}
