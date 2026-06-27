import { applyInverseRotation, applyInverseTransform, applyRotation, applyTransform, type Mutable2D } from '../math';
import type { PhysicsBody } from '../PhysicsBody';
import type { VectorLike } from '../types';
import { Joint } from './Joint';

/** Construction options for a {@link WheelJoint}. */
export interface WheelJointOptions {
  /** First body (the chassis). */
  bodyA: PhysicsBody;
  /** Second body (the wheel). */
  bodyB: PhysicsBody;
  /** Shared world-space anchor at creation (the wheel hub). */
  anchor: VectorLike;
  /** Suspension axis in world space at creation (normalised internally). */
  axis: VectorLike;
  /** Suspension spring frequency in Hz (`0` makes the axis rigid). Default `0`. */
  hertz?: number;
  /** Suspension spring damping ratio. Default `1`. */
  dampingRatio?: number;
  /** Enable the rotation motor (drives the wheel's spin). Default `false`. */
  enableMotor?: boolean;
  /** Target relative angular velocity (rad/s) for the motor. Default `0`. */
  motorSpeed?: number;
  /** Maximum motor torque. Default `0`. */
  maxMotorTorque?: number;
}

/** Reused output sink — physics steps single-threaded, so a shared scratch is safe. */
const scratch: Mutable2D = { x: 0, y: 0 };

/**
 * A wheel attached to a chassis: free to **spin** (no rotation lock) and sprung
 * along a **suspension axis** (a soft spring), but locked **laterally** (it
 * cannot slide perpendicular to the axis). Optionally driven by a rotation
 * motor. Used for vehicles. Solved in the sub-step loop, warm-started.
 */
export class WheelJoint extends Joint {
  /** Suspension spring frequency in Hz (`0` = rigid axis). */
  public hertz: number;
  /** Suspension spring damping ratio. */
  public dampingRatio: number;
  /** When `true`, the motor drives the wheel's spin toward {@link motorSpeed}. */
  public enableMotor: boolean;
  /** Target relative angular velocity (rad/s) for the motor. */
  public motorSpeed: number;
  /** Maximum motor torque. */
  public maxMotorTorque: number;

  private readonly _localAnchorAx: number;
  private readonly _localAnchorAy: number;
  private readonly _localAnchorBx: number;
  private readonly _localAnchorBy: number;
  private readonly _localAxisAx: number;
  private readonly _localAxisAy: number;

  private _axisX = 1;
  private _axisY = 0;
  private _perpX = 0;
  private _perpY = 1;
  private _a1 = 0;
  private _a2 = 0;
  private _s1 = 0;
  private _s2 = 0;
  private _perpMass = 0;
  private _axialMass = 0;
  private _angularMass = 0;
  private _springBiasRate = 0;
  private _springMassScale = 1;
  private _springImpulseScale = 0;
  private _cPerp = 0;
  private _translation = 0;
  private _h = 0;
  private _invH = 0;
  private _perpImpulse = 0;
  private _springImpulse = 0;
  private _motorImpulse = 0;

  public constructor(options: WheelJointOptions) {
    super(options.bodyA, options.bodyB);

    applyInverseTransform(options.bodyA.transform, options.anchor.x, options.anchor.y, scratch);
    this._localAnchorAx = scratch.x;
    this._localAnchorAy = scratch.y;
    applyInverseTransform(options.bodyB.transform, options.anchor.x, options.anchor.y, scratch);
    this._localAnchorBx = scratch.x;
    this._localAnchorBy = scratch.y;

    const axisLength = Math.hypot(options.axis.x, options.axis.y) || 1;
    applyInverseRotation(options.bodyA.transform, options.axis.x / axisLength, options.axis.y / axisLength, scratch);
    this._localAxisAx = scratch.x;
    this._localAxisAy = scratch.y;

    this.hertz = options.hertz ?? 0;
    this.dampingRatio = options.dampingRatio ?? 1;
    this.enableMotor = options.enableMotor ?? false;
    this.motorSpeed = options.motorSpeed ?? 0;
    this.maxMotorTorque = options.maxMotorTorque ?? 0;
  }

