import { Component, type PointLike, Vector } from '@codexo/exojs';

import type { Collider } from './Collider';
import type { PhysicsBody } from './PhysicsBody';
import type { PhysicsBodyComponent } from './PhysicsBodyComponent';
import type { StepController } from './PhysicsWorld';
import { type CastState, createCastState } from './query/QueryEngine';

/** Construction options for {@link KinematicMovementComponent}. */
export interface KinematicMovementOptions {
  /** Speed in world units per second that a direction of length `1` moves at. */
  readonly maxSpeed: number;
}

/**
 * Gap the movement keeps between its body and whatever stopped it. Ending a
 * step exactly in contact would make the next step's cast start out touching,
 * where floating-point noise decides whether the wall counts as overlapping.
 */
const contactOffset = 0.01;

/**
 * Slide passes per step: the first contact, the wall slid along, and a corner
 * where a second wall ends the slide. A third redirect only arises in geometry
 * that converges on the body, where stopping is the right answer.
 */
const maxSlidePasses = 4;

/**
 * Lowest approach cosine the contact offset is divided by. Backing off along a
 * grazing motion to open the gap along the normal would otherwise give up most
 * of the step; this caps the backoff at ten offsets.
 */
const minApproach = 0.1;

/**
 * Moves a kinematic body in requested directions without passing through
 * colliders: blocked motion stops at the obstacle and slides along it, and a
 * corner between two walls stops it.
 *
 * Call {@link move} with the direction for the coming step. A command lasts
 * until the world has advanced once - one `PhysicsWorld.fixedUpdate`, or
 * one `PhysicsWorld.step` call that ran at least one fixed step - and the
 * body stands still in any step no command was given for. Issue it every fixed
 * step while the body should move, typically from a
 * `BehaviorComponent.fixedUpdate`, which runs before a world registered
 * as a scene system steps. Nothing has to be cleared when the controlling code
 * stops: no command means no motion.
 *
 * The world resolves the command at the start of its step against the
 * geometry as it then stands, sets the body's velocity to the motion it found
 * and integrates it like any kinematic motion, so contacts, interpolation and
 * the bound node see continuous movement rather than a teleport. The body
 * stays the single transform authority. Motion is translation only; the
 * body's angular velocity is left to the caller.
 *
 * Every non-sensor circle, capsule and polygon collider of the body is cast,
 * under its own collision filter. Static, kinematic and dynamic colliders
 * block alike - a dynamic body in the way stops the movement rather than being
 * pushed - and sensors never block. Two movements moving towards each other in
 * one step each cast against the other's position before the step.
 *
 * The component holds the body's movement while it is active: enabling a
 * second movement for the same body throws. Disabling it zeroes the body's
 * velocity. Positions and directions are in the world's simulation space.
 *
 * @example
 * ```ts
 * const physics = hero.addComponent(new PhysicsBodyComponent(world, { type: 'kinematic', colliders: [{ shape: new CircleShape(12) }] }));
 * const movement = hero.addComponent(new KinematicMovementComponent(physics, { maxSpeed: 180 }));
 *
 * class Steering extends BehaviorComponent {
 *   public override fixedUpdate(): void {
 *     movement.move(input.direction);
 *   }
 * }
 * ```
 */
export class KinematicMovementComponent extends Component implements StepController {
  /** The physics component whose body this component moves. */
  public readonly physics: PhysicsBodyComponent;

  private _maxSpeed = 0;
  private _directionX = 0;
  private _directionY = 0;
  private _commandEpoch = -1;
  private _blocked = false;
  private readonly _contactNormal = new Vector();
  private readonly _cast: CastState = createCastState();
  private readonly _best: CastState = createCastState();
  private _registered = false;

  /**
   * @throws TypeError when the physics component's body is not kinematic.
   * @throws RangeError when `maxSpeed` is negative or not finite.
   */
  public constructor(physics: PhysicsBodyComponent, options: KinematicMovementOptions) {
    super();

    if (physics.body.type !== 'kinematic') {
      throw new TypeError(
        `KinematicMovementComponent: the body is '${physics.body.type}', but only a kinematic body takes its motion from the movement. Create the PhysicsBodyComponent with type 'kinematic'.`,
      );
    }

    this.physics = physics;
    this.maxSpeed = options.maxSpeed;
  }

  /** The moved body. */
  public get body(): PhysicsBody {
    return this.physics.body;
  }

  /** Speed in world units per second for a direction of length `1`. */
  public get maxSpeed(): number {
    return this._maxSpeed;
  }

