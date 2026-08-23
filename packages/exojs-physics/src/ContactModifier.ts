import type { Collider } from './Collider';
import type { ContactRecord } from './ContactGraph';
import type { PhysicsBody } from './PhysicsBody';

/**
 * A solid contact as the world's {@link ContactModifier} sees it: the pair that
 * produced it, the contact normal, and the three per-step controls the modifier
 * may change. Everything else is read-only.
 *
 * The object is reused for every contact and is only valid for the duration of
 * the callback - read what you need, write the controls, do not retain it.
 *
 * Writing a control affects this step only; the values are re-derived from the
 * two colliders before the modifier runs again.
 *
 * A chain collider is solved per edge, so a body touching several edges of one
 * chain reaches the modifier once per edge, each time with the same authored
 * collider pair. Decide from the contact's own normal and penetration rather
 * than from the pair's identity if that distinction matters.
 */
export interface ContactModifierContext {
  readonly colliderA: Collider;
  readonly colliderB: Collider;
  readonly bodyA: PhysicsBody;
  readonly bodyB: PhysicsBody;
  /** X of the unit contact normal, pointing from A towards B. */
  readonly normalX: number;
  /** Y of the unit contact normal, pointing from A towards B. */
  readonly normalY: number;
  /** Manifold points backing this contact: `1` for a vertex/face hit, `2` for a face/face hit. */
  readonly pointCount: number;
  /** Deepest penetration across the manifold points, in px. */
  readonly maxPenetration: number;
  /**
   * Set to `false` to skip this contact in the solver for this step. The
   * contact stays geometrically touching, so `collisionStart`/`collisionEnd`
   * still describe the real geometry; it just applies no impulse, and it does
   * not join the two bodies into one sleeping island. Its warm-start impulses
   * are dropped while it is disabled, so re-enabling it starts cold rather than
   * releasing a stale impulse.
   */
  enabled: boolean;
  /**
   * Coulomb friction for this step. Defaults to `√(a.friction × b.friction)`
   * over the two colliders.
   */
  friction: number;
  /**
   * Restitution for this step. Defaults to `max(a.restitution, b.restitution)`
   * over the two colliders.
   */
  restitution: number;
}

/**
 * Called once per solid contact per fixed step, after contact generation and
 * before the solver runs, to adjust that contact for this step - the hook
 * one-way platforms, conditional friction and per-pair material overrides are
 * built on.
 *
 * A world has at most one modifier. It runs before islands are built, so
 * disabling a contact also keeps the two bodies from sleeping as one.
 */
export type ContactModifier = (contact: ContactModifierContext) => void;

/**
 * The single reused {@link ContactModifierContext} instance. Bound to one record
 * at a time so a step over thousands of contacts allocates nothing.
 * @internal
 */
export class MutableContactModifierContext implements ContactModifierContext {
  public colliderA!: Collider;
  public colliderB!: Collider;
  public bodyA!: PhysicsBody;
  public bodyB!: PhysicsBody;
  public normalX = 0;
  public normalY = 0;
  public pointCount = 0;
  public maxPenetration = 0;
  public enabled = true;
  public friction = 0;
  public restitution = 0;

  /** Point this context at `record` and load its current per-step values. */
  public bind(record: ContactRecord): void {
    const manifold = record.manifold;

    this.colliderA = record.ownerA;
    this.colliderB = record.ownerB;
    this.bodyA = record.ownerA.body;
    this.bodyB = record.ownerB.body;
    this.normalX = manifold.normalX;
    this.normalY = manifold.normalY;
    this.pointCount = manifold.pointCount;

    let deepest = 0;

    for (let i = 0; i < manifold.pointCount; i++) {
      // i < pointCount <= 2, so the point exists.
      const penetration = (i === 0 ? manifold.points[0] : manifold.points[1]).penetration;

      deepest = penetration > deepest ? penetration : deepest;
    }

    this.maxPenetration = deepest;
    this.enabled = record.enabled;
    this.friction = record.friction;
    this.restitution = record.restitution;
  }

  /** Write the (possibly modified) controls back onto the bound record. */
  public flush(record: ContactRecord): void {
    record.enabled = this.enabled;
    record.friction = this.friction;
    record.restitution = this.restitution;
  }
}