  public override _prepare(h: number): void {
    const bodyA = this.bodyA;
    const bodyB = this.bodyB;

    this._active = this.enabled && !bodyA.isSleeping && !bodyB.isSleeping && (bodyA.invMass > 0 || bodyB.invMass > 0);

    if (!this._active) {
      return;
    }

    applyRotation(bodyA.transform, this._localAxisAx, this._localAxisAy, scratch);
    const axisX = scratch.x;
    const axisY = scratch.y;
    const perpX = -axisY;
    const perpY = axisX;

    this._axisX = axisX;
    this._axisY = axisY;
    this._perpX = perpX;
    this._perpY = perpY;

    applyTransform(bodyA.transform, this._localAnchorAx, this._localAnchorAy, scratch);
    const pAx = scratch.x;
    const pAy = scratch.y;
    applyTransform(bodyB.transform, this._localAnchorBx, this._localAnchorBy, scratch);
    const pBx = scratch.x;
    const pBy = scratch.y;

    const rAx = pAx - bodyA.worldCenterOfMassX;
    const rAy = pAy - bodyA.worldCenterOfMassY;
    const rBx = pBx - bodyB.worldCenterOfMassX;
    const rBy = pBy - bodyB.worldCenterOfMassY;
    const dx = pBx - pAx;
    const dy = pBy - pAy;

    this._a1 = (dx + rAx) * axisY - (dy + rAy) * axisX;
    this._a2 = rBx * axisY - rBy * axisX;
    this._s1 = (dx + rAx) * perpY - (dy + rAy) * perpX;
    this._s2 = rBx * perpY - rBy * perpX;

    const mA = bodyA.invMass;
    const mB = bodyB.invMass;
    const iA = bodyA.invInertia;
    const iB = bodyB.invInertia;

    const kPerp = mA + mB + iA * this._s1 * this._s1 + iB * this._s2 * this._s2;
    this._perpMass = kPerp > 0 ? 1 / kPerp : 0;
    const kAxial = mA + mB + iA * this._a1 * this._a1 + iB * this._a2 * this._a2;
    this._axialMass = kAxial > 0 ? 1 / kAxial : 0;
    this._angularMass = iA + iB > 0 ? 1 / (iA + iB) : 0;

    this._cPerp = dx * perpX + dy * perpY;
    this._translation = dx * axisX + dy * axisY;
    this._h = h;
    this._invH = 1 / h;

    if (this.hertz > 0) {
      const omega = 2 * Math.PI * this.hertz;
      const a1 = 2 * this.dampingRatio + h * omega;
      const a2 = h * omega * a1;
      const a3 = 1 / (1 + a2);

      this._springBiasRate = omega / a1;
      this._springMassScale = a2 * a3;
      this._springImpulseScale = a3;
    } else {
      this._springBiasRate = 0.2 / h;
      this._springMassScale = 1;
      this._springImpulseScale = 0;
    }

    if (!this.enableMotor) {
      this._motorImpulse = 0;
    }
  }

  public override _warmStart(): void {
    if (!this._active) {
      return;
    }

    const bodyA = this.bodyA;
    const bodyB = this.bodyB;

    // Rotation motor (angular).
    bodyA.angularVelocity -= bodyA.invInertia * this._motorImpulse;
    bodyB.angularVelocity += bodyB.invInertia * this._motorImpulse;

    this._applyAxial(this._springImpulse);
    this._applyPerp(this._perpImpulse);
  }

  public override _solve(useBias: boolean): void {
    if (!this._active) {
      return;
    }

    const bodyA = this.bodyA;
    const bodyB = this.bodyB;

    // Rotation motor — drives the wheel's spin; rotation is otherwise free.
    if (this.enableMotor) {
      const cdot = bodyB.angularVelocity - bodyA.angularVelocity - this.motorSpeed;
      const max = this.maxMotorTorque * this._h;
      const old = this._motorImpulse;

      this._motorImpulse = Math.min(max, Math.max(-max, old - this._angularMass * cdot));

      const applied = this._motorImpulse - old;
      bodyA.angularVelocity -= bodyA.invInertia * applied;
      bodyB.angularVelocity += bodyB.invInertia * applied;
    }

    // Suspension spring along the axis (soft).
    const cdotAxis = this._axisVelocity();
    const springImpulse =
      -this._axialMass * this._springMassScale * (cdotAxis + this._springBiasRate * this._translation) - this._springImpulseScale * this._springImpulse;

    this._springImpulse += springImpulse;
    this._applyAxial(springImpulse);

    // Lateral lock (perpendicular, rigid).
    const cdotPerp = this._perpVelocity();
    const perpImpulse = -this._perpMass * (cdotPerp + (useBias ? 0.2 * this._invH * this._cPerp : 0));

    this._perpImpulse += perpImpulse;
    this._applyPerp(perpImpulse);
  }

  private _axisVelocity(): number {
    const bodyA = this.bodyA;
    const bodyB = this.bodyB;

    return (
      this._axisX * (bodyB.linearVelocityX - bodyA.linearVelocityX) +
      this._axisY * (bodyB.linearVelocityY - bodyA.linearVelocityY) +
      this._a2 * bodyB.angularVelocity -
      this._a1 * bodyA.angularVelocity
    );
  }

  private _perpVelocity(): number {
    const bodyA = this.bodyA;
    const bodyB = this.bodyB;

    return (
      this._perpX * (bodyB.linearVelocityX - bodyA.linearVelocityX) +
      this._perpY * (bodyB.linearVelocityY - bodyA.linearVelocityY) +
      this._s2 * bodyB.angularVelocity -
      this._s1 * bodyA.angularVelocity
    );
  }

  private _applyAxial(impulse: number): void {
    const bodyA = this.bodyA;
    const bodyB = this.bodyB;
    const px = impulse * this._axisX;
    const py = impulse * this._axisY;

    bodyA.linearVelocityX -= bodyA.invMass * px;
    bodyA.linearVelocityY -= bodyA.invMass * py;
    bodyA.angularVelocity -= bodyA.invInertia * impulse * this._a1;
    bodyB.linearVelocityX += bodyB.invMass * px;
    bodyB.linearVelocityY += bodyB.invMass * py;
    bodyB.angularVelocity += bodyB.invInertia * impulse * this._a2;
  }

  private _applyPerp(impulse: number): void {
    const bodyA = this.bodyA;
    const bodyB = this.bodyB;
    const px = impulse * this._perpX;
    const py = impulse * this._perpY;

    bodyA.linearVelocityX -= bodyA.invMass * px;
    bodyA.linearVelocityY -= bodyA.invMass * py;
    bodyA.angularVelocity -= bodyA.invInertia * impulse * this._s1;
    bodyB.linearVelocityX += bodyB.invMass * px;
    bodyB.linearVelocityY += bodyB.invMass * py;
    bodyB.angularVelocity += bodyB.invInertia * impulse * this._s2;
  }
}
