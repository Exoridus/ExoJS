import type { PointLike } from '@codexo/exojs';

import { applyInverseTransform, applyTransform } from '../math';
import type { PhysicsBody } from '../PhysicsBody';
import type { JointOptions, JointSoftness } from './Joint';
import { Joint } from './Joint';

/** Construction options for a {@link WeldJoint}. */
export interface WeldJointOptions extends JointOptions {
  /** First body. */
  bodyA: PhysicsBody;
  /** Second body. */
  bodyB: PhysicsBody;
  /** World-space anchor the linear constraint acts at. Default: the midpoint of the two bodies. */
  anchor?: Readonly<PointLike>;
  /** Locked relative angle `angleB − angleA`. Default: the current relative angle at creation. */
  referenceAngle?: number;
  /** Soft frequency (Hz) for the position lock; `0` (default) is rigid. */
  linearHertz?: number;
  /** Soft frequency (Hz) for the angle lock; `0` (default) is rigid. */
  angularHertz?: number;
  /** Soft damping ratio (used when a hertz is `> 0`). Default `1`. */
  dampingRatio?: number;
}

/** Reused output sink - physics steps single-threaded, so a shared scratch is safe. */
const scratch: PointLike = { x: 0, y: 0 };

interface SoftFactors {
  biasRate: number;
  massScale: number;
  impulseScale: number;
}

