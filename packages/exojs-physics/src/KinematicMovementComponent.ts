import { Component, type PointLike, Vector } from '@codexo/exojs';

import type { Collider } from './Collider';
import type { PhysicsBody } from './PhysicsBody';
import type { PhysicsBodyComponent } from './PhysicsBodyComponent';
import { type CastState, createCastState } from './query/QueryEngine';

/**
 * Takes over the per-step motion of a {@link KinematicMovementComponent}: while
 * one is installed, the movement accepts no direct commands and asks the
 * driver for each step's motion instead.
 * @internal
 */
export interface MovementDriver {
  /** Resolves the step about to run, ending in exactly one {@link KinematicMovementComponent._commit}. */
  _driveStep(fixedDelta: number): void;
  /** Runs once the step has moved every body. */
  _afterStep(): void;
}

/**
 * Rewrites the normal a slide pass deflects along, after the pass has
 * travelled up to the contact the normal belongs to.
 * @internal
 */
export interface SlideConstraint {
  _constrainNormal(target: Collider, normal: Vector): void;
}

/**
 * Where a slide or sweep ended, as an offset from the body's current
 * position, and the last contact that shortened it.
 * @internal
 */
export interface SlideResult {
  x: number;
  y: number;
  blocked: boolean;
  target: Collider | null;
  normalX: number;
  normalY: number;
}

/** @internal */
export const createSlideResult = (): SlideResult => ({ x: 0, y: 0, blocked: false, target: null, normalX: 0, normalY: 0 });

/** Construction options for {@link KinematicMovementComponent}. */
export interface KinematicMovementOptions {
  /** Speed in world units per second that a direction of length `1` moves at. */
  readonly maxSpeed: number;
}

/**
 * Gap the movement keeps between its body and whatever stopped it. Ending a
 * step exactly in contact would make the next step's cast start out touching,
 * where floating-point noise decides whether the wall counts as overlapping.
 * @internal
 */
export const contactOffset = 0.01;

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
 * @internal
 */
export const minApproach = 0.1;

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
 * A `CharacterMovementComponent` composed over the movement takes over its
 * commands while that character is enabled: {@link move} then throws, and the
 * character is the body's only source of motion.
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
export class KinematicMovementComponent extends Component {
  /** The physics component whose body this component moves. */
  public readonly physics: PhysicsBodyComponent;

  /** @internal - the component that resolves this movement's steps instead of {@link move}, if any. */
  public _driver: MovementDriver | null = null;

  private _maxSpeed = 0;
  private _directionX = 0;
  private _directionY = 0;
  private _commandEpoch = -1;
  private _budget = 0;
  private _blocked = false;
  private readonly _contactNormal = new Vector();
  private readonly _cast: CastState = createCastState();
  private readonly _best: CastState = createCastState();
  private readonly _slideNormal = new Vector();
  private readonly _ownResult: SlideResult = createSlideResult();
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

  /** @internal */
  public get _followsOthers(): boolean {
    return this._driver !== null;
  }

  /**
   * Moves the body along `direction` during the world's next advance, at
   * {@link maxSpeed} times the direction's length. A direction longer than `1`
   * is shortened to `1`, so analog input below full deflection moves slower
   * and a raw difference vector moves at full speed. The last call before the
   * world advances wins.
   *
   * `distance` caps how far the command travels in total. A
   * `PhysicsWorld.step` call that runs several fixed steps applies the same
   * command to each of them, so a command meant to end on a point - the last
   * stretch to a destination - passes the distance to it and stops there
   * instead of overshooting by the extra steps. Defaults to no cap.
   *
   * @throws RangeError for a non-finite direction or a negative or NaN distance.
   * @throws Error while a `CharacterMovementComponent` drives this movement.
   */
  public move(direction: Readonly<PointLike>, distance = Infinity): void {
    const x = direction.x;
    const y = direction.y;

    if (this._driver !== null) {
      throw new Error(
        'KinematicMovementComponent.move: a CharacterMovementComponent drives this movement. Command the character instead, or disable it first.',
      );
    }

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new RangeError(`KinematicMovementComponent.move: direction must be finite, received (${x}, ${y}).`);
    }

    if (!(distance >= 0)) {
      throw new RangeError(`KinematicMovementComponent.move: distance must be non-negative, received ${distance}.`);
    }

    const length = Math.hypot(x, y);
    const scale = length > 1 ? 1 / length : 1;

    this._directionX = x * scale;
    this._directionY = y * scale;
    this._budget = distance;
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

    if (this._driver !== null) {
      this._driver._driveStep(fixedDelta);

      return;
    }

    if (
      this._commandEpoch !== this.physics.world._stepEpoch ||
      (this._directionX === 0 && this._directionY === 0) ||
      this._maxSpeed === 0 ||
      this._budget <= 0
    ) {
      body.linearVelocityX = 0;
      body.linearVelocityY = 0;
      this._blocked = false;
      this._contactNormal.set(0, 0);

      return;
    }

    const length = Math.hypot(this._directionX, this._directionY);
    const distance = Math.min(this._maxSpeed * fixedDelta * length, this._budget);
    const scale = distance / length;
    const result = this._ownResult;

