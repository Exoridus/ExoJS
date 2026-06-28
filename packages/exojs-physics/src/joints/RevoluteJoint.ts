import { applyInverseTransform, applyTransform, type Mutable2D } from '../math';
import type { PhysicsBody } from '../PhysicsBody';
import type { VectorLike } from '../types';
import { Joint } from './Joint';

/** Construction options for a {@link RevoluteJoint}. */
export interface RevoluteJointOptions {
  /** First body (often a static anchor). */
  bodyA: PhysicsBody;
  /** Second body. */
  bodyB: PhysicsBody;
  /** Shared world-space pivot point at creation. The two bodies are pinned here and may rotate freely about it. */
  anchor: VectorLike;
  /** Soft-spring frequency in Hz; `0` (default) makes it a rigid pin. */
  hertz?: number;
  /** Soft-spring damping ratio (used when `hertz > 0`). Default `1`. */
  dampingRatio?: number;
  /** Enable the angular motor (drives `ωB − ωA` toward {@link motorSpeed}). Default `false`. */
  enableMotor?: boolean;
  /** Target relative angular velocity in rad/s when the motor is enabled. Default `0`. */
  motorSpeed?: number;
  /** Maximum motor torque — clamps the per-step motor impulse. Default `0`. */
  maxMotorTorque?: number;
  /** Enable the angle limit (keeps the relative angle in `[lowerAngle, upperAngle]`). Default `false`. */
  enableLimit?: boolean;
  /** Lower relative-angle limit in radians (relative to the angle at creation). Default `0`. */
  lowerAngle?: number;
  /** Upper relative-angle limit in radians. Default `0`. */
  upperAngle?: number;
}

/** Reused output sink — physics steps single-threaded, so a shared scratch is safe. */
const scratch: Mutable2D = { x: 0, y: 0 };

/**
 * Pins a shared anchor point on two bodies (a hinge): the bodies may rotate
 * freely about the pivot but the anchor points stay coincident. Solved as a
 * 2-DOF point constraint (a 2×2 block) in the sub-step loop, warm-started.
 */
export class RevoluteJoint extends Joint {
  /** Soft-spring frequency in Hz (`0` = rigid). */
  public hertz: number;
  /** Soft-spring damping ratio. */
  public dampingRatio: number;
  /** When `true`, the motor drives `ωB − ωA` toward {@link motorSpeed}. */
  public enableMotor: boolean;
  /** Target relative angular velocity (rad/s) for the motor. */
  public motorSpeed: number;
  /** Maximum motor torque. */
  public maxMotorTorque: number;
  /** When `true`, the relative angle is constrained to `[lowerAngle, upperAngle]`. */
  public enableLimit: boolean;
  /** Lower relative-angle limit (radians, relative to the creation angle). */
  public lowerAngle: number;
  /** Upper relative-angle limit (radians). */
  public upperAngle: number;

  private readonly _localAnchorAx: number;
  private readonly _localAnchorAy: number;
  private readonly _localAnchorBx: number;
  private readonly _localAnchorBy: number;

  private _rAx = 0;
  private _rAy = 0;
  private _rBx = 0;
  private _rBy = 0;
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
  private readonly _referenceAngle: number;
  private _axialMass = 0;
  private _h = 0;
  private _invH = 0;
  private _motorImpulse = 0;
  private _lowerImpulse = 0;
  private _upperImpulse = 0;

  public constructor(options: RevoluteJointOptions) {
    super(options.bodyA, options.bodyB);

    applyInverseTransform(options.bodyA.transform, options.anchor.x, options.anchor.y, scratch);
    this._localAnchorAx = scratch.x;
    this._localAnchorAy = scratch.y;
    applyInverseTransform(options.bodyB.transform, options.anchor.x, options.anchor.y, scratch);
    this._localAnchorBx = scratch.x;
    this._localAnchorBy = scratch.y;

    this.hertz = options.hertz ?? 0;
    this.dampingRatio = options.dampingRatio ?? 1;
    this.enableMotor = options.enableMotor ?? false;
    this.motorSpeed = options.motorSpeed ?? 0;
    this.maxMotorTorque = options.maxMotorTorque ?? 0;
    this.enableLimit = options.enableLimit ?? false;
    this.lowerAngle = options.lowerAngle ?? 0;
    this.upperAngle = options.upperAngle ?? 0;
    this._referenceAngle = options.bodyB.angle - options.bodyA.angle;
  }

