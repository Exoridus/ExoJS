import { ObservableVector } from '@/math/ObservableVector';
import { Matrix } from '@/math/Matrix';
import { Rectangle } from '@/math/Rectangle';
import { Bounds } from './Bounds';
import { Flags } from '@/math/Flags';
import { degreesToRadians, trimRotation } from '@/math/utils';
import type { Container } from '@/rendering/Container';
import type { Vector } from '@/math/Vector';
import { Interval } from '@/math/Interval';
import type { Collidable, CollisionResponse} from '@/math/Collision';
import { CollisionType } from '@/math/Collision';
import type { View } from '@/rendering/View';
import {
    getCollisionSat,
    intersectionLineRect,
    intersectionPointRect,
    intersectionRectCircle,
    intersectionRectEllipse,
    intersectionSat
} from '@/math/collision-detection';
import type { Circle } from '@/math/Circle';
import type { Ellipse } from '@/math/Ellipse';
import type { Line } from '@/math/Line';
import type { Polygon } from '@/math/Polygon';

// Internal: dirty-flag bits used by SceneNode's transform cache.
// Was previously exposed publicly as `TransformableFlags`. Inlined here
// during the 0.5.0 hierarchy slice to remove a single-purpose public
// abstraction. Not exported from any barrel.
enum SceneNodeTransformFlags {
    None = 0,
    Translation = 1 << 0,
    Rotation = 1 << 1,
    Scaling = 1 << 2,
    Origin = 1 << 3,
    Transform = SceneNodeTransformFlags.Translation
        | SceneNodeTransformFlags.Rotation
        | SceneNodeTransformFlags.Scaling
        | SceneNodeTransformFlags.Origin,
    TransformInverse = 1 << 4,
}

export class SceneNode implements Collidable {

    public readonly collisionType: CollisionType = CollisionType.SceneNode;

    public readonly flags: Flags<SceneNodeTransformFlags> =
        new Flags<SceneNodeTransformFlags>(SceneNodeTransformFlags.Transform);

    protected _bounds = new Bounds();
    protected _transform: Matrix = new Matrix();
    protected _position: ObservableVector = new ObservableVector(this._setPositionDirty.bind(this), 0, 0);
    protected _scale: ObservableVector = new ObservableVector(this._setScalingDirty.bind(this), 1, 1);
    protected _origin: ObservableVector = new ObservableVector(this._setOriginDirty.bind(this), 0, 0);
    protected _rotation = 0;
    protected _sin = 0;
    protected _cos = 1;

    private _visible = true;
    private _globalTransform = new Matrix();
    private _localBounds = new Rectangle();
    private _anchor = new ObservableVector(this._updateOrigin.bind(this), 0, 0);
    private _parentNode: Container | null = null;
    private _zIndex = 0;
    private _childOrder = 0;
    private _cullable = true;

    public get position(): ObservableVector {
        return this._position;
    }

