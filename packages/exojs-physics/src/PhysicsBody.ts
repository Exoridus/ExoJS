import { Vector } from '@codexo/exojs';

import { Collider, type ColliderOptions } from './Collider';
import type { Transform } from './math';
import { applyTransform, createTransform, setTransform } from './math';
import type { BodyType, VectorLike } from './types';

/** Construction options for a body. */
export interface BodyOptions {
  /** Simulation role. Default `'dynamic'`. */
  type?: BodyType;
  /** Initial world position. Default `(0, 0)`. */
  position?: VectorLike;
  /** Initial rotation in radians. Default `0`. */
  angle?: number;
  /** Linear damping applied to the velocity each sub-step. Default `0`. */
  linearDamping?: number;
  /** Angular damping applied to the angular velocity each sub-step. Default `0`. */
  angularDamping?: number;
  /** Per-body multiplier on world gravity (e.g. `0` to ignore gravity). Default `1`. */
  gravityScale?: number;
  /** When `true`, the body never rotates under contacts (infinite rotational inertia). Default `false`. */
  fixedRotation?: boolean;
  /** When `true`, the body is swept against static geometry each step (CCD) so it cannot tunnel through thin walls. Default `false`. */
  isBullet?: boolean;
  /** Colliders to attach up-front. Each may be a {@link Collider} instance or its {@link ColliderOptions}. */
  colliders?: Array<Collider | ColliderOptions>;
}

/**
 * Internal hook the world hands to each body so colliders can be id-allocated
 * and registered without the body importing the concrete world class.
 */
export interface BodyOwner {
  _allocateColliderId(): number;
  _registerCollider(collider: Collider): void;
}

/**
 * A rigid body: a world transform plus mass properties aggregated from its
 * colliders. Dynamic bodies integrate under gravity, accumulated forces/torque
 * and contact impulses each fixed sub-step; static bodies never move; kinematic
 * bodies move by their velocity only and stay immovable under contacts. Drive a
 * body with {@link applyForce}, {@link applyTorque} and {@link applyImpulse}, or
 * set {@link linearVelocityX}/{@link linearVelocityY}/{@link angularVelocity}
 * directly; reposition it (teleport, no velocity) with {@link setTransform}.
 */
export class PhysicsBody {
  public readonly type: BodyType;

  /** Linear damping applied to the velocity each sub-step. */
  public linearDamping: number;
  /** Angular damping applied to the angular velocity each sub-step. */
  public angularDamping: number;
  /** Per-body multiplier on world gravity (e.g. `0` to ignore gravity). */
  public gravityScale: number;
  /** When `true`, rotational inertia is treated as infinite. */
  public fixedRotation: boolean;
  /** When `true`, the body is swept against static geometry each step (CCD) so it cannot tunnel through thin walls. */
  public isBullet: boolean;

  /** Total mass (0 for static/kinematic). */
  public mass = 0;
  /** Inverse mass (`0` = immovable). */
  public invMass = 0;
  /** Rotational inertia about the centre of mass (0 for static/kinematic or fixed rotation). */
  public inertia = 0;
  /** Inverse rotational inertia (`0` = no angular response). */
  public invInertia = 0;

  /** Linear velocity X in px/s. */
  public linearVelocityX = 0;
  /** Linear velocity Y in px/s. */
  public linearVelocityY = 0;
  /** Angular velocity in rad/s. */
  public angularVelocity = 0;

  /** When `false`, this body is never put to sleep. Default `true`. */
  public allowSleep = true;

  /** @internal — Delta position X accumulated across the frame's sub-steps by the TGS integrator; written into the transform once per frame by {@link _finalizePosition}. */
  public _deltaPosX = 0;
  /** @internal — Delta position Y accumulated across the frame's sub-steps by the TGS integrator. */
  public _deltaPosY = 0;
  /** @internal — Delta rotation (radians) accumulated across the frame's sub-steps by the TGS integrator. */
  public _deltaAngle = 0;
  /** @internal — `cos(_deltaAngle)`, cached so the solver can rotate the contact anchors by the live sub-step rotation without a per-contact trig call. */
  public _deltaCos = 1;
  /** @internal — `sin(_deltaAngle)`, cached alongside {@link _deltaCos}. */
  public _deltaSin = 0;

