import type { PhysicsBody } from '../PhysicsBody';

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
  /** When `false`, the joint is skipped by the solver (but still tracked by the world). */
  public enabled = true;

  /** Whether this joint solves this frame — set in {@link _prepare} (disabled, sleeping or two static bodies → `false`). */
  protected _active = false;

  protected constructor(bodyA: PhysicsBody, bodyB: PhysicsBody) {
    this.bodyA = bodyA;
    this.bodyB = bodyB;
  }

  /** @internal — build this frame's constraint data; called once per fixed step after detection. */
  public abstract _prepare(h: number): void;
  /** @internal — re-apply the accumulated impulse; called each sub-step (TGS-Soft warm-start). */
  public abstract _warmStart(): void;
  /** @internal — one velocity pass; `useBias` is the soft-bias pass, `false` the relax pass. */
  public abstract _solve(useBias: boolean): void;
}
