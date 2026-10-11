import { Component, type PointLike, Vector } from '@codexo/exojs';

import type { Collider } from './Collider';
import {
  contactOffset,
  createSlideResult,
  isCastable,
  type KinematicMovementComponent,
  type MovementDriver,
  type SlideConstraint,
  type SlideResult,
} from './KinematicMovementComponent';
import type { PhysicsBody } from './PhysicsBody';
import type { ContactVisitor } from './query/QueryEngine';

/** Construction options for {@link CharacterMovementComponent}. */
export interface CharacterMovementOptions {
  /** Direction the character stands up along, in simulation space; normalized. Default `(0, -1)`. */
  readonly up?: Readonly<PointLike>;
  /**
   * Downward acceleration along `-up` in world units per second squared.
   * Defaults to the world's gravity projected onto `-up` when the component is
   * constructed, or `0` when that points up.
   */
  readonly gravity?: number;
  /** Steepest surface, in radians from `up`, the character stands on. In `[0, π/2)`. Default `π/4`. */
  readonly maxSlopeAngle?: number;
  /** Tallest obstacle the character steps onto while walking, in world units. Default `0`. */
  readonly maxStepHeight?: number;
  /** Fastest the character falls along `-up`, in world units per second. Default `Infinity`. */
  readonly maxFallSpeed?: number;
}

type SlideMode = 'walk' | 'snap' | 'air';

/**
 * How far below the body the support probe reaches. A slide ends at most
 * `contactOffset / minApproach` (`0.1`) short of the surface that stopped it,
 * so twice that keeps a body that came to rest on its support counted as
 * standing without reaching surfaces it is visibly apart from.
 */
const supportProbe = 0.2;

/** Shortest motion worth casting; anything below is rounding. */
const negligible = 1e-6;

/**
 * Moves a character over surfaces: walking along the ground, falling under
 * gravity, launching into the air, climbing walkable slopes and small steps,
 * staying on the ground over small dips, and riding moving platforms. It
 * composes over a {@link KinematicMovementComponent}, which stays the only
 * thing that moves the body; while the character is enabled it issues the
 * movement's commands and `KinematicMovementComponent.move` throws.
 *
 * Call {@link move} with the walking input for the coming step and
 * {@link launch} to throw the character into the air. Whether a jump is
 * allowed - only from the ground, a second time in the air, shortly after
 * leaving a ledge - is the game's decision: {@link grounded} and the other
 * contact state are there to make it, and `launch` works anywhere.
 *
 * Every fixed step the world runs, the character integrates gravity, walks
 * along the surface it stands on at the movement's `maxSpeed`, and casts the
 * result through the movement's collide-and-slide. A `PhysicsWorld.step` call
 * that runs several fixed steps integrates each of them and applies the same
 * walking input to all of them, like a movement command. Contact state - which
 * surface supports the character, which walls and ceilings the last step ran
 * into - describes the end of the latest completed step, so a `fixedUpdate`
 * reading it before the world steps sees the pose the character is in.
 *
 * A surface supports the character when it lies within the walkable angle of
 * {@link up} and touches the body's underside. Sensors, and colliders the
 * body's filters exclude, never support it. One-way platforms are open
 * `ChainShape`s, which block only from the side their normal points to: the
 * character jumps through one from below and lands on it from above. Dropping
 * through one is a game rule; clear the platform's category from the
 * character collider's filter mask until the character is below it.
 *
 * Standing on a moving body carries the character with the body's velocity at
 * the character's position, including its rotation, but the character itself
 * never rotates. Leaving the support keeps that velocity, and launching from
 * it adds it to the launch. A support moved by teleporting carries nothing.
 *
 * @example
 * ```ts
 * const physics = hero.addComponent(
 *   new PhysicsBodyComponent(world, { type: 'kinematic', colliders: [{ shape: new CapsuleShape(0, -12, 0, 12, 8) }] }),
 * );
 * const movement = hero.addComponent(new KinematicMovementComponent(physics, { maxSpeed: 240 }));
 * const character = hero.addComponent(new CharacterMovementComponent(movement, { gravity: 1600, maxStepHeight: 8 }));
 *
 * class Controls extends BehaviorComponent {
 *   public override fixedUpdate(): void {
 *     character.move(input.horizontal);
 *
 *     if (input.jumpPressed && character.grounded) {
 *       character.launch({ x: 0, y: -520 });
 *     }
 *   }
 * }
 * ```
 */
