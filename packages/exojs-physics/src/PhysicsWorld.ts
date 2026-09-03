import type { AabbLike, PointLike, SceneNode, Seconds } from '@codexo/exojs';
import { logger, Signal, Vector } from '@codexo/exojs';

import { aabbOverlap, createAabb } from './Aabb';
import { NativePhysicsBackend } from './backend/NativePhysicsBackend';
import type { PhysicsBackend } from './backend/PhysicsBackend';
import { BindingRegistry } from './binding/BindingRegistry';
import type { PhysicsBinding } from './binding/PhysicsBinding';
import { authoredCollider, Collider } from './Collider';
import type { Manifold } from './collision/Manifold';
import type { SweepHit } from './collision/sweep';
import { canSweep, sweepProxies } from './collision/sweep';
import type { ContactModifier } from './ContactModifier';
import type { CollisionEvent, SensorEvent } from './events';
import type { Joint } from './joints/Joint';
import type { BodyOwner } from './PhysicsBody';
import { PhysicsBody } from './PhysicsBody';
import type { QueryFilter, RayHit } from './query/QueryEngine';
import { QueryEngine } from './query/QueryEngine';
import type { AnyShape } from './shapes/AnyShape';
import { sleepPenetrationTolerance } from './solver/tolerances';
import { TimeStepper } from './TimeStepper';
import type { BodyType, CollisionFilter } from './types';
import { shouldCollide } from './types';

/**
 * Overlap left after clamping a bullet at its time of impact (the clamp
 * overshoots the contact by this much along the motion), so the next step's
 * discrete detection forms a real contact and the solver owns resting,
 * friction and events from then on.
 */
const ccdEmbed = 0.05;
/** Impact speed (px/s) below which a bullet's CCD response does not bounce (mirrors the contact solver). */
const ccdRestitutionThreshold = 1;

/**
 * Keep a host-supplied blend factor inside `[0, 1]`. A caller's own accumulator
 * can hand over a value outside it (a stale read, a custom scheduler), and an
 * unclamped one extrapolates the node past the simulated state instead of
 * blending between two known ones.
 */
const clampAlpha = (alpha: number): number => {
  // Written as two comparisons rather than Math.min/Math.max so a NaN factor
  // lands on 0 instead of propagating into every bound node's transform.
  if (!(alpha > 0)) {
    return 0;
  }

  return alpha < 1 ? alpha : 1;
};

/**
 * Reject removing the last collider a dynamic body's mass rests on while it still
 * holds others. Such a body keeps colliding but has `invMass === 0`, which the
 * solver cannot tell apart from a static body - the same state `PhysicsBody`
 * refuses to be constructed in.
 *
 * Removing the body's *only* collider is fine: a body with no geometry at all is
 * a body still being assembled, not a silently broken one.
 */
const assertBodyKeepsItsMass = (collider: Collider): void => {
  const body = collider.body;

  if (body.type !== 'dynamic' || collider.shape.massProperties === null || collider.density <= 0) {
    return;
  }

  let remaining = 0;

  for (const other of body.colliders) {
    if (other === collider) {
      continue;
    }

    if (other.shape.massProperties !== null && other.density > 0) {
      return;
    }

    remaining++;
  }

  if (remaining === 0) {
    return;
  }

  throw new Error(
    'PhysicsWorld.destroyCollider: this is the only collider carrying mass for a dynamic body — removing it would leave the body colliding but massless. Destroy the body instead, or give it another solid collider first.',
  );
};

/** Shape kinds already reported as unswept, so the warning fires once per kind. */
const warnedUnsweptKinds = new Set<string>();

/**
 * Dev-only: boundary geometry is never swept as the moving operand, so a bullet
 * body carrying it is not protected against tunnelling on that collider.
 * Reporting it beats a silent pass-through.
 */
const warnUnsweptBulletShape = (collider: Collider): void => {
  const kind = collider.shape.type;

  if (canSweep(kind, 'polygon') || warnedUnsweptKinds.has(kind)) {
    return;
  }

  warnedUnsweptKinds.add(kind);
  logger.warn(
    `PhysicsWorld: a bullet body carries a '${kind}' collider. Boundary geometry is level structure and is only ever a ` +
      'sweep target, never the moving operand, so this collider can still cross thin geometry within one step. ' +
      'Give a fast body a solid collider (circle, capsule or polygon).',
    { source: 'physics' },
  );
};

/**
 * `true` when a static/kinematic body - an island boundary, never an island
 * member - is being driven this step, either through its velocity or by a
 * {@link PhysicsBody.setTransform} teleport. Speed is deliberately not compared
 * against the sleep thresholds: a platform creeping along at 1 px/s still has to
 * push its passengers, and it is exactly that sub-threshold case where nothing
 * else would keep them awake.
 */
const isMovingBoundary = (body: PhysicsBody): boolean =>
  body._teleported || body.linearVelocityX !== 0 || body.linearVelocityY !== 0 || body.angularVelocity !== 0;

/**
 * `true` while a contact still carries more overlap than the solver leaves
 * behind at rest. Read from the manifold detection just produced, which is the
 * same separation the solver's push-out bias is about to act on - the sleep gate
 * and the constraint it gates therefore agree by construction.
 */
const isUnresolved = (manifold: Manifold): boolean => {
  for (let i = 0; i < manifold.pointCount; i++) {
    // i in 0..pointCount-1 and pointCount ≤ 2, so the manifold point exists.
    if ((i === 0 ? manifold.points[0] : manifold.points[1]).penetration > sleepPenetrationTolerance) {
      return true;
    }
  }

  return false;
};

/**
 * {@link PhysicsWorld.attach}'s default `position`: `node`'s current WORLD
 * translation, duck-typed the same way `AudioListener` reads a follow target -
 * real {@link SceneNode}s expose `getWorldTransform()`, test doubles that omit
 * it fall back to `(0, 0)` (the previous, surprising default).
 */
