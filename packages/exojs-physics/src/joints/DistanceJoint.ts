import { applyInverseTransform, applyTransform, type Mutable2D } from '../math';
import type { PhysicsBody } from '../PhysicsBody';
import type { VectorLike } from '../types';
import { Joint } from './Joint';

/** Construction options for a {@link DistanceJoint}. */
export interface DistanceJointOptions {
  /** First body (often a static anchor). */
  bodyA: PhysicsBody;
  /** Second body. */
  bodyB: PhysicsBody;
  /** World-space anchor on body A at creation. Default: body A's position. */
  anchorA?: VectorLike;
  /** World-space anchor on body B at creation. Default: body B's position. */
  anchorB?: VectorLike;
  /** Target distance between the anchors. Default: their initial distance. */
  length?: number;
  /** Soft-spring frequency in Hz; `0` (default) makes it a rigid constraint. */
  hertz?: number;
  /** Soft-spring damping ratio (used when `hertz > 0`). Default `1`. */
  dampingRatio?: number;
  /**
   * Minimum allowed distance. Specifying `minLength` and/or `maxLength` turns the
   * joint into a **rope/limit** (distance kept within `[minLength, maxLength]`,
   * slack between, rigid limits). Otherwise the joint is a rigid/soft **equality**
   * at `length`. Defaults to `0` in limit mode.
   */
  minLength?: number;
  /** Maximum allowed distance (the rope length). See {@link minLength}. Defaults to `Infinity` in limit mode. */
  maxLength?: number;
}

/** Reused output sink — physics steps single-threaded, so a shared scratch is safe. */
const scratch: Mutable2D = { x: 0, y: 0 };

/**
 * Holds the anchor points on two bodies at a target {@link length} along their
 * connecting axis. With `hertz === 0` it is rigid; with `hertz > 0` it behaves
 * as a damped spring. Solved as a soft constraint in the sub-step loop, warm-
 * started across frames.
 */
export class DistanceJoint extends Joint {
  /** Target distance between the anchors. */
  public length: number;
  /** Soft-spring frequency in Hz (`0` = rigid). */
  public hertz: number;
  /** Soft-spring damping ratio. */
  public dampingRatio: number;
  /** Minimum allowed distance (rope/limit mode). */
  public minLength: number;
  /** Maximum allowed distance (rope/limit mode). */
  public maxLength: number;

  private readonly _limited: boolean;
  private _minImpulse = -Infinity;
  private _maxImpulse = Infinity;
  private readonly _localAnchorAx: number;
  private readonly _localAnchorAy: number;
  private readonly _localAnchorBx: number;
  private readonly _localAnchorBy: number;

  private _rAx = 0;
  private _rAy = 0;
  private _rBx = 0;
  private _rBy = 0;
  private _nx = 0;
  private _ny = 0;
  private _separation = 0;
  private _effMass = 0;
  private _biasRate = 0;
  private _massScale = 1;
  private _impulseScale = 0;
  private _impulse = 0;

  public constructor(options: DistanceJointOptions) {
    super(options.bodyA, options.bodyB);

    const ax = options.anchorA?.x ?? options.bodyA.x;
    const ay = options.anchorA?.y ?? options.bodyA.y;
    const bx = options.anchorB?.x ?? options.bodyB.x;
    const by = options.anchorB?.y ?? options.bodyB.y;

    applyInverseTransform(options.bodyA.transform, ax, ay, scratch);
    this._localAnchorAx = scratch.x;
    this._localAnchorAy = scratch.y;
    applyInverseTransform(options.bodyB.transform, bx, by, scratch);
    this._localAnchorBx = scratch.x;
    this._localAnchorBy = scratch.y;

    this.length = options.length ?? Math.hypot(bx - ax, by - ay);
    this.hertz = options.hertz ?? 0;
    this.dampingRatio = options.dampingRatio ?? 1;
    this._limited = options.minLength !== undefined || options.maxLength !== undefined;
    this.minLength = options.minLength ?? (this._limited ? 0 : this.length);
    this.maxLength = options.maxLength ?? (this._limited ? Infinity : this.length);
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

    let dx = pBx - pAx;
    let dy = pBy - pAy;
    const len = Math.hypot(dx, dy);

    if (len > 1e-9) {
      dx /= len;
      dy /= len;
    } else {
      dx = 1;
      dy = 0;
    }

    this._nx = dx;
    this._ny = dy;

    const crA = this._rAx * dy - this._rAy * dx;
    const crB = this._rBx * dy - this._rBy * dx;
    const k = bodyA.invMass + bodyB.invMass + bodyA.invInertia * crA * crA + bodyB.invInertia * crB * crB;
    this._effMass = k > 0 ? 1 / k : 0;

    if (this._limited) {
      // Rope/limit: solve only the violated bound; slack between min and max.
      if (len > this.maxLength) {
        this._separation = len - this.maxLength;
        this._minImpulse = -Infinity; // pull together only (tension)
        this._maxImpulse = 0;
      } else if (len < this.minLength) {
        this._separation = len - this.minLength;
        this._minImpulse = 0; // push apart only (compression)
        this._maxImpulse = Infinity;
      } else {
        this._active = false; // slack — nothing to solve this frame
        this._impulse = 0;

        return;
      }
    } else {
      this._separation = len - this.length;
      this._minImpulse = -Infinity;
      this._maxImpulse = Infinity;
    }

    // Soft spring only for the equality joint; rope limits are rigid.
    if (this.hertz > 0 && !this._limited) {
      // Box2D-v3 soft factors from a damped spring at the sub-step `h`.
      const omega = 2 * Math.PI * this.hertz;
      const a1 = 2 * this.dampingRatio + h * omega;
      const a2 = h * omega * a1;
      const a3 = 1 / (1 + a2);

      this._biasRate = omega / a1;
      this._massScale = a2 * a3;
      this._impulseScale = a3;
    } else {
      // Rigid: full mass, Baumgarte position bias, no impulse decay.
      this._biasRate = 0.2 / h;
      this._massScale = 1;
      this._impulseScale = 0;
    }
  }

  public override _warmStart(): void {
    if (this._active) {
      this._applyAxisImpulse(this._impulse);
    }
  }

  public override _solve(useBias: boolean): void {
    if (!this._active) {
      return;
    }

    const bodyA = this.bodyA;
    const bodyB = this.bodyB;

    // Relative velocity of the anchors projected onto the axis.
    const vax = bodyA.linearVelocityX - bodyA.angularVelocity * this._rAy;
    const vay = bodyA.linearVelocityY + bodyA.angularVelocity * this._rAx;
    const vbx = bodyB.linearVelocityX - bodyB.angularVelocity * this._rBy;
    const vby = bodyB.linearVelocityY + bodyB.angularVelocity * this._rBx;
    const cdot = (vbx - vax) * this._nx + (vby - vay) * this._ny;

    const bias = useBias ? this._biasRate * this._separation : 0;
    const raw = -this._effMass * this._massScale * (cdot + bias) - this._impulseScale * this._impulse;
    // Clamp the accumulated impulse to the limit's sign range (±Infinity = equality, no clamp).
    const clamped = Math.min(this._maxImpulse, Math.max(this._minImpulse, this._impulse + raw));
    const applied = clamped - this._impulse;

    this._impulse = clamped;
    this._applyAxisImpulse(applied);
  }

  private _applyAxisImpulse(impulse: number): void {
    const jx = impulse * this._nx;
    const jy = impulse * this._ny;
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