  private _forceX = 0;
  private _forceY = 0;
  private _torque = 0;

  /** @internal — seconds the body has stayed below the sleep thresholds (frozen while asleep). Read by the world's island pass. */
  public _sleepTime = 0;
  /** @internal — dense union-find index assigned by the world's island pass each step. */
  public _islandIndex = 0;
  /** @internal — world-space centre of mass at the start of the current fixed step (CCD swept-test origin). */
  public _ccdPrevX = 0;
  /** @internal — see {@link _ccdPrevX}. */
  public _ccdPrevY = 0;

  private _sleeping = false;

  private _id = -1;
  private _owner: BodyOwner | null = null;
  private _attached = false;
  private readonly _transform: Transform;
  private readonly _colliders: Collider[] = [];
  private _comX = 0;
  private _comY = 0;
  private _massReady = false;
  private _destroyed = false;

  public constructor(options: BodyOptions = {}) {
    this.type = options.type ?? 'dynamic';
    this._transform = createTransform(options.position?.x ?? 0, options.position?.y ?? 0, options.angle ?? 0);
    this.linearDamping = options.linearDamping ?? 0;
    this.angularDamping = options.angularDamping ?? 0;
    this.gravityScale = options.gravityScale ?? 1;
    this.fixedRotation = options.fixedRotation ?? false;
    this.isBullet = options.isBullet ?? false;

    // Build up-front colliders now (no id/world registration until the body
    // joins a world via `world.add()`). They sit in `_colliders` unsynchronised;
    // `_attachToWorld` assigns ids, registers them and computes the mass model.
    if (options.colliders) {
      for (const entry of options.colliders) {
        this._colliders.push(entry instanceof Collider ? entry : new Collider(entry));
      }
    }
  }

  /** Stable id, assigned when the body joins a world via `world.add()`; `-1` until then. */
  public get id(): number {
    return this._id;
  }

  /** `true` once the body has been added to a world (guards against double-add). */
  public get attached(): boolean {
    return this._attached;
  }

  /** World X. */
  public get x(): number {
    return this._transform.x;
  }

  /** World Y. */
  public get y(): number {
    return this._transform.y;
  }

  /** Rotation in radians. */
  public get angle(): number {
    return this._transform.angle;
  }

  /** A fresh `Vector` copy of the body's world position. */
  public get position(): Vector {
    return new Vector(this._transform.x, this._transform.y);
  }

  /** The body's world transform (read-only; mutate via {@link setTransform}). */
  public get transform(): Readonly<Transform> {
    return this._transform;
  }

  /** The body's colliders (read-only view). */
  public get colliders(): readonly Collider[] {
    return this._colliders;
  }

  /** Centre of mass in body-local space (relative to the body origin). */
  public get centerOfMassX(): number {
    return this._comX;
  }

  /** Centre of mass in body-local space (relative to the body origin). */
  public get centerOfMassY(): number {
    return this._comY;
  }

  /**
   * `true` when the body is ready to simulate. Static/kinematic bodies are
   * always ready (infinite-mass semantics); a dynamic body is ready only once
   * it has at least one positive-density collider.
   */
  public get isMassReady(): boolean {
    return this.type !== 'dynamic' || this._massReady;
  }

  /** `true` after the owning world has destroyed this body. */
  public get destroyed(): boolean {
    return this._destroyed;
  }

  /** `true` when the body is asleep — skipped by the integrator and solver until woken. */
  public get isSleeping(): boolean {
    return this._sleeping;
  }

