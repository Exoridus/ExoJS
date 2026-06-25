import type { ContactRecord } from '../ContactGraph';
import type { PhysicsBody } from '../PhysicsBody';

/** Relative normal speed (px/s) below which a contact is treated as resting (no restitution). */
const restitutionThreshold = 1;
/**
 * Penetration allowance (px) the soft bias leaves uncorrected. The narrow phase
 * only produces a manifold while the colliders overlap, so pushing penetration
 * fully to zero lets a resting contact wink out for a frame (free-fall, then
 * re-detect) — a periodic energy spike. Leaving a small slop keeps the contact
 * persistently overlapping and the warm-start cache alive.
 */
const slop = 0.25;
/**
 * Cap on the soft-constraint push-out velocity (px/s). Bounds how fast the bias
 * resolves deep penetration so a large overlap cannot fling bodies apart; the
 * Box2D-v3 analogue is `contactSpeed = 3·lengthUnit`, retuned for ExoJS pixels.
 */
const maxBiasVelocity = 4;
/** Reject the 2-point block solve when the contact matrix is worse-conditioned than this (fall back to sequential). */
const maxConditionNumber = 1000;

/**
 * Per-contact velocity constraint (1–2 points), computed once per **frame** in
 * {@link ContactSolver.prepare} and reused across all sub-steps and passes.
 * Pooled and reused across frames, so steady-state stepping allocates nothing.
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
  public restitution = 0;
  public pointCount = 0;

  // Soft-constraint factors (Box2D-v3 "soft step"), derived once per frame from
  // contactHertz/dampingRatio and the sub-step `h`. Shared by both points.
  public biasRate = 0;
  public massScale = 1;
  public impulseScale = 0;

  // Per-point contact arms at frame start (relative to each body's centre of mass).
  public readonly rAx = [0, 0];
  public readonly rAy = [0, 0];
  public readonly rBx = [0, 0];
  public readonly rBy = [0, 0];
  // Per-point arms rotated by the live sub-step rotation (refreshed each pass by
  // {@link ContactSolver._updateArms}); the solve reads these so a rotating body's
  // contact torque tracks its current orientation.
  public readonly rotAx = [0, 0];
  public readonly rotAy = [0, 0];
  public readonly rotBx = [0, 0];
  public readonly rotBy = [0, 0];
  public readonly normalMass = [0, 0];
  public readonly tangentMass = [0, 0];
  /** Contact separation at frame start (= −penetration; negative when overlapping). */
  public readonly baseSeparation = [0, 0];
  /** Relative normal velocity at frame start (the impact speed the restitution pass keys off). */
  public readonly relativeVelocity = [0, 0];
  /** Push-out target normal velocity for the current pass (set per pass from the live separation). */
  public readonly velocityBias = [0, 0];

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
 * Native warm-started **TGS-Soft** contact solver (Box2D-v3 "soft step"). Driven
 * by {@link PhysicsWorld} as a sub-stepping loop: detection runs once per frame,
 * then {@link prepare} builds the per-contact constraints (effective masses,
 * frame-start separation + impact velocity, soft factors, and a 2×2 block matrix
 * for two-point manifolds) **once**, and each sub-step runs
 * {@link warmStart} → {@link solveVelocities}(useBias=true) → integrate positions
 * → {@link solveVelocities}(useBias=false) relax. A final {@link applyRestitution}
 * pass adds bounce above the threshold.
 *
 * The position constraint is folded into the velocity solve as a **soft bias**
 * (a damped-spring push-out whose stiffness is decoupled from the iteration
 * count), recomputed each pass from the live per-body delta position/rotation —
 * so there is no separate NGS geometric pass. The contact anchors are rotated by
 * the live sub-step rotation each pass, so a tilting stack's restoring torque is
 * computed against its current orientation (without this the tilt grows instead
 * of being corrected). Two-point manifolds still solve the normal impulses **as a
 * 2×2 block LCP** (Box2D-style), which propagates stack loads far better than
 * solving the points sequentially; the block path carries the soft push-out as
 * its velocity target (hard mass scale), while single-point contacts use the full
 * soft mass/impulse scaling. Accumulated impulses are written back to each
 * {@link ContactRecord} for warm-starting the next frame.
 *
 * Internal to {@link NativePhysicsBackend}; not part of the public surface.
 */
export class ContactSolver {
  private readonly _constraints: ContactConstraint[] = [];
  private _count = 0;

