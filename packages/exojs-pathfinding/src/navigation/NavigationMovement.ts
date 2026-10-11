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
 *   public move(direction: Readonly<PointLike>, step: Seconds): void {
 *     this.node.x += direction.x * this.maxSpeed * step;
 *     this.node.y += direction.y * this.maxSpeed * step;
 *   }
 *
 *   public stop(): void {}
 * }
 * ```
 */
export interface NavigationMovement {
  /**
   * Distance per second that a direction of length `1` covers. An agent reads
   * it every step to slow down onto its destination instead of overshooting it.
   */
  readonly maxSpeed: number;
  /**
   * Requests motion for the fixed step `step` that is being processed:
   * `direction` has a length of at most `1`, which scales {@link maxSpeed}.
   * Called from an agent's fixed update, so the motion can still be applied
   * within the same step.
   */
  move(direction: Readonly<PointLike>, step: Seconds): void;
  /** Ends the motion: the actor should come to rest. */
  stop(): void;
}
