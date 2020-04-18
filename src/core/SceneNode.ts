import { Transformable } from 'math/Transformable';
import { Matrix } from 'math/Matrix';
import { Rectangle } from 'math/Rectangle';
import { Bounds } from './Bounds';
import { Interval } from 'math/Interval';
import { Vector } from 'math/Vector';
import { ObservableVector } from 'math/ObservableVector';
import {
    getCollisionSAT,
    isSceneNodeIntersecting, Collidable, Collision, CollisionType
} from "const/collision";
import { Container } from 'rendering/Container';

export class SceneNode extends Transformable implements Collidable {

    public readonly collisionType: CollisionType = CollisionType.TransformableRectangle;

    private _globalTransform = new Matrix();
    private _localBounds = new Rectangle();
    protected _bounds = new Bounds();
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

    public contains(x: number, y: number): boolean {
        return this.getBounds().contains(x, y);
    }

    public intersects(target: Collidable): boolean {
        return isSceneNodeIntersecting(this, target);
    }

    public getCollision(target: Collidable): Collision | null {
        // if ((this._rotation % 90 === 0) && (target.rotation % 90 === 0)) {
        //     return getCollisionRectangleRectangle(this.getBounds(), target.getBounds());
        // }

        return getCollisionSAT(this, target);
    }

    public setAnchor(x: number, y: number = x): this  {
        this._anchor.set(x, y);

        return this;
    }

    public destroy() {
        super.destroy();

        this._globalTransform.destroy();
        this._localBounds.destroy();
        this._bounds.destroy();
        this._anchor.destroy();
    }

    private _updateOrigin() {
        const { x, y } = this._anchor;
        const { width, height } = this.getBounds();

        this.setOrigin(width * x, height * y);
    }
}
