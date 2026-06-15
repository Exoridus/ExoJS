import type { SceneNode } from '@codexo/exojs';

import type { PhysicsBody } from '../PhysicsBody';

/** Options for {@link PhysicsWorld.bind}. */
export interface BindingOptions {
  /**
   * Which way the transform flows. `'body-to-node'` (default) writes the body's
   * transform onto the node each step — for dynamic and kinematic-position
   * bodies. `'node-to-body'` (read the node, drive the body) is reserved for the
   * kinematic-velocity follow-up and currently behaves like `'body-to-node'`.
   */
  drive?: 'body-to-node' | 'node-to-body';
}

/**
 * A link between a {@link PhysicsBody} and a {@link SceneNode}. After each
 * {@link PhysicsWorld.step}, the body's world position is written onto the node.
 * Rotation is written once dynamics ship (a body cannot rotate under contacts in
 * this collision/query release). The node must be world-space-rooted; runtime
 * scale is ignored and non-zero skew is rejected at bind time.
 */
export class PhysicsBinding {
  public constructor(
    public readonly body: PhysicsBody,
    public readonly node: SceneNode,
    public readonly drive: 'body-to-node' | 'node-to-body' = 'body-to-node',
  ) {}

  /** Write the body's current transform onto the bound node. */
  public sync(): void {
    this.node.setPosition(this.body.x, this.body.y);
  }
}
