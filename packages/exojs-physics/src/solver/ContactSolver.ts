import type { ContactRecord } from '../ContactGraph';
import type { PhysicsBody } from '../PhysicsBody';

/** Position-correction factor (fraction of excess penetration removed per iteration by the NGS pass). */
const baumgarte = 0.15;
/** Penetration allowance (px) left uncorrected to avoid jitter. */
const slop = 0.25;
/** Relative normal speed (px/s) below which a contact is treated as resting (no restitution). */
const restitutionThreshold = 1;
/** Max position correction (px) per iteration, clamping the NGS pass against blow-up on deep penetration. */
const maxCorrection = 4;
/** Reject the 2-point block solve when the contact matrix is worse-conditioned than this (fall back to sequential). */
const maxConditionNumber = 1000;

/**
 * Per-contact velocity/position constraint (1–2 points), computed once per
 * sub-step in {@link ContactSolver.prepare} and reused across iterations. Pooled
 * and reused across steps, so steady-state stepping allocates nothing.
 */
class ContactConstraint {
  public record!: ContactRecord;
  public bodyA!: PhysicsBody;
  public bodyB!: PhysicsBody;
  public nx = 0;
  public ny = 0;
  public tx = 0;
  public ty = 0;
  public friction = 0;
  public pointCount = 0;

  // Per-point contact arms (relative to each body's centre of mass).
  public readonly rAx = [0, 0];
  public readonly rAy = [0, 0];
  public readonly rBx = [0, 0];
  public readonly rBy = [0, 0];
  public readonly normalMass = [0, 0];
  public readonly tangentMass = [0, 0];
  public readonly velocityBias = [0, 0];
  public readonly penetration = [0, 0];

  // 2-point block: the contact matrix `K` and its inverse (set only when the
  // manifold has two points and `K` is well-conditioned; else sequential).
  public block = false;
  public k11 = 0;
  public k12 = 0;
  public k22 = 0;
  public invK11 = 0;
  public invK12 = 0;
  public invK22 = 0;
}

/**
 * Native warm-started **sequential-impulse** contact solver. Each sub-step:
 * {@link prepare} builds per-contact constraints (effective masses, restitution
 * bias, and a 2×2 block matrix for two-point manifolds), {@link warmStart}
 * re-applies the cached impulses, then {@link solveVelocities} runs the velocity
 * iterations — friction via a Coulomb cone (per point), then the non-penetration
 * normal impulse. Two-point manifolds solve the normal impulses **as a 2×2 block
 * LCP** (Box2D-style), which converges far better for stacks than solving the
 * two points sequentially. {@link solvePositions} then removes penetration with a
 * non-linear Gauss-Seidel (NGS) geometric pass (no energy injected into
 * velocities). Accumulated impulses are written back to each {@link ContactRecord}
 * for warm-starting the next step.
 *
 * Internal to {@link NativePhysicsBackend}; not part of the public surface.
 */
export class ContactSolver {
  private readonly _constraints: ContactConstraint[] = [];
  private _count = 0;

