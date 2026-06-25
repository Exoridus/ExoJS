import type { SceneNode } from '@codexo/exojs';
import { Signal, Vector } from '@codexo/exojs';

import type { Aabb } from './Aabb';
import { NativePhysicsBackend } from './backend/NativePhysicsBackend';
import type { PhysicsBackend } from './backend/PhysicsBackend';
import { BindingRegistry } from './binding/BindingRegistry';
import type { BindingOptions, PhysicsBinding } from './binding/PhysicsBinding';
import { Collider } from './Collider';
import type { CollisionEvent, SensorEvent } from './events';
import type { BodyOwner } from './PhysicsBody';
import { PhysicsBody } from './PhysicsBody';
import type { QueryFilter, RayHit } from './query/QueryEngine';
import { QueryEngine } from './query/QueryEngine';
import type { AnyShape } from './shapes/AnyShape';
import { TimeStepper } from './TimeStepper';
import type { BodyType, CollisionFilter, VectorLike } from './types';

/** Construction options for a {@link PhysicsWorld}. */
export interface PhysicsWorldOptions {
  /** Gravity in px/s² (+Y down). Integrated each sub-step. Default `(0, 0)`. */
  gravity?: VectorLike;
  /** Fixed timestep in seconds. Default `1 / 60`. */
  fixedDelta?: number;
  /** Maximum fixed steps per `step` call (spiral-of-death guard). Default `8`. */
  maxSubSteps?: number;
  /**
   * TGS-Soft sub-steps per fixed step (the solver's stiffness scales with this,
   * not iteration count). Default `4`. Must be ≥ 1. Values below `2` visibly
   * degrade tall-stack stability (a 10-box tower jitters at `1`), so the default
   * is load-bearing — do not lower it for performance.
   */
  subStepCount?: number;
  /** Soft-contact stiffness in Hz (the contact behaves as a damped spring at this frequency). Default `30`. */
  contactHertz?: number;
  /** Soft-contact damping ratio (≥ 1 keeps contacts from oscillating). Default `10`. */
  dampingRatio?: number;
  /** Interpolate bound nodes between fixed steps (reserved; no effect yet). Default `true`. */
  interpolation?: boolean;
}

/**
 * {@link PhysicsWorld.attach} convenience options: a body type plus a single
 * collider, attached to a scene node in one call.
 */
export interface AttachOptions {
  /** Simulation role of the created body. Default `'dynamic'`. */
  type?: BodyType;
  /** Initial world position of the body. Default the node's position is left untouched and `(0, 0)` is used. */
  position?: VectorLike;
  /** Initial rotation (radians) of the body. Default `0`. */
  angle?: number;
  /** Per-body multiplier on world gravity. Default `1`. */
  gravityScale?: number;
  /** When `true`, the body never rotates under contacts. Default `false`. */
  fixedRotation?: boolean;
  /** The collider geometry. */
  shape: AnyShape;
  /** Body-local offset of the collider. Default `(0, 0)`. */
  offset?: VectorLike;
  /** Body-local rotation of the collider (radians). Default `0`. */
  rotation?: number;
  /** Collider density (mass per px²). Default `1`. */
  density?: number;
  /** Coulomb friction coefficient. Default `0.2`. */
  friction?: number;
  /** Restitution / bounciness in `[0, 1]`. Default `0`. */
  restitution?: number;
  /** When `true`, the collider generates overlap events but no contact response. Default `false`. */
  isSensor?: boolean;
  /** Category/mask/group collision filter; partials merge over the defaults. */
  filter?: Partial<CollisionFilter>;
  /** Binding options forwarded to {@link PhysicsWorld.bind}. */
  binding?: BindingOptions;
}

/**
 * The collision/query world: owns bodies, colliders, the detection backend,
 * bindings, the query engine and the fixed-step accumulator. Stepped by the
 * caller (commonly from a `Scene.update`), each fixed sub-step it integrates
 * body velocities, runs broad- and narrow-phase detection, solves contacts and
 * integrates positions, then fires immutable contact/sensor events and writes
 * bound node transforms. It holds **no module-level state**, so any number of
 * worlds run in isolation (gate I-1).
 *
 * The dynamics are a native, warm-started **TGS-Soft** solver (Box2D-v3 "soft
 * step"): each fixed step runs detection once, then several sub-steps, each
 * integrating gravity over the sub-step and solving contacts with a soft
 * position bias plus a bias-free relax pass; a 2-point block normal solve
 * propagates stack loads, and restitution is a separate final pass. Decoupling
 * stiffness from the iteration count keeps tall towers stable. The detection
 * backend sits behind an internal seam, so the solver is swappable without
 * touching this public surface.
 *
 * **Operating envelope.** The soft solver trades a little accuracy for
 * robustness, so it has a few documented limits — each stays finite/stable and
 * each is pinned by a gate in `dynamics.test.ts`:
 * - **Mass ratio** — resting stacks are slop-accurate up to ~100:1. Beyond that
 *   the velocity-capped soft push-out (`maxBiasVelocity`) lets the lighter body
 *   settle progressively deeper (≈6px at 500:1, fully through a thin floor by
 *   ~5000:1) — always finite, never exploding (SG-MR3).
 * - **No CCD** — detection runs once per fixed step with no swept test, so a
 *   body that travels farther than an obstacle's thickness in one step tunnels
 *   straight through it (it stays finite). Reliably stopping fast projectiles is
 *   a future bullet-mode feature (SG-X5).
 * - **{@link PhysicsWorldOptions.subStepCount}** — the default `4` is
 *   load-bearing for tall-stack stability; lowering it below `2` visibly
 *   degrades stacking, so do not reduce it for performance.
 */
