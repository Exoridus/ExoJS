import { Vector } from 'math/Vector';
import { Rectangle } from 'math/Rectangle';
import { Interval } from 'math/Interval';
import type { IShape } from 'math/IShape';
import { ICollidable, ICollisionResponse, CollisionType } from 'types/Collision';
import {
    getCollisionCircleCircle,
    getCollisionCircleRectangle,
    getCollisionPolygonCircle,
    intersectionCircleCircle,
    intersectionCircleEllipse,
    intersectionCirclePoly,
    intersectionLineCircle,
    intersectionPointCircle,
    intersectionRectCircle
} from 'utils/collision-detection';
import type { SceneNode } from 'core/SceneNode';
import type { Line } from 'math/Line';
import type { Ellipse } from 'math/Ellipse';
import type { Polygon } from 'math/Polygon';

let temp: Circle | null = null;

export class Circle implements IShape {

    public static collisionSegments = 32;

    public readonly collisionType: CollisionType = CollisionType.circle;

    private readonly _position: Vector;
    private _collisionVertices: Array<Vector> | null = null;
    private _radius: number;

    public constructor(x = 0, y = 0, radius = 0) {
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

    public clone(): this {
        return new (this.constructor as any)(this.x, this.y, this.radius);
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
        const points = this.getCollisionVertices();

        return points.map((point, i, arr) => arr[(i + 1) % arr.length].clone().subtract(point.x, point.y).rperp().normalize());
    }

    public project(axis: Vector, result: Interval = new Interval()): Interval {
        return result.set(0, 0);
    }

    public contains(x: number, y: number): boolean {
        return intersectionPointCircle(Vector.temp.set(x, y), this);
    }

    public intersectsWith(target: ICollidable): boolean {
        switch (target.collisionType) {
            case CollisionType.sceneNode: return intersectionRectCircle((target as SceneNode).getBounds(), this);
            case CollisionType.rectangle: return intersectionRectCircle(target as Rectangle, this);
            case CollisionType.polygon: return intersectionCirclePoly(this, target as Polygon);
            case CollisionType.circle: return intersectionCircleCircle(this, target as Circle);
            case CollisionType.ellipse: return intersectionCircleEllipse(this, target as Ellipse);
            case CollisionType.line: return intersectionLineCircle(target as Line, this);
            case CollisionType.point: return intersectionPointCircle(target as Vector, this);
            default: return false;
        }
    }

    public collidesWith(target: ICollidable): ICollisionResponse | null {
        switch (target.collisionType) {
            case CollisionType.sceneNode: return getCollisionCircleRectangle(this, (target as SceneNode).getBounds());
            case CollisionType.rectangle: return getCollisionCircleRectangle(this, target as Rectangle);
            case CollisionType.polygon: return getCollisionPolygonCircle(target as Polygon, this, true);
            case CollisionType.circle: return getCollisionCircleCircle(this, target as Circle);
            // case CollisionType.Ellipse: return intersectionCircleEllipse(this, target as Ellipse);
            // case CollisionType.Line: return intersectionLineCircle(target as Line, this);
            // case CollisionType.Point: return intersectionPointCircle(target as Vector, this);
            default: return null;
        }
    }

    public destroy(): void {
        this._position.destroy();
    }

    private getCollisionVertices(): Array<Vector> {
        if (this._collisionVertices === null) {
            this._collisionVertices = [];

            for (let i = 0; i < Circle.collisionSegments; i++) {
                this._collisionVertices.push(this.getCollisionVertex(i));
            }
        }


        return this._collisionVertices;
    }

    private getCollisionVertex(index: number): Vector {
        const angle = index * 2 * Math.PI / Circle.collisionSegments - Math.PI / 2;
        const x = Math.cos(angle) * this._radius;
        const y = Math.sin(angle) * this._radius;

        return new Vector(this._radius + x, this._radius + y);
    }

    public static get temp(): Circle {
        if (temp === null) {
            temp = new Circle();
        }

        return temp;
    }
}