    public set position(position: ObservableVector) {
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

    public get rotation(): number {
        return this._rotation;
    }

    public set rotation(rotation: number) {
        this.setRotation(rotation);
    }

    public get scale(): ObservableVector {
        return this._scale;
    }

    public set scale(scale: ObservableVector) {
        this._scale.copy(scale);
    }

    public get origin(): ObservableVector {
        return this._origin;
    }

    public set origin(origin: ObservableVector) {
        this._origin.copy(origin);
    }

    public get anchor(): ObservableVector {
        return this._anchor;
    }

    public set anchor(anchor: ObservableVector) {
        this._anchor.copy(anchor);
    }

    public get parent(): Container | null {
        return this._parentNode;
    }

    public set parent(parent: Container | null) {
        this._parentNode = parent;
    }

    public get parentNode(): Container | null {
        return this._parentNode;
    }

    public set parentNode(parentNode: Container | null) {
        this._parentNode = parentNode;
    }

    public get visible(): boolean {
        return this._visible;
    }

    public set visible(visible: boolean) {
        this._visible = visible;
    }

    public get zIndex(): number {
        return this._zIndex;
    }

    public set zIndex(zIndex: number) {
        if (this._zIndex !== zIndex) {
            this._zIndex = zIndex;
            this._parentNode?.markSortDirty();
        }
    }

    public get childOrder(): number {
        return this._childOrder;
    }

    public get cullable(): boolean {
        return this._cullable;
    }

    public set cullable(cullable: boolean) {
        this._cullable = cullable;
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

    public setPosition(x: number, y: number = x): this {
        this._position.set(x, y);

        return this;
    }

    public setRotation(degrees: number): this {
        const rotation = trimRotation(degrees);

        if (this._rotation !== rotation) {
            this._rotation = rotation;
            this._setRotationDirty();
        }

        return this;
    }

    public setScale(x: number, y: number = x): this {
        this._scale.set(x, y);

        return this;
    }

    public setOrigin(x: number, y: number = x): this {
        this._origin.set(x, y);

        return this;
    }

    public move(x: number, y: number): this {
        return this.setPosition(this.x + x, this.y + y);
    }

    public rotate(degrees: number): this {
        return this.setRotation(this._rotation + degrees);
    }

    public getTransform(): Matrix {
        if (this.flags.has(SceneNodeTransformFlags.Transform)) {
            this.updateTransform();
            this.flags.remove(SceneNodeTransformFlags.Transform);
        }

        return this._transform;
    }

    public updateTransform(): this {
        if (this.flags.has(SceneNodeTransformFlags.Rotation)) {
            const radians = degreesToRadians(this._rotation);

            this._cos = Math.cos(radians);
            this._sin = Math.sin(radians);
        }

        if (this.flags.has(SceneNodeTransformFlags.Rotation | SceneNodeTransformFlags.Scaling)) {
            const { x, y } = this._scale;

            this._transform.a = x * this._cos;
            this._transform.b = y * this._sin;

            this._transform.c = -x * this._sin;
            this._transform.d =  y * this._cos;
        }

        if (this._rotation) {
            const { x, y } = this._origin;

            this._transform.x = (x * -this._transform.a) - (y * this._transform.b) + this._position.x;
            this._transform.y = (x * -this._transform.c) - (y * this._transform.d) + this._position.y;
        } else {
            this._transform.x = (this._origin.x * -this._scale.x) + this._position.x;
            this._transform.y = (this._origin.y * -this._scale.y) + this._position.y;
        }

        return this;
    }

    public setAnchor(x: number, y: number = x): this  {
        this._anchor.set(x, y);

        return this;
    }

    public setChildOrder(order: number): this {
        this._childOrder = order;

        return this;
    }

    public setCullable(cullable: boolean): this {
        this._cullable = cullable;

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
        if (this._parentNode) {
            this._parentNode.updateParentTransform();
        }

        this.updateTransform();

        return this;
    }

    public getGlobalTransform(): Matrix {
        this._globalTransform.copy(this.getTransform());

        if (this._parentNode) {
            this._globalTransform.combine(this._parentNode.getGlobalTransform());
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
            case CollisionType.SceneNode: return intersectionSat(this, target as SceneNode);
            case CollisionType.Rectangle: return intersectionSat(this, target as Rectangle);
            case CollisionType.Polygon: return intersectionSat(this, target as Polygon);
            case CollisionType.Circle: return intersectionRectCircle(this.getBounds(), target as Circle);
            case CollisionType.Ellipse: return intersectionRectEllipse(this.getBounds(), target as Ellipse);
            case CollisionType.Line: return intersectionLineRect(target as Line, this.getBounds());
            case CollisionType.Point: return intersectionPointRect(target as Vector, this.getBounds());
            default: return false;
        }
    }

    public collidesWith(target: Collidable): CollisionResponse | null {
        if (this.isAlignedBox) {
            return this.getBounds().collidesWith(target);
        }

        switch (target.collisionType) {
            case CollisionType.SceneNode: return getCollisionSat(this, target as SceneNode);
            case CollisionType.Rectangle: return getCollisionSat(this, target as Rectangle);
            case CollisionType.Polygon: return getCollisionSat(this, target as Polygon);
            case CollisionType.Circle: return getCollisionSat(this, target as Circle);
            default: return null;
        }
    }

    public contains(x: number, y: number): boolean {
        return this.getBounds().contains(x, y);
    }

    public inView(view: View): boolean {
        if (!this._cullable) {
            return true;
        }

        return view.getBounds().intersectsWith(this.getBounds());
    }

    public destroy(): void {
        this._transform.destroy();
        this._position.destroy();
        this._scale.destroy();
        this._origin.destroy();
        this.flags.destroy();

        this._globalTransform.destroy();
        this._localBounds.destroy();
        this._bounds.destroy();
        this._anchor.destroy();
    }

    private _setPositionDirty(): void {
        this.flags.push(SceneNodeTransformFlags.Translation);
    }

    private _setRotationDirty(): void {
        this.flags.push(SceneNodeTransformFlags.Rotation);
    }

    private _setScalingDirty(): void {
        this.flags.push(SceneNodeTransformFlags.Scaling);
    }

    private _setOriginDirty(): void {
        this.flags.push(SceneNodeTransformFlags.Origin);
    }

    private _updateOrigin(): void {
        const { x, y } = this._anchor;
        const { width, height } = this.getBounds();

        this.setOrigin(width * x, height * y);
    }
}