export class PhysicsWorld implements BodyOwner {
  /** Fires when two solid colliders begin touching. Argument is an immutable snapshot. */
  public readonly onCollisionStart = new Signal<[CollisionEvent]>();
  /** Fires when two solid colliders stop touching (or one is destroyed). */
  public readonly onCollisionEnd = new Signal<[CollisionEvent]>();
  /** Fires when a collider enters a sensor. */
  public readonly onSensorEnter = new Signal<[SensorEvent]>();
  /** Fires when a collider leaves a sensor. */
  public readonly onSensorExit = new Signal<[SensorEvent]>();

  /** World gravity (px/s², +Y down). Integrated each sub-step. */
  public readonly gravity: Vector;
  /** The fixed-step accumulator. */
  public readonly timeStepper: TimeStepper;
  /** Whether bound nodes interpolate between fixed steps (reserved; no effect yet). */
  public readonly interpolation: boolean;
  /** TGS-Soft sub-steps per fixed step. */
  public readonly subStepCount: number;
  /** Soft-contact stiffness in Hz. */
  public readonly contactHertz: number;
  /** Soft-contact damping ratio. */
  public readonly dampingRatio: number;

  private readonly _backend: PhysicsBackend = new NativePhysicsBackend();
  private readonly _bodies: PhysicsBody[] = [];
  private readonly _colliders: Collider[] = [];
  private readonly _bindings = new BindingRegistry();
  private readonly _query: QueryEngine;
  private readonly _commands: Array<() => void> = [];

  private _nextBodyId = 1;
  private _nextColliderId = 1;
  private _dispatching = false;
  private _destroyed = false;

  public constructor(options: PhysicsWorldOptions = {}) {
    this.gravity = new Vector(options.gravity?.x ?? 0, options.gravity?.y ?? 0);
    this.timeStepper = new TimeStepper({
      ...(options.fixedDelta !== undefined && { fixedDelta: options.fixedDelta }),
      ...(options.maxSubSteps !== undefined && { maxSubSteps: options.maxSubSteps }),
    });
    this.interpolation = options.interpolation ?? true;

    const subStepCount = options.subStepCount ?? 4;

    if (!Number.isInteger(subStepCount) || subStepCount < 1) {
      throw new RangeError(`PhysicsWorld: subStepCount must be an integer ≥ 1, received ${subStepCount}.`);
    }

    this.subStepCount = subStepCount;
    this.contactHertz = options.contactHertz ?? 30;
    this.dampingRatio = options.dampingRatio ?? 10;
    this._query = new QueryEngine(this._colliders);
  }

  /** Live bodies (read-only view). */
  public get bodies(): readonly PhysicsBody[] {
    return this._bodies;
  }

  /** Live colliders (read-only view). */
  public get colliders(): readonly Collider[] {
    return this._colliders;
  }

  // ── lifecycle ──────────────────────────────────────────────────────────

  /**
   * Add a body to the world: allocates the body and its collider ids, registers
   * the colliders, computes the mass model and tracks the body for stepping.
   * Construct the body freely first (`new PhysicsBody({ … })`), then add it.
   * Safe to call inside an event callback — the body push is deferred to the end
   * of the step, exactly like collider registration. Returns the body.
   *
   * @throws if the body has already been added to a world.
   */
  public add(body: PhysicsBody): PhysicsBody {
    this._assertAlive();

    if (body.attached) {
      throw new Error('PhysicsWorld.add: this body has already been added to a world.');
    }

    // Allocate the id + link/register colliders + aggregate mass now (matches the
    // old createBody, which allocated the id synchronously); only the body-list
    // push is deferred so it is safe inside an event dispatch.
    body._attachToWorld(this, this._nextBodyId++);

    this._defer(() => {
      if (!body.destroyed) {
        this._bodies.push(body);
      }
    });

    return body;
  }