  /** Build the per-contact constraints for this sub-step from the touching solid contacts. */
  public prepare(contacts: readonly ContactRecord[]): void {
    this._count = 0;

    for (const contact of contacts) {
      const manifold = contact.manifold;
      const pointCount = manifold.pointCount;

      if (pointCount === 0) {
        continue;
      }

      const bodyA = contact.a.body;
      const bodyB = contact.b.body;
      const constraint = this._acquire();
      const nx = manifold.normalX;
      const ny = manifold.normalY;
      const tx = -ny;
      const ty = nx;

      constraint.record = contact;
      constraint.bodyA = bodyA;
      constraint.bodyB = bodyB;
      constraint.nx = nx;
      constraint.ny = ny;
      constraint.tx = tx;
      constraint.ty = ty;
      constraint.friction = Math.sqrt(contact.a.friction * contact.b.friction);
      constraint.pointCount = pointCount;
      constraint.block = false;

      const restitution = Math.max(contact.a.restitution, contact.b.restitution);
      const mA = bodyA.invMass;
      const mB = bodyB.invMass;
      const iA = bodyA.invInertia;
      const iB = bodyB.invInertia;
      const comAx = bodyA.worldCenterOfMassX;
      const comAy = bodyA.worldCenterOfMassY;
      const comBx = bodyB.worldCenterOfMassX;
      const comBy = bodyB.worldCenterOfMassY;

      for (let i = 0; i < pointCount; i++) {
        // i in 0..pointCount-1 and pointCount ≤ 2, so the manifold point exists.
        const point = i === 0 ? manifold.points[0] : manifold.points[1];
        const rAx = point.x - comAx;
        const rAy = point.y - comAy;
        const rBx = point.x - comBx;
        const rBy = point.y - comBy;

        constraint.rAx[i] = rAx;
        constraint.rAy[i] = rAy;
        constraint.rBx[i] = rBx;
        constraint.rBy[i] = rBy;

        const rnA = rAx * ny - rAy * nx;
        const rnB = rBx * ny - rBy * nx;
        const kn = mA + mB + iA * rnA * rnA + iB * rnB * rnB;
        const rtA = rAx * ty - rAy * tx;
        const rtB = rBx * ty - rBy * tx;
        const kt = mA + mB + iA * rtA * rtA + iB * rtB * rtB;

        constraint.normalMass[i] = kn > 0 ? 1 / kn : 0;
        constraint.tangentMass[i] = kt > 0 ? 1 / kt : 0;
        constraint.penetration[i] = point.penetration;

        // Restitution bias from the pre-gravity impact speed (above the threshold
        // only) — using the post-gravity velocity would make a resting contact
        // perpetually micro-bounce, since gravity·dt alone exceeds the threshold.
        const relVx = bodyB._prevVx - bodyB._prevW * rBy - (bodyA._prevVx - bodyA._prevW * rAy);
        const relVy = bodyB._prevVy + bodyB._prevW * rBx - (bodyA._prevVy + bodyA._prevW * rAx);
        const vn = relVx * nx + relVy * ny;

        constraint.velocityBias[i] = vn < -restitutionThreshold ? -restitution * vn : 0;
      }

      if (pointCount === 2) {
        const rn1A = n(constraint.rAx, 0) * ny - n(constraint.rAy, 0) * nx;
        const rn1B = n(constraint.rBx, 0) * ny - n(constraint.rBy, 0) * nx;
        const rn2A = n(constraint.rAx, 1) * ny - n(constraint.rAy, 1) * nx;
        const rn2B = n(constraint.rBx, 1) * ny - n(constraint.rBy, 1) * nx;
        const k11 = mA + mB + iA * rn1A * rn1A + iB * rn1B * rn1B;
        const k22 = mA + mB + iA * rn2A * rn2A + iB * rn2B * rn2B;
        const k12 = mA + mB + iA * rn1A * rn2A + iB * rn1B * rn2B;
        const det = k11 * k22 - k12 * k12;

        // Only block-solve when `K` is well-conditioned (parallel-ish contacts
        // produce a near-singular matrix → fall back to sequential).
        if (det > 0 && k11 * k11 < maxConditionNumber * det) {
          const invDet = 1 / det;

          constraint.k11 = k11;
          constraint.k12 = k12;
          constraint.k22 = k22;
          constraint.invK11 = invDet * k22;
          constraint.invK12 = -invDet * k12;
          constraint.invK22 = invDet * k11;
          constraint.block = true;
        }
      }
    }
  }

  /** Re-apply the cached impulses from the previous step (warm-starting). */
  public warmStart(): void {
    for (let ci = 0; ci < this._count; ci++) {
      const constraint = this._at(ci);
      const bodyA = constraint.bodyA;
      const bodyB = constraint.bodyB;

      for (let i = 0; i < constraint.pointCount; i++) {
        const normalImpulse = n(constraint.record.normalImpulse, i);
        const tangentImpulse = n(constraint.record.tangentImpulse, i);
        const jx = normalImpulse * constraint.nx + tangentImpulse * constraint.tx;
        const jy = normalImpulse * constraint.ny + tangentImpulse * constraint.ty;

        applyImpulse(bodyA, bodyB, n(constraint.rAx, i), n(constraint.rAy, i), n(constraint.rBx, i), n(constraint.rBy, i), jx, jy);
      }
    }
  }