const worldPositionOf = (node: SceneNode): Readonly<PointLike> => {
  const asNode = node as Partial<SceneNode>;

  if (typeof asNode.getWorldTransform === 'function') {
    const world = asNode.getWorldTransform();

    return { x: world.x, y: world.y };
  }

  return { x: 0, y: 0 };
};

/**
 * {@link PhysicsWorld.attach}'s default `angle` (radians): `node`'s current
 * WORLD rotation, decomposed from `getWorldTransform()`'s linear part
 * (`atan2(-c, a)` - `SceneNode.updateTransform` builds its rotation block as
 * `[[cosθ, sinθ], [-sinθ, cosθ]]`, i.e. `b = sinθ`/`c = -sinθ`, matching the
 * radians ⇄ degrees round-trip `PhysicsBinding.sync` already relies on).
 * Falls back to `0` for a duck-typed node without `getWorldTransform`.
 */
const worldAngleOf = (node: SceneNode): number => {
  const asNode = node as Partial<SceneNode>;

  if (typeof asNode.getWorldTransform === 'function') {
    const world = asNode.getWorldTransform();

    return Math.atan2(-world.c, world.a);
  }

  return 0;
};

/** Construction options for a {@link PhysicsWorld}. */
export interface PhysicsWorldOptions {
  /** Gravity in px/s² (+Y down). Integrated each sub-step. Default `(0, 0)`. */
  gravity?: Readonly<PointLike>;
  /** Fixed timestep in seconds. Default `1 / 60`. */
  fixedDelta?: number;
  /** Maximum fixed steps per `step` call (spiral-of-death guard). Default `8`. */
  maxSubSteps?: number;
  /**
   * TGS-Soft sub-steps per fixed step (the solver's stiffness scales with this,
   * not iteration count). Default `4`. Must be ≥ 1. Values below `2` visibly
   * degrade tall-stack stability (a 10-box tower jitters at `1`), so the default
   * is load-bearing - do not lower it for performance.
   */
  subStepCount?: number;
  /** Soft-contact stiffness in Hz (the contact behaves as a damped spring at this frequency). Default `30`. */
  contactHertz?: number;
  /** Soft-contact damping ratio (≥ 1 keeps contacts from oscillating). Default `10`. */
  dampingRatio?: number;
  /** Put resting bodies to sleep so they skip integration and solving. Default `true`. */
  enableSleeping?: boolean;
  /**
   * Adjust each solid contact for the coming step (one-way platforms,
   * conditional friction, per-pair material overrides). At most one per world;
   * see {@link PhysicsWorld.contactModifier}. Default none.
   */
  contactModifier?: ContactModifier | null;
  /**
   * Place bound nodes between the last two fixed states instead of snapping them
   * to the latest one, which smooths motion when the fixed rate is below the
   * frame rate. Default `false`.
   *
   * The blend factor comes from {@link frameAlphaSource}; a world driven as a
   * `System` has to supply one.
   */
  interpolation?: boolean;
  /**
   * Where interpolated bindings read their blend factor, in `[0, 1)`.
   *
   * Defaults to this world's own accumulator - correct when the world is driven
   * with {@link PhysicsWorld.step}, which is what advances it. A world driven as
   * a `System` goes through {@link PhysicsWorld.fixedUpdate} and bypasses that
   * accumulator entirely, so the host owns the fraction: pass
   * `() => app.frameAlpha`.
   */
  frameAlphaSource?: () => number;
  /** Linear speed at or below which a body is a sleep candidate, px/s. Default `5`. */
  sleepLinearVelocity?: number;
  /** Angular speed at or below which a body is a sleep candidate, rad/s. Default `0.06`. */
  sleepAngularVelocity?: number;
  /** Seconds a body must stay below the sleep thresholds before it sleeps. Default `0.5`. */
  timeToSleep?: number;
}

/**
 * {@link PhysicsWorld.attach} convenience options: a body type plus a single
 * collider, attached to a scene node in one call.
 */
export interface AttachOptions {
  /** Simulation role of the created body. Default `'dynamic'`. */
  type?: BodyType;
  /** Initial world position of the body. Default the node's current WORLD position ({@link SceneNode.getWorldTransform}) at attach time. */
  position?: Readonly<PointLike>;
  /** Initial rotation (radians) of the body. Default the node's current WORLD rotation at attach time. */
  angle?: number;
  /** Per-body multiplier on world gravity. Default `1`. */
  gravityScale?: number;
  /** When `true`, the body never rotates under contacts. Default `false`. */
  fixedRotation?: boolean;
  /** The collider geometry. */
  shape: AnyShape;
  /** Body-local offset of the collider. Default `(0, 0)`. */
  offset?: Readonly<PointLike>;
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
}

