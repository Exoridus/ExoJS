import type { PointLike } from '@codexo/exojs';

import { applyInverseTransform, applyTransform } from '../math';
import type { PhysicsBody } from '../PhysicsBody';
import type { JointOptions, JointSoftness } from './Joint';
import { Joint } from './Joint';

/** Construction options for a {@link RevoluteJoint}. */
export interface RevoluteJointOptions extends JointOptions {
  /** First body (often a static anchor). */
  bodyA: PhysicsBody;
  /** Second body. */
  bodyB: PhysicsBody;
  /** Shared world-space pivot point at creation. The two bodies are pinned here and may rotate freely about it. */
  anchor: Readonly<PointLike>;
  /** Soft-spring frequency in Hz; `0` (default) makes it a rigid pin. */
  hertz?: number;
  /** Soft-spring damping ratio (used when `hertz > 0`). Default `1`. */
  dampingRatio?: number;
  /** Enable the angular motor (drives `ωB − ωA` toward {@link motorSpeed}). Default `false`. */
  enableMotor?: boolean;
  /** Target relative angular velocity in rad/s when the motor is enabled. Default `0`. */
  motorSpeed?: number;
  /** Maximum motor torque - clamps the per-step motor impulse. Default `0`. */
  maxMotorTorque?: number;
  /** Enable the angle limit (keeps the relative angle in `[lowerAngle, upperAngle]`). Default `false`. */
  enableLimit?: boolean;
  /** Lower relative-angle limit in radians (relative to the angle at creation). Default `0`. */
  lowerAngle?: number;
  /** Upper relative-angle limit in radians. Default `0`. */
  upperAngle?: number;
}

/** Reused output sink - physics steps single-threaded, so a shared scratch is safe. */
const scratch: PointLike = { x: 0, y: 0 };

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
  private _c0x = 0;
  private _c0y = 0;
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
    super(options.bodyA, options.bodyB, options.collideConnected);

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

    // Frame-start arms and anchor error. Both are the BASE the sub-step solve
    // advances from; neither is used directly as the constraint's current state.
    this._rAx = pAx - bodyA.worldCenterOfMassX;
    this._rAy = pAy - bodyA.worldCenterOfMassY;
    this._rBx = pBx - bodyB.worldCenterOfMassX;
    this._rBy = pBy - bodyB.worldCenterOfMassY;
    this._c0x = pBx - pAx;
    this._c0y = pBy - pAy;

    // Angular (motor/limit) effective mass + sub-step rate.
    const iA = bodyA.invInertia;
    const iB = bodyB.invInertia;

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
      // The solver's own softness, not a raw Baumgarte term. `0.2 / h` turns
      // the whole position error into a bias velocity every sub-step and
      // relaxes none of the impulse behind it; a hanging chain of seven or more
      // links then gains speed without bound along its own axis.
      this._biasRate = rigid.biasRate;
      this._massScale = rigid.massScale;
      this._impulseScale = rigid.impulseScale;
    }
  }

  /** @internal */
  public override _warmStart(): void {
    if (!this._active) {
      return;
    }

    // Angular warm-start: motor + limits (lower pushes +, upper pushes −).
    const axial = this._motorImpulse + this._lowerImpulse - this._upperImpulse;
    this.bodyA.angularVelocity -= this.bodyA.invInertia * axial;
    this.bodyB.angularVelocity += this.bodyB.invInertia * axial;

    this._applyImpulse(this._impulseX, this._impulseY, this._rAx, this._rAy, this._rBx, this._rBy);
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

    /*
     * The point constraint is solved against the geometry as it stands NOW, not
     * as it stood at frame start.
     *
     * Each sub-step moves the bodies, so the arms have rotated and the anchors
     * have separated by a different amount than `_prepare` measured. Applying
     * the frame-start error as the bias in every sub-step re-corrects an error
     * the earlier sub-steps already took out - and with a rigid bias rate of
     * `0.2 / h` that over-correction is an impulse the chain has no way to
     * dissipate. In a serial chain it compounds link by link: a hanging chain
     * of seven or more equal links left to itself gained velocity without
     * bound, purely along its own axis, until it diverged. The contact solver
     * has always advanced its separation this way; the joint now does too.
     */
    const rotAx = this._rAx * bodyA._deltaCos - this._rAy * bodyA._deltaSin;
    const rotAy = this._rAx * bodyA._deltaSin + this._rAy * bodyA._deltaCos;
    const rotBx = this._rBx * bodyB._deltaCos - this._rBy * bodyB._deltaSin;
    const rotBy = this._rBx * bodyB._deltaSin + this._rBy * bodyB._deltaCos;

    // Anchor displacement since frame start: linear delta plus the shift the
    // body's own rotation gave the arm.
    const cx = this._c0x + (bodyB._deltaPosX + rotBx - this._rBx) - (bodyA._deltaPosX + rotAx - this._rAx);
    const cy = this._c0y + (bodyB._deltaPosY + rotBy - this._rBy) - (bodyA._deltaPosY + rotAy - this._rAy);

    const mA = bodyA.invMass;
    const mB = bodyB.invMass;

    // K follows the live arms for the same reason the bias does: an effective
    // mass built from the frame-start geometry solves a different constraint
    // than the one the bias is now asking for.
    const k11 = mA + mB + iA * rotAy * rotAy + iB * rotBy * rotBy;
    const k12 = -iA * rotAx * rotAy - iB * rotBx * rotBy;
    const k22 = mA + mB + iA * rotAx * rotAx + iB * rotBx * rotBx;
    const det = k11 * k22 - k12 * k12;
    const invDet = det !== 0 ? 1 / det : 0;

    // Relative velocity of the anchors.
    const cdotX = bodyB.linearVelocityX - bodyB.angularVelocity * rotBy - (bodyA.linearVelocityX - bodyA.angularVelocity * rotAy);
    const cdotY = bodyB.linearVelocityY + bodyB.angularVelocity * rotBx - (bodyA.linearVelocityY + bodyA.angularVelocity * rotAx);

    const rhsX = cdotX + (useBias ? this._biasRate * cx : 0);
    const rhsY = cdotY + (useBias ? this._biasRate * cy : 0);

    // Solve K·λ = −rhs, then apply the soft mass/impulse scaling.
    const solvedX = invDet * (k22 * rhsX - k12 * rhsY);
    const solvedY = invDet * (k11 * rhsY - k12 * rhsX);
    const impulseX = -this._massScale * solvedX - this._impulseScale * this._impulseX;
    const impulseY = -this._massScale * solvedY - this._impulseScale * this._impulseY;

    this._impulseX += impulseX;
    this._impulseY += impulseY;
    this._applyImpulse(impulseX, impulseY, rotAx, rotAy, rotBx, rotBy);
  }

  private _applyImpulse(jx: number, jy: number, rAx: number, rAy: number, rBx: number, rBy: number): void {
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