  /** @throws RangeError when negative or not finite. */
  public set maxSpeed(value: number) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`KinematicMovementComponent: maxSpeed must be a finite non-negative number, received ${value}.`);
    }

    this._maxSpeed = value;
  }

  /**
   * `true` when a collider shortened the motion of the last resolved step.
   * Reset by the next step that resolves a command.
   */
  public get blocked(): boolean {
    return this._blocked;
  }

  /**
   * Surface normal of the last collider that shortened the motion, pointing
   * away from it; zero when the last step was not {@link blocked}.
   */
  public get contactNormal(): Readonly<Vector> {
    return this._contactNormal;
  }

  /**
   * Moves the body along `direction` during the world's next fixed step, at
   * {@link maxSpeed} times the direction's length. A direction longer than `1`
   * is shortened to `1`, so analog input below full deflection moves slower
   * and a raw difference vector moves at full speed. The last call before the
   * step wins.
   *
   * @throws RangeError for a non-finite direction.
   */
  public move(direction: Readonly<PointLike>): void {
    const x = direction.x;
    const y = direction.y;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new RangeError(`KinematicMovementComponent.move: direction must be finite, received (${x}, ${y}).`);
    }

    const length = Math.hypot(x, y);
    const scale = length > 1 ? 1 / length : 1;

    this._directionX = x * scale;
    this._directionY = y * scale;
    this._commandEpoch = this.physics.world._stepEpoch;
  }

  /** Cancels a pending command and halts the body at once. */
  public stop(): void {
    this._commandEpoch = -1;
    this._directionX = 0;
    this._directionY = 0;
    this._halt();
  }

  protected override onEnable(): void {
    const body = this.physics.body;

    if (body._movement !== null && body._movement !== this) {
      throw new Error(
        'KinematicMovementComponent: the body is already moved by another KinematicMovementComponent. Disable that one first.',
      );
    }

    body._movement = this;
    this.physics.world._addStepController(this);
    this._registered = true;
  }

  protected override onDisable(): void {
    const body = this.physics.body;

    if (body._movement === this) {
      body._movement = null;
    }

    if (this._registered) {
      this._registered = false;
      this.physics.world._removeStepController(this);
    }

    this._commandEpoch = -1;
    this._halt();
  }

  /** @internal - resolves the pending command into the body's velocity for the step about to run. */
  public _beforeStep(fixedDelta: number): void {
    const body = this.physics.body;

    if (!body.attached || body.destroyed) {
      return;
    }

    if (
      this._commandEpoch !== this.physics.world._stepEpoch ||
      (this._directionX === 0 && this._directionY === 0) ||
      this._maxSpeed === 0
    ) {
      body.linearVelocityX = 0;
      body.linearVelocityY = 0;
      this._blocked = false;
      this._contactNormal.set(0, 0);

      return;
    }

    const distance = this._maxSpeed * fixedDelta;

    this._resolve(body, this._directionX * distance, this._directionY * distance, fixedDelta);
  }

  private _resolve(body: PhysicsBody, desiredX: number, desiredY: number, fixedDelta: number): void {
    const best = this._best;

    let offsetX = 0;
    let offsetY = 0;
    let remainingX = desiredX;
    let remainingY = desiredY;
    let previousNormalX = 0;
    let previousNormalY = 0;
    let blocked = false;

    for (let pass = 0; pass < maxSlidePasses; pass++) {
      const length = Math.hypot(remainingX, remainingY);

      if (length < 1e-9 || !this._castBody(body, offsetX, offsetY, remainingX, remainingY)) {
        offsetX += remainingX;
        offsetY += remainingY;
        break;
      }

      const normalX = best.normalX;
      const normalY = best.normalY;
      const approach = -(remainingX * normalX + remainingY * normalY) / length;
      const travel = best.initialOverlap ? 0 : Math.max(0, best.fraction * length - contactOffset / Math.max(approach, minApproach));
      const travelled = travel / length;

      blocked = true;
      this._contactNormal.set(normalX, normalY);
      offsetX += remainingX * travelled;
      offsetY += remainingY * travelled;
      remainingX -= remainingX * travelled;
      remainingY -= remainingY * travelled;

      const into = remainingX * normalX + remainingY * normalY;

      if (into < 0) {
        remainingX -= into * normalX;
        remainingY -= into * normalY;
      }

      // Two walls meeting at less than a straight angle leave no direction in
      // 2D that slides along both, so the slide off the second one would only
      // walk back into the first.
      if (pass > 0 && remainingX * previousNormalX + remainingY * previousNormalY < 0) {
        break;
      }

      previousNormalX = normalX;
      previousNormalY = normalY;
    }

    if (!blocked) {
      this._contactNormal.set(0, 0);
    }

    this._blocked = blocked;

    if (body.isSleeping) {
      body.wake();
    }

    body.linearVelocityX = offsetX / fixedDelta;
    body.linearVelocityY = offsetY / fixedDelta;
  }

  /** Casts every castable collider of the body and keeps the earliest contact in {@link _best}. */
  private _castBody(body: PhysicsBody, offsetX: number, offsetY: number, dx: number, dy: number): boolean {
    const queries = this.physics.world._queries;
    const cast = this._cast;
    const best = this._best;

    best.target = null;
    best.fraction = Infinity;
    best.initialOverlap = false;

    for (const collider of body.colliders) {
      if (!isCastable(collider) || !queries._castCollider(collider, offsetX, offsetY, dx, dy, body, cast)) {
        continue;
      }

      if (cast.fraction < best.fraction || (cast.initialOverlap && !best.initialOverlap)) {
        best.target = cast.target;
        best.fraction = cast.fraction;
        best.normalX = cast.normalX;
        best.normalY = cast.normalY;
        best.initialOverlap = cast.initialOverlap;
        best.penetration = cast.penetration;
      }
    }

    return best.target !== null;
  }

  private _halt(): void {
    const body = this.physics.body;

    this._blocked = false;
    this._contactNormal.set(0, 0);

    if (!body.destroyed) {
      body.linearVelocityX = 0;
      body.linearVelocityY = 0;
    }
  }
}

const isCastable = (collider: Collider): boolean =>
  !collider.isSensor && collider.shape.type !== 'segment' && collider.shape.type !== 'chain';
