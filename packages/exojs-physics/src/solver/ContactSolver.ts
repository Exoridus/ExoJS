import type { ContactRecord } from '../ContactGraph';
import type { PhysicsBody } from '../PhysicsBody';

/** Baumgarte position-correction factor (fraction of penetration removed per step). */
const baumgarte = 0.2;
/** Penetration allowance (px) left uncorrected to avoid jitter. */
const slop = 0.5;
/** Relative normal speed (px/s) below which a contact is treated as resting (no restitution). */
const restitutionThreshold = 1;

/**
 * Per-point velocity constraint, computed once per sub-step in {@link ContactSolver.prepare}
 * and reused across iterations. Pooled and reused across steps.
 */
class ConstraintPoint {
  public record!: ContactRecord;
  public bodyA!: PhysicsBody;
  public bodyB!: PhysicsBody;
  public index = 0;
  public nx = 0;
  public ny = 0;
  public tx = 0;
  public ty = 0;
  public rAx = 0;
  public rAy = 0;
  public rBx = 0;
  public rBy = 0;
  public normalMass = 0;
  public tangentMass = 0;
  public bias = 0;
  public friction = 0;
}

/**
 * Native warm-started **sequential-impulse** contact solver. Each sub-step:
 * {@link prepare} builds per-point velocity constraints (effective masses,
 * Baumgarte + restitution bias), {@link warmStart} re-applies the cached
 * impulses, then {@link solveVelocities} runs the velocity iterations
 * (friction via a Coulomb cone clamped to the accumulated normal impulse, then
 * the non-penetration normal impulse). Accumulated impulses are written back to
 * each {@link ContactRecord} for warm-starting the next step.
 *
 * Internal to {@link NativePhysicsBackend}; not part of the public surface.
 */
export class ContactSolver {
  private readonly _points: ConstraintPoint[] = [];
  private _count = 0;

  /** Build the per-point constraints for this sub-step from the touching solid contacts. */
  public prepare(contacts: readonly ContactRecord[], dt: number): void {
    this._count = 0;

    const invDt = dt > 0 ? 1 / dt : 0;

    for (const contact of contacts) {
      const bodyA = contact.a.body;
      const bodyB = contact.b.body;
      const manifold = contact.manifold;
      const nx = manifold.normalX;
      const ny = manifold.normalY;
      const tx = -ny;
      const ty = nx;
      const comAx = bodyA.worldCenterOfMassX;
      const comAy = bodyA.worldCenterOfMassY;
      const comBx = bodyB.worldCenterOfMassX;
      const comBy = bodyB.worldCenterOfMassY;
      const friction = Math.sqrt(contact.a.friction * contact.b.friction);
      const restitution = Math.max(contact.a.restitution, contact.b.restitution);

      for (let i = 0; i < manifold.pointCount; i++) {
        const point = manifold.points[i];
        const rAx = point.x - comAx;
        const rAy = point.y - comAy;
        const rBx = point.x - comBx;
        const rBy = point.y - comBy;

        const rnA = rAx * ny - rAy * nx;
        const rnB = rBx * ny - rBy * nx;
        const kn = bodyA.invMass + bodyB.invMass + bodyA.invInertia * rnA * rnA + bodyB.invInertia * rnB * rnB;
        const rtA = rAx * ty - rAy * tx;
        const rtB = rBx * ty - rBy * tx;
        const kt = bodyA.invMass + bodyB.invMass + bodyA.invInertia * rtA * rtA + bodyB.invInertia * rtB * rtB;

        // Initial relative normal velocity (for restitution bias).
        const relVx = bodyB.linearVelocityX - bodyB.angularVelocity * rBy - (bodyA.linearVelocityX - bodyA.angularVelocity * rAy);
        const relVy = bodyB.linearVelocityY + bodyB.angularVelocity * rBx - (bodyA.linearVelocityY + bodyA.angularVelocity * rAx);
        const vn = relVx * nx + relVy * ny;

        // Position-correction (Baumgarte) and restitution biases are combined by
        // `max`, not sum: a deep penetrating impact would otherwise have the
        // Baumgarte term inject energy on top of the restitution bounce (an
        // over-high rebound). At rest the restitution term is zero (below the
        // velocity threshold) so Baumgarte drives the correction; on a fast
        // impact the restitution term dominates and sets the rebound speed.
        const baumgarteBias = baumgarte * invDt * Math.max(0, point.penetration - slop);
        const restitutionBias = vn < -restitutionThreshold ? -restitution * vn : 0;

        const constraint = this._acquire();

        constraint.record = contact;
        constraint.bodyA = bodyA;
        constraint.bodyB = bodyB;
        constraint.index = i;
        constraint.nx = nx;
        constraint.ny = ny;
        constraint.tx = tx;
        constraint.ty = ty;
        constraint.rAx = rAx;
        constraint.rAy = rAy;
        constraint.rBx = rBx;
        constraint.rBy = rBy;
        constraint.normalMass = kn > 0 ? 1 / kn : 0;
        constraint.tangentMass = kt > 0 ? 1 / kt : 0;
        constraint.friction = friction;
        constraint.bias = Math.max(baumgarteBias, restitutionBias);
      }
    }
  }

