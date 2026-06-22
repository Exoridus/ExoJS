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
import type { Shape } from './shapes/Shape';
import { TimeStepper } from './TimeStepper';
import type { BodyType, CollisionFilter, VectorLike } from './types';

/** Construction options for a {@link PhysicsWorld}. */
export interface PhysicsWorldOptions {
  /** Gravity in px/s² (+Y down). Integrated each sub-step. Default `(0, 0)`. */
  gravity?: VectorLike;
  /** Fixed timestep in seconds. Default `1 / 60`. */
  fixedDelta?: number;
  /** Maximum sub-steps per `step` (spiral-of-death guard). Default `8`. */
  maxSubSteps?: number;
  /** Sequential-impulse velocity iterations per sub-step. Default `8`. */
  velocityIterations?: number;
  /** Split-impulse position-correction iterations per sub-step. Default `3`. */
  positionIterations?: number;
  /** Interpolate bound nodes between sub-steps (reserved; no effect yet). Default `true`. */
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
  shape: Shape;
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
 * The dynamics are a native, warm-started **sequential-impulse** solver: a
 * 2-point block normal solve plus a non-linear Gauss-Seidel position-correction
 * pass. It integrates gravity/forces/impulses, resolves contacts and keeps
 * moderate stacks stable; very tall towers (beyond ~10 high) are a known limit
 * of the iteration budget. The detection backend sits behind an internal seam,
 * so the solver is swappable without touching this public surface.
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
  /** Whether bound nodes interpolate between sub-steps (reserved; no effect yet). */
  public readonly interpolation: boolean;
  /** Sequential-impulse velocity iterations per sub-step. */
  public readonly velocityIterations: number;
  /** Split-impulse position-correction iterations per sub-step. */
  public readonly positionIterations: number;

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
    this.timeStepper = new TimeStepper({ fixedDelta: options.fixedDelta, maxSubSteps: options.maxSubSteps });
    this.interpolation = options.interpolation ?? true;
    this.velocityIterations = options.velocityIterations ?? 8;
    this.positionIterations = options.positionIterations ?? 3;
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
      type: options.type,
      position: options.position,
      angle: options.angle,
      gravityScale: options.gravityScale,
      fixedRotation: options.fixedRotation,
      colliders: [
        new Collider({
          shape: options.shape,
          offset: options.offset,
          rotation: options.rotation,
          density: options.density,
          friction: options.friction,
          restitution: options.restitution,
          isSensor: options.isSensor,
          filter: options.filter,
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
   * Advance the world by `frameDeltaSeconds`. Accumulates into fixed sub-steps;
   * each sub-step integrates velocities, runs detection, solves contacts and
   * integrates positions. Then dispatches events and writes bound node transforms.
   */
  public step(frameDeltaSeconds: number): void {
    this._assertAlive();

    const steps = this.timeStepper.advance(frameDeltaSeconds);

    if (steps > 0) {
      const dt = this.timeStepper.fixedDelta;
      const gravityX = this.gravity.x;
      const gravityY = this.gravity.y;

      for (let step = 0; step < steps; step++) {
        // Integrate velocities (gravity + forces), refresh geometry, then detect.
        for (const body of this._bodies) {
          body._snapshotVelocity();
          body._integrateVelocity(dt, gravityX, gravityY);
          body.synchronizeColliders();
        }

        this._backend.detect(this._colliders);
        this._backend.solve(this.velocityIterations, this.positionIterations);

        // Integrate positions from the solved velocities.
        for (const body of this._bodies) {
          body._integratePosition(dt);
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
  public overlapShape(shape: Shape, position: VectorLike, filter?: QueryFilter, angle?: number): Collider[] {
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