/**
 * The collision/query world: owns bodies, colliders, the detection backend,
 * bindings, the query engine and the fixed-step accumulator. Stepped by the
 * caller (commonly from a `Scene.update`), each fixed sub-step it integrates
 * body velocities, runs broad- and narrow-phase detection, solves contacts and
 * integrates positions, then fires immutable contact/sensor events and writes
 * bound node transforms. It holds **no module-level state**, so any number of
 * worlds run in isolation.
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
 * robustness, so it has a few documented limits - each stays finite and stable,
 * and each is pinned by a gate in `dynamics.test.ts` or
 * `contact-push-out.test.ts`:
 * - **Resting contacts** settle within a small, fixed tolerance. A face contact
 *   settles at exactly that tolerance; a single-point contact settles slightly
 *   deeper, and that gap grows with acceleration. Very high accelerations
 *   eventually exceed what the push-out can resolve within a step, at which
 *   point the contact holds a slightly deeper resting depth instead of the
 *   tolerance - keep gravity in the range ordinary 2D games use.
 * - **Mass ratio** - contacts between bodies of very different mass degrade
 *   gradually rather than at a fixed ratio. What sets the practical limit is how
 *   thick the supporting geometry is relative to the lighter body, not the ratio
 *   alone: a light body squeezed against a boundary thinner than itself is the
 *   case that fails first, and it fails by sinking through.
 * - **Scale-relative behaviour** - the solver's tolerances are absolute lengths,
 *   so a very small shape sees them as a large fraction of itself, and a very
 *   large one as a negligible one. Keep the shapes of one world within a couple
 *   of orders of magnitude of each other.
 * - **CCD is opt-in and translation-only** - detection runs once per fixed
 *   step, so an ordinary body that crosses more than roughly half a barrier's
 *   total thickness within one step may end up on the wrong side of it, either
 *   passing through or being resolved out of the far face. Flag fast
 *   projectiles with {@link PhysicsBody.isBullet}: each of the body's colliders
 *   is then shape-cast along the step's motion (an exact translation-only sweep
 *   of the full shape, not just the centre) and clamped at the first impact.
 *   Rotation over the step is not swept - a long body spinning fast enough to
 *   sweep past an obstacle within one step can still miss it.
 * - **{@link PhysicsWorldOptions.subStepCount}** - the default `4` is
 *   load-bearing for tall-stack stability; lowering it below `2` visibly
 *   degrades stacking, so do not reduce it for performance.
 * - **Broad phase is a dynamic AABB tree** (`AabbTreeBroadPhase`), stateful
 *   across fixed steps: a collider whose tight AABB stays inside its stored
 *   fat AABB costs nothing to re-sync, and only colliders that actually move
 *   outside their margin trigger a tree update and a local re-query for new
 *   neighbours. Detection still walks every live collider once per step (a
 *   cheap containment check for each), so there is a small linear floor, but
 *   the dominant cost - reinsertion and neighbour discovery - is driven by
 *   how much actually moved, not by the total live collider count; sleeping
 *   bodies skip that dominant cost entirely. Scales to tens of thousands of
 *   simultaneously-live colliders, including dense clusters that would
 *   degrade a sort-and-sweep broad phase; very large or highly dynamic
 *   worlds may still benefit from splitting into several smaller
 *   `PhysicsWorld` instances (e.g. per room/chunk).
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
  /** TGS-Soft sub-steps per fixed step. */
  public readonly subStepCount: number;
  /** Soft-contact stiffness in Hz. */
  public readonly contactHertz: number;
  /** Soft-contact damping ratio. */
  public readonly dampingRatio: number;
  /** Whether resting bodies are put to sleep. */
  public readonly enableSleeping: boolean;
  /** Linear sleep threshold (px/s). */
  public readonly sleepLinearVelocity: number;
  /** Angular sleep threshold (rad/s). */
  public readonly sleepAngularVelocity: number;
  /** Seconds below the thresholds before a body sleeps. */
  public readonly timeToSleep: number;

  /**
   * Runs once per solid contact per fixed step, after contact generation and
   * before island building and the solver, so a contact it disables applies no
   * impulse and does not couple its two bodies into one sleeping island.
   *
   * At most one modifier per world - it mutates simulation state, so a
   * multi-listener signal would make the outcome depend on registration order.
   * Set to `null` to remove it; the per-contact values then stay at the
   * defaults derived from the two colliders.
   */
  public contactModifier: ContactModifier | null;

  /**
   * Whether bound nodes are placed between the last two fixed states rather than
   * snapped to the latest one. Toggleable at runtime; switching it off snaps
   * every bound node back to the current fixed state on the next sync.
   */
  public interpolation: boolean;

  /**
   * Supplies the `[0, 1)` blend factor for interpolated bindings. Defaults to
   * this world's own accumulator; point it at the host's own fraction
   * (`() => app.frameAlpha`) when the world runs as a `System`, because
   * {@link fixedUpdate} never advances the local accumulator.
   */
  public frameAlphaSource: () => number;

  private readonly _backend: PhysicsBackend = new NativePhysicsBackend();
  private readonly _bodies: PhysicsBody[] = [];
  private readonly _colliders: Collider[] = [];
  /**
   * What detection actually runs over: the authored colliders, with a chain
   * replaced by the edge proxies it fans out into. The broad phase, the narrow
   * phase and the queries all read this list; `_colliders` stays the authored
   * set every public surface reports.
   */
  private readonly _detectionColliders: Collider[] = [];
  /** Pooled scratch for re-syncing a single body's broad-phase leaves. */
  private readonly _leafScratch: Collider[] = [];
  private readonly _joints: Joint[] = [];
  private readonly _bindings = new BindingRegistry();
  private readonly _query: QueryEngine;
  private readonly _commands: Array<() => void> = [];
  /** Pooled union-find parent array for the per-step island pass (reused; sized to the body count). */
  private readonly _islandParent: number[] = [];
  /** Pooled per-island minimum sleep time, indexed by union-find root. */
  private readonly _islandMinSleep: number[] = [];
  /** Pooled scratch for the CCD pass (clamp target, per-pair sweep hit, best hit, swept AABB) - keeps the sweep allocation-free. */
  private readonly _ccdClampPosition = { x: 0, y: 0 };
  private readonly _ccdSweepHit: SweepHit = { t: 0, normalX: 0, normalY: 0 };
  private readonly _ccdBestHit: SweepHit = { t: 0, normalX: 0, normalY: 0 };
  private readonly _ccdSweptAabb: AabbLike = createAabb();
  /** Pooled result buffer for the CCD pass's broad-phase query (refilled per bullet collider). */
  private readonly _ccdCandidates: Collider[] = [];

  /**
   * Narrow-phase sweep tests run by the CCD pass since world creation. Pairs
   * rejected by the swept-AABB prune never count, so slow bullets far from any
   * geometry keep this at zero (the cheap path).
   *
   * @internal - test/diagnostic hook.
   */
  public _ccdSweepTests = 0;

  /**
   * Colliders the CCD pass pulled out of the broad phase since world creation -
   * the size of the candidate set the swept-AABB prune and the narrow-phase
   * sweep then work on. Counted separately from {@link _ccdSweepTests} because
   * the two measure different halves: this is what the pass looks at, that is
   * what it actually sweeps. Stays proportional to the geometry near the
   * bullets, not to the world's collider count.
   *
   * @internal - test/diagnostic hook.
   */
  public _ccdBroadPhaseCandidates = 0;

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

    const subStepCount = options.subStepCount ?? 4;

    if (!Number.isInteger(subStepCount) || subStepCount < 1) {
      throw new RangeError(`PhysicsWorld: subStepCount must be an integer ≥ 1, received ${subStepCount}.`);
    }

    this.subStepCount = subStepCount;
    this.contactHertz = options.contactHertz ?? 30;
    this.dampingRatio = options.dampingRatio ?? 10;
    this.enableSleeping = options.enableSleeping ?? true;
    this.sleepLinearVelocity = options.sleepLinearVelocity ?? 5;
    this.sleepAngularVelocity = options.sleepAngularVelocity ?? 0.06;
    this.timeToSleep = options.timeToSleep ?? 0.5;
    this.contactModifier = options.contactModifier ?? null;
    this.interpolation = options.interpolation ?? false;
    this.frameAlphaSource = options.frameAlphaSource ?? (() => this.timeStepper.alpha);
    this._query = new QueryEngine(this._detectionColliders, this._backend.spatialIndex);
  }

  /** Live bodies (read-only view). */
  public get bodies(): readonly PhysicsBody[] {
    return this._bodies;
  }

  /** Live colliders (read-only view). */
  public get colliders(): readonly Collider[] {
    return this._colliders;
  }

  /**
   * @internal - the geometry the broad phase and the narrow phase actually hold:
   * every authored collider, with a chain replaced by its per-edge proxies.
   * Consumed by the debug draw layer, which visualises what the solver sees;
   * public identity stays {@link colliders}.
   */
  public get detectionGeometry(): readonly Collider[] {
    return this._detectionColliders;
  }

  // ── lifecycle ──────────────────────────────────────────────────────────

  /**
   * Add a body to the world: allocates the body and its collider ids, registers
   * the colliders, computes the mass model and tracks the body for stepping.
   * Construct the body freely first (`new PhysicsBody({ ... })`), then add it.
   * Safe to call inside an event callback - the body push is deferred to the end
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
   *
   * When `options.position`/`options.angle` are omitted, the body starts at
   * `node`'s current WORLD position/rotation (via `getWorldTransform()`,
   * composed through any transform-group boundary) rather than `(0, 0)` -
   * otherwise a body attached to an already-placed node would visibly "teleport"
   * to the origin on the next step. Pass `position`/`angle` explicitly to override.
   */
  public attach(node: SceneNode, options: AttachOptions): PhysicsBody {
    const body = new PhysicsBody({
      ...(options.type !== undefined && { type: options.type }),
      position: options.position ?? worldPositionOf(node),
      angle: options.angle ?? worldAngleOf(node),
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
    this.bind(body, node);

    return body;
  }

  /**
   * Destroy a body and its colliders. Every dynamic body touching it is woken,
   * so anything that was resting on the destroyed body falls once its support is
   * gone. Deferred when called inside a callback.
   */
  public destroyBody(body: PhysicsBody): void {
    this._defer(() => this._removeBody(body));
  }

  /**
   * Destroy a single collider, recomputing its body's mass. Wakes every dynamic
   * body touching it, the same way {@link destroyBody} does. Deferred when
   * called inside a callback.
   */
  public destroyCollider(collider: Collider): void {
    // Checked here rather than in the deferred removal so the error surfaces at
    // the call site that caused it, not out of the middle of a `step()`.
    assertBodyKeepsItsMass(collider);

    this._defer(() => this._removeCollider(collider));
  }

  /** Live joints (read-only view). */
  public get joints(): readonly Joint[] {
    return this._joints;
  }

  /**
   * Add a constraint joint. Construct it first (`new DistanceJoint({ ... })`),
   * then add it. Wakes both bodies; safe inside a callback (registration is
   * deferred). Returns the joint.
   */
  public addJoint<T extends Joint>(joint: T): T {
    this._assertAlive();
    joint.bodyA.wake();
    joint.bodyB.wake();

    this._defer(() => {
      if (!this._joints.includes(joint)) {
        this._joints.push(joint);
      }
    });

    return joint;
  }

  /** Remove a joint, waking both bodies so they respond to the lost constraint. Deferred when called inside a callback. */
  public removeJoint(joint: Joint): void {
    joint.bodyA.wake();
    joint.bodyB.wake();

    this._defer(() => {
      const index = this._joints.indexOf(joint);

      if (index !== -1) {
        this._joints.splice(index, 1);
      }
    });
  }

  // ── stepping ───────────────────────────────────────────────────────────

  /**
   * Advance the world by `frameDeltaSeconds`. Accumulates into fixed steps; each
   * fixed step runs detection once, then a TGS-Soft sub-step loop (integrate
   * gravity, solve contacts with a soft bias, integrate positions, relax) and a
   * restitution pass, then writes the accumulated motion into each body. Finally
   * dispatches events and writes bound node transforms.
   *
   * **Prefer registering the world as a system instead**
   * (`app.systems.add(world, { order: SystemOrder.Physics })` or the scene
   * equivalent) so {@link fixedUpdate} drives stepping directly from the
   * engine's own fixed-timestep scheduler - one call per fixed step, no
   * accumulator duplication. `step` remains available here for manual/advanced
   * driving (e.g. a fixed-but-non-standard rate, or stepping outside the
   * normal frame loop entirely): pass any delta and this accumulator converts
   * it into the right number of fixed sub-steps (0, 1, or several, clamped by
   * {@link PhysicsWorldOptions.maxSubSteps}).
   *
   * Either way the simulation is frame-rate independent and deterministic -
   * the same sequence of deltas replays identically. `timeStepper.alpha`
   * (`[0, 1)`) is the leftover sub-step fraction after this call, for callers
   * that want to interpolate a bound node's rendered position between the last
   * two fixed states instead of snapping to the latest one (bindings do not do
   * this automatically - {@link bind} always writes the latest fixed-step
   * transform verbatim).
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
      const hasJoints = this._joints.length > 0;
      const hasBullets = this._hasBullets();

      for (let step = 0; step < steps; step++) {
        this._stepOnce(h, subStepCount, gravityX, gravityY, contactHertz, dampingRatio, hasJoints, hasBullets);
      }

      this._dispatchEvents();
    }

    // `step` is called once per rendered frame, so presenting here is already
    // the variable-rate slot an interpolated binding needs.
    this._syncBindings();
    this._drainCommands();
  }

  /**
   * Advance by exactly one fixed step, driven directly by the engine's own
   * fixed-timestep scheduler when this world is registered as a `System`
   * (`app.systems.add(world, { order: SystemOrder.Physics })` or the scene
   * equivalent) - bypasses {@link timeStepper}'s variable-delta accumulator
   * entirely, since the caller has already decided exactly when a fixed step
   * occurs. Prefer this over manual {@link step} once the world is
   * system-registered; `step` remains available for advanced manual driving.
   * Always advances by exactly {@link timeStepper}'s configured `fixedDelta`,
   * regardless of the caller's actual fixed-step interval - if the engine's
   * `Application.fixedTimeStep` doesn't match this world's `fixedDelta`, the
   * simulation stays deterministic but runs at the wrong wall-clock speed
   * relative to real time.
   */
  public fixedUpdate(_step: Seconds): void {
    this._assertAlive();

    const subStepCount = this.subStepCount;
    const h = this.timeStepper.fixedDelta / subStepCount;

    this._stepOnce(h, subStepCount, this.gravity.x, this.gravity.y, this.contactHertz, this.dampingRatio, this._joints.length > 0, this._hasBullets());

    this._dispatchEvents();

    // Interpolated presentation is a per-FRAME job and moves to `update`; this
    // phase can run several times per frame, and the blend factor is only final
    // once the last of them has run.
    if (!this.interpolation) {
      this._bindings.sync();
    }

    this._drainCommands();
  }

  /**
   * Variable-rate `System` phase: places bound nodes for the frame that is about
   * to be drawn. Only does work while {@link interpolation} is on - otherwise
   * {@link fixedUpdate} has already snapped them to the latest fixed state.
   */
  public update(_delta: Seconds): void {
    this._assertAlive();

    if (this.interpolation) {
      this._bindings.syncInterpolated(clampAlpha(this.frameAlphaSource()));
    }
  }

  /** Present bound nodes, snapping or interpolating according to {@link interpolation}. */
  private _syncBindings(): void {
    if (this.interpolation) {
      this._bindings.syncInterpolated(clampAlpha(this.frameAlphaSource()));
    } else {
      this._bindings.sync();
    }
  }

  private _stepOnce(
    h: number,
    subStepCount: number,
    gravityX: number,
    gravityY: number,
    contactHertz: number,
    dampingRatio: number,
    hasJoints: boolean,
    hasBullets: boolean,
  ): void {
    // Detection runs once per fixed step (collider geometry is already current
    // from the previous frame's finalize / attach / setTransform). TGS-Soft
    // reuses the manifolds across the sub-steps below.
    this._backend.detect(this._detectionColliders);

    // The contact modifier runs between detection and the sleep decision: a
    // contact it disables must neither reach the solver nor union its two bodies
    // into one island, and both of those are decided below.
    if (this.contactModifier !== null) {
      this._backend.applyContactModifier(this.contactModifier);
    }

    // Sleep decision runs after detection (islands need the current contact
    // set) and before the solver (so sleeping contacts are skipped, and a
    // sleeping island touched by an awake body is woken first).
    if (this.enableSleeping) {
      this._updateSleeping(this.timeStepper.fixedDelta);
    }

    this._backend.prepareSolve(h, contactHertz, dampingRatio);

    if (hasJoints) {
      this._prepareJoints(h);
    }

    if (hasBullets) {
      this._recordBulletPositions();
    }

    for (let subStep = 0; subStep < subStepCount; subStep++) {
      // Integrate gravity/forces over the sub-step (forces persist across
      // sub-steps; cleared once per frame by `_finalizePosition`).
      for (const body of this._bodies) {
        body._integrateVelocity(h, gravityX, gravityY);
      }

      // Warm-start every sub-step (Box2D-v3 soft step): the relax pass leaves
      // each contact's normal velocity at zero, so re-applying the
      // accumulated impulse re-balances exactly this sub-step's gravity - the
      // impulse converges to the per-sub-step load (m·h·g), not the per-frame
      // load, which is what keeps tall stacks from pumping energy.
      this._backend.warmStart();

      if (hasJoints) {
        this._warmStartJoints();
      }

      // Main soft-bias velocity solve, integrate positions (accumulating
      // per-body delta), then the bias-free relax pass. Joints solve right
      // after the contacts in each pass (contacts are the stiffer constraint).
      this._backend.solveVelocities(true);

      if (hasJoints) {
        this._solveJoints(true);
      }

      for (const body of this._bodies) {
        body._integratePosition(h);
      }

      this._backend.solveVelocities(false);

      if (hasJoints) {
        this._solveJoints(false);
      }
    }

    // Separate restitution pass, then write the accumulated delta into each
    // body's transform and re-sync collider geometry.
    this._backend.applyRestitution();

    for (const body of this._bodies) {
      body._finalizePosition();
    }

    if (hasBullets) {
      this._advanceBullets();
    }
  }

  // ── binding ────────────────────────────────────────────────────────────

  /**
   * Link a body to a scene node; the node tracks the body after each step.
   * Destroying the node is enough to end the link - the next step drops it
   * rather than writing into the node's released transform, so an explicit
   * {@link unbind} is only needed to stop tracking a node that stays alive.
   *
   * @throws if `node` is already destroyed.
   */
  public bind(body: PhysicsBody, node: SceneNode): PhysicsBinding {
    return this._bindings.bind(body, node);
  }

  /** Remove a body↔node link. */
  public unbind(body: PhysicsBody): void {
    this._bindings.unbind(body);
  }

  // ── queries ────────────────────────────────────────────────────────────

  /** Colliders containing `point`. Fresh array. */
  public queryPoint(point: Readonly<PointLike>, filter?: QueryFilter): Collider[] {
    return this._query.queryPoint(point, filter);
  }

  /** Colliders whose AABB overlaps `bounds`. Writes into `out` (cleared) if given. */
  public queryAabb(bounds: AabbLike, filter?: QueryFilter, out?: Collider[]): Collider[] {
    return this._query.queryAabb(bounds, filter, out);
  }

  /** Invoke `callback` for each collider whose AABB overlaps `bounds`. Allocation-free. */
  public forEachAabbHit(bounds: AabbLike, filter: QueryFilter | undefined, callback: (collider: Collider) => void): void {
    this._query.forEachAabbHit(bounds, filter, callback);
  }

  /** Nearest collider hit by the ray, or `null`. */
  public rayCast(origin: Readonly<PointLike>, direction: Readonly<PointLike>, filter?: QueryFilter, maxDistance?: number): RayHit | null {
    return this._query.rayCast(origin, direction, filter, maxDistance);
  }

  /** All collider hits along the ray, sorted by distance. Writes into `out` (cleared) if given. */
  public rayCastAll(origin: Readonly<PointLike>, direction: Readonly<PointLike>, filter?: QueryFilter, out?: RayHit[], maxDistance?: number): RayHit[] {
    return this._query.rayCastAll(origin, direction, filter, out, maxDistance);
  }

  /** Colliders overlapping `shape` placed at `position`/`angle`. Fresh array. */
  public overlapShape(shape: AnyShape, position: Readonly<PointLike>, filter?: QueryFilter, angle?: number): Collider[] {
    return this._query.overlapShape(shape, position, filter, angle);
  }

  /** Release every body, collider, binding and backend resource. */
  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;

    // Mark colliders before their bodies: a collider that still reported
    // `destroyed === false` while `collider.body.destroyed === true` would look
    // usable after the world that owned it is gone. Walk each body's own list
    // rather than `this._colliders`, so colliders whose deferred registration
    // never ran are covered too. `_backend.destroy()` below releases their
    // broad-phase proxies.
    for (const body of this._bodies) {
      for (const collider of body.colliders) {
        collider._markDestroyed();
      }

      body._markDestroyed();
    }

    this._bodies.length = 0;
    this._colliders.length = 0;
    this._detectionColliders.length = 0;
    this._joints.length = 0;
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
      if (collider.destroyed) {
        return;
      }

      this._colliders.push(collider);

      const edges = collider.chainEdges;

      if (edges === null) {
        this._detectionColliders.push(collider);

        return;
      }

      for (const edge of edges) {
        this._detectionColliders.push(edge);
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

  /**
   * Accumulate per-body sleep timers and put/keep islands of resting bodies
   * asleep so a stack sleeps and wakes as one unit. An island is a connected
   * component of dynamic bodies joined by touching solid contacts (static and
   * kinematic bodies are boundaries, not nodes); it sleeps once every member has
   * stayed below the sleep thresholds for `timeToSleep`, and wakes the instant
   * any member does (e.g. an awake body merges into it via a new contact).
   * A boundary that is itself moving resets the sleep timer of every dynamic
   * body it touches, so a platform keeps its passengers awake however slowly it
   * travels; so does a contact still carrying more penetration than the solver
   * leaves at rest, because the push-out that resolves it is slower than the
   * sleep velocity threshold and a body would otherwise be frozen embedded.
   * Deterministic: union-find roots break ties by lower index and the contact
   * set is id-sorted.
   */
  private _updateSleeping(dt: number): void {
    const bodies = this._bodies;
    const count = bodies.length;
    const parent = this._islandParent;
    const minSleep = this._islandMinSleep;

    // Assign dense indices, reset the union-find, and accumulate sleep timers for
    // awake dynamic bodies (a sleeping body's timer stays frozen ≥ timeToSleep).
    for (let i = 0; i < count; i++) {
      const body = bodies[i]!;

      body._islandIndex = i;
      parent[i] = i;
      minSleep[i] = Infinity;

      if (body.type === 'dynamic' && !body.isSleeping) {
        body._accumulateSleepTime(dt, this.sleepLinearVelocity, this.sleepAngularVelocity);
      }
    }

    parent.length = count;
    minSleep.length = count;

    this._unionContactIslands();

    // Joints couple their two bodies into the same island (sleep/wake together).
    for (const joint of this._joints) {
      const bodyA = joint.bodyA;
      const bodyB = joint.bodyB;

      if (joint.enabled && bodyA.type === 'dynamic' && bodyB.type === 'dynamic') {
        this._union(bodyA._islandIndex, bodyB._islandIndex);
      }
    }

    // Per-island minimum sleep time over its dynamic members.
    for (let i = 0; i < count; i++) {
      const body = bodies[i]!;

      if (body.type === 'dynamic') {
        const root = this._find(i);

        if (body._sleepTime < minSleep[root]!) {
          minSleep[root] = body._sleepTime;
        }
      }
    }

    // Sleep an island iff every member has rested for `timeToSleep`; otherwise
    // wake it (which also wakes any member dragged awake by a fresh contact).
    const timeToSleep = this.timeToSleep;

    for (let i = 0; i < count; i++) {
      const body = bodies[i]!;

      if (body.type === 'dynamic') {
        body._setSleeping(minSleep[this._find(i)]! >= timeToSleep);
      }
    }
  }

  /**
   * Union dynamic↔dynamic solid contacts into islands. A dynamic body touching a
   * MOVING static/kinematic body has its sleep timer reset instead: those types
   * are island boundaries, not members, so nothing else would keep the passenger
   * of a slow-moving platform awake - and the solver skips a contact whose
   * dynamic side is asleep, letting the platform drive straight through it.
   *
   * The same traversal resets the sleep timer of both sides of a contact whose
   * penetration the solver has not worked off yet, so the island it belongs to
   * stays awake until the overlap is within the tolerance the solver itself
   * converges to.
   */
  private _unionContactIslands(): void {
    for (const contact of this._backend.contactGraph.solidContacts) {
      // A contact the modifier disabled carries no load this step, so it neither
      // forms an island, nor keeps a passenger of a moving platform awake, nor
      // has an overlap anything is going to resolve.
      if (!contact.enabled) {
        continue;
      }

      const bodyA = contact.a.body;
      const bodyB = contact.b.body;
      const dynamicA = bodyA.type === 'dynamic';
      const dynamicB = bodyB.type === 'dynamic';

      if (dynamicA && dynamicB) {
        this._union(bodyA._islandIndex, bodyB._islandIndex);
      } else if (dynamicA && isMovingBoundary(bodyB)) {
        bodyA._sleepTime = 0;
      } else if (dynamicB && isMovingBoundary(bodyA)) {
        bodyB._sleepTime = 0;
      }

      // Unresolved overlap only matters where there is a dynamic body to hold
      // awake; a static↔static pair reaches the contact set but has no sleep
      // decision to gate.
      if ((dynamicA || dynamicB) && isUnresolved(contact.manifold)) {
        if (dynamicA) {
          bodyA._sleepTime = 0;
        }

        if (dynamicB) {
          bodyB._sleepTime = 0;
        }
      }
    }
  }

  /** Union-find union by lower index (deterministic roots). */
  private _union(a: number, b: number): void {
    const rootA = this._find(a);
    const rootB = this._find(b);

    if (rootA < rootB) {
      this._islandParent[rootB] = rootA;
    } else if (rootB < rootA) {
      this._islandParent[rootA] = rootB;
    }
  }

  /** Union-find find with path halving. */
  private _find(index: number): number {
    const parent = this._islandParent;

    while (parent[index]! !== index) {
      const grandparent = parent[parent[index]!]!;
      parent[index] = grandparent;
      index = grandparent;
    }

    return index;
  }

  /** Build each joint's per-frame constraint data (once per fixed step). */
  private _prepareJoints(h: number): void {
    for (const joint of this._joints) {
      joint._prepare(h);
    }
  }

  /** Re-apply each joint's accumulated impulse (each sub-step). */
  private _warmStartJoints(): void {
    for (const joint of this._joints) {
      joint._warmStart();
    }
  }

  /** One joint velocity pass (each sub-step, after the contacts). */
  private _solveJoints(useBias: boolean): void {
    for (const joint of this._joints) {
      joint._solve(useBias);
    }
  }

  /** Whether any dynamic body is flagged for continuous collision (bullet mode). */
  private _hasBullets(): boolean {
    for (const body of this._bodies) {
      if (body.isBullet && body.type === 'dynamic') {
        return true;
      }
    }

    return false;
  }

  /** Snapshot each bullet's centre of mass at the start of the fixed step (the swept-test origin). */
  private _recordBulletPositions(): void {
    for (const body of this._bodies) {
      if (body.isBullet && body.type === 'dynamic') {
        body._ccdPrevX = body.worldCenterOfMassX;
        body._ccdPrevY = body.worldCenterOfMassY;
      }
    }
  }

  /**
   * Shape-cast each bullet's colliders along this fixed step's motion against
   * every other body's colliders; if any would cross one, clamp the body at the
   * earliest impact and resolve it about the surface normal (a slide for a
   * non-bouncy body, an elastic reflection as restitution → 1) so it cannot
   * tunnel. The sweep is an exact translation-only cast of the full shapes
   * (Minkowski ray for circles, swept SAT for polygon pairs) - the step's
   * rotation is applied before the sweep, not swept through. Pairs already
   * overlapping at the start of the step are skipped: the discrete solver owns
   * them (that hand-off is what lets a landed bullet rest on real contacts).
   * Filters and sensors behave exactly as in the discrete narrow phase.
   */
  private _advanceBullets(): void {
    // `_finalizePosition` moved collider geometry after this step's detection
    // pass, so the index's leaves are stale for the sweep queries below. A leaf
    // whose tight AABB is still inside its fat one costs nothing to re-sync.
    this._backend.spatialIndex?.sync(this._detectionColliders);

    for (const body of this._bodies) {
      if (!body.isBullet || body.type !== 'dynamic' || body.isSleeping) {
        continue;
      }

      // The step's centre-of-mass motion; every collider translated by it too.
      const newX = body.worldCenterOfMassX;
      const newY = body.worldCenterOfMassY;
      const dx = newX - body._ccdPrevX;
      const dy = newY - body._ccdPrevY;
      const distance = Math.hypot(dx, dy);

      if (distance < 1e-6) {
        continue;
      }

      const blocked = this._sweepBulletColliders(body, dx, dy);

      if (blocked === null) {
        continue;
      }

      // Clamp the step's translation at the impact, overshooting by a small
      // embed along the motion (a pure translation - the rotation is already
      // applied) so the next step's detection forms a real discrete contact.
      const best = this._ccdBestHit;
      const clampDistance = Math.min(distance, best.t * distance + ccdEmbed);

      if (clampDistance < distance) {
        const pullBack = (clampDistance - distance) / distance;

        this._ccdClampPosition.x = body.x + dx * pullBack;
        this._ccdClampPosition.y = body.y + dy * pullBack;
        body.setTransform(this._ccdClampPosition, body.angle);

        // The clamp pulled this body back behind the pose the index was synced
        // from; refresh just its own leaves so a later bullet's query still sees it.
        this._backend.spatialIndex?.sync(this._detectionLeavesOf(body));
      }

      // Reflect about the true surface normal: a slide for a non-bouncy body
      // (restitution 0), an elastic bounce as restitution → 1. The body's own
      // restitution combines (max) with the surface's, matching the contact solver.
      const vn = body.linearVelocityX * best.normalX + body.linearVelocityY * best.normalY;

      if (vn < 0) {
        const restitution = vn < -ccdRestitutionThreshold ? Math.max(this._bulletRestitution(body), blocked.restitution) : 0;
        const impulse = -(1 + restitution) * vn;

        body.linearVelocityX += impulse * best.normalX;
        body.linearVelocityY += impulse * best.normalY;
      }
    }
  }

  /**
   * Find the earliest impact for a bullet whose colliders translated by
   * `(dx, dy)` this step. Each of the bullet's colliders queries the broad
   * phase with its swept AABB, so the pass costs what the geometry around the
   * bullet's path costs - not one iteration per collider in the world. Returns
   * the blocking collider (with the impact written into {@link _ccdBestHit}),
   * or `null` when nothing blocks the motion.
   */
  private _sweepBulletColliders(body: PhysicsBody, dx: number, dy: number): Collider | null {
    const hit = this._ccdSweepHit;
    const best = this._ccdBestHit;
    const swept = this._ccdSweptAabb;
    const spatialIndex = this._backend.spatialIndex;
    let blocked: Collider | null = null;

    best.t = Infinity;

    for (const collider of body.colliders) {
      if (collider.isSensor) {
        continue; // Sensors never block — not even their own body's motion.
      }

      if (__DEV__) {
        warnUnsweptBulletShape(collider);
      }

      // The collider's end-pose AABB unioned with its start pose; anything
      // outside it cannot be hit, so no narrow-phase sweep runs.
      const aabb = collider.aabb;

      swept.minX = dx > 0 ? aabb.minX - dx : aabb.minX;
      swept.maxX = dx < 0 ? aabb.maxX - dx : aabb.maxX;
      swept.minY = dy > 0 ? aabb.minY - dy : aabb.minY;
      swept.maxY = dy < 0 ? aabb.maxY - dy : aabb.maxY;

      // Tree hits are keyed on the leaves' fat AABBs, so the candidate set is a
      // conservative superset - the exact `aabbOverlap` below still decides.
      // A backend without a spatial index falls back to the full collider list.
      const candidates = spatialIndex === undefined ? this._detectionColliders : spatialIndex.queryAabb(swept, this._ccdCandidates);

      this._ccdBroadPhaseCandidates += candidates.length;

      for (const other of candidates) {
        // A chain edge proxy blocks under its chain's material and filter, and
        // reports the chain as the blocking collider - the sweep never hands a
        // caller a solver-side proxy.
        const target = authoredCollider(other);

        // Sweep against every other body (static, kinematic, dynamic) under the
        // discrete narrow phase's rules: sensors never block, filtered pairs never collide.
        if (target.isSensor || other.body === body || !shouldCollide(collider.filter, target.filter)) {
          continue;
        }

        if (!aabbOverlap(swept, other.aabb)) {
          continue;
        }

        this._ccdSweepTests++;

        if (sweepProxies(collider, dx, dy, other, hit) && hit.t < best.t) {
          best.t = hit.t;
          best.normalX = hit.normalX;
          best.normalY = hit.normalY;
          blocked = target;
        }
      }
    }

    return blocked;
  }

  /** The highest restitution among a body's colliders (its CCD bounce factor). */
  private _bulletRestitution(body: PhysicsBody): number {
    let restitution = 0;

    for (const collider of body.colliders) {
      if (collider.restitution > restitution) {
        restitution = collider.restitution;
      }
    }

    return restitution;
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

    const commands = this._commands.splice(0);

    for (const command of commands) {
      command();
    }
  }

  private _removeBody(body: PhysicsBody): void {
    const index = this._bodies.indexOf(body);

    if (index === -1) {
      // Never added (created and destroyed within the same dispatch) - still
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

    this._wakeTouchingBodies(collider);

    const edges = collider.chainEdges;

    if (edges === null) {
      this._removeDetectionCollider(collider);
    } else {
      for (const edge of edges) {
        this._removeDetectionCollider(edge);
      }
    }

    collider._markDestroyed();
  }

  /** Drop one broad-phase leaf: an authored collider, or one chain edge proxy. */
  private _removeDetectionCollider(collider: Collider): void {
    const index = this._detectionColliders.indexOf(collider);

    if (index !== -1) {
      this._detectionColliders.splice(index, 1);
    }

    this._backend.removeCollider(collider);
  }

  /**
   * The broad-phase leaves of one body - its colliders, with a chain replaced by
   * its edge proxies. Returns pooled scratch, valid until the next call.
   */
  private _detectionLeavesOf(body: PhysicsBody): Collider[] {
    const leaves = this._leafScratch;

    leaves.length = 0;

    for (const collider of body.colliders) {
      const edges = collider.chainEdges;

      if (edges === null) {
        leaves.push(collider);

        continue;
      }

      for (const edge of edges) {
        leaves.push(edge);
      }
    }

    return leaves;
  }

  /**
   * Wake every dynamic body still touching `collider` at the moment it leaves
   * the world. A sleeping body's sleep timer is frozen, so the island pass alone
   * can never re-open its sleep decision: losing the support it rested on just
   * removes a contact, and the island (now smaller, or a lone body) still reports
   * a long-expired timer and is put straight back to sleep - a stack whose floor,
   * platform or bottom box is destroyed would hang in mid-air forever. Kinematic
   * and static supports are the sharp edge, since they are island boundaries
   * rather than nodes and so are invisible to wake propagation, but the same hole
   * exists for a dynamic support. Waking the far side of each contact is enough:
   * the woken body's reset timer propagates through the rest of its sleeping
   * island on the next step, exactly like any other wake event.
   */
  private _wakeTouchingBodies(collider: Collider): void {
    for (const contact of this._backend.contactGraph.solidContacts) {
      let other: Collider;

      if (contact.ownerA === collider) {
        other = contact.ownerB;
      } else if (contact.ownerB === collider) {
        other = contact.ownerA;
      } else {
        continue;
      }

      // Only reached for a collider that is part of a live contact, so it is
      // attached and `body` cannot throw - a free-standing collider (a body
      // destroyed before it was ever stepped) has no contacts to match.
      if (other.body.type === 'dynamic') {
        other.body.wake();
      }
    }
  }

  private _assertAlive(): void {
    if (this._destroyed) {
      throw new Error('PhysicsWorld: the world has been destroyed.');
    }
  }
}