    this._budget -= distance;
    this._slide(0, 0, this._directionX * scale, this._directionY * scale, null, null, result);
    this._commit(result.x, result.y, fixedDelta, result.blocked, result.normalX, result.normalY);
  }

  /** @internal - forwards the end of a step to the driver. */
  public _afterStep(): void {
    const body = this.physics.body;

    if (this._driver !== null && body.attached && !body.destroyed) {
      this._driver._afterStep();
    }
  }

  /**
   * @internal - slides the body from `(offsetX, offsetY)` along `(dx, dy)`
   * against the geometry as it stands and writes where it ends into `out`.
   * `constraint` may rewrite each blocking normal before the slide deflects
   * along it; nothing in `exclude` blocks. Moves nothing.
   */
  public _slide(
    offsetX: number,
    offsetY: number,
    dx: number,
    dy: number,
    constraint: SlideConstraint | null,
    exclude: ReadonlyArray<PhysicsBody | Collider> | null,
    out: SlideResult,
  ): void {
    const body = this.physics.body;
    const best = this._best;
    const normal = this._slideNormal;

    let remainingX = dx;
    let remainingY = dy;
    let previousNormalX = 0;
    let previousNormalY = 0;

    out.blocked = false;
    out.target = null;
    out.normalX = 0;
    out.normalY = 0;

    for (let pass = 0; pass < maxSlidePasses; pass++) {
      const length = Math.hypot(remainingX, remainingY);

      if (length < 1e-9 || !this._castBody(body, offsetX, offsetY, remainingX, remainingY, exclude)) {
        offsetX += remainingX;
        offsetY += remainingY;
        break;
      }

      const travelled = travelFraction(best, remainingX, remainingY, length);

      out.blocked = true;
      out.target = best.target;
      out.normalX = best.normalX;
      out.normalY = best.normalY;
      offsetX += remainingX * travelled;
      offsetY += remainingY * travelled;
      remainingX -= remainingX * travelled;
      remainingY -= remainingY * travelled;

      normal.set(best.normalX, best.normalY);

      if (constraint !== null && best.target !== null) {
        constraint._constrainNormal(best.target, normal);
      }

      const normalX = normal.x;
      const normalY = normal.y;
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

    out.x = offsetX;
    out.y = offsetY;
  }

  /**
   * @internal - moves the body straight from `(offsetX, offsetY)` along
   * `(dx, dy)` up to the first contact, without sliding, and writes where it
   * ends into `out`. Moves nothing.
   */
  public _sweep(
    offsetX: number,
    offsetY: number,
    dx: number,
    dy: number,
    exclude: ReadonlyArray<PhysicsBody | Collider> | null,
    out: SlideResult,
  ): void {
    const best = this._best;
    const length = Math.hypot(dx, dy);

    out.blocked = false;
    out.target = null;
    out.normalX = 0;
    out.normalY = 0;

    if (length < 1e-9 || !this._castBody(this.physics.body, offsetX, offsetY, dx, dy, exclude)) {
      out.x = offsetX + dx;
      out.y = offsetY + dy;

      return;
    }

    const travelled = travelFraction(best, dx, dy, length);

    out.blocked = true;
    out.target = best.target;
    out.normalX = best.normalX;
    out.normalY = best.normalY;
    out.x = offsetX + dx * travelled;
    out.y = offsetY + dy * travelled;
  }

  /**
   * @internal - sets the body's velocity for the step about to run to the
   * motion `(offsetX, offsetY)` and records what blocked it.
   */
  public _commit(offsetX: number, offsetY: number, fixedDelta: number, blocked: boolean, normalX: number, normalY: number): void {
    const body = this.physics.body;

    this._blocked = blocked;
    this._contactNormal.set(blocked ? normalX : 0, blocked ? normalY : 0);

    if (body.isSleeping && (offsetX !== 0 || offsetY !== 0)) {
      body.wake();
    }

    body.linearVelocityX = offsetX / fixedDelta;
    body.linearVelocityY = offsetY / fixedDelta;
  }

  /** @internal - halts the body without touching a pending command. */
  public _halt(): void {
    const body = this.physics.body;

    this._blocked = false;
    this._contactNormal.set(0, 0);

    if (!body.destroyed) {
      body.linearVelocityX = 0;
      body.linearVelocityY = 0;
    }
  }

  /** Casts every castable collider of the body and keeps the earliest contact in {@link _best}. */
  private _castBody(
    body: PhysicsBody,
    offsetX: number,
    offsetY: number,
    dx: number,
    dy: number,
    exclude: ReadonlyArray<PhysicsBody | Collider> | null,
  ): boolean {
    const queries = this.physics.world._queries;
    const cast = this._cast;
    const best = this._best;

    best.target = null;
    best.fraction = Infinity;
    best.initialOverlap = false;

    for (const collider of body.colliders) {
      if (!isCastable(collider) || !queries._castCollider(collider, offsetX, offsetY, dx, dy, body, cast, exclude)) {
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
}

/**
 * Fraction of `(dx, dy)` travelled before `hit`, backed off to keep the
 * contact offset along the hit normal.
 */
const travelFraction = (hit: CastState, dx: number, dy: number, length: number): number => {
  if (hit.initialOverlap) {
    return 0;
  }

  const approach = -(dx * hit.normalX + dy * hit.normalY) / length;

  return Math.max(0, hit.fraction * length - contactOffset / Math.max(approach, minApproach)) / length;
};

/** @internal - `true` for a collider the movement casts: a non-sensor with an area. */
export const isCastable = (collider: Collider): boolean =>
  !collider.isSensor && collider.shape.type !== 'segment' && collider.shape.type !== 'chain';
