import { applyInverseRotation, applyInverseTransform, applyRotation, applyTransform, type Mutable2D } from '../math';
import type { PhysicsBody } from '../PhysicsBody';
import type { VectorLike } from '../types';
import { Joint } from './Joint';

/** Construction options for a {@link PrismaticJoint}. */
export interface PrismaticJointOptions {
  /** First body (often a static rail anchor). */
  bodyA: PhysicsBody;
  /** Second body (the slider). */
  bodyB: PhysicsBody;
  /** Shared world-space anchor at creation. */
  anchor: VectorLike;
  /** Slide axis in world space at creation (normalised internally). The body may only translate along this axis. */
  axis: VectorLike;
  /** Enable the linear motor (drives translation along the axis toward {@link motorSpeed}). Default `false`. */
  enableMotor?: boolean;
  /** Target translation speed along the axis (px/s). Default `0`. */
  motorSpeed?: number;
  /** Maximum motor force — clamps the per-step motor impulse. Default `0`. */
  maxMotorForce?: number;
  /** Enable the translation limit (keeps the axis translation in `[lowerTranslation, upperTranslation]`). Default `false`. */
  enableLimit?: boolean;
  /** Lower translation limit along the axis (relative to the creation position). Default `0`. */
  lowerTranslation?: number;
  /** Upper translation limit along the axis. Default `0`. */
  upperTranslation?: number;
}

/** Reused output sink — physics steps single-threaded, so a shared scratch is safe. */
const scratch: Mutable2D = { x: 0, y: 0 };

/**
 * Constrains a body to **slide along a single axis** relative to another: the
 * perpendicular translation and the relative rotation are locked (a 2×2 block);
 * only translation along the axis is free, optionally driven by a motor and/or
 * bounded by a translation limit. Solved in the sub-step loop, warm-started.
 */
export class PrismaticJoint extends Joint {
  /** When `true`, the motor drives the axis translation toward {@link motorSpeed}. */
  public enableMotor: boolean;
  /** Target translation speed along the axis (px/s). */
  public motorSpeed: number;
  /** Maximum motor force. */
  public maxMotorForce: number;
  /** When `true`, the axis translation is constrained to `[lowerTranslation, upperTranslation]`. */
  public enableLimit: boolean;
  /** Lower translation limit along the axis. */
  public lowerTranslation: number;
  /** Upper translation limit along the axis. */
  public upperTranslation: number;

  private readonly _localAnchorAx: number;
  private readonly _localAnchorAy: number;
  private readonly _localAnchorBx: number;
  private readonly _localAnchorBy: number;
  private readonly _localAxisAx: number;
  private readonly _localAxisAy: number;
  private readonly _referenceAngle: number;

  private _axisX = 1;
  private _axisY = 0;
  private _perpX = 0;
  private _perpY = 1;
  private _a1 = 0;
  private _a2 = 0;
  private _s1 = 0;
  private _s2 = 0;
  private _k11 = 0;
  private _k12 = 0;
  private _k22 = 0;
  private _cPerp = 0;
  private _cAngle = 0;
  private _translation = 0;
  private _axialMass = 0;
  private _h = 0;
  private _invH = 0;
  private _perpImpulse = 0;
  private _angularImpulse = 0;
  private _motorImpulse = 0;
  private _lowerImpulse = 0;
  private _upperImpulse = 0;

  public constructor(options: PrismaticJointOptions) {
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

    this._referenceAngle = options.bodyB.angle - options.bodyA.angle;
    this.enableMotor = options.enableMotor ?? false;
    this.motorSpeed = options.motorSpeed ?? 0;
    this.maxMotorForce = options.maxMotorForce ?? 0;
    this.enableLimit = options.enableLimit ?? false;
    this.lowerTranslation = options.lowerTranslation ?? 0;
    this.upperTranslation = options.upperTranslation ?? 0;
  }