  /** Re-apply the cached impulses from the previous step (warm-starting). */
  public warmStart(): void {
    for (let i = 0; i < this._count; i++) {
      const constraint = this._points[i];
      const normalImpulse = constraint.record.normalImpulse[constraint.index];
      const tangentImpulse = constraint.record.tangentImpulse[constraint.index];

      this._applyImpulse(constraint, normalImpulse * constraint.nx + tangentImpulse * constraint.tx, normalImpulse * constraint.ny + tangentImpulse * constraint.ty);
    }
  }

  /** Run the velocity iterations: friction (clamped to the cone) then the normal constraint. */
  public solveVelocities(iterations: number): void {
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (let i = 0; i < this._count; i++) {
        const constraint = this._points[i];
        const bodyA = constraint.bodyA;
        const bodyB = constraint.bodyB;

        // Friction: clamp the accumulated tangent impulse to the Coulomb cone.
        const vtX = bodyB.linearVelocityX - bodyB.angularVelocity * constraint.rBy - (bodyA.linearVelocityX - bodyA.angularVelocity * constraint.rAy);
        const vtY = bodyB.linearVelocityY + bodyB.angularVelocity * constraint.rBx - (bodyA.linearVelocityY + bodyA.angularVelocity * constraint.rAx);
        const vt = vtX * constraint.tx + vtY * constraint.ty;
        const maxFriction = constraint.friction * constraint.record.normalImpulse[constraint.index];
        const oldTangent = constraint.record.tangentImpulse[constraint.index];
        const newTangent = clamp(oldTangent - constraint.tangentMass * vt, -maxFriction, maxFriction);
        const deltaTangent = newTangent - oldTangent;

        constraint.record.tangentImpulse[constraint.index] = newTangent;
        this._applyImpulse(constraint, deltaTangent * constraint.tx, deltaTangent * constraint.ty);

        // Normal: non-penetration impulse, accumulated and clamped to ≥ 0.
        const vnX = bodyB.linearVelocityX - bodyB.angularVelocity * constraint.rBy - (bodyA.linearVelocityX - bodyA.angularVelocity * constraint.rAy);
        const vnY = bodyB.linearVelocityY + bodyB.angularVelocity * constraint.rBx - (bodyA.linearVelocityY + bodyA.angularVelocity * constraint.rAx);
        const vn = vnX * constraint.nx + vnY * constraint.ny;
        const oldNormal = constraint.record.normalImpulse[constraint.index];
        const newNormal = Math.max(0, oldNormal - constraint.normalMass * (vn - constraint.bias));
        const deltaNormal = newNormal - oldNormal;

        constraint.record.normalImpulse[constraint.index] = newNormal;
        this._applyImpulse(constraint, deltaNormal * constraint.nx, deltaNormal * constraint.ny);
      }
    }
  }

  /** Apply impulse `(jx, jy)` to B and its negation to A, about their contact arms. */
  private _applyImpulse(constraint: ConstraintPoint, jx: number, jy: number): void {
    const bodyA = constraint.bodyA;
    const bodyB = constraint.bodyB;

    bodyA.linearVelocityX -= jx * bodyA.invMass;
    bodyA.linearVelocityY -= jy * bodyA.invMass;
    bodyA.angularVelocity -= (constraint.rAx * jy - constraint.rAy * jx) * bodyA.invInertia;

    bodyB.linearVelocityX += jx * bodyB.invMass;
    bodyB.linearVelocityY += jy * bodyB.invMass;
    bodyB.angularVelocity += (constraint.rBx * jy - constraint.rBy * jx) * bodyB.invInertia;
  }

  private _acquire(): ConstraintPoint {
    if (this._count === this._points.length) {
      this._points.push(new ConstraintPoint());
    }

    return this._points[this._count++];
  }
}

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);
