import { applyInverseTransform, applyTransform, type Mutable2D } from '../math';
import { PhysicsBody } from '../PhysicsBody';
import type { VectorLike } from '../types';
import { Joint } from './Joint';

/** Construction options for a {@link MouseJoint}. */
export interface MouseJointOptions {
  /** The body to drag. */
  body: PhysicsBody;
  /** World point to pull the body toward — also the grab point on the body at creation. */
  target: VectorLike;
  /** Soft-spring frequency in Hz (higher = snappier). Default `5`. */
  hertz?: number;
  /** Soft-spring damping ratio. Default `0.7`. */
  dampingRatio?: number;
  /** Maximum pulling force — clamps the per-step impulse so heavy bodies lag. Default `Infinity`. */
  maxForce?: number;
}

/** Reused output sink — physics steps single-threaded, so a shared scratch is safe. */
const scratch: Mutable2D = { x: 0, y: 0 };

/**
 * Softly pulls a single body's grab point toward a movable **target** point
 * (typically the mouse cursor). The grab point is fixed on the body at creation;
 * update {@link target} each frame to drag. A soft constraint bounded by
 * {@link maxForce} — solved in the sub-step loop, warm-started. Internally the
 * "other" body is a private static ground sentinel, so this is a single-body
 * constraint that touches only the dragged body.
 */
export class MouseJoint extends Joint {
  /** Soft-spring frequency in Hz. */
  public hertz: number;
  /** Soft-spring damping ratio. */
  public dampingRatio: number;
  /** Maximum pulling force. */
  public maxForce: number;

  private readonly _localAnchorX: number;
  private readonly _localAnchorY: number;
  private _targetX: number;
  private _targetY: number;

  private _rx = 0;
  private _ry = 0;
  private _cx = 0;
  private _cy = 0;
  private _invK11 = 0;
  private _invK12 = 0;
  private _invK22 = 0;
  private _biasRate = 0;
  private _massScale = 1;
  private _impulseScale = 0;
  private _impulseX = 0;
  private _impulseY = 0;
  private _maxImpulse = 0;

  public constructor(options: MouseJointOptions) {
    // Single-body constraint: a private static ground stands in for bodyA so the
    // island/solver machinery (which assumes two bodies) sees a static anchor that
    // it never integrates, unions or mutates.
    super(new PhysicsBody({ type: 'static', position: options.target }), options.body);

    applyInverseTransform(options.body.transform, options.target.x, options.target.y, scratch);
    this._localAnchorX = scratch.x;
    this._localAnchorY = scratch.y;
    this._targetX = options.target.x;
    this._targetY = options.target.y;

    this.hertz = options.hertz ?? 5;
    this.dampingRatio = options.dampingRatio ?? 0.7;
    this.maxForce = options.maxForce ?? Infinity;
  }

  /** The world point the body is pulled toward. Reassigning wakes the body so a drag tracks live. */
  public get target(): VectorLike {
    return { x: this._targetX, y: this._targetY };
  }

  public set target(value: VectorLike) {
    this._targetX = value.x;
    this._targetY = value.y;
    this.bodyB.wake();
  }

  public override _prepare(h: number): void {
    const body = this.bodyB;

    this._active = this.enabled && !body.isSleeping && body.invMass > 0;

    if (!this._active) {
      return;
    }

    applyTransform(body.transform, this._localAnchorX, this._localAnchorY, scratch);
    this._rx = scratch.x - body.worldCenterOfMassX;
    this._ry = scratch.y - body.worldCenterOfMassY;
    this._cx = scratch.x - this._targetX;
    this._cy = scratch.y - this._targetY;

    const m = body.invMass;
    const i = body.invInertia;

    // 2×2 effective-mass matrix K (only the dragged body contributes) and its inverse.
    const k11 = m + i * this._ry * this._ry;
    const k12 = -i * this._rx * this._ry;
    const k22 = m + i * this._rx * this._rx;
    const det = k11 * k22 - k12 * k12;
    const invDet = det !== 0 ? 1 / det : 0;

    this._invK11 = invDet * k22;
    this._invK12 = -invDet * k12;
    this._invK22 = invDet * k11;
    this._maxImpulse = this.maxForce * h;

    const omega = 2 * Math.PI * this.hertz;
    const a1 = 2 * this.dampingRatio + h * omega;
    const a2 = h * omega * a1;
    const a3 = 1 / (1 + a2);

    this._biasRate = omega / a1;
    this._massScale = a2 * a3;
    this._impulseScale = a3;
  }

  public override _warmStart(): void {
    if (!this._active) {
      return;
    }

    this._applyImpulse(this._impulseX, this._impulseY);
  }

  public override _solve(useBias: boolean): void {
    if (!this._active) {
      return;
    }

    const body = this.bodyB;

    // Velocity of the grab point.
    const cdotX = body.linearVelocityX - body.angularVelocity * this._ry;
    const cdotY = body.linearVelocityY + body.angularVelocity * this._rx;
    const rhsX = cdotX + (useBias ? this._biasRate * this._cx : 0);
    const rhsY = cdotY + (useBias ? this._biasRate * this._cy : 0);

    const solvedX = this._invK11 * rhsX + this._invK12 * rhsY;
    const solvedY = this._invK12 * rhsX + this._invK22 * rhsY;
    let impulseX = -this._massScale * solvedX - this._impulseScale * this._impulseX;
    let impulseY = -this._massScale * solvedY - this._impulseScale * this._impulseY;

    // Clamp the accumulated impulse magnitude to maxForce·h (a heavy body lags).
    const oldX = this._impulseX;
    const oldY = this._impulseY;
    this._impulseX += impulseX;
    this._impulseY += impulseY;

    const magnitude = Math.hypot(this._impulseX, this._impulseY);

    if (magnitude > this._maxImpulse) {
      const scale = this._maxImpulse / magnitude;

      this._impulseX *= scale;
      this._impulseY *= scale;
    }

    impulseX = this._impulseX - oldX;
    impulseY = this._impulseY - oldY;
    this._applyImpulse(impulseX, impulseY);
  }

  private _applyImpulse(jx: number, jy: number): void {
    const body = this.bodyB;

    body.linearVelocityX += body.invMass * jx;
    body.linearVelocityY += body.invMass * jy;
    body.angularVelocity += body.invInertia * (this._rx * jy - this._ry * jx);
  }
}
