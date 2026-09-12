import type { PhysicsBody } from '../PhysicsBody';

/** Options every joint accepts, whatever it constrains. */
export interface JointOptions {
  /**
   * Whether the two bodies this joint connects also collide with each other.
   * Default `true`.
   *
   * `false` is what a chain, a ragdoll, a pendulum or a vehicle assembly
   * usually wants, and what Box2D defaults to: a joint already decides how its
   * two bodies may move relative to one another, so letting their touching
   * colliders push each other apart at the same time gives the pair two
   * constraint systems with different opinions, plus a contact per link that
   * nothing needs.
   *
   * The default is nevertheless `true` for now, which is the behaviour every
   * joint has had so far. A revolute chain measured over a long window gains
   * energy once those contacts are gone - a settled chain reaching several
   * thousand px/s with nothing driving it - so the contacts have been damping
   * a stability problem in the joint solver rather than only costing time.
   * Shipping `false` as the default would make that the behaviour every
   * existing chain and ragdoll gets from an update, which is not a trade a
   * default may make. Once the solver holds a chain on its own the default is
   * worth revisiting.
   *
   * Nothing about a contact is weakened under `true`: the narrow phase
   * produces it, the contact graph holds it, collision events fire, a
   * {@link ContactModifier} sees it and the solver resolves it, exactly as for
   * any unjointed pair.
   *
   * It is fixed at construction, and it follows the joint's presence in the
   * world rather than {@link Joint.enabled}: disabling a joint suspends its
   * constraint, and a ragdoll whose joints are momentarily disabled must not
   * start pushing its own limbs apart. Removing the joint from the world does
   * let the pair collide again, and both bodies are woken so they respond to it.
   */
  collideConnected?: boolean;
}

/**
 * Base class for a two-body constraint solved alongside contacts in the
 * sub-step loop. Concrete joints (distance, revolute, weld) implement the
 * three solver hooks; the world owns the joint list and drives them, and joins
 * the two bodies into one sleep island so a jointed pair sleeps and wakes
 * together.
 */
export abstract class Joint {
  /** First constrained body. */
  public readonly bodyA: PhysicsBody;
  /** Second constrained body. */
  public readonly bodyB: PhysicsBody;
  /** Whether {@link bodyA} and {@link bodyB} also collide with each other; see {@link JointOptions.collideConnected}. */
  public readonly collideConnected: boolean;
  /** When `false`, the joint is skipped by the solver (but still tracked by the world). */
  public enabled = true;

  /** Whether this joint solves this frame - set in {@link _prepare} (disabled, sleeping or two static bodies → `false`). */
  protected _active = false;

  protected constructor(bodyA: PhysicsBody, bodyB: PhysicsBody, collideConnected = true) {
    this.bodyA = bodyA;
    this.bodyB = bodyB;
    this.collideConnected = collideConnected;
  }

  /** @internal - build this frame's constraint data; called once per fixed step after detection. */
  public abstract _prepare(h: number): void;
  /** @internal - re-apply the accumulated impulse; called each sub-step (TGS-Soft warm-start). */
  public abstract _warmStart(): void;
  /** @internal - one velocity pass; `useBias` is the soft-bias pass, `false` the relax pass. */
  public abstract _solve(useBias: boolean): void;
}
