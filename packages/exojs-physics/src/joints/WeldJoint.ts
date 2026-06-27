import { applyInverseTransform, applyTransform, type Mutable2D } from '../math';
import type { PhysicsBody } from '../PhysicsBody';
import type { VectorLike } from '../types';
import { Joint } from './Joint';

/** Construction options for a {@link WeldJoint}. */
export interface WeldJointOptions {
  /** First body. */
  bodyA: PhysicsBody;
  /** Second body. */
  bodyB: PhysicsBody;
  /** World-space anchor the linear constraint acts at. Default: the midpoint of the two bodies. */
  anchor?: VectorLike;
  /** Locked relative angle `angleB − angleA`. Default: the current relative angle at creation. */
  referenceAngle?: number;
  /** Soft frequency (Hz) for the position lock; `0` (default) is rigid. */
  linearHertz?: number;
  /** Soft frequency (Hz) for the angle lock; `0` (default) is rigid. */
  angularHertz?: number;
  /** Soft damping ratio (used when a hertz is `> 0`). Default `1`. */
  dampingRatio?: number;
}

/** Reused output sink — physics steps single-threaded, so a shared scratch is safe. */
const scratch: Mutable2D = { x: 0, y: 0 };

interface SoftFactors {
  biasRate: number;
  massScale: number;
  impulseScale: number;
}

/** Box2D-v3 soft-constraint factors at sub-step `h`, or rigid Baumgarte when `hertz === 0`. */
const computeSoftFactors = (hertz: number, dampingRatio: number, h: number, out: SoftFactors): void => {
  if (hertz > 0) {
    const omega = 2 * Math.PI * hertz;
    const a1 = 2 * dampingRatio + h * omega;
    const a2 = h * omega * a1;
    const a3 = 1 / (1 + a2);

    out.biasRate = omega / a1;
    out.massScale = a2 * a3;
    out.impulseScale = a3;
  } else {
    out.biasRate = 0.2 / h;
    out.massScale = 1;
    out.impulseScale = 0;
  }
};

/**
 * Rigidly fixes the relative position and orientation of two bodies (they move
 * as one rigid body). A 2-DOF point constraint (like {@link RevoluteJoint}) plus
 * a 1-DOF angular constraint, solved in the sub-step loop. Both locks default to
 * rigid; set `linearHertz`/`angularHertz` for a springy weld.
 */
export class WeldJoint extends Joint {
  /** Locked relative angle `angleB − angleA`. */
  public referenceAngle: number;
  /** Soft frequency for the position lock (`0` = rigid). */
  public linearHertz: number;
  /** Soft frequency for the angle lock (`0` = rigid). */
  public angularHertz: number;
  /** Soft damping ratio. */
  public dampingRatio: number;

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
  private _angleError = 0;
  private _effMassAngle = 0;
  private readonly _linear: SoftFactors = { biasRate: 0, massScale: 1, impulseScale: 0 };
  private readonly _angular: SoftFactors = { biasRate: 0, massScale: 1, impulseScale: 0 };
  private _impulseX = 0;
  private _impulseY = 0;
  private _impulseAngle = 0;

  public constructor(options: WeldJointOptions) {
    super(options.bodyA, options.bodyB);

    const ax = options.anchor?.x ?? (options.bodyA.x + options.bodyB.x) / 2;
    const ay = options.anchor?.y ?? (options.bodyA.y + options.bodyB.y) / 2;

    applyInverseTransform(options.bodyA.transform, ax, ay, scratch);
    this._localAnchorAx = scratch.x;
    this._localAnchorAy = scratch.y;
    applyInverseTransform(options.bodyB.transform, ax, ay, scratch);
    this._localAnchorBx = scratch.x;
    this._localAnchorBy = scratch.y;

    this.referenceAngle = options.referenceAngle ?? options.bodyB.angle - options.bodyA.angle;
    this.linearHertz = options.linearHertz ?? 0;
    this.angularHertz = options.angularHertz ?? 0;
    this.dampingRatio = options.dampingRatio ?? 1;
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
    this._cx = pBx - pAx;
    this._cy = pBy - pAy;

    const mA = bodyA.invMass;
    const mB = bodyB.invMass;
    const iA = bodyA.invInertia;
    const iB = bodyB.invInertia;

    const k11 = mA + mB + iA * this._rAy * this._rAy + iB * this._rBy * this._rBy;
    const k12 = -iA * this._rAx * this._rAy - iB * this._rBx * this._rBy;
    const k22 = mA + mB + iA * this._rAx * this._rAx + iB * this._rBx * this._rBx;
    const det = k11 * k22 - k12 * k12;
    const invDet = det !== 0 ? 1 / det : 0;

    this._invK11 = invDet * k22;
    this._invK12 = -invDet * k12;
    this._invK22 = invDet * k11;

    this._angleError = bodyB.angle - bodyA.angle - this.referenceAngle;
    const kAngle = iA + iB;
    this._effMassAngle = kAngle > 0 ? 1 / kAngle : 0;

    computeSoftFactors(this.linearHertz, this.dampingRatio, h, this._linear);
    computeSoftFactors(this.angularHertz, this.dampingRatio, h, this._angular);
  }

  public override _warmStart(): void {
    if (!this._active) {
      return;
    }

    const bodyA = this.bodyA;
    const bodyB = this.bodyB;

    bodyA.angularVelocity -= bodyA.invInertia * this._impulseAngle;
    bodyB.angularVelocity += bodyB.invInertia * this._impulseAngle;
    this._applyLinearImpulse(this._impulseX, this._impulseY);
  }

  public override _solve(useBias: boolean): void {
    if (!this._active) {
      return;
    }

    const bodyA = this.bodyA;
    const bodyB = this.bodyB;

    // Angular lock first.
    const cdotAngle = bodyB.angularVelocity - bodyA.angularVelocity;
    const biasAngle = useBias ? this._angular.biasRate * this._angleError : 0;
    const impulseAngle = -this._effMassAngle * this._angular.massScale * (cdotAngle + biasAngle) - this._angular.impulseScale * this._impulseAngle;

    this._impulseAngle += impulseAngle;
    bodyA.angularVelocity -= bodyA.invInertia * impulseAngle;
    bodyB.angularVelocity += bodyB.invInertia * impulseAngle;

    // Linear (point) lock.
    const cdotX = bodyB.linearVelocityX - bodyB.angularVelocity * this._rBy - (bodyA.linearVelocityX - bodyA.angularVelocity * this._rAy);
    const cdotY = bodyB.linearVelocityY + bodyB.angularVelocity * this._rBx - (bodyA.linearVelocityY + bodyA.angularVelocity * this._rAx);
    const rhsX = cdotX + (useBias ? this._linear.biasRate * this._cx : 0);
    const rhsY = cdotY + (useBias ? this._linear.biasRate * this._cy : 0);
    const solvedX = this._invK11 * rhsX + this._invK12 * rhsY;
    const solvedY = this._invK12 * rhsX + this._invK22 * rhsY;
    const impulseX = -this._linear.massScale * solvedX - this._linear.impulseScale * this._impulseX;
    const impulseY = -this._linear.massScale * solvedY - this._linear.impulseScale * this._impulseY;

    this._impulseX += impulseX;
    this._impulseY += impulseY;
    this._applyLinearImpulse(impulseX, impulseY);
  }

  private _applyLinearImpulse(jx: number, jy: number): void {
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
