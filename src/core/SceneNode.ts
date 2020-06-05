import { Transformable } from 'math/Transformable';
import { Matrix } from 'math/Matrix';
import { Rectangle } from 'math/Rectangle';
import { Bounds } from './Bounds';
import { ObservableVector } from 'math/ObservableVector';
import type { Container } from 'rendering/Container';
import type { Vector } from "math/Vector";
import { Interval } from "math/Interval";
import { Collidable, Collision, CollisionType } from "types/Collision";
import {
    intersectionLineRect,
    intersectionPointRect,
    intersectionRectCircle,
    intersectionRectEllipse,
    intersectionSAT
} from "utils/collision-detection";
import type { Circle } from "math/Circle";
import type { Ellipse } from "math/Ellipse";
import type { Line } from "math/Line";
import type { Polygon } from "math/Polygon";

export class SceneNode extends Transformable implements Collidable {

    public readonly collisionType: CollisionType = CollisionType.SceneNode;

    protected _bounds = new Bounds();
    private _globalTransform = new Matrix();
    private _localBounds = new Rectangle();
    private _anchor = new ObservableVector(this._updateOrigin.bind(this), 0, 0);
    private _parent: Container | null = null;

    public get anchor(): ObservableVector {
        return this._anchor;
    }

    public set anchor(anchor: ObservableVector) {
        this._anchor.copy(anchor);
    }

    public get parent(): Container | null {
        return this._parent;
    }

    public set parent(parent: Container | null) {
        this._parent = parent;
    }

    public get globalTransform(): Matrix {
        return this.getGlobalTransform();
    }

    public get localBounds(): Rectangle {
        return this.getLocalBounds();
    }

    public get bounds(): Rectangle {
        return this.getBounds();
    }

    public get isAlignedBox(): boolean {
        return this.rotation % 90 === 0;
    }

    public setAnchor(x: number, y: number = x): this  {
        this._anchor.set(x, y);

        return this;
    }

    public getLocalBounds(): Rectangle {
        return this._localBounds;
    }

    public getBounds(): Rectangle {
        this.updateParentTransform();
        this.updateBounds();

        return this._bounds.getRect();
    }

    public updateBounds(): this {
        this._bounds.reset()
            .addRect(this.getLocalBounds(), this.getGlobalTransform());

        return this;
    }

    public updateParentTransform(): this {
        if (this._parent) {
            this._parent?.updateParentTransform();
        }

        this.updateTransform();

        return this;
    }

    public getGlobalTransform(): Matrix {
        this._globalTransform.copy(this.getTransform());

        if (this._parent) {
            this._globalTransform.combine(this._parent.getGlobalTransform());
        }

        return this._globalTransform;
    }

    public getNormals(): Array<Vector> {
        return this.getBounds().getNormals();
    }

    public project(axis: Vector, result: Interval = new Interval()): Interval {
        return this.getBounds().project(axis, result);
    }

    public intersectsWith(target: Collidable): boolean {
        if (this.isAlignedBox) {
            return this.getBounds().intersectsWith(target);
        }

        switch (target.collisionType) {
            case CollisionType.SceneNode: return intersectionSAT(this, target as SceneNode);
            case CollisionType.Rectangle: return intersectionSAT(this, target as Rectangle);
            case CollisionType.Polygon: return intersectionSAT(this, target as Polygon);
            case CollisionType.Circle: return intersectionRectCircle(this.getBounds(), target as Circle);
            case CollisionType.Ellipse: return intersectionRectEllipse(this.getBounds(), target as Ellipse);
            case CollisionType.Line: return intersectionLineRect(target as Line, this.getBounds());
            case CollisionType.Point: return intersectionPointRect(target as Vector, this.getBounds());
            default: return false;
        }
    }

    public collidesWith(target: Collidable): Collision | null {
        if (this.isAlignedBox) {
            return this.getBounds().collidesWith(target);
        }

        // todo - add SceneNode Collision when rotated
        return null
    }

    public contains(x: number, y: number): boolean {
        return this.getBounds().contains(x, y);
    }

    public destroy(): void {
        super.destroy();

        this._globalTransform.destroy();
        this._localBounds.destroy();
        this._bounds.destroy();
        this._anchor.destroy();
    }

    private _updateOrigin(): void {
        const { x, y } = this._anchor;
        const { width, height } = this.getBounds();

        this.setOrigin(width * x, height * y);
    }
}
