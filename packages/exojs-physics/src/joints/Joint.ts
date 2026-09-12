import type { PhysicsBody } from '../PhysicsBody';

/**
 * Soft-constraint factors for one sub-step, as the solver's "soft step" uses
 * them: how fast a position error is turned into a bias velocity, how much of
 * the solved impulse is applied, and how much of the accumulated impulse is
 * relaxed away again.
 */
export interface JointSoftness {
  readonly biasRate: number;
  readonly massScale: number;
  readonly impulseScale: number;
}

/**
 * Soft factors for a constraint of `hertz` stiffness at `dampingRatio`, over a
 * sub-step of `h` seconds.
 *
 * The same formulation the contact solver uses. A joint asked for no stiffness
 * of its own still gets these rather than a raw Baumgarte term: an unscaled
 * `0.2 / h` bias applies the full position correction as a velocity every
 * sub-step and relaxes none of the impulse it accumulated, which a single joint
 * absorbs and a serial chain does not - each link hands its neighbour an
 * over-correction that the next sub-step corrects again.
 */
export const softConstraint = (hertz: number, dampingRatio: number, h: number): JointSoftness => {
  if (hertz <= 0) {
    return { biasRate: 0, massScale: 1, impulseScale: 0 };
  }

  const omega = 2 * Math.PI * hertz;
  const a1 = 2 * dampingRatio + h * omega;
  const a2 = h * omega * a1;
  const a3 = 1 / (1 + a2);

  return { biasRate: omega / a1, massScale: a2 * a3, impulseScale: a3 };
};

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
   * The default is nevertheless `true`, which is the behaviour every joint has
   * had so far: an existing scene built against it would change shape under an
   * update that flipped it. Nothing else argues for `true` any more - a chain
   * of seven links and up used to gain energy without these contacts, and that
   * defect is fixed in the joint solver rather than damped by them - so the
   * default is a compatibility choice and is free to be revisited.
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

  /**
   * @internal - build this frame's constraint data; called once per fixed step
   * after detection. `rigid` carries the solver's soft factors for a joint that
   * asks for no stiffness of its own.
   */
  public abstract _prepare(h: number, rigid: JointSoftness): void;
  /** @internal - re-apply the accumulated impulse; called each sub-step (TGS-Soft warm-start). */
  public abstract _warmStart(): void;
  /** @internal - one velocity pass; `useBias` is the soft-bias pass, `false` the relax pass. */
  public abstract _solve(useBias: boolean): void;
}