export class CharacterMovementComponent extends Component implements MovementDriver, SlideConstraint, ContactVisitor {
  /** The movement this component drives. */
  public readonly movement: KinematicMovementComponent;

  private readonly _up = new Vector(0, -1);
  private _gravity = 0;
  private _maxSlopeAngle = Math.PI / 4;
  private _minWalkableCos = Math.cos(Math.PI / 4);
  private _maxStepHeight = 0;
  private _maxFallSpeed = Infinity;

  private _input = 0;
  private _inputEpoch = -1;
  private _launchPending = false;
  private _launchX = 0;
  private _launchY = 0;
  private _freeX = 0;
  private _freeY = 0;

  private _probed = false;
  private _grounded = false;
  private _groundCollider: Collider | null = null;
  private readonly _groundNormal = new Vector();
  private _groundOverlap = 0;
  private _onWall = false;
  private _onCeiling = false;
  private readonly _wallNormal = new Vector();
  private readonly _velocity = new Vector();

  /** What the slide in progress is for; decides how {@link _constrainNormal} treats its contacts. */
  private _slideMode: SlideMode = 'air';
  private _airborne = false;
  private _wallBlocked = false;
  private _probeCandidate: Collider | null = null;
  private _probeDepth = 0;
  private _probeAlong = 0;
  private _probeNormalX = 0;
  private _probeNormalY = 0;
  private _carryX = 0;
  private _carryY = 0;
  private readonly _exclude: PhysicsBody[] = [];
  private readonly _walk: SlideResult = createSlideResult();
  private readonly _scratch: SlideResult = createSlideResult();
  private readonly _step: SlideResult = createSlideResult();

  /**
   * @throws RangeError for an invalid option; see the matching property.
   */
  public constructor(movement: KinematicMovementComponent, options: CharacterMovementOptions = {}) {
    super();

    this.movement = movement;

    if (options.up !== undefined) {
      this.up = options.up;
    }

    const gravity = movement.physics.world.gravity;

    this.gravity = options.gravity ?? Math.max(0, -(gravity.x * this._up.x + gravity.y * this._up.y));
    this.maxSlopeAngle = options.maxSlopeAngle ?? Math.PI / 4;
    this.maxStepHeight = options.maxStepHeight ?? 0;
    this.maxFallSpeed = options.maxFallSpeed ?? Infinity;
  }

  /**
   * Unit direction the character stands up along. Assigning normalizes the
   * value and re-evaluates the support at the next step.
   *
   * @throws RangeError for a zero or non-finite direction.
   */
  public get up(): Readonly<Vector> {
    return this._up;
  }

  public set up(value: Readonly<PointLike>) {
    const length = Math.hypot(value.x, value.y);

    if (!Number.isFinite(length) || length === 0) {
      throw new RangeError(`CharacterMovementComponent: up must be a finite non-zero direction, received (${value.x}, ${value.y}).`);
    }

    this._up.set(value.x / length, value.y / length);
    this._probed = false;
  }

  /** @throws RangeError when negative or not finite. */
  public get gravity(): number {
    return this._gravity;
  }