  public override _prepare(h: number): void {
    const bodyA = this.bodyA;
    const bodyB = this.bodyB;

    this._active = this.enabled && !bodyA.isSleeping && !bodyB.isSleeping && (bodyA.invMass > 0 || bodyB.invMass > 0);

    if (!this._active) {
      return;
    }

    applyTransform(bodyA.transform, this._localAnchorAx, this._localAnchorAy, scratch);
    const pAx = scratch.x;
    const pAy = scratch.y;
    applyTransform(bodyB.transform, this._localAnchorBx, this._localAnchorBy, scratch);
    const pBx = scratch.x;
    const pBy = scratch.y;

    this._rAx = pAx - bodyA.worldCenterOfMassX;
    this._rAy = pAy - bodyA.worldCenterOfMassY;
    this._rBx = pBx - bodyB.worldCenterOfMassX;
    this._rBy = pBy - bodyB.worldCenterOfMassY;

    // Position error (the anchors should coincide).
    this._cx = pBx - pAx;
    this._cy = pBy - pAy;

    const mA = bodyA.invMass;
    const mB = bodyB.invMass;
    const iA = bodyA.invInertia;
    const iB = bodyB.invInertia;

    // 2×2 effective-mass matrix K and its inverse.
    const k11 = mA + mB + iA * this._rAy * this._rAy + iB * this._rBy * this._rBy;
    const k12 = -iA * this._rAx * this._rAy - iB * this._rBx * this._rBy;
    const k22 = mA + mB + iA * this._rAx * this._rAx + iB * this._rBx * this._rBx;
    const det = k11 * k22 - k12 * k12;
    const invDet = det !== 0 ? 1 / det : 0;

    this._invK11 = invDet * k22;
    this._invK12 = -invDet * k12;
    this._invK22 = invDet * k11;

    // Angular (motor/limit) effective mass + sub-step rate.
    this._axialMass = iA + iB > 0 ? 1 / (iA + iB) : 0;
    this._h = h;
    this._invH = 1 / h;

    if (!this.enableMotor) {
      this._motorImpulse = 0;
    }

    if (!this.enableLimit) {
      this._lowerImpulse = 0;
      this._upperImpulse = 0;
    }

    if (this.hertz > 0) {
      const omega = 2 * Math.PI * this.hertz;
      const a1 = 2 * this.dampingRatio + h * omega;
      const a2 = h * omega * a1;
      const a3 = 1 / (1 + a2);

      this._biasRate = omega / a1;
      this._massScale = a2 * a3;
      this._impulseScale = a3;
    } else {
      this._biasRate = 0.2 / h;
      this._massScale = 1;
      this._impulseScale = 0;
    }
  }

  public override _warmStart(): void {
    if (!this._active) {
      return;
    }

    // Angular warm-start: motor + limits (lower pushes +, upper pushes −).
    const axial = this._motorImpulse + this._lowerImpulse - this._upperImpulse;
    this.bodyA.angularVelocity -= this.bodyA.invInertia * axial;
    this.bodyB.angularVelocity += this.bodyB.invInertia * axial;

    this._applyImpulse(this._impulseX, this._impulseY);
  }

