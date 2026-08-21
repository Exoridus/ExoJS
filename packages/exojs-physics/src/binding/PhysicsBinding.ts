import { MathUtils, type SceneNode } from '@codexo/exojs';

import type { PhysicsBody } from '../PhysicsBody';

/**
 * A link between a {@link PhysicsBody} and a {@link SceneNode}. The body's world
 * position **and rotation** are written onto the node (the body's angle is
 * radians; the node's rotation is degrees). The node must be world-space-rooted;
 * runtime scale is ignored and non-zero skew is rejected at bind time.
 *
 * By default the node snaps to the latest fixed-step state after each step. With
 * `PhysicsWorld`'s interpolation enabled the node is instead placed between the
 * body's previous and current fixed states, which smooths motion when the fixed
 * rate is below the frame rate. Either way this is presentation: nothing written
 * onto the node is read back into the simulation.
 */
export class PhysicsBinding {
  public constructor(
    public readonly body: PhysicsBody,
    public readonly node: SceneNode,
  ) {}

  /** Write the body's current transform (position + rotation) onto the bound node. */
  public sync(): void {
    this.node.setPosition(this.body.x, this.body.y);
    this.node.setRotation(MathUtils.radiansToDegrees(this.body.angle));
  }

  /**
   * Place the node `alpha` of the way from the body's previous fixed state to
   * its current one. `alpha` is the host's leftover sub-step fraction, so `0`
   * renders the state the last fixed step started from and values approaching
   * `1` render the state it produced.
   *
   * A plain lerp is correct for the angle too: body angles are continuous and
   * unbounded, never wrapped into a range, so there is no shortest-arc case to
   * resolve.
   */
  public syncInterpolated(alpha: number): void {
    const body = this.body;
    const previousX = body.previousX;
    const previousY = body.previousY;
    const previousAngle = body.previousAngle;

    this.node.setPosition(previousX + (body.x - previousX) * alpha, previousY + (body.y - previousY) * alpha);
    this.node.setRotation(MathUtils.radiansToDegrees(previousAngle + (body.angle - previousAngle) * alpha));
  }
}
