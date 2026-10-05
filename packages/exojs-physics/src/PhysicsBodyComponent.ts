import { Component } from '@codexo/exojs';

import { nodeWorldAngle, nodeWorldPosition } from './binding/nodeWorldTransform';
import { type BodyOptions, PhysicsBody } from './PhysicsBody';
import type { PhysicsWorld } from './PhysicsWorld';

/**
 * Gives a scene node a {@link PhysicsBody} whose world membership follows the
 * component's lifecycle. While the component is active the body is in
 * {@link world} and drives the node. Whenever the component is disabled -
 * switched off, its node removed or reparented, its scene retained or ended -
 * the body leaves the world with its state kept, and the next activation puts
 * the same body back. Destroying the component, or its node, destroys the
 * body. Pausing the scene changes nothing here: a world registered as that
 * scene's system stops stepping with it, a world owned elsewhere keeps going.
 *
 * The body exists from construction, so {@link body} can be configured before
 * the node enters a scene. Unless `options.position` or `options.angle` is
 * given, the first activation places the body at the node's current world
 * position or rotation. The node must be world-space-rooted, as for
 * {@link PhysicsWorld.bind}.
 *
 * The world is never inferred: a node moved into a scene that steps another
 * world keeps this component's body in the world it was given. A
 * component-managed body cannot be constrained by a joint, and
 * {@link PhysicsWorld.addJoint} rejects it; use a manually managed
 * {@link PhysicsBody} for jointed bodies.
 *
 * @example
 * ```ts
 * const physics = ball.addComponent(new PhysicsBodyComponent(world, { colliders: [{ shape: new CircleShape(12) }] }));
 *
 * physics.body.applyImpulse(0, -300);
 * ```
 */
export class PhysicsBodyComponent extends Component {
  /** The world the body joins while the component is active. */
  public readonly world: PhysicsWorld;
  /** The body this component owns. Leave its world membership to the component. */
  public readonly body: PhysicsBody;

  private _adoptNodePosition: boolean;
  private _adoptNodeAngle: boolean;

  public constructor(world: PhysicsWorld, options: BodyOptions = {}) {
    super();
    this.world = world;
    this.body = new PhysicsBody(options);
    this.body._componentManaged = true;
    this._adoptNodePosition = options.position === undefined;
    this._adoptNodeAngle = options.angle === undefined;
  }

  protected override onEnable(): void {
    const body = this.body;
    const node = this.node;

    // Only the first successful activation reads the node: from then on the
    // body is the transform authority, and the node merely shows where it is.
    // A failed attempt leaves the flags set, so the retry reads the node anew.
    if (this._adoptNodePosition || this._adoptNodeAngle) {
      body.setTransform(this._adoptNodePosition ? nodeWorldPosition(node) : body.position, this._adoptNodeAngle ? nodeWorldAngle(node) : body.angle);
    }

    this.world.add(body);

    try {
      this.world.bind(body, node);
    } catch (error) {
      // A failed enable leaves the component inactive; the body must not keep
      // simulating behind it.
      this.world.remove(body);
      throw error;
    }

    this._adoptNodePosition = false;
    this._adoptNodeAngle = false;
  }

  protected override onDisable(): void {
    // A body the world already destroyed (the world itself ended first) has
    // nothing left to leave.
    if (!this.body.destroyed) {
      this.world.remove(this.body);
    }
  }

  protected override onDestroy(): void {
    const body = this.body;

    if (body.destroyed) {
      return;
    }

    if (body.attached) {
      this.world.destroyBody(body);
    } else {
      body._discard();
    }
  }
}