  /**
   * Convenience: create a body carrying a single collider, add it to the world
   * and bind it to `node` in one call. The node tracks `body.position` after each
   * step. Returns the body. Equivalent to `new PhysicsBody(...)` + `add` + `bind`.
   */
  public attach(node: SceneNode, options: AttachOptions): PhysicsBody {
    const body = new PhysicsBody({
      ...(options.type !== undefined && { type: options.type }),
      ...(options.position !== undefined && { position: options.position }),
      ...(options.angle !== undefined && { angle: options.angle }),
      ...(options.gravityScale !== undefined && { gravityScale: options.gravityScale }),
      ...(options.fixedRotation !== undefined && { fixedRotation: options.fixedRotation }),
      colliders: [
        new Collider({
          shape: options.shape,
          ...(options.offset !== undefined && { offset: options.offset }),
          ...(options.rotation !== undefined && { rotation: options.rotation }),
          ...(options.density !== undefined && { density: options.density }),
          ...(options.friction !== undefined && { friction: options.friction }),
          ...(options.restitution !== undefined && { restitution: options.restitution }),
          ...(options.isSensor !== undefined && { isSensor: options.isSensor }),
          ...(options.filter !== undefined && { filter: options.filter }),
        }),
      ],
    });

    this.add(body);
    this.bind(body, node, options.binding);

    return body;
  }

  /** Destroy a body and its colliders. Deferred when called inside a callback. */
  public destroyBody(body: PhysicsBody): void {
    this._defer(() => this._removeBody(body));
  }

  /** Destroy a single collider, recomputing its body's mass. Deferred when called inside a callback. */
  public destroyCollider(collider: Collider): void {
    this._defer(() => this._removeCollider(collider));
  }

  // ── stepping ───────────────────────────────────────────────────────────

  /**
   * Advance the world by `frameDeltaSeconds`. Accumulates into fixed steps; each
   * fixed step runs detection once, then a TGS-Soft sub-step loop (integrate
   * gravity, solve contacts with a soft bias, integrate positions, relax) and a
   * restitution pass, then writes the accumulated motion into each body. Finally
   * dispatches events and writes bound node transforms.
   */
  public step(frameDeltaSeconds: number): void {
    this._assertAlive();

    const steps = this.timeStepper.advance(frameDeltaSeconds);

    if (steps > 0) {
      const subStepCount = this.subStepCount;
      const h = this.timeStepper.fixedDelta / subStepCount;
      const gravityX = this.gravity.x;
      const gravityY = this.gravity.y;
      const contactHertz = this.contactHertz;
      const dampingRatio = this.dampingRatio;

      for (let step = 0; step < steps; step++) {
        // Detection runs once per fixed step (collider geometry is already current
        // from the previous frame's finalize / attach / setTransform). TGS-Soft
        // reuses the manifolds across the sub-steps below.
        this._backend.detect(this._colliders);
        this._backend.prepareSolve(h, contactHertz, dampingRatio);

        for (let subStep = 0; subStep < subStepCount; subStep++) {
          // Integrate gravity/forces over the sub-step (forces persist across
          // sub-steps; cleared once per frame by `_finalizePosition`).
          for (const body of this._bodies) {
            body._integrateVelocity(h, gravityX, gravityY);
          }

          // Warm-start every sub-step (Box2D-v3 soft step): the relax pass leaves
          // each contact's normal velocity at zero, so re-applying the
          // accumulated impulse re-balances exactly this sub-step's gravity — the
          // impulse converges to the per-sub-step load (m·h·g), not the per-frame
          // load, which is what keeps tall stacks from pumping energy.
          this._backend.warmStart();

          // Main soft-bias velocity solve, integrate positions (accumulating
          // per-body delta), then the bias-free relax pass.
          this._backend.solveVelocities(true);

          for (const body of this._bodies) {
            body._integratePosition(h);
          }

          this._backend.solveVelocities(false);
        }

        // Separate restitution pass, then write the accumulated delta into each
        // body's transform and re-sync collider geometry.
        this._backend.applyRestitution();

        for (const body of this._bodies) {
          body._finalizePosition();
        }
      }

      this._dispatchEvents();
    }

    this._bindings.sync();
    this._drainCommands();
  }

  // ── binding ────────────────────────────────────────────────────────────

  /** Link a body to a scene node; the node tracks the body after each step. */
  public bind(body: PhysicsBody, node: SceneNode, options?: BindingOptions): PhysicsBinding {
    return this._bindings.bind(body, node, options);
  }

  /** Remove a body↔node link. */
  public unbind(body: PhysicsBody): void {
    this._bindings.unbind(body);
  }

