import { MathUtils, type SceneNode } from '@codexo/exojs';

import type { PhysicsBody } from '../PhysicsBody';

/**
 * A link between a {@link PhysicsBody} and a {@link SceneNode}. After each
 * {@link PhysicsWorld.step}, the body's world position **and rotation** are
 * written onto the node (the body's angle is radians; the node's rotation is
 * degrees). The node must be world-space-rooted; runtime scale is ignored and
 * non-zero skew is rejected at bind time.
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
}