  /**
   * Attach a collider to this body. Accepts a {@link Collider} instance or its
   * {@link ColliderOptions} (a convenience that constructs the collider for you).
   * When the body is already in a world, the collider is id-allocated, registered,
   * the mass model is recomputed and the world geometry synchronised immediately;
   * on a free-standing body the collider is simply held until `world.add()`.
   * Returns the collider.
   */
  public addCollider(collider: Collider | ColliderOptions): Collider {
    if (this._destroyed) {
      throw new Error('PhysicsBody: cannot add a collider to a destroyed body.');
    }

    // Collider imports PhysicsBody type-only (erased), so this value import is
    // one-directional — no runtime cycle.
    const instance = collider instanceof Collider ? collider : new Collider(collider);

    this._colliders.push(instance);

    // Before the body joins a world there is no owner to allocate ids / register
    // with; `_attachToWorld` does that (and the mass/sync pass) for every held
    // collider. Once attached, mirror the world's create order exactly.
    if (this._attached && this._owner) {
      instance._attach(this, this._owner._allocateColliderId());
      this._recomputeMass();
      instance.synchronize(this._transform);
      this._owner._registerCollider(instance);
    }

    return instance;
  }

  /**
   * Set the body's world transform. Resets the body's cached collider geometry
   * immediately so subsequent queries see the new placement. Returns `this`.
   */
  public setTransform(position: VectorLike, angle: number = this._transform.angle): this {
    if (this._destroyed) {
      throw new Error('PhysicsBody: cannot move a destroyed body.');
    }

    this.wake();

    setTransform(this._transform, position.x, position.y, angle);

    for (const collider of this._colliders) {
      collider.synchronize(this._transform);
    }

    return this;
  }

  /** Refresh every collider's world geometry from the current transform. */
  public synchronizeColliders(): void {
    for (const collider of this._colliders) {
      collider.synchronize(this._transform);
    }
  }

  /** World-space centre of mass X (body origin + rotated local centre of mass). */
  public get worldCenterOfMassX(): number {
    return this._transform.x + this._transform.cos * this._comX - this._transform.sin * this._comY;
  }

  /** World-space centre of mass Y. */
  public get worldCenterOfMassY(): number {
    return this._transform.y + this._transform.sin * this._comX + this._transform.cos * this._comY;
  }

  /**
   * Accumulate a world-space force at the centre of mass; integrated on the next
   * sub-step and then cleared. No-op on static/kinematic bodies. Returns `this`.
   */
  public applyForce(forceX: number, forceY: number): this {
    this.wake();
    this._forceX += forceX;
    this._forceY += forceY;

    return this;
  }

  /**
   * Accumulate a torque; integrated on the next sub-step and then cleared. No-op
   * on static/kinematic bodies (and fixed-rotation bodies). Returns `this`.
   */
  public applyTorque(torque: number): this {
    this.wake();
    this._torque += torque;

    return this;
  }

  /**
   * Apply an instantaneous world-space impulse at `(pointX, pointY)` (world space;
   * defaults to the centre of mass), changing velocity immediately. No-op on
   * static/kinematic bodies (infinite mass). Returns `this`.
   */
  public applyImpulse(impulseX: number, impulseY: number, pointX?: number, pointY?: number): this {
    if (this.invMass === 0) {
      return this;
    }

    this.wake();
    this.linearVelocityX += impulseX * this.invMass;
    this.linearVelocityY += impulseY * this.invMass;

    if (pointX !== undefined && pointY !== undefined && this.invInertia !== 0) {
      const rx = pointX - this.worldCenterOfMassX;
      const ry = pointY - this.worldCenterOfMassY;

      this.angularVelocity += (rx * impulseY - ry * impulseX) * this.invInertia;
    }

    return this;
  }

  /**
   * @internal — integrate velocity from gravity, accumulated forces/torque and
   * damping over the sub-step `h`. No-op for static/kinematic (infinite mass
   * keeps their velocity solver-driven only). Called once per TGS sub-step, so
   * gravity/forces are applied with `h` each sub-step (`N·h = dt`, same total
   * impulse, but the small-step position error scales with `h²`). The
   * force/torque accumulators are **not** cleared here — they are consumed by
   * every sub-step and cleared once per frame by {@link _finalizePosition}.
   */
  public _integrateVelocity(h: number, gravityX: number, gravityY: number): void {
    if (this.invMass === 0 || this._sleeping) {
      return;
    }

    this.linearVelocityX += (gravityX * this.gravityScale + this._forceX * this.invMass) * h;
    this.linearVelocityY += (gravityY * this.gravityScale + this._forceY * this.invMass) * h;
    this.angularVelocity += this._torque * this.invInertia * h;

    // Exponential damping (no-op when damping is 0).
    this.linearVelocityX /= 1 + h * this.linearDamping;
    this.linearVelocityY /= 1 + h * this.linearDamping;
    this.angularVelocity /= 1 + h * this.angularDamping;
  }