  /**
   * Build the per-contact constraints for this frame from the touching solid
   * contacts. `h` is the sub-step duration (`fixedDelta / subStepCount`); the
   * soft factors are derived from it together with `contactHertz`/`dampingRatio`.
   * Runs once per frame (detection is not repeated per sub-step).
   */
  public prepare(contacts: readonly ContactRecord[], h: number, contactHertz: number, dampingRatio: number): void {
    this._count = 0;

    // Box2D-v3 soft-constraint factors from a damped spring (hertz, zeta) at the
    // sub-step `h`: omega = 2πf; a1 = 2ζ + hω; a2 = hω·a1; a3 = 1/(1+a2).
    const omega = 2 * Math.PI * contactHertz;
    const a1 = 2 * dampingRatio + h * omega;
    const a2 = h * omega * a1;
    const a3 = 1 / (1 + a2);
    const biasRate = contactHertz > 0 ? omega / a1 : 0;
    const massScale = contactHertz > 0 ? a2 * a3 : 1;
    const impulseScale = contactHertz > 0 ? a3 : 0;

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
      constraint.restitution = Math.max(contact.a.restitution, contact.b.restitution);
      constraint.pointCount = pointCount;
      constraint.block = false;
      constraint.biasRate = biasRate;
      constraint.massScale = massScale;
      constraint.impulseScale = impulseScale;

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
        // Frame start: no accumulated rotation yet, so the live arms equal the base arms.
        constraint.rotAx[i] = rAx;
        constraint.rotAy[i] = rAy;
        constraint.rotBx[i] = rBx;
        constraint.rotBy[i] = rBy;

        const rnA = rAx * ny - rAy * nx;
        const rnB = rBx * ny - rBy * nx;
        const kn = mA + mB + iA * rnA * rnA + iB * rnB * rnB;
        const rtA = rAx * ty - rAy * tx;
        const rtB = rBx * ty - rBy * tx;
        const kt = mA + mB + iA * rtA * rtA + iB * rtB * rtB;

        constraint.normalMass[i] = kn > 0 ? 1 / kn : 0;
        constraint.tangentMass[i] = kt > 0 ? 1 / kt : 0;
        constraint.baseSeparation[i] = -point.penetration;
        constraint.velocityBias[i] = 0;

        // Frame-start relative normal velocity (the true impact speed, captured
        // before this frame's gravity since prepare runs ahead of the sub-step
        // loop) — keys the restitution pass so a resting contact does not
        // perpetually micro-bounce off the per-step gravity increment.
        constraint.relativeVelocity[i] = normalVelocity(bodyA, bodyB, rAx, rAy, rBx, rBy, nx, ny);
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

  /** Re-apply the cached impulses from the previous frame (warm-starting); runs each sub-step. */
  public warmStart(): void {
    for (let ci = 0; ci < this._count; ci++) {
      const constraint = this._at(ci);
      const bodyA = constraint.bodyA;
      const bodyB = constraint.bodyB;

      this._updateArms(constraint);

      for (let i = 0; i < constraint.pointCount; i++) {
        const normalImpulse = n(constraint.record.normalImpulse, i);
        const tangentImpulse = n(constraint.record.tangentImpulse, i);
        const jx = normalImpulse * constraint.nx + tangentImpulse * constraint.tx;
        const jy = normalImpulse * constraint.ny + tangentImpulse * constraint.ty;

        applyImpulse(bodyA, bodyB, n(constraint.rotAx, i), n(constraint.rotAy, i), n(constraint.rotBx, i), n(constraint.rotBy, i), jx, jy);
      }
    }
  }

  /**
   * One velocity pass over every contact: the normal constraint (block when
   * possible) then friction (Coulomb cone). With `useBias` the normal solve
   * carries the soft push-out bias (the main pass, recomputed from the live
   * separation); without it the relax pass drives the normal velocity to zero so
   * the bias velocity does not remain in the bodies as injected energy.
   */
  public solveVelocities(useBias: boolean): void {
    for (let ci = 0; ci < this._count; ci++) {
      this._solveVelocityContact(this._at(ci), useBias);
    }
  }

  /**
   * Restitution pass, run once after the sub-step loop. For each loaded point
   * whose frame-start impact speed exceeded the threshold, add the impulse that
   * brings the post-solve normal velocity to `−restitution·impactSpeed`. Kept
   * separate from the main solve so resting contacts (impact below threshold) do
   * not micro-bounce.
   */
  public applyRestitution(): void {
    for (let ci = 0; ci < this._count; ci++) {
      const constraint = this._at(ci);

      if (constraint.restitution === 0) {
        continue;
      }

      const bodyA = constraint.bodyA;
      const bodyB = constraint.bodyB;
      const nx = constraint.nx;
      const ny = constraint.ny;

      this._updateArms(constraint);

      for (let i = 0; i < constraint.pointCount; i++) {
        const relativeVelocity = n(constraint.relativeVelocity, i);

        // Only points that carried load (normalImpulse > 0) and were struck
        // above the resting threshold bounce.
        if (relativeVelocity > -restitutionThreshold || n(constraint.record.normalImpulse, i) <= 0) {
          continue;
        }

        const rAx = n(constraint.rotAx, i);
        const rAy = n(constraint.rotAy, i);
        const rBx = n(constraint.rotBx, i);
        const rBy = n(constraint.rotBy, i);
        const vn = normalVelocity(bodyA, bodyB, rAx, rAy, rBx, rBy, nx, ny);
        const oldNormal = n(constraint.record.normalImpulse, i);
        const newNormal = Math.max(0, oldNormal - n(constraint.normalMass, i) * (vn + constraint.restitution * relativeVelocity));
        const deltaNormal = newNormal - oldNormal;

        constraint.record.normalImpulse[i] = newNormal;
        applyImpulse(bodyA, bodyB, rAx, rAy, rBx, rBy, deltaNormal * nx, deltaNormal * ny);
      }
    }
  }

  /** Refresh the live (rotated) contact arms from each body's accumulated sub-step rotation. */
  private _updateArms(constraint: ContactConstraint): void {
    const cosA = constraint.bodyA._deltaCos;
    const sinA = constraint.bodyA._deltaSin;
    const cosB = constraint.bodyB._deltaCos;
    const sinB = constraint.bodyB._deltaSin;

    for (let i = 0; i < constraint.pointCount; i++) {
      const rAx = n(constraint.rAx, i);
      const rAy = n(constraint.rAy, i);
      const rBx = n(constraint.rBx, i);
      const rBy = n(constraint.rBy, i);

      constraint.rotAx[i] = rAx * cosA - rAy * sinA;
      constraint.rotAy[i] = rAx * sinA + rAy * cosA;
      constraint.rotBx[i] = rBx * cosB - rBy * sinB;
      constraint.rotBy[i] = rBx * sinB + rBy * cosB;
    }
  }

  private _solveVelocityContact(constraint: ContactConstraint, useBias: boolean): void {
    this._updateArms(constraint);

    // Recompute the per-point push-out target from the live separation (folds the
    // position constraint into the velocity solve as a soft bias). With useBias
    // off (relax pass) the target is zero — the plain hard normal solve.
    for (let i = 0; i < constraint.pointCount; i++) {
      // Push out only the penetration beyond the slop, capped — leaving the slop
      // keeps the contact overlapping so the narrow phase does not drop it.
      const excess = -currentSeparation(constraint, i) - slop;

      constraint.velocityBias[i] = useBias && excess > 0 ? Math.min(constraint.biasRate * excess, maxBiasVelocity) : 0;
    }

    // Normal before friction (Box2D-v3 order): friction's Coulomb cone clamps to
    // `μ·normalImpulse`, so it must see this pass's freshly-solved normal impulse —
    // solving friction first uses last pass's cone and lets stacks creep laterally.
    if (constraint.block) {
      this._solveNormalBlock(constraint);
    } else {
      this._solveNormalSequential(constraint, useBias);
    }

    this._solveFriction(constraint);
  }

  /** Per-point friction: clamp the accumulated tangent impulse to the Coulomb cone `±μ·normalImpulse`. */
  private _solveFriction(constraint: ContactConstraint): void {
    const bodyA = constraint.bodyA;
    const bodyB = constraint.bodyB;

    for (let i = 0; i < constraint.pointCount; i++) {
      const rAx = n(constraint.rotAx, i);
      const rAy = n(constraint.rotAy, i);
      const rBx = n(constraint.rotBx, i);
      const rBy = n(constraint.rotBy, i);
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

  /**
   * Single-point (or ill-conditioned) soft normal solve, accumulated and clamped
   * ≥ 0. The Box2D-v3 incremental form: with the soft bias active the impulse is
   * `−normalMass·massScale·(vn − bias) − impulseScale·accumulated`, which both
   * pushes out the penetration and bleeds a little stored impulse (the damped
   * spring). The relax pass passes `useBias=false`, collapsing it to the hard
   * `−normalMass·vn` (no bias, full mass, no impulse decay).
   */
  private _solveNormalSequential(constraint: ContactConstraint, useBias: boolean): void {
    const bodyA = constraint.bodyA;
    const bodyB = constraint.bodyB;
    const nx = constraint.nx;
    const ny = constraint.ny;
    const massScale = useBias ? constraint.massScale : 1;
    const impulseScale = useBias ? constraint.impulseScale : 0;

    for (let i = 0; i < constraint.pointCount; i++) {
      const rAx = n(constraint.rotAx, i);
      const rAy = n(constraint.rotAy, i);
      const rBx = n(constraint.rotBx, i);
      const rBy = n(constraint.rotBy, i);
      const vn = normalVelocity(bodyA, bodyB, rAx, rAy, rBx, rBy, nx, ny);
      const oldNormal = n(constraint.record.normalImpulse, i);
      const impulse = -n(constraint.normalMass, i) * massScale * (vn - n(constraint.velocityBias, i)) - impulseScale * oldNormal;
      const newNormal = Math.max(0, oldNormal + impulse);
      const deltaNormal = newNormal - oldNormal;

      constraint.record.normalImpulse[i] = newNormal;
      applyImpulse(bodyA, bodyB, rAx, rAy, rBx, rBy, deltaNormal * nx, deltaNormal * ny);
    }
  }

  /**
   * Two-point block normal solve (Box2D LCP): find both new normal impulses
   * `x ≥ 0` so the post-solve normal velocities equal the push-out targets
   * (`velocityBias`, zero in the relax pass) and are complementary, trying the
   * four corners (both active, one active, none). The block path carries the
   * soft push-out as its target but solves with a hard mass scale.
   */
  private _solveNormalBlock(constraint: ContactConstraint): void {
    const bodyA = constraint.bodyA;
    const bodyB = constraint.bodyB;
    const nx = constraint.nx;
    const ny = constraint.ny;
    const a1 = n(constraint.record.normalImpulse, 0);
    const a2 = n(constraint.record.normalImpulse, 1);
    const vn1 = normalVelocity(bodyA, bodyB, n(constraint.rotAx, 0), n(constraint.rotAy, 0), n(constraint.rotBx, 0), n(constraint.rotBy, 0), nx, ny);
    const vn2 = normalVelocity(bodyA, bodyB, n(constraint.rotAx, 1), n(constraint.rotAy, 1), n(constraint.rotBx, 1), n(constraint.rotBy, 1), nx, ny);

    // Residual at the current impulse: b = (vn − bias) − K·a.
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

    applyImpulse(bodyA, bodyB, n(constraint.rotAx, 0), n(constraint.rotAy, 0), n(constraint.rotBx, 0), n(constraint.rotBy, 0), d1 * nx, d1 * ny);
    applyImpulse(bodyA, bodyB, n(constraint.rotAx, 1), n(constraint.rotAy, 1), n(constraint.rotBx, 1), n(constraint.rotBy, 1), d2 * nx, d2 * ny);
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

/**
 * Live contact separation at point `i`, recomputed from each body's accumulated
 * delta position plus the rotation-induced shift of the (rotated) anchor since
 * frame start, projected onto the normal. Negative when overlapping. This is what
 * folds the position constraint into the velocity solve without a separate
 * geometric pass or re-running detection per sub-step.
 */
const currentSeparation = (constraint: ContactConstraint, i: number): number => {
  const bodyA = constraint.bodyA;
  const bodyB = constraint.bodyB;
  // Anchor displacement since frame start = linear delta + (rotated arm − base arm).
  const dispAx = bodyA._deltaPosX + n(constraint.rotAx, i) - n(constraint.rAx, i);
  const dispAy = bodyA._deltaPosY + n(constraint.rotAy, i) - n(constraint.rAy, i);
  const dispBx = bodyB._deltaPosX + n(constraint.rotBx, i) - n(constraint.rBx, i);
  const dispBy = bodyB._deltaPosY + n(constraint.rotBy, i) - n(constraint.rBy, i);

  return n(constraint.baseSeparation, i) + (dispBx - dispAx) * constraint.nx + (dispBy - dispAy) * constraint.ny;
};

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
