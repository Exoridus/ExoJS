import type { SceneNode } from '@codexo/exojs';
import { Signal, Vector } from '@codexo/exojs';

import type { Aabb } from './Aabb';
import { NativePhysicsBackend } from './backend/NativePhysicsBackend';
import type { PhysicsBackend } from './backend/PhysicsBackend';
import { BindingRegistry } from './binding/BindingRegistry';
import type { BindingOptions, PhysicsBinding } from './binding/PhysicsBinding';
import type { Collider, ColliderOptions } from './Collider';
import type { CollisionEvent, SensorEvent } from './events';
import type { BodyOptions, BodyOwner } from './PhysicsBody';
import { PhysicsBody } from './PhysicsBody';
import type { QueryFilter, RayHit } from './query/QueryEngine';
import { QueryEngine } from './query/QueryEngine';
import type { Shape } from './shapes/Shape';
import { TimeStepper } from './TimeStepper';
import type { VectorLike } from './types';

/** Construction options for a {@link PhysicsWorld}. */
export interface PhysicsWorldOptions {
  /** Gravity in px/s² (+Y down). Stored; applied once the dynamics solver ships. Default `(0, 0)`. */
  gravity?: VectorLike;
  /** Fixed timestep in seconds. Default `1 / 60`. */
  fixedDelta?: number;
  /** Maximum sub-steps per `step` (spiral-of-death guard). Default `8`. */
  maxSubSteps?: number;
  /** Solver velocity iterations (stored for forward-compat). Default `8`. */
  velocityIterations?: number;
  /** Solver position iterations (stored for forward-compat). Default `3`. */
  positionIterations?: number;
  /** Interpolate bound nodes between sub-steps (no effect until dynamics integrate). Default `true`. */
  interpolation?: boolean;
}

/** {@link PhysicsWorld.createStaticCollider} options: a collider plus its static body placement. */
export interface StaticColliderOptions extends ColliderOptions {
  /** World position of the implicit static body. Default `(0, 0)`. */
  position?: VectorLike;
  /** Rotation (radians) of the implicit static body. Default `0`. */
  angle?: number;
}

/**
 * The collision/query world: owns bodies, colliders, the detection backend,
 * bindings, the query engine and the fixed-step accumulator. Stepped by the
 * caller (commonly from a `Scene.update`), it runs broad- and narrow-phase
 * detection, fires immutable contact/sensor events, and writes bound node
 * transforms. It holds **no module-level state**, so any number of worlds run
 * in isolation (gate I-1).
 *
 * This release performs collision detection, sensors, events, queries and
 * binding; bodies move only via {@link PhysicsBody.setTransform}. Gravity,
 * forces and impulse integration arrive with the dynamics solver.
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

  /** World gravity (px/s², +Y down). Stored until dynamics ship. */
  public readonly gravity: Vector;
  /** The fixed-step accumulator. */
  public readonly timeStepper: TimeStepper;
  /** Whether bound nodes interpolate between sub-steps (no effect until dynamics). */
  public readonly interpolation: boolean;
  /** Solver velocity iterations (stored for forward-compat). */
  public readonly velocityIterations: number;
  /** Solver position iterations (stored for forward-compat). */
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

  /** Create a body. Safe to call inside an event callback (deferred to end of step). */
  public createBody(options?: BodyOptions): PhysicsBody {
    this._assertAlive();

    const body = new PhysicsBody(this, this._nextBodyId++, options);

    this._defer(() => {
      if (!body.destroyed) {
        this._bodies.push(body);
      }
    });

    return body;
  }

  /** Sugar: an explicit static body carrying a single collider. The body is addressable via `collider.body`. */
  public createStaticCollider(options: StaticColliderOptions): Collider {
    const body = this.createBody({ type: 'static', position: options.position, angle: options.angle });

    return body.createCollider(options);
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
   * Advance the world by `frameDeltaSeconds`. Accumulates into fixed sub-steps,
   * runs detection, dispatches events, then writes bound node transforms.
   */
  public step(frameDeltaSeconds: number): void {
    this._assertAlive();

    const steps = this.timeStepper.advance(frameDeltaSeconds);

    if (steps > 0) {
      // Without dynamics, geometry is unchanged across sub-steps, so a single
      // detection pass per frame suffices; the dynamics solver will run per
      // sub-step here.
      for (const body of this._bodies) {
        body.synchronizeColliders();
      }

      this._backend.detect(this._colliders);
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
