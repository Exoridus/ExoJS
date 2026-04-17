import { inRange } from 'math/utils';
import { Size } from 'math/Size';
import { Interval } from 'math/Interval';
import { ObservableVector } from 'math/ObservableVector';
import type { Matrix } from 'math/Matrix';
import type { ShapeLike } from 'math/ShapeLike';
import type { Collidable, CollisionResponse} from 'math/Collision';
import { CollisionType } from 'math/Collision';
import {
    getCollisionCircleRectangle,
    getCollisionRectangleRectangle,
    getCollisionSat,
} from 'math/collision-detection';
import {
    intersectionLineRect,
    intersectionPointRect,
    intersectionRectCircle,
    intersectionRectEllipse,
    intersectionRectPoly,
    intersectionRectRect,
    intersectionSat
} from 'math/collision-detection';
import type { SceneNode } from 'core/SceneNode';
import type { Ellipse } from 'math/Ellipse';
import type { Line } from 'math/Line';
import type { Circle } from 'math/Circle';
import type { Polygon } from 'math/Polygon';
import type { Vector } from 'math/Vector';

let temp: Rectangle | null = null;
const noop = (): void => {};
const tempPoint = new ObservableVector(noop);

export class Rectangle implements ShapeLike {

    public readonly collisionType: CollisionType = CollisionType.Rectangle;

    private readonly _position: ObservableVector;
    private readonly _size: Size;
    private _normals: Array<ObservableVector> | null = null;
    private _normalsDirty = false;

    public constructor(x = 0, y = x, width = 0, height = width) {
        this._position = new ObservableVector(() => {
            this._normalsDirty = true;
        }, x, y);
        this._size = new Size(width, height);
    }

    public get position(): Vector {
        return this._position as unknown as Vector;
    }

    public set position(position: Vector) {
        this._position.copy(position);
    }

    public get x(): number {
        return this._position.x;
    }

    public set x(x: number) {
        this._position.x = x;
        this._normalsDirty = true;
    }

    public get y(): number {
        return this._position.y;
    }

    public set y(y: number) {
        this._position.y = y;
        this._normalsDirty = true;
    }

    public get size(): Size {
        return this._size;
    }

    public set size(size: Size) {
        this._size.copy(size);
        this._normalsDirty = true;
    }

    public get width(): number {
        return this._size.width;
    }

    public set width(width: number) {
        this._size.width = width;
        this._normalsDirty = true;
    }

    public get height(): number {
        return this._size.height;
    }

    public set height(height: number) {
        this._size.height = height;
        this._normalsDirty = true;
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
        this._normalsDirty = true;

        return this;
    }

    public setSize(width: number, height: number): this {
        this._size.set(width, height);
        this._normalsDirty = true;

        return this;
    }

    public set(x: number, y: number, width: number, height: number): this {
        this.setPosition(x, y);
        this.setSize(width, height);

        return this;
    }

    public copy(rectangle: Rectangle): this {
        this.position = rectangle.position;
        this.size = rectangle.size;

        return this;
    }

    public clone(): this {
        return new Rectangle(this.x, this.y, this.width, this.height) as this;
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

    public getNormals(): Array<Vector> {
        if (this._normalsDirty || this._normals === null) {
            this._updateNormals(this._normals || (this._normals = [
                new ObservableVector(noop),
                new ObservableVector(noop),
                new ObservableVector(noop),
                new ObservableVector(noop),
            ]));

            this._normalsDirty = false;
        }

        return this._normals as unknown as Array<Vector>;
    }

    public project(axis: Vector, result: Interval = new Interval()): Interval {
        const projection1 = axis.dot(this.left, this.top);
        const projection2 = axis.dot(this.right, this.top);
        const projection3 = axis.dot(this.right, this.bottom);
        const projection4 = axis.dot(this.left, this.bottom);

        return result.set(
            Math.min(projection1, projection2, projection3, projection4),
            Math.max(projection1, projection2, projection3, projection4)
        );
    }

    public transform(matrix: Matrix, result: Rectangle = this): Rectangle {
        const point = tempPoint.set(this.left, this.top).transform(matrix);

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
        return intersectionPointRect(tempPoint.set(x, y), this);
    }

    public containsRect(rect: Rectangle): boolean {
        return inRange(rect.left, this.left, this.right)
            && inRange(rect.right, this.left, this.right)
            && inRange(rect.top, this.top, this.bottom)
            && inRange(rect.bottom, this.top, this.bottom);
    }

    public intersectsWith(target: Collidable): boolean {
        switch (target.collisionType) {
            case CollisionType.SceneNode:
                return (target as SceneNode).isAlignedBox
                    ? intersectionRectRect(this, (target as SceneNode).getBounds())
                    : intersectionSat(this, target as SceneNode);
            case CollisionType.Rectangle: return intersectionRectRect(this, target as Rectangle);
            case CollisionType.Polygon: return intersectionRectPoly(this, target as Polygon);
            case CollisionType.Circle: return intersectionRectCircle(this, target as Circle);
            case CollisionType.Ellipse: return intersectionRectEllipse(this, target as Ellipse);
            case CollisionType.Line: return intersectionLineRect(target as Line, this);
            case CollisionType.Point: return intersectionPointRect(target as Vector, this);
            default: return false;
        }
    }

    public collidesWith(target: Collidable): CollisionResponse | null {
        switch (target.collisionType) {
            case CollisionType.SceneNode:
                return (target as SceneNode).isAlignedBox
                    ? getCollisionRectangleRectangle(this, (target as SceneNode).getBounds())
                    : getCollisionSat(this, target as SceneNode);
            case CollisionType.Rectangle: return getCollisionRectangleRectangle(this, target as Rectangle);
            case CollisionType.Polygon: return getCollisionSat(this, target as Polygon);
            case CollisionType.Circle: return getCollisionCircleRectangle(target as Circle, this, true);
            // case CollisionType.Ellipse: return intersectionRectEllipse(this, target as Ellipse);
            // case CollisionType.Line: return intersectionLineRect(target as Line, this);
            // case CollisionType.Point: return intersectionPointRect(target as Vector, this);
            default: return null;
        }
    }

    public destroy(): void {
        this._position.destroy();
        this._size.destroy();

        if (this._normals) {
            this._normals = null;
        }
    }

    private _updateNormals(normals: Array<ObservableVector>): void {
        normals[0].set(this.right - this.left, 0).rperp().normalize();
        normals[1].set(0, this.bottom - this.top).rperp().normalize();
        normals[2].set(this.left - this.right, 0).rperp().normalize();
        normals[3].set(0, this.top - this.bottom).rperp().normalize();
    }

    public static get temp(): Rectangle {
        if (temp === null) {
            temp = new Rectangle();
        }

        return temp;
    }
}