  public set gravity(value: number) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`CharacterMovementComponent: gravity must be a finite non-negative number, received ${value}.`);
    }

    this._gravity = value;
  }

  /** @throws RangeError outside `[0, π/2)`. */
  public get maxSlopeAngle(): number {
    return this._maxSlopeAngle;
  }

  public set maxSlopeAngle(value: number) {
    if (!(value >= 0 && value < Math.PI / 2)) {
      throw new RangeError(`CharacterMovementComponent: maxSlopeAngle must be in [0, π/2) radians, received ${value}.`);
    }

    this._maxSlopeAngle = value;
    this._minWalkableCos = Math.cos(value);
  }

  /** @throws RangeError when negative or not finite. */
  public get maxStepHeight(): number {
    return this._maxStepHeight;
  }

  public set maxStepHeight(value: number) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`CharacterMovementComponent: maxStepHeight must be a finite non-negative number, received ${value}.`);
    }

    this._maxStepHeight = value;
  }

  /** @throws RangeError when not positive. */
  public get maxFallSpeed(): number {
    return this._maxFallSpeed;
  }

  public set maxFallSpeed(value: number) {
    if (!(value > 0)) {
      throw new RangeError(`CharacterMovementComponent: maxFallSpeed must be positive, received ${value}.`);
    }

    this._maxFallSpeed = value;
  }

  /**
   * `true` when a walkable surface supported the character at the end of the
   * latest step and the character was not moving away from it.
   */
  public get grounded(): boolean {
    return this._grounded && this._supportAlive();
  }

  /** Unit normal of the supporting surface, pointing away from it; zero when not {@link grounded}. */
  public get groundNormal(): Readonly<Vector> {
    if (!this.grounded) {
      this._groundNormal.set(0, 0);
    }

    return this._groundNormal;
  }

  /** The collider the character stands on; a chain is reported as the chain. `null` when not {@link grounded}. */
  public get groundCollider(): Collider | null {
    return this.grounded ? this._groundCollider : null;
  }

  /** The body the character stands on, or `null` when not {@link grounded}. */
  public get groundBody(): PhysicsBody | null {
    return this.grounded ? this._groundCollider!.body : null;
  }

  /** `true` when the latest step ran into a surface too steep to stand on that is not a ceiling. */
  public get onWall(): boolean {
    return this._onWall;
  }

  /** Normal of the wall the latest step ran into, pointing away from it; zero when not {@link onWall}. */
  public get wallNormal(): Readonly<Vector> {
    return this._wallNormal;
  }

  /** `true` when the latest step ran into a surface facing down within the walkable angle. */
  public get onCeiling(): boolean {
    return this._onCeiling;
  }

  /**
   * Velocity the latest step actually moved the character at, in world units
   * per second: walking, falling and being carried, after collisions. Zero
   * before the first step.
   */
  public get velocity(): Readonly<Vector> {
    return this._velocity;
  }

  /**
   * Walks along the ground during the world's next advance, at the movement's
   * `maxSpeed` times `input`: positive towards the right of {@link up} (`+x`
   * for the default up), negative towards the left. `input` is clamped to
   * `[-1, 1]`. In the air the same input steers sideways. Like a movement
   * command it lasts until the world has advanced once, so issue it every
   * fixed step; the last call before the world advances wins.
   *
   * @throws RangeError for a non-finite input.
   */
  public move(input: number): void {
    if (!Number.isFinite(input)) {
      throw new RangeError(`CharacterMovementComponent.move: input must be finite, received ${input}.`);
    }

    this._input = Math.min(1, Math.max(-1, input));
    this._inputEpoch = this.movement.physics.world._stepEpoch;
  }

  /**
   * Replaces the character's airborne velocity with `velocity`, in world units
   * per second, at the start of the next fixed step, and lets it leave the
   * ground. Launching from a moving support adds the support's velocity.
   * Gravity then acts on it until the character lands, hits a ceiling or wall
   * that absorbs it, or is launched again. Walking input adds on top and is
   * not part of it.
   *
   * Applies once, however many fixed steps the next advance runs, and works
   * whether or not the character is {@link grounded}. Launching with zero
   * velocity cancels the airborne velocity.
   *
   * @throws RangeError for a non-finite velocity.
   */
  public launch(velocity: Readonly<PointLike>): void {
    if (!Number.isFinite(velocity.x) || !Number.isFinite(velocity.y)) {
      throw new RangeError(`CharacterMovementComponent.launch: velocity must be finite, received (${velocity.x}, ${velocity.y}).`);
    }

    this._launchPending = true;
    this._launchX = velocity.x;
    this._launchY = velocity.y;
  }

  protected override onEnable(): void {
    const movement = this.movement;

    if (movement._driver !== null && movement._driver !== this) {
      throw new Error(
        'CharacterMovementComponent: the movement is already driven by another CharacterMovementComponent. Disable that one first.',
      );
    }

    // A command issued to the movement before the takeover is not the
    // character's and must not run once the movement is handed back.
    movement.stop();
    movement._driver = this;
    this._reset();
  }

  protected override onDisable(): void {
    if (this.movement._driver === this) {
      this.movement._driver = null;
    }

    this._reset();
    this.movement.stop();
  }

  /** @internal */
  public _driveStep(fixedDelta: number): void {
    const upX = this._up.x;
    const upY = this._up.y;
    const world = this.movement.physics.world;

    if (!this._probed) {
      this._probe();
    }

    if (!this._supportAlive()) {
      this._clearSupport();
    }

    const support = this._groundCollider;
    const input = this._inputEpoch === world._stepEpoch ? this._input : 0;
    const speed = input * this.movement.maxSpeed;
    const launching = this._launchPending;

    let carryX = 0;
    let carryY = 0;

    if (this._grounded && support !== null) {
      this._pointVelocity(support.body);
      carryX = this._carryX;
      carryY = this._carryY;
    }

    this._launchPending = false;
    this._onWall = false;
    this._onCeiling = false;
    this._wallNormal.set(0, 0);

    const result = this._walk;

    this._airborne = !this._grounded || launching;

    if (!this._airborne) {
      this._freeX = 0;
      this._freeY = 0;
      this._walkStep(speed * fixedDelta, carryX, carryY, fixedDelta);
    } else {
      if (launching) {
        this._freeX = this._launchX + carryX;
        this._freeY = this._launchY + carryY;
      }

      this._freeX -= upX * this._gravity * fixedDelta;
      this._freeY -= upY * this._gravity * fixedDelta;

      const fall = -(this._freeX * upX + this._freeY * upY);

      if (fall > this._maxFallSpeed) {
        this._freeX += upX * (fall - this._maxFallSpeed);
        this._freeY += upY * (fall - this._maxFallSpeed);
      }

      const sideways = speed * fixedDelta;

      this._slideMode = 'air';
      this.movement._slide(0, 0, this._freeX * fixedDelta - upY * sideways, this._freeY * fixedDelta + upX * sideways, this, null, result);
    }

    this._velocity.set(result.x / fixedDelta, result.y / fixedDelta);
    this.movement._commit(result.x, result.y, fixedDelta, result.blocked, result.normalX, result.normalY);
  }

  /** @internal */
  public _afterStep(): void {
    this._probe();
  }

  /** @internal - classifies each contact a slide runs into and keeps a walk on the ground. */
  public _constrainNormal(_target: Collider, normal: Vector): void {
    const upX = this._up.x;
    const upY = this._up.y;
    const along = normal.x * upX + normal.y * upY;

    if (this._slideMode === 'snap') {
      // Ground ends the snap where it is met; anything else is slid off.
      if (along >= this._minWalkableCos) {
        normal.set(upX, upY);
      }

      return;
    }

    if (along <= -this._minWalkableCos) {
      this._onCeiling = true;
    } else if (along < this._minWalkableCos) {
      this._onWall = true;
      this._wallNormal.set(normal.x, normal.y);

      // On the ground, a surface too steep to stand on stops the walk like a
      // wall. Sliding along its true normal would carry the character up it.
      if (this._slideMode === 'walk' && along > 0) {
        normal.set(normal.x - along * upX, normal.y - along * upY);
        normal.normalize();
      }

      if (this._slideMode === 'walk') {
        this._wallBlocked = true;
      }
    }

    const into = this._freeX * normal.x + this._freeY * normal.y;

    if (into < 0) {
      this._freeX -= into * normal.x;
      this._freeY -= into * normal.y;
    }
  }

  /** @internal - keeps the closest walkable surface the support probe touches. */
  public _visitContact(target: Collider, normalX: number, normalY: number, penetration: number): void {
    const along = normalX * this._up.x + normalY * this._up.y;

    if (along < this._minWalkableCos) {
      return;
    }

    if (this._probeCandidate === null || penetration > this._probeDepth || (penetration === this._probeDepth && along > this._probeAlong)) {
      this._probeCandidate = target;
      this._probeDepth = penetration;
      this._probeAlong = along;
      this._probeNormalX = normalX;
      this._probeNormalY = normalY;
    }
  }

  /**
   * Walks one step along the supporting surface: recovers from overlapping
   * the support, walks or steps up, follows the ground down, then rides the
   * support's own motion. Every part but the ride is resolved against the
   * support where it stands before the step, which is where the walk is
   * relative to. Leaves the outcome in {@link _walk}.
   */
  private _walkStep(distance: number, carryVelocityX: number, carryVelocityY: number, fixedDelta: number): void {
    const movement = this.movement;
    const upX = this._up.x;
    const upY = this._up.y;
    const groundX = this._groundNormal.x;
    const groundY = this._groundNormal.y;
    const support = this._groundCollider!;
    const exclude = this._exclude;
    const walk = this._walk;
    const scratch = this._scratch;

    exclude.length = 0;
    exclude.push(support.body);

    let startX = 0;
    let startY = 0;

    if (this._groundOverlap > 0) {
      const depth = this._groundOverlap + contactOffset;

      movement._sweep(0, 0, groundX * depth, groundY * depth, exclude, scratch);
      startX = scratch.x;
      startY = scratch.y;
    }

    // The ground's tangent, oriented like the right of `up`.
    const tangentX = -groundY;
    const tangentY = groundX;

    this._slideMode = 'walk';
    movement._slide(startX, startY, tangentX * distance, tangentY * distance, this, null, walk);

    let stepped = false;

    if (this._wallBlocked && this._maxStepHeight > 0 && Math.abs(distance) > negligible) {
      stepped = this._stepUp(startX, startY, distance, walk);
    }

    // Set by the slide's constraint only; cleared here so the next walk starts clean.
    this._wallBlocked = false;

    if (!stepped) {
      const reach = this._maxStepHeight + Math.abs(distance) * Math.tan(this._maxSlopeAngle) + supportProbe;

      // Sliding rather than stopping at the first contact lets a rounded body
      // come off the edge of a step down onto the lower ground; a contact
      // that is not walkable at the end means there is no ground to snap to.
      this._slideMode = 'snap';
      movement._slide(walk.x, walk.y, -upX * reach, -upY * reach, this, null, scratch);

      if (scratch.blocked && scratch.normalX * upX + scratch.normalY * upY >= this._minWalkableCos) {
        walk.x = scratch.x;
        walk.y = scratch.y;
      } else {
        // Walking off the support keeps its motion, like stepping off a
        // moving walkway would.
        this._freeX = carryVelocityX;
        this._freeY = carryVelocityY;
      }
    }

    if (carryVelocityX !== 0 || carryVelocityY !== 0) {
      this._slideMode = 'air';
      movement._slide(walk.x, walk.y, carryVelocityX * fixedDelta, carryVelocityY * fixedDelta, this, exclude, scratch);
      walk.x = scratch.x;
      walk.y = scratch.y;

      if (scratch.blocked) {
        walk.blocked = true;
        walk.normalX = scratch.normalX;
        walk.normalY = scratch.normalY;
      }
    }

    exclude.length = 0;
  }

  /**
   * Tries to step onto an obstacle that stopped the walk: up by at most
   * {@link maxStepHeight}, forward, and down onto a walkable top. Rewrites
   * `walk` and returns `true` when that gets further than the blocked walk.
   */
  private _stepUp(startX: number, startY: number, distance: number, walk: SlideResult): boolean {
    const movement = this.movement;
    const upX = this._up.x;
    const upY = this._up.y;
    const rightX = -upY;
    const rightY = upX;
    const step = this._step;
    const height = this._maxStepHeight;

    movement._sweep(startX, startY, upX * height, upY * height, null, step);

    const riseX = step.x;
    const riseY = step.y;
    const rise = (riseX - startX) * upX + (riseY - startY) * upY;

    if (rise <= contactOffset) {
      return false;
    }

    movement._sweep(riseX, riseY, rightX * distance, rightY * distance, null, step);

    // Running into the obstacle's top while still raised means the top is
    // higher than the step allows: a rounded body would otherwise ride up its
    // corner.
    if (step.blocked && step.normalX * upX + step.normalY * upY > negligible) {
      return false;
    }

    const forwardX = step.x;
    const forwardY = step.y;
    const progress = ((forwardX - startX) * rightX + (forwardY - startY) * rightY) * Math.sign(distance);
    const walked = ((walk.x - startX) * rightX + (walk.y - startY) * rightY) * Math.sign(distance);

    if (progress <= walked + negligible) {
      return false;
    }

    const reach = rise + Math.abs(distance) * Math.tan(this._maxSlopeAngle) + supportProbe;

    movement._sweep(forwardX, forwardY, -upX * reach, -upY * reach, null, step);

    if (!step.blocked || step.normalX * upX + step.normalY * upY < this._minWalkableCos) {
      return false;
    }

    walk.x = step.x;
    walk.y = step.y;
    walk.blocked = false;
    walk.target = null;
    walk.normalX = 0;
    walk.normalY = 0;
    this._onWall = false;
    this._wallNormal.set(0, 0);

    return true;
  }

  /** Finds the surface supporting the body where it stands now. */
  private _probe(): void {
    const body = this.movement.body;
    const queries = this.movement.physics.world._queries;
    const upX = this._up.x;
    const upY = this._up.y;

    this._probed = true;

    if (!body.attached || body.destroyed) {
      this._clearSupport();

      return;
    }

    for (const collider of body.colliders) {
      if (isCastable(collider)) {
        queries._visitContacts(collider, -upX * supportProbe, -upY * supportProbe, body, this);
      }
    }

    const candidate = this._probeCandidate;

    // Left empty between probes, so the visitor starts from scratch.
    this._probeCandidate = null;

    if (candidate === null) {
      this._clearSupport();

      return;
    }

    // Moving away from the surface is leaving it, however close it still is:
    // a launch must not be cancelled by the ground it starts from. Only an
    // airborne step has a velocity of its own; a walk moves with the support.
    this._pointVelocity(candidate.body);

    if (this._airborne && (this._freeX - this._carryX) * upX + (this._freeY - this._carryY) * upY > negligible) {
      this._clearSupport();

      return;
    }

    this._grounded = true;
    this._groundCollider = candidate;
    this._groundNormal.set(this._probeNormalX, this._probeNormalY);
    this._groundOverlap = Math.max(0, this._probeDepth - supportProbe * this._probeAlong);
  }

  /** Velocity of `body`'s material point under the character, into {@link _carryX}/{@link _carryY}. */
  private _pointVelocity(body: PhysicsBody): void {
    const self = this.movement.body;
    const rx = self.x - body.worldCenterOfMassX;
    const ry = self.y - body.worldCenterOfMassY;

    this._carryX = body.linearVelocityX - body.angularVelocity * ry;
    this._carryY = body.linearVelocityY + body.angularVelocity * rx;
  }

  private _supportAlive(): boolean {
    const collider = this._groundCollider;

    return collider !== null && !collider.destroyed && collider.body.attached && !collider.body.destroyed;
  }

  private _clearSupport(): void {
    this._grounded = false;
    this._groundCollider = null;
    this._groundNormal.set(0, 0);
    this._groundOverlap = 0;
  }

  private _reset(): void {
    this._clearSupport();
    this._probed = false;
    this._input = 0;
    this._inputEpoch = -1;
    this._launchPending = false;
    this._airborne = false;
    this._freeX = 0;
    this._freeY = 0;
    this._onWall = false;
    this._onCeiling = false;
    this._wallNormal.set(0, 0);
    this._velocity.set(0, 0);
  }
}
