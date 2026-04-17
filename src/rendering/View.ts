import { ObservableVector } from 'math/ObservableVector';
import { Rectangle } from 'math/Rectangle';
import { Matrix } from 'math/Matrix';
import { clamp, degreesToRadians, trimRotation } from 'math/utils';
import { ObservableSize } from 'math/ObservableSize';
import { Bounds } from 'core/Bounds';
import { Flags } from 'math/Flags';

export enum ViewFlags {
    None = 0x00,
    Translation = 0x01,
    Rotation = 0x02,
    Scaling = 0x04,
    Origin = 0x08,
    Transform = 0x0F,
    TransformInverse = 0x10,
    BoundingBox = 0x20,
    TextureCoords = 0x40,
    VertexTint = 0x80,
}

export interface ViewFollowOptions {
    lerp?: number;
    offsetX?: number;
    offsetY?: number;
}

export interface ViewShakeOptions {
    frequency?: number;
    decay?: boolean;
}

export class View {
    private readonly _center: ObservableVector;
    private readonly _size: ObservableSize;
    private readonly _viewport: Rectangle = new Rectangle(0, 0, 1, 1);
    private readonly _transform: Matrix = new Matrix();
    private readonly _inverseTransform: Matrix = new Matrix();
    private readonly _bounds: Bounds = new Bounds();
    private readonly _flags: Flags<ViewFlags> = new Flags<ViewFlags>();
    private _rotation = 0;
    private _sin = 0;
    private _cos = 1;
    private _zoomLevel = 1;
    private _zoomBaseWidth: number;
    private _zoomBaseHeight: number;
    private _followTarget: { x: number; y: number; } | null = null;
    private _followLerp = 1;
    private _followOffsetX = 0;
    private _followOffsetY = 0;
    private _boundsConstraint: Rectangle | null = null;
    private _shakeIntensity = 0;
    private _shakeDurationMs = 0;
    private _shakeElapsedMs = 0;
    private _shakeFrequency = 16;
    private _shakeDecay = true;
    private _shakePhase = 0;
    private _shakeOffsetX = 0;
    private _shakeOffsetY = 0;
    private _updateId = 0;

    public constructor(centerX: number, centerY: number, width: number, height: number) {
        this._center = new ObservableVector(this._setPositionDirty.bind(this), centerX, centerY);
        this._size = new ObservableSize(this._setScalingDirty.bind(this), width, height);
        this._zoomBaseWidth = width;
        this._zoomBaseHeight = height;
        this._flags.push(
            ViewFlags.Transform,
            ViewFlags.TransformInverse,
            ViewFlags.BoundingBox
        );
    }

    public get center(): ObservableVector {
        return this._center;
    }

    public set center(center: ObservableVector) {
        this._center.copy(center);
    }

    public get size(): ObservableSize {
        return this._size;
    }