  /** Run the velocity iterations: friction (Coulomb cone) then the normal constraint (block when possible). */
  public solveVelocities(iterations: number): void {
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (let ci = 0; ci < this._count; ci++) {
        this._solveVelocityContact(this._at(ci));
      }
    }
  }

  private _solveVelocityContact(constraint: ContactConstraint): void {
    this._solveFriction(constraint);

    if (constraint.block) {
      this._solveNormalBlock(constraint);
    } else {
      this._solveNormalSequential(constraint);
    }
  }

  /**
   * NGS (non-linear Gauss-Seidel) position correction: each iteration recomputes
   * the current separation at every contact point from the corrections applied so
   * far and pushes the bodies apart geometrically (capped per iteration at
   * {@link maxCorrection}). Recomputing the separation makes the pass
   * self-limiting — it stops at the slop and never over-corrects — so, unlike a
   * fixed-bias split-impulse, it injects no energy even at low iteration counts.
   * The corrections are applied to the transform by `_integratePosition`;
   * velocities are untouched.
   */
  public solvePositions(iterations: number): void {
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (let ci = 0; ci < this._count; ci++) {
        this._solvePositionContact(this._at(ci));
      }
    }
  }

  private _solvePositionContact(constraint: ContactConstraint): void {
    const bodyA = constraint.bodyA;
    const bodyB = constraint.bodyB;
    const nx = constraint.nx;
    const ny = constraint.ny;

    for (let i = 0; i < constraint.pointCount; i++) {
      const rAx = n(constraint.rAx, i);
      const rAy = n(constraint.rAy, i);
      const rBx = n(constraint.rBx, i);
      const rBy = n(constraint.rBy, i);

      // Displacement of the contact point on each body from corrections so far.
      const dispAx = bodyA._posCorrectionX - bodyA._angleCorrection * rAy;
      const dispAy = bodyA._posCorrectionY + bodyA._angleCorrection * rAx;
      const dispBx = bodyB._posCorrectionX - bodyB._angleCorrection * rBy;
      const dispBy = bodyB._posCorrectionY + bodyB._angleCorrection * rBx;

      // Current separation (negative = penetrating), recomputed each iteration.
      const separation = -n(constraint.penetration, i) + (dispBx - dispAx) * nx + (dispBy - dispAy) * ny;
      const correction = clamp(baumgarte * (separation + slop), -maxCorrection, 0);
      const impulse = -correction * n(constraint.normalMass, i);
      const jx = impulse * nx;
      const jy = impulse * ny;

      bodyA._posCorrectionX -= jx * bodyA.invMass;
      bodyA._posCorrectionY -= jy * bodyA.invMass;
      bodyA._angleCorrection -= (rAx * jy - rAy * jx) * bodyA.invInertia;
      bodyB._posCorrectionX += jx * bodyB.invMass;
      bodyB._posCorrectionY += jy * bodyB.invMass;
      bodyB._angleCorrection += (rBx * jy - rBy * jx) * bodyB.invInertia;
    }
  }

  /** Per-point friction: clamp the accumulated tangent impulse to the Coulomb cone `±μ·normalImpulse`. */
  private _solveFriction(constraint: ContactConstraint): void {
    const bodyA = constraint.bodyA;
    const bodyB = constraint.bodyB;

    for (let i = 0; i < constraint.pointCount; i++) {
      const rAx = n(constraint.rAx, i);
      const rAy = n(constraint.rAy, i);
      const rBx = n(constraint.rBx, i);
      const rBy = n(constraint.rBy, i);
      const vtX = bodyB.linearVelocityX - bodyB.angularVelocity * rBy - (bodyA.linearVelocityX - bodyA.angularVelocity * rAy);
      const vtY = bodyB.linearVelocityY + bodyB.angularVelocity * rBx - (bodyA.linearVelocityY + bodyA.angularVelocity * rAx);
      const vt = vtX * constraint.tx + vtY * constraint.ty;
      const maxFriction = constraint.friction * n(constraint.record.normalImpulse, i);
      const oldTangent = n(constraint.record.tangentImpulse, i);
      const newTangent = clamp(oldTangent - n(constraint.tangentMass, i) * vt, -maxFriction, maxFriction);
      const deltaTangent = newTangent - oldTangent;

      constraint.record.tangentImpulse[i] = newTangent;
      applyImpulse(bodyA, bodyB, rAx, rAy, rBx, rBy, deltaTangent * constraint.tx, deltaTangent * constraint.ty);
    }
  }

  /** Single-point (or ill-conditioned) normal solve: accumulated, clamped ≥ 0. */
  private _solveNormalSequential(constraint: ContactConstraint): void {
    const bodyA = constraint.bodyA;
    const bodyB = constraint.bodyB;
    const nx = constraint.nx;
    const ny = constraint.ny;

    for (let i = 0; i < constraint.pointCount; i++) {
      const rAx = n(constraint.rAx, i);
      const rAy = n(constraint.rAy, i);
      const rBx = n(constraint.rBx, i);
      const rBy = n(constraint.rBy, i);
      const vn = normalVelocity(bodyA, bodyB, rAx, rAy, rBx, rBy, nx, ny);
      const oldNormal = n(constraint.record.normalImpulse, i);
      const newNormal = Math.max(0, oldNormal - n(constraint.normalMass, i) * (vn - n(constraint.velocityBias, i)));
      const deltaNormal = newNormal - oldNormal;

      constraint.record.normalImpulse[i] = newNormal;
      applyImpulse(bodyA, bodyB, rAx, rAy, rBx, rBy, deltaNormal * nx, deltaNormal * ny);
    }
  }

  /**
   * Two-point block normal solve (Box2D LCP): find both new normal impulses
   * `x ≥ 0` so the post-solve normal velocities are non-negative and
   * complementary, trying the four corners (both active, one active, none).
   */
  private _solveNormalBlock(constraint: ContactConstraint): void {
    const bodyA = constraint.bodyA;
    const bodyB = constraint.bodyB;
    const nx = constraint.nx;
    const ny = constraint.ny;
    const a1 = n(constraint.record.normalImpulse, 0);
    const a2 = n(constraint.record.normalImpulse, 1);
    const vn1 = normalVelocity(bodyA, bodyB, n(constraint.rAx, 0), n(constraint.rAy, 0), n(constraint.rBx, 0), n(constraint.rBy, 0), nx, ny);
    const vn2 = normalVelocity(bodyA, bodyB, n(constraint.rAx, 1), n(constraint.rAy, 1), n(constraint.rBx, 1), n(constraint.rBy, 1), nx, ny);

    // Residual at zero impulse: b = (vn − bias) − K·a.
    const bx = vn1 - n(constraint.velocityBias, 0) - (constraint.k11 * a1 + constraint.k12 * a2);
    const by = vn2 - n(constraint.velocityBias, 1) - (constraint.k12 * a1 + constraint.k22 * a2);

    // Case 1 — both points active: x = −K⁻¹·b.
    let x1 = -(constraint.invK11 * bx + constraint.invK12 * by);
    let x2 = -(constraint.invK12 * bx + constraint.invK22 * by);

    if (x1 >= 0 && x2 >= 0) {
      this._applyBlock(constraint, x1 - a1, x2 - a2);
      constraint.record.normalImpulse[0] = x1;
      constraint.record.normalImpulse[1] = x2;

      return;
    }

    // Case 2 — only point 1 active (x2 = 0).
    x1 = -n(constraint.normalMass, 0) * bx;
    x2 = 0;

    if (x1 >= 0 && constraint.k12 * x1 + by >= 0) {
      this._applyBlock(constraint, x1 - a1, x2 - a2);
      constraint.record.normalImpulse[0] = x1;
      constraint.record.normalImpulse[1] = x2;

      return;
    }

    // Case 3 — only point 2 active (x1 = 0).
    x1 = 0;
    x2 = -n(constraint.normalMass, 1) * by;

    if (x2 >= 0 && constraint.k12 * x2 + bx >= 0) {
      this._applyBlock(constraint, x1 - a1, x2 - a2);
      constraint.record.normalImpulse[0] = x1;
      constraint.record.normalImpulse[1] = x2;

      return;
    }

    // Case 4 — neither active (separating). Only valid when both residuals are non-negative.
    if (bx >= 0 && by >= 0) {
      this._applyBlock(constraint, -a1, -a2);
      constraint.record.normalImpulse[0] = 0;
      constraint.record.normalImpulse[1] = 0;
    }
  }

  /** Apply the two-point block impulse deltas `(d1, d2)` along the normal at both contact points. */
  private _applyBlock(constraint: ContactConstraint, d1: number, d2: number): void {
    const bodyA = constraint.bodyA;
    const bodyB = constraint.bodyB;
    const nx = constraint.nx;
    const ny = constraint.ny;

    applyImpulse(bodyA, bodyB, n(constraint.rAx, 0), n(constraint.rAy, 0), n(constraint.rBx, 0), n(constraint.rBy, 0), d1 * nx, d1 * ny);
    applyImpulse(bodyA, bodyB, n(constraint.rAx, 1), n(constraint.rAy, 1), n(constraint.rBx, 1), n(constraint.rBy, 1), d2 * nx, d2 * ny);
  }

  private _acquire(): ContactConstraint {
    if (this._count === this._constraints.length) {
      this._constraints.push(new ContactConstraint());
    }

    return this._at(this._count++);
  }

  /**
   * Pooled constraint at `ci`. Every caller indexes within `0..this._count-1`
   * and `_count` never exceeds the pool length, so the entry always exists; the
   * throw is unreachable and only discharges `noUncheckedIndexedAccess` without a
   * cast or non-null assertion.
   */
  private _at(ci: number): ContactConstraint {
    const constraint = this._constraints[ci];

    if (constraint === undefined) {
      throw new RangeError(`ContactSolver: constraint pool index ${ci} out of range.`);
    }

    return constraint;
  }
}