  public override _solve(useBias: boolean): void {
    if (!this._active) {
      return;
    }

    const bodyA = this.bodyA;
    const bodyB = this.bodyB;
    const iA = bodyA.invInertia;
    const iB = bodyB.invInertia;

    // Angular motor: drive ωB − ωA toward motorSpeed, clamped to ±maxMotorTorque·h.
    if (this.enableMotor) {
      const cdot = bodyB.angularVelocity - bodyA.angularVelocity - this.motorSpeed;
      const max = this.maxMotorTorque * this._h;
      const old = this._motorImpulse;

      this._motorImpulse = Math.min(max, Math.max(-max, old - this._axialMass * cdot));

      const applied = this._motorImpulse - old;
      bodyA.angularVelocity -= iA * applied;
      bodyB.angularVelocity += iB * applied;
    }

    // Angle limits: one-sided constraints keeping the relative angle in [lower, upper].
    if (this.enableLimit) {
      const angle = bodyB.angle + bodyB._deltaAngle - (bodyA.angle + bodyA._deltaAngle) - this._referenceAngle;

      // Lower limit (angle ≥ lowerAngle): a positive impulse increases the angle.
      const cLower = angle - this.lowerAngle;
      let biasLower = 0;

      if (cLower > 0) {
        biasLower = cLower * this._invH; // speculative: allow approach, engage at the surface
      } else if (useBias) {
        biasLower = 0.2 * this._invH * cLower; // Baumgarte push-back when violated
      }

      const oldLower = this._lowerImpulse;
      this._lowerImpulse = Math.max(0, oldLower - this._axialMass * (bodyB.angularVelocity - bodyA.angularVelocity + biasLower));

      const appliedLower = this._lowerImpulse - oldLower;
      bodyA.angularVelocity -= iA * appliedLower;
      bodyB.angularVelocity += iB * appliedLower;

      // Upper limit (angle ≤ upperAngle): a positive impulse decreases the angle.
      const cUpper = this.upperAngle - angle;
      let biasUpper = 0;

      if (cUpper > 0) {
        biasUpper = cUpper * this._invH;
      } else if (useBias) {
        biasUpper = 0.2 * this._invH * cUpper;
      }

      const oldUpper = this._upperImpulse;
      this._upperImpulse = Math.max(0, oldUpper - this._axialMass * (bodyA.angularVelocity - bodyB.angularVelocity + biasUpper));

      const appliedUpper = this._upperImpulse - oldUpper;
      bodyA.angularVelocity += iA * appliedUpper;
      bodyB.angularVelocity -= iB * appliedUpper;
    }

    // Relative velocity of the anchors.
    const cdotX = bodyB.linearVelocityX - bodyB.angularVelocity * this._rBy - (bodyA.linearVelocityX - bodyA.angularVelocity * this._rAy);
    const cdotY = bodyB.linearVelocityY + bodyB.angularVelocity * this._rBx - (bodyA.linearVelocityY + bodyA.angularVelocity * this._rAx);

    const rhsX = cdotX + (useBias ? this._biasRate * this._cx : 0);
    const rhsY = cdotY + (useBias ? this._biasRate * this._cy : 0);

    // Solve K·λ = −rhs, then apply the soft mass/impulse scaling.
    const solvedX = this._invK11 * rhsX + this._invK12 * rhsY;
    const solvedY = this._invK12 * rhsX + this._invK22 * rhsY;
    const impulseX = -this._massScale * solvedX - this._impulseScale * this._impulseX;
    const impulseY = -this._massScale * solvedY - this._impulseScale * this._impulseY;

    this._impulseX += impulseX;
    this._impulseY += impulseY;
    this._applyImpulse(impulseX, impulseY);
  }

  private _applyImpulse(jx: number, jy: number): void {
    const bodyA = this.bodyA;
    const bodyB = this.bodyB;

    bodyA.linearVelocityX -= bodyA.invMass * jx;
    bodyA.linearVelocityY -= bodyA.invMass * jy;
    bodyA.angularVelocity -= bodyA.invInertia * (this._rAx * jy - this._rAy * jx);
    bodyB.linearVelocityX += bodyB.invMass * jx;
    bodyB.linearVelocityY += bodyB.invMass * jy;
    bodyB.angularVelocity += bodyB.invInertia * (this._rBx * jy - this._rBy * jx);
  }
}