  /**
   * @internal — accumulate this sub-step's velocity into the per-frame delta
   * position/rotation (TGS sub-stepping). The transform itself is **not** moved
   * here; {@link _finalizePosition} writes the accumulated delta once per frame.
   * Tracking the delta (rather than moving the transform each sub-step) lets the
   * solver recompute contact separation from it without re-running detection or
   * re-syncing collider geometry per sub-step. Static bodies never move.
   */
  public _integratePosition(h: number): void {
    if (this.type === 'static' || this._sleeping) {
      return;
    }

    this._deltaPosX += this.linearVelocityX * h;
    this._deltaPosY += this.linearVelocityY * h;
    this._deltaAngle += this.angularVelocity * h;

    // Cache the rotation so the solver can rotate the contact anchors by the
    // live sub-step rotation (TGS): without it the anchors stay frozen at frame
    // start and a tilting tower's restoring torque is mis-computed, so the tilt
    // grows instead of being corrected. Only non-zero rotation pays the trig.
    if (this._deltaAngle !== 0) {
      this._deltaCos = Math.cos(this._deltaAngle);
      this._deltaSin = Math.sin(this._deltaAngle);
    }
  }

  /**
   * @internal — advance the sleep timer over one fixed step `dt`. A body below
   * both velocity thresholds accumulates time; a too-fast body, or one that opts
   * out via {@link allowSleep}, resets it. The sleep/wake decision is made per
   * island by the world (so a stack sleeps as a unit) from {@link _sleepTime}.
   */
  public _accumulateSleepTime(dt: number, linearThreshold: number, angularThreshold: number): void {
    const tooFast =
      this.linearVelocityX * this.linearVelocityX + this.linearVelocityY * this.linearVelocityY > linearThreshold * linearThreshold ||
      Math.abs(this.angularVelocity) > angularThreshold;

    this._sleepTime = !this.allowSleep || tooFast ? 0 : this._sleepTime + dt;
  }

  /** @internal — set the sleep state. Sleeping zeroes the velocity; waking resets the sleep timer. */
  public _setSleeping(sleeping: boolean): void {
    if (this._sleeping === sleeping) {
      return;
    }

    this._sleeping = sleeping;

    if (sleeping) {
      this.linearVelocityX = 0;
      this.linearVelocityY = 0;
      this.angularVelocity = 0;
    } else {
      this._sleepTime = 0;
    }
  }

  /**
   * Wake the body if it is asleep, resetting its sleep timer. The rest of its
   * island wakes with it on the next step (a contact to an awake body keeps the
   * whole island awake). Returns `this`.
   */
  public wake(): this {
    this._setSleeping(false);
    this._sleepTime = 0;

    return this;
  }

  /**
   * @internal — apply the frame's accumulated delta position/rotation to the
   * transform (rotating about the centre of mass), re-sync collider geometry and
   * clear the force/torque accumulators. Called once per frame after the
   * sub-step loop. Static bodies never move; the force clear still runs (forces
   * are a no-op on infinite mass but the accumulator is reset for consistency).
   */
  public _finalizePosition(): void {
    this._forceX = 0;
    this._forceY = 0;
    this._torque = 0;

    if (this.type === 'static' || (this._deltaPosX === 0 && this._deltaPosY === 0 && this._deltaAngle === 0)) {
      this._resetDelta();

      return;
    }

    const newComX = this.worldCenterOfMassX + this._deltaPosX;
    const newComY = this.worldCenterOfMassY + this._deltaPosY;
    const newAngle = this._transform.angle + this._deltaAngle;
    const cos = Math.cos(newAngle);
    const sin = Math.sin(newAngle);

    // origin = newCoM − R(newAngle)·comLocal (so rotation pivots about the CoM).
    setTransform(this._transform, newComX - (cos * this._comX - sin * this._comY), newComY - (sin * this._comX + cos * this._comY), newAngle);

    this._resetDelta();

    for (const collider of this._colliders) {
      collider.synchronize(this._transform);
    }
  }

