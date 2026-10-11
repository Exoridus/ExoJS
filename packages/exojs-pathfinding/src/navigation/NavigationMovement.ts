import type { PointLike, Seconds } from '@codexo/exojs';

/**
 * What a {@link NavigationAgentComponent} needs from whatever moves its actor:
 * an agent decides where to go next, its movement decides how the motion
 * happens - through a physics world, by writing a node position, or anything
 * else.
 *
 * While navigating, an agent calls {@link move} once in every fixed step it
 * runs in, and {@link stop} once when it stops steering: on arrival, when the
 * destination turns out unreachable, on {@link NavigationAgentComponent.stop}
 * and when it is disabled. A step without a call means there is nothing
 * to ask for.
 *
 * Directions are in the navigation space's coordinates, the same space an
 * agent reads its position in. A movement working in another space - a
 * projected display, say - converts at its own boundary.
 *
 * `KinematicMovementComponent` from `@codexo/exojs-physics` satisfies this
 * contract as it is.
 *
 * @example
 * ```ts
 * class NodeMovement implements NavigationMovement {
 *   public constructor(private readonly node: SceneNode, public readonly maxSpeed: number) {}
 *
 *   public move(direction: Readonly<PointLike>, distance: number, step: Seconds): void {
 *     const travel = Math.min(this.maxSpeed * step, distance);
 *
 *     this.node.x += direction.x * travel;
 *     this.node.y += direction.y * travel;
 *   }
 *
 *   public stop(): void {}
 * }
 * ```
 */
export interface NavigationMovement {
  /**
   * Distance per second that a direction of length `1` covers. An agent reads
   * it to tell how far one step reaches, which decides when it turns toward
   * the next waypoint and how much progress to expect.
   */
  readonly maxSpeed: number;
  /**
   * Requests motion for the fixed step `step` that is being processed, along
   * `direction` - a unit vector from an agent - and over no more than
   * `distance` in total until the next request. An agent passes the distance
   * to its destination on the last stretch and `Infinity` before it, so a
   * movement that keeps applying a request for longer than one step - such as
   * a physics world stepped several times per call - still stops on the
   * destination. Called from an agent's fixed update, so the motion can still
   * be applied within the same step.
   */
  move(direction: Readonly<PointLike>, distance: number, step: Seconds): void;
  /** Ends the motion: the actor should come to rest. */
  stop(): void;
}