    public set size(size: ObservableSize) {
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

    public get rotation(): number {
        return this._rotation;
    }

    public set rotation(rotation: number) {
        this.setRotation(rotation);
    }

    public get viewport(): Rectangle {
        return this._viewport;
    }

    public set viewport(viewport: Rectangle) {
        if (!this._viewport.equals(viewport)) {
            this._viewport.copy(viewport);
            this._setDirty();
        }
    }

    public get updateId(): number {
        return this._updateId;
    }

    public get zoomLevel(): number {
        return this._zoomLevel;
    }

    public setCenter(x: number, y: number): this {
        this._center.set(x, y);

        return this;
    }

    public resize(width: number, height: number): this {
        this._zoomBaseWidth = width;
        this._zoomBaseHeight = height;
        this._zoomLevel = 1;
        this._size.set(width, height);

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

    public move(x: number, y: number): this {
        this.setCenter(this._center.x + x, this._center.y + y);

        return this;
    }

    public zoom(factor: number): this {
        this.resize(this._size.width * factor, this._size.height * factor);

        return this;
    }

    public setZoom(zoom: number): this {
        const normalizedZoom = Math.max(0.0001, zoom);

        this._zoomLevel = normalizedZoom;
        this._size.set(
            this._zoomBaseWidth / normalizedZoom,
            this._zoomBaseHeight / normalizedZoom,
        );

        return this;
    }

    public zoomIn(amount = 0.1): this {
        return this.setZoom(this._zoomLevel + amount);
    }

    public zoomOut(amount = 0.1): this {
        return this.setZoom(Math.max(0.0001, this._zoomLevel - amount));
    }

    public follow(target: { x: number; y: number; } | null, options: ViewFollowOptions = {}): this {
        this._followTarget = target;
        this._followLerp = clamp(options.lerp ?? 1, 0, 1);
        this._followOffsetX = options.offsetX ?? 0;
        this._followOffsetY = options.offsetY ?? 0;

        return this;
    }

    public clearFollow(): this {
        this._followTarget = null;
        this._followLerp = 1;
        this._followOffsetX = 0;
        this._followOffsetY = 0;

        return this;
    }

    public setBounds(bounds: Rectangle | null): this {
        if (bounds === null) {
            if (this._boundsConstraint) {
                this._boundsConstraint.destroy();
                this._boundsConstraint = null;
            }

            return this;
        }

        if (this._boundsConstraint === null) {
            this._boundsConstraint = bounds.clone();
        } else {
            this._boundsConstraint.copy(bounds);
        }

        this._applyBoundsConstraint();

        return this;
    }

    public clearBounds(): this {
        return this.setBounds(null);
    }

    public shake(intensity: number, durationMs: number, options: ViewShakeOptions = {}): this {
        this._shakeIntensity = Math.max(0, intensity);
        this._shakeDurationMs = Math.max(0, durationMs);
        this._shakeElapsedMs = 0;
        this._shakeFrequency = Math.max(0, options.frequency ?? 16);
        this._shakeDecay = options.decay ?? true;
        this._shakePhase = 0;
        this._shakeOffsetX = 0;
        this._shakeOffsetY = 0;
        this._setPositionDirty();

        return this;
    }

    public stopShake(): this {
        this._shakeIntensity = 0;
        this._shakeDurationMs = 0;
        this._shakeElapsedMs = 0;
        this._shakePhase = 0;

        if (this._shakeOffsetX !== 0 || this._shakeOffsetY !== 0) {
            this._shakeOffsetX = 0;
            this._shakeOffsetY = 0;
            this._setPositionDirty();
        }

        return this;
    }

    public update(deltaMilliseconds: number): this {
        this._updateFollowTarget();
        this._updateShake(deltaMilliseconds);
        this._applyBoundsConstraint();

        return this;
    }

    public rotate(degrees: number): this {
        this.setRotation(this._rotation + degrees);

        return this;
    }

    public reset(centerX: number, centerY: number, width: number, height: number): this {
        this._zoomBaseWidth = width;
        this._zoomBaseHeight = height;
        this._zoomLevel = 1;
        this._size.set(width, height);
        this._center.set(centerX, centerY);
        this._viewport.set(0, 0, 1, 1);
        this._rotation = 0;
        this._sin = 0;
        this._cos = 1;

        this._flags.push(ViewFlags.Transform);

        return this;
    }

    public getTransform(): Matrix {
        if (this._flags.has(ViewFlags.Transform)) {
            this.updateTransform();
            this._flags.remove(ViewFlags.Transform);
        }

        return this._transform;
    }

    public updateTransform(): this {
        const centerX = this._center.x + this._shakeOffsetX;
        const centerY = this._center.y + this._shakeOffsetY;
        const x = 2 / this.width,
            y = -2 / this.height;

        if (this._flags.has(ViewFlags.Rotation)) {
            const radians = degreesToRadians(this._rotation);

            this._cos = Math.cos(radians);
            this._sin = Math.sin(radians);
        }

        if (this._flags.has(ViewFlags.Rotation | ViewFlags.Scaling)) {
            this._transform.a = x * this._cos;
            this._transform.b = x * this._sin;

            this._transform.c = -y * this._sin;
            this._transform.d =  y * this._cos;
        }

        this._transform.x = (x * -this._transform.a) - (y * this._transform.b) + (-x * centerX);
        this._transform.y = (x * -this._transform.c) - (y * this._transform.d) + (-y * centerY);

        return this;
    }

    public getInverseTransform(): Matrix {
        if (this._flags.has(ViewFlags.TransformInverse)) {
            this.getTransform()
                .getInverse(this._inverseTransform);

            this._flags.remove(ViewFlags.TransformInverse);
        }

        return this._inverseTransform;
    }

    public getBounds(): Rectangle {
        if (this._flags.has(ViewFlags.BoundingBox)) {
            this.updateBounds();
            this._flags.remove(ViewFlags.BoundingBox);
        }

        return this._bounds.getRect();
    }

    public updateBounds(): this {
        const centerX = this._center.x + this._shakeOffsetX;
        const centerY = this._center.y + this._shakeOffsetY;
        const offsetX = this.width / 2;
        const offsetY = this.height / 2;

        this._bounds.reset()
            .addCoords(centerX - offsetX, centerY - offsetY)
            .addCoords(centerX + offsetX, centerY + offsetY);

        return this;
    }

    public destroy(): void {
        this.stopShake();
        this.clearFollow();

        if (this._boundsConstraint) {
            this._boundsConstraint.destroy();
            this._boundsConstraint = null;
        }

        this._center.destroy();
        this._size.destroy();
        this._viewport.destroy();
        this._transform.destroy();
        this._inverseTransform.destroy();
        this._bounds.destroy();
        this._flags.destroy();
    }

    private _setDirty(): void {
        this._flags.push(ViewFlags.TransformInverse, ViewFlags.BoundingBox);
        this._updateId++;
    }

    private _setPositionDirty(): void {
        this._flags.push(ViewFlags.Translation);
        this._setDirty();
    }

    private _setRotationDirty(): void {
        this._flags.push(ViewFlags.Rotation);
        this._setDirty();
    }

    private _setScalingDirty(): void {
        this._flags.push(ViewFlags.Scaling);
        this._setDirty();
    }

    private _updateFollowTarget(): void {
        if (!this._followTarget) {
            return;
        }

        const targetX = this._followTarget.x + this._followOffsetX;
        const targetY = this._followTarget.y + this._followOffsetY;

        if (this._followLerp >= 1) {
            this.setCenter(targetX, targetY);

            return;
        }

        this.setCenter(
            this._center.x + ((targetX - this._center.x) * this._followLerp),
            this._center.y + ((targetY - this._center.y) * this._followLerp),
        );
    }

    private _applyBoundsConstraint(): void {
        if (!this._boundsConstraint) {
            return;
        }

        const bounds = this._boundsConstraint;
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;
        const minX = bounds.left + halfWidth;
        const maxX = bounds.right - halfWidth;
        const minY = bounds.top + halfHeight;
        const maxY = bounds.bottom - halfHeight;
        const constrainedX = minX > maxX ? (bounds.left + bounds.right) / 2 : clamp(this._center.x, minX, maxX);
        const constrainedY = minY > maxY ? (bounds.top + bounds.bottom) / 2 : clamp(this._center.y, minY, maxY);

        if (constrainedX !== this._center.x || constrainedY !== this._center.y) {
            this.setCenter(constrainedX, constrainedY);
        }
    }

    private _updateShake(deltaMilliseconds: number): void {
        if (this._shakeDurationMs <= 0 || this._shakeIntensity <= 0) {
            if (this._shakeOffsetX !== 0 || this._shakeOffsetY !== 0) {
                this._shakeOffsetX = 0;
                this._shakeOffsetY = 0;
                this._setPositionDirty();
            }

            return;
        }

        this._shakeElapsedMs = Math.min(
            this._shakeDurationMs,
            this._shakeElapsedMs + Math.max(0, deltaMilliseconds),
        );

        const progress = this._shakeDurationMs > 0
            ? this._shakeElapsedMs / this._shakeDurationMs
            : 1;
        const amplitude = this._shakeDecay
            ? this._shakeIntensity * (1 - progress)
            : this._shakeIntensity;

        this._shakePhase += (Math.max(0, deltaMilliseconds) / 1000) * this._shakeFrequency * Math.PI * 2;

        const nextOffsetX = Math.sin(this._shakePhase * 1.7) * amplitude;
        const nextOffsetY = Math.cos(this._shakePhase * 1.3) * amplitude;

        if (nextOffsetX !== this._shakeOffsetX || nextOffsetY !== this._shakeOffsetY) {
            this._shakeOffsetX = nextOffsetX;
            this._shakeOffsetY = nextOffsetY;
            this._setPositionDirty();
        }

        if (this._shakeElapsedMs >= this._shakeDurationMs) {
            this.stopShake();
        }
    }
}