/** Soft-constraint factors at sub-step `h`, or the solver's own rigid factors when `hertz === 0`. */
const computeSoftFactors = (hertz: number, dampingRatio: number, h: number, rigid: JointSoftness, out: SoftFactors): void => {
  if (hertz > 0) {
    const omega = 2 * Math.PI * hertz;
    const a1 = 2 * dampingRatio + h * omega;
    const a2 = h * omega * a1;
    const a3 = 1 / (1 + a2);

    out.biasRate = omega / a1;
    out.massScale = a2 * a3;
    out.impulseScale = a3;
  } else {
    out.biasRate = rigid.biasRate;
    out.massScale = rigid.massScale;
    out.impulseScale = rigid.impulseScale;
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
  private _c0x = 0;
  private _c0y = 0;
  private _angleError0 = 0;
  private _effMassAngle = 0;
  private readonly _linear: SoftFactors = { biasRate: 0, massScale: 1, impulseScale: 0 };
  private readonly _angular: SoftFactors = { biasRate: 0, massScale: 1, impulseScale: 0 };
  private _impulseX = 0;
  private _impulseY = 0;
  private _impulseAngle = 0;

  public constructor(options: WeldJointOptions) {
    super(options.bodyA, options.bodyB, options.collideConnected);

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

  /** @internal */
  public override _prepare(h: number, rigid: JointSoftness): void {
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
    this._c0x = pBx - pAx;
    this._c0y = pBy - pAy;
    this._angleError0 = bodyB.angle - bodyA.angle - this.referenceAngle;

    const kAngle = bodyA.invInertia + bodyB.invInertia;
    this._effMassAngle = kAngle > 0 ? 1 / kAngle : 0;

    computeSoftFactors(this.linearHertz, this.dampingRatio, h, rigid, this._linear);
    computeSoftFactors(this.angularHertz, this.dampingRatio, h, rigid, this._angular);
  }

  /** @internal */
  public override _warmStart(): void {
    if (!this._active) {
      return;
    }

    const bodyA = this.bodyA;
    const bodyB = this.bodyB;

    bodyA.angularVelocity -= bodyA.invInertia * this._impulseAngle;
    bodyB.angularVelocity += bodyB.invInertia * this._impulseAngle;

    // The accumulated impulse goes in on the arms as they stand now, not as
    // `_prepare` measured them; otherwise the torque it returns differs from the
    // one the previous sub-step took out, and the difference is energy.
    this._applyLinearImpulse(
      this._impulseX,
      this._impulseY,
      this._rAx * bodyA._deltaCos - this._rAy * bodyA._deltaSin,
      this._rAx * bodyA._deltaSin + this._rAy * bodyA._deltaCos,
      this._rBx * bodyB._deltaCos - this._rBy * bodyB._deltaSin,
      this._rBx * bodyB._deltaSin + this._rBy * bodyB._deltaCos,
    );
  }

  /** @internal */
  public override _solve(useBias: boolean): void {
    if (!this._active) {
      return;
    }

    const bodyA = this.bodyA;
    const bodyB = this.bodyB;
    const iA = bodyA.invInertia;
    const iB = bodyB.invInertia;

    // Both locks are measured against the geometry as it stands in this
    // sub-step; the frame-start error would re-correct what earlier sub-steps
    // already took out.
    const angleError = this._angleError0 + bodyB._deltaAngle - bodyA._deltaAngle;

    // Angular lock first.
    const cdotAngle = bodyB.angularVelocity - bodyA.angularVelocity;
    const biasAngle = useBias ? this._angular.biasRate * angleError : 0;
    const impulseAngle =
      -this._effMassAngle * this._angular.massScale * (cdotAngle + biasAngle) - this._angular.impulseScale * this._impulseAngle;

    this._impulseAngle += impulseAngle;
    bodyA.angularVelocity -= iA * impulseAngle;
    bodyB.angularVelocity += iB * impulseAngle;

    // Linear (point) lock.
    const rAx = this._rAx * bodyA._deltaCos - this._rAy * bodyA._deltaSin;
    const rAy = this._rAx * bodyA._deltaSin + this._rAy * bodyA._deltaCos;
    const rBx = this._rBx * bodyB._deltaCos - this._rBy * bodyB._deltaSin;
    const rBy = this._rBx * bodyB._deltaSin + this._rBy * bodyB._deltaCos;
    const cx = this._c0x + (bodyB._deltaPosX + rBx - this._rBx) - (bodyA._deltaPosX + rAx - this._rAx);
    const cy = this._c0y + (bodyB._deltaPosY + rBy - this._rBy) - (bodyA._deltaPosY + rAy - this._rAy);

    const mA = bodyA.invMass;
    const mB = bodyB.invMass;
    const k11 = mA + mB + iA * rAy * rAy + iB * rBy * rBy;
    const k12 = -iA * rAx * rAy - iB * rBx * rBy;
    const k22 = mA + mB + iA * rAx * rAx + iB * rBx * rBx;
    const det = k11 * k22 - k12 * k12;
    const invDet = det !== 0 ? 1 / det : 0;

    const cdotX = bodyB.linearVelocityX - bodyB.angularVelocity * rBy - (bodyA.linearVelocityX - bodyA.angularVelocity * rAy);
    const cdotY = bodyB.linearVelocityY + bodyB.angularVelocity * rBx - (bodyA.linearVelocityY + bodyA.angularVelocity * rAx);
    const rhsX = cdotX + (useBias ? this._linear.biasRate * cx : 0);
    const rhsY = cdotY + (useBias ? this._linear.biasRate * cy : 0);
    const solvedX = invDet * (k22 * rhsX - k12 * rhsY);
    const solvedY = invDet * (k11 * rhsY - k12 * rhsX);
    const impulseX = -this._linear.massScale * solvedX - this._linear.impulseScale * this._impulseX;
    const impulseY = -this._linear.massScale * solvedY - this._linear.impulseScale * this._impulseY;

    this._impulseX += impulseX;
    this._impulseY += impulseY;
    this._applyLinearImpulse(impulseX, impulseY, rAx, rAy, rBx, rBy);
  }

  private _applyLinearImpulse(jx: number, jy: number, rAx: number, rAy: number, rBx: number, rBy: number): void {
    const bodyA = this.bodyA;
    const bodyB = this.bodyB;

    bodyA.linearVelocityX -= bodyA.invMass * jx;
    bodyA.linearVelocityY -= bodyA.invMass * jy;
    bodyA.angularVelocity -= bodyA.invInertia * (rAx * jy - rAy * jx);
    bodyB.linearVelocityX += bodyB.invMass * jx;
    bodyB.linearVelocityY += bodyB.invMass * jy;
    bodyB.angularVelocity += bodyB.invInertia * (rBx * jy - rBy * jx);
  }
}
