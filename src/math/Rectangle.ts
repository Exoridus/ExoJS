import { inRange } from '../utils/math';
import { Vector } from './Vector';
import { Size } from './Size';
import { Circle } from './Circle';
import { Polygon } from './Polygon';
import { Interval } from './Interval';
import { Matrix } from './Matrix';
import { IShape } from '../interfaces/IShape';
import {
    Collidable,
    Collision,
    CollisionType,
    getCollisionCircleRectangle,
    getCollisionRectangleRectangle,
    getCollisionSAT,
    isRectangleIntersectingWithTarget
} from "../const/collision";

export class Rectangle implements IShape {

    public static readonly Temp = new Rectangle();

    public readonly collisionType: CollisionType = CollisionType.Rectangle;

    private readonly _position: Vector;
    private readonly _size: Size;

    constructor(x = 0, y = x, width = 0, height = width) {
        this._position = new Vector(x, y);
        this._size = new Size(width, height);
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

    public get size(): Size {
        return this._size;
    }

    public set size(size: Size) {
        this._size.copy(size);
    }

    public get width(): number {
        return this._size.width;
    }

    public set width(width: number) {
        this._size.width = width;
    }

    public get height(): number {
        return this._size.height;
    }

    public set height(height: number) {
        this._size.height = height;
    }

    public get left(): number {
        return this.x;
    }

    public get top(): number {
        return this.y;
    }

    public get right(): number {
        return this.x + this.width;
    }

    public get bottom(): number {
        return this.y + this.height;
    }

    public setPosition(x: number, y: number): this {
        this._position.set(x, y);

        return this;
    }

    public setSize(width: number, height: number): this {
        this._size.set(width, height);

        return this;
    }

    public set(x: number, y: number, width: number, height: number): this {
        this._position.set(x, y);
        this._size.set(width, height);

        return this;
    }

    public copy(rectangle: Rectangle): this {
        this._position.copy(rectangle.position);
        this._size.copy(rectangle.size);

        return this;
    }

    public clone(): Rectangle {
        return new Rectangle(this.x, this.y, this.width, this.height);
    }

    public equals({ x, y, width, height }: Partial<Rectangle> = {}): boolean {
        return (x === undefined || this.x === x)
            && (y === undefined || this.y === y)
            && (width === undefined || this.width === width)
            && (height === undefined || this.height === height);
    }

    public getBounds(): Rectangle {
        return this.clone();
    }

    /**
     * todo - cache this
     */
    public getNormals(): Array<Vector> {
        return [
            new Vector(this.right - this.left, 0).rperp().normalize(),
            new Vector(0, this.bottom - this.top).rperp().normalize(),
            new Vector(this.left - this.right, 0).rperp().normalize(),
            new Vector(0, this.top - this.bottom).rperp().normalize(),
        ];
    }

    public project(axis: Vector, result: Interval = new Interval()): Interval {
        const projection1 = axis.dot(this.left, this.top);
        const projection2 = axis.dot(this.right, this.top);
        const projection3 = axis.dot(this.right, this.bottom);
        const projection4 = axis.dot(this.left, this.bottom);

        return result.set(
            Math.min(projection1, projection2,projection3, projection4),
            Math.max(projection1, projection2,projection3, projection4)
        );
    }

    public transform(matrix: Matrix, result: Rectangle = this): Rectangle {
        const point = Vector.Temp.set(this.left, this.top).transform(matrix);

        let minX = point.x,
            maxX = point.x,
            minY = point.y,
            maxY = point.y;

        point.set(this.left, this.bottom).transform(matrix);

        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);

        point.set(this.right, this.top).transform(matrix);

        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);

        point.set(this.right, this.bottom).transform(matrix);

        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);

        return result.set(minX, minY, maxX - minX, maxY - minY);
    }

    public contains(x: number, y: number): boolean {
        return inRange(x, this.left, this.right)
            && inRange(y, this.top, this.bottom);
    }

    public containsRect(rect: Rectangle): boolean {
        return inRange(rect.left, this.left, this.right)
            && inRange(rect.right, this.left, this.right)
            && inRange(rect.top, this.top, this.bottom)
            && inRange(rect.bottom, this.top, this.bottom);
    }

    public intersects(target: Collidable): boolean {
        return isRectangleIntersectingWithTarget(this, target);
    }

    public getCollision(target: Collidable): Collision | null {
        if (target instanceof Rectangle) {
            return getCollisionRectangleRectangle(this, target);
        }

        if (target instanceof Circle) {
            return getCollisionCircleRectangle(target, this, true);
        }

        if (target instanceof Polygon) {
            return getCollisionSAT(this, target);
        }

        return null;
    }

    public destroy() {
        this._position.destroy();
        this._size.destroy();
    }
}