/** Relative normal velocity at a contact point: `dot(vB + ωB×rB − vA − ωA×rA, n)`. */
const normalVelocity = (bodyA: PhysicsBody, bodyB: PhysicsBody, rAx: number, rAy: number, rBx: number, rBy: number, nx: number, ny: number): number => {
  const dvx = bodyB.linearVelocityX - bodyB.angularVelocity * rBy - (bodyA.linearVelocityX - bodyA.angularVelocity * rAy);
  const dvy = bodyB.linearVelocityY + bodyB.angularVelocity * rBx - (bodyA.linearVelocityY + bodyA.angularVelocity * rAx);

  return dvx * nx + dvy * ny;
};

/** Apply impulse `(jx, jy)` to B and its negation to A about their contact arms. */
const applyImpulse = (bodyA: PhysicsBody, bodyB: PhysicsBody, rAx: number, rAy: number, rBx: number, rBy: number, jx: number, jy: number): void => {
  bodyA.linearVelocityX -= jx * bodyA.invMass;
  bodyA.linearVelocityY -= jy * bodyA.invMass;
  bodyA.angularVelocity -= (rAx * jy - rAy * jx) * bodyA.invInertia;

  bodyB.linearVelocityX += jx * bodyB.invMass;
  bodyB.linearVelocityY += jy * bodyB.invMass;
  bodyB.angularVelocity += (rBx * jy - rBy * jx) * bodyB.invInertia;
};

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);

/**
 * In-bounds read of a fixed-size (length-2) per-point scratch array. Every
 * caller indexes within `0..pointCount-1` (pointCount ≤ 2), so the element
 * always exists; the `0` fallback only discharges `noUncheckedIndexedAccess`
 * for the unreachable case and keeps the `??` out of caller complexity.
 */
const n = (arr: readonly number[], i: number): number => arr[i] ?? 0;
