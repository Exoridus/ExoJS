import { Vector } from './Vector';
import { Rectangle } from './Rectangle';
import { Polygon } from './Polygon';
import { Interval } from './Interval';
import { getDistance } from 'utils/math';
import { IShape } from 'interfaces/IShape';
import {
    Collidable, Collision, CollisionType,
    getCollisionCircleCircle,
    getCollisionCircleRectangle,
    getCollisionPolygonCircle,
    isCircleIntersectingWithTarget
} from "const/collision";

export class Circle implements IShape {

    public static readonly Temp = new Circle();

    public readonly collisionType: CollisionType = CollisionType.Circle;

    private readonly _position: Vector;
    private _radius: number;

    constructor(x = 0, y = 0, radius = 0) {
        this._position = new Vector(x, y);
        this._radius = radius;
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

    public get radius(): number {
        return this._radius;
    }

    public set radius(radius: number) {
        this._radius = radius;
    }

    public setPosition(x: number, y: number): this {
        this._position.set(x, y);

        return this;
    }

    public setRadius(radius: number): this {
        this._radius = radius;

        return this;
    }

    public set(x: number, y: number, radius: number): this {
        this._position.set(x, y);
        this._radius = radius;

        return this;
    }

    public copy(circle: Circle): this {
        this._position.copy(circle.position);
        this._radius = circle.radius;

        return this;
    }

    public clone(): Circle {
        return new Circle(this.x, this.y, this.radius);
    }

    public equals({ x, y, radius }: Partial<Circle> = {}): boolean {
        return (x === undefined || this.x === x)
            && (y === undefined || this.y === y)
            && (radius === undefined || this.radius === radius);
    }

    public getBounds(): Rectangle {
        return new Rectangle(
            this.x - this.radius,
            this.y - this.radius,
            this.radius * 2,
            this.radius * 2
        );
    }

    /**
     * todo - cache this
     */
    public getNormals(): Array<Vector> {
        const points = this.createCollisionPoints();

        return points.map((point, i, points) => Vector.subtract(points[(i + 1) % points.length], point).rperp().normalize());
    }

    public project(axis: Vector, result: Interval = new Interval()): Interval {
        return result.set(0, 0);
    }

    public contains(x: number, y: number): boolean {
        return getDistance(this.x, this.y, x, y) <= this._radius;
    }

    public intersects(target: Collidable): boolean {
        return isCircleIntersectingWithTarget(this, target);
    }

    public getCollision(target: Collidable): Collision | null {
        if (target instanceof Circle) {
            return getCollisionCircleCircle(this, target);
        }

        if (target instanceof Rectangle) {
            return getCollisionCircleRectangle(this, target);
        }

        if (target instanceof Polygon) {
            return getCollisionPolygonCircle(target, this, true);
        }

        return null;
    }

    public destroy(): void {
        this._position.destroy();
    }

    private createCollisionPoints(): Array<Vector> {

        return [];
    }
}