  // ── queries ────────────────────────────────────────────────────────────

  /** Colliders containing `point`. Fresh array. */
  public queryPoint(point: VectorLike, filter?: QueryFilter): Collider[] {
    return this._query.queryPoint(point, filter);
  }

  /** Colliders whose AABB overlaps `bounds`. Writes into `out` (cleared) if given. */
  public queryAabb(bounds: Aabb, filter?: QueryFilter, out?: Collider[]): Collider[] {
    return this._query.queryAabb(bounds, filter, out);
  }

  /** Invoke `callback` for each collider whose AABB overlaps `bounds`. Allocation-free. */
  public forEachAabbHit(bounds: Aabb, filter: QueryFilter | undefined, callback: (collider: Collider) => void): void {
    this._query.forEachAabbHit(bounds, filter, callback);
  }

  /** Nearest collider hit by the ray, or `null`. */
  public rayCast(origin: VectorLike, direction: VectorLike, filter?: QueryFilter, maxDistance?: number): RayHit | null {
    return this._query.rayCast(origin, direction, filter, maxDistance);
  }

  /** All collider hits along the ray, sorted by distance. Writes into `out` (cleared) if given. */
  public rayCastAll(origin: VectorLike, direction: VectorLike, filter?: QueryFilter, out?: RayHit[], maxDistance?: number): RayHit[] {
    return this._query.rayCastAll(origin, direction, filter, out, maxDistance);
  }

  /** Colliders overlapping `shape` placed at `position`/`angle`. Fresh array. */
  public overlapShape(shape: AnyShape, position: VectorLike, filter?: QueryFilter, angle?: number): Collider[] {
    return this._query.overlapShape(shape, position, filter, angle);
  }

  /** Release every body, collider, binding and backend resource. */
  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;

    for (const body of this._bodies) {
      body._markDestroyed();
    }

    this._bodies.length = 0;
    this._colliders.length = 0;
    this._commands.length = 0;
    this._bindings.clear();
    this._backend.destroy();
    this.onCollisionStart.destroy();
    this.onCollisionEnd.destroy();
    this.onSensorEnter.destroy();
    this.onSensorExit.destroy();
  }

  // ── BodyOwner ──────────────────────────────────────────────────────────

  public _allocateColliderId(): number {
    return this._nextColliderId++;
  }

  public _registerCollider(collider: Collider): void {
    this._defer(() => {
      if (!collider.destroyed) {
        this._colliders.push(collider);
      }
    });
  }

  // ── internals ──────────────────────────────────────────────────────────

  /** The detection backend (internal; consumed by the debug draw layer). */
  public get backend(): PhysicsBackend {
    return this._backend;
  }

  private _dispatchEvents(): void {
    const graph = this._backend.contactGraph;

    this._dispatching = true;

    for (const event of graph.collisionEnd) {
      this.onCollisionEnd.dispatch(event);
    }

    for (const event of graph.sensorExit) {
      this.onSensorExit.dispatch(event);
    }

    for (const event of graph.collisionStart) {
      this.onCollisionStart.dispatch(event);
    }

    for (const event of graph.sensorEnter) {
      this.onSensorEnter.dispatch(event);
    }

    this._dispatching = false;
  }

  /** Run `command` now, or queue it when inside an event dispatch (deferred to end of step). */
  private _defer(command: () => void): void {
    if (this._dispatching) {
      this._commands.push(command);
    } else {
      command();
    }
  }

  private _drainCommands(): void {
    if (this._commands.length === 0) {
      return;
    }

    const commands = this._commands.splice(0, this._commands.length);

    for (const command of commands) {
      command();
    }
  }

  private _removeBody(body: PhysicsBody): void {
    const index = this._bodies.indexOf(body);

    if (index === -1) {
      // Never added (created and destroyed within the same dispatch) — still
      // tear down its colliders and mark it dead.
      this._teardownBody(body);

      return;
    }

    this._bodies.splice(index, 1);
    this._teardownBody(body);
  }

  private _teardownBody(body: PhysicsBody): void {
    for (const collider of body.colliders) {
      this._detachCollider(collider);
    }

    this._bindings.unbind(body);
    body._markDestroyed();
  }

  private _removeCollider(collider: Collider): void {
    this._detachCollider(collider);
    collider.body._removeCollider(collider);
  }

  private _detachCollider(collider: Collider): void {
    const index = this._colliders.indexOf(collider);

    if (index !== -1) {
      this._colliders.splice(index, 1);
    }

    this._backend.removeCollider(collider);
    collider._markDestroyed();
  }

  private _assertAlive(): void {
    if (this._destroyed) {
      throw new Error('PhysicsWorld: the world has been destroyed.');
    }
  }
}
