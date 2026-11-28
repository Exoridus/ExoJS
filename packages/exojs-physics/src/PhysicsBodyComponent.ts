import { Component, type Scene, type SceneNode } from '@codexo/exojs';

import { nodeWorldAngle, nodeWorldPosition } from './binding/nodeWorldTransform';
import { type BodyOptions, PhysicsBody } from './PhysicsBody';
import { PhysicsWorld } from './PhysicsWorld';

/**
 * Gives a scene node a {@link PhysicsBody} whose world membership follows the
 * component's lifecycle. While the component is active the body is in
 * {@link world} and drives the node. Whenever the component is disabled -
 * switched off, its node removed from its scene, its scene retained or ended -
 * the body leaves the world with its state kept, and the next activation puts
 * the same body back. Moving the node to another parent of the same scene is
 * not a disable: the body stays in the world, keeps its contacts and state,
 * and keeps driving the node. Destroying the component, or its node, destroys the
 * body. Pausing the scene changes nothing here: a world registered as that
 * scene's system stops stepping with it, a world owned elsewhere keeps going.
 *
 * The body exists from construction, so {@link body} can be configured before
 * the node enters a scene. Unless `options.position` or `options.angle` is
 * given, the first activation places the body at the node's current world
 * pivot or rotation, including its anchor or pixel origin. The body drives
 * the pose through translated and rotated parents; see {@link PhysicsWorld.bind}.
 *
 * With only body options, activation requires one live PhysicsWorld registered
 * in the scene. It keeps that world across activations. Removing that system
 * disables automatically resolved components. To use a different world,
 * replace this component with one authored for the destination. Pass a world
 * explicitly for scenes with several worlds or for a manually stepped world. A
 * component-managed body cannot be constrained by a joint, and
 * {@link PhysicsWorld.addJoint} rejects it; use a manually managed
 * {@link PhysicsBody} for jointed bodies.
 *
 * @example
 * ```ts
 * const physics = ball.addComponent(new PhysicsBodyComponent({ colliders: [{ shape: new CircleShape(12) }] }));
 *
 * physics.body.applyImpulse(0, -300);
 * ```
 */
export class PhysicsBodyComponent extends Component {
  /** The body this component owns. Leave its world membership to the component. */
  public readonly body: PhysicsBody;

  private readonly _explicitWorld: boolean;
  private _world: PhysicsWorld | null;
  private _joined = false;
  private _adoptNodePosition: boolean;
  private _adoptNodeAngle: boolean;

  public constructor(options?: BodyOptions);
  public constructor(world: PhysicsWorld, options?: BodyOptions);
  public constructor(worldOrOptions?: PhysicsWorld | BodyOptions, options: BodyOptions = {}) {
    super();
    const world = worldOrOptions instanceof PhysicsWorld ? worldOrOptions : null;

    options = worldOrOptions instanceof PhysicsWorld ? options : (worldOrOptions ?? options);
    this._explicitWorld = world !== null;
    this._world = world;
    this.body = new PhysicsBody(options);
    this.body._componentManaged = true;
    this._adoptNodePosition = options.position === undefined;
    this._adoptNodeAngle = options.angle === undefined;
  }

  /** The explicit or first successfully resolved world. Throws before automatic resolution. */
  public get world(): PhysicsWorld {
    if (this._world === null) {
      throw new Error('PhysicsBodyComponent.world: the world resolves on the first successful scene activation.');
    }

    return this._world;
  }

  /** The world currently hosting this component's body, or null while inactive. */
  public get activeWorld(): PhysicsWorld | null {
    return this._joined && this._world !== null && !this.body.destroyed && this.body._isMemberOf(this._world) ? this._world : null;
  }

  /** @internal */
  public get _selectedWorld(): PhysicsWorld | null {
    return this._world;
  }

  protected override onAttach(): void {
    const movement = this.body._movement;

    if (movement !== null && !movement._canMoveNode(this.node)) {
      this.body._movement = null;
    }
  }

  protected override onEnable(): void {
    const body = this.body;
    const node = this.node;
    const scene = this.scene!;
    const world = this._explicitWorld ? this.world : this._resolveWorld(scene);
    const membership = this._explicitWorld ? null : world._sceneMembership;

    this._adoptPose(node);
    world.add(body);

    let joined = false;

    try {
      world.bind(body, node);

      if (this.destroyed || !this.enabled || !this.attached || this.node !== node || this.scene !== scene) {
        return;
      }

      if (world.destroyed || (membership !== null && (world._sceneMembership !== membership || !membership.belongsTo(scene)))) {
        throw new Error('PhysicsBodyComponent: the world became unavailable during activation.');
      }

      body._movement?._joinWorld(world);
      joined = true;
    } finally {
      if (!joined) {
        world.unbind(body);

        if (!body.destroyed && !world.destroyed && body._isMemberOf(world)) {
          if (this.destroyed) {
            world.destroyBody(body);
          } else {
            world.remove(body);
          }
        }
      }
    }

    this._world = world;
    this._joined = true;
    membership?.components.add(this);
    this._adoptNodePosition = false;
    this._adoptNodeAngle = false;
  }

  protected override onDisable(): void {
    if (!this._explicitWorld) {
      this._world?._sceneMembership?.components.delete(this);
    }

    this._joined = false;

    // A body the world already destroyed (the world itself ended first), or one
    // the caller removed from the world directly, has nothing left to leave.
    if (this._world !== null && !this.body.destroyed && this.body._isMemberOf(this._world)) {
      this.body._movement?._leaveWorld();
      this.world.unbind(this.body);
      this.world.remove(this.body);
    }
  }

  protected override onDestroy(): void {
    const body = this.body;

    if (body.destroyed) {
      return;
    }

    if (body.attached) {
      // The first inferred activation owns rollback until it publishes the world.
      this._world?.destroyBody(body);
    } else {
      body._discard();
    }
  }

  private _adoptPose(node: SceneNode): void {
    // A failed activation keeps the flags set so a retry can read the new pose.
    if (this._adoptNodePosition || this._adoptNodeAngle) {
      const body = this.body;
      const position = this._adoptNodePosition ? nodeWorldPosition(node) : body.position;
      const angle = this._adoptNodeAngle ? nodeWorldAngle(node) : body.angle;

      if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(angle)) {
        throw new Error('PhysicsBodyComponent: the initial world pose must be finite.');
      }

      body.setTransform(position, angle);
    }
  }

  private _resolveWorld(scene: Scene): PhysicsWorld {
    if (this._world !== null) {
      if (this._world._sceneMembership?.belongsTo(scene) === true) {
        return this._world;
      }

      throw new Error(
        'PhysicsBodyComponent: its original PhysicsWorld is unavailable in this scene. Replace the component to use another world.',
      );
    }

    let candidate: PhysicsWorld | null = null;

    for (const world of scene.systems.findAll(PhysicsWorld)) {
      if (world._sceneMembership?.belongsTo(scene) !== true) {
        continue;
      }

      if (candidate !== null) {
        throw new Error('PhysicsBodyComponent: multiple PhysicsWorld systems in this scene; pass the desired world explicitly.');
      }

      candidate = world;
    }

    if (candidate === null) {
      throw new Error('PhysicsBodyComponent: no live PhysicsWorld in this scene. Register one or pass a world explicitly.');
    }

    return candidate;
  }
}