  /** Clear the per-frame TGS delta accumulators (position, rotation and its cached cos/sin). */
  private _resetDelta(): void {
    this._deltaPosX = 0;
    this._deltaPosY = 0;
    this._deltaAngle = 0;
    this._deltaCos = 1;
    this._deltaSin = 0;
  }

  /** Internal: detach a collider (called by the world during destruction). */
  public _removeCollider(collider: Collider): void {
    const index = this._colliders.indexOf(collider);

    if (index !== -1) {
      this._colliders.splice(index, 1);
      this._recomputeMass();
    }
  }

  /**
   * @internal — join `owner`'s world with the allocated `id`. Allocates ids for
   * and registers every held collider, then aggregates the mass model and
   * synchronises world geometry. Called once by {@link PhysicsWorld.add}.
   *
   * Ordering matters and mirrors the per-collider create path exactly: ids and
   * the body link go on first, then a single mass recompute over the full
   * collider set (so the centre of mass / inertia aggregate is correct), then
   * `synchronize` over every collider (the cached world geometry the broad/narrow
   * phase reads), then world registration last. Recomputing mass before all
   * colliders are linked, or syncing before the mass model exists, would feed the
   * solver a stale CoM and produce subtle integration bugs.
   */
  public _attachToWorld(owner: BodyOwner, id: number): void {
    if (this._destroyed) {
      throw new Error('PhysicsBody: cannot add a destroyed body to a world.');
    }

    this._owner = owner;
    this._id = id;
    this._attached = true;

    for (const collider of this._colliders) {
      collider._attach(this, owner._allocateColliderId());
    }

    this._recomputeMass();

    for (const collider of this._colliders) {
      collider.synchronize(this._transform);
    }

    for (const collider of this._colliders) {
      owner._registerCollider(collider);
    }
  }

  /** Internal: mark destroyed (called by the world). */
  public _markDestroyed(): void {
    this._destroyed = true;
  }

  /** Recompute mass, centre of mass and rotational inertia from the colliders. */
  private _recomputeMass(): void {
    if (this.type !== 'dynamic') {
      this.mass = 0;
      this.invMass = 0;
      this.inertia = 0;
      this.invInertia = 0;
      this._comX = 0;
      this._comY = 0;
      this._massReady = false;

      return;
    }

    let mass = 0;
    let cx = 0;
    let cy = 0;
    let inertiaOrigin = 0;
    const point = { x: 0, y: 0 };

    for (const collider of this._colliders) {
      const shape = collider.shape;
      const m = collider.density * shape.area;

      if (m <= 0) {
        continue;
      }

      // Shape centroid expressed in body-local space (offset + local rotation).
      applyTransform(collider.localTransform, shape.centroidX, shape.centroidY, point);
      mass += m;
      cx += m * point.x;
      cy += m * point.y;
      // Parallel-axis to the body origin: I_origin += I_centroid + m·d².
      inertiaOrigin += collider.density * shape.unitInertia + m * (point.x * point.x + point.y * point.y);
    }

    if (mass > 0) {
      cx /= mass;
      cy /= mass;
    }

    this.mass = mass;
    this.invMass = mass > 0 ? 1 / mass : 0;
    this._comX = cx;
    this._comY = cy;
    // Shift inertia from the body origin to the centre of mass.
    const inertiaCom = inertiaOrigin - mass * (cx * cx + cy * cy);

    this.inertia = this.fixedRotation ? 0 : inertiaCom;
    this.invInertia = this.fixedRotation || inertiaCom <= 0 ? 0 : 1 / inertiaCom;
    this._massReady = mass > 0;
  }
}