  public override _prepare(h: number): void {
    const bodyA = this.bodyA;
    const bodyB = this.bodyB;

    this._active = this.enabled && !bodyA.isSleeping && !bodyB.isSleeping && (bodyA.invMass > 0 || bodyB.invMass > 0);

    if (!this._active) {
      return;
    }

    // World axis + perpendicular (axis is local to body A).
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

    // Jacobian cross terms for the axis (motor/limit) and the perpendicular (lock).
    this._a1 = (dx + rAx) * axisY - (dy + rAy) * axisX;
    this._a2 = rBx * axisY - rBy * axisX;
    this._s1 = (dx + rAx) * perpY - (dy + rAy) * perpX;
    this._s2 = rBx * perpY - rBy * perpX;

    const mA = bodyA.invMass;
    const mB = bodyB.invMass;
    const iA = bodyA.invInertia;
    const iB = bodyB.invInertia;

    const kAxial = mA + mB + iA * this._a1 * this._a1 + iB * this._a2 * this._a2;
    this._axialMass = kAxial > 0 ? 1 / kAxial : 0;

    // Perpendicular + angular 2×2 block.
    this._k11 = mA + mB + iA * this._s1 * this._s1 + iB * this._s2 * this._s2;
    this._k12 = iA * this._s1 + iB * this._s2;
    this._k22 = iA + iB;

    if (this._k22 === 0) {
      this._k22 = 1; // both bodies rotation-locked — keep the block invertible
    }

    this._cPerp = dx * perpX + dy * perpY;
    this._cAngle = bodyB.angle - bodyA.angle - this._referenceAngle;
    this._translation = dx * axisX + dy * axisY;
    this._h = h;
    this._invH = 1 / h;

    if (!this.enableMotor) {
      this._motorImpulse = 0;
    }

    if (!this.enableLimit) {
      this._lowerImpulse = 0;
      this._upperImpulse = 0;
    }
  }

  public override _warmStart(): void {
    if (!this._active) {
      return;
    }

    const axial = this._motorImpulse + this._lowerImpulse - this._upperImpulse;
    this._applyBlock(this._perpImpulse, this._angularImpulse);
    this._applyAxial(axial);
  }

  public override _solve(useBias: boolean): void {
    if (!this._active) {
      return;
    }

    const bodyA = this.bodyA;
    const bodyB = this.bodyB;

    // Motor along the axis.
    if (this.enableMotor) {
      const cdot = this._axisVelocity() - this.motorSpeed;
      const max = this.maxMotorForce * this._h;
      const old = this._motorImpulse;

      this._motorImpulse = Math.min(max, Math.max(-max, old - this._axialMass * cdot));
      this._applyAxial(this._motorImpulse - old);
    }

    // Translation limits along the axis.
    if (this.enableLimit) {
      // Lower limit (translation ≥ lowerTranslation): positive impulse pushes along +axis.
      const cLower = this._translation - this.lowerTranslation;
      let biasLower = 0;

      if (cLower > 0) {
        biasLower = cLower * this._invH;
      } else if (useBias) {
        biasLower = 0.2 * this._invH * cLower;
      }

      const oldLower = this._lowerImpulse;
      this._lowerImpulse = Math.max(0, oldLower - this._axialMass * (this._axisVelocity() + biasLower));
      this._applyAxial(this._lowerImpulse - oldLower);

      // Upper limit (translation ≤ upperTranslation): impulse pushes along −axis.
      const cUpper = this.upperTranslation - this._translation;
      let biasUpper = 0;

      if (cUpper > 0) {
        biasUpper = cUpper * this._invH;
      } else if (useBias) {
        biasUpper = 0.2 * this._invH * cUpper;
      }

      const oldUpper = this._upperImpulse;
      this._upperImpulse = Math.max(0, oldUpper - this._axialMass * (-this._axisVelocity() + biasUpper));
      this._applyAxial(-(this._upperImpulse - oldUpper));
    }

    // Perpendicular + angular lock (2×2 block).
    const cdotPerp = this._perpVelocity();
    const cdotAngle = bodyB.angularVelocity - bodyA.angularVelocity;
    const rhs1 = -(cdotPerp + (useBias ? 0.2 * this._invH * this._cPerp : 0));
    const rhs2 = -(cdotAngle + (useBias ? 0.2 * this._invH * this._cAngle : 0));
    const det = this._k11 * this._k22 - this._k12 * this._k12;
    const invDet = det !== 0 ? 1 / det : 0;
    const dPerp = invDet * (this._k22 * rhs1 - this._k12 * rhs2);
    const dAngle = invDet * (-this._k12 * rhs1 + this._k11 * rhs2);

    this._perpImpulse += dPerp;
    this._angularImpulse += dAngle;
    this._applyBlock(dPerp, dAngle);
  }

  /** Relative velocity projected onto the axis (plus the rotation cross terms). */
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

  /** Relative velocity projected onto the perpendicular (plus the rotation cross terms). */
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

  private _applyBlock(perpImpulse: number, angularImpulse: number): void {
    const bodyA = this.bodyA;
    const bodyB = this.bodyB;
    const px = perpImpulse * this._perpX;
    const py = perpImpulse * this._perpY;

    bodyA.linearVelocityX -= bodyA.invMass * px;
    bodyA.linearVelocityY -= bodyA.invMass * py;
    bodyA.angularVelocity -= bodyA.invInertia * (perpImpulse * this._s1 + angularImpulse);
    bodyB.linearVelocityX += bodyB.invMass * px;
    bodyB.linearVelocityY += bodyB.invMass * py;
    bodyB.angularVelocity += bodyB.invInertia * (perpImpulse * this._s2 + angularImpulse);
  }
}
